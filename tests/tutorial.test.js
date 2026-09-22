/* ------------------------------------------------------------------
 * tests/tutorial.test.js — o motor de tutorial guiado (core/tutorial.js)
 * ------------------------------------------------------------------
 * NAO usa DOM real (nem dock.js real): o `dock` que chega em
 * iniciar()/iniciarSePrimeiraVez() e um DUBLE minimo — um
 * `criarOverlay()` que devolve elementos fake o bastante para o motor
 * rodar de ponta a ponta (textContent, style, addEventListener,
 * click()). Isso testa a LOGICA de verdade (registro, progresso,
 * "ja visto" persistente, gating de primeira vez) sem precisar
 * reimplementar um DOM inteiro so para este teste.
 * ------------------------------------------------------------------ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");

let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs !== undefined ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}

/* Duble de elemento: o suficiente para o que tutorial.js faz com cada
 * ref (textContent, style.width, hidden, addEventListener/click). Serve
 * tanto para refs do overlay do carrossel quanto para "alvo" de passo
 * guiado (classList, isConnected, offsetParent, addEventListener com
 * evento arbitrario + {once:true}). */
function elementoFake(opcoes) {
  opcoes = opcoes || {};
  var handlers = {};
  var classes = {};
  var el = {
    textContent: "",
    hidden: false,
    style: {},
    isConnected: opcoes.isConnected !== false,
    offsetParent: opcoes.invisivel ? null : {},
    classList: {
      add: function (c) { classes[c] = true; },
      remove: function (c) { delete classes[c]; },
      contains: function (c) { return !!classes[c]; },
    },
    addEventListener: function (evt, fn) {
      handlers[evt] = fn; // {once:true} nao muda o duble: os testes disparam 1x
    },
    removeEventListener: function (evt, fn) {
      if (handlers[evt] === fn) delete handlers[evt];
    },
    click: function () {
      this.disparar("click");
    },
    disparar: function (evt) {
      if (handlers[evt]) handlers[evt]();
    },
  };
  return el;
}

/* Duble de `dock`: criarOverlay() extrai os ids do HTML (regex, so o
 * suficiente para os seletores que tutorial.js usa: #id ou .tut-fechar)
 * e devolve um overlay fake com os mesmos metodos do real
 * (core/dock.js): $, abrir, fechar, estaAberto. criarAviso() devolve um
 * handle minimo (fechar()) e guarda cada chamada para os testes
 * inspecionarem titulo/corpo/acoes. */
function dockFake() {
  var overlays = [];
  var avisos = [];
  return {
    criarOverlay: function (opcoes) {
      var porId = {};
      var re = /id="([^"]+)"/g;
      var m;
      while ((m = re.exec(opcoes.html))) porId[m[1]] = elementoFake();
      var fechar = elementoFake(); // ".tut-fechar" (unico seletor por classe usado)
      var aberto = false;
      var overlay = {
        $: function (sel) {
          if (sel === ".tut-fechar") return fechar;
          if (sel.charAt(0) === "#") return porId[sel.slice(1)] || null;
          return null;
        },
        abrir: function () { aberto = true; },
        fechar: function () { aberto = false; },
        estaAberto: function () { return aberto; },
      };
      overlays.push(overlay);
      return overlay;
    },
    criarAviso: function (spec) {
      var fechado = false;
      var handle = { spec: spec, fechado: function () { return fechado; }, fechar: function () { fechado = true; } };
      avisos.push(handle);
      return handle;
    },
    _overlays: overlays,
    _avisos: avisos,
  };
}

function carregar() {
  var armazenado = {};
  var ctx = {
    console: { debug() {}, warn() {}, log() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, Promise, Date, Math, JSON, Object, Array, String,
    MeedsSuiteStorage: {
      storageDoNucleo: function () {
        return {
          ler: function (nome, padrao) {
            return Object.prototype.hasOwnProperty.call(armazenado, nome) ? armazenado[nome] : padrao;
          },
          gravar: function (nome, valor) { armazenado[nome] = valor; },
        };
      },
    },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "core/tutorial.js"), "utf8"), ctx);
  return { Tutorial: ctx.MeedsSuiteTutorial, armazenado: armazenado };
}

/* --- registro e deteccao --- */
{
  const { Tutorial } = carregar();

  ok("sem roteiro registrado, temTutorial e falso", !Tutorial.temTutorial("fantasma"));

  Tutorial.registrar("exemplo", {
    titulo: "Módulo de Exemplo",
    passos: [
      { titulo: "Passo 1", texto: "Primeiro passo." },
      { titulo: "Passo 2", texto: "Segundo passo." },
      { titulo: "Passo 3", texto: "Terceiro e último passo." },
    ],
  });
  ok("depois de registrar, temTutorial e verdadeiro", Tutorial.temTutorial("exemplo"));

  Tutorial.registrar("vazio", { titulo: "Sem passos", passos: [] });
  ok("registrar com passos:[] nao registra nada (guarda contra roteiro vazio)",
     !Tutorial.temTutorial("vazio"));

  Tutorial.registrar("sem-passos-nenhum", { titulo: "Sem campo passos" });
  ok("registrar sem `passos` nao quebra e nao registra",
     !Tutorial.temTutorial("sem-passos-nenhum"));
}

/* --- iniciar(): exige dock, desenha o primeiro passo --- */
{
  const { Tutorial } = carregar();
  Tutorial.registrar("exemplo", {
    titulo: "Módulo de Exemplo",
    passos: [
      { titulo: "Passo 1", texto: "Primeiro passo.", icone: "🧪" },
      { titulo: "Passo 2", texto: "Segundo passo." },
    ],
  });

  ok("iniciar() sem dock devolve false e nao quebra",
     Tutorial.iniciar("exemplo", {}) === false);

  const dock = dockFake();
  const abriu = Tutorial.iniciar("exemplo", { dock: dock });
  ok("iniciar() com dock devolve true", abriu === true);

  const overlay = dock._overlays[0];
  ok("o overlay foi aberto", overlay.estaAberto());
  ok("titulo do passo 1 desenhado", overlay.$("#tut-titulo-passo").textContent === "Passo 1");
  ok("texto do passo 1 desenhado", overlay.$("#tut-texto").textContent === "Primeiro passo.");
  ok("icone do passo 1 desenhado", overlay.$("#tut-icone").textContent === "🧪");
  ok("contagem mostra 1 de 2", overlay.$("#tut-contagem").textContent === "1 de 2");
  ok("botao Voltar escondido no primeiro passo", overlay.$("#tut-voltar").hidden === true);
  ok("botao Proximo diz \"Próximo\" quando nao e o ultimo passo",
     overlay.$("#tut-proximo").textContent === "Próximo");

  /* Avanca clicando no botao "Proximo" de verdade (o handler real,
   * registrado via addEventListener dentro de tutorial.js). */
  overlay.$("#tut-proximo").click();
  ok("depois de avancar, mostra o passo 2", overlay.$("#tut-titulo-passo").textContent === "Passo 2");
  ok("no ultimo passo, Voltar aparece", overlay.$("#tut-voltar").hidden === false);
  ok("no ultimo passo, Proximo vira \"Concluir\"", overlay.$("#tut-proximo").textContent === "Concluir");

  /* Marcado como visto desde a ABERTURA (ver comentario em iniciar(),
   * core/tutorial.js) — nao so ao concluir. */
  ok("ja marcado como visto desde que o tutorial abriu", Tutorial.jaViu("exemplo"));

  overlay.$("#tut-proximo").click(); // "Concluir"
  ok("ao concluir o ultimo passo, o overlay fecha", !overlay.estaAberto());
}

/* --- voltar() --- */
{
  const { Tutorial } = carregar();
  Tutorial.registrar("nav", {
    titulo: "Navegação",
    passos: [{ titulo: "A" }, { titulo: "B" }, { titulo: "C" }],
  });
  const dock = dockFake();
  Tutorial.iniciar("nav", { dock: dock });
  const overlay = dock._overlays[0];

  overlay.$("#tut-proximo").click(); // A -> B
  overlay.$("#tut-proximo").click(); // B -> C
  ok("chegou no passo C", overlay.$("#tut-titulo-passo").textContent === "C");

  overlay.$("#tut-voltar").click(); // C -> B
  ok("voltar traz de volta para B", overlay.$("#tut-titulo-passo").textContent === "B");
}

/* --- pular / fechar marcam como visto sem completar --- */
{
  const { Tutorial } = carregar();
  Tutorial.registrar("pular-teste", {
    titulo: "Pular",
    passos: [{ titulo: "A" }, { titulo: "B" }, { titulo: "C" }],
  });
  const dock = dockFake();
  Tutorial.iniciar("pular-teste", { dock: dock });
  const overlay = dock._overlays[0];

  overlay.$("#tut-pular").click();
  ok("\"Pular tutorial\" fecha o overlay", !overlay.estaAberto());
  ok("\"Pular tutorial\" marca como visto mesmo sem chegar ao fim", Tutorial.jaViu("pular-teste"));
}

/* --- iniciarSePrimeiraVez(): o coracao do pedido (oferecer so 1x) --- */
{
  const { Tutorial } = carregar();
  Tutorial.registrar("primeira-vez", {
    titulo: "Primeira Vez",
    passos: [{ titulo: "Único passo" }],
  });

  ok("nunca visto: iniciarSePrimeiraVez abre e devolve true",
     Tutorial.iniciarSePrimeiraVez("primeira-vez", { dock: dockFake() }) === true);
  ok("depois de aberto uma vez, jaViu fica true (mesmo sem fechar)", Tutorial.jaViu("primeira-vez"));

  ok("segunda chamada NAO abre de novo (ja viu)",
     Tutorial.iniciarSePrimeiraVez("primeira-vez", { dock: dockFake() }) === false);

  ok("modulo sem roteiro registrado: iniciarSePrimeiraVez nunca quebra e devolve false",
     Tutorial.iniciarSePrimeiraVez("modulo-inexistente", { dock: dockFake() }) === false);

  /* Reabrir manualmente (botao "Ver tutorial" no painel da engrenagem)
   * continua funcionando depois de ja visto — "ja visto" so bloqueia a
   * OFERTA automatica, nunca o botao explicito. */
  ok("iniciar() direto continua funcionando depois de jaViu",
     Tutorial.iniciar("primeira-vez", { dock: dockFake() }) === true);
}

/* --- "ja visto" persiste no storage do nucleo, por modulo --- */
{
  const { Tutorial, armazenado } = carregar();
  Tutorial.registrar("m1", { titulo: "M1", passos: [{ titulo: "A" }] });
  Tutorial.registrar("m2", { titulo: "M2", passos: [{ titulo: "A" }] });

  Tutorial.iniciar("m1", { dock: dockFake() });
  ok("visto de m1 nao contamina m2", Tutorial.jaViu("m1") && !Tutorial.jaViu("m2"));
  ok("a chave gravada leva o id do modulo", armazenado.tutorial_visto_m1 === true);
  ok("m2 nao tem chave gravada nenhuma", armazenado.tutorial_visto_m2 === undefined);
}

/* ------------------------------------------------------------------
 * PASSO GUIADO (D65) — passo com `alvo`/`evento`, que espera uma acao
 * real em vez de um clique em "Proximo".
 * ------------------------------------------------------------------ */

/* --- alvo existe e visivel: destaca, espera o evento, avanca sozinho --- */
{
  const { Tutorial } = carregar();
  const alvo = elementoFake();
  Tutorial.registrar("guiado", {
    titulo: "Guiado",
    passos: [
      { titulo: "Intro", texto: "Antes de agir." },
      { titulo: "Aja", texto: "Clique ali.", alvo: () => alvo, evento: "click" },
      { titulo: "Fim", texto: "Acabou." },
    ],
  });
  const dock = dockFake();
  Tutorial.iniciar("guiado", { dock });
  const overlay = dock._overlays[0];
  ok("passo 1 (carrossel) abre o overlay normal", overlay.estaAberto());

  overlay.$("#tut-proximo").click(); // Intro -> Aja
  ok("passo guiado FECHA o overlay grande", !overlay.estaAberto());
  ok("um aviso foi criado para o passo guiado", dock._avisos.length === 1);
  ok("o alvo foi destacado", alvo.classList.contains("tut-alvo-destaque"));

  alvo.disparar("click"); // a ACAO REAL, nao um botao do tutorial
  ok("o aviso do passo guiado fechou sozinho", dock._avisos[0].fechado());
  ok("o destaque saiu do alvo", !alvo.classList.contains("tut-alvo-destaque"));
  ok("avancou para o passo seguinte (carrossel)", overlay.estaAberto() && overlay.$("#tut-titulo-passo").textContent === "Fim");
}

/* --- "Pular este passo" avanca sem o evento acontecer --- */
{
  const { Tutorial } = carregar();
  const alvo = elementoFake();
  Tutorial.registrar("guiado-pular", {
    titulo: "Guiado",
    passos: [
      { titulo: "Aja", texto: "Clique ali.", alvo: () => alvo, evento: "click" },
      { titulo: "Fim", texto: "Acabou." },
    ],
  });
  const dock = dockFake();
  Tutorial.iniciar("guiado-pular", { dock });

  const aviso = dock._avisos[0];
  const acaoPular = aviso.spec.acoes.find((a) => /pular/i.test(a.rotulo));
  ok("o aviso do passo guiado oferece \"Pular este passo\"", !!acaoPular);
  acaoPular.aoClicar();

  const overlay = dock._overlays[0];
  ok("pular o passo guiado avanca para o proximo (carrossel)",
     overlay.estaAberto() && overlay.$("#tut-titulo-passo").textContent === "Fim");
}

/* --- alvo nao existe (ou invisivel): nunca trava, o aviso ainda aparece --- */
{
  const { Tutorial } = carregar();
  Tutorial.registrar("guiado-sem-alvo", {
    titulo: "Guiado",
    passos: [{ titulo: "Aja", texto: "Nao vai achar.", alvo: () => null, evento: "click" }],
  });
  const dock = dockFake();
  const abriu = Tutorial.iniciar("guiado-sem-alvo", { dock });
  ok("iniciar() com passo guiado sem alvo nao quebra", abriu === true);
  ok("mesmo sem alvo, o aviso aparece (\"Pular este passo\" e a saida)", dock._avisos.length === 1);

  const invisivel = elementoFake({ invisivel: true });
  Tutorial.registrar("guiado-invisivel", {
    titulo: "Guiado",
    passos: [{ titulo: "Aja", texto: "Esta la mas escondido.", alvo: () => invisivel, evento: "click" }],
  });
  const dock2 = dockFake();
  Tutorial.iniciar("guiado-invisivel", { dock: dock2 });
  ok("alvo com offsetParent null (escondido) nao ganha destaque",
     !invisivel.classList.contains("tut-alvo-destaque"));
}

/* --- roteiro comecando JA num passo guiado: nao deixa o overlay grande
 *     vazio aberto por cima --- */
{
  const { Tutorial } = carregar();
  const alvo = elementoFake();
  Tutorial.registrar("comeca-guiado", {
    titulo: "Guiado",
    passos: [{ titulo: "Aja", texto: "Primeiro passo ja e guiado.", alvo: () => alvo, evento: "click" }],
  });
  const dock = dockFake();
  Tutorial.iniciar("comeca-guiado", { dock });
  const overlay = dock._overlays[0];
  ok("comecar direto num passo guiado NAO abre o overlay do carrossel", !overlay.estaAberto());
  ok("mas ja destaca o alvo", alvo.classList.contains("tut-alvo-destaque"));

  // limpa o vigia (setInterval real) que este passo guiado deixou
  // armado — senao o processo do teste nunca fecha sozinho.
  alvo.disparar("click");
}

/* --- vigia: alvo desconecta no meio do passo (medico fechou o modulo) ---
 * Usa o setInterval DE VERDADE do vigia (a suite roda em Node, entao
 * espera 600ms reais em vez de mockar o relogio — mais simples e ainda
 * rapido o bastante para um teste). Fica por ultimo e assincrono porque
 * e o unico caso que precisa de tempo real passando. */
(async function () {
  const { Tutorial } = carregar();
  const alvo = elementoFake();
  Tutorial.registrar("guiado-desconecta", {
    titulo: "Guiado",
    passos: [
      { titulo: "Aja", texto: "Clique ali.", alvo: () => alvo, evento: "click" },
      { titulo: "Fim", texto: "Acabou." },
    ],
  });
  const dock = dockFake();
  Tutorial.iniciar("guiado-desconecta", { dock });
  ok("destacado enquanto conectado", alvo.classList.contains("tut-alvo-destaque"));

  alvo.isConnected = false; // o medico fechou o overlay do proprio modulo
  await new Promise((resolve) => setTimeout(resolve, 650));

  const overlay = dock._overlays[0];
  ok("o vigia detecta o alvo desconectado e segue em frente sozinho",
     overlay.estaAberto() && overlay.$("#tut-titulo-passo").textContent === "Fim");
  ok("o destaque nao fica orfao", !alvo.classList.contains("tut-alvo-destaque"));

  console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
  if (falhas) process.exit(1);
})();
