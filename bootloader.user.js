// ==UserScript==
// @name         Assistente Meeds - Por: Marcelo
// @namespace    novetech-meeds-suite
// @version      2.0.0
// @description  Assistente Meeds - Por: Marcelo. Alarme de fila, APAC de Itauna, laudos de Sete Lagoas e Conceicao do Mato Dentro e consulta a REMUME, numa instalacao unica. Cada funcao liga e desliga no painel da engrenagem. Nenhum dado de paciente e salvo em disco.
// @author       Marcelo
// @match        *://*.meeds.com.br/*
// @match        *://doctor-calltech.meeds.com.br/*
// @exclude      *://*web-calltech-*.meeds.com.br/*
// @exclude      *://meet.meeds.com.br/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @connect      cdnjs.cloudflare.com
// @connect      raw.githubusercontent.com
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/sodelfino/meeds-suite/main/dist/meeds-suite.meta.js
// @downloadURL  https://raw.githubusercontent.com/sodelfino/meeds-suite/main/dist/meeds-suite.user.js
// ==/UserScript==

/* ------------------------------------------------------------------
 * BOOTLOADER — o UNICO arquivo que o medico instala
 * Assistente Meeds — Por: Marcelo
 * ------------------------------------------------------------------
 * Este arquivo e o ESQUELETO. O artefato que o medico instala e
 * dist/meeds-suite.user.js, gerado por `node scripts/build.js`, que
 * substitui os marcadores abaixo pelo nucleo e pelos modulos
 * habilitados no manifest.json.
 *
 * Responsabilidades do bootloader (e so estas):
 *   1. rodar cedo (@run-at document-start) para o hook UNICO de rede do
 *      nucleo estar instalado antes da primeira chamada da aplicacao;
 *   2. respeitar a trava de frame antes de qualquer outra coisa;
 *   3. instalar o hook de rede;
 *   4. carregar nucleo e modulos;
 *   5. subir o nucleo quando o DOM estiver pronto.
 *
 * O bootloader NAO conhece regra de negocio de nenhum modulo.
 * ------------------------------------------------------------------ */
(function () {
  "use strict";

  /* 1) TRAVA DE FRAME — antes de tudo.
   * O widget de videochamada roda num <iframe> na mesma pagina do
   * atendimento; sem isto, o Tampermonkey injetaria a suite inteira
   * dentro do video tambem. Nos 5 scripts antigos essa checagem estava
   * copiada cinco vezes. */
  if (window.self !== window.top) return;

  var raiz = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  /* __MEEDS_SUITE_NUCLEO__ */

  /* 1.1) INSTANCIA UNICA — antes de instalar hook ou criar UI.
   * A trava de frame acima cobre o iframe da videochamada. Esta marca
   * cobre o resto: duas copias instaladas no Tampermonkey, ou uma
   * reexecucao do script numa navegacao da SPA. Sem ela, apareciam dois
   * docks sobrepostos e o alarme tocava duas vezes. */
  if (!raiz.MeedsSuiteDiagnostico.reservarInstancia("__VERSAO__")) return;

  /* 2) O hook de rede precisa existir ANTES de qualquer chamada da
   * aplicacao — por isso e instalado aqui, em document-start, e nao
   * dentro do iniciar() que espera o DOM. */
  raiz.MeedsSuiteNetwork.instalar();

  /* __MEEDS_SUITE_MODULOS__ */

  /* 3) A UI so pode ser montada com <body> disponivel. */
  function subir() {
    try {
      raiz.MeedsSuite.iniciar({
        manifesto: raiz.__MEEDS_SUITE_MANIFESTO__ || null,
      });
    } catch (e) {
      console.error("[Assistente Meeds] falha ao iniciar o nucleo:", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", subir);
  } else {
    subir();
  }
})();
