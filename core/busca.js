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

  /* Palavras sem valor de busca. Elas nao podem pontuar: como o
   * casamento e por substring, o "de" digitado em "dor de cabeca" casava
   * dentro de "DEformidades" e colocava "Deformidades Osteomusculares"
   * na frente das cefaleias. Sao removidas SO do que a pessoa digitou, e
   * so quando sobra alguma palavra util — quem procurar literalmente por
   * "de" ainda encontra. */
  var PALAVRAS_VAZIAS = [
    "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas",
    "a", "o", "as", "os", "ao", "aos", "com", "sem", "por", "para", "um", "uma",
  ];

  function tokensUteis(str) {
    var todos = tokenizarTexto(str);
    var uteis = todos.filter(function (t) {
      return PALAVRAS_VAZIAS.indexOf(t) === -1;
    });
    return uteis.length ? uteis : todos;
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
    /* O gatilho decide se uma palavra digitada ATIVA um grupo de
     * sinonimos. Antes era substring em qualquer posicao — o que ligava
     * grupos sem relacao: digitar "pressao" ativava o grupo de
     * "depressao" (porque "de-PRESSAO" contem "pressao"), e a busca por
     * "pressao alta" devolvia Depressao Pos-esquizofrenica na frente de
     * Hipertensao Essencial.
     *
     * Agora e por PREFIXO: uma das duas tem que COMECAR com a outra.
     * Continua tolerando o que interessa — digitar "dipiron" ainda ativa
     * "dipirona" — sem ligar palavras que so coincidem no meio. */
    if (a.length < 3 || b.length < 3) return false;
    return a.indexOf(b) === 0 || b.indexOf(a) === 0;
  }

  var CONFIG_PADRAO = {
    LIMITE_RESULTADOS: 80,
    LIMIAR_FUZZY: 0.6,
    BONUS_COMECA_COM: 0.2,
    MIN_LEN_DICA_TERMO: 4,
    /* Quanto vale um sinonimo que casou por frase INTEIRA e EXATA.
     * 0.8 e o valor com que o REMUME amadureceu: la, sinonimo forte
     * demais faria um nome comercial dominar a lista sobre o principio
     * ativo digitado. Quem tem sinonimos inequivocos — "pressao alta"
     * so pode ser hipertensao — pode subir isso na chamada. */
    PESO_SINONIMO: 0.8,
  };

  function normalizarFraseSinonimo(str) {
    return normalizarTexto(str).replace(/_/g, " ");
  }

  /* Frases de sinonimo relacionadas ao que foi digitado. Devolve FRASES,
   * nao palavras soltas: um sinonimo composto como "acido acetilsalicilico"
   * so conta se aparecer INTEIRO no texto do item — se explodisse em
   * palavras, "acido" sozinho bateria em qualquer "Acido X". */
  /* Uma FRASE de sinonimo dispara o grupo quando:
   *   - tem UMA palavra: alguma palavra digitada casa por prefixo com
   *     ela ("aas" -> aas, "dipiron" -> dipirona);
   *   - tem VARIAS palavras: TODAS as palavras dela foram digitadas.
   *
   * Essa segunda regra existe por causa de um caso concreto: com o
   * gatilho antigo, a palavra "dor" — que aparece em "dor de cabeca",
   * "dor lombar" e "dor nas costas" — disparava o grupo da cefaleia, e
   * buscar "dor lombar" devolvia oito cefaleias antes de qualquer
   * lombalgia. Exigir a frase inteira resolve sem tirar nada: "dor
   * lombar" digitado continua disparando a lombalgia.
   */
  function frasePodeDisparar(frase, tokensDigitados) {
    /* As palavras vazias saem dos DOIS lados. Se saissem so do que foi
     * digitado, a frase "dor de cabeca" nunca dispararia: ela exige
     * todas as suas palavras, e o "de" ja tinha sido descartado da
     * digitacao. */
    var palavras = frase.split(" ").filter(function (p) {
      return p.length > 0 && PALAVRAS_VAZIAS.indexOf(p) === -1;
    });
    if (palavras.length === 0) return false;

    if (palavras.length === 1) {
      return tokensDigitados.some(function (t) {
        return palavraElegivelParaGatilho(t, palavras[0]);
      });
    }

    return palavras.every(function (palavra) {
      return tokensDigitados.some(function (t) {
        return palavraElegivelParaGatilho(t, palavra);
      });
    });
  }

  function obterFrasesSinonimo(tokensDigitados, sinonimos) {
    var termoDigitadoCompleto = tokensDigitados.join(" ");
    var frases = new Set();
    if (!sinonimos) return [];

    Object.keys(sinonimos).forEach(function (chave) {
      var chaveFrase = normalizarFraseSinonimo(chave);
      var sinonimosFrases = sinonimos[chave].map(normalizarFraseSinonimo);

      var disparou =
        frasePodeDisparar(chaveFrase, tokensDigitados) ||
        sinonimosFrases.some(function (f) {
          return frasePodeDisparar(f, tokensDigitados);
        });

      if (disparou) {
        frases.add(chaveFrase);
        sinonimosFrases.forEach(function (f) {
          frases.add(f);
        });
      }
    });

    frases.delete(termoDigitadoCompleto);
    /* Array.from, nao Array.prototype.slice.call: slice le .length, que um
     * Set nao tem, e devolveria [] — os sinonimos morreriam em silencio. */
    return Array.from(frases);
  }

  /* IMPORTANTE: fuzzy vale SO para o que a pessoa digitou (tolera erro de
   * digitacao). Frases vindas de sinonimo exigem correspondencia EXATA —
   * combinar duas aproximacoes sugere um resultado parecido mas ERRADO. */
  /* Procura `frase` em `texto` exigindo que ela comece e termine em
   * limite de palavra. Os dois ja vem normalizados (sem acento, caixa
   * baixa), entao "letra ou digito" basta como definicao de limite. */
  function casaComoPalavra(texto, frase) {
    if (!frase) return false;
    var i = texto.indexOf(frase);
    while (i !== -1) {
      var antes = i === 0 ? "" : texto.charAt(i - 1);
      var depois = texto.charAt(i + frase.length);
      var limiteAntes = !antes || !/[a-z0-9]/.test(antes);
      var limiteDepois = !depois || !/[a-z0-9]/.test(depois);
      if (limiteAntes && limiteDepois) return true;
      i = texto.indexOf(frase, i + 1);
    }
    return false;
  }

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
      /* Casamento de sinonimo respeita LIMITE DE PALAVRA. Substring cru
       * funcionava enquanto os sinonimos eram nomes longos de farmaco
       * (o caso do REMUME), mas quebra feio com abreviacao medica:
       * "iam" casava dentro de "t-iam-ina", "dm" dentro de
       * "a-dm-inistrada", "has" dentro de "c-has". Resultado: buscar
       * "infarto" trazia Deficiencia de Tiamina em primeiro lugar. */
      var bateDireto = casaComoPalavra(item.normalizado, frase);
      /* Na variante SEM espacos o limite de palavra nao se aplica: o
       * texto inteiro virou uma palavra so. Aqui vale substring, como
       * antes — e o que faz "acido acetilsalicilico" achar quem escreveu
       * "AcidoAcetilSalicilico100mg". O piso de 8 caracteres evita
       * colisao de termo curto. */
      var bateSemEspaco =
        frase.length >= 8 &&
        item.normalizadoSemEspaco.indexOf(frase.replace(/\s+/g, "")) !== -1;
      if (bateDireto || bateSemEspaco) pontuacaoExata += cfg.PESO_SINONIMO;
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
    var tokens = tokensUteis(termo);
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
    tokensUteis: tokensUteis,
    CONFIG_PADRAO: CONFIG_PADRAO,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
