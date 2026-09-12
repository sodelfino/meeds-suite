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
 * O QUE ISTO NÃO É, DE PROPÓSITO
 *   - Não é um "spotlight" que ilumina um elemento vivo por trás de um
 *     overlay escuro. Isso exigiria coordenar DOIS overlays abertos ao
 *     mesmo tempo com furo recortado — funciona, mas é MUITO mais
 *     frágil (a posição do elemento muda com o layout, com a rolagem,
 *     com o tamanho de tela) do que vale para o ganho. O tutorial
 *     EXPLICA em texto o que a tela mostra; não precisa apontar um
 *     dedo para cada botão.
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
  ].join("\n");

  /* idModulo -> { titulo, passos: [{ titulo, texto, icone? }] } */
  var registro = {};

  var overlay = null;
  var refs = {};
  var idAtual = null;
  var passoAtual = 0;

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

  function pintarPasso() {
    var spec = registro[idAtual];
    var passo = spec.passos[passoAtual];
    var total = spec.passos.length;

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

  function avancar() {
    var spec = registro[idAtual];
    if (passoAtual < spec.passos.length - 1) {
      passoAtual++;
      pintarPasso();
    } else {
      marcarVisto(idAtual);
      overlay.fechar();
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
    idAtual = idModulo;
    passoAtual = 0;
    pintarPasso();
    overlay.abrir();
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
