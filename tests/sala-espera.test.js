#!/usr/bin/env node
/**
 * tests/sala-espera.test.js — testes da deteccao de chegada
 *
 * Roda em Node, sem navegador: carrega o modulo com dublês de DOM e das
 * dependencias do nucleo, alimenta respostas simuladas da API e confere
 * o que aconteceu.
 *
 * Estes testes existem por dois motivos:
 *   1. cobrir as regras de transicao, que sao a parte facil de quebrar;
 *   2. pegar erro de EXECUCAO. Durante esta correcao, uma edicao apagou
 *      sem querer duas funcoes do modulo; `node --check` passou, porque
 *      so valida sintaxe, e o defeito so apareceria no plantao. Um teste
 *      que de fato EXECUTA o modulo pega isso na hora.
 *
 * Uso:  node tests/sala-espera.test.js
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");

/* ---------- dublês mínimos ---------- */
function criarAmbiente() {
  const avisos = [];
  /* Quantas vezes o modulo ANUNCIOU uma chegada. Conta tanto uma caixa
   * nova quanto a atualizacao de uma caixa ainda visivel — porque a
   * regra do produto e "um aviso, nunca uma pilha": quando o aviso
   * anterior ainda esta na tela, a chegada nova ATUALIZA aquele aviso.
   * Contar caixas criadas mediria o dublê, nao o comportamento. */
  const anuncios = { total: 0 };
  const contador = { valor: null };

  const elementoFalso = () => ({
    className: "",
    style: {},
    dataset: {},
    hidden: false,
    innerHTML: "",
    textContent: "",
    children: [],
    appendChild() {},
    insertBefore() {},
    removeChild() {},
    addEventListener() {},
    querySelector: () => elementoFalso(),
    querySelectorAll: () => [],
    getAttribute: () => null,
    setAttribute() {},
    closest: () => null,
    scrollIntoView() {},
  });

  const raiz = {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    addEventListener() {},
    removeEventListener() {},
    location: { href: "" },
    MeedsSuite: { registerModule: (def) => (raiz.__modulo = def) },
  };

  const documento = {
    createElement: () => elementoFalso(),
    createDocumentFragment: () => elementoFalso(),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    body: elementoFalso(),
  };

  const deps = {
    auth: { estaLogado: () => true },
    core: { toast() {} },
    botao: { definirContador: (n) => (contador.valor = n) },
    dock: {
      criarOverlay: () => ({
        elemento: elementoFalso(),
        $: () => elementoFalso(),
        $$: () => [],
        abrir() {},
        fechar() {},
        estaAberto: () => false,
        remover() {},
      }),
      criarAviso: (conteudo) => {
        avisos.push(conteudo);
        anuncios.total++;
        const handle = {
          atualizar: (novo) => {
            avisos[avisos.length - 1] = novo;
            anuncios.total++;
            handle._conteudo = novo;
          },
          estaVisivel: () => handle._visivel,
          fechar: () => (handle._visivel = false),
          _visivel: true,
          _conteudo: conteudo,
        };
        return handle;
      },
    },
    aoClicarBotao() {},
    assinarEvento: () => () => {},
    publicarEvento: () => 0,
    aoMudarCadastro() {},
  };

  return { raiz, documento, deps, avisos, anuncios, contador };
}

function carregarModulo(amb) {
  const contexto = {
    console: { debug() {}, warn() {}, log() {}, table() {} },
    document: amb.documento,
    setTimeout: amb.raiz.setTimeout,
    clearTimeout: amb.raiz.clearTimeout,
    Promise,
    Date,
    Math,
    JSON,
    Map,
    Set,
    Object,
    Array,
    String,
    Number,
    isNaN,
    fetch: () => Promise.reject(new Error("rede desligada no teste")),
    unsafeWindow: amb.raiz,
  };
  contexto.window = amb.raiz;
  contexto.globalThis = contexto;
  vm.createContext(contexto);

  vm.runInContext(fs.readFileSync(path.join(RAIZ, "modules/sala-espera/diagnostico.js"), "utf8"), contexto);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "modules/sala-espera/index.js"), "utf8"), contexto);

  const def = amb.raiz.__modulo;
  if (!def) throw new Error("o modulo nao se registrou");
  def.start(amb.deps);
  return def;
}

/* ---------- helpers de resposta simulada ---------- */
const paciente = (id, chegada, status = 2, extra = {}) => ({
  id,
  statusAtendimentoId: status,
  agendamento: chegada === undefined ? {} : { checkinStatus: chegada },
  gestaoHorario: { horarioInicial: new Date().toISOString() },
  cliente: { razaoSocialNome: "PACIENTE DE TESTE " + id },
  ...extra,
});

/* ---------- execucao ---------- */
let passaram = 0;
let falharam = 0;

function verificar(nome, condicao, observado) {
  if (condicao) {
    passaram++;
    console.log("  ok   " + nome);
  } else {
    falharam++;
    console.log("  FALHOU " + nome + (observado !== undefined ? "  → " + JSON.stringify(observado) : ""));
  }
}

function cenario(nome, corpo) {
  console.log("\n" + nome);
  const amb = criarAmbiente();
  const def = carregarModulo(amb);
  corpo({ def, ...amb, poll: (itens) => def._teste.processar(itens) });
}

/* 1-3: false -> true -> true */
cenario("1-3  transicao false → true → true", ({ poll, avisos, contador }) => {
  poll([paciente("A", false)]);
  verificar("poll 1 (nao chegou): sem aviso", avisos.length === 0, avisos.length);
  verificar("poll 1: contador zerado", contador.valor === 0, contador.valor);

  poll([paciente("A", true)]);
  verificar("poll 2 (chegou): um aviso", avisos.length === 1, avisos.length);
  verificar("poll 2: titulo no singular", avisos[0] && avisos[0].titulo === "Paciente na sala de espera", avisos[0] && avisos[0].titulo);
  verificar("poll 2: contador em 1", contador.valor === 1, contador.valor);

  poll([paciente("A", true)]);
  verificar("poll 3 (segue chegado): nenhum aviso novo", avisos.length === 1, avisos.length);
});

/* 4-5: sai da resposta e volta */
cenario("4-5  sai da fila e volta depois", ({ poll, avisos, anuncios, contador }) => {
  poll([paciente("A", false)]);
  poll([paciente("A", true)]);
  verificar("chegou: um anuncio", anuncios.total === 1, anuncios.total);

  poll([]); // atendido/cancelado
  verificar("saiu: contador zera", contador.valor === 0, contador.valor);

  poll([paciente("A", true)]);
  verificar("voltou chegado: anuncia de novo", anuncios.total === 2, anuncios.total);
  verificar("sem empilhar caixas", avisos.length === 1, avisos.length);
});

/* 6: primeira leitura ja com chegada */
cenario("6    primeira leitura ja com paciente chegado", ({ poll, avisos, contador }) => {
  poll([paciente("A", true), paciente("B", true)]);
  verificar("sem aviso retroativo", avisos.length === 0, avisos.length);
  verificar("mas o contador mostra os dois", contador.valor === 2, contador.valor);

  poll([paciente("A", true), paciente("B", true), paciente("C", true)]);
  verificar("chegada seguinte avisa so o novo", avisos.length === 1 && avisos[0].titulo === "Paciente na sala de espera", avisos[0] && avisos[0].titulo);
});

/* 7: some do filtro apos o check-in (sem rede, so confere que nao quebra) */
cenario("7    atendimento some do filtro sem ter chegado", ({ poll, contador, def }) => {
  poll([paciente("A", false)]);
  poll([]); // sumiu: dispara a confirmacao (fetch rejeita no teste)
  verificar("nao quebra sem rede", true);
  verificar("contador zerado", contador.valor === 0, contador.valor);
  verificar("estado ativo foi liberado", def._teste.estado().estado.length === 0, def._teste.estado().estado);
});

/* 8: formatos alternativos de chegada */
cenario("8    chegada em texto e em numero", ({ poll, avisos }) => {
  poll([paciente("A", "false"), paciente("B", 0)]);
  verificar("'false' e 0 contam como nao chegou", avisos.length === 0, avisos.length);

  poll([paciente("A", "true"), paciente("B", 1)]);
  verificar("'true' e 1 contam como chegou", avisos.length === 1, avisos.length);
  verificar("os dois num aviso so", avisos[0].titulo === "2 pacientes na sala de espera", avisos[0].titulo);
});

/* 9: dois na mesma rodada */
cenario("9    dois pacientes chegam na mesma rodada", ({ poll, avisos, contador }) => {
  poll([paciente("A", false), paciente("B", false)]);
  poll([paciente("A", true), paciente("B", true)]);
  verificar("um unico aviso agrupado", avisos.length === 1, avisos.length);
  verificar("titulo no plural", avisos[0].titulo === "2 pacientes na sala de espera", avisos[0].titulo);
  verificar("contador em 2", contador.valor === 2, contador.valor);
});

/* 10: item sem id nao entra */
cenario("10   item invalido e ignorado", ({ poll, contador }) => {
  poll([paciente("", true)]);
  verificar("sem id: fora do contador", contador.valor === 0, contador.valor);
});

/* 11: sem campo de chegada (API que nao informa) */
cenario("11   API sem campo de chegada cai no status", ({ poll, contador }) => {
  poll([{ id: "A", statusAtendimentoId: 2, gestaoHorario: {}, cliente: {} }]);
  verificar("usa o status como reserva", contador.valor === 1, contador.valor);
});

/* 12: true -> false libera nova notificacao */
cenario("12   chegou, saiu da chegada, chegou de novo", ({ poll, anuncios }) => {
  poll([paciente("A", false)]);
  poll([paciente("A", true)]);
  verificar("primeira chegada anuncia", anuncios.total === 1, anuncios.total);
  poll([paciente("A", false)]);
  verificar("voltar para nao-chegado nao anuncia", anuncios.total === 1, anuncios.total);
  poll([paciente("A", true)]);
  verificar("nova chegada anuncia de novo", anuncios.total === 2, anuncios.total);
});

console.log("\n" + "-".repeat(50));
console.log(passaram + " passaram, " + falharam + " falharam");
process.exit(falharam ? 1 : 0);
