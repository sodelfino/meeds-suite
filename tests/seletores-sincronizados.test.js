#!/usr/bin/env node
/**
 * tests/seletores-sincronizados.test.js — as três cópias dos rótulos da tela
 *
 * ACHADO EM 06/10/2026, ao abrir a ficha de notificação num navegador de
 * verdade: o rótulo "Documentos" (onde o Meeds novo mostra CPF e CNS) tinha
 * sido adicionado em core/dom-reader.js na v2.51.0, mas o CPF continuava
 * sem ser lido. Causa: os rótulos que o dom-reader usa existem em TRÊS
 * lugares, e o nucleo SOBRESCREVE o primeiro pelo terceiro a cada carga:
 *
 *   1. core/dom-reader.js            VARIANTES            (a lista interna)
 *   2. core/core.user.js             SELETORES_FALLBACK   (embutida)
 *   3. seletores.json                (remota, buscada do GitHub a cada
 *                                     carga e aplicada com Object.assign
 *                                     por cima de 1 — core.user.js:137)
 *
 * Corrigir só a cópia 1 não muda nada em produção. O teste de 2.51.0
 * (tests/documentos-cpf.test.js) usava uma lista local no próprio teste e
 * por isso passou sem provar nada. Este teste compara as três cópias de
 * verdade, e confere que "Documentos" está nelas.
 *
 * Uso:  node tests/seletores-sincronizados.test.js
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

/* 1. a lista interna do dom-reader */
const ctx = { document: { querySelectorAll: () => [], body: { innerText: "" } } };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, "core/dom-reader.js"), "utf8"), ctx);
const interna = ctx.MeedsSuiteDom.VARIANTES;

/* 2. o fallback embutido em core.user.js (extraído do literal do arquivo) */
const fonteCore = fs.readFileSync(path.join(RAIZ, "core/core.user.js"), "utf8");
const inicio = fonteCore.indexOf("const SELETORES_FALLBACK = {");
let fallback = null;
if (inicio !== -1) {
  let nivel = 0;
  let fim = -1;
  for (let i = fonteCore.indexOf("{", inicio); i < fonteCore.length; i++) {
    if (fonteCore[i] === "{") nivel++;
    if (fonteCore[i] === "}" && --nivel === 0) { fim = i + 1; break; }
  }
  fallback = vm.runInNewContext("(" + fonteCore.slice(fonteCore.indexOf("{", inicio), fim) + ")").rotulos;
}

/* 3. a remota */
const remota = JSON.parse(fs.readFileSync(path.join(RAIZ, "seletores.json"), "utf8")).rotulos;

ok("achei o fallback embutido em core.user.js", !!fallback);
ok("achei a lista remota (seletores.json)", !!remota && !!remota.cpf);

const norm = (l) => (l || []).map((x) => x.toLowerCase()).sort().join("|");

["nascimento", "cpf", "mae", "telefone"].forEach((grupo) => {
  ok(grupo + ": dom-reader, fallback embutido e seletores.json têm a MESMA lista",
     norm(interna[grupo]) === norm(fallback && fallback[grupo]) && norm(interna[grupo]) === norm(remota && remota[grupo]),
     "interna=" + (interna[grupo] || []).length + " fallback=" + ((fallback && fallback[grupo]) || []).length + " remota=" + ((remota && remota[grupo]) || []).length);
});

/* O que importa na prática: o CPF do paciente sob "Documentos" (CPF + CNS). */
ok('"Documentos" está na lista de CPF do dom-reader', (interna.cpf || []).indexOf("Documentos") !== -1);
ok('"Documentos" está no fallback embutido', ((fallback && fallback.cpf) || []).indexOf("Documentos") !== -1);
ok('"Documentos" está no seletores.json remoto (o que a produção aplica por cima)', ((remota && remota.cpf) || []).indexOf("Documentos") !== -1);

console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
if (falhas) process.exit(1);
