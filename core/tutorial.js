/* ------------------------------------------------------------------
 * core/tutorial.js — tutorial guiado, por módulo
 * ------------------------------------------------------------------
 * O PROBLEMA
 * Um médico liga um módulo pela primeira vez, abre o painel, e não
 * sabe o que aquilo faz nem por onde começar. A tela sozinha não conta
 * essa história — o texto de "descrição" do painel da engrenagem é uma
 * frase, não um roteiro.
 *
 * O QUE ISTO É: um carrossel de passos (título + texto), dentro do
 * MESMO overlay que todo módulo já usa (`d.dock.criarOverlay`). Cada
 * módulo registra seu próprio roteiro; este arquivo só sabe desenhar
 * "passo N de M" com Voltar/Próximo/Pular, e lembrar quem já viu.
 *
 * PASSOS GUIADOS (opcional, por passo) — D65
 * Um passo pode declarar `alvo` (função que devolve o elemento vivo do
 * PRÓPRIO overlay do módulo, já aberto) e `evento` ("click"/"input"/
 * "change"). Esse passo não usa o carrossel: fecha o overlay grande do
 * tutorial, destaca o elemento de verdade com contorno pulsante, e
 * mostra um cartão pequeno e NÃO bloqueante (`d.dock.criarAviso`) ao
 * lado — o médico interage com a tela real, não com uma cópia dela. O
 * passo avança sozinho quando o evento acontece.
 *
 * Por que isto NÃO reabre o risco que o parágrafo anterior evitava: o
 * alvo só pode ser um elemento de um overlay que o PRÓPRIO módulo já
 * abriu antes de chamar o tutorial (a REMUME já está na tela; o painel
 * de Ajustes do alarme já está na tela) — nunca um botão do dock, cuja
 * posição varia com quais módulos estão ligados (D58). Dentro de um
 * overlay já aberto e `position:fixed`, o elemento não se move com
 * rolagem da página nem com layout — a fragilidade que o parágrafo
 * anterior descreve simplesmente não se aplica aqui.
 *
 * NUNCA TRANCA: se o alvo não existir ou não estiver visível (o médico
 * fechou o painel no meio, ou reabriu o tutorial sem abrir o painel
 * primeiro), o cartão aparece do mesmo jeito, sem destaque, e "Pular
 * este passo" resolve. Um vigia por polling (500ms) detecta o alvo
 * sumindo da tela NO MEIO do passo (ex.: o médico fechou o painel) e
 * avança sozinho, em vez de deixar um destaque órfão esperando um
 * clique que não vem mais.
 *
 * O QUE ISTO NÃO É, DE PROPÓSITO
 *   - Não é um "spotlight" sobre um elemento do DOCK (fora de qualquer
 *     overlay). Isso exigiria coordenar dois overlays com furo
 *     recortado sobre uma posição que muda de módulo para módulo —
 *     continua não valendo o ganho. Passos sobre o dock (ex.: "clique
 *     no ícone do alarme") continuam só em texto.
 *   - Não é um formulário sendo preenchido (isso já existe — ver
 *     core/guia.js, para dentro de UM formulário). Tutorial é sobre
 *     "o que esta função faz", guia.js é sobre "o que falta preencher
 *     neste laudo".
 *
 * COMO UM MÓDULO ADOTA
 *   1. Registra o roteiro, uma vez, no topo do arquivo do módulo:
 *        raiz.MeedsSuiteTutorial.registrar("exames", {
 *          titulo: "Exames do município",
 *          passos: [
 *            { titulo: "...", texto: "..." },
 *            ...
 *          ],
 *        });
 *   2. Dentro de `start(d)`, registra o callback com `d.aoIniciarTutorial`
 *      — mesmo padrão de `d.aoAbrirAjustes`. O núcleo detecta a função e
 *      o painel da engrenagem passa a mostrar o botão "🎓 Ver tutorial"
 *      ao lado de "⚙️ Configurar":
 *        d.aoIniciarTutorial(function () {
 *          raiz.MeedsSuiteTutorial.iniciar("exames", { dock: d.dock });
 *        });
 *   3. Opcional — oferecer sozinho na primeira vez que o painel abre,
 *      dentro da própria função que monta o overlay do módulo:
 *        raiz.MeedsSuiteTutorial.iniciarSePrimeiraVez("exames", { dock: d.dock });
 *      Não faz nada se o médico já viu, ou se nenhum roteiro foi
 *      registrado — chamar isso é sempre seguro, mesmo antes do passo 1.
 *
 * "JÁ VISTO" FICA NO STORAGE DO NÚCLEO, NÃO DO MÓDULO
 * Não é dado do módulo (o médico pode desligar e religar Exames sem
 * perder a marca de "já vi o tutorial"), é dado de EXPERIÊNCIA DE USO
 * do núcleo — mesma categoria de `CHAVE_VERSAO_VISTA` em novidades.js.
 * Usa `MeedsSuiteStorage.storageDoNucleo()`, então já herda durável
 * (GM_*) no Tampermonkey e IndexedDB no Safari/iPad, sem código extra
 * aqui.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var CSS = [
    ".tut-modal { background:#fff; border-radius:16px; width:100%; max-width:440px; box-shadow:0 20px 60px rgba(0,0,0,.35); overflow:hidden; }",
    ".tut-head { background:linear-gradient(135deg,#0f766e,#0ea5a4); color:#fff; padding:14px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; }",
    ".tut-head h2 { margin:0; font-size:14px; font-weight:700; }",
    ".tut-fechar { background:rgba(255,255,255,.18); border:none; color:#fff; width:26px; height:26px; border-radius:8px; font-size:13px; cursor:pointer; flex-shrink:0; }",
    ".tut-fechar:hover { background:rgba(255,255,255,.32); }",
    ".tut-corpo { padding:20px 18px; }",
    ".tut-icone { font-size:34px; line-height:1; margin-bottom:10px; }",
    ".tut-titulo-passo { font-size:15px; font-weight:700; color:#0f172a; margin-bottom:8px; }",
    ".tut-texto { font-size:13px; color:#334155; line-height:1.6; }",
    /* Barra de progresso: mesma linguagem visual de core/guia.js
       (`.msg-barra`/`.msg-preenchido`) — dois lugares diferentes, mesma
       metáfora de "quanto falta", para o médico não reaprender. */
    ".tut-progresso-linha { display:flex; align-items:center; gap:9px; margin-top:18px; }",
    ".tut-barra { flex:1; height:5px; border-radius:99px; background:#e2e8f0; overflow:hidden; }",
    ".tut-preenchido { height:100%; background:#0f766e; border-radius:99px; transition:width .2s ease; }",
    ".tut-contagem { font-size:10.5px; font-weight:700; color:#64748b; white-space:nowrap; }",
    "@media (prefers-reduced-motion: reduce) { .tut-preenchido { transition:none; } }",
    ".tut-rodape { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:14px 18px; border-top:1px solid #f1f5f9; }",
    ".tut-pular { background:none; border:none; color:#64748b; font-size:12px; font-family:inherit; cursor:pointer; padding:6px 4px; }",
    ".tut-pular:hover { color:#334155; text-decoration:underline; }",
    ".tut-botoes { display:flex; gap:8px; }",
    ".tut-btn { font-family:inherit; font-size:12.5px; font-weight:700; border-radius:9px; padding:9px 16px; cursor:pointer; border:1.5px solid transparent; }",
    ".tut-btn-voltar { background:#fff; border-color:#cbd5e1; color:#475569; }",
    ".tut-btn-voltar:hover { background:#f1f5f9; }",
    ".tut-btn-voltar[hidden] { display:none; }",
    ".tut-btn-proximo { background:#0f766e; color:#fff; }",
    ".tut-btn-proximo:hover { background:#0b5a54; }",
    /* Destaque de passo guiado — aplicado a um elemento QUALQUER do
       shadow (nao so dentro do overlay do tutorial), por isso vive
       aqui e nao dentro de .tut-modal. Mesma linguagem visual do
       .msg-alvo de core/guia.js, para o medico nao reaprender. */
    ".tut-alvo-destaque { outline:3px solid #0f766e !important; outline-offset:2px; border-radius:8px; animation:tut-pulso 1.1s ease-in-out infinite; }",
    "@keyframes tut-pulso { 0%,100% { outline-color:#0f766e; } 50% { outline-color:#5eead4; } }",
    "@media (prefers-reduced-motion: reduce) { .tut-alvo-destaque { animation:none; } }",
  ].join("\n");

  /* idModulo -> { titulo, passos: [{ titulo, texto, icone?, alvo?, evento? }] } */
  var registro = {};

  var overlay = null;
  var refs = {};
  var idAtual = null;
  var passoAtual = 0;
  var dockAtual = null;

  /* --- estado do passo GUIADO em curso (D65) --- */
  var avisoGuiado = null;   // handle de d.dock.criarAviso()
  var alvoDestacado = null; // elemento com .tut-alvo-destaque aplicado
  var listenerGuiado = null; // { el, tipo, fn } — para remover ao sair
  var vigiaAlvo = null;      // setInterval que detecta o alvo sumindo

  function storage() {
    return raiz.MeedsSuiteStorage ? raiz.MeedsSuiteStorage.storageDoNucleo() : null;
  }

  function chaveVisto(idModulo) {
    return "tutorial_visto_" + idModulo;
  }

  /* ------------------------------------------------------------------
   * registrar(idModulo, spec) — chamado pelo próprio módulo, uma vez,
   * fora de start()/iniciarTutorial() (o roteiro é estático, não
   * depende de o módulo estar rodando).
   * ------------------------------------------------------------------ */
  function registrar(idModulo, spec) {
    if (!idModulo || !spec || !Array.isArray(spec.passos) || !spec.passos.length) return;
    registro[idModulo] = spec;
  }

  function temTutorial(idModulo) {
    return !!registro[idModulo];
  }

  function jaViu(idModulo) {
    var s = storage();
    return !!(s && s.ler(chaveVisto(idModulo), false));
  }

  function marcarVisto(idModulo) {
    var s = storage();
    if (s) s.gravar(chaveVisto(idModulo), true);
  }

  /* Monta o overlay uma vez só e reaproveita — mesmo padrão dos
   * módulos (`if (overlay) { ...; return; }` em abrirPainel()). */
  function montarOverlay(dock) {
    if (overlay) return;
    overlay = dock.criarOverlay({
      estilo: CSS,
      html:
        '<div class="tut-modal" role="dialog" aria-modal="true" aria-label="Tutorial guiado">' +
        '  <header class="tut-head"><h2 id="tut-titulo-modulo"></h2>' +
        '    <button type="button" class="tut-fechar" aria-label="Fechar">&#10005;</button></header>' +
        '  <div class="tut-corpo">' +
        '    <div class="tut-icone" id="tut-icone" aria-hidden="true"></div>' +
        '    <div class="tut-titulo-passo" id="tut-titulo-passo"></div>' +
        '    <div class="tut-texto" id="tut-texto"></div>' +
        '    <div class="tut-progresso-linha">' +
        '      <div class="tut-barra"><div class="tut-preenchido" id="tut-preenchido"></div></div>' +
        '      <span class="tut-contagem" id="tut-contagem"></span>' +
        "    </div>" +
        "  </div>" +
        '  <div class="tut-rodape">' +
        '    <button type="button" class="tut-pular" id="tut-pular">Pular tutorial</button>' +
        '    <div class="tut-botoes">' +
        '      <button type="button" class="tut-btn tut-btn-voltar" id="tut-voltar">Voltar</button>' +
        '      <button type="button" class="tut-btn tut-btn-proximo" id="tut-proximo">Próximo</button>' +
        "    </div>" +
        "  </div>" +
        "</div>",
    });

    refs.tituloModulo = overlay.$("#tut-titulo-modulo");
    refs.icone = overlay.$("#tut-icone");
    refs.tituloPasso = overlay.$("#tut-titulo-passo");
    refs.texto = overlay.$("#tut-texto");
    refs.preenchido = overlay.$("#tut-preenchido");
    refs.contagem = overlay.$("#tut-contagem");
    refs.pular = overlay.$("#tut-pular");
    refs.voltar = overlay.$("#tut-voltar");
    refs.proximo = overlay.$("#tut-proximo");

    overlay.$(".tut-fechar").addEventListener("click", function () {
      marcarVisto(idAtual);
      overlay.fechar();
    });
    refs.pular.addEventListener("click", function () {
      marcarVisto(idAtual);
      overlay.fechar();
    });
    refs.voltar.addEventListener("click", function () {
      if (passoAtual > 0) {
        passoAtual--;
        pintarPasso();
      }
    });
    refs.proximo.addEventListener("click", avancar);
  }

  /* Visível de verdade, não só presente no DOM: um overlay fechado tem
   * os campos dele ainda conectados (só `hidden`), e destacar ou vigiar
   * um elemento que o médico não está vendo só confunde. offsetParent
   * fica null quando algum ancestral tem display:none — exatamente o
   * que [hidden] usa. */
  function elementoVisivel(el) {
    return !!(el && el.isConnected && el.offsetParent !== null);
  }

  function limparPassoGuiado() {
    if (vigiaAlvo) {
      clearInterval(vigiaAlvo);
      vigiaAlvo = null;
    }
    if (listenerGuiado) {
      listenerGuiado.el.removeEventListener(listenerGuiado.tipo, listenerGuiado.fn);
      listenerGuiado = null;
    }
    if (alvoDestacado) {
      alvoDestacado.classList.remove("tut-alvo-destaque");
      alvoDestacado = null;
    }
    if (avisoGuiado) {
      avisoGuiado.fechar();
      avisoGuiado = null;
    }
  }

  function pintarPasso() {
    limparPassoGuiado();
    var spec = registro[idAtual];
    var passo = spec.passos[passoAtual];

    if (passo.alvo) {
      if (overlay) overlay.fechar();
      pintarPassoGuiado(spec, passo);
      return;
    }

    pintarPassoCarrossel(spec, passo);
  }

  function pintarPassoCarrossel(spec, passo) {
    var total = spec.passos.length;
    overlay.abrir();

    refs.tituloModulo.textContent = "🎓 " + (spec.titulo || "Tutorial");
    refs.icone.textContent = passo.icone || "💡";
    refs.tituloPasso.textContent = passo.titulo || "";
    /* Texto simples, sem HTML: o roteiro é escrito por quem mantém o
     * módulo, não por entrada externa — mas escapar de qualquer jeito
     * custa nada e evita que um `&`/`<` no texto quebre o layout. */
    refs.texto.textContent = passo.texto || "";
    refs.contagem.textContent = (passoAtual + 1) + " de " + total;
    refs.preenchido.style.width = (((passoAtual + 1) / total) * 100) + "%";
    refs.voltar.hidden = passoAtual === 0;
    refs.proximo.textContent = passoAtual === total - 1 ? "Concluir" : "Próximo";
  }

  /* ------------------------------------------------------------------
   * PASSO GUIADO (D65) — ver a nota grande no topo do arquivo.
   * ------------------------------------------------------------------ */
  function pintarPassoGuiado(spec, passo) {
    if (!dockAtual || typeof dockAtual.criarAviso !== "function") {
      // sem onde desenhar o cartão: não trava o roteiro, só pula.
      avancar();
      return;
    }
    var total = spec.passos.length;
    var elAlvo = elementoVisivel(passo.alvo()) ? passo.alvo() : null;

    avisoGuiado = dockAtual.criarAviso({
      titulo: "🎓 " + (passo.titulo || "Sua vez") + " · " + (passoAtual + 1) + "/" + total,
      corpo: passo.texto || "",
      acoes: [{ rotulo: "Pular este passo", primario: false, fecha: false, aoClicar: avancarDoGuiado }],
    });

    if (!elAlvo) return; // sem alvo pra destacar: "Pular este passo" é a saída

    elAlvo.classList.add("tut-alvo-destaque");
    alvoDestacado = elAlvo;

    var tipo = passo.evento || "click";
    var fn = function () {
      avancarDoGuiado();
    };
    elAlvo.addEventListener(tipo, fn, { once: true });
    listenerGuiado = { el: elAlvo, tipo: tipo, fn: fn };

    /* O médico pode fechar o overlay do próprio módulo (REMUME, Ajustes
     * do alarme) no meio do passo — sem isto o destaque ficaria aceso
     * num elemento que ninguém mais vê, esperando um clique que não vem. */
    vigiaAlvo = setInterval(function () {
      if (!elementoVisivel(elAlvo)) avancarDoGuiado();
    }, 500);
  }

  function avancarDoGuiado() {
    limparPassoGuiado();
    avancar();
  }

  function avancar() {
    var spec = registro[idAtual];
    if (passoAtual < spec.passos.length - 1) {
      passoAtual++;
      pintarPasso();
    } else {
      limparPassoGuiado();
      marcarVisto(idAtual);
      if (overlay) overlay.fechar();
    }
  }

  /* ------------------------------------------------------------------
   * iniciar(idModulo, { dock }) — abre do zero (usado pelo botão
   * "🎓 Ver tutorial" do painel da engrenagem: reabrir depois de já
   * ter visto é sempre permitido, não é ação de "primeira vez").
   * ------------------------------------------------------------------ */
  function iniciar(idModulo, opcoes) {
    var spec = registro[idModulo];
    if (!spec || !opcoes || !opcoes.dock) return false;
    montarOverlay(opcoes.dock);
    dockAtual = opcoes.dock;
    idAtual = idModulo;
    passoAtual = 0;
    /* pintarPasso() decide sozinho se abre o overlay grande (passo do
     * carrossel) ou o fecha e desenha o cartão do passo guiado — não dá
     * mais para abrir aqui incondicionalmente, senão um tutorial que
     * COMEÇA com um passo guiado reabriria o overlay vazio por cima. */
    pintarPasso();
    /* Marca "visto" ja na ABERTURA, nao so ao fechar/concluir. Motivo:
     * `iniciarSePrimeiraVez()` nao pode oferecer de novo toda vez que o
     * medico reabrir o painel antes de ele decidir fechar o tutorial —
     * isso viraria um pop-up insistente. Uma vez mostrado, conta como
     * "visto"; o medico sempre pode reabrir de proposito pelo botao
     * "🎓 Ver tutorial" do painel da engrenagem, que chama iniciar()
     * direto e nao se importa com o estado de "ja visto". */
    marcarVisto(idModulo);
    return true;
  }

  /* ------------------------------------------------------------------
   * iniciarSePrimeiraVez(idModulo, { dock }) — o módulo chama isto
   * sempre que abre o próprio painel; só faz alguma coisa na primeira
   * vez (ou se nenhum roteiro foi registrado — nesse caso não faz
   * nada). Seguro chamar sem checar nada antes.
   * ------------------------------------------------------------------ */
  function iniciarSePrimeiraVez(idModulo, opcoes) {
    if (!temTutorial(idModulo) || jaViu(idModulo)) return false;
    return iniciar(idModulo, opcoes);
  }

  raiz.MeedsSuiteTutorial = {
    registrar: registrar,
    temTutorial: temTutorial,
    jaViu: jaViu,
    iniciar: iniciar,
    iniciarSePrimeiraVez: iniciarSePrimeiraVez,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
