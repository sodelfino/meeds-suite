#!/usr/bin/env node
/**
 * scripts/sync-fallback.js
 * Migrado de sodelfino/meeds-remume-assistant -> scripts/sync-fallback.js
 *
 * Sincroniza a copia embutida (fallback) das REMUMEs com o conteudo
 * atual de modules/remume/remumes.json.
 *
 * POR QUE ISSO EXISTE (motivo preservado do original)
 * remumes.json e a fonte que o modulo busca via internet a cada
 * carregamento do Meeds. A copia embutida no pacote e o que o medico usa
 * quando essa busca falha (rede da clinica bloqueando o dominio, CSP do
 * Meeds, sem internet). As duas precisam ter o MESMO conteudo — se
 * alguem editar so o remumes.json e esquecer de rodar este script, quem
 * cair no fallback nao ve os dados novos. Foi exatamente o que aconteceu
 * quando Barbacena entrou so no remumes.json e ficou faltando no
 * fallback.
 *
 * O QUE MUDOU NA MIGRACAO
 *  - o alvo deixou de ser o .user.js publicado e passou a ser o asset
 *    modules/remume/assets/fallback.js, que o build embute. Nao ha mais
 *    reescrita cirurgica de um trecho do userscript: o arquivo inteiro e
 *    regerado, o que elimina a classe de bug "nao achei o fechamento do
 *    bloco";
 *  - o bump de @version passou a mexer no manifest.json (versao do
 *    pacote e versao do modulo remume), que e a fonte de verdade do
 *    build — o Tampermonkey so baixa a atualizacao se a versao mudar.
 *
 * Uso:
 *   node scripts/sync-fallback.js
 *   node scripts/sync-fallback.js --check   # so verifica, nao escreve
 *
 * Depois de rodar: revise o diff, rode `node scripts/build.js`, teste
 * localmente e faca commit dos arquivos juntos.
 */

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const CAMINHO_JSON = path.join(RAIZ, "modules/remume/remumes.json");
const CAMINHO_FALLBACK = path.join(RAIZ, "modules/remume/assets/fallback.js");
const CAMINHO_MANIFEST = path.join(RAIZ, "manifest.json");

const soChecar = process.argv.includes("--check");

/* O fallback usa o formato de string LEGADO ("Nome (Local de acesso: X)")
 * porque e o formato que o modulo ja sabe ler — normalizarItemRemume()
 * aceita tanto a string legada quanto o objeto {nome, local} do JSON
 * remoto. Manter o legado aqui garante que o fallback continue
 * funcionando mesmo se o formato do JSON evoluir. */
function itemParaStringLegado(item) {
  if (typeof item === "string") return item;
  const nome = item.nome || "";
  return item.local ? `${nome} (Local de acesso: ${item.local})` : nome;
}

function gerarFallback(dados) {
  const normalizado = {};
  if (dados._meta) normalizado._meta = dados._meta;
  Object.keys(dados)
    .filter((c) => c !== "_meta")
    .forEach((cidade) => {
      normalizado[cidade] = dados[cidade].map(itemParaStringLegado);
    });

  const cabecalho = [
    "/* modules/remume/assets/fallback.js — GERADO AUTOMATICAMENTE",
    " * NAO EDITE A MAO. Edite modules/remume/remumes.json e rode:",
    " *   node scripts/sync-fallback.js",
    " *",
    " * Copia embutida das REMUMEs, usada SO quando a busca remota do",
    " * remumes.json falha (sem internet, dominio bloqueado, CSP). Em uso",
    " * normal o conteudo e substituido pela versao remota assim que a",
    " * pagina do Meeds carrega.",
    " */",
  ].join("\n");

  return (
    cabecalho +
    "\n(function (raiz) {\n" +
    '  "use strict";\n' +
    "  raiz.MEEDS_REMUMES_FALLBACK = " +
    JSON.stringify(normalizado, null, 2).split("\n").join("\n  ") +
    ";\n" +
    '})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);\n'
  );
}

function bumparPatch(versao) {
  const m = String(versao).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`versao em formato inesperado: ${versao}`);
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

function main() {
  const dados = JSON.parse(fs.readFileSync(CAMINHO_JSON, "utf8"));
  const novo = gerarFallback(dados);
  const atual = fs.existsSync(CAMINHO_FALLBACK) ? fs.readFileSync(CAMINHO_FALLBACK, "utf8") : "";

  const cidades = Object.keys(dados).filter((c) => c !== "_meta");
  const totalItens = cidades.reduce((s, c) => s + dados[c].length, 0);

  if (novo === atual) {
    console.log("Fallback ja esta em sincronia com remumes.json.");
    console.log(`  Municipios: ${cidades.length} | itens: ${totalItens}`);
    return;
  }

  if (soChecar) {
    console.error("FORA DE SINCRONIA: modules/remume/assets/fallback.js difere de remumes.json.");
    console.error("Rode: node scripts/sync-fallback.js");
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(CAMINHO_FALLBACK), { recursive: true });
  fs.writeFileSync(CAMINHO_FALLBACK, novo, "utf8");

  const manifest = JSON.parse(fs.readFileSync(CAMINHO_MANIFEST, "utf8"));
  const versaoPacoteAntiga = manifest.versao;
  manifest.versao = bumparPatch(manifest.versao);
  const modRemume = manifest.modulos.find((m) => m.id === "remume");
  const versaoModAntiga = modRemume ? modRemume.versao : null;
  if (modRemume) modRemume.versao = bumparPatch(modRemume.versao);
  fs.writeFileSync(CAMINHO_MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log("Fallback sincronizado com remumes.json:");
  console.log(`  Municipios: ${cidades.length} (${cidades.join(", ")})`);
  console.log(`  Total de itens: ${totalItens}`);
  console.log(`  Versao do pacote: ${versaoPacoteAntiga} -> ${manifest.versao}`);
  if (modRemume) console.log(`  Versao do modulo remume: ${versaoModAntiga} -> ${modRemume.versao}`);
  console.log("\nAgora rode: node scripts/build.js");
}

main();
