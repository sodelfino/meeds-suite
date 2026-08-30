/* ------------------------------------------------------------------
 * core/formatos.js — mascaras e formatacao de campos
 * ------------------------------------------------------------------
 * Fica no nucleo para que os cinco modulos (e um sexto) formatem CPF do
 * mesmo jeito. Antes cada gerador tinha a sua funcao formatarCpf, e
 * nenhum deles formatava ENQUANTO o medico digitava — ele tinha que
 * digitar os pontos e o traco na mao, ou colar torto e nao perceber.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  function soDigitos(v) {
    return String(v || "").replace(/\D/g, "");
  }

  /* 000.000.000-00 — formata o que der, sem exigir os 11 digitos.
   * Assim o campo vai se montando enquanto o medico digita, em vez de
   * so mudar de cara no ultimo caractere. */
  function formatarCpf(valor) {
    var d = soDigitos(valor).slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0, 3) + "." + d.slice(3);
    if (d.length <= 9) return d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6);
    return d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6, 9) + "-" + d.slice(9);
  }

  function cpfCompleto(valor) {
    return soDigitos(valor).length === 11;
  }

  /* Aplica a mascara num <input>. Preserva a posicao do cursor quando o
   * medico edita no meio do texto — sem isso, o cursor pula para o fim a
   * cada tecla e corrigir um digito no meio vira um sofrimento. */
  function aplicarMascaraCpf(input) {
    if (!input || input.__mascaraCpf) return;
    input.__mascaraCpf = true;
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("maxlength", "14");
    if (!input.getAttribute("placeholder")) input.setAttribute("placeholder", "000.000.000-00");

    input.addEventListener("input", function () {
      var antes = input.value;
      var posicao = input.selectionStart;
      var digitosAntesDoCursor = soDigitos(antes.slice(0, posicao)).length;

      input.value = formatarCpf(antes);

      // recoloca o cursor depois do mesmo digito em que ele estava
      var novaPos = 0;
      var contados = 0;
      while (novaPos < input.value.length && contados < digitosAntesDoCursor) {
        if (/\d/.test(input.value[novaPos])) contados++;
        novaPos++;
      }
      try {
        input.setSelectionRange(novaPos, novaPos);
      } catch (e) {
        /* campos que nao suportam selecao: ignora */
      }
    });

    // colar tambem passa pela mascara
    input.addEventListener("blur", function () {
      input.value = formatarCpf(input.value);
    });
  }

  raiz.MeedsSuiteFormatos = {
    soDigitos: soDigitos,
    formatarCpf: formatarCpf,
    cpfCompleto: cpfCompleto,
    aplicarMascaraCpf: aplicarMascaraCpf,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
