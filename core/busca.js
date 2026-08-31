/* ------------------------------------------------------------------
 * core/busca.js — motor de busca tolerante (fuzzy + fonetica + sinonimos)
 * ------------------------------------------------------------------
 * DE ONDE VEIO
 * Este motor nasceu dentro do Assistente REMUME e amadureceu la, com
 * correcoes que so aparecem no uso real. Ele estava preso num modulo.
 * Aqui vira infraestrutura, sem reescrita: as funcoes abaixo foram
 * MOVIDAS do modulo, nao redigitadas — justamente para nao perder
 * nenhuma dessas correcoes:
 *
 *   - distancia de edicao ABSOLUTA maxima, alem da razao de
 *     similaridade: sem ela, "novalgina" casava com "valina" (ambas
 *     terminam em -ina) e sao coisas diferentes;
 *   - sinonimos exigem casamento EXATO da frase inteira: combinar
 *     sinonimo com fuzzy fazia "buscopan" -> "escopolamina" -> por
 *     aproximacao -> "escetamina", farmacos sem relacao;
 *   - guarda de 3 caracteres no gatilho de sinonimo: sem ela, o "b" de
 *     "complexo_b" casava com quase qualquer busca;
 *   - forma fonetica pre-calculada por item, uma vez, e nao a cada tecla.
 *
 * O QUE MUDOU AO GENERALIZAR
 * O dicionario de sinonimos deixou de ser fixo (era so de medicamentos)
 * e passou a ser um parametro. Assim o mesmo motor serve a REMUME
 * (medicamentos) e a busca de CID-10 (doencas), e serve a qualquer
 * modulo futuro que precise procurar numa lista grande.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var Dom = raiz.MeedsSuiteDom;

  function normalizarTexto(str) {
    return Dom.normalizarTexto(str);
  }

  function tokenizarTexto(str) {
    return normalizarTexto(str)
      .split(/[\s,;.\-()]+/)
      .filter(function (t) { return t.length > 0; });
  }

  function normalizarFonetico(tokenNormalizado) {
    return tokenNormalizado
      .replace(/^h/, "") // H mudo no inicio: "hemitartarato" ~ "emitartarato"
      .replace(/ch/g, "x") // mesmo som: "chave" ~ "xarope"
      .replace(/ss/g, "s") // "massa" ~ "masa"
      .replace(/c(?=[ei])/g, "s") // C antes de E/I soa como S: "cedo" ~ "sedo"
      .replace(/g(?=[ei])/g, "j") // G antes de E/I soa como J: "gelo" ~ "jelo"
      .replace(/z/g, "s"); // "zebra" ~ "sebra"
  }

  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] =
          a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  function fuzzyScore(query, target) {
    if (query === target) return 1.0;
    if (target.includes(query)) return 0.9;
    const maxLen = Math.max(query.length, target.length);
    if (maxLen === 0) return 1;
    const distancia = levenshtein(query, target);
    const distanciaMaxima = query.length <= 6 ? 1 : query.length <= 10 ? 2 : 3;
    if (distancia > distanciaMaxima) return 0;
    return 1 - distancia / maxLen;
  }

  function palavraElegivelParaGatilho(a, b) {
    return a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a));
  }

  var CONFIG_PADRAO = {
    LIMITE_RESULTADOS: 80,
    LIMIAR_FUZZY: 0.6,
    BONUS_COMECA_COM: 0.2,
    MIN_LEN_DICA_TERMO: 4,
  };

  function normalizarFraseSinonimo(str) {
    return normalizarTexto(str).replace(/_/g, " ");
  }

  /* Frases de sinonimo relacionadas ao que foi digitado. Devolve FRASES,
   * nao palavras soltas: um sinonimo composto como "acido acetilsalicilico"
   * so conta se aparecer INTEIRO no texto do item — se explodisse em
   * palavras, "acido" sozinho bateria em qualquer "Acido X". */
  function obterFrasesSinonimo(tokensDigitados, sinonimos) {
    var termoDigitadoCompleto = tokensDigitados.join(" ");
    var frases = new Set();
    if (!sinonimos) return [];
    for (var i = 0; i < tokensDigitados.length; i++) {
      var token = tokensDigitados[i];
      var chaves = Object.keys(sinonimos);
      for (var j = 0; j < chaves.length; j++) {
        var chaveFrase = normalizarFraseSinonimo(chaves[j]);
        var sinonimosFrases = sinonimos[chaves[j]].map(normalizarFraseSinonimo);
        var bate =
          chaveFrase.split(" ").some(function (t) { return palavraElegivelParaGatilho(token, t); }) ||
          sinonimosFrases.some(function (f) {
            return f.split(" ").some(function (t) { return palavraElegivelParaGatilho(token, t); });
          });
        if (bate) {
          frases.add(chaveFrase);
          sinonimosFrases.forEach(function (f) { frases.add(f); });
        }
      }
    }
    frases.delete(termoDigitadoCompleto);
    /* Array.from, nao Array.prototype.slice.call: slice le .length, que um
     * Set nao tem, e devolveria [] — os sinonimos morreriam em silencio.
     * Foi exatamente o que aconteceu ao mover este codigo para ca:
     * "buscopan" parou de achar escopolamina e o teste pegou. */
    return Array.from(frases);
  }

  /* IMPORTANTE: fuzzy vale SO para o que a pessoa digitou (tolera erro de
   * digitacao). Frases vindas de sinonimo exigem correspondencia EXATA —
   * combinar duas aproximacoes sugere um resultado parecido mas ERRADO. */
  function pontuarItem(item, tokensDigitados, tokensDigitadosFoneticos, frasesSinonimo, cfg) {
    var pontuacaoExata = 0;
    var pontuacaoFuzzy = 0;

    for (var i = 0; i < tokensDigitados.length; i++) {
      var token = tokensDigitados[i];
      if (item.normalizado.indexOf(token) !== -1) {
        pontuacaoExata += 1.0;
        if (item.normalizado.indexOf(token) === 0) pontuacaoExata += cfg.BONUS_COMECA_COM;
        continue;
      }
      var tokenFonetico = tokensDigitadosFoneticos[i];
      var melhorFuzzy = 0;
      for (var j = 0; j < item.tokens.length; j++) {
        var score = Math.max(
          fuzzyScore(token, item.tokens[j]),
          fuzzyScore(tokenFonetico, item.tokensFoneticos[j])
        );
        if (score > melhorFuzzy) melhorFuzzy = score;
      }
      if (melhorFuzzy >= cfg.LIMIAR_FUZZY) pontuacaoFuzzy += melhorFuzzy * 0.5;
    }

    for (var k = 0; k < frasesSinonimo.length; k++) {
      var frase = frasesSinonimo[k];
      var bateDireto = item.normalizado.indexOf(frase) !== -1;
      var bateSemEspaco =
        frase.length >= 8 && item.normalizadoSemEspaco.indexOf(frase.replace(/\s+/g, "")) !== -1;
      if (bateDireto || bateSemEspaco) pontuacaoExata += 0.8;
    }

    return {
      pontuacao: pontuacaoExata + pontuacaoFuzzy,
      viaFuzzy: pontuacaoExata === 0 && pontuacaoFuzzy > 0,
    };
  }

  /* ------------------------------------------------------------------
   * criarIndice(itens, textoDe)
   * ------------------------------------------------------------------
   * itens: array qualquer. textoDe(item) devolve o texto pesquisavel.
   * O indice pre-calcula tokens e forma fonetica UMA vez — esse custo
   * nao pode acontecer a cada tecla digitada.
   * ------------------------------------------------------------------ */
  function criarIndice(itens, textoDe) {
    return (itens || []).map(function (item) {
      var texto = textoDe ? textoDe(item) : String(item);
      var tokens = tokenizarTexto(texto);
      var normalizado = normalizarTexto(texto);
      return {
        original: item,
        tokens: tokens,
        tokensFoneticos: tokens.map(normalizarFonetico),
        normalizado: normalizado,
        normalizadoSemEspaco: normalizado.replace(/\s+/g, ""),
      };
    });
  }

  /* buscar(termo, indice, opcoes) -> { itens, viaFuzzy }
   * opcoes: { sinonimos, limite, config } */
  function buscar(termo, indice, opcoes) {
    opcoes = opcoes || {};
    var cfg = Object.assign({}, CONFIG_PADRAO, opcoes.config || {});
    var tokens = tokenizarTexto(termo);
    if (tokens.length === 0) return { itens: [], viaFuzzy: false };

    var foneticos = tokens.map(normalizarFonetico);
    var frases = obterFrasesSinonimo(tokens, opcoes.sinonimos);

    var pontuados = indice
      .map(function (item) {
        var r = pontuarItem(item, tokens, foneticos, frases, cfg);
        return { item: item, pontuacao: r.pontuacao, viaFuzzy: r.viaFuzzy };
      })
      .filter(function (x) { return x.pontuacao > 0; })
      .sort(function (a, b) { return b.pontuacao - a.pontuacao; })
      .slice(0, opcoes.limite || cfg.LIMITE_RESULTADOS);

    return {
      itens: pontuados.map(function (x) { return x.item.original; }),
      viaFuzzy: !!(pontuados[0] && pontuados[0].viaFuzzy),
      melhor: pontuados[0] ? pontuados[0].item.original : null,
    };
  }

  raiz.MeedsSuiteBusca = {
    criarIndice: criarIndice,
    buscar: buscar,
    normalizarFonetico: normalizarFonetico,
    fuzzyScore: fuzzyScore,
    levenshtein: levenshtein,
    tokenizarTexto: tokenizarTexto,
    CONFIG_PADRAO: CONFIG_PADRAO,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
