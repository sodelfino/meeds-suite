/* ------------------------------------------------------------------
 * core/mensagens.js — como o sistema fala com o medico
 * ------------------------------------------------------------------
 * REGRA UNICA, VALIDA PARA TODOS OS MODULOS
 * Toda mensagem de erro diz TRES coisas, nesta ordem:
 *   1. o que NAO aconteceu   ("Não consegui gerar o laudo")
 *   2. POR QUE                ("porque falta o nome da mãe")
 *   3. o que fazer AGORA      ("preencha o campo “Nome da mãe”…")
 *
 * "Erro", "campo obrigatório" e "erro ao gerar PDF" nao passam: nenhum
 * dos tres diz ao medico o que fazer em seguida, e ele esta no meio de um
 * plantao.
 *
 * Centralizado aqui para que o tom seja o MESMO nos cinco modulos e para
 * que um sexto ganhe isso pronto — e nao invente o seu proprio jeito de
 * escrever erro.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  /* Junta uma lista em portugues: "a, b e c" (e nao "a, b, c"). */
  function listar(itens) {
    if (itens.length === 0) return "";
    if (itens.length === 1) return itens[0];
    return itens.slice(0, -1).join(", ") + " e " + itens[itens.length - 1];
  }

  /* ------------------------------------------------------------------
   * camposFaltando(faltas, opcoes)
   * ------------------------------------------------------------------
   * faltas = [{ rotulo, comoResolver }]
   *   rotulo:       o nome do campo COMO ELE APARECE NA TELA, para o
   *                 medico achar sem procurar.
   *   comoResolver: opcional. Uma dica curta quando o campo tem um jeito
   *                 mais rapido de preencher (ex: "clique em Atualizar
   *                 paciente" ou "cadastre no painel da engrenagem").
   *
   * opcoes.acao = o que nao aconteceu ("gerar o laudo", "gerar a APAC")
   * ------------------------------------------------------------------ */
  function camposFaltando(faltas, opcoes) {
    opcoes = opcoes || {};
    var acao = opcoes.acao || "concluir";

    if (faltas.length === 0) return "";

    if (faltas.length === 1) {
      var f = faltas[0];
      return (
        "Não consegui " + acao + " porque falta " + f.descricao + ". " +
        "Preencha o campo “" + f.rotulo + "”" +
        (f.comoResolver ? " — " + f.comoResolver : "") +
        "."
      );
    }

    var rotulos = faltas.map(function (x) {
      return "“" + x.rotulo + "”";
    });
    var dicas = faltas
      .filter(function (x) {
        return x.comoResolver;
      })
      .map(function (x) {
        return "“" + x.rotulo + "”: " + x.comoResolver;
      });

    return (
      "Não consegui " + acao + " porque faltam " + faltas.length + " informações: " +
      listar(rotulos) + "." +
      (dicas.length ? " " + dicas.join(". ") + "." : "")
    );
  }

  /* Erro tecnico (rede, biblioteca, arquivo) traduzido para o medico.
   * A causa tecnica original vai junto, entre parenteses, porque ela
   * ajuda quem for dar suporte — mas nunca sozinha. */
  function erroTecnico(acao, causaAmigavel, comoResolver, detalheTecnico) {
    return (
      "Não consegui " + acao + " porque " + causaAmigavel + ". " +
      comoResolver +
      (detalheTecnico ? " (detalhe técnico: " + detalheTecnico + ")" : "")
    );
  }

  /* Confirmacao de sucesso. Curta, e dizendo o que aconteceu de concreto
   * — "pronto" nao informa nada. */
  function sucesso(oQue, ondeEsta) {
    return oQue + (ondeEsta ? " " + ondeEsta : "");
  }

  /* Mensagens tecnicas recorrentes, num lugar so. */
  var BIBLIOTECA_NAO_CARREGOU = function (nomeLib, detalhe) {
    return erroTecnico(
      "gerar o PDF",
      "o componente que monta o arquivo (" + nomeLib + ") não carregou",
      "Isso costuma ser a rede da unidade bloqueando o endereço cdnjs.cloudflare.com. " +
        "Verifique sua conexão e tente de novo; se continuar, peça ao TI local para liberar esse endereço.",
      detalhe
    );
  };

  raiz.MeedsSuiteMensagens = {
    listar: listar,
    camposFaltando: camposFaltando,
    erroTecnico: erroTecnico,
    sucesso: sucesso,
    BIBLIOTECA_NAO_CARREGOU: BIBLIOTECA_NAO_CARREGOU,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
