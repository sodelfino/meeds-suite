#!/usr/bin/env node
/* ------------------------------------------------------------------
 * scripts/sync-municipios-ibge.js — lista de municipios do IBGE embutida
 * ------------------------------------------------------------------
 * A ficha de notificacao (SINAN) pede o municipio de residencia com o
 * CODIGO IBGE de 6 digitos (o 7o digito do codigo oficial e so
 * verificador). O medico escolhe o municipio numa lista e o codigo entra
 * sozinho — a lista vai EMBUTIDA no pacote (5.571 municipios, ~140 KB):
 * funciona sem internet e sem liberar nenhum endereco novo no Tampermonkey.
 *
 * Fonte: API de localidades do IBGE. Os municipios mudam raramente (um ou
 * dois por ano); rode isto quando o IBGE criar/extinguir um municipio e
 * confira o diff — o teste tests/notificacao-ibge.test.js acusa se a
 * contagem ou os casos conhecidos mudarem.
 *
 * Uso:
 *   node scripts/sync-municipios-ibge.js                   baixa do IBGE
 *   node scripts/sync-municipios-ibge.js --arquivo x.json  usa um JSON ja baixado
 * ------------------------------------------------------------------ */
const fs = require("fs");
const https = require("https");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const DESTINO = path.join(RAIZ, "modules/notificacao/assets/municipios-ibge.js");
const URL_IBGE = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome";

function baixar(url) {
  return new Promise(function (resolve, reject) {
    https
      .get(url, function (res) {
        if (res.statusCode !== 200) {
          reject(new Error("IBGE respondeu HTTP " + res.statusCode));
          return;
        }
        const partes = [];
        res.on("data", function (c) { partes.push(c); });
        res.on("end", function () { resolve(Buffer.concat(partes).toString("utf8")); });
      })
      .on("error", reject);
  });
}

function ufDe(m) {
  /* municipio sem microrregiao (ex.: Brasilia e alguns recentes) cai na regiao imediata */
  const micro = m.microrregiao && m.microrregiao.mesorregiao && m.microrregiao.mesorregiao.UF;
  const imed = m["regiao-imediata"] && m["regiao-imediata"]["regiao-intermediaria"] && m["regiao-imediata"]["regiao-intermediaria"].UF;
  return (micro || imed).sigla;
}

function compactar(municipios) {
  const porUf = {};
  municipios
    .map(function (m) { return { uf: ufDe(m), cod: String(m.id).slice(0, 6), nome: m.nome }; })
    .sort(function (a, b) {
      return a.uf === b.uf ? a.nome.localeCompare(b.nome, "pt-BR") : a.uf.localeCompare(b.uf);
    })
    .forEach(function (m) {
      (porUf[m.uf] = porUf[m.uf] || []).push([m.cod, m.nome]);
    });
  return porUf;
}

function gerar(porUf) {
  return (
    "/* modules/notificacao/assets/municipios-ibge.js — GERADO, NAO EDITE\n" +
    " * Municipios do Brasil por UF, com o codigo IBGE de 6 digitos (o que a\n" +
    " * ficha de notificacao do SINAN pede). Fonte: API de localidades do IBGE.\n" +
    " * Para regerar:  node scripts/sync-municipios-ibge.js */\n" +
    "(function (raiz) {\n" +
    '  "use strict";\n' +
    "  raiz.MEEDS_MUNICIPIOS_IBGE = " + JSON.stringify(porUf) + ";\n" +
    '})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);\n'
  );
}

async function main() {
  const i = process.argv.indexOf("--arquivo");
  const bruto = i !== -1 ? fs.readFileSync(process.argv[i + 1], "utf8") : await baixar(URL_IBGE);
  const porUf = compactar(JSON.parse(bruto));
  const total = Object.keys(porUf).reduce(function (n, uf) { return n + porUf[uf].length; }, 0);
  if (Object.keys(porUf).length !== 27 || total < 5500) {
    throw new Error("Lista suspeita: " + Object.keys(porUf).length + " UFs, " + total + " municipios. Nada foi gravado.");
  }
  fs.writeFileSync(DESTINO, gerar(porUf));
  console.log("Gerado: modules/notificacao/assets/municipios-ibge.js — " + Object.keys(porUf).length + " UFs, " + total + " municipios.");
}

main().catch(function (e) {
  console.error(e.message || e);
  process.exit(1);
});
