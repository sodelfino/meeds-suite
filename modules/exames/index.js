/* ------------------------------------------------------------------
 * modules/exames/index.js — que exames este municipio oferece
 * ------------------------------------------------------------------
 * O PROBLEMA
 * O medico pede um exame e descobre dias depois que aquele municipio
 * nao faz. O paciente volta, a consulta se repete, e o exame continua
 * sem ser feito. A lista existe — em PDF de gaveta, planilha de
 * contrato, tabela de prefeitura — mas nao esta na tela na hora de
 * pedir, que e o unico momento em que ela vale.
 *
 * ------------------------------------------------------------------
 * A REGRA DE OURO (a mesma do REMUME, e pelo mesmo motivo)
 * ------------------------------------------------------------------
 * A lista de cada municipio e a UNICA fonte de verdade do que ele
 * oferece. Nenhuma melhoria de busca pode fazer aparecer um exame que
 * NAO esta na lista do municipio ativo:
 *
 *   - nao ha lista "geral" que complete a do municipio;
 *   - nao ha exame copiado de um municipio para outro;
 *   - havendo ambiguidade, o item e FILTRADO PARA FORA, nao adicionado.
 *
 * Errar para menos custa uma consulta ao portal da prefeitura. Errar
 * para mais custa um pedido que o paciente carrega para uma unidade que
 * nao realiza aquilo — e o medico so descobre pelo retorno.
 *
 * ------------------------------------------------------------------
 * O QUE CADA MUNICIPIO TRAZ, E O QUE ISSO IMPLICA NA TELA
 * ------------------------------------------------------------------
 * As fontes nao sao homogeneas, e forcar um formato unico perderia
 * informacao:
 *
 *   Betim      1.999 exames laboratoriais COM codigo do contrato.
 *              Sem local (o contrato nao diz onde), sem sigla.
 *   Macae         28 exames da UPA Barra, COM local e SEM codigo —
 *              o PDF nao traz codigo. Traz duas REGRAS clinicas que
 *              aparecem no topo do painel.
 *   Congonhas     16 procedimentos que exigem APAC, com codigo SIGTAP.
 *
 * Por isso codigo, local, sigla e observacoes sao todos OPCIONAIS. Uma
 * celula vazia significa "o municipio nao publicou", nunca "faltou
 * preencher" — a mesma leitura da planilha-modelo do REMUME.
 *
 * PRIVACIDADE: este modulo nao le nem grava dado de paciente. Ele so
 * consulta uma lista publica de exames e o municipio do atendimento.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  /* Base: comeca no fallback embutido (gerado por scripts/sync-exames.js)
   * e e substituida pela versao remota quando ela chega. Mesma estrategia
   * do REMUME: funciona sem internet e atualiza sem redistribuir o
   * userscript para todos os medicos. */
  var BASE = raiz.__MEEDS_EXAMES_FALLBACK__ || { municipios: {} };
  var EXAMES_URL =
    "https://raw.githubusercontent.com/sodelfino/meeds-suite/main/dados/exames.json";

  var CONFIG_BUSCA = {
    LIMITE_RESULTADOS: 60,
    /* Abaixo disso a busca dispara a cada letra e devolve meia base. O
     * medico digita "he" e recebe tudo que tem "he" no nome. */
    MIN_CARACTERES: 3,
  };

  var d = null;              // dependencias entregues pelo nucleo
  var overlay = null;
  var refs = {};
  var municipioDetectado = null;
  var municipioEscolhido = null;
  var indicePorMunicipio = {};
  var cancelarRede = null;
  var timerBusca = null;

  /* ------------------------------------------------------------------
   * A BASE
   * ------------------------------------------------------------------ */

  /* "_leia_me", "siglas" e afins nao sao municipio. Quem itera "os
   * municipios" tem que passar por aqui, sempre — a mesma armadilha ja
   * apareceu no REMUME com a chave "_meta". */
  function municipios() {
    return Object.keys(BASE.municipios || {}).filter(function (k) {
      return k.indexOf("_") !== 0;
    }).sort();
  }

  function blocoDe(municipio) {
    return (BASE.municipios || {})[municipio] || null;
  }

  function examesDe(municipio) {
    var b = blocoDe(municipio);
    return (b && Array.isArray(b.exames)) ? b.exames : [];
  }

  function siglaDe(codigo) {
    var s = (BASE.siglas || {})[codigo];
    return s || { rotulo: codigo, titulo: "" };
  }

  function validarBase(dados) {
    if (!dados || typeof dados !== "object") return false;
    if (!dados.municipios || typeof dados.municipios !== "object") return false;
    var chaves = Object.keys(dados.municipios).filter(function (k) {
      return k.indexOf("_") !== 0;
    });
    if (!chaves.length) return false;
    /* Um bloco sem `exames` derrubaria a busca no primeiro uso. Melhor
     * recusar o arquivo inteiro e seguir com o embutido: uma base velha
     * e melhor que uma base quebrada. */
    for (var i = 0; i < chaves.length; i++) {
      var b = dados.municipios[chaves[i]];
      if (!b || !Array.isArray(b.exames)) return false;
    }
    return true;
  }

  function atualizarBaseRemota() {
    try {
      return fetch(EXAMES_URL, { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (dados) {
          if (!dados) return false;
          if (!validarBase(dados)) {
            console.warn("[Assistente Meeds] exames.json remoto com formato inesperado; mantendo a base embutida.");
            return false;
          }
          BASE = dados;
          indicePorMunicipio = {};   // a base mudou: os indices envelheceram
          if (overlay && refs.select) montarSelect();
          return true;
        })
        .catch(function () { return false; });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  /* ------------------------------------------------------------------
   * BUSCA
   * ------------------------------------------------------------------
   * O motor e o mesmo do REMUME e da CID-10 (core/busca.js): erro de
   * digitacao, fonetica do portugues e casamento por palavra inteira ja
   * estao resolvidos la. Reaproveitar tambem significa que uma correcao
   * de busca vale nos tres de uma vez.
   *
   * O texto indexado junta nome, codigo, local e apelido. Codigo entra
   * porque o medico as vezes chega com ele na mao (vindo do contrato ou
   * de um pedido anterior); local entra porque "o que a UPA Barra faz?"
   * e uma pergunta legitima.
   * ------------------------------------------------------------------ */
  function indiceDe(municipio) {
    if (indicePorMunicipio[municipio]) return indicePorMunicipio[municipio];
    var itens = examesDe(municipio);
    indicePorMunicipio[municipio] = raiz.MeedsSuiteBusca.criarIndice(itens, function (e) {
      return [e.nome, e.apelido || "", e.codigo || "", e.local || ""].join(" ");
    });
    return indicePorMunicipio[municipio];
  }

  function buscar(municipio, termo) {
    var limpo = String(termo || "").trim();
    if (limpo.length < CONFIG_BUSCA.MIN_CARACTERES) return null;
    var r = raiz.MeedsSuiteBusca.buscar(limpo, indiceDe(municipio), {
      limite: CONFIG_BUSCA.LIMITE_RESULTADOS,
    });
    return r;
  }

  /* ------------------------------------------------------------------
   * TELA
   * ------------------------------------------------------------------ */

  var CSS = [
    ".ex-modal { width:100%; max-width:560px; background:#fff; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.3); overflow:hidden; display:flex; flex-direction:column; max-height:82vh; }",
    ".ex-modal header { background:linear-gradient(135deg,#0f766e,#0ea5a4); color:#fff; padding:15px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; }",
    ".ex-modal header h2 { margin:0; font-size:15px; font-weight:700; }",
    ".ex-modal header p { margin:2px 0 0; font-size:11.5px; opacity:.9; }",
    ".ex-fechar { background:rgba(255,255,255,.18); border:none; color:#fff; width:28px; height:28px; border-radius:8px; font-size:15px; cursor:pointer; flex-shrink:0; }",
    ".ex-fechar:hover { background:rgba(255,255,255,.32); }",
    ".ex-topo { padding:14px 18px 10px; border-bottom:1px solid #eef2f7; }",
    ".ex-linha { display:flex; gap:10px; align-items:center; }",
    ".ex-linha select { flex:0 0 40%; padding:9px 10px; border-radius:9px; border:1.5px solid #cbd5e1; font:inherit; font-size:13px; background:#fff; }",
    ".ex-linha input { flex:1; padding:10px 12px; border-radius:9px; border:1.5px solid #cbd5e1; font:inherit; font-size:14px; }",
    ".ex-linha input:focus, .ex-linha select:focus { outline:none; border-color:#0ea5a4; box-shadow:0 0 0 3px rgba(14,165,164,.15); }",
    ".ex-origem { font-size:11px; color:#64748b; margin-top:7px; line-height:1.45; }",
    ".ex-obs { margin:10px 18px 0; padding:10px 12px; background:#fffbeb; border:1px solid #fde68a; border-radius:9px; font-size:12px; color:#78350f; line-height:1.5; }",
    ".ex-obs ul { margin:4px 0 0; padding-left:18px; }",
    ".ex-obs li { margin:3px 0; }",
    ".ex-lista { overflow-y:auto; padding:8px 18px 16px; flex:1; }",
    ".ex-item { padding:10px 0; border-bottom:1px solid #f1f5f9; display:flex; gap:10px; align-items:flex-start; }",
    ".ex-item:last-child { border-bottom:none; }",
    ".ex-item-txt { flex:1; min-width:0; }",
    ".ex-nome { font-size:13.5px; color:#0f172a; font-weight:600; line-height:1.4; }",
    ".ex-meta { font-size:11.5px; color:#64748b; margin-top:3px; display:flex; gap:10px; flex-wrap:wrap; }",
    ".ex-selo { display:inline-flex; align-items:center; gap:4px; }",
    ".ex-sigla { flex-shrink:0; background:#7c3aed; color:#fff; font-size:10.5px; font-weight:800; padding:3px 8px; border-radius:999px; letter-spacing:.03em; white-space:nowrap; }",
    ".ex-copiar { flex-shrink:0; background:#f1f5f9; border:none; color:#475569; border-radius:7px; padding:6px 9px; font-size:11.5px; font-weight:700; cursor:pointer; }",
    ".ex-copiar:hover { background:#e2e8f0; }",
    ".ex-aviso { padding:22px 18px; text-align:center; color:#64748b; font-size:13px; line-height:1.6; }",
    ".ex-aviso b { color:#0f172a; }",
    ".ex-nao-consta { background:#fef2f2; border:1px solid #fecaca; color:#7f1d1d; border-radius:10px; padding:12px 14px; margin:10px 0; font-size:12.5px; line-height:1.55; }",
    ".ex-contagem { font-size:11px; color:#94a3b8; padding:6px 18px 0; }",
  ].join("\n");

  function montarSelect() {
    var lista = municipios();
    refs.select.innerHTML = lista
      .map(function (m) {
        return '<option value="' + escapar(m) + '">' + escapar(m) + " (" + examesDe(m).length + ")</option>";
      })
      .join("");
    if (municipioEscolhido && lista.indexOf(municipioEscolhido) !== -1) {
      refs.select.value = municipioEscolhido;
    } else if (municipioDetectado && lista.indexOf(municipioDetectado) !== -1) {
      refs.select.value = municipioDetectado;
      municipioEscolhido = municipioDetectado;
    } else {
      municipioEscolhido = refs.select.value;
    }
    pintarCabecalho();
  }

  function pintarCabecalho() {
    var b = blocoDe(municipioEscolhido);
    if (!b) return;

    /* A ORIGEM FICA VISIVEL SEMPRE. A lista de Betim vem de um contrato,
     * a de Macae de um PDF da unidade — o medico precisa saber com o que
     * esta lidando, e ha quanto tempo. Uma lista sem procedencia parece
     * oficial mesmo quando esta velha. */
    var partes = [];
    if (b.fonte) partes.push(b.fonte);
    if (b.atualizadoEm) partes.push("atualizado em " + formatarData(b.atualizadoEm));
    refs.origem.textContent = partes.join(" · ");

    if (b.observacoes && b.observacoes.length) {
      refs.obs.hidden = false;
      refs.obs.innerHTML =
        "<b>Antes de pedir em " + escapar(municipioEscolhido) + ":</b><ul>" +
        b.observacoes.map(function (o) { return "<li>" + escapar(o) + "</li>"; }).join("") +
        "</ul>";
    } else {
      refs.obs.hidden = true;
      refs.obs.innerHTML = "";
    }
  }

  function formatarData(iso) {
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? m[3] + "/" + m[2] + "/" + m[1] : iso;
  }

  function escapar(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function pintarResultado() {
    var termo = refs.busca.value;
    var lista = refs.lista;

    if (String(termo).trim().length < CONFIG_BUSCA.MIN_CARACTERES) {
      var total = examesDe(municipioEscolhido).length;
      lista.innerHTML =
        '<div class="ex-aviso">Digite o nome do exame.<br><b>' + total +
        "</b> exame(s) na lista de " + escapar(municipioEscolhido) + ".</div>";
      refs.contagem.textContent = "";
      return;
    }

    var r = buscar(municipioEscolhido, termo);
    var itens = (r && r.itens) || [];

    if (!itens.length) {
      /* A MENSAGEM E ESPECIFICA DE PROPOSITO. "Nenhum resultado" faria o
       * medico achar que errou a digitacao. O que aconteceu foi outra
       * coisa, e ela muda a conduta: este municipio nao oferece. */
      lista.innerHTML =
        '<div class="ex-nao-consta"><b>Não consta na lista de ' + escapar(municipioEscolhido) + ".</b><br>" +
        "Isso não quer dizer que o exame não exista — quer dizer que ele não está na lista que este município publicou. " +
        "Confira a grafia; se estiver certa, o caminho é o fluxo de encaminhamento ou a regulação.</div>";
      refs.contagem.textContent = "";
      return;
    }

    lista.innerHTML = itens
      .map(function (x) {
        var e = x.item || x;
        var meta = [];
        if (e.codigo) meta.push('<span class="ex-selo">🔢 ' + escapar(e.codigo) + "</span>");
        if (e.local) meta.push('<span class="ex-selo">📍 ' + escapar(e.local) + "</span>");
        var sigla = e.exige ? siglaDe(e.exige) : null;
        return (
          '<div class="ex-item">' +
          '  <div class="ex-item-txt">' +
          '    <div class="ex-nome">' + escapar(e.nome) + "</div>" +
          (meta.length ? '    <div class="ex-meta">' + meta.join("") + "</div>" : "") +
          "  </div>" +
          (sigla
            ? '  <span class="ex-sigla" title="' + escapar(sigla.titulo) + '">' + escapar(sigla.rotulo) + "</span>"
            : "") +
          '  <button type="button" class="ex-copiar" data-copiar="' + escapar(textoParaCopiar(e)) + '">Copiar</button>' +
          "</div>"
        );
      })
      .join("");

    refs.contagem.textContent =
      itens.length + " de " + examesDe(municipioEscolhido).length +
      (r && r.viaFuzzy ? " · busca aproximada" : "");

    overlay.$$("button[data-copiar]").forEach(function (b) {
      b.addEventListener("click", function () {
        copiar(b.getAttribute("data-copiar"), b);
      });
    });
  }

  /* O que vai para a area de transferencia e o que o medico cola no
   * pedido: nome e, quando existe, o codigo. Local e sigla ficam de
   * fora — sao informacao para ELE, nao para o papel. */
  function textoParaCopiar(e) {
    return e.codigo ? e.nome + " (" + e.codigo + ")" : e.nome;
  }

  function copiar(texto, botao) {
    function feito(ok) {
      botao.textContent = ok ? "Copiado" : "Selecione e copie";
      setTimeout(function () { botao.textContent = "Copiar"; }, 1800);
    }
    if (raiz.navigator && raiz.navigator.clipboard && raiz.navigator.clipboard.writeText) {
      raiz.navigator.clipboard.writeText(texto).then(function () { feito(true); }, function () { feito(false); });
    } else {
      feito(false);
    }
  }

  function agendarBusca() {
    if (timerBusca) clearTimeout(timerBusca);
    timerBusca = setTimeout(function () {
      timerBusca = null;
      pintarResultado();
    }, 180);
  }

  function abrirPainel() {
    if (overlay && overlay.estaAberto && overlay.estaAberto()) {
      overlay.fechar();
      return;
    }
    if (!overlay) montarPainel();
    montarSelect();
    pintarResultado();
    overlay.abrir();
    setTimeout(function () { refs.busca.focus(); }, 60);
  }

  function montarPainel() {
    overlay = d.dock.criarOverlay({
      estilo: CSS,
      html:
        '<div class="ex-modal" role="dialog" aria-modal="true" aria-label="Exames do município">' +
        "  <header><div><h2>🧪 Exames do município</h2>" +
        "    <p>O que este município oferece — e o que exige APAC ou laudo</p></div>" +
        '    <button type="button" class="ex-fechar" aria-label="Fechar">&#10005;</button></header>' +
        '  <div class="ex-topo">' +
        '    <div class="ex-linha">' +
        '      <select id="ex-municipio" aria-label="Município"></select>' +
        '      <input type="search" id="ex-busca" placeholder="Ex: hemograma, creatinina, holter" autocomplete="off" />' +
        "    </div>" +
        '    <div class="ex-origem" id="ex-origem"></div>' +
        "  </div>" +
        '  <div class="ex-obs" id="ex-obs" hidden></div>' +
        '  <div class="ex-contagem" id="ex-contagem"></div>' +
        '  <div class="ex-lista" id="ex-lista"></div>' +
        "</div>",
    });

    refs.select = overlay.$("#ex-municipio");
    refs.busca = overlay.$("#ex-busca");
    refs.lista = overlay.$("#ex-lista");
    refs.origem = overlay.$("#ex-origem");
    refs.obs = overlay.$("#ex-obs");
    refs.contagem = overlay.$("#ex-contagem");

    overlay.$(".ex-fechar").addEventListener("click", function () { overlay.fechar(); });
    refs.busca.addEventListener("input", agendarBusca);
    refs.select.addEventListener("change", function () {
      municipioEscolhido = refs.select.value;
      pintarCabecalho();
      pintarResultado();
      refs.busca.focus();
    });
  }

  /* ------------------------------------------------------------------
   * MUNICIPIO DO ATENDIMENTO
   * ------------------------------------------------------------------
   * Reusa core/municipio.js — o mesmo detector do REMUME e da APAC. Se
   * cada modulo tivesse o seu, tres deles discordariam entre si na mesma
   * tela, e o medico nao teria como saber qual acreditar.
   *
   * A deteccao SUGERE, nunca decide sozinha: o <select> continua na mao
   * do medico. Ele atende fila multi-municipio, e arriscar o municipio
   * errado aqui e mostrar a lista de exames de outra cidade.
   * ------------------------------------------------------------------ */
  function aplicarMunicipio(nome) {
    if (!nome || nome === municipioDetectado) return;
    municipioDetectado = nome;
    /* So move a selecao se o medico ainda nao escolheu na mao. */
    if (!municipioEscolhido) municipioEscolhido = nome;
    if (overlay && refs.select) montarSelect();
  }

  function detectarNaTela() {
    var M = raiz.MeedsSuiteMunicipio;
    if (!M) return;
    aplicarMunicipio(M.detectarNaTela(municipios()));
  }

  /* ------------------------------------------------------------------ */

  raiz.MeedsSuite.registerModule({
    id: "exames",
    nome: "Exames do município",
    descricao:
      "Mostra os exames que o município do paciente oferece, com o código do procedimento, o local de realização e a marca de quem exige APAC ou laudo.",
    versao: "1.0.0",
    configPadrao: {},

    botao: {
      rotulo: "Exames",
      icone: "🧪",
      variante: "icone",
      prioridade: 55,
      titulo: "Exames do município",
    },

    /* Mesma assinatura do REMUME: a tela do atendimento carrega o
     * paciente e, com ele, o vinculo que revela o municipio. */
    assinaturasRede: [{ regex: /\/api\/v1\/Atendimento\/[^/?]+(?:[?#].*)?$/i, metodos: ["GET"] }],

    start: function (deps) {
      d = deps;
      deps.aoClicarBotao(abrirPainel);

      cancelarRede = d.network.assinar(
        { regex: /\/api\/v1\/Atendimento\/[^/?]+(?:[?#].*)?$/i, metodos: ["GET"] },
        function (evt) {
          var M = raiz.MeedsSuiteMunicipio;
          if (!M) return;
          evt.json().then(function (corpo) {
            if (corpo) aplicarMunicipio(M.detectar(corpo, municipios()));
          });
        }
      );

      detectarNaTela();
      atualizarBaseRemota();
    },

    stop: function () {
      if (cancelarRede) { cancelarRede(); cancelarRede = null; }
      if (timerBusca) { clearTimeout(timerBusca); timerBusca = null; }
      if (overlay) { overlay.remover(); overlay = null; refs = {}; }
      indicePorMunicipio = {};
    },

    aoCargaRede: function () {
      /* A SPA troca de tela sem recarregar: o municipio do atendimento
       * anterior nao vale para o proximo. */
      detectarNaTela();
    },
  });
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
