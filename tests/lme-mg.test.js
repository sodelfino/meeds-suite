#!/usr/bin/env node
/**
 * tests/lme-mg.test.js — LME (Componente Especializado da Assistência
 * Farmacêutica), novo modelo editável da SES-MG
 *
 * O PDF oficial é um formulário com campos (AcroForm): o módulo preenche
 * os campos pelo nome e achata. As regras de "obrigatório" são as dos
 * asteriscos do próprio formulário (*CAMPOS DE PREENCHIMENTO OBRIGATÓRIO)
 * + a premissa do sistema: o documento do paciente e o do médico são
 * SEMPRE o CPF (o campo 15, que o formulário rotula "CNS do médico", recebe
 * o CPF do médico; o 21 sai com a opção CPF marcada).
 *
 * Para ver os PDFs:  LME_SAIDA=/tmp/lme node tests/lme-mg.test.js
 * Uso:  node tests/lme-mg.test.js
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
["assets/base-pdf-lme-mg.js", "lme-mg-ficha.js"].forEach((arq) => {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "modules/lme-mg", arq), "utf8"), ctx);
});
const M = ctx.MeedsLmeMg;
const BASE = Buffer.from(ctx.MEEDS_LME_MG_BASE_PDF_B64, "base64");
const HOJE = "2026-10-07";

const MINIMO = {
  cnes: "2273780", estabelecimento: "ESF Aroeira",
  nome: "Dara Arruda Magalhães", mae: "Ana Carolina Fernandes Arruda", peso: "62,5", altura: "165",
  medicamentos: [{ nome: "Adalimumabe 40 mg injetável", qtd: ["2", "2", "2", "2", "2", "2"] }],
  cid: "M05.8", diagnostico: "Outras artrites reumatoides soropositivas",
  anamnese: "Paciente com artrite reumatoide há 3 anos, sem resposta a metotrexato e leflunomida.",
  tratamentoPrevio: "nao", incapaz: "nao",
  medicoNome: "Guilherme Henrique Oliveira Borges", medicoCpf: "529.982.247-25", data: "2026-10-07",
  preenchidoPor: "medico", raca: "parda",
  tel1Ddd: "22", tel1: "99772-1523",
  cpfPaciente: "111.444.777-35",
};
const COMPLETO = Object.assign({}, MINIMO, {
  nomeSocial: "Dara", medicamentos: [
    { nome: "Adalimumabe 40 mg injetável", qtd: ["2", "2", "2", "2", "2", "2"] },
    { nome: "Metotrexato 2,5 mg comprimido", qtd: ["12", "12", "12", "12", "12", "12"] },
    { nome: "Ácido fólico 5 mg", qtd: ["30", "", "", "", "", "30"] },
  ],
  tratamentoPrevio: "sim", tratamentoRelato: "Metotrexato 20 mg/sem por 12 meses e leflunomida 20 mg/dia por 8 meses, sem resposta.",
  incapaz: "sim", responsavel: "Ana Carolina Fernandes Arruda",
  preenchidoPor: "outro", outroNome: "Maria Souza", outroCpf: "529.982.247-25",
  raca: "indigena", etnia: "Guarani", tel2Ddd: "31", tel2: "3333-4444", email: "dara@exemplo.com.br",
  estabelecimento: "ESF Aroeira",
});
const v = (d) => M.validar(d, HOJE);
const campos = (d) => v(d).map((e) => e.campo);
const com = (extra) => Object.assign({}, MINIMO, extra);

/* ---------- validação (cada asterisco do formulário) ---------- */
ok("caso mínimo é válido", v(MINIMO).length === 0, JSON.stringify(v(MINIMO)));
ok("caso completo é válido", v(COMPLETO).length === 0, JSON.stringify(v(COMPLETO)));
ok("1. CNES: obrigatório e com 7 dígitos", campos(com({ cnes: "" })).indexOf("cnes") !== -1 && campos(com({ cnes: "123" })).indexOf("cnes") !== -1);
ok("3.1 nome: obrigatório", campos(com({ nome: "" })).indexOf("nome") !== -1);
ok("3.2 nome social: opcional", v(com({ nomeSocial: "" })).length === 0);
ok("4. nome da mãe: obrigatório", campos(com({ mae: "" })).indexOf("mae") !== -1);
ok("5. peso: obrigatório, em kg razoáveis", campos(com({ peso: "" })).indexOf("peso") !== -1 && campos(com({ peso: "900" })).indexOf("peso") !== -1 && v(com({ peso: "62,5" })).length === 0 && v(com({ peso: "62.5" })).length === 0);
ok("6. altura: obrigatória, em cm", campos(com({ altura: "" })).indexOf("altura") !== -1 && campos(com({ altura: "1,65" })).indexOf("altura") !== -1 && campos(com({ altura: "10" })).indexOf("altura") !== -1);
ok("7. medicamentos: ao menos um", campos(com({ medicamentos: [] })).indexOf("medicamentos") !== -1 && campos(com({ medicamentos: [{ nome: "", qtd: [] }] })).indexOf("medicamentos") !== -1);
ok("8. quantidade: obrigatória para cada medicamento (ao menos um mês)", campos(com({ medicamentos: [{ nome: "X", qtd: ["", "", "", "", "", ""] }] })).indexOf("medicamentos") !== -1);
ok("8. quantidade: só números inteiros positivos", campos(com({ medicamentos: [{ nome: "X", qtd: ["a", "", "", "", "", ""] }] })).indexOf("medicamentos") !== -1 && campos(com({ medicamentos: [{ nome: "X", qtd: ["0", "", "", "", "", ""] }] })).indexOf("medicamentos") !== -1);
ok("8. quantidade sem nome de medicamento: recusa", campos(com({ medicamentos: [{ nome: "", qtd: ["2"] }, { nome: "X", qtd: ["1"] }] })).indexOf("medicamentos") !== -1);
ok("7. no máximo 6 medicamentos", campos(com({ medicamentos: new Array(7).fill({ nome: "X", qtd: ["1"] }) })).indexOf("medicamentos") !== -1);
ok("9. CID-10: obrigatório e no formato (M05.8, M058, J45)", campos(com({ cid: "" })).indexOf("cid") !== -1 && campos(com({ cid: "XYZ" })).indexOf("cid") !== -1 && ["M05.8", "M058", "J45", "m05.8"].every((c) => v(com({ cid: c })).length === 0));
ok("10. diagnóstico: opcional", v(com({ diagnostico: "" })).length === 0);
ok("11. anamnese: obrigatória", campos(com({ anamnese: "" })).indexOf("anamnese") !== -1);
ok("11. anamnese longa demais para o campo: recusa", campos(com({ anamnese: "palavra ".repeat(300) })).indexOf("anamnese") !== -1);
ok("12. tratamento prévio: obrigatório (não/sim)", campos(com({ tratamentoPrevio: "" })).indexOf("tratamentoPrevio") !== -1);
ok("12. tratamento prévio = sim exige o relato", campos(com({ tratamentoPrevio: "sim", tratamentoRelato: "" })).indexOf("tratamentoRelato") !== -1);
ok("13. atestado de capacidade: obrigatório", campos(com({ incapaz: "" })).indexOf("incapaz") !== -1);
ok("13. incapaz = sim exige o nome do responsável", campos(com({ incapaz: "sim", responsavel: "" })).indexOf("responsavel") !== -1);
ok("14. nome do médico: obrigatório", campos(com({ medicoNome: "" })).indexOf("medicoNome") !== -1);
ok("15. documento do médico: obrigatório e é o CPF (válido)", campos(com({ medicoCpf: "" })).indexOf("medicoCpf") !== -1 && campos(com({ medicoCpf: "123" })).indexOf("medicoCpf") !== -1 && campos(com({ medicoCpf: "11111111111" })).indexOf("medicoCpf") !== -1);
ok("16. data da solicitação: obrigatória, válida, não futura", campos(com({ data: "" })).indexOf("data") !== -1 && campos(com({ data: "2026-10-08" })).indexOf("data") !== -1 && campos(com({ data: "2026-02-30" })).indexOf("data") !== -1);
ok("18. quem preencheu: obrigatório", campos(com({ preenchidoPor: "" })).indexOf("preenchidoPor") !== -1);
ok("18. 'Outro' exige nome e CPF válido", ["outroNome", "outroCpf"].every((c) => campos(com({ preenchidoPor: "outro" })).indexOf(c) !== -1) && campos(com({ preenchidoPor: "outro", outroNome: "X", outroCpf: "123" })).indexOf("outroCpf") !== -1);
ok("19. raça/cor: obrigatória", campos(com({ raca: "" })).indexOf("raca") !== -1);
ok("19. indígena exige a etnia", campos(com({ raca: "indigena", etnia: "" })).indexOf("etnia") !== -1);
ok("20. telefone: ao menos um, com DDD e 8 ou 9 dígitos", campos(com({ tel1: "", tel1Ddd: "" })).indexOf("tel1") !== -1 && campos(com({ tel1Ddd: "2" })).indexOf("tel1") !== -1 && campos(com({ tel1: "123" })).indexOf("tel1") !== -1 && v(com({ tel1: "3333-4444" })).length === 0);
ok("20. segundo telefone, se informado, também é conferido", campos(com({ tel2Ddd: "31", tel2: "12" })).indexOf("tel2") !== -1);
ok("21. documento do paciente: CPF obrigatório e válido (premissa: sempre CPF)", campos(com({ cpfPaciente: "" })).indexOf("cpfPaciente") !== -1 && campos(com({ cpfPaciente: "123" })).indexOf("cpfPaciente") !== -1 && campos(com({ cpfPaciente: "11144477736" })).indexOf("cpfPaciente") !== -1);
ok("22. e-mail: opcional, mas válido se informado", v(com({ email: "" })).length === 0 && campos(com({ email: "isso-nao-e-email" })).indexOf("email") !== -1);

/* ---------- herança do cadastro de estabelecimentos (CNES) ---------- */
{
  const CADASTRO = [
    { nome: "CENTRO DE ESPEC MEDICAS E ODONTO DR OVIDIO NOGUEIRA MACHADO", cnes: "2105578", municipio: "Itaúna" },
    { nome: "SAÚDE AUDITIVA", cnes: "6977073", municipio: "Sete Lagoas" },
    { nome: "UBS CIDADE DE DEUS", cnes: "2209241", municipio: "Sete Lagoas" },
    { nome: "UBS BELO VALE", cnes: "5358965", municipio: "Sete Lagoas" },
    { nome: "CENTRO R E ESPECIALIDADES DIVINO FERREIRA BRAGA", cnes: "2125943", municipio: "Betim" },
    { nome: "UBS CENTRO", cnes: "1111111", municipio: "Betim" },
    { nome: "UBS CENTRO", cnes: "2222222", municipio: "Sete Lagoas" },
    { nome: "ESF AROEIRA", cnes: "", municipio: "Macaé" },
  ];
  const acha = (nome, mun) => M.acharEstabelecimento(CADASTRO, nome, mun);
  ok("nome idêntico: acha o CNES", (acha("UBS BELO VALE", "Sete Lagoas") || {}).cnes === "5358965");
  ok("ignora acento, caixa e espaços repetidos", (acha("  saude   auditiva ", "") || {}).cnes === "6977073");
  ok("mesmo nome em dois municípios: o município da tela decide", (acha("UBS CENTRO", "Betim") || {}).cnes === "1111111" && (acha("UBS CENTRO", "Sete Lagoas") || {}).cnes === "2222222");
  ok("mesmo nome em dois municípios sem município: não adivinha", acha("UBS CENTRO", "") === null);
  ok("nome da tela com palavras a mais (ex.: cidade no fim), mas só um candidato: acha", (acha("UBS BELO VALE - SETE LAGOAS", "Sete Lagoas") || {}).cnes === "5358965");
ok("nome curto demais para confiar ('UBS') não casa por aproximação", acha("UBS", "Sete Lagoas") === null);
  ok("unidade que não está no cadastro: null", acha("UBS INEXISTENTE", "Betim") === null);
  ok("unidade cadastrada sem CNES não conta como achada", acha("ESF AROEIRA", "Macaé") === null);
  ok("nome vazio: null", acha("", "Betim") === null);
  const porCnes = (c) => M.acharPorCnes(CADASTRO, c);
  ok("CNES digitado (com ou sem máscara) traz o estabelecimento", (porCnes("2209241") || {}).nome === "UBS CIDADE DE DEUS" && (porCnes("2.209.241") || {}).nome === "UBS CIDADE DE DEUS");
  ok("CNES que não existe, incompleto ou vazio: null", porCnes("9999999") === null && porCnes("2209") === null && porCnes("") === null);
}

/* ---------- preenchimento do PDF ---------- */
async function gerar(dados, achatar) {
  const doc = await PDFLib.PDFDocument.load(BASE);
  await M.preencherPdf(PDFLib, doc, dados, HOJE, { achatar: achatar === true });
  return doc;
}
const texto = (doc, nome) => doc.getForm().getTextField(nome).getText() || "";

async function main() {
  const saida = process.env.LME_SAIDA;
  if (saida) fs.mkdirSync(saida, { recursive: true });
  const guardar = async (nome, doc) => { if (saida) fs.writeFileSync(path.join(saida, nome), await doc.save()); };

  const d = await gerar(COMPLETO, false);
  ok("1. CNES no Text1 e 2. estabelecimento no Text2", texto(d, "Text1") === "2273780" && texto(d, "Text2") === "ESF AROEIRA");
  ok("3.1 nome (Text3), 3.2 social (Text4), 4. mãe (Text5)", texto(d, "Text3") === "DARA ARRUDA MAGALHÃES" && texto(d, "Text4") === "DARA" && texto(d, "Text5") === "ANA CAROLINA FERNANDES ARRUDA");
  ok("5. peso e 6. altura", texto(d, "Text6") === "62,5" && texto(d, "Text7") === "165");
  ok("7. medicamentos nas linhas 1 a 3, linhas 4 a 6 vazias", texto(d, "Text8") === "ADALIMUMABE 40 MG INJETÁVEL" && texto(d, "Text9").indexOf("METOTREXATO") === 0 && texto(d, "Text10").indexOf("ÁCIDO FÓLICO") === 0 && texto(d, "Text11") === "" && texto(d, "Text13") === "");
  ok("8. quantidades: linha 1 nos 6 meses", ["Text16", "Text22", "Text32", "Text40", "Text56", "Text62"].every((n) => texto(d, n) === "2"));
  ok("8. quantidades: meses em branco ficam em branco (linha 3: 1º e 6º)", texto(d, "Text18") === "30" && texto(d, "Text24") === "" && texto(d, "Text64") === "30");
  ok("9. CID (Text14) e 10. diagnóstico (Text31)", texto(d, "Text14") === "M05.8" && texto(d, "Text31").indexOf("OUTRAS ARTRITES") === 0);
  ok("11. anamnese (Text15)", texto(d, "Text15").indexOf("Paciente com artrite") === 0);
  ok("12. tratamento prévio = sim (segunda opção) com relato", d.getForm().getRadioGroup("Button29").getSelected() === "<2>" && texto(d, "Text30").indexOf("Metotrexato 20 mg") === 0);
  ok("13. incapaz = sim (segunda opção) com responsável", d.getForm().getRadioGroup("Button38").getSelected() === "<2>" && texto(d, "Text39") === "ANA CAROLINA FERNANDES ARRUDA");
  ok("14. médico (Text46), 15. CPF do médico no lugar do CNS (Text47), 16. data (Text48)", texto(d, "Text46") === "GUILHERME HENRIQUE OLIVEIRA BORGES" && texto(d, "Text47") === "CPF 529.982.247-25" && texto(d, "Text48") === "07/10/2026");
  ok("18. 'Outro': só ele marcado, com nome (Text49) e CPF (Text50)", d.getForm().getCheckBox("Button72").isChecked() && !d.getForm().getCheckBox("Button68").isChecked() && !d.getForm().getCheckBox("Button71").isChecked() && texto(d, "Text49") === "MARIA SOUZA" && texto(d, "Text50") === "529.982.247-25");
  ok("19. indígena marcada (Button79) com etnia (Text51); as outras raças não", d.getForm().getCheckBox("Button79").isChecked() && !d.getForm().getCheckBox("Button77").isChecked() && !d.getForm().getCheckBox("Button81").isChecked() && texto(d, "Text51") === "GUARANI");
  ok("20. telefones: DDD (Text73/75) e número (Text74/76)", texto(d, "Text73") === "22" && texto(d, "Text74") === "99772-1523" && texto(d, "Text75") === "31" && texto(d, "Text76") === "3333-4444");
  ok("21. documento: opção CPF marcada (primeira) e CPF do paciente (Text52)", d.getForm().getRadioGroup("Button82").getSelected() === "<1>" && texto(d, "Text52") === "111.444.777-35");
  ok("22. e-mail (Text53)", texto(d, "Text53") === "dara@exemplo.com.br");
  await guardar("lme-mg-completo-editavel.pdf", d);

  const m = await gerar(MINIMO, false);
  ok("mínimo: tratamento prévio = não (primeira opção) e capacidade = não", m.getForm().getRadioGroup("Button29").getSelected() === "<1>" && m.getForm().getRadioGroup("Button38").getSelected() === "<1>");
  ok("mínimo: 18. médico marcado", m.getForm().getCheckBox("Button71").isChecked() && !m.getForm().getCheckBox("Button72").isChecked());
  ok("mínimo: raça parda (Button81)", m.getForm().getCheckBox("Button81").isChecked() && !m.getForm().getCheckBox("Button77").isChecked());
  ok("mínimo: campos opcionais em branco (social, relato, responsável, e-mail, 2º telefone)", ["Text4", "Text30", "Text39", "Text53", "Text74"].filter((n) => n !== "Text74").every((n) => texto(m, n) === "") && texto(m, "Text76") === "");
  ok("sanitiza caractere fora do WinAnsi sem derrubar", await (async () => { const x = await gerar(com({ nome: "Łukasz 😀" })); return x.getPageCount() === 1; })());

  const final = await gerar(COMPLETO);
  const reaberto = await PDFLib.PDFDocument.load(await final.save());
  ok("o PDF gerado reabre, com 1 página e o formulário ainda editável (79 campos)", reaberto.getPageCount() === 1 && reaberto.getForm().getFields().length === 79);
  await guardar("lme-mg-completo.pdf", final);
  await guardar("lme-mg-minimo.pdf", await gerar(MINIMO));

  const longo = com({ anamnese: "Paciente com quadro clínico extenso. ".repeat(20), nome: "A".repeat(100) });
  ok("anamnese quase no limite ainda gera", (await gerar(longo)).getPageCount() === 1);
  await guardar("lme-mg-longo.pdf", await gerar(longo));

  console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
  if (falhas) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
