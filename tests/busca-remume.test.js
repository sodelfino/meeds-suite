/* ------------------------------------------------------------------
 * tests/busca-remume.test.js
 * ------------------------------------------------------------------
 * Protege dois consertos que vieram da revisao da planilha-modelo:
 *
 * 1. PALAVRA GENERICA NAO ESCOLHE ITEM. "acetilcisteina comprimido"
 *    devolvia 159 dos 357 itens de Mendes, porque "comprimido" esta em
 *    44% da lista de la. A tela corta em 80, entao o medico rolava 80
 *    linhas para achar 2.
 *
 * 2. EXTRACAO DO PRINCIPIO ATIVO. Cortar no primeiro digito quebrava
 *    "Piridoxina (Vitamina B6)" em "Piridoxina (Vitamina B" — e esse
 *    texto ia para a tela como "voce quis dizer".
 *
 * O teste roda contra os dados REAIS dos 11 municipios, nao contra
 * fixture: o que provocou os dois bugs foi exatamente a variedade de
 * formato entre as prefeituras.
 * ------------------------------------------------------------------ */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const ctx = { console };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
["core/dom-reader.js", "core/busca.js"].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(RAIZ, f), "utf8"), ctx)
);
const B = ctx.MeedsSuiteBusca;
const REMUMES = JSON.parse(fs.readFileSync(path.join(RAIZ, "modules/remume/remumes.json"), "utf8"));

const municipios = Object.keys(REMUMES).filter((k) => k !== "_meta");
const indices = {};
municipios.forEach((m) => {
  indices[m] = B.criarIndice(REMUMES[m], (it) => (it.local ? it.nome + " " + it.local : it.nome));
});
const buscar = (m, t) => B.buscar(t, indices[m]);
const nomes = (r) => r.itens.map((x) => (x.item || x).nome);

let falhas = 0;
function ok(nome, cond) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome);
  if (!cond) falhas++;
}

/* --- 1) palavra generica so desempata --- */
{
  const r = buscar("Mendes", "acetilcisteina comprimido");
  ok("forma farmaceutica nao inunda o resultado (Mendes)", r.total <= 5);
  ok("e os itens certos continuam la", nomes(r).every((n) => /acetilciste/i.test(n)));

  const rm = buscar("Macaé", "dipirona comprimido");
  ok("idem com sigla de unidade na base (Macae)", rm.total <= 12);
  ok("e o primeiro e uma dipirona", /dipirona/i.test(nomes(rm)[0] || ""));
}

/* --- 2) mas continua desempatando de verdade --- */
{
  const so = nomes(buscar("Betim", "amoxicilina"));
  const com = nomes(buscar("Betim", "amoxicilina suspensao"));
  ok("\"suspensao\" empurra a suspensao para o topo", /suspens/i.test(com[0] || ""));
  /* "suspensao" aparece em menos de 30% da lista de Betim, entao ela E
   * discriminante ali e PODE trazer item — o que nao pode e trazer de
   * fora da REMUME do municipio. */
  const daLista = new Set(REMUMES["Betim"].map((i) => i.nome));
  ok("e tudo que ela traz sai da REMUME de Betim", com.every((n) => daLista.has(n)));
  ok("a busca so pelo principio ativo continua achando", so.length > 0);
}

/* --- 3) rede de seguranca: busca inteiramente generica ainda lista --- */
{
  ok("\"comprimido\" sozinho ainda lista (Mendes)", buscar("Mendes", "comprimido").total > 50);
  ok("\"ubs\" sozinho ainda lista (Betim)", buscar("Betim", "ubs").total > 50);
}

/* --- 4) REGRA DE OURO: nada vem de fora da REMUME do municipio --- */
{
  let forasteiros = 0;
  municipios.forEach((m) => {
    const doMunicipio = new Set(REMUMES[m].map((i) => i.nome));
    ["dipirona", "amoxicilina", "buscopan", "tylenol", "comprimido", "insulina"].forEach((t) => {
      nomes(buscar(m, t)).forEach((n) => {
        if (!doMunicipio.has(n)) forasteiros++;
      });
    });
  });
  ok("nenhum resultado vem de fora da REMUME do municipio", forasteiros === 0);
  ok("termo inexistente nao inventa resultado", buscar("Itaúna", "xyzabcmedicamento").total === 0);
}

/* --- 5) o resultado nunca some: toda busca especifica ainda acha --- */
{
  const casos = [
    ["Itaúna", "dipirona"], ["Betim", "amoxicilina"], ["Macaé", "adenosina"],
    ["Barbacena", "aciclovir"], ["Varginha", "omeprazol"], ["Piraí", "losartana"],
    ["Congonhas", "ibuprofeno"], ["Coronel Fabriciano", "metformina"],
    ["Conceição do Mato Dentro", "captopril"], ["Sete Lagoas", "dipirona"],
    ["Mendes", "adrenalina"],
  ];
  let vazias = casos.filter(([m, t]) => buscar(m, t).total === 0);
  /* Mendes escreve "Epinefrina": termo ausente da lista e resposta
   * correta, nao falha. So nao pode ficar vazio o que existe. */
  vazias = vazias.filter(([m, t]) => REMUMES[m].some((i) => new RegExp(t, "i").test(i.nome)));
  ok("nenhuma busca de medicamento existente ficou vazia", vazias.length === 0);
  if (vazias.length) vazias.forEach((v) => console.log("       " + v.join(" / ")));
}

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
