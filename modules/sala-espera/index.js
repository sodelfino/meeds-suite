/* ------------------------------------------------------------------
 * modules/sala-espera/index.js — pacientes agendados que chegaram
 * ------------------------------------------------------------------
 * O QUE FAZ
 * Avisa quando um paciente de CONSULTA AGENDADA entra na sala de espera.
 * E irmao do Alarme de Fila, mas para outro publico: o alarme cuida da
 * fila aberta do Pronto Atendimento (som, banner, interrompe); aqui e
 * agenda marcada, entao o aviso e discreto e sem som — o medico esta
 * atendendo alguem e nao pode levar um susto.
 *
 * COMO SABE QUEM CHEGOU
 *   GET /api/v1/Atendimento
 *       ?ProfissionalId={do medico}
 *       &StatusAtendimentoId=2        (2 = Aguardando)
 *       &Agendado=true
 *       &sort=GestaoHorario.HorarioInicial
 * Resposta: { items: [...], count, totalPages }. De cada item interessam
 * id, agendamentoId, statusAtendimentoId, agendamento.checkinStatus,
 * gestaoHorario.horarioInicial e cliente.razaoSocialNome.
 *
 * O ProfissionalId nao e adivinhado: o modulo ESPERA a propria aplicacao
 * fazer uma chamada com esse parametro e aproveita o valor, pelo hub de
 * rede do nucleo. Ate conhecer o id, nao consulta nada — chutar o id de
 * outro profissional exibiria a agenda de outra pessoa.
 *
 * PRIVACIDADE (LGPD)
 * Roda 100% no navegador. O nome do paciente aparece na tela e vive so em
 * memoria: nao vai para disco, nao vai para nenhum servico externo e NAO
 * entra no console — os logs de depuracao usam somente ids internos.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var INTERVALO_MS = 30000; // 30s, como o padrao de polling do proprio app
  var AUTO_FECHAR_MS = 10000;
  var STATUS_AGUARDANDO = 2;

  var d = null;
  var overlay = null;
  var refs = null;
  var timer = null;
  var aoSair = null;

  var profissionalId = null;
  var primeiraLeitura = true;
  /* Estado anterior de cada atendimento. Ver o bloco DETECCAO DE
   * CHEGADA: um Set de ids nao consegue representar transicao, e era
   * essa a causa do defeito. */
  var estado = new Map();
  var aguardando = [];        // ultima leitura, so em memoria
  var aviso = null;           // aviso unico; novos pacientes ATUALIZAM ele
  var chegadasNoAviso = [];

  /* Ultima resposta da API, so em memoria e so para o diagnostico
   * comparar duas leituras. Nunca vai para disco nem para o console. */
  var ultimaRespostaCrua = null;

  /* ----------------------------------------------------------------
   * DESCOBERTA DO PROFISSIONAL
   * ---------------------------------------------------------------- */
  var RX_PROFISSIONAL = /[?&]ProfissionalId=([^&]+)/i;

  function capturarProfissional(url) {
    var m = String(url || "").match(RX_PROFISSIONAL);
    if (!m) return;
    var id = decodeURIComponent(m[1]);
    if (!id || id === profissionalId) return;
    profissionalId = id;
    console.debug("[Sala de espera] profissional identificado; iniciando consulta periodica.");
    consultar(); // primeira leitura assim que souber quem e
  }

  /* ----------------------------------------------------------------
   * CONSULTA
   * ---------------------------------------------------------------- */
  function montarUrl() {
    return (
      "/api/v1/Atendimento?ProfissionalId=" + encodeURIComponent(profissionalId) +
      "&StatusAtendimentoId=" + STATUS_AGUARDANDO +
      "&Agendado=true" +
      "&sort=GestaoHorario.HorarioInicial"
    );
  }

  function extrairItens(json) {
    if (!json) return null;
    if (Array.isArray(json.items)) return json.items;
    if (Array.isArray(json.data)) return json.data;
    if (Array.isArray(json)) return json;
    return null;
  }

  /* ----------------------------------------------------------------
   * NORMALIZACAO DA CHEGADA
   * ----------------------------------------------------------------
   * Nao presumimos que a chegada seja um booleano chamado
   * checkinStatus. Duas razoes: a API nunca foi verificada nesse ponto,
   * e APIs desse tipo costumam devolver o mesmo dado em formatos
   * diferentes conforme o endpoint (true, "true", 1, ou uma data de
   * check-in preenchida).
   *
   * Devolve TRES estados, e a diferenca importa:
   *   true  — chegou;
   *   false — nao chegou (o campo existe e diz que nao);
   *   null  — NAO SEI (nenhum campo de chegada veio na resposta).
   * "Nao sei" nao pode virar "nao chegou": isso faria o modulo avisar
   * uma chegada que nunca aconteceu, ou nunca avisar nenhuma.
   * ---------------------------------------------------------------- */
  var CAMPOS_DE_CHEGADA = [
    ["agendamento", "checkinStatus"],
    ["agendamento", "checkIn"],
    ["agendamento", "checkin"],
    ["agendamento", "chegou"],
    ["agendamento", "presente"],
    ["agendamento", "dataCheckin"],
    ["agendamento", "dataChegada"],
    ["agendamento", "horarioChegada"],
    [null, "checkinStatus"],
    [null, "checkIn"],
    [null, "chegou"],
    [null, "presente"],
    [null, "dataCheckin"],
    [null, "dataChegada"],
  ];

  /* Qual campo a API realmente usou. Guardado so para o console de
   * depuracao e para a documentacao — e nome de campo, nao dado de
   * paciente. */
  var campoDeChegadaUsado = null;

  function interpretarChegada(valor) {
    if (valor === true) return true;
    if (valor === false) return false;
    if (valor === null || valor === undefined) return null;

    if (typeof valor === "number") return valor !== 0;

    if (typeof valor === "string") {
      var v = valor.trim().toLowerCase();
      if (v === "") return null;
      if (v === "true" || v === "1" || v === "sim") return true;
      if (v === "false" || v === "0" || v === "nao" || v === "não") return false;
      // data preenchida = houve check-in em algum momento
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) return true;
      return null;
    }
    return null;
  }

  function lerChegada(item) {
    for (var i = 0; i < CAMPOS_DE_CHEGADA.length; i++) {
      var par = CAMPOS_DE_CHEGADA[i];
      var recipiente = par[0] ? item[par[0]] : item;
      if (!recipiente || typeof recipiente !== "object") continue;
      if (!(par[1] in recipiente)) continue;

      var interpretado = interpretarChegada(recipiente[par[1]]);
      if (interpretado === null) continue; // campo existe mas nao diz nada

      var nome = (par[0] ? par[0] + "." : "") + par[1];
      if (campoDeChegadaUsado !== nome) {
        campoDeChegadaUsado = nome;
        console.debug("[Sala de espera] chegada lida do campo:", nome);
      }
      return interpretado;
    }
    return null; // nenhum campo de chegada na resposta
  }

  function normalizarItem(item) {
    var gestao = item.gestaoHorario || {};
    var cliente = item.cliente || {};
    return {
      id: String(item.id || item.agendamentoId || ""),
      status: item.statusAtendimentoId,
      chegou: lerChegada(item), // true | false | null (nao sei)
      horario: gestao.horarioInicial || null,
      nome: cliente.razaoSocialNome || item.pacienteNome || "Paciente",
    };
  }

  /* ----------------------------------------------------------------
   * DETECCAO DE CHEGADA
   * ----------------------------------------------------------------
   * O estado anterior deixou de ser um Set de ids e passou a ser um Map
   * com o que aconteceu com cada atendimento. Um Set so consegue dizer
   * "ja vi este id" — e era exatamente esse o defeito: o id ja estava
   * visto ANTES de o paciente chegar, entao a chegada nunca contava
   * como novidade.
   *
   *   Map<id, {
   *     chegouAntes,            true | false | null
   *     statusAntes,            numero
   *     presenteNoUltimoPoll,   booleano
   *     notificadoNestaChegada  booleano — trava o aviso repetido
   *   }>
   *
   * Regras, nesta ordem:
   *   - primeira leitura: fotografa, atualiza o contador, NAO avisa;
   *   - false -> true: avisa UMA vez;
   *   - true  -> true: nao avisa de novo;
   *   - true  -> false: nao avisa (desistiu, foi chamado);
   *   - item novo que ja chega com chegada=true: avisa (nao e retroativo,
   *     e uma chegada que aconteceu enquanto o medico estava aqui);
   *   - item que sai da resposta: perde o estado ativo. Se voltar
   *     aguardando, e uma chegada nova e pode avisar de novo.
   * ---------------------------------------------------------------- */
  function chegouDeVerdade(p) {
    /* Quando a API nao traz campo de chegada, caimos no status: com
     * StatusAtendimentoId=2 o atendimento esta aguardando atendimento.
     * E menos preciso, mas e melhor do que nunca avisar nada. O
     * diagnostico existe justamente para trocar isto por certeza. */
    if (p.chegou === null) return p.status === STATUS_AGUARDANDO;
    return p.chegou === true;
  }

  function processar(itens) {
    var agora = itens.filter(function (p) {
      return !!p.id;
    });

    var chegadasNovas = [];
    var idsNestePoll = Object.create(null);

    agora.forEach(function (p) {
      idsNestePoll[p.id] = true;
      var anterior = estado.get(p.id);
      var chegouAgora = chegouDeVerdade(p);

      if (!anterior) {
        /* Item que nao estava no estado. Na primeira leitura isso vale
         * para todos e nao avisa nada. Depois dela, um item novo que ja
         * aparece chegado e uma chegada de verdade. */
        estado.set(p.id, {
          chegouAntes: chegouAgora,
          statusAntes: p.status,
          presenteNoUltimoPoll: true,
          notificadoNestaChegada: primeiraLeitura ? chegouAgora : false,
        });
        if (!primeiraLeitura && chegouAgora) {
          chegadasNovas.push(p);
          estado.get(p.id).notificadoNestaChegada = true;
        }
        return;
      }

      /* A transicao que interessa: nao chegou -> chegou. */
      if (chegouAgora && !anterior.chegouAntes && !anterior.notificadoNestaChegada) {
        chegadasNovas.push(p);
        anterior.notificadoNestaChegada = true;
      }

      /* Deixou de estar chegado: a proxima chegada volta a valer. */
      if (!chegouAgora) anterior.notificadoNestaChegada = false;

      anterior.chegouAntes = chegouAgora;
      anterior.statusAntes = p.status;
      anterior.presenteNoUltimoPoll = true;
    });

    /* Quem nao veio nesta resposta perde o estado ativo: foi atendido,
     * cancelado, ou mudou para um status fora do filtro. Se voltar
     * depois aguardando, sera tratado como chegada nova. */
    estado.forEach(function (registro, id) {
      if (!idsNestePoll[id]) estado.delete(id);
    });

    aguardando = agora.filter(chegouDeVerdade);

    if (primeiraLeitura) {
      primeiraLeitura = false;
      atualizarContador();
      renderizarLista();
      return; // sem aviso retroativo
    }

    atualizarContador();
    renderizarLista();
    if (chegadasNovas.length) anunciar(chegadasNovas);
  }

  /* ----------------------------------------------------------------
   * AVISO
   * ---------------------------------------------------------------- */
  function minutosDeEspera(horarioIso) {
    if (!horarioIso) return null;
    var marcada = new Date(horarioIso);
    if (isNaN(marcada.getTime())) return null;
    var minutos = Math.floor((Date.now() - marcada.getTime()) / 60000);
    return minutos > 0 ? minutos : null; // adiantado nao e atraso
  }

  function horaCurta(horarioIso) {
    if (!horarioIso) return null;
    var dt = new Date(horarioIso);
    if (isNaN(dt.getTime())) return null;
    return dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function linhaDoPaciente(p) {
    var partes = [p.nome];
    var hora = horaCurta(p.horario);
    if (hora) partes.push("agendado para " + hora);
    var espera = minutosDeEspera(p.horario);
    if (espera) partes.push("esperando há " + espera + " min");
    return partes.join(" · ");
  }

  function anunciar(novos) {
    /* INSTANCIA UNICA: um aviso so. Se chegarem tres pacientes seguidos,
     * o mesmo aviso passa a dizer "3 pacientes" — nao viram tres avisos
     * empilhados sobre a tela do medico. */
    chegadasNoAviso = chegadasNoAviso.concat(novos);
    if (chegadasNoAviso.length > 6) chegadasNoAviso = chegadasNoAviso.slice(-6);

    var conteudo = {
      titulo:
        chegadasNoAviso.length === 1
          ? "Paciente na sala de espera"
          : chegadasNoAviso.length + " pacientes na sala de espera",
      corpo: chegadasNoAviso.map(linhaDoPaciente),
      acoes: [
        { rotulo: "Ver fila", aoClicar: abrirFilaNativa },
        { rotulo: "Fechar", primario: false },
      ],
      autoFecharMs: AUTO_FECHAR_MS,
    };

    if (aviso && aviso.estaVisivel()) {
      aviso.atualizar(conteudo);
      return;
    }

    chegadasNoAviso = novos.slice();
    conteudo.titulo =
      novos.length === 1 ? "Paciente na sala de espera" : novos.length + " pacientes na sala de espera";
    conteudo.corpo = novos.map(linhaDoPaciente);
    aviso = d.dock.criarAviso(conteudo);
  }

  /* Leva o medico para a tela nativa de Consultas Agendadas, em vez de
   * reimplementar a fila aqui — o atendimento acontece la. */
  function abrirFilaNativa() {
    try {
      raiz.location.href = "/to-meet";
    } catch (e) {
      d.core.toast("Abra a tela de Consultas Agendadas para atender.", 4000);
    }
  }

  /* ----------------------------------------------------------------
   * PAINEL
   * ---------------------------------------------------------------- */
  var CSS = [
    ".se-modal { width:100%; max-width:520px; max-height:84vh; background:#fff; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.35); display:flex; flex-direction:column; overflow:hidden; }",
    ".se-modal header { background:linear-gradient(135deg,#123a7a,#1a56ad); color:#fff; padding:15px 18px; display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }",
    ".se-modal header h2 { margin:0; font-size:15px; font-weight:700; }",
    ".se-sub { margin:3px 0 0; font-size:11.5px; opacity:.9; }",
    ".se-fechar { background:rgba(255,255,255,.2); border:none; color:#fff; width:28px; height:28px; border-radius:50%; cursor:pointer; font-size:14px; flex-shrink:0; }",
    ".se-corpo { padding:12px 18px 16px; overflow-y:auto; }",
    ".se-item { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid #f1f5f9; }",
    ".se-item:last-child { border-bottom:none; }",
    ".se-dados { flex:1; min-width:0; }",
    ".se-nome { font-size:13px; font-weight:700; color:#16221f; }",
    ".se-meta { font-size:11.5px; color:#5b6672; margin-top:2px; }",
    ".se-espera { font-size:11px; font-weight:700; padding:3px 9px; border-radius:999px; background:#eef4fb; color:#123a7a; white-space:nowrap; }",
    ".se-espera.se-atrasado { background:#fde8e8; color:#a12626; }",
    ".se-vazio { font-size:12.5px; color:#8a97a4; font-style:italic; padding:16px 0; }",
    ".se-rodape { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:12px 18px; border-top:1px solid #eef2f6; }",
    ".se-nota { font-size:10.5px; color:#9aa5b1; line-height:1.45; }",
    ".se-btn { background:#1a4fa0; color:#fff; border:none; border-radius:8px; padding:9px 14px; font-size:12.5px; font-weight:700; cursor:pointer; flex-shrink:0; }",
    ".se-btn:hover { background:#123a7a; }",
  ].join("\n");

  function montarUI() {
    overlay = d.dock.criarOverlay({
      estilo: CSS,
      html:
        '<div class="se-modal" role="dialog" aria-modal="true">' +
        "  <header><div>" +
        "    <h2>Sala de espera</h2>" +
        '    <p class="se-sub" id="se-sub"></p>' +
        "  </div>" +
        '  <button type="button" class="se-fechar" aria-label="Fechar">&#10005;</button></header>' +
        '  <div class="se-corpo"><div id="se-lista"></div></div>' +
        '  <div class="se-rodape">' +
        '    <span class="se-nota">Consultas agendadas com paciente aguardando. Atualiza a cada 30 segundos.</span>' +
        '    <button type="button" class="se-btn" id="se-ver-fila">Ver fila</button>' +
        "  </div>" +
        "</div>",
    });

    refs = { sub: overlay.$("#se-sub"), lista: overlay.$("#se-lista") };
    overlay.$(".se-fechar").addEventListener("click", overlay.fechar);
    overlay.$("#se-ver-fila").addEventListener("click", abrirFilaNativa);
    renderizarLista();
  }

  function renderizarLista() {
    if (!refs) return;

    refs.sub.textContent = !profissionalId
      ? "Identificando o seu cadastro…"
      : aguardando.length === 0
      ? "Ninguém aguardando no momento"
      : aguardando.length === 1
      ? "1 paciente aguardando"
      : aguardando.length + " pacientes aguardando";

    if (!aguardando.length) {
      refs.lista.innerHTML =
        '<div class="se-vazio">' +
        (profissionalId
          ? "Nenhum paciente agendado está aguardando agora."
          : "Abra a tela de Consultas Agendadas uma vez para o Assistente reconhecer o seu cadastro.") +
        "</div>";
      return;
    }

    refs.lista.innerHTML = "";
    aguardando.forEach(function (p) {
      var espera = minutosDeEspera(p.horario);
      var hora = horaCurta(p.horario);

      var linha = document.createElement("div");
      linha.className = "se-item";

      var dados = document.createElement("div");
      dados.className = "se-dados";
      var nome = document.createElement("div");
      nome.className = "se-nome";
      nome.textContent = p.nome; // textContent: nome nao vira HTML
      var meta = document.createElement("div");
      meta.className = "se-meta";
      meta.textContent = hora ? "Agendado para " + hora : "Sem horário informado";
      dados.appendChild(nome);
      dados.appendChild(meta);
      linha.appendChild(dados);

      var selo = document.createElement("span");
      selo.className = "se-espera" + (espera && espera >= 15 ? " se-atrasado" : "");
      selo.textContent = espera ? espera + " min" : "no horário";
      linha.appendChild(selo);

      refs.lista.appendChild(linha);
    });
  }

  function atualizarContador() {
    if (d && d.botao) d.botao.definirContador(aguardando.length);
  }

  /* ----------------------------------------------------------------
   * CONTRATO DE MODULO
   * ---------------------------------------------------------------- */
  raiz.MeedsSuite.registerModule({
    id: "sala-espera",
    nome: "Sala de Espera",
    descricao:
      "Avisa quando um paciente de consulta agendada chega na sala de espera, sem som, e mostra quem está aguardando.",
    versao: "1.0.0",
    configPadrao: {},

    botao: {
      icone: "🪑",
      variante: "icone",
      titulo: "Pacientes agendados aguardando",
      prioridade: 15, // entre o alarme de fila (10) e a APAC (20)
    },

    /* Ouve as chamadas que a PROPRIA tela faz, so para descobrir o
     * ProfissionalId do medico logado. Nao consome o conteudo. */
    assinaturasRede: [{ regex: /\/api\/v1\/Atendimento\?[^]*ProfissionalId=/i, metodos: ["GET"] }],

    aoCargaRede: function (evt) {
      capturarProfissional(evt.url);
    },

    start: function (deps) {
      d = deps;
      primeiraLeitura = true;
      estado.clear();
      aguardando = [];
      chegadasNoAviso = [];

      montarUI();

      /* Comando de diagnostico, para o medico rodar no console:
       *     MeedsSuite.salaEspera.diagnosticar()
       * Fica no nucleo para nao depender de o modulo estar em escopo. */
      raiz.MeedsSuite.salaEspera = {
        diagnosticar: diagnosticar,
        estado: function () {
          return { profissionalIdConhecido: !!profissionalId, aguardando: aguardando.length };
        },
      };

      deps.aoClicarBotao(function () {
        overlay.abrir();
        renderizarLista();
      });
      atualizarContador();

      timer = setInterval(consultar, INTERVALO_MS);

      /* PROTECAO: parar a consulta quando a pagina for embora. Sem isto,
       * uma navegacao interna deixaria o intervalo rodando a toa. */
      aoSair = function () {
        if (timer) clearInterval(timer);
        timer = null;
      };
      raiz.addEventListener("beforeunload", aoSair);
    },

    stop: function () {
      if (timer) clearInterval(timer);
      timer = null;
      if (aoSair) {
        raiz.removeEventListener("beforeunload", aoSair);
        aoSair = null;
      }
      if (aviso) {
        aviso.fechar();
        aviso = null;
      }
      if (overlay) {
        overlay.remover();
        overlay = null;
      }
      refs = null;
      try {
        delete raiz.MeedsSuite.salaEspera;
      } catch (e) {}
      estado.clear();
      aguardando = [];
      chegadasNoAviso = [];
      primeiraLeitura = true;
      d = null;
    },

    /* exposto so para o teste de fumaca */
    _teste: {
      processar: function (itens) {
        processar(itens.map(normalizarItem));
      },
      definirProfissional: function (id) {
        profissionalId = id;
      },
      estado: function () {
        return {
          estado: Array.from(estado.entries()).map(function (e) {
            return { id: e[0], chegouAntes: e[1].chegouAntes, notificado: e[1].notificadoNestaChegada };
          }),
          aguardando: aguardando.length,
          primeiraLeitura: primeiraLeitura,
          campoDeChegadaUsado: campoDeChegadaUsado,
        };
      },
    },
  });
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
