/* ------------------------------------------------------------------
 * tests/alarme-falso-positivo.test.js — as regras nao podem disparar
 * umas as outras
 * ------------------------------------------------------------------
 * "Um alarme falso quebra nossa credibilidade." O modulo funde QUATRO
 * sinais independentes, e a revisao de 17/09 procurou o oposto do que os
 * testes anteriores procuravam: nao "o alarme toca quando deve", e sim
 * "o alarme NAO toca quando uma regra pisa na outra".
 *
 * Tres buracos apareceram, todos na fronteira entre duas regras que,
 * sozinhas, estavam certas (ver decisao D62):
 *
 *   1. TOAST SEM PROVA. Os outros tres sinais carregam a evidencia
 *      junto (id novo, numero que subiu, id que passou do limite). O
 *      toast dispara so por existir um elemento com aquele texto na
 *      tela — e a gravacao de 16/09 mostra o Meeds anunciando "Novo
 *      Atendimento" com o contador "Aguardando" em ZERO.
 *
 *   2. BASE DE CONTADOR ATRAVESSANDO TELAS. "O numero subiu" so quer
 *      dizer chegada se os dois numeros vierem da mesma tela, em
 *      sequencia. Comparar o 0 do Pronto Atendimento com o 7 da tela de
 *      monitoramento e ler "chegaram sete pacientes agora".
 *
 *   3. BASE DE REDE VELHA. resumoDaFila() ja descartava vista de fila
 *      parada ha mais de 2 min, mas o disparo nao: o medico voltava para
 *      a fila depois de 10 min noutra tela e todo mundo parecia novo.
 *
 * Em todos os tres a correcao e a MESMA regra que o modulo ja aplicava a
 * primeira leitura de rede — base sem valor vira base nova e nao
 * dispara — e em nenhum deles ela pode virar silencio: as secoes de
 * controle (2, 5, 7) existem para provar que o alarme de verdade
 * continua tocando.
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

/* Decisor controlavel. Diferente do de alarme-repique-discreto.test.js,
 * este tambem controla `decidiu` — a ABSTENCAO ("nao sei se tem gente")
 * e justamente o caso em que o toast deve continuar disparando. */
function criarDecisor(temGente, decidiu) {
  const estado = { temGente, decidiu: decidiu === undefined ? true : decidiu };
  return {
    votar() {},
    decidir: () => ({ decidiu: estado.decidiu, valor: estado.temGente }),
    _definir: (v) => { estado.temGente = v; },
    _definirDecidiu: (v) => { estado.decidiu = v; },
  };
}

function carregar(opcoes) {
  opcoes = opcoes || {};
  let definicao = null;
  const timeouts = [];
  const avisos = [];
  const estado = { contador: opcoes.contador === undefined ? null : opcoes.contador };
  let proximoId = 1;
  const decisor = criarDecisor(
    opcoes.temGente === undefined ? true : opcoes.temGente,
    opcoes.decidiu
  );

  const ctx = {
    console: { debug() {}, warn() {}, log() {} },
    Promise, Date, Math, JSON, Map, Set, Object, Array, String, Number, parseInt, isNaN,
    setInterval: () => proximoId++,
    clearInterval: () => {},
    setTimeout: function (fn, atraso) {
      const id = proximoId++;
      timeouts.push({ id, fn, atraso, cancelado: false, disparado: false });
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
      {
        ativo: true, modo: "imediato", tempoEsperaMin: 5,
        som: "sirene-classica", somCurto: "toque-duplo", volume: 50,
        intensidade: "discreto",
      },
      opcoes.config || {}
    ),
    storage: { gravarConfig() {} },
    decisao: { criarDecisor: () => decisor },
    dom: { lerContadorPorRotulo: () => estado.contador },
    seletor: () => [],
    dock: {
      criarBanner: () => ({
        elemento: { addEventListener() {} },
        $: () => ({ textContent: "", addEventListener() {} }),
        mostrar() {}, esconder() {}, remover() {},
      }),
      criarMolduraAlerta: () => ({ mostrar() {}, esconder() {}, remover() {} }),
      criarOverlay: () => ({
        $: () => ({ addEventListener() {}, appendChild() {}, value: "", textContent: "", checked: false, hidden: true }),
        $$: () => [],
        abrir() {}, fechar() {}, remover() {}, estaAberto: () => false,
      }),
      criarAviso: (spec) => {
        avisos.push({ titulo: spec.titulo, corpo: spec.corpo });
        return { atualizar() {}, fechar() {}, estaVisivel: () => true };
      },
    },
    aoClicarBotao() {}, aoAbrirAjustes() {}, botao: null,
  });

  return { api: definicao, timeouts, decisor, avisos, estado };
}

/* Uma URL que o modulo reconhece como "a fila de espera": um unico
 * StatusAtendimentoId=2 e nenhum ProfissionalId. */
const URL_FILA = "/api/v1/Atendimento?StatusAtendimentoId=2&take=5";

/* ------------------------------------------------------------------
 * 1. TOAST COM PROVA FRESCA DE FILA VAZIA: nao dispara.
 *    E o caso da gravacao de 16/09 — a voz do proprio Meeds dizendo
 *    "Novo Atendimento" com "Aguardando" marcando zero.
 * ------------------------------------------------------------------ */
{
  const { api, avisos } = carregar({ temGente: false }); // fila comprovadamente vazia
  api._sinalizarNovoPaciente("toast-nativo");
  ok("toast com fila comprovadamente vazia NAO dispara", avisos.length === 0, avisos.length);
  ok("e nao tocou som nenhum", api._chamadasDeSom().length === 0, api._chamadasDeSom().length);
}

/* ------------------------------------------------------------------
 * 2. CONTROLE — a guarda nao pode virar silencio.
 *    Abstencao ("nao sei se tem gente") NAO e prova de fila vazia: o
 *    modulo prefere errar tocando a errar calando.
 * ------------------------------------------------------------------ */
{
  const { api, avisos } = carregar({ temGente: false, decidiu: false }); // ninguem sabe
  api._sinalizarNovoPaciente("toast-nativo");
  ok("toast com leitura ambigua CONTINUA disparando", avisos.length === 1, avisos.length);
}
{
  const { api, avisos } = carregar({ temGente: true });
  api._sinalizarNovoPaciente("toast-nativo");
  ok("toast com gente na fila dispara normalmente", avisos.length === 1, avisos.length);
  ok("e diz 'Novo paciente' — o toast e sinal de chegada", avisos[0].titulo === "🔔 Novo paciente na fila", avisos[0].titulo);
}

/* ------------------------------------------------------------------
 * 3. O TOAST RECUSADO NAO PODE ENGOLIR O DISPARO DE VERDADE.
 *    A recusa acontece ANTES do carimbo de debounce, de proposito: se o
 *    paciente for real, a resposta de rede chega segundos depois e
 *    precisa disparar. Se a recusa carimbasse ultimoDisparoTs, esses
 *    2,5 s de debounce comeriam o unico alarme legitimo.
 * ------------------------------------------------------------------ */
{
  const { api, avisos } = carregar({ temGente: false });
  api._sinalizarNovoPaciente("toast-nativo");     // recusado
  api._sinalizarNovoPaciente("rede-fila-espera"); // no mesmo instante
  ok("o sinal de rede logo apos um toast recusado AINDA dispara", avisos.length === 1, avisos.length);
}

/* ------------------------------------------------------------------
 * 4. CONTADOR DO DOM ATRAVESSANDO TELAS: base velha nao dispara.
 * ------------------------------------------------------------------ */
{
  const { api, avisos, estado } = carregar({ contador: 0 }); // Pronto Atendimento, fila vazia
  estado.contador = 7;                 // outra tela, outro numero
  api._envelhecerLeituraDOM(20000);    // 20 s sem ler: o contador sumiu da tela
  api._tentarChecarContador();
  ok("0 -> 7 com 20 s de intervalo NAO dispara (base de outra tela)", avisos.length === 0, avisos.length);

  // e a base foi reaproveitada: a partir daqui o modulo volta a valer
  estado.contador = 9;
  api._tentarChecarContador();
  ok("mas a base nova ja vale: 7 -> 9 na sequencia dispara", avisos.length === 1, avisos.length);
}

/* ------------------------------------------------------------------
 * 5. CONTROLE — a mesma tela, em sequencia, continua disparando.
 * ------------------------------------------------------------------ */
{
  const { api, avisos, estado } = carregar({ contador: 0 });
  estado.contador = 2;
  api._tentarChecarContador(); // sem envelhecer: leitura fresca, mesma tela
  ok("0 -> 2 com base fresca dispara normalmente", avisos.length === 1, avisos.length);
}

/* ------------------------------------------------------------------
 * 6. REDE COM VISTA DE FILA VELHA: nao dispara.
 *    resumoDaFila() ja considerava essa vista morta ha 2 min; o disparo
 *    nao considerava. Os dois calculos agora concordam.
 * ------------------------------------------------------------------ */
{
  const { api, avisos } = carregar();
  api._lerRespostaDeFila(URL_FILA, [{ id: "a" }]); // base
  ok("a primeira leitura nunca dispara (regra antiga, preservada)", avisos.length === 0, avisos.length);

  api._envelhecerAssinaturas(10 * 60000); // 10 min noutra tela
  api._lerRespostaDeFila(URL_FILA, [{ id: "b" }, { id: "c" }]);
  ok("fila inteira diferente apos 10 min NAO dispara (base morta)", avisos.length === 0, avisos.length);

  // a leitura anterior virou a base nova: o proximo que chegar dispara
  api._lerRespostaDeFila(URL_FILA, [{ id: "b" }, { id: "c" }, { id: "d" }]);
  ok("e a base nova ja vale: o proximo id realmente novo dispara", avisos.length === 1, avisos.length);
}

/* ------------------------------------------------------------------
 * 7. CONTROLE — chegada de verdade, com a vista fresca, dispara.
 * ------------------------------------------------------------------ */
{
  const { api, avisos } = carregar();
  api._lerRespostaDeFila(URL_FILA, [{ id: "a" }]);
  api._lerRespostaDeFila(URL_FILA, [{ id: "a" }, { id: "b" }]);
  ok("id novo com a vista fresca dispara", avisos.length === 1, avisos.length);
  ok("e diz 'Novo paciente' — aqui chegou alguem mesmo", avisos[0].titulo === "🔔 Novo paciente na fila", avisos[0].titulo);
}

/* ------------------------------------------------------------------
 * 8. A MESMA PESSOA EM DUAS VISTAS DA FILA NAO E DUAS CHEGADAS.
 *    A tela de monitoramento do administrador consulta a mesma fila com
 *    filtros diferentes; cada filtro e uma assinatura. O mesmo id
 *    aparecendo numa assinatura nova e uma vista nova, nao um paciente
 *    novo — por isso a primeira leitura de CADA assinatura e so base.
 * ------------------------------------------------------------------ */
{
  const { api, avisos } = carregar();
  api._lerRespostaDeFila(URL_FILA, [{ id: "a" }]);
  api._lerRespostaDeFila(URL_FILA + "&Active=true", [{ id: "a" }]); // outro filtro
  ok("o mesmo paciente visto por outro filtro nao vira chegada", avisos.length === 0, avisos.length);
}

/* ------------------------------------------------------------------
 * 9. TROCAR DE INTENSIDADE COM A SIRENE TOCANDO.
 * ------------------------------------------------------------------
 * O inverso de um alarme falso, e pior: um alarme MUDO. Ate a v2.43.7 so
 * o Silencioso parava a sirene. Completo -> Discreto deixava `tocando`
 * em true com a sirene e a faixa na tela, e como dispararAlarme() comeca
 * com `if (tocando) return`, o Discreto recem-escolhido nascia incapaz
 * de disparar — ate a trava de 2 min destravar tudo sozinha.
 * ------------------------------------------------------------------ */
{
  const { api, timeouts } = carregar({ config: { intensidade: "completo" }, temGente: true });
  api._dispararAlarme();
  ok("Completo: a sirene esta tocando", api._estaTocando() === true);

  api._ciclarIntensidade(); // completo -> discreto
  ok("trocar para Discreto PARA a sirene", api._estaTocando() === false);

  const repique = timeouts.filter((t) => t.atraso === 120000 && !t.disparado && !t.cancelado);
  ok("e agenda o lembrete de 2 min — parar nao pode virar esquecer", repique.length === 1, repique.length);
}

/* ------------------------------------------------------------------
 * 10. CONTROLE — Silencioso continua parando a sirene (regra antiga).
 * ------------------------------------------------------------------ */
{
  const { api, timeouts } = carregar({ config: { intensidade: "discreto" }, temGente: true });
  api._definirIntensidade("completo");
  api._dispararAlarme();
  api._ciclarIntensidade(); // completo -> discreto
  api._ciclarIntensidade(); // discreto -> silencioso
  ok("Silencioso continua com a sirene parada", api._estaTocando() === false);
  ok(
    "e o Silencioso nao deixa lembrete agendado nenhum",
    timeouts.filter((t) => t.atraso === 120000 && !t.disparado && !t.cancelado).length === 0
  );
}

/* ------------------------------------------------------------------
 * 11. E com a fila JA vazia, trocar para Discreto nao agenda lembrete
 *     de ninguem — nao ha quem lembrar.
 * ------------------------------------------------------------------ */
{
  const { api, timeouts, decisor } = carregar({ config: { intensidade: "completo" }, temGente: true });
  api._dispararAlarme();
  decisor._definir(false); // o paciente foi atendido
  api._ciclarIntensidade();
  ok(
    "fila vazia: trocar para Discreto nao agenda lembrete",
    timeouts.filter((t) => t.atraso === 120000 && !t.disparado && !t.cancelado).length === 0
  );
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
