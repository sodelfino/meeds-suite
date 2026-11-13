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

  const Cadastro = raiz.MeedsSuiteCadastro;

  const ESTILO = [
    /* Visual de 2.75.0 (pedido de 13/11/2026): cabecalho branco com a
     * marca, abas em pilula, funcoes em cartoes com icone colorido e
     * frase curta, interruptor azul-petroleo. Mesma paleta da lateral. */
    ".msm-modal { background:#fff; border-radius:20px; width:100%; max-width:560px; max-height:88vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 24px 60px rgba(15,23,42,.35); font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; color:#1f2a37; }",

    /* cabecalho */
    ".msm-head { background:#fff; padding:18px 20px 0; flex-shrink:0; }",
    ".msm-head-topo { display:flex; align-items:center; gap:12px; }",
    ".msm-sigla { width:40px; height:40px; border-radius:12px; background:#0b7285; color:#fff; font-weight:800; font-size:14px; display:flex; align-items:center; justify-content:center; flex:none; }",
    ".msm-head-txt { flex:1; min-width:0; }",
    ".msm-head h2 { margin:0; font-size:18px; font-weight:700; color:#1f2a37; }",
    ".msm-head .msm-sub { margin:2px 0 0; font-size:13px; color:#5b6573; }",
    ".msm-fechar { background:#f1f3f5; border:none; color:#5b6573; width:40px; height:40px; border-radius:12px; cursor:pointer; font-size:16px; flex-shrink:0; }",
    ".msm-fechar:hover { background:#e9ecef; }",

    /* abas em pilula */
    ".msm-abas { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:4px; margin-top:14px; padding:4px; background:#f1f3f5; border-radius:12px; }",
    ".msm-aba { position:relative; background:none; border:none; color:#5b6573; cursor:pointer; font-family:inherit; font-size:14px; font-weight:600; padding:9px 4px; border-radius:9px; }",
    ".msm-aba:hover { color:#1f2a37; }",
    ".msm-aba[aria-selected='true'] { color:#1f2a37; background:#fff; font-weight:700; box-shadow:0 1px 3px rgba(15,23,42,.12); }",
    ".msm-aba:focus-visible, .msm-fechar:focus-visible, .msm-btn:focus-visible, .msm-mini:focus-visible { outline:2px solid #0b7285; outline-offset:2px; }",

    /* faixa: saiu versao nova */
    ".msm-novidade { margin:14px 20px 0; padding:12px 14px; border-radius:14px; background:#e6f4f5; border:1px solid #b6dde1; display:flex; align-items:center; gap:12px; flex-shrink:0; }",
    ".msm-novidade[hidden] { display:none; }",
    ".msm-novidade-ico { width:22px; height:22px; flex:none; background:no-repeat center/contain url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230b7285' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3v12'/%3E%3Cpath d='m7 10 5 5 5-5'/%3E%3Cpath d='M5 21h14'/%3E%3C/svg%3E\"); }",
    ".msm-novidade-txt { flex:1; min-width:0; font-size:12px; color:#2e5e66; line-height:1.4; }",
    ".msm-novidade-txt b { display:block; font-size:14px; color:#0b5a66; }",

    ".msm-body { padding:6px 20px 18px; overflow-y:auto; flex:1; }",
    ".msm-painel[hidden] { display:none; }",
    ".msm-ajuda { font-size:12px; color:#5b6573; line-height:1.5; margin:12px 4px 0; }",

    /* funcoes: grupos em cartao */
    ".msm-categoria { font-size:11px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#5b6573; padding:16px 4px 6px; }",
    ".msm-grupo { border:1px solid #e3e7ec; border-radius:14px; overflow:hidden; }",
    ".msm-item { display:flex; align-items:center; gap:12px; padding:12px 14px; border-bottom:1px solid #eef1f4; }",
    ".msm-item:last-child { border-bottom:none; }",
    ".msm-item-ico { width:36px; height:36px; border-radius:10px; background:#f1f3f5; display:flex; align-items:center; justify-content:center; flex:none; }",
    ".msm-item-ico svg { width:22px; height:22px; display:block; }",
    ".msm-item-txt { flex:1; min-width:0; }",
    ".msm-item-nome { font-size:14px; font-weight:700; color:#1f2a37; }",
    ".msm-item-desc { font-size:13px; color:#5b6573; line-height:1.4; margin-top:2px; }",
    ".msm-mini { background:none; border:none; padding:6px 4px; font:inherit; font-size:13px; font-weight:600; color:#0b7285; cursor:pointer; flex:none; }",
    ".msm-mini:hover { color:#095c6b; text-decoration:underline; }",
    ".msm-fixos { font-size:12px; color:#5b6573; line-height:1.5; padding:14px 4px 2px; }",
    ".msm-fixos b { color:#1f2a37; font-weight:600; }",
    ".msm-tutorial-fixo { background:none; border:none; padding:0; font:inherit; font-size:12px; color:#0b7285; cursor:pointer; text-decoration:underline dotted; }",
    ".msm-tutorial-fixo:hover { color:#095c6b; }",
    ".msm-tutorial-fixo b { color:inherit; }",

    ".msm-switch { position:relative; width:42px; height:24px; flex-shrink:0; cursor:pointer; }",
    ".msm-switch input { opacity:0; width:0; height:0; }",
    ".msm-slider { position:absolute; inset:0; background:#ced4da; border-radius:999px; transition:background .18s ease; }",
    ".msm-slider::before { content:''; position:absolute; height:18px; width:18px; left:3px; top:3px; background:#fff; border-radius:999px; transition:transform .22s cubic-bezier(.3,1.4,.6,1), width .16s ease; box-shadow:0 1px 3px rgba(0,0,0,.25); }",
    ".msm-switch input:checked + .msm-slider { background:#0b7285; }",
    ".msm-switch input:checked + .msm-slider::before { transform:translateX(18px); }",
    ".msm-switch:active .msm-slider::before { width:23px; }",
    ".msm-switch:active input:checked + .msm-slider::before { transform:translateX(13px); }",
    ".msm-switch input:focus-visible + .msm-slider { outline:2px solid #0b7285; outline-offset:2px; }",
    "@media (prefers-reduced-motion: reduce) { .msm-slider, .msm-slider::before { transition:none; } }",

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

    ".msm-btn { background:#0b7285; color:#fff; border:none; border-radius:10px; padding:10px 16px; font-size:14px; font-weight:700; font-family:inherit; cursor:pointer; flex:none; }",
    ".msm-btn:hover { background:#095c6b; }",
    ".msm-btn-sec { background:#fff; color:#1f2a37; border:1px solid #dde2e7; font-weight:600; }",
    ".msm-btn-sec:hover { background:#f1f3f5; }",

    /* rodape discreto da aba */
    ".msm-rodape-aba { margin-top:16px; padding-top:12px; border-top:1px solid #eef2f6; font-size:11px; color:#8a97a4; line-height:1.6; }",
    ".msm-link { background:none; border:none; color:#0b7285; cursor:pointer; font-size:12.5px; font-family:inherit; font-weight:600; padding:0; text-decoration:none; }",
    ".msm-link:hover { color:#095c6b; text-decoration:underline; }",
    /* Discreto de proposito: sem titulo, sem texto explicando o que faz. */
    ".msm-noturno-linha { text-align:right; margin-top:4px; }",
    ".msm-noturno { background:none; border:none; color:#c3cad2; cursor:pointer; font-size:9.5px; font-family:inherit; padding:2px; }",
    ".msm-noturno:hover { color:#8a97a4; }",
    ".msm-noturno[aria-pressed='true'] { color:#0f766e; font-weight:700; }",

    /* mensagens */
    ".msm-aviso, .msm-ok, .msm-erro { font-size:11.5px; line-height:1.55; padding:10px 12px; border-radius:9px; margin:10px 0; }",
    ".msm-aviso { background:#fff4e2; border:1px solid #f5d9ac; color:#8a5200; }",
    ".msm-aviso strong { display:block; margin-bottom:3px; }",
    ".msm-ok { background:#e6f6f2; border:1px solid #b6e3d8; color:#0b6a62; }",
    ".msm-erro { background:#fde8e8; border:1px solid #f0b8b8; color:#a12626; }",

    /* sobre */
    ".msm-versao-cartao { margin-top:16px; border-radius:16px; background:linear-gradient(135deg,#0b7285,#0e5966); color:#fff; padding:16px; display:flex; align-items:center; gap:14px; }",
    ".msm-versao-sigla { width:48px; height:48px; border-radius:14px; background:rgba(255,255,255,.16); font-weight:800; font-size:16px; display:flex; align-items:center; justify-content:center; flex:none; }",
    ".msm-versao-txt { flex:1; min-width:0; }",
    ".msm-versao-nome { font-size:16px; font-weight:700; }",
    ".msm-versao-num { font-size:13px; opacity:.92; margin-top:2px; }",
    ".msm-versao-estado { background:rgba(255,255,255,.16); border-radius:999px; padding:6px 12px; font-size:13px; font-weight:600; white-space:nowrap; }",
    ".msm-versao-estado.msm-versao-nova { background:#fff; color:#0b5a66; }",
    ".msm-versao-linha { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 4px 0; font-size:12.5px; color:#5b6573; }",
    ".msm-escopo { padding-top:4px; font-size:12px; }",
    ".msm-escopo:empty { display:none; }",
    ".msm-cartao { margin-top:14px; border:1px solid #e3e7ec; border-radius:14px; overflow:hidden; }",
    ".msm-linha { display:flex; align-items:center; gap:12px; padding:14px; border-bottom:1px solid #eef1f4; }",
    ".msm-linha:last-child { border-bottom:none; }",
    ".msm-linha-ico { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex:none; font-size:18px; }",
    ".msm-linha-txt { flex:1; min-width:0; }",
    ".msm-linha-titulo { font-size:14px; font-weight:700; color:#1f2a37; }",
    ".msm-linha-sub { font-size:13px; color:#5b6573; line-height:1.45; margin-top:2px; }",
  ].join("\n");

  const ABAS = [
    { id: "funcoes", rotulo: "Funções", sub: "Ligue só o que você usa." },
    { id: "medicos", rotulo: "Médicos", sub: "Cadastre uma vez, vale em todos os laudos." },
    { id: "unidades", rotulo: "Unidades", sub: "Unidades e CNES usados na APAC." },
    { id: "sobre", rotulo: "Sobre", sub: "Versão, ajuda e privacidade." },
  ];

  let overlay = null;
  let ctx = null;
  let botaoEngrenagem = null;
  let versaoNova = null;      // { versao, urlInstalar, variante } quando saiu versao nova
  let ultimaChecagem = 0;

  /* VERSAO NOVA SOZINHA (pedido de 13/11/2026): abrir a engrenagem ja
   * confere se saiu versao nova — sem botao. Nao achou (ou deu erro de
   * rede): nada aparece. Achou: faixa no topo dos Ajustes com "Atualizar"
   * e um ponto na engrenagem. Tambem confere uma vez, discretamente,
   * pouco depois de a pagina carregar, para o ponto aparecer sem o medico
   * precisar abrir. Instalar continua sendo confirmado por ele, na tela
   * do Tampermonkey/Userscripts (ver core/atualizacao.js). */
  const INTERVALO_MIN_CHECAGEM_MS = 60 * 1000;

  function checarVersao() {
    const at = raiz.MeedsSuiteAtualizacao;
    if (!at || !ctx || Date.now() - ultimaChecagem < INTERVALO_MIN_CHECAGEM_MS) {
      refletirVersao();
      return;
    }
    ultimaChecagem = Date.now();
    at.verificar(
      { versaoAtual: ctx.versaoNucleo, baseReleases: ctx.manifesto && ctx.manifesto.baseReleases },
      function (r) {
        if (r.situacao === "disponivel") {
          versaoNova = { versao: r.versaoNova, urlInstalar: r.urlInstalar, variante: r.variante };
        } else if (r.situacao !== "erro") {
          versaoNova = null;
        }
        refletirVersao(r.situacao);
      }
    );
  }

  function refletirVersao(situacao) {
    if (botaoEngrenagem) botaoEngrenagem.definirClasse("ms-tem-novidade", !!versaoNova);
    if (!overlay) return;
    const faixa = overlay.$("#msm-novidade");
    const estado = overlay.$("#msm-versao-estado");
    faixa.hidden = !versaoNova;
    if (versaoNova) {
      overlay.$("#msm-novidade-titulo").textContent = "Saiu uma versão nova: " + versaoNova.versao;
      overlay.$("#msm-novidade-sub").textContent = "Você está na " + ctx.versaoNucleo + ".";
      estado.textContent = "Versão nova";
      estado.className = "msm-versao-estado msm-versao-nova";
    } else if (situacao === "atualizado" || situacao === "mais-nova") {
      estado.textContent = "✓ Atualizado";
      estado.className = "msm-versao-estado";
      overlay.$("#msm-versao-quando").textContent = "Conferido agora, ao abrir os Ajustes.";
    } else if (situacao === "erro") {
      estado.textContent = "Sem conexão";
      estado.className = "msm-versao-estado";
    }
  }

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
        '      <div class="msm-sigla" aria-hidden="true">AM</div>' +
        '      <div class="msm-head-txt">' +
        '        <h2 id="msm-title">Ajustes</h2>' +
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
        '  <div class="msm-novidade" id="msm-novidade" hidden>' +
        '    <span class="msm-novidade-ico" aria-hidden="true"></span>' +
        '    <div class="msm-novidade-txt"><b id="msm-novidade-titulo"></b><span id="msm-novidade-sub"></span></div>' +
        '    <button type="button" class="msm-btn" id="msm-atualizar-instalar">Atualizar</button>' +
        "  </div>" +
        '  <div class="msm-body">' +

        /* ---- Funções ---- */
        '    <div class="msm-painel" id="msm-painel-funcoes" role="tabpanel" hidden>' +
        '      <p class="msm-ajuda">Desligar tira o botão da lateral. Religue quando quiser.</p>' +
        '      <div id="msm-lista"></div>' +
        "    </div>" +

        /* ---- Médicos ---- */
        '    <div class="msm-painel" id="msm-painel-medicos" role="tabpanel" hidden>' +
        '      <p class="msm-ajuda">Ficam salvos neste navegador e sobrevivem às atualizações.</p>' +
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
        '          <button type="button" class="msm-btn msm-btn-sec" id="msm-med-cancelar">Cancelar cadastro</button>' +
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
  
        '      <div id="msm-estab-mensagem"></div>' +
        '      <div id="msm-estab-lista"></div>' +
        '      <button type="button" class="msm-abrir-form" id="msm-estab-abrir">+ Cadastrar unidade</button>' +
        '      <div class="msm-form" id="msm-estab-form" hidden>' +
        '        <div class="msm-form-grade">' +
        '          <div class="msm-largo"><label for="msm-estab-nome">Nome da unidade</label>' +
        '            <input id="msm-estab-nome" placeholder="como deve aparecer no laudo" autocomplete="off"></div>' +
        '          <div class="msm-largo"><label for="msm-estab-cnes">CNES</label>' +
        '            <input id="msm-estab-cnes" placeholder="somente números" inputmode="numeric" autocomplete="off"></div>' +
        '          <div class="msm-largo"><label for="msm-estab-municipio">Município</label>' +
        '            <select id="msm-estab-municipio"></select>' +
        '            <div class="msm-dica-campo">É o município que separa as unidades na hora de gerar a APAC. ' +
        'Usar o CNES de outro município faz o pedido ser glosado.</div></div>' +
        "        </div>" +
        '        <div class="msm-form-acoes">' +
        '          <button type="button" class="msm-btn" id="msm-estab-add">Salvar unidade</button>' +
        '          <button type="button" class="msm-btn msm-btn-sec" id="msm-estab-cancelar">Cancelar cadastro</button>' +
        "        </div>" +
        "      </div>" +
        "    </div>" +

        /* ---- Sobre ---- */
        '    <div class="msm-painel" id="msm-painel-sobre" role="tabpanel" hidden>' +
        '      <div class="msm-versao-cartao">' +
        '        <div class="msm-versao-sigla" aria-hidden="true">AM</div>' +
        '        <div class="msm-versao-txt">' +
        '          <div class="msm-versao-nome">Assistente Meeds</div>' +
        '          <div class="msm-versao-num">Versão <b id="msm-versao"></b> · por Marcelo</div>' +
        "        </div>" +
        '        <div class="msm-versao-estado" id="msm-versao-estado">Verificando…</div>' +
        "      </div>" +
        '      <div class="msm-versao-linha">' +
        '        <span id="msm-versao-quando">A versão é conferida ao abrir os Ajustes.</span>' +
        '        <button type="button" class="msm-link" id="msm-historico-versoes">O que mudou</button>' +
        "      </div>" +
        '      <div class="msm-versao-linha msm-escopo" id="msm-escopo"></div>' +
        '      <div class="msm-cartao">' +
        '        <div class="msm-linha">' +
        '          <div class="msm-linha-ico" style="background:#e6f4f5" aria-hidden="true">💬</div>' +
        '          <div class="msm-linha-txt"><div class="msm-linha-titulo">Problema ou ideia?</div>' +
        '            <div class="msm-linha-sub">Duas linhas já ajudam.</div></div>' +
        '          <button type="button" class="msm-btn" id="msm-feedback">Enviar feedback</button>' +
        "        </div>" +
        '        <div class="msm-linha">' +
        '          <div class="msm-linha-ico" style="background:#f1f3f5" aria-hidden="true">📋</div>' +
        '          <div class="msm-linha-txt"><div class="msm-linha-titulo">Diagnóstico técnico</div>' +
        '            <div class="msm-linha-sub">Só se o suporte pedir. CPF e CNS saem mascarados.</div>' +
        '            <div id="msm-diagnostico-mensagem"></div></div>' +
        '          <button type="button" class="msm-btn msm-btn-sec" id="msm-diagnostico-copiar">Copiar diagnóstico</button>' +
        "        </div>" +
        "      </div>" +
        '      <div class="msm-cartao">' +
        '        <div class="msm-linha">' +
        '          <div class="msm-linha-ico" style="background:#ebfbee" aria-hidden="true">🛡️</div>' +
        '          <div class="msm-linha-txt"><div class="msm-linha-titulo">Privacidade</div>' +
        '            <div class="msm-linha-sub">Nada de paciente sai do seu navegador. Aqui ficam suas preferências, cadastros e o histórico dos documentos, com iniciais e 3 dígitos do CPF (não é anônimo) e o texto clínico como foi digitado.</div></div>' +
        "        </div>" +
        "      </div>" +
      '      <div class="msm-noturno-linha">' +
        '        <button type="button" class="msm-noturno" id="msm-noturno" aria-pressed="false">Noturno</button>' +
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
      const linha = overlay.$("#msm-escopo");
      const diag = raiz.MeedsSuiteDiagnostico;
      if (!linha || !diag || !diag.escopoDeExecucao) return;
      const partes = [
        diag.escopoDeExecucao() === "pagina"
          ? "Funcionando com todos os sinais"
          : "Modo restrito: o navegador isolou o Assistente, então o alarme de fila decide só pelo que aparece na tela",
      ];

      /* A segunda metade da mesma pergunta. "Sumiu meu cadastro" e
       * "voltaram todos os botoes" tem a mesma causa raiz — o dado nao
       * estava num lugar que sobrevive ao logout — e ate agora nao havia
       * como saber isso sem abrir o console. */
      const onde = raiz.MeedsSuiteStorage && raiz.MeedsSuiteStorage.ondeEstaGuardado
        ? raiz.MeedsSuiteStorage.ondeEstaGuardado()
        : null;
      if (onde === "sessao") {
        partes.push("Atenção: suas configurações e o cadastro podem se perder ao sair do Meeds neste navegador");
      } else if (onde) {
        partes.push("Configurações e cadastro ficam salvos mesmo depois de você sair");
      }

      linha.innerHTML = partes.map(escapeHtml).join(" · ");
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
    montarMunicipiosDaUnidade();
    overlay.$("#msm-estab-cnes").addEventListener("input", function () {
      const el = overlay.$("#msm-estab-cnes");
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

    overlay.$("#msm-atualizar-instalar").addEventListener("click", function () {
      if (!versaoNova) return;
      raiz.open(versaoNova.urlInstalar, "_blank");
      overlay.$("#msm-novidade-sub").textContent =
        versaoNova.variante === "safari"
          ? "No app Arquivos, mova o arquivo baixado para a pasta do Userscripts e recarregue o Meeds."
          : "Na tela que abriu, clique em Atualizar e recarregue o Meeds (F5).";
    });

    overlay.$("#msm-diagnostico-copiar").addEventListener("click", function () {
      const caixa = overlay.$("#msm-diagnostico-mensagem");
      const diagTec = raiz.MeedsSuiteDiagnosticoTecnico;
      if (!diagTec) return;
      diagTec.copiar(
        { versao: ctx.versaoNucleo, modulos: ctx.listarModulos() },
        function () {
          caixa.innerHTML = '<div class="msm-ok">Copiado. Cole no WhatsApp, no e-mail ou onde preferir.</div>';
        },
        function () {
          caixa.innerHTML =
            '<div class="msm-erro">Não consegui copiar automaticamente. Tente de novo, ou avise quem está te ajudando.</div>';
        }
      );
    });

    (function () {
      const botaoNoturno = overlay.$("#msm-noturno");
      if (!botaoNoturno || !raiz.MeedsSuiteNoturno) return;
      const refletir = function () {
        botaoNoturno.setAttribute("aria-pressed", String(raiz.MeedsSuiteNoturno.estaLigado()));
      };
      refletir();
      botaoNoturno.addEventListener("click", function () {
        raiz.MeedsSuiteNoturno.alternar();
        refletir();
      });
    })();

    botaoEngrenagem = ctx.dock.registrarBotao({
      id: "_manager",
      icone: "engrenagem",
      variante: "engrenagem",
      titulo: "Assistente Meeds — funções, cadastros e ajustes",
      nomeCurto: "Ajustes",
      prioridade: 0,
      aoClicar: function () {
        abrir();
      },
    });
    /* Uma conferencia discreta depois da carga: so para o ponto na
     * engrenagem. 8 s deixa o Meeds terminar de carregar primeiro. */
    setTimeout(checarVersao, 8000);
  }

  /* O formulário fica fechado até ser pedido: a lista é o que se
   * consulta, o formulário é o que se usa uma vez. */
  function alternarForm(seletorBotao, seletorForm, seletorFoco, seletorCancelar) {
    const botao = overlay.$(seletorBotao);
    const form = overlay.$(seletorForm);
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
    const ficha = ABAS.filter(function (a) {
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
    const destino = { medicos: "medicos", estabelecimentos: "unidades", sobre: "sobre" }[secao] || "funcoes";
    mostrarAba(destino);
    overlay.abrir();
    checarVersao();

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
    const lista = overlay.$("#msm-lista");
    const todos = ctx.listarModulos();

    /* Funcoes marcadas como sempre ativas nao entram na lista de chaves.
     * Elas melhoram o proprio formulario do laudo (a busca de CID dentro
     * do campo, a previa do documento) e nao adicionam botao nem ruido —
     * uma chave para desliga-las so ofereceria um jeito de piorar o
     * formulario. Ficam citadas no rodape, para o medico saber que
     * existem. */
    const modulos = todos.filter(function (m) { return !m.sempreAtivo; });
    const fixos = todos.filter(function (m) { return m.sempreAtivo; });

    if (!modulos.length && !fixos.length) {
      lista.innerHTML = '<div class="msm-vazio">Nenhuma função carregada. Recarregue a página do Meeds; se continuar assim, copie o diagnóstico técnico em Sobre e envie ao suporte.</div>';
      return;
    }

    /* As funcoes sao agrupadas pelo que o medico esta fazendo quando
     * precisa delas: emitir um documento, consultar, ou acompanhar a fila.
     * Uma funcao nova, sem categoria declarada aqui, cai em "Outras" e
     * continua aparecendo. A ordem das categorias e a da lista. */
    const CATEGORIAS = [
      { id: "consulta", titulo: "Consulta" },
      { id: "fila", titulo: "Atendimento e fila" },
      { id: "documentos", titulo: "Documentos" },
      { id: "outras", titulo: "Outras" },
    ];
    /* Fundo claro do icone, na cor do proprio icone (core/icones.js). */
    const FUNDO_ICONE = { remume: "#fff0f0", exames: "#e3fafc", aviso: "#fff8db", notificacao: "#e7f5ff",
      laudo: "#f3f0ff", apac: "#ebfbee", sino: "#fff4e6" };
    function iconeDe(m) {
      const chave = m.icone === "sino-mudo" ? "sino" : m.icone;
      const svg = raiz.MeedsSuiteIcones && raiz.MeedsSuiteIcones.obter(chave);
      return svg
        ? '<div class="msm-item-ico" style="background:' + (FUNDO_ICONE[chave] || "#f1f3f5") + '" aria-hidden="true">' + svg + "</div>"
        : '<div class="msm-item-ico" aria-hidden="true"></div>';
    }
    const CATEGORIA_DO_MODULO = {
      "notificacao": "documentos", "lme-mg": "documentos", "lme-sete-lagoas": "documentos", "cmd": "documentos", "apac": "documentos",
      "remume": "consulta", "exames": "consulta",
      "alarme-fila": "fila", "avisos-municipio": "fila",
    };
    function itemDoModulo(m) {
        /* Frase curta do manifest (`resumo`); a descricao inteira fica no
         * title, para quem quiser ler mais. Tutorial e Ajustar viram links
         * na propria linha, so com a funcao ligada. */
        return (
          '<div class="msm-item" title="' + escapeHtml(m.descricao) + '">' +
          iconeDe(m) +
          '  <div class="msm-item-txt">' +
          '    <div class="msm-item-nome">' + escapeHtml(m.nome) + "</div>" +
          '    <div class="msm-item-desc">' + escapeHtml(m.resumo || m.descricao) + "</div>" +
          "  </div>" +
          (m.temTutorial && m.habilitado
            ? '<button type="button" class="msm-mini" data-tutorial="' + escapeHtml(m.id) + '">Tutorial</button>'
            : "") +
          (m.temAjustes && m.habilitado
            ? '<button type="button" class="msm-mini" data-ajustes="' + escapeHtml(m.id) + '">Ajustar</button>'
            : "") +
          '  <label class="msm-switch" title="' + (m.habilitado ? "Desligar " : "Ligar ") + escapeHtml(m.nome) + '">' +
          '    <input type="checkbox" data-id="' + escapeHtml(m.id) + '" aria-label="' + escapeHtml(m.nome) + '" ' + (m.habilitado ? "checked" : "") + " />" +
          '    <span class="msm-slider"></span>' +
          "  </label>" +
          "</div>"
        );
    }

    lista.innerHTML = CATEGORIAS.map(function (c) {
      const doGrupo = modulos.filter(function (m) { return (CATEGORIA_DO_MODULO[m.id] || "outras") === c.id; });
      if (!doGrupo.length) return "";
      return '<div class="msm-categoria">' + c.titulo + '</div><div class="msm-grupo">' + doGrupo.map(itemDoModulo).join("") + "</div>";
    }).join("");

    if (fixos.length) {
      /* Modulo "sempre ativo" (sem chave liga/desliga) nunca vira
       * `.msm-item` — so aparece nesta linha discreta de rodape. Sem
       * isso, um modulo com tutorial mas sem `.msm-item` (CID-10,
       * Prévia do documento — os dois com `botao: null`) ficaria com o
       * roteiro registrado e NENHUM jeito de o medico abrir: o botao
       * "🎓 Ver tutorial" so existia no template de `.msm-item`. Por
       * isso o nome vira botao clicavel quando `temTutorial`, em vez de
       * so texto — mesmo emoji, mesma funcao, formato menor porque a
       * linha inteira e mais discreta. */
      const nomesFixos = fixos.map(function (m) {
        const nome = "<b>" + escapeHtml(m.nome) + "</b>";
        return m.temTutorial
          ? '<button type="button" class="msm-tutorial-fixo" data-tutorial="' + escapeHtml(m.id) +
            '" title="Ver tutorial de ' + escapeHtml(m.nome) + '">' + nome + " · tutorial</button>"
          : nome;
      });
      lista.innerHTML +=
        '<div class="msm-fixos">Sempre ligadas, dentro dos laudos e da APAC: ' + nomesFixos.join(" e ") + ".</div>";
    }

    /* A translucidez em repouso deixou de ter chave: e como o Assistente
     * se comporta na tela, nao uma funcao que o medico escolhe usar. Uma
     * chave ali so oferecia um jeito de deixar a tela mais poluida — e o
     * alarme, que e o unico que nao pode passar despercebido, ja e
     * excecao e nunca fica translucido. Mesmo raciocinio da D26. */

    overlay.$$("button[data-ajustes]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        overlay.fechar();
        ctx.abrirAjustesDe(btn.getAttribute("data-ajustes"));
      });
    });

    overlay.$$("button[data-tutorial]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        overlay.fechar();
        ctx.abrirTutorialDe(btn.getAttribute("data-tutorial"));
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
    const caixa = overlay.$("#msm-medicos-mensagem");
    caixa.innerHTML = texto ? '<div class="msm-' + (tipo || "ok") + '">' + escapeHtml(texto) + "</div>" : "";
  }

  function renderizarMedicos() {
    const lista = Cadastro.listar();
    const box = overlay.$("#msm-medicos-lista");

    if (!lista.length) {
      box.innerHTML =
        '<div class="msm-aviso"><strong>Nenhum médico cadastrado</strong>' +
        "Leva menos de um minuto.</div>";
      return;
    }

    box.innerHTML = lista
      .map(function (m, i) {
        const docs = [];
        if (m.crm) docs.push("CRM " + m.crm);
        if (m.cpf) docs.push("CPF " + m.cpf);
        return (
          '<div class="msm-ficha">' +
          '  <div class="msm-ficha-dados">' +
          '    <div class="msm-ficha-nome">' + escapeHtml(m.nome) + "</div>" +
          '    <div class="msm-ficha-doc">' + escapeHtml(docs.join("  ·  ") || "sem documento cadastrado") + "</div>" +
          "  </div>" +
          '  <button type="button" class="msm-remover" data-i="' + i + '">Remover médico</button>' +
          "</div>"
        );
      })
      .join("");

    box.querySelectorAll(".msm-remover").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const i = Number(btn.getAttribute("data-i"));
        const alvo = Cadastro.listar()[i];
        raiz.MeedsSuiteConfirmar.removerCadastro("médico", alvo ? alvo.nome : "", function () {
          Cadastro.remover(i);
          renderizarMedicos();
          mostrarMensagemMedicos((alvo ? alvo.nome : "Médico") + " foi removido do cadastro.", "ok");
          avisarModulos();
        });
      });
    });
  }

  function salvarMedico() {
    const nome = overlay.$("#msm-med-nome").value.trim();
    if (!nome) {
      mostrarMensagemMedicos(
        "Não consegui salvar porque o nome está vazio. Preencha o campo “Nome completo” — é o único obrigatório.",
        "erro"
      );
      overlay.$("#msm-med-nome").focus();
      return;
    }

    const cpf = overlay.$("#msm-med-cpf").value.trim();
    if (cpf && !raiz.MeedsSuiteFormatos.cpfCompleto(cpf)) {
      mostrarMensagemMedicos(
        "Não consegui salvar porque o CPF tem " + raiz.MeedsSuiteFormatos.soDigitos(cpf).length +
          " dígito(s) e o CPF tem 11. Confira o número, ou deixe o campo em branco para completar depois.",
        "erro"
      );
      overlay.$("#msm-med-cpf").focus();
      return;
    }

    const r = Cadastro.adicionar({ nome: nome, crm: overlay.$("#msm-med-crm").value.trim(), cpf: cpf });
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
    const lista = Cadastro.listar();
    if (!lista.length) {
      mostrarMensagemMedicos(
        "Não há o que salvar: nenhum médico cadastrado ainda. Cadastre pelo menos um e tente de novo.",
        "erro"
      );
      return;
    }
    const blob = new Blob([Cadastro.exportar()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
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
    const arquivo = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!arquivo) return;

    const leitor = new FileReader();
    leitor.onload = function () {
      const r = Cadastro.importar(String(leitor.result));
      if (!r.ok) {
        mostrarMensagemMedicos(r.erro, "erro");
        return;
      }
      renderizarMedicos();
      mostrarMensagemMedicos(
        "Backup restaurado: " + r.quantidade + " médico(s)" +
          (r.unidades ? " e " + r.unidades + " unidade(s)" : "") +
          ". Quem já estava cadastrado foi mantido.",
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
    const caixa = overlay.$("#msm-estab-mensagem");
    caixa.innerHTML = texto ? '<div class="msm-' + (tipo || "ok") + '">' + escapeHtml(texto) + "</div>" : "";
  }

  /* Os municipios vem de dados/apac.json, injetado no pacote. Assim o
   * administrador acrescenta um municipio editando dados e ele ja aparece
   * aqui, sem tocar em codigo. */
  function municipiosConhecidos() {
    const d = raiz.MEEDS_DADOS_APAC;
    return d && d.municipios ? Object.keys(d.municipios) : [];
  }

  function montarMunicipiosDaUnidade() {
    const sel = overlay.$("#msm-estab-municipio");
    if (!sel) return;
    sel.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "Selecione o município…";
    sel.appendChild(ph);
    municipiosConhecidos().forEach(function (m) {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = m;
      sel.appendChild(o);
    });
  }

  function renderizarEstabelecimentos() {
    const lista = Cadastro.listarEstabelecimentos();
    const box = overlay.$("#msm-estab-lista");

    if (!lista.length) {
      box.innerHTML =
        '<div class="msm-vazio">As unidades aparecem aqui sozinhas quando você ' +
        "escolhe o município na APAC. Cadastre à mão só se a sua não estiver na lista.</div>";
      return;
    }

    box.innerHTML = lista
      .map(function (e, i) {
        return (
          '<div class="msm-ficha">' +
          '  <div class="msm-ficha-dados">' +
          '    <div class="msm-ficha-nome">' + escapeHtml(e.nome) + "</div>" +
          '    <div class="msm-ficha-doc">' +
          escapeHtml(
            [e.cnes ? "CNES " + e.cnes : "sem CNES cadastrado", e.municipio || "sem município"].join("  ·  ")
          ) +
          "</div>" +
          "  </div>" +
          '  <button type="button" class="msm-remover" data-e="' + i + '">Remover unidade</button>' +
          "</div>"
        );
      })
      .join("");

    box.querySelectorAll("[data-e]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const i = Number(btn.getAttribute("data-e"));
        const alvo = Cadastro.listarEstabelecimentos()[i];
        raiz.MeedsSuiteConfirmar.removerCadastro("unidade", alvo ? alvo.nome : "", function () {
          Cadastro.removerEstabelecimento(i);
          renderizarEstabelecimentos();
          mostrarMensagemEstab((alvo ? alvo.nome : "Unidade") + " foi removida.", "ok");
          avisarModulos();
        });
      });
    });
  }

  function salvarEstabelecimento() {
    const nome = overlay.$("#msm-estab-nome").value.trim();
    if (!nome) {
      mostrarMensagemEstab(
        "Não consegui salvar porque o nome está vazio. Preencha o campo “Nome da unidade”.",
        "erro"
      );
      overlay.$("#msm-estab-nome").focus();
      return;
    }
    const r = Cadastro.adicionarEstabelecimento({ nome: nome, cnes: overlay.$("#msm-estab-cnes").value });
    if (!r.ok) {
      mostrarMensagemEstab(r.erro, "erro");
      return;
    }
    overlay.$("#msm-estab-nome").value = "";
    overlay.$("#msm-estab-cnes").value = "";
    overlay.$("#msm-estab-municipio").value = "";
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
