// ==UserScript==
// @name         Teste de instalacao - Assistente Meeds
// @namespace    novetech-meeds-teste
// @version      1.0.0
// @description  Script minimo, so para conferir se o Userscripts esta instalando e rodando no iPad. Nao faz nada alem de mostrar uma faixa verde no topo da tela do Meeds.
// @author       Marcelo
// @match        *://*.meeds.com.br/*
// @match        *://doctor-calltech.meeds.com.br/*
// @grant        none
// @inject-into page
// @run-at       document-end
// ==/UserScript==

/* ------------------------------------------------------------------
 * PARA QUE ESTE ARQUIVO EXISTE
 * Quando o Assistente nao aparece no iPad, ha duas explicacoes bem
 * diferentes: ou o Userscripts nao esta instalando/rodando nada, ou ele
 * roda mas engasga com o pacote grande do Assistente (1 MB, com dois
 * @require).
 *
 * Este script separa as duas. Ele tem 20 linhas, nenhum @require e nao
 * depende de nada. Se a faixa verde aparecer, o Userscripts esta OK e o
 * problema e o pacote. Se nao aparecer, o problema e a instalacao — e
 * nem adianta mexer no Assistente.
 * ------------------------------------------------------------------ */
(function () {
  "use strict";
  if (window.self !== window.top) return;

  function mostrar() {
    if (document.getElementById("teste-meeds")) return;
    var faixa = document.createElement("div");
    faixa.id = "teste-meeds";
    faixa.textContent = "✅ Userscripts está funcionando neste iPad";
    faixa.style.cssText =
      "position:fixed;top:0;left:0;right:0;z-index:2147483647;" +
      "background:#12958a;color:#fff;font:700 15px -apple-system,sans-serif;" +
      "text-align:center;padding:12px;box-shadow:0 2px 10px rgba(0,0,0,.3)";
    faixa.addEventListener("click", function () {
      faixa.remove();
    });
    document.body.appendChild(faixa);
  }

  if (document.body) mostrar();
  else document.addEventListener("DOMContentLoaded", mostrar);
})();
