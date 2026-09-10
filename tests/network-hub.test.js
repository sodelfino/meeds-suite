/* ------------------------------------------------------------------
 * tests/network-hub.test.js — core/network-hub.js
 * ------------------------------------------------------------------
 * O hub e a peca mais privilegiada da suite: ele embrulha fetch e XHR
 * da pagina do Meeds inteira. As garantias que ele DA aos modulos
 * (cabecalho do arquivo) sao o que impede esse poder de virar bug ou
 * vazamento. Ate a v2.38.0 elas so eram exercidas de longe, pelo
 * smoke.html manual.
 *
 * Provado abaixo:
 *   1. sem assinante interessado, o corpo da resposta NAO e lido
 *      (nem um .clone());
 *   2. a Promise/Response que a aplicacao recebe volta intacta —
 *      a aplicacao ainda consegue ler o corpo;
 *   3. um assinante que lanca excecao nao derruba os outros nem a
 *      chamada da pagina;
 *   4. json() faz o parse uma vez so (preguicoso e memoizado);
 *   5. cancelar() e cancelarPorModulo() removem a assinatura;
 *   6. o filtro de metodo funciona;
 *   7. instalar() e idempotente;
 *   8. o mesmo, pelo caminho do XMLHttpRequest.
 * ------------------------------------------------------------------ */
const fs = require("fs");
const vm = require("vm");

let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}
const tick = () => new Promise((r) => setImmediate(() => setImmediate(r)));

/* Response de mentira: conta quantas vezes foi clonada e lida. */
function fakeResponse(corpo, status) {
  status = status === undefined ? 200 : status;
  const self = {
    ok: status >= 200 && status < 300,
    status: status,
    _clones: 0,
    _leituras: 0,
    clone() {
      self._clones++;
      const c = fakeResponse(corpo, status);
      c._pai = self;
      return c;
    },
    text() {
      self._leituras++;
      if (self._pai) self._pai._leituras++;
      return Promise.resolve(corpo);
    },
  };
  return self;
}

/* Uma classe XHR NOVA por ambiente: o hub muta XMLHttpRequest.prototype,
 * e um prototype compartilhado entre contextos empilharia os wrappers de
 * um teste no outro. */
function novoFakeXHR() {
  function FakeXHR() {
    this._ouvintes = {};
    this.status = 0;
    this.responseText = "";
  }
  FakeXHR.prototype.open = function (m, u) { this._m = m; this._u = u; };
  FakeXHR.prototype.send = function () { this._enviado = true; };
  FakeXHR.prototype.addEventListener = function (ev, fn) {
    (this._ouvintes[ev] = this._ouvintes[ev] || []).push(fn);
  };
  FakeXHR.prototype._fire = function (ev) {
    (this._ouvintes[ev] || []).slice().forEach((fn) => fn.call(this));
  };
  return FakeXHR;
}

function ambiente(opts) {
  opts = opts || {};
  let proxResposta = null;
  const ctx = {
    setImmediate, setTimeout, clearTimeout, Promise, JSON, String, Object, Array,
    /* teste 3 espera um assinante que lanca: o warn do hub e o
     * comportamento correto, so nao precisa poluir a saida do suite. */
    console: opts.silencioso ? Object.assign({}, console, { warn() {} }) : console,
    XMLHttpRequest: novoFakeXHR(),
    fetch: function (input, init) {
      const r = proxResposta || fakeResponse("{}", 200);
      return Promise.resolve(r);
    },
    _definirResposta: (r) => { proxResposta = r; },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("core/network-hub.js", "utf8"), ctx);
  return ctx;
}

const RX = /\/api\/v1\/Atendimento/;

/* 1. instalar() idempotente */
(async () => {
  const c = ambiente();
  const N = c.MeedsSuiteNetwork;
  ok("antes de instalar, estaInstalado() = false", N.estaInstalado() === false);
  N.instalar();
  const fetchDepois1 = c.fetch;
  N.instalar();
  ok("depois de instalar, estaInstalado() = true", N.estaInstalado() === true);
  ok("segundo instalar() nao re-embrulha o fetch", c.fetch === fetchDepois1);

  /* 2. sem assinante: o corpo NAO e lido */
  {
    const resp = fakeResponse(JSON.stringify({ data: [1, 2] }), 200);
    c._definirResposta(resp);
    const devolvida = await c.fetch("https://x/api/v1/Atendimento");
    await tick();
    ok("sem assinante, nao clonou a resposta", resp._clones === 0, "clones=" + resp._clones);
    ok("sem assinante, nao leu o corpo", resp._leituras === 0, "leituras=" + resp._leituras);
    ok("a aplicacao recebe a MESMA Response", devolvida === resp);
    const lidoPelaApp = await devolvida.text();
    ok("e a aplicacao ainda consegue ler o corpo", lidoPelaApp === JSON.stringify({ data: [1, 2] }));
  }

  /* 3. assinante recebe o evento; corpo e json() */
  {
    let recebido = null;
    N.assinar({ regex: RX }, (ev) => { recebido = ev; });
    const resp = fakeResponse(JSON.stringify({ fila: 3 }), 200);
    c._definirResposta(resp);
    await c.fetch("https://api-calltech.meeds.com.br/api/v1/Atendimento?take=50");
    await tick();
    ok("o assinante foi chamado", recebido !== null);
    ok("o evento traz a url", recebido && /Atendimento/.test(recebido.url));
    ok("o evento traz o metodo GET", recebido && recebido.metodo === "GET");
    ok("o evento traz o status", recebido && recebido.status === 200);
    ok("ev.corpo e o texto cru", recebido && recebido.corpo === JSON.stringify({ fila: 3 }));
    ok("ev.json() faz o parse", recebido && recebido.json().fila === 3);
    ok("ev.json() memoiza (mesma identidade)", recebido && recebido.json() === recebido.json());
    ok("com 1 assinante, clonou 1 vez so", resp._clones === 1, "clones=" + resp._clones);
  }
})()
  /* 4. assinante que lanca nao derruba os outros nem a pagina */
  .then(async () => {
    const c = ambiente({ silencioso: true });
    const N = c.MeedsSuiteNetwork;
    N.instalar();
    let bomFoiChamado = false;
    N.assinar({ regex: RX }, () => { throw new Error("assinante quebrado"); });
    N.assinar({ regex: RX }, () => { bomFoiChamado = true; });
    const resp = fakeResponse("{}", 200);
    c._definirResposta(resp);
    let promResolveu = false;
    await c.fetch("https://x/api/v1/Atendimento").then(() => { promResolveu = true; });
    await tick();
    ok("assinante que lanca nao impede o outro", bomFoiChamado === true);
    ok("assinante que lanca nao rejeita a Promise da pagina", promResolveu === true);
  })
  /* 5. cancelar() e cancelarPorModulo() */
  .then(async () => {
    const c = ambiente();
    const N = c.MeedsSuiteNetwork;
    N.instalar();
    let n = 0;
    const cancelar = N.assinar({ regex: RX }, () => { n++; });
    c._definirResposta(fakeResponse("{}", 200));
    await c.fetch("https://x/api/v1/Atendimento");
    await tick();
    cancelar();
    await c.fetch("https://x/api/v1/Atendimento");
    await tick();
    ok("cancelar() para de entregar", n === 1, "n=" + n);

    let m = 0;
    N.assinar({ regex: RX, idModulo: "alarme-fila" }, () => { m++; });
    N.cancelarPorModulo("alarme-fila");
    c._definirResposta(fakeResponse("{}", 200));
    await c.fetch("https://x/api/v1/Atendimento");
    await tick();
    ok("cancelarPorModulo() remove a assinatura do modulo", m === 0, "m=" + m);
  })
  /* 6. filtro de metodo */
  .then(async () => {
    const c = ambiente();
    const N = c.MeedsSuiteNetwork;
    N.instalar();
    let so_post = 0;
    N.assinar({ regex: RX, metodos: ["POST"] }, () => { so_post++; });
    c._definirResposta(fakeResponse("{}", 200));
    await c.fetch("https://x/api/v1/Atendimento"); // GET
    await tick();
    ok("assinante de POST ignora GET", so_post === 0, "so_post=" + so_post);
    await c.fetch("https://x/api/v1/Atendimento", { method: "POST" });
    await tick();
    ok("assinante de POST recebe POST", so_post === 1, "so_post=" + so_post);
  })
  /* 7. resposta nao-ok nao e lida */
  .then(async () => {
    const c = ambiente();
    const N = c.MeedsSuiteNetwork;
    N.instalar();
    let chamou = false;
    N.assinar({ regex: RX }, () => { chamou = true; });
    const resp = fakeResponse("erro", 500);
    c._definirResposta(resp);
    await c.fetch("https://x/api/v1/Atendimento");
    await tick();
    ok("resposta 500 nao e entregue ao assinante", chamou === false);
    ok("resposta 500 nao e clonada", resp._clones === 0);
  })
  /* 8. caminho do XMLHttpRequest */
  .then(async () => {
    const c = ambiente();
    const N = c.MeedsSuiteNetwork;
    N.instalar();
    const eventos = [];
    N.assinar({ regex: /Atendimento/g }, (ev) => eventos.push(ev));

    function chamarXHR(url, corpo) {
      const x = new c.XMLHttpRequest();
      x.open("GET", url);
      x.send();
      x.status = 200;
      x.responseText = corpo;
      x._fire("load");
    }
    chamarXHR("https://x/api/v1/Atendimento", JSON.stringify({ a: 1 }));
    chamarXHR("https://x/api/v1/Atendimento", JSON.stringify({ a: 2 }));
    await tick();
    ok("XHR: os dois eventos chegaram (regex /g nao perde o 2o)", eventos.length === 2, "n=" + eventos.length);
    ok("XHR: o corpo veio no evento", eventos[0] && eventos[0].json().a === 1);

    /* uma URL que nenhum assinante quer nao gera evento */
    const antes = eventos.length;
    chamarXHR("https://x/api/v1/OutraCoisa", "{}");
    await tick();
    ok("XHR: URL sem assinante nao gera evento", eventos.length === antes);

    console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\ntodos passaram");
    process.exit(falhas ? 1 : 0);
  });
