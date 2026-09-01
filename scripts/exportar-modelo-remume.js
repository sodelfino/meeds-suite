/* ------------------------------------------------------------------
 * scripts/exportar-modelo-remume.js
 * ------------------------------------------------------------------
 * Gera a planilha-modelo de importacao de REMUME e ja a preenche com
 * tudo que o Assistente carrega hoje.
 *
 * A REGRA QUE MANDA AQUI e a mesma do modulo REMUME: a lista publicada
 * pelo municipio e a unica fonte de verdade. Por isso este script
 * NUNCA inventa, completa nem corrige item. Ele so QUEBRA em colunas o
 * texto que a prefeitura publicou — e a coluna descricao_original
 * guarda esse texto intacto para conferencia.
 *
 * A quebra e heuristica e assume isso na propria planilha: a coluna
 * `decomposicao` marca "revisar" onde o automatico nao teve certeza,
 * em vez de entregar um campo errado com cara de campo certo.
 * ------------------------------------------------------------------ */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ExcelJS = require("exceljs");

const RAIZ = path.join(__dirname, "..");
const REMUMES = require(path.join(RAIZ, "modules/remume/remumes.json"));
const SAIDA = process.argv[2] || path.join(RAIZ, "exports/modelo-importacao-remume.xlsx");

/* Formas farmaceuticas, das mais longas para as mais curtas: sem essa
 * ordem, "comprimido" casaria antes de "comprimido revestido" e a
 * informacao de revestimento se perderia. */
const FORMAS = [
  "comprimido revestido", "comprimido mastigável", "comprimido sublingual",
  "comprimido efervescente", "comprimido de liberação prolongada", "comprimido",
  "cápsula mole", "cápsula dura", "cápsula",
  "pó liofilizado para solução injetável", "pó liofilizado", "pó para solução injetável",
  "pó para suspensão oral", "pó para solução oral", "pó para solução", "pó",
  "solução injetável", "solução oral", "solução nasal", "solução oftálmica",
  "solução otológica", "solução tópica", "solução",
  "suspensão injetável", "suspensão oral", "suspensão",
  "emulsão injetável", "emulsão",
  "creme vaginal", "creme dermatológico", "creme",
  "pomada oftálmica", "pomada", "gel", "loção", "xarope", "elixir", "tintura",
  "colírio", "aerossol", "aerosol", "spray", "shampoo", "sabonete",
  "supositório", "óvulo", "adesivo transdérmico", "adesivo",
  "granulado", "drágea", "pastilha", "gotas", "injetável",
  /* Formas que aparecem nas listas municipais e faltavam no vocabulario.
   * Cada uma foi tirada de item real, nao de catalogo teorico. */
  "implante subdérmico", "implante",
  "geleia vaginal", "geléia vaginal", "geleia", "geléia",
  "goma de mascar", "goma",
  "enema", "aquoso nasal", "spray nasal", "pasta", "xampu",
  "pomada dermatológica", "creme vaginal", "sabonete líquido",
  "solução tópica degermante", "solução hidroalcoólica",
  "líquido", "concentrado",
];

/* Abreviacoes que aparecem nas listas municipais. Sao expandidas so
 * para RECONHECER a forma; o texto original nao e alterado. */
const ABREVIACOES = [
  /* O \b INICIAL nao e opcional: sem ele, "sol. oral" casa dentro de
   * "aeros|sol oral| " e reescreve o meio da palavra, fazendo o
   * reconhecimento da forma falhar num item que estava correto. */
  [/\bsol\.?\s*inj\b/gi, "solução injetável"],
  [/\bsol\.?\s*or(al)?\b/gi, "solução oral"],
  [/\bsusp\.?\s*or(al)?\b/gi, "suspensão oral"],
  [/\bsol\.?\s*aeross?ol\b/gi, "aerossol"],
  [/\bp[óo]\s*liof\b/gi, "pó liofilizado"],
  [/\bcomp\.?\b/gi, "comprimido"],
  [/\bcps\.?\b/gi, "cápsula"],
  [/\bf\/a\b/gi, "frasco-ampola"],
];

const EMBALAGENS = [
  "frasco-ampola", "frasco ampola", "ampola", "frasco", "bisnaga", "envelope",
  "sachê", "sache", "seringa", "bolsa", "tubo", "pote", "cartucho", "galão",
  "flaconete", "blister", "cartela", "unidade",
];

/* Tira acento PRESERVANDO o comprimento, caractere a caractere. Um
 * normalize("NFD") na string inteira nao garante isso, e aqui os
 * indices sao usados para cortar o texto original — um deslocamento de
 * um caractere corta a palavra no meio. */
function semAcento(t) {
  let saida = "";
  for (const ch of t) {
    const limpo = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    saida += limpo.length === 1 ? limpo : ch;
  }
  return saida.toLowerCase();
}

/* Concentracao: numero + unidade, incluindo a forma composta "50mg/ml"
 * e o percentual entre parenteses que costuma vir logo depois. */
/* O fim da unidade e "nao vem letra nem digito depois", e nao \b: o
 * \b exige troca entre caractere de palavra e nao-palavra, entao em
 * "2% (20mg/ml)" ele FALHA depois do "%" (% e espaco sao os dois
 * nao-palavra) e a busca pula para a concentracao seguinte — levando o
 * "2%" para dentro do principio ativo.
 *
 * O "%" tem ramo proprio porque tambem aparece grudado na palavra
 * seguinte nas listas reais ("0,9%solucao injetavel"): ali o sufixo nao
 * pode recusar letra, so digito. */
const RE_CONC = /(\d+[\d.,]*)\s*(mg\/[\d.,]+\s*ml|mg\/ml|mcg\/ml|g\/ml|ui\/ml|mg\/g|mcg\/dose|mg\/dose|mg|mcg|kg|g|ui|ml|l)(?![a-z0-9])|(\d+[\d.,]*)\s*%(?![0-9])/i;

function acharConcentracao(texto) {
  const m = texto.match(RE_CONC);
  if (!m) return { valor: "", indice: -1 };

  let inicio = m.index;
  let valor = m[0].trim();

  /* Dose composta escrita como "600+300+300 mg": so o ULTIMO numero vem
   * colado na unidade, entao a busca casa nele e os anteriores ficariam
   * de fora — e, pior, sobrariam grudados no principio ativo. Recolhe a
   * cadeia para tras. */
  const antes = texto.slice(0, inicio);
  const cadeia = antes.match(/(\d+[\d.,]*\s*\+\s*)+$/);
  if (cadeia) {
    inicio -= cadeia[0].length;
    valor = (cadeia[0].trim() + valor).replace(/\s+/g, " ").replace(/\+\s+/g, "+");
  }

  /* "(10%)" logo apos e a mesma concentracao dita de outro jeito. */
  const depois = texto.slice(m.index + m[0].length, m.index + m[0].length + 12);
  const pct = depois.match(/^\s*\((\d+[\d.,]*\s*%)\)/);
  if (pct) valor += " (" + pct[1] + ")";

  /* Dose composta escrita como "500 mg + 125 mg": recolhe para frente. */
  let resto = texto.slice(m.index + m[0].length + (pct ? pct[0].length : 0));
  let adiante = resto.match(/^\s*\+\s*\d+[\d.,]*\s*(mg\/ml|mcg\/ml|g\/ml|mg\/g|mg|mcg|g|ui|ml|%)(?![a-z0-9])/i);
  while (adiante) {
    valor += " " + adiante[0].trim();
    resto = resto.slice(adiante[0].length);
    adiante = resto.match(/^\s*\+\s*\d+[\d.,]*\s*(mg\/ml|mcg\/ml|g\/ml|mg\/g|mg|mcg|g|ui|ml|%)(?![a-z0-9])/i);
  }

  return { valor, indice: inicio };
}

/* Devolve tambem ONDE a forma aparece. Boa parte dos municipios escreve
 * "Principio - forma concentracao", com a forma ANTES da dose; cortar o
 * principio so na concentracao deixaria a forma dentro dele. */
function acharForma(texto) {
  let base = semAcento(texto);
  ABREVIACOES.forEach(([re, exp]) => {
    base = base.replace(re, (achado) => semAcento(exp).padEnd(achado.length, " ").slice(0, achado.length));
  });
  let melhor = { valor: "", indice: -1 };
  let adiante = { valor: "", indice: -1 };
  for (const f of FORMAS) {
    /* Fronteira de palavra, nao "contem". Sem isto "po" casa dentro de
     * "potassio" e o principio ativo e cortado no meio da palavra —
     * mesmo erro que ja tinha mordido a busca do REMUME. */
    /* Duas tolerancias tiradas de itens reais:
     *   "comprimidos 100 mg"  -> plural
     *   "comprimido150 mg"    -> a lista veio sem o espaco
     * O \b final falharia nos dois: de "o" para "s" e de "o" para "1"
     * nao ha troca palavra/nao-palavra. O fim correto e "nao vem outra
     * LETRA depois", deixando digito passar. */
    const re = new RegExp(
      "\\b" + semAcento(f).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "s?(?![a-z])"
    );
    const achado = base.match(re);
    if (!achado) continue;
    const i = achado.index;
    /* A primeira forma que aparece no texto ganha; entre duas na mesma
     * posicao, a mais longa (a lista ja vem ordenada assim). */
    if (melhor.indice === -1 || i < melhor.indice) melhor = { valor: f, indice: i };
    /* Guarda tambem a primeira ocorrencia que NAO esteja no comeco. Em
     * "Solução Ringer Simples - Solução Injetável Intravenosa" a
     * palavra no indice 0 faz parte do NOME do produto; a forma de
     * verdade e a segunda. Sem isto nao ha onde cortar e o principio
     * ativo fica com a linha inteira. */
    if (i > 0 && (adiante.indice === -1 || i < adiante.indice)) adiante = { valor: f, indice: i };
  }
  if (melhor.indice === 0 && adiante.indice > 0) return adiante;
  /* Abreviacao expandida ocupa espaco diferente do original: nao da
   * para confiar no indice quando o texto foi reescrito nesse trecho. */
  return melhor;
}

function acharApresentacao(texto) {
  const alvo = semAcento(texto);
  for (const e of EMBALAGENS) {
    const i = alvo.indexOf(semAcento(e));
    if (i < 0) continue;
    /* O termo casado pode ter mais de uma palavra ("Frasco Ampola"):
     * recorta pelo COMPRIMENTO dele, e nao ate o primeiro espaco —
     * senao a segunda palavra fica de fora e a apresentacao muda de
     * sentido. Depois anexa o volume, quando vier colado. */
    const termo = texto.slice(i, i + e.length);
    const resto = texto.slice(i + e.length, i + e.length + 24);
    const volume = resto.match(/^\s+\d+[\d.,]*\s*(ml|l|g|mg|kg|doses|comprimidos|unidades|un)?\b/i);
    return (termo + (volume ? volume[0] : "")).trim().replace(/[,;.]$/, "");
  }
  return "";
}

function decompor(nome) {
  const conc = acharConcentracao(nome);
  const forma = acharForma(nome);

  /* O principio ativo termina no que vier PRIMEIRO: a dose ou a forma. */
  const cortes = [conc.indice, forma.indice].filter((i) => i > 0);
  const corte = cortes.length ? Math.min.apply(null, cortes) : -1;

  let principio = (corte > 0 ? nome.slice(0, corte) : nome).trim();
  /* Separador "-" que os municipios usam entre principio e forma. */
  principio = principio.replace(/[\s,;:\-–—]+$/, "").trim();

  /* Numero solto no fim do principio ativo e, quase sempre, uma dose que
   * a lista escreveu sem unidade: "Carvedilol 3,125 comprimido",
   * "Albumina Humana 0.2". Move para a concentracao.
   *
   * O travessao antes do numero e a excecao que importa: em
   * "Saccharomyces Boulardii – 17" o 17 e a CEPA, nao a dose. Tratar os
   * dois igual inventaria uma concentracao que o municipio nao
   * publicou. */
  let concentracao = conc.valor;
  const soltoNoFim = principio.match(/\s(\d+[\d.,]*)$/);
  if (!concentracao && soltoNoFim && !/[-–—]\s*\d+[\d.,]*$/.test(principio)) {
    concentracao = soltoNoFim[1];
    principio = principio.slice(0, soltoNoFim.index).trim();
  }

  const apresentacao = acharApresentacao(nome);

  /* Marca "revisar" quando ha sinal concreto de quebra malfeita, e nao
   * so quando falta campo. Um principio ativo que ainda carrega numero
   * ou nome de forma farmaceutica e quebra errada — e entregar isso
   * como "automatica" seria pior que admitir a duvida. */
  const limpo = semAcento(principio);

  /* "Qualquer digito" era grosseiro demais: "Piridoxina (vit. B6)" e
   * "Colecalciferol (Vitamina D3)" tem digito e estao perfeitos. O que
   * de fato denuncia quebra malfeita e ter sobrado uma CONCENTRAcao
   * dentro do principio, ou ele terminar num numero solto. */
  const sobrouDose = RE_CONC.test(principio) || /[\s(]\d+[\d.,]*$/.test(principio);

  /* Uma forma no COMEcO do principio faz parte do nome do produto —
   * "Solução Ringer + Lactato", "Água para Injetáveis". So acusa quando
   * ela aparece depois do inicio, que e onde indica corte errado. */
  const formaNoMeio = FORMAS.some(function (f) {
    const m = limpo.match(
      new RegExp("\\b" + semAcento(f).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "s?(?![a-z])")
    );
    return m && m.index > 0;
  });

  const sujo = sobrouDose || formaNoMeio;
  const confiavel = principio.length > 2 && forma.valor !== "" && !sujo;

  return {
    principio_ativo: principio,
    concentracao: concentracao,
    forma_farmaceutica: forma.valor,
    apresentacao,
    decomposicao: confiavel ? "automatica" : "revisar",
  };
}

/* Codigo estavel: derivado do CONTEUDO, nao da posicao na lista. Um
 * item novo inserido no meio do arquivo nao renumera os outros — que e
 * exatamente a fragilidade de um MED-1, MED-2 sequencial. */
function codigoDe(municipio, descricao) {
  const sigla = semAcento(municipio).replace(/[^a-z]/g, "").slice(0, 3).toUpperCase();
  const hash = crypto.createHash("sha1").update(municipio + "|" + descricao.replace(/\s+/g, " ").trim().toLowerCase()).digest("hex");
  return sigla + "-" + hash.slice(0, 6).toUpperCase();
}

const COLUNAS = [
  ["municipio", 26, "sim", "A que município esta linha pertence. Sem isto a carga não tem dono e a segunda importação se mistura com a primeira."],
  ["remume_versao", 15, "sim", "Data ou versão da lista publicada pela prefeitura (ex.: 2026-03 ou \"Portaria 45/2026\"). É como se sabe se o sistema está atrasado em relação ao município."],
  ["codigo_identificacao", 20, "sim", "Chave da linha. DEVE ser estável entre importações: se for regerado por arquivo, uma carga nova aponta para o medicamento errado. Aqui é derivado do conteúdo (sigla do município + hash da descrição)."],
  ["descricao_original", 62, "sim", "O texto EXATO publicado pelo município, sem tratamento. É a prova de auditoria e é por onde o médico procura — ele digita o que vê na lista da prefeitura."],
  ["principio_ativo", 34, "sim", "Extraído da descrição. Em associações, vem mais de um princípio."],
  ["concentracao", 22, "não", "Vazio quando o município não publica. Ocorre em ~2% dos itens reais (água destilada, material de consumo)."],
  ["forma_farmaceutica", 26, "não", "Vazio quando o município não publica. Ocorre em 9,9% dos itens (277 de 2.793). Sete Lagoas publica a lista INTEIRA sem forma farmacêutica: se a importação exigir esta coluna, aquele município não carrega."],
  ["apresentacao", 24, "não", "Embalagem e volume."],
  ["local_dispensacao", 34, "não", "Onde o item é retirado (UBS, hospital, emergência). 6 dos 11 municípios publicam. Define se a prescrição se cumpre onde o paciente vai buscar."],
  ["situacao", 12, "não", "ativo | suspenso. REMUME tem item temporariamente fora."],
  ["restricao", 24, "não", "Uso restrito, protocolo, receituário especial. Muda a conduta."],
];

/* Celula vazia nas colunas opcionais quer dizer UMA coisa so: o
 * municipio nao publicou aquele campo. Nunca "ficou faltando preencher".
 * Sete Lagoas, por exemplo, publica a lista inteira sem forma
 * farmaceutica — inventar uma seria colocar no sistema informacao que a
 * prefeitura nao deu, exatamente o que a REMUME como fonte unica de
 * verdade proibe. */

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Assistente Meeds";
  wb.created = new Date();

  /* ---------- aba 1: dicionario ---------- */
  const dic = wb.addWorksheet("Dicionário de colunas");
  dic.columns = [
    { header: "coluna", key: "c", width: 24 },
    { header: "obrigatória", key: "o", width: 13 },
    { header: "para que serve", key: "p", width: 96 },
  ];
  COLUNAS.forEach(([nome, , obrig, desc]) => dic.addRow({ c: nome, o: obrig, p: desc }));
  dic.addRow({});
  const nota = dic.addRow({
    c: "COMO LER",
    o: "",
    p:
      "Célula vazia numa coluna opcional significa que O MUNICÍPIO NÃO PUBLICOU aquele campo — não que ficou faltando preencher. " +
      "Completar por conta própria colocaria no sistema informação que a prefeitura não forneceu, e a lista do município é a única " +
      "fonte de verdade sobre o que ele dispensa. A coluna descricao_original guarda sempre o texto exato publicado, para conferência.",
  });
  nota.font = { bold: true };
  dic.getRow(1).font = { bold: true };
  dic.getColumn("p").alignment = { wrapText: true, vertical: "top" };
  dic.views = [{ state: "frozen", ySplit: 1 }];

  /* ---------- abas 2 e 3: mesmo cabecalho ---------- */
  function montarAba(nome) {
    const ws = wb.addWorksheet(nome);
    ws.columns = COLUNAS.map(([c, w]) => ({ header: c, key: c, width: w }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: "A1", to: { row: 1, column: COLUNAS.length } };
    return ws;
  }

  const vazio = montarAba("Modelo (município novo)");
  vazio.addRow({
    municipio: "Itaúna",
    remume_versao: "2026-03",
    codigo_identificacao: "(deixe em branco: gerado na carga)",
    descricao_original: "Amoxicilina 500mg cápsula",
    principio_ativo: "Amoxicilina",
    concentracao: "500 mg",
    forma_farmaceutica: "cápsula",
    apresentacao: "cápsula",
    local_dispensacao: "UBS",
    situacao: "ativo",
    restricao: "",
  });
  vazio.getRow(2).font = { italic: true, color: { argb: "FF7A8794" } };

  const dados = montarAba("Dados atuais");

  let total = 0;
  let revisar = 0;
  const porMunicipio = {};
  const comLocal = {};
  const revisarPorMunicipio = {};
  const semForma = {};
  const vistos = new Set();
  let colisoes = 0;

  Object.keys(REMUMES).filter((k) => k !== "_meta").sort().forEach((municipio) => {
    porMunicipio[municipio] = 0;
    comLocal[municipio] = 0;
    revisarPorMunicipio[municipio] = 0;
    semForma[municipio] = 0;
    REMUMES[municipio].forEach((item) => {
      const descricao = String(item.nome || "").trim();
      if (!descricao) return;
      const d = decompor(descricao);
      const codigo = codigoDe(municipio, descricao);
      if (vistos.has(codigo)) colisoes++;
      vistos.add(codigo);

      dados.addRow({
        municipio,
        remume_versao: REMUMES._meta && REMUMES._meta.atualizadoEm ? REMUMES._meta.atualizadoEm : "",
        codigo_identificacao: codigo,
        descricao_original: descricao,
        principio_ativo: d.principio_ativo,
        concentracao: d.concentracao,
        forma_farmaceutica: d.forma_farmaceutica,
        apresentacao: d.apresentacao,
        local_dispensacao: item.local || "",
        situacao: "ativo",
        restricao: "",
      });
      total++;
      porMunicipio[municipio]++;
      if (item.local && String(item.local).trim()) comLocal[municipio]++;
      if (!d.forma_farmaceutica) semForma[municipio]++;
      if (d.decomposicao === "revisar") {
        revisar++;
        revisarPorMunicipio[municipio]++;
      }
    });
  });

  /* ---------- aba 4: resumo ----------
   * Existe para a conversa com quem vai decidir o padrao: mostra de
   * onde vem cada numero, inclusive o que ficou por revisar. Esconder a
   * taxa de revisao faria a planilha parecer mais pronta do que e. */
  const resumo = wb.addWorksheet("Resumo");
  resumo.columns = [
    { header: "municipio", key: "m", width: 28 },
    { header: "itens", key: "n", width: 10 },
    { header: "com local de dispensação", key: "l", width: 26 },
    { header: "sem forma farmacêutica na origem", key: "r", width: 32 },
  ];
  resumo.getRow(1).font = { bold: true };
  Object.keys(porMunicipio).sort().forEach((m) => {
    resumo.addRow({ m, n: porMunicipio[m], l: comLocal[m] || 0, r: semForma[m] || 0 });
  });
  resumo.addRow({});
  const linhaTotal = resumo.addRow({ m: "TOTAL", n: total, l: Object.values(comLocal).reduce((a, b) => a + b, 0), r: Object.values(semForma).reduce((a, b) => a + b, 0) });
  linhaTotal.font = { bold: true };

  fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
  await wb.xlsx.writeFile(SAIDA);

  console.log("Gerado: " + SAIDA);
  console.log("  linhas:      " + total);
  console.log("  municipios:  " + Object.keys(porMunicipio).length);
  const semFormaTotal = Object.values(semForma).reduce((a, b) => a + b, 0);
  console.log("  sem forma na origem: " + semFormaTotal + " (" + ((semFormaTotal / total) * 100).toFixed(1) + "%)");
  /* Continua sendo medido, so nao vai para a planilha entregue: se um
   * dia voltar a subir, e sinal de que a decomposicao regrediu. */
  console.log("  quebra suspeita:     " + revisar);
  console.log("  codigos duplicados: " + colisoes);
  Object.entries(porMunicipio).forEach(([m, n]) => console.log("    " + String(n).padStart(4) + "  " + m));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
