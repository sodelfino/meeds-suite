/* Fonte transcrita do Excel municipal, com linhas e SHA-256 na fixture.
 * Alterar, omitir ou acrescentar um item deve reprovar esta conferência.
 * As duas linhas de doxiciclina representam programas diferentes, não doses diferentes.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const fonte = require("./fixtures/remume-para-de-minas.json");
const remumes = require("../modules/remume/remumes.json");
const cidade = "Pará de Minas";
const itens = remumes[cidade];
const compactar = (texto) => texto.replace(/\s+/g, " ").trim();

assert(Array.isArray(itens), "Pará de Minas precisa estar na REMUME");
assert.strictEqual(fonte.itens.length, 197);
assert.strictEqual(fonte.itens.filter((i) => i.componente === "básico").length, 130);
assert.strictEqual(itens.length, 196, "Doxiciclina deve aparecer uma vez, com os dois programas");
assert.deepStrictEqual(itens.map((i) => i.nome), [...new Set(fonte.itens.map((i) => i.nome))]);
for (const item of itens) {
  const original = fonte.itens.find((i) => i.nome === item.nome);
  assert.strictEqual(item.local, original.componente === "básico" ? "Farmácia Central" : null);
  const azul = /^(Clonazepam|Diazepam)\b/.test(item.nome);
  assert.strictEqual(item.receituario || null, azul ? "azul" : null);
}
console.log("ok: 196 itens conferidos com as 197 linhas da fonte, sem completar nomes ou locais");

let modulo;
const ctx = {
  console, setTimeout: () => 0, setInterval: () => 0, clearInterval: () => {},
  document: { createElement: () => ({}) },
  MeedsSuite: { registerModule: (def) => { modulo = def; } },
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
const raiz = path.join(__dirname, "..");
for (const arquivo of ["core/dom-reader.js", "core/busca.js", "modules/remume/index.js"]) {
  vm.runInContext(fs.readFileSync(path.join(raiz, arquivo), "utf8"), ctx);
}
modulo._definirRemumesParaTeste(remumes);
for (const original of fonte.itens) {
  const avisos = modulo._avisosDoItem(cidade, original.nome).map(compactar);
  if (original.observacao) {
    assert(avisos.includes(compactar(original.observacao)), "Observação ausente na linha " + original.linha);
  }
  if (original.programa) {
    assert(avisos.some((a) => a.includes(compactar(original.programa)) && a.includes(compactar(original.documentos))),
      "Programa/documentos ausentes na linha " + original.linha);
  }
}
const sertralina = modulo._avisosDoItem(cidade, "Sertralina 25mg").join(" ");
assert(sertralina.includes("GESTANTES"));
assert(!modulo._avisosDoItem("Betim", "Sertralina 25mg").some((a) => a.includes("GESTANTES")));
assert(!modulo._avisosDoItem(cidade, "Sinvastatina 20 mg - Comprimido").some((a) => a.includes("GESTANTES")));
assert.strictEqual(modulo._avisosDoItem(cidade, "Doxiciclina 100 mg - Comprimido").length, 2);
const avisoMunicipio = remumes._meta.avisos[cidade];
for (const linha of [160, 161, 162, 163, 164, 165, 168, 169, 170, 171, 278]) {
  assert(compactar(avisoMunicipio).includes(compactar(fonte.orientacoes[linha])), "Orientação ausente: " + linha);
}
assert(avisoMunicipio.includes("CEAF") && avisoMunicipio.includes("SES"));
console.log("ok: observações, documentos, programas e orientações preservados e restritos ao município");

vm.runInContext(fs.readFileSync(path.join(raiz, "modules/remume/assets/fallback.js"), "utf8"), ctx);
assert.strictEqual(JSON.stringify(ctx.MEEDS_REMUMES_FALLBACK._meta), JSON.stringify(remumes._meta));
assert.deepStrictEqual(Array.from(ctx.MEEDS_REMUMES_FALLBACK[cidade], (item) => {
  const n = modulo._normalizarItemRemume(item);
  return { nome: n.nome, local: n.local, receituario: n.receituario };
}), itens.map((i) => ({ nome: i.nome, local: i.local, receituario: i.receituario || null })));
const busca = ctx.MeedsSuiteBusca;
const indice = busca.criarIndice(itens, (i) => i.nome);
for (const termo of ["dipirona", "sertralina", "doxiciclina", "insulina", "nirmatrelvir"]) {
  const resultado = busca.buscar(termo, indice);
  assert(resultado.itens.length > 0, "Busca não encontrou: " + termo);
  assert(resultado.itens.every((r) => itens.includes(r.item || r)), "Busca retornou item de fora do município");
}
assert.strictEqual(busca.buscar("xyzabcmedicamento", indice).total, 0);
console.log("ok: cópia offline idêntica e busca limitada à lista municipal");
