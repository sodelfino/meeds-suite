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

ok("(CARDIOLOGIA) com pontuação", f(com("(CARDIOLOGIA)")) === "Cardiologia");
ok("nome vazio não casa", definicao._especialidadeDoAtendimento(com("CARDIOLOGIA"), [""]) === null);

// --- htmlProtocolo ---
ok("o hook _htmlProtocolo existe", typeof definicao._htmlProtocolo === "function");
const proto = {
  especialidades: {
    Cardiologia: { orientacoesGerais: ["Geral A"], condicoes: [{ nome: "Hipertensão", grupos: [{ titulo: "Basais", itens: [{ exame: "ECG", quando: "a < b & c" }] }], notas: ["cuidado"] }] },
    Dermatologia: { condicoes: [{ nome: "Acne", grupos: [{ itens: [{ exame: "Hemograma", quando: "sempre" }] }] }] },
  },
};
if (typeof definicao._htmlProtocolo === "function") {
  const h = definicao._htmlProtocolo("Varginha", proto, "Cardiologia");
  ok("html: condição e título", h.indexOf("Hipertensão") !== -1 && h.indexOf("Protocolo de Varginha") !== -1);
  ok("html: aria-pressed true no ativo", /data-esp="Cardiologia"[^>]*aria-pressed="true"/.test(h) || /aria-pressed="true"[^>]*data-esp="Cardiologia"/.test(h));
  ok("html: escapa", h.indexOf("a &lt; b &amp; c") !== -1);
  ok("html: orientações gerais e nota", h.indexOf("Orientações gerais") !== -1 && h.indexOf("ⓘ") !== -1);
  const n = definicao._htmlProtocolo("Varginha", proto, null);
  ok("null: pede escolha, sem details, dois botões",
    n.indexOf("Escolha a especialidade") !== -1 && n.indexOf("<details") === -1 && (n.match(/data-esp=/g) || []).length === 2);
  const o = definicao._htmlProtocolo("Varginha", proto, "Pediatria");
  ok("fora do protocolo = null", o === n);
}

console.log(falhas ? "\n" + falhas + " falha(s)" : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
