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
 * ref (textContent, style.width, hidden, addEventListener/click). */
function elementoFake() {
  var handlers = {};
  return {
    textContent: "",
    hidden: false,
    style: {},
    addEventListener: function (evt, fn) {
      handlers[evt] = fn;
    },
    click: function () {
      if (handlers.click) handlers.click();
    },
  };
}

/* Duble de `dock`: criarOverlay() extrai os ids do HTML (regex, so o
 * suficiente para os seletores que tutorial.js usa: #id ou .tut-fechar)
 * e devolve um overlay fake com os mesmos metodos do real
 * (core/dock.js): $, abrir, fechar, estaAberto. */
function dockFake() {
  var overlays = [];
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
    _overlays: overlays,
  };
}

function carregar() {
  var armazenado = {};
  var ctx = {
    console: { debug() {}, warn() {}, log() {} },
    setTimeout, clearTimeout, Promise, Date, Math, JSON, Object, Array, String,
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

console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
if (falhas) process.exit(1);
