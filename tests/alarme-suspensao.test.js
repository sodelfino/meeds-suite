/* ------------------------------------------------------------------
 * tests/alarme-suspensao.test.js — o aviso de "o alarme ficou parado"
 * ------------------------------------------------------------------
 * O DEFEITO QUE ORIGINOU ESTE ARQUIVO
 * Quando o navegador suspende a aba de fundo (o Edge faz de fabrica), o
 * modulo avisa que houve um periodo sem vigilancia. Ate a v2.43.2 cada
 * despertar criava um cartao NOVO, com `autoFecharMs: 0` — nenhum sumia
 * sozinho. Numa aba de fundo o navegador suspende repetidamente, e um
 * plantao noturno terminava com seis, sete cartoes identicos empilhados
 * cobrindo a tela, todos exigindo fechamento manual. O medico mandou o
 * print.
 *
 * O QUE ESTE TESTE GARANTE, PARA SEMPRE
 *   1. UM cartao, nao um por acordada — repeticao atualiza o que ja
 *      esta na tela (o dock tem `atualizar()` exatamente para isso);
 *   2. o cartao SEMPRE tem prazo de validade: `autoFecharMs > 0`. Este
 *      e o requisito literal do pedido ("tem que ser temporaria e sumir
 *      sozinha") e o que o defeito violava;
 *   3. a repeticao e informativa: conta as vezes e o total de minutos,
 *      em vez de repetir a mesma frase;
 *   4. depois que o cartao sumiu, a contagem recomeca — senao o numero
 *      cresceria pelo plantao inteiro e deixaria de dizer algo util;
 *   5. desligar o modulo (stop) nao deixa o cartao orfao na tela.
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

/* Fake de criarAviso que implementa o CONTRATO REAL do handle do dock
 * (ver core/dock.js): atualizar() re-renderiza, volta o cartao para o
 * fim da pilha e REINICIA o relogio de fechamento; estaVisivel() diz se
 * ainda esta no DOM; o relogio de verdade remove o elemento. Sem imitar
 * isso, o teste nao provaria nada sobre empilhamento. */
function criarDockFalso() {
  const avisos = []; // todo cartao jamais criado, para contar empilhamento

  function criarAviso(spec) {
    const cartao = {
      spec: spec,
      visivel: true,
      atualizacoes: 0,
      handle: null,
    };
    cartao.handle = {
      atualizar: function (novo) {
        cartao.spec = Object.assign({}, cartao.spec, novo || {});
        cartao.atualizacoes += 1;
      },
      fechar: function () {
        cartao.visivel = false;
      },
      estaVisivel: function () {
        return cartao.visivel;
      },
    };
    avisos.push(cartao);
    return cartao.handle;
  }

  return {
    criarAviso: criarAviso,
    _avisos: avisos,
    _visiveis: function () {
      return avisos.filter(function (a) {
        return a.visivel;
      });
    },
  };
}

function carregar() {
  let definicao = null;
  const dockFalso = criarDockFalso();

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
    MeedsSuite: { registerModule: (dd) => { definicao = dd; } },
    MeedsSuiteCabecalho: { CSS: "", html: function () { return ""; } },
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
    dock: Object.assign(
      {
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
      },
      dockFalso
    ),
    aoClicarBotao() {}, aoAbrirAjustes() {}, botao: null,
  });

  return { api: definicao, dock: dockFalso };
}

/* Texto de todas as linhas do corpo, junto — o corpo e um array de
 * linhas (o dock transforma cada uma em <br>). */
function textoDoCorpo(cartao) {
  const c = cartao.spec.corpo;
  return (Array.isArray(c) ? c : [c]).join(" ");
}

/* ------------------------------------------------------------------
 * 1. O DEFEITO, direto: tres suspensoes seguidas nao podem virar tres
 *    cartoes na tela. Antes desta versao, viravam.
 * ------------------------------------------------------------------ */
{
  const { api, dock } = carregar();
  api._relatarSuspensao(13);
  api._relatarSuspensao(32);
  api._relatarSuspensao(16);

  ok(
    "tres suspensoes criam UM cartao, nao tres",
    dock._avisos.length === 1,
    dock._avisos.length + " cartao(oes) criado(s)"
  );
  ok(
    "e so um fica visivel na tela",
    dock._visiveis().length === 1,
    dock._visiveis().length + " visivel(eis)"
  );
  ok(
    "as duas repeticoes atualizaram o cartao existente",
    dock._avisos[0].atualizacoes === 2,
    dock._avisos[0].atualizacoes + " atualizacao(oes)"
  );
}

/* ------------------------------------------------------------------
 * 2. O REQUISITO LITERAL: o cartao tem prazo e sai sozinho. Era
 *    `autoFecharMs: 0` (permanente) — o que o medico reportou.
 * ------------------------------------------------------------------ */
{
  const { api, dock } = carregar();
  api._relatarSuspensao(13);
  const ms = dock._avisos[0].spec.autoFecharMs;
  ok("o cartao nasce com prazo de fechamento (autoFecharMs > 0)", ms > 0, "autoFecharMs = " + ms);
  ok(
    "e o prazo da tempo de ler um texto longo (>= 20 s)",
    ms >= 20000,
    ms / 1000 + " s"
  );

  api._relatarSuspensao(9);
  ok(
    "a repeticao REINICIA o prazo em vez de deixar permanente",
    dock._avisos[0].spec.autoFecharMs > 0,
    "autoFecharMs = " + dock._avisos[0].spec.autoFecharMs
  );
}

/* ------------------------------------------------------------------
 * 3. A repeticao informa, nao repete: conta as vezes e o total.
 * ------------------------------------------------------------------ */
{
  const { api, dock } = carregar();

  api._relatarSuspensao(13);
  const primeiro = textoDoCorpo(dock._avisos[0]);
  ok("a primeira vez fala do periodo em minutos", /13 min/.test(primeiro), primeiro.slice(0, 70));
  ok("a primeira vez NAO fala de repeticao", !/vezes/.test(primeiro));

  api._relatarSuspensao(32);
  const segundo = textoDoCorpo(dock._avisos[0]);
  ok("a segunda vez diz quantas vezes ja aconteceu", /2 vezes/.test(segundo), segundo.slice(0, 90));
  ok("a segunda vez soma o total de minutos sem vigilancia", /45 min/.test(segundo), "13 + 32 = 45");

  api._relatarSuspensao(16);
  const terceiro = textoDoCorpo(dock._avisos[0]);
  ok("a terceira vez atualiza a contagem", /3 vezes/.test(terceiro), terceiro.slice(0, 90));
  ok("e o total acompanha", /61 min/.test(terceiro), "13 + 32 + 16 = 61");

  ok(
    "a orientacao de como evitar continua no texto",
    /suspens/i.test(terceiro) && /meeds\.com\.br/.test(terceiro)
  );
  ok("e continua pedindo para conferir a fila", /Confira a fila/.test(terceiro));
}

/* ------------------------------------------------------------------
 * 4. Depois que o cartao sumiu (prazo venceu, ou o medico fechou), a
 *    contagem recomeca — senao "23 vezes" nao diria desde quando.
 * ------------------------------------------------------------------ */
{
  const { api, dock } = carregar();
  api._relatarSuspensao(13);
  api._relatarSuspensao(32);
  ok("antes de fechar: conta 2", /2 vezes/.test(textoDoCorpo(dock._avisos[0])));

  dock._avisos[0].handle.fechar(); // simula o prazo vencendo na tela

  api._relatarSuspensao(7);
  ok(
    "cartao novo depois que o antigo sumiu",
    dock._avisos.length === 2,
    dock._avisos.length + " cartao(oes)"
  );
  const novo = textoDoCorpo(dock._avisos[1]);
  ok("a contagem recomecou (nao diz '3 vezes')", !/vezes/.test(novo), novo.slice(0, 70));
  ok("e o total tambem recomecou (7 min, nao 52)", /7 min/.test(novo) && !/52 min/.test(novo));
  ok("so um cartao visivel, ainda", dock._visiveis().length === 1);
}

/* ------------------------------------------------------------------
 * 5. Desligar o modulo nao deixa cartao orfao: ninguem mais vai
 *    atualiza-lo nem fecha-lo.
 * ------------------------------------------------------------------ */
{
  const { api, dock } = carregar();
  api._relatarSuspensao(13);
  ok("cartao na tela antes do stop", dock._visiveis().length === 1);

  api.stop();
  ok("stop() fecha o cartao de suspensao", dock._visiveis().length === 0);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
