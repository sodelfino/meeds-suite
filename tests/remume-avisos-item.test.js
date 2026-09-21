/* ------------------------------------------------------------------
 * tests/remume-avisos-item.test.js — aviso por termo no nome do item
 * ------------------------------------------------------------------
 * Franco da Rocha: item com "ampola" no nome mostra o aviso de
 * encaminhar ao presencial se houver necessidade de administracao. A
 * regra mora em REMUMES._meta.avisosItens[cidade] e vale para todo item
 * cujo nome contenha o termo — incluindo "frasco-ampola".
 * ------------------------------------------------------------------ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs !== undefined ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}

const RAIZ = path.join(__dirname, "..");
let capturado = null;
const ctx = {
  console, JSON, String, Object, Array, RegExp, Promise,
  setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0,
  document: { createElement: () => ({}) },
  MeedsSuite: { registerModule: (def) => { capturado = def; } },
  MeedsSuiteDom: { normalizarTexto: (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() },
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, "modules/remume/index.js"), "utf8"), ctx);

const REMUMES = JSON.parse(fs.readFileSync(path.join(RAIZ, "modules/remume/remumes.json"), "utf8"));
capturado._definirRemumesParaTeste(REMUMES);
const A = capturado._avisosDoItem;
const TEXTO = "Se houver necessidade de administração, encaminhe o paciente para o presencial.";

ok("ampola em Franco da Rocha tem o aviso", A("Franco da Rocha", "Adenosina ampola 6 mg/2 ml").join() === TEXTO);
ok("frasco-ampola tambem", A("Franco da Rocha", "Ceftriaxona IV frasco-ampola 1 g").join() === TEXTO);
ok("ampolas (plural, lista simples) tambem", A("Franco da Rocha", "Haloperidol decanoato 70,62 mg, ampola").join() === TEXTO);
ok("comprimido nao tem", A("Franco da Rocha", "Dipirona 500 mg, comprimidos").length === 0);
ok("frasco simples (soro) nao tem", A("Franco da Rocha", "Água Destilada frasco 250 ml").length === 0);
ok("outro municipio com ampola NAO tem (a regra e so de Franco)", A("Betim", "Dipirona ampola 500 mg/ml").length === 0);

const itens = REMUMES["Franco da Rocha"];
const comAmpola = itens.filter((i) => /ampola/i.test(i.nome));
ok("todo item com ampola de Franco da Rocha recebe o aviso", comAmpola.every((i) => A("Franco da Rocha", i.nome).length === 1), comAmpola.length + " itens");
ok("nenhum item sem ampola recebe", itens.filter((i) => !/ampola/i.test(i.nome)).every((i) => A("Franco da Rocha", i.nome).length === 0));

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
