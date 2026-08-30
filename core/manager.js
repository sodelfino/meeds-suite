/* ------------------------------------------------------------------
 * core/manager.js — painel da engrenagem
 * ------------------------------------------------------------------
 * Tres secoes, nesta ordem de importancia para o dia a dia:
 *
 *   1. FUNCOES   — liga/desliga cada modulo. Vale na hora, sem recarregar.
 *   2. MEDICOS   — cadastro unico, usado pelos tres geradores de laudo,
 *                  com backup e restauracao.
 *   3. SOBRE     — versao e credito.
 *
 * O botao da engrenagem tem prioridade 0 (pe da pilha) e aparece SEMPRE,
 * inclusive com todos os modulos desligados — senao quem desliga tudo
 * perde o caminho de volta.
 *
 * POR QUE O CADASTRO DE MEDICOS MORA AQUI, E NAO DENTRO DE CADA LAUDO
 * Antes, o APAC tinha o proprio painel "Gerenciar medicos" e LME/CMD nem
 * tinham (a lista estava escrita no codigo). Se cada modulo tivesse o seu,
 * o medico se cadastraria tres vezes e um sexto modulo teria que
 * reimplementar tudo de novo. Aqui e um lugar so: os modulos apenas
 * mostram a lista num <select> e um atalho para ca.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var Cadastro = raiz.MeedsSuiteCadastro;

  var ESTILO = [
    ".msm-modal { background:#fff; border-radius:16px; width:100%; max-width:520px; max-height:86vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,.35); }",
    ".msm-head { background:linear-gradient(135deg,#123a7a,#1a56ad); color:#fff; padding:16px 18px; display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; z-index:2; }",
    ".msm-head h2 { margin:0; font-size:15px; font-weight:700; }",
    ".msm-head .msm-sub { margin:2px 0 0; font-size:11px; opacity:.85; font-weight:400; }",
    ".msm-fechar { background:rgba(255,255,255,.2); border:none; color:#fff; width:28px; height:28px; border-radius:50%; cursor:pointer; font-size:14px; }",
    ".msm-fechar:hover { background:rgba(255,255,255,.34); }",
    ".msm-body { padding:6px 18px 18px; }",

    ".msm-secao { padding:14px 0; border-bottom:1px solid #eef2f6; }",
    ".msm-secao:last-child { border-bottom:none; }",
    ".msm-secao > h3 { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#123a7a; margin:0 0 4px; }",
    ".msm-secao > .msm-ajuda { font-size:11.5px; color:#5b6672; line-height:1.5; margin:0 0 12px; }",

    ".msm-item { display:flex; align-items:flex-start; gap:12px; padding:11px 0; border-bottom:1px solid #f3f6f9; }",
    ".msm-item:last-child { border-bottom:none; }",
    ".msm-item-txt { flex:1; min-width:0; }",
    ".msm-item-nome { font-size:13px; font-weight:700; color:#16221f; }",
    ".msm-item-desc { font-size:11.5px; color:#5b6672; line-height:1.45; margin-top:2px; }",
    ".msm-item-ver { font-size:10px; color:#9aa5b1; font-family:ui-monospace,Menlo,monospace; margin-top:3px; }",
    ".msm-ajustes { background:none; border:none; color:#1a4fa0; cursor:pointer; font-size:10px; font-family:inherit; font-weight:700; padding:0; text-decoration:underline; }",
    ".msm-ajustes:hover { color:#123a7a; }",

    ".msm-switch { position:relative; width:44px; height:25px; flex-shrink:0; cursor:pointer; }",
    ".msm-switch input { opacity:0; width:0; height:0; }",
    ".msm-slider { position:absolute; inset:0; background:#cbd5e1; border-radius:999px; transition:background .18s ease; }",
    ".msm-slider::before { content:''; position:absolute; height:19px; width:19px; left:3px; top:3px; background:#fff; border-radius:50%; transition:transform .18s ease; box-shadow:0 1px 3px rgba(0,0,0,.3); }",
    ".msm-switch input:checked + .msm-slider { background:#12958a; }",
    ".msm-switch input:checked + .msm-slider::before { transform:translateX(19px); }",

    ".msm-aviso { background:#fff4e2; border:1px solid #f5d9ac; color:#8a5200; font-size:11.5px; line-height:1.55; padding:10px 12px; border-radius:9px; margin:10px 0; }",
    ".msm-aviso strong { display:block; margin-bottom:3px; }",
    ".msm-ok { background:#e6f6f2; border:1px solid #b6e3d8; color:#0b6a62; font-size:11.5px; padding:9px 12px; border-radius:9px; margin:10px 0; }",
    ".msm-erro { background:#fde8e8; border:1px solid #f0b8b8; color:#a12626; font-size:11.5px; line-height:1.5; padding:9px 12px; border-radius:9px; margin:10px 0; }",

    ".msm-med { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid #f3f6f9; font-size:12.5px; }",
    ".msm-med:last-of-type { border-bottom:none; }",
    ".msm-med-dados { flex:1; min-width:0; }",
    ".msm-med-nome { font-weight:700; color:#16221f; }",
    ".msm-med-doc { font-size:10.5px; color:#8a97a4; font-family:ui-monospace,Menlo,monospace; margin-top:2px; }",
    ".msm-med-remover { background:none; border:none; color:#a12626; cursor:pointer; font-size:11px; flex-shrink:0; }",
    ".msm-med-remover:hover { text-decoration:underline; }",
    ".msm-vazio { font-size:12px; color:#8a97a4; font-style:italic; padding:8px 0; }",

    ".msm-form { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; }",
    ".msm-form label { display:block; font-size:10.5px; font-weight:700; color:#5b6672; margin-bottom:3px; }",
    ".msm-form input { width:100%; box-sizing:border-box; padding:8px 9px; border:1px solid #d8dfe6; border-radius:7px; font-size:12.5px; }",
    ".msm-form .msm-largo { grid-column:1 / -1; }",
    ".msm-dica-campo { font-size:10.5px; color:#9aa5b1; margin-top:3px; }",

    ".msm-botoes { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }",
    ".msm-btn { background:#1a4fa0; color:#fff; border:none; border-radius:8px; padding:9px 14px; font-size:12.5px; font-weight:700; cursor:pointer; }",
    ".msm-btn:hover { background:#123a7a; }",
    ".msm-btn-sec { background:#fff; color:#123a7a; border:1.4px solid #1a56ad; }",
    ".msm-btn-sec:hover { background:#e8f0f8; }",

    ".msm-sobre { font-size:11.5px; color:#5b6672; line-height:1.6; }",
    ".msm-credito { font-weight:700; color:#123a7a; }",
    ".msm-rodape { font-size:10.5px; color:#9aa5b1; line-height:1.5; margin-top:6px; }",
  ].join("\n");

  var overlay = null;
  var ctx = null;

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
        "    <div>" +
        '      <h2 id="msm-title">Assistente Meeds</h2>' +
        '      <p class="msm-sub">Ative apenas as funções que você usa</p>' +
        "    </div>" +
        '    <button type="button" class="msm-fechar" aria-label="Fechar">&#10005;</button>' +
        "  </div>" +
        '  <div class="msm-body">' +

        '    <div class="msm-secao">' +
        "      <h3>Funções</h3>" +
        '      <p class="msm-ajuda">Desligar uma função tira o botão dela da tela na hora. Você pode ligar de novo quando quiser — nada é desinstalado.</p>' +
        '      <div id="msm-lista"></div>' +
        "    </div>" +

        '    <div class="msm-secao" id="msm-secao-medicos">' +
        "      <h3>Médicos</h3>" +
        '      <p class="msm-ajuda">Cadastre uma única vez. Seus dados ficam salvos com segurança neste navegador e são usados pelos geradores de laudo (APAC, Sete Lagoas e Conceição do Mato Dentro).</p>' +
        '      <div id="msm-medicos-mensagem"></div>' +
        '      <div id="msm-medicos-lista"></div>' +
        '      <div class="msm-form">' +
        '        <div class="msm-largo"><label for="msm-med-nome">Nome completo</label>' +
        '          <input id="msm-med-nome" placeholder="como deve aparecer no laudo" autocomplete="off"></div>' +
        '        <div><label for="msm-med-crm">CRM</label>' +
        '          <input id="msm-med-crm" placeholder="ex: 110540/MG" autocomplete="off"></div>' +
        '        <div><label for="msm-med-cpf">CPF</label>' +
        '          <input id="msm-med-cpf" placeholder="000.000.000-00" autocomplete="off">' +
        '          <div class="msm-dica-campo">CRM e CPF são usados nos três geradores de laudo. Dá para completar depois.</div></div>' +
        "      </div>" +
        '      <div class="msm-botoes">' +
        '        <button type="button" class="msm-btn" id="msm-med-add">Salvar médico</button>' +
        '        <button type="button" class="msm-btn msm-btn-sec" id="msm-backup">Fazer backup</button>' +
        '        <button type="button" class="msm-btn msm-btn-sec" id="msm-restaurar">Restaurar backup</button>' +
        '        <input type="file" id="msm-arquivo" accept="application/json,.json" hidden>' +
        "      </div>" +
        '      <p class="msm-rodape">O backup gera um arquivo <code>.json</code> com os médicos cadastrados. Use para trocar de computador ou de navegador — ou peça o arquivo pronto ao administrador e clique em “Restaurar backup”.</p>' +
        "    </div>" +

        '    <div class="msm-secao" id="msm-secao-estabelecimentos">' +
        "      <h3>Estabelecimentos</h3>" +
        '      <p class="msm-ajuda">Unidades solicitantes e seus códigos CNES. Aparecem para escolher no gerador de APAC — assim você não redigita nome e CNES a cada laudo.</p>' +
        '      <div id="msm-estab-mensagem"></div>' +
        '      <div id="msm-estab-lista"></div>' +
        '      <div class="msm-form">' +
        '        <div class="msm-largo"><label for="msm-estab-nome">Nome do estabelecimento</label>' +
        '          <input id="msm-estab-nome" placeholder="como deve aparecer no laudo" autocomplete="off"></div>' +
        '        <div class="msm-largo"><label for="msm-estab-cnes">CNES</label>' +
        '          <input id="msm-estab-cnes" placeholder="somente números" inputmode="numeric" autocomplete="off"></div>' +
        "      </div>" +
        '      <div class="msm-botoes">' +
        '        <button type="button" class="msm-btn" id="msm-estab-add">Salvar estabelecimento</button>' +
        "      </div>" +
        "    </div>" +

        '    <div class="msm-secao">' +
        "      <h3>Sobre</h3>" +
        '      <p class="msm-sobre"><span class="msm-credito">Assistente Meeds — Por: Marcelo</span><br>' +
        '        Versão <span id="msm-versao"></span></p>' +
        '      <p class="msm-rodape">As preferências ficam salvas apenas neste navegador. Nenhum dado de paciente é gravado em disco nem enviado para fora.</p>' +
        "    </div>" +

        "  </div>" +
        "</div>",
    });

    overlay.$(".msm-fechar").addEventListener("click", function () {
      overlay.fechar();
    });
    overlay.$("#msm-versao").textContent = ctx.versaoNucleo;

    overlay.$("#msm-med-add").addEventListener("click", salvarMedico);
    overlay.$("#msm-estab-add").addEventListener("click", salvarEstabelecimento);
    raiz.MeedsSuiteFormatos.aplicarMascaraCpf(overlay.$("#msm-med-cpf"));
    overlay.$("#msm-estab-cnes").addEventListener("input", function () {
      var el = overlay.$("#msm-estab-cnes");
      el.value = el.value.replace(/\D/g, "").slice(0, 12);
    });
    overlay.$("#msm-backup").addEventListener("click", fazerBackup);
    overlay.$("#msm-restaurar").addEventListener("click", function () {
      overlay.$("#msm-arquivo").click();
    });
    overlay.$("#msm-arquivo").addEventListener("change", restaurarBackup);

    // Enter em qualquer campo do formulario salva — um clique a menos
    ["#msm-med-nome", "#msm-med-crm", "#msm-med-cpf"].forEach(function (sel) {
      overlay.$(sel).addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          salvarMedico();
        }
      });
    });
    ["#msm-estab-nome", "#msm-estab-cnes"].forEach(function (sel) {
      overlay.$(sel).addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          salvarEstabelecimento();
        }
      });
    });

    ctx.dock.registrarBotao({
      id: "_manager",
      icone: "⚙️",
      variante: "engrenagem",
      titulo: "Assistente Meeds — funções, médicos e ajustes",
      prioridade: 0,
      aoClicar: function () {
        abrir();
      },
    });
  }

  function abrir(secao) {
    renderizarModulos();
    renderizarMedicos();
    renderizarEstabelecimentos();
    mostrarMensagemMedicos(null);
    mostrarMensagemEstab(null);
    overlay.abrir();

    var destinos = {
      medicos: ["#msm-secao-medicos", "#msm-med-nome"],
      estabelecimentos: ["#msm-secao-estabelecimentos", "#msm-estab-nome"],
    };
    var d = destinos[secao];
    if (d) {
      overlay.$(d[0]).scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(function () {
        overlay.$(d[1]).focus();
      }, 250);
    }
  }

  /* ---------------- funcoes (modulos) ---------------- */
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
          '    <div class="msm-item-ver">v' + escapeHtml(m.versao) + " · " + escapeHtml(m.id) +
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
        renderizarModulos(); // reflete o estado real (se o start falhou, nao subiu)
      });
    });
  }

  /* ---------------- medicos ---------------- */
  function mostrarMensagemMedicos(texto, tipo) {
    var caixa = overlay.$("#msm-medicos-mensagem");
    if (!texto) {
      caixa.innerHTML = "";
      return;
    }
    caixa.innerHTML = '<div class="msm-' + (tipo || "ok") + '">' + escapeHtml(texto) + "</div>";
  }

  function renderizarMedicos() {
    var lista = Cadastro.listar();
    var box = overlay.$("#msm-medicos-lista");

    if (!lista.length) {
      box.innerHTML =
        '<div class="msm-aviso"><strong>Cadastre seu nome e CRM uma única vez</strong>' +
        "Por segurança, os dados dos médicos não ficam mais no código do programa. " +
        "Preencha abaixo — leva menos de um minuto e você não precisa repetir.</div>";
      return;
    }

    box.innerHTML = lista
      .map(function (m, i) {
        var docs = [];
        if (m.crm) docs.push("CRM " + m.crm);
        if (m.cpf) docs.push("CPF " + m.cpf);
        return (
          '<div class="msm-med">' +
          '  <div class="msm-med-dados">' +
          '    <div class="msm-med-nome">' + escapeHtml(m.nome) + "</div>" +
          '    <div class="msm-med-doc">' + escapeHtml(docs.join("  ·  ") || "sem documento cadastrado") + "</div>" +
          "  </div>" +
          '  <button type="button" class="msm-med-remover" data-i="' + i + '">remover</button>' +
          "</div>"
        );
      })
      .join("");

    box.querySelectorAll(".msm-med-remover").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var i = Number(btn.getAttribute("data-i"));
        var nome = Cadastro.listar()[i];
        Cadastro.remover(i);
        renderizarMedicos();
        mostrarMensagemMedicos((nome ? nome.nome : "Médico") + " foi removido do cadastro.", "ok");
        avisarModulos();
      });
    });
  }

  function mostrarMensagemEstab(texto, tipo) {
    var caixa = overlay.$("#msm-estab-mensagem");
    if (!texto) {
      caixa.innerHTML = "";
      return;
    }
    caixa.innerHTML = '<div class="msm-' + (tipo || "ok") + '">' + escapeHtml(texto) + "</div>";
  }

  function renderizarEstabelecimentos() {
    var lista = Cadastro.listarEstabelecimentos();
    var box = overlay.$("#msm-estab-lista");

    if (!lista.length) {
      box.innerHTML =
        '<div class="msm-vazio">Nenhum estabelecimento cadastrado. Acrescente abaixo o nome e o CNES da unidade solicitante.</div>';
      return;
    }

    box.innerHTML = lista
      .map(function (e, i) {
        return (
          '<div class="msm-med">' +
          '  <div class="msm-med-dados">' +
          '    <div class="msm-med-nome">' + escapeHtml(e.nome) + "</div>" +
          '    <div class="msm-med-doc">' + escapeHtml(e.cnes ? "CNES " + e.cnes : "sem CNES cadastrado") + "</div>" +
          "  </div>" +
          '  <button type="button" class="msm-med-remover" data-e="' + i + '">remover</button>' +
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
        mostrarMensagemEstab((alvo ? alvo.nome : "Estabelecimento") + " foi removido.", "ok");
        avisarModulos();
      });
    });
  }

  function salvarEstabelecimento() {
    var nome = overlay.$("#msm-estab-nome").value.trim();
    if (!nome) {
      mostrarMensagemEstab(
        "Não consegui salvar porque o nome está vazio. Preencha o campo “Nome do estabelecimento”.",
        "erro"
      );
      overlay.$("#msm-estab-nome").focus();
      return;
    }
    var r = Cadastro.adicionarEstabelecimento({
      nome: nome,
      cnes: overlay.$("#msm-estab-cnes").value,
    });
    if (!r.ok) {
      mostrarMensagemEstab(r.erro, "erro");
      return;
    }
    overlay.$("#msm-estab-nome").value = "";
    overlay.$("#msm-estab-cnes").value = "";
    renderizarEstabelecimentos();
    mostrarMensagemEstab(
      r.atualizou ? nome + " já estava cadastrado — atualizei o CNES." : nome + " foi cadastrado com sucesso.",
      "ok"
    );
    overlay.$("#msm-estab-nome").focus();
    avisarModulos();
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

    var r = Cadastro.adicionar({
      nome: nome,
      crm: overlay.$("#msm-med-crm").value.trim(),
      cpf: cpf,
    });
    if (!r.ok) {
      mostrarMensagemMedicos(r.erro, "erro");
      return;
    }

    ["#msm-med-nome", "#msm-med-crm", "#msm-med-cpf"].forEach(function (s) {
      overlay.$(s).value = "";
    });
    renderizarMedicos();
    mostrarMensagemMedicos(
      r.atualizou ? nome + " já estava cadastrado — atualizei os dados dele." : nome + " foi cadastrado com sucesso.",
      "ok"
    );
    overlay.$("#msm-med-nome").focus();
    avisarModulos();
  }

  /* Os modulos de laudo mostram a lista num <select>; quando o cadastro
   * muda, eles precisam se redesenhar. O nucleo repassa o aviso. */
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
    ev.target.value = ""; // permite escolher o mesmo arquivo de novo
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

  raiz.MeedsSuiteManager = {
    montar: montar,
    abrir: function (secao) {
      if (overlay) abrir(secao);
    },
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
