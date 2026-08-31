/* ------------------------------------------------------------------
 * core/busca.js — motor de busca tolerante (aproximacao + sinonimos)
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
 *   - custo de troca ponderado para os pares que o portugues confunde
 *     na escrita (s/z, c/s, g/j), no lugar de uma dobra fonetica.
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

  /* Pares de letras que o portugues confunde na escrita. Trocar uma pela
   * outra custa MEIO ponto em vez de um: e um erro de grafia previsivel,
   * nao uma palavra diferente.
   *   s/z   "azia" ~ "asia"        c/s   "cedo" ~ "sedo"
   *   c/k   "caro" ~ "karo"        g/j   "gelo" ~ "jelo"
   *   l/u   "mal"  ~ "mau"         m/n   "sim"  ~ "sin"
   *   i/y, v/w, q/k                x/s   "exame" ~ "esame"
   */
  var PARES_PROXIMOS = {};
  [
    ["s", "z"], ["s", "c"], ["c", "z"], ["c", "k"], ["q", "k"],
    ["g", "j"], ["l", "u"], ["m", "n"], ["i", "y"], ["v", "w"],
    ["x", "s"], ["b", "v"], ["e", "i"], ["o", "u"],
  ].forEach(function (par) {
    PARES_PROXIMOS[par[0] + par[1]] = true;
    PARES_PROXIMOS[par[1] + par[0]] = true;
  });

  function custoTroca(a, b) {
    if (a === b) return 0;
    return PARES_PROXIMOS[a + b] ? 0.5 : 1;
  }

  /* Levenshtein com custo de troca ponderado (ver acima). Insercao e
   * remocao continuam custando 1: falta ou sobra de letra nao e confusao
   * de grafia. */
  function levenshtein(a, b) {
    var m = a.length;
    var n = b.length;
    var dp = [];
    for (var i = 0; i <= m; i++) {
      dp[i] = [];
      for (var j = 0; j <= n; j++) {
        dp[i][j] = i === 0 ? j : j === 0 ? i : 0;
      }
    }
    for (var x = 1; x <= m; x++) {
      for (var y = 1; y <= n; y++) {
        dp[x][y] = Math.min(
          dp[x - 1][y] + 1,
          dp[x][y - 1] + 1,
          dp[x - 1][y - 1] + custoTroca(a[x - 1], b[y - 1])
        );
      }
    }
    return dp[m][n];
  }

  /* LIMITE DE TOLERANCIA — a regra que separa "erro de digitacao" de
   * "outro medicamento".
   *
   * Nao basta a razao de similaridade: palavras compridas com o mesmo
   * sufixo passam de 0.6 sem ter quase nada em comum ("novalgina" e
   * "valina" terminam em -ina). Por isso exigimos tambem uma distancia
   * ABSOLUTA pequena, proporcional ao tamanho do que foi digitado:
   *
   *     ate  6 letras  ->  1.0 de distancia
   *     ate 10 letras  ->  2.0
   *     acima          ->  3.0
   *
   * Com o custo ponderado, uma troca previsivel (s/z, c/s, g/j) gasta so
   * meio ponto, entao "dipironá" e "azitromissina" continuam sendo
   * aceitos — mas "dipirona" x "digoxina" precisa de 4 trocas nao
   * relacionadas e fica de fora, que e o resultado desejado. */
  function limiteDeDistancia(tamanhoQuery) {
    if (tamanhoQuery <= 6) return 1;
    if (tamanhoQuery <= 10) return 2;
    return 3;
  }

  function fuzzyScore(query, target) {
    if (query === target) return 1.0;
    if (target.indexOf(query) !== -1) return 0.9;
    var maxLen = Math.max(query.length, target.length);
    if (maxLen === 0) return 1;
    var distancia = levenshtein(query, target);
    if (distancia > limiteDeDistancia(query.length)) return 0;
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
    /* Quantos casamentos EXATOS bastam para dispensar a aproximacao
     * daquela palavra. Uma palavra que aparece em dezenas de itens
     * claramente existe na base — tentar adivinhar o que ela "queria
     * ser" so acrescenta ruido, e e a parte cara da busca. Abaixo desse
     * numero (erro de digitacao, termo raro) a aproximacao roda normal.
     * Tres ocorrencias ja bastam para provar que a palavra existe. */
    EXATOS_QUE_DISPENSAM_APROXIMACAO: 3,
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


  /* ------------------------------------------------------------------
   * criarIndice(itens, textoDe)
   * ------------------------------------------------------------------
   * POR QUE ESTE INDICE E INVERTIDO
   * A primeira versao guardava os tokens POR ITEM. Com a REMUME (algumas centenas de itens por municipio)
   * isso nunca incomodou. Com a CID-10 completa — 14.233 itens — passou a
   * custar caro de dois jeitos, ambos medidos:
   *   - montar o indice bloqueava a tela por ~910 ms;
   *   - cada busca gastava de 600 a 1500 ms, porque a comparacao por
   *     aproximacao (Levenshtein) rodava contra os tokens de TODOS os
   *     itens, a cada tecla digitada.
   *
   * Agora o indice guarda cada PALAVRA DISTINTA uma vez so, com a lista
   * dos itens em que ela aparece. A base inteira tem dezenas de milhares
   * de ocorrencias de palavra, mas so alguns milhares de palavras
   * distintas — e a aproximacao passa a rodar sobre essas, nao sobre os
   * itens.
   *
   * A PONTUACAO FINAL E A MESMA DE ANTES. O que mudou e quantas vezes a
   * conta e feita, nao a conta — por isso o REMUME nao muda de
   * comportamento.
   * ------------------------------------------------------------------ */
  function criarIndice(itens, textoDe) {
    var lista = itens || [];
    var n = lista.length;

    var originais = new Array(n);
    var normalizados = new Array(n);
    var semEspaco = new Array(n);

    /* palavra distinta -> { itens: [indices em que ela aparece] } */
    var vocabulario = Object.create(null);

    for (var i = 0; i < n; i++) {
      var item = lista[i];
      var texto = textoDe ? textoDe(item) : String(item);
      var norm = normalizarTexto(texto);

      originais[i] = item;
      normalizados[i] = norm;
      semEspaco[i] = norm.replace(/\s+/g, "");

      var tokens = tokenizarTexto(texto);
      for (var j = 0; j < tokens.length; j++) {
        var t = tokens[j];
        var entrada = vocabulario[t];
        if (!entrada) entrada = vocabulario[t] = { itens: [] };
        // um item pode repetir a mesma palavra; guardamos so uma vez
        if (entrada.itens[entrada.itens.length - 1] !== i) entrada.itens.push(i);
      }
    }

    /* Palavras agrupadas por COMPRIMENTO. A aproximacao so precisa olhar
     * as faixas de tamanho compativel com o que foi digitado — sem isto
     * ela percorria as 8.391 palavras distintas so para descartar quase
     * todas pelo tamanho. */
    var palavras = Object.keys(vocabulario);
    var porTamanho = Object.create(null);
    for (var w = 0; w < palavras.length; w++) {
      var tam = palavras[w].length;
      (porTamanho[tam] || (porTamanho[tam] = [])).push(palavras[w]);
    }

    return {
      tamanho: n,
      originais: originais,
      normalizados: normalizados,
      semEspaco: semEspaco,
      vocabulario: vocabulario,
      palavras: palavras,
      porTamanho: porTamanho,
    };
  }

  /* ------------------------------------------------------------------
   * buscar(termo, indice, opcoes) -> { itens, viaFuzzy, melhor, total }
   * opcoes: { sinonimos, limite, config }
   *
   * Tres passagens, da mais barata para a mais cara:
   *   1. casamento EXATO por substring, varrendo o texto normalizado;
   *   2. sinonimos, por frase inteira e com limite de palavra;
   *   3. APROXIMACAO, so sobre as palavras distintas e so as de
   *      comprimento compativel — se a diferenca de tamanho entre duas
   *      palavras ja e maior que a distancia de edicao maxima, elas nao
   *      tem chance e nem sao comparadas.
   * ------------------------------------------------------------------ */
  function buscar(termo, indice, opcoes) {
    opcoes = opcoes || {};
    var cfg = Object.assign({}, CONFIG_PADRAO, opcoes.config || {});
    var tokens = tokensUteis(termo);
    if (tokens.length === 0 || !indice || !indice.tamanho) {
      return { itens: [], viaFuzzy: false, melhor: null, total: 0 };
    }

    var n = indice.tamanho;
    var exata = new Float64Array(n);
    var fuzzy = new Float64Array(n);
    var tocado = new Uint8Array(n);
    var normalizados = indice.normalizados;

    for (var q = 0; q < tokens.length; q++) {
      var token = tokens[q];
      var casouExato = new Uint8Array(n);

      /* 1) exato */
      var quantosExatos = 0;
      for (var i = 0; i < n; i++) {
        var pos = normalizados[i].indexOf(token);
        if (pos === -1) continue;
        casouExato[i] = 1;
        tocado[i] = 1;
        quantosExatos++;
        exata[i] += 1.0;
        if (pos === 0) exata[i] += cfg.BONUS_COMECA_COM;
      }

      /* Palavra bem escrita nao precisa de aproximacao. Isto e o que
       * mantem a busca rapida no caso comum: com a CID-10 completa,
       * "fibrilacao atrial" caia de 147 ms para poucos milissegundos,
       * porque as duas palavras existem na base e nenhuma delas precisa
       * ser comparada contra as 8.391 palavras distintas.
       * Um casamento exato sempre vale mais que um aproximado (1.0
       * contra no maximo 0.45 por palavra), entao pular aqui nao muda
       * quem aparece primeiro. */
      if (quantosExatos >= cfg.EXATOS_QUE_DISPENSAM_APROXIMACAO) continue;

      /* 3) aproximacao sobre o vocabulario */
      /* Poda por comprimento: se a diferenca de tamanho entre duas
       * palavras ja passa da distancia maxima tolerada, nem calculamos a
       * distancia de edicao — insercao e remocao custam 1 cada, entao
       * nao ha como caber no limite. Usa a MESMA regra do fuzzyScore,
       * para nao podar nada que ele aceitaria. */
      var distanciaMaxima = limiteDeDistancia(token.length);
      var melhorPorItem = null;

      var candidatas = [];
      for (var tam = token.length - distanciaMaxima; tam <= token.length + distanciaMaxima; tam++) {
        var faixa = indice.porTamanho && indice.porTamanho[tam];
        if (faixa) candidatas = candidatas.concat(faixa);
      }

      for (var p = 0; p < candidatas.length; p++) {
        var palavra = candidatas[p];
        var entrada = indice.vocabulario[palavra];
        var score = fuzzyScore(token, palavra);
        if (score < cfg.LIMIAR_FUZZY) continue;

        if (!melhorPorItem) melhorPorItem = Object.create(null);
        var dono = entrada.itens;
        for (var k = 0; k < dono.length; k++) {
          var id = dono[k];
          if (casouExato[id]) continue; // este token ja pontuou exato aqui
          if (!(id in melhorPorItem) || melhorPorItem[id] < score) melhorPorItem[id] = score;
        }
      }

      if (melhorPorItem) {
        for (var chave in melhorPorItem) {
          var idFuzzy = +chave;
          fuzzy[idFuzzy] += melhorPorItem[idFuzzy] * 0.5;
          tocado[idFuzzy] = 1;
        }
      }
    }

    /* 2) sinonimos */
    var frases = obterFrasesSinonimo(tokens, opcoes.sinonimos);
    for (var f = 0; f < frases.length; f++) {
      var frase = frases[f];
      var fraseSemEspaco = frase.replace(/\s+/g, "");
      var vaiSemEspaco = frase.length >= 8;
      for (var m = 0; m < n; m++) {
        var bate =
          casaComoPalavra(normalizados[m], frase) ||
          (vaiSemEspaco && indice.semEspaco[m].indexOf(fraseSemEspaco) !== -1);
        if (bate) {
          exata[m] += cfg.PESO_SINONIMO;
          tocado[m] = 1;
        }
      }
    }

    /* ordena so o que pontuou */
    var candidatos = [];
    for (var c = 0; c < n; c++) {
      if (!tocado[c]) continue;
      var total = exata[c] + fuzzy[c];
      if (total > 0) candidatos.push({ i: c, total: total, viaFuzzy: exata[c] === 0 });
    }
    candidatos.sort(function (a, b) {
      return b.total - a.total;
    });

    var limite = opcoes.limite || cfg.LIMITE_RESULTADOS;
    var recortados = candidatos.slice(0, limite);

    return {
      itens: recortados.map(function (x) {
        return indice.originais[x.i];
      }),
      viaFuzzy: !!(recortados[0] && recortados[0].viaFuzzy),
      melhor: recortados[0] ? indice.originais[recortados[0].i] : null,
      total: candidatos.length,
    };
  }
  raiz.MeedsSuiteBusca = {
    criarIndice: criarIndice,
    buscar: buscar,
    fuzzyScore: fuzzyScore,
    limiteDeDistancia: limiteDeDistancia,
    custoTroca: custoTroca,
    levenshtein: levenshtein,
    tokenizarTexto: tokenizarTexto,
    tokensUteis: tokensUteis,
    CONFIG_PADRAO: CONFIG_PADRAO,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
