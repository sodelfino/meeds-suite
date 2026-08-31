/* ------------------------------------------------------------------
 * core/novidades.js — aviso de atualizacao e historico de versoes
 * ------------------------------------------------------------------
 * O Tampermonkey atualiza o Assistente sozinho, em silencio. O medico
 * abria o Meeds e as coisas simplesmente estavam diferentes — sem saber
 * que houve atualizacao, nem o que mudou. Aqui ele fica sabendo, uma vez
 * por versao.
 *
 * TRES SITUACOES, TRES COMPORTAMENTOS
 *   - primeira instalacao (nada guardado): NAO mostra "atualizado", que
 *     seria mentira. Quem cuida disso e o aviso de boas-vindas
 *     (core/diagnostico.js);
 *   - mesma versao de antes: nao mostra nada;
 *   - versao diferente: mostra o que mudou. E se o medico ficou tempo
 *     sem abrir e pulou versoes, mostra o acumulado de TODAS as versoes
 *     entre a que ele viu e a atual — nao so a ultima.
 *
 * NAO TEM SOM. E informacao, nao alarme: assustar alguem no meio de um
 * plantao com um som inesperado seria o oposto do objetivo.
 *
 * UMA VEZ SO, MESMO COM VARIAS ABAS
 * A versao vista e gravada no instante em que o aviso APARECE, nao
 * quando o medico clica em "Entendi". Duas abas abertas ao mesmo tempo
 * depois de uma atualizacao mostrariam o aviso duas vezes se a gravacao
 * esperasse o clique. Alem disso, um marcador em localStorage avisa as
 * outras abas para fecharem o aviso que ja estiver aberto nelas.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  /* NUNCA TROQUE ESTA CHAVE — o medico veria de novo avisos ja lidos. */
  var CHAVE_VERSAO_VISTA = "ultima_versao_vista";
  var CHAVE_SINAL_ABAS = "meeds-suite:aviso-versao-exibido";

  var changelog = { versoes: [] };
  var overlay = null;
  var ctx = null;

  function temGM() {
    return typeof GM_getValue === "function" && typeof GM_setValue === "function";
  }

  function lerVersaoVista() {
    try {
      if (temGM()) {
        var v = GM_getValue(CHAVE_VERSAO_VISTA, undefined);
        return v === undefined ? null : v;
      }
    } catch (e) {}
    try {
      return localStorage.getItem("meeds-suite:" + CHAVE_VERSAO_VISTA);
    } catch (e) {
      return null;
    }
  }

  function gravarVersaoVista(versao) {
    try {
      if (temGM()) GM_setValue(CHAVE_VERSAO_VISTA, versao);
    } catch (e) {}
    try {
      localStorage.setItem("meeds-suite:" + CHAVE_VERSAO_VISTA, versao);
      // sinaliza as outras abas
      localStorage.setItem(CHAVE_SINAL_ABAS, versao + "|" + Date.now());
    } catch (e) {}
  }

  /* Compara "2.10.0" com "2.9.0" corretamente — comparacao de texto
   * diria que 2.10.0 e MENOR, e o medico deixaria de ver a novidade. */
  function compararVersoes(a, b) {
    var pa = String(a || "0").split(".").map(Number);
    var pb = String(b || "0").split(".").map(Number);
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var x = pa[i] || 0;
      var y = pb[i] || 0;
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }

  /* Versoes lancadas DEPOIS da que o medico viu, ate a atual. */
  function versoesNaoVistas(vistaEm, atual) {
    return (changelog.versoes || []).filter(function (v) {
      return compararVersoes(v.versao, vistaEm) > 0 && compararVersoes(v.versao, atual) <= 0;
    });
  }

  function versaoDoChangelog(versao) {
    return (changelog.versoes || []).filter(function (v) {
      return v.versao === versao;
    })[0];
  }

  var CSS = [
    ".msn-caixa { width:100%; max-width:540px; max-height:84vh; background:#fff; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.35); display:flex; flex-direction:column; overflow:hidden; }",
    ".msn-caixa header { background:linear-gradient(135deg,#123a7a,#1a56ad); color:#fff; padding:16px 18px; display:flex; justify-content:space-between; align-items:center; gap:12px; }",
    ".msn-caixa header h2 { margin:0; font-size:15px; font-weight:700; }",
    ".msn-versao { margin:2px 0 0; font-size:11.5px; opacity:.9; }",
    ".msn-fechar { background:rgba(255,255,255,.2); border:none; color:#fff; width:28px; height:28px; border-radius:50%; cursor:pointer; font-size:14px; flex-shrink:0; }",
    ".msn-fechar:hover { background:rgba(255,255,255,.34); }",
    ".msn-corpo { padding:14px 18px; overflow-y:auto; }",
    ".msn-grupo { margin-bottom:14px; }",
    ".msn-grupo:last-child { margin-bottom:0; }",
    ".msn-grupo h3 { margin:0 0 6px; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#123a7a; }",
    ".msn-grupo ul { margin:0; padding-left:18px; }",
    ".msn-grupo li { font-size:12.5px; line-height:1.55; color:#16221f; margin-bottom:4px; }",
    ".msn-bloco-versao { border-bottom:1px solid #eef2f6; padding-bottom:12px; margin-bottom:12px; }",
    ".msn-bloco-versao:last-child { border-bottom:none; padding-bottom:0; margin-bottom:0; }",
    ".msn-bloco-titulo { font-size:12px; font-weight:700; color:#5b6672; margin-bottom:8px; }",
    ".msn-rodape { display:flex; justify-content:flex-end; padding:12px 18px; border-top:1px solid #eef2f6; }",
    ".msn-btn { background:#1a4fa0; color:#fff; border:none; border-radius:9px; padding:10px 18px; font-size:13px; font-weight:700; cursor:pointer; }",
    ".msn-btn:hover { background:#123a7a; }",
    ".msn-vazio { font-size:12.5px; color:#8a97a4; font-style:italic; }",
  ].join("\n");

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var ROTULOS = [
    ["novidades", "Novidades"],
    ["melhorias", "Melhorias"],
    ["correcoes", "Correções"],
  ];

  function htmlDeUmaVersao(v, comCabecalho) {
    var grupos = ROTULOS.map(function (par) {
      var itens = v[par[0]] || [];
      if (!itens.length) return "";
      return (
        '<div class="msn-grupo"><h3>' + par[1] + "</h3><ul>" +
        itens.map(function (i) { return "<li>" + escapeHtml(i) + "</li>"; }).join("") +
        "</ul></div>"
      );
    }).join("");

    if (!grupos) grupos = '<div class="msn-vazio">Sem mudanças registradas nesta versão.</div>';

    return (
      '<div class="msn-bloco-versao">' +
      (comCabecalho
        ? '<div class="msn-bloco-titulo">Versão ' + escapeHtml(v.versao) +
          (v.data ? " · " + escapeHtml(formatarData(v.data)) : "") + "</div>"
        : "") +
      grupos +
      "</div>"
    );
  }

  function formatarData(iso) {
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? m[3] + "/" + m[2] + "/" + m[1] : iso;
  }

  function montarOverlay() {
    if (overlay) return overlay;
    overlay = ctx.dock.criarOverlay({ estilo: CSS, html: "" });
    return overlay;
  }

  /* Aviso pos-atualizacao. Aceita varias versoes de uma vez (quando o
   * medico pulou atualizacoes). */
  function mostrarAviso(versoes, versaoAtual) {
    montarOverlay();
    var varias = versoes.length > 1;

    overlay.elemento.innerHTML =
      '<div class="msn-caixa" role="dialog" aria-modal="true">' +
      "  <header><div>" +
      "    <h2>Assistente Meeds atualizado</h2>" +
      '    <p class="msn-versao">Agora na versão ' + escapeHtml(versaoAtual) +
      (varias ? " · " + versoes.length + " atualizações desde a última vez" : "") +
      "</p>" +
      "  </div>" +
      '  <button type="button" class="msn-fechar" aria-label="Fechar">&#10005;</button></header>' +
      '  <div class="msn-corpo">' +
      versoes.map(function (v) { return htmlDeUmaVersao(v, varias); }).join("") +
      "  </div>" +
      '  <div class="msn-rodape"><button type="button" class="msn-btn" id="msn-entendi">Entendi</button></div>' +
      "</div>";

    overlay.$(".msn-fechar").addEventListener("click", overlay.fechar);
    overlay.$("#msn-entendi").addEventListener("click", overlay.fechar);
    overlay.abrir();
  }

  /* Historico completo, aberto pelo painel da engrenagem. Mesma fonte. */
  function mostrarHistorico(versaoAtual) {
    montarOverlay();
    var lista = changelog.versoes || [];

    overlay.elemento.innerHTML =
      '<div class="msn-caixa" role="dialog" aria-modal="true">' +
      "  <header><div>" +
      "    <h2>Histórico de versões</h2>" +
      '    <p class="msn-versao">Você está na versão ' + escapeHtml(versaoAtual) + "</p>" +
      "  </div>" +
      '  <button type="button" class="msn-fechar" aria-label="Fechar">&#10005;</button></header>' +
      '  <div class="msn-corpo">' +
      (lista.length
        ? lista.map(function (v) { return htmlDeUmaVersao(v, true); }).join("")
        : '<div class="msn-vazio">Nenhuma versão registrada.</div>') +
      "  </div>" +
      '  <div class="msn-rodape"><button type="button" class="msn-btn" id="msn-entendi">Fechar</button></div>' +
      "</div>";

    overlay.$(".msn-fechar").addEventListener("click", overlay.fechar);
    overlay.$("#msn-entendi").addEventListener("click", overlay.fechar);
    overlay.abrir();
  }

  /* Chamado no start do nucleo. */
  function verificar(contexto) {
    ctx = contexto;
    changelog = raiz.MEEDS_CHANGELOG || { versoes: [] };
    var atual = ctx.versaoAtual;
    var vista = lerVersaoVista();

    // outra aba mostrou o aviso: fecha o daqui, para nao repetir
    try {
      raiz.addEventListener("storage", function (ev) {
        if (ev.key === CHAVE_SINAL_ABAS && overlay && overlay.estaAberto()) overlay.fechar();
      });
    } catch (e) {}

    if (!vista) {
      /* Primeira instalacao: nada de "atualizado". So registra a versao,
       * para a proxima atualizacao ser detectada. As boas-vindas ficam a
       * cargo do core/diagnostico.js. */
      gravarVersaoVista(atual);
      return { situacao: "primeira-instalacao" };
    }

    if (compararVersoes(atual, vista) === 0) return { situacao: "sem-mudanca" };

    var novas = versoesNaoVistas(vista, atual);
    if (!novas.length) {
      // versao mudou mas ninguem descreveu no changelog: nao inventa
      gravarVersaoVista(atual);
      return { situacao: "sem-changelog" };
    }

    /* Grava ANTES de o medico fechar: se esperasse o clique, duas abas
     * abertas mostrariam o aviso duas vezes. */
    gravarVersaoVista(atual);
    setTimeout(function () {
      mostrarAviso(novas, atual);
    }, 1500);
    return { situacao: "atualizado", versoes: novas.map(function (v) { return v.versao; }) };
  }

  raiz.MeedsSuiteNovidades = {
    verificar: verificar,
    mostrarHistorico: mostrarHistorico,
    compararVersoes: compararVersoes,
    versoesNaoVistas: versoesNaoVistas,
    versaoDoChangelog: versaoDoChangelog,
    lerVersaoVista: lerVersaoVista,
    CHAVE_VERSAO_VISTA: CHAVE_VERSAO_VISTA,
    _definirChangelog: function (c) {
      changelog = c;
    },
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
