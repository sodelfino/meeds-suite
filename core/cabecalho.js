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

  /* Um tom por família de janela. Desde a 2.76.0 o tom é a cor do
   * quadrado do ícone, não mais a faixa inteira: o cabeçalho é branco,
   * como a lateral e os Ajustes. */
  const TONS = {
    documento: "#1d3557",
    consulta: "#0f6b64",
    alarme: "#b42318",
  };
  /* Ícone padrão de cada família (core/icones.js) e o fundo claro dele. */
  const ICONE_DO_TOM = { documento: "laudo", consulta: "exames", alarme: "sino" };
  const FUNDO_ICONE = { laudo: "#f3f0ff", notificacao: "#e7f5ff", apac: "#ebfbee", exames: "#e3fafc",
    remume: "#fff0f0", sino: "#fff4e6", aviso: "#fff8db" };

  const CSS = [
    ".msc-head {",
    "  background:#fff; color:#1f2a37; padding:16px 18px; display:flex; align-items:center;",
    "  gap:12px; border-bottom:1px solid #eef1f4;",
    "  position:sticky; top:0; z-index:3; border-radius:20px 20px 0 0;",
    "}",
    ".msc-ico { width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex:none; }",
    ".msc-ico svg { width:24px; height:24px; display:block; }",
    ".msc-head-txt { min-width:0; flex:1; }",
    ".msc-head h2 { margin:0; font-size:16px; font-weight:700; line-height:1.25; color:#1f2a37; text-wrap:balance; }",
    ".msc-sub { margin:2px 0 0; font-size:13px; line-height:1.35; color:#5b6573; }",
    ".msc-acoes { display:flex; align-items:center; gap:8px; flex-shrink:0; flex-wrap:wrap; justify-content:flex-end; }",
    ".msc-acao {",
    "  background:#f1f3f5; border:none; color:#1f2a37; border-radius:10px;",
    "  padding:8px 12px; font-size:13px; font-weight:600; font-family:inherit;",
    "  cursor:pointer; white-space:nowrap; line-height:1.3;",
    "}",
    ".msc-acao:hover { background:#e9ecef; }",
    ".msc-acao:focus-visible, .msc-fechar:focus-visible { outline:2px solid #0b7285; outline-offset:2px; }",
    ".msc-fechar {",
    "  background:#f1f3f5; border:none; color:#5b6573;",
    "  width:40px; height:40px; border-radius:12px; flex-shrink:0;",
    "  font-size:16px; line-height:1; cursor:pointer;",
    "}",
    ".msc-fechar:hover { background:#e9ecef; }",
    "@media (max-width:560px) { .msc-head { flex-wrap:wrap; } .msc-acoes { width:100%; justify-content:flex-start; } }",
  ].join("\n");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* html({ titulo, subtitulo, tom, icone, idTitulo, idFechar, acoes })
   *   icone:   chave de core/icones.js (padrão: o da família do tom).
   *   acoes:   [{ id, rotulo, titulo }] — a ordem é a ordem na tela;
   *            "Atualizar paciente" antes de "Histórico" em todos.
   *   idTitulo: opcional, para o `aria-labelledby` do modal (REMUME usa).
   *   idFechar: o id do botão X (cada módulo já tinha o seu).
   */
  function html(spec) {
    const s = spec || {};
    const tom = TONS[s.tom] || TONS.documento;
    const chaveIcone = s.icone || ICONE_DO_TOM[s.tom] || "laudo";
    const svg = raiz.MeedsSuiteIcones && raiz.MeedsSuiteIcones.obter(chaveIcone);
    const icone = svg
      ? '<div class="msc-ico" style="background:' + (FUNDO_ICONE[chaveIcone] || "#f1f3f5") + '" aria-hidden="true">' + svg + "</div>"
      : '<div class="msc-ico" style="background:' + tom + '" aria-hidden="true"></div>';
    const acoes = (s.acoes || [])
      .map(function (a) {
        return (
          '<button type="button" class="msc-acao" id="' + esc(a.id) + '"' +
          (a.titulo ? ' title="' + esc(a.titulo) + '"' : "") +
          ">" + esc(a.rotulo) + "</button>"
        );
      })
      .join("");
    return (
      '<div class="msc-head">' +
      icone +
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
