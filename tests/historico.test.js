/* ------------------------------------------------------------------
 * tests/historico.test.js — core/historico.js
 * ------------------------------------------------------------------
 * O historico e a UNICA coisa que grava referencia de paciente no
 * disco. A pseudonimizacao (referenciaDoPaciente) e o que separa
 * "guardo o suficiente para o medico reconhecer o atendimento" de
 * "guardo dado que identifica alguem". Ate a v2.38.0 essa funcao nao
 * tinha um unico teste — um bug aqui e um vazamento silencioso.
 *
 * Provado abaixo:
 *   1. o nome completo NUNCA aparece na referencia;
 *   2. o CPF completo NUNCA aparece — no maximo os 3 ultimos digitos;
 *   3. entrada malformada (vazia, nula, numero, muitos nomes) nao
 *      quebra e nao vaza;
 *   4. registrar() grava a referencia e NAO grava nomePaciente/
 *      cpfPaciente; "Reabrir" so tem a parte clinica;
 *   5. o limite de 30 entradas e respeitado.
 * ------------------------------------------------------------------ */
const fs = require("fs");
const vm = require("vm");

let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}

/* Ambiente com GM presente: caminho sincrono, sem IndexedDB. */
function ambiente() {
  const gm = new Map();
  const ls = new Map();
  const ctx = {
    setTimeout, setImmediate, clearTimeout, Promise, Date, JSON, Math, RegExp, Object, Array, String,
    console,
    localStorage: {
      getItem: (k) => (ls.has(k) ? ls.get(k) : null),
      setItem: (k, v) => ls.set(k, String(v)),
      removeItem: (k) => ls.delete(k),
      clear: () => ls.clear(),
      get length() { return ls.size; },
      key: (i) => [...ls.keys()][i],
    },
    GM_getValue: (k, d) => (gm.has(k) ? gm.get(k) : d),
    GM_setValue: (k, v) => gm.set(k, JSON.parse(JSON.stringify(v))),
    GM_deleteValue: (k) => gm.delete(k),
    _gm: gm,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("core/storage.js", "utf8"), ctx);
  vm.runInContext(fs.readFileSync("core/historico.js", "utf8"), ctx);
  return ctx;
}

const H = ambiente().MeedsSuiteHistorico;
const ref = H.referenciaDoPaciente;

/* 1. o caso do cabecalho do arquivo */
{
  const r = ref("MARIA APARECIDA DE SOUZA", "12345678909");
  ok("iniciais sem as particulas (de/da/do)", r.indexOf("M.A.S.") === 0, r);
  ok("termina com os 3 ultimos digitos do CPF", /909$/.test(r), r);
}

/* 2. o nome completo nunca vaza */
{
  const r = ref("JOAO CARLOS DA SILVA PEREIRA", "98765432100");
  ["JOAO", "CARLOS", "SILVA", "PEREIRA"].forEach((parte) => {
    ok("referencia nao contem '" + parte + "'", r.toUpperCase().indexOf(parte) === -1, r);
  });
}

/* 3. o CPF completo nunca vaza; so 3 digitos saem */
{
  const r = ref("ANA LIMA", "11122233344");
  ok("referencia nao contem o CPF inteiro", r.indexOf("11122233344") === -1, r);
  ok("referencia nao contem os 8 primeiros digitos", r.indexOf("11122233") === -1, r);
  const digitos = (r.match(/\d/g) || []).join("");
  ok("no maximo 3 digitos na referencia", digitos.length <= 3, "digitos=" + digitos);
  ok("os digitos sao mesmo os 3 ultimos", digitos === "344", "digitos=" + digitos);
}

/* 4. no maximo 4 iniciais, mesmo com um nome enorme */
{
  const r = ref("A B C D E F G H", "555");
  ok("nome com 8 partes -> 4 iniciais", r.indexOf("A.B.C.D.") === 0 && r.indexOf("E.") === -1, r);
}

/* 5. entrada malformada nao quebra */
{
  ok("nome e cpf vazios -> 'Paciente'", ref("", "") === "Paciente");
  ok("nulos -> 'Paciente'", ref(null, null) === "Paciente");
  ok("indefinidos -> 'Paciente'", ref(undefined, undefined) === "Paciente");
  ok("numero como nome nao quebra", typeof ref(12345, 678) === "string");
  ok("objeto como nome nao quebra", typeof ref({}, {}) === "string");
  ok("CPF com menos de 3 digitos -> sem trecho de CPF", ref("BEA", "12").indexOf("1") === -1, ref("BEA", "12"));
  ok("so particulas no nome nao quebra", typeof ref("de da do", "999888777") === "string");
}

/* 6. registrar() grava a referencia e NADA de identificavel */
{
  const c = ambiente();
  const Hist = c.MeedsSuiteHistorico;
  Hist.registrar("apac", {
    nomePaciente: "FULANO DE TAL SOBRENOME",
    cpfPaciente: "12345678909",
    titulo: "Holter 24h",
    medico: "DRA. BELTRANA",
    clinico: { procedimento: "HOLTER", cid: "I48", justificativa: "palpitacoes" },
  });

  const lista = Hist.listar("apac");
  ok("uma entrada gravada", lista.length === 1);

  const e = lista[0];
  ok("a entrada guarda a referencia curta", e.paciente.indexOf("F.T.S.") === 0, e.paciente);
  ok("a entrada NAO tem a chave nomePaciente", !("nomePaciente" in e));
  ok("a entrada NAO tem a chave cpfPaciente", !("cpfPaciente" in e));

  const bruto = JSON.stringify(e).toUpperCase();
  ok("o JSON gravado nao contem o nome", bruto.indexOf("FULANO") === -1 && bruto.indexOf("SOBRENOME") === -1, bruto);
  ok("o JSON gravado nao contem o CPF inteiro", bruto.indexOf("12345678909") === -1);
  ok('"Reabrir" repoe a parte clinica', e.clinico && e.clinico.procedimento === "HOLTER");

  /* e no que foi PARA O DISCO (o GM), a mesma garantia */
  const noDisco = JSON.stringify([...c._gm.entries()]).toUpperCase();
  ok("o disco nao contem o nome do paciente", noDisco.indexOf("FULANO") === -1, "");
  ok("o disco nao contem o CPF inteiro", noDisco.indexOf("12345678909") === -1);
}

/* 7. o limite de 30 entradas */
{
  const c = ambiente();
  const Hist = c.MeedsSuiteHistorico;
  for (let i = 0; i < 45; i++) {
    Hist.registrar("cmd", { nomePaciente: "P" + i, cpfPaciente: "000000000" + (i % 10), titulo: "Doc " + i });
  }
  const lista = Hist.listar("cmd");
  ok("nunca passa de 30 entradas", lista.length === 30, "tem " + lista.length);
  ok("a mais recente fica no topo", lista[0].titulo === "Doc 44", lista[0].titulo);
}

/* 8. limpar() zera */
{
  const c = ambiente();
  const Hist = c.MeedsSuiteHistorico;
  Hist.registrar("apac", { nomePaciente: "X Y", cpfPaciente: "111", titulo: "t" });
  Hist.limpar("apac");
  ok("limpar deixa a lista vazia", Hist.listar("apac").length === 0);
}

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
