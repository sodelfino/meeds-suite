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
    /* No pacote real, core/cabecalho.js roda antes dos modulos e define
     * isto. Aqui o modulo e carregado sozinho, entao um stub basta — o
     * teste nao exercita o cabecalho. */
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

/* 5. QUAL CHAMADA E A FILA — conferido contra gravacoes dos dois perfis.
 *    O medico usa /emergency-care e o operador
 *    /administrator/monitoring/emergency-care; as telas sao diferentes e
 *    as consultas tambem. Um alarme que le a lista errada conta gente
 *    que nao esta esperando — ou nao conta quem esta. */
{
  const m = carregar();
  const eh = m._ehChamadaFilaDeEspera;
  const base = "https://api-calltech.meeds.com.br/api/v1/Atendimento?sort=createdAt&AtendimentoTipoIds=1";

  /* Gravacao do perfil MEDICO (08/09), filtrada por especialidade. */
  ok("medico: a fila de espera dele e reconhecida",
     eh(base + "&EmpresasId=46df&StatusAtendimentoId=2&Agendado=false&EspecialidadeId=4fcab7e8&skip=1&take=5&version=1"));

  /* Gravacao do perfil OPERADOR (08/09), a fila cheia. */
  ok("operador: a fila de espera dele e reconhecida",
     eh(base + "&DataInicialCreated=2026-09-08&StatusAtendimentoId=2&Active=true&Agendado=false&take=100"));

  /* O DEFEITO: o operador tem uma chamada que pede DOIS status de uma
   * vez. Contar status 1 como "aguardando" enche a fila de gente que
   * nao esta esperando, e pode disparar o alarme por ela. */
  ok("lista que mistura status 1 e 2 NAO e a fila",
     !eh(base + "&StatusAtendimentoId=1&StatusAtendimentoId=2&CreatedAt=2026-09-08&skip=1&take=5"),
     "era aceita antes desta versao");

  /* "Meus atendimentos" nunca e a fila de espera: nos dois perfis, o
   * ProfissionalId so aparece nas listas do proprio medico. */
  ok("com ProfissionalId, nao e a fila",
     !eh(base + "&StatusAtendimentoId=2&ProfissionalId=b92ad1f5"));

  ok("outros status nao sao a fila",
     !eh(base + "&StatusAtendimentoId=3&StatusAtendimentoId=7&ProfissionalId=b92ad1f5") &&
     !eh(base + "&StatusAtendimentoId=5") && !eh(base + "&StatusAtendimentoId=6"));

  ok("sem status nenhum, nao e a fila", !eh(base + "&Agendado=false"));
  ok("outro endereco nao e a fila",
     !eh("https://api-calltech.meeds.com.br/api/v1/Queixa/atendimento/56180076?StatusAtendimentoId=2"));

  /* "=2" tem que ser o valor inteiro, nao um pedaco de "=20" ou "=12". */
  ok("nao confunde status 2 com 12 ou 20",
     !eh(base + "&StatusAtendimentoId=12") && !eh(base + "&StatusAtendimentoId=20"));
}

/* ------------------------------------------------------------------
 * PRIVACIDADE: nome de paciente nao entra no modulo
 * ------------------------------------------------------------------
 * Ate a v2.33.1 o alarme procurava o nome do paciente em cinco caminhos
 * e o guardava em `ultimaChegada`, ainda que o cartao mostrasse apenas o
 * municipio. Era leitura sem uso — e dado de paciente sem uso continua
 * aparecendo em despejo de memoria, em depurador e em relatorio de erro.
 *
 * Este teste alimenta a fila com uma resposta que traz o nome em TODOS
 * os caminhos que o modulo ja tentou, e depois varre o que ele reteve
 * atras dessa string. A varredura e recursiva de proposito: um `nome`
 * reintroduzido em qualquer nivel da ficha derruba o teste.
 * ------------------------------------------------------------------ */
{
  const api = carregar();
  const NOME = "MARIA DAS DORES TESTE";
  const url =
    "https://api-calltech.meeds.com.br/api/v1/Atendimento?StatusAtendimentoId=2&take=100";

  const paciente = (id) => ({
    id: id,
    nomePaciente: NOME,
    pacienteNome: NOME,
    paciente: { nome: NOME, nomeCompleto: NOME, cliente: { razaoSocialNome: NOME } },
    cliente: { razaoSocialNome: "PREFEITURA MUNICIPAL DE ITAUNA" },
  });

  /* Primeira leitura so define a base; a segunda e que traz "novos". */
  api._lerRespostaDeFila(url, { items: [paciente("p1")] });
  api._lerRespostaDeFila(url, { items: [paciente("p1"), paciente("p2")] });

  function contemONome(valor, profundidade) {
    if (profundidade > 8 || valor === null || valor === undefined) return false;
    if (typeof valor === "string") return valor.indexOf(NOME) !== -1;
    if (typeof valor !== "object") return false;
    return Object.keys(valor).some((k) => contemONome(valor[k], profundidade + 1));
  }

  const retido = api._ultimaChegada();
  ok("o modulo registrou a chegada", !!retido, JSON.stringify(retido));
  ok("nao retem o nome do paciente em nenhum nivel da ficha",
     !contemONome(retido, 0), JSON.stringify(retido));
  ok("mas continua retendo o municipio, que sustenta decisao clinica",
     !!(retido && retido.municipio), retido && retido.municipio);
  ok("o campo `nome` nao existe mais na ficha",
     !(retido && Object.prototype.hasOwnProperty.call(retido, "nome")));

  /* A contagem nao pode ter sido afetada pela remocao. */
  api._definirContadorDaTela(null);
  ok("a contagem continua correta apos a remocao",
     api._resumoDaFila().porRede === 2, api._resumoDaFila().porRede);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
