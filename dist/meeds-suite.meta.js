// ==UserScript==
// @name         Assistente Meeds - Por: Marcelo
// @namespace    novetech-meeds-suite
// @version      2.38.0
// @description  Assistente Meeds - Por: Marcelo. Alarme de fila, APAC de Itauna, laudos de Sete Lagoas e Conceicao do Mato Dentro e consulta a REMUME, numa instalacao unica. Cada funcao liga e desliga no painel da engrenagem. Nenhum dado de paciente e salvo em disco.
// @author       Marcelo
// @match        *://*.meeds.com.br/*
// @match        *://doctor-calltech.meeds.com.br/*
// @exclude      *://*web-calltech-*.meeds.com.br/*
// @exclude      *://meet.meeds.com.br/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js#sha512=qZvrmS2ekKPF2mSznTQsxqPgnpkI4DNTlrdUmTzrDgektczlKNRRhy5X5AAOnx5S09ydFYWWNSfcEqDTTHgtNA==
// @require      https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js#sha512=z8IYLHO8bTgFqj+yrPyIJnzBDf7DDhWwiEsk4sY+Oe6J2M+WQequeGS7qioI5vT6rXgVRb4K1UVQC5ER7MKzKQ==
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @run-at       document-start
// @updateURL    https://github.com/sodelfino/meeds-suite/releases/latest/download/meeds-suite.meta.js
// @downloadURL  https://github.com/sodelfino/meeds-suite/releases/latest/download/meeds-suite.user.js
// ==/UserScript==
