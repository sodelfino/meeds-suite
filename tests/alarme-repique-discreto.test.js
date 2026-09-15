/* ------------------------------------------------------------------
 * tests/alarme-repique-discreto.test.js — modo Discreto lembra de novo
 * a cada 2 min, se o paciente continuar esperando
 * ------------------------------------------------------------------
 * Pedido do medico: o modo 🔉 Discreto tocava (as duas batidas) uma vez
 * so, e nunca mais — mesmo que o paciente continuasse esperando o
 * plantao inteiro. Agora, a cada 2 min, confere se ainda ha alguem na
 * fila e se a intensidade continua Discreto; se as duas continuarem
 * verdade, dispara de novo (cartao + duas batidas) e agenda a proxima
 * checagem — sem limite de repeticoes (um alarme que desiste sozinho
 * pode deixar um paciente esperando sem ninguem saber).
 *
 * NOTA: a segunda batida de CADA disparo (o "toque duplo") ja e coberta
 * por tests/alarme-som-discreto.test.js. Aqui o foco e so o repique de
 * 2 min — por isso as contagens abaixo olham a chamada IMEDIATA de cada
 * disparo (uma por disparo), nao as duas batidas de cada um.
 *
 * O QUE ESTE TESTE GARANTE
 *   1. o primeiro disparo em Discreto ja agenda a checagem de 2 min;
 *   2. se ainda ha alguem esperando, dispara de novo e reagenda — a
 *      corrente se sustenta sozinha;
 *   3. se o paciente ja saiu da fila, NAO dispara de novo;
 *   4. se o medico trocou para Completo/Silencioso nesse meio-tempo,
 *      NAO dispara de novo — mesmo com o paciente ainda esperando;
 *   5. Completo e Silencioso nunca agendam este repique (e coisa do
 *      Discreto);
 *   6. desligar o modulo (stop) cancela o repique pendente.
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
const INTERVALO_REPIQUE_MS = 2 * 60000;

/* Decisor controlavel: o teste diz, a qualquer momento, se "tem gente
 * esperando" ou nao — sem precisar simular DOM nem rede de verdade. */
function criarDecisorControlavel(temGenteInicialmente) {
  let temGente = temGenteInicialmente;
  return {
    votar() {},
    decidir: () => ({ decidiu: true, valor: temGente }),
    _definir: (v) => { temGente = v; },
  };
}

function carregar(configExtra, temGenteInicialmente) {
  let definicao = null;
  const timeouts = [];
  let proximoId = 1;
  const decisor = criarDecisorControlavel(
    temGenteInicialmente === undefined ? true : temGenteInicialmente
  );

  const ctx = {
    console: { debug() {}, warn() {}, log() {} },
    Promise, Date, Math, JSON, Map, Set, Object, Array, String, Number, parseInt, isNaN,
    setInterval: () => proximoId++,
    clearInterval: () => {},
    setTimeout: function (fn, atraso) {
      const id = proximoId++;
      const entrada = { id, fn, atraso, cancelado: false, disparado: false };
      timeouts.push(entrada);
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
    decisao: { criarDecisor: () => decisor },
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

  return { api: definicao, timeouts, decisor };
}

/* O repique MAIS RECENTE ainda pendente (nao disparado, nao cancelado).
 * Precisa ser o mais recente porque cada disparo agenda um novo, e o
 * antigo continua na lista (disparado, mas nao "cancelado"). */
function dispararRepiqueMaisRecente(timeouts) {
  const candidatos = timeouts.filter((t) => t.atraso === INTERVALO_REPIQUE_MS && !t.disparado && !t.cancelado);
  const rep = candidatos[candidatos.length - 1];
  if (!rep) return null;
  rep.disparado = true;
  rep.fn();
  return rep;
}

function repiquePendente(timeouts) {
  const candidatos = timeouts.filter((t) => t.atraso === INTERVALO_REPIQUE_MS && !t.disparado && !t.cancelado);
  return candidatos[candidatos.length - 1] || null;
}

/* ------------------------------------------------------------------
 * 1. O primeiro disparo em Discreto ja agenda os 2 min.
 * ------------------------------------------------------------------ */
{
  const { api, timeouts } = carregar();
  api._dispararAlarme();
  const rep = repiquePendente(timeouts);
  ok("agendou o repique de 2 min no primeiro disparo", !!rep);
  ok("o atraso e exatamente 2 min (120000ms), nem mais nem menos", rep && rep.atraso === 120000, rep && rep.atraso);
}

/* ------------------------------------------------------------------
 * 2. Paciente continua esperando: dispara de novo (uma chamada
 *    IMEDIATA a mais) e a corrente se sustenta sozinha.
 * ------------------------------------------------------------------ */
{
  const { api, timeouts } = carregar(null, true); // tem gente esperando
  api._dispararAlarme();
  ok("1 chamada imediata no primeiro disparo", api._chamadasDeSom().length === 1, api._chamadasDeSom().length);

  dispararRepiqueMaisRecente(timeouts); // simula os 2 min passando
  ok("disparou de novo: mais 1 chamada imediata (2 ao todo)", api._chamadasDeSom().length === 2, api._chamadasDeSom().length);

  const proximo = repiquePendente(timeouts);
  ok("e um NOVO repique de 2 min foi agendado (a corrente continua)", !!proximo);

  dispararRepiqueMaisRecente(timeouts); // mais 2 min
  ok("uma terceira rodada: 3 chamadas ao todo", api._chamadasDeSom().length === 3, api._chamadasDeSom().length);
  ok("e a corrente continua se sustentando", !!repiquePendente(timeouts));
}

/* ------------------------------------------------------------------
 * 3. Paciente ja saiu da fila: NAO dispara de novo.
 * ------------------------------------------------------------------ */
{
  const { api, timeouts, decisor } = carregar(null, true);
  api._dispararAlarme();
  ok("1 chamada no disparo inicial", api._chamadasDeSom().length === 1);

  decisor._definir(false); // paciente foi atendido / saiu da fila
  dispararRepiqueMaisRecente(timeouts);

  ok("NAO disparou de novo — ainda 1 chamada", api._chamadasDeSom().length === 1, api._chamadasDeSom().length);
  ok("e nenhum novo repique foi agendado", !repiquePendente(timeouts));
}

/* ------------------------------------------------------------------
 * 4. Medico trocou de intensidade nesse meio-tempo: NAO dispara de
 *    novo, mesmo com o paciente ainda esperando.
 * ------------------------------------------------------------------ */
{
  const { api, timeouts } = carregar(null, true);
  api._dispararAlarme();

  api._definirIntensidade("completo"); // medico trocou de modo
  dispararRepiqueMaisRecente(timeouts);

  ok("NAO disparou de novo apos trocar para Completo", api._chamadasDeSom().length === 1, api._chamadasDeSom().length);
  ok("e nenhum novo repique foi agendado", !repiquePendente(timeouts));
}

/* ------------------------------------------------------------------
 * 5. Completo e Silencioso nunca agendam este repique.
 * ------------------------------------------------------------------ */
{
  // NOTA: DURACAO_MAX_SOM_MS (a trava de seguranca da sirene do Completo)
  // TAMBEM vale 120000ms — coincidencia de valor, nao de mecanismo. Por
  // isso aqui nao basta checar "nao ha timeout de 120000ms" (have um, e
  // legitimo: e a trava); o que importa e que disparar esse timeout NAO
  // chama dispararAlarme() de novo (o efeito do repique do Discreto).
  const { api, timeouts } = carregar({ intensidade: "completo" }, true);
  api._dispararAlarme();
  const antes = api._chamadasDeSom().length;
  timeouts
    .filter((t) => t.atraso === 120000 && !t.disparado && !t.cancelado)
    .forEach((t) => { t.disparado = true; t.fn(); });
  ok(
    "disparar o(s) timeout(s) de 120000ms do Completo nao chama o alarme de novo",
    api._chamadasDeSom().length === antes,
    antes + " -> " + api._chamadasDeSom().length
  );
}
{
  const { api, timeouts } = carregar({ intensidade: "silencioso" }, true);
  api._dispararAlarme();
  ok("Silencioso nao agenda o repique de 2 min do Discreto", !repiquePendente(timeouts));
}

/* ------------------------------------------------------------------
 * 6. stop() cancela o repique pendente.
 * ------------------------------------------------------------------ */
{
  const { api, timeouts } = carregar(null, true);
  api._dispararAlarme();
  const rep = repiquePendente(timeouts);
  ok("repique agendado antes do stop", !!rep && !rep.cancelado);

  api.stop();
  ok("stop() cancelou o repique de 2 min", rep.cancelado === true);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
