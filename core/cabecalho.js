/* ------------------------------------------------------------------
 * core/cabecalho.js — o cabeçalho das janelas de módulo, num lugar só
 * ------------------------------------------------------------------
 * POR QUE EXISTE
 * Cada gerador nasceu com o próprio cabeçalho: a APAC, a Sete Lagoas e a
 * Conceição usavam `<div id="x-modal-head">` com botões de estilo
 * embutido; a REMUME, os Exames e o Alarme usavam `<header>` com uma
 * classe de fechar diferente. Mesma ideia — faixa colorida, título,
 * ações à direita, um X —, seis implementações que já divergiam no
 * padding, no formato do botão de fechar e na ordem das ações.
 *
 * Aqui a estrutura e o estilo são um só. O módulo passa o título, as
 * ações (com o id que ele já usa para ligar o clique) e o tom da faixa;
 * o resto é igual para todos. Ver decisão D58 em docs/ARQUITETURA.md.
 *
 * O QUE O MÓDULO CONTINUA FAZENDO
 * Ligar o clique de cada ação e do X, pelo id — como antes. Este arquivo
 * só desenha; não escuta evento nenhum.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  /* Um tom por família de janela. O gerador de documento é azul; a
   * consulta (REMUME, Exames) é verde-água; o alarme é quente, porque
   * ele é o único que pode aparecer no meio de uma consulta. */
  var TONS = {
    documento: "linear-gradient(135deg,#123a7a,#1a56ad)",
    consulta: "linear-gradient(135deg,#0f766e,#0ea5a4)",
    alarme: "linear-gradient(135deg,#dc2626,#f97316)",
  };

  var CSS = [
    ".msc-head {",
    "  color:#fff; padding:15px 18px; display:flex; align-items:flex-start;",
    "  justify-content:space-between; gap:12px;",
    "  position:sticky; top:0; z-index:3; border-radius:16px 16px 0 0;",
    "}",
    ".msc-head-txt { min-width:0; }",
    ".msc-head h2 { margin:0; font-size:15px; font-weight:700; line-height:1.25; text-wrap:balance; }",
    ".msc-sub { margin:3px 0 0; font-size:11.5px; line-height:1.35; opacity:.9; }",
    ".msc-acoes { display:flex; align-items:center; gap:8px; flex-shrink:0; }",
    ".msc-acao {",
    "  background:rgba(255,255,255,.2); border:none; color:#fff; border-radius:999px;",
    "  padding:5px 11px; font-size:11px; font-weight:700; font-family:inherit;",
    "  cursor:pointer; white-space:nowrap; line-height:1.3;",
    "}",
    ".msc-acao:hover { background:rgba(255,255,255,.34); }",
    ".msc-fechar {",
    "  background:rgba(255,255,255,.2); border:none; color:#fff;",
    "  width:28px; height:28px; border-radius:50%; flex-shrink:0;",
    "  font-size:14px; line-height:1; cursor:pointer;",
    "}",
    ".msc-fechar:hover { background:rgba(255,255,255,.34); }",
  ].join("\n");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* html({ titulo, subtitulo, tom, idTitulo, idFechar, acoes })
   *   acoes:   [{ id, rotulo, titulo }] — a ordem é a ordem na tela;
   *            "Atualizar paciente" antes de "Histórico" em todos.
   *   idTitulo: opcional, para o `aria-labelledby` do modal (REMUME usa).
   *   idFechar: o id do botão X (cada módulo já tinha o seu).
   */
  function html(spec) {
    var s = spec || {};
    var tom = TONS[s.tom] || TONS.documento;
    var acoes = (s.acoes || [])
      .map(function (a) {
        return (
          '<button type="button" class="msc-acao" id="' + esc(a.id) + '"' +
          (a.titulo ? ' title="' + esc(a.titulo) + '"' : "") +
          ">" + esc(a.rotulo) + "</button>"
        );
      })
      .join("");
    return (
      '<div class="msc-head" style="background:' + tom + '">' +
      '<div class="msc-head-txt">' +
      "<h2" + (s.idTitulo ? ' id="' + esc(s.idTitulo) + '"' : "") + ">" + esc(s.titulo) + "</h2>" +
      (s.subtitulo ? '<p class="msc-sub">' + esc(s.subtitulo) + "</p>" : "") +
      "</div>" +
      '<div class="msc-acoes">' +
      acoes +
      '<button type="button" class="msc-fechar"' +
      (s.idFechar ? ' id="' + esc(s.idFechar) + '"' : "") +
      ' aria-label="Fechar">&#10005;</button>' +
      "</div>" +
      "</div>"
    );
  }

  raiz.MeedsSuiteCabecalho = { CSS: CSS, html: html, TONS: TONS };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
