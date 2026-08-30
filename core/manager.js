/* ------------------------------------------------------------------
 * core/manager.js — painel de gerenciamento de modulos (engrenagem)
 * ------------------------------------------------------------------
 * O botao de engrenagem SEMPRE aparece (com prioridade 0, ou seja, no
 * pe da pilha), mesmo que todos os modulos estejam desativados — senao
 * o medico que desligar tudo perde o caminho de volta.
 *
 * Ligar/desligar aqui chama definirHabilitado() no nucleo, que faz
 * start()/stop() na hora. NAO existe "recarregue a pagina para valer" —
 * o requisito e explicito no contrato de modulo, e e o que torna
 * plausivel o cenario "plantonista de Itauna liga so o alarme e a APAC".
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var ESTILO = [
    ".msm-modal {",
    "  background: #fff; border-radius: 16px; width: 100%; max-width: 460px;",
    "  max-height: 86vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,.35);",
    "}",
    ".msm-head {",
    "  background: linear-gradient(135deg, #123a7a, #1a56ad); color: #fff;",
    "  padding: 16px 18px; display: flex; justify-content: space-between;",
    "  align-items: center; position: sticky; top: 0; z-index: 2;",
    "}",
    ".msm-head h2 { margin: 0; font-size: 15px; font-weight: 700; }",
    ".msm-head .msm-sub { margin: 2px 0 0; font-size: 11px; opacity: .85; font-weight: 400; }",
    ".msm-fechar { background: rgba(255,255,255,.2); border: none; color: #fff; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 14px; }",
    ".msm-fechar:hover { background: rgba(255,255,255,.34); }",
    ".msm-body { padding: 14px 18px 18px; }",
    ".msm-intro { font-size: 11.5px; color: #5b6672; line-height: 1.5; margin: 0 0 14px; }",
    ".msm-item {",
    "  display: flex; align-items: flex-start; gap: 12px; padding: 11px 0;",
    "  border-bottom: 1px solid #eef2f6;",
    "}",
    ".msm-item:last-child { border-bottom: none; }",
    ".msm-item-txt { flex: 1; min-width: 0; }",
    ".msm-item-nome { font-size: 13px; font-weight: 700; color: #16221f; }",
    ".msm-item-desc { font-size: 11.5px; color: #5b6672; line-height: 1.45; margin-top: 2px; }",
    ".msm-item-ver { font-size: 10px; color: #9aa5b1; font-family: monospace; margin-top: 3px; }",
    /* interruptor liga/desliga */
    ".msm-switch { position: relative; width: 44px; height: 25px; flex-shrink: 0; cursor: pointer; }",
    ".msm-switch input { opacity: 0; width: 0; height: 0; }",
    ".msm-slider {",
    "  position: absolute; inset: 0; background: #cbd5e1; border-radius: 999px;",
    "  transition: background .18s ease;",
    "}",
    ".msm-slider::before {",
    "  content: ''; position: absolute; height: 19px; width: 19px; left: 3px; top: 3px;",
    "  background: #fff; border-radius: 50%; transition: transform .18s ease;",
    "  box-shadow: 0 1px 3px rgba(0,0,0,.3);",
    "}",
    ".msm-switch input:checked + .msm-slider { background: #12958a; }",
    ".msm-switch input:checked + .msm-slider::before { transform: translateX(19px); }",
    ".msm-vazio { font-size: 12px; color: #8a97a4; font-style: italic; padding: 10px 0; }",
    ".msm-rodape { font-size: 10.5px; color: #9aa5b1; margin-top: 14px; line-height: 1.5; border-top: 1px solid #eef2f6; padding-top: 10px; }",
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
        '      <h2 id="msm-title">Meeds Suite</h2>' +
        '      <p class="msm-sub">Nucleo ' +
        escapeHtml(ctx.versaoNucleo) +
        " &middot; ative so o que voce usa</p>" +
        "    </div>" +
        '    <button type="button" class="msm-fechar" aria-label="Fechar">&#10005;</button>' +
        "  </div>" +
        '  <div class="msm-body">' +
        '    <p class="msm-intro">Cada funcao e um modulo independente. Desligar um modulo tira o botao dele da tela na hora — nao precisa recarregar a pagina nem reinstalar nada.</p>' +
        '    <div id="msm-lista"></div>' +
        '    <div class="msm-rodape">As preferencias ficam salvas so neste navegador. Nenhum dado de paciente e gravado em disco nem enviado para fora.</div>' +
        "  </div>" +
        "</div>",
    });

    overlay.$(".msm-fechar").addEventListener("click", function () {
      overlay.fechar();
    });

    ctx.dock.registrarBotao({
      id: "_manager",
      icone: "⚙️",
      variante: "engrenagem",
      titulo: "Gerenciar modulos da Meeds Suite",
      prioridade: 0, // sempre no pe da pilha
      aoClicar: abrir,
    });
  }

  function abrir() {
    renderizar();
    overlay.abrir();
  }

  function renderizar() {
    var lista = overlay.$("#msm-lista");
    var modulos = ctx.listarModulos();

    if (!modulos.length) {
      lista.innerHTML = '<div class="msm-vazio">Nenhum modulo carregado neste pacote.</div>';
      return;
    }

    lista.innerHTML = modulos
      .map(function (m) {
        return (
          '<div class="msm-item">' +
          '  <div class="msm-item-txt">' +
          '    <div class="msm-item-nome">' +
          escapeHtml(m.nome) +
          "</div>" +
          '    <div class="msm-item-desc">' +
          escapeHtml(m.descricao) +
          "</div>" +
          '    <div class="msm-item-ver">v' +
          escapeHtml(m.versao) +
          " &middot; " +
          escapeHtml(m.id) +
          "</div>" +
          "  </div>" +
          '  <label class="msm-switch">' +
          '    <input type="checkbox" data-id="' +
          escapeHtml(m.id) +
          '" ' +
          (m.habilitado ? "checked" : "") +
          " />" +
          '    <span class="msm-slider"></span>' +
          "  </label>" +
          "</div>"
        );
      })
      .join("");

    overlay.$$('input[type="checkbox"][data-id]').forEach(function (input) {
      input.addEventListener("change", function () {
        var id = input.getAttribute("data-id");
        ctx.definirHabilitado(id, input.checked);
        // reflete o estado real (se o start() falhou, o modulo nao subiu)
        renderizar();
      });
    });
  }

  raiz.MeedsSuiteManager = {
    montar: montar,
    abrir: function () {
      if (overlay) abrir();
    },
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
