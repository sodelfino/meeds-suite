#!/usr/bin/env node
/**
 * tests/notificacao-violencia.test.js — Ficha de Violência interpessoal/autoprovocada
 *
 * Mesmas premissas das outras fichas: só a primeira consulta, obrigatórios
 * validados, CPF no lugar do Cartão SUS, item obrigatório nunca em branco
 * (1-Sim / 2-Não / 8-Não se aplica / 9-Ignorado), PDF oficial gerado de
 * verdade. O PDF oficial é uma imagem escaneada: as coordenadas foram
 * medidas por pixel e conferidas a olho (ver violencia-ficha.js).
 *
 * Para ver os PDFs:  NOTIF_SAIDA=/tmp/fichas node tests/notificacao-violencia.test.js
 *
 * Uso:  node tests/notificacao-violencia.test.js
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
["assets/base-pdf-violencia.js", "assets/municipios-ibge.js", "dengue-ficha.js", "violencia-ficha.js"].forEach((arq) => {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "modules/notificacao", arq), "utf8"), ctx);
});
const V = ctx.MeedsNotificacaoViolencia;
const BASE = Buffer.from(ctx.MEEDS_NOTIF_VIOLENCIA_BASE_PDF_B64, "base64");
const HOJE = "2026-10-07";
const ids = (lista) => lista.map((i) => i.id);

/* Caso mínimo: violência física no domicílio, sem encaminhamento. */
const MINIMO = {
  nome: "Dara Arruda Magalhães", nascimento: "2000-05-18", sexo: "F", gestante: "5", raca: "3",
  ufRes: "RJ", municipioRes: "Macaé", telefone: "2237721523",
  ufNotif: "RJ", municipioNotif: "Macaé", unidade: "ESF Aroeira",
  dataOcorrencia: "2026-10-05", local: "01", outrasVezes: "2", autoprovocada: "2",
  ocorUf: "RJ", ocorMunicipio: "Macaé",
  estadoCivil: "1", orientacao: "9", identidade: "8", deficiencia: "2",
  motivacao: "88", tipos: ["fisica"], meios: ["forcaCorporal"],
  envolvidos: "1", vinculos: ["exConjuge"], sexoAutor: "1", alcool: "2", ciclo: "4",
  encNenhum: true, trabalho: "2",
};
const COMPLETO = Object.assign({}, MINIMO, {
  escolaridade: "6", cpf: "52998224725", mae: "Ana Carolina Fernandes Arruda", ocupacao: "Estudante", nomeSocial: "Dara",
  bairro: "Aroeira", logradouro: "Rua Doutor Sebastião de Moraes", numero: "123", complemento: "Casa 2",
  referencia: "Em frente à padaria", cep: "27913-000", telefone: "22997721523", zona: "1",
  unidade: "ESF Aroeira", cnes: "2273780",
  ocorHora: "21:45", ocorBairro: "Aroeira", ocorLogradouro: "Rua Doutor Sebastião de Moraes", ocorNumero: "123",
  ocorComplemento: "Casa 2", ocorReferencia: "Em frente à padaria", ocorZona: "1",
  deficiencia: "1", defTipos: ["fisica", "outras"], defOutras: "Baixa visão",
  motivacao: "09", motivacaoOutro: "Conflito vicinal",
  tipos: ["fisica", "psicologica", "sexual", "outros"], tipoOutro: "Perseguição",
  meios: ["forcaCorporal", "ameaca", "outro"], meioOutro: "Cinto",
  sexTipos: ["estupro", "outros"], sexOutro: "Registro de imagens",
  procedimentos: ["profHiv", "contracepcao"],
  vinculos: ["exConjuge", "outros"], vinculoOutro: "Vizinho",
  encNenhum: false, encaminhamentos: ["saude", "mulher", "delegMulher"],
  trabalho: "1", cat: "2", cid: "X95.4",
  acompNome: "Maria Souza da Silva", acompVinculo: "Mãe", acompTelefone: "(22) 98877-6655",
  observacoes: "Paciente relata episódio no domicílio.",
  medicoNome: "Guilherme Henrique Oliveira Borges", medicoFuncao: "Médico (CRM/SP 255626)",
});
const v = (d) => V.validar(d, HOJE);
const campos = (d) => v(d).map((e) => e.campo);
const com = (extra) => Object.assign({}, MINIMO, extra);
const ops = (d) => V.montarOperacoes(d, HOJE);

/* ---------- validação ---------- */
ok("caso mínimo é válido", v(MINIMO).length === 0, JSON.stringify(v(MINIMO)));
ok("caso completo é válido", v(COMPLETO).length === 0, JSON.stringify(v(COMPLETO)));
[
  ["dataOcorrencia", { dataOcorrencia: "" }], ["local", { local: "" }], ["outrasVezes", { outrasVezes: "" }],
  ["autoprovocada", { autoprovocada: "" }], ["ocorUf", { ocorUf: "" }], ["ocorMunicipio", { ocorMunicipio: "" }],
  ["raca", { raca: "" }], ["estadoCivil", { estadoCivil: "" }], ["orientacao", { orientacao: "" }],
  ["identidade", { identidade: "" }], ["deficiencia", { deficiencia: "" }], ["motivacao", { motivacao: "" }],
  ["tipos", { tipos: [] }], ["envolvidos", { envolvidos: "" }], ["sexoAutor", { sexoAutor: "" }], ["alcool", { alcool: "" }],
  ["ciclo", { ciclo: "" }], ["trabalho", { trabalho: "" }],
].forEach(([campo, extra]) => {
  ok("sem " + campo + ": recusa só esse campo", campos(com(extra)).join() === campo, campos(com(extra)).join());
});
ok("data da ocorrência futura: recusa", campos(com({ dataOcorrencia: "2026-10-08" })).indexOf("dataOcorrencia") !== -1);
ok("ocorrência antes do nascimento: recusa", campos(com({ dataOcorrencia: "1999-01-01" })).indexOf("dataOcorrencia") !== -1);
ok("ocorrência hoje: vale", v(com({ dataOcorrencia: HOJE })).length === 0);
ok("município de ocorrência fora da UF: recusa", campos(com({ ocorMunicipio: "Belo Horizonte" })).indexOf("ocorMunicipio") !== -1);
ok("local, outras vezes e autoprovocada aceitam 99 e 9", v(com({ local: "99", outrasVezes: "9", autoprovocada: "9" })).length === 0);
ok("local inventado (10): recusa", campos(com({ local: "10" })).indexOf("local") !== -1);
ok("hora inválida (25:00): recusa", campos(com({ ocorHora: "25:00" })).indexOf("ocorHora") !== -1);
ok("hora opcional: vazia vale, 21:45 vale", v(com({ ocorHora: "" })).length === 0 && v(com({ ocorHora: "21:45" })).length === 0);
ok("paciente do sexo feminino sem gestante: recusa (regra comum)", campos(com({ gestante: "" })).indexOf("gestante") !== -1);
ok("sem telefone: recusa (regra comum)", campos(com({ telefone: "" })).indexOf("telefone") !== -1);

/* 38/39 */
ok("deficiência 'sim' sem tipo (39): recusa", campos(com({ deficiencia: "1", defTipos: [] })).join() === "defTipos");
ok("deficiência 'sim' com tipo: vale", v(com({ deficiencia: "1", defTipos: ["visual"] })).length === 0);

/* atestados (57, 61, 65): marcar OU atestar, nunca os dois, nunca nenhum */
ok("57 sem meio e sem 'ignorado': recusa", campos(com({ meios: [] })).join() === "meios");
ok("57 'ignorado' sem meios: vale", v(com({ meios: [], meiosIgnorado: true })).length === 0);
ok("57 'ignorado' com meio marcado: contradição, recusa", campos(com({ meiosIgnorado: true })).join() === "meios");
ok("61 sem vínculo e sem 'ignorado': recusa", campos(com({ vinculos: [] })).join() === "vinculos");
ok("61 'ignorado' sem vínculos: vale", v(com({ vinculos: [], vinculoIgnorado: true })).length === 0);
ok("65 sem encaminhamento e sem 'nenhum': recusa", campos(com({ encNenhum: false })).join() === "encaminhamentos");
ok("65 'nenhum' com encaminhamento marcado: contradição, recusa", campos(com({ encaminhamentos: ["tutelar"] })).join() === "encaminhamentos");
ok("65 com encaminhamento (sem 'nenhum'): vale", v(com({ encNenhum: false, encaminhamentos: ["tutelar"] })).length === 0);

/* violência sexual: 58 e 59 só existem com o tipo "sexual" no 56 */
const SEX = { tipos: ["sexual"] };
ok("sexual sem 58 e sem 59: recusa os dois", campos(com(SEX)).sort().join() === "procedimentos,sexTipos");
ok("sexual com 58 'ignorado' e 59 'nenhum': vale", v(com(Object.assign({ sexIgnorado: true, procNenhum: true }, SEX))).length === 0);
ok("sexual com tipo e procedimento: vale", v(com(Object.assign({ sexTipos: ["estupro"], procedimentos: ["profHiv"] }, SEX))).length === 0);
ok("sexual: 58 'ignorado' com tipo marcado = contradição", campos(com(Object.assign({ sexIgnorado: true, sexTipos: ["estupro"], procNenhum: true }, SEX))).join() === "sexTipos");
ok("sexual: 59 'nenhum' com procedimento marcado = contradição", campos(com(Object.assign({ sexTipos: ["estupro"], procNenhum: true, procedimentos: ["profHiv"] }, SEX))).join() === "procedimentos");
ok("sem 'sexual' no 56: 58 e 59 não são cobrados", v(MINIMO).length === 0 && !V.temViolenciaSexual(MINIMO));

/* lesão autoprovocada (54) × própria pessoa (61) */
ok("autoprovocada 'sim' sem 'própria pessoa': recusa", campos(com({ autoprovocada: "1" })).join() === "vinculos");
ok("autoprovocada 'sim' com 'própria pessoa': vale", v(com({ autoprovocada: "1", vinculos: ["propria"], envolvidos: "1" })).length === 0);
ok("'própria pessoa' sem autoprovocada: recusa", campos(com({ vinculos: ["propria"] })).join() === "vinculos");
ok("'própria pessoa' com autoprovocada 'ignorado': não acusa (54 não respondida como sim/não)", v(com({ autoprovocada: "9", vinculos: ["propria"] })).length === 0);

/* 66/67 e 68 */
ok("trabalho 'sim' sem CAT (67): recusa", campos(com({ trabalho: "1" })).join() === "cat");
ok("trabalho 'sim' com CAT: vale", v(com({ trabalho: "1", cat: "2" })).length === 0);
ok("CAT 'não se aplica' (8) não é aceito com trabalho 'sim'", campos(com({ trabalho: "1", cat: "8" })).join() === "cat");
ok("CID da circunstância: X954, X95.4, x95, Y09 valem", ["X954", "X95.4", "x95", "Y09", "X60"].every((c) => V.cidValido(c)));
ok("CID fora do capítulo XX (X59, Y10, A90, X9) recusa", ["X59", "Y10", "A90", "X9", "X9544", ""].every((c) => !V.cidValido(c)));
ok("CID inválido digitado: recusa; vazio: vale", campos(com({ cid: "A90" })).join() === "cid" && v(com({ cid: "" })).length === 0);
ok("telefone do acompanhante curto: recusa", campos(com({ acompTelefone: "12345" })).join() === "acompTelefone");

/* ciclo de vida (64) e dicas de idade */
ok("ciclo de vida pela idade (9, 10, 19, 20, 24, 25, 59, 60)", ["1", "2", "2", "3", "3", "4", "4", "5"].join() === [9, 10, 19, 20, 24, 25, 59, 60].map(V.cicloDe).join());
ok("ciclo sem idade: vazio", V.cicloDe(null) === "");
ok("idade em anos a partir do nascimento", V.idadeEmAnos({ nascimento: "2000-05-18" }, HOJE) === 26 && V.idadeEmAnos({ nascimento: "2026-03-01" }, HOJE) === 0);
const UI = (() => {
  const c2 = {}; c2.window = c2; c2.globalThis = c2; vm.createContext(c2);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "modules/notificacao/violencia-form.js"), "utf8"), c2);
  return c2.MeedsNotificacaoViolenciaUi;
})();
ok("dica: menor de 10 anos fala de 'Não se aplica' e do Conselho Tutelar", /Menor de 10 anos/.test(UI.dicaDaIdade(8)) && /Conselho Tutelar/.test(UI.dicaDaIdade(8)));
ok("dica: adolescente só fala do Conselho Tutelar", !/Menor de 10/.test(UI.dicaDaIdade(15)) && /Conselho Tutelar/.test(UI.dicaDaIdade(15)));
ok("dica: adulto não tem dica", UI.dicaDaIdade(30) === "");
ok("dica: idoso fala do Conselho do Idoso", /Conselho do Idoso/.test(UI.dicaDaIdade(70)));

/* ---------- desenho ---------- */
const dentro = (op, c) => {
  const x = op.cx !== undefined ? op.cx : op.x;
  const y = op.cy !== undefined ? op.cy : op.y;
  return x >= c[0] && x <= c[2] && y >= c[1] && y <= c[3];
};
const caixaEm = (lista, caixa, texto, pg) => lista.some((o) => (pg === undefined || o.pg === pg) && o.texto === texto && dentro(o, caixa));
const algoEm = (lista, caixa, pg) => lista.some((o) => o.tipo !== "fundo" && (pg === undefined || o.pg === pg) && dentro(o, caixa));
const digitos = (lista, pg, ymin, ymax, xmin, xmax) =>
  lista.filter((o) => o.pg === pg && o.tipo === "centro" && o.cy >= ymin && o.cy <= ymax && o.cx >= xmin && o.cx <= xmax)
    .sort((a, b) => a.cx - b.cx).map((o) => o.texto).join("");
const todas = (cat, d, valor, pg) => cat.every((i) => caixaEm(d, i.caixa, valor, pg));

{
  const m = ops(MINIMO);
  const c = ops(COMPLETO);
  ok("6: unidade notificadora = 1 (Unidade de Saúde)", caixaEm(m, V.CX.tipoUnidade, "1", 0));
  ok("data da notificação automática (hoje)", digitos(m, 0, 138, 148, 440, 565) === "07102026", digitos(m, 0, 138, 148, 440, 565));
  ok("9: data da ocorrência", digitos(m, 0, 212, 222, 439, 560) === "05102026");
  ok("município de notificação: código IBGE nas células", digitos(m, 0, 160, 167, 474, 565) === "330240");
  ok("município de ocorrência (41): código IBGE", digitos(m, 0, 644, 652, 324, 412) === "330240");
  ok("UF nas células (4, 19 e 40) com fundo branco por cima da trama", ["RJ"].every(() => m.filter((x) => x.tipo === "fundo").length >= 6));
  ok("sexo F e gestante 'não' (5)", caixaEm(m, V.CX.sexo, "F", 0) && caixaEm(m, V.CX.gestante, "5", 0));
  ok("sexo M: gestante 'não se aplica' (6)", caixaEm(ops(com({ sexo: "M", gestante: "" })), V.CX.gestante, "6", 0));
  ok("raça/cor (15)", caixaEm(m, V.CX.raca, "3", 0));
  ok("CPF no campo 17 com a marca (CPF)", digitos(c, 0, 333, 345, 50, 230) === "52998224725" && c.some((x) => x.tipo === "texto" && x.texto === "(CPF)"));
  ok("sem CPF: nada no campo 17", digitos(m, 0, 333, 345, 50, 230) === "" && !m.some((x) => x.tipo === "texto" && x.texto === "(CPF)"));
  ok("telefone de 11 dígitos cabe nas 10 células (última dividida)", digitos(c, 0, 464, 475, 52, 205) === "22997721523");
  ok("CEP em 5 + 3 células", digitos(c, 0, 440, 451, 454, 530) === "27913" && digitos(c, 0, 440, 451, 526, 566) === "000");
  ok("hora da ocorrência (51) em 4 células", digitos(c, 0, 717, 727, 489, 546) === "2145" && digitos(m, 0, 717, 727, 489, 546) === "");
  ok("52: local em 2 células ('01')", digitos(m, 0, 728, 738, 378, 405) === "01");
  ok("53 e 54 nas caixas", caixaEm(m, V.CX.outrasVezes, "2", 0) && caixaEm(m, V.CX.autoprovocada, "2", 0));

  /* 38 e 39 */
  ok("38: deficiência 'não' → 39 sai '8' (não se aplica) nas 7 caixas", caixaEm(m, V.CX.deficiencia, "2", 0) && todas(V.DEFICIENCIAS, m, "8", 0));
  ok("38 'sim': marcadas 1, demais 2", caixaEm(c, V.DEFICIENCIAS[0].caixa, "1", 0) && caixaEm(c, V.DEFICIENCIAS[1].caixa, "2", 0));
  ok("35, 36 e 37 nas caixas", caixaEm(m, V.CX.estadoCivil, "1", 0) && caixaEm(m, V.CX.orientacao, "9", 0) && caixaEm(m, V.CX.identidade, "8", 0));

  /* 55-59 */
  ok("55: motivação em 2 células", digitos(m, 1, 52, 62, 543, 566) === "88" && digitos(c, 1, 52, 62, 543, 566) === "09");
  ok("56: marcado 1 e demais 2 (10 itens, nenhum em branco)", caixaEm(m, V.TIPOS[0].caixa, "1", 1) && V.TIPOS.slice(1).every((i) => caixaEm(m, i.caixa, "2", 1)));
  ok("57: meios marcados 1, demais 2", caixaEm(m, V.MEIOS[0].caixa, "1", 1) && V.MEIOS.slice(1).every((i) => caixaEm(m, i.caixa, "2", 1)));
  ok("57 'ignorado': as 9 caixas saem 9", todas(V.MEIOS, ops(com({ meios: [], meiosIgnorado: true })), "9", 1));
  ok("58 e 59 sem violência sexual: '8' (não se aplica) nas 5 e nas 8 caixas", todas(V.SEXUAIS, m, "8", 1) && todas(V.PROCEDIMENTOS, m, "8", 1));
  const sx = ops(com({ tipos: ["sexual"], sexTipos: ["estupro"], procedimentos: ["profHiv"] }));
  ok("58 com sexual: estupro 1 e demais 2", caixaEm(sx, V.SEXUAIS[1].caixa, "1", 1) && caixaEm(sx, V.SEXUAIS[0].caixa, "2", 1));
  ok("59 com sexual: marcado 1 e demais 2", caixaEm(sx, V.PROCEDIMENTOS[1].caixa, "1", 1) && caixaEm(sx, V.PROCEDIMENTOS[0].caixa, "2", 1));
  ok("58 'ignorado' com sexual: 5 caixas 9", todas(V.SEXUAIS, ops(com({ tipos: ["sexual"], sexIgnorado: true, procNenhum: true })), "9", 1));
  ok("59 'nenhum procedimento': 8 caixas 2", todas(V.PROCEDIMENTOS, ops(com({ tipos: ["sexual"], sexIgnorado: true, procNenhum: true })), "2", 1));

  /* 60-64 */
  ok("60 a 64 nas caixas", caixaEm(m, V.CX.envolvidos, "1", 1) && caixaEm(m, V.CX.sexoAutor, "1", 1) && caixaEm(m, V.CX.alcool, "2", 1) && caixaEm(m, V.CX.ciclo, "4", 1));
  ok("61: vínculo marcado 1 e os 17 demais 2", caixaEm(m, V.VINCULOS.filter((i) => i.id === "exConjuge")[0].caixa, "1", 1) && V.VINCULOS.filter((i) => i.id !== "exConjuge").every((i) => caixaEm(m, i.caixa, "2", 1)));
  ok("61 'ignorado': 18 caixas 9", todas(V.VINCULOS, ops(com({ vinculos: [], vinculoIgnorado: true })), "9", 1));

  /* 65-68 */
  ok("65 'nenhum': as 14 caixas saem 2", todas(V.ENCAMINHAMENTOS, m, "2", 1));
  ok("65 marcados 1 e demais 2", caixaEm(c, V.ENCAMINHAMENTOS[0].caixa, "1", 1) && caixaEm(c, V.ENCAMINHAMENTOS[4].caixa, "2", 1) && caixaEm(c, V.ENCAMINHAMENTOS[10].caixa, "1", 1));
  ok("66 'não' → 67 sai '8'", caixaEm(m, V.CX.trabalho, "2", 1) && caixaEm(m, V.CX.cat, "8", 1));
  ok("66 'sim' → 67 recebe a resposta (2)", caixaEm(c, V.CX.trabalho, "1", 1) && caixaEm(c, V.CX.cat, "2", 1));
  ok("68: CID em 4 células (X95.4 → X954)", digitos(c, 1, 466, 478, 503, 560) === "X954" && digitos(m, 1, 466, 478, 503, 560) === "");
  ok("69: data de encerramento fica em branco para a vigilância", !m.some((x) => x.pg === 1 && x.cy > 440 && x.cy < 470 && x.cx < 130) && !c.some((x) => x.pg === 1 && x.cy > 480 && x.cy < 540));

  /* acompanhante, observações, notificador */
  ok("acompanhante: nome, vínculo e telefone", c.some((x) => x.pg === 1 && x.tipo === "texto" && /MARIA SOUZA/.test(x.texto)) && digitos(c, 1, 550, 562, 416, 566) === "22988776655");
  ok("sem acompanhante: nada na faixa", !m.some((x) => x.pg === 1 && x.cy > 548 && x.cy < 562) && !m.some((x) => x.pg === 1 && x.tipo === "texto" && x.y > 550 && x.y < 560));
  const blocos = c.filter((x) => x.tipo === "bloco");
  ok("observações: texto livre + os 'outros' que não cabem na linha", blocos.length === 1 && /episódio/.test(blocos[0].texto) && /\(55 outros\) CONFLITO VICINAL|\(55 outros\) Conflito vicinal/i.test(blocos[0].texto) && /\(61 outros\)/.test(blocos[0].texto) && /\(52 outros\)/.test(blocos[0].texto) === false);
  ok("sem 'outros' nem observações: nada de bloco", !m.some((x) => x.tipo === "bloco"));
  ok("bloco do notificador só com médico escolhido", !m.some((x) => x.pg === 1 && x.cy > 690) && c.some((x) => x.pg === 1 && x.tipo === "texto" && /GUILHERME/.test(x.texto)));
  ok("CNES do notificador em células (com médico)", digitos(c, 1, 697, 708, 448, 556) === "2273780");
}

/* ---------- PDF de verdade ---------- */
async function gerar(dados) {
  const doc = await PDFLib.PDFDocument.load(BASE);
  const lista = V.montarOperacoes(dados, HOJE);
  const r = await ctx.MeedsNotificacaoDengue.aplicarNoPdf(PDFLib, doc, lista);
  return { bytes: await doc.save(), ops: lista, r: r };
}

async function main() {
  const saida = process.env.NOTIF_SAIDA;
  if (saida) fs.mkdirSync(saida, { recursive: true });
  const guardar = (nome, bytes) => { if (saida) fs.writeFileSync(path.join(saida, nome), bytes); };
  const base = await PDFLib.PDFDocument.load(BASE);
  ok("PDF base: 2 páginas A4 (595 x 842)", base.getPageCount() === 2 && Math.round(base.getPage(0).getWidth()) === 595 && Math.round(base.getPage(0).getHeight()) === 842);
  ok("PDF base cabe no pacote (menos de 400 KB)", BASE.length < 400 * 1024, Math.round(BASE.length / 1024) + " KB");
  const min = await gerar(MINIMO);
  guardar("violencia-minimo.pdf", min.bytes);
  ok("mínimo: reabre com 2 páginas", (await PDFLib.PDFDocument.load(min.bytes)).getPageCount() === 2);
  ok("mínimo: nada ignorado", min.r.ignoradas === 0, min.r.ignoradas);
  const comp = await gerar(COMPLETO);
  guardar("violencia-completo.pdf", comp.bytes);
  ok("completo: nada ignorado", comp.r.ignoradas === 0, comp.r.ignoradas);
  const estranho = await gerar(com({ nome: "Łukasz 😀" }));
  ok("caractere fora do WinAnsi não derruba a geração", estranho.r.ignoradas === 0);
  const longo = await gerar(Object.assign({}, COMPLETO, { nome: "A".repeat(200), logradouro: "B".repeat(200), acompNome: "C".repeat(200), observacoes: "D ".repeat(400) }));
  ok("texto longo não derruba a geração", longo.r.ignoradas === 0);
  guardar("violencia-longo.pdf", longo.bytes);
  console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
  if (falhas) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
