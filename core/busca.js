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

  const Dom = raiz.MeedsSuiteDom;

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
  const PALAVRAS_VAZIAS = [
    "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas",
    "a", "o", "as", "os", "ao", "aos", "com", "sem", "por", "para", "um", "uma",
  ];

  function tokensUteis(str) {
    const todos = tokenizarTexto(str);
    const uteis = todos.filter(function (t) {
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
  const PARES_PROXIMOS = {};
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
    const m = a.length;
    const n = b.length;
    const dp = [];
    for (let i = 0; i <= m; i++) {
      dp[i] = [];
      for (let j = 0; j <= n; j++) {
        dp[i][j] = i === 0 ? j : j === 0 ? i : 0;
      }
    }
    for (let x = 1; x <= m; x++) {
      for (let y = 1; y <= n; y++) {
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
    const maxLen = Math.max(query.length, target.length);
    if (maxLen === 0) return 1;
    const distancia = levenshtein(query, target);
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

  const CONFIG_PADRAO = {
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
    /* Acima desta fracao dos itens, a palavra deixa de escolher item e
     * passa so a desempatar. O 0,30 nao e chute: medindo os 11
     * municipios, tudo acima de 30% e forma farmaceutica ou sigla de
     * unidade ("comprimido" 44% em Mendes, "hpm" 80% em Macae), e
     * nenhum principio ativo passa de 10% em lugar nenhum. A separacao
     * entre os dois grupos e larga, entao o valor exato nao e critico —
     * qualquer coisa entre 0,15 e 0,30 se comportaria igual. */
    FRACAO_PALAVRA_GENERICA: 0.3,
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
    const palavras = frase.split(" ").filter(function (p) {
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
    const termoDigitadoCompleto = tokensDigitados.join(" ");
    const frases = new Set();
    if (!sinonimos) return [];

    Object.keys(sinonimos).forEach(function (chave) {
      const chaveFrase = normalizarFraseSinonimo(chave);
      const sinonimosFrases = sinonimos[chave].map(normalizarFraseSinonimo);

      const disparou =
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
    let i = texto.indexOf(frase);
    while (i !== -1) {
      const antes = i === 0 ? "" : texto.charAt(i - 1);
      const depois = texto.charAt(i + frase.length);
      const limiteAntes = !antes || !/[a-z0-9]/.test(antes);
      const limiteDepois = !depois || !/[a-z0-9]/.test(depois);
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
  /* Registra o TOKEN da palavra `t` como pertencente ao item `i` dentro
   * do vocabulario invertido (mutado em vocabulario). Um item pode
   * repetir a mesma palavra; guardamos so uma vez, olhando so a ultima
   * entrada (os tokens de um mesmo item chegam em sequencia). */
  function indexarToken(vocabulario, t, i) {
    let entrada = vocabulario[t];
    if (!entrada) entrada = vocabulario[t] = { itens: [] };
    if (entrada.itens[entrada.itens.length - 1] !== i) entrada.itens.push(i);
  }

  /* Preenche originais/normalizados/semEspaco (paralelos a `lista`) e
   * o vocabulario invertido, palavra -> itens em que ela aparece. */
  function indexarItens(lista, textoDe) {
    const n = lista.length;
    const originais = new Array(n);
    const normalizados = new Array(n);
    const semEspaco = new Array(n);
    const vocabulario = Object.create(null);

    for (let i = 0; i < n; i++) {
      const item = lista[i];
      const texto = textoDe ? textoDe(item) : String(item);
      const norm = normalizarTexto(texto);

      originais[i] = item;
      normalizados[i] = norm;
      semEspaco[i] = norm.replace(/\s+/g, "");

      const tokens = tokenizarTexto(texto);
      for (let j = 0; j < tokens.length; j++) {
        indexarToken(vocabulario, tokens[j], i);
      }
    }

    return { originais, normalizados, semEspaco, vocabulario };
  }

  /* Palavras agrupadas por COMPRIMENTO. A aproximacao so precisa olhar as
   * faixas de tamanho compativel com o que foi digitado — sem isto ela
   * percorria as 8.391 palavras distintas so para descartar quase todas
   * pelo tamanho. */
  function agruparPorTamanho(palavras) {
    const porTamanho = Object.create(null);
    for (let w = 0; w < palavras.length; w++) {
      const tam = palavras[w].length;
      (porTamanho[tam] || (porTamanho[tam] = [])).push(palavras[w]);
    }
    return porTamanho;
  }

  function criarIndice(itens, textoDe) {
    const lista = itens || [];
    const n = lista.length;
    const { originais, normalizados, semEspaco, vocabulario } = indexarItens(lista, textoDe);
    const palavras = Object.keys(vocabulario);
    const porTamanho = agruparPorTamanho(palavras);

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
  /* PASSAGEM 1 (por token): casamento exato por substring, varrendo o
   * texto normalizado de cada item. Palavra GENERICA (aparece em mais de
   * FRACAO_PALAVRA_GENERICA dos itens) nao escolhe item, so desempata —
   * ver a nota longa mais abaixo, que explica por que. Devolve
   * casouExato[i] (quais itens este token pegou), usado depois para a
   * passagem de aproximacao nao pontuar de novo o que ja pontuou aqui. */
  function pontuarExato(token, ctx, estado) {
    const indice = ctx.indice;
    const cfg = ctx.cfg;
    const n = indice.tamanho;
    const normalizados = indice.normalizados;
    const casouExato = new Uint8Array(n);
    let quantosExatos = 0;

    for (let i = 0; i < n; i++) {
      const pos = normalizados[i].indexOf(token);
      if (pos === -1) continue;
      casouExato[i] = 1;
      quantosExatos++;
      estado.exata[i] += 1.0;
      if (pos === 0) estado.exata[i] += cfg.BONUS_COMECA_COM;
    }

    /* PALAVRA GENERICA NAO ESCOLHE ITEM, SO DESEMPATA.
     *
     * Numa REMUME, "comprimido" aparece em 44% da lista de Mendes e as
     * siglas de unidade ("hpm", "upa", "ubs") em ate 80% da de Macae.
     * Como qualquer token que casa marca o item como candidato,
     * "acetilcisteina comprimido" devolvia 159 dos 357 itens de Mendes:
     * os dois certos no topo e 157 de ruido atras, dentro de uma lista
     * que a tela corta em 80. O medico rolava 80 linhas para achar 2.
     *
     * A medicao mostrou uma separacao limpa: acima de 30% so existem
     * formas farmaceuticas e siglas de unidade — nenhum principio ativo
     * chega perto disso em nenhum dos 11 municipios. Entao o corte por
     * frequencia distingue exatamente o que precisamos, sem lista fixa
     * de palavras (que quebraria justamente em Sete Lagoas, onde NENHUMA
     * palavra passa de 10% porque o municipio nao publica forma
     * farmaceutica).
     *
     * A palavra generica continua somando pontos: em "amoxicilina
     * suspensao", "suspensao" segue empurrando a suspensao para cima —
     * ela so nao pode, sozinha, trazer para a lista uma suspensao que
     * nada tem a ver com amoxicilina.
     *
     * Isto so REMOVE item do resultado, nunca acrescenta: a regra de a
     * REMUME do municipio ser a unica fonte de verdade continua valendo
     * por construcao. */
    const generico = quantosExatos > 0 && quantosExatos / n > cfg.FRACAO_PALAVRA_GENERICA;
    for (let t = 0; t < n; t++) {
      if (!casouExato[t]) continue;
      if (generico) estado.tocadoGenerico[t] = 1;
      else estado.tocado[t] = 1;
    }

    return { casouExato: casouExato, quantosExatos: quantosExatos };
  }

  /* PASSAGEM 3 (por token): aproximacao sobre o VOCABULARIO (palavras
   * distintas), nao sobre os itens — e o que faz a CID-10 completa
   * (8.391 palavras distintas) caber no tempo de uma tecla. So roda se a
   * palavra digitada nao bateu exato o bastante (EXATOS_QUE_DISPENSAM_
   * APROXIMACAO): uma palavra bem escrita nao precisa de aproximacao, e
   * pular aqui nao muda quem aparece primeiro (exato sempre vale mais
   * que fuzzy). Poda por comprimento: se a diferenca de tamanho ja passa
   * da distancia maxima tolerada, a palavra nem entra na comparacao. */
  /* Palavras do vocabulario cujo comprimento cabe na distancia maxima de
   * edicao tolerada para este token — a poda que evita comparar contra
   * as 8.391 palavras distintas da CID-10 inteira. */
  function candidatasPorTamanho(indice, token) {
    const distanciaMaxima = limiteDeDistancia(token.length);
    let candidatas = [];
    for (let tam = token.length - distanciaMaxima; tam <= token.length + distanciaMaxima; tam++) {
      const faixa = indice.porTamanho && indice.porTamanho[tam];
      if (faixa) candidatas = candidatas.concat(faixa);
    }
    return candidatas;
  }

  /* Melhor nota de aproximacao, POR ITEM, entre as palavras candidatas —
   * um item pode conter mais de uma palavra parecida com o token; fica a
   * maior. Itens que o token ja pontuou exato ficam de fora (o token nao
   * pontua duas vezes no mesmo item). */
  function melhorNotaPorItem(token, indice, cfg, casouExato) {
    const candidatas = candidatasPorTamanho(indice, token);
    let melhorPorItem = null;
    for (let p = 0; p < candidatas.length; p++) {
      const palavra = candidatas[p];
      const score = fuzzyScore(token, palavra);
      if (score < cfg.LIMIAR_FUZZY) continue;

      if (!melhorPorItem) melhorPorItem = Object.create(null);
      const dono = indice.vocabulario[palavra].itens;
      for (let k = 0; k < dono.length; k++) {
        const id = dono[k];
        if (casouExato[id]) continue; // este token ja pontuou exato aqui
        if (!(id in melhorPorItem) || melhorPorItem[id] < score) melhorPorItem[id] = score;
      }
    }
    return melhorPorItem;
  }

  function pontuarAproximado(token, ctx, casouExato, estado) {
    const melhorPorItem = melhorNotaPorItem(token, ctx.indice, ctx.cfg, casouExato);
    if (!melhorPorItem) return;
    for (const chave in melhorPorItem) {
      const idFuzzy = +chave;
      estado.fuzzy[idFuzzy] += melhorPorItem[idFuzzy] * 0.5;
      estado.tocado[idFuzzy] = 1;
    }
  }

  /* Se a busca inteira era generica — o medico digitou so "comprimido",
   * ou so "UBS" — nao ha nada mais especifico para mostrar. Ai a palavra
   * generica volta a escolher, senao a tela diria "nao consta" para um
   * termo que existe na lista. */
  function recuperarSoGenerico(n, estado) {
    for (let v = 0; v < n; v++) {
      if (estado.tocado[v]) return;
    }
    for (let w = 0; w < n; w++) {
      if (estado.tocadoGenerico[w]) estado.tocado[w] = 1;
    }
  }

  /* PASSAGEM 2: sinonimos, por frase inteira e com limite de palavra —
   * ver a nota no topo do arquivo sobre por que fuzzy e sinonimo nunca
   * se combinam. */
  function aplicarSinonimos(tokens, ctx, sinonimos, estado) {
    const indice = ctx.indice;
    const cfg = ctx.cfg;
    const frases = obterFrasesSinonimo(tokens, sinonimos);
    const n = indice.tamanho;
    for (let f = 0; f < frases.length; f++) {
      const frase = frases[f];
      const fraseSemEspaco = frase.replace(/\s+/g, "");
      const vaiSemEspaco = frase.length >= 8;
      for (let m = 0; m < n; m++) {
        const bate =
          casaComoPalavra(indice.normalizados[m], frase) ||
          (vaiSemEspaco && indice.semEspaco[m].indexOf(fraseSemEspaco) !== -1);
        if (bate) {
          estado.exata[m] += cfg.PESO_SINONIMO;
          estado.tocado[m] = 1;
        }
      }
    }
  }

  function ordenarCandidatos(n, estado, limite) {
    const candidatos = [];
    for (let c = 0; c < n; c++) {
      if (!estado.tocado[c]) continue;
      const total = estado.exata[c] + estado.fuzzy[c];
      if (total > 0) candidatos.push({ i: c, total: total, viaFuzzy: estado.exata[c] === 0 });
    }
    candidatos.sort(function (a, b) {
      return b.total - a.total;
    });
    return { todos: candidatos, recortados: candidatos.slice(0, limite) };
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
    const cfg = Object.assign({}, CONFIG_PADRAO, opcoes.config || {});
    const tokens = tokensUteis(termo);
    if (tokens.length === 0 || !indice || !indice.tamanho) {
      return { itens: [], viaFuzzy: false, melhor: null, total: 0 };
    }

    const n = indice.tamanho;
    const estado = {
      exata: new Float64Array(n),
      fuzzy: new Float64Array(n),
      tocado: new Uint8Array(n),
      /* Itens que SO foram alcancados por palavra generica. Ficam de fora
       * do resultado, a menos que nada mais tenha sido encontrado. */
      tocadoGenerico: new Uint8Array(n),
    };

    const ctx = { indice: indice, cfg: cfg };
    for (let q = 0; q < tokens.length; q++) {
      const token = tokens[q];
      const { casouExato, quantosExatos } = pontuarExato(token, ctx, estado);
      if (quantosExatos >= cfg.EXATOS_QUE_DISPENSAM_APROXIMACAO) continue;
      pontuarAproximado(token, ctx, casouExato, estado);
    }

    recuperarSoGenerico(n, estado);
    aplicarSinonimos(tokens, ctx, opcoes.sinonimos, estado);

    const limite = opcoes.limite || cfg.LIMITE_RESULTADOS;
    const { todos, recortados } = ordenarCandidatos(n, estado, limite);

    return {
      itens: recortados.map(function (x) {
        return indice.originais[x.i];
      }),
      viaFuzzy: !!(recortados[0] && recortados[0].viaFuzzy),
      melhor: recortados[0] ? indice.originais[recortados[0].i] : null,
      total: todos.length,
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
