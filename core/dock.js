/* ------------------------------------------------------------------
 * core/dock.js — gerenciador de elementos flutuantes
 * ------------------------------------------------------------------
 * PROBLEMA QUE ESTE ARQUIVO RESOLVE
 * Nos 5 scripts separados, cada um posicionava o proprio botao com um
 * `bottom` fixo em pixel, coordenado NA MAO entre repositorios:
 *   APAC   -> bottom:24px  right:24px
 *   LME    -> bottom:88px  right:24px
 *   CMD    -> bottom:152px right:24px  (o comentario do arquivo ainda
 *             dizia 224px, ja fora de sincronia com o codigo)
 *   REMUME -> bottom:224px right:80px
 *   ALARME -> bottom:24px  left:24px + engrenagem em left:82px
 * Instalar ou remover um script quebrava a pilha inteira, e o CMD ja
 * estava com comentario e codigo divergentes — prova de que coordenar
 * pixel na mao nao escala.
 *
 * SOLUCAO
 * O dock e um flex-container fixo no canto inferior direito. Cada modulo
 * so DECLARA seu botao (rotulo, icone, prioridade) e o dock calcula o
 * empilhamento sozinho. Modulo nenhum escreve bottom/right/left.
 * Prioridade menor = mais embaixo na pilha (mais perto do canto).
 *
 * O dock tambem e dono de:
 *   - toast (mensagens curtas), que antes cada modulo posicionava sozinho;
 *   - overlay/modal em tela cheia, para que nenhum modulo precise de CSS
 *     de posicionamento proprio.
 *
 * Tudo vive dentro de um shadow root do proprio nucleo, entao o CSS do
 * Meeds nao vaza para dentro nem o nosso vaza para fora.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var ID_HOST = "meeds-suite-dock-host";
  var Z_BASE = 2147483000;

  var shadow = null;
  var elDock = null;
  var elToast = null;
  var botoes = []; // { id, prioridade, el, visivel }
  var timerToast = null;

  var ESTILOS = [
    ":host { all: initial; }",
    "* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; }",

    /* --- pilha de botoes --- */
    "#dock {",
    "  position: fixed; right: 24px; bottom: 24px; z-index: " + Z_BASE + ";",
    "  display: flex; flex-direction: column-reverse; align-items: flex-end; gap: 12px;",
    "  pointer-events: none;",
    "}",
    "#dock[hidden] { display: none; }",
    "#dock > * { pointer-events: auto; }",

    ".ms-btn {",
    "  display: flex; align-items: center; justify-content: center; gap: 8px;",
    "  background: #1a4fa0; color: #fff; border: none; border-radius: 999px;",
    "  padding: 13px 19px; font-size: 13.5px; font-weight: 800; cursor: pointer;",
    "  box-shadow: 0 8px 22px rgba(26,79,160,.4); line-height: 1.2; white-space: nowrap;",
    "  transition: transform .15s ease, box-shadow .15s ease, background .15s ease;",
    "}",
    ".ms-btn:hover { background: #0f3373; transform: translateY(-1px); }",
    ".ms-btn:active { transform: scale(.97); }",
    ".ms-btn[hidden] { display: none; }",

    /* botao redondo (icone puro), usado por REMUME e pela engrenagem */
    ".ms-btn.ms-btn-icone { width: 52px; height: 52px; padding: 0; border-radius: 50%; font-size: 24px; }",
    ".ms-btn.ms-btn-engrenagem {",
    "  width: 42px; height: 42px; font-size: 18px; padding: 0; border-radius: 50%;",
    "  background: #fff; color: #334155; border: 1px solid #e2e8f0;",
    "  box-shadow: 0 2px 10px rgba(15,23,42,.22);",
    "}",
    ".ms-btn.ms-btn-engrenagem:hover { background: #f1f5f9; }",

    /* estado ligado/alerta (usado pelo alarme de fila) */
    ".ms-btn.ms-ativo { background: linear-gradient(135deg, #f97316, #dc2626); box-shadow: 0 4px 18px rgba(220,38,38,.55); animation: ms-pulso 2.2s ease-in-out infinite; }",
    ".ms-btn.ms-ativo:hover { background: linear-gradient(135deg, #ea6a0c, #c31c1c); }",
    ".ms-btn.ms-neutro { background: linear-gradient(135deg, #64748b, #475569); box-shadow: 0 4px 14px rgba(71,85,105,.45); }",
    "@keyframes ms-pulso { 0%,100% { box-shadow: 0 4px 18px rgba(220,38,38,.55); } 50% { box-shadow: 0 4px 26px rgba(220,38,38,.9); } }",

    /* --- toast --- */
    "#toast {",
    "  position: fixed; right: 24px; bottom: 24px; z-index: " + (Z_BASE + 3) + ";",
    "  background: #16221f; color: #fff; padding: 9px 14px; border-radius: 8px;",
    "  font-size: 12px; line-height: 1.4; max-width: 340px;",
    "  box-shadow: 0 6px 16px rgba(0,0,0,.25);",
    "}",
    "#toast[hidden] { display: none; }",

    /* --- overlay/modal em tela cheia (dono do posicionamento) --- */
    ".ms-overlay {",
    "  position: fixed; inset: 0; z-index: " + (Z_BASE + 2) + ";",
    "  background: rgba(10,20,18,.55); display: flex; align-items: center;",
    "  justify-content: center; padding: 20px;",
    "}",
    ".ms-overlay[hidden] { display: none; }",

    /* --- banner de topo (alarme) --- */
    ".ms-banner {",
    "  position: fixed; top: 0; left: 0; right: 0; z-index: " + (Z_BASE + 4) + ";",
    "  display: flex; align-items: center; justify-content: center; gap: 16px;",
    "  padding: 14px 20px; color: #fff; font-size: 16px; font-weight: 700;",
    "  background: linear-gradient(90deg, #dc2626, #f97316, #dc2626);",
    "  background-size: 200% 100%; box-shadow: 0 4px 16px rgba(0,0,0,.3);",
    "  animation: ms-pisca-fundo 1.1s linear infinite;",
    "}",
    ".ms-banner[hidden] { display: none; }",
    "@keyframes ms-pisca-fundo { 0% { background-position: 0% 0%; } 100% { background-position: 200% 0%; } }",
    ".ms-banner button {",
    "  background: rgba(255,255,255,.2); border: 1.5px solid rgba(255,255,255,.7); color: #fff;",
    "  padding: 8px 16px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer;",
    "}",
    ".ms-banner button:hover { background: rgba(255,255,255,.35); }",
  ].join("\n");

  function garantirHost() {
    if (shadow) return shadow;
    var host = document.getElementById(ID_HOST);
    if (host && host.shadowRoot) {
      shadow = host.shadowRoot;
      elDock = shadow.getElementById("dock");
      elToast = shadow.getElementById("toast");
      return shadow;
    }
    host = document.createElement("div");
    host.id = ID_HOST;
    document.body.appendChild(host);
    shadow = host.attachShadow({ mode: "open" });

    var estilo = document.createElement("style");
    estilo.textContent = ESTILOS;
    shadow.appendChild(estilo);

    elDock = document.createElement("div");
    elDock.id = "dock";
    shadow.appendChild(elDock);

    elToast = document.createElement("div");
    elToast.id = "toast";
    elToast.hidden = true;
    shadow.appendChild(elToast);

    return shadow;
  }

  /* Reordena o DOM do dock conforme a prioridade declarada. Como o
   * container e column-reverse, o PRIMEIRO filho fica embaixo — entao
   * ordenar por prioridade crescente coloca o de menor prioridade mais
   * perto do canto, exatamente como o contrato promete. */
  function reordenar() {
    botoes.sort(function (a, b) {
      if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
      return String(a.id).localeCompare(String(b.id));
    });
    botoes.forEach(function (b) {
      elDock.appendChild(b.el);
    });
    reposicionarToast();
  }

  /* O toast fica logo acima da pilha, sem ninguem precisar somar pixel
   * na mao: mede a altura real do dock e desloca a partir dela. */
  function reposicionarToast() {
    if (!elToast || !elDock) return;
    var altura = 0;
    try {
      altura = elDock.getBoundingClientRect().height;
    } catch (e) {
      altura = 0;
    }
    elToast.style.bottom = 24 + (altura > 0 ? altura + 12 : 0) + "px";
  }

  /* ------------------------------------------------------------------
   * API PUBLICA
   * ------------------------------------------------------------------ */

  /* registrarBotao({ id, rotulo, icone, prioridade, titulo, variante, aoClicar })
   * Retorna um handle com o que o modulo pode mexer NO SEU botao —
   * e nada mais. Posicao nao esta no handle de proposito. */
  function registrarBotao(spec) {
    garantirHost();
    removerBotao(spec.id); // idempotente: re-registrar substitui

    var el = document.createElement("button");
    el.type = "button";
    el.className = "ms-btn";
    if (spec.variante === "icone") el.classList.add("ms-btn-icone");
    if (spec.variante === "engrenagem") el.classList.add("ms-btn-icone", "ms-btn-engrenagem");
    el.title = spec.titulo || spec.rotulo || "";
    el.textContent = spec.variante === "icone" || spec.variante === "engrenagem"
      ? spec.icone || spec.rotulo || ""
      : (spec.icone ? spec.icone + " " : "") + (spec.rotulo || "");
    if (typeof spec.aoClicar === "function") el.addEventListener("click", spec.aoClicar);

    var registro = {
      id: spec.id,
      prioridade: typeof spec.prioridade === "number" ? spec.prioridade : 100,
      el: el,
    };
    botoes.push(registro);
    elDock.appendChild(el);
    reordenar();

    return {
      elemento: el,
      definirTexto: function (icone, rotulo) {
        el.textContent = rotulo ? icone + " " + rotulo : icone;
        reposicionarToast();
      },
      definirTitulo: function (t) {
        el.title = t;
      },
      definirClasse: function (nome, ligado) {
        el.classList.toggle(nome, !!ligado);
      },
      mostrar: function () {
        el.hidden = false;
        reposicionarToast();
      },
      esconder: function () {
        el.hidden = true;
        reposicionarToast();
      },
      remover: function () {
        removerBotao(spec.id);
      },
    };
  }

  function removerBotao(id) {
    for (var i = botoes.length - 1; i >= 0; i--) {
      if (botoes[i].id === id) {
        if (botoes[i].el.parentNode) botoes[i].el.parentNode.removeChild(botoes[i].el);
        botoes.splice(i, 1);
      }
    }
    reposicionarToast();
  }

  /* Esconde/mostra a pilha inteira de uma vez — usado pelo nucleo na
   * tela de login (regra que os 5 scripts implementavam separado). */
  function definirVisibilidadeGeral(visivel) {
    garantirHost();
    elDock.hidden = !visivel;
    if (!visivel && elToast) elToast.hidden = true;
  }

  function toast(mensagem, ms) {
    garantirHost();
    elToast.textContent = mensagem;
    elToast.hidden = false;
    reposicionarToast();
    clearTimeout(timerToast);
    timerToast = setTimeout(function () {
      elToast.hidden = true;
    }, ms || 3000);
  }

  /* criarOverlay(html) — devolve um overlay em tela cheia ja posicionado
   * pelo nucleo. O modulo so entrega o conteudo interno e o CSS do
   * proprio conteudo; posicionamento nao e problema dele. */
  function criarOverlay(opcoes) {
    garantirHost();
    opcoes = opcoes || {};
    var overlay = document.createElement("div");
    overlay.className = "ms-overlay";
    overlay.hidden = true;

    if (opcoes.estilo) {
      var st = document.createElement("style");
      st.textContent = opcoes.estilo;
      shadow.appendChild(st);
      overlay.__estilo = st;
    }
    if (opcoes.html) overlay.innerHTML = opcoes.html;

    overlay.addEventListener("click", function (ev) {
      if (ev.target === overlay && opcoes.fecharAoClicarFora !== false) overlay.hidden = true;
    });
    shadow.appendChild(overlay);

    return {
      elemento: overlay,
      $: function (seletor) {
        return overlay.querySelector(seletor);
      },
      $$: function (seletor) {
        return Array.prototype.slice.call(overlay.querySelectorAll(seletor));
      },
      abrir: function () {
        overlay.hidden = false;
      },
      fechar: function () {
        overlay.hidden = true;
      },
      estaAberto: function () {
        return !overlay.hidden;
      },
      remover: function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (overlay.__estilo && overlay.__estilo.parentNode) {
          overlay.__estilo.parentNode.removeChild(overlay.__estilo);
        }
      },
    };
  }

  /* Banner de topo (usado pelo alarme de fila). Tambem posicionado pelo
   * nucleo — o modulo so diz o texto e o que o botao faz. */
  function criarBanner(html) {
    garantirHost();
    var banner = document.createElement("div");
    banner.className = "ms-banner";
    banner.hidden = true;
    banner.innerHTML = html;
    shadow.appendChild(banner);
    return {
      elemento: banner,
      $: function (s) {
        return banner.querySelector(s);
      },
      mostrar: function () {
        banner.hidden = false;
      },
      esconder: function () {
        banner.hidden = true;
      },
      remover: function () {
        if (banner.parentNode) banner.parentNode.removeChild(banner);
      },
    };
  }

  /* Ponto de extensao para conteudo solto no shadow do nucleo (raro). */
  function adicionarEstilo(css) {
    garantirHost();
    var st = document.createElement("style");
    st.textContent = css;
    shadow.appendChild(st);
    return st;
  }

  raiz.MeedsSuiteDock = {
    garantirHost: garantirHost,
    registrarBotao: registrarBotao,
    removerBotao: removerBotao,
    definirVisibilidadeGeral: definirVisibilidadeGeral,
    toast: toast,
    criarOverlay: criarOverlay,
    criarBanner: criarBanner,
    adicionarEstilo: adicionarEstilo,
    _reposicionarToast: reposicionarToast,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
