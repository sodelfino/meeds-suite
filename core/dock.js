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
  var elAvisos = null;
  var botoes = []; // { id, prioridade, el, visivel }
  var elAlca = null;
  var recolhido = false;
  var aoAlternar = null;
  var translucido = true;      // preferencia do medico (o nucleo carrega)
  var timerAdormecer = null;

  /* Quanto tempo depois da ultima interacao a pilha volta a desaparecer.
   * 2,5s foi escolhido para cobrir o intervalo entre soltar o mouse e
   * decidir o proximo clique. Menos que isso e a pilha some enquanto o
   * medico ainda esta mirando; muito mais e ela deixa de sair do
   * caminho, que e o motivo de existir. */
  var MS_ATE_ADORMECER = 2500;
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

    /* --- caixa recolhida ---------------------------------------------
     * Com todas as funcoes ligadas a pilha ocupa boa parte da lateral.
     * Recolhida, sobra uma alca no canto e o resto da tela e do medico.
     *
     * Tres regras, e a ordem entre elas importa:
     *
     * 1. Recolhido esconde os botoes — MENOS o que estiver em alerta.
     *    Se a fila encheu, o alarme sai da caixa e continua piscando.
     *    Esconder um alerta e o oposto do que ele existe para fazer.
     *
     * 2. No computador, passar o mouse perto do canto ja abre: zero
     *    clique. O `@media (hover:hover) and (pointer:fine)` e o que
     *    impede isso de valer no iPad, onde "hover" e um toque preso e
     *    a caixa abriria sozinha ao rolar a tela.
     *
     * 3. Botao escondido por um modulo (`[hidden]`) continua escondido
     *    mesmo com o mouse por cima. A regra abaixo carrega o #dock so
     *    para ganhar da regra de hover na especificidade — sem isso, o
     *    hover ressuscitaria botoes que o modulo desligou. */
    ".ms-alca { width: 44px; height: 44px; padding: 0; border-radius: 50%; font-size: 17px;",
    "  background: #fff; color: #334155; border: 1px solid #e2e8f0;",
    "  box-shadow: 0 2px 10px rgba(15,23,42,.22); }",
    ".ms-alca:hover { background: #f1f5f9; }",
    "#dock.ms-recolhido .ms-btn:not(.ms-alca):not(.ms-ativo) { display: none; }",
    "#dock .ms-btn[hidden] { display: none; }",

    /* --- translucidez em repouso ------------------------------------
     * O que o medico pediu: que a pilha nao atrapalhe a leitura da tela
     * quando ele nao esta usando, e que abrir e fechar seja decisao
     * dele, nao do ponteiro.
     *
     * A VERSAO ANTERIOR ABRIA A PILHA NO HOVER, E ISSO ESTAVA ERRADO
     * POR DOIS MOTIVOS CONCRETOS:
     *   1. o canto inferior direito e rota de passagem, nao destino:
     *      atravessar a regiao fazia sete itens saltarem sobre o
     *      conteudo sem ninguem ter pedido;
     *   2. como so ficava aberto enquanto o ponteiro estivesse dentro,
     *      cortar caminho na diagonal para alcancar um botao fechava a
     *      caixa no meio do movimento.
     *
     * O hover aqui continua existindo, mas mexendo SO NA OPACIDADE. A
     * diferenca nao e detalhe: opacidade nao desloca nada, nao cobre
     * conteudo novo e nao muda a area clicavel — entao nao ha como
     * "sair sem querer" de algo que nao mudou de lugar. Layout no hover
     * e armadilha; opacidade no hover e conforto.
     *
     * A transicao tambem tem lado: some devagar (.45s) e volta rapido
     * (.12s). Sumir e enfeite e pode ser suave; reaparecer e resposta a
     * uma intencao e precisa parecer instantaneo. */
    "#dock { transition: opacity .45s ease; }",
    "#dock.ms-translucido { opacity: .28; }",
    "#dock.ms-translucido.ms-acordado { opacity: 1; transition: opacity .12s ease; }",
    /* Alerta NUNCA fica translucido. Se a fila encheu, o alarme e o
     * unico motivo pelo qual o medico deveria olhar para o canto —
     * apaga-lo seria desligar o aviso pela metade. */
    "#dock.ms-tem-alerta { opacity: 1 !important; }",
    /* No toque nao existe aproximar o ponteiro: o primeiro contato ja e
     * o clique. Entao o repouso e menos apagado ali — 28% num aparelho
     * onde nao da para "espiar antes" vira um botao que o medico precisa
     * adivinhar. */
    "@media (hover: none) { #dock.ms-translucido { opacity: .5; } }",

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

    /* --- avisos no canto superior direito ---
       Ficam longe do dock de proposito: o dock e onde o medico CLICA, e o
       aviso e algo que ele LE. Empilham para baixo, na ordem de chegada,
       e cada um sai sozinho. */
    "#avisos {",
    "  position: fixed; top: 16px; right: 16px; z-index: " + (Z_BASE + 5) + ";",
    "  display: flex; flex-direction: column; gap: 10px; align-items: flex-end;",
    "  pointer-events: none; max-width: min(380px, calc(100vw - 32px));",
    "}",
    "#avisos > * { pointer-events: auto; }",
    ".ms-aviso {",
    "  background: #fff; border-radius: 12px; width: 100%;",
    "  box-shadow: 0 10px 34px rgba(15,23,42,.28); overflow: hidden;",
    "  border-left: 4px solid #1a4fa0;",
    "  animation: ms-aviso-entra .22s ease-out;",
    "}",
    "@keyframes ms-aviso-entra { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }",
    ".ms-aviso-topo { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; padding: 12px 14px 0; }",
    ".ms-aviso-titulo { font-size: 13px; font-weight: 700; color: #123a7a; line-height: 1.3; }",
    ".ms-aviso-fechar { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 15px; line-height: 1; padding: 0 2px; flex-shrink: 0; }",
    ".ms-aviso-fechar:hover { color: #475569; }",
    ".ms-aviso-corpo { padding: 6px 14px 12px; font-size: 12.5px; line-height: 1.5; color: #16221f; }",
    ".ms-aviso-acoes { display: flex; gap: 8px; padding: 0 14px 12px; }",
    ".ms-aviso-btn { background: #1a4fa0; color: #fff; border: none; border-radius: 7px; padding: 7px 13px; font-size: 12px; font-weight: 700; cursor: pointer; }",
    ".ms-aviso-btn:hover { background: #123a7a; }",
    ".ms-aviso-btn-sec { background: #fff; color: #123a7a; border: 1.3px solid #cbd5e1; }",
    ".ms-aviso-btn-sec:hover { background: #eef4fb; }",

    /* contador no canto do botao do dock */
    ".ms-btn { position: relative; }",
    ".ms-badge {",
    "  position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px;",
    "  padding: 0 5px; border-radius: 999px; background: #dc2626; color: #fff;",
    "  font-size: 11px; font-weight: 800; display: flex; align-items: center;",
    "  justify-content: center; box-shadow: 0 2px 6px rgba(220,38,38,.5);",
    "}",
    ".ms-badge[hidden] { display: none; }",

    /* --- moldura de alerta em tela cheia ---
       Plantao noturno costuma ser em sala com luz baixa e o medico
       raramente esta olhando para o topo da tela. Uma moldura pulsante
       na borda inteira do monitor e percebida pela visao periferica, de
       qualquer angulo. Nao intercepta clique (pointer-events:none) para
       nao atrapalhar o Meeds. */
    ".ms-moldura-alerta {",
    "  position: fixed; inset: 0; z-index: " + (Z_BASE + 1) + "; pointer-events: none;",
    "  box-shadow: inset 0 0 0 6px rgba(220,38,38,.9), inset 0 0 60px rgba(220,38,38,.35);",
    "  animation: ms-pulso-moldura 1.1s ease-in-out infinite;",
    "}",
    ".ms-moldura-alerta[hidden] { display: none; }",
    "@keyframes ms-pulso-moldura {",
    "  0%, 100% { box-shadow: inset 0 0 0 6px rgba(220,38,38,.9), inset 0 0 60px rgba(220,38,38,.35); }",
    "  50% { box-shadow: inset 0 0 0 12px rgba(248,113,113,1), inset 0 0 110px rgba(220,38,38,.6); }",
    "}",

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
    ".ms-banner .ms-banner-motivo { font-weight: 500; opacity: .95; font-size: 14px; }",

    /* Quem pediu menos animacao no sistema operacional nao esta pedindo
       menos alarme: o vermelho, o texto e o som continuam. So para de
       pulsar. Vale para enjoo de movimento e para quem simplesmente nao
       aguenta uma tela piscando um plantao inteiro. */
    "@media (prefers-reduced-motion: reduce) {",
    "  .ms-moldura-alerta, .ms-banner, .ms-btn { animation: none !important; }",
    "}",
  ].join("\n");

  function garantirHost() {
    if (shadow) return shadow;
    var host = document.getElementById(ID_HOST);
    if (host && host.shadowRoot) {
      shadow = host.shadowRoot;
      elDock = shadow.getElementById("dock");
      elToast = shadow.getElementById("toast");
      elAvisos = shadow.getElementById("avisos");
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
    criarAlca();
    ligarSensoresDeInteracao();
    definirTranslucidez(translucido);

    elAvisos = document.createElement("div");
    elAvisos.id = "avisos";
    shadow.appendChild(elAvisos);

    elToast = document.createElement("div");
    elToast.id = "toast";
    elToast.hidden = true;
    shadow.appendChild(elToast);

    return shadow;
  }

  /* ------------------------------------------------------------------
   * ACORDAR E ADORMECER
   * ------------------------------------------------------------------
   * "Acordado" e opacidade cheia. Qualquer sinal de intencao acorda —
   * mouse por cima, foco de teclado, toque. Depois de um tempo parado,
   * volta a desaparecer sozinho.
   *
   * O foco de teclado entra na lista por acessibilidade: quem navega de
   * Tab nao gera hover nenhum, e uma pilha a 28% de opacidade seria
   * praticamente invisivel para essa pessoa.
   * ------------------------------------------------------------------ */
  function acordar() {
    if (!elDock) return;
    elDock.classList.add("ms-acordado");
    if (timerAdormecer) clearTimeout(timerAdormecer);
    timerAdormecer = null;
  }

  function agendarAdormecer() {
    if (!elDock) return;
    if (timerAdormecer) clearTimeout(timerAdormecer);
    timerAdormecer = setTimeout(function () {
      timerAdormecer = null;
      /* Nao adormece com o teclado dentro: seria apagar a pilha embaixo
       * do cursor de quem esta navegando por Tab. */
      if (elDock.contains(document.activeElement)) return;
      elDock.classList.remove("ms-acordado");
    }, MS_ATE_ADORMECER);
  }

  function ligarSensoresDeInteracao() {
    if (!elDock) return;
    /* pointerenter/leave em vez de mouseenter: cobre mouse, caneta e
     * toque com o mesmo par de eventos. */
    elDock.addEventListener("pointerenter", acordar);
    elDock.addEventListener("pointerleave", agendarAdormecer);
    /* No toque nao existe "sair": o dedo levanta e pronto. Entao um
     * toque acorda e o proprio timer devolve ao repouso. */
    elDock.addEventListener("pointerdown", function () {
      acordar();
      agendarAdormecer();
    });
    elDock.addEventListener("focusin", acordar);
    elDock.addEventListener("focusout", agendarAdormecer);
  }

  /* Ligada e desligada pelo medico no painel da engrenagem. Desligada, a
   * pilha fica sempre com opacidade cheia — que era o comportamento
   * antes desta versao. */
  function definirTranslucidez(valor) {
    translucido = !!valor;
    if (!elDock) return;
    elDock.classList.toggle("ms-translucido", translucido);
    if (translucido) {
      /* Acorda ANTES de agendar o sono. Na carga da pagina nada ficou
       * "parado" ainda: nascer a 28% faria o medico achar que o
       * Assistente carregou pela metade. Ele aparece inteiro e some
       * depois, que e o que "discreto quando parado" quer dizer. */
      acordar();
      agendarAdormecer();
    } else {
      acordar();
    }
  }

  /* Chamado quando um botao entra ou sai de alerta. Um dock com alarme
   * tocando nao pode desaparecer. */
  function recalcularAlerta() {
    if (!elDock) return;
    var temAlerta = false;
    botoes.forEach(function (b) {
      if (!b.el.hidden && b.el.classList.contains("ms-ativo")) temAlerta = true;
    });
    elDock.classList.toggle("ms-tem-alerta", temAlerta);
  }

  /* A alca nao passa por registrarBotao de proposito: ela nao pertence
   * a modulo nenhum, nao entra na contagem de botoes e precisa ficar
   * sempre encostada no canto, abaixo de qualquer prioridade. */
  function criarAlca() {
    elAlca = document.createElement("button");
    elAlca.type = "button";
    elAlca.className = "ms-btn ms-btn-icone ms-alca";
    elAlca.addEventListener("click", function () {
      definirRecolhido(!recolhido);
      if (typeof aoAlternar === "function") aoAlternar(recolhido);
    });
    elDock.appendChild(elAlca);
    pintarAlca();
  }

  function pintarAlca() {
    if (!elAlca) return;
    var escondidos = 0;
    botoes.forEach(function (b) {
      if (!b.el.hidden && !b.el.classList.contains("ms-ativo")) escondidos++;
    });
    /* "✕" dizia a coisa errada: ele significa fechar/descartar, e o
     * medico so quer TIRAR DO CAMINHO. O chevron para baixo mostra o
     * movimento real — a pilha se recolhe em direcao ao canto. */
    elAlca.textContent = recolhido ? "☰" : "⌄";
    elAlca.title = recolhido
      ? escondidos === 1
        ? "Mostrar 1 função"
        : "Mostrar " + escondidos + " funções"
      : "Minimizar (as funções continuam ativas)";
    elAlca.setAttribute("aria-label", elAlca.title);
    elAlca.setAttribute("aria-expanded", recolhido ? "false" : "true");
    /* Recolhido e sem nada para mostrar, a alca so ocuparia espaco. */
    elAlca.hidden = recolhido && escondidos === 0;
  }

  function definirRecolhido(valor) {
    recolhido = !!valor;
    if (elDock) elDock.classList.toggle("ms-recolhido", recolhido);
    /* Minimizar ou expandir e uma intencao explicita: o resultado tem
     * que ficar visivel na hora, e nao a 28% de opacidade. */
    acordar();
    if (translucido) agendarAdormecer();
    pintarAlca();
    reposicionarToast();
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
    /* column-reverse: o PRIMEIRO filho e o mais proximo do canto. */
    if (elAlca) elDock.insertBefore(elAlca, elDock.firstChild);
    pintarAlca();
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
        /* Preserva o contador: textContent apagaria o badge junto, e um
         * modulo que use os dois (icone que muda + contador) perderia o
         * numero na primeira troca de icone. */
        var badge = el.querySelector(".ms-badge");
        el.textContent = rotulo ? icone + " " + rotulo : icone;
        if (badge) el.appendChild(badge);
        reposicionarToast();
      },
      definirTitulo: function (t) {
        el.title = t;
      },
      definirClasse: function (nome, ligado) {
        el.classList.toggle(nome, !!ligado);
        /* Entrar ou sair de alerta muda quem escapa da caixa recolhida,
         * e portanto muda a contagem que a alca mostra. */
        if (nome === "ms-ativo") {
          pintarAlca();
          recalcularAlerta();
          reposicionarToast();
        }
      },
      /* Contador no canto do botao. Passe 0 (ou nada) para esconder. */
      definirContador: function (n) {
        var badge = el.querySelector(".ms-badge");
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "ms-badge";
          el.appendChild(badge);
        }
        var valor = Number(n) || 0;
        badge.textContent = valor > 99 ? "99+" : String(valor);
        badge.hidden = valor <= 0;
      },
      mostrar: function () {
        el.hidden = false;
        pintarAlca();
        recalcularAlerta();
        reposicionarToast();
      },
      esconder: function () {
        el.hidden = true;
        pintarAlca();
        recalcularAlerta();
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
        /* Traz para a frente. Todos os overlays vivem no mesmo shadow e
         * com o mesmo z-index, entao quem aparece por cima e quem esta
         * por ULTIMO no DOM. Sem isto, abrir o painel de cadastro a
         * partir do modal de um laudo abria o painel ATRAS do laudo — ele
         * existia, mas o medico nao via, e parecia que o botao nao
         * funcionava. */
        if (overlay.parentNode) overlay.parentNode.appendChild(overlay);
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

  /* Moldura de alerta em tela cheia, para o alarme ser visto de qualquer
   * angulo em sala escura. Vive no dock porque e posicionamento — o
   * modulo so liga e desliga. */
  function criarMolduraAlerta() {
    garantirHost();
    var moldura = document.createElement("div");
    moldura.className = "ms-moldura-alerta";
    moldura.hidden = true;
    shadow.appendChild(moldura);
    return {
      mostrar: function () { moldura.hidden = false; },
      esconder: function () { moldura.hidden = true; },
      remover: function () { if (moldura.parentNode) moldura.parentNode.removeChild(moldura); },
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

  /* ------------------------------------------------------------------
   * criarAviso({ titulo, corpo, acoes, autoFecharMs })
   * ------------------------------------------------------------------
   * Aviso discreto no canto superior direito. E para INFORMAR — nao tem
   * som e nao bloqueia a tela, ao contrario do banner do alarme, que e
   * para INTERROMPER. Quem precisa dos dois usa os dois.
   *
   * acoes = [{ rotulo, aoClicar, primario }]
   * Devolve um handle com fechar() e atualizar(), porque quem avisa
   * costuma precisar corrigir o que disse: tres pacientes chegando em
   * sequencia devem virar UM aviso que conta ate tres, nao tres avisos
   * empilhados.
   * ------------------------------------------------------------------ */
  function criarAviso(spec) {
    garantirHost();
    spec = spec || {};

    var el = document.createElement("div");
    el.className = "ms-aviso";
    var timer = null;

    function render(s) {
      el.innerHTML =
        '<div class="ms-aviso-topo"><div class="ms-aviso-titulo"></div>' +
        '<button type="button" class="ms-aviso-fechar" aria-label="Fechar">&#10005;</button></div>' +
        '<div class="ms-aviso-corpo"></div>' +
        (s.acoes && s.acoes.length ? '<div class="ms-aviso-acoes"></div>' : "");

      el.querySelector(".ms-aviso-titulo").textContent = s.titulo || "";
      // textContent, nunca innerHTML: o corpo pode carregar nome de
      // paciente, e nome nao pode virar HTML
      var corpo = el.querySelector(".ms-aviso-corpo");
      corpo.textContent = "";
      (Array.isArray(s.corpo) ? s.corpo : [s.corpo || ""]).forEach(function (linha, i) {
        if (i > 0) corpo.appendChild(document.createElement("br"));
        corpo.appendChild(document.createTextNode(linha));
      });

      el.querySelector(".ms-aviso-fechar").addEventListener("click", fechar);

      var caixa = el.querySelector(".ms-aviso-acoes");
      if (caixa) {
        (s.acoes || []).forEach(function (acao) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "ms-aviso-btn" + (acao.primario === false ? " ms-aviso-btn-sec" : "");
          b.textContent = acao.rotulo;
          b.addEventListener("click", function () {
            if (typeof acao.aoClicar === "function") acao.aoClicar();
            if (acao.fecha !== false) fechar();
          });
          caixa.appendChild(b);
        });
      }
    }

    function agendarFechamento(ms) {
      if (timer) clearTimeout(timer);
      if (ms > 0) timer = setTimeout(fechar, ms);
    }

    function fechar() {
      if (timer) clearTimeout(timer);
      timer = null;
      if (el.parentNode) el.parentNode.removeChild(el);
    }

    render(spec);
    elAvisos.appendChild(el);
    agendarFechamento(spec.autoFecharMs);

    return {
      elemento: el,
      atualizar: function (novo) {
        spec = Object.assign({}, spec, novo || {});
        render(spec);
        // reaparece no fim da pilha, para o medico reparar na mudanca
        if (el.parentNode) el.parentNode.appendChild(el);
        agendarFechamento(spec.autoFecharMs);
      },
      fechar: fechar,
      estaVisivel: function () {
        return !!el.parentNode;
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
    /* Quem decide o estado inicial e quem o guarda e o nucleo — o dock
     * so sabe desenhar. Mesma divisao que vale para posicao de botao. */
    definirRecolhido: definirRecolhido,
    definirTranslucidez: definirTranslucidez,
    estaTranslucido: function () {
      return translucido;
    },
    estaRecolhido: function () {
      return recolhido;
    },
    aoAlternarRecolhido: function (fn) {
      aoAlternar = fn;
    },
    toast: toast,
    criarOverlay: criarOverlay,
    criarBanner: criarBanner,
    criarMolduraAlerta: criarMolduraAlerta,
    criarAviso: criarAviso,
    adicionarEstilo: adicionarEstilo,
    _reposicionarToast: reposicionarToast,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
