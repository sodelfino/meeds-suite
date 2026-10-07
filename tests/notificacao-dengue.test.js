#!/usr/bin/env node
/**
 * tests/notificacao-dengue.test.js — lógica da ficha SINAN de dengue/chikungunya
 *
 * Pedido de 06/10/2026: gerar, na primeira consulta de telemedicina, a
 * Ficha de Investigação Dengue e Febre de Chikungunya. O que o médico
 * DEVE preencher (e o sistema não deixa gerar sem) e o que sai
 * automático estão em docs/superpowers/plans/2026-10-06-ficha-notificacao-dengue.md.
 *
 * Aqui só a lógica pura (sem DOM, sem pdf-lib): validação, idade e as
 * "operações de desenho" — onde cada valor cai na ficha. A aplicação no PDF
 * de verdade é testada em tests/notificacao-dengue-pdf.test.js.
 *
 * Uso:  node tests/notificacao-dengue.test.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");

let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs !== undefined ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}

const ctx = {};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
["assets/municipios-ibge.js", "dengue-ficha.js"].forEach((arq) => {
  const f = path.join(RAIZ, "modules/notificacao", arq);
  if (fs.existsSync(f)) vm.runInContext(fs.readFileSync(f, "utf8"), ctx);
});
const N = ctx.MeedsNotificacaoDengue;
ok("a lógica existe (MeedsNotificacaoDengue)", !!N && typeof N.validar === "function");
if (!N) {
  console.log("\n1 FALHA(S)");
  process.exit(1);
}

const HOJE = "2026-10-06";

/* Um caso completo e válido: paciente do sexo feminino, Macaé, dengue. */
function valido(extra) {
  return Object.assign({
    agravo: "dengue",
    inicioSintomas: "2026-10-03",
    sinais: ["febre", "cefaleia", "mialgia"],
    doencas: [],
    semDoencas: true,
    alarme: [],
    gravidade: [],
    semAlarme: true,
    nome: "Dara Arruda Magalhães",
    nascimento: "2000-05-18",
    sexo: "F",
    gestante: "5",
    ufRes: "RJ",
    municipioRes: "Macaé",
    telefone: "22 99772-1523",
    ufNotif: "RJ",
    municipioNotif: "Macaé",
    unidade: "ESF Aroeira",
  }, extra || {});
}

const erros = (d) => N.validar(d, HOJE);
const campos = (d) => erros(d).map((e) => e.campo);

/* ---------- 1. validação: obrigatórios ---------- */
ok("caso completo e válido: nenhum erro", erros(valido()).length === 0, JSON.stringify(erros(valido())));

[
  ["agravo", { agravo: "" }],
  ["inicioSintomas", { inicioSintomas: "" }],
  ["sinais", { sinais: [] }],
  ["nome", { nome: "   " }],
  ["nascimento", { nascimento: "" }],
  ["sexo", { sexo: "" }],
  ["ufRes", { ufRes: "" }],
  ["municipioRes", { municipioRes: "" }],
  ["telefone", { telefone: "" }],
].forEach(([campo, mudanca]) => {
  const c = campos(valido(mudanca));
  ok("sem " + campo + ": bloqueia, e só esse campo", c.length === 1 && c[0] === campo, c.join());
});

/* ---------- 2. data de início dos sintomas ---------- */
ok("sintomas hoje: vale", erros(valido({ inicioSintomas: HOJE })).length === 0);
ok("sintomas há 15 dias (limite): vale", erros(valido({ inicioSintomas: "2026-09-21" })).length === 0);
ok("sintomas há 16 dias: bloqueia (fora da fase aguda)", campos(valido({ inicioSintomas: "2026-09-20" })).join() === "inicioSintomas");
ok("sintomas amanhã: bloqueia (futura)", campos(valido({ inicioSintomas: "2026-10-07" })).join() === "inicioSintomas");
ok("sintomas com ano trocado (2025): bloqueia", campos(valido({ inicioSintomas: "2025-10-03" })).join() === "inicioSintomas");
ok("sintomas antes do nascimento: bloqueia", campos(valido({ inicioSintomas: "2026-10-03", nascimento: "2026-10-05" })).indexOf("inicioSintomas") !== -1);
ok("data inexistente (31/02) é recusada", campos(valido({ inicioSintomas: "2026-02-31" })).join() === "inicioSintomas");
{
  const e = erros(valido({ inicioSintomas: "2026-09-20" }))[0];
  ok("a mensagem diz o motivo (15 dias)", !!e && /15 dias/.test(e.mensagem), e && e.mensagem);
}

/* ---------- 3. sinais de alarme: atestar presença OU ausência ---------- */
ok("sem marcar nada e sem atestar ausência: bloqueia", campos(valido({ semAlarme: false })).join() === "alarme");
ok("alarme marcado (sem atestar ausência): vale", erros(valido({ semAlarme: false, alarme: ["vomitos"] })).length === 0);
ok("gravidade marcada (sem atestar ausência): vale", erros(valido({ semAlarme: false, gravidade: ["taquicardia"] })).length === 0);
ok("'sem sinais' junto com sinal marcado: contradição, bloqueia", campos(valido({ semAlarme: true, alarme: ["vomitos"] })).join() === "alarme");
ok("temSinalDeAlarme: alarme", N.temSinalDeAlarme(valido({ alarme: ["dorAbdominal"] })) === true);
ok("temSinalDeAlarme: gravidade", N.temSinalDeAlarme(valido({ gravidade: ["melena"] })) === true);
ok("temSinalDeAlarme: nenhum", N.temSinalDeAlarme(valido()) === false);
ok("o texto do alerta é o pedido",
   N.TEXTO_ALERTA === "Paciente com sinais de alarme. Oriente o deslocamento imediato a um serviço de pronto atendimento presencial.");

/* ---------- 4. paciente, gestante e residência ---------- */
ok("mulher sem informar gestante: bloqueia", campos(valido({ gestante: "" })).join() === "gestante");
ok("mulher gestante (2º trimestre): vale", erros(valido({ gestante: "2" })).length === 0);
ok("homem não precisa informar gestante", erros(valido({ sexo: "M", gestante: "" })).length === 0);
ok("sexo inválido é recusado", campos(valido({ sexo: "X" })).indexOf("sexo") !== -1);
ok("nascimento futuro: bloqueia", campos(valido({ nascimento: "2027-01-01" })).indexOf("nascimento") !== -1);
ok("nascimento absurdo (1800): bloqueia", campos(valido({ nascimento: "1800-01-01" })).indexOf("nascimento") !== -1);
ok("município que não existe na UF: bloqueia", campos(valido({ municipioRes: "Gotham City" })).join() === "municipioRes");
ok("município de outra UF não vale (Macaé em MG)", campos(valido({ ufRes: "MG" })).join() === "municipioRes");
ok("município ignora acento e caixa ('macae')", erros(valido({ municipioRes: "macae" })).length === 0);
ok("UF inexistente: bloqueia", campos(valido({ ufRes: "XX" })).indexOf("ufRes") !== -1);
ok("telefone com DDD + 8 dígitos: vale", erros(valido({ telefone: "(22) 3772-1523" })).length === 0);
ok("telefone com DDD + 9 dígitos: vale", erros(valido({ telefone: "22997721523" })).length === 0);
ok("telefone sem DDD (9 dígitos): bloqueia", campos(valido({ telefone: "997721523" })).join() === "telefone");
ok("telefone curto: bloqueia", campos(valido({ telefone: "2299" })).join() === "telefone");

/* ---------- 5. opcionais: só validam o formato quando informados ---------- */
ok("CPF em branco: vale", erros(valido({ cpf: "" })).length === 0);
ok("CPF válido (com máscara): vale", erros(valido({ cpf: "529.982.247-25" })).length === 0);
ok("CPF com tamanho errado: bloqueia", campos(valido({ cpf: "12345" })).join() === "cpf");
ok("CPF com dígitos verificadores errados: bloqueia", campos(valido({ cpf: "52998224726" })).join() === "cpf");
ok("CPF com todos os dígitos iguais: bloqueia", campos(valido({ cpf: "11111111111" })).join() === "cpf");
ok("CEP de 8 dígitos: vale", erros(valido({ cep: "27913-000" })).length === 0);
ok("CEP com tamanho errado: bloqueia", campos(valido({ cep: "2791" })).join() === "cep");
ok("CNES de 7 dígitos: vale", erros(valido({ cnes: "2273780" })).length === 0);
ok("CNES com tamanho errado: bloqueia", campos(valido({ cnes: "22737" })).join() === "cnes");

/* ---------- 6. idade ---------- */
ok("idade em anos", JSON.stringify(N.idadeDe("2000-05-18", HOJE)) === JSON.stringify({ valor: 26, unidade: "4" }));
ok("aniversário hoje conta o ano", N.idadeDe("2000-10-06", HOJE).valor === 26);
ok("um dia antes do aniversário ainda não", N.idadeDe("2000-10-07", HOJE).valor === 25);
ok("nascido em 29/02 (bissexto) em ano comum", N.idadeDe("2000-02-29", "2026-02-28").valor === 25);
ok("menor de 1 ano: em meses (unidade 3)", JSON.stringify(N.idadeDe("2026-04-06", HOJE)) === JSON.stringify({ valor: 6, unidade: "3" }));
ok("menor de 1 mês: em dias (unidade 2)", JSON.stringify(N.idadeDe("2026-09-26", HOJE)) === JSON.stringify({ valor: 10, unidade: "2" }));
ok("data inválida: sem idade", N.idadeDe("", HOJE) === null);

/* ---------- 7. município ---------- */
{
  const m = N.buscarMunicipio("RJ", "macae");
  ok("buscarMunicipio acha 'macae' em RJ → 330240, nome oficial", !!m && m.codigo === "330240" && m.nome === "Macaé", JSON.stringify(m));
}
ok("buscarMunicipio não acha Macaé em MG", N.buscarMunicipio("MG", "Macaé") === null);
ok("municipiosDe('RJ') tem 92 municípios", N.municipiosDe("RJ").length === 92, N.municipiosDe("RJ").length);

/* ---------- 7b. município e unidade lidos do "Vínculos" da tela ---------- */
{
  const v = (linhas) => N.interpretarVinculo(linhas);
  const a = v(["MACAÉ - RJ", "ESF AROEIRA"]);
  ok("Vínculos novo (print de 06/10): município, UF e unidade",
     a.municipio === "Macaé" && a.uf === "RJ" && a.unidade === "ESF AROEIRA", JSON.stringify(a));
  const b = v(["PREFEITURA MUNICIPAL DE MACAÉ", "UPA UNIDADE DE PRONTO ATENDIMENTO BARRA"]);
  ok("Vínculos antigo (prefeitura): acha a UF pelo nome, se for único",
     b.municipio === "Macaé" && b.uf === "RJ" && b.unidade === "UPA UNIDADE DE PRONTO ATENDIMENTO BARRA", JSON.stringify(b));
  const c = v(["PREFEITURA DO MUNICIPIO DE FRANCO DA ROCHA"]);
  ok("Vínculos antigo com 'do Municipio de': Franco da Rocha (SP)", c.municipio === "Franco da Rocha" && c.uf === "SP" && c.unidade === "", JSON.stringify(c));
  const d2 = v(["BARBACENA", "UPA BARBACENA"]);
  ok("cliente renomeado sem UF ('BARBACENA'): acha MG e não confunde a unidade com cidade",
     d2.municipio === "Barbacena" && d2.uf === "MG" && d2.unidade === "UPA BARBACENA", JSON.stringify(d2));
  const e2 = v(["BOM JESUS", "UBS CENTRO"]);
  ok("nome de município que existe em várias UFs: não adivinha a UF", e2.uf === "" && e2.unidade === "UBS CENTRO", JSON.stringify(e2));
  const f = v(["MACAÉ - RJ"]);
  ok("só a cidade (sem unidade)", f.municipio === "Macaé" && f.unidade === "", JSON.stringify(f));
  ok("sem linhas: tudo vazio", JSON.stringify(v(null)) === JSON.stringify({ municipio: "", uf: "", unidade: "" }));
  const g = v(["XYZ - XX", "UBS TESTE"]);
  ok("UF inexistente na linha da cidade não vale", g.uf === "" && g.unidade !== "", JSON.stringify(g));
}

/* ---------- 8. operações de desenho: onde cada valor cai ---------- */
const ops = (d) => N.montarOperacoes(d, HOJE);
const dentro = (op, c) => {
  const x = op.cx !== undefined ? op.cx : op.x;
  const y = op.cy !== undefined ? op.cy : op.y;
  return x >= c[0] && x <= c[2] && y >= c[1] && y <= c[3];
};
const nasCaixa = (lista, caixa, texto, pg) =>
  lista.some((o) => (pg === undefined || o.pg === pg) && o.texto === texto && dentro(o, caixa));

const CX_AGRAVO = [346.6, 171.7, 357.4, 182.2];
ok("dengue: '1' dentro da caixa do agravo", nasCaixa(ops(valido()), CX_AGRAVO, "1", 0));
ok("chikungunya: '2' dentro da caixa do agravo", nasCaixa(ops(valido({ agravo: "chikungunya" })), CX_AGRAVO, "2", 0));

const doTexto = (lista, pg, ymin, ymax, xmin, xmax) =>
  lista.filter((o) => o.pg === pg && o.tipo === "centro" && o.cy >= ymin && o.cy <= ymax && o.cx >= xmin && o.cx <= xmax)
    .sort((a, b) => a.cx - b.cx).map((o) => o.texto).join("");

ok("data da notificação (hoje) em 8 células: 06102026", doTexto(ops(valido()), 0, 183, 193, 440, 567) === "06102026");
ok("início dos sintomas em 8 células: 03102026", doTexto(ops(valido()), 0, 239, 249, 440, 567) === "03102026");
ok("nascimento em 8 células: 18052000", doTexto(ops(valido()), 0, 270, 281, 440, 563) === "18052000");
ok("município de notificação (IBGE) em 6 células: 330240", doTexto(ops(valido()), 0, 213, 222, 476, 567) === "330240");
ok("município de residência (IBGE) em 6 células: 330240", doTexto(ops(valido()), 0, 391, 401, 322, 410) === "330240");
ok("data da investigação (hoje): 06102026", doTexto(ops(valido()), 0, 538, 550, 54, 177) === "06102026");
ok("telefone com 10 dígitos preenche as 10 células", doTexto(ops(valido({ telefone: "(22) 3772-1523" })), 0, 492, 502, 50, 202) === "2237721523");
ok("telefone com 11 dígitos também cabe (11 posições)", doTexto(ops(valido({ telefone: "22997721523" })), 0, 492, 502, 50, 202) === "22997721523");
ok("CPF nas células do campo do Cartão SUS (premissa: sempre CPF)", doTexto(ops(valido({ cpf: "52998224725" })), 0, 361, 372, 50, 227) === "52998224725");
ok("CPF informado: aparece a marca '(CPF)' ao lado do rótulo impresso", ops(valido({ cpf: "52998224725" })).some((o) => o.tipo === "texto" && o.texto === "(CPF)"));
ok("sem CPF: nada no campo e sem a marca", doTexto(ops(valido()), 0, 361, 372, 50, 227) === "" && !ops(valido()).some((o) => o.texto === "(CPF)"));
ok("o campo SUS antigo não é mais desenhado", doTexto(ops(valido({ sus: "700501902930017" })), 0, 361, 372, 50, 227) === "");
ok("CEP em 8 células", doTexto(ops(valido({ cep: "27913-000" })), 0, 468, 478, 452, 565) === "27913000");
ok("idade (26) nas células da idade", doTexto(ops(valido()), 0, 302, 311, 52, 102) === "26");
ok("unidade da idade = 4 (anos) na caixa certa", nasCaixa(ops(valido()), [106.8, 291.9, 117.4, 302.7], "4", 0));
ok("sexo F na caixa do sexo", nasCaixa(ops(valido()), [229.2, 284.7, 240.0, 295.5], "F", 0));
ok("sexo M na caixa do sexo", nasCaixa(ops(valido({ sexo: "M" })), [229.2, 284.7, 240.0, 295.5], "M", 0));
ok("gestante: '5' (não) na caixa", nasCaixa(ops(valido()), [423.8, 284.7, 434.6, 295.5], "5", 0));
ok("homem: gestante '6' (não se aplica) automático, mesmo se algo foi digitado",
   nasCaixa(ops(valido({ sexo: "M", gestante: "2" })), [423.8, 284.7, 434.6, 295.5], "6", 0) &&
   !nasCaixa(ops(valido({ sexo: "M", gestante: "2" })), [423.8, 284.7, 434.6, 295.5], "2", 0));
ok("raça/cor (4 - parda) na caixa", nasCaixa(ops(valido({ raca: "4" })), [548.9, 285.4, 559.7, 296.2], "4", 0));
ok("sem raça/cor: caixa em branco", !ops(valido()).some((o) => o.pg === 0 && dentro(o, [548.9, 285.4, 559.7, 296.2])));
ok("zona (1 - urbana) na caixa", nasCaixa(ops(valido({ zona: "1" })), [330.7, 478.9, 341.5, 489.7], "1", 0));
ok("nome do paciente em maiúsculas",
   ops(valido()).some((o) => o.pg === 0 && o.tipo === "texto" && o.texto === "DARA ARRUDA MAGALHÃES"));
ok("UF de residência escrita", ops(valido()).some((o) => o.pg === 0 && o.texto === "RJ" && o.cy >= 390 && o.cy <= 402));

/* itens 33 e 34 (obrigatórios na ficha nova, instrucional Sinan 3.0): 1 nas marcadas, 2 nas demais */
const CX_FEBRE = [55.0, 570.3, 67.7, 582.8];
const CX_CEFALEIA = [100.8, 569.6, 113.3, 582.1];
const CX_VOMITO = [158.6, 570.3, 171.1, 583.0];
ok("sinal marcado (febre) recebe '1'", nasCaixa(ops(valido()), CX_FEBRE, "1", 0));
ok("sinal marcado (cefaleia) recebe '1'", nasCaixa(ops(valido()), CX_CEFALEIA, "1", 0));
ok("sinal NÃO marcado (vômito) recebe '2' — item 33 é obrigatório",
   nasCaixa(ops(valido()), CX_VOMITO, "2", 0));
ok("item 33: as 14 caixas ficam preenchidas (1 ou 2), nenhuma em branco",
   N.SINAIS_CLINICOS.every((x) => ops(valido()).some((o) => o.pg === 0 && dentro(o, x.caixa))));
ok("doença pré-existente marcada (diabetes) recebe '1'",
   nasCaixa(ops(valido({ doencas: ["diabetes"] })), [54.2, 621.9, 66.7, 634.6], "1", 0));
ok("doença não marcada recebe '2' (o médico atestou o quadro)",
   nasCaixa(ops(valido({ doencas: ["diabetes"], semDoencas: false })), [189.4, 619.8, 202.6, 633.0], "2", 0));
ok("'sem doenças pré-existentes': '2' nas 7 caixas do item 34",
   N.DOENCAS.length === 7 && N.DOENCAS.every((x) => nasCaixa(ops(valido()), x.caixa, "2", 0)));
ok("item 34 sem doenças marcadas e sem atestar: bloqueia (não dá para distinguir 'nenhuma' de 'não perguntei')",
   campos(valido({ semDoencas: false })).join() === "doencas");
ok("'sem doenças' junto com doença marcada: contradição, bloqueia",
   campos(valido({ semDoencas: true, doencas: ["diabetes"] })).join() === "doencas");
ok("doença marcada (sem o atestado de ausência): vale", erros(valido({ semDoencas: false, doencas: ["diabetes"] })).length === 0);

/* sinais de alarme (página 2) */
const ALARMES = N.ALARME;
const GRAVES = N.GRAVIDADE;
ok("9 sinais de alarme e 15 de gravidade mapeados", ALARMES.length === 9 && GRAVES.length === 15, ALARMES.length + "/" + GRAVES.length);
{
  const o = ops(valido()); // semAlarme: true
  ok("'sem sinais de alarme': '2' nas 9 caixas do item 68", ALARMES.every((a) => nasCaixa(o, a.caixa, "2", 1)));
  ok("'sem sinais de alarme nem de gravidade': '2' nas 15 caixas do item 70", GRAVES.every((g) => nasCaixa(o, g.caixa, "2", 1)));
}
{
  const o = ops(valido({ semAlarme: false, alarme: ["vomitos"], gravidade: ["melena"], dataAlarme: "2026-10-05", dataGravidade: "2026-10-06" }));
  const vomito = ALARMES.find((a) => a.id === "vomitos");
  const dor = ALARMES.find((a) => a.id === "dorAbdominal");
  const melena = GRAVES.find((g) => g.id === "melena");
  ok("alarme marcado recebe '1'", nasCaixa(o, vomito.caixa, "1", 1));
  ok("alarme não marcado recebe '2' (o médico atestou o quadro)", nasCaixa(o, dor.caixa, "2", 1));
  ok("gravidade marcada recebe '1'", nasCaixa(o, melena.caixa, "1", 1));
  ok("gravidade não marcada recebe '2' (item 70 obrigatório)", GRAVES.filter((g) => g.id !== "melena").every((g) => nasCaixa(o, g.caixa, "2", 1)));
  ok("data de início dos sinais de alarme: 05102026", doTexto(o, 1, 314, 326, 452, 568) === "05102026");
  ok("data de início dos sinais de gravidade: 06102026", doTexto(o, 1, 460, 471, 50, 172) === "06102026");
}

/* observações e investigador (página 2) */
{
  const o = ops(valido({ observacoes: "Primeira consulta por telemedicina.", medicoNome: "Guilherme Borges", medicoFuncao: "Médico (CRM/SP 255626)" }));
  ok("observações viram um bloco na página 2", o.some((x) => x.pg === 1 && x.tipo === "bloco" && /telemedicina/.test(x.texto)));
  ok("investigador: nome do médico", o.some((x) => x.pg === 1 && x.texto === "GUILHERME BORGES"));
  ok("investigador: função", o.some((x) => x.pg === 1 && /CRM\/SP 255626/i.test(x.texto)));
  ok("investigador: município / unidade (só quando há médico)", o.some((x) => x.pg === 1 && x.texto === "MACAÉ / ESF AROEIRA"));
}
ok("sem observações nem médico: nada na página 2 além do item 68",
   ops(valido()).filter((x) => x.pg === 1).every((x) => x.tipo === "centro"));

/* o que a 1ª consulta NÃO tem fica em branco: laboratório, hospitalização, conclusão */
{
  const o = ops(valido());
  const emBranco = [
    [0, 700, 800, "dados laboratoriais (35 a 49)"],
  ];
  emBranco.forEach(([pg, y0, y1, nome]) => ok("em branco: " + nome, !o.some((x) => x.pg === pg && (x.cy || x.y) >= y0 && (x.cy || x.y) <= y1)));
  ok("em branco: hospitalização/conclusão (página 2, acima do item 68)",
     !o.some((x) => x.pg === 1 && (x.cy || x.y) < 262));
}

/* texto saneado: maiúsculas e nada fora do WinAnsi */
/* ---------- 7c. Parentesco lido da tela ---------- */
{
  const pa = (l) => N.interpretarParentesco(l);
  ok("Parentesco: linha rotulada 'Mãe' vence", pa(["Pai: JOAO SILVA", "Mãe: MARIA SILVA"]) === "MARIA SILVA");
  ok("Parentesco: uma linha só é a mãe", pa(["MARIA SILVA"]) === "MARIA SILVA");
  ok("Parentesco: duas linhas sem rótulo — não adivinha", pa(["ANA ARRUDA", "ANTONIO MAGALHAES"]) === "");
  ok("Parentesco: sem linhas", pa(null) === "");
}

ok("saneaTexto: maiúsculas", N.saneaTexto("josé da silva") === "JOSÉ DA SILVA");
ok("saneaTexto: caractere fora do WinAnsi vira '?' e não lança", N.saneaTexto("Łukasz") === "?UKASZ");
ok("saneaTexto: espaços repetidos e quebras de linha viram um espaço", N.saneaTexto(" a\n  b ") === "A B");

console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
if (falhas) process.exit(1);

/* só gravidade marcada (sem sinal de alarme): os dois itens saem preenchidos */
{
  const o = ops(valido({ semAlarme: false, alarme: [], gravidade: ["melena"], dataGravidade: "2026-10-06" }));
  ok("só gravidade marcada: item 68 sai todo '2'", ALARMES.every((a) => nasCaixa(o, a.caixa, "2", 1)));
  ok("só gravidade marcada: melena '1'", nasCaixa(o, GRAVES.find((g) => g.id === "melena").caixa, "1", 1));
}
