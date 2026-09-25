#!/usr/bin/env node
/**
 * tests/municipio-formatos.test.js — os dois formatos de nome de cliente
 *
 * 25/09/2026: os clientes do Meeds estao sendo renomeados de
 * "PREFEITURA MUNICIPAL DE MACAÉ" para "MACAÉ - RJ" (so o municipio e a
 * UF), com a unidade na linha de baixo do "Vinculos". A troca e feita
 * cliente a cliente, entao os DOIS formatos convivem.
 *
 * Tudo que descobre o municipio passa por core/municipio.js (APAC,
 * Exames, Avisos) ou pela REMUME. Este teste pega TODOS os municipios que
 * o Assistente conhece — dos dados reais de cada modulo — e confere que
 * cada um e reconhecido nos dois formatos, e que nenhum vira outro.
 *
 * Uso:  node tests/municipio-formatos.test.js
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
const ler = (r) => JSON.parse(fs.readFileSync(path.join(RAIZ, r), "utf8"));

let remume = null;
const ctx = {
  console: { log() {}, warn() {}, debug() {} }, JSON, String, Object, Array, RegExp, Promise, Set, Map,
  setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0,
  document: { createElement: () => ({}), body: { innerText: "" } },
  MeedsSuite: { registerModule: (def) => { remume = def; } },
  MeedsSuiteDecisao: { unicoOuNada: (l) => (l.length === 1 ? l[0] : null) },
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, "core/dom-reader.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, "core/municipio.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, "modules/remume/index.js"), "utf8"), ctx);
const M = ctx.MeedsSuiteMunicipio;
const REM = ler("modules/remume/remumes.json");
remume._definirRemumesParaTeste(REM);

/* UF de cada municipio conhecido. */
const UF = {
  "Macaé": "RJ", "Piraí": "RJ", "Mendes": "RJ", "Franco da Rocha": "SP",
};
const uf = (m) => UF[m] || "MG";

const listas = {
  REMUME: Object.keys(REM).filter((k) => k !== "_meta"),
  APAC: Object.keys(ler("dados/apac.json").municipios),
  Exames: Object.keys(ler("dados/exames.json").municipios),
  Avisos: Object.keys(ler("dados/avisos-municipio.json").municipios),
};

Object.keys(listas).forEach((modulo) => {
  const nomes = listas[modulo];
  const errados = [];
  nomes.forEach((m) => {
    const formatos = [
      "PREFEITURA MUNICIPAL DE " + m.toUpperCase(),
      m.toUpperCase() + " - " + uf(m),
      m + " - " + uf(m).toLowerCase(),
      m.toUpperCase() + "/" + uf(m),
    ];
    formatos.forEach((f) => {
      const achou = M.detectar({ cliente: { razaoSocialNome: f } }, nomes);
      if (achou !== m) errados.push(f + " -> " + achou);
    });
  });
  ok(modulo + ": " + nomes.length + " município(s), antigo e novo formato reconhecidos", errados.length === 0, errados.join(" | "));
});

/* A REMUME tem a sua propria deteccao pela rede. */
{
  const errados = listas.REMUME.filter((m) =>
    remume._detectarMunicipioDoAtendimento({ cliente: { razaoSocialNome: m.toUpperCase() + " - " + uf(m) } }) !== m);
  ok("REMUME, detecção própria: formato novo em todos os " + listas.REMUME.length + " municípios", errados.length === 0, errados.join(", "));
  ok("REMUME, detecção própria: formato antigo continua",
     remume._detectarMunicipioDoAtendimento({ cliente: { razaoSocialNome: "PREFEITURA MUNICIPAL DE BARBACENA" } }) === "Barbacena");
}

/* Nada vira outra cidade. */
ok("'MENDES - RJ' não vira outra cidade", M.detectar({ cliente: { razaoSocialNome: "MENDES - RJ" } }, listas.REMUME) === "Mendes");
ok("cidade fora da lista ('MARICÁ - RJ'): nenhum", M.detectar({ cliente: { razaoSocialNome: "MARICÁ - RJ" } }, listas.REMUME) === null);
ok("sufixo que não é UF ('BARBACENA - XX') não é cortado", M.extrairNomeCidade("BARBACENA - XX") === "barbacena - xx");
ok("cidadesDoAtendimento vê o formato novo", M.cidadesDoAtendimento({ cliente: { razaoSocialNome: "MACAÉ - RJ" } }).join() === "macae");

/* Vinculos (o que o medico ve no cartao do paciente). */
const K = listas.Avisos.concat(listas.REMUME);
const V = (l) => JSON.stringify(M.analisarVinculo(l, K));
ok("Vínculos novo (print de 25/09): MACAÉ - RJ / CLINICA DO AUTISTA",
   V(["MACAÉ - RJ", "CLINICA DO AUTISTA"]) === JSON.stringify({ cidades: ["macae"], unidades: ["clinica do autista"] }));
ok("Vínculos novo, grudado numa linha", V(["MACAÉ - RJCLINICA DO AUTISTA"]) === V(["MACAÉ - RJ", "CLINICA DO AUTISTA"]));
ok("Vínculos antigo continua", V(["PREFEITURA MUNICIPAL DE MACAÉ", "CLINICA DO AUTISTA"]) === V(["MACAÉ - RJ", "CLINICA DO AUTISTA"]));
ok("cliente renomeado sem UF ('BARBACENA'): linha de cidade", V(["BARBACENA", "UPA BARBACENA"]) === JSON.stringify({ cidades: ["barbacena"], unidades: ["upa barbacena"] }));
ok("unidade com nome de cidade dentro ('UPA BARBACENA') NÃO vira cidade", M.analisarVinculo(["UPA BARBACENA"], K).cidades.length === 0);
ok("duas cidades no vínculo (formato novo): as duas aparecem", M.analisarVinculo(["MACAÉ - RJ", "BARBACENA - MG"], K).cidades.length === 2);
ok("formatos misturados no mesmo vínculo: as duas aparecem", M.analisarVinculo(["MACAÉ - RJ", "PREFEITURA MUNICIPAL DE BARBACENA"], K).cidades.length === 2);

/* Leitura da TELA inteira (REMUME/APAC/Exames): "macae" esta dentro de "macae - rj". */
ctx.MeedsSuiteDom.textoDaPaginaNormalizado = () => "vinculos macae - rj clinica do autista";
ok("detecção pela tela com o formato novo", M.detectarNaTela(listas.REMUME) === "Macaé");

console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
if (falhas) process.exit(1);
