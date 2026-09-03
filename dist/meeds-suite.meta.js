// ==UserScript==
// @name         Assistente Meeds - Por: Marcelo
// @namespace    novetech-meeds-suite
// @version      2.17.1
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
