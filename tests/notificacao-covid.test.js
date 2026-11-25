#!/usr/bin/env node
/**
 * tests/notificacao-covid.test.js — Ficha de SG suspeito de COVID-19
 *
 * Task 1: asset do PDF e catálogo de coordenadas (covid-ficha.js).
 * Para ver o PDF de conferência das coordenadas:
 *   NOTIF_SAIDA=/tmp/fichas node tests/notificacao-covid.test.js
 *
 * Uso:  node tests/notificacao-covid.test.js
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
["assets/base-pdf-covid.js", "assets/municipios-ibge.js", "dengue-ficha.js", "covid-ficha.js"].forEach((arq) => {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "modules/notificacao", arq), "utf8"), ctx);
});
const C = ctx.MeedsNotificacaoCovid;
const BASE = Buffer.from(ctx.MEEDS_NOTIF_COVID_BASE_PDF_B64, "base64");

const PARES = ["temCpf", "estrangeiro", "profSaude", "profSeguranca"];
function todasAsCaixas(c) {
  const lista = [].concat(c.SINTOMAS, c.CONDICOES, c.RACAS).map((i) => i.caixa);
  PARES.forEach((k) => lista.push(c.CX[k].sim, c.CX[k].nao));
  lista.push(c.CX.sexo.M, c.CX.sexo.F);
  return lista;
}
const PENTES = { ufNotif: 2, cpf: 11, cns: 15, passaporte: 8, cep: 8, ufRes: 2 };
const TEXTOS = ["municipioNotif", "cbo", "nome", "mae", "nascimento", "pais", "etnia", "municipioRes", "logradouro", "numero", "bairro", "complemento", "celular", "contato", "dataNotificacao", "inicioSintomas", "sintomaOutros"];

async function main() {
  const doc = await PDFLib.PDFDocument.load(BASE);
  ok("PDF base é A4 de 1 página", doc.getPageCount() === 1 && Math.round(doc.getPage(0).getWidth()) === 595);
  ok("10 sintomas, 9 condições, 6 raças", C.SINTOMAS.length === 10 && C.CONDICOES.length === 9 && C.RACAS.length === 6);
  ok("ids dos sintomas e condições na ordem da ficha",
    C.SINTOMAS.map((s) => s.id).join() === "assintomatico,febre,garganta,dispneia,tosse,coriza,cabeca,gustativos,olfativos,outros" &&
    C.CONDICOES.map((s) => s.id).join() === "respiratoria,diabetes,obesidade,renal,imunossupressao,cromossomica,gestante,cardiaca,puerpera");
  ok("toda caixa cabe na página", todasAsCaixas(C).every(([x0, y0, x1, y1]) => x0 < x1 && y0 < y1 && x1 <= 595 && y1 <= 842));
  ok("pentes com células + 1 bordas crescentes na página",
    Object.keys(PENTES).every((k) => { const b = C.CX[k].bordas; return b.length === PENTES[k] + 1 && b.every((v, i) => i === 0 || v > b[i - 1]) && b[b.length - 1] <= 595; }));
  ok("textos com x/y na página e larg positiva", TEXTOS.every((k) => { const t = C.CX[k]; return t.x > 0 && t.y > 0 && t.y < 842 && t.larg > 0 && t.x + t.larg <= 595; }));
  ok("limite de encerramento fica acima de exames, evolução e encerramento", C.CX.limiteEncerramento > 500 && C.CX.limiteEncerramento < 530);

  /* Conferência visual: um X em cada caixa, texto de amostra em cada campo. */
  const saida = process.env.NOTIF_SAIDA;
  if (saida) {
    fs.mkdirSync(saida, { recursive: true });
    const D = ctx.MeedsNotificacaoDengue;
    const pdf = await PDFLib.PDFDocument.load(BASE);
    const ops = [];
    todasAsCaixas(C).forEach((c) => ops.push({ pg: 0, tipo: "centro", cx: (c[0] + c[2]) / 2, cy: (c[1] + c[3]) / 2, texto: "X", tam: 10, negrito: true }));
    Object.keys(PENTES).forEach((k) => {
      const def = C.CX[k];
      for (let i = 0; i < PENTES[k]; i++) ops.push({ pg: 0, tipo: "centro", cx: (def.bordas[i] + def.bordas[i + 1]) / 2, cy: def.cy, texto: String((i + 1) % 10), tam: 9 });
    });
    TEXTOS.forEach((k) => { const t = C.CX[k]; ops.push({ pg: 0, tipo: "texto", x: t.x, y: t.y, texto: "AMOSTRA " + k, tam: 9, larg: t.larg }); });
    C.CX.observacoes.linhas.forEach((y) => ops.push({ pg: 0, tipo: "texto", x: C.CX.observacoes.x, y: y, texto: "Linha de observacoes", tam: 9, larg: C.CX.observacoes.larg }));
    await D.aplicarNoPdf(PDFLib, pdf, ops);
    fs.writeFileSync(path.join(saida, "covid-catalogo.pdf"), await pdf.save());
  }

  console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
  if (falhas) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
