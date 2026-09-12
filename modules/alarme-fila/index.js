/* ------------------------------------------------------------------
 * modules/alarme-fila/index.js
 * Origem: sodelfino/meeds-alarme-fila -> meeds-alarme-fila.user.js v1.4.0
 * ------------------------------------------------------------------
 * O QUE MUDOU NA MIGRACAO (e o que NAO mudou)
 *  - REMOVIDO daqui: trava de frame, deteccao de login, patch proprio de
 *    fetch/XHR, CSS de posicionamento do botao (left:24px / left:82px) e
 *    a engrenagem propria. Tudo isso agora e do nucleo.
 *  - PRESERVADO integralmente: os tres sinais de chegada, o modo
 *    "espera" com limite por paciente, os quatro sons sintetizados, a
 *    trava de seguranca de 2 min, o reengate de 5 min, a parada
 *    automatica quando a fila esvazia e a recusa de decidir sob leitura
 *    ambigua.
 *  - GANHOU: a fusao dos sinais passou a usar o decision-engine do
 *    nucleo em vez de regras soltas (mesmo comportamento observavel,
 *    agora explicito e testavel).
 *
 * PRIVACIDADE: ids de atendimento e contadores vivem so em memoria
 * (variaveis de closure) e morrem quando a aba fecha. Nada de paciente
 * vai para localStorage — so a preferencia do medico (ligado, modo,
 * som, volume), via storage do nucleo.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  /* ----------------------------------------------------------------
   * BIBLIOTECA DE SONS (Web Audio API — sem arquivo externo)
   * Copiada sem alteracao do script original: cada som define quanto
   * dura uma "unidade" (para espacar as repeticoes) e como toca-la.
   * Sintetizado por osciladores, entao funciona sem internet.
   * ---------------------------------------------------------------- */
  var TIPOS_DE_SOM = {
    "sirene-classica": {
      nome: "Sirene clássica (2 notas)",
      curto: false,
      intervaloMs: 1100,
      tocar: function (ctx, volume) {
        var agora = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(880, agora);
        osc.frequency.linearRampToValueAtTime(1320, agora + 0.35);
        osc.frequency.linearRampToValueAtTime(880, agora + 0.7);
        gain.gain.setValueAtTime(0, agora);
        gain.gain.linearRampToValueAtTime(0.35 * volume, agora + 0.05);
        gain.gain.linearRampToValueAtTime(0.35 * volume, agora + 0.65);
        gain.gain.linearRampToValueAtTime(0, agora + 0.75);
        osc.connect(gain).connect(ctx.destination);
        osc.start(agora);
        osc.stop(agora + 0.8);
      },
    },
    "sirene-ambulancia": {
      nome: "Sirene rápida (estilo ambulância)",
      curto: false,
      intervaloMs: 1050,
      tocar: function (ctx, volume) {
        var agora = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(700, agora);
        osc.frequency.setValueAtTime(950, agora + 0.25);
        osc.frequency.setValueAtTime(700, agora + 0.5);
        osc.frequency.setValueAtTime(950, agora + 0.75);
        gain.gain.setValueAtTime(0.3 * volume, agora);
        gain.gain.setValueAtTime(0, agora + 0.98);
        osc.connect(gain).connect(ctx.destination);
        osc.start(agora);
        osc.stop(agora + 1.0);
      },
    },
    "alarme-incendio": {
      nome: "Alarme (bipes curtos repetidos)",
      curto: false,
      intervaloMs: 700,
      tocar: function (ctx, volume) {
        var base = ctx.currentTime;
        for (var i = 0; i < 3; i++) {
          var inicio = base + i * 0.2;
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.type = "square";
          osc.frequency.setValueAtTime(1200, inicio);
          gain.gain.setValueAtTime(0.3 * volume, inicio);
          gain.gain.setValueAtTime(0, inicio + 0.12);
          osc.connect(gain).connect(ctx.destination);
          osc.start(inicio);
          osc.stop(inicio + 0.13);
        }
      },
    },
    campainha: {
      nome: "Campainha (mais suave)",
      curto: false,
      intervaloMs: 2000,
      tocar: function (ctx, volume) {
        var agora = ctx.currentTime;
        [
          { freq: 900, inicio: 0, duracao: 0.3 },
          { freq: 700, inicio: 0.3, duracao: 0.4 },
        ].forEach(function (n) {
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(n.freq, agora + n.inicio);
          gain.gain.setValueAtTime(0, agora + n.inicio);
          gain.gain.linearRampToValueAtTime(0.3 * volume, agora + n.inicio + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, agora + n.inicio + n.duracao);
          osc.connect(gain).connect(ctx.destination);
          osc.start(agora + n.inicio);
          osc.stop(agora + n.inicio + n.duracao + 0.05);
        });
      },
    },
  
    /* ----------------------------------------------------------------
     * SONS DE TOQUE UNICO (modo discreto)
     * ----------------------------------------------------------------
     * As quatro sirenes acima foram feitas para REPETIR: tocadas uma vez
     * so, soam truncadas — comecam e param no meio da ideia. Estas tem
     * comeco, meio e fim em menos de um segundo, e terminam decaindo em
     * vez de cortar.
     *
     * Todas sobem o ganho a partir de ZERO em alguns milissegundos e
     * descem quase a zero antes de parar o oscilador. Sem essa rampa o
     * navegador produz um estalo no inicio e no fim — audivel, feio, e
     * pior ainda num fone de plantao noturno.
     * ---------------------------------------------------------------- */
    "toque-duplo": {
      nome: "Toque duplo (dois tons)",
      curto: true,
      intervaloMs: 1200,
      tocar: function (ctx, volume) {
        var agora = ctx.currentTime;
        [{ f: 880, t: 0 }, { f: 1174.7, t: 0.13 }].forEach(function (n) {
          var osc = ctx.createOscillator();
          var g = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(n.f, agora + n.t);
          g.gain.setValueAtTime(0.0001, agora + n.t);
          g.gain.linearRampToValueAtTime(0.32 * volume, agora + n.t + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0008, agora + n.t + 0.34);
          osc.connect(g).connect(ctx.destination);
          osc.start(agora + n.t);
          osc.stop(agora + n.t + 0.36);
        });
      },
    },
    "sino-curto": {
      nome: "Sino curto",
      curto: true,
      intervaloMs: 1400,
      tocar: function (ctx, volume) {
        var agora = ctx.currentTime;
        /* Um sino e a fundamental MAIS um parcial agudo que morre antes
         * dela — e o que separa "sino" de "bipe". */
        [{ f: 1568, v: 0.3, d: 0.9 }, { f: 2350, v: 0.12, d: 0.35 }].forEach(function (n) {
          var osc = ctx.createOscillator();
          var g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(n.f, agora);
          g.gain.setValueAtTime(0.0001, agora);
          g.gain.linearRampToValueAtTime(n.v * volume, agora + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0006, agora + n.d);
          osc.connect(g).connect(ctx.destination);
          osc.start(agora);
          osc.stop(agora + n.d + 0.02);
        });
      },
    },
    "gota": {
      nome: "Gota (bem discreto)",
      curto: true,
      intervaloMs: 900,
      tocar: function (ctx, volume) {
        var agora = ctx.currentTime;
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(1250, agora);
        osc.frequency.exponentialRampToValueAtTime(620, agora + 0.14);
        g.gain.setValueAtTime(0.0001, agora);
        g.gain.linearRampToValueAtTime(0.3 * volume, agora + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0007, agora + 0.28);
        osc.connect(g).connect(ctx.destination);
        osc.start(agora);
        osc.stop(agora + 0.3);
      },
    },
    "acorde-suave": {
      nome: "Acorde suave (três notas)",
      curto: true,
      intervaloMs: 1600,
      tocar: function (ctx, volume) {
        var agora = ctx.currentTime;
        [523.25, 659.25, 783.99].forEach(function (f, i) {
          var t = i * 0.075;
          var osc = ctx.createOscillator();
          var g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(f, agora + t);
          g.gain.setValueAtTime(0.0001, agora + t);
          g.gain.linearRampToValueAtTime(0.22 * volume, agora + t + 0.015);
          g.gain.exponentialRampToValueAtTime(0.0006, agora + t + 0.55);
          osc.connect(g).connect(ctx.destination);
          osc.start(agora + t);
          osc.stop(agora + t + 0.58);
        });
      },
    },
    "dois-cliques": {
      nome: "Dois cliques (quase mudo)",
      curto: true,
      intervaloMs: 800,
      tocar: function (ctx, volume) {
        var agora = ctx.currentTime;
        /* Para quem divide a sala com outro profissional e nao quer que o
         * alarme vire assunto da consulta ao lado. */
        [0, 0.09].forEach(function (t) {
          var osc = ctx.createOscillator();
          var g = ctx.createGain();
          osc.type = "square";
          osc.frequency.setValueAtTime(2100, agora + t);
          g.gain.setValueAtTime(0.0001, agora + t);
          g.gain.linearRampToValueAtTime(0.12 * volume, agora + t + 0.004);
          g.gain.exponentialRampToValueAtTime(0.0005, agora + t + 0.035);
          osc.connect(g).connect(ctx.destination);
          osc.start(agora + t);
          osc.stop(agora + t + 0.04);
        });
      },
    },

    /* ----------------------------------------------------------------
     * MAIS DUAS PARA O MODO COMPLETO
     * ---------------------------------------------------------------- */
    "pulso-grave": {
      nome: "Pulso grave (plantão noturno)",
      curto: false,
      intervaloMs: 1300,
      tocar: function (ctx, volume) {
        var agora = ctx.currentTime;
        /* Grave atravessa parede e cansa menos que agudo. Pensado para a
         * madrugada, quando o estridente e justamente o que faz o medico
         * desligar o alarme — e perder o paciente seguinte. */
        [0, 0.42].forEach(function (t) {
          var osc = ctx.createOscillator();
          var g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(196, agora + t);
          osc.frequency.linearRampToValueAtTime(233, agora + t + 0.3);
          g.gain.setValueAtTime(0.0001, agora + t);
          g.gain.linearRampToValueAtTime(0.42 * volume, agora + t + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0008, agora + t + 0.34);
          osc.connect(g).connect(ctx.destination);
          osc.start(agora + t);
          osc.stop(agora + t + 0.36);
        });
      },
    },
    "sirene-lenta": {
      nome: "Sirene lenta (menos estridente)",
      curto: false,
      intervaloMs: 1500,
      tocar: function (ctx, volume) {
        var agora = ctx.currentTime;
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(560, agora);
        osc.frequency.linearRampToValueAtTime(760, agora + 0.55);
        osc.frequency.linearRampToValueAtTime(560, agora + 1.1);
        g.gain.setValueAtTime(0.0001, agora);
        g.gain.linearRampToValueAtTime(0.34 * volume, agora + 0.06);
        g.gain.setValueAtTime(0.34 * volume, agora + 1.0);
        g.gain.linearRampToValueAtTime(0.0001, agora + 1.12);
        osc.connect(g).connect(ctx.destination);
        osc.start(agora);
        osc.stop(agora + 1.15);
      },
    },
};

  var CSS_PAINEL = [
    raiz.MeedsSuiteCabecalho.CSS,
    ".af-modal { width: 100%; max-width: 380px; background: #fff; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,.3); overflow: hidden; }",
    ".af-modal header { background: linear-gradient(135deg,#dc2626,#f97316); color:#fff; padding:16px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; }",
    ".af-modal header h2 { margin:0; font-size:15px; font-weight:700; }",
    ".af-fechar { background: rgba(255,255,255,.18); border:none; color:#fff; width:28px; height:28px; border-radius:8px; font-size:15px; cursor:pointer; flex-shrink:0; }",
    ".af-fechar:hover { background: rgba(255,255,255,.32); }",
    ".af-body { padding:16px 18px 20px; display:flex; flex-direction:column; gap:16px; }",
    ".af-body label { font-size:12.5px; font-weight:600; color:#334155; display:block; margin-bottom:6px; }",
    ".af-hint { font-size:11px; color:#94a3b8; margin-top:4px; font-weight:400; line-height:1.45; }",
    /* `.af-body label` (classe + elemento) tem especificidade maior que
       `.af-radio-linha` (so classe) e forcava display:block — a bolinha
       do radio ficava ACIMA do texto, em vez de ao lado. Por isso o
       seletor daqui precisa casar o elemento tambem. */
    ".af-body label.af-radio-linha { display:flex; align-items:center; gap:8px; font-size:13.5px; color:#1e293b; font-weight:400; margin-bottom:8px; cursor:pointer; }",
        /* Defesa: o shadow root e compartilhado por todos os modulos, entao
       uma regra larga de outro modulo ja esticou este radio para 100%
       uma vez. Aqui a largura e explicita. */
    ".af-body label.af-radio-linha input { width:auto; flex:0 0 auto; margin:0; }",
    ".af-radio-linha input { cursor:pointer; }",
    "#af-tempo-espera-linha { display:flex; align-items:center; gap:8px; margin-left:24px; }",
    "#af-tempo-espera-linha input[type=number] { width:60px; padding:6px 8px; border-radius:8px; border:1.5px solid #cbd5e1; font-size:13px; }",
    ".af-body select { width:100%; box-sizing:border-box; padding:9px 10px; border-radius:10px; border:1.5px solid #cbd5e1; font-size:13.5px; color:#0f172a; background:#f8fafc; }",
    ".af-body input[type=range] { width:100%; }",
    "#af-testar-som { width:100%; padding:10px; border-radius:10px; border:none; background:linear-gradient(135deg,#f97316,#dc2626); color:#fff; font-size:13.5px; font-weight:700; cursor:pointer; }",
    "#af-testar-som:hover { opacity:.92; }",
    ".af-estado { font-size:11.5px; color:#475569; line-height:1.5; }",
    "#af-liberar-aviso { margin-top:8px; padding:8px 14px; border-radius:9px; border:1.5px solid #1a4fa0; background:#fff; color:#1a4fa0; font-size:12.5px; font-weight:700; font-family:inherit; cursor:pointer; }",
    "#af-liberar-aviso:hover { background:#eef4ff; }",
    "#af-liberar-aviso[hidden] { display:none; }",
  ].join("\n");

  var CONFIG_PADRAO = {
    ativo: false,
    modo: "imediato", // "imediato" | "espera"
    tempoEsperaMin: 5,
    som: "sirene-classica",      // modo completo: repete ate silenciar
    somCurto: "toque-duplo",     // modo discreto: toca uma vez
    volume: 70,
    janelaDeAviso: false,        // pop-up do navegador; nasce desligado
    intensidade: "completo", // "silencioso" | "discreto" | "completo"
  };

  /* ------------------------------------------------------------------
   * AS TRES INTENSIDADES (o botao de som do Waze)
   * ------------------------------------------------------------------
   * Um alarme so tem duas posicoes — berrando ou mudo — obriga o medico
   * a escolher entre ser interrompido no meio de uma consulta e nao
   * ficar sabendo que chegou gente. Com tres, ele escolhe o quanto de
   * interrupcao cabe no momento, e nao precisa desligar tudo:
   *
   *   silencioso  so o contador na aba e no favicone. Nada de som, nada
   *               na tela. Para quem esta em consulta e nao pode ser
   *               interrompido, mas quer ver a fila crescer.
   *   discreto    um cartao no canto com quem chegou e de onde, e UM som
   *               curto. Aparece e sai sozinho. Nao bloqueia nada.
   *   completo    o de hoje: sirene repetindo, faixa no topo e moldura
   *               na borda da tela, ate alguem silenciar.
   *
   * A escada de atencao (titulo, favicone, notificacao do sistema) vale
   * nos tres — ela e sobre ONDE avisar, nao sobre o quanto incomodar.
   * ------------------------------------------------------------------ */
  var INTENSIDADES = {
    silencioso: {
      rotulo: "Silencioso",
      icone: "🔕",
      resumo: "Só o contador na aba. Nada de som nem de aviso na tela.",
      som: false, cartao: false, banner: false,
    },
    discreto: {
      rotulo: "Discreto",
      icone: "🔉",
      resumo: "Um cartão no canto com quem chegou e de onde, e um som curto.",
      som: "curto", cartao: true, banner: false,
    },
    completo: {
      rotulo: "Completo",
      icone: "🔔",
      resumo: "Sirene repetindo, faixa no topo e moldura na tela até você silenciar.",
      som: "repetido", cartao: false, banner: true,
    },
  };

  var ORDEM_INTENSIDADE = ["completo", "discreto", "silencioso"];

  function intensidadeAtual() {
    return INTENSIDADES[config.intensidade] || INTENSIDADES.completo;
  }

  /* --- estado do modulo (recriado a cada start, zerado a cada stop) --- */
  var d = null;          // deps do nucleo
  var config = null;
  var painel = null;
  var banner = null;
  var moldura = null; // moldura pulsante na borda da tela (plantao noturno)
  var observerToast = null;
  var timers = [];

  // ids vistos na fila por "assinatura" de chamada -> Map<id, {primeiraVezVistoEm}>
  var idsFilaPorAssinatura = new Map();
  var idsJaAlertadosPorEspera = new Set();
  var decisorFila = null; // fusao dos sinais sobre "tem gente esperando?"
  var ultimoDisparoTs = 0;
  var ultimaChegada = null;   // ficha de quem chegou, so para o cartao discreto

  var DEBOUNCE_MS = 2500;
  var DURACAO_MAX_SOM_MS = 120000;      // trava de seguranca do som (2 min)
  var COOLDOWN_REENGATE_MS = 5 * 60000; // toca de novo 5 min apos silenciar
  var LIMITE_FRESCOR_DOM_MS = 12000;    // 3x o intervalo de polling do DOM
  var INTERVALO_RECHECAGEM_MS = 4000;
  var INTERVALO_CHECAGEM_ESPERA_MS = 15000;

  var audioCtx = null;
  var tocando = false;
  var intervaloSirene = null;
  var timeoutLimiteSirene = null;
  var timeoutReengate = null;

  /* ----------------------------------------------------------------
   * SINALIZACAO CENTRAL
   * No modo "imediato", os sinais de chegada disparam. No modo "espera",
   * esses mesmos sinais sao ignorados DE PROPOSITO — so a checagem de
   * tempo de espera dispara.
   * ---------------------------------------------------------------- */
  function sinalizarNovoPaciente(origem) {
    if (origem !== "tempo-de-espera" && config.modo !== "imediato") return;
    var agora = Date.now();
    if (agora - ultimoDisparoTs < DEBOUNCE_MS) return; // outro sinal ja tratou
    ultimoDisparoTs = agora;
    console.debug("[Alarme Fila] disparo via " + origem);
    if (config.ativo) dispararAlarme();
  }

  /* --- SINAL A: toast nativo "Novo Atendimento" ------------------- */
  var TAMANHO_MAX_TEXTO_TOAST = 80;

  function textosDeToast() {
    return d.seletor("toasts", "novoAtendimento");
  }

  function pareceToastNovoAtendimento(elemento) {
    var alvos = textosDeToast().map(function (t) {
      return d.dom.normalizarTexto(t);
    });
    var candidatos = [elemento].concat(Array.prototype.slice.call(elemento.querySelectorAll("*")));
    for (var i = 0; i < candidatos.length; i++) {
      var el = candidatos[i];
      if (el.childElementCount > 0) continue;
      var texto = (el.textContent || "").trim();
      if (!texto || texto.length > TAMANHO_MAX_TEXTO_TOAST) continue;
      var norm = d.dom.normalizarTexto(texto);
      for (var j = 0; j < alvos.length; j++) {
        // exige que o texto do PROPRIO elemento (nao um resumo de tela
        // inteira) contenha o alvo — evita falso positivo com um botao
        // estatico "+ Novo Atendimento" em algum canto da aplicacao.
        if (alvos[j] && norm.indexOf(alvos[j]) !== -1) return true;
      }
    }
    return false;
  }

  /* --- SINAL B: rede (fila de espera geral) ----------------------- */
  var REGEX_ATENDIMENTO_LISTA = /\/api\/v1\/Atendimento\?/i;

  /* ------------------------------------------------------------------
   * QUAL CHAMADA E "A FILA DE ESPERA"
   * ------------------------------------------------------------------
   * Verificado contra gravacoes dos DOIS perfis (medico e operador), que
   * usam telas e rotas diferentes:
   *
   *   medico   /emergency-care
   *            ...&StatusAtendimentoId=2&EspecialidadeId=...&take=5
   *   operador /administrator/monitoring/emergency-care
   *            ...&StatusAtendimentoId=2&Active=true&take=100
   *            ...&StatusAtendimentoId=1&StatusAtendimentoId=2&take=5
   *
   * Duas licoes vieram dai:
   *
   * 1. `ProfissionalId` NAO aparece na fila de espera de nenhum dos dois
   *    perfis — so nas listas de "meus atendimentos" (status 3, 5, 6, 7).
   *    A exclusao estava certa e continua.
   *
   * 2. O operador tem uma chamada com DOIS status ao mesmo tempo
   *    (`StatusAtendimentoId=1&StatusAtendimentoId=2`). O teste antigo
   *    aceitava, porque so procurava "=2" em qualquer lugar da URL — e
   *    ai pacientes em status 1 entravam na conta de "aguardando" e
   *    podiam disparar o alarme. Agora o 2 precisa ser o UNICO status
   *    pedido: uma lista que mistura status nao e a fila de espera.
   * ------------------------------------------------------------------ */
  function ehChamadaFilaDeEspera(url) {
    if (!REGEX_ATENDIMENTO_LISTA.test(url)) return false;
    if (/[?&]ProfissionalId=/i.test(url)) return false; // "meus atendimentos"

    var status = String(url).match(/[?&]StatusAtendimentoId=([^&]*)/gi) || [];
    if (status.length !== 1) return false;          // lista mista: nao e a fila
    return /=2$/.test(status[0]);
  }

  function assinaturaDaChamada(url) {
    // ignora paginacao para tratar a mesma "vista" de fila como a mesma
    // assinatura ao longo do tempo
    return url.replace(/[?&](skip|take|version)=[^&]*/gi, "");
  }

  function extrairListaDeItens(json) {
    if (Array.isArray(json)) return json;
    if (json && typeof json === "object") {
      var chaves = ["data", "items", "result", "results"];
      for (var i = 0; i < chaves.length; i++) {
        if (Array.isArray(json[chaves[i]])) return json[chaves[i]];
      }
    }
    return null;
  }

  function processarRespostaFilaDeEspera(url, json) {
    try {
      var itens = extrairListaDeItens(json);
      if (!itens) return; // formato inesperado: outros sinais cobrem

      var agora = Date.now();
      var assinatura = assinaturaDaChamada(url);
      var mapaAnterior = idsFilaPorAssinatura.get(assinatura);
      var mapaAtual = new Map();

      itens.forEach(function (item) {
        var id = item && item.id;
        if (!id) return;
        var jaVistoEm =
          mapaAnterior && mapaAnterior.has(id) ? mapaAnterior.get(id).primeiraVezVistoEm : agora;
        mapaAtual.set(id, { primeiraVezVistoEm: jaVistoEm, ficha: fichaDaChegada(item) });
      });

      // A PRIMEIRA leitura de cada assinatura so define a base — nunca
      // dispara, para nao soar por quem ja estava esperando antes de o
      // medico ligar o alarme.
      if (mapaAnterior) {
        var novos = Array.from(mapaAtual.keys()).filter(function (id) {
          return !mapaAnterior.has(id);
        });
        if (novos.length) {
          ultimaChegada = mapaAtual.get(novos[novos.length - 1]).ficha;
          sinalizarNovoPaciente("rede-fila-espera");
        }
      }

      mapaAtual.atualizadoEm = agora;
      idsFilaPorAssinatura.set(assinatura, mapaAtual);

      /* Voto de rede: usa a UNIAO, nunca a soma das vistas. */
      decisorFila.votar("rede", resumoDaFila().porRede > 0);

      limparIdsAlertadosQueSairamDaFila();
      checarSeDeveSilenciarPorFilaVazia();
      atualizarDistintivo();
      if (tocando) atualizarTextoDoBanner();
    } catch (e) {
      /* silencioso: sinal de reforco, nunca deve quebrar a pagina */
    }
  }

  /* ------------------------------------------------------------------
   * RESUMO DA FILA — para o aviso dizer POR QUE esta tocando
   * ------------------------------------------------------------------
   * Um alarme que so grita vira ruido; um que diz "3 aguardando, o mais
   * antigo ha 12 min" e uma informacao. O tempo aqui e contado desde que
   * o Assistente VIU o paciente na fila, nao desde a entrada real dele —
   * por isso o texto diz "ha pelo menos", que e o que sabemos de fato.
   * ------------------------------------------------------------------ */
  /* Quanto tempo uma "vista" de fila continua valendo depois da ultima
   * vez que a tela a consultou. Existe por causa da tela de monitoramento
   * do administrador, que troca de aba e de periodo (Hoje, Ontem,
   * Ultimos 30 dias): cada filtro vira uma assinatura, e a que o medico
   * abandonou nao pode continuar somando gente para sempre. */
  var VALIDADE_ASSINATURA_MS = 120000;

  function esquecerAssinaturasVelhas() {
    var limite = Date.now() - VALIDADE_ASSINATURA_MS;
    var mortas = [];
    idsFilaPorAssinatura.forEach(function (mapa, assinatura) {
      if ((mapa.atualizadoEm || 0) < limite) mortas.push(assinatura);
    });
    mortas.forEach(function (a) { idsFilaPorAssinatura.delete(a); });
  }

  /* ------------------------------------------------------------------
   * DE ONDE VEIO QUEM CHEGOU — so o municipio, e so isso
   * ------------------------------------------------------------------
   * No Meeds, `cliente.razaoSocialNome` e a prefeitura contratante: e o
   * mesmo campo que a deteccao de municipio ja usa ha versoes, e e o
   * unico dado da chegada que este modulo le.
   *
   * O NOME DO PACIENTE NAO E MAIS LIDO — e a remocao foi deliberada.
   * Ate a v2.33.1 este modulo procurava o nome em cinco caminhos
   * plausiveis e o guardava em `ultimaChegada`, embora o cartao nunca o
   * exibisse: a decisao de mostrar so o municipio veio depois, e a
   * leitura ficou para tras, sem uso.
   *
   * Dado de paciente que ninguem exibe ainda assim custa: ele vive numa
   * variavel de modulo enquanto a aba estiver aberta, e reaparece em
   * despejo de memoria, em depurador e em relatorio de erro. A regra
   * desta suite e a mesma do historico e dos modelos — nao guardar o que
   * nao se usa —, e "esta em memoria, nao em disco" nao e cumprimento
   * dela, e uma atenuante.
   *
   * O municipio, ao contrario, sustenta uma decisao real do medico: e
   * ele que diz qual REMUME e qual laudo valem para aquele atendimento.
   * ------------------------------------------------------------------ */
  function porCaminho(objeto, caminho) {
    var atual = objeto;
    for (var i = 0; i < caminho.length; i++) {
      if (!atual || typeof atual !== "object") return null;
      atual = atual[caminho[i]];
    }
    return typeof atual === "string" && atual.trim() ? atual.trim() : null;
  }

  function fichaDaChegada(item) {
    var ficha = { municipio: null };
    if (!item || typeof item !== "object") return ficha;
    ficha.municipio = porCaminho(item, ["cliente", "razaoSocialNome"]);
    return ficha;
  }

  /* ------------------------------------------------------------------
   * QUANTOS ESTAO ESPERANDO — de verdade
   * ------------------------------------------------------------------
   * Isto ja esteve errado, e o erro aparecia na tela: o contador da aba
   * mostrava um numero diferente do total da fila.
   *
   * A causa eram tres coisas somadas, todas visiveis na tela de
   * monitoramento do administrador:
   *   1. o mesmo paciente aparece em mais de uma "vista" da fila (uma
   *      por aba, uma por periodo), e nos SOMAVAMOS as vistas — a mesma
   *      pessoa contava duas, tres vezes;
   *   2. cada filtro de periodo abre uma assinatura nova, e as antigas
   *      nunca eram esquecidas: o numero so crescia;
   *   3. o numero que o medico ve na tela e o do cartao "Aguardando", e
   *      nos ignoravamos esse cartao ao contar.
   *
   * Agora: uniao dos ids (uma pessoa e uma pessoa), assinatura velha e
   * descartada, e o cartao da tela MANDA quando esta visivel. Se os dois
   * discordarem, quem ganha e o que o medico esta lendo — discordar do
   * numero na frente dele destroi a confianca no alarme inteiro.
   * ------------------------------------------------------------------ */
  function resumoDaFila() {
    esquecerAssinaturasVelhas();

    var unicos = new Set();
    var maisAntigo = null;
    idsFilaPorAssinatura.forEach(function (mapa) {
      mapa.forEach(function (registro, id) {
        unicos.add(id);
        if (maisAntigo === null || registro.primeiraVezVistoEm < maisAntigo) {
          maisAntigo = registro.primeiraVezVistoEm;
        }
      });
    });

    var porRede = unicos.size;
    var naTela = ultimoValorAguardandoDOM;
    var quantos = naTela === null ? porRede : naTela;

    return {
      quantos: quantos,
      porRede: porRede,
      naTela: naTela,
      esperaMs: maisAntigo === null ? 0 : Date.now() - maisAntigo,
    };
  }

  function textoDoMotivo() {
    var r = resumoDaFila();
    if (!r.quantos) return "Novo paciente na fila";
    var partes = [r.quantos + (r.quantos === 1 ? " aguardando" : " aguardando")];
    var min = Math.floor(r.esperaMs / 60000);
    if (min >= 1) {
      partes.push((r.quantos === 1 ? "há pelo menos " : "o mais antigo há pelo menos ") + min + " min");
    }
    return partes.join(" · ");
  }

  /* --- SINAL C: contador "Aguardando" no DOM ---------------------- */
  var ultimoValorAguardandoDOM = null;

  function atualizarLeituraContadorAguardando() {
    var valor = d.dom.lerContadorPorRotulo(d.seletor("rotulos", "contadorFila"));
    if (valor !== null) {
      ultimoValorAguardandoDOM = valor;
      // o voto carrega o carimbo de tempo: o decisor descarta sozinho
      // uma leitura velha (validadeMs), que era o LIMITE_FRESCOR_DOM_MS
      decisorFila.votar("dom_contador", valor > 0);
    }
    return valor;
  }

  function tentarChecarContadorAguardando() {
    var anterior = ultimoValorAguardandoDOM;
    var atual = atualizarLeituraContadorAguardando();
    if (atual === null) return; // leitura ambigua: NAO decide
    if (anterior !== null && atual > anterior) sinalizarNovoPaciente("dom-contador-aguardando");
    checarSeDeveSilenciarPorFilaVazia();
  }

  /* --- SINAL D: tempo de espera (modo "espera") ------------------- */
  function limparIdsAlertadosQueSairamDaFila() {
    var idsAtuais = new Set();
    idsFilaPorAssinatura.forEach(function (mapa) {
      mapa.forEach(function (_v, id) {
        idsAtuais.add(id);
      });
    });
    idsJaAlertadosPorEspera.forEach(function (id) {
      if (!idsAtuais.has(id)) idsJaAlertadosPorEspera.delete(id);
    });
  }

  function checarLimiteDeEspera() {
    if (!config.ativo || config.modo !== "espera") return;
    var limiteMs = config.tempoEsperaMin * 60000;
    var agora = Date.now();
    idsFilaPorAssinatura.forEach(function (mapa) {
      mapa.forEach(function (info, id) {
        if (idsJaAlertadosPorEspera.has(id)) return;
        if (agora - info.primeiraVezVistoEm >= limiteMs) {
          idsJaAlertadosPorEspera.add(id);
          sinalizarNovoPaciente("tempo-de-espera");
        }
      });
    });
  }

  /* ----------------------------------------------------------------
   * ALARME (som + banner + titulo da aba)
   * ---------------------------------------------------------------- */
  function obterAudioContext() {
    if (!audioCtx) {
      var Ctor = raiz.AudioContext || raiz.webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(function () {});
    return audioCtx;
  }

  function somDoModo(curto) {
    var id = curto ? config.somCurto : config.som;
    var tipo = TIPOS_DE_SOM[id];
    if (tipo && !!tipo.curto === !!curto) return tipo;
    return TIPOS_DE_SOM[curto ? CONFIG_PADRAO.somCurto : CONFIG_PADRAO.som];
  }

  function tocarSomAtual(curto) {
    try {
      var ctx = obterAudioContext();
      if (!ctx) return;
      somDoModo(curto).tocar(ctx, config.volume / 100);
    } catch (e) {
      /* silencioso */
    }
  }

  /* ------------------------------------------------------------------
   * ESCADA DE ATENCAO
   * ------------------------------------------------------------------
   * O titulo piscando "🚨 NOVO PACIENTE NA FILA" saiu. Piscar disputa a
   * atencao a cada segundo e nao sobrevive a uma troca de tela da SPA;
   * "(3) Meeds" fica parado, e legivel de relance na barra de abas e e o
   * mesmo padrao que o medico ja le sem pensar no Gmail e no Slack.
   *
   * O distintivo acompanha a FILA, nao o alarme: ele continua ali depois
   * de silenciar, porque os pacientes continuam ali. Quem some quando a
   * fila esvazia e ele mesmo.
   * ------------------------------------------------------------------ */
  function atencao() {
    return raiz.MeedsSuiteAtencao || null;
  }

  function atualizarDistintivo() {
    var A = atencao();
    if (!A) return;
    /* Le o cartao da tela AGORA. A resposta de rede chega antes do proximo
     * ciclo de leitura do DOM, entao sem isto o distintivo seria pintado
     * com o numero anterior — tipicamente zero — e sumiria por alguns
     * segundos bem no momento em que o paciente chegou. */
    atualizarLeituraContadorAguardando();
    var r = resumoDaFila();
    if (r.quantos > 0) A.marcar({ contagem: r.quantos });
    else A.limpar();
  }

  /* O degrau que atravessa o navegador. So dispara com o medico FORA da
   * aba — dentro dela o banner e a moldura ja gritam, e uma notificacao
   * por cima seria o mesmo aviso duas vezes. Clicar equivale a "estou
   * indo": traz a aba para frente e silencia com reengate, entao se ele
   * nao atender de fato o alarme volta em cinco minutos. */
  function avisarForaDaAba() {
    var A = atencao();
    if (!A) return;
    if (A.ondeEstaOMedico() !== "fora") return;
    var r = resumoDaFila();

    /* A janela e o degrau mais barulhento e o unico opcional: ela FICA na
     * barra de tarefas ate alguem fechar, enquanto a notificacao some
     * sozinha. Quem trabalha com muitas janelas abertas perde a
     * notificacao no canto e nao perde esta. */
    if (config.janelaDeAviso && A.abrirJanelaDeAviso) {
      A.abrirJanelaDeAviso({ titulo: "Paciente na fila", corpo: textoDoMotivo() });
    }

    A.marcar({
      contagem: r.quantos || 1,
      notificar: true,
      titulo: "Paciente na fila",
      corpo: textoDoMotivo(),
      tag: "meeds-alarme-fila",
      exigeInteracao: true,
      /* Clicar equivale a "estou indo": traz a aba para frente e silencia
       * com reengate — se ele nao atender de fato, o alarme volta. */
      aoClicar: silenciarComReengate,
    });
  }

  function pararSom() {
    if (intervaloSirene) {
      clearInterval(intervaloSirene);
      intervaloSirene = null;
    }
    if (timeoutLimiteSirene) {
      clearTimeout(timeoutLimiteSirene);
      timeoutLimiteSirene = null;
    }
  }

  function dispararAlarme() {
    if (tocando) return;
    var forma = intensidadeAtual();

    /* O distintivo e a notificacao valem nos TRES modos: eles sao sobre
     * onde avisar, nao sobre o quanto incomodar. O que a intensidade
     * escolhe e o que acontece DENTRO da tela. */
    atualizarDistintivo();
    avisarForaDaAba();

    if (forma.cartao) mostrarCartaoDeChegada();

    if (forma.som === "curto") {
      tocarSomAtual(true); // uma vez so, e acabou
    } else if (forma.som === "repetido") {
      tocando = true;
      atualizarTextoDoBanner();
      if (banner) banner.mostrar();
      if (moldura) moldura.mostrar();
      var tipo = somDoModo(false);
      tocarSomAtual(false);
      intervaloSirene = setInterval(function () { tocarSomAtual(false); }, tipo.intervaloMs);
      // BUG JA CORRIGIDO NO ORIGINAL v1.4.0 E PRESERVADO AQUI: o limite de
      // seguranca faz uma parada COMPLETA (que reseta `tocando`), senao o
      // alarme ficava travado em silencio para sempre depois da primeira
      // vez que ninguem clicasse em "Silenciar" a tempo.
      timeoutLimiteSirene = setTimeout(silenciarComReengate, DURACAO_MAX_SOM_MS);
    }
  }

  /* ------------------------------------------------------------------
   * O CARTAO DISCRETO
   * ------------------------------------------------------------------
   * Aparece no canto, diz quem chegou e de onde, e sai sozinho. Nao
   * bloqueia nada e nao repete som — e o meio-termo que faltava entre
   * "sirene" e "nao fico sabendo".
   * ------------------------------------------------------------------ */
  function mostrarCartaoDeChegada() {
    if (!d || !d.dock || typeof d.dock.criarAviso !== "function") return;
    var ficha = ultimaChegada || {};
    var linhas = [];
    /* So o MUNICIPIO — e desde a v2.33.2 e o unico dado que o modulo
     * chega a ler. O cartao fica na tela por 12 s, atravessa troca de
     * aba e aparece em qualquer print que o medico tire; nome de
     * paciente nao acrescenta nada a decisao dele, que e "vou atender
     * agora ou nao". O municipio acrescenta. */
    if (ficha.municipio) linhas.push(ficha.municipio);
    linhas.push(textoDoMotivo());

    d.dock.criarAviso({
      titulo: "🔔 Novo paciente na fila",
      corpo: linhas,
      autoFecharMs: 12000,
      acoes: [{ rotulo: "Ok", primario: true, aoClicar: function () {} }],
    });
  }

  /* ------------------------------------------------------------------
   * O ATALHO "VER A FILA" FOI REMOVIDO — e por que
   * ------------------------------------------------------------------
   * Ele existiu entre a v2.26 e a v2.30 e nunca funcionou: em vez de
   * levar o medico ate o Pronto Atendimento, respondia sempre "nao mudei
   * de tela porque voce tem um documento aberto pela metade".
   *
   * A causa era uma linha. A guarda perguntava se havia
   * `[id$="-modal"]:not([hidden])` no shadow — mas quem recebe `hidden` e
   * o OVERLAY, nunca o modal de dentro dele. O seletor casava com os
   * geradores montados na subida, abertos ou nao, e a guarda respondia
   * "sim" sempre.
   *
   * Corrigir era trocar o alvo da guarda. A REMOCAO foi decisao de
   * produto, tomada depois de o defeito aparecer em uso: um atalho que
   * mente sobre o motivo de nao funcionar gasta mais confianca do que
   * economiza cliques. O aviso continua fazendo o que importa — trazer a
   * aba para frente e silenciar com reengate.
   * ------------------------------------------------------------------ */

  function silenciarAlarme() {
    cancelarReengateAgendado();
    pararSom();
    tocando = false;
    if (banner) banner.esconder();
    if (moldura) moldura.esconder();
    /* O distintivo NAO e limpo aqui: silenciar o som nao faz o paciente
     * sair da fila. Ele so some quando a fila esvazia. */
    atualizarDistintivo();
    /* A janela, sim, fecha: o medico ja viu. Deixa-la aberta na barra de
     * tarefas depois de silenciado e lixo que ele fecha na mao. */
    if (atencao() && atencao().fecharJanelaDeAviso) atencao().fecharJanelaDeAviso();
  }

  function cancelarReengateAgendado() {
    if (timeoutReengate) {
      clearTimeout(timeoutReengate);
      timeoutReengate = null;
    }
  }

  /* Fila vazia? Usa o decisor do nucleo: o voto do DOM so vale enquanto
   * fresco (validadeMs); vencido ele some sozinho e sobra o voto de rede.
   * Se nenhum sinal for confiavel, NAO decide e o alarme continua
   * tocando — preferir errar tocando a errar calando. */
  function filaDeEsperaEstaVazia() {
    var r = decisorFila.decidir();
    if (!r.decidiu) return false;
    return r.valor === false;
  }

  function checarSeDeveSilenciarPorFilaVazia() {
    if (!tocando) return;
    if (filaDeEsperaEstaVazia()) {
      console.debug("[Alarme Fila] fila esvaziou, silenciando automaticamente");
      silenciarAlarme(); // sem reengate: nao ha mais ninguem esperando
    }
  }

  function tentarReengatarAlarme() {
    timeoutReengate = null;
    if (!config.ativo) return;
    if (filaDeEsperaEstaVazia()) return;
    console.debug("[Alarme Fila] fila ainda cheia apos silenciar, tocando de novo");
    dispararAlarme();
  }

  function silenciarComReengate() {
    silenciarAlarme();
    if (config.ativo) timeoutReengate = setTimeout(tentarReengatarAlarme, COOLDOWN_REENGATE_MS);
  }

  /* ----------------------------------------------------------------
   * UI (painel de configuracao + banner) — sem posicionamento proprio:
   * overlay e banner vem prontos do dock do nucleo.
   * ---------------------------------------------------------------- */
  function montarPainel() {
    /* Duas listas, nao uma. Um som so servindo os dois modos serve mal
     * aos dois: sirene tocada uma vez soa truncada, e sino repetindo a
     * cada segundo por dois minutos e outra tortura. */
    function opcoesDe(curto) {
      return Object.keys(TIPOS_DE_SOM)
        .filter(function (chave) { return !!TIPOS_DE_SOM[chave].curto === curto; })
        .map(function (chave) {
          return '<option value="' + chave + '">' + TIPOS_DE_SOM[chave].nome + "</option>";
        })
        .join("");
    }
    var opcoesSom = opcoesDe(false);
    var opcoesSomCurto = opcoesDe(true);

    painel = d.dock.criarOverlay({
      estilo: CSS_PAINEL,
      html:
        '<div class="af-modal" role="dialog" aria-modal="true">' +
        raiz.MeedsSuiteCabecalho.html({ tom: "alarme", titulo: "Alarme de fila" }) +
        '  <div class="af-body">' +
        "    <div>" +
        "      <label>Como avisar</label>" +
        '      <label class="af-radio-linha"><input type="radio" name="af-intensidade" value="completo" /> 🔔 Completo — sirene, faixa e moldura</label>' +
        '      <label class="af-radio-linha"><input type="radio" name="af-intensidade" value="discreto" /> 🔉 Discreto — cartão no canto e um som curto</label>' +
        '      <label class="af-radio-linha"><input type="radio" name="af-intensidade" value="silencioso" /> 🔕 Silencioso — só o contador na aba</label>' +
        '      <div class="af-hint" id="af-intensidade-dica"></div>' +
        "    </div>" +
        "    <div>" +
        "      <label>Quando alertar</label>" +
        '      <label class="af-radio-linha"><input type="radio" name="af-modo" value="imediato" /> Assim que um paciente entra na fila</label>' +
        '      <label class="af-radio-linha"><input type="radio" name="af-modo" value="espera" /> Quando um paciente ultrapassar um tempo de espera</label>' +
        '      <div id="af-tempo-espera-linha"><input type="number" id="af-tempo-espera" min="1" max="120" step="1" /><span>minutos</span></div>' +
        '      <div class="af-hint">No modo "tempo de espera", o alarme soa uma vez por paciente que ultrapassar o limite — contado a partir de quando este script viu o paciente na fila pela primeira vez.</div>' +
        "    </div>" +
        '    <div><label for="af-som">Som do modo completo (repete)</label><select id="af-som">' + opcoesSom + "</select></div>" +
        '    <div><label for="af-som-curto">Som do modo discreto (toca uma vez)</label><select id="af-som-curto">' + opcoesSomCurto + "</select></div>" +
        '    <div><label for="af-volume">Volume</label><input type="range" id="af-volume" min="0" max="100" step="5" /></div>' +
        '    <button type="button" id="af-testar-som">🔊 Testar som</button>' +
        "    <div>" +
        "      <label>Quando você não está na aba do Meeds</label>" +
        '      <div class="af-estado" id="af-avisar-estado"></div>' +
        '      <button type="button" id="af-liberar-aviso" hidden>Ativar avisos do sistema</button>' +
        '      <label class="af-radio-linha" style="margin-top:10px;"><input type="checkbox" id="af-janela" /> Abrir também uma janela de aviso</label>' +
        '      <div class="af-hint" id="af-janela-hint"></div>' +
        "    </div>" +
        "  </div>" +
        "</div>",
    });

    painel.$(".msc-fechar").addEventListener("click", painel.fechar);

    painel.$$('input[name="af-intensidade"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        config.intensidade = radio.value;
        if (config.intensidade === "silencioso" && tocando) silenciarAlarme();
        salvar();
        refletirEstado();
      });
    });

    painel.$$('input[name="af-modo"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        config.modo = radio.value;
        salvar();
        refletirEstado();
      });
    });
    painel.$("#af-tempo-espera").addEventListener("change", function () {
      var v = parseInt(painel.$("#af-tempo-espera").value, 10);
      config.tempoEsperaMin = Math.min(120, Math.max(1, v || CONFIG_PADRAO.tempoEsperaMin));
      painel.$("#af-tempo-espera").value = config.tempoEsperaMin;
      salvar();
    });
    painel.$("#af-som").addEventListener("change", function () {
      config.som = painel.$("#af-som").value;
      salvar();
      obterAudioContext();
      tocarSomAtual(false); // ouvir na hora de escolher, nao depois
    });
    painel.$("#af-som-curto").addEventListener("change", function () {
      config.somCurto = painel.$("#af-som-curto").value;
      salvar();
      obterAudioContext();
      tocarSomAtual(true);
    });
    painel.$("#af-volume").addEventListener("input", function () {
      config.volume = parseInt(painel.$("#af-volume").value, 10);
      salvar();
    });
    painel.$("#af-testar-som").addEventListener("click", function () {
      obterAudioContext();
      tocarSomAtual(config.intensidade === "discreto");
    });

    /* A permissao de notificacao SO pode ser pedida a partir de um clique
     * do medico — navegador ignora (e alguns punem) pedido sem gesto do
     * usuario. Por isso existe este botao, e ele so aparece enquanto a
     * permissao nao foi dada: nao e uma chave de liga/desliga, e o unico
     * passo que o navegador exige uma vez. */
    painel.$("#af-janela").addEventListener("change", function () {
      config.janelaDeAviso = painel.$("#af-janela").checked;
      salvar();
      if (!config.janelaDeAviso) {
        if (atencao() && atencao().fecharJanelaDeAviso) atencao().fecharJanelaDeAviso();
        refletirEstadoDosAvisos();
        return;
      }
      /* Abre uma de amostra AGORA, no gesto de clique: e o unico momento
       * em que o Chrome deixa abrir sem permissao previa, e serve de
       * teste — se for bloqueada, o medico descobre aqui e nao na
       * primeira chegada de paciente. */
      var A = atencao();
      if (A && A.abrirJanelaDeAviso) {
        A.abrirJanelaDeAviso({ titulo: "Assim que ela vai aparecer", corpo: "Esta é a janela de aviso. Feche-a quando quiser." });
      }
      refletirEstadoDosAvisos();
    });

    painel.$("#af-liberar-aviso").addEventListener("click", function () {
      var A = atencao();
      if (!A) return;
      A.pedirPermissaoDeNotificacao().then(function (liberou) {
        refletirEstadoDosAvisos();
        /* O Edge vem com "solicitacoes de notificacao silenciosas" LIGADO:
         * ele engole o pedido e so pisca um sininho na barra de endereco.
         * Sem esta linha, o medico clica no botao e parece que nada
         * aconteceu — e ele conclui, com razao, que esta quebrado. */
        if (!liberou && A.permissaoDeNotificacao() === "default") {
          var estado = painel.$("#af-avisar-estado");
          if (estado) {
            estado.textContent =
              "O navegador não mostrou a pergunta — ele silencia esse pedido por padrão. " +
              "Procure o ícone de sino na barra de endereço e escolha permitir.";
          }
        }
      });
    });
  }

  /* O aviso do sistema e como o alarme funciona, nao uma opcao — mas ele
   * depende de uma permissao que o navegador pode nao ter dado, ou ter
   * bloqueado. Entao a tela nao oferece uma chave: ela diz o ESTADO, e
   * oferece o unico passo que resolve, quando ha um. */
  function refletirEstadoDosAvisos() {
    if (!painel) return;
    var A = atencao();
    var estado = painel.$("#af-avisar-estado");
    var botao = painel.$("#af-liberar-aviso");
    if (!estado || !botao) return;

    var permissao = A ? A.permissaoDeNotificacao() : "indisponivel";
    botao.hidden = permissao !== "default";

    if (permissao === "granted") {
      estado.textContent =
        "Avisos do sistema ligados. Aparecem com o navegador minimizado; clicar traz a aba " +
        "para frente e silencia — se você não atender, o alarme volta em 5 minutos.";
    } else if (permissao === "denied") {
      estado.textContent =
        "As notificações estão bloqueadas para este site. Libere no cadeado da barra de " +
        "endereço para ser avisado fora da aba. O alarme continua tocando aqui dentro.";
    } else if (permissao === "indisponivel") {
      estado.textContent =
        "Este navegador não oferece notificação do sistema. O alarme continua tocando na " +
        "aba do Meeds.";
    } else {
      estado.textContent =
        "Você pode ser avisado mesmo com o navegador minimizado. O navegador pede sua " +
        "autorização uma vez.";
    }

    if (A && A.suportaTelaAcesa()) {
      estado.textContent += " A tela não apaga enquanto o Meeds estiver aberto.";
    }

    var chaveJanela = painel.$("#af-janela");
    var dicaJanela = painel.$("#af-janela-hint");
    if (!chaveJanela || !dicaJanela) return;

    var temJanela = !!(A && A.suportaJanela());
    chaveJanela.disabled = !temJanela;
    chaveJanela.checked = !!config.janelaDeAviso && temJanela;

    if (!temJanela) {
      /* No iPad a frase generica nao serve: o medico procuraria a
       * configuracao de pop-up que ali nao existe. Dizer que os outros
       * dois avisos continuam valendo evita a leitura de que o alarme
       * inteiro e mais fraco no tablet — nao e, so este degrau falta. */
      dicaJanela.textContent = A && A.ehIOS()
        ? "No iPad e no iPhone o Safari não abre janela separada. O som e a notificação continuam funcionando normalmente."
        : "Este navegador não permite abrir janelas.";
    } else if (config.janelaDeAviso && A.janelaBloqueada()) {
      /* Dizer a verdade: sem isto o medico marca a opcao, nao ve janela
       * nenhuma e conclui que esta quebrada — com razao. */
      dicaJanela.textContent =
        "O navegador bloqueou a janela. Clique no ícone de pop-up bloqueado na barra de endereço " +
        "e escolha permitir para este site.";
    } else if (config.janelaDeAviso) {
      dicaJanela.textContent =
        "Uma janela pequena aparece na barra de tarefas quando chega paciente e você não está no Meeds. " +
        "Ela fica lá até ser fechada — ao contrário da notificação, que some sozinha.";
    } else {
      dicaJanela.textContent =
        "Para quem trabalha com muitas janelas abertas e perde a notificação no canto da tela.";
    }
  }

  /* O Edge suspende guias de fundo de fabrica, e o Chrome congela as
   * ociosas. Aba suspensa para os timers: o Meeds deixa de consultar a
   * fila e o alarme nao toca — sem erro, sem aviso. Nao da para impedir
   * pela pagina, entao o minimo honesto e CONTAR ao medico que houve um
   * periodo sem vigilancia, em vez de deixa-lo achar que ninguem chegou. */
  var cancelarVigiaSuspensao = null;

  /* UM aviso reaproveitado, nunca um por acordada.
   *
   * Ate a v2.43.2 cada despertar criava um cartao NOVO, e com
   * `autoFecharMs: 0` — nenhum deles sumia sozinho. Numa aba de fundo o
   * navegador suspende de novo e de novo, entao um plantao noturno
   * terminava com seis, sete cartoes identicos empilhados cobrindo a
   * tela, todos pedindo para serem fechados a mao. Foi o que o medico
   * reportou, com print: informacao util virou obstaculo.
   *
   * O dock ja previa exatamente este caso — o handle de criarAviso tem
   * `atualizar()` para que "tres chegadas virem UM aviso que conta ate
   * tres, nao tres avisos empilhados" (ver core/dock.js). Aqui era so
   * usar: o mesmo cartao conta as repeticoes, volta para o fim da pilha
   * a cada nova suspensao (para o medico reparar) e o relogio de
   * fechamento reinicia junto.
   *
   * 30 s, e nao os 12 s do cartao de chegada: este texto e mais longo e
   * pede uma acao ("confira a fila"), entao precisa de tempo de leitura.
   * Mas sumir sozinho e requisito — um aviso permanente sobre algo que
   * JA passou nao ajuda em nada depois de lido. */
  var AUTO_FECHAR_SUSPENSAO_MS = 30000;
  var avisoSuspensao = null;
  var vezesSuspensa = 0;
  var minutosSuspensa = 0;

  function relatarSuspensao(min) {
    if (!d || !d.dock || typeof d.dock.criarAviso !== "function") return;

    /* Cartao anterior ja sumiu (ou nunca existiu): a contagem recomeca.
     * Sem isto o total seguiria crescendo pelo plantao inteiro e o
     * numero deixaria de dizer algo util — "23 vezes" desde quando? */
    if (!avisoSuspensao || !avisoSuspensao.estaVisivel()) {
      avisoSuspensao = null;
      vezesSuspensa = 0;
      minutosSuspensa = 0;
    }

    vezesSuspensa += 1;
    minutosSuspensa += min;

    var spec = {
      titulo: "O alarme ficou parado",
      corpo: [
        vezesSuspensa === 1
          ? "Esta aba ficou suspensa pelo navegador por cerca de " + min +
            " min e o alarme não pôde tocar nesse período."
          : "Já aconteceu " + vezesSuspensa + " vezes; a última há pouco, por cerca de " +
            min + " min — somando " + minutosSuspensa + " min sem vigilância.",
        "Confira a fila.",
        "Para evitar, no Edge: Configurações › Sistema › “Nunca colocar estes sites " +
          "em suspensão” e acrescente meeds.com.br.",
      ],
      autoFecharMs: AUTO_FECHAR_SUSPENSAO_MS,
    };

    if (avisoSuspensao) avisoSuspensao.atualizar(spec);
    else avisoSuspensao = d.dock.criarAviso(spec);
  }

  function vigiarSuspensaoDaAba() {
    var A = atencao();
    if (!A || !A.aoAcordarDeSuspensao) return;
    cancelarVigiaSuspensao = A.aoAcordarDeSuspensao(function (atrasoMs) {
      if (!config.ativo) return; // alarme desligado: nao havia o que vigiar
      var min = Math.round(atrasoMs / 60000);
      if (min < 2) return;
      relatarSuspensao(min);
    });
  }

  function montarBanner() {
    moldura = d.dock.criarMolduraAlerta();
    banner = d.dock.criarBanner(
      '<span>🚨 Novo paciente na fila!</span>' +
        '<span class="ms-banner-motivo" id="af-motivo"></span>' +
        '<button type="button" id="af-silenciar">Silenciar alarme</button>'
    );
    banner.$("#af-silenciar").addEventListener("click", silenciarComReengate);
  }

  /* Um alarme que diz POR QUE esta tocando e informacao; um que so grita
   * vira ruido, e ruido o medico desliga. */
  function atualizarTextoDoBanner() {
    if (!banner) return;
    var el = banner.$("#af-motivo");
    if (el) el.textContent = textoDoMotivo();
  }

  function salvar() {
    d.storage.gravarConfig(config);
  }

  function refletirEstado() {
    if (d.botao) {
      var forma = intensidadeAtual();
      d.botao.definirTexto(forma.icone);
      d.botao.definirClasse("ms-ativo", config.intensidade === "completo");
      d.botao.definirClasse("ms-neutro", config.intensidade !== "completo");
      d.botao.definirTitulo(
        "Alarme: " + forma.rotulo + " — " + forma.resumo + " Clique para trocar; ⚙️ para configurar."
      );
    }
    if (!painel) return;
    painel.$$('input[name="af-modo"]').forEach(function (r) {
      r.checked = r.value === config.modo;
    });
    painel.$("#af-tempo-espera").value = config.tempoEsperaMin;
    painel.$("#af-tempo-espera").disabled = config.modo !== "espera";
    painel.$("#af-som").value = config.som;
    painel.$("#af-som-curto").value = config.somCurto;
    painel.$("#af-volume").value = config.volume;
    painel.$$('input[name="af-intensidade"]').forEach(function (r) {
      r.checked = r.value === config.intensidade;
    });
    var dica = painel.$("#af-intensidade-dica");
    if (dica) dica.textContent = intensidadeAtual().resumo;
    refletirEstadoDosAvisos();
  }

  /* Como o botao de som do Waze: um toque cicla entre as intensidades,
   * em vez de so ligar e desligar. Desligar de vez continua sendo a
   * chave da funcao no painel da engrenagem — aqui a escolha e "quanto",
   * nao "se". */
  /* Ponto UNICO de abertura do painel de Ajustes — chamado pelos tres
   * caminhos que levam la (aoAbrirAjustes do painel da engrenagem,
   * clique direito no icone, shift+clique no icone). Existe por causa
   * da oferta de tutorial na primeira vez: se cada caminho chamasse
   * `painel.abrir()` direto, so o caminho que fosse embrulhado por
   * ultimo ofereceria o tutorial — os outros dois abririam os Ajustes
   * em silencio, e a "primeira vez" nunca aconteceria para quem usa
   * clique direito. */
  function abrirPainelDeAjustes() {
    painel.abrir();
    if (raiz.MeedsSuiteTutorial) {
      raiz.MeedsSuiteTutorial.iniciarSePrimeiraVez("alarme-fila", { dock: d.dock });
    }
  }

  function ciclarIntensidade() {
    /* Aproveita o gesto de clique para destravar o audio: o navegador so
     * deixa tocar som depois de uma interacao do usuario. */
    obterAudioContext();
    var i = ORDEM_INTENSIDADE.indexOf(config.intensidade);
    config.intensidade = ORDEM_INTENSIDADE[(i + 1) % ORDEM_INTENSIDADE.length];
    if (config.intensidade === "silencioso" && tocando) silenciarAlarme();
    salvar();
    refletirEstado();
    if (d && d.dock && d.dock.criarAviso) {
      d.dock.criarAviso({
        titulo: intensidadeAtual().icone + " " + intensidadeAtual().rotulo,
        corpo: intensidadeAtual().resumo,
        autoFecharMs: 3500,
      });
    }
  }

  /* ----------------------------------------------------------------
   * TUTORIAL GUIADO — ver core/tutorial.js para o mecanismo.
   * Registro estatico, independente de o modulo estar rodando. O
   * roteiro cobre, nessa ordem: o que a funcao faz, as tres
   * intensidades e o atalho de clique no botao, os dois modos (chegada
   * x tempo de espera), onde configurar som/volume, e as tres travas de
   * seguranca que evitam alarme travado ou esquecido.
   * ---------------------------------------------------------------- */
  if (raiz.MeedsSuiteTutorial) {
    raiz.MeedsSuiteTutorial.registrar("alarme-fila", {
      titulo: "Alarme de Fila",
      passos: [
        {
          icone: "🔔",
          titulo: "O que esta função faz",
          texto:
            "Avisa com som e aviso na tela quando um paciente entra na fila do Pronto Atendimento — ou, se " +
            "você preferir, quando alguém ultrapassa um tempo de espera. Para sozinho quando a fila esvazia; " +
            "não precisa lembrar de desligar.",
        },
        {
          icone: "🔔🔉🔕",
          titulo: "As três intensidades",
          texto:
            "Clique no ícone do alarme, na barra de funções, para alternar entre Completo (sirene repetindo, " +
            "faixa no topo e moldura na borda até alguém silenciar), Discreto (um cartão no canto com quem " +
            "chegou e um som curto, some sozinho) e Silencioso (só o contador na aba, sem som nem aviso). " +
            "Um aviso na tela confirma qual ficou ativa. Não precisa escolher entre ser interrompido ou não " +
            "saber que chegou gente — dá para ajustar o quanto de interrupção cabe no momento.",
        },
        {
          icone: "⏱️",
          titulo: "Dois jeitos de disparar",
          texto:
            "Nos Ajustes (clique direito no ícone do alarme, ou pelo painel da engrenagem), escolha entre " +
            "\"assim que um paciente entra na fila\" ou \"quando um paciente ultrapassar um tempo de espera\" " +
            "— nesse segundo modo, o alarme toca uma vez por paciente que passar do limite que você definir.",
        },
        {
          icone: "🔊",
          titulo: "Som, volume e janela de aviso",
          texto:
            "Os mesmos Ajustes deixam escolher o som (um para o alarme completo, outro — mais curto — para o " +
            "aviso discreto), o volume, e se quer abrir também uma janela de aviso do navegador. O que limita " +
            "o aviso fora da aba é permissão do navegador, não uma chave — se pedir, o navegador pergunta.",
        },
        {
          icone: "🛡️",
          titulo: "Travas de segurança",
          texto:
            "O alarme completo nunca fica tocando para sempre: silencia sozinho depois de 2 minutos, mesmo " +
            "que ninguém toque nele. Se a fila continuar com gente esperando, ele volta a tocar depois de 5 " +
            "minutos — não deixa esquecido, mas também não fica insistindo sem parar. E se a leitura da fila " +
            "ficar ambígua (rede e tela discordando), ele prefere não decidir a disparar um alarme errado.",
        },
      ],
    });
  }

  /* ----------------------------------------------------------------
   * CONTRATO DE MODULO
   * ---------------------------------------------------------------- */
  raiz.MeedsSuite.registerModule({
    id: "alarme-fila",
    nome: "Alarme de Fila",
    descricao:
      "Alarme sonoro e visual quando um paciente entra na fila do Pronto Atendimento (ou ultrapassa um tempo de espera). Para sozinho quando a fila esvazia.",
    versao: "2.0.0",
    configPadrao: CONFIG_PADRAO,

    // Botao: apresentacao no manifest.json (ficha "alarme-fila"). O
    // icone inicial e 🔕; o modulo troca para 🔉/🔔 conforme a
    // intensidade, por deps.botao.definirTexto(). Ver decisao D58.
    temBotao: true,

    assinaturasRede: [{ regex: /\/api\/v1\/Atendimento\?/i, metodos: ["GET"] }],

    aoCargaRede: function (evt) {
      if (evt.status !== 200) return;
      if (!ehChamadaFilaDeEspera(evt.url)) return;
      var json = evt.json();
      if (json) processarRespostaFilaDeEspera(evt.url, json);
    },

    start: function (deps) {
      d = deps;
      config = deps.config;
      // saneia a config carregada, como o carregarConfig() original fazia
      /* O alarme deixou de ter liga/desliga proprio: a funcao estar
       * ligada JA e o alarme ativo, e o quanto ele incomoda e a
       * intensidade. Um medico que abre o painel, liga "Alarme de fila"
       * e nao ouve nada porque havia um segundo interruptor escondido no
       * botao e um medico que conclui, com razao, que esta quebrado. */
      config.ativo = true;
      config.modo = config.modo === "espera" ? "espera" : "imediato";
      config.tempoEsperaMin = Math.min(
        120,
        Math.max(1, parseInt(config.tempoEsperaMin, 10) || CONFIG_PADRAO.tempoEsperaMin)
      );
      config.volume = Math.min(100, Math.max(0, parseInt(config.volume, 10) || 0));
      /* Um som da familia errada em qualquer dos dois campos volta ao
       * padrao: e o que acontece com quem atualiza vindo de uma versao
       * que tinha uma lista so. */
      if (!TIPOS_DE_SOM[config.som] || TIPOS_DE_SOM[config.som].curto) config.som = CONFIG_PADRAO.som;
      if (!TIPOS_DE_SOM[config.somCurto] || !TIPOS_DE_SOM[config.somCurto].curto) {
        config.somCurto = CONFIG_PADRAO.somCurto;
      }
      config.janelaDeAviso = !!config.janelaDeAviso;
      if (!INTENSIDADES[config.intensidade]) config.intensidade = CONFIG_PADRAO.intensidade;
      /* Avisar fora da aba e manter a tela acesa deixaram de ser chaves:
       * sao como o alarme funciona. O que limita o aviso do sistema nao e
       * preferencia, e PERMISSAO do navegador — e permissao nao se
       * resolve com uma chave, se resolve pedindo. Ver D30. */
      if (atencao()) atencao().manterTelaAcesa(true);
      delete config.avisarForaDaAba;
      delete config.manterTelaAcesa;

      decisorFila = deps.decisao.criarDecisor({
        limiar: 0.6,                    // um voto de DOM sozinho ja decide
        validadeMs: LIMITE_FRESCOR_DOM_MS,
        pesos: { rede: 1.0, dom_contador: 0.6 },
      });

      montarBanner();
      montarPainel();
      vigiarSuspensaoDaAba();
      deps.aoClicarBotao(ciclarIntensidade);
      /* A configuracao tambem abre pelo painel da engrenagem, em
       * "Ajustes". O clique direito continua valendo como atalho, mas
       * deixou de ser o UNICO caminho — ninguem descobre clique direito
       * sozinho. */
      deps.aoAbrirAjustes(abrirPainelDeAjustes);
      if (typeof deps.aoIniciarTutorial === "function") {
        deps.aoIniciarTutorial(function () {
          if (raiz.MeedsSuiteTutorial) raiz.MeedsSuiteTutorial.iniciar("alarme-fila", { dock: d.dock });
        });
      }

      // clique com Shift, ou clique direito, abre a configuracao do modulo
      if (deps.botao) {
        deps.botao.elemento.addEventListener("contextmenu", function (ev) {
          ev.preventDefault();
          abrirPainelDeAjustes();
        });
        deps.botao.elemento.addEventListener("click", function (ev) {
          if (ev.shiftKey) {
            ev.stopImmediatePropagation();
            abrirPainelDeAjustes();
          }
        });
      }

      observerToast = new MutationObserver(function (mutacoes) {
        for (var i = 0; i < mutacoes.length; i++) {
          var nodes = mutacoes[i].addedNodes;
          for (var j = 0; j < nodes.length; j++) {
            if (nodes[j].nodeType !== 1) continue;
            try {
              if (pareceToastNovoAtendimento(nodes[j])) {
                sinalizarNovoPaciente("toast-nativo");
                return;
              }
            } catch (e) {
              /* silencioso */
            }
          }
        }
      });
      observerToast.observe(document.body, { childList: true, subtree: true });

      atualizarLeituraContadorAguardando(); // primeira leitura so define a base
      refletirEstado();

      timers.push(setInterval(tentarChecarContadorAguardando, INTERVALO_RECHECAGEM_MS));
      timers.push(setInterval(checarLimiteDeEspera, INTERVALO_CHECAGEM_ESPERA_MS));
    },

    stop: function () {
      silenciarAlarme();
      timers.forEach(clearInterval);
      timers = [];
      if (observerToast) {
        observerToast.disconnect();
        observerToast = null;
      }
      if (painel) {
        painel.remover();
        painel = null;
      }
      if (banner) {
        banner.remover();
        banner = null;
      }
      if (moldura) {
        moldura.remover();
        moldura = null;
      }
      /* Desligar o modulo tem que devolver a aba como estava: sem
       * contador no titulo, com o favicone do Meeds de volta, e sem
       * segurar a tela acesa. */
      if (cancelarVigiaSuspensao) {
        cancelarVigiaSuspensao();
        cancelarVigiaSuspensao = null;
      }
      /* O cartao de "alarme ficou parado" tambem sai: desligar a funcao
       * nao pode deixar na tela um aviso que ninguem mais atualiza. */
      if (avisoSuspensao) {
        avisoSuspensao.fechar();
        avisoSuspensao = null;
      }
      vezesSuspensa = 0;
      minutosSuspensa = 0;
      if (atencao()) {
        atencao().limpar();
        atencao().manterTelaAcesa(false);
      }
      idsFilaPorAssinatura.clear();
      idsJaAlertadosPorEspera.clear();
      ultimoValorAguardandoDOM = null;
      decisorFila = null;
      d = null;
    },

    _TIPOS_DE_SOM: TIPOS_DE_SOM, // exposto so para o teste de fumaca
    /* Exposto para o teste da contagem: e o numero que aparece no
     * contador da aba, e ele ja saiu errado uma vez. */
    _resumoDaFila: function () { return resumoDaFila(); },
    _lerRespostaDeFila: function (url, json) { processarRespostaFilaDeEspera(url, json); },
    _definirContadorDaTela: function (n) { ultimoValorAguardandoDOM = n; },
    _ehChamadaFilaDeEspera: function (url) { return ehChamadaFilaDeEspera(url); },
    /* Exposto para o teste de privacidade: o que o modulo RETEM de quem
     * chegou. Se um dia voltar a haver nome de paciente aqui, o teste
     * quebra — que e exatamente o ponto. */
    _ultimaChegada: function () { return ultimaChegada; },
    /* Exposto para o teste do aviso de suspensao: ele JA empilhou cartao
     * sem fechar na tela do medico, e o teste existe para nao repetir. */
    _relatarSuspensao: function (min) { relatarSuspensao(min); },
  });
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
