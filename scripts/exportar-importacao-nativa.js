/* ------------------------------------------------------------------
 * scripts/exportar-importacao-nativa.js
 * ------------------------------------------------------------------
 * Gera o CSV de importacao de REMUME no formato que o SISTEMA NATIVO
 * do Meeds exige — o modelo em anexo (modelo_de_importacao.csv):
 *
 *   remume_versao;codigo_identificacao;descricao_original;
 *   principio_ativo;concentracao;forma_farmaceutica;apresentacao;
 *   local_dispensacao;restricao;via_administracao;situacao
 *
 * DIFERENCA PARA O modelo-importacao-remume.xlsx (uso interno)
 *   - um arquivo POR MUNICIPIO, nao uma planilha com todos juntos —
 *     o modelo nao tem coluna "municipio"; quem separa e o arquivo;
 *   - CSV com ";" (igual ao anexo), nao XLSX;
 *   - ganha "via_administracao" (nao existe no arquivo interno);
 *   - ganha "restricao" preenchida de verdade, a partir do
 *     receituario controlado (Portaria 344/98) que ja esta nos dados —
 *     no arquivo interno essa coluna existe mas sempre fica vazia.
 *
 * O QUE E REUSADO, E POR QUE
 * principio_ativo/concentracao/forma_farmaceutica/apresentacao e o
 * codigo_identificacao vem de scripts/exportar-modelo-remume.js — a
 * MESMA funcao, nao uma copia. Os dois arquivos tem que concordar
 * sobre o que e "principio ativo" e sobre o codigo de cada item; uma
 * segunda implementacao arriscaria os dois arquivos divergirem sem
 * ninguem perceber (ver comentario no export daquele arquivo).
 *
 * O QUE E NOVO AQUI
 *   1. REFINO DA CONCENTRACAO — decompor() pega o primeiro numero+
 *      unidade do texto, na ORDEM em que aparece. Isso erra quando a
 *      descricao comeca com o TAMANHO DA EMBALAGEM antes da
 *      concentracao de verdade: "Aciclovir 10g 50mg/g (5%) creme..."
 *      vira concentracao="10g" (o tubo), nao "50mg/g (5%)" (a
 *      concentracao). Afeta ~6% dos itens de Macae (32 de 538).
 *      refinarConcentracao() so troca quando a concentracao achada e
 *      um numero "pelado" (g/ml/mg sem barra nem %) E existe, mais
 *      adiante no MESMO texto, um padrao "por unidade" de verdade
 *      (mg/g, mg/ml, %...) — nunca inventa, so prefere o padrao mais
 *      especifico quando os dois aparecem na mesma descricao.
 *   2. VIA DE ADMINISTRACAO — inferida da forma farmaceutica por
 *      convencao farmacologica padrao (comprimido -> oral, colirio ->
 *      oftalmica, etc.), NAO e um dado que o municipio publicou. Isso
 *      e diferente de completar local_dispensacao ou concentracao —
 *      ali completar seria inventar um FATO do municipio; aqui e
 *      aplicar uma regra farmacologica universal sobre um campo que
 *      JA foi extraido do proprio texto do municipio. Forma ambigua
 *      (ex.: "solucao" pelada, "gotas" sem contexto) fica em branco —
 *      a mesma regra do arquivo interno para nao inventar.
 *
 * SAIDA
 *   node scripts/exportar-importacao-nativa.js "Macaé"
 *   -> exports/nativo/Macae.csv                  (arquivo para importar)
 *   -> exports/nativo/Macae-conferir.csv         (so as linhas que
 *      precisam de olho humano antes de subir — nunca faz parte do
 *      arquivo de importacao)
 * ------------------------------------------------------------------ */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const { decompor, codigoDe } = require("./exportar-modelo-remume.js");
const REMUMES = require(path.join(RAIZ, "modules/remume/remumes.json"));

const COLUNAS = [
  "remume_versao",
  "codigo_identificacao",
  "descricao_original",
  "principio_ativo",
  "concentracao",
  "forma_farmaceutica",
  "apresentacao",
  "local_dispensacao",
  "restricao",
  "via_administracao",
  "situacao",
];

/* ------------------------------------------------------------------
 * 1. REFINO DA CONCENTRACAO — ver cabecalho.
 * ------------------------------------------------------------------ */
const RE_CONC_PELADA = /^\d+[\d.,]*\s*(g|ml|mg)$/i;
/* So a metade "por unidade" do RE_CONC importado — sem essa restricao
 * o refino aceitaria outro numero pelado como "melhor" e nao mudaria
 * nada. */
const RE_CONC_POR_UNIDADE =
  /\d+[\d.,]*\s*(mg\/[\d.,]+\s*ml|mg\/ml|mcg\/ml|g\/ml|ui\/ml|mg\/g|mcg\/dose|mg\/dose)(\s*\(\d+[\d.,]*\s*%\))?|\d+[\d.,]*\s*%(?![0-9])/i;

function refinarConcentracao(descricaoOriginal, concentracaoAchada) {
  const atual = String(concentracaoAchada || "").trim();
  if (!RE_CONC_PELADA.test(atual)) return { valor: concentracaoAchada, trocou: false };

  const m = descricaoOriginal.match(RE_CONC_POR_UNIDADE);
  if (!m) return { valor: concentracaoAchada, trocou: false };

  return { valor: m[0].trim(), trocou: true };
}

/* ------------------------------------------------------------------
 * 2. VIA DE ADMINISTRACAO — ver cabecalho.
 * ------------------------------------------------------------------
 * Chave = exatamente o valor que decompor() devolve em
 * forma_farmaceutica (um dos itens do array FORMAS de
 * exportar-modelo-remume.js). Forma nao listada aqui, ou vazia, cai no
 * fallback por palavra-chave no texto original; se nada bater, fica em
 * branco — o municipio nao deu a informacao com clareza suficiente
 * para afirmar, e afirmar errado numa via de administracao e pior do
 * que deixar em branco.
 * ------------------------------------------------------------------ */
const VIA_POR_FORMA = {
  "comprimido revestido": "oral",
  "comprimido mastigável": "oral",
  "comprimido sublingual": "sublingual",
  "comprimido efervescente": "oral",
  "comprimido de liberação prolongada": "oral",
  "comprimido": "oral",
  "cápsula mole": "oral",
  "cápsula dura": "oral",
  "cápsula": "oral",
  "pó liofilizado para solução injetável": "injetável",
  "pó liofilizado": "injetável",
  "pó para solução injetável": "injetável",
  "pó para suspensão injetável": "injetável",
  "pó para suspensão oral": "oral",
  "pó para solução oral": "oral",
  "solução injetável": "injetável",
  "solução oral": "oral",
  "solução nasal": "nasal",
  "solução oftálmica": "oftálmica",
  "solução otológica": "otológica",
  "solução tópica": "tópica",
  "suspensão injetável": "injetável",
  "suspensão oral": "oral",
  "emulsão injetável": "injetável",
  "creme vaginal": "vaginal",
  "creme dermatológico": "tópica",
  "creme": "tópica",
  "pomada oftálmica": "oftálmica",
  "pomada": "tópica",
  "pomada dermatológica": "tópica",
  "gel": "tópica",
  "loção": "tópica",
  "xarope": "oral",
  "elixir": "oral",
  "tintura": "tópica",
  "colírio": "oftálmica",
  "aerossol": "inalatória",
  "aerosol": "inalatória",
  "shampoo": "tópica",
  "xampu": "tópica",
  "sabonete": "tópica",
  "sabonete líquido": "tópica",
  "supositório": "retal",
  "óvulo": "vaginal",
  "adesivo transdérmico": "transdérmica",
  "adesivo": "transdérmica",
  "granulado": "oral",
  "drágea": "oral",
  "pastilha": "oral",
  "injetável": "injetável",
  "implante subdérmico": "subcutânea",
  "implante": "subcutânea",
  "geleia vaginal": "vaginal",
  "geléia vaginal": "vaginal",
  "goma de mascar": "oral",
  "goma": "oral",
  "enema": "retal",
  "aquoso nasal": "nasal",
  "spray nasal": "nasal",
  "pasta": "tópica",
  "solução tópica degermante": "tópica",
  "solução hidroalcoólica": "tópica",
};

/* Fallback por palavra-chave: so entra quando a forma nao decidiu
 * (vazia, ou uma das ambiguas de proposito — "solução", "suspensão",
 * "pó", "gotas", "spray", "geleia", "líquido", "concentrado" nao estao
 * no mapa acima). Palavra explicita no texto do municipio pesa mais do
 * que a forma sozinha. */
const PALAVRAS_VIA = [
  [/\bvaginal/i, "vaginal"],
  [/oftalm|ocular|col[íi]rio/i, "oftálmica"],
  [/otol[óo]gic|auricular/i, "otológica"],
  [/\bnasal/i, "nasal"],
  [/\bretal\b/i, "retal"],
  [/intramuscular|\bim\b/i, "injetável"],
  [/intravenos|\biv\b/i, "injetável"],
  [/subcut[âa]ne|\bsc\b/i, "subcutânea"],
  [/t[óo]pic|dermatol[óo]gic/i, "tópica"],
  [/sublingual/i, "sublingual"],
  [/\bbucal\b/i, "oral"],
];

function inferirVia(formaFarmaceutica, descricaoOriginal) {
  const direta = VIA_POR_FORMA[formaFarmaceutica];
  if (direta) return direta;
  for (const [re, via] of PALAVRAS_VIA) {
    if (re.test(descricaoOriginal)) return via;
  }
  return "";
}

/* ------------------------------------------------------------------
 * 3. RESTRICAO — a partir do receituario controlado ja presente nos
 *    dados (Portaria 344/98). O arquivo interno deixa esta coluna
 *    sempre vazia; aqui ela carrega informacao real, porque o sistema
 *    nativo precisa saber ANTES de prescrever, nao so na hora de
 *    dispensar.
 * ------------------------------------------------------------------ */
const RESTRICAO_POR_RECEITUARIO = {
  amarela: "Notificação de Receita A (amarela) — entorpecente/psicotrópico, Portaria 344/98. Prescrição em receituário especial.",
  azul: "Notificação de Receita B (azul) — psicotrópico, Portaria 344/98. Prescrição em receituário especial.",
};

/* ------------------------------------------------------------------
 * 4. LIMITE DE TAMANHO DO CAMPO — o sistema nativo recusou a carga de
 *    Macaé DUAS vezes seguidas: primeiro "principio_ativo deve ter no
 *    maximo 255 caracteres", depois — no MESMO municipio, na MESMA
 *    linha 377 — "descricao_original deve ter no maximo 255
 *    caracteres". A causa dos dois e a mesma: 4 itens de Macaé sao
 *    formulas de Nutricao Parenteral descritas em PROSA CLINICA
 *    (protocolo de uso, composicao, via de administracao — a
 *    descricao_original original chega a 1367 caracteres), sem
 *    "principio ativo" farmacologico de verdade para decompor()
 *    extrair.
 *
 *    Duas rejeicoes seguidas no MESMO campo (so que colunas
 *    diferentes) e o sinal de que o limite nao e so de
 *    principio_ativo — e do CAMPO DE TEXTO do sistema nativo, ponto.
 *    Por isso o corte agora e aplicado em TODA COLUNA da linha, nao so
 *    nas que ja erraram uma vez: e mais barato cortar uma coluna que
 *    nunca vai passar de 255 (situacao, via_administracao...) do que
 *    descobrir campo por campo, erro por erro, qual e o proximo que o
 *    sistema vai recusar.
 *
 *    A correcao corta na ULTIMA PALAVRA COMPLETA antes do limite —
 *    nunca no meio de uma palavra — e toda linha com QUALQUER coluna
 *    cortada entra no -conferir.csv dizendo QUAL coluna foi cortada:
 *    um texto truncado automaticamente nao e o mesmo que um texto
 *    CERTO, e essas 4 formulas provavelmente merecem um nome e uma
 *    descricao curtos, escolhidos por quem conhece a lista — nao a
 *    prosa cortada na marca dos 255 caracteres. O texto INTEIRO, sem
 *    corte nenhum, continua preservado em
 *    exports/modelo-importacao-remume.xlsx (uso interno, sem limite de
 *    tamanho) — nada se perde, so nao cabe no sistema nativo.
 * ------------------------------------------------------------------ */
const LIMITE_CAMPO_TEXTO = 255;

function truncarComLimite(valor, limite) {
  const s = String(valor || "");
  if (s.length <= limite) return { valor: s, truncou: false };
  let corte = s.slice(0, limite);
  const ultimoEspaco = corte.lastIndexOf(" ");
  /* So corta no espaco se sobrar pelo menos 60% do limite — senao uma
   * palavra rara e comprida (raro em nome de medicamento) deixaria o
   * corte curto demais para servir de identificacao. */
  if (ultimoEspaco > limite * 0.6) corte = corte.slice(0, ultimoEspaco);
  return { valor: corte.trim(), truncou: true };
}

/* Aplica o corte a TODA COLUNA de uma linha de uma vez, devolvendo os
 * valores ja cortados e a lista de {coluna, tamanhoOriginal} de quem
 * precisou. `pares` e uma lista [nomeDaColuna, valor]. */
function truncarLinha(pares, limite) {
  const truncadas = [];
  const valores = pares.map(([coluna, valor]) => {
    const r = truncarComLimite(valor, limite);
    if (r.truncou) truncadas.push({ coluna, tamanhoOriginal: String(valor || "").length });
    return r.valor;
  });
  return { valores, truncadas };
}

/* ------------------------------------------------------------------
 * CSV — ";" (igual ao modelo em anexo), aspas so quando o campo exige
 * (contem ";", aspas ou quebra de linha), CRLF por ser o padrao que
 * planilhas brasileiras esperam ao importar.
 * ------------------------------------------------------------------ */
function celulaCsv(valor) {
  const s = String(valor === undefined || valor === null ? "" : valor);
  if (/[;"\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function linhaCsv(campos) {
  return campos.map(celulaCsv).join(";");
}

function semAcentoLocal(t) {
  return String(t)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function nomeDeArquivo(municipio) {
  return semAcentoLocal(municipio).replace(/[^A-Za-z0-9]+/g, "");
}

function main() {
  const municipio = process.argv[2];
  if (!municipio) {
    console.error("Uso: node scripts/exportar-importacao-nativa.js \"<Município>\"");
    console.error("Municípios disponíveis: " + Object.keys(REMUMES).filter((k) => k !== "_meta").sort().join(", "));
    process.exit(1);
  }
  const itens = REMUMES[municipio];
  if (!itens) {
    console.error('Município "' + municipio + '" não encontrado em modules/remume/remumes.json.');
    console.error("Municípios disponíveis: " + Object.keys(REMUMES).filter((k) => k !== "_meta").sort().join(", "));
    process.exit(1);
  }

  const versao = (REMUMES._meta && REMUMES._meta.atualizadoEm) || "";
  const linhasCsv = [linhaCsv(COLUNAS)];
  const paraConferir = [
    linhaCsv(["codigo_identificacao", "descricao_original", "principio_ativo", "concentracao", "forma_farmaceutica", "motivo"]),
  ];

  let semVia = 0;
  let semForma = 0;
  let comRestricao = 0;
  let concentracaoRefinada = 0;
  let linhasComCorte = 0;

  itens.forEach((item) => {
    const descricao = String(item.nome || "").trim();
    if (!descricao) return;

    const d = decompor(descricao);
    const codigo = codigoDe(municipio, descricao);
    const refino = refinarConcentracao(descricao, d.concentracao);
    if (refino.trocou) concentracaoRefinada++;

    /* via/forma sao calculados sobre o texto ORIGINAL, antes de
     * qualquer corte — cortar e so formatacao de saida, nunca pode
     * mudar uma decisao que ja foi tomada em cima do texto completo. */
    const via = inferirVia(d.forma_farmaceutica, descricao);
    if (!via) semVia++;
    if (!d.forma_farmaceutica) semForma++;

    const restricao = item.receituario && RESTRICAO_POR_RECEITUARIO[item.receituario]
      ? RESTRICAO_POR_RECEITUARIO[item.receituario]
      : "";
    if (restricao) comRestricao++;

    /* Corte de 255 caracteres em TODA coluna — ver comentario acima de
     * LIMITE_CAMPO_TEXTO: o sistema nativo ja recusou duas colunas
     * diferentes pelo mesmo motivo, entao o limite e tratado como
     * valendo para o campo de texto do sistema, nao coluna por coluna. */
    const { valores, truncadas } = truncarLinha(
      [
        ["remume_versao", versao],
        ["codigo_identificacao", codigo],
        ["descricao_original", descricao],
        ["principio_ativo", d.principio_ativo],
        ["concentracao", refino.valor],
        ["forma_farmaceutica", d.forma_farmaceutica],
        ["apresentacao", d.apresentacao],
        ["local_dispensacao", item.local || ""],
        ["restricao", restricao],
        ["via_administracao", via],
        ["situacao", "ativo"],
      ],
      LIMITE_CAMPO_TEXTO
    );
    if (truncadas.length) linhasComCorte++;

    linhasCsv.push(linhaCsv(valores));

    const motivos = [];
    truncadas.forEach((t) => {
      motivos.push(
        "⚠ " + t.coluna.toUpperCase() + " CORTADO — texto original tinha " + t.tamanhoOriginal +
        " caracteres (limite do sistema é 255); revise manualmente antes de importar"
      );
    });
    if (d.decomposicao === "revisar") motivos.push("quebra automática incerta");
    if (refino.trocou) motivos.push("concentração corrigida (tamanho de embalagem != concentração)");
    if (!via) motivos.push("via de administração não inferida");
    if (motivos.length) {
      /* valores segue a ordem de COLUNAS: [2]=descricao, [3]=principio,
       * [4]=concentracao, [5]=forma — ja com o corte aplicado, para o
       * -conferir.csv mostrar exatamente o que foi PARA o CSV de
       * importacao, nao o valor de antes do corte. */
      paraConferir.push(
        linhaCsv([codigo, valores[2], valores[3], valores[4], valores[5], motivos.join(" · ")])
      );
    }
  });

  const dirSaida = path.join(RAIZ, "exports/nativo");
  fs.mkdirSync(dirSaida, { recursive: true });
  const base = nomeDeArquivo(municipio);
  const caminhoCsv = path.join(dirSaida, base + ".csv");
  const caminhoConferir = path.join(dirSaida, base + "-conferir.csv");

  /* BOM: sem ele, Excel no Windows costuma ler acento errado num CSV
   * UTF-8 aberto por clique duplo. */
  fs.writeFileSync(caminhoCsv, "﻿" + linhasCsv.join("\r\n") + "\r\n", "utf8");
  fs.writeFileSync(caminhoConferir, "﻿" + paraConferir.join("\r\n") + "\r\n", "utf8");

  console.log("Gerado: " + path.relative(RAIZ, caminhoCsv));
  console.log("  município:              " + municipio);
  console.log("  itens:                  " + (linhasCsv.length - 1));
  console.log("  remume_versao:          " + versao);
  console.log("  com restrição (344/98): " + comRestricao);
  console.log("  concentração corrigida: " + concentracaoRefinada);
  if (linhasComCorte) console.log("  ⚠ linha(s) com algum campo CORTADO (>255 car.): " + linhasComCorte);
  console.log("  sem forma farmacêutica: " + semForma);
  console.log("  sem via de administração: " + semVia);
  console.log("Para conferir antes de importar: " + path.relative(RAIZ, caminhoConferir) + " (" + (paraConferir.length - 1) + " linha(s))");
}

main();
