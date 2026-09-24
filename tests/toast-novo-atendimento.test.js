#!/usr/bin/env node
/**
 * tests/toast-novo-atendimento.test.js — o toast "novo paciente" do Meeds V2
 *
 * REGRESSAO CONFIRMADA em 22/09/2026, por evidência real (gravação Jam do
 * ambiente des-doctor-calltech.meeds.com.br, não suposição): o toast de
 * chegada mudou de "Novo Atendimento" (v1) para "Novo paciente na fila de
 * Pronto Atendimento" (v2). As duas frases não compartilham nenhum
 * substring contíguo ("novo" e "atendimento" ficam separados por "paciente
 * na fila de pronto"), então o casamento por `indexOf` que o alarme usa
 * NUNCA dispararia sozinho no v2 — o Sinal A (toast) do alarme de fila
 * ficaria mudo, silenciosamente, sem erro nenhum no console.
 *
 * Este teste prova, com o motor de normalização REAL (core/dom-reader.js),
 * que a variante nova cadastrada em seletores.json/core.user.js resolve
 * isso — e que a frase antiga do v1 continua funcionando também (nenhuma
 * variante foi removida, só acrescentada).
 *
 * Uso:  node tests/toast-novo-atendimento.test.js
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

const ctx = { console, JSON, String, Object, Array, RegExp, Promise, fetch: () => Promise.resolve(null) };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, "core/dom-reader.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, "core/core.user.js"), "utf8"), ctx);

const normalizar = ctx.MeedsSuiteDom.normalizarTexto;
const variantes = ctx.MeedsSuite.seletor("toasts", "novoAtendimento").map(normalizar);

ok("a variante do v1 continua cadastrada", variantes.indexOf(normalizar("novo atendimento")) !== -1);

/* O texto REAL, visto no toast do v2 (confirmado por frame de vídeo, não
 * lido no manual): "Novo paciente na fila de Pronto Atendimento". O
 * elemento de toast costuma trazer o título como um leaf próprio — a
 * checagem do alarme é "o texto do leaf CONTÉM a variante", então basta
 * a variante estar contida no texto do leaf. */
const textoDoLeafReal = "Novo paciente na fila de Pronto Atendimento";
const normReal = normalizar(textoDoLeafReal);
const achouAlgumaVariante = variantes.some((v) => v && normReal.indexOf(v) !== -1);
ok("o toast real do v2 casa com alguma variante cadastrada", achouAlgumaVariante,
   JSON.stringify(variantes));

/* Prova negativa: a frase antiga sozinha, testada contra o texto novo,
 * NÃO deveria casar — documenta por que a variante nova era necessária
 * (se este assert falhar um dia, a frase antiga passou a bastar sozinha
 * e o comentário acima ficou desatualizado). */
const soAFraseAntiga = normalizar("novo atendimento");
ok("a frase antiga sozinha NÃO casava com o texto novo (por isso a variante extra)",
   normReal.indexOf(soAFraseAntiga) === -1);

console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
if (falhas) process.exit(1);
