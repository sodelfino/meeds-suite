/* ------------------------------------------------------------------
 * scripts/montar-exames.js — monta dados/exames.json a partir das fontes
 * ------------------------------------------------------------------
 * POR QUE EXISTE UM SCRIPT, E NAO UM JSON ESCRITO A MAO
 * Betim sozinho tem 2.002 exames. Transcrever isso na mao garante erro,
 * e um erro aqui nao e cosmetico: um exame com nome torto some da busca,
 * e o medico conclui que o municipio nao oferece.
 *
 * Rodar de novo quando a prefeitura mandar lista nova:
 *   node scripts/montar-exames.js
 *
 * As fontes ficam FORA do repositorio (sao documentos das prefeituras).
 * O caminho de cada uma esta em FONTES, abaixo; se o arquivo nao estiver
 * la, o script mantem o que ja existe em dados/exames.json para aquele
 * municipio, em vez de apaga-lo. Nunca apagar dado de municipio por
 * ausencia de arquivo e a regra que evita uma lista sumir por engano.
 *
 * A REGRA DE OURO, HERDADA DO REMUME
 * A lista de cada municipio e a UNICA fonte de verdade do que ele
 * oferece. Este script NAO inventa, NAO completa e NAO copia exame de um
 * municipio para outro. O que nao esta no documento nao entra.
 * ------------------------------------------------------------------ */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");
const SAIDA = path.join(RAIZ, "dados/exames.json");

const FONTES = {
  betim: "/Users/marcelodelfino/Downloads/Tabela do contrato LABORATORIAIS para Callmed.xlsx",
  macae: "/Users/marcelodelfino/Downloads/Exames realizados na UPA .pdf",
};

/* ------------------------------------------------------------------
 * BETIM — planilha do contrato laboratorial
 * ------------------------------------------------------------------
 * Duas colunas: CODIGO e PROCEDIMENTO. As duas primeiras linhas sao
 * titulo e cabecalho.
 * ------------------------------------------------------------------ */
async function lerBetim() {
  if (!fs.existsSync(FONTES.betim)) return null;
  const ExcelJS = require("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FONTES.betim);
  const ws = wb.getWorksheet("Plan1");

  const exames = [];
  const vistos = new Set();
  ws.eachRow((linha) => {
    const codigo = String(linha.getCell(1).value ?? "").trim();
    /* A planilha quebra nomes longos em varias linhas dentro da celula.
     * Sem colapsar o espaco em branco, o nome chega na tela partido no
     * meio ("HEMOGRAMA COMPLETO (ERITROGRAMA +\nAVALIACAO...") e, pior,
     * a busca por "eritrograma avaliacao" nao casaria. */
    const nome = String(linha.getCell(2).value ?? "").replace(/\s+/g, " ").trim();
    /* Cabecalho e titulo nao tem codigo numerico. O filtro e esse, e nao
     * "pule as duas primeiras linhas": se a prefeitura mandar a planilha
     * com uma linha a mais no topo, o corte por posicao levaria um exame
     * junto e ninguem perceberia. */
    if (!nome || !/^\d[\d-]*$/.test(codigo)) return;

    /* Duplicata pelo par codigo+nome. O mesmo exame repetido na planilha
     * viraria duas linhas identicas na busca. */
    const chave = codigo + "|" + nome.toLowerCase();
    if (vistos.has(chave)) return;
    vistos.add(chave);

    exames.push({ nome, codigo });
  });

  return {
    _leia_me:
      "Extraido de 'Tabela do contrato LABORATORIAIS para Callmed.xlsx'. " +
      "Todos os itens do contrato sao solicitaveis (confirmado com o time em 08/09/2026).",
    fonte: "Contrato de exames laboratoriais",
    atualizadoEm: "2026-09-08",
    exames,
  };
}

/* ------------------------------------------------------------------
 * MACAE — PDF da UPA Barra
 * ------------------------------------------------------------------
 * Lista simples com marcador. O PDF traz tambem duas REGRAS que nao
 * podem se perder na conversao: elas mudam o que o medico precisa fazer
 * ao pedir o exame, e um dado assim escondido num PDF de gaveta vale
 * menos que nada.
 * ------------------------------------------------------------------ */
function lerMacae() {
  if (!fs.existsSync(FONTES.macae)) return null;
  let texto;
  try {
    texto = execFileSync("pdftotext", ["-layout", FONTES.macae, "-"], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (e) {
    console.warn("  ! pdftotext falhou; Macae mantido como estava. " + e.message);
    return null;
  }

  const exames = [];
  const vistos = new Set();
  texto.split("\n").forEach((linha) => {
    const m = linha.match(/^\s*[•·]\s*(.+?)\s*$/);
    if (!m) return;
    const nome = m[1].trim();
    if (!nome || vistos.has(nome)) return;
    vistos.add(nome);
    /* O local vem do documento, nao do exame: a lista inteira e do que a
     * UPA Barra realiza. */
    exames.push({ nome, local: "UPA Barra" });
  });

  return {
    _leia_me:
      "Extraido de 'Exames realizados na UPA .pdf' (UPA Barra). O PDF nao traz codigo de procedimento.",
    fonte: "Exames realizados na unidade — UPA Barra",
    atualizadoEm: "2026-09-08",
    /* Regras que o medico precisa saber ANTES de pedir. Aparecem no topo
     * do painel quando Macae esta selecionado. */
    observacoes: [
      "Sorologia para HIV exige consentimento livre e esclarecido do paciente, assinado no pedido ou em termo de anuência.",
      "A data de nascimento é obrigatória na requisição de exames laboratoriais — é o que identifica o paciente sem ambiguidade e define os valores de referência por faixa etária.",
    ],
    exames,
  };
}

/* ------------------------------------------------------------------
 * CONGONHAS — os procedimentos que exigem APAC
 * ------------------------------------------------------------------
 * Vem de dados/apac.json, que ja era a fonte desses codigos SIGTAP no
 * gerador de APAC. Ler de la em vez de repetir aqui evita o pior tipo de
 * divergencia: dois arquivos com o mesmo codigo, um deles desatualizado.
 *
 * O Doppler e o Eco viram VARIAS linhas, uma por territorio e por
 * variante. O medico procura "doppler carotida", nao "doppler" — e uma
 * linha generica o obrigaria a saber de cor que aquele exame se desdobra.
 * ------------------------------------------------------------------ */
function lerCongonhas() {
  const apac = JSON.parse(fs.readFileSync(path.join(RAIZ, "dados/apac.json"), "utf8"));
  const proc = apac._comum.procedimentos;
  const exames = [];

  Object.keys(proc).forEach((chave) => {
    const p = proc[chave];
    /* "OUTRO" e uma saida de emergencia do formulario da APAC ("digite
     * outro procedimento"), nao um exame que o municipio oferece. Numa
     * lista de busca ele so faria ruido. */
    if (chave === "OUTRO" || !p.codigo) return;

    if (chave === "DOPPLER" && Array.isArray(apac._comum.territorios)) {
      apac._comum.territorios.forEach(function (t) {
        exames.push({ nome: t, codigo: p.codigo, exige: "APAC" });
      });
      return;
    }

    if (chave === "ECO" && apac._comum.ecoVariantes) {
      Object.keys(apac._comum.ecoVariantes).forEach(function (v) {
        const e = apac._comum.ecoVariantes[v];
        exames.push({ nome: e.nome, codigo: e.codigo, exige: "APAC" });
      });
      return;
    }

    exames.push({
      nome: p.label || p.nome,
      codigo: p.codigo,
      exige: "APAC",
      /* O nome curto ajuda quem digita "holter" a achar
       * "MONITORAMENTO PELO SISTEMA HOLTER 24 HS". */
      apelido: p.label && p.nome !== p.label ? p.nome : undefined,
    });
  });

  return {
    _leia_me:
      "Procedimentos que exigem APAC em Congonhas. Os codigos vem de dados/apac.json — nao repita codigo SIGTAP aqui.",
    fonte: "Procedimentos com APAC",
    atualizadoEm: "2026-09-08",
    exames,
  };
}

/* ------------------------------------------------------------------ */

async function main() {
  const anterior = fs.existsSync(SAIDA)
    ? JSON.parse(fs.readFileSync(SAIDA, "utf8"))
    : { municipios: {} };

  const novos = {
    Betim: await lerBetim(),
    "Macaé": lerMacae(),
    Congonhas: lerCongonhas(),
  };

  const saida = {
    _leia_me:
      "Exames ofertados por municipio. Gerado por scripts/montar-exames.js a partir dos documentos das prefeituras. " +
      "REGRA DE OURO: a lista de cada municipio e a unica fonte de verdade do que ele oferece — nada e inferido, " +
      "completado ou copiado de outro municipio. Campo 'exige' marca o que precisa de APAC ou laudo.",
    atualizadoEm: new Date().toISOString().slice(0, 10),
    /* Vocabulario do campo `exige`. Fica no arquivo para quem for
     * acrescentar municipio saber o que ja existe, em vez de inventar
     * uma sigla nova que a tela nao sabe pintar. */
    siglas: {
      APAC: {
        rotulo: "APAC",
        titulo: "Exige Laudo de Solicitação/Autorização de Procedimento Ambulatorial",
      },
      LAUDO: {
        rotulo: "Laudo",
        titulo: "Exige laudo médico específico do município",
      },
    },
    municipios: {},
  };

  Object.keys(novos).forEach((m) => {
    if (novos[m]) {
      saida.municipios[m] = novos[m];
    } else if (anterior.municipios && anterior.municipios[m]) {
      /* Documento indisponivel nesta maquina: preserva o que ja havia.
       * Apagar a lista de um municipio porque um arquivo nao estava no
       * lugar seria transformar um problema de ambiente em perda de
       * dado — e o sintoma ("Betim nao tem exames") nao apontaria para a
       * causa. */
      console.warn("  ! fonte de " + m + " nao encontrada; mantendo a lista anterior");
      saida.municipios[m] = anterior.municipios[m];
    }
  });

  /* Municipios que existiam antes e nao sao gerados aqui continuam. */
  Object.keys(anterior.municipios || {}).forEach((m) => {
    if (!saida.municipios[m]) saida.municipios[m] = anterior.municipios[m];
  });

  fs.writeFileSync(SAIDA, JSON.stringify(saida, null, 2) + "\n");

  console.log("Gerado: dados/exames.json");
  let total = 0;
  Object.keys(saida.municipios).sort().forEach((m) => {
    const bloco = saida.municipios[m];
    const n = bloco.exames.length;
    total += n;
    const comCodigo = bloco.exames.filter((e) => e.codigo).length;
    const comLocal = bloco.exames.filter((e) => e.local).length;
    const comSigla = bloco.exames.filter((e) => e.exige).length;
    console.log(
      "  " + String(n).padStart(5) + "  " + m.padEnd(12) +
      " codigo:" + String(comCodigo).padStart(5) +
      "  local:" + String(comLocal).padStart(4) +
      "  sigla:" + String(comSigla).padStart(4) +
      (bloco.observacoes ? "  (+" + bloco.observacoes.length + " observação)" : "")
    );
  });
  console.log("  " + String(total).padStart(5) + "  TOTAL");
  console.log("  tamanho: " + (fs.statSync(SAIDA).size / 1024).toFixed(0) + " KB");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
