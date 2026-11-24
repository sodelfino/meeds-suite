/* tests/protocolos.test.js — protocolo de exames por especialidade (Varginha)
 * Roda contra o dados/exames.json REAL. Protocolo NAO e lista de oferta:
 * por isso fica em `protocolos`, fora de `municipios`. */
const fs = require("fs");
const path = require("path");

const BASE = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dados/exames.json"), "utf8"));

let falhas = 0;
function ok(nome, cond, detalhe) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome);
  if (!cond) {
    falhas++;
    if (detalhe) console.log("        " + detalhe);
  }
}

const V = BASE.protocolos && BASE.protocolos.Varginha;
ok("protocolos.Varginha existe", !!V);
if (!V) process.exit(1);

ok("fonte e atualizadoEm", !!V.fonte && /^\d{4}-\d{2}-\d{2}$/.test(V.atualizadoEm));
const esp = V.especialidades;
ok("especialidades certas", JSON.stringify(Object.keys(esp).sort()) === '["Cardiologia","Dermatologia","Endocrinologia"]');
ok("numero de condicoes 9/31/5", esp.Cardiologia.condicoes.length === 9 && esp.Dermatologia.condicoes.length === 31 && esp.Endocrinologia.condicoes.length === 5);
ok("orientacoes gerais: 7 em Cardio e Endocrino, nenhuma em Dermato",
  esp.Cardiologia.orientacoesGerais.length === 7 && esp.Endocrinologia.orientacoesGerais.length === 7 && !esp.Dermatologia.orientacoesGerais);

const itens = [];
let semConteudo = [];
Object.entries(esp).forEach(([e, s]) => s.condicoes.forEach((c) => {
  const gs = c.grupos || [];
  const n = gs.reduce((a, x) => a + x.itens.length, 0) + (c.notas || []).length;
  if (!c.nome || !n) semConteudo.push(e + "/" + c.nome);
  gs.forEach((x) => x.itens.forEach((it) => itens.push(it)));
}));
ok("toda condicao tem nome e item ou nota", !semConteudo.length, semConteudo.join(", "));
ok("itens: exame e quando validos", itens.every((it) =>
  [it.exame, it.quando].every((t) => typeof t === "string" && t && !/\n| {2}/.test(t))));

const vazios = [];
(function vazio(o, p) {
  if (o === "" || (Array.isArray(o) && !o.length)) vazios.push(p);
  else if (o && typeof o === "object") Object.keys(o).forEach((k) => vazio(o[k], p + "." + k));
})(V, "Varginha");
ok("nenhum campo vazio", !vazios.length, vazios.join(", "));
ok("Varginha fora de municipios", !(BASE.municipios && BASE.municipios.Varginha));

const card = esp.Cardiologia.condicoes.find((c) => c.nome === "Cardiopatia isquêmica");
ok("Cardio: Doppler de carotidas", card && card.grupos.some((g) => g.itens.some((i) => i.exame === "Doppler de carótidas")));
const nod = esp.Endocrinologia.condicoes.find((c) => c.nome === "Nódulos da tireoide");
ok("Endocrino: PAAF", nod && nod.grupos.some((g) => g.itens.some((i) => i.exame.startsWith("Punção aspirativa por agulha fina"))));
const ultima = esp.Dermatologia.condicoes[30];
ok("Dermato: ultima e DPN", ultima.nome === "Dermatose papulosa nigra — DPN");

if (falhas) { console.log("\n" + falhas + " falha(s)"); process.exit(1); }
console.log("\ntudo ok");
