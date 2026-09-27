/* ------------------------------------------------------------------
 * core/log.js — o adaptador de log do Assistente
 * ------------------------------------------------------------------
 * O unico lugar do codigo de navegador que fala com o console
 * diretamente. Todo o resto usa MeedsSuiteLog.debug/info/warn/error,
 * e o lint (quality/no-direct-console, em "error") nao deixa voltar a
 * espalhar console.* pelos arquivos.
 *
 * POR QUE UM ADAPTADOR, se ele so repassa: e o ponto unico para mudar o
 * comportamento de log um dia (silenciar debug em producao, anexar a
 * versao, mandar para o diagnostico) sem editar dezenas de arquivos.
 * Hoje ele NAO muda nada — mesma mensagem, mesmo nivel, mesmo console.
 *
 * O console e procurado NA HORA da chamada, nao guardado na carga: o
 * diagnostico tecnico (core/diagnostico-tecnico.js) troca console.warn e
 * companhia por versoes que gravam o historico, e o log precisa passar
 * por elas para continuar aparecendo em "copiar diagnostico".
 *
 * Carregado PRIMEIRO no nucleo (manifest.json), antes de qualquer
 * arquivo que registre algo.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  function repassar(nivel) {
    return function () {
      const c = raiz.console;
      if (c && typeof c[nivel] === "function") c[nivel].apply(c, arguments);
    };
  }

  raiz.MeedsSuiteLog = {
    debug: repassar("debug"),
    info: repassar("info"),
    warn: repassar("warn"),
    error: repassar("error"),
    log: repassar("log"),
    table: repassar("table"), // diagnostico da Sala de Espera, no console do navegador
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
