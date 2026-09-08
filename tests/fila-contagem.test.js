/* ------------------------------------------------------------------
 * tests/fila-contagem.test.js — quantos estao esperando, de verdade
 * ------------------------------------------------------------------
 * ESTE TESTE NASCEU DE UM DEFEITO EM PRODUCAO. O contador da aba
 * mostrava um numero diferente do total da fila, e a tela onde isso
 * aparecia era a de monitoramento do administrador — a que tem varias
 * abas de fila e varios filtros de periodo.
 *
 * Eram tres causas somadas:
 *   1. o mesmo paciente aparece em mais de uma "vista" da fila, e as
 *      vistas eram SOMADAS: a mesma pessoa contava duas, tres vezes;
 *   2. cada filtro de periodo abre uma assinatura nova, e as antigas
 *      nunca eram esquecidas — o numero so crescia;
 *   3. o numero que o medico ve e o do cartao "Aguardando" da tela, e
 *      ele era ignorado na hora de contar.
 *
 * Um alarme que discorda do numero na frente do medico perde a
 * confianca dele inteira, e um alarme em que ele nao confia e um alarme
 * desligado. Por isso estes casos ficam fixados aqui.
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

function carregar() {
  let definicao = null;
  const ctx = {
    console: { debug() {}, warn() {}, log() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, Date, Math, JSON, Map, Set, Object, Array, String, Number, parseInt, isNaN,
    document: {
      addEventListener() {}, removeEventListener() {},
      querySelectorAll: () => [], querySelector: () => null,
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }),
      visibilityState: "visible",
      hasFocus: () => true,
    },
    MutationObserver: function () { this.observe = function () {}; this.disconnect = function () {}; },
    MeedsSuite: { registerModule: (d) => { definicao = d; } },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.addEventListener = function () {};
  ctx.removeEventListener = function () {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "modules/alarme-fila/index.js"), "utf8"), ctx);

  definicao.start({
    config: { ativo: true, modo: "imediato", tempoEsperaMin: 5, som: "sirene-classica", volume: 0 },
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
      criarAviso: () => ({ fechar() {} }),
    },
    aoClicarBotao() {}, aoAbrirAjustes() {}, botao: null,
  });
  return definicao;
}

/* Uma "vista" da fila: /api/v1/Atendimento?StatusAtendimentoId=2 com os
 * filtros daquela aba. A tela de monitoramento gera varias. */
const vista = (filtro) =>
  "https://api-calltech.meeds.com.br/api/v1/Atendimento?StatusAtendimentoId=2&" + filtro;
const corpo = (ids) => ({ data: ids.map((id) => ({ id: id })) });

/* 1. O DEFEITO: o mesmo paciente em duas vistas conta UMA vez. */
{
  const m = carregar();
  m._lerRespostaDeFila(vista("periodo=hoje"), corpo(["A", "B"]));
  m._lerRespostaDeFila(vista("periodo=ontem"), corpo(["A", "B"]));
  const r = m._resumoDaFila();
  ok("mesmo paciente em duas vistas conta UMA vez", r.porRede === 2, r.porRede + " (somando daria 4)");
}

{
  const m = carregar();
  m._lerRespostaDeFila(vista("aba=aguardando"), corpo(["A", "B"]));
  m._lerRespostaDeFila(vista("aba=todas"), corpo(["A", "B", "C"]));
  ok("vistas que se sobrepoem viram a uniao", m._resumoDaFila().porRede === 3, m._resumoDaFila().porRede);
}

/* 2. Assinatura abandonada nao pode somar para sempre. Trocar de filtro
 *    de periodo cria assinatura nova; a antiga tem que expirar. */
{
  const m = carregar();
  const relogio = Date.now;
  let desloc = 0;
  Date.now = () => relogio.call(Date) + desloc;

  m._lerRespostaDeFila(vista("periodo=30dias"), corpo(["X", "Y", "Z"]));
  ok("a vista recem-lida conta", m._resumoDaFila().porRede === 3, m._resumoDaFila().porRede);

  desloc = 3 * 60 * 1000; // o medico trocou de aba ha 3 min
  m._lerRespostaDeFila(vista("periodo=hoje"), corpo(["A"]));
  ok("vista abandonada e esquecida", m._resumoDaFila().porRede === 1,
     m._resumoDaFila().porRede + " (sem expirar daria 4)");

  Date.now = relogio;
}

/* 3. O cartao "Aguardando" da tela MANDA. Se a rede e a tela
 *    discordarem, quem ganha e o numero que o medico esta lendo. */
{
  const m = carregar();
  m._lerRespostaDeFila(vista("aba=todas"), corpo(["A", "B", "C", "D"]));
  m._definirContadorDaTela(2);
  const r = m._resumoDaFila();
  ok("o cartao da tela manda no numero exibido", r.quantos === 2, "quantos=" + r.quantos + " porRede=" + r.porRede);
  ok("mas a leitura de rede continua disponivel", r.porRede === 4, r.porRede);
}

{
  const m = carregar();
  m._lerRespostaDeFila(vista("aba=todas"), corpo(["A", "B"]));
  m._definirContadorDaTela(null); // fora do Pronto Atendimento
  ok("sem o cartao na tela, vale a rede", m._resumoDaFila().quantos === 2, m._resumoDaFila().quantos);
}

/* 4. Nao inventar fila onde nao ha. */
{
  const m = carregar();
  ok("sem nenhuma leitura, zero", m._resumoDaFila().quantos === 0);
  m._lerRespostaDeFila(vista("aba=todas"), corpo([]));
  ok("resposta vazia continua zero", m._resumoDaFila().quantos === 0, m._resumoDaFila().quantos);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
