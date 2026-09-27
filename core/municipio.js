/* ------------------------------------------------------------------
 * core/municipio.js — de que municipio e o atendimento aberto
 * ------------------------------------------------------------------
 * O Meeds e multi-municipio: o mesmo medico atende, na mesma fila,
 * pacientes de cidades diferentes. Saber de qual cidade e o atendimento
 * aberto evita perguntar ao medico o que o sistema ja sabe.
 *
 * O sinal e o cliente do atendimento — a prefeitura ou fundacao que
 * contratou o servico —, cujo nome vem em razaoSocialNome. Ele chega em
 * formatos diferentes conforme o estado do atendimento, entao tentamos
 * os mais especificos primeiro.
 *
 * QUANDO NAO DA PARA SABER, NAO CHUTA. Devolver o municipio errado seria
 * pior do que devolver nada: a APAC sairia com o CNES de outra cidade e
 * seria glosada. Na duvida devolve null e quem chamou pergunta.
 *
 * (O Assistente REMUME tem uma deteccao equivalente, nascida antes desta.
 * Ela pode migrar para ca quando houver folga para testar — nao foi
 * mexida agora para nao arriscar regressao numa funcao em uso.)
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  const Dom = raiz.MeedsSuiteDom;

  const PREFIXOS_INSTITUCIONAIS = [
    "prefeitura municipal de ",
    "prefeitura do municipio de ",
    "prefeitura de ",
    "municipio de ",
    "fundacao municipal de saude de ",
    "secretaria municipal de saude de ",
    "secretaria de saude de ",
  ];

  function normalizar(s) {
    return Dom.normalizarTexto(s || "");
  }

  /* DOIS FORMATOS DE NOME DE CLIENTE convivem no Meeds novo (25/09/2026):
   *   antigo: "PREFEITURA MUNICIPAL DE MACAÉ"
   *   novo:   "MACAÉ - RJ"   (so o municipio e a UF)
   * A troca esta sendo feita cliente a cliente, entao os dois precisam
   * funcionar ao mesmo tempo, e por tempo indeterminado. */
  const UFS = ["ac", "al", "ap", "am", "ba", "ce", "df", "es", "go", "ma", "mt", "ms", "mg", "pa",
    "pb", "pr", "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc", "sp", "se", "to"];
  const RX_UF_FIM = new RegExp("\\s*(?:[-–/]\\s*(" + UFS.join("|") + ")|\\((" + UFS.join("|") + ")\\))$");

  /* Instituicao que comeca no MEIO da linha (grudada na anterior). Os
   * mais longos primeiro; "municipio de " sozinho fica de fora porque e
   * pedaco de "prefeitura do municipio de ". */
  const RX_INSTITUICAO_NO_MEIO = /(\S)(prefeitura municipal de |prefeitura do municipio de |fundacao municipal de saude de |secretaria municipal de saude de |secretaria de saude de |prefeitura de )/g;

  function prefixoDe(nome) {
    for (let i = 0; i < PREFIXOS_INSTITUCIONAIS.length; i++) {
      if (nome.indexOf(PREFIXOS_INSTITUCIONAIS[i]) === 0) return PREFIXOS_INSTITUCIONAIS[i];
    }
    return null;
  }

  /* "Prefeitura Municipal de Itauna" -> "itauna"; "MACAÉ - RJ" -> "macae" */
  function extrairNomeCidade(razaoSocialNome) {
    let nome = normalizar(razaoSocialNome);
    if (!nome) return "";
    const p = prefixoDe(nome);
    if (p) nome = nome.slice(p.length);
    return nome.replace(RX_UF_FIM, "").trim();
  }

  /* O campo "Vinculos" do cartao do paciente, linha a linha: a linha da
   * CIDADE (qualquer um dos dois formatos) e as linhas de UNIDADE embaixo.
   *   ["MACAÉ - RJ", "CLINICA DO AUTISTA"]
   *   ["PREFEITURA MUNICIPAL DE MACAÉ", "UPA ... BARRA"]
   * Uma linha e de cidade se: tem prefixo institucional; OU termina em
   * " - UF"; OU e EXATAMENTE o nome de um municipio conhecido (cliente
   * renomeado sem a UF). Se a tela entregar as duas linhas grudadas
   * ("MACAÉ - RJCLINICA DO AUTISTA"), a UF (ou, no formato antigo, o
   * municipio conhecido) corta no lugar certo.
   * Devolve { cidades: [normalizadas], unidades: [normalizadas] }. */
  function analisarVinculo(linhas, nomesConhecidos) {
    const conhecidos = (nomesConhecidos || []).map(normalizar);
    const cidades = [];
    const unidades = [];
    /* Um "prefeitura ..." no MEIO de uma linha e outra instituicao que
     * veio grudada ("...ubs centroprefeitura municipal de macae"): quebra
     * ali, senao a segunda cidade some e um vinculo com DUAS cidades
     * pareceria ter uma so. */
    const separadas = [];
    (linhas || []).forEach(function (bruta) {
      let l = normalizar(bruta);
      l = l.replace(RX_INSTITUICAO_NO_MEIO, "$1\n$2");
      l.split("\n").forEach(function (x) { if (x.trim()) separadas.push(x.trim()); });
    });
    separadas.forEach(function (bruta) {
      const l = bruta;
      if (!l) return;
      const p = prefixoDe(l);
      if (p) {
        const resto = l.slice(p.length).trim();
        const alvo = conhecidos.filter(function (c) { return resto !== c && resto.indexOf(c) === 0; })[0];
        if (alvo) {
          cidades.push(alvo);
          unidades.push(resto.slice(alvo.length).trim());
        } else {
          cidades.push(resto.replace(RX_UF_FIM, "").trim());
        }
        return;
      }
      if (RX_UF_FIM.test(l)) return cidades.push(l.replace(RX_UF_FIM, "").trim());
      if (conhecidos.indexOf(l) !== -1) return cidades.push(l);
      /* "macae - rjclinica do autista": cidade + UF + unidade grudadas. */
      const g = /^(.+?)\s*[-–]\s*([a-z]{2})(.+)$/.exec(l);
      if (g && UFS.indexOf(g[2]) !== -1 && conhecidos.indexOf(g[1].trim()) !== -1) {
        cidades.push(g[1].trim());
        if (g[3].trim()) unidades.push(g[3].trim());
        return;
      }
      unidades.push(l);
    });
    return { cidades: cidades, unidades: unidades.filter(Boolean) };
  }

  function candidatosDoAtendimento(atendimento) {
    const lista = [];
    if (!atendimento || typeof atendimento !== "object") return lista;

    if (atendimento.cliente && atendimento.cliente.razaoSocialNome) {
      lista.push(atendimento.cliente.razaoSocialNome);
    }
    if (atendimento.paciente && atendimento.paciente.cliente && atendimento.paciente.cliente.razaoSocialNome) {
      lista.push(atendimento.paciente.cliente.razaoSocialNome);
    }
    if (atendimento.clienteId && Array.isArray(atendimento.clientes)) {
      for (let i = 0; i < atendimento.clientes.length; i++) {
        const c = atendimento.clientes[i];
        if (c && c.id === atendimento.clienteId && c.razaoSocialNome) lista.push(c.razaoSocialNome);
      }
    }
    if (Array.isArray(atendimento.clientes) && atendimento.clientes.length === 1) {
      const unico = atendimento.clientes[0];
      if (unico && unico.razaoSocialNome) lista.push(unico.razaoSocialNome);
    }
    return lista;
  }

  /* detectar(atendimento, nomesConhecidos) -> nome exato da lista, ou null.
   * nomesConhecidos e a lista de municipios que o modulo aceita; o retorno
   * e sempre um item DELA, para quem chamou poder usar direto. */
  function detectar(atendimento, nomesConhecidos) {
    const conhecidos = nomesConhecidos || [];
    if (!conhecidos.length) return null;

    const candidatos = candidatosDoAtendimento(atendimento);
    for (let i = 0; i < candidatos.length; i++) {
      const cidade = extrairNomeCidade(candidatos[i]);
      if (!cidade) continue;
      for (let j = 0; j < conhecidos.length; j++) {
        if (normalizar(conhecidos[j]) === cidade) return conhecidos[j];
      }
    }
    return null;
  }

  /* Segunda via, independente da API: procura os nomes conhecidos no
   * texto da tela. So decide se achar EXATAMENTE UM — com dois na tela
   * (uma lista de clientes, por exemplo) escolher seria adivinhar. */
  function detectarNaTela(nomesConhecidos) {
    const texto = Dom.textoDaPaginaNormalizado();
    if (!texto) return null;
    const achados = (nomesConhecidos || []).filter(function (m) {
      return texto.indexOf(normalizar(m)) !== -1;
    });
    return raiz.MeedsSuiteDecisao.unicoOuNada(achados);
  }

  /* Cidades que o atendimento DECLARA, conhecidas ou nao. Lista vazia quer
   * dizer "a resposta nao trouxe a prefeitura nos lugares que conhecemos"
   * — o que e diferente de "trouxe, e e outra cidade". Quem decide com
   * base na rede precisa distinguir os dois: no primeiro caso a rede nao
   * sabe, e outra fonte (a tela) pode responder. */
  function cidadesDoAtendimento(atendimento) {
    const vistas = [];
    candidatosDoAtendimento(atendimento).forEach(function (c) {
      const cidade = extrairNomeCidade(c);
      if (cidade && vistas.indexOf(cidade) === -1) vistas.push(cidade);
    });
    return vistas;
  }

  raiz.MeedsSuiteMunicipio = {
    detectar: detectar,
    cidadesDoAtendimento: cidadesDoAtendimento,
    detectarNaTela: detectarNaTela,
    extrairNomeCidade: extrairNomeCidade,
    analisarVinculo: analisarVinculo,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
