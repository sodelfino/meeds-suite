#!/usr/bin/env node
/**
 * tests/notificacao-dengue-pdf.test.js — a ficha gerada de verdade
 *
 * Ponta a ponta, com o pdf-lib real (devDependency, a mesma versão que o
 * userscript carrega do CDN) e o PDF oficial embutido no pacote: monta as
 * operações, desenha, salva, reabre. Prova que a geração não explode com
 * caso mínimo, caso completo, nome com caractere fora do WinAnsi e texto
 * longo, e que a página 2 continua com as 2 páginas do formulário oficial.
 *
 * A conferência de que cada valor cai DENTRO da própria célula é visual
 * (renderização + olho) — para ver, rode com:
 *   NOTIF_SAIDA=/tmp/fichas node tests/notificacao-dengue-pdf.test.js
 * que grava os PDFs gerados nessa pasta.
 *
 * Uso:  node tests/notificacao-dengue-pdf.test.js
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
["assets/base-pdf-dengue.js", "assets/municipios-ibge.js", "dengue-ficha.js"].forEach((arq) => {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "modules/notificacao", arq), "utf8"), ctx);
});
const N = ctx.MeedsNotificacaoDengue;
const BASE = Buffer.from(ctx.MEEDS_NOTIF_DENGUE_BASE_PDF_B64, "base64");
const HOJE = "2026-10-06";

const MINIMO = {
  agravo: "dengue", inicioSintomas: "2026-10-04", sinais: ["febre"], semAlarme: true,
  nome: "Maria da Silva", nascimento: "1990-01-02", sexo: "M",
  ufRes: "RJ", municipioRes: "Macaé", telefone: "2237721523",
  ufNotif: "RJ", municipioNotif: "Macaé", unidade: "ESF Aroeira",
};

const COMPLETO = Object.assign({}, MINIMO, {
  agravo: "chikungunya", inicioSintomas: "2026-10-01",
  sinais: N.SINAIS_CLINICOS.map((s) => s.id),
  doencas: N.DOENCAS.map((s) => s.id),
  semAlarme: false,
  alarme: N.ALARME.map((a) => a.id),
  gravidade: N.GRAVIDADE.map((g) => g.id),
  dataAlarme: "2026-10-05", dataGravidade: "2026-10-06", outrosOrgaos: "Pâncreas",
  nome: "Dara Arruda Magalhães", nascimento: "2000-05-18", sexo: "F", gestante: "2",
  raca: "4", escolaridade: "6", cpf: "52998224725", mae: "Ana Carolina Fernandes Arruda",
  bairro: "Aroeira", logradouro: "Rua Doutor Sebastião de Moraes", numero: "123",
  complemento: "Casa 2", referencia: "Em frente à padaria", cep: "27913-000",
  telefone: "22997721523", zona: "1", ocupacao: "Estudante",
  unidade: "ESF Aroeira", cnes: "2273780",
  observacoes: "Primeira consulta por telemedicina na unidade. Paciente refere febre há 3 dias, cefaleia e mialgia. Orientada hidratação oral e retorno imediato se sinais de alarme.",
  medicoNome: "Guilherme Henrique Oliveira Borges", medicoFuncao: "Médico (CRM/SP 255626)",
});

async function gerar(dados) {
  const doc = await PDFLib.PDFDocument.load(BASE);
  const ops = N.montarOperacoes(dados, HOJE);
  const r = await N.aplicarNoPdf(PDFLib, doc, ops);
  const bytes = await doc.save();
  return { bytes: bytes, ops: ops, r: r };
}

async function main() {
  const saida = process.env.NOTIF_SAIDA;
  if (saida) fs.mkdirSync(saida, { recursive: true });
  const guardar = (nome, bytes) => { if (saida) fs.writeFileSync(path.join(saida, nome), bytes); };

  ok("o caso mínimo é válido (sanidade do teste)", N.validar(MINIMO, HOJE).length === 0, JSON.stringify(N.validar(MINIMO, HOJE)));
  ok("o caso completo é válido? (alarme + 'sem alarme' = não: usa só os sinais)", N.validar(COMPLETO, HOJE).length === 0, JSON.stringify(N.validar(COMPLETO, HOJE)));

  const min = await gerar(MINIMO);
  guardar("minimo.pdf", min.bytes);
  const reaberto = await PDFLib.PDFDocument.load(min.bytes);
  ok("mínimo: o PDF gerado reabre", reaberto.getPageCount() === 2);
  ok("mínimo: nada foi ignorado", min.r.ignoradas === 0, min.r.ignoradas);
  ok("mínimo: desenhou todas as operações", min.r.desenhadas >= min.ops.length, min.r.desenhadas + "/" + min.ops.length);
  ok("mínimo: o arquivo cresceu em relação ao formulário em branco", min.bytes.length > BASE.length);

  const comp = await gerar(COMPLETO);
  guardar("completo.pdf", comp.bytes);
  ok("completo: reabre com 2 páginas", (await PDFLib.PDFDocument.load(comp.bytes)).getPageCount() === 2);
  ok("completo: nada foi ignorado", comp.r.ignoradas === 0, comp.r.ignoradas);

  const estranho = await gerar(Object.assign({}, MINIMO, { nome: "Łukasz Müller 😀" }));
  ok("nome com caractere fora do WinAnsi não derruba a geração", estranho.r.ignoradas === 0 && estranho.bytes.length > BASE.length);

  const longo = await gerar(Object.assign({}, MINIMO, { observacoes: "palavra ".repeat(300), nome: "A".repeat(200), logradouro: "B".repeat(200) }));
  ok("texto longo (observações, nome, logradouro) não derruba a geração", longo.r.ignoradas === 0);
  const blocos = longo.ops.filter((o) => o.tipo === "bloco");
  ok("observações: um bloco só, limitado às 9 linhas da ficha", blocos.length === 1 && blocos[0].linhas.length === 9);
  guardar("longo.pdf", longo.bytes);

  console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
  if (falhas) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
