#!/usr/bin/env node
/* ------------------------------------------------------------------
 * scripts/sync-exames.js — copia embutida da base de exames
 * ------------------------------------------------------------------
 * dados/exames.json e a fonte que o modulo busca pela internet a cada
 * carregamento. A copia embutida no pacote e o que o medico usa quando
 * essa busca falha: rede da unidade bloqueando o dominio, CSP do Meeds,
 * plantao sem internet.
 *
 * As duas precisam ter o MESMO conteudo. Editar so o exames.json e
 * esquecer de rodar isto faz quem cai no fallback nao ver os dados
 * novos — foi exatamente o que aconteceu no REMUME quando Barbacena
 * entrou so na fonte remota. O `--check` existe para o build barrar essa
 * divergencia antes de ela chegar no plantao.
 *
 * Uso:
 *   node scripts/sync-exames.js           regera o fallback
 *   node scripts/sync-exames.js --check   so verifica (usado no build)
 * ------------------------------------------------------------------ */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const FONTE = path.join(RAIZ, "dados/exames.json");
const DESTINO = path.join(RAIZ, "modules/exames/assets/fallback.js");

const CABECALHO = `/* ------------------------------------------------------------------
 * modules/exames/assets/fallback.js — GERADO, NAO EDITE
 * ------------------------------------------------------------------
 * Copia embutida de dados/exames.json, usada quando a busca remota
 * falha (sem internet, dominio bloqueado, CSP).
 *
 * Para mudar a lista de exames, edite as FONTES e rode:
 *   node scripts/montar-exames.js && node scripts/sync-exames.js
 * ------------------------------------------------------------------ */
`;

function gerar() {
  const dados = JSON.parse(fs.readFileSync(FONTE, "utf8"));
  return (
    CABECALHO +
    "(function (raiz) {\n" +
    '  "use strict";\n' +
    "  raiz.__MEEDS_EXAMES_FALLBACK__ = " +
    JSON.stringify(dados) +
    ";\n" +
    '})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);\n'
  );
}

function main() {
  if (!fs.existsSync(FONTE)) {
    console.error("dados/exames.json nao existe. Rode `node scripts/montar-exames.js` antes.");
    process.exit(1);
  }

  const novo = gerar();
  const conferindo = process.argv.indexOf("--check") !== -1;
  const atual = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, "utf8") : null;

  if (conferindo) {
    if (atual === novo) {
      console.log("  fallback de exames em dia");
      return;
    }
    console.error(
      "FALHA: modules/exames/assets/fallback.js esta diferente de dados/exames.json.\n" +
      "       Quem cair no fallback (sem internet, dominio bloqueado) veria a lista antiga.\n" +
      "       Rode: node scripts/sync-exames.js"
    );
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
  fs.writeFileSync(DESTINO, novo);

  const dados = JSON.parse(fs.readFileSync(FONTE, "utf8"));
  const ms = Object.keys(dados.municipios).filter((k) => k.indexOf("_") !== 0);
  const total = ms.reduce((a, m) => a + dados.municipios[m].exames.length, 0);
  console.log(
    "Gerado: modules/exames/assets/fallback.js (" +
    (novo.length / 1024).toFixed(0) + " KB) — " +
    ms.length + " municipio(s), " + total + " exame(s)"
  );
}

main();
