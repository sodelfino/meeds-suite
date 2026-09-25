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

/* Barbacena (pedido de 25/09/2026): a UPA aceita VO e IM, nao EV. Item
 * injetavel avisa que pela teleconsulta so vale IM; bolsa e sistema
 * fechado (soro) sao EV e vao ao presencial. */
const IM = "Na UPA de Barbacena, pela teleconsulta só a aplicação IM. Se a via for EV, encaminhe o paciente ao presencial.";
const EV = "Uso EV: na UPA de Barbacena, encaminhe o paciente ao presencial.";
const nomeDe = (i) => (typeof i === "string" ? i : i.nome);
const barb = REMUMES["Barbacena"].map(nomeDe);
ok("Barbacena: ampola recebe o aviso de IM", A("Barbacena", "Adrenalina 1 mg - 1 mL - ampola").join() === IM);
ok("Barbacena: 'solução injetável ampola' mostra o aviso UMA vez", A("Barbacena", "Água para injeção - solução injetável ampola 10 mL").length === 1);
ok("Barbacena: fr-amp. também", A("Barbacena", "Anfotericina B - pó para solução injetável 50 mg fr-amp.").join() === IM);
ok("Barbacena: bolsa de soro é EV → presencial", A("Barbacena", "Cloreto de Sódio 0,9% - 500 mL - bolsa").join() === EV);
ok("Barbacena: soro em sistema fechado é SÓ EV (sem o aviso de IM, que contradiria)", A("Barbacena", "Glicose - solução injetável 50 mg/mL (5%) sistema fechado 500 mL").join() === EV);
ok("Barbacena: comprimido não tem aviso", A("Barbacena", "Ácido fólico - comprimido 5 mg").length === 0);
const injetaveis = barb.filter((n) => /ampola|injet|fr-amp|bolsa|sistema fechado/i.test(n.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
ok("Barbacena: todo item injetável/soro tem aviso", injetaveis.every((n) => A("Barbacena", n).length >= 1), injetaveis.length + " itens");
ok("Barbacena: nenhum item VO/tópico recebe aviso", barb.filter((n) => injetaveis.indexOf(n) === -1).every((n) => A("Barbacena", n).length === 0));
ok("Barbacena tem a faixa de aviso da UPA", /UPA Barbacena/.test((REMUMES._meta.avisos || {})["Barbacena"] || ""));
ok("Franco da Rocha continua com a regra dele, sem mudança", A("Franco da Rocha", "Adenosina ampola 6 mg/2 ml").join() === TEXTO);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
