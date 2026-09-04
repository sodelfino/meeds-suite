/* ------------------------------------------------------------------
 * core/atencao.js — para onde mandar um aviso, e por onde
 * ------------------------------------------------------------------
 * PARA QUE SERVE
 * Um aviso so serve se chegar onde o medico esta olhando. O alarme de
 * fila tinha banner, moldura e titulo piscando — tres sinais bonitos,
 * todos DENTRO da aba do Meeds. Quando o medico esta no Memed, no
 * prontuario ou em outra janela, que e justamente quando o alarme mais
 * importa, nenhum dos tres e visto por ninguem.
 *
 * Este arquivo nao decide QUANDO avisar (isso e do modulo). Ele decide
 * POR ONDE, e oferece os canais que funcionam fora da aba:
 *   - contador no titulo   ("(3) Meeds", como Gmail e Slack)
 *   - contador no favicone (desenhado no canvas, visivel na aba)
 *   - notificacao do sistema (aparece com o navegador minimizado, e
 *     CLICAVEL: traz a aba para frente)
 *
 * POR QUE NAO "PISCAR MAIS FORTE"
 * Duas razoes, e nenhuma e estetica:
 *   1. A WCAG 2.3.1 limita qualquer coisa a menos de tres flashes por
 *      segundo, por risco de crise fotossensivel. As animacoes daqui
 *      ficam perto de 1 Hz e somem inteiras com prefers-reduced-motion.
 *   2. Fadiga de alarme. Alarme demais faz o profissional ignorar o
 *      alarme — inclusive o que importava. A saida do setor nao foi
 *      volume, foi ESCADA: cada degrau muda de canal, e so escala se
 *      ninguem reagiu.
 *
 * PRIVACIDADE: nenhum texto de aviso deve conter dado de paciente. Quem
 * chama passa contagem e tempo de espera — nunca nome, nunca CPF. Uma
 * notificacao do sistema aparece na tela de bloqueio e no historico de
 * notificacoes do computador, fora do navegador e fora do nosso
 * controle: e o pior lugar possivel para um dado de paciente.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var doc = typeof document !== "undefined" ? document : null;

  /* ------------------------------------------------------------------
   * ONDE ESTA A ATENCAO DO MEDICO
   * ------------------------------------------------------------------
   * "aqui" = aba visivel E janela em foco. Qualquer outra combinacao e
   * "fora": aba de fundo, outra janela, outro app, tela bloqueada.
   * Nao ha meio-termo confiavel — "visivel mas sem foco" e uma janela
   * atras de outra, que na pratica e fora.
   * ------------------------------------------------------------------ */
  function ondeEstaOMedico() {
    if (!doc) return "fora";
    if (doc.visibilityState === "hidden") return "fora";
    if (typeof doc.hasFocus === "function" && !doc.hasFocus()) return "fora";
    return "aqui";
  }

  function aoMudarAtencao(fn) {
    if (!doc || typeof fn !== "function") return function () {};
    var mao = function () { fn(ondeEstaOMedico()); };
    doc.addEventListener("visibilitychange", mao);
    raiz.addEventListener("focus", mao);
    raiz.addEventListener("blur", mao);
    return function cancelar() {
      doc.removeEventListener("visibilitychange", mao);
      raiz.removeEventListener("focus", mao);
      raiz.removeEventListener("blur", mao);
    };
  }

  /* ------------------------------------------------------------------
   * CONTADOR NO TITULO DA ABA
   * ------------------------------------------------------------------
   * Substitui o titulo piscando. Piscar disputa atencao a cada segundo e
   * some quando o medico olha; "(3)" fica parado, e some sozinho quando
   * a fila esvazia. O reaplicador existe porque o Meeds e uma SPA e
   * reescreve o titulo ao navegar — sem ele, o contador sumiria na
   * primeira troca de tela.
   * ------------------------------------------------------------------ */
  var PREFIXO_RX = /^\((\d+)\)\s+/;
  var tituloLimpo = null;
  var contagemNoTitulo = 0;
  var reaplicador = null;

  function semPrefixo(texto) {
    return String(texto || "").replace(PREFIXO_RX, "");
  }

  function aplicarTitulo() {
    if (!doc) return;
    var desejado = contagemNoTitulo > 0 ? "(" + contagemNoTitulo + ") " + tituloLimpo : tituloLimpo;
    if (doc.title !== desejado) doc.title = desejado;
  }

  function marcarTitulo(contagem) {
    if (!doc) return;
    if (tituloLimpo === null) tituloLimpo = semPrefixo(doc.title);
    /* Se a SPA trocou o titulo por conta propria, o novo titulo e que
     * vale — so tiramos o nosso prefixo antes de guardar. */
    var atualSemPrefixo = semPrefixo(doc.title);
    if (atualSemPrefixo && atualSemPrefixo !== tituloLimpo) tituloLimpo = atualSemPrefixo;

    contagemNoTitulo = contagem > 0 ? contagem : 0;
    aplicarTitulo();

    if (contagemNoTitulo > 0 && !reaplicador) {
      reaplicador = setInterval(aplicarTitulo, 2000);
    } else if (contagemNoTitulo === 0 && reaplicador) {
      clearInterval(reaplicador);
      reaplicador = null;
    }
  }

  function limparTitulo() {
    marcarTitulo(0);
  }

  /* ------------------------------------------------------------------
   * CONTADOR NO FAVICONE
   * ------------------------------------------------------------------
   * Desenhado no canvas. A aba do Meeds costuma estar de fundo, e o
   * favicone e a unica parte dela que continua visivel na barra de abas.
   * ------------------------------------------------------------------ */
  var faviconeOriginal = null;
  var linkFavicone = null;

  function acharOuCriarLinkFavicone() {
    if (!doc) return null;
    var link = doc.querySelector('link[rel~="icon"]');
    if (!link) {
      link = doc.createElement("link");
      link.rel = "icon";
      (doc.head || doc.documentElement).appendChild(link);
    }
    return link;
  }

  function desenharFavicone(contagem) {
    try {
      var lado = 64;
      var canvas = doc.createElement("canvas");
      canvas.width = lado;
      canvas.height = lado;
      var ctx = canvas.getContext("2d");
      if (!ctx) return null;

      /* Fundo neutro: nao tentamos redesenhar o favicone do Meeds por
       * cima porque carregar a imagem original e assincrono e pode
       * falhar (origem cruzada, cache). Um quadrado solido com o numero
       * cumpre o papel e nunca falha pela metade. */
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(0, 0, lado, lado, 14);
      else ctx.rect(0, 0, lado, lado);
      ctx.fill();

      ctx.fillStyle = "#dc2626";
      ctx.beginPath();
      ctx.arc(lado / 2, lado / 2, lado / 2 - 4, 0, Math.PI * 2);
      ctx.fill();

      var texto = contagem > 99 ? "99+" : String(contagem);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold " + (texto.length > 2 ? 26 : 38) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(texto, lado / 2, lado / 2 + 2);

      return canvas.toDataURL("image/png");
    } catch (e) {
      return null;
    }
  }

  function marcarFavicone(contagem) {
    if (!doc) return;
    try {
      linkFavicone = linkFavicone || acharOuCriarLinkFavicone();
      if (!linkFavicone) return;
      if (faviconeOriginal === null) faviconeOriginal = linkFavicone.getAttribute("href") || "";
      var url = desenharFavicone(contagem);
      if (url) linkFavicone.setAttribute("href", url);
    } catch (e) {
      /* silencioso: favicone e reforco, nunca pode quebrar a pagina */
    }
  }

  function limparFavicone() {
    if (!linkFavicone || faviconeOriginal === null) return;
    try {
      if (faviconeOriginal) linkFavicone.setAttribute("href", faviconeOriginal);
      else linkFavicone.removeAttribute("href");
    } catch (e) {
      /* silencioso */
    }
  }

  /* ------------------------------------------------------------------
   * NOTIFICACAO DO SISTEMA
   * ------------------------------------------------------------------
   * O unico canal que atravessa o navegador. Duas regras:
   *   - permissao SO se pede a partir de um clique do medico (navegador
   *     ignora, e alguns punem, pedido sem gesto do usuario);
   *   - sempre com `tag`: uma notificacao SUBSTITUI a anterior em vez de
   *     empilhar. Vinte avisos parados no canto da tela sao a definicao
   *     de fadiga de alarme.
   * No Safari do iPad isto nao existe fora de app instalado — por isso
   * cada funcao degrada em silencio, e o alarme na tela continua sendo o
   * canal principal.
   * ------------------------------------------------------------------ */
  var TAG_PADRAO = "meeds-suite";

  function suportaNotificacao() {
    return typeof raiz.Notification === "function";
  }

  function permissaoDeNotificacao() {
    if (!suportaNotificacao()) return "indisponivel";
    return raiz.Notification.permission;
  }

  function pedirPermissaoDeNotificacao() {
    if (!suportaNotificacao()) return Promise.resolve(false);
    if (raiz.Notification.permission === "granted") return Promise.resolve(true);
    if (raiz.Notification.permission === "denied") return Promise.resolve(false);
    try {
      var r = raiz.Notification.requestPermission();
      /* Safari antigo usa callback em vez de promessa. */
      if (r && typeof r.then === "function") {
        return r.then(function (p) { return p === "granted"; }).catch(function () { return false; });
      }
      return new Promise(function (ok) {
        raiz.Notification.requestPermission(function (p) { ok(p === "granted"); });
      });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function notificar(opcoes) {
    var o = opcoes || {};
    if (permissaoDeNotificacao() !== "granted") return null;
    try {
      var n = new raiz.Notification(o.titulo || "Assistente Meeds", {
        body: o.corpo || "",
        tag: o.tag || TAG_PADRAO,
        renotify: true,
        requireInteraction: !!o.exigeInteracao,
        silent: true, // o som e do modulo, com o tipo e volume que o medico escolheu
      });
      n.onclick = function () {
        try { raiz.focus(); } catch (e) {}
        try { n.close(); } catch (e) {}
        if (typeof o.aoClicar === "function") o.aoClicar();
      };
      return n;
    } catch (e) {
      return null;
    }
  }

  /* ------------------------------------------------------------------
   * MANTER A TELA ACESA (Wake Lock)
   * ------------------------------------------------------------------
   * Para o plantao no iPad: alarme que toca com a tela apagada e alarme
   * perdido. O bloqueio cai sozinho quando a aba vai para o fundo, entao
   * ele e reconquistado quando ela volta.
   * ------------------------------------------------------------------ */
  var travaTela = null;
  var querTelaAcesa = false;
  var vigiaTela = null;

  function suportaTelaAcesa() {
    return !!(raiz.navigator && raiz.navigator.wakeLock && raiz.navigator.wakeLock.request);
  }

  function conquistarTrava() {
    if (!querTelaAcesa || !suportaTelaAcesa() || travaTela) return Promise.resolve(false);
    if (doc && doc.visibilityState !== "visible") return Promise.resolve(false);
    return raiz.navigator.wakeLock
      .request("screen")
      .then(function (t) {
        travaTela = t;
        t.addEventListener("release", function () { travaTela = null; });
        return true;
      })
      .catch(function () { return false; });
  }

  function manterTelaAcesa(ligar) {
    querTelaAcesa = !!ligar;
    if (!querTelaAcesa) {
      if (vigiaTela) { doc.removeEventListener("visibilitychange", vigiaTela); vigiaTela = null; }
      if (travaTela) {
        try { travaTela.release(); } catch (e) {}
        travaTela = null;
      }
      return Promise.resolve(false);
    }
    if (doc && !vigiaTela) {
      vigiaTela = function () { if (doc.visibilityState === "visible") conquistarTrava(); };
      doc.addEventListener("visibilitychange", vigiaTela);
    }
    return conquistarTrava();
  }

  /* ------------------------------------------------------------------
   * MARCAR / LIMPAR — os dois unicos que um modulo costuma chamar
   * ------------------------------------------------------------------ */
  function marcar(opcoes) {
    var o = opcoes || {};
    var contagem = parseInt(o.contagem, 10) || 0;
    marcarTitulo(contagem);
    if (contagem > 0) marcarFavicone(contagem);
    else limparFavicone();
    if (o.notificar && ondeEstaOMedico() === "fora") {
      return notificar({
        titulo: o.titulo,
        corpo: o.corpo,
        tag: o.tag,
        exigeInteracao: o.exigeInteracao,
        aoClicar: o.aoClicar,
      });
    }
    return null;
  }

  function limpar() {
    limparTitulo();
    limparFavicone();
  }

  raiz.MeedsSuiteAtencao = {
    ondeEstaOMedico: ondeEstaOMedico,
    aoMudarAtencao: aoMudarAtencao,
    marcar: marcar,
    limpar: limpar,
    notificar: notificar,
    suportaNotificacao: suportaNotificacao,
    permissaoDeNotificacao: permissaoDeNotificacao,
    pedirPermissaoDeNotificacao: pedirPermissaoDeNotificacao,
    suportaTelaAcesa: suportaTelaAcesa,
    manterTelaAcesa: manterTelaAcesa,
    /* expostos para teste */
    _marcarTitulo: marcarTitulo,
    _limparTitulo: limparTitulo,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
