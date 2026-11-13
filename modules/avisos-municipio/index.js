/* ------------------------------------------------------------------
 * modules/avisos-municipio/index.js — regras do municipio, na hora
 * ------------------------------------------------------------------
 * Cada municipio contratou a teleconsulta com um escopo proprio: em
 * Barbacena a UPA aceita medicacao VO e IM, mas nao EV; em Franco da
 * Rocha nem VO na unidade. O medico que atende varias cidades no mesmo
 * plantao nao tem como guardar isso de cabeca — e errar aqui e prescrever
 * algo que a unidade nao vai conseguir fazer.
 *
 * O aviso aparece SOZINHO e SO DENTRO do atendimento (/atendimento/<id>).
 * Na fila, no painel ou em qualquer outra tela ele nao aparece, e some ao
 * sair. O texto vem de dados/avisos-municipio.json — trocar uma regra ou
 * incluir um municipio nao exige mexer aqui.
 *
 * De onde vem o municipio: da mesma chamada que o REMUME ja escuta
 * (GET .../atendimento/<id>), pelo razaoSocialNome do cliente — ver
 * core/municipio.js. Na duvida, nao mostra nada: aviso da cidade errada
 * seria pior que nenhum.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  let d = null;
  let timers = [];
  let municipioPorAtendimento = {}; // id do atendimento -> nome do municipio (so memoria)
  let aberto = null;                // { id, municipio, chave, overlay, focoAnterior }
  let vistoDesde = {};              // id do atendimento -> quando a pagina dele apareceu
  let entendidos = {};              // chave (municipio|unidade) -> true: ciencia confirmada (ate o login ou recarregar)

  /* A leitura pela tela so vale depois deste tempo SEM resposta da rede.
   * A chamada do atendimento costuma chegar em menos de 1 s; esperar
   * evita mostrar por um instante o aviso de uma cidade que a rede,
   * logo em seguida, desmentiria. */
  const ESPERA_REDE_MS = 3000;

  /* Visual do modal de ciencia (prototipo de Pará de Minas, 13/11/2026).
   * O fundo escuro e a centralizacao vem do .ms-overlay do nucleo. */
  const CSS_MODAL = [
    ".msam-modal { --msam-red: #D43F3F; --msam-red-dark: #A82E2E; --msam-red-bg: #FCE9E9; --msam-amber: #9A6417; --msam-amber-bg: #FDF3E3;",
    "  background: #fff; color: #3B4552; width: 100%; max-width: 720px; max-height: calc(100vh - 40px); max-height: calc(100dvh - 40px);",
    "  display: flex; flex-direction: column; border-radius: 16px; overflow: hidden; border: 3px solid var(--msam-red);",
    "  box-shadow: 0 24px 60px rgba(0,0,0,.35); font-size: 15px; line-height: 1.45; }",
    ".msam-modal:focus { outline: none; }",
    ".msam-cabeca { background: var(--msam-red); color: #fff; padding: 18px 22px; display: flex; gap: 14px; align-items: center; flex: none; }",
    ".msam-icone { flex: none; width: 46px; height: 46px; border-radius: 50%; background: rgba(255,255,255,.18); display: flex;",
    "  align-items: center; justify-content: center; font-size: 24px; animation: msam-pulsa 1.6s infinite; }",
    "@keyframes msam-pulsa { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,.55); } 50% { box-shadow: 0 0 0 10px rgba(255,255,255,0); } }",
    "@media (prefers-reduced-motion: reduce) { .msam-icone { animation: none; } }",
    ".msam-cabeca small { display: block; font-size: 11px; letter-spacing: 1.6px; font-weight: 700; opacity: .9; }",
    ".msam-cabeca h2 { margin: 0; font-size: 19px; line-height: 1.25; }",
    ".msam-corpo { padding: 18px 22px; overflow-y: auto; flex: 1 1 auto; min-height: 0; }",
    ".msam-corpo h3 { margin: 0 0 12px; font-size: 16px; }",
    ".msam-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }",
    ".msam-lista li { display: flex; gap: 12px; align-items: flex-start; padding: 11px 14px; border-radius: 10px; background: #FAFBFC; border: 1px solid #ECEFF1; }",
    ".msam-lista li.msam-naoPode { background: var(--msam-red-bg); border-color: #F3C6C6; color: var(--msam-red-dark); font-weight: 600; }",
    ".msam-lista li.msam-pode { background: var(--msam-amber-bg); border-color: #F1D7AE; }",
    ".msam-n { flex: none; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; }",
    ".msam-naoPode .msam-n { background: var(--msam-red); color: #fff; font-weight: 700; font-size: 13px; }",
    ".msam-lista em { display: block; font-style: normal; font-weight: 400; font-size: 13px; color: #6B7683; margin-top: 4px; }",
    ".msam-contexto { padding: 14px 16px; border-radius: 10px; background: var(--msam-amber-bg); border: 1px solid #F1D7AE; }",
    ".msam-rodape { border-top: 1px solid #ECEFF1; padding: 14px 22px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; flex: none; }",
    ".msam-contador { font-size: 13px; color: #6B7683; margin-right: auto; }",
    ".msam-ack { display: flex; gap: 10px; align-items: center; font-weight: 600; cursor: pointer; }",
    ".msam-ack input { width: 22px; height: 22px; margin: 0; accent-color: var(--msam-red); }",
    ".msam-btn { border: 1px solid #ECEFF1; background: #fff; color: #3B4552; border-radius: 8px; padding: 11px 18px; font: inherit; font-weight: 600; cursor: pointer; }",
    ".msam-principal { background: var(--msam-red); border-color: var(--msam-red); color: #fff; }",
    ".msam-principal:disabled { background: #E3B7B7; border-color: #E3B7B7; cursor: not-allowed; }",
    ".msam-btn:focus-visible, .msam-ack input:focus-visible { outline: 3px solid #2E7D7B; outline-offset: 2px; }",
  ].join("\n");

  const RX_PAGINA_ATENDIMENTO = /^\/atendimento\/([0-9a-fA-F-]{36})(?:\/|$)/;
  const RX_API_ATENDIMENTO = /\/api\/v1\/atendimento\/([0-9a-fA-F-]{36})(?:[?#].*)?$/i;

  function regras() {
    const dados = raiz.MEEDS_AVISOS_MUNICIPIO;
    return (dados && dados.municipios) || {};
  }

  function atendimentoDaPagina() {
    try {
      const m = RX_PAGINA_ATENDIMENTO.exec((raiz.location && raiz.location.pathname) || "");
      return m ? m[1].toLowerCase() : null;
    } catch (e) {
      return null;
    }
  }

  /* Leitura pela TELA, restrita ao campo "Vinculos" do cartao do paciente
   * — nunca o nome solto na pagina: na gravacao de 24/09/2026, a tela de um
   * atendimento de Macae mostrava ao mesmo tempo um aviso de fila com
   * "PREFEITURA MUNICIPAL DE BARBACENA".
   *
   * O Vinculos traz a CIDADE numa linha ("MACAÉ - RJ", ou no formato
   * antigo "PREFEITURA MUNICIPAL DE MACAÉ") e a UNIDADE embaixo. Quem
   * separa uma da outra, nos dois formatos, e core/municipio.js
   * (analisarVinculo).
   *
   * So decide com EXATAMENTE uma cidade no vinculo e ela na lista —
   * paciente vinculado a duas cidades nao tem como saber qual e a do
   * atendimento, e ai o certo e nao mostrar. */
  function vinculo(nomes) {
    const Dom = raiz.MeedsSuiteDom;
    const M = raiz.MeedsSuiteMunicipio;
    if (!Dom || !M || typeof Dom.lerLinhasPorRotulo !== "function") return null;
    const linhas = Dom.lerLinhasPorRotulo(["Vínculos", "Vínculo"]);
    return linhas ? M.analisarVinculo(linhas, nomes) : null;
  }

  function municipioPeloVinculo(nomes) {
    if (!nomes.length) return null;
    const v = vinculo(nomes);
    if (!v || v.cidades.length !== 1) return null;
    const Dom = raiz.MeedsSuiteDom;
    const achados = nomes.filter(function (n) { return Dom.normalizarTexto(n) === v.cidades[0]; });
    return achados.length === 1 ? achados[0] : null;
  }

  function temConteudo(r) {
    return !!(r && r.titulo &&
      ((r.pode || []).length || (r.naoPode || []).length || (r.orientacoes || []).length));
  }

  /* UNIDADE, pelo "Vinculos" linha a linha: "PREFEITURA MUNICIPAL DE
   * MACAÉ" em cima, "UPA UNIDADE DE PRONTO ATENDIMENTO BARRA" embaixo.
   * So vale com EXATAMENTE uma prefeitura no vinculo, e ela sendo o
   * municipio ja decidido — uma unidade de outra cidade nunca empresta a
   * regra dela. O nome da unidade tem que bater INTEIRO (sem acento e sem
   * caixa): "UPA ... BARRA" nao casa com "UPA ... BARRA DE SAO JOAO".
   * Duas unidades com regra no mesmo vinculo: nao decide. */
  function unidadeDoVinculo(municipio, regraMun) {
    const unidades = regraMun && regraMun.unidades;
    if (!unidades) return null;
    const Dom = raiz.MeedsSuiteDom;
    const v = vinculo(Object.keys(regras()));
    if (!v || v.cidades.length !== 1 || v.cidades[0] !== Dom.normalizarTexto(municipio)) return null;

    const achadas = Object.keys(unidades).filter(function (k) {
      return (unidades[k].nomes || []).some(function (n) {
        return v.unidades.indexOf(Dom.normalizarTexto(n)) !== -1;
      });
    });
    if (achadas.length !== 1) return null;
    const achada = { chave: achadas[0], regra: unidades[achadas[0]] };
    return unidadeAplicavel(achada) ? achada : null;
  }

  /* Algumas regras de unidade valem so para um sexo (pedido de
   * 30/09/2026: exames ginecologicos em varias unidades de Macae, so
   * para pacientes do sexo feminino). Le a PALAVRA da tela
   * (MeedsSuiteDom.lerPaciente, o mesmo leitor que CMD/LME/APAC usam),
   * nunca um enum de API. Na duvida — sexo ainda nao apareceu na tela —
   * NAO mostra: aviso errado e pior que nenhum aviso (ver topo do
   * arquivo). */
  function unidadeAplicavel(unidade) {
    const restricao = unidade && unidade.regra && unidade.regra.apenasSexo;
    if (!restricao) return true;
    const Dom = raiz.MeedsSuiteDom;
    const paciente = (Dom && typeof Dom.lerPaciente === "function") ? Dom.lerPaciente() : {};
    return paciente.sexo === restricao;
  }

  /* O aviso em PAGINAS (13/11/2026): contexto (resumo) -> o que NAO fazer ->
   * o que a unidade oferece -> orientacoes. Passo sem item nao existe. */
  function montarPassos(regraMun, unidade) {
    const partes = [];
    if (temConteudo(regraMun) || (regraMun && regraMun.resumo)) partes.push(regraMun);
    if (unidade && (temConteudo(unidade.regra) || unidade.regra.resumo)) partes.push(unidade.regra);
    const juntar = function (f) {
      return partes.reduce(function (a, r) { return a.concat(f(r)); }, []);
    };
    const passos = [
      { tipo: "contexto", titulo: "Contexto", itens: juntar(function (r) {
        return typeof r.resumo === "string" && r.resumo ? [{ texto: r.resumo }] : [];
      }) },
      { tipo: "naoPode", titulo: "O que NÃO fazer", itens: juntar(function (r) {
        return (r.naoPode || []).map(function (n) { return { texto: n.item, fazer: n.fazer }; });
      }) },
      { tipo: "pode", titulo: "O que a unidade oferece", itens: juntar(function (r) {
        return (r.pode || []).map(function (t) { return { texto: t }; });
      }) },
      { tipo: "orientacoes", titulo: "Orientações", itens: juntar(function (r) {
        return (r.orientacoes || []).map(function (t) { return { texto: t }; });
      }) },
    ].filter(function (p) { return p.itens.length; });
    if (!passos.length) return null;
    return { titulo: partes[partes.length - 1].titulo, passos: passos };
  }

  function fechar() {
    if (!aberto) return;
    const anterior = aberto.focoAnterior;
    aberto.overlay.fechar();
    aberto.overlay.remover();
    aberto = null;
    /* Devolve o foco a quem tinha antes do modal (ex.: a anamnese). */
    if (anterior && anterior.isConnected !== false && typeof anterior.focus === "function") anterior.focus();
  }

  /* De que municipio e o atendimento. A rede, quando respondeu por ESTE
   * atendimento, decide — inclusive quando diz "outro municipio"; ai nao
   * cai para a leitura da tela. Sem a rede (Safari no iPad em escopo
   * isolado, ou a chamada passou antes do script subir): so o campo
   * "Vinculos", e so depois da espera pela rede. Devolve undefined
   * enquanto ainda esta esperando. */
  function municipioDoAtendimento(id, tabela) {
    if (Object.prototype.hasOwnProperty.call(municipioPorAtendimento, id)) {
      return municipioPorAtendimento[id];
    }
    if (!vistoDesde[id]) vistoDesde[id] = Date.now();
    if (Date.now() - vistoDesde[id] < ESPERA_REDE_MS) return undefined;
    return municipioPeloVinculo(Object.keys(tabela));
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }

  const ICONE_PASSO = { pode: "✅", orientacoes: "📌" };

  function htmlDoPasso(p) {
    if (p.tipo === "contexto") {
      return p.itens.map(function (it) {
        return "<div class=\"msam-contexto\"><span aria-hidden=\"true\">🏥</span> " + escapeHtml(it.texto) + "</div>";
      }).join("");
    }
    return "<ol class=\"msam-lista\">" + p.itens.map(function (it, i) {
      const marca = p.tipo === "naoPode" ? String(i + 1) : ICONE_PASSO[p.tipo];
      return "<li class=\"msam-" + p.tipo + "\"><span class=\"msam-n\" aria-hidden=\"true\">" + marca + "</span><div>" +
        escapeHtml(it.texto) + (it.fazer ? "<em>" + escapeHtml(it.fazer) + "</em>" : "") + "</div></li>";
    }).join("") + "</ol>";
  }

  /* Pedido de 13/11/2026 (Pará de Minas; desde a 2.71.0, todas as
   * cidades): o aviso abre em MODAL, no meio da tela, em passos (contexto
   * -> o que NAO fazer -> o que a unidade oferece -> orientacoes).
   * Bloqueia o atendimento ate o medico marcar "Li e estou ciente" e
   * confirmar no ultimo passo: nao fecha clicando fora nem no Esc. A
   * ciencia vale ate o fim da pagina (ou ate a tela de login). Sair do
   * atendimento fecha sem registrar ciencia. Isso substitui o cartao no
   * canto, que silenciava por 3h (pedidos de 25/09, 28/09 e 01/10/2026). */
  function abrirModal(id, municipio, chave, dados) {
    const total = dados.passos.length;
    let atual = 0;
    const overlay = d.dock.criarOverlay({ html: "", estilo: CSS_MODAL, fecharAoClicarFora: false });

    /* inicio: o modal abriu sozinho, talvez com o medico digitando na
     * anamnese — o foco vai para o proprio modal, nao para o Avancar (o
     * espaco seguinte pularia um passo sem ler). */
    function render(inicio) {
      const ultimo = atual === total - 1;
      overlay.elemento.innerHTML =
        "<div class=\"msam-modal\" tabindex=\"-1\" role=\"alertdialog\" aria-modal=\"true\" aria-labelledby=\"msam-titulo\">" +
          "<div class=\"msam-cabeca\">" +
            "<div class=\"msam-icone\" aria-hidden=\"true\">⚠</div>" +
            "<div><small>ATENÇÃO — LEITURA OBRIGATÓRIA</small>" +
            "<h2 id=\"msam-titulo\">" + escapeHtml(dados.titulo) + "</h2></div>" +
          "</div>" +
          "<div class=\"msam-corpo\">" +
            "<h3>" + escapeHtml(dados.passos[atual].titulo) + "</h3>" + htmlDoPasso(dados.passos[atual]) +
          "</div>" +
          "<div class=\"msam-rodape\">" +
            "<span class=\"msam-contador\">Passo " + (atual + 1) + " de " + total + "</span>" +
            (atual > 0 ? "<button type=\"button\" class=\"msam-btn msam-voltar\">Voltar</button>" : "") +
            (ultimo
              ? "<label class=\"msam-ack\"><input type=\"checkbox\" class=\"msam-ciente\"> Li e estou ciente</label>" +
                "<button type=\"button\" class=\"msam-btn msam-principal msam-confirmar\" disabled>Confirmar ciência</button>"
              : "<button type=\"button\" class=\"msam-btn msam-principal msam-avancar\">Avançar</button>") +
          "</div>" +
        "</div>";

      if (atual > 0) {
        overlay.$(".msam-voltar").addEventListener("click", function () { atual--; render(); });
      }
      if (!ultimo) {
        const avancar = overlay.$(".msam-avancar");
        avancar.addEventListener("click", function () { atual++; render(); });
        (inicio ? overlay.$(".msam-modal") : avancar).focus();
        return;
      }
      const ciente = overlay.$(".msam-ciente");
      const confirmar = overlay.$(".msam-confirmar");
      confirmar.disabled = !ciente.checked;
      ciente.addEventListener("change", function () { confirmar.disabled = !ciente.checked; });
      confirmar.addEventListener("click", function () {
        if (!ciente.checked) return;
        entendidos[chave] = true;
        fechar();
      });
      (inicio ? overlay.$(".msam-modal") : ciente).focus(); // Confirmar comeca desabilitado: o foco vai para o que habilita
    }

    /* Clique no fundo escuro nao pode tirar o foco do modal: o foco iria
     * para o body da pagina, o keydown nao passaria mais por aqui e o Tab
     * cairia no formulario atras. (Clique no texto: o tabindex=-1 do
     * .msam-modal segura o foco.) */
    overlay.elemento.addEventListener("mousedown", function (ev) {
      if (ev.target === overlay.elemento) ev.preventDefault();
    });

    /* Esc ignorado; Tab circula so entre os botoes do modal. */
    overlay.elemento.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      if (ev.key !== "Tab") return;
      const focaveis = overlay.$$("button:not([disabled]), input:not([disabled])");
      if (!focaveis.length) return;
      const raizDoc = overlay.elemento.getRootNode ? overlay.elemento.getRootNode() : null;
      const i = focaveis.indexOf(raizDoc && raizDoc.activeElement);
      const proximo = ev.shiftKey ? (i <= 0 ? focaveis.length - 1 : i - 1) : (i + 1) % focaveis.length;
      ev.preventDefault();
      focaveis[proximo].focus();
    });

    const doc = raiz.document;
    const ativo = doc && doc.activeElement;
    aberto = { id: id, municipio: municipio, chave: chave, overlay: overlay,
      focoAnterior: ativo && ativo !== doc.body ? ativo : null };
    overlay.abrir();
    render(true);
  }

  /* O atendimento da tela que PODE receber aviso, ou null. Fecha o que
   * nao vale mais: fora do atendimento, ou outro atendimento. */
  function atendimentoParaAvisar() {
    const id = atendimentoDaPagina();
    if (!id) {
      fechar();
      return null;
    }
    if (aberto && aberto.id !== id) fechar();
    return id;
  }

  /* A ciencia e de quem esta logado. Se o Meeds voltar para a tela de
   * login sem recarregar a pagina (SPA), o proximo medico tem que ler de
   * novo. Devolve true se a tela
   * de login esta visivel: ai nada fica por cima dela (o login pode
   * aparecer sem sair de /atendimento/<id>, sessao expirada na SPA; com o
   * modal por cima, o medico confirmaria, a ciencia seria apagada 1 s
   * depois e o modal voltaria — nunca chegaria ao login). */
  function esquecerCienciaNoLogin() {
    const Auth = raiz.MeedsSuiteAuth;
    if (!Auth || typeof Auth.estaNaTelaDeLogin !== "function" || !Auth.estaNaTelaDeLogin()) return false;
    entendidos = {};
    return true;
  }

  function verificar() {
    if (!d) return;
    if (esquecerCienciaNoLogin()) {
      fechar();
      return;
    }
    const id = atendimentoParaAvisar();
    if (!id) return;

    const tabela = regras();
    const municipio = municipioDoAtendimento(id, tabela);
    if (!municipio || !tabela[municipio]) return;

    const regraMun = tabela[municipio];
    const unidade = unidadeDoVinculo(municipio, regraMun);
    const passos = montarPassos(regraMun, unidade);
    if (!passos) return;
    const chave = municipio + "|" + (unidade ? unidade.chave : "");
    if (aberto && aberto.chave === chave) return;
    if (entendidos[chave] === true) {
      /* Ciencia ja confirmada para esta cidade/unidade: nao reabre, nem
       * neste nem em outro atendimento, ate o login. */
      if (aberto) fechar();
      return;
    }
    /* A unidade apareceu (ou mudou) depois do aviso do municipio: troca. */
    if (aberto) fechar();
    abrirModal(id, municipio, chave, passos);
  }

  raiz.MeedsSuite.registerModule({
    id: "avisos-municipio",
    nome: "Avisos do município",
    descricao: "Mostra, dentro do atendimento, o que a teleconsulta resolve naquele município e o que vai para o presencial.",
    versao: "1.6.0",
    configPadrao: {},

    assinaturasRede: [{ regex: /\/api\/v1\/atendimento\/[0-9a-fA-F-]{36}(?:[?#].*)?$/i, metodos: ["GET"] }],

    aoCargaRede: function (evt) {
      if (evt.status !== 200) return;
      const m = RX_API_ATENDIMENTO.exec(evt.url || "");
      if (!m || !raiz.MeedsSuiteMunicipio) return;
      const json = evt.json();
      const id = m[1].toLowerCase();
      /* ACHADO EM PRODUCAO (Jam de 25/09/2026, atendimento de Barbacena):
       * a resposta do Meeds novo nao trouxe a prefeitura nos caminhos que
       * conhecemos, e isso era gravado como "a rede decidiu: nenhuma
       * cidade da lista" — o que bloqueava a leitura do "Vinculos", que
       * mostrava BARBACENA. Agora, se a rede nao traz cidade NENHUMA, ela
       * nao decide nada e a tela responde. So quando ela traz uma cidade
       * (listada ou nao) e que a decisao e dela. */
      if (!raiz.MeedsSuiteMunicipio.cidadesDoAtendimento(json).length) return;
      const municipio = raiz.MeedsSuiteMunicipio.detectar(json, Object.keys(regras()));
      municipioPorAtendimento[id] = municipio || null;
      /* A rede desmentiu o aviso que a tela abriu (vinculo de uma cidade,
       * atendimento de outra): a rede vence. */
      if (aberto && aberto.id === id && aberto.municipio !== municipio) fechar();
      verificar();
    },

    start: function (deps) {
      d = deps;
      verificar();
      /* O Meeds e uma SPA: entrar e sair do atendimento nao recarrega a
       * pagina. Conferir o endereco a cada segundo e o jeito simples de
       * acompanhar isso sem mexer no history da aplicacao. */
      timers.push(setInterval(verificar, 1000));
    },

    stop: function () {
      timers.forEach(clearInterval);
      timers = [];
      fechar();
      municipioPorAtendimento = {};
      vistoDesde = {};
      entendidos = {};
      d = null;
    },

    _verificar: function () { verificar(); },
    _montarPassos: montarPassos,
  });
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
