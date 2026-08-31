// ==UserScript==
// @name         Teste do Assistente para iPad
// @namespace    novetech-meeds-teste
// @version      3
// @description  Script minimo de diagnostico: mostra uma faixa no topo do Meeds dizendo que rodou e em que escopo.
// @author       Marcelo
// @match        *://*.meeds.com.br/*
// @grant        none
// @inject-into  auto
// @run-at       document-end
// ==/UserScript==

/* Nao tem @require, nao tem biblioteca, nao tem rede. Se esta faixa
 * aparecer, o Userscripts instala e executa neste iPad — e qualquer
 * problema restante esta no pacote do Assistente, nao na extensao. */
(function () {
  "use strict";

  /* Mesmo teste de escopo do nucleo: manda a PAGINA cravar uma marca.
   * Se ela chegar ate aqui, "aqui" e a pagina; senao, e o escopo isolado. */
  var marca = "__meedsTesteEscopo";
  var escopo = "isolado";
  try {
    var tag = document.createElement("script");
    tag.textContent = "window['" + marca + "']=1;";
    (document.documentElement || document.head).appendChild(tag);
    tag.remove();
    if (window[marca] === 1) escopo = "pagina";
    delete window[marca];
  } catch (e) {}

  var faixa = document.createElement("div");
  faixa.textContent =
    escopo === "pagina"
      ? "✅ Funcionou — escopo: PAGINA (tudo disponivel)"
      : "✅ Funcionou — escopo: ISOLADO (a CSP do site barrou a pagina)";
  faixa.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:2147483647;" +
    "background:#0a7d32;color:#fff;font:600 15px/1.4 system-ui,sans-serif;" +
    "padding:10px 14px;text-align:center;";
  faixa.addEventListener("click", function () {
    faixa.remove();
  });
  (document.body || document.documentElement).appendChild(faixa);
})();
