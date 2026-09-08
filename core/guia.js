/* ------------------------------------------------------------------
 * core/guia.js — mostrar o caminho sem trancar a porta
 * ------------------------------------------------------------------
 * POR QUE ISTO EXISTE, E POR QUE NAO E UM CASCATEAMENTO
 * O pedido original era travar os campos e ir liberando conforme o
 * medico preenche, como o municipio ja libera o estabelecimento. A
 * intencao e boa — dar senso de caminho a quem nao conhece o formulario
 * — mas travar o formulario inteiro cobra caro em quatro frentes, e
 * todas apareceram na revisao cross-functional:
 *
 *   1. O medico nao preenche em ordem. Os dados do paciente entram
 *      sozinhos pela tela, a parte clinica vem de um modelo salvo, e o
 *      CID muitas vezes e o primeiro que ele sabe.
 *   2. Colide com os modelos salvos: um modelo preenche procedimento,
 *      CID e justificativa de uma vez. Com esses campos travados, ou o
 *      modelo nao aplica, ou ele destrava — e ai a trava e mentira.
 *   3. Campo cinza nao se explica sozinho. O usuario conclui "quebrou"
 *      e abre chamado. Ja aconteceu nesta suite, com o botao de avisos.
 *   4. `disabled` tira o campo da navegacao por teclado e do leitor de
 *      tela. Quem preenche por Tab perde a referencia.
 *
 * E, principalmente: o documento incompleto JA nao sai. "Gerar PDF"
 * recusa e nomeia cada campo que falta. O cascateamento resolveria um
 * problema que a validacao de emissao ja resolve, cobrando o preco
 * acima.
 *
 * ENTAO: guiar, nao trancar. Uma barra de progresso, o proximo campo
 * pendente apontado, e a emissao rolando ate o primeiro que falta em vez
 * de so listar. O medico novo ganha o mesmo senso de caminho; o
 * plantonista que faz quarenta laudos e conhece o formulario de cor nao
 * perde um clique.
 *
 * A trava continua existindo ONDE HA DEPENDENCIA REAL DE DADO —
 * municipio libera estabelecimento, procedimento libera territorio
 * vascular. Ali o campo nao pode ser preenchido corretamente antes, e a
 * trava informa em vez de atrapalhar. Ver D32 em docs/ARQUITETURA.md.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var CSS = [
    ".msg-guia { display:flex; align-items:center; gap:10px; margin-bottom:12px; }",
    ".msg-barra { flex:1; height:6px; border-radius:99px; background:#e3ebe9; overflow:hidden; }",
    ".msg-preenchido { height:100%; width:0; border-radius:99px; background:#12958a; transition:width .25s ease; }",
    ".msg-preenchido.completo { background:#0b6a62; }",
    ".msg-texto { font-size:11px; font-weight:700; color:#5b6c68; white-space:nowrap; }",
    ".msg-proximo { background:none; border:none; padding:0; font:inherit; font-size:11px; font-weight:700; color:#0e7a70; cursor:pointer; text-decoration:underline; white-space:nowrap; }",
    ".msg-proximo:hover { color:#0b6a62; }",
    ".msg-proximo[hidden] { display:none; }",
    /* O destaque some sozinho: um campo que fica marcado para sempre
       vira decoracao e para de significar "e este aqui". */
    ".msg-alvo { outline:2px solid #17ab9e !important; outline-offset:1px; border-radius:7px; }",
    "@media (prefers-reduced-motion: reduce) { .msg-preenchido { transition:none; } }",
  ].join("\n");

  /* ------------------------------------------------------------------
   * criar({ aplicaveis, faltando, elementoDe })
   * ------------------------------------------------------------------
   * O guia NAO decide o que falta: ele pergunta ao gerador, pela MESMA
   * funcao que ja recusa a emissao. Isso e a coisa mais importante deste
   * arquivo — uma barra que chega a 100% enquanto o botao "Gerar" ainda
   * recusa e pior que nao ter barra nenhuma, porque ensina o medico a
   * nao confiar no que a tela diz.
   *
   *   aplicaveis()  -> campos exigidos AGORA (a APAC so pede territorio
   *                    vascular quando o procedimento e Doppler)
   *   faltando()    -> subconjunto ainda vazio
   *   elementoDe(c) -> o elemento na tela, para apontar
   * ------------------------------------------------------------------ */
  function criar(spec) {
    var aplicaveis = spec.aplicaveis;
    var faltando = spec.faltando;
    var elementoDe = spec.elementoDe;
    var alvoAtual = null;
    var timerDestaque = null;

    var caixa = document.createElement("div");
    caixa.className = "msg-guia";
    caixa.innerHTML =
      '<div class="msg-barra"><div class="msg-preenchido"></div></div>' +
      '<span class="msg-texto"></span>' +
      '<button type="button" class="msg-proximo" hidden></button>';

    var barra = caixa.querySelector(".msg-preenchido");
    var texto = caixa.querySelector(".msg-texto");
    var proximo = caixa.querySelector(".msg-proximo");

    function limparDestaque() {
      if (timerDestaque) { clearTimeout(timerDestaque); timerDestaque = null; }
      if (alvoAtual) { alvoAtual.classList.remove("msg-alvo"); alvoAtual = null; }
    }

    function apontar(campo) {
      limparDestaque();
      var el = campo && elementoDe(campo);
      if (!el) return false;
      alvoAtual = el;
      el.classList.add("msg-alvo");
      try {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        if (typeof el.focus === "function") el.focus({ preventScroll: true });
      } catch (e) {
        /* silencioso: apontar nunca pode atrapalhar o preenchimento */
      }
      /* O destaque sai sozinho: um campo marcado para sempre vira
       * decoracao e para de significar "e este aqui". */
      timerDestaque = setTimeout(limparDestaque, 2600);
      return true;
    }

    proximo.addEventListener("click", function () {
      var falta = faltando();
      if (falta.length) apontar(falta[0]);
    });

    function atualizar() {
      var falta = faltando();
      var total = aplicaveis().length;
      var prontos = Math.max(0, total - falta.length);
      var pct = total ? Math.round((prontos / total) * 100) : 100;

      barra.style.width = pct + "%";
      barra.classList.toggle("completo", falta.length === 0);

      if (!falta.length) {
        texto.textContent = "Tudo preenchido";
        proximo.hidden = true;
      } else {
        texto.textContent = prontos + " de " + total;
        proximo.hidden = false;
        proximo.textContent = "Falta: " + (falta[0].rotulo || falta[0].id);
      }
    }

    return {
      elemento: caixa,
      atualizar: atualizar,
      /* Usado pela emissao: em vez de so listar o que falta, leva o
       * medico ate o primeiro campo. */
      apontarPrimeiroPendente: function () {
        var falta = faltando();
        return falta.length ? apontar(falta[0]) : false;
      },
      limparDestaque: limparDestaque,
    };
  }

  raiz.MeedsSuiteGuia = { CSS: CSS, criar: criar };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
