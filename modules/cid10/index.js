/* ------------------------------------------------------------------
 * modules/cid10/index.js — busca de CID-10 pelo nome da doenca
 * ------------------------------------------------------------------
 * O PROBLEMA QUE RESOLVE
 * Os tres geradores de laudo traziam, cada um, uma listinha curada de
 * CID: 42 codigos em Sete Lagoas, 90 em CMD, 52 na APAC — 91 distintos
 * somando os tres. A CID-10 tem 14.233. E o autocomplete exigia saber o
 * CODIGO: quem digitava "enxaqueca" nao achava nada, porque a busca era
 * pela chave, nao pela descricao.
 *
 * Aqui a busca e pelo NOME da doenca (ou pelo codigo, tanto faz), na
 * base completa, com a mesma tolerancia a erro de digitacao que o
 * REMUME ja tinha — o motor agora e do nucleo (core/busca.js).
 *
 * COMO ELE CONVERSA COM OS LAUDOS
 * Este modulo nao conhece nenhum laudo. Ao escolher um codigo, ele
 * PUBLICA o evento "cid:escolhido"; o laudo que estiver com o modal
 * aberto atende e preenche o proprio campo. Se nenhum atender, o codigo
 * vai para a area de transferencia. Assim, um sexto gerador de laudo
 * passa a receber CID sem que este arquivo mude uma linha.
 *
 * DADOS
 * A base completa vive em dados/cid10.json e e buscada pela internet
 * (1 MB — embutir no pacote faria toda atualizacao baixar isso de novo).
 * O fallback embutido tem os 90 codigos que os laudos ja traziam, para o
 * modulo continuar util sem internet. Mesma estrategia do REMUME.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var URL_BASE =
    "https://raw.githubusercontent.com/sodelfino/meeds-suite/main/dados/cid10.json";

  var d = null;
  var overlay = null;
  var refs = null;
  var indice = null;
  var cids = null;      // { codigo: descricao }
  var totalBase = 0;
  var usandoFallback = true;
  var itensNaTela = [];
  var focado = -1;

  /* Apelidos que o medico usa na boca do dia a dia. So AMPLIAM o que da
   * para digitar; nao alteram nenhuma descricao oficial. Mesmo mecanismo
   * dos sinonimos do REMUME (frase inteira, casamento exato). */
  var SINONIMOS = {
    infarto: ["iam", "ataque cardiaco"],
    /* "derrame" ficou de fora de proposito: em CID-10 ele tambem e
     * derrame pericardico (I31.3) e derrame pleural (J90), entao trazia
     * o resultado errado na frente do AVC. */
    "acidente vascular cerebral": ["avc"],
    hipertensao: ["pressao alta", "has"],
    diabetes: ["dm"],
    "insuficiencia cardiaca": ["icc"],
    "doenca pulmonar obstrutiva cronica": ["dpoc"],
    "infeccao do trato urinario": ["itu"],
    "doenca renal cronica": ["drc"],
    cefaleia: ["dor de cabeca"],
    lombalgia: ["dor lombar", "dor nas costas"],
    "transtorno depressivo": ["depressao"],
    "transtorno de ansiedade": ["ansiedade"],
    obesidade: ["sobrepeso"],
    "sindrome de down": ["trissomia do 21"],
    epilepsia: ["convulsao"],
  };

  var CSS = [
    ".cid-modal { width:100%; max-width:640px; max-height:86vh; background:#fff; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.35); display:flex; flex-direction:column; overflow:hidden; }",
    ".cid-modal header { background:linear-gradient(135deg,#123a7a,#1a56ad); color:#fff; padding:15px 18px; display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }",
    ".cid-modal header h2 { margin:0; font-size:15px; font-weight:700; }",
    ".cid-sub { margin:3px 0 0; font-size:11.5px; opacity:.9; }",
    ".cid-fechar { background:rgba(255,255,255,.2); border:none; color:#fff; width:28px; height:28px; border-radius:50%; cursor:pointer; font-size:14px; flex-shrink:0; }",
    ".cid-fechar:hover { background:rgba(255,255,255,.34); }",
    ".cid-body { padding:14px 18px 16px; display:flex; flex-direction:column; gap:10px; min-height:0; flex:1; }",
    ".cid-body label { display:block; font-size:10.5px; font-weight:700; color:#5b6672; margin-bottom:4px; }",
    ".cid-body input { width:100%; padding:9px 11px; border:1px solid #d8dfe6; border-radius:8px; font-size:13.5px; color:#16221f; }",
    ".cid-hint { font-size:11.5px; color:#a15c00; background:#fff4e2; padding:7px 10px; border-radius:7px; }",
    ".cid-hint[hidden] { display:none; }",
    ".cid-count { font-size:11px; color:#5b6672; }",
    ".cid-lista { list-style:none; margin:0; padding:0; overflow-y:auto; flex:1; min-height:140px; border-top:1px solid #eef2f6; }",
    ".cid-lista li { display:flex; align-items:center; gap:10px; padding:8px 4px; border-bottom:1px solid #f1f5f9; font-size:12.5px; line-height:1.45; }",
    ".cid-lista li.cid-focado { background:#e8f0f8; }",
    ".cid-item { flex:1; min-width:0; }",
    ".cid-codigo { font-family:ui-monospace,Menlo,monospace; font-weight:700; color:#123a7a; margin-right:8px; }",
    ".cid-item mark { background:#fde68a; padding:0 1px; border-radius:2px; }",
    ".cid-usar { background:#1a4fa0; border:none; color:#fff; border-radius:7px; cursor:pointer; font-size:11px; font-weight:700; padding:6px 11px; flex-shrink:0; }",
    ".cid-usar:hover { background:#123a7a; }",
    ".cid-vazio { color:#8a97a4; font-style:italic; padding:16px 4px; font-size:12.5px; }",
    ".cid-rodape { font-size:10.5px; color:#9aa5b1; line-height:1.5; }",
  ].join("\n");

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function destacar(texto, termo) {
    if (!termo) return escapeHtml(texto);
    var normT = d.dom.normalizarTexto(texto);
    var normTermo = d.dom.normalizarTexto(termo);
    var i = normT.indexOf(normTermo);
    if (i === -1) return escapeHtml(texto);
    return (
      escapeHtml(texto.slice(0, i)) +
      "<mark>" + escapeHtml(texto.slice(i, i + termo.length)) + "</mark>" +
      escapeHtml(texto.slice(i + termo.length))
    );
  }

  /* ---- base de dados ---- */
  function aplicarBase(mapa, completa) {
    cids = mapa;
    totalBase = Object.keys(mapa).length;
    usandoFallback = !completa;
    // o indice pesquisa codigo E descricao: "I48" e "fibrilacao" acham o mesmo
    indice = raiz.MeedsSuiteBusca.criarIndice(
      Object.keys(mapa).map(function (cod) {
        return { codigo: cod, descricao: mapa[cod] };
      }),
      function (item) {
        return item.codigo + " " + item.descricao;
      }
    );
    atualizarSubtitulo();
  }

  function atualizarSubtitulo() {
    if (!refs) return;
    refs.sub.textContent = usandoFallback
      ? totalBase + " códigos disponíveis offline — a lista completa não pôde ser baixada agora"
      : totalBase.toLocaleString("pt-BR") + " códigos da CID-10";
  }

  function buscarBaseCompleta() {
    return fetch(URL_BASE, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (dados) {
        if (!dados || !dados.cids || typeof dados.cids !== "object") {
          console.warn("[CID-10] arquivo remoto com formato inesperado, mantendo a copia embutida.");
          return false;
        }
        aplicarBase(dados.cids, true);
        if (overlay && overlay.estaAberto()) renderizar();
        return true;
      })
      .catch(function (e) {
        console.warn("[CID-10] nao foi possivel baixar a base completa, usando a copia embutida.", e);
        return false;
      });
  }

  /* ---- escolha de um codigo ---- */
  function usarCodigo(item) {
    /* Nao sabemos qual laudo esta aberto — nem se ha algum. Publicamos e
     * quem estiver aberto atende. Se ninguem atender, copiamos. */
    var atenderam = d.publicarEvento("cid:escolhido", {
      codigo: item.codigo,
      descricao: item.descricao,
    });

    if (atenderam > 0) {
      overlay.fechar();
      d.core.toast("CID " + item.codigo + " preenchido no laudo.", 3000);
      return;
    }

    copiar(item.codigo, function () {
      d.core.toast(
        "CID " + item.codigo + " copiado. Nenhum laudo estava aberto — cole no campo CID.",
        4500
      );
    });
  }

  function copiar(texto, aoCopiar) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(aoCopiar).catch(function () {
        copiarFallback(texto, aoCopiar);
      });
    } else {
      copiarFallback(texto, aoCopiar);
    }
  }

  function copiarFallback(texto, aoCopiar) {
    try {
      var ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      aoCopiar();
    } catch (e) {
      /* silencioso */
    }
  }

  /* ---- UI ---- */
  function moverFoco(delta) {
    if (!itensNaTela.length) return;
    if (itensNaTela[focado]) itensNaTela[focado].li.classList.remove("cid-focado");
    focado = Math.min(Math.max(focado + delta, 0), itensNaTela.length - 1);
    var atual = itensNaTela[focado];
    if (atual) {
      atual.li.classList.add("cid-focado");
      atual.li.scrollIntoView({ block: "nearest" });
    }
  }

  function renderizar() {
    if (!refs) return;
    var termo = refs.busca.value.trim();

    var achados;
    var viaFuzzy = false;
    if (!termo) {
      achados = Object.keys(cids)
        .slice(0, 60)
        .map(function (c) {
          return { codigo: c, descricao: cids[c] };
        });
    } else {
      var r = raiz.MeedsSuiteBusca.buscar(termo, indice, {
        sinonimos: SINONIMOS,
        limite: 120,
        /* Aqui os sinonimos sao inequivocos ("pressao alta" so pode ser
         * hipertensao), entao valem mais que no REMUME. Sem isto, o
         * casamento literal de "alta" + "pressao" colocava "Efeito dos
         * fluidos em alta pressao" na frente de "Hipertensao essencial". */
        config: { PESO_SINONIMO: 2.2 },
      });
      achados = r.itens;
      viaFuzzy = r.viaFuzzy;
    }

    refs.count.textContent = termo
      ? achados.length + " resultado(s)"
      : "digite o nome da doença ou o código";

    refs.hint.hidden = !(viaFuzzy && achados.length);
    if (!refs.hint.hidden) {
      refs.hint.textContent = 'Não achei exatamente "' + termo + '" — mostrando o mais parecido.';
    }

    refs.lista.innerHTML = "";
    itensNaTela = [];
    focado = -1;

    if (!achados.length) {
      var vazio = document.createElement("li");
      vazio.className = "cid-vazio";
      vazio.textContent =
        'Nenhum código encontrado para "' + termo + '". Tente outra palavra da doença, ou o código (ex: I10).';
      refs.lista.appendChild(vazio);
      return;
    }

    var frag = document.createDocumentFragment();
    achados.forEach(function (item) {
      var li = document.createElement("li");
      var txt = document.createElement("div");
      txt.className = "cid-item";
      txt.innerHTML =
        '<span class="cid-codigo">' + escapeHtml(item.codigo) + "</span>" + destacar(item.descricao, termo);
      li.appendChild(txt);

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cid-usar";
      btn.textContent = "Usar";
      btn.title = "Preenche este CID no laudo que estiver aberto";
      btn.addEventListener("click", function () {
        usarCodigo(item);
      });
      li.appendChild(btn);

      itensNaTela.push({ li: li, botao: btn });
      frag.appendChild(li);
    });
    refs.lista.appendChild(frag);
  }

  function montarUI() {
    overlay = d.dock.criarOverlay({
      estilo: CSS,
      html:
        '<div class="cid-modal" role="dialog" aria-modal="true" aria-labelledby="cid-title">' +
        "  <header><div>" +
        '    <h2 id="cid-title">Buscar CID-10</h2>' +
        '    <p class="cid-sub" id="cid-sub">carregando…</p>' +
        "  </div>" +
        '  <button type="button" class="cid-fechar" aria-label="Fechar">&#10005;</button></header>' +
        '  <div class="cid-body">' +
        '    <div><label for="cid-busca">Nome da doença ou código</label>' +
        '      <input id="cid-busca" type="text" placeholder="Ex: enxaqueca, fibrilação atrial, I10…" autocomplete="off" /></div>' +
        '    <div class="cid-hint" id="cid-hint" hidden></div>' +
        '    <div class="cid-count" id="cid-count"></div>' +
        '    <ul class="cid-lista" id="cid-lista"></ul>' +
        '    <p class="cid-rodape">“Usar” preenche o CID no laudo que estiver aberto. Se nenhum estiver, o código é copiado. Setas ↑ ↓ percorrem a lista; Enter usa o primeiro.</p>' +
        "  </div>" +
        "</div>",
    });

    refs = {
      sub: overlay.$("#cid-sub"),
      busca: overlay.$("#cid-busca"),
      hint: overlay.$("#cid-hint"),
      count: overlay.$("#cid-count"),
      lista: overlay.$("#cid-lista"),
    };

    overlay.$(".cid-fechar").addEventListener("click", overlay.fechar);

    var debounce = null;
    refs.busca.addEventListener("input", function () {
      clearTimeout(debounce);
      debounce = setTimeout(renderizar, 180);
    });
    refs.busca.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        moverFoco(1);
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        moverFoco(-1);
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        var alvo = itensNaTela[focado] || itensNaTela[0];
        if (alvo) alvo.botao.click();
      }
    });

    atualizarSubtitulo();
  }

  function abrir() {
    overlay.abrir();
    renderizar();
    setTimeout(function () {
      refs.busca.select();
      refs.busca.focus();
    }, 50);
  }

  raiz.MeedsSuite.registerModule({
    id: "cid10",
    nome: "Buscar CID-10",
    descricao:
      "Procura o código CID-10 pelo nome da doença, na tabela completa, e preenche no laudo que estiver aberto.",
    versao: "1.0.0",
    configPadrao: {},

    botao: {
      icone: "🔎",
      rotulo: "CID-10",
      titulo: "Buscar CID-10 pelo nome da doença",
      prioridade: 25, // entre a APAC (20) e o laudo de Sete Lagoas (30)
    },

    assinaturasRede: [],

    start: function (deps) {
      d = deps;
      aplicarBase(raiz.MEEDS_CID10_FALLBACK || {}, false);
      montarUI();
      deps.aoClicarBotao(abrir);
      buscarBaseCompleta();
    },

    stop: function () {
      if (overlay) {
        overlay.remover();
        overlay = null;
      }
      refs = null;
      indice = null;
      itensNaTela = [];
      focado = -1;
      d = null;
    },
  });
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
