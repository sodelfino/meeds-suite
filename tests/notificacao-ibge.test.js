#!/usr/bin/env node
/**
 * tests/notificacao-ibge.test.js — assets do módulo de notificação
 *
 * Duas bases embutidas no pacote, geradas por script:
 *   - MEEDS_NOTIF_DENGUE_BASE_PDF_B64: a ficha oficial do SINAN (PDF).
 *   - MEEDS_MUNICIPIOS_IBGE: os 5.571 municípios por UF, com o código IBGE
 *     de 6 dígitos (o que a ficha pede — o 7º dígito é verificador).
 *
 * Código de município errado manda a notificação para a vigilância da
 * cidade errada; por isso esta base é conferida contra casos conhecidos.
 *
 * Uso:  node tests/notificacao-ibge.test.js
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

const ctx = {};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
["base-pdf-dengue.js", "municipios-ibge.js"].forEach((arq) => {
  const f = path.join(RAIZ, "modules/notificacao/assets", arq);
  if (fs.existsSync(f)) vm.runInContext(fs.readFileSync(f, "utf8"), ctx);
});

const IBGE = ctx.MEEDS_MUNICIPIOS_IBGE;
ok("a base de municípios existe", !!IBGE && typeof IBGE === "object");

const ufs = IBGE ? Object.keys(IBGE) : [];
ok("27 unidades da federação", ufs.length === 27, ufs.length);

const todos = ufs.reduce((acc, uf) => acc.concat(IBGE[uf].map((m) => ({ uf: uf, cod: m[0], nome: m[1] }))), []);
ok("5.571 municípios", todos.length === 5571, todos.length);
ok("todo código tem 6 dígitos", todos.every((m) => /^\d{6}$/.test(m.cod)));
ok("códigos únicos", new Set(todos.map((m) => m.cod)).size === todos.length);
ok("o código começa com o código da UF (RJ=33, MG=31)",
   todos.filter((m) => m.uf === "RJ").every((m) => m.cod.indexOf("33") === 0) &&
   todos.filter((m) => m.uf === "MG").every((m) => m.cod.indexOf("31") === 0));

const achar = (uf, nome) => (IBGE && IBGE[uf] || []).filter((m) => m[1] === nome).map((m) => m[0]);
ok("Macaé (RJ) = 330240", achar("RJ", "Macaé").join() === "330240");
ok("Piraí (RJ) = 330400", achar("RJ", "Piraí").join() === "330400");
ok("Congonhas (MG) = 311800", achar("MG", "Congonhas").join() === "311800");
ok("Sete Lagoas (MG) = 316720", achar("MG", "Sete Lagoas").join() === "316720");
ok("Barbacena (MG) = 310560", achar("MG", "Barbacena").join() === "310560");
ok("Franco da Rocha (SP) = 351640", achar("SP", "Franco da Rocha").join() === "351640");

const pdfB64 = ctx.MEEDS_NOTIF_DENGUE_BASE_PDF_B64;
ok("o PDF base existe", typeof pdfB64 === "string" && pdfB64.length > 1000);
if (typeof pdfB64 === "string") {
  const bin = Buffer.from(pdfB64, "base64");
  ok("o PDF base começa com %PDF", bin.slice(0, 5).toString("latin1") === "%PDF-");
  const paginas = (bin.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  ok("o PDF base tem 2 páginas", paginas === 2, paginas);
}

console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
if (falhas) process.exit(1);
