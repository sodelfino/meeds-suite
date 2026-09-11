/* ------------------------------------------------------------------
 * core/noturno.js
 * ------------------------------------------------------------------
 * Botão "Noturno" em ⚙️ → Sobre. Enquanto ligado, despacha um
 * "mousemove" e um "scroll" sintéticos no documento a cada 30 minutos —
 * o suficiente para o detector de inatividade do próprio Meeds não
 * contar aquele tempo como parado, sem depender de saber o texto exato
 * do aviso de sessão expirando (não temos essa tela registrada).
 *
 * ESTE ARQUIVO ENFRAQUECE UM CONTROLE DE SEGURANÇA, DE PROPÓSITO — SÓ
 * FAZ SENTIDO EM COMPUTADOR DE USO EXCLUSIVO DO MÉDICO. Numa máquina
 * compartilhada, desligar o logout por inatividade deixa uma sessão
 * autenticada aberta indefinidamente para quem se aproximar. Por isso:
 *   - fica DESLIGADO por padrão, como qualquer preferência nova;
 *   - não há painel de ajustes nem descrição na lista de Funções — é só
 *     este botão discreto, pedido assim de propósito;
 *   - não lê nem grava dado de paciente, e não faz requisição própria:
 *     só eventos de DOM sintéticos, sem conteúdo nenhum para vazar.
 *
 * "mousemove" e "scroll" foram escolhidos porque são os dois sinais que
 * praticamente todo detector de inatividade escuta, e nenhum dos dois
 * aciona atalho de teclado nem navegação — ao contrário de simular
 * tecla ou clique, que poderiam disparar uma ação real do Meeds sem o
 * médico perceber. Os eventos são despachados em document/window, não
 * em cima de nenhum elemento — não há botão nem link "clicado" de
 * verdade em lugar nenhum.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var CHAVE = "noturno_ativo";
  var INTERVALO_MS = 30 * 60 * 1000; // 30 em 30 minutos

  var storage = null;
  var timer = null;

  function simularAtividade() {
    try {
      var doc = raiz.document;
      if (!doc) return;
      var x = Math.round((raiz.innerWidth || 800) / 2);
      var y = Math.round((raiz.innerHeight || 600) / 2);
      doc.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, cancelable: true, clientX: x, clientY: y })
      );
      doc.dispatchEvent(new Event("scroll", { bubbles: true, cancelable: true }));
      raiz.dispatchEvent(new Event("scroll", { bubbles: true, cancelable: true }));
      console.debug("[Assistente Meeds] noturno: atividade simulada");
    } catch (e) {
      /* nunca derruba o resto do Assistente por causa disto */
    }
  }

  function ligarTemporizador() {
    if (timer) return;
    timer = raiz.setInterval(simularAtividade, INTERVALO_MS);
  }

  function desligarTemporizador() {
    if (timer) {
      raiz.clearInterval(timer);
      timer = null;
    }
  }

  function estaLigado() {
    return !!(storage && storage.ler(CHAVE, false) === true);
  }

  /* Liga/desliga e devolve o novo estado — quem chama (o botão no Sobre)
   * so precisa refletir o que isto devolve. */
  function alternar() {
    var novo = !estaLigado();
    if (storage) storage.gravar(CHAVE, novo);
    if (novo) ligarTemporizador();
    else desligarTemporizador();
    return novo;
  }

  /* Chamado uma vez no boot do núcleo. Se o médico já tinha ligado numa
   * sessão anterior, o temporizador volta sozinho — sem precisar abrir
   * o Sobre de novo a cada plantão. */
  function iniciar() {
    if (!raiz.MeedsSuiteStorage) return;
    storage = raiz.MeedsSuiteStorage.storageDoNucleo();
    if (estaLigado()) ligarTemporizador();
  }

  raiz.MeedsSuiteNoturno = {
    iniciar: iniciar,
    alternar: alternar,
    estaLigado: estaLigado,
    /* exposto so para teste */
    _simularAtividade: simularAtividade,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
