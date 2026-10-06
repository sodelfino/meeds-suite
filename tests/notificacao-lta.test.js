#!/usr/bin/env node
/**
 * tests/notificacao-lta.test.js — Ficha de Leishmaniose Tegumentar Americana
 *
 * Mesma regra da ficha de dengue: só a primeira consulta (exames,
 * tratamento, conclusão e encerramento ficam em branco), obrigatórios
 * validados, campos automáticos, e a geração ponta a ponta com o pdf-lib
 * real. Para ver os PDFs:  NOTIF_SAIDA=/tmp/fichas node tests/notificacao-lta.test.js
 *
 * Uso:  node tests/notificacao-lta.test.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
const PDFLib = require("pdf-lib");

let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs !== undefined ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}

const ctx = {};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
["assets/base-pdf-dengue.js", "assets/base-pdf-lta.js", "assets/municipios-ibge.js", "dengue-ficha.js", "lta-ficha.js"].forEach((arq) => {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "modules/notificacao", arq), "utf8"), ctx);
});
const L = ctx.MeedsNotificacaoLta;
const BASE = Buffer.from(ctx.MEEDS_NOTIF_LTA_BASE_PDF_B64, "base64");
const HOJE = "2026-10-06";

const MINIMO = {
  lesoes: ["cutanea"],
  nome: "Maria da Silva", nascimento: "1990-01-02", sexo: "M",
  ufRes: "RJ", municipioRes: "Macaé", telefone: "2237721523",
  ufNotif: "RJ", municipioNotif: "Macaé", unidade: "ESF Aroeira",
};
const COMPLETO = Object.assign({}, MINIMO, {
  lesoes: ["cutanea", "mucosa"], cicatriz: "1", hiv: "2", tipoEntrada: "1",
  nome: "Dara Arruda Magalhães", nascimento: "2000-05-18", sexo: "F", gestante: "5",
  raca: "4", escolaridade: "6", sus: "700501902930017", mae: "Ana Carolina Fernandes Arruda",
  bairro: "Aroeira", logradouro: "Rua Doutor Sebastião de Moraes", numero: "123",
  complemento: "Casa 2", referencia: "Em frente à padaria", cep: "27913-000",
  telefone: "22997721523", zona: "2", ocupacao: "Agricultora",
  unidade: "ESF Aroeira", cnes: "2273780",
  observacoes: "Úlcera em membro inferior há 2 meses; refere deslocamento a área de mata.",
  medicoNome: "Guilherme Henrique Oliveira Borges", medicoFuncao: "Médico (CRM/SP 255626)",
});
const v = (d) => L.validar(d, HOJE);
const campos = (d) => v(d).map((e) => e.campo);
const ops = (d) => L.montarOperacoes(d, HOJE);

/* ---------- validação ---------- */
ok("caso mínimo é válido", v(MINIMO).length === 0, JSON.stringify(v(MINIMO)));
ok("caso completo é válido", v(COMPLETO).length === 0, JSON.stringify(v(COMPLETO)));
ok("sem nenhuma lesão: recusa", campos(Object.assign({}, MINIMO, { lesoes: [] })).indexOf("lesoes") !== -1);
ok("só lesão mucosa vale", v(Object.assign({}, MINIMO, { lesoes: ["mucosa"] })).length === 0);
ok("sem nome: recusa", campos(Object.assign({}, MINIMO, { nome: "" })).indexOf("nome") !== -1);
ok("mulher sem informar gestante: recusa", campos(Object.assign({}, MINIMO, { sexo: "F" })).indexOf("gestante") !== -1);
ok("sem telefone: recusa", campos(Object.assign({}, MINIMO, { telefone: "" })).indexOf("telefone") !== -1);
ok("município fora da UF: recusa", campos(Object.assign({}, MINIMO, { ufRes: "MG" })).indexOf("municipioRes") !== -1);
ok("SUS com tamanho errado: recusa", campos(Object.assign({}, MINIMO, { sus: "123" })).indexOf("sus") !== -1);
ok("cicatriz só faz sentido com lesão mucosa: valor descartado sem ela",
   v(Object.assign({}, MINIMO, { cicatriz: "1" })).length === 0);
ok("código de HIV inválido: recusa", campos(Object.assign({}, MINIMO, { hiv: "7" })).indexOf("hiv") !== -1);
ok("código de tipo de entrada inválido: recusa", campos(Object.assign({}, MINIMO, { tipoEntrada: "5" })).indexOf("tipoEntrada") !== -1);

/* ---------- operações ---------- */
const textos = (d, pg) => ops(d).filter((o) => o.pg === pg).map((o) => o.texto || "").join("|");
const caixaEm = (lista, caixa, texto) => lista.some((o) => o.tipo === "centro" && o.texto === texto &&
  o.cx > caixa[0] && o.cx < caixa[2] && o.cy > caixa[1] && o.cy < caixa[3]);

{
  const o = ops(COMPLETO);
  ok("lesão cutânea e mucosa marcadas com 1", caixaEm(o, L.CX.lesaoCutanea, "1") && caixaEm(o, L.CX.lesaoMucosa, "1"));
  const so = ops(Object.assign({}, MINIMO, { lesoes: ["cutanea"] }));
  ok("só cutânea: mucosa atestada como ausente (2)", caixaEm(so, L.CX.lesaoCutanea, "1") && caixaEm(so, L.CX.lesaoMucosa, "2"));
  ok("cicatriz só aparece com lesão mucosa", caixaEm(o, L.CX.cicatriz, "1") && !so.some((x) => x.texto === "1" && x.cx > L.CX.cicatriz[0] && x.cx < L.CX.cicatriz[2] && x.cy > L.CX.cicatriz[1] && x.cy < L.CX.cicatriz[3]));
  ok("HIV e tipo de entrada vão para as caixas", caixaEm(o, L.CX.hiv, "2") && caixaEm(o, L.CX.tipoEntrada, "1"));
  ok("sem HIV informado: caixa em branco", !ops(MINIMO).some((x) => x.cx > L.CX.hiv[0] && x.cx < L.CX.hiv[2] && x.cy > L.CX.hiv[1] && x.cy < L.CX.hiv[3]));
  ok("sexo M: gestante 'não se aplica' (6)", caixaEm(ops(MINIMO), L.CX.gestante, "6"));
  ok("página 1 tem o nome em maiúsculas", textos(COMPLETO, 0).indexOf("DARA ARRUDA MAGALHÃES") !== -1);
  ok("data da notificação e do diagnóstico saem automáticas (hoje)",
     o.filter((x) => x.tipo === "centro" && x.cy > 180 && x.cy < 190 && x.cx > 437).map((x) => x.texto).join("") === "06102026" &&
     o.filter((x) => x.tipo === "centro" && x.cy > 240 && x.cy < 249 && x.cx > 444).map((x) => x.texto).join("") === "06102026");
  ok("observações vão para a página 2", ops(COMPLETO).some((x) => x.pg === 1 && x.tipo === "bloco" && /úlcera/i.test(x.texto)));
  ok("tratamento, laboratório e conclusão ficam em branco: nada fora dos blocos conhecidos",
     !o.some((x) => x.pg === 0 && x.cy > 670 && x.cy < 800) && !o.some((x) => x.pg === 1 && x.cy < 330));
  const tel = (n) => ops(Object.assign({}, MINIMO, { telefone: n })).filter((x) => x.tipo === "centro" && Math.abs(x.cy - 493.3) < 0.01);
  const bordasTel = [58.0, 71.4, 86.0, 100.2, 114.6, 129.0, 143.4, 158.0, 172.4, 187.0, 205.6];
  ok("telefone de 11 dígitos: 11 dígitos, na ordem, nenhum em cima de uma divisória",
     tel("22997721523").map((x) => x.texto).join("") === "22997721523" &&
     tel("22997721523").every((x) => bordasTel.every((b) => Math.abs(x.cx - b) > 1.5)), tel("22997721523").map((x) => x.cx.toFixed(1)).join(" "));
  ok("telefone de 10 dígitos: um por célula", tel("2237721523").length === 10);
  ok("sem médico escolhido, o bloco Investigador fica em branco", !ops(MINIMO).some((x) => x.pg === 1));
}

/* ---------- PDF de verdade ---------- */
async function gerar(dados) {
  const doc = await PDFLib.PDFDocument.load(BASE);
  const lista = L.montarOperacoes(dados, HOJE);
  const r = await ctx.MeedsNotificacaoDengue.aplicarNoPdf(PDFLib, doc, lista);
  return { bytes: await doc.save(), ops: lista, r: r };
}

async function main() {
  const saida = process.env.NOTIF_SAIDA;
  if (saida) fs.mkdirSync(saida, { recursive: true });
  const guardar = (nome, bytes) => { if (saida) fs.writeFileSync(path.join(saida, nome), bytes); };

  const min = await gerar(MINIMO);
  guardar("lta-minimo.pdf", min.bytes);
  ok("mínimo: reabre com 2 páginas", (await PDFLib.PDFDocument.load(min.bytes)).getPageCount() === 2);
  ok("mínimo: nada ignorado", min.r.ignoradas === 0, min.r.ignoradas);
  const comp = await gerar(COMPLETO);
  guardar("lta-completo.pdf", comp.bytes);
  ok("completo: nada ignorado", comp.r.ignoradas === 0, comp.r.ignoradas);
  const estranho = await gerar(Object.assign({}, MINIMO, { nome: "Łukasz 😀" }));
  ok("caractere fora do WinAnsi não derruba a geração", estranho.r.ignoradas === 0);
  const longo = await gerar(Object.assign({}, MINIMO, { observacoes: "palavra ".repeat(300), nome: "A".repeat(200) }));
  ok("texto longo não derruba a geração", longo.r.ignoradas === 0);
  guardar("lta-longo.pdf", longo.bytes);

  console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
  if (falhas) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
