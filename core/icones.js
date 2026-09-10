/* ------------------------------------------------------------------
 * core/icones.js — os ícones dos botões do dock, em SVG
 * ------------------------------------------------------------------
 * POR QUE NÃO EMOJI
 * Emoji desenha diferente em cada sistema. Na captura da revisão de
 * apresentação, 💊 e 🧪 saíram parecendo uma caneta e uma paleta. Para
 * uma ferramenta que precisa ler igual no Windows do hospital e no iPad
 * do plantonista, isso é frágil — e dois módulos dividiam o mesmo 📄.
 *
 * Aqui os ícones dos geradores e das consultas são SVG: um traço só,
 * mesma grade de 24, `currentColor` para herdar a cor do texto do botão
 * (branco, sobre a pílula colorida). Ver finding 9 da revisão / D58.
 *
 * O QUE CONTINUA EMOJI
 * O Alarme (🔕 / 🔉 / 🔔) e a engrenagem (⚙️). O ícone do alarme É o
 * estado, e ele troca em tempo real por `deps.botao.definirTexto()` —
 * um sino é um glifo universal, renderiza igual em todo lugar, e manter
 * o alarme fora daqui evita reescrever a troca de estado.
 *
 * COMO O DOCK USA
 * `apresentacao.icone` no manifest passa a ser uma CHAVE deste mapa
 * ("apac", "laudo", "remume", "exames") em vez de um emoji. O dock
 * (core/dock.js) detecta: se `icone` casa com uma chave daqui, desenha
 * o SVG; senão, trata como texto/emoji, como sempre fez.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var COMUM =
    'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

  var ICONES = {
    /* APAC — documento com um visto: é uma autorização. */
    apac:
      "<svg " + COMUM + ">" +
      '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>' +
      '<path d="M14 3v5h5"/>' +
      '<path d="m8.5 14 2 2 4.5-4.5"/>' +
      "</svg>",

    /* Laudo — documento com linhas de texto. Os dois laudos usam o
     * mesmo ícone de propósito: é o mesmo tipo de documento, e quem
     * separa os dois é o nome da cidade no rótulo. */
    laudo:
      "<svg " + COMUM + ">" +
      '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>' +
      '<path d="M14 3v5h5"/>' +
      '<path d="M9 13h6M9 17h4"/>' +
      "</svg>",

    /* REMUME — uma cápsula. */
    remume:
      "<svg " + COMUM + ">" +
      '<rect x="3" y="8" width="18" height="8" rx="4"/>' +
      '<path d="M12 8v8"/>' +
      "</svg>",

    /* Exames — um frasco de laboratório com a linha do líquido. */
    exames:
      "<svg " + COMUM + ">" +
      '<path d="M9 3h6"/>' +
      '<path d="M10 3v6.5L5.2 17a2 2 0 0 0 1.7 3h10.2a2 2 0 0 0 1.7-3L14 9.5V3"/>' +
      '<path d="M7.5 14h9"/>' +
      "</svg>",
  };

  function obter(chave) {
    return Object.prototype.hasOwnProperty.call(ICONES, chave) ? ICONES[chave] : null;
  }

  raiz.MeedsSuiteIcones = { obter: obter, CHAVES: Object.keys(ICONES) };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
