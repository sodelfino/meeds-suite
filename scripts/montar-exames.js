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

/* ------------------------------------------------------------------
 * SETE LAGOAS — orientações da Central de Marcação
 * ------------------------------------------------------------------
 * FONTE DIFERENTE DAS OUTRAS, E POR ISSO O JEITO DE LER TAMBEM E
 * A tabela de Sete Lagoas nao e uma lista de duas colunas como Betim,
 * nem uma lista com marcador como Macae: e uma tabela de 7 colunas por
 * exame, com celulas que quebram em varias linhas (nome do medico,
 * preparo, impresso, local, responsavel, "guia fica na unidade ou vai
 * para a central"). `pdftotext -layout` devolve texto onde as colunas
 * se deslocam de linha para linha (a posicao horizontal de cada coluna
 * muda conforme a altura da celula anterior) — um parser por posicao
 * arriscaria trocar o conteudo de uma coluna pela de outra, em silencio.
 *
 * Por isso esta lista foi transcrita a mao, linha por linha, e
 * CONFERIDA DUAS VEZES: uma lendo a pagina como imagem, outra lendo o
 * texto extraido por `pdftotext -layout` (que fica em
 * /private/tmp/.../scratchpad/sl-exames.txt durante a sessao que gerou
 * isto — nao faz parte do repositorio). As duas leituras bateram.
 *
 * O QUE FICOU DE FORA, DE PROPOSITO
 *   - Nome do medico aberto para a agenda: e escala interna da unidade,
 *     nao informacao sobre o exame. Um medico sai, entra outro, e o
 *     dado apodrece sem ninguem perceber.
 *   - Responsavel pelo agendamento: nome de funcionario. Alem de nao
 *     ajudar o medico que pede o exame, e dado pessoal de quem trabalha
 *     na Central — nao tem por que estar num arquivo publico.
 *   - "PREPARO CONFORME ORIENTACAO DO PRESTADOR": e o texto padrao de
 *     quase toda linha, e nao diz nada que o medico possa agir. Vira
 *     `nota` SO quando a celula tinha informacao de verdade (idade
 *     minima, suspender medicamento, documento a anexar).
 *   - Uma linha "BELO HORIZONTE - CLINICAS DE: RETINA, GLAUCOMA,
 *     CORNEA, CIRURGIAS OFTALMOLOGICAS": nao e um exame, e um roteiro de
 *     encaminhamento para clinicas de BH. Nao cabe numa lista de
 *     "exames".
 *   - A secao "CONSULTAS AGENDADAS PELA CENTRAL DE MARCACAO" (paginas
 *     seguintes do mesmo PDF): sao encaminhamentos para especialista,
 *     nao pedido de exame — outra categoria, fora do escopo deste
 *     modulo. Fica registrado aqui para quem for desenhar essa funcao
 *     no futuro.
 *
 * O QUE VIROU CAMPO NOVO: `nota`
 * Nem toda informacao util cabe em nome/local/exige. "Endoscopia a
 * partir de 13 anos", "PET-CT: anexar resultado de biopsia", "Raio-X:
 * cadastrar o paciente uma vez por membro" mudam o que o medico faz
 * ANTES de pedir — e so existiam dentro do PDF. `nota` e opcional, texto
 * livre, por exame (diferente de `observacoes`, que e por municipio).
 *
 * ALTO CUSTO: sigla nova
 * A coluna "IMPRESSO A SER UTILIZADO" desta prefeitura distingue PEDIDO
 * DE EXAME comum de ALTO CUSTO — categoria burocratica do SUS tao real
 * quanto APAC, e que muda o formulario que o medico preenche. Registrada
 * no vocabulario de `siglas`, no `main()` abaixo.
 * ------------------------------------------------------------------ */
function lerSeteLagoas() {
  const exames = [
    { nome: "Mapeamento de Retina", local: "aguardando prestador" },
    { nome: "Fotocoagulação a Laser", local: "BH" },
    {
      nome: "Avaliação em Deficiência Visual - Reabilitação (Visão Subnormal)",
      local: "BH",
      exige: "LAUDO",
      nota: "Formulário próprio preenchido por oftalmologista. Inclui o fluxo para fornecimento de bengala.",
    },
    { nome: "Plástica Ocular", local: "BH" },
    { nome: "Angiofluorescência", local: "BH" },
    { nome: "Eco B - Ultrassonografia Ocular", local: "BH" },
    { nome: "OCT Mácula - Topografia de Coerência Óptica", local: "BH" },
    { nome: "Topografia de Córnea", local: "BH" },
    { nome: "Capsulotomia a YAG Laser", local: "BH" },
    { nome: "(FACO + LIO) Catarata", local: "BH", exige: "APAC" },
    {
      nome: "Teste Alérgico",
      local: "CISMISEL",
      nota: "Suspender 5 dias antes do exame os medicamentos antialérgicos e corticoides.",
    },
    {
      nome: "Tratamento Esclerosante Não Estético de Varizes dos MMII (Espuma)",
      local: "HM / CISMISEL",
      exige: "ALTO_CUSTO",
      nota: "Anexar xerox do resultado de Duplex.",
    },
    { nome: "Ultrassom de Próstata via Transretal com Sedação e Biópsia", local: "prestador terceirizado" },
    { nome: "Tomografia com Sedação", local: "Hermes Pardini", exige: "ALTO_CUSTO" },
    { nome: "Tomografia", local: "Hermes Pardini / HM", exige: "ALTO_CUSTO" },
    { nome: "Tomografia com Protocolo de Enterografia", local: "Hospital Municipal", exige: "ALTO_CUSTO" },
    { nome: "Angiotomografia", local: "Hospital Municipal", exige: "ALTO_CUSTO" },
    { nome: "Retossigmoidoscopia", local: "Gastrocentro" },
    { nome: "Colonoscopia", local: "HM / Gastrocentro" },
    {
      nome: "Raio X - Com Preparo",
      local: "HM",
      nota:
        "Informar se é direito/esquerdo ou ambos. Pedido com dois membros de um único lado: cadastrar o " +
        "paciente 2 vezes (ex.: membros inferiores direito e esquerdo). Dois membros de cada lado: 4 vezes. " +
        "Solicitações múltiplas (ex.: coluna cervical + torácica + lombar) devem ser desmembradas em pedidos " +
        "separados, com o local detalhado na justificativa.",
    },
    {
      nome: "Raio X - Sem Preparo",
      local: "HM",
      nota:
        "Mesma regra do Raio X com preparo: informar lado e cadastrar um pedido por membro/lado. " +
        "O cadastro precisa ficar igual à solicitação física (um membro ou dois membros).",
    },
    { nome: "Espirometria", local: "aguardando prestador", nota: "Acima de 40 anos." },
    {
      nome: "Endoscopia",
      local: "Gastro Gerais e HM",
      nota: "A partir de 13 anos de idade. De 13 a 15 anos, informar peso e altura.",
    },
    {
      nome: "Videonasolaringoscopia / Fibronasolaringoscopia",
      local: "HM e terceirizado",
      exige: "LAUDO",
      nota: "Pedido de exame + Termo de Esclarecimento, Ciência e Consentimento para o procedimento.",
    },
    {
      nome: "Eletroneuromiografia",
      local: "prestador terceirizado",
      nota: "Informar na observação quais os membros.",
    },
    { nome: "Polissonografia", local: "prestador terceirizado" },
    {
      nome: "Estudo Urodinâmico",
      local: "prestador terceirizado",
      nota:
        "Não realiza em menores de 18 anos. Solicitar via e-mail " +
        "(agendacentralmarcacao2.saude@setelagoas.mg.gov.br) com nome completo, data de nascimento e contato " +
        "do paciente, e resultado de urina rotina atual (até 15 dias) já avaliado pelo médico da unidade, " +
        "anexado em PDF. Exame de urina alterado (infecção) contraindica o procedimento.",
    },
    { nome: "Dilatação Uretral", local: "CEM" },
    { nome: "Cistoscopia / Retirada de Duplo J / Cauterização em Região Genital", local: "CEM" },
    {
      nome: "PET-CT",
      local: "prestador terceirizado / BH",
      nota:
        "Anexar obrigatoriamente o resultado da biópsia. Se houver outros PET-CT, RNM e TC, anexar os " +
        "resultados também.",
    },
    {
      nome: "Ressonância Magnética",
      local: "prestador terceirizado / BH",
      exige: "ALTO_CUSTO",
      nota:
        "Registrar peso e altura no impresso. Nos casos com sedação, a Central entra em contato direto com " +
        "o paciente para a retirada do agendamento e as orientações.",
    },
    {
      nome: "Angioressonância",
      local: "prestador terceirizado / BH",
      exige: "ALTO_CUSTO",
      nota: "Registrar peso e altura do paciente no impresso.",
    },
    {
      nome: "Colangiorressonância",
      local: "prestador terceirizado",
      exige: "ALTO_CUSTO",
      nota: "Registrar peso e altura do paciente no impresso.",
    },
    {
      nome: "Biópsia de RISN por Punção",
      local: "prestador terceirizado / BH",
      exige: "ALTO_CUSTO",
      nota:
        "Exames obrigatórios para instruir o pedido: creatinina sérica; relação albumina/creatinina na urina " +
        "isolada ou albuminúria de 24h; imagem renal (USG, TC ou RM, validade 6 meses); hemograma (validade " +
        "60 dias); coagulograma sem alterações (validade 60 dias); urocultura recente negativa (validade 60 dias).",
    },
    {
      nome: "Cateterismo Cardíaco Adulto - Cineangiocoronariografia",
      local: "Angiosete / diversos hospitais BH",
      exige: "APAC",
      nota: "Anexar exames anteriores (ECO, ECG, Holter ou teste ergométrico) e contato do paciente.",
    },
    {
      nome: "Cateterismo Pediátrico",
      local: "Biocor",
      exige: "APAC",
      nota: "Anexar exames anteriores (ECO) e contato do paciente.",
    },
    {
      nome: "Densitometria Óssea",
      local: "prestador terceirizado / BH",
      exige: "ALTO_CUSTO",
      nota: "Registrar peso e altura do paciente no impresso.",
    },
    { nome: "Cintilografia Óssea", local: "prestador terceirizado / BH", exige: "ALTO_CUSTO" },
    {
      nome: "Cintilografia Renal / Pulmonar / Miocárdica / Tireoide / Paratireoide / Linfocintilografia / Cistocintilografia Direta",
      local: "diversos em BH",
      exige: "ALTO_CUSTO",
      nota: "Anexar exames anteriores relacionados à patologia, registrar peso e altura do paciente.",
    },
    {
      nome: "Arteriografia Cerebral / Angiografia Cerebral / Arteriografia de Membros",
      local: "HM / diversos em BH",
      exige: "ALTO_CUSTO",
      nota: "A solicitação deve ser do especialista. Registrar peso e altura, contato do paciente.",
    },
    { nome: "Litotripsia", local: "diversos em BH", exige: "ALTO_CUSTO" },
    {
      nome: "PAAF de Tireoide Guiado por US (Biópsia)",
      exige: "ALTO_CUSTO",
      nota: "O resultado do US de tireoide deve ser enviado à Central junto com o pedido médico de PAAF.",
    },
    {
      nome: "Terapia Ablativa de Iodo",
      local: "BH",
      exige: "ALTO_CUSTO",
      nota: "Enviar com resultados anteriores de cintilografia de tireoide, PAAF ou ultrassom.",
    },
    {
      nome: "PAAF de Tireoide Comum",
      local: "CEM",
      nota: "O paciente deve apresentar resultado de US de tireoide para realizar o PAAF.",
    },
    {
      nome: "Duplex Scan Venoso e/ou Arterial (MMII, MIE, MID)",
      local: "CISMISEL",
      nota: "Informar se é só venoso, só arterial, ou venoso e arterial, e a parte do corpo (MMII, MIE ou MID).",
    },
    { nome: "Duplex Scan de Carótidas e Vertebrais", local: "CISMISEL" },
    { nome: "Eletroencefalograma de Vigília", local: "CISMISEL" },
    { nome: "Eletroencefalograma de Sono e Vigília", local: "CISMISEL" },
    {
      nome: "Ecodopplercardiograma Transtorácico com Stress Farmacológico",
      local: "prestador terceirizado",
      exige: "ALTO_CUSTO",
      nota: "Realizado a partir de 18 anos.",
    },
    {
      nome: "Ecodopplercardiograma Transtorácico",
      local: "prestador terceirizado",
      exige: "ALTO_CUSTO",
      nota: "No sistema GMUS, cadastrar como \"Ecocardiografia Transtorácica\".",
    },
    { nome: "Teste Ergométrico / Teste de Esforço", local: "prestador terceirizado", nota: "A partir de 16 anos." },
    {
      nome: "Monitoramento pelo Sistema Holter 24hs",
      local: "prestador terceirizado",
      nota: "A partir de 15 anos. Cadastrar corretamente o código de referência.",
    },
    {
      nome: "Monitorização Ambulatorial de Pressão Arterial (MAPA) 24hs",
      local: "prestador terceirizado",
      nota: "A partir de 15 anos.",
    },
    { nome: "Ultrassonografia de Mama e Axila", local: "prestador terceirizado" },
    { nome: "Ultrassonografia de Abdômen Total", local: "HM" },
    { nome: "Ultrassonografia de Abdômen Total com Doppler", local: "HM" },
    {
      nome: "Ultrassonografia de Aparelho Urinário",
      local: "HM",
      nota: "Informar na observação quando for com Doppler.",
    },
    {
      nome: "Ultrassonografia de Bolsa Escrotal",
      local: "HM",
      nota: "Informar na observação quando for com Doppler.",
    },
    { nome: "Ultrassonografia de Próstata por Via Abdominal", local: "HM" },
    { nome: "Ultrassonografia Pélvica (Ginecológica) Simples", local: "HM" },
    {
      nome: "Ultrassonografia Transvaginal",
      local: "HM / CEAE",
      nota: "Informar na observação quando for com Doppler.",
    },
    {
      nome: "Ultrassonografia de Tireoide ou com Doppler",
      local: "HM",
      nota: "Informar na observação quando for com Doppler.",
    },
    {
      nome: "Ultrassonografia Obstétrica Simples",
      local: "prestador terceirizado",
      nota: "Informar na observação as semanas de gestação e o tipo: obstétrico simples, TN ou com PBF.",
    },
    {
      nome: "Ultrassonografia de Articulação",
      local: "HM",
      nota: "Informar na observação a parte do corpo solicitada (ex.: ombro direito, joelhos direito e esquerdo).",
    },
    {
      nome: "Ultrassonografia Mamária Bilateral e Axilas",
      local: "prestador terceirizado",
      nota: "Informar na observação se é bilateral ou unilateral, e/ou axilas.",
    },
  ];

  return {
    _leia_me:
      "Transcrito de 'ORIENTAÇÕES SOBRE EXAMES E ESPECIALIDADES AGENDADOS PELA CENTRAL DE MARCAÇÃO - SL - MG " +
      "(ATUALIZAÇÃO AGOSTO/2026)', só a seção de exames (a de consultas/encaminhamento a especialista ficou de " +
      "fora — é outra categoria). Nome do médico aberto à agenda e responsável pelo agendamento foram omitidos: " +
      "são escala interna e nome de funcionário, não informação sobre o exame.",
    fonte: "Orientações da Central de Marcação — SL",
    atualizadoEm: "2026-08-01",
    /* A mesma regra de Macae: informacao que muda a conduta ANTES de
     * pedir, valida para o municipio inteiro. */
    observacoes: [
      "Os cadastros dos pacientes devem estar atualizados no sistema GMUS e no CADWEB.",
      "Documentos enviados por malote devem estar com o carimbo da unidade, os xerox anexados legíveis, e sempre conter o contato telefônico atualizado do paciente.",
    ],
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
    "Sete Lagoas": lerSeteLagoas(),
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
      ALTO_CUSTO: {
        rotulo: "Alto Custo",
        titulo: "Exige o formulário de Procedimento de Alto Custo/Complexidade, e não o pedido de exame comum",
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
    const comNota = bloco.exames.filter((e) => e.nota).length;
    console.log(
      "  " + String(n).padStart(5) + "  " + m.padEnd(12) +
      " codigo:" + String(comCodigo).padStart(5) +
      "  local:" + String(comLocal).padStart(4) +
      "  sigla:" + String(comSigla).padStart(4) +
      "  nota:" + String(comNota).padStart(4) +
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
