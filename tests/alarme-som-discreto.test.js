/* ------------------------------------------------------------------
 * tests/alarme-som-discreto.test.js — modo Discreto toca o som DUAS vezes
 * ------------------------------------------------------------------
 * Pedido do medico: no modo 🔉 Discreto, uma sirene curta so uma vez
 * passava despercebida num plantao barulhento. Este teste garante:
 *
 *   1. duas chamadas de som por chegada, nao uma;
 *   2. espacadas pelo intervaloMs PROPRIO do som escolhido (o mesmo
 *      campo que o modo Completo ja usa para repetir a sirene) — nao um
 *      numero inventado;
 *   3. os outros dois modos NAO mudam: Completo continua repetindo ate
 *      silenciar, Silencioso continua mudo;
 *   4. silenciar (ou desligar o modulo) ENTRE a primeira e a segunda
 *      batida cancela a segunda — senao o medico ouviria o alarme
 *      "voltar" depois de calado, o que pareceria um defeito novo.
 * ------------------------------------------------------------------ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs !== undefined ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}

const RAIZ = path.join(__dirname, "..");

/* setTimeout/setInterval de mentira: guardam fn+atraso para o teste
 * disparar na hora que quiser, sem esperar de verdade — mesmo padrao de
 * tests/alarme-suspensao.test.js e tests/noturno.test.js. */
function carregar(configExtra) {
  let definicao = null;
  const timeouts = [];
  let proximoId = 1;

  const ctx = {
    console: { debug() {}, warn() {}, log() {} },
    Promise, Date, Math, JSON, Map, Set, Object, Array, String, Number, parseInt, isNaN,
    setInterval: () => proximoId++,
    clearInterval: () => {},
    setTimeout: function (fn, atraso) {
      const id = proximoId++;
      timeouts.push({ id, fn, atraso, cancelado: false });
      return id;
    },
    clearTimeout: function (id) {
      const t = timeouts.find((x) => x.id === id);
      if (t) t.cancelado = true;
    },
    document: {
      addEventListener() {}, removeEventListener() {},
      querySelectorAll: () => [], querySelector: () => null,
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }),
      visibilityState: "visible",
      hasFocus: () => true,
    },
    MutationObserver: function () { this.observe = function () {}; this.disconnect = function () {}; },
    MeedsSuite: { registerModule: (d) => { definicao = d; } },
    MeedsSuiteCabecalho: { CSS: "", html: function () { return ""; } },
    /* sem AudioContext de proposito: tocarSomAtual cai no try/catch e
     * nao toca nada de verdade — o teste confere so O PEDIDO de tocar
     * (ver chamadasDeSomParaTeste em modules/alarme-fila/index.js),
     * nunca o audio em si (isso ja e coberto por tests/som.test.js). */
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.addEventListener = function () {};
  ctx.removeEventListener = function () {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "modules/alarme-fila/index.js"), "utf8"), ctx);

  definicao.start({
    config: Object.assign(
      { ativo: true, modo: "imediato", tempoEsperaMin: 5, som: "sirene-classica", somCurto: "toque-duplo", volume: 50, intensidade: "discreto" },
      configExtra || {}
    ),
    storage: { gravarConfig() {} },
    decisao: { criarDecisor: () => ({ votar() {}, decidir: () => null }) },
    dom: { lerContadorPorRotulo: () => null },
    seletor: () => [],
    dock: {
      criarBanner: () => ({
        elemento: { addEventListener() {} },
        $: () => ({ addEventListener() {}, textContent: "" }),
        mostrar() {}, esconder() {}, remover() {},
      }),
      criarMolduraAlerta: () => ({ mostrar() {}, esconder() {}, remover() {} }),
      criarOverlay: () => ({
        $: () => ({ addEventListener() {}, appendChild() {}, value: "", textContent: "", checked: false, hidden: true }),
        $$: () => [],
        abrir() {}, fechar() {}, remover() {}, estaAberto: () => false,
      }),
      criarAviso: () => ({ atualizar() {}, fechar() {}, estaVisivel: () => true }),
    },
    aoClicarBotao() {}, aoAbrirAjustes() {}, botao: null,
  });

  return { api: definicao, timeouts };
}

/* ------------------------------------------------------------------
 * 1. O PEDIDO: discreto toca duas vezes, nao uma.
 * ------------------------------------------------------------------ */
{
  const { api, timeouts } = carregar();
  api._dispararAlarme();

  const antes = api._chamadasDeSom();
  ok("uma chamada IMEDIATA ao disparar", antes.length === 1, antes.length);
  ok("e e do som curto (modo discreto)", antes[0] && antes[0].curto === true);

  const pendente = timeouts.find((t) => !t.cancelado);
  ok("ha um segundo toque AGENDADO, nao tocado ainda", !!pendente);

  pendente.fn(); // simula o tempo passando
  const depois = api._chamadasDeSom();
  ok("depois do agendado disparar: exatamente DUAS chamadas", depois.length === 2, depois.length);
  ok("a segunda tambem e som curto", depois[1] && depois[1].curto === true);
}

/* ------------------------------------------------------------------
 * 2. O ESPACAMENTO vem do intervaloMs do PROPRIO som (toque-duplo =
 *    1200ms por padrao) — nao um numero arbitrario novo no modulo.
 * ------------------------------------------------------------------ */
{
  const { api, timeouts } = carregar();
  api._dispararAlarme();
  const pendente = timeouts.find((t) => !t.cancelado);
  ok("o atraso do segundo toque e o intervaloMs do som escolhido (1200ms para toque-duplo)", pendente.atraso === 1200, pendente.atraso);
}
{
  // troca o som curto para "gota" (intervaloMs: 900) e confere que o
  // atraso acompanha — prova que nao esta fixo em 1200
  const { api, timeouts } = carregar({ somCurto: "gota" });
  api._dispararAlarme();
  const pendente = timeouts.find((t) => !t.cancelado);
  ok("com outro som curto (gota, 900ms), o atraso muda junto", pendente.atraso === 900, pendente.atraso);
}

/* ------------------------------------------------------------------
 * 3. Os outros dois modos nao mudam.
 * ------------------------------------------------------------------ */
{
  const { api, timeouts } = carregar({ intensidade: "silencioso" });
  api._dispararAlarme();
  ok("silencioso: nenhuma chamada de som", api._chamadasDeSom().length === 0);
  ok("e nenhum timeout de repique agendado", timeouts.filter((t) => !t.cancelado).length === 0);
}
{
  const { api, timeouts } = carregar({ intensidade: "completo" });
  api._dispararAlarme();
  const chamadas = api._chamadasDeSom();
  ok("completo: toca imediatamente, e NAO curto (e a sirene que repete)", chamadas.length === 1 && chamadas[0].curto === false);
  // o modo completo repete via setInterval (id fixo de mentira aqui), nao
  // cria o timeout de repique do modo discreto
  const pendenteCurto = timeouts.find((t) => !t.cancelado && t.atraso < 5000 && t.atraso > 0);
  ok("completo nao agenda o repique de 'curto' (mecanismo e outro)", !pendenteCurto);
}

/* ------------------------------------------------------------------
 * 4. Silenciar entre a primeira e a segunda batida cancela a segunda.
 * ------------------------------------------------------------------ */
{
  const { api, timeouts } = carregar();
  api._dispararAlarme();
  ok("uma chamada ate aqui", api._chamadasDeSom().length === 1);

  api.stop(); // desliga o modulo entre as duas batidas

  const pendente = timeouts.find((t) => t.atraso === 1200);
  ok("o timeout do repique foi cancelado pelo stop()", pendente && pendente.cancelado === true);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
