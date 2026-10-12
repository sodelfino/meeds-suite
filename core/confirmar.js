/* ------------------------------------------------------------------
 * core/confirmar.js — diálogo de confirmação único do Assistente
 * ------------------------------------------------------------------
 * POR QUE EXISTE
 * Antes, só "apagar modelo" confirmava, e com o confirm() nativo: o texto
 * era "Apagar o modelo X?" e os botões, "OK" e "Cancelar" — o navegador não
 * deixa renomear. "Limpar histórico", "Limpar" (formulários) e "remover"
 * (médico/unidade) apagavam na hora, sem aviso.
 *
 * COMO USAR
 *   MeedsSuiteConfirmar.perguntar({
 *     titulo:    "Apagar o modelo “Rotina”?",          // diz o que vai acontecer
 *     texto:     "Isso não pode ser desfeito.",         // diz a consequência
 *     confirmar: "Apagar modelo",                       // verbo + objeto
 *     manter:    "Manter modelo",                       // a saída segura
 *   }, function () { ...executa a ação... });
 *
 * Regras de copy (ver docs/ARQUITETURA.md, D68): o botão nomeia a ação, nunca
 * "OK"/"Sim"/"Cancelar"; a consequência vem escrita; o foco inicial fica no
 * botão seguro, então Enter sem querer não apaga nada; Esc mantém.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  const ESTILO = [
    ".msc-caixa { background:#fff; color:#16221f; border-radius:12px; width:min(420px, calc(100vw - 32px)); margin:auto; padding:20px 20px 16px; box-shadow:0 12px 36px rgba(15,23,42,.35); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; }",
    ".msc-titulo { font-size:15px; font-weight:800; line-height:1.3; margin:0 0 8px; }",
    ".msc-texto { font-size:13px; line-height:1.5; color:#46525f; margin:0 0 18px; }",
    ".msc-acoes { display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; }",
    ".msc-acoes button { font-family:inherit; font-size:13px; font-weight:700; border-radius:8px; padding:9px 14px; cursor:pointer; }",
    ".msc-manter { background:#fff; color:#123a7a; border:1.5px solid #c9d6e8; }",
    ".msc-manter:hover { background:#eef4fb; }",
    ".msc-confirmar { background:#b42318; color:#fff; border:1.5px solid #b42318; }",
    ".msc-confirmar:hover { background:#912018; }",
    ".msc-acoes button:focus-visible { outline:3px solid #1a56ad; outline-offset:2px; }",
  ].join("\n");

  const HTML =
    '<div class="msc-caixa" role="alertdialog" aria-modal="true" aria-labelledby="msc-titulo" aria-describedby="msc-texto">' +
    '  <h2 class="msc-titulo" id="msc-titulo"></h2>' +
    '  <p class="msc-texto" id="msc-texto"></p>' +
    '  <div class="msc-acoes">' +
    '    <button type="button" class="msc-manter" id="msc-manter"></button>' +
    '    <button type="button" class="msc-confirmar" id="msc-confirmar"></button>' +
    "  </div>" +
    "</div>";

  let overlay = null;
  let aoConfirmar = null;

  function fechar() {
    aoConfirmar = null;
    if (overlay) overlay.fechar();
  }

  function garantir() {
    if (overlay) return overlay;
    overlay = raiz.MeedsSuiteDock.criarOverlay({ estilo: ESTILO, html: HTML, fecharAoClicarFora: false });
    overlay.$("#msc-manter").addEventListener("click", fechar);
    overlay.$("#msc-confirmar").addEventListener("click", function () {
      const acao = aoConfirmar;
      fechar();
      if (typeof acao === "function") acao();
    });
    overlay.elemento.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        fechar();
      }
    });
    return overlay;
  }

  /* perguntar(opcoes, aoConfirmar) — a acao so roda se o medico confirmar. */
  function perguntar(opcoes, acao) {
    const o = opcoes || {};
    /* Sem o dock (teste isolado, falha de carga), o nativo ainda protege. */
    if (!raiz.MeedsSuiteDock || typeof raiz.MeedsSuiteDock.criarOverlay !== "function") {
      if (typeof raiz.confirm === "function" && raiz.confirm((o.titulo || "") + "\n" + (o.texto || ""))) {
        if (typeof acao === "function") acao();
      }
      return;
    }
    const ov = garantir();
    ov.$("#msc-titulo").textContent = o.titulo || "Continuar?";
    ov.$("#msc-texto").textContent = o.texto || "";
    ov.$("#msc-confirmar").textContent = o.confirmar || "Continuar";
    ov.$("#msc-manter").textContent = o.manter || "Voltar sem alterar";
    aoConfirmar = acao;
    ov.abrir();
    ov.$("#msc-manter").focus();
  }

  /* Atalhos: o texto de cada confirmação mora aqui, num lugar só, para a
   * mesma ação dizer a mesma coisa em todas as telas. */
  function limparCampos(acao) {
    perguntar({
      titulo: "Limpar todos os campos?",
      texto: "Tudo o que você digitou nesta tela será apagado. Os dados do paciente podem ser lidos da tela do atendimento de novo.",
      confirmar: "Limpar campos",
      manter: "Manter campos",
    }, acao);
  }

  function apagarModelo(nome, acao) {
    perguntar({
      titulo: "Apagar o modelo \u201c" + nome + "\u201d?",
      texto: "Isso não pode ser desfeito. Os documentos já gerados não mudam.",
      confirmar: "Apagar modelo",
      manter: "Manter modelo",
    }, acao);
  }

  function apagarHistorico(acao) {
    perguntar({
      titulo: "Apagar o histórico de documentos?",
      texto: "A lista de documentos gerados neste computador será apagada. Os arquivos já baixados não são afetados. Isso não pode ser desfeito.",
      confirmar: "Apagar histórico",
      manter: "Manter histórico",
    }, acao);
  }

  /* tipo: "médico" | "unidade" */
  function removerCadastro(tipo, nome, acao) {
    const medico = tipo === "médico";
    perguntar({
      titulo: "Remover " + (nome ? "\u201c" + nome + "\u201d" : medico ? "este médico" : "esta unidade") + " do cadastro?",
      texto: (medico ? "Ele deixa de aparecer na lista de médicos dos documentos." : "Ela deixa de aparecer na lista de unidades dos documentos.") +
        " Você pode cadastrar de novo quando quiser.",
      confirmar: medico ? "Remover médico" : "Remover unidade",
      manter: medico ? "Manter médico" : "Manter unidade",
    }, acao);
  }

  raiz.MeedsSuiteConfirmar = {
    perguntar: perguntar,
    limparCampos: limparCampos,
    apagarModelo: apagarModelo,
    apagarHistorico: apagarHistorico,
    removerCadastro: removerCadastro,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
