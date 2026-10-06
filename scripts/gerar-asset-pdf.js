#!/usr/bin/env node
/* ------------------------------------------------------------------
 * scripts/gerar-asset-pdf.js — PDF -> asset .js (base64) de um modulo
 * ------------------------------------------------------------------
 * O pacote e um unico arquivo, entao o PDF oficial que um gerador preenche
 * vai embutido em base64 num asset do modulo (ver modules/cmd/assets). Ate
 * aqui isso era feito a mao; este script torna reprodutivel.
 *
 * Uso:
 *   node scripts/gerar-asset-pdf.js <entrada.pdf> <saida.js> <NOME_GLOBAL> "<descricao>"
 *
 * Exemplo (ficha de dengue/chikungunya):
 *   node scripts/gerar-asset-pdf.js modules/notificacao/assets/ficha-dengue-chikungunya.pdf \
 *     modules/notificacao/assets/base-pdf-dengue.js MEEDS_NOTIF_DENGUE_BASE_PDF_B64 \
 *     "Ficha de Investigacao Dengue e Febre de Chikungunya (SINAN, SVS 14/03/2016)"
 * ------------------------------------------------------------------ */
const fs = require("fs");
const path = require("path");

const [entrada, saida, nomeGlobal, descricao] = process.argv.slice(2);
if (!entrada || !saida || !nomeGlobal) {
  console.error('Uso: node scripts/gerar-asset-pdf.js <entrada.pdf> <saida.js> <NOME_GLOBAL> "<descricao>"');
  process.exit(2);
}
if (!/^[A-Z][A-Z0-9_]*$/.test(nomeGlobal)) {
  console.error("NOME_GLOBAL deve ser MAIUSCULO_COM_UNDERLINE (ex.: MEEDS_X_BASE_PDF_B64).");
  process.exit(2);
}

const bytes = fs.readFileSync(entrada);
if (bytes.slice(0, 5).toString("latin1") !== "%PDF-") {
  console.error("O arquivo de entrada nao e um PDF: " + entrada);
  process.exit(2);
}

const b64 = bytes.toString("base64");
const rel = path.relative(process.cwd(), path.resolve(saida)).split(path.sep).join("/");
const conteudo =
  "/* " + rel + " — GERADO, NAO EDITE\n" +
  " * " + (descricao || "PDF base") + ", embutido em base64.\n" +
  " * Origem: " + path.basename(entrada) + " (" + bytes.length + " bytes).\n" +
  " * Para regerar:  node scripts/gerar-asset-pdf.js " + path.relative(process.cwd(), path.resolve(entrada)).split(path.sep).join("/") + " " + rel + " " + nomeGlobal + " \"...\"\n" +
  " * Separado do index.js so para o codigo do modulo continuar legivel —\n" +
  " * o build reune os dois no bundle final. */\n" +
  "(function (raiz) {\n" +
  '  "use strict";\n' +
  "  raiz." + nomeGlobal + ' = "' + b64 + '";\n' +
  '})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);\n';

fs.writeFileSync(saida, conteudo);
console.log("Gerado: " + rel + " (" + Math.round(conteudo.length / 1024) + " KB, global " + nomeGlobal + ")");
