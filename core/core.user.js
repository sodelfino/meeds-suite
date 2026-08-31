/* ------------------------------------------------------------------
 * core/core.user.js — nucleo compartilhado do Assistente Meeds
 * ------------------------------------------------------------------
 * Expoe window.MeedsSuite, o unico ponto de contato entre o nucleo e os
 * modulos. Um modulo NAO conhece o Tampermonkey, nao toca em fetch/XHR,
 * nao sabe onde o botao dele vai parar na tela e nao decide sozinho se
 * o medico esta logado. Ele so declara o que e e implementa a sua regra
 * de negocio.
 *
 * CONTRATO DE MODULO (ver docs/ARQUITETURA.md)
 *   {
 *     id, nome, descricao, versao,
 *     configPadrao: {},
 *     botao: { rotulo, icone, prioridade, variante } | null,
 *     assinaturasRede: [ { regex, metodos } ],
 *     start(deps), stop(), aoCargaRede(evt)
 *   }
 * deps = { core, network, dom, storage, dock, decisao, config, botao }
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  /* FONTE UNICA DE VERSAO: manifest.json.
   * O build substitui o marcador abaixo pela versao de la e tambem
   * escreve o @version do userscript e o package.json. Nao edite a
   * versao aqui nem no bootloader — so no manifest.
   * O valor de reserva existe para o arquivo continuar rodavel solto,
   * fora do pacote (por exemplo num teste unitario). */
  var VERSAO_NUCLEO = "__MEEDS_VERSAO__" === "__MEEDS" + "_VERSAO__" ? "dev" : "__MEEDS_VERSAO__";

  var Auth = raiz.MeedsSuiteAuth;
  var Dock = raiz.MeedsSuiteDock;
  var Net = raiz.MeedsSuiteNetwork;
  var Dom = raiz.MeedsSuiteDom;
  var Decisao = raiz.MeedsSuiteDecisao;
  var Storage = raiz.MeedsSuiteStorage;
  var Cadastro = raiz.MeedsSuiteCadastro;

  var registro = [];          // definicoes na ordem de registro
  var ouvintesCadastro = [];  // modulos que redesenham a lista de medicos
  var ouvintesEvento = {};    // barramento entre modulos (ver abaixo)
  var porId = {};             // id -> { def, estado }
  var iniciado = false;
  var storageNucleo = null;
  var manifesto = null;

  /* ------------------------------------------------------------------
   * CONFIG REMOTA DE SELETORES (com fallback embutido)
   * ------------------------------------------------------------------
   * Permite corrigir rotulos/textos que o Meeds mudar sem redistribuir o
   * userscript para todos os medicos. E DADO, nunca codigo: o nucleo so
   * aceita um objeto JSON com listas de strings e mescla por cima do
   * fallback. Se a busca falhar (sem internet, dominio bloqueado, CSP),
   * o fallback embutido continua valendo — mesma estrategia ja provada
   * pelo remumes.json do Assistente REMUME.
   * ------------------------------------------------------------------ */
  var SELETORES_FALLBACK = {
    rotulos: {
      nascimento: ["Data de Nascimento", "Data de nascimento", "Nascimento", "Dt. Nascimento"],
      cpf: ["CPF", "C.P.F.", "CPF do paciente"],
      mae: ["Nome da Mãe", "Nome da mãe do paciente", "Nome da Mae", "Mãe", "Filiação", "Filiacao"],
      telefone: ["Telefone", "Celular", "Contato"],
      contadorFila: ["Aguardando", "Aguardando atendimento", "Na fila"],
    },
    toasts: {
      novoAtendimento: ["novo atendimento"],
    },
  };

  var seletores = JSON.parse(JSON.stringify(SELETORES_FALLBACK));
  var URL_SELETORES_PADRAO =
    "https://raw.githubusercontent.com/sodelfino/meeds-suite/main/seletores.json";

  function validarSeletores(dados) {
    if (!dados || typeof dados !== "object" || Array.isArray(dados)) return false;
    var grupos = ["rotulos", "toasts"];
    for (var i = 0; i < grupos.length; i++) {
      var g = dados[grupos[i]];
      if (g === undefined) continue;
      if (!g || typeof g !== "object" || Array.isArray(g)) return false;
      var chaves = Object.keys(g);
      for (var j = 0; j < chaves.length; j++) {
        var v = g[chaves[j]];
        if (!Array.isArray(v)) return false;
        for (var k = 0; k < v.length; k++) {
          if (typeof v[k] !== "string") return false;
        }
      }
    }
    return true;
  }

  function atualizarSeletoresRemoto(url) {
    var alvo = url || URL_SELETORES_PADRAO;
    try {
      return fetch(alvo, { cache: "no-store" })
        .then(function (r) {
          if (!r.ok) return null;
          return r.json();
        })
        .then(function (dados) {
          if (!dados) return false;
          if (!validarSeletores(dados)) {
            console.warn("[Assistente Meeds] seletores remotos com formato inesperado, mantendo fallback embutido.");
            return false;
          }
          // mescla por GRUPO, nao substitui o objeto inteiro: um arquivo
          // remoto que so corrige "mae" nao pode apagar o resto.
          Object.keys(dados).forEach(function (grupo) {
            seletores[grupo] = Object.assign({}, seletores[grupo] || {}, dados[grupo]);
          });
          // repassa ao dom-reader para a leitura de paciente ja usar
          if (seletores.rotulos) Object.assign(Dom.VARIANTES, seletores.rotulos);
          return true;
        })
        .catch(function (e) {
          console.warn("[Assistente Meeds] nao foi possivel buscar seletores remotos, usando fallback.", e);
          return false;
        });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function obterSeletor(grupo, chave) {
    var g = seletores[grupo] || {};
    if (g[chave]) return g[chave].slice();
    var f = (SELETORES_FALLBACK[grupo] || {})[chave];
    return f ? f.slice() : [];
  }

  /* ------------------------------------------------------------------
   * BARRAMENTO ENTRE MODULOS
   * ------------------------------------------------------------------
   * Modulos nao se enxergam nem se importam: se um chamasse o outro pelo
   * nome, desligar um quebraria o outro, e o "adicionar o sexto sem tocar
   * nos cinco" deixaria de valer. Eles conversam por evento.
   *
   * Caso concreto que motivou isto: a busca de CID-10 precisa inserir o
   * codigo escolhido no laudo que estiver aberto — sem saber QUAL laudo e,
   * nem se algum esta aberto. Ela publica "cid:escolhido"; quem estiver
   * com o modal aberto atende. Se ninguem atender, quem publicou decide o
   * que fazer (no caso, copia para a area de transferencia).
   *
   * publicar() devolve quantos ouvintes ATENDERAM de fato — um ouvinte
   * que devolve true. E o que permite esse "se ninguem atendeu, faca
   * outra coisa".
   * ------------------------------------------------------------------ */
  function assinarEvento(nome, fn, idModulo) {
    if (!ouvintesEvento[nome]) ouvintesEvento[nome] = [];
    var registro = { fn: fn, idModulo: idModulo || null };
    ouvintesEvento[nome].push(registro);
    return function cancelar() {
      ouvintesEvento[nome] = (ouvintesEvento[nome] || []).filter(function (o) {
        return o !== registro;
      });
    };
  }

  function publicarEvento(nome, dados) {
    var atenderam = 0;
    (ouvintesEvento[nome] || []).slice().forEach(function (o) {
      try {
        if (o.fn(dados) === true) atenderam++;
      } catch (e) {
        console.warn("[Assistente Meeds] ouvinte do evento", nome, "falhou em", o.idModulo, e);
      }
    });
    return atenderam;
  }

  function cancelarEventosDoModulo(idModulo) {
    Object.keys(ouvintesEvento).forEach(function (nome) {
      ouvintesEvento[nome] = ouvintesEvento[nome].filter(function (o) {
        return o.idModulo !== idModulo;
      });
    });
  }

  /* ------------------------------------------------------------------
   * REGISTRO DE MODULOS
   * ------------------------------------------------------------------ */
  function registerModule(def) {
    if (!def || !def.id) {
      console.warn("[Assistente Meeds] registerModule chamado sem id, ignorando.");
      return;
    }
    if (porId[def.id]) {
      console.warn("[Assistente Meeds] modulo duplicado ignorado:", def.id);
      return;
    }
    var entrada = {
      def: def,
      rodando: false,
      cancelamentosRede: [],
      botaoHandle: null,
      deps: null,
    };
    porId[def.id] = entrada;
    registro.push(entrada);

    // Se o nucleo ja subiu (modulo registrado tarde), respeita a
    // preferencia salva e sobe o modulo na hora.
    if (iniciado && estaHabilitado(def.id)) iniciarModulo(entrada);
    return entrada;
  }

  /* O manifest.json e a FONTE DE VERDADE de nome, descricao e versao.
   * O que estiver no registerModule() do modulo vale so como reserva,
   * para o caso de o modulo nao estar listado no manifest (ex: durante o
   * desenvolvimento, antes do passo 3 do guia).
   *
   * Por que assim: nome e descricao sao texto que o administrador pode
   * querer ajustar sem abrir codigo. Se vivessem em dois lugares, um dia
   * divergiriam — foi o que aconteceu com os comentarios de posicao dos
   * botoes nos scripts antigos. Com o manifest mandando, editar o texto
   * do painel e editar um arquivo de dados. */
  function fichaDoManifesto(id) {
    if (!manifesto || !Array.isArray(manifesto.modulos)) return null;
    for (var i = 0; i < manifesto.modulos.length; i++) {
      if (manifesto.modulos[i].id === id) return manifesto.modulos[i];
    }
    return null;
  }

  function listarModulos() {
    return registro.map(function (e) {
      var m = fichaDoManifesto(e.def.id) || {};
      return {
        id: e.def.id,
        temAjustes: typeof e.abrirAjustes === "function",
        nome: m.nome || e.def.nome || e.def.id,
        descricao: m.descricao || e.def.descricao || "",
        versao: m.versao || e.def.versao || "?",
        habilitado: estaHabilitado(e.def.id),
        rodando: e.rodando,
      };
    });
  }

  /* Preferencia de habilitacao. Padrao: modulo novo entra HABILITADO,
   * para que quem ja usava os 5 scripts nao precise ligar nada na mao
   * depois de migrar. */
  function estaHabilitado(id) {
    var mapa = storageNucleo ? storageNucleo.ler("modulos", {}) : {};
    if (mapa && Object.prototype.hasOwnProperty.call(mapa, id)) return !!mapa[id];
    return true;
  }

  function definirHabilitado(id, valor) {
    if (!storageNucleo) return;
    var mapa = storageNucleo.ler("modulos", {}) || {};
    mapa[id] = !!valor;
    storageNucleo.gravar("modulos", mapa);

    var entrada = porId[id];
    if (!entrada) return;
    // HABILITAR/DESABILITAR NAO PODE EXIGIR RELOAD (requisito do contrato)
    if (valor && !entrada.rodando) iniciarModulo(entrada);
    else if (!valor && entrada.rodando) pararModulo(entrada);
  }

  /* ------------------------------------------------------------------
   * CICLO DE VIDA DE UM MODULO
   * ------------------------------------------------------------------ */
  function iniciarModulo(entrada) {
    if (entrada.rodando) return;
    var def = entrada.def;
    try {
      var storage = Storage.criarStorage(def.id);
      var config = storage.lerConfig(def.configPadrao || {});

      // Botao: o modulo DECLARA, o dock POSICIONA.
      var botaoHandle = null;
      if (def.botao) {
        botaoHandle = Dock.registrarBotao({
          id: def.id,
          rotulo: def.botao.rotulo,
          icone: def.botao.icone,
          titulo: def.botao.titulo || def.nome,
          variante: def.botao.variante,
          prioridade: def.botao.prioridade,
          aoClicar: function () {
            if (typeof entrada.aoClicarBotao === "function") entrada.aoClicarBotao();
          },
        });
      }
      entrada.botaoHandle = botaoHandle;

      // Assinaturas de rede declaradas no contrato — o nucleo assina por
      // conta do modulo e guarda os cancelamentos para o stop().
      (def.assinaturasRede || []).forEach(function (assinatura) {
        var cancelar = Net.assinar(
          { regex: assinatura.regex, metodos: assinatura.metodos, idModulo: def.id },
          function (evt) {
            if (typeof def.aoCargaRede === "function") {
              try {
                def.aoCargaRede(evt);
              } catch (e) {
                console.warn("[Assistente Meeds] aoCargaRede falhou em", def.id, e);
              }
            }
          }
        );
        entrada.cancelamentosRede.push(cancelar);
      });

      var deps = {
        core: API,
        network: {
          assinar: function (spec, cb) {
            var cancelar = Net.assinar(
              { regex: spec.regex, metodos: spec.metodos, idModulo: def.id },
              cb
            );
            entrada.cancelamentosRede.push(cancelar);
            return cancelar;
          },
        },
        dom: Dom,
        storage: storage,
        dock: {
          toast: Dock.toast,
          criarOverlay: Dock.criarOverlay,
          criarBanner: Dock.criarBanner,
          criarMolduraAlerta: Dock.criarMolduraAlerta,
          criarAviso: Dock.criarAviso,
        },
        decisao: Decisao,
        auth: Auth,
        config: config,
        botao: botaoHandle,
        seletor: obterSeletor,
        /* o modulo avisa o nucleo qual funcao roda no clique do botao */
        aoClicarBotao: function (fn) {
          entrada.aoClicarBotao = fn;
        },
        /* Tela de ajustes do modulo. Registrar aqui faz aparecer um link
         * "Ajustes" ao lado da chave liga/desliga no painel da
         * engrenagem. Antes, a configuracao do alarme so abria com clique
         * direito no botao — ninguem descobre isso sozinho. */
        aoAbrirAjustes: function (fn) {
          entrada.abrirAjustes = fn;
        },
        /* Cadastro de medicos: unico e compartilhado. O modulo so LE a
         * lista e manda abrir o painel; quem edita e o nucleo. */
        cadastro: Cadastro,
        abrirCadastro: function () {
          raiz.MeedsSuiteManager.abrir("medicos");
        },
        abrirCadastroEstabelecimentos: function () {
          raiz.MeedsSuiteManager.abrir("estabelecimentos");
        },
        /* Chamado sempre que o cadastro muda, para o modulo redesenhar o
         * <select> de medicos sem o usuario precisar reabrir o modal. */
        aoMudarCadastro: function (fn) {
          ouvintesCadastro.push({ idModulo: def.id, fn: fn });
        },
        /* Barramento entre modulos. assinar devolve o cancelamento; o
         * nucleo tambem limpa tudo do modulo no stop(). */
        assinarEvento: function (nome, fn) {
          return assinarEvento(nome, fn, def.id);
        },
        publicarEvento: publicarEvento,
      };
      entrada.deps = deps;

      if (typeof def.start === "function") def.start(deps);
      entrada.rodando = true;
      console.debug("[Assistente Meeds] modulo iniciado:", def.id, def.versao);
    } catch (e) {
      console.error("[Assistente Meeds] falha ao iniciar modulo", def.id, e);
      // Um modulo que explode no start nao pode derrubar os outros:
      // desfazemos o que ja foi criado e seguimos.
      pararModulo(entrada, true);
    }
  }

  function pararModulo(entrada, silencioso) {
    var def = entrada.def;
    try {
      if (entrada.rodando && typeof def.stop === "function") def.stop();
    } catch (e) {
      console.warn("[Assistente Meeds] stop() falhou em", def.id, e);
    }
    entrada.cancelamentosRede.forEach(function (cancelar) {
      try {
        cancelar();
      } catch (e) {
        /* silencioso */
      }
    });
    entrada.cancelamentosRede = [];
    Net.cancelarPorModulo(def.id);
    ouvintesCadastro = ouvintesCadastro.filter(function (o) {
      return o.idModulo !== def.id;
    });
    cancelarEventosDoModulo(def.id);
    if (entrada.botaoHandle) {
      try {
        entrada.botaoHandle.remover();
      } catch (e) {
        /* silencioso */
      }
      entrada.botaoHandle = null;
    }
    entrada.aoClicarBotao = null;
    entrada.abrirAjustes = null;
    entrada.rodando = false;
    if (!silencioso) console.debug("[Assistente Meeds] modulo parado:", def.id);
  }

  /* ------------------------------------------------------------------
   * BOOTSTRAP
   * ------------------------------------------------------------------ */
  var INTERVALO_RECHECAGEM_MS = 1500;
  var timerRecheck = null;

  function recheckPeriodico() {
    // Regra unica de visibilidade que os 5 scripts implementavam cada um
    // por si: na tela de login, nada da suite aparece.
    Dock.definirVisibilidadeGeral(Auth.estaLogado());
  }

  function iniciar(opcoes) {
    if (iniciado) return;
    opcoes = opcoes || {};
    manifesto = opcoes.manifesto || null;

    if (!Auth.ehFramePrincipal()) {
      // TRAVA DE FRAME: uma vez, no nucleo, em vez de cinco vezes.
      return;
    }

    storageNucleo = Storage.storageDoNucleo();
    Dock.garantirHost();
    /* Segunda camada contra dock duplicado: se sobrou um host de uma
     * execucao anterior (SPA que remontou a pagina), remove o orfao. */
    raiz.MeedsSuiteDiagnostico.limparDockOrfao("meeds-suite-dock-host");

    // engrenagem: SEMPRE presente, mesmo com todos os modulos desligados
    /* MIGRACAO DO CADASTRO — roda antes de qualquer modulo subir, para
     * que o primeiro <select> de medicos ja apareca preenchido. */
    Cadastro.migrarSeNecessario();
    /* Tira do disco o nome completo de paciente que o historico do APAC
     * gravava na versao anterior, convertendo para a referencia curta. */
    raiz.MeedsSuiteHistorico.migrarHistoricoApac();

    raiz.MeedsSuiteManager.montar({
      dock: Dock,
      listarModulos: listarModulos,
      estaHabilitado: estaHabilitado,
      definirHabilitado: definirHabilitado,
      versaoNucleo: VERSAO_NUCLEO,
      manifesto: manifesto,
      abrirAjustesDe: function (id) {
        if (porId[id] && typeof porId[id].abrirAjustes === "function") porId[id].abrirAjustes();
      },
      aoMudarCadastro: function () {
        ouvintesCadastro.forEach(function (o) {
          try {
            o.fn();
          } catch (e) {
            console.warn("[Assistente Meeds] ouvinte de cadastro falhou em", o.idModulo, e);
          }
        });
      },
    });

    registro.forEach(function (entrada) {
      if (estaHabilitado(entrada.def.id)) iniciarModulo(entrada);
    });

    recheckPeriodico();
    timerRecheck = setInterval(recheckPeriodico, INTERVALO_RECHECAGEM_MS);

    atualizarSeletoresRemoto(opcoes.urlSeletores);

    /* Aviso de atualizacao: compara a versao atual com a ultima que o
     * medico viu. Roda ANTES do diagnostico de propósito — quem acabou
     * de instalar tem que ver as boas-vindas, nao um "atualizado". */
    raiz.MeedsSuiteNovidades.verificar({ dock: Dock, versaoAtual: VERSAO_NUCLEO });

    /* Boas-vindas na primeira vez e aviso se os scripts antigos ainda
     * estiverem ativos (eles rodam em document-idle, entao a checagem
     * espera alguns segundos antes de olhar o DOM). */
    raiz.MeedsSuiteDiagnostico.verificar(Dock, storageNucleo);

    iniciado = true;
    console.debug("[Assistente Meeds] nucleo " + VERSAO_NUCLEO + " iniciado com " + registro.length + " modulo(s).");
  }

  var API = {
    versao: VERSAO_NUCLEO,
    novidades: raiz.MeedsSuiteNovidades,
    registerModule: registerModule,
    listarModulos: listarModulos,
    estaHabilitado: estaHabilitado,
    definirHabilitado: definirHabilitado,
    iniciar: iniciar,
    toast: function (msg, ms) {
      Dock.toast(msg, ms);
    },
    seletor: obterSeletor,
    atualizarSeletoresRemoto: atualizarSeletoresRemoto,
    cadastro: Cadastro,
    assinarEvento: assinarEvento,
    publicarEvento: publicarEvento,
    abrirCadastro: function () {
      raiz.MeedsSuiteManager.abrir("medicos");
    },
    abrirCadastroEstabelecimentos: function () {
      raiz.MeedsSuiteManager.abrir("estabelecimentos");
    },
    formatos: raiz.MeedsSuiteFormatos,
    dom: Dom,
    decisao: Decisao,
    auth: Auth,
    _registro: registro,
    _pararModulo: function (id) {
      if (porId[id]) pararModulo(porId[id]);
    },
  };

  raiz.MeedsSuite = API;
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
