#!/usr/bin/env node
/**
 * tests/mensagem-nao-consta.test.js — mensagem de exame fora da lista
 *
 * Protocolo 1 (Documento 1, Callmed), seção "Sobre a solicitação de
 * exames e a Tabela SIGTAP": quando o exame necessário não consta na
 * Tabela SIGTAP (ou na lista do município), ele deve ser solicitado
 * assim mesmo, com justificativa clínica registrada em prontuário — o
 * Código de Ética Médica (Res. CFM nº 2.217/2018, art. 32) veda deixar de
 * usar meios diagnósticos disponíveis. A mensagem antiga só sugeria
 * "o fluxo de encaminhamento ou a regulação", sem essa orientação central.
 *
 * Uso:  node tests/mensagem-nao-consta.test.js
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

ok("o hook de teste existe", typeof definicao._mensagemNaoConsta === "function");

const msg = definicao._mensagemNaoConsta("Betim");
ok("cita o município", /Betim/.test(msg));
ok('orienta a SOLICITAR mesmo assim, não só encaminhar',
   /solicit/i.test(msg) && /mesmo assim/i.test(msg));
ok("pede justificativa clínica em prontuário",
   /justificativa cl[ií]nica/i.test(msg) && /prontu[aá]rio/i.test(msg));
ok("escapa HTML do nome do município (XSS)",
   definicao._mensagemNaoConsta("<b>x</b>").indexOf("<b>x</b>") === -1);

console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
if (falhas) process.exit(1);
