/* ------------------------------------------------------------------
 * core/fonetica-ptbr.js — codigo fonetico para portugues do Brasil
 * ------------------------------------------------------------------
 * POR QUE NAO SOUNDEX
 * Soundex foi feito para sobrenomes em ingles. Ele nao conhece Ç, LH, NH,
 * o "ão" nasal, nem o fato de que em portugues C antes de E/I soa como S
 * e G antes de E/I soa como J. Aplicado a nome de medicamento em
 * portugues, ele aproxima coisas que nao soam parecido e separa coisas
 * que soam igual — que e o contrario do que se quer.
 *
 * O QUE ESTE CODIGO FAZ
 * Reduz a palavra ao seu esqueleto sonoro em portugues, aplicando as
 * regras na ordem em que uma depende da outra. O caso que motivou:
 *
 *   "cimvastatina"  ->  sinvastatina  ->  SINVASTATINA
 *   "simvastatina"  ->  sinvastatina  ->  SINVASTATINA
 *   "sinvastatina"  ->  sinvastatina  ->  SINVASTATINA
 *
 * As tres convergem: C antes de I vira S, e M antes de consoante que nao
 * seja B/P vira N.
 *
 * ONDE ELE ENTRA NA BUSCA
 * Como CAMADA SECUNDARIA, e so quando a busca normal (exata + parecida)
 * nao achou NADA. Fonetica aproxima demais para competir com um resultado
 * obvio: se o medico digitou "dipirona" e a lista tem "Dipirona", a
 * fonetica nao deve ter chance de colocar outra coisa na frente.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var VOGAIS = "aeiou";

  function ehVogal(c) {
    return VOGAIS.indexOf(c) !== -1;
  }

  /* Recebe texto JA normalizado (sem acento, caixa baixa). */
  function codificar(palavra) {
    var p = String(palavra || "").replace(/[^a-z]/g, "");
    if (!p) return "";

    /* 1) H mudo no inicio: "hemitartarato" soa como "emitartarato". */
    p = p.replace(/^h+/, "");

    /* 2) Digrafos — antes de qualquer regra de letra solta, senao o "c"
     *    de "ch" seria tratado como C isolado. */
    p = p
      .replace(/ph/g, "f")
      .replace(/lh/g, "1") // som proprio, sem letra equivalente
      .replace(/nh/g, "2")
      .replace(/ch/g, "x")
      .replace(/qu/g, "k")
      .replace(/gu([ei])/g, "g$1")
      .replace(/sc([ei])/g, "s$1")
      .replace(/ss/g, "s")
      .replace(/rr/g, "r")
      .replace(/xc([ei])/g, "s$1");

    /* 3) Letras que dependem da vogal seguinte. */
    p = p
      .replace(/c([ei])/g, "s$1")
      .replace(/c/g, "k")
      .replace(/g([ei])/g, "j$1")
      .replace(/q/g, "k");

    /* 4) Letras que soam igual em portugues. */
    p = p
      .replace(/z/g, "s")
      .replace(/y/g, "i")
      .replace(/w/g, "v");

    /* 5) Nasais. M antes de B/P continua M; nos outros casos o som e o
     *    mesmo de N ("simvastatina" ~ "sinvastatina"). No fim da palavra,
     *    idem ("bom" ~ "bon"). */
    p = p.replace(/m([^bp]|$)/g, "n$1");

    /* 6) "ão" e "am" no fim ja viraram "ao"/"an" pela normalizacao de
     *    acento; unificamos os dois. */
    p = p.replace(/ao$/, "an").replace(/am$/, "an");

    /* 7) L no fim da silaba soa como U ("mal" ~ "mau"). */
    p = p.replace(/l($|[bcdfgjkpstvx1-9])/g, "u$1");

    /* 8) Letras repetidas nao mudam o som. */
    p = p.replace(/(.)\1+/g, "$1");

    return p.toUpperCase();
  }

  /* Codifica uma frase inteira, palavra a palavra. */
  function codificarFrase(texto) {
    return String(texto || "")
      .split(/\s+/)
      .filter(function (t) {
        return t.length > 0;
      })
      .map(codificar)
      .join(" ");
  }

  raiz.MeedsSuiteFonetica = {
    codificar: codificar,
    codificarFrase: codificarFrase,
    ehVogal: ehVogal,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
