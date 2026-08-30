/* ------------------------------------------------------------------
 * core/decision-engine.js — fusao de sinais com confianca
 * ------------------------------------------------------------------
 * DE ONDE VEIO ESTA IDEIA
 * O alarme de fila ja tinha a filosofia certa, so que espalhada em
 * regras soltas dentro do proprio modulo:
 *   - combinar TRES sinais independentes (toast nativo, resposta de rede,
 *     contador no DOM) em vez de confiar num so;
 *   - RECUSAR decidir quando a leitura e ambigua (duas leituras
 *     numericas diferentes para "Aguardando" => nao decide);
 *   - desconfiar de sinal VELHO (o contador do DOM so vale enquanto
 *     esta atualizando; parado no tempo, ele nao prova nem que a fila
 *     esvaziou nem que continua cheia).
 * O REMUME aplicava a mesma filosofia para municipio ("achei dois nomes
 * na tela => nao escolho nenhum").
 *
 * Aqui isso vira um mecanismo generico: cada sinal e um VOTO com peso de
 * confiabilidade e prazo de validade. A decisao so sai quando a confianca
 * somada dos votos que concordam atinge o limiar — e votos discordantes
 * SUBTRAEM. Abstencao explicita e um resultado valido, nao um erro.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var PESOS_PADRAO = {
    rede: 1.0,      // resposta da propria API: o dado mais forte
    toast: 0.8,     // a plataforma decidiu que isso e um evento novo
    dom_contador: 0.6, // leitura de tela: bom reforco, sozinho e fraco
    dom_rotulo: 0.6,
    manual: 1.0,    // o medico escolheu na mao: sempre vence
  };

  /* criarDecisor({ limiar, validadeMs, pesos })
   *  - limiar: confianca minima somada para decidir (padrao 1.0, ou
   *    seja: um sinal forte sozinho decide, dois fracos tambem);
   *  - validadeMs: depois disso o voto e considerado velho e ignorado
   *    (generaliza o LIMITE_FRESCOR_DOM_MS do alarme). */
  function criarDecisor(opcoes) {
    opcoes = opcoes || {};
    var limiar = typeof opcoes.limiar === "number" ? opcoes.limiar : 1.0;
    var validadeMs = typeof opcoes.validadeMs === "number" ? opcoes.validadeMs : 12000;
    var pesos = Object.assign({}, PESOS_PADRAO, opcoes.pesos || {});
    var votos = {}; // fonte -> { valor, peso, em }

    function agora() {
      return Date.now();
    }

    function votar(fonte, valor, pesoExplicito) {
      if (valor === null || valor === undefined) return; // "nao sei" nao vota
      votos[fonte] = {
        valor: valor,
        peso: typeof pesoExplicito === "number" ? pesoExplicito : pesos[fonte] !== undefined ? pesos[fonte] : 0.5,
        em: agora(),
      };
    }

    function esquecer(fonte) {
      delete votos[fonte];
    }

    function limpar() {
      votos = {};
    }

    function votosValidos() {
      var t = agora();
      var lista = [];
      Object.keys(votos).forEach(function (fonte) {
        var v = votos[fonte];
        if (validadeMs > 0 && t - v.em > validadeMs) return; // sinal velho
        lista.push({ fonte: fonte, valor: v.valor, peso: v.peso, em: v.em });
      });
      return lista;
    }

    /* decidir() -> { valor, confianca, decidiu, motivo, votos }
     * Agrupa os votos validos por valor, soma a confianca de cada grupo e
     * so devolve decidiu:true quando o grupo lider atinge o limiar E a
     * vantagem sobre o segundo colocado tambem chega la (senao a leitura
     * e ambigua — exatamente o caso "dois numeros candidatos"). */
    function decidir() {
      var lista = votosValidos();
      if (lista.length === 0) {
        return { valor: null, confianca: 0, decidiu: false, motivo: "sem-sinal", votos: lista };
      }

      var grupos = {};
      lista.forEach(function (v) {
        var chave = JSON.stringify(v.valor);
        grupos[chave] = (grupos[chave] || 0) + v.peso;
      });

      var ordenados = Object.keys(grupos)
        .map(function (chave) {
          return { chave: chave, valor: JSON.parse(chave), confianca: grupos[chave] };
        })
        .sort(function (a, b) {
          return b.confianca - a.confianca;
        });

      var lider = ordenados[0];
      var segundo = ordenados[1];
      var margem = lider.confianca - (segundo ? segundo.confianca : 0);

      if (lider.confianca < limiar) {
        return {
          valor: null,
          confianca: lider.confianca,
          decidiu: false,
          motivo: "confianca-insuficiente",
          votos: lista,
        };
      }
      if (segundo && margem < limiar) {
        // dois valores diferentes com forca parecida = ambiguidade real.
        return {
          valor: null,
          confianca: lider.confianca,
          decidiu: false,
          motivo: "ambiguo",
          votos: lista,
        };
      }

      return {
        valor: lider.valor,
        confianca: lider.confianca,
        decidiu: true,
        motivo: "ok",
        votos: lista,
      };
    }

    return {
      votar: votar,
      esquecer: esquecer,
      limpar: limpar,
      decidir: decidir,
      votosValidos: votosValidos,
      definirLimiar: function (n) {
        limiar = n;
      },
    };
  }

  /* Atalho para o caso mais comum: uma lista de candidatos onde so vale
   * decidir se houver exatamente UM. E a regra que REMUME (municipio) e
   * alarme (contador) aplicavam na mao. */
  function unicoOuNada(candidatos) {
    var unicos = [];
    (candidatos || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      if (unicos.indexOf(c) === -1) unicos.push(c);
    });
    return unicos.length === 1 ? unicos[0] : null;
  }

  raiz.MeedsSuiteDecisao = {
    criarDecisor: criarDecisor,
    unicoOuNada: unicoOuNada,
    PESOS_PADRAO: PESOS_PADRAO,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
