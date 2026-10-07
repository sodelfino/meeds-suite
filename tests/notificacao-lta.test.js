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
  formaClinica: "1", tipoEntrada: "1",
  nome: "Maria da Silva", nascimento: "1990-01-02", sexo: "M",
  ufRes: "RJ", municipioRes: "Macaé", telefone: "2237721523",
  ufNotif: "RJ", municipioNotif: "Macaé", unidade: "ESF Aroeira",
};
const COMPLETO = Object.assign({}, MINIMO, {
  formaClinica: "2", cicatriz: "1", hiv: "2", tipoEntrada: "2",
  parasitologico: "3", irm: "3", histopatologia: "4",
  dataTratamento: "2026-10-06", drogaInicial: "1", peso: "62",
  nome: "Dara Arruda Magalhães", nascimento: "2000-05-18", sexo: "F", gestante: "5",
  raca: "4", escolaridade: "6", cpf: "52998224725", mae: "Ana Carolina Fernandes Arruda",
  bairro: "Aroeira", logradouro: "Rua Doutor Sebastião de Moraes", numero: "123",
  complemento: "Casa 2", referencia: "Em frente à padaria", cep: "27913-000",
  telefone: "22997721523", zona: "2", ocupacao: "Agricultora",
  unidade: "ESF Aroeira", cnes: "2273780",
  observacoes: "Úlcera em membro inferior há 2 meses; refere deslocamento a área de mata.",
  medicoNome: "Guilherme Henrique Oliveira Borges", medicoFuncao: "Médico (CRM/SP 255626)",
});
const v = (d) => L.validar(d, HOJE);
const campos = (d) => v(d).map((e) => e.campo);
const com = (extra) => Object.assign({}, MINIMO, extra);
const ops = (d) => L.montarOperacoes(d, HOJE);

/* ---------- validação ---------- */
ok("caso mínimo é válido", v(MINIMO).length === 0, JSON.stringify(v(MINIMO)));
ok("caso completo é válido", v(COMPLETO).length === 0, JSON.stringify(v(COMPLETO)));
ok("sem forma clínica: recusa", campos(com({ formaClinica: "" })).indexOf("formaClinica") !== -1);
ok("forma clínica inválida: recusa", campos(com({ formaClinica: "3" })).indexOf("formaClinica") !== -1);
ok("forma mucosa vale", v(com({ formaClinica: "2" })).length === 0);
ok("sem tipo de entrada: recusa", campos(com({ tipoEntrada: "" })).indexOf("tipoEntrada") !== -1);
ok("tipo de entrada 1, 2 e 3 valem; 9 não é oferecido",
   ["1", "2", "3"].every((x) => v(com({ tipoEntrada: x })).length === 0) && campos(com({ tipoEntrada: "9" })).indexOf("tipoEntrada") !== -1);
ok("sem nome: recusa", campos(com({ nome: "" })).indexOf("nome") !== -1);
ok("mulher sem informar gestante: recusa", campos(com({ sexo: "F" })).indexOf("gestante") !== -1);
ok("sem telefone: recusa", campos(com({ telefone: "" })).indexOf("telefone") !== -1);
ok("município fora da UF: recusa", campos(com({ ufRes: "MG" })).indexOf("municipioRes") !== -1);
ok("CPF com tamanho errado ou dígito verificador errado: recusa", campos(com({ cpf: "123" })).indexOf("cpf") !== -1 && campos(com({ cpf: "52998224726" })).indexOf("cpf") !== -1);
ok("CPF válido ou em branco: vale", v(com({ cpf: "529.982.247-25" })).length === 0 && v(com({ cpf: "" })).length === 0);
ok("cicatriz com forma cutânea é descartada (não bloqueia)", v(com({ cicatriz: "1" })).length === 0);
ok("código de HIV inválido: recusa", campos(com({ hiv: "7" })).indexOf("hiv") !== -1);
ok("laboratório inválido: recusa", campos(com({ parasitologico: "9" })).indexOf("parasitologico") !== -1 &&
   campos(com({ histopatologia: "5" })).indexOf("histopatologia") !== -1);
/* tratamento: se começou, exige droga e peso */
ok("tratamento não iniciado (tudo em branco) é válido", v(MINIMO).length === 0);
ok("data de início do tratamento sem droga: recusa a droga", campos(com({ dataTratamento: "2026-10-06", peso: "60" })).indexOf("drogaInicial") !== -1);
ok("data de início do tratamento sem peso: recusa o peso", campos(com({ dataTratamento: "2026-10-06", drogaInicial: "1" })).indexOf("peso") !== -1);
ok("droga sem data de início: recusa a data", campos(com({ drogaInicial: "1", peso: "60" })).indexOf("dataTratamento") !== -1);
ok("data de início do tratamento futura: recusa", campos(com({ dataTratamento: "2026-10-07", drogaInicial: "1", peso: "60" })).indexOf("dataTratamento") !== -1);
ok("data de início com droga 'não utilizada': contradição", campos(com({ dataTratamento: "2026-10-06", drogaInicial: "5", peso: "60" })).indexOf("drogaInicial") !== -1);
ok("peso absurdo: recusa", campos(com({ dataTratamento: "2026-10-06", drogaInicial: "1", peso: "900" })).indexOf("peso") !== -1);
ok("peso com vírgula (62,5) é aceito", v(com({ dataTratamento: "2026-10-06", drogaInicial: "1", peso: "62,5" })).length === 0);

/* ---------- operações ---------- */
const dentro = (x, c) => x.cx > c[0] && x.cx < c[2] && x.cy > c[1] && x.cy < c[3];
const caixaEm = (lista, caixa, texto) => lista.some((o) => o.tipo === "centro" && o.texto === texto && dentro(o, caixa));
const algoEm = (lista, caixa) => lista.some((o) => o.tipo === "centro" && dentro(o, caixa));
const textos = (d, pg) => ops(d).filter((o) => o.pg === pg).map((o) => o.texto || "").join("|");

{
  const o = ops(COMPLETO);
  const cut = ops(MINIMO);
  ok("forma cutânea: item 40 = 1 e lesão cutânea marcada", caixaEm(cut, L.CX.formaClinica, "1") && caixaEm(cut, L.CX.lesaoCutanea, "1") && !algoEm(cut, L.CX.lesaoMucosa));
  ok("forma mucosa: item 40 = 2 e lesão mucosa marcada", caixaEm(o, L.CX.formaClinica, "2") && caixaEm(o, L.CX.lesaoMucosa, "1") && !algoEm(o, L.CX.lesaoCutanea));
  ok("cicatriz só aparece com forma mucosa", caixaEm(o, L.CX.cicatriz, "1") && !algoEm(ops(com({ cicatriz: "1" })), L.CX.cicatriz));
  ok("HIV e tipo de entrada vão para as caixas", caixaEm(o, L.CX.hiv, "2") && caixaEm(o, L.CX.tipoEntrada, "2"));
  ok("sem HIV informado: caixa em branco", !algoEm(cut, L.CX.hiv));
  ok("laboratório: 3, 3 e 4 (não realizado) nas caixas 36, 37 e 38",
     caixaEm(o, L.CX.parasitologico, "3") && caixaEm(o, L.CX.irm, "3") && caixaEm(o, L.CX.histopatologia, "4"));
  ok("laboratório não informado: caixas em branco", !algoEm(cut, L.CX.parasitologico) && !algoEm(cut, L.CX.irm) && !algoEm(cut, L.CX.histopatologia));
  ok("tratamento iniciado: droga, data (06102026) e peso (62) desenhados",
     caixaEm(o, L.CX.droga, "1") &&
     o.filter((x) => x.tipo === "centro" && x.cy > 700 && x.cy < 708 && x.cx > 55 && x.cx < 180).map((x) => x.texto).join("") === "06102026" &&
     o.filter((x) => x.tipo === "centro" && x.cy > 730 && x.cy < 740 && x.cx > 88 && x.cx < 140).map((x) => x.texto).join("") === "62");
  ok("tratamento não iniciado: nada desenhado da altura do tratamento para baixo", !cut.some((x) => x.pg === 0 && x.cy > 670));
  ok("CPF nas células do campo 15 e marca '(CPF)' ao lado do rótulo",
     o.filter((x) => x.tipo === "centro" && x.cy > 359 && x.cy < 370 && x.cx > 55 && x.cx < 230).map((x) => x.texto).join("") === "52998224725" &&
     o.some((x) => x.tipo === "texto" && x.texto === "(CPF)"));
  ok("sexo M: gestante 'não se aplica' (6)", caixaEm(cut, L.CX.gestante, "6"));
  ok("página 1 tem o nome em maiúsculas", textos(COMPLETO, 0).indexOf("DARA ARRUDA MAGALHÃES") !== -1);
  ok("data da notificação e do diagnóstico saem automáticas (hoje)",
     o.filter((x) => x.tipo === "centro" && x.cy > 180 && x.cy < 190 && x.cx > 437).map((x) => x.texto).join("") === "06102026" &&
     o.filter((x) => x.tipo === "centro" && x.cy > 240 && x.cy < 249 && x.cx > 444).map((x) => x.texto).join("") === "06102026");
  ok("observações vão para a página 2", o.some((x) => x.pg === 1 && x.tipo === "bloco" && /úlcera/i.test(x.texto)));
  ok("conclusão (página 2, itens 47 a 58) fica em branco", !o.some((x) => x.pg === 1 && x.cy < 330));
  ok("sem médico escolhido, o bloco Investigador fica em branco", !cut.some((x) => x.pg === 1));
  const tel = (n) => ops(com({ telefone: n })).filter((x) => x.tipo === "centro" && Math.abs(x.cy - 493.3) < 0.01);
  const bordasTel = [58.0, 71.4, 86.0, 100.2, 114.6, 129.0, 143.4, 158.0, 172.4, 187.0, 205.6];
  ok("telefone de 11 dígitos: 11 dígitos, na ordem, nenhum em cima de uma divisória",
     tel("22997721523").map((x) => x.texto).join("") === "22997721523" &&
     tel("22997721523").every((x) => bordasTel.every((b) => Math.abs(x.cx - b) > 1.5)));
  ok("telefone de 10 dígitos: um por célula", tel("2237721523").length === 10);
}

/* ---------- PDF de verdade ---------- */
async function gerar(dados) {
  const doc = await PDFLib.PDFDocument.load(BASE);
  const lista = L.montarOperacoes(dados, HOJE);
  const r = await ctx.MeedsNotificacaoDengue.aplicarNoPdf(PDFLib, doc, lista);
  return { bytes: await doc.save(), ops: lista, r: r };
}

/* PNG pequeno de verdade (cor sólida), sem depender de arquivo no disco. */
function pngSolido(w, h) {
  const zlib = require("zlib");
  const crcTab = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTab[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const bloco = (tipo, dados) => {
    const t = Buffer.from(tipo, "ascii");
    const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, dados])));
    return Buffer.concat([len, t, dados, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const linha = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 180)]);
  const cru = Buffer.concat(Array.from({ length: h }, () => linha));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco("IHDR", ihdr), bloco("IDAT", zlib.deflateSync(cru)), bloco("IEND", Buffer.alloc(0))]);
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

  /* fotos da lesão: viram páginas extras, duas por página */
  const foto = { bytes: new Uint8Array(pngSolido(120, 90)), tipo: "png" };
  const doc = await PDFLib.PDFDocument.load(BASE);
  const n = await L.anexarFotos(PDFLib, doc, [foto, foto, foto], "Maria da Silva - 06/10/2026");
  ok("anexarFotos: devolve quantas fotos entraram", n === 3);
  ok("anexarFotos: 3 fotos = 2 páginas novas (total 4)", doc.getPageCount() === 4);
  const semFoto = await PDFLib.PDFDocument.load(BASE);
  ok("anexarFotos: sem fotos não acrescenta página", (await L.anexarFotos(PDFLib, semFoto, [], "x")) === 0 && semFoto.getPageCount() === 2);
  const demais = await PDFLib.PDFDocument.load(BASE);
  ok("anexarFotos: respeita o limite de " + L.MAX_FOTOS + " fotos", (await L.anexarFotos(PDFLib, demais, new Array(10).fill(foto), "x")) === L.MAX_FOTOS);
  const ruim = await PDFLib.PDFDocument.load(BASE);
  ok("anexarFotos: arquivo corrompido não derruba a ficha (é ignorado)",
     (await L.anexarFotos(PDFLib, ruim, [{ bytes: new Uint8Array([1, 2, 3]), tipo: "png" }, foto], "x")) === 1);
  guardar("lta-com-fotos.pdf", await doc.save());
  const reaberto = await PDFLib.PDFDocument.load(await doc.save());
  ok("PDF com fotos reabre", reaberto.getPageCount() === 4);

  console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
  if (falhas) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
