#!/usr/bin/env node
/**
 * tests/protocolo-especialidade.test.js — especialidade do atendimento
 *
 * Uso:  node tests/protocolo-especialidade.test.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");

let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs !== undefined ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}

// Carrega o modulo inteiro num contexto vm minimo — mesmo padrao de
// tests/avisos-municipio.test.js. O modulo so precisa de
// MeedsSuite.registerModule para nao explodir ao carregar; nenhuma
// chamada de DOM acontece so por carregar o arquivo (so dentro de
// start()/aoCargaRede(), que este teste nao chama).
let definicao = null;
const ctx = {
  console, JSON, Object, Array, String, RegExp,
  MeedsSuite: { registerModule: function (d) { definicao = d; } },
  // CSS do cabecalho compartilhado e lido no corpo do modulo (fora de
  // qualquer funcao), para montar o CSS da tela — precisa existir so
  // para o arquivo carregar, mesmo que este teste nunca monte a tela.
  MeedsSuiteCabecalho: { CSS: "" },
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, "modules/exames/index.js"), "utf8"), ctx);

ok("o hook de teste existe", typeof definicao._especialidadeDoAtendimento === "function");

const nomes = ["Cardiologia", "Dermatologia", "Endocrinologia"];
function com(desc, extras) {
  const esp = [{ id: "a", descricao: desc }].concat(extras || []);
  return { gestaoHorario: { especialidadeId: "a", profissional: { especialidades: esp } } };
}
const f = function (c) { return definicao._especialidadeDoAtendimento(c, nomes); };

ok("agenda de cardiologia entre outras",
  f(com("CARDIOLOGIA", [{ id: "b", descricao: "ATENDIMENTO EM PEDIATRIA" }])) === "Cardiologia");
ok("ATENDIMENTO EM CARDIOLOGIA", f(com("ATENDIMENTO EM CARDIOLOGIA")) === "Cardiologia");
ok("ENDOCRINOLOGIA E METABOLOGIA", f(com("ENDOCRINOLOGIA E METABOLOGIA")) === "Endocrinologia");
ok("DERMATOLOGIA", f(com("DERMATOLOGIA")) === "Dermatologia");
ok("CLÍNICO GERAL -> null", f(com("CLÍNICO GERAL")) === null);
ok("{} -> null", f({}) === null);
ok("null -> null", f(null) === null);
ok("gestaoHorario vazio -> null", f({ gestaoHorario: {} }) === null);
ok("vale a especialidade da agenda, não a do médico",
  f(com("CLÍNICO GERAL", [{ id: "b", descricao: "CARDIOLOGIA" }])) === null);
ok("sem especialidadeId, única especialidade",
  f({ gestaoHorario: { profissional: { especialidades: [{ id: "x", descricao: "DERMATOLOGIA" }] } } }) === "Dermatologia");

console.log(falhas ? "\n" + falhas + " falha(s)" : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
