#!/usr/bin/env node
/**
 * tests/notificacao-aids.test.js — Ficha de AIDS (pacientes com 13 anos ou mais)
 *
 * Mesmas premissas das outras fichas: só a primeira consulta, obrigatórios
 * validados, CPF no lugar do Cartão SUS, PDF oficial gerado de verdade.
 * As regras de "obrigatório" vêm do instrumento de preenchimento do SINAN
 * (Aids_adulto_v5_instr.pdf): 32, 33, 34, 40, 41, 42 e 43 são obrigatórios;
 * 35-39 só quando há transfusão/acidente; 47-48 só com critério óbito.
 *
 * Para ver os PDFs:  NOTIF_SAIDA=/tmp/fichas node tests/notificacao-aids.test.js
 *
 * Uso:  node tests/notificacao-aids.test.js
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
["assets/base-pdf-aids.js", "assets/municipios-ibge.js", "dengue-ficha.js", "aids-ficha.js"].forEach((arq) => {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "modules/notificacao", arq), "utf8"), ctx);
});
const A = ctx.MeedsNotificacaoAids;
const BASE = Buffer.from(ctx.MEEDS_NOTIF_AIDS_BASE_PDF_B64, "base64");
const HOJE = "2026-10-07";

const MINIMO = {
  diagnostico: "2026-10-07",
  vertical: "2", sexual: "1", sanguinea: "2",
  labTriagem: "1",
  rjNenhum: true, cdcNenhum: true, criterioObito: "2",
  nome: "Carlos Alberto Souza", nascimento: "1985-03-10", sexo: "M",
  ufRes: "RJ", municipioRes: "Macaé", telefone: "2237721523",
  ufNotif: "RJ", municipioNotif: "Macaé", unidade: "ESF Aroeira",
};
const COMPLETO = Object.assign({}, MINIMO, {
  sexual: "3", sanguinea: "1", exposicoes: ["drogas", "transfusao"],
  transfData: "2010-05-20", transfUf: "RJ", transfMunicipio: "Macaé", transfInstituicao: "Hospital Público de Macaé", transfConclusao: "2",
  labTriagem: "1", dataTriagem: "2026-09-30", labConfirmatorio: "1", dataConfirmatorio: "2026-10-02",
  labRapido1: "1", labRapido2: "1", labRapido3: "2", dataRapidos: "2026-10-01",
  rjNenhum: false, rj: ["sarcoma", "candidoseOral", "anemia"],
  cdcNenhum: false, cdc: ["candidoseEsofago", "cd4"],
  ufTrat: "RJ", municipioTrat: "Macaé", unidadeTrat: "Policlínica Central",
  nome: "Dara Arruda Magalhães", nascimento: "2000-05-18", sexo: "F", gestante: "5",
  raca: "4", escolaridade: "6", cpf: "52998224725", mae: "Ana Carolina Fernandes Arruda",
  bairro: "Aroeira", logradouro: "Rua Doutor Sebastião de Moraes", numero: "123",
  complemento: "Casa 2", referencia: "Em frente à padaria", cep: "27913-000",
  telefone: "22997721523", zona: "1", ocupacao: "Estudante",
  unidade: "ESF Aroeira", cnes: "2273780",
  medicoNome: "Guilherme Henrique Oliveira Borges", medicoFuncao: "Médico (CRM/SP 255626)",
});
const v = (d) => A.validar(d, HOJE);
const campos = (d) => v(d).map((e) => e.campo);
const com = (extra) => Object.assign({}, MINIMO, extra);
const ops = (d) => A.montarOperacoes(d, HOJE);

/* ---------- validação ---------- */
ok("caso mínimo é válido", v(MINIMO).length === 0, JSON.stringify(v(MINIMO)));
ok("caso completo é válido", v(COMPLETO).length === 0, JSON.stringify(v(COMPLETO)));
ok("sem data do diagnóstico: recusa", campos(com({ diagnostico: "" })).indexOf("diagnostico") !== -1);
ok("data do diagnóstico futura: recusa", campos(com({ diagnostico: "2026-10-08" })).indexOf("diagnostico") !== -1);
ok("diagnóstico antes do nascimento: recusa", campos(com({ diagnostico: "1980-01-01" })).indexOf("diagnostico") !== -1);
ok("paciente com menos de 13 anos: recusa (a ficha é de adulto)", campos(com({ nascimento: "2018-01-01" })).indexOf("nascimento") !== -1);
ok("paciente com exatamente 13 anos: vale", v(com({ nascimento: "2013-10-07" })).length === 0);
ok("paciente a um dia dos 13 anos: recusa", campos(com({ nascimento: "2013-10-08" })).indexOf("nascimento") !== -1);
ok("sem transmissão vertical (32): recusa", campos(com({ vertical: "" })).indexOf("vertical") !== -1);
ok("sem transmissão sexual (33): recusa", campos(com({ sexual: "" })).indexOf("sexual") !== -1);
ok("33 aceita 1, 2, 3, 4 e 9", ["1", "2", "3", "4", "9"].every((x) => v(com({ sexual: x })).length === 0));
ok("33 não aceita 5", campos(com({ sexual: "5" })).indexOf("sexual") !== -1);
ok("sem exposição sanguínea (34): recusa", campos(com({ sanguinea: "" })).indexOf("sanguinea") !== -1);
ok("34 = sim sem marcar a via: recusa", campos(com({ sanguinea: "1", exposicoes: [] })).indexOf("exposicoes") !== -1);
ok("34 = sim com uma via que não é transfusão/acidente: vale (35-39 dispensados)", v(com({ sanguinea: "1", exposicoes: ["drogas"] })).length === 0);
ok("34 = não ignora vias marcadas esquecidas", v(com({ sanguinea: "2", exposicoes: ["drogas"] })).length === 0);
ok("transfusão sem data/UF/município/instituição/conclusão: recusa todos",
   ["transfData", "transfUf", "transfMunicipio", "transfInstituicao", "transfConclusao"].every((c) =>
     campos(com({ sanguinea: "1", exposicoes: ["transfusao"] })).indexOf(c) !== -1));
ok("acidente com material biológico também exige o bloco 35-39",
   campos(com({ sanguinea: "1", exposicoes: ["acidente"] })).indexOf("transfData") !== -1);
ok("data da transfusão futura: recusa", campos(Object.assign({}, COMPLETO, { transfData: "2026-10-08" })).indexOf("transfData") !== -1);
ok("município da transfusão fora da UF: recusa", campos(Object.assign({}, COMPLETO, { transfUf: "MG" })).indexOf("transfMunicipio") !== -1);
ok("sem nenhum teste de HIV (40): recusa", campos(com({ labTriagem: "" })).indexOf("lab") !== -1);
ok("basta um teste (rápido 2) com resultado", v(com({ labTriagem: "", labRapido2: "1" })).length === 0);
ok("resultado de teste inválido: recusa", campos(com({ labTriagem: "7" })).indexOf("labTriagem") !== -1);
ok("data de coleta futura: recusa", campos(com({ dataTriagem: "2026-10-08" })).indexOf("dataTriagem") !== -1);
ok("critério Rio de Janeiro/Caracas (41) sem atestar: recusa", campos(com({ rjNenhum: false, rj: [] })).indexOf("rj") !== -1);
ok("41: 'nenhum' junto com itens marcados: recusa (contradição)", campos(com({ rjNenhum: true, rj: ["sarcoma"] })).indexOf("rj") !== -1);
ok("critério CDC (42) sem atestar: recusa", campos(com({ cdcNenhum: false, cdc: [] })).indexOf("cdc") !== -1);
ok("critério óbito (43) em branco: recusa", campos(com({ criterioObito: "" })).indexOf("criterioObito") !== -1);
ok("critério óbito = sim exige data do óbito (48)", campos(com({ criterioObito: "1" })).indexOf("dataObito") !== -1);
ok("critério óbito = sim com data válida: vale", v(com({ criterioObito: "1", dataObito: "2026-10-05" })).length === 0);
ok("data do óbito futura: recusa", campos(com({ criterioObito: "1", dataObito: "2026-10-08" })).indexOf("dataObito") !== -1);
ok("sem nome / telefone / gestante (mulher): recusa", ["nome", "telefone", "gestante"].every((c) =>
   campos(Object.assign({}, MINIMO, { nome: "", telefone: "", sexo: "F" })).indexOf(c) !== -1));
ok("CPF inválido: recusa", campos(com({ cpf: "52998224726" })).indexOf("cpf") !== -1);
ok("local de tratamento é opcional (UF sem município: recusa)", v(com({ ufTrat: "RJ" })).length === 1 && campos(com({ ufTrat: "RJ" }))[0] === "municipioTrat");

/* ---------- pontuação do critério Rio de Janeiro/Caracas ---------- */
ok("pontos RJ/Caracas: sarcoma (10) + candidose oral (5) + anemia (2) = 17", A.pontosRj(["sarcoma", "candidoseOral", "anemia"]) === 17);
ok("pontos RJ/Caracas: sem itens = 0", A.pontosRj([]) === 0);
ok("critério RJ/Caracas atendido com 10 pontos ou mais", A.rjAtendido(["sarcoma"]) && !A.rjAtendido(["herpesZoster", "caquexia"]));
ok("os 14 itens do RJ/Caracas e os 18 do CDC existem", A.RJ.length === 14 && A.CDC.length === 18);

/* ---------- operações ---------- */
const dentro = (x, c) => x.cx > c[0] && x.cx < c[2] && x.cy > c[1] && x.cy < c[3];
const caixaEm = (lista, caixa, texto, pg) => lista.some((o) => o.tipo === "centro" && o.texto === texto && (pg === undefined || o.pg === pg) && dentro(o, caixa));
const algoEm = (lista, caixa, pg) => lista.some((o) => o.tipo === "centro" && (pg === undefined || o.pg === pg) && dentro(o, caixa));
const digitos = (lista, pg, y0, y1, x0, x1) => lista.filter((o) => o.tipo === "centro" && o.pg === pg && o.cy > y0 && o.cy < y1 && o.cx > x0 && o.cx < x1)
  .sort((a, b) => a.cx - b.cx).map((o) => o.texto).join("");

{
  const m = ops(MINIMO);
  const c = ops(COMPLETO);
  ok("data da notificação automática (hoje)", digitos(m, 0, 152, 166, 440, 570) === "07102026", digitos(m, 0, 152, 166, 440, 570));
  ok("data do diagnóstico escolhida pelo médico", digitos(ops(com({ diagnostico: "2026-09-30" })), 0, 208, 222, 440, 570) === "30092026");
  ok("32 e 33: transmissão vertical e sexual nas caixas", caixaEm(m, A.CX.vertical, "2") && caixaEm(m, A.CX.sexual, "1"));
  ok("34 não: as quatro vias recebem 2", ["drogas", "hemofilia", "transfusao", "acidente"].every((k) => caixaEm(m, A.CX[k], "2")));
  ok("34 ignorado: as quatro vias recebem 9", ["drogas", "hemofilia", "transfusao", "acidente"].every((k) => caixaEm(ops(com({ sanguinea: "9" })), A.CX[k], "9")));
  ok("34 sim: marcadas 1, as demais 2", caixaEm(c, A.CX.drogas, "1") && caixaEm(c, A.CX.transfusao, "1") && caixaEm(c, A.CX.hemofilia, "2") && caixaEm(c, A.CX.acidente, "2"));
  ok("35-39 só aparecem com transfusão/acidente", !algoEm(m, A.CX.conclusaoTransf) && caixaEm(c, A.CX.conclusaoTransf, "2") && digitos(c, 0, 645, 656, 60, 180) === "20052010");
  ok("município da transfusão: código IBGE nas células", digitos(c, 0, 645, 656, 480, 570) === "330240");
  ok("40: resultados nas caixas e em branco nos testes não feitos", caixaEm(c, A.CX.labTriagem, "1") && caixaEm(c, A.CX.labRapido3, "2") && !algoEm(m, A.CX.labConfirmatorio) && !algoEm(m, A.CX.labRapido1));
  ok("40: datas de coleta", digitos(c, 0, 760, 775, 160, 280) === "30092026" && digitos(c, 0, 760, 775, 380, 500) === "02102026" && digitos(c, 0, 796, 810, 360, 480) === "01102026");
  ok("41: 'nenhum' marca 2 em todos os 14 itens", A.RJ.every((i) => caixaEm(m, i.caixa, "2", 1)));
  ok("41: marcados recebem 1 e os demais 2", caixaEm(c, A.RJ[0].caixa, "1", 1) && A.RJ.filter((i) => ["sarcoma", "candidoseOral", "anemia"].indexOf(i.id) === -1).every((i) => caixaEm(c, i.caixa, "2", 1)));
  ok("42: marcados recebem 1 e os demais 2", caixaEm(c, A.CDC.filter((i) => i.id === "cd4")[0].caixa, "1", 1) && caixaEm(c, A.CDC.filter((i) => i.id === "cancerCervical")[0].caixa, "2", 1));
  ok("43: critério óbito 2 (não)", caixaEm(m, A.CX.criterioObito, "2", 1));
  const ob = ops(com({ criterioObito: "1", dataObito: "2026-10-05" }));
  ok("43 sim: evolução = 2 (óbito por aids) e data do óbito (48)", caixaEm(ob, A.CX.evolucao, "2", 1) && digitos(ob, 1, 402, 414, 445, 565) === "05102026");
  ok("sem critério óbito: evolução e data do óbito em branco", !algoEm(m, A.CX.evolucao, 1) && digitos(m, 1, 402, 414, 445, 565) === "");
  ok("44-46: local de tratamento só quando informado", !m.some((x) => x.pg === 1 && x.cy > 360 && x.cy < 390) && c.some((x) => x.pg === 1 && x.tipo === "texto" && /MACAÉ/.test(x.texto)));
  ok("CPF no campo 15 com a marca (CPF)", digitos(c, 0, 330, 343, 50, 240) === "52998224725" && c.some((x) => x.tipo === "texto" && x.texto === "(CPF)"));
  ok("sexo M: gestante 'não se aplica' (6)", caixaEm(m, A.CX.gestante, "6"));
  ok("página 2 sem médico: bloco do investigador em branco", !m.some((x) => x.pg === 1 && x.cy > 420));
  ok("página 2 com médico: nome e função", c.some((x) => x.pg === 1 && x.tipo === "texto" && /GUILHERME/.test(x.texto)));
}

/* ---------- PDF de verdade ---------- */
async function gerar(dados) {
  const doc = await PDFLib.PDFDocument.load(BASE);
  const lista = A.montarOperacoes(dados, HOJE);
  const r = await ctx.MeedsNotificacaoDengue.aplicarNoPdf(PDFLib, doc, lista);
  return { bytes: await doc.save(), ops: lista, r: r };
}

async function main() {
  const saida = process.env.NOTIF_SAIDA;
  if (saida) fs.mkdirSync(saida, { recursive: true });
  const guardar = (nome, bytes) => { if (saida) fs.writeFileSync(path.join(saida, nome), bytes); };
  const min = await gerar(MINIMO);
  guardar("aids-minimo.pdf", min.bytes);
  ok("mínimo: reabre com 2 páginas", (await PDFLib.PDFDocument.load(min.bytes)).getPageCount() === 2);
  ok("mínimo: nada ignorado", min.r.ignoradas === 0, min.r.ignoradas);
  const comp = await gerar(COMPLETO);
  guardar("aids-completo.pdf", comp.bytes);
  ok("completo: nada ignorado", comp.r.ignoradas === 0, comp.r.ignoradas);
  const estranho = await gerar(com({ nome: "Łukasz 😀" }));
  ok("caractere fora do WinAnsi não derruba a geração", estranho.r.ignoradas === 0);
  const longo = await gerar(Object.assign({}, COMPLETO, { nome: "A".repeat(200), transfInstituicao: "B".repeat(200), unidadeTrat: "C".repeat(200) }));
  ok("texto longo não derruba a geração", longo.r.ignoradas === 0);
  guardar("aids-longo.pdf", longo.bytes);
  console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
  if (falhas) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
