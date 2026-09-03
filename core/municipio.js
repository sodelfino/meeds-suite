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

  var Dom = raiz.MeedsSuiteDom;

  var PREFIXOS_INSTITUCIONAIS = [
    "prefeitura municipal de ",
    "prefeitura de ",
    "municipio de ",
    "fundacao municipal de saude de ",
    "secretaria municipal de saude de ",
    "secretaria de saude de ",
  ];

  function normalizar(s) {
    return Dom.normalizarTexto(s || "");
  }

  /* "Prefeitura Municipal de Itauna" -> "itauna" */
  function extrairNomeCidade(razaoSocialNome) {
    var nome = normalizar(razaoSocialNome);
    if (!nome) return "";
    for (var i = 0; i < PREFIXOS_INSTITUCIONAIS.length; i++) {
      if (nome.indexOf(PREFIXOS_INSTITUCIONAIS[i]) === 0) {
        nome = nome.slice(PREFIXOS_INSTITUCIONAIS[i].length);
        break;
      }
    }
    return nome.trim();
  }

  function candidatosDoAtendimento(atendimento) {
    var lista = [];
    if (!atendimento || typeof atendimento !== "object") return lista;

    if (atendimento.cliente && atendimento.cliente.razaoSocialNome) {
      lista.push(atendimento.cliente.razaoSocialNome);
    }
    if (atendimento.paciente && atendimento.paciente.cliente && atendimento.paciente.cliente.razaoSocialNome) {
      lista.push(atendimento.paciente.cliente.razaoSocialNome);
    }
    if (atendimento.clienteId && Array.isArray(atendimento.clientes)) {
      for (var i = 0; i < atendimento.clientes.length; i++) {
        var c = atendimento.clientes[i];
        if (c && c.id === atendimento.clienteId && c.razaoSocialNome) lista.push(c.razaoSocialNome);
      }
    }
    if (Array.isArray(atendimento.clientes) && atendimento.clientes.length === 1) {
      var unico = atendimento.clientes[0];
      if (unico && unico.razaoSocialNome) lista.push(unico.razaoSocialNome);
    }
    return lista;
  }

  /* detectar(atendimento, nomesConhecidos) -> nome exato da lista, ou null.
   * nomesConhecidos e a lista de municipios que o modulo aceita; o retorno
   * e sempre um item DELA, para quem chamou poder usar direto. */
  function detectar(atendimento, nomesConhecidos) {
    var conhecidos = nomesConhecidos || [];
    if (!conhecidos.length) return null;

    var candidatos = candidatosDoAtendimento(atendimento);
    for (var i = 0; i < candidatos.length; i++) {
      var cidade = extrairNomeCidade(candidatos[i]);
      if (!cidade) continue;
      for (var j = 0; j < conhecidos.length; j++) {
        if (normalizar(conhecidos[j]) === cidade) return conhecidos[j];
      }
    }
    return null;
  }

  /* Segunda via, independente da API: procura os nomes conhecidos no
   * texto da tela. So decide se achar EXATAMENTE UM — com dois na tela
   * (uma lista de clientes, por exemplo) escolher seria adivinhar. */
  function detectarNaTela(nomesConhecidos) {
    var texto = Dom.textoDaPaginaNormalizado();
    if (!texto) return null;
    var achados = (nomesConhecidos || []).filter(function (m) {
      return texto.indexOf(normalizar(m)) !== -1;
    });
    return raiz.MeedsSuiteDecisao.unicoOuNada(achados);
  }

  raiz.MeedsSuiteMunicipio = {
    detectar: detectar,
    detectarNaTela: detectarNaTela,
    extrairNomeCidade: extrairNomeCidade,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
