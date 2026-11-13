/* ------------------------------------------------------------------
 * core/icones.js — os ícones dos botões do dock, em SVG
 * ------------------------------------------------------------------
 * POR QUE NÃO EMOJI
 * Emoji desenha diferente em cada sistema. Na captura da revisão de
 * apresentação, 💊 e 🧪 saíram parecendo uma caneta e uma paleta. Para
 * uma ferramenta que precisa ler igual no Windows do hospital e no iPad
 * do plantonista, isso é frágil — e dois módulos dividiam o mesmo 📄.
 *
 * EM DUAS CORES (2.75.0, pedido de 13/11/2026)
 * Um traço escuro e um preenchimento claro, cada função com a sua cor:
 * REMUME é uma pílula, Exames são tubos de ensaio, o Alarme é um sino
 * (ligado, baixo ou riscado) e Ajustes é uma engrenagem. Todos na grade
 * de 24. Com o fundo da lateral branco, a cor é o que separa um ícone
 * do outro de relance. O alarme e a engrenagem deixaram de ser emoji:
 * o alarme passa a chave do sino por `deps.botao.definirTexto()`, que
 * desenha o SVG quando a chave existe aqui.
 *
 * COMO O DOCK USA
 * `apresentacao.icone` no manifest passa a ser uma CHAVE deste mapa
 * ("apac", "laudo", "remume", "exames") em vez de um emoji. O dock
 * (core/dock.js) detecta: se `icone` casa com uma chave daqui, desenha
 * o SVG; senão, trata como texto/emoji, como sempre fez.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  const COMUM =
    'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

  /* Folha de documento: contorno + dobra colorida. */
  function folha(traco, dobra) {
    return '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z" fill="#fff" stroke="' + traco + '" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M14 3v5h5" fill="' + dobra + '" stroke="' + traco + '" stroke-width="1.6" stroke-linejoin="round"/>';
  }
  function svg(corpo) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">' + corpo + "</svg>";
  }
  const SINO = '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9z" fill="#FFD8A8" stroke="#D9480F" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M10 20.2a2.1 2.1 0 0 0 4 0" stroke="#D9480F" stroke-width="1.6" stroke-linecap="round"/>';

  const ICONES = {
    /* APAC — documento com um visto: é uma autorização. */
    apac: svg(folha("#2B8A3E", "#D3F9D8") + '<path d="m8.5 14 2 2 4.5-4.5" stroke="#2B8A3E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),

    /* Laudo — documento com linhas de texto (os dois laudos e o LME). */
    laudo: svg(folha("#6741D9", "#E5DBFF") + '<path d="M8.5 13h7M8.5 16.5h4.5" stroke="#6741D9" stroke-width="1.6" stroke-linecap="round"/>'),

    /* REMUME — uma pílula de duas cores, inclinada. */
    remume: svg('<g transform="rotate(-45 12 12)"><rect x="3" y="8" width="18" height="8" rx="4" fill="#fff" stroke="#C92A2A" stroke-width="1.6"/>' +
      '<path d="M12 8h5a4 4 0 0 1 0 8h-5z" fill="#FA5252" stroke="#C92A2A" stroke-width="1.6"/></g>'),

    /* Exames — três tubos de ensaio com líquido. */
    exames: svg('<path d="M10.5 3v14.5a1.5 1.5 0 0 0 3 0V3" fill="#fff" stroke="#0B7285" stroke-width="1.5"/>' +
      '<path d="M10.5 11h3v6.5a1.5 1.5 0 0 1-3 0z" fill="#22B8CF"/>' +
      '<path d="M9.5 3h5" stroke="#0B7285" stroke-width="1.5" stroke-linecap="round"/>' +
      '<path d="M16 6.5v9.5a1.4 1.4 0 0 0 2.8 0V6.5" fill="#fff" stroke="#0B7285" stroke-width="1.3"/>' +
      '<path d="M16 12.5h2.8V16a1.4 1.4 0 0 1-2.8 0z" fill="#99E9F2"/>' +
      '<path d="M5.2 6.5v9.5a1.4 1.4 0 0 0 2.8 0V6.5" fill="#fff" stroke="#0B7285" stroke-width="1.3"/>' +
      '<path d="M5.2 13.5H8V16a1.4 1.4 0 0 1-2.8 0z" fill="#66D9E8"/>'),

    /* Notificação — ficha com alerta: vai para a vigilância. */
    notificacao: svg(folha("#1971C2", "#D0EBFF") + '<path d="M12 11.5v3.5M12 18v.2" stroke="#1971C2" stroke-width="2" stroke-linecap="round"/>'),

    /* Aviso do município — triângulo de atenção. */
    aviso: svg('<path d="M12 3 2 20h20L12 3z" fill="#FFF3BF" stroke="#C92A2A" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M12 10v4M12 17.2v.3" stroke="#C92A2A" stroke-width="2.2" stroke-linecap="round"/>'),

    /* Alarme: o ícone É o estado (completo / discreto / silencioso). */
    sino: svg(SINO),
    "sino-baixo": svg(SINO + '<path d="M20.5 4.5a6 6 0 0 1 0 6" stroke="#D9480F" stroke-width="1.4" stroke-linecap="round"/>'),
    "sino-mudo": svg('<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9z" fill="#E9ECEF" stroke="#868E96" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M10 20.2a2.1 2.1 0 0 0 4 0" stroke="#868E96" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M3.5 3.5l17 17" stroke="#E03131" stroke-width="2" stroke-linecap="round"/>'),

    /* Ajustes — engrenagem. */
    engrenagem: svg('<path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8" stroke="#495057" stroke-width="2.6" stroke-linecap="round"/>' +
      '<circle cx="12" cy="12" r="6.2" fill="#DEE2E6" stroke="#495057" stroke-width="1.6"/>' +
      '<circle cx="12" cy="12" r="2.4" fill="#fff" stroke="#495057" stroke-width="1.6"/>'),
  };

  function obter(chave) {
    return Object.prototype.hasOwnProperty.call(ICONES, chave) ? ICONES[chave] : null;
  }

  raiz.MeedsSuiteIcones = { obter: obter, CHAVES: Object.keys(ICONES) };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
