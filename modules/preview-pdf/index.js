/* ------------------------------------------------------------------
 * modules/preview-pdf/index.js — pré-visualização do documento
 * ------------------------------------------------------------------
 * O QUE MOSTRA
 * O PDF de verdade, ao lado do formulário, atualizado enquanto o médico
 * preenche. Não é um esboço nem uma imitação em HTML: o painel exibe o
 * mesmo arquivo que o botão "Gerar" produz.
 *
 * FONTE ÚNICA DE VERDADE
 * Cada gerador anuncia a própria função `produzirPdf()` pelo barramento
 * (`preview:registrar-gerador`). O preview chama ESSA função — a mesma
 * que o botão do médico usa. Não existe layout paralelo aqui: se alguém
 * mudar uma coordenada no gerador, a prévia muda junto, porque é o
 * mesmo desenho.
 *
 * A única diferença deliberada é a validação: `gerarPdf()` recusa campos
 * obrigatórios vazios, e a prévia precisa desenhar mesmo pela metade —
 * é para isso que ela serve.
 *
 * PRIVACIDADE
 * A prévia mostra dado de paciente, então é tratada como tela clínica:
 * nada vai para a rede, nada é gravado em disco, nada aparece no
 * console. O `blob:` anterior é revogado antes de cada nova prévia, e
 * tudo é limpo ao fechar o painel, ao trocar de gerador, depois de um
 * tempo parado e ao desligar o módulo.
 *
 * POR QUE IFRAME, E NÃO CANVAS
 * O `<iframe>` com `blob:` usa o visualizador de PDF do próprio
 * navegador — o médico vê literalmente o arquivo, com o mesmo motor que
 * vai imprimi-lo. O preço é que esse visualizador não expõe a posição de
 * rolagem à página: dá para preservar a PÁGINA e o ZOOM (pelo fragmento
 * `#page=N&zoom=Z`), não o ponto exato dentro dela. Ver
 * docs/VIABILIDADE-PREVIEW.md.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var DEBOUNCE_MS = 700;          // dentro da faixa de 600 a 800 pedida
  var LARGURA_MINIMA = 1100;      // abaixo disso o painel não é oferecido
  var INATIVIDADE_MS = 10 * 60000; // 10 min parado: limpa a prévia da tela
  var LARGURA_PADRAO = 460;
  var LARGURA_MIN = 320;
  var LARGURA_MAX = 900;

  var d = null;
  var geradores = {};   // id -> { ficha, elementos, estado }
  var estiloGlobal = null;

  var CSS = [
    /* o modal do gerador e o painel viram colunas de uma mesma linha */
    ".pv-linha { display:flex; align-items:stretch; gap:14px; width:100%; justify-content:center; }",
    ".pv-painel { display:flex; flex-direction:column; background:#fff; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.35); overflow:hidden; flex-shrink:0; }",
    ".pv-painel[hidden] { display:none; }",
    ".pv-topo { background:linear-gradient(135deg,#123a7a,#1a56ad); color:#fff; padding:11px 14px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-shrink:0; }",
    ".pv-titulo { font-size:12.5px; font-weight:700; }",
    ".pv-estado { font-size:10.5px; opacity:.85; margin-top:1px; min-height:13px; }",
    ".pv-acoes { display:flex; align-items:center; gap:6px; }",
    ".pv-bt { background:rgba(255,255,255,.18); border:none; color:#fff; border-radius:6px; cursor:pointer; font-size:11px; font-weight:700; font-family:inherit; padding:5px 8px; }",
    ".pv-bt:hover { background:rgba(255,255,255,.32); }",
    ".pv-bt[disabled] { opacity:.4; cursor:default; }",
    ".pv-quadro { flex:1; border:none; width:100%; background:#525659; }",
    ".pv-vazio { flex:1; display:flex; align-items:center; justify-content:center; text-align:center; padding:24px; font-size:12.5px; color:#8a97a4; line-height:1.6; background:#f7f9fb; }",

    /* botao que abre/fecha, dentro do cabecalho do gerador */
    ".pv-alternar { background:rgba(255,255,255,.2); border:none; color:#fff; border-radius:14px; padding:5px 10px; font-size:11px; font-weight:700; font-family:inherit; cursor:pointer; }",
    ".pv-alternar:hover { background:rgba(255,255,255,.34); }",
    ".pv-alternar[aria-pressed='true'] { background:#fff; color:#123a7a; }",

    /* alca de redimensionamento */
    ".pv-alca { width:6px; cursor:col-resize; background:transparent; flex-shrink:0; align-self:stretch; border-radius:3px; }",
    ".pv-alca:hover, .pv-alca.pv-arrastando { background:rgba(255,255,255,.5); }",
  ].join("\n");

  /* ------------------------------------------------------------------
   * ESTADO LEMBRADO (aberto/fechado e largura), por gerador
   * ------------------------------------------------------------------
   * DESLIGADO por padrão na primeira execução: quem abre um laudo pela
   * primeira vez quer preencher, não olhar um documento em branco.
   * ------------------------------------------------------------------ */
  function lerPreferencia(id) {
    var todas = d.storage.ler("paineis", {}) || {};
    var p = todas[id] || {};
    return {
      aberto: p.aberto === true,
      largura: Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, Number(p.largura) || LARGURA_PADRAO)),
      zoom: p.zoom || "page-width",
    };
  }

  function gravarPreferencia(id, mudanca) {
    var todas = d.storage.ler("paineis", {}) || {};
    todas[id] = Object.assign({}, todas[id] || {}, mudanca);
    d.storage.gravar("paineis", todas);
  }

  function cabe() {
    return raiz.innerWidth >= LARGURA_MINIMA;
  }

  /* ------------------------------------------------------------------
   * ACOPLAMENTO A UM GERADOR
   * ------------------------------------------------------------------ */
  function registrarGerador(ficha) {
    if (!ficha || !ficha.id || geradores[ficha.id]) return false;

    var modal = ficha.overlay && ficha.overlay.$(ficha.seletorModal);
    if (!modal) return false;

    var pref = lerPreferencia(ficha.id);

    /* O modal passa a ser a primeira coluna de uma linha; o painel é a
     * segunda. Com o painel fechado, a linha tem uma coluna só e o
     * formulário fica exatamente como era. */
    var linha = document.createElement("div");
    linha.className = "pv-linha";
    modal.parentNode.insertBefore(linha, modal);
    linha.appendChild(modal);

    var alca = document.createElement("div");
    alca.className = "pv-alca";
    alca.hidden = true;
    linha.appendChild(alca);

    var painel = document.createElement("div");
    painel.className = "pv-painel";
    painel.hidden = true;
    painel.style.width = pref.largura + "px";
    painel.innerHTML =
      '<div class="pv-topo">' +
      "  <div><div class=\"pv-titulo\">Prévia do documento</div>" +
      '  <div class="pv-estado"></div></div>' +
      '  <div class="pv-acoes">' +
      '    <button type="button" class="pv-bt" data-zoom="menos" title="Diminuir">&minus;</button>' +
      '    <button type="button" class="pv-bt" data-zoom="mais" title="Aumentar">+</button>' +
      '    <button type="button" class="pv-bt" data-fechar title="Fechar a prévia">&#10005;</button>' +
      "  </div>" +
      "</div>" +
      '<div class="pv-vazio">Preencha o formulário para ver a prévia aqui.</div>';
    linha.appendChild(painel);

    /* Botão de abrir/fechar, no cabeçalho do próprio gerador — não é um
     * botão novo no dock. */
    var alternar = document.createElement("button");
    alternar.type = "button";
    alternar.className = "pv-alternar";
    alternar.setAttribute("aria-pressed", "false");
    alternar.textContent = "👁 Prévia";
    alternar.title = "Ver o documento enquanto preenche";
    var cabecalho = modal.querySelector("[id$='-modal-head'] > div:last-child") || modal.firstElementChild;
    if (cabecalho) cabecalho.insertBefore(alternar, cabecalho.firstChild);

    var g = {
      ficha: ficha,
      modal: modal,
      linha: linha,
      painel: painel,
      alca: alca,
      alternar: alternar,
      quadro: null,
      urlAtual: null,
      timerDebounce: null,
      timerInatividade: null,
      geracao: 0,
      assinaturaAnterior: null,
      aberto: false,
      largura: pref.largura,
      zoom: pref.zoom,
      pagina: 1,
      handlers: {},
      medidas: [],
      renderizacoes: 0,
    };
    geradores[ficha.id] = g;

    alternar.addEventListener("click", function () {
      definirAberto(g, !g.aberto);
    });
    painel.querySelector("[data-fechar]").addEventListener("click", function () {
      definirAberto(g, false);
    });
    painel.querySelector('[data-zoom="mais"]').addEventListener("click", function () {
      mudarZoom(g, 1);
    });
    painel.querySelector('[data-zoom="menos"]').addEventListener("click", function () {
      mudarZoom(g, -1);
    });

    /* Mudança em qualquer campo do formulário agenda uma prévia. Um
     * ouvinte só, delegado no modal — não um por campo. */
    g.handlers.mudou = function () {
      agendar(g);
    };
    modal.addEventListener("input", g.handlers.mudou);
    modal.addEventListener("change", g.handlers.mudou);

    ligarRedimensionamento(g);

    /* A preferência é lembrada, mas só vale se a tela couber. */
    if (pref.aberto && cabe()) definirAberto(g, true, true);
    atualizarDisponibilidade(g);

    return true;
  }

  function atualizarDisponibilidade(g) {
    var disponivel = cabe();
    g.alternar.hidden = !disponivel;
    if (!disponivel && g.aberto) definirAberto(g, false, true);
  }

  function definirAberto(g, aberto, semGravar) {
    g.aberto = !!aberto;
    g.painel.hidden = !g.aberto;
    g.alca.hidden = !g.aberto;
    g.alternar.setAttribute("aria-pressed", String(g.aberto));
    if (!semGravar) gravarPreferencia(g.ficha.id, { aberto: g.aberto });

    if (g.aberto) {
      agendar(g, true);
    } else {
      /* Fechar limpa de verdade: o dado de paciente sai da tela e o blob
       * é revogado. Não fica um documento pendurado em memória. */
      limparPrevia(g);
    }
  }

  function mudarZoom(g, direcao) {
    var escala = ["page-fit", "50", "75", "100", "125", "150", "200"];
    var atual = escala.indexOf(String(g.zoom));
    if (atual === -1) atual = 3;
    var novo = Math.min(escala.length - 1, Math.max(0, atual + direcao));
    g.zoom = escala[novo];
    gravarPreferencia(g.ficha.id, { zoom: g.zoom });
    if (g.quadro && g.urlAtual) g.quadro.src = enderecoComVista(g);
  }

  function enderecoComVista(g) {
    /* O visualizador nativo aceita página e zoom pelo fragmento. É o que
     * dá para preservar entre re-renderizações. */
    return g.urlAtual + "#page=" + g.pagina + "&zoom=" + g.zoom + "&toolbar=1";
  }

  function ligarRedimensionamento(g) {
    var arrastando = false;
    var xInicial = 0;
    var larguraInicial = 0;

    g.handlers.mouseDown = function (ev) {
      arrastando = true;
      xInicial = ev.clientX;
      larguraInicial = g.painel.getBoundingClientRect().width;
      g.alca.classList.add("pv-arrastando");
      ev.preventDefault();
    };
    g.handlers.mouseMove = function (ev) {
      if (!arrastando) return;
      var nova = Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, larguraInicial - (ev.clientX - xInicial)));
      g.largura = Math.round(nova);
      g.painel.style.width = g.largura + "px";
    };
    g.handlers.mouseUp = function () {
      if (!arrastando) return;
      arrastando = false;
      g.alca.classList.remove("pv-arrastando");
      gravarPreferencia(g.ficha.id, { largura: g.largura });
    };

    g.alca.addEventListener("mousedown", g.handlers.mouseDown);
    raiz.addEventListener("mousemove", g.handlers.mouseMove);
    raiz.addEventListener("mouseup", g.handlers.mouseUp);
  }

  /* ------------------------------------------------------------------
   * AGENDAMENTO — o que evita a digitação engasgar
   * ------------------------------------------------------------------ */
  function assinaturaDoFormulario(g) {
    var partes = [];
    g.modal.querySelectorAll("input, select, textarea").forEach(function (campo) {
      partes.push(campo.id + "=" + (campo.value || ""));
    });
    return partes.join("|");
  }

  function agendar(g, imediato) {
    if (!g.aberto) return;                       // painel fechado: nem agenda
    if (!g.ficha.overlay.estaAberto()) return;   // modal fechado: idem

    clearTimeout(g.timerDebounce);
    marcarDesatualizado(g, true);

    g.timerDebounce = setTimeout(function () {
      renderizar(g);
    }, imediato ? 60 : DEBOUNCE_MS);
  }

  function marcarDesatualizado(g, sim) {
    var estado = g.painel.querySelector(".pv-estado");
    /* Só troca o TEXTO, nunca o tamanho do painel: mexer no layout aqui
     * faria a prévia saltar a cada tecla. */
    estado.textContent = sim ? "atualizando…" : g.ultimaLegenda || "";
  }

  function renderizar(g) {
    if (!g.aberto || !g.ficha.overlay.estaAberto()) return;

    /* Aba em segundo plano não renderiza: o médico não está olhando, e
     * gerar PDF à toa gasta CPU dele. Quando voltar, o listener de
     * visibilidade reagenda. */
    if (document.hidden) return;

    var assinatura = assinaturaDoFormulario(g);
    if (assinatura === g.assinaturaAnterior) {
      marcarDesatualizado(g, false);
      return; // nada relevante mudou
    }

    var minhaGeracao = ++g.geracao;
    var t0 = performance.now();

    Promise.resolve()
      .then(function () {
        return g.ficha.produzirPdf();
      })
      .then(function (documento) {
        /* Chegou tarde: outra renderização já começou depois desta.
         * Descarta em vez de sobrescrever o resultado mais novo. */
        if (minhaGeracao !== g.geracao) return;
        if (!g.aberto) return;

        var ms = performance.now() - t0;
        g.medidas.push(ms);
        g.renderizacoes++;
        g.assinaturaAnterior = assinatura;

        mostrar(g, documento.bytes);
        g.ultimaLegenda = documento.filename + " · " + Math.round(ms) + " ms";
        marcarDesatualizado(g, false);
        reiniciarInatividade(g);
      })
      .catch(function (e) {
        if (minhaGeracao !== g.geracao) return;
        /* Formulário pela metade costuma dar erro de desenho, e isso é
         * esperado — a prévia não é um validador. Mostramos um recado
         * curto, sem detalhe técnico e sem nada do documento. */
        mostrarVazio(g, "Ainda não dá para montar a prévia. Continue preenchendo.");
        g.ultimaLegenda = "";
        marcarDesatualizado(g, false);
      });
  }

  function mostrar(g, bytes) {
    var blob = new Blob([bytes], { type: "application/pdf" });
    var url = URL.createObjectURL(blob);

    /* Revoga a anterior ANTES de trocar: sem isso, cada tecla deixaria
     * um PDF pendurado em memória até a aba fechar. */
    if (g.urlAtual) URL.revokeObjectURL(g.urlAtual);
    g.urlAtual = url;

    var vazio = g.painel.querySelector(".pv-vazio");
    if (vazio) vazio.remove();

    if (!g.quadro) {
      g.quadro = document.createElement("iframe");
      g.quadro.className = "pv-quadro";
      g.quadro.setAttribute("title", "Prévia do documento");
      g.painel.appendChild(g.quadro);
    }
    g.quadro.src = enderecoComVista(g);
  }

  function mostrarVazio(g, texto) {
    if (g.quadro) {
      g.quadro.remove();
      g.quadro = null;
    }
    if (g.urlAtual) {
      URL.revokeObjectURL(g.urlAtual);
      g.urlAtual = null;
    }
    var vazio = g.painel.querySelector(".pv-vazio");
    if (!vazio) {
      vazio = document.createElement("div");
      vazio.className = "pv-vazio";
      g.painel.appendChild(vazio);
    }
    vazio.textContent = texto;
  }

  /* Consultório compartilhado: depois de um tempo parado, o documento
   * sai da tela. Ninguém precisa lembrar de fechar. */
  function reiniciarInatividade(g) {
    clearTimeout(g.timerInatividade);
    g.timerInatividade = setTimeout(function () {
      if (!g.aberto) return;
      mostrarVazio(g, "Prévia ocultada por inatividade. Toque em qualquer campo para gerar de novo.");
      g.assinaturaAnterior = null;
    }, INATIVIDADE_MS);
  }

  function limparPrevia(g) {
    clearTimeout(g.timerDebounce);
    clearTimeout(g.timerInatividade);
    g.geracao++; // invalida qualquer renderização em voo
    if (g.quadro) {
      g.quadro.remove();
      g.quadro = null;
    }
    if (g.urlAtual) {
      URL.revokeObjectURL(g.urlAtual);
      g.urlAtual = null;
    }
    g.assinaturaAnterior = null;
    g.ultimaLegenda = "";
    var vazio = g.painel.querySelector(".pv-vazio");
    if (!vazio) {
      vazio = document.createElement("div");
      vazio.className = "pv-vazio";
      g.painel.appendChild(vazio);
    }
    vazio.textContent = "Preencha o formulário para ver a prévia aqui.";
  }

  function desacoplar(g) {
    limparPrevia(g);
    g.modal.removeEventListener("input", g.handlers.mudou);
    g.modal.removeEventListener("change", g.handlers.mudou);
    g.alca.removeEventListener("mousedown", g.handlers.mouseDown);
    raiz.removeEventListener("mousemove", g.handlers.mouseMove);
    raiz.removeEventListener("mouseup", g.handlers.mouseUp);
    if (g.alternar.parentNode) g.alternar.parentNode.removeChild(g.alternar);
    /* Devolve o modal ao lugar original e desfaz a linha de duas colunas:
     * o formulário volta a ser exatamente o que era. */
    if (g.linha.parentNode) {
      g.linha.parentNode.insertBefore(g.modal, g.linha);
      g.linha.parentNode.removeChild(g.linha);
    }
  }

  var aoMudarTela = null;
  var aoMudarVisibilidade = null;

  raiz.MeedsSuite.registerModule({
    id: "preview-pdf",
    nome: "Prévia do documento",
    descricao:
      "Mostra o PDF ao lado do formulário enquanto você preenche, nos geradores de APAC e de laudo. É o mesmo arquivo que será baixado.",
    versao: "1.0.0",
    configPadrao: {},

    /* Sem botão no dock: a prévia só faz sentido dentro de um gerador, e
     * o botão de abrir vive no cabeçalho do próprio gerador. Mesmo
     * desenho do módulo de CID-10. */
    botao: null,
    assinaturasRede: [],

    start: function (deps) {
      d = deps;
      geradores = {};
      estiloGlobal = d.dock.adicionarEstilo(CSS);

      deps.assinarEvento("preview:registrar-gerador", function (ficha) {
        return registrarGerador(ficha);
      });

      /* Geradores que subiram antes deste módulo já anunciaram e não
       * encontraram ninguém. Este aviso faz cada um anunciar de novo. */
      deps.publicarEvento("preview:pronto", {});

      aoMudarTela = function () {
        Object.keys(geradores).forEach(function (id) {
          atualizarDisponibilidade(geradores[id]);
        });
      };
      raiz.addEventListener("resize", aoMudarTela);

      aoMudarVisibilidade = function () {
        if (document.hidden) return;
        Object.keys(geradores).forEach(function (id) {
          var g = geradores[id];
          if (g.aberto) agendar(g);
        });
      };
      document.addEventListener("visibilitychange", aoMudarVisibilidade);
    },

    stop: function () {
      Object.keys(geradores).forEach(function (id) {
        desacoplar(geradores[id]);
      });
      geradores = {};
      if (estiloGlobal && estiloGlobal.parentNode) estiloGlobal.parentNode.removeChild(estiloGlobal);
      estiloGlobal = null;
      if (aoMudarTela) raiz.removeEventListener("resize", aoMudarTela);
      if (aoMudarVisibilidade) document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      aoMudarTela = null;
      aoMudarVisibilidade = null;
      d = null;
    },

    /* exposto só para o teste de fumaça */
    _teste: {
      estado: function () {
        return Object.keys(geradores).map(function (id) {
          var g = geradores[id];
          return {
            id: id,
            aberto: g.aberto,
            temQuadro: !!g.quadro,
            temUrl: !!g.urlAtual,
            renderizacoes: g.renderizacoes,
            medidas: g.medidas.slice(),
          };
        });
      },
      zerarMedidas: function () {
        Object.keys(geradores).forEach(function (id) {
          geradores[id].renderizacoes = 0;
          geradores[id].medidas = [];
        });
      },
      abrir: function (id) {
        if (geradores[id]) definirAberto(geradores[id], true);
      },
      fechar: function (id) {
        if (geradores[id]) definirAberto(geradores[id], false);
      },
      forcarLarguraMinima: function (v) {
        LARGURA_MINIMA = v;
      },
    },
  });
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
