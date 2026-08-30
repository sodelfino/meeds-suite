/* ------------------------------------------------------------------
 * core/core.user.js — nucleo compartilhado da Meeds Suite
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

  var VERSAO_NUCLEO = "2.0.0";

  var Auth = raiz.MeedsSuiteAuth;
  var Dock = raiz.MeedsSuiteDock;
  var Net = raiz.MeedsSuiteNetwork;
  var Dom = raiz.MeedsSuiteDom;
  var Decisao = raiz.MeedsSuiteDecisao;
  var Storage = raiz.MeedsSuiteStorage;

  var registro = [];          // definicoes na ordem de registro
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
            console.warn("[Meeds Suite] seletores remotos com formato inesperado, mantendo fallback embutido.");
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
          console.warn("[Meeds Suite] nao foi possivel buscar seletores remotos, usando fallback.", e);
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
   * REGISTRO DE MODULOS
   * ------------------------------------------------------------------ */
  function registerModule(def) {
    if (!def || !def.id) {
      console.warn("[Meeds Suite] registerModule chamado sem id, ignorando.");
      return;
    }
    if (porId[def.id]) {
      console.warn("[Meeds Suite] modulo duplicado ignorado:", def.id);
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

  function listarModulos() {
    return registro.map(function (e) {
      return {
        id: e.def.id,
        nome: e.def.nome || e.def.id,
        descricao: e.def.descricao || "",
        versao: e.def.versao || "?",
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
                console.warn("[Meeds Suite] aoCargaRede falhou em", def.id, e);
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
      };
      entrada.deps = deps;

      if (typeof def.start === "function") def.start(deps);
      entrada.rodando = true;
      console.debug("[Meeds Suite] modulo iniciado:", def.id, def.versao);
    } catch (e) {
      console.error("[Meeds Suite] falha ao iniciar modulo", def.id, e);
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
      console.warn("[Meeds Suite] stop() falhou em", def.id, e);
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
    if (entrada.botaoHandle) {
      try {
        entrada.botaoHandle.remover();
      } catch (e) {
        /* silencioso */
      }
      entrada.botaoHandle = null;
    }
    entrada.aoClicarBotao = null;
    entrada.rodando = false;
    if (!silencioso) console.debug("[Meeds Suite] modulo parado:", def.id);
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

    // engrenagem: SEMPRE presente, mesmo com todos os modulos desligados
    raiz.MeedsSuiteManager.montar({
      dock: Dock,
      listarModulos: listarModulos,
      estaHabilitado: estaHabilitado,
      definirHabilitado: definirHabilitado,
      versaoNucleo: VERSAO_NUCLEO,
      manifesto: manifesto,
    });

    registro.forEach(function (entrada) {
      if (estaHabilitado(entrada.def.id)) iniciarModulo(entrada);
    });

    recheckPeriodico();
    timerRecheck = setInterval(recheckPeriodico, INTERVALO_RECHECAGEM_MS);

    atualizarSeletoresRemoto(opcoes.urlSeletores);

    iniciado = true;
    console.debug("[Meeds Suite] nucleo " + VERSAO_NUCLEO + " iniciado com " + registro.length + " modulo(s).");
  }

  var API = {
    versao: VERSAO_NUCLEO,
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
