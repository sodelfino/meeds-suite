#!/usr/bin/env node
/**
 * scripts/sync-cid10.js
 *
 * Regenera a copia embutida (fallback) da CID-10 a partir de
 * dados/cid10.json.
 *
 * POR QUE EXISTE
 * dados/cid10.json tem ~1 MB e e buscado pela internet a cada
 * carregamento — embutir no pacote faria toda atualizacao do userscript
 * baixar isso de novo, sem necessidade. O fallback embutido e uma copia
 * REDUZIDA, usada so quando essa busca falha (sem internet, dominio
 * bloqueado, CSP). Sao os codigos que os tres geradores de laudo ja
 * traziam pre-cadastrados.
 *
 * Mesmo raciocinio do scripts/sync-fallback.js, que faz isso para o
 * REMUME.
 *
 * Uso:
 *   node scripts/sync-cid10.js
 *   node scripts/sync-cid10.js --check
 */

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const CAMINHO_BASE = path.join(RAIZ, "dados/cid10.json");
const CAMINHO_FORM = path.join(RAIZ, "dados/formularios.json");
const CAMINHO_FALLBACK = path.join(RAIZ, "modules/cid10/assets/fallback.js");

const soChecar = process.argv.includes("--check");

function gerar() {
  const base = JSON.parse(fs.readFileSync(CAMINHO_BASE, "utf8")).cids;
  const form = JSON.parse(fs.readFileSync(CAMINHO_FORM, "utf8"));

  /* Quais codigos entram no fallback: os que os laudos ja traziam. A
   * descricao vem SEMPRE da base oficial, nao da lista antiga — assim as
   * duas nunca divergem. */
  const curados = {};
  ["lme-sete-lagoas", "cmd", "apac-itauna"].forEach((k) => {
    Object.assign(curados, (form[k] && form[k].cids) || {});
  });

  const fallback = {};
  const ausentes = [];
  Object.keys(curados)
    .sort()
    .forEach((cod) => {
      if (base[cod]) fallback[cod] = base[cod];
      else ausentes.push(cod);
    });

  const conteudo =
    `/* modules/cid10/assets/fallback.js — GERADO AUTOMATICAMENTE\n` +
    ` * NAO EDITE A MAO. Rode: node scripts/sync-cid10.js\n` +
    ` *\n` +
    ` * Copia REDUZIDA da CID-10, usada so quando a busca do dados/cid10.json\n` +
    ` * falha (sem internet, dominio bloqueado, CSP). Sao os codigos que os\n` +
    ` * tres geradores de laudo ja traziam pre-cadastrados — o suficiente para\n` +
    ` * o medico nao ficar sem nada. Com internet, a base completa\n` +
    ` * (${Object.keys(base).length} codigos) substitui esta assim que a pagina carrega.\n` +
    ` */\n` +
    `(function (raiz) {\n` +
    `  "use strict";\n` +
    `  raiz.MEEDS_CID10_FALLBACK = ${JSON.stringify(fallback, null, 2).split("\n").join("\n  ")};\n` +
    `})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);\n`;

  return { conteudo, total: Object.keys(fallback).length, base: Object.keys(base).length, ausentes };
}

const r = gerar();
const atual = fs.existsSync(CAMINHO_FALLBACK) ? fs.readFileSync(CAMINHO_FALLBACK, "utf8") : "";

if (r.conteudo === atual) {
  console.log("Fallback da CID-10 ja esta em sincronia.");
  console.log(`  Base completa: ${r.base} codigos | fallback: ${r.total}`);
} else if (soChecar) {
  console.error("FORA DE SINCRONIA: modules/cid10/assets/fallback.js difere de dados/cid10.json.");
  console.error("Rode: node scripts/sync-cid10.js");
  process.exit(1);
} else {
  fs.writeFileSync(CAMINHO_FALLBACK, r.conteudo, "utf8");
  console.log("Fallback da CID-10 regenerado:");
  console.log(`  Base completa: ${r.base} codigos | fallback: ${r.total}`);
  console.log("\nAgora rode: node scripts/build.js");
}

if (r.ausentes.length) {
  console.warn(`\nAVISO: ${r.ausentes.length} codigo(s) do formulario nao existem na CID-10 e ficaram de fora:`);
  console.warn("  " + r.ausentes.join(", "));
}
