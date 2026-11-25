#!/usr/bin/env node
/**
 * tests/notificacao-covid.test.js — Ficha de SG suspeito de COVID-19
 *
 * Task 1: asset do PDF e catalogo de coordenadas (covid-ficha.js).
 * Task 2: validacao e leitura do CNS (logica pura).
 * Para ver o PDF de conferencia das coordenadas:
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

const D = ctx.MeedsNotificacaoDengue;
const HOJE = "2026-11-25";
const MINIMO = {
  ufNotif: "MG", municipioNotif: "Congonhas", temCpf: true, cpf: "52998224725",
  nome: "Fulano de Tal", nascimento: "1969-06-16", sexo: "M",
  dataNotificacao: HOJE, inicioSintomas: "2026-11-22", sintomas: ["febre", "tosse"],
};
const campos = (erros) => erros.map((e) => e.campo);

function logica() {
  ok("minimo passa", C.validar(MINIMO, HOJE).length === 0);
  ok("vinculo do print", JSON.stringify(D.interpretarVinculo(["CONGONHAS - MG", "PSF IDEAL"])) === JSON.stringify({ municipio: "Congonhas", uf: "MG", unidade: "PSF IDEAL" }));
  ok("extrairCnsIgnoraZero", C.extrairCns(["CPF 71305890604", "CNS 0"]) === "");
  ok("extrairCns acha valido", C.extrairCns(["CPF 71305890604", "CNS 700000000000005"]) === "700000000000005");
  ok("cns todo zero recusado", !C.cnsValido("000000000000000"));
  ok("cns com digito errado recusado", !C.cnsValido("700000000000006"));
  ok("semCpfNaoExigeCpf", C.validar({ ...MINIMO, temCpf: false, cpf: "" }, HOJE).length === 0);
  ok("comCpfExigeCpf", campos(C.validar({ ...MINIMO, cpf: "" }, HOJE)).includes("cpf"));
  ok("cns preenchido e invalido", campos(C.validar({ ...MINIMO, cns: "123" }, HOJE)).includes("cns"));
  ok("cns valido passa", C.validar({ ...MINIMO, cns: "700000000000005" }, HOJE).length === 0);
  ok("municipio da notificacao obrigatorio", campos(C.validar({ ...MINIMO, municipioNotif: "" }, HOJE)).includes("municipioNotif"));
  ok("sexo I recusado", campos(C.validar({ ...MINIMO, sexo: "I" }, HOJE)).includes("sexo"));
  ok("nome e nascimento obrigatorios", campos(C.validar({ ...MINIMO, nome: "", nascimento: "" }, HOJE)).join() === "nome,nascimento");
  ok("notificacao futura recusada", campos(C.validar({ ...MINIMO, dataNotificacao: "2026-11-26" }, HOJE)).includes("dataNotificacao"));
  ok("inicio obrigatorio", campos(C.validar({ ...MINIMO, inicioSintomas: "" }, HOJE)).includes("inicioSintomas"));
  ok("inicioDepoisDaNotificacao", campos(C.validar({ ...MINIMO, dataNotificacao: "2026-11-20" }, HOJE)).includes("inicioSintomas"));
  ok("sintomas obrigatorios", campos(C.validar({ ...MINIMO, sintomas: [] }, HOJE)).includes("sintomas"));
  ok("assintomaticoExcluiSintomas", campos(C.validar({ ...MINIMO, sintomas: ["assintomatico", "febre"] }, HOJE)).includes("sintomas"));
  ok("assintomatico sozinho passa", C.validar({ ...MINIMO, sintomas: ["assintomatico"] }, HOJE).length === 0);
  ok("outros exige texto", campos(C.validar({ ...MINIMO, sintomas: ["outros"] }, HOJE)).includes("sintomaOutros"));
  ok("cep incompleto recusado", campos(C.validar({ ...MINIMO, cep: "123" }, HOJE)).includes("cep"));
  ok("gestanteSoComSexoF", campos(C.validar({ ...MINIMO, condicoes: ["gestante"] }, HOJE)).includes("condicoes"));
  ok("gestante com sexo F passa", C.validar({ ...MINIMO, sexo: "F", condicoes: ["gestante"] }, HOJE).length === 0);
  ok("endereco vazio passa", C.validar({ ...MINIMO, ufRes: "", municipioRes: "", telefone: "" }, HOJE).length === 0);
}

async function main() {
  logica();
  const doc = await PDFLib.PDFDocument.load(BASE);
  ok("PDF base e A4 de 1 pagina", doc.getPageCount() === 1 && Math.round(doc.getPage(0).getWidth()) === 595);
  ok("10 sintomas, 9 condicoes, 6 raças", C.SINTOMAS.length === 10 && C.CONDICOES.length === 9 && C.RACAS.length === 6);
  ok("ids dos sintomas e condicoes na ordem da ficha",
    C.SINTOMAS.map((s) => s.id).join() === "assintomatico,febre,garganta,dispneia,tosse,coriza,cabeca,gustativos,olfativos,outros" &&
    C.CONDICOES.map((s) => s.id).join() === "respiratoria,diabetes,obesidade,renal,imunossupressao,cromossomica,gestante,cardiaca,puerpera");
  ok("toda caixa cabe na pagina", todasAsCaixas(C).every(([x0, y0, x1, y1]) => x0 < x1 && y0 < y1 && x1 <= 595 && y1 <= 842));
  ok("pentes com celulas + 1 bordas crescentes na pagina",
    Object.keys(PENTES).every((k) => { const b = C.CX[k].bordas; return b.length === PENTES[k] + 1 && b.every((v, i) => i === 0 || v > b[i - 1]) && b[b.length - 1] <= 595; }));
  ok("textos com x/y na pagina e larg positiva", TEXTOS.every((k) => { const t = C.CX[k]; return t.x > 0 && t.y > 0 && t.y < 842 && t.larg > 0 && t.x + t.larg <= 595; }));
  ok("limite de encerramento fica acima de exames, evolucao e encerramento", C.CX.limiteEncerramento > 500 && C.CX.limiteEncerramento < 530);

  /* Conferencia visual: um X em cada caixa, texto de amostra em cada campo. */
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
