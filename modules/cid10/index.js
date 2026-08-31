/* ------------------------------------------------------------------
 * modules/cid10/index.js — CID-10 dentro do campo do laudo
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
  var cids = null;      // { codigo: descricao }

  /* O indice NAO e montado na carga da pagina.
   * Medido com a base completa: montar custa ~364 ms de thread
   * bloqueada, e num computador mais modesto isso passa de um segundo —
   * o medico veria a tela do Meeds travar sem entender por que. Ele e
   * montado quando realmente precisa: na primeira busca. Se o navegador
   * oferecer tempo ocioso (requestIdleCallback), aproveitamos para
   * adiantar isso enquanto ninguem esta esperando. */
  var indice = null;
  var montandoIndice = false;
  var estiloCampos = null;
  var totalBase = 0;
  var usandoFallback = true;

  /* Quantas linhas vao para a tela de uma vez. O resto continua
   * acessivel: e so escrever mais na busca. */
  var MAX_EXIBIDOS = 50;

  /* Quantas sugestoes cabem no autocomplete de dentro do laudo. Menos que
   * na janela de busca: e uma lista flutuante sobre o formulario, nao
   * uma tela inteira. */
  var MAX_SUGESTOES = 8;

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

  /* CSS do autocomplete que vive DENTRO do campo de CID de cada laudo.
   * Nao ha medida em pixel de canto aqui: a lista se ancora no proprio
   * campo (top:100%), nao na janela. Quem posiciona coisa na tela
   * continua sendo o dock do nucleo. */
  var CSS_CAMPO = [
    ".cid-campo-wrap { position:relative; }",
    ".cid-sug { position:absolute; top:100%; left:0; right:0; z-index:5; background:#fff; border:1px solid #d8dfe6; border-top:none; border-radius:0 0 8px 8px; box-shadow:0 8px 20px rgba(0,0,0,.14); max-height:230px; overflow-y:auto; }",
    ".cid-sug[hidden] { display:none; }",
    ".cid-sug-item { display:flex; gap:8px; align-items:baseline; padding:7px 10px; cursor:pointer; font-size:12px; line-height:1.4; border-bottom:1px solid #f1f5f9; }",
    ".cid-sug-item:last-child { border-bottom:none; }",
    ".cid-sug-item:hover, .cid-sug-item.cid-sug-focado { background:#e8f0f8; }",
    ".cid-sug-cod { font-family:ui-monospace,Menlo,monospace; font-weight:700; color:#123a7a; flex-shrink:0; }",
    ".cid-sug-desc { color:#16221f; }",
    ".cid-sug-vazio { padding:9px 10px; font-size:11.5px; color:#8a97a4; font-style:italic; }",
    ".cid-sug-rodape { padding:6px 10px; font-size:10.5px; color:#9aa5b1; border-top:1px solid #f1f5f9; background:#fafbfc; }",
  ].join("\n");

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /* ---- base de dados ---- */
  function aplicarBase(mapa, completa) {
    cids = mapa;
    totalBase = Object.keys(mapa).length;
    usandoFallback = !completa;
    indice = null; // sera remontado sob demanda, com a base nova
    agendarMontagemOciosa();
  }

  /* Monta o indice se ainda nao existir. O indice pesquisa CODIGO e
   * DESCRICAO juntos, entao "I48" e "fibrilacao" chegam ao mesmo item. */
  function garantirIndice() {
    if (indice || montandoIndice || !cids) return indice;
    montandoIndice = true;
    try {
      indice = raiz.MeedsSuiteBusca.criarIndice(
        Object.keys(cids).map(function (cod) {
          return { codigo: cod, descricao: cids[cod] };
        }),
        function (item) {
          return item.codigo + " " + item.descricao;
        }
      );
    } finally {
      montandoIndice = false;
    }
    return indice;
  }

  /* Adianta a montagem em tempo ocioso, quando o navegador oferece. Se
   * nao oferecer, nada acontece e a montagem fica para a primeira busca
   * — que e o comportamento garantido. */
  function agendarMontagemOciosa() {
    if (typeof raiz.requestIdleCallback !== "function") return;
    raiz.requestIdleCallback(
      function () {
        garantirIndice();
      },
      { timeout: 8000 }
    );
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
          return true;
      })
      .catch(function (e) {
        console.warn("[CID-10] nao foi possivel baixar a base completa, usando a copia embutida.", e);
        return false;
      });
  }

  /* ---- escolha de um codigo ---- */
  /* ---- UI ---- */
  /* ------------------------------------------------------------------
   * CONECTAR UM CAMPO DE CID DE UM LAUDO
   * ------------------------------------------------------------------
   * O fluxo principal do medico e dentro do formulario: ele clica no
   * campo CID-10 do laudo, digita o nome da doenca, ve os resultados e
   * escolhe — codigo e descricao entram sozinhos, nos campos certos. A
   * janela de busca separada continua existindo como apoio.
   *
   * Este modulo NAO conhece nenhum laudo. Cada laudo ANUNCIA o proprio
   * campo pelo barramento ("cid:conectar-campo") e diz o que fazer com a
   * escolha. Se o modulo de CID estiver desligado, ninguem atende e o
   * campo segue funcionando como texto livre, como sempre foi.
   * ------------------------------------------------------------------ */
  var camposConectados = [];

  function conectarCampo(pedido) {
    var input = pedido && pedido.input;
    if (!input || input.__cidConectado) return false;
    input.__cidConectado = true;

    /* a lista precisa de um ancoradouro com position:relative */
    var wrap = document.createElement("div");
    wrap.className = "cid-campo-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    var sug = document.createElement("div");
    sug.className = "cid-sug";
    sug.hidden = true;
    wrap.appendChild(sug);

    if (!input.getAttribute("placeholder") || /digite ou escolha/i.test(input.getAttribute("placeholder"))) {
      input.setAttribute("placeholder", "código ou nome da doença");
    }
    input.setAttribute("autocomplete", "off");

    var itens = [];
    var foco = -1;
    var debounce = null;

    function fechar() {
      sug.hidden = true;
      foco = -1;
    }

    function escolher(item) {
      input.value = item.codigo;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      if (typeof pedido.aoEscolher === "function") pedido.aoEscolher(item.codigo, item.descricao);
      fechar();
    }

    function marcar(novo) {
      var linhas = sug.querySelectorAll(".cid-sug-item");
      if (!linhas.length) return;
      if (linhas[foco]) linhas[foco].classList.remove("cid-sug-focado");
      foco = Math.min(Math.max(novo, 0), linhas.length - 1);
      linhas[foco].classList.add("cid-sug-focado");
      linhas[foco].scrollIntoView({ block: "nearest" });
    }

    function abrirCom(termo) {
      var texto = String(termo || "").trim();
      if (texto.length < 2) {
        fechar();
        return;
      }

      var r = raiz.MeedsSuiteBusca.buscar(texto, garantirIndice(), {
        sinonimos: SINONIMOS,
        limite: MAX_SUGESTOES,
        config: { PESO_SINONIMO: 2.2 },
      });
      itens = r.itens;
      foco = -1;

      if (!itens.length) {
        sug.innerHTML = '<div class="cid-sug-vazio">Nenhum CID encontrado para “' + escapeHtml(texto) + '”.</div>';
        sug.hidden = false;
        return;
      }

      sug.innerHTML =
        itens
          .map(function (it, i) {
            return (
              '<div class="cid-sug-item" data-i="' + i + '">' +
              '<span class="cid-sug-cod">' + escapeHtml(it.codigo) + "</span>" +
              '<span class="cid-sug-desc">' + escapeHtml(it.descricao) + "</span>" +
              "</div>"
            );
          })
          .join("") +
        (r.total > itens.length
          ? '<div class="cid-sug-rodape">' + r.total.toLocaleString("pt-BR") +
            " encontrados — escreva mais para refinar</div>"
          : "");

      sug.querySelectorAll(".cid-sug-item").forEach(function (linha) {
        // mousedown, e nao click: o clique perderia para o blur do campo
        linha.addEventListener("mousedown", function (ev) {
          ev.preventDefault();
          escolher(itens[Number(linha.getAttribute("data-i"))]);
        });
      });
      sug.hidden = false;
    }

    input.addEventListener("input", function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () {
        abrirCom(input.value);
      }, 180);
    });
    input.addEventListener("focus", function () {
      if (input.value.trim().length >= 2) abrirCom(input.value);
    });
    input.addEventListener("blur", function () {
      setTimeout(fechar, 120);
    });
    input.addEventListener("keydown", function (ev) {
      if (sug.hidden) return;
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        marcar(foco + 1);
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        marcar(foco - 1);
      } else if (ev.key === "Enter") {
        if (itens.length) {
          ev.preventDefault();
          escolher(itens[foco >= 0 ? foco : 0]);
        }
      } else if (ev.key === "Escape") {
        fechar();
      }
    });

    camposConectados.push({ input: input, wrap: wrap, sug: sug });
    return true;
  }

  raiz.MeedsSuite.registerModule({
    id: "cid10",
    nome: "Busca de CID-10 nos laudos",
    descricao:
      "Liga a tabela completa da CID-10 ao campo CID dos laudos: digite o código ou o nome da doença e escolha na própria linha do formulário.",
    versao: "1.1.0",
    configPadrao: {},

    /* SEM BOTAO NO DOCK, de proposito.
     * Este modulo nao tem tela propria: ele existe para atender o campo
     * de CID dos laudos. Um botao aqui abriria um segundo caminho para a
     * mesma coisa — foi o que confundiu na v2.8.0, com a janela autonoma
     * competindo com o autocomplete do proprio campo.
     * O contrato aceita botao: null justamente para isto. */
    botao: null,

    assinaturasRede: [],

    start: function (deps) {
      d = deps;
      aplicarBase(raiz.MEEDS_CID10_FALLBACK || {}, false);
      estiloCampos = d.dock.adicionarEstilo(CSS_CAMPO);

      /* Um laudo anuncia o campo de CID dele e diz o que fazer com a
       * escolha. Devolver true e o que diz "conectei". */
      deps.assinarEvento("cid:conectar-campo", function (pedido) {
        return conectarCampo(pedido);
      });

      /* Os laudos que subiram ANTES deste modulo ja anunciaram os campos
       * e nao encontraram ninguem escutando. Este aviso faz cada um deles
       * anunciar de novo. */
      deps.publicarEvento("cid:pronto", {});

      buscarBaseCompleta();
    },

    stop: function () {
      /* Desligar o modulo tem que devolver os campos ao estado original:
       * o formulario do laudo continua ali, e o campo tem que voltar a
       * ser texto livre. */
      camposConectados.forEach(function (c) {
        try {
          c.wrap.parentNode.insertBefore(c.input, c.wrap);
          c.wrap.parentNode.removeChild(c.wrap);
          delete c.input.__cidConectado;
        } catch (e) {}
      });
      camposConectados = [];
      if (estiloCampos && estiloCampos.parentNode) estiloCampos.parentNode.removeChild(estiloCampos);
      estiloCampos = null;
      indice = null;
      d = null;
    },
  });
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
