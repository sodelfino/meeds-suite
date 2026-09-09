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
  /* As duas fontes por especialidade nao sao lidas em runtime (o DOCX
   * nao tem tabela, so paragrafos soltos; o XLSX tem varias abas com
   * texto que mistura canal + pre-requisito + validade na mesma
   * celula). Os dois caminhos ficam registrados aqui so para quem for
   * conferir a proxima atualizacao saber onde procurar — a leitura em
   * si e a lista transcrita a mao dentro de lerMacaeEspecialidades(),
   * na mesma disciplina ja usada para Sete Lagoas. */
  macaeEspecialidadesDocx: "/Users/marcelodelfino/Downloads/EXAMES REALIZADOS PELO SUS NO MUNICIPIO DE MACAÉ.docx",
  macaeEspecialidadesXlsx: "/Users/marcelodelfino/Downloads/Fluxo SUS Macae.xlsx",
};

/* ------------------------------------------------------------------
 * orientacao(...) — monta o campo opcional `orientacao` de um exame
 * ------------------------------------------------------------------
 * NAO E UM PARSER DE TEXTO LIVRE, DE PROPOSITO
 * Esta funcao nao le PDF nem tenta adivinhar, por regex ou NLP, qual
 * pedaco de uma frase e "faixa etaria" e qual e "pre-requisito". Fazer
 * isso seria delegar para codigo exatamente a inferencia que a regra de
 * ouro proibe — um classificador automatico ERRA, e erra em silencio.
 *
 * O que ela faz e o passo seguinte, depois que uma PESSOA ja leu o
 * documento e decidiu, frase por frase, em qual campo tipado (se algum)
 * aquele trecho cabe sem ambiguidade. Esta funcao so:
 *   1. recusa `preparo` boilerplate ("preparo conforme orientacao do
 *      prestador"), mesmo se alguem colar por engano;
 *   2. limpa array vazio, string vazia e whitespace solto — o formato
 *      final no JSON fica sempre com o campo AUSENTE quando nao ha
 *      conteudo, nunca com "" ou [] sobrando;
 *   3. valida `fluxo` contra o vocabulario fixo (falha o build se vier
 *      algo fora dele — mesmo espirito da validacao de `codigo` em
 *      Congonhas: erro de digitacao vira erro de build, nao vira dado
 *      errado em producao);
 *   4. devolve `undefined` quando, depois da limpeza, nao sobrou nada —
 *      assim quem monta o exame nunca deixa um `orientacao: {}` pendurado,
 *      e o modulo de renderizacao pode confiar que "orientacao existe"
 *      ja significa "tem conteudo para mostrar".
 *
 * NENHUM DADO DE PACIENTE PASSA POR AQUI. Isto e metadado do EXAME
 * (regra de conduta, documento a anexar, faixa etaria) — nunca nome,
 * CPF ou qualquer coisa de uma pessoa atendida.
 * ------------------------------------------------------------------ */
const FLUXOS_VALIDOS = ["FICA_NA_UNIDADE", "VAI_PARA_CENTRAL", "OUTRO"];

/* `canalEncaminhamento` nasceu com Macae, e responde uma pergunta
 * DIFERENTE da que `fluxo` responde:
 *
 *   fluxo               = depois de emitido, o papel FICA ONDE?
 *                          (conceito de Sete Lagoas: unidade x central)
 *   canalEncaminhamento = por QUAL CANAL o pedido ENTRA na regulacao?
 *                          (conceito de Macae: SISREG x Central x
 *                          regulacao estadual x direto no servico)
 *
 * Os dois campos NAO SE SUBSTITUEM. Um exame pode ter os dois, so um,
 * ou nenhum — sao eixos independentes, e um municipio que so enxerga um
 * dos dois eixos simplesmente nao preenche o outro. */
const CANAIS_VALIDOS = [
  "SISREG",
  "CENTRAL_MUNICIPAL",
  "REGULACAO_ESTADUAL",
  "DIRETO_AO_SERVICO",
  "OUTRO",
];

/* A mesma frase-molde aparece em quase toda linha da fonte de Sete
 * Lagoas ("PREPARO CONFORME ORIENTACAO DO PRESTADOR"), variando so
 * acento e maiuscula. Normaliza removendo acento antes de comparar,
 * para nao depender de a pessoa digitar exatamente igual. */
function normalizarPraComparar(t) {
  return String(t || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function ehPreparoBoilerplate(texto) {
  var limpo = normalizarPraComparar(texto);
  return (
    limpo === "" ||
    limpo.indexOf("preparo conforme orientacao do prestador") !== -1 ||
    limpo.indexOf("conforme orientacao medica") !== -1
  );
}

/* Tira string vazia/so-espaco de um array, e devolve undefined (nao []
 * vazio) se nada sobrou. */
function limparLista(lista) {
  if (!Array.isArray(lista)) return undefined;
  var limpa = lista.map((s) => String(s || "").trim()).filter(Boolean);
  return limpa.length ? limpa : undefined;
}

function limparString(s) {
  var limpa = String(s || "").trim();
  return limpa || undefined;
}

function orientacao(campos) {
  campos = campos || {};

  var preparo = limparString(campos.preparo);
  if (preparo && ehPreparoBoilerplate(preparo)) preparo = undefined;

  if (campos.fluxo && FLUXOS_VALIDOS.indexOf(campos.fluxo) === -1) {
    throw new Error(
      "orientacao(): fluxo \"" + campos.fluxo + "\" nao esta em " + FLUXOS_VALIDOS.join("/") +
      " — corrija ou acrescente o valor novo ao vocabulario antes de usar."
    );
  }
  if (campos.canalEncaminhamento && CANAIS_VALIDOS.indexOf(campos.canalEncaminhamento) === -1) {
    throw new Error(
      "orientacao(): canalEncaminhamento \"" + campos.canalEncaminhamento + "\" nao esta em " +
      CANAIS_VALIDOS.join("/") + " — corrija ou acrescente o valor novo ao vocabulario antes de usar."
    );
  }

  var saida = {
    faixaEtaria: limparString(campos.faixaEtaria),
    preparo: preparo,
    documentos: limparLista(campos.documentos),
    preRequisitos: limparLista(campos.preRequisitos),
    restricoes: limparLista(campos.restricoes),
    comoCadastrar: limparString(campos.comoCadastrar),
    validade: limparString(campos.validade),
    fluxo: campos.fluxo || undefined,
    canalEncaminhamento: campos.canalEncaminhamento || undefined,
    observacoes: limparString(campos.observacoes),
  };

  /* So existe conteudo se pelo menos um campo sobreviveu a limpeza.
   * `orientacao: {}` nao ajuda ninguem — e pior que nao ter o campo,
   * porque obrigaria o renderizador a checar "existe mas esta vazio"
   * em vez de so checar "existe". */
  var temConteudo = Object.keys(saida).some((k) => saida[k] !== undefined);
  return temConteudo ? saida : undefined;
}

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
 * MACAE — exames por especialidade (SEMUSA), segunda fonte do municipio
 * ------------------------------------------------------------------
 * Macae e o segundo caso de "um municipio, duas fontes" (o primeiro foi
 * Sete Lagoas). A UPA Barra (lerMacae(), acima) e a lista de agendamento
 * por especialidade sao arquivos DIFERENTES, publicados por partes
 * DIFERENTES da SEMUSA, e a lista laboratorial de bancada — uma
 * TERCEIRA fonte — ainda nao foi fornecida: fica registrada em
 * `_leia_me` para nao ser esquecida quando chegar.
 *
 * DUAS FONTES PARA ESTA LISTA, COM PAPEIS DIFERENTES (nao dois
 * municipios "duas fontes" empilhados — sao duas fontes de UM bloco):
 *   DOCX  "Exames realizados pelo SUS no municipio de Macae"
 *         Lista plana, so nome, 61 itens. E a fonte da LISTA — o que
 *         entra e o que nao entra vem daqui.
 *   XLSX  "Fluxo SUS Macae", aba "Especialidades Medicas"
 *         Tabela por especialidade: Exame | Fluxo e Direcionamento |
 *         Documentos | Observacoes. ENRIQUECE os itens do DOCX com
 *         especialidade/canal/documentos — nao redefine a lista.
 * Onde as duas se sobrepoem (a maioria dos casos), o item leva o nome
 * do DOCX e o enriquecimento do XLSX. Onde so uma tem — nome so no
 * DOCX, ou exame so no XLSX (ex.: Cateterismo, Ressonancia com
 * sedacao) — o item entra do jeito que a fonte que o tem descreve,
 * exatamente a regra de "usar o que tiver" combinada para esta leva.
 *
 * NORMALIZACAO DE NOME: REGRA DIFERENTE DA TRANSCRICAO DE CODIGO
 * Para exame de Betim/Sete Lagoas/Congonhas, erro do documento fica
 * como esta (ex.: "ERITOGRAMA" de Betim). Para o NOME deste bloco a
 * regra combinada foi outra: corrigir erro obvio de digitacao e
 * padronizar acento/caixa/abreviacao, porque o objetivo aqui e o exame
 * ser ENCONTRAVEL na busca — "GIADA" (erro do DOCX) e "ELTROCARDIOGRAMA"
 * (idem) nao ajudam ninguem a achar nada. Nao ha meio-termo combinado
 * para nomes: ou preserva erro (Betim) ou corrige (Macae) — cada
 * municipio segue a regra que foi decidida para ele.
 *
 * SEM CODIGO. Nenhuma das duas fontes traz codigo de procedimento —
 * `codigo` fica ausente em todo item deste bloco, e a deduplicacao (que
 * aqui nao chega a ser necessaria, a lista do DOCX ja vem sem
 * repeticao) seria por nome normalizado, nunca por codigo inventado.
 *
 * FORA DO ESCOPO, DE PROPOSITO
 *   - Laboratoriais de bancada (hemograma, glicemia, TSH, sorologia):
 *     nenhuma das duas fontes lista isso. Nao criar exame nenhum aqui
 *     "adivinhando" que o municipio deve oferecer os basicos — vira a
 *     segunda fonte de Macae quando a prefeitura mandar.
 *   - Aba "Servicos e Programas" do XLSX (Casa da Crianca, CRA, Nucleo
 *     de Saude Mental, Clinica do Autista, GAN): outro tipo de dado —
 *     encaminhamento para servico/programa, nao pedido de exame. Mesma
 *     categoria que a secao "Consultas Agendadas" ja excluida de Sete
 *     Lagoas.
 *   - Linhas do XLSX que sao pre-requisito ou categoria, nao exame
 *     autonomo: "Exames laboratoriais (geral)", "Exame de sangue (HC +
 *     coagulograma + ureia + creatinina + glicose)", e o "ECG"/"RX de
 *     torax" listados sob Risco Cirurgico. Nenhum vira item da lista.
 *   - Variantes de Angiorressonancia/Angiotomografia/Tomografia por
 *     regiao especifica que so aparecem no XLSX sob nomes genericos
 *     ("Angioressonancia", "Angiotomografia", sem regiao) ou com corte
 *     diferente do DOCX (ex.: "Tomografia computadorizada de coluna
 *     dorsal", "com contraste" como variante separada): a correspondencia
 *     1:1 com um item especifico do DOCX (ex.: qual das 6 variantes de
 *     Angiotomografia de topo do DOCX) nao e inequivoca — forcar um
 *     pareamento aqui seria inventar. Ficam de fora desta leva; quem for
 *     revisar pode decidir caso a caso, com a planilha aberta ao lado.
 *
 * CANAL POR ESPECIALIDADE PODE VARIAR PARA O MESMO EXAME
 * "Ecodoppler de carotidas/vertebrais" aparece em 3 especialidades, e o
 * XLSX so afirma o canal explicitamente para uma delas (SISREG, via
 * Neurologia Adulto) — as outras nao repetem a informacao. Forcar um
 * canal unico para o exame inteiro seria estender uma leitura
 * (Cardiologia = Central Municipal) que o documento nao afirma para
 * este item especificamente. Nestes casos `canalEncaminhamento` fica
 * AUSENTE e a variacao vai para `observacoes`, em vez de adivinhar.
 * ------------------------------------------------------------------ */
function lerMacaeEspecialidades() {
  if (!fs.existsSync(FONTES.macaeEspecialidadesDocx) || !fs.existsSync(FONTES.macaeEspecialidadesXlsx)) {
    return null;
  }

  const exames = [
    { nome: "Audiometria", especialidade: ["Neuro Pediatra", "Otorrinolaringologia"] },
    {
      nome: "Biópsia de próstata guiada por ultrassonografia (pelo cirurgião de urologia)",
      especialidade: ["Urologia"],
      orientacao: orientacao({
        preRequisitos: ["Encaminhamento médico do cirurgião de urologia."],
        restricoes: [
          "Paciente com implante de duplo J: atendimento somente presencial, avaliado pelo serviço de urologia.",
        ],
        observacoes:
          "Indicação de biópsia é encaminhada para atendimento presencial, não por regulação a distância.",
      }),
    },
    { nome: "Cintilografia de miocárdio para avaliação da perfusão em situação de estresse (mínimo 3 projeções)" },
    { nome: "Cintilografia de miocárdio para avaliação da perfusão em situação de repouso (mínimo 3 projeções)" },
    { nome: "Colonoscopia" },
    { nome: "Densitometria óssea duo-energética de coluna (vértebras lombares e/ou fêmur)" },
    {
      nome: "Doppler de MMII arterial e venoso",
      especialidade: ["Angiologia"],
      orientacao: orientacao({
        restricoes: ["Solicitação/indicação exclusiva do especialista da área."],
        observacoes: "Em caso de indicação de cirurgia vascular, encaminhar para atendimento presencial em Cirurgia Vascular.",
      }),
    },
    {
      nome: "Ecocardiograma bidimensional com ou sem Doppler",
      especialidade: ["Cardiologia"],
      orientacao: orientacao({
        canalEncaminhamento: "CENTRAL_MUNICIPAL",
        observacoes: "Pedido médico deve conter justificativa/motivo.",
      }),
    },
    { nome: "Ecocardiograma bidimensional com ou sem Doppler pediátrico" },
    {
      /* O exemplo que motivou o campo `especialidade` como array: as 3
       * especialidades vem confirmadas linha a linha na aba
       * "Especialidades Medicas" do XLSX. */
      nome: "Ecodoppler de carótidas/vertebrais",
      especialidade: ["Cardiologia", "Neurologia Adulto", "Endocrinologia"],
      orientacao: orientacao({
        observacoes:
          "Canal de encaminhamento varia por especialidade solicitante: via Neurologia Adulto, o pedido " +
          "entra pelo SISREG; via Cardiologia, o paciente dá entrada na Central de Regulação do Município. " +
          "A fonte não especifica o canal para o pedido via Endocrinologia.",
      }),
    },
    { nome: "Eletrocardiograma infantil" },
    { nome: "Eletrocardiograma adulto" },
    { nome: "Endoscopia digestiva alta" },
    { nome: "Espirometria" },
    { nome: "Estudo urodinâmico", especialidade: ["Urologia"] },
    { nome: "Angiorressonância magnética de tórax" },
    { nome: "Angiorressonância cerebral – arterial" },
    { nome: "Angiorressonância cerebral – venosa" },
    { nome: "Angiorressonância cerebral" },
    { nome: "Angiorressonância de aorta torácica – venosa" },
    { nome: "Angiotomografia computadorizada de aorta torácica" },
    { nome: "Angiotomografia de crânio" },
    { nome: "Angiotomografia de crânio – venosa" },
    { nome: "Angiotomografia de crânio – arterial" },
    { nome: "Angiotomografia de tórax" },
    { nome: "Angiotomografia de tórax – arterial" },
    { nome: "Angiotomografia de aorta torácica" },
    {
      nome: "Eletroencefalograma sem sedação",
      especialidade: ["Neurologia Adulto"],
      orientacao: orientacao({ canalEncaminhamento: "SISREG" }),
    },
    {
      /* A linha de "Neuro Pediatra" para EEG sem sedacao na planilha nao
       * tem qualificador "infantil" — pareada aqui com a especialidade
       * pediatrica, nao com o nome do exame, que e a mesma base logica
       * usada no DOCX para separar Eletrocardiograma adulto/infantil. */
      nome: "Eletroencefalograma sem sedação infantil",
      especialidade: ["Neuro Pediatra"],
      orientacao: orientacao({ observacoes: "Pedido médico deve conter justificativa/motivo." }),
    },
    {
      nome: "Holter 24 horas",
      especialidade: ["Cardiologia"],
      orientacao: orientacao({ canalEncaminhamento: "CENTRAL_MUNICIPAL" }),
    },
    {
      /* Pegadinha 1/5: exigencia embutida no proprio nome no documento
       * de origem (DOCX) — nao veio do XLSX. */
      nome: "Mamografia (deve conter a ficha do SISCAN preenchida pela unidade de saúde)",
      orientacao: orientacao({
        preRequisitos: ["Ficha do SISCAN preenchida pela unidade de saúde."],
      }),
    },
    {
      nome: "Monitoramento ambulatorial de pressão arterial – MAPA",
      especialidade: ["Cardiologia"],
      orientacao: orientacao({ canalEncaminhamento: "CENTRAL_MUNICIPAL" }),
    },
    { nome: "Ressonância magnética de bacia ou pelve" },
    { nome: "Ressonância de coluna cervical/pescoço" },
    {
      nome: "Ressonância de coluna lombar",
      especialidade: ["Neurologia Adulto"],
      orientacao: orientacao({ canalEncaminhamento: "SISREG" }),
    },
    { nome: "Ressonância de mama" },
    {
      nome: "Ressonância magnética de mastoide ou ouvidos",
      especialidade: ["Otorrinolaringologia"],
    },
    { nome: "Ressonância magnética de órbitas" },
    { nome: "Ressonância de quadril direito ou esquerdo" },
    { nome: "Ressonância de sacro-cóccix" },
    { nome: "Ressonância magnética de sacro-ilíaca" },
    { nome: "Teste da linguinha", especialidade: ["Otorrinolaringologia"] },
    {
      nome: "Teste de esforço ou teste ergométrico",
      especialidade: ["Cardiologia"],
      orientacao: orientacao({ canalEncaminhamento: "CENTRAL_MUNICIPAL" }),
    },
    {
      nome: "Tomografia computadorizada coluna lombar",
      especialidade: ["Neurologia Adulto"],
      orientacao: orientacao({ canalEncaminhamento: "SISREG" }),
    },
    { nome: "Tomografia computadorizada de cóccix" },
    { nome: "Tomografia computadorizada de órbita" },
    { nome: "Tomografia computadorizada de tórax" },
    {
      nome: "Tomografia computadorizada lombo-sacra",
      especialidade: ["Neurologia Adulto"],
      orientacao: orientacao({ canalEncaminhamento: "SISREG" }),
    },
    {
      nome: "Tratamento esclerosante não estético de varizes dos membros inferiores",
      especialidade: ["Angiologia"],
      orientacao: orientacao({
        restricoes: ["Solicitação/indicação exclusiva do especialista da área."],
      }),
    },
    {
      nome: "Ultrassonografia de abdômen total",
      especialidade: ["Endocrinologia"],
      orientacao: orientacao({
        observacoes: "Exame de uso geral — não exclusivo de uma especialidade específica.",
      }),
    },
    { nome: "Ultrassonografia de abdômen inferior" },
    {
      nome: "Ultrassonografia de abdômen superior",
      especialidade: ["Endocrinologia"],
      orientacao: orientacao({
        observacoes: "Exame de uso geral — não exclusivo de uma especialidade específica.",
      }),
    },
    {
      /* Pegadinha 2/5: faixa etaria + pre-requisito condicional embutidos
       * no proprio nome do DOCX. */
      nome: "Ultrassonografia de mama bilateral (pacientes acima de 45 anos devem ter mamografia com menos de 1 ano)",
      orientacao: orientacao({
        faixaEtaria: "Acima de 45 anos",
        preRequisitos: ["Mamografia realizada há menos de 1 ano (exigido apenas para pacientes acima de 45 anos)."],
      }),
    },
    { nome: "Ultrassonografia transvaginal" },
    { nome: "Ultrassonografia de aparelho urinário" },
    { nome: "USG de partes moles" },
    { nome: "USG pélvica" },
    { nome: "USG de próstata via abdominal", especialidade: ["Urologia"] },
    { nome: "USG da tireoide", especialidade: ["Endocrinologia"] },
    { nome: "USG da tireoide com Doppler", especialidade: ["Endocrinologia"] },
    { nome: "Videonasolaringoscopia", especialidade: ["Otorrinolaringologia"] },

    /* --- Itens que existem SO no XLSX, nao no DOCX ------------------
     * "Usar o que tiver" tambem vale ao contrario: um exame real,
     * descrito com clareza numa das fontes, nao fica de fora so porque
     * a OUTRA fonte nao o lista. Nome aqui segue a grafia do XLSX
     * (mesma regra de normalizacao — nao existe uma terceira lista
     * "oficial" para conferir contra). */
    {
      /* Pegadinha 3/5. */
      nome: "Ressonância magnética com sedação",
      especialidade: ["Neurologia Adulto"],
      orientacao: orientacao({
        canalEncaminhamento: "REGULACAO_ESTADUAL",
        observacoes:
          "Encaminhado para o Rio de Janeiro via regulação estadual, mediante justificativa médica — " +
          "dar entrada na Central de Regulação, na porta de vidro. É a única situação em que a Neurologia " +
          "Adulto foge do fluxo geral (SISREG) desta especialidade; o município não realiza os demais " +
          "exames com sedação.",
      }),
    },
    {
      /* Pegadinha 4/5. */
      nome: "Cateterismo",
      especialidade: ["Cardiologia"],
      orientacao: orientacao({
        canalEncaminhamento: "CENTRAL_MUNICIPAL",
        documentos: [
          "RG, CPF e comprovante de residência em nome do paciente (emitido há no máx. 30 dias)",
          "Pedido médico",
        ],
        preRequisitos: [
          "Exames de sangue atualizados (HC, ureia, creatinina, sódio, potássio, glicose)",
          "Laudo de exame cardíaco (ecocardiografia bi-dimensional com/sem doppler ou Holter 24hs) com data de até 180 dias",
        ],
        observacoes: "Fluxo específico, diferente do fluxo geral de Cardiologia.",
      }),
    },
    {
      nome: "Tomografia computadorizada de mastoides ou ouvidos",
      especialidade: ["Neurologia Adulto", "Otorrinolaringologia"],
      orientacao: orientacao({ observacoes: "Pedido médico deve conter justificativa/motivo." }),
    },
    {
      nome: "Tomografia computadorizada de face ou seios da face",
      especialidade: ["Neurologia Adulto", "Otorrinolaringologia"],
      orientacao: orientacao({ observacoes: "Pedido médico deve conter justificativa/motivo." }),
    },
    {
      nome: "USG de bolsa escrotal",
      especialidade: ["Urologia"],
    },
  ];

  return {
    _leia_me:
      "Lista de nomes extraida de 'EXAMES REALIZADOS PELO SUS NO MUNICIPIO DE MACAÉ.docx' (fonte da lista); " +
      "enriquecida com especialidade/canal/documentos a partir de 'Fluxo SUS Macae.xlsx', aba 'Especialidades " +
      "Médicas' (fonte oficial: SEMUSA Macaé). Nomes tiveram grafia/acentuação corrigida em relação ao " +
      "documento original — regra diferente da transcrição de código, aqui o objetivo é o exame ser " +
      "encontrável na busca. A aba 'Serviços e Programas' do XLSX e a aba 'Índice' não entram — não são " +
      "'exames'. Exames laboratoriais de bancada (hemograma, glicemia, TSH, sorologia...) NÃO estão nesta " +
      "lista: nenhuma das duas fontes os lista, e serão a SEGUNDA fonte deste município quando fornecidos " +
      "(mesmo padrão 'um município, duas fontes' já usado em Sete Lagoas).",
    fonte: "Exames por especialidade (SEMUSA Macaé) — DOCX (lista) + XLSX (fluxo e direcionamento)",
    atualizadoEm: "2026-09-09",
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
      /* Exemplo de exame TOTALMENTE decomposto. Fonte original (o que
       * antes vivia inteiro num `nota` de texto livre):
       *   "Não realiza em menores de 18 anos. Solicitar via e-mail
       *    (agendacentralmarcacao2.saude@setelagoas.mg.gov.br) com nome
       *    completo, data de nascimento e contato do paciente, e
       *    resultado de urina rotina atual (até 15 dias) já avaliado
       *    pelo médico da unidade, anexado em PDF. Exame de urina
       *    alterado (infecção) contraindica o procedimento."
       *
       * O e-mail e institucional (sem nome de pessoa) — e o unico jeito
       * de o medico de fato conseguir pedir o exame, entao fica em
       * `observacoes` como dado operacional. Nao ha campo tipado para
       * "canal de solicitacao", e forcar um seria inventar estrutura
       * que a fonte nao pede. */
      orientacao: orientacao({
        faixaEtaria: "Não realiza em menores de 18 anos.",
        preRequisitos: [
          "Resultado de urina rotina atual (até 15 dias), já avaliado pelo médico da unidade, anexado em PDF.",
        ],
        restricoes: ["Exame de urina alterado (infecção) contraindica o procedimento."],
        /* "FICA NA UNIDADE... ANEXAR AGENDAMENTO QUE SERA ENVIADO POR
         * EMAIL A SOLICITACAO MEDICA" — o pedido nao vai fisicamente
         * para a Central, o agendamento e que chega por e-mail. */
        fluxo: "FICA_NA_UNIDADE",
        observacoes:
          "Solicitar via e-mail (agendacentralmarcacao2.saude@setelagoas.mg.gov.br) com nome completo, " +
          "data de nascimento e contato do paciente.",
      }),
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
      /* Exemplo de exame com SO `observacoes`. Fonte: "Informar na
       * observação quando for com Doppler." Nao e idade, preparo,
       * documento, pre-requisito, restricao nem cadastro — e uma
       * instrucao sobre o que ESCREVER no proprio pedido. Fica ambiguo
       * entre `observacoes` e `comoCadastrar`; na duvida, o catch-all
       * generico, nunca um campo especifico forcado. */
      orientacao: orientacao({
        observacoes: "Informar na observação do pedido quando for com Doppler.",
      }),
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

/* ------------------------------------------------------------------
 * SETE LAGOAS — tabela SIGTAP de exames laboratoriais (Apêndice I)
 * ------------------------------------------------------------------
 * SEGUNDA FONTE DO MESMO MUNICIPIO, POR ISSO E UMA FUNCAO SEPARADA
 * As "orientacoes" (lerSeteLagoas, acima) cobrem exame de imagem e
 * procedimento que passa pela Central de Marcacao. Este documento e
 * outro: o contrato de exames LABORATORIAIS (bioquimica, hematologia,
 * sorologia/imunologia, urina, hormonios, toxicologia, microbiologia,
 * outros liquidos, genetica, triagem neonatal, imunohematologia) —
 * coleta de sangue/urina que nao passa por agendamento central. Os dois
 * resultados sao concatenados na MESMA lista de "Sete Lagoas" em
 * main(), porque para o medico e um municipio so.
 *
 * FONTE ESCANEADA (CamScanner), SEM CAMADA DE TEXTO
 * `pdftotext` devolve 0 linhas — e imagem, nao PDF com texto. Testei
 * `tesseract` (OCR) antes de transcrever a mao: a qualidade saiu ruim
 * mesmo a 500dpi (linhas inteiras somem, codigo sai trocado) — pior que
 * a leitura visual direta. Por isso os ~350 itens abaixo foram
 * transcritos lendo cada pagina como imagem, na ordem em que aparecem.
 *
 * SO CODIGO E NOME. O documento nao traz local nem exige nada alem do
 * pedido comum — e exame de bancada, nao procedimento agendado. A
 * coluna de preco ("Valor Unit.") NAO entra: e informacao de contrato
 * entre a prefeitura e o laboratorio, sem uso para o medico que pede o
 * exame — mesmo raciocinio que tirou nome de funcionario da outra
 * fonte.
 *
 * DOIS ERROS DO PROPRIO DOCUMENTO, PRESERVADOS COMO ESTAO
 * A regra de ouro vale para o que a fonte publica, erro incluido — a
 * mesma disciplina do ERITOGRAMA/ERITROGRAMA de Betim:
 *   - o codigo de "PESQUISA DE ANTICORPOS IGG CONTRA ARBOVIRUS" esta
 *     impresso "0020203792", com os digitos fora da ordem que todo o
 *     resto da tabela segue ("0202..."). Conferido em zoom alto (600dpi)
 *     contra as linhas vizinhas, que leem limpo. Nao e erro de leitura
 *     meu — e o que esta impresso. Corrigir para "0202030792" seria
 *     inventar o que a prefeitura quis dizer, nao transcrever o que ela
 *     escreveu;
 *   - a linha de "PESQUISA DE ANTICORPOS IGM CONTRA O VIRUS DA HEPATITE
 *     A" traz o rotulo "(HAV-IGG)" entre parenteses — igual ao da linha
 *     IGG logo acima, quando o esperado seria "(HAV-IGM)". Preservado
 *     como impresso.
 *
 * O LOTE III muda o formato do codigo (9 digitos, sem o zero a
 * esquerda: "202100235" em vez de "0202100235") — e assim que esta
 * impresso nessa parte da tabela, entao e assim que fica aqui.
 * ------------------------------------------------------------------ */
function lerSeteLagoasLaboratorio() {
  /* [codigo, nome], na ordem em que aparecem no documento. */
  const linhas = [
    // --- pág. 13 ---
    ["0202010015", "Clearance Osmolar"],
    ["0202010023", "Determinação de Capacidade de Fixação do Ferro"],
    ["0202010031", "Determinação de Cromatografia de Aminoácidos"],
    ["0202010040", "Determinação de Curva Glicêmica (2 Dosagens)"],
    ["0202010058", "Determinação de Curva Glicêmica c/ Indução por Cortizona (5 Dosagens)"],
    ["0202010066", "Determinação de Curva Glicêmica c/ Indução por Cortisona (4 Dosagens)"],
    ["0202010074", "Determinação de Curva Glicêmica Clássica (5 Dosagens)"],
    ["0202010082", "Determinação de Osmolaridade"],
    ["0202010090", "Dosagem de 5-Nucleotidase"],
    ["0202010104", "Dosagem de Acetona"],
    ["0202010112", "Dosagem de Ácido Ascórbico"],
    ["0202010120", "Dosagem de Ácido Úrico"],
    ["0202010139", "Dosagem de Ácido Vanilmandélico"],
    ["0202010147", "Dosagem de Aldolase"],
    ["0202010155", "Dosagem de Alfa-1-Antitripsina"],
    ["0202010163", "Dosagem de Alfa-1-Glicoproteína Ácida"],
    ["0202010171", "Dosagem de Alfa-2-Macroglobulina"],
    ["0202010180", "Dosagem de Amilase"],
    ["0202010198", "Dosagem de Amônia"],
    ["0202010201", "Dosagem de Bilirrubina Total e Frações"],
    ["0202010210", "Dosagem de Cálcio"],
    ["0202010228", "Dosagem de Cálcio Ionizável"],
    ["0202010236", "Dosagem de Caroteno"],
    ["0202010252", "Dosagem de Ceruloplasmina"],
    ["0202010260", "Dosagem de Cloreto"],
    // --- pág. 14 ---
    ["0202010279", "Dosagem de Colesterol HDL"],
    ["0202010287", "Dosagem de Colesterol LDL"],
    ["0202010295", "Dosagem de Colesterol Total"],
    ["0202010309", "Dosagem de Colinesterase"],
    ["0202010317", "Dosagem de Creatinina"],
    ["0202010325", "Dosagem de Creatinofosfoquinase (CPK)"],
    ["0202010333", "Dosagem de Creatinofosfoquinase Fração MB"],
    ["0202010341", "Dosagem de Desidrogenase Alfa-Hidroxibutírica"],
    ["0202010350", "Dosagem de Desidrogenase Glutâmica"],
    ["0202010368", "Dosagem de Desidrogenase Lática"],
    ["0202010376", "Dosagem de Desidrogenase Lática (Isoenzimas Fracionadas)"],
    ["0202010384", "Dosagem de Ferritina"],
    ["0202010392", "Dosagem de Ferro Sérico"],
    ["0202010406", "Dosagem de Folato"],
    ["0202010414", "Dosagem de Fosfatase Ácida Total"],
    ["0202010422", "Dosagem de Fosfatase Alcalina"],
    ["0202010430", "Dosagem de Fósforo"],
    ["0202010449", "Dosagem de Fração Prostática da Fosfatase Ácida"],
    ["0202010457", "Dosagem de Galactose"],
    ["0202010465", "Dosagem de Gama-Glutamil-Transferase (Gama GT)"],
    ["0202010473", "Dosagem de Glicose"],
    ["0202010481", "Dosagem de Glicose-6-Fosfato Desidrogenase"],
    ["0202010490", "Dosagem de Haptoglobina"],
    ["0202010503", "Dosagem de Hemoglobina Glicosilada"],
    ["0202010511", "Dosagem de Hidroxiprolina"],
    ["0202010520", "Dosagem de Isomerase-Fosfohexose"],
    ["0202010538", "Dosagem de Lactato"],
    ["0202010546", "Dosagem de Leucino-Aminopeptidase"],
    ["0202010554", "Dosagem de Lipase"],
    ["0202010562", "Dosagem de Magnésio"],
    ["0202010570", "Dosagem de Muco-Proteínas"],
    ["0202010589", "Dosagem de Piruvato"],
    ["0202010597", "Dosagem de Porfirinas"],
    ["0202010600", "Dosagem de Potássio"],
    ["0202010619", "Dosagem de Proteínas Totais"],
    ["0202010627", "Dosagem de Proteínas Totais e Frações"],
    ["0202010635", "Dosagem de Sódio"],
    ["0202010643", "Dosagem de Transaminase Glutâmico-Oxalacética (TGO)"],
    ["0202010651", "Dosagem de Transaminase Glutâmico-Pirúvica (TGP)"],
    // --- pág. 15 ---
    ["0202010660", "Dosagem de Transferrina"],
    ["0202010678", "Dosagem de Triglicerídeos"],
    ["0202010686", "Dosagem de Triptofano"],
    ["0202010694", "Dosagem de Ureia"],
    ["0202010708", "Dosagem de Vitamina B12"],
    ["0202010716", "Eletroforese de Lipoproteínas"],
    ["0202010724", "Eletroforese de Proteínas"],
    ["0202010732", "Gasometria (PH PCO2 PO2 Bicarbonato AS2 (Exceto Base))"],
    ["0202010740", "Prova da D-Xilose"],
    ["0202010759", "Teste de Tolerância à Insulina / Hipoglicemiantes Orais"],
    ["0202010767", "Dosagem de 25 Hidroxivitamina D"],
    ["0202010775", "Determinação de Crematócrito no Leite Humano Ordenhado"],
    ["0202010783", "Acidez Titulável no Leite Humano (Dornic)"],
    ["0202010791", "Dosagem de Peptídeos Natriuréticos Tipo B (BNP e NT-proBNP)"],
    ["0202020010", "Citoquímica Hematológica"],
    ["0202020029", "Contagem de Plaquetas"],
    ["0202020037", "Contagem de Reticulócitos"],
    ["0202020045", "Determinação de Curva de Resistência Globular"],
    ["0202020053", "Determinação de Enzimas Eritrocitárias (cada)"],
    ["0202020061", "Determinação de Sulfo-Hemoglobina"],
    ["0202020070", "Determinação de Tempo de Coagulação"],
    ["0202020088", "Determinação de Tempo de Lise da Euglobulina"],
    ["0202020096", "Determinação de Tempo de Sangramento - Duke"],
    ["0202020100", "Determinação de Tempo de Sangramento de Ivy"],
    ["0202020118", "Determinação de Tempo de Sobrevida de Hemácias"],
    ["0202020126", "Determinação de Tempo de Trombina"],
    ["0202020134", "Determinação de Tempo de Tromboplastina Parcial Ativada (TTP Ativada)"],
    ["0202020142", "Determinação de Tempo e Atividade da Protrombina (TAP)"],
    ["0202020150", "Determinação de Velocidade de Hemossedimentação (VHS)"],
    ["0202020169", "Dosagem de Anticoagulante Circulante"],
    ["0202020177", "Dosagem de Antitrombina III"],
    ["0202020185", "Dosagem de Fator II"],
    ["0202020193", "Dosagem de Fator IX"],
    ["0202020207", "Dosagem de Fator V"],
    ["0202020215", "Dosagem de Fator VII"],
    ["0202020223", "Dosagem de Fator VIII"],
    ["0202020231", "Dosagem de Fator VIII (Inibidor)"],
    ["0202020240", "Dosagem de Fator Von Willebrand (Antígeno)"],
    // --- pág. 16 ---
    ["0202020258", "Dosagem de Fator X"],
    ["0202020266", "Dosagem de Fator XI"],
    ["0202020274", "Dosagem de Fator XII"],
    ["0202020282", "Dosagem de Fator XIII"],
    ["0202020290", "Dosagem de Fibrinogênio"],
    ["0202020304", "Dosagem de Hemoglobina"],
    ["0202020312", "Dosagem de Hemoglobina - Instabilidade a 37°C"],
    ["0202020320", "Dosagem de Hemoglobina Fetal"],
    ["0202020339", "Dosagem de Hemossiderina"],
    ["0202020347", "Dosagem de Plasminogênio"],
    ["0202020355", "Eletroforese de Hemoglobina"],
    ["0202020363", "Eritrograma (Eritrócitos, Hemoglobina, Hematócrito)"],
    ["0202020371", "Hematócrito"],
    ["0202020380", "Hemograma Completo"],
    ["0202020398", "Leucograma"],
    ["0202020401", "Pesquisa de Atividade do Cofator de Ristocetina"],
    ["0202020410", "Pesquisa de Células LE"],
    ["0202020428", "Pesquisa de Corpúsculos de Heinz"],
    ["0202020436", "Pesquisa de Filária"],
    ["0202020444", "Pesquisa de Hemoglobina S"],
    ["0202020460", "Pesquisa de Tripanossoma"],
    ["0202020487", "Prova de Consumo de Protrombina"],
    ["0202020495", "Prova de Retração do Coágulo"],
    ["0202020509", "Prova do Laço"],
    ["0202020517", "Rastreio p/ Deficiência de Enzimas Eritrocitárias"],
    ["0202020525", "Teste de Agregação de Plaquetas"],
    ["0202020533", "Teste de Ham (Hemólise Ácida)"],
    ["0202020541", "Teste Direto de Antiglobulina Humana (TAD)"],
    ["0202020550", "Dosagem de Proteína C Funcional"],
    ["0202020576", "Pesquisa de Anticoagulante Lúpico"],
    ["0202020568", "Dosagem de Proteína S Funcional"],
    ["0202030016", "Contagem de Linfócitos B"],
    ["0202030024", "Contagem de Linfócitos CD4/CD8"],
    ["0202030032", "Contagem de Linfócitos T Totais"],
    ["0202030040", "Detecção de Ácidos Nucleicos do HIV-1 (Qualitativo)"],
    ["0202030059", "Detecção de RNA do Vírus da Hepatite C (Qualitativo)"],
    ["0202030067", "Determinação de Complemento (CH50)"],
    ["0202030075", "Determinação de Fator Reumatoide"],
    ["0202030083", "Determinação Quantitativa de Proteína C Reativa"],
    // --- pág. 17 ---
    ["0202030091", "Dosagem de Alfa-Fetoproteína"],
    ["0202030105", "Dosagem de Antígeno Prostático Específico (PSA)"],
    ["0202030113", "Dosagem de Beta-2-Microglobulina"],
    ["0202030121", "Dosagem de Complemento C3"],
    ["0202030130", "Dosagem de Complemento C4"],
    ["0202030148", "Dosagem de Crioaglutinina"],
    ["0202030156", "Dosagem de Imunoglobulina A (IgA)"],
    ["0202030164", "Dosagem de Imunoglobulina E (IgE)"],
    ["0202030180", "Dosagem de Imunoglobulina M (IgM)"],
    ["0202030199", "Dosagem de Inibidor de C1-Esterase"],
    ["0202030202", "Dosagem de Proteína C Reativa"],
    ["0202030210", "Genotipagem de Vírus da Hepatite C"],
    ["0202030229", "Imunoeletroforese de Proteínas"],
    ["0202030237", "Imunofenotipagem de Hemopatias Malignas (por marcador)"],
    ["0202030253", "Pesquisa de Anticorpo IgG Anticardiolipina"],
    ["0202030261", "Pesquisa de Anticorpo IgM Anticardiolipina"],
    ["0202030270", "Pesquisa de Anticorpos Anti-DNA"],
    ["0202030288", "Pesquisa de Anticorpos Anti-Heliobacter Pylori"],
    ["0202030296", "Pesquisa de Anticorpos Anti-HIV-1 (Western Blot)"],
    ["0202030300", "Pesquisa de Anticorpos Anti-HIV-1 + HIV-2 (Elisa)"],
    ["0202030318", "Pesquisa de Anticorpos Anti-HTLV-1 + HTLV-2"],
    ["0202030326", "Pesquisa de Anticorpos Anti-Ribonucleoproteína (RNP)"],
    ["0202030334", "Pesquisa de Anticorpos Anti-Schistosomas"],
    ["0202030342", "Pesquisa de Anticorpos Anti-SM"],
    ["0202030350", "Pesquisa de Anticorpos Anti-SS-A (RO)"],
    ["0202030369", "Pesquisa de Anticorpos Anti-SS-B (LA)"],
    ["0202030377", "Pesquisa de Anticorpos Antiadenovirus"],
    ["0202030385", "Pesquisa de Anticorpos Antiamebas"],
    ["0202030393", "Pesquisa de Anticorpos Antiaspergillus"],
    ["0202030407", "Pesquisa de Anticorpos Antibrucelas"],
    ["0202030415", "Pesquisa de Anticorpos Anticisticerco"],
    ["0202030423", "Pesquisa de Anticorpos Anticlamídia (por Imunofluorescência)"],
    ["0202030431", "Pesquisa de Anticorpos Anticortex Suprarenal"],
    ["0202030440", "Pesquisa de Anticorpos Antiequinococos"],
    ["0202030458", "Pesquisa de Anticorpos Antiescleroderma (SCL 70)"],
    ["0202030466", "Pesquisa de Anticorpos Antiespermatozoides"],
    ["0202030474", "Pesquisa de Anticorpos Antiestreptolisina O (ASLO)"],
    ["0202030482", "Pesquisa de Anticorpos Antifígado"],
    // --- pág. 18 ---
    ["0202030504", "Pesquisa de Anticorpos Antiglomérulo"],
    ["0202030512", "Pesquisa de Anticorpos Antilhota de Langerhans"],
    ["0202030520", "Pesquisa de Anticorpos Antiinsulina"],
    ["0202030539", "Pesquisa de Anticorpos Antileptospiras"],
    ["0202030547", "Pesquisa de Anticorpos Antilisteria"],
    ["0202030555", "Pesquisa de Anticorpos Antimicrossomas"],
    ["0202030563", "Pesquisa de Anticorpos Antimitocôndria"],
    ["0202030571", "Pesquisa de Anticorpos Antimúsculo Estriado"],
    ["0202030580", "Pesquisa de Anticorpos Antimúsculo Liso"],
    ["0202030598", "Pesquisa de Anticorpos Antinúcleo"],
    ["0202030601", "Pesquisa de Anticorpos Antiparietais"],
    ["0202030610", "Pesquisa de Anticorpos Antiplasmódios"],
    ["0202030628", "Pesquisa de Anticorpos Antitireoglobulina"],
    ["0202030636", "Pesquisa de Anticorpos contra Antígeno de Superfície do Vírus da Hepatite B (Anti HBS)"],
    ["0202030644", "Pesquisa de Anticorpos contra Antígeno E do Vírus da Hepatite B (Anti HBE)"],
    ["0202030652", "Pesquisa de Anticorpos contra Histoplasma"],
    ["0202030660", "Pesquisa de Anticorpos contra o Sporotrix Schenkii"],
    ["0202030679", "Pesquisa de Anticorpos contra o Vírus da Hepatite C (Anti HCV)"],
    ["0202030687", "Pesquisa de Anticorpos contra o Vírus da Hepatite D (Anti HDV)"],
    ["0202030695", "Pesquisa de Anticorpos contra o Vírus do Sarampo"],
    ["0202030709", "Pesquisa de Anticorpos contra Paracoccidioides Brasiliensis"],
    ["0202030717", "Pesquisa de Anticorpos e/ou Antígeno do Vírus Sincicial Respiratório"],
    ["0202030725", "Pesquisa de Anticorpos EIE Anticlamídia"],
    ["0202030733", "Pesquisa de Anticorpos Heterófilos contra o Vírus Epstein-Barr"],
    ["0202030741", "Pesquisa de Anticorpos IgG Anticitomegalovirus"],
    ["0202030750", "Pesquisa de Anticorpos IgG Antileishmanias"],
    ["0202030768", "Pesquisa de Anticorpos IgG Antitoxoplasma"],
    ["0202030776", "Pesquisa de Anticorpos IgG Antitrypanosoma Cruzi"],
    ["0202030784", "Pesquisa de Anticorpos IgG contra Antígeno Central do Vírus da Hepatite B (Anti-HBC-IgG)"],
    /* Codigo impresso fora de ordem — ver o cabecalho desta funcao. */
    ["0020203792", "Pesquisa de Anticorpos IgG contra Arbovirus"],
    ["0202030806", "Pesquisa de Anticorpos IgG contra o Vírus da Hepatite A (HAV-IgG)"],
    ["0202030814", "Pesquisa de Anticorpos IgG contra o Vírus da Rubéola"],
    ["0202030822", "Pesquisa de Anticorpos IgG contra o Vírus da Varicela-Herpes Zoster"],
    ["0202030830", "Pesquisa de Anticorpos IgG contra o Vírus Epstein-Barr"],
    ["0202030849", "Pesquisa de Anticorpos IgG contra o Vírus Herpes Simples"],
    // --- pág. 19 ---
    ["0202030857", "Pesquisa de Anticorpos IgM Anticitomegalovirus"],
    ["0202030865", "Pesquisa de Anticorpos IgM Antileishmanias"],
    ["0202030873", "Pesquisa de Anticorpos IgM Antitoxoplasma"],
    ["0202030881", "Pesquisa de Anticorpos IgM Antitrypanosoma Cruzi"],
    ["0202030890", "Pesquisa de Anticorpos IgM contra Antígeno Central do Vírus da Hepatite B (Anti-HBC-IgM)"],
    ["0202030903", "Pesquisa de Anticorpos IgM contra Arbovirus"],
    /* O rotulo "(HAV-IgG)" esta impresso tambem nesta linha IgM — ver o
     * cabecalho desta funcao. */
    ["0202030911", "Pesquisa de Anticorpos IgM contra o Vírus da Hepatite A (HAV-IgG)"],
    ["0202030920", "Pesquisa de Anticorpos IgM contra o Vírus da Rubéola"],
    ["0202030938", "Pesquisa de Anticorpos IgM contra o Vírus da Varicela-Herpes Zoster"],
    ["0202030946", "Pesquisa de Anticorpos IgM contra o Vírus Epstein-Barr"],
    ["0202030954", "Pesquisa de Anticorpos IgM contra o Vírus Herpes Simples"],
    ["0202030962", "Pesquisa de Antígeno Carcinoembrionário (CEA)"],
    ["0202030970", "Pesquisa de Antígeno de Superfície do Vírus da Hepatite B (HBsAg)"],
    ["0202030989", "Pesquisa de Antígeno E do Vírus da Hepatite B (HBeAg)"],
    ["0202030997", "Pesquisa de Clamídia (por Captura Híbrida)"],
    ["0202031004", "Pesquisa de Crioglobulinas"],
    ["0202031012", "Pesquisa de Fator Reumatoide (Waaler-Rose)"],
    ["0202031020", "Pesquisa de HIV-1 por Imunofluorescência"],
    ["0202031039", "Pesquisa de Imunoglobulina E (IgE) Alergeno-Específica"],
    ["0202031047", "Pesquisa de Trypanosoma Cruzi (por Imunofluorescência)"],
    ["0202031055", "Provas de Prausnitz-Kustner (PK)"],
    ["0202031063", "Provas Imuno-Alérgicas Bacterianas"],
    ["0202031071", "Quantificação de RNA do HIV-1"],
    ["0202031080", "Quantificação de RNA do Vírus da Hepatite C"],
    ["0202031098", "Reação de Hemaglutinação (TPHA) p/ Diagnóstico da Sífilis"],
    ["0202031101", "Reação de Montenegro ID"],
    ["0202031110", "Teste de VDRL p/ Detecção de Sífilis"],
    ["0202031128", "Teste FTA-ABS IgG p/ Diagnóstico da Sífilis"],
    ["0202031136", "Teste FTA-ABS IgM p/ Diagnóstico da Sífilis"],
    ["0202031144", "Testes Alérgicos de Contato"],
    ["0202031152", "Testes Cutâneos de Leitura Imediata"],
    ["0202031179", "VDRL p/ Detecção de Sífilis em Gestante"],
    ["0202031187", "Dosagem de Anticorpos Antitransglutaminase Recombinante Humano IgA"],
    ["0202031195", "Dosagem da Fração C1q do Complemento"],
    ["0202031209", "Dosagem de Troponina"],
    // --- pág. 20 ---
    ["0202031217", "Dosagem do Antígeno CA 125"],
    ["0202031225", "Exame Laboratorial para Doença de Gaucher I"],
    ["0202031233", "Exame Laboratorial para Doença de Gaucher II"],
    ["0202031250", "Detecção de RNA do HTLV-1"],
    ["0202031268", "Pesquisa de Anticorpos Anti-HTLV-1 (Western-Blot)"],
    ["0202031276", "Dosagem de Adenosina-Desaminase (ADA)"],
    ["0202031284", "Antibeta 2 Glicoproteína I IgG"],
    ["0202031292", "Dosagem de Anti-Beta-2-Glicoproteína I IgM"],
    ["0202031306", "Diagnóstico e Reavaliação de Hemoglobinúria Paroxística Noturna"],
    ["0202031314", "Dosagem de Anticorpo Anti-AChR"],
    ["0202040011", "Dosagem de Estercobilinogênio Fecal"],
    ["0202040020", "Dosagem de Gordura Fecal"],
    ["0202040038", "Exame Coprológico Funcional"],
    ["0202040046", "Identificação de Fragmentos de Helmintos"],
    ["0202040054", "Pesquisa de Enterobius Vermiculares (Oxiurus Oxiura)"],
    ["0202040062", "Pesquisa de Eosinófilos"],
    ["0202040070", "Pesquisa de Gordura Fecal"],
    ["0202040089", "Pesquisa de Larvas nas Fezes EPF"],
    ["0202040097", "Pesquisa de Leucócitos nas Fezes"],
    ["0202040100", "Pesquisa de Leveduras nas Fezes"],
    ["0202040119", "Pesquisa de Ovos de Schistosomas (em Fragmento de Mucosa)"],
    ["0202040127", "Pesquisa de Ovos e Cistos de Parasitas"],
    ["0202040135", "Pesquisa de Rotavírus nas Fezes"],
    ["0202040143", "Pesquisa de Sangue Oculto nas Fezes"],
    ["0202040151", "Pesquisa de Substâncias Redutoras nas Fezes"],
    ["0202040160", "Pesquisa de Tripsina nas Fezes"],
    ["0202040178", "Pesquisa de Trofozoítas nas Fezes"],
    ["0202050017", "Análise de Caracteres Físicos, Elementos e Sedimento da Urina"],
    ["0202050025", "Clearance de Creatinina"],
    ["0202050033", "Clearance de Fosfato"],
    ["0202050041", "Clearance de Ureia"],
    ["0202050050", "Contagem de Addis"],
    ["0202050068", "Determinação de Osmolalidade"],
    ["0202050076", "Dosagem de Açúcares (por Cromatografia)"],
    ["0202050084", "Dosagem de Citrato"],
    ["0202050092", "Dosagem de Microalbumina na Urina"],
    ["0202050106", "Dosagem de Oxalato"],
    // --- pág. 21 ---
    ["0202050114", "Dosagem de Proteínas (Urina de 24 horas)"],
    ["0202050122", "Dosagem e/ou Fracionamento de Ácidos Orgânicos"],
    ["0202050130", "Exame Qualitativo de Cálculos Urinários"],
    ["0202050149", "Pesquisa/Dosagem de Aminoácidos (por Cromatografia)"],
    ["0202050157", "Pesquisa de Alcaptona na Urina"],
    ["0202050165", "Pesquisa de Aminoácidos na Urina"],
    ["0202050173", "Pesquisa de Beta-Mercapto-Lactato-Dissulfidúria"],
    ["0202050181", "Pesquisa de Cadeias Leves Kappa e Lambda"],
    ["0202050190", "Pesquisa de Cistina na Urina"],
    ["0202050203", "Pesquisa de Coproporfirina na Urina"],
    ["0202050211", "Pesquisa de Erros Inatos do Metabolismo na Urina"],
    ["0202050220", "Pesquisa de Fenil-Cetona na Urina"],
    ["0202050238", "Pesquisa de Frutose na Urina"],
    ["0202050246", "Pesquisa de Galactose na Urina"],
    ["0202050262", "Pesquisa de Homocistina na Urina"],
    ["0202050270", "Pesquisa de Lactose na Urina"],
    ["0202050289", "Pesquisa de Mucopolissacarídeos na Urina"],
    ["0202050297", "Pesquisa de Porfobilinogênio na Urina"],
    ["0202050300", "Pesquisa de Proteínas Urinárias (por Eletroforese)"],
    ["0202050319", "Pesquisa de Tirosina na Urina"],
    ["0202050327", "Prova de Diluição (Urina)"],
    ["0202060012", "Determinação de Índice de Tiroxina Livre"],
    ["0202060020", "Determinação de Retenção de T3"],
    ["0202060039", "Determinação de T3 Reverso"],
    ["0202060047", "Dosagem de 17-Alfa-Hidroxiprogesterona"],
    ["0202060055", "Dosagem de 17-Cetosteroides Totais"],
    ["0202060063", "Dosagem de 17-Hidroxicorticosteroides"],
    ["0202060071", "Dosagem de Ácido 5-Hidroxi-Indol-Acético (Serotonina)"],
    ["0202060080", "Dosagem de Adrenocorticotrófico (ACTH)"],
    ["0202060098", "Dosagem de Aldosterona"],
    ["0202060101", "Dosagem de AMP Cíclico"],
    ["0202060110", "Dosagem de Androstenediona"],
    ["0202060128", "Dosagem de Calcitonina"],
    ["0202060136", "Dosagem de Cortisol"],
    ["0202060144", "Dosagem de Dehidroepiandrosterona (DHEA)"],
    ["0202060152", "Dosagem de Dihidrotestosterona (DHT)"],
    ["0202060160", "Dosagem de Estradiol"],
    ["0202060179", "Dosagem de Estriol"],
    ["0202060187", "Dosagem de Estrona"],
    // --- pág. 22 ---
    ["0202060195", "Dosagem de Gastrina"],
    ["0202060209", "Dosagem de Globulina Transportadora de Tiroxina"],
    ["0202060217", "Dosagem de Gonadotrofina Coriônica Humana (HCG, Beta HCG)"],
    ["0202060225", "Dosagem de Hormônio de Crescimento (HGH)"],
    ["0202060233", "Dosagem de Hormônio Folículo-Estimulante (FSH)"],
    ["0202060241", "Dosagem de Hormônio Luteinizante (LH)"],
    ["0202060250", "Dosagem de Hormônio Tireoestimulante (TSH)"],
    ["0202060268", "Dosagem de Insulina"],
    ["0202060276", "Dosagem de Paratormônio"],
    ["0202060284", "Dosagem de Peptídeo C"],
    ["0202060292", "Dosagem de Progesterona"],
    ["0202060306", "Dosagem de Prolactina"],
    ["0202060314", "Dosagem de Renina"],
    ["0202060322", "Dosagem de Somatomedina C (IGF1)"],
    ["0202060330", "Dosagem de Sulfato de Hidroepiandrosterona (DHEAS)"],
    ["0202060349", "Dosagem de Testosterona"],
    ["0202060357", "Dosagem de Testosterona Livre"],
    ["0202060365", "Dosagem de Tireoglobulina"],
    ["0202060373", "Dosagem de Tiroxina (T4)"],
    ["0202060381", "Dosagem de Tiroxina Livre (T4 Livre)"],
    ["0202060390", "Dosagem de Triiodotironina (T3)"],
    ["0202060403", "Teste de Estímulo da Prolactina/TSH após TRH"],
    ["0202060411", "Teste de Estímulo da Prolactina após Clopromazina"],
    ["0202060420", "Teste de Estímulo com GnRH ou com Agonista GnRH"],
    ["0202060438", "Teste de Estímulo do HGH após Glucagon"],
    ["0202060446", "Teste de Supressão do Cortisol após Dexametasona"],
    ["0202060454", "Teste de Supressão do HGH após Glicose"],
    ["0202060462", "Teste p/ Investigação do Diabetes Insipidus"],
    ["0202060470", "Pesquisa de Macroprolactina"],
    ["0202070018", "Dosagem de Ácido Delta-Aminolevulínico"],
    ["0202070026", "Dosagem de Ácido Hipúrico"],
    // --- pág. 23 ---
    ["0202070034", "Dosagem de Ácido Mandélico"],
    ["0202070042", "Dosagem de Ácido Metil-Hipúrico"],
    ["0202070050", "Dosagem de Ácido Valproico"],
    ["0202070069", "Dosagem de ALA-Desidratase"],
    ["0202070077", "Dosagem de Álcool Etílico"],
    ["0202070085", "Dosagem de Alumínio"],
    ["0202070093", "Dosagem de Aminoglicosídeos"],
    ["0202070107", "Dosagem de Anfetaminas"],
    ["0202070115", "Dosagem de Antidepressivos Tricíclicos"],
    ["0202070123", "Dosagem de Barbitúricos"],
    ["0202070131", "Dosagem de Benzodiazepínicos"],
    ["0202070140", "Dosagem de Cádmio"],
    ["0202070158", "Dosagem de Carbamazepina"],
    ["0202070166", "Dosagem de Carboxi-Hemoglobina"],
    ["0202070174", "Dosagem de Chumbo"],
    ["0202070182", "Dosagem de Ciclosporina"],
    ["0202070190", "Dosagem de Cobre"],
    ["0202070204", "Dosagem de Digitálicos (Digoxina, Digitoxina)"],
    ["0202070212", "Dosagem de Etossuximida"],
    ["0202070220", "Dosagem de Fenitoína"],
    ["0202070239", "Dosagem de Fenol"],
    ["0202070247", "Dosagem de Formaldeído"],
    ["0202070255", "Dosagem de Lítio"],
    ["0202070263", "Dosagem de Mercúrio"],
    ["0202070271", "Dosagem de Meta-Hemoglobina"],
    ["0202070280", "Dosagem de Metabólitos da Cocaína"],
    ["0202070298", "Dosagem de Metotrexato"],
    ["0202070301", "Dosagem de Quinidina"],
    ["0202070310", "Dosagem de Salicilatos"],
    ["0202070328", "Dosagem de Sulfatos"],
    ["0202070336", "Dosagem de Teofilina"],
    ["0202070344", "Dosagem de Tiocianato"],
    ["0202070352", "Dosagem de Zinco"],
    ["0202080013", "Antibiograma"],
    ["0202080021", "Antibiograma c/ Concentração Inibitória Mínima"],
    ["0202080030", "Antibiograma p/ Micobactérias"],
    ["0202080048", "Baciloscopia Direta p/ BAAR Tuberculose (Diagnóstica)"],
    ["0202080056", "Baciloscopia Direta p/ BAAR (Hanseníase)"],
    ["0202080064", "Baciloscopia Direta p/ BAAR Tuberculose (Controle)"],
    // --- pág. 24 ---
    ["0202080072", "Bacteroscopia (Gram)"],
    ["0202080080", "Cultura de Bactérias p/ Identificação"],
    ["0202080099", "Cultura do Leite Humano (pós-pasteurização)"],
    ["0202080102", "Cultura p/ Herpesvírus"],
    ["0202080110", "Cultura para BAAR"],
    ["0202080129", "Cultura para Bactérias Anaeróbicas"],
    ["0202080137", "Cultura para Identificação de Fungos"],
    ["0202080145", "Exame Microbiológico a Fresco (Direto)"],
    ["0202080153", "Hemocultura"],
    ["0202080161", "Identificação Automatizada de Microorganismos"],
    ["0202080170", "Pesquisa de Pneumocystis Carinii"],
    ["0202080188", "Pesquisa de Bacilo Diftérico"],
    ["0202080196", "Pesquisa de Estreptococos Beta-Hemolíticos do Grupo A"],
    ["0202080200", "Pesquisa de Haemophilus Ducrey"],
    ["0202080218", "Pesquisa de Helicobacter Pylori"],
    ["0202080226", "Pesquisa de Leptospiras"],
    ["0202080234", "Pesquisa de Treponema Pallidum"],
    ["0202080242", "Prova Confirmatória da Presença de Micro-organismos Coliformes"],
    ["0202090019", "Ácido Úrico Líquido no Sinovial e Derrames"],
    ["0202090027", "Adenograma"],
    ["0202090035", "Citologia p/ Clamídia"],
    ["0202090043", "Citologia p/ Herpesvírus"],
    ["0202090051", "Contagem Específica de Células no Líquor"],
    ["0202090060", "Contagem Global de Células no Líquor"],
    ["0202090078", "Determinação de Fosfolipídeos Relação Lecitina-Esfingomielina no Líquido Amniótico"],
    ["0202090086", "Dosagem de Creatinina no Líquido Amniótico"],
    ["0202090094", "Dosagem de Fosfatase Alcalina no Esperma"],
    ["0202090108", "Dosagem de Frutose"],
    ["0202090116", "Dosagem de Frutose no Esperma"],
    ["0202090124", "Dosagem de Glicose no Líquido Sinovial e Derrames"],
    ["0202090132", "Dosagem de Proteínas no Líquido Sinovial e Derrames"],
    ["0202090159", "Eletroforese de Proteínas c/ Concentração no Líquor"],
    ["0202090167", "Espectrofotometria no Líquido Amniótico"],
    ["0202090175", "Esplenograma"],
    ["0202090183", "Exame de Caracteres Físicos, Contagem Global e Específica de Células"],
    ["0202090191", "Mielograma"],
    ["0202090213", "Pesquisa de Anticorpos Antiespermatozoides (Elisa)"],
    ["0202090221", "Dosagem de Fosfatase Ácida no Esperma"],
    // --- pág. 25 ---
    ["0202090230", "Pesquisa de Caracteres Físicos no Líquor"],
    ["0202090248", "Pesquisa de Células Orangiófilas"],
    ["0202090256", "Pesquisa de Cristais c/ Luz Polarizada"],
    ["0202090264", "Pesquisa de Espermatozoides (após Vasectomia)"],
    ["0202090272", "Pesquisa de Ragócitos no Líquido Sinovial e Derrames"],
    ["0202090280", "Prova de Progressão Espermática (cada)"],
    ["0202090299", "Prova do Látex p/ Haemophilus Influenzae, Streptococcus Pneumoniae, Neisseria Meningitidis (Sorotipos A, B, C)"],
    ["0202090302", "Prova do Látex p/ Pesquisa do Fator Reumatoide"],
    ["0202090310", "Reação de Pandy"],
    ["0202090329", "Reação de Rivalta no Líquido Sinovial e Derrames"],
    ["0202090337", "Teste de Clements"],
    ["0202090345", "Teste de Gastroacidograma - Secreção Basal por 60min em 4 Amostras"],
    ["0202090353", "Teste de Hollander no Suco Gástrico"],
    /* LOTE III muda o formato do codigo — 9 digitos, sem zero a
     * esquerda. Preservado como impresso. */
    ["202100235", "Pesquisa de Mutação do Gene da Protrombina"],
    ["202110087", "Dosagem de TSH e T4 Livre (Controle / Diagnóstico Tardio)"],
    ["202120023", "Determinação Direta e Reversa de Grupo ABO"],
    ["202120031", "Fenotipagem de Sistema RH - HR"],
    ["202120058", "Pesquisa de Anticorpos Irregulares pelo Método da Eluição"],
    ["202120066", "Pesquisa de Anticorpos Séricos Irregulares 37°C"],
    ["202120074", "Pesquisa de Anticorpos Séricos Irregulares a Frio"],
    ["202120082", "Pesquisa de Fator RH (inclui D Fraco)"],
    ["202120090", "Teste Indireto de Antiglobulina Humana (TIA)"],
    ["202120104", "Titulação de Anticorpos Anti A e/ou Anti B"],
  ];

  const exames = linhas.map(([codigo, nome]) => ({ nome, codigo }));

  return {
    _leia_me:
      "Transcrito de 'PREFEITURA MUNICIPAL DE SETE LAGOAS — APÊNDICE I, Lotes I a III — Procedimentos da " +
      "tabela SIGTAP' (contrato de exames laboratoriais, documento escaneado sem camada de texto — pdftotext " +
      "devolve 0 linhas, e o OCR testado saiu pior que a leitura visual). Só código e nome; a coluna de preço " +
      "(\"Valor Unit.\") não entra — é dado de contrato entre a prefeitura e o laboratório, sem uso para o " +
      "médico que pede o exame.",
    fonte: "Tabela SIGTAP de exames laboratoriais (Apêndice I) — SL",
    /* Data do arquivo escaneado (nome original: 'CamScanner
     * 28-05-2026'), nao necessariamente a data de assinatura do
     * contrato — e a evidencia mais concreta disponivel sobre quando
     * esta lista foi capturada. */
    atualizadoEm: "2026-05-28",
    exames,
  };
}

/* ------------------------------------------------------------------
 * JUNTAR DUAS FONTES DO MESMO MUNICIPIO
 * ------------------------------------------------------------------
 * Sete Lagoas e o primeiro caso de municipio com mais de um documento.
 * Para o medico e uma lista so — ele nao quer saber que "orientacoes"
 * e "tabela SIGTAP" sao arquivos diferentes, quer ver o que aquele
 * municipio oferece. Esta funcao junta os `exames` num array so,
 * concatena a `fonte` de cada bloco (para a procedencia continuar
 * rastreavel na tela) e fica com a data MAIS RECENTE entre as fontes —
 * e a resposta honesta para "desde quando esta lista esta valendo".
 * ------------------------------------------------------------------ */
function juntarFontesDoMesmoMunicipio(blocos) {
  const validos = blocos.filter(Boolean);
  if (!validos.length) return null;
  if (validos.length === 1) return validos[0];

  /* Codigo repetido entre as duas fontes seria o mesmo tipo de erro que
   * a duplicata de Betim: duas linhas para o mesmo exame, uma delas
   * supérflua. Quando nenhuma das fontes tem codigo (caso de Macae), a
   * mesma checagem e feita por NOME normalizado — e o que a regra de
   * deduplicacao daquele municipio pede. */
  const codigosVistos = new Map();
  const nomesVistos = new Map();
  const exames = [];
  let colisoes = 0;
  validos.forEach((b) => {
    b.exames.forEach((e) => {
      if (e.codigo) {
        if (codigosVistos.has(e.codigo)) {
          colisoes++;
          console.warn(
            "  ! codigo " + e.codigo + " repetido entre fontes: \"" +
            codigosVistos.get(e.codigo) + "\" e \"" + e.nome + "\""
          );
        } else {
          codigosVistos.set(e.codigo, e.nome);
        }
      } else {
        const chave = normalizarPraComparar(e.nome);
        if (nomesVistos.has(chave)) {
          colisoes++;
          console.warn(
            "  ! nome repetido entre fontes (sem codigo para desempatar): \"" +
            nomesVistos.get(chave) + "\" e \"" + e.nome + "\""
          );
        } else {
          nomesVistos.set(chave, e.nome);
        }
      }
      exames.push(e);
    });
  });

  if (colisoes) {
    console.warn("  ! " + colisoes + " colisao(oes) entre as fontes deste municipio — ver acima");
  }

  const observacoes = validos.reduce((acc, b) => acc.concat(b.observacoes || []), []);

  return {
    _leia_me: validos.map((b) => b._leia_me).join(" | "),
    fonte: validos.map((b) => b.fonte).join(" + "),
    atualizadoEm: validos.map((b) => b.atualizadoEm).sort().pop(), // a mais recente
    ...(observacoes.length ? { observacoes } : {}),
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
    "Macaé": juntarFontesDoMesmoMunicipio([lerMacae(), lerMacaeEspecialidades()]),
    Congonhas: lerCongonhas(),
    "Sete Lagoas": juntarFontesDoMesmoMunicipio([lerSeteLagoas(), lerSeteLagoasLaboratorio()]),
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
