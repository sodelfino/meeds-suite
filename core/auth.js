/* ------------------------------------------------------------------
 * core/auth.js — trava de frame + deteccao de login
 * ------------------------------------------------------------------
 * Os 5 scripts originais repetiam exatamente estas duas regras:
 *
 *  1) TRAVA DE FRAME: o widget de videochamada (meet.meeds.com.br) roda
 *     dentro de um <iframe> na mesma pagina do atendimento. Sem a trava,
 *     o Tampermonkey injeta o script tambem dentro do iframe e o botao
 *     aparece duplicado, preso na janela de video.
 *
 *  2) DETECCAO DE LOGIN: o Meeds renderiza a tela de login e a aplicacao
 *     autenticada sob a mesma URL, entao o caminho da pagina nao serve
 *     para decidir se o medico ja entrou. Sinal confiavel: a tela de
 *     login tem um campo de senha VISIVEL; a aplicacao autenticada, nao.
 *
 * Duas versoes da checagem existiam nos originais — uma so verificava a
 * existencia do campo (alarme/REMUME) e outra checava tambem se ele esta
 * de fato visivel (APAC/LME/CMD). A versao com checagem de visibilidade
 * e estritamente mais correta (um campo de senha escondido num formulario
 * inativo nao significa tela de login), entao e a que ficou no nucleo.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  function ehFramePrincipal() {
    try {
      return raiz.self === raiz.top;
    } catch (e) {
      // acesso cross-origin a window.top lanca — nesse caso estamos
      // dentro de um frame de outra origem, entao nao e o principal.
      return false;
    }
  }

  function elementoEstaVisivel(el) {
    var rect = el.getBoundingClientRect();
    var st = raiz.getComputedStyle(el);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      st.display !== "none" &&
      st.visibility !== "hidden" &&
      st.opacity !== "0"
    );
  }

  function estaNaTelaDeLogin() {
    try {
      var campos = document.querySelectorAll('input[type="password"]');
      for (var i = 0; i < campos.length; i++) {
        if (elementoEstaVisivel(campos[i])) return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  function estaLogado() {
    return !estaNaTelaDeLogin();
  }

  raiz.MeedsSuiteAuth = {
    ehFramePrincipal: ehFramePrincipal,
    estaNaTelaDeLogin: estaNaTelaDeLogin,
    estaLogado: estaLogado,
    elementoEstaVisivel: elementoEstaVisivel,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
