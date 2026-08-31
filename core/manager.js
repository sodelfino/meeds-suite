/* ------------------------------------------------------------------
 * core/manager.js — painel da engrenagem
 * ------------------------------------------------------------------
 * QUATRO ABAS, uma coisa por vez:
 *
 *   Funções  — liga/desliga cada módulo. Vale na hora, sem recarregar.
 *   Médicos  — cadastro único, usado pelos geradores de laudo.
 *   Unidades — estabelecimentos e CNES, usados pela APAC.
 *   Sobre    — versão, o que mudou, feedback e privacidade.
 *
 * POR QUE ABAS, E NAO UMA ROLAGEM SO
 * A versão anterior empilhava tudo numa página só: a lista de módulos,
 * a lista de médicos, o formulário de médico sempre aberto, três botões
 * lado a lado, a lista de unidades, outro formulário sempre aberto e o
 * rodapé. Quem rolava até o meio via o formulário de cadastro com o
 * cabeçalho ainda dizendo "ative apenas as funções que você usa" — o
 * título contradizia o que estava na tela.
 *
 * Duas regras que vieram junto:
 *   1. FORMULÁRIO FECHADO POR PADRÃO. A lista é o que se consulta; o
 *      formulário é o que se usa uma vez. Abrir só quando pedido.
 *   2. AÇÃO SECUNDÁRIA NÃO COMPETE. Backup e restauração saíram da
 *      fileira de botões e viraram uma linha discreta no rodapé da aba.
 *
 * O botão da engrenagem tem prioridade 0 (pé da pilha) e aparece SEMPRE,
 * inclusive com todos os módulos desligados — senão quem desliga tudo
 * perde o caminho de volta.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var Cadastro = raiz.MeedsSuiteCadastro;

  var ESTILO = [
    ".msm-modal { background:#fff; border-radius:16px; width:100%; max-width:540px; max-height:86vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,.35); }",

    /* cabecalho */
    ".msm-head { background:linear-gradient(135deg,#123a7a,#1a56ad); color:#fff; padding:15px 18px 0; flex-shrink:0; }",
    ".msm-head-topo { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }",
    ".msm-head h2 { margin:0; font-size:15px; font-weight:700; }",
    ".msm-head .msm-sub { margin:2px 0 0; font-size:11.5px; opacity:.85; }",
    ".msm-fechar { background:rgba(255,255,255,.2); border:none; color:#fff; width:28px; height:28px; border-radius:50%; cursor:pointer; font-size:14px; flex-shrink:0; }",
    ".msm-fechar:hover { background:rgba(255,255,255,.34); }",

    /* abas */
    ".msm-abas { display:flex; gap:2px; margin-top:12px; }",
    ".msm-aba { background:none; border:none; color:rgba(255,255,255,.72); cursor:pointer; font-family:inherit; font-size:12.5px; font-weight:700; padding:9px 13px; border-radius:8px 8px 0 0; border-bottom:3px solid transparent; }",
    ".msm-aba:hover { color:#fff; background:rgba(255,255,255,.1); }",
    ".msm-aba[aria-selected='true'] { color:#123a7a; background:#fff; border-bottom-color:#fff; }",

    ".msm-body { padding:16px 18px 18px; overflow-y:auto; flex:1; }",
    ".msm-painel[hidden] { display:none; }",
    ".msm-ajuda { font-size:11.5px; color:#5b6672; line-height:1.55; margin:0 0 14px; }",

    /* modulos */
    ".msm-item { display:flex; align-items:flex-start; gap:12px; padding:11px 0; border-bottom:1px solid #f3f6f9; }",
    ".msm-item:last-child { border-bottom:none; }",
    ".msm-item-txt { flex:1; min-width:0; }",
    ".msm-item-nome { font-size:13px; font-weight:700; color:#16221f; }",
    ".msm-item-desc { font-size:11.5px; color:#5b6672; line-height:1.45; margin-top:2px; }",
    ".msm-item-ver { font-size:10px; color:#9aa5b1; font-family:ui-monospace,Menlo,monospace; margin-top:4px; }",
    ".msm-ajustes { background:none; border:none; color:#1a4fa0; cursor:pointer; font-size:10px; font-family:inherit; font-weight:700; padding:0; text-decoration:underline; }",
    ".msm-ajustes:hover { color:#123a7a; }",

    ".msm-switch { position:relative; width:44px; height:25px; flex-shrink:0; cursor:pointer; }",
    ".msm-switch input { opacity:0; width:0; height:0; }",
    ".msm-slider { position:absolute; inset:0; background:#cbd5e1; border-radius:999px; transition:background .18s ease; }",
    ".msm-slider::before { content:''; position:absolute; height:19px; width:19px; left:3px; top:3px; background:#fff; border-radius:50%; transition:transform .18s ease; box-shadow:0 1px 3px rgba(0,0,0,.3); }",
    ".msm-switch input:checked + .msm-slider { background:#12958a; }",
    ".msm-switch input:checked + .msm-slider::before { transform:translateX(19px); }",

    /* fichas (medicos / unidades) */
    ".msm-ficha { display:flex; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid #f3f6f9; font-size:12.5px; }",
    ".msm-ficha:last-of-type { border-bottom:none; }",
    ".msm-ficha-dados { flex:1; min-width:0; }",
    ".msm-ficha-nome { font-weight:700; color:#16221f; }",
    ".msm-ficha-doc { font-size:10.5px; color:#8a97a4; font-family:ui-monospace,Menlo,monospace; margin-top:2px; }",
    ".msm-remover { background:none; border:none; color:#a12626; cursor:pointer; font-size:11px; flex-shrink:0; }",
    ".msm-remover:hover { text-decoration:underline; }",
    ".msm-vazio { font-size:12px; color:#8a97a4; font-style:italic; padding:10px 0; }",

    /* formulario recolhivel */
    ".msm-abrir-form { width:100%; background:#f4f7fb; border:1.4px dashed #b9cbe4; color:#123a7a; border-radius:9px; padding:10px; font-size:12.5px; font-weight:700; font-family:inherit; cursor:pointer; margin-top:12px; }",
    ".msm-abrir-form:hover { background:#e8f0f8; }",
    ".msm-form { margin-top:12px; padding:13px; border:1px solid #e2e8f0; border-radius:10px; background:#fbfcfe; }",
    ".msm-form[hidden] { display:none; }",
    ".msm-form-grade { display:grid; grid-template-columns:1fr 1fr; gap:9px; }",
    ".msm-form label { display:block; font-size:10.5px; font-weight:700; color:#5b6672; margin-bottom:3px; }",
    ".msm-form input { width:100%; box-sizing:border-box; padding:8px 9px; border:1px solid #d8dfe6; border-radius:7px; font-size:12.5px; }",
    ".msm-largo { grid-column:1 / -1; }",
    ".msm-dica { font-size:10.5px; color:#9aa5b1; margin-top:4px; line-height:1.45; }",
    ".msm-form-acoes { display:flex; gap:8px; margin-top:11px; }",

    ".msm-btn { background:#1a4fa0; color:#fff; border:none; border-radius:8px; padding:9px 15px; font-size:12.5px; font-weight:700; font-family:inherit; cursor:pointer; }",
    ".msm-btn:hover { background:#123a7a; }",
    ".msm-btn-sec { background:#fff; color:#123a7a; border:1.3px solid #cbd5e1; }",
    ".msm-btn-sec:hover { background:#eef4fb; }",

    /* rodape discreto da aba */
    ".msm-rodape-aba { margin-top:16px; padding-top:12px; border-top:1px solid #eef2f6; font-size:11px; color:#8a97a4; line-height:1.6; }",
    ".msm-link { background:none; border:none; color:#1a4fa0; cursor:pointer; font-size:11px; font-family:inherit; font-weight:700; padding:0; text-decoration:underline; }",
    ".msm-link:hover { color:#123a7a; }",

    /* mensagens */
    ".msm-aviso, .msm-ok, .msm-erro { font-size:11.5px; line-height:1.55; padding:10px 12px; border-radius:9px; margin:10px 0; }",
    ".msm-aviso { background:#fff4e2; border:1px solid #f5d9ac; color:#8a5200; }",
    ".msm-aviso strong { display:block; margin-bottom:3px; }",
    ".msm-ok { background:#e6f6f2; border:1px solid #b6e3d8; color:#0b6a62; }",
    ".msm-erro { background:#fde8e8; border:1px solid #f0b8b8; color:#a12626; }",

    /* sobre */
    ".msm-sobre-credito { font-size:13px; font-weight:700; color:#123a7a; }",
    ".msm-sobre-versao { font-size:12px; color:#5b6672; margin-top:3px; }",
    ".msm-sobre-bloco { padding:13px 0; border-bottom:1px solid #f3f6f9; }",
    ".msm-sobre-bloco:last-child { border-bottom:none; }",
    ".msm-sobre-titulo { font-size:12.5px; font-weight:700; color:#16221f; margin-bottom:3px; }",
    ".msm-sobre-texto { font-size:11.5px; color:#5b6672; line-height:1.55; margin-bottom:8px; }",
  ].join("\n");

  var ABAS = [
    { id: "funcoes", rotulo: "Funções", sub: "Ative apenas as funções que você usa" },
    { id: "medicos", rotulo: "Médicos", sub: "Cadastre uma vez; vale para todos os laudos" },
    { id: "unidades", rotulo: "Unidades", sub: "Estabelecimentos e CNES usados na APAC" },
    { id: "sobre", rotulo: "Sobre", sub: "Versão, novidades e feedback" },
  ];

  var overlay = null;
  var ctx = null;
  var abaAtual = "funcoes";

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function montar(contexto) {
    ctx = contexto;

    overlay = ctx.dock.criarOverlay({
      estilo: ESTILO,
      html:
        '<div class="msm-modal" role="dialog" aria-modal="true" aria-labelledby="msm-title">' +
        '  <div class="msm-head">' +
        '    <div class="msm-head-topo">' +
        "      <div>" +
        '        <h2 id="msm-title">Assistente Meeds</h2>' +
        '        <p class="msm-sub" id="msm-sub"></p>' +
        "      </div>" +
        '      <button type="button" class="msm-fechar" aria-label="Fechar">&#10005;</button>' +
        "    </div>" +
        '    <div class="msm-abas" role="tablist">' +
        ABAS.map(function (a) {
          return (
            '<button type="button" class="msm-aba" role="tab" data-aba="' + a.id +
            '" aria-selected="false">' + a.rotulo + "</button>"
          );
        }).join("") +
        "    </div>" +
        "  </div>" +
        '  <div class="msm-body">' +

        /* ---- Funções ---- */
        '    <div class="msm-painel" id="msm-painel-funcoes" role="tabpanel" hidden>' +
        '      <p class="msm-ajuda">Desligar uma função tira o botão dela da tela na hora. Nada é desinstalado — você liga de novo quando quiser.</p>' +
        '      <div id="msm-lista"></div>' +
        "    </div>" +

        /* ---- Médicos ---- */
        '    <div class="msm-painel" id="msm-painel-medicos" role="tabpanel" hidden>' +
        '      <p class="msm-ajuda">Seus dados ficam salvos apenas neste navegador e são usados pelos geradores de laudo. Atualizar o Assistente não apaga o cadastro.</p>' +
        '      <div id="msm-medicos-mensagem"></div>' +
        '      <div id="msm-medicos-lista"></div>' +
        '      <button type="button" class="msm-abrir-form" id="msm-med-abrir">+ Cadastrar médico</button>' +
        '      <div class="msm-form" id="msm-med-form" hidden>' +
        '        <div class="msm-form-grade">' +
        '          <div class="msm-largo"><label for="msm-med-nome">Nome completo</label>' +
        '            <input id="msm-med-nome" placeholder="como deve aparecer no laudo" autocomplete="off"></div>' +
        '          <div><label for="msm-med-crm">CRM</label>' +
        '            <input id="msm-med-crm" placeholder="ex: 110540/MG" autocomplete="off"></div>' +
        '          <div><label for="msm-med-cpf">CPF</label>' +
        '            <input id="msm-med-cpf" placeholder="000.000.000-00" autocomplete="off"></div>' +
        '          <div class="msm-largo"><p class="msm-dica">Só o nome é obrigatório. CRM e CPF entram nos laudos — dá para completar depois.</p></div>' +
        "        </div>" +
        '        <div class="msm-form-acoes">' +
        '          <button type="button" class="msm-btn" id="msm-med-add">Salvar médico</button>' +
        '          <button type="button" class="msm-btn msm-btn-sec" id="msm-med-cancelar">Cancelar</button>' +
        "        </div>" +
        "      </div>" +
        '      <div class="msm-rodape-aba">' +
        '        Trocando de computador? <button type="button" class="msm-link" id="msm-backup">Fazer backup</button>' +
        '        ou <button type="button" class="msm-link" id="msm-restaurar">restaurar um arquivo</button>.' +
        '        <input type="file" id="msm-arquivo" accept="application/json,.json" hidden>' +
        "      </div>" +
        "    </div>" +

        /* ---- Unidades ---- */
        '    <div class="msm-painel" id="msm-painel-unidades" role="tabpanel" hidden>' +
        '      <p class="msm-ajuda">Unidades solicitantes e seus códigos CNES. Aparecem para escolher no gerador de APAC, então você não redigita nome e CNES a cada laudo.</p>' +
        '      <div id="msm-estab-mensagem"></div>' +
        '      <div id="msm-estab-lista"></div>' +
        '      <button type="button" class="msm-abrir-form" id="msm-estab-abrir">+ Cadastrar unidade</button>' +
        '      <div class="msm-form" id="msm-estab-form" hidden>' +
        '        <div class="msm-form-grade">' +
        '          <div class="msm-largo"><label for="msm-estab-nome">Nome da unidade</label>' +
        '            <input id="msm-estab-nome" placeholder="como deve aparecer no laudo" autocomplete="off"></div>' +
        '          <div class="msm-largo"><label for="msm-estab-cnes">CNES</label>' +
        '            <input id="msm-estab-cnes" placeholder="somente números" inputmode="numeric" autocomplete="off"></div>' +
        "        </div>" +
        '        <div class="msm-form-acoes">' +
        '          <button type="button" class="msm-btn" id="msm-estab-add">Salvar unidade</button>' +
        '          <button type="button" class="msm-btn msm-btn-sec" id="msm-estab-cancelar">Cancelar</button>' +
        "        </div>" +
        "      </div>" +
        "    </div>" +

        /* ---- Sobre ---- */
        '    <div class="msm-painel" id="msm-painel-sobre" role="tabpanel" hidden>' +
        '      <div class="msm-sobre-bloco">' +
        '        <div class="msm-sobre-credito">Assistente Meeds — Por: Marcelo</div>' +
        '        <div class="msm-sobre-versao">Versão <b id="msm-versao"></b> · ' +
        '          <button type="button" class="msm-link" id="msm-historico-versoes">ver o que mudou</button></div>' +
        '        <div class="msm-sobre-versao" id="msm-escopo"></div>' +
        "      </div>" +
        '      <div class="msm-sobre-bloco">' +
        '        <div class="msm-sobre-titulo">Achou um problema? Tem uma ideia?</div>' +
        '        <p class="msm-sobre-texto">Escreva em duas linhas o que aconteceu ou o que faria sua rotina render mais. É o que orienta as próximas versões.</p>' +
        '        <button type="button" class="msm-btn" id="msm-feedback">Enviar feedback</button>' +
        "      </div>" +
        '      <div class="msm-sobre-bloco">' +
        '        <div class="msm-sobre-titulo">Privacidade</div>' +
        '        <p class="msm-sobre-texto">Nenhum dado de paciente é gravado em disco nem enviado para fora. O que fica salvo neste navegador é preferência de uso: funções ligadas, ajustes do alarme e os cadastros desta tela.</p>' +
        "      </div>" +
        "    </div>" +

        "  </div>" +
        "</div>",
    });

    overlay.$(".msm-fechar").addEventListener("click", function () {
      overlay.fechar();
    });
    overlay.$("#msm-versao").textContent = ctx.versaoNucleo;

    /* Linha tecnica de uma frase. Existe por um motivo concreto: quando o
     * Assistente "nao faz nada" num iPad, a primeira pergunta e sempre em
     * que escopo ele caiu — e ate agora a unica forma de descobrir era
     * ligar o aparelho num Mac. Agora e abrir o Sobre. */
    (function () {
      var linha = overlay.$("#msm-escopo");
      var diag = raiz.MeedsSuiteDiagnostico;
      if (!linha || !diag || !diag.escopoDeExecucao) return;
      linha.textContent =
        diag.escopoDeExecucao() === "pagina"
          ? "Funcionando com todos os sinais"
          : "Modo restrito: o navegador isolou o Assistente, então o alarme de fila decide só pelo que aparece na tela";
    })();

    overlay.$$(".msm-aba").forEach(function (btn) {
      btn.addEventListener("click", function () {
        mostrarAba(btn.getAttribute("data-aba"));
      });
    });

    /* --- médicos --- */
    alternarForm("#msm-med-abrir", "#msm-med-form", "#msm-med-nome", "#msm-med-cancelar");
    overlay.$("#msm-med-add").addEventListener("click", salvarMedico);
    overlay.$("#msm-backup").addEventListener("click", fazerBackup);
    overlay.$("#msm-restaurar").addEventListener("click", function () {
      overlay.$("#msm-arquivo").click();
    });
    overlay.$("#msm-arquivo").addEventListener("change", restaurarBackup);
    raiz.MeedsSuiteFormatos.aplicarMascaraCpf(overlay.$("#msm-med-cpf"));
    enterSalva(["#msm-med-nome", "#msm-med-crm", "#msm-med-cpf"], salvarMedico);

    /* --- unidades --- */
    alternarForm("#msm-estab-abrir", "#msm-estab-form", "#msm-estab-nome", "#msm-estab-cancelar");
    overlay.$("#msm-estab-add").addEventListener("click", salvarEstabelecimento);
    overlay.$("#msm-estab-cnes").addEventListener("input", function () {
      var el = overlay.$("#msm-estab-cnes");
      el.value = el.value.replace(/\D/g, "").slice(0, 12);
    });
    enterSalva(["#msm-estab-nome", "#msm-estab-cnes"], salvarEstabelecimento);

    /* --- sobre --- */
    overlay.$("#msm-historico-versoes").addEventListener("click", function () {
      overlay.fechar();
      raiz.MeedsSuiteNovidades.mostrarHistorico(ctx.versaoNucleo);
    });
    overlay.$("#msm-feedback").addEventListener("click", function () {
      overlay.fechar();
      raiz.MeedsSuiteFeedback.abrir({
        dock: ctx.dock,
        versao: ctx.versaoNucleo,
        modulos: ctx.listarModulos(),
        contato: ctx.contato,
      });
    });

    ctx.dock.registrarBotao({
      id: "_manager",
      icone: "⚙️",
      variante: "engrenagem",
      titulo: "Assistente Meeds — funções, cadastros e ajustes",
      prioridade: 0,
      aoClicar: function () {
        abrir();
      },
    });
  }

  /* O formulário fica fechado até ser pedido: a lista é o que se
   * consulta, o formulário é o que se usa uma vez. */
  function alternarForm(seletorBotao, seletorForm, seletorFoco, seletorCancelar) {
    var botao = overlay.$(seletorBotao);
    var form = overlay.$(seletorForm);
    botao.addEventListener("click", function () {
      form.hidden = false;
      botao.hidden = true;
      overlay.$(seletorFoco).focus();
    });
    overlay.$(seletorCancelar).addEventListener("click", function () {
      form.hidden = true;
      botao.hidden = false;
      form.querySelectorAll("input").forEach(function (i) {
        i.value = "";
      });
    });
  }

  function enterSalva(seletores, fn) {
    seletores.forEach(function (sel) {
      overlay.$(sel).addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          fn();
        }
      });
    });
  }

  function mostrarAba(id) {
    abaAtual = id;
    var ficha = ABAS.filter(function (a) {
      return a.id === id;
    })[0];
    overlay.$("#msm-sub").textContent = ficha ? ficha.sub : "";
    overlay.$$(".msm-aba").forEach(function (b) {
      b.setAttribute("aria-selected", String(b.getAttribute("data-aba") === id));
    });
    overlay.$$(".msm-painel").forEach(function (p) {
      p.hidden = p.id !== "msm-painel-" + id;
    });
    overlay.$(".msm-body").scrollTop = 0;
  }

  function abrir(secao) {
    renderizarModulos();
    renderizarMedicos();
    renderizarEstabelecimentos();
    mostrarMensagemMedicos(null);
    mostrarMensagemEstab(null);

    /* Quem chega de um atalho ("cadastrar médico" dentro de um laudo) cai
     * direto na aba certa, com o formulário já aberto — o atalho existe
     * justamente para poupar cliques. */
    var destino = { medicos: "medicos", estabelecimentos: "unidades" }[secao] || "funcoes";
    mostrarAba(destino);
    overlay.abrir();

    if (secao === "medicos") abrirFormulario("#msm-med-abrir", "#msm-med-form", "#msm-med-nome");
    if (secao === "estabelecimentos") abrirFormulario("#msm-estab-abrir", "#msm-estab-form", "#msm-estab-nome");
  }

  function abrirFormulario(seletorBotao, seletorForm, seletorFoco) {
    overlay.$(seletorForm).hidden = false;
    overlay.$(seletorBotao).hidden = true;
    setTimeout(function () {
      overlay.$(seletorFoco).focus();
    }, 250);
  }

  function fecharFormulario(seletorBotao, seletorForm) {
    overlay.$(seletorForm).hidden = true;
    overlay.$(seletorBotao).hidden = false;
  }

  /* ---------------- funções (módulos) ---------------- */
  function renderizarModulos() {
    var lista = overlay.$("#msm-lista");
    var modulos = ctx.listarModulos();

    if (!modulos.length) {
      lista.innerHTML = '<div class="msm-vazio">Nenhuma função carregada neste pacote.</div>';
      return;
    }

    lista.innerHTML = modulos
      .map(function (m) {
        return (
          '<div class="msm-item">' +
          '  <div class="msm-item-txt">' +
          '    <div class="msm-item-nome">' + escapeHtml(m.nome) + "</div>" +
          '    <div class="msm-item-desc">' + escapeHtml(m.descricao) + "</div>" +
          '    <div class="msm-item-ver">v' + escapeHtml(m.versao) +
          (m.temAjustes && m.habilitado
            ? ' · <button type="button" class="msm-ajustes" data-ajustes="' + escapeHtml(m.id) + '">Ajustes</button>'
            : "") +
          "</div>" +
          "  </div>" +
          '  <label class="msm-switch">' +
          '    <input type="checkbox" data-id="' + escapeHtml(m.id) + '" ' + (m.habilitado ? "checked" : "") + " />" +
          '    <span class="msm-slider"></span>' +
          "  </label>" +
          "</div>"
        );
      })
      .join("");

    overlay.$$("button[data-ajustes]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        overlay.fechar();
        ctx.abrirAjustesDe(btn.getAttribute("data-ajustes"));
      });
    });

    overlay.$$('input[type="checkbox"][data-id]').forEach(function (input) {
      input.addEventListener("change", function () {
        ctx.definirHabilitado(input.getAttribute("data-id"), input.checked);
        renderizarModulos();
      });
    });
  }

  /* ---------------- médicos ---------------- */
  function mostrarMensagemMedicos(texto, tipo) {
    var caixa = overlay.$("#msm-medicos-mensagem");
    caixa.innerHTML = texto ? '<div class="msm-' + (tipo || "ok") + '">' + escapeHtml(texto) + "</div>" : "";
  }

  function renderizarMedicos() {
    var lista = Cadastro.listar();
    var box = overlay.$("#msm-medicos-lista");

    if (!lista.length) {
      box.innerHTML =
        '<div class="msm-aviso"><strong>Cadastre seu nome e CRM uma única vez</strong>' +
        "Por segurança, os dados dos médicos não ficam mais no código do programa. " +
        "Leva menos de um minuto e você não precisa repetir.</div>";
      return;
    }

    box.innerHTML = lista
      .map(function (m, i) {
        var docs = [];
        if (m.crm) docs.push("CRM " + m.crm);
        if (m.cpf) docs.push("CPF " + m.cpf);
        return (
          '<div class="msm-ficha">' +
          '  <div class="msm-ficha-dados">' +
          '    <div class="msm-ficha-nome">' + escapeHtml(m.nome) + "</div>" +
          '    <div class="msm-ficha-doc">' + escapeHtml(docs.join("  ·  ") || "sem documento cadastrado") + "</div>" +
          "  </div>" +
          '  <button type="button" class="msm-remover" data-i="' + i + '">remover</button>' +
          "</div>"
        );
      })
      .join("");

    box.querySelectorAll(".msm-remover").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var i = Number(btn.getAttribute("data-i"));
        var alvo = Cadastro.listar()[i];
        Cadastro.remover(i);
        renderizarMedicos();
        mostrarMensagemMedicos((alvo ? alvo.nome : "Médico") + " foi removido do cadastro.", "ok");
        avisarModulos();
      });
    });
  }

  function salvarMedico() {
    var nome = overlay.$("#msm-med-nome").value.trim();
    if (!nome) {
      mostrarMensagemMedicos(
        "Não consegui salvar porque o nome está vazio. Preencha o campo “Nome completo” — é o único obrigatório.",
        "erro"
      );
      overlay.$("#msm-med-nome").focus();
      return;
    }

    var cpf = overlay.$("#msm-med-cpf").value.trim();
    if (cpf && !raiz.MeedsSuiteFormatos.cpfCompleto(cpf)) {
      mostrarMensagemMedicos(
        "Não consegui salvar porque o CPF tem " + raiz.MeedsSuiteFormatos.soDigitos(cpf).length +
          " dígito(s) e o CPF tem 11. Confira o número, ou deixe o campo em branco para completar depois.",
        "erro"
      );
      overlay.$("#msm-med-cpf").focus();
      return;
    }

    var r = Cadastro.adicionar({ nome: nome, crm: overlay.$("#msm-med-crm").value.trim(), cpf: cpf });
    if (!r.ok) {
      mostrarMensagemMedicos(r.erro, "erro");
      return;
    }

    ["#msm-med-nome", "#msm-med-crm", "#msm-med-cpf"].forEach(function (s) {
      overlay.$(s).value = "";
    });
    fecharFormulario("#msm-med-abrir", "#msm-med-form");
    renderizarMedicos();
    mostrarMensagemMedicos(
      r.atualizou ? nome + " já estava cadastrado — atualizei os dados dele." : nome + " foi cadastrado com sucesso.",
      "ok"
    );
    avisarModulos();
  }

  function avisarModulos() {
    if (typeof ctx.aoMudarCadastro === "function") ctx.aoMudarCadastro();
  }

  function fazerBackup() {
    var lista = Cadastro.listar();
    if (!lista.length) {
      mostrarMensagemMedicos(
        "Não há o que salvar: nenhum médico cadastrado ainda. Cadastre pelo menos um e tente de novo.",
        "erro"
      );
      return;
    }
    var blob = new Blob([Cadastro.exportar()], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "assistente-meeds-medicos.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 4000);
    mostrarMensagemMedicos(
      "Backup salvo como assistente-meeds-medicos.json (" + lista.length + " médico(s)). Guarde o arquivo em lugar seguro.",
      "ok"
    );
  }

  function restaurarBackup(ev) {
    var arquivo = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!arquivo) return;

    var leitor = new FileReader();
    leitor.onload = function () {
      var r = Cadastro.importar(String(leitor.result));
      if (!r.ok) {
        mostrarMensagemMedicos(r.erro, "erro");
        return;
      }
      renderizarMedicos();
      mostrarMensagemMedicos(
        "Backup restaurado: " + r.quantidade + " médico(s) adicionados. Quem já estava cadastrado foi mantido.",
        "ok"
      );
      avisarModulos();
    };
    leitor.onerror = function () {
      mostrarMensagemMedicos(
        "Não consegui ler o arquivo “" + arquivo.name + "”. Verifique se ele não está corrompido e tente de novo.",
        "erro"
      );
    };
    leitor.readAsText(arquivo);
  }

  /* ---------------- unidades ---------------- */
  function mostrarMensagemEstab(texto, tipo) {
    var caixa = overlay.$("#msm-estab-mensagem");
    caixa.innerHTML = texto ? '<div class="msm-' + (tipo || "ok") + '">' + escapeHtml(texto) + "</div>" : "";
  }

  function renderizarEstabelecimentos() {
    var lista = Cadastro.listarEstabelecimentos();
    var box = overlay.$("#msm-estab-lista");

    if (!lista.length) {
      box.innerHTML = '<div class="msm-vazio">Nenhuma unidade cadastrada ainda.</div>';
      return;
    }

    box.innerHTML = lista
      .map(function (e, i) {
        return (
          '<div class="msm-ficha">' +
          '  <div class="msm-ficha-dados">' +
          '    <div class="msm-ficha-nome">' + escapeHtml(e.nome) + "</div>" +
          '    <div class="msm-ficha-doc">' + escapeHtml(e.cnes ? "CNES " + e.cnes : "sem CNES cadastrado") + "</div>" +
          "  </div>" +
          '  <button type="button" class="msm-remover" data-e="' + i + '">remover</button>' +
          "</div>"
        );
      })
      .join("");

    box.querySelectorAll("[data-e]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var i = Number(btn.getAttribute("data-e"));
        var alvo = Cadastro.listarEstabelecimentos()[i];
        Cadastro.removerEstabelecimento(i);
        renderizarEstabelecimentos();
        mostrarMensagemEstab((alvo ? alvo.nome : "Unidade") + " foi removida.", "ok");
        avisarModulos();
      });
    });
  }

  function salvarEstabelecimento() {
    var nome = overlay.$("#msm-estab-nome").value.trim();
    if (!nome) {
      mostrarMensagemEstab(
        "Não consegui salvar porque o nome está vazio. Preencha o campo “Nome da unidade”.",
        "erro"
      );
      overlay.$("#msm-estab-nome").focus();
      return;
    }
    var r = Cadastro.adicionarEstabelecimento({ nome: nome, cnes: overlay.$("#msm-estab-cnes").value });
    if (!r.ok) {
      mostrarMensagemEstab(r.erro, "erro");
      return;
    }
    overlay.$("#msm-estab-nome").value = "";
    overlay.$("#msm-estab-cnes").value = "";
    fecharFormulario("#msm-estab-abrir", "#msm-estab-form");
    renderizarEstabelecimentos();
    mostrarMensagemEstab(
      r.atualizou ? nome + " já estava cadastrada — atualizei o CNES." : nome + " foi cadastrada com sucesso.",
      "ok"
    );
    avisarModulos();
  }

  raiz.MeedsSuiteManager = {
    montar: montar,
    abrir: function (secao) {
      if (overlay) abrir(secao);
    },
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
