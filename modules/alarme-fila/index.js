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
  };

  var CSS_PAINEL = [
    ".af-modal { width: 100%; max-width: 380px; background: #fff; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,.3); overflow: hidden; }",
    ".af-modal header { background: linear-gradient(135deg,#dc2626,#f97316); color:#fff; padding:16px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; }",
    ".af-modal header h2 { margin:0; font-size:15px; font-weight:700; }",
    ".af-fechar { background: rgba(255,255,255,.18); border:none; color:#fff; width:28px; height:28px; border-radius:8px; font-size:15px; cursor:pointer; flex-shrink:0; }",
    ".af-fechar:hover { background: rgba(255,255,255,.32); }",
    ".af-body { padding:16px 18px 20px; display:flex; flex-direction:column; gap:16px; }",
    ".af-body label { font-size:12.5px; font-weight:600; color:#334155; display:block; margin-bottom:6px; }",
    ".af-hint { font-size:11px; color:#94a3b8; margin-top:4px; font-weight:400; line-height:1.45; }",
    ".af-radio-linha { display:flex; align-items:center; gap:8px; font-size:13.5px; color:#1e293b; font-weight:400; margin-bottom:8px; cursor:pointer; }",
    ".af-radio-linha input { cursor:pointer; }",
    "#af-tempo-espera-linha { display:flex; align-items:center; gap:8px; margin-left:24px; }",
    "#af-tempo-espera-linha input[type=number] { width:60px; padding:6px 8px; border-radius:8px; border:1.5px solid #cbd5e1; font-size:13px; }",
    ".af-body select { width:100%; box-sizing:border-box; padding:9px 10px; border-radius:10px; border:1.5px solid #cbd5e1; font-size:13.5px; color:#0f172a; background:#f8fafc; }",
    ".af-body input[type=range] { width:100%; }",
    "#af-testar-som { width:100%; padding:10px; border-radius:10px; border:none; background:linear-gradient(135deg,#f97316,#dc2626); color:#fff; font-size:13.5px; font-weight:700; cursor:pointer; }",
    "#af-testar-som:hover { opacity:.92; }",
  ].join("\n");

  var CONFIG_PADRAO = {
    ativo: false,
    modo: "imediato", // "imediato" | "espera"
    tempoEsperaMin: 5,
    som: "sirene-classica",
    volume: 70,
  };

  /* --- estado do modulo (recriado a cada start, zerado a cada stop) --- */
  var d = null;          // deps do nucleo
  var config = null;
  var painel = null;
  var banner = null;
  var observerToast = null;
  var timers = [];

  // ids vistos na fila por "assinatura" de chamada -> Map<id, {primeiraVezVistoEm}>
  var idsFilaPorAssinatura = new Map();
  var idsJaAlertadosPorEspera = new Set();
  var decisorFila = null; // fusao dos sinais sobre "tem gente esperando?"
  var ultimoDisparoTs = 0;

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
  var intervaloPiscaTitulo = null;
  var tituloOriginal = "";
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

  function ehChamadaFilaDeEspera(url) {
    if (!REGEX_ATENDIMENTO_LISTA.test(url)) return false;
    if (!/[?&]StatusAtendimentoId=2(?:&|$)/i.test(url)) return false;
    if (/[?&]ProfissionalId=/i.test(url)) return false; // exclui "meus atendimentos"
    return true;
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
        mapaAtual.set(id, { primeiraVezVistoEm: jaVistoEm });
      });

      // A PRIMEIRA leitura de cada assinatura so define a base — nunca
      // dispara, para nao soar por quem ja estava esperando antes de o
      // medico ligar o alarme.
      if (mapaAnterior) {
        var apareceuIdNovo = Array.from(mapaAtual.keys()).some(function (id) {
          return !mapaAnterior.has(id);
        });
        if (apareceuIdNovo) sinalizarNovoPaciente("rede-fila-espera");
      }

      idsFilaPorAssinatura.set(assinatura, mapaAtual);

      // voto de rede sobre "quantos estao esperando"
      var total = 0;
      idsFilaPorAssinatura.forEach(function (mapa) {
        total += mapa.size;
      });
      decisorFila.votar("rede", total > 0);

      limparIdsAlertadosQueSairamDaFila();
      checarSeDeveSilenciarPorFilaVazia();
    } catch (e) {
      /* silencioso: sinal de reforco, nunca deve quebrar a pagina */
    }
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

  function tocarSomAtual() {
    try {
      var ctx = obterAudioContext();
      if (!ctx) return;
      var tipo = TIPOS_DE_SOM[config.som] || TIPOS_DE_SOM[CONFIG_PADRAO.som];
      tipo.tocar(ctx, config.volume / 100);
    } catch (e) {
      /* silencioso */
    }
  }

  function iniciarPiscaTitulo() {
    if (intervaloPiscaTitulo) return;
    tituloOriginal = document.title;
    var ligado = false;
    intervaloPiscaTitulo = setInterval(function () {
      document.title = ligado ? tituloOriginal : "🚨 NOVO PACIENTE NA FILA";
      ligado = !ligado;
    }, 1000);
  }

  function pararPiscaTitulo() {
    if (intervaloPiscaTitulo) {
      clearInterval(intervaloPiscaTitulo);
      intervaloPiscaTitulo = null;
    }
    if (tituloOriginal) document.title = tituloOriginal;
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
    tocando = true;
    if (banner) banner.mostrar();
    iniciarPiscaTitulo();
    var tipo = TIPOS_DE_SOM[config.som] || TIPOS_DE_SOM[CONFIG_PADRAO.som];
    tocarSomAtual();
    intervaloSirene = setInterval(tocarSomAtual, tipo.intervaloMs);
    // BUG JA CORRIGIDO NO ORIGINAL v1.4.0 E PRESERVADO AQUI: o limite de
    // seguranca faz uma parada COMPLETA (que reseta `tocando`), senao o
    // alarme ficava travado em silencio para sempre depois da primeira
    // vez que ninguem clicasse em "Silenciar" a tempo.
    timeoutLimiteSirene = setTimeout(silenciarComReengate, DURACAO_MAX_SOM_MS);
  }

  function silenciarAlarme() {
    cancelarReengateAgendado();
    pararSom();
    tocando = false;
    pararPiscaTitulo();
    if (banner) banner.esconder();
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
    var opcoesSom = Object.keys(TIPOS_DE_SOM)
      .map(function (chave) {
        return '<option value="' + chave + '">' + TIPOS_DE_SOM[chave].nome + "</option>";
      })
      .join("");

    painel = d.dock.criarOverlay({
      estilo: CSS_PAINEL,
      html:
        '<div class="af-modal" role="dialog" aria-modal="true">' +
        "  <header><h2>Alarme de fila</h2>" +
        '  <button type="button" class="af-fechar" aria-label="Fechar">&#10005;</button></header>' +
        '  <div class="af-body">' +
        "    <div>" +
        "      <label>Quando alertar</label>" +
        '      <label class="af-radio-linha"><input type="radio" name="af-modo" value="imediato" /> Assim que um paciente entra na fila</label>' +
        '      <label class="af-radio-linha"><input type="radio" name="af-modo" value="espera" /> Quando um paciente ultrapassar um tempo de espera</label>' +
        '      <div id="af-tempo-espera-linha"><input type="number" id="af-tempo-espera" min="1" max="120" step="1" /><span>minutos</span></div>' +
        '      <div class="af-hint">No modo "tempo de espera", o alarme soa uma vez por paciente que ultrapassar o limite — contado a partir de quando este script viu o paciente na fila pela primeira vez.</div>' +
        "    </div>" +
        '    <div><label for="af-som">Som do alarme</label><select id="af-som">' + opcoesSom + "</select></div>" +
        '    <div><label for="af-volume">Volume</label><input type="range" id="af-volume" min="0" max="100" step="5" /></div>' +
        '    <button type="button" id="af-testar-som">🔊 Testar som</button>' +
        "  </div>" +
        "</div>",
    });

    painel.$(".af-fechar").addEventListener("click", painel.fechar);

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
    });
    painel.$("#af-volume").addEventListener("input", function () {
      config.volume = parseInt(painel.$("#af-volume").value, 10);
      salvar();
    });
    painel.$("#af-testar-som").addEventListener("click", function () {
      obterAudioContext();
      tocarSomAtual();
    });
  }

  function montarBanner() {
    banner = d.dock.criarBanner(
      '<span>🚨 Novo paciente na fila!</span><button type="button" id="af-silenciar">Silenciar alarme</button>'
    );
    banner.$("#af-silenciar").addEventListener("click", silenciarComReengate);
  }

  function salvar() {
    d.storage.gravarConfig(config);
  }

  function refletirEstado() {
    if (d.botao) {
      d.botao.definirTexto(config.ativo ? "🔔" : "🔕");
      d.botao.definirClasse("ms-ativo", config.ativo);
      d.botao.definirClasse("ms-neutro", !config.ativo);
      d.botao.definirTitulo(
        (config.ativo ? "Alarme LIGADO" : "Alarme desligado") + " — clique para alternar, ⚙️ para configurar"
      );
    }
    if (!painel) return;
    painel.$$('input[name="af-modo"]').forEach(function (r) {
      r.checked = r.value === config.modo;
    });
    painel.$("#af-tempo-espera").value = config.tempoEsperaMin;
    painel.$("#af-tempo-espera").disabled = config.modo !== "espera";
    painel.$("#af-som").value = config.som;
    painel.$("#af-volume").value = config.volume;
  }

  function alternarAtivo() {
    config.ativo = !config.ativo;
    salvar();
    refletirEstado();
    if (config.ativo) {
      // desbloqueia o audio no mesmo gesto de clique (politica do navegador)
      obterAudioContext();
      // recalibra a base agora: so alarma por quem chegar/exceder DEPOIS
      atualizarLeituraContadorAguardando();
      idsJaAlertadosPorEspera.clear();
      d.core.toast("Alarme de fila ligado.", 2500);
    } else {
      silenciarAlarme();
      d.core.toast("Alarme de fila desligado.", 2500);
    }
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

    botao: {
      icone: "🔕",
      rotulo: "",
      variante: "icone",
      titulo: "Alarme de fila (plantao noturno)",
      prioridade: 10, // logo acima da engrenagem
    },

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
      config.ativo = !!config.ativo;
      config.modo = config.modo === "espera" ? "espera" : "imediato";
      config.tempoEsperaMin = Math.min(
        120,
        Math.max(1, parseInt(config.tempoEsperaMin, 10) || CONFIG_PADRAO.tempoEsperaMin)
      );
      config.volume = Math.min(100, Math.max(0, parseInt(config.volume, 10) || 0));
      if (!TIPOS_DE_SOM[config.som]) config.som = CONFIG_PADRAO.som;

      decisorFila = deps.decisao.criarDecisor({
        limiar: 0.6,                    // um voto de DOM sozinho ja decide
        validadeMs: LIMITE_FRESCOR_DOM_MS,
        pesos: { rede: 1.0, dom_contador: 0.6 },
      });

      montarBanner();
      montarPainel();
      deps.aoClicarBotao(alternarAtivo);

      // clique com Shift, ou clique direito, abre a configuracao do modulo
      if (deps.botao) {
        deps.botao.elemento.addEventListener("contextmenu", function (ev) {
          ev.preventDefault();
          painel.abrir();
        });
        deps.botao.elemento.addEventListener("click", function (ev) {
          if (ev.shiftKey) {
            ev.stopImmediatePropagation();
            painel.abrir();
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
      idsFilaPorAssinatura.clear();
      idsJaAlertadosPorEspera.clear();
      ultimoValorAguardandoDOM = null;
      decisorFila = null;
      d = null;
    },

    _TIPOS_DE_SOM: TIPOS_DE_SOM, // exposto so para o teste de fumaca
  });
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
