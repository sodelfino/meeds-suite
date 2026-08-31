/* ------------------------------------------------------------------
 * modules/remume/index.js
 * Origem: sodelfino/meeds-remume-assistant -> meeds-remume-assistant.user.js v1.7.4
 * ------------------------------------------------------------------
 * O QUE MUDOU NA MIGRACAO (e o que NAO mudou)
 *  - REMOVIDO daqui: trava de frame, deteccao de login, patch proprio de
 *    fetch/XHR, o POSICAO_BOTAO (bottom:224px / right:80px) e o loop
 *    proprio de recheque de login. Tudo isso e do nucleo agora.
 *  - PRESERVADO sem alteracao de comportamento: o motor de busca inteiro
 *    (normalizacao, tokenizacao, equivalencia fonetica, Levenshtein com
 *    distancia absoluta maxima, sinonimos por FRASE exigindo casamento
 *    exato, indice por cidade em cache, dica de "termo reconhecido"),
 *    a deteccao de municipio pela API com os quatro formatos de payload,
 *    a deteccao por DOM que RECUSA escolher quando acha mais de um
 *    municipio, o selo de "Local de acesso", a navegacao por teclado, o
 *    botao de copiar com fallback e a atualizacao remota do remumes.json
 *    com validacao de formato e fallback embutido.
 *  - A logica de busca abaixo foi extraida do arquivo original em vez de
 *    reescrita, justamente para nao perder nenhuma das correcoes finas
 *    que ela ja carrega (ex: "novalgina" x "valina", "buscopan" x
 *    "escetamina", a letra "b" de "complexo_b" batendo em tudo).
 *
 * PRIVACIDADE: o JSON do atendimento fica so em memoria; nada de
 * paciente e gravado nem enviado para fora.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  /* Base de dados: comeca no fallback embutido (gerado por
   * scripts/sync-fallback.js) e e substituida pela versao remota assim
   * que a pagina carrega, se a busca der certo. */
  var REMUMES = JSON.parse(JSON.stringify(raiz.MEEDS_REMUMES_FALLBACK || { _meta: {} }));

  var REMUMES_URL =
    "https://raw.githubusercontent.com/sodelfino/meeds-suite/main/modules/remume/remumes.json";

  var d = null;        // deps do nucleo
  var refs = null;     // referencias da UI
  var overlay = null;
  var timers = [];
  var atendimentoAtual = null;   // ultimo JSON de /api/v1/Atendimento/{id}
  var municipioDetectado = null; // chave de REMUMES inferida da API/DOM

  /* ----------------------------------------------------------------
   * HELPERS DE TEXTO — normalizarTexto e tokenizarTexto agora vem do
   * dom-reader do nucleo (mesma implementacao), o resto e local.
   * ---------------------------------------------------------------- */
  function normalizarTexto(str) {
    return raiz.MeedsSuiteDom.normalizarTexto(str);
  }

  function tokenizarTexto(str) {
    return normalizarTexto(str)
      .split(/[\s,;.\-()]+/)
      .filter(function (t) { return t.length > 0; });
  }

  // "_meta" e chave reservada (nao e municipio): quem itera "os
  // municipios cadastrados" tem que ignora-la, sempre via esta funcao.
  function chavesMunicipios(objeto) {
    return Object.keys(objeto).filter(function (chave) { return chave !== "_meta"; });
  }
  /* ---- motor de busca (extraido do original, sem alteracao) ---- */




const PREFIXOS_INSTITUCIONAIS = [
    "prefeitura municipal de ",
    "prefeitura de ",
    "municipio de ",
    "fundacao municipal de saude de ",
    "secretaria municipal de saude de ",
    "secretaria de saude de ",
  ];

function extrairNomeCidade(razaoSocialNome) {
    if (!razaoSocialNome) return null;
    let nome = normalizarTexto(razaoSocialNome);
    for (const prefixo of PREFIXOS_INSTITUCIONAIS) {
      if (nome.startsWith(prefixo)) {
        nome = nome.slice(prefixo.length);
        break;
      }
    }
    return nome.trim();
  }

function detectarMunicipioDoAtendimento(atendimento) {
    if (!atendimento || typeof atendimento !== "object") return null;

    const candidatos = [];

    // formato mais comum: atendimento.cliente = { razaoSocialNome }
    if (atendimento.cliente && atendimento.cliente.razaoSocialNome) {
      candidatos.push(atendimento.cliente.razaoSocialNome);
    }

    // paciente.cliente = { razaoSocialNome }
    if (atendimento.paciente && atendimento.paciente.cliente && atendimento.paciente.cliente.razaoSocialNome) {
      candidatos.push(atendimento.paciente.cliente.razaoSocialNome);
    }

    // atendimento.clienteId + lista atendimento.clientes[]
    if (atendimento.clienteId && Array.isArray(atendimento.clientes)) {
      const match = atendimento.clientes.find((c) => c && c.id === atendimento.clienteId);
      if (match && match.razaoSocialNome) candidatos.push(match.razaoSocialNome);
    }

    // fallback: lista de clientes com um unico item
    if (Array.isArray(atendimento.clientes) && atendimento.clientes.length === 1) {
      const unico = atendimento.clientes[0];
      if (unico && unico.razaoSocialNome) candidatos.push(unico.razaoSocialNome);
    }

    for (const candidato of candidatos) {
      const nomeCidade = extrairNomeCidade(candidato);
      const chave = encontrarMunicipioNaBase(nomeCidade);
      if (chave) return chave;
    }

    return null;
  }

function separarLocalAcesso(texto) {
    const idx = texto.lastIndexOf(MARCADOR_LOCAL);
    if (idx === -1) return { nome: texto, local: null };
    const nome = texto.slice(0, idx).trim();
    let local = texto.slice(idx + MARCADOR_LOCAL.length).trim();
    if (local.endsWith(")")) local = local.slice(0, -1).trim();
    if (!nome || !local) return { nome: texto, local: null };
    return { nome, local };
  }

function normalizarItemRemume(item) {
    if (typeof item === "string") return separarLocalAcesso(item);
    if (item && typeof item === "object") {
      return { nome: item.nome || "", local: item.local || null };
    }
    return { nome: String(item), local: null };
  }

const FORMAS_FARMACEUTICAS_RX = new RegExp(
    "\\b(" +
      [
        "comprimido", "revestido", "dispersivel", "mastigavel", "sublingual",
        "capsula", "dragea", "drageia",
        "solucao", "suspensao", "xarope", "elixir", "emulsao",
        "pomada", "creme", "gel", "locao",
        "spray", "aerossol", "po", "granulado", "sache",
        "adesivo", "transdermico",
        "ampola", "frasco", "injetavel", "gotas",
        "supositorio", "ovulo", "colirio",
        "caneta", "liofilizado", "inalante", "nasal",
        "oftalmica", "dermatologica", "vaginal", "retal",
      ].join("|") +
      ")\\b"
  );;

function extrairPrincipioAtivo(nome) {
    const nomeNormalizado = normalizarTexto(nome);
    const idxDigito = nomeNormalizado.search(/\d/);
    const matchForma = nomeNormalizado.match(FORMAS_FARMACEUTICAS_RX);
    const idxForma = matchForma ? matchForma.index : -1;
    const candidatos = [idxDigito, idxForma].filter((i) => i >= 0);
    if (candidatos.length === 0) return nome.trim();
    // remocao de acento via NFD preserva a contagem de caracteres 1:1 com
    // o original, entao o mesmo indice serve pra cortar a string ORIGINAL
    // sem perder a acentuacao no texto exibido ao medico.
    const idx = Math.min(...candidatos);
    const principio = nome.slice(0, idx).trim().replace(/[\s,;:\-]+$/, "").trim();
    return normalizarTexto(principio).length >= 3 ? principio : nome.trim();
  }

/* ------------------------------------------------------------------
   * TRADUTOR DE MARCA -> PRINCIPIO ATIVO
   * ------------------------------------------------------------------
   * REGRA DE OURO: esta tabela NUNCA e fonte de medicamento. A REMUME do
   * municipio e a unica fonte de verdade. A tabela so traduz o que o
   * medico digitou ("Tylenol") para o nome que se procura DENTRO da
   * lista ("Paracetamol"). Se o principio ativo traduzido nao estiver na
   * REMUME daquele municipio, o Assistente diz que nao consta e NAO
   * oferece o item — em hipotese nenhuma um resultado vem daqui.
   *
   * O conteudo vem de dados/marcas-medicamentos.json, editavel pelo
   * administrador sem tocar em codigo. */
  var MARCAS = (raiz.MEEDS_MARCAS && raiz.MEEDS_MARCAS.marcas) || [];

  /* Indice de busca das MARCAS (nao dos medicamentos): serve so para
   * reconhecer o nome comercial digitado, inclusive com erro leve. */
  var _indiceMarcas = null;

  function indiceDeMarcas() {
    if (!_indiceMarcas) {
      _indiceMarcas = raiz.MeedsSuiteBusca.criarIndice(MARCAS, function (m) {
        return m.marca;
      });
    }
    return _indiceMarcas;
  }

  /* Devolve { marca, principioAtivo } quando o que foi digitado e um nome
   * comercial reconhecido. Exige casamento exato ou erro leve NO NOME DA
   * MARCA — nao vale aproximar marca por fonetica, que abriria espaco
   * para traduzir para o farmaco errado. */
  function traduzirMarca(termo) {
    var alvo = normalizarTexto(termo);
    if (!alvo) return null;

    for (var i = 0; i < MARCAS.length; i++) {
      if (normalizarTexto(MARCAS[i].marca) === alvo) return MARCAS[i];
    }

    var r = raiz.MeedsSuiteBusca.buscar(termo, indiceDeMarcas(), {
      limite: 1,
      fonetica: false, // ver comentario acima
    });
    return r.melhor || null;
  }


const CONFIG_BUSCA = {
    LIMITE_RESULTADOS: 80,
    LIMIAR_FUZZY: 0.6,
    BONUS_COMECA_COM: 0.2,
    // tamanho minimo do termo digitado para exibir a dica de "termo
    // reconhecido" — abaixo disso o fuzzy fica ruidoso demais pra avisar
    // com confianca que houve correcao.
    MIN_LEN_DICA_TERMO: 4,
  };




function buscarMedicamentos(termo, cidade) {
    /* PIPELINE
     *   1. o que foi digitado e um nome comercial? -> traduz para o
     *      principio ativo e passa a procurar POR ELE;
     *   2. busca dentro da REMUME do municipio (camada exata/parecida e,
     *      se nada aparecer, fonetica);
     *   3. se a marca foi reconhecida mas o principio ativo nao esta na
     *      lista, devolve "nao consta" — sem oferecer nada.
     *
     * Em nenhum ponto um item entra no resultado vindo da tabela de
     * marcas: ela so muda O QUE se procura, nunca ONDE. */
    var indice = obterIndiceBusca(cidade);
    var marca = traduzirMarca(termo);
    var termoDeBusca = marca ? marca.principioAtivo : termo;

    var r = raiz.MeedsSuiteBusca.buscar(termoDeBusca, indice, {
      limite: CONFIG_BUSCA.LIMITE_RESULTADOS,
      config: CONFIG_BUSCA,
    });

    /* Marca reconhecida e principio ativo ausente da REMUME deste
     * municipio: e o caso do "Tylenol em municipio que so tem dipirona".
     * O medico precisa saber que nao ha — e nao ver uma lista vazia sem
     * explicacao, nem (pior) um item que nao existe na lista. */
    if (marca && r.itens.length === 0) {
      return {
        itens: [],
        termoReconhecido: null,
        marca: marca,
        naoConsta: true,
      };
    }

    var termoReconhecido = null;
    if (!marca && r.melhor && (r.viaFuzzy || r.viaFonetica)) {
      var principioAtivo = extrairPrincipioAtivo(r.melhor.nome);
      if (
        principioAtivo &&
        normalizarTexto(principioAtivo) !== normalizarTexto(termo) &&
        normalizarTexto(termo).length >= CONFIG_BUSCA.MIN_LEN_DICA_TERMO
      ) {
        termoReconhecido = principioAtivo;
      }
    }

    return {
      itens: r.itens.map(function (x) {
        return { nome: x.nome, local: x.local };
      }),
      termoReconhecido: termoReconhecido,
      marca: marca,
      naoConsta: false,
      viaFonetica: r.viaFonetica,
    };
  }

function destacarTrecho(texto, termoOriginal) {
    if (!termoOriginal) return escapeHtml(texto);
    const normTexto = normalizarTexto(texto);
    const normTermo = normalizarTexto(termoOriginal);
    const idx = normTexto.indexOf(normTermo);
    if (idx === -1) return escapeHtml(texto);
    const antes = texto.slice(0, idx);
    const meio = texto.slice(idx, idx + termoOriginal.length);
    const depois = texto.slice(idx + termoOriginal.length);
    return `${escapeHtml(antes)}<mark>${escapeHtml(meio)}</mark>${escapeHtml(depois)}`;
  }

function copiarParaAreaDeTransferencia(texto, botao) {
    const marcarSucesso = () => {
      const original = botao.textContent;
      botao.textContent = "✅"; // check
      botao.disabled = true;
      setTimeout(() => {
        botao.textContent = original;
        botao.disabled = false;
      }, 1200);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(marcarSucesso).catch(() => {
        copiarComFallback(texto, marcarSucesso);
      });
    } else {
      copiarComFallback(texto, marcarSucesso);
    }
  }

function copiarComFallback(texto, callback) {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = texto;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      callback();
    } catch (e) {
      /* silencioso */
    }
  }

function moverFocoResultado(delta) {
    if (itensRenderizados.length === 0) return;
    const anterior = itensRenderizados[indiceFocado];
    if (anterior) anterior.li.classList.remove("rm-focado");

    indiceFocado = Math.min(Math.max(indiceFocado + delta, 0), itensRenderizados.length - 1);

    const atual = itensRenderizados[indiceFocado];
    if (atual) {
      atual.li.classList.add("rm-focado");
      atual.li.scrollIntoView({ block: "nearest" });
    }
  }
  /* ---- constantes auxiliares usadas pelo motor acima ---- */
  var MARCADOR_LOCAL = "(Local de acesso:";

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function encontrarMunicipioNaBase(nomeCidadeNormalizado) {
    if (!nomeCidadeNormalizado) return null;
    var chaves = chavesMunicipios(REMUMES);
    for (var i = 0; i < chaves.length; i++) {
      if (normalizarTexto(chaves[i]) === nomeCidadeNormalizado) return chaves[i];
    }
    return null;
  }

  /* Sinal independente da API: varre o texto da pagina procurando nomes
   * de municipios conhecidos. O medico atende uma fila multi-tenant, entao
   * mais de um nome pode aparecer ao mesmo tempo (ex: lista de clientes do
   * proprio medico). Nesse caso e mais seguro NAO escolher nenhum do que
   * arriscar o municipio errado — o medico sempre pode selecionar na mao.
   * A regra "so decide se for unico" agora vem do decision-engine. */
  function detectarMunicipioNoDOM() {
    try {
      var textoPagina = raiz.MeedsSuiteDom.textoDaPaginaNormalizado();
      if (!textoPagina) return null;
      var encontrados = chavesMunicipios(REMUMES).filter(function (chave) {
        return textoPagina.indexOf(normalizarTexto(chave)) !== -1;
      });
      return raiz.MeedsSuiteDecisao.unicoOuNada(encontrados);
    } catch (e) {
      return null;
    }
  }

  /* ---- indice de busca por municipio (tokens pre-calculados) ----
   * Recalculado sozinho sempre que o array daquela cidade muda (ex:
   * depois da busca remota substituir os dados). A comparacao e por
   * IDENTIDADE do array, nao por conteudo — barata e suficiente. */
  var _indiceBuscaPorCidade = new Map();

  function obterIndiceBusca(cidade) {
    var lista = REMUMES[cidade] || [];
    var cacheado = _indiceBuscaPorCidade.get(cidade);
    if (cacheado && cacheado.origem === lista) return cacheado.indice;

    // normaliza os itens; o texto pesquisavel inclui o local de acesso,
    // para o medico poder digitar "HPM" e achar o que esta disponivel la
    var itens = lista.map(normalizarItemRemume);
    var indice = raiz.MeedsSuiteBusca.criarIndice(itens, function (item) {
      return item.local ? item.nome + " " + item.local : item.nome;
    });

    _indiceBuscaPorCidade.set(cidade, { origem: lista, indice: indice });
    return indice;
  }

  /* ---- estado da navegacao por teclado ---- */
  var itensRenderizados = [];
  var indiceFocado = -1;

  /* ----------------------------------------------------------------
   * ATUALIZACAO REMOTA DA BASE
   * Busca a lista mais atual de um JSON hospedado. NAO envolve dado de
   * paciente — e so a lista publica de medicamentos por municipio, o
   * mesmo tipo de dado que ja estava embutido. Quem mantem o link
   * atualiza as REMUMEs sem redistribuir o script. Se falhar por
   * qualquer razao, segue com a copia embutida.
   * ---------------------------------------------------------------- */
  function validarFormatoRemumes(dados) {
    if (!dados || typeof dados !== "object" || Array.isArray(dados)) return false;
    var chaves = chavesMunicipios(dados);
    if (chaves.length === 0) return false;
    return chaves.every(function (chave) {
      return Array.isArray(dados[chave]);
    });
  }

  function atualizarRemumesRemoto() {
    return fetch(REMUMES_URL, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (dadosRemotos) {
        if (!dadosRemotos) return false;
        if (!validarFormatoRemumes(dadosRemotos)) {
          console.warn("[Assistente REMUME] JSON remoto com formato inesperado, mantendo copia local.");
          return false;
        }
        Object.keys(REMUMES).forEach(function (chave) {
          delete REMUMES[chave];
        });
        Object.assign(REMUMES, dadosRemotos);
        _indiceBuscaPorCidade.clear();
        reconstruirOpcoesMunicipio();
        return true;
      })
      .catch(function (e) {
        console.warn("[Assistente REMUME] nao foi possivel buscar a lista remota, usando copia local.", e);
        return false;
      });
  }

  /* ----------------------------------------------------------------
   * DETECCAO DE MUNICIPIO (rede + DOM)
   * ---------------------------------------------------------------- */
  function aplicarNovoMunicipioDetectado(municipio) {
    if (!municipio || municipio === municipioDetectado) return;
    municipioDetectado = municipio;
    atualizarUIComMunicipio(municipio);
  }

  function processarRespostaAtendimento(dadosJson) {
    try {
      atendimentoAtual = dadosJson;
      var municipio = detectarMunicipioDoAtendimento(dadosJson) || detectarMunicipioNoDOM();
      aplicarNovoMunicipioDetectado(municipio);
    } catch (e) {
      /* silencioso: nunca deve quebrar a pagina do Meeds */
    }
  }

  /* O Meeds e uma SPA: ao trocar de paciente nem sempre refaz a chamada
   * GET /api/v1/Atendimento/{id} (pode atualizar via WebSocket ou
   * reaproveitar dados carregados). Sem esta varredura periodica, o
   * municipio detectado travava no primeiro paciente do plantao. */
  function tentarAtualizarMunicipioViaDOM() {
    aplicarNovoMunicipioDetectado(detectarMunicipioNoDOM());
  }

  /* ----------------------------------------------------------------
   * UI — o overlay vem posicionado do dock; aqui so o conteudo.
   * ---------------------------------------------------------------- */
  var CSS = [
    ".rm-modal { width:100%; max-width:640px; max-height:86vh; background:#fff; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.35); display:flex; flex-direction:column; overflow:hidden; }",
    ".rm-modal header { background:linear-gradient(135deg,#123a7a,#1a56ad); color:#fff; padding:15px 18px; display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }",
    ".rm-modal header h2 { margin:0; font-size:15px; font-weight:700; }",
    ".rm-sub { margin:3px 0 0; font-size:11.5px; opacity:.9; }",
    ".rm-meta { margin:2px 0 0; font-size:10.5px; opacity:.75; }",
    ".rm-meta[hidden] { display:none; }",
    ".rm-fechar { background:rgba(255,255,255,.2); border:none; color:#fff; width:28px; height:28px; border-radius:50%; cursor:pointer; font-size:14px; flex-shrink:0; }",
    ".rm-fechar:hover { background:rgba(255,255,255,.34); }",
    ".rm-body { padding:14px 18px 16px; display:flex; flex-direction:column; gap:10px; min-height:0; flex:1; }",
    ".rm-body label { display:block; font-size:10.5px; font-weight:700; color:#5b6c68; margin-bottom:4px; }",
    ".rm-body select, .rm-body input { width:100%; padding:8px 10px; border:1px solid #d8e6e3; border-radius:8px; font-size:13px; color:#16221f; }",
    ".rm-hint { font-size:11.5px; color:#a15c00; background:#fff4e2; padding:7px 10px; border-radius:7px; }",
    ".rm-hint[hidden] { display:none; }",
    ".rm-hint-alerta { color:#8a2020; background:#fde8e8; border:1px solid #f0b8b8; font-weight:600; }",
    ".rm-count { font-size:11px; color:#5b6c68; }",
    ".rm-results { list-style:none; margin:0; padding:0; overflow-y:auto; flex:1; min-height:120px; border-top:1px solid #eef2f6; }",
    ".rm-results li { display:flex; align-items:center; gap:10px; padding:8px 4px; border-bottom:1px solid #f1f5f9; font-size:12.5px; line-height:1.45; }",
    ".rm-results li.rm-focado { background:#e3f5f3; }",
    ".rm-item-main { flex:1; min-width:0; }",
    ".rm-item-text mark { background:#fde68a; padding:0 1px; border-radius:2px; }",
    ".rm-local { display:inline-block; margin-left:6px; font-size:10.5px; color:#0e7a70; background:#e3f5f3; padding:1px 6px; border-radius:999px; white-space:nowrap; }",
    ".rm-copiar { background:none; border:1px solid #d8e6e3; border-radius:7px; cursor:pointer; font-size:13px; padding:4px 8px; flex-shrink:0; }",
    ".rm-copiar:hover { background:#e3f5f3; }",
    ".rm-vazio { color:#8a97a4; font-style:italic; padding:14px 4px; }",
  ].join("\n");

  function montarUI() {
    overlay = d.dock.criarOverlay({
      estilo: CSS,
      html:
        '<div class="rm-modal" role="dialog" aria-modal="true" aria-labelledby="rm-title">' +
        "  <header><div>" +
        '    <h2 id="rm-title">Consulta REMUME</h2>' +
        '    <p class="rm-sub" id="rm-sub">Municipio nao identificado ainda</p>' +
        '    <p class="rm-meta" id="rm-meta" hidden></p>' +
        "  </div>" +
        '  <button type="button" class="rm-fechar" aria-label="Fechar">&#10005;</button></header>' +
        '  <div class="rm-body">' +
        '    <div><label for="rm-select">Municipio</label><select id="rm-select"></select></div>' +
        '    <div><label for="rm-search">Buscar principio ativo / medicamento</label>' +
        '      <input id="rm-search" type="text" placeholder="Ex: amoxicilina" autocomplete="off" /></div>' +
        '    <div class="rm-hint" id="rm-hint" hidden></div>' +
        '    <div class="rm-count" id="rm-count"></div>' +
        '    <ul class="rm-results" id="rm-results"></ul>' +
        "  </div>" +
        "</div>",
    });

    refs = {
      sub: overlay.$("#rm-sub"),
      meta: overlay.$("#rm-meta"),
      select: overlay.$("#rm-select"),
      search: overlay.$("#rm-search"),
      hint: overlay.$("#rm-hint"),
      count: overlay.$("#rm-count"),
      results: overlay.$("#rm-results"),
    };

    overlay.$(".rm-fechar").addEventListener("click", overlay.fechar);

    var debounceBusca = null;
    refs.select.addEventListener("change", renderizarResultados);
    refs.search.addEventListener("input", function () {
      clearTimeout(debounceBusca);
      debounceBusca = setTimeout(renderizarResultados, 200);
    });

    // navegacao por teclado: setas percorrem os resultados, Enter copia
    // o item focado (ou o primeiro, se nenhum foi percorrido ainda).
    refs.search.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        moverFocoResultado(1);
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        moverFocoResultado(-1);
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        var alvo = itensRenderizados[indiceFocado] || itensRenderizados[0];
        if (alvo) alvo.botaoCopiar.click();
      }
    });

    reconstruirOpcoesMunicipio();
  }

  function reconstruirOpcoesMunicipio() {
    if (!refs || !refs.select) return;
    var valorAnterior = refs.select.value;
    refs.select.innerHTML = "";
    chavesMunicipios(REMUMES)
      .sort(function (a, b) {
        return a.localeCompare(b, "pt-BR");
      })
      .forEach(function (cidade) {
        var opt = document.createElement("option");
        opt.value = cidade;
        opt.textContent = cidade;
        refs.select.appendChild(opt);
      });

    if (valorAnterior && REMUMES[valorAnterior]) refs.select.value = valorAnterior;
    else if (municipioDetectado && REMUMES[municipioDetectado]) refs.select.value = municipioDetectado;

    atualizarExibicaoMeta();
    if (overlay.estaAberto()) renderizarResultados();
  }

  function atualizarExibicaoMeta() {
    if (!refs || !refs.meta) return;
    var meta = REMUMES._meta;
    if (meta && meta.atualizadoEm) {
      refs.meta.hidden = false;
      refs.meta.textContent = "Dados atualizados em " + meta.atualizadoEm;
    } else {
      refs.meta.hidden = true;
      refs.meta.textContent = "";
    }
  }

  function atualizarUIComMunicipio(municipio) {
    if (!refs) return;
    refs.sub.textContent = "Atendimento em: " + municipio;
    // so muda a selecao automaticamente se o modal ainda nao foi mexido
    if (!overlay.estaAberto()) refs.select.value = municipio;
  }

  function abrirModal() {
    // reconfirma o municipio na hora de abrir; nao confia so no ultimo
    // valor que a interceptacao de rede capturou (pode estar velho)
    tentarAtualizarMunicipioViaDOM();
    if (municipioDetectado && REMUMES[municipioDetectado]) refs.select.value = municipioDetectado;
    overlay.abrir();
    renderizarResultados();
    setTimeout(function () {
      refs.search.focus();
    }, 50);
  }

  function renderizarResultados() {
    if (!refs) return;
    var cidade = refs.select.value;
    var lista = REMUMES[cidade] || [];
    var termo = refs.search.value.trim();
    var termoNormalizado = normalizarTexto(termo);

    var resultado = termoNormalizado
      ? buscarMedicamentos(termo, cidade)
      : { itens: lista.map(normalizarItemRemume), termoReconhecido: null };
    var filtrados = resultado.itens;

    refs.count.textContent = termo
      ? filtrados.length + " de " + lista.length + " medicamento(s)"
      : lista.length + " medicamento(s) na REMUME de " + cidade;

    /* Tres avisos possiveis, nesta ordem de prioridade:
     *   - a marca foi reconhecida mas o farmaco NAO esta na REMUME;
     *   - a marca foi reconhecida e traduzida (mostra de onde veio);
     *   - a busca precisou corrigir o que foi digitado. */
    refs.hint.hidden = false;
    if (resultado.naoConsta) {
      refs.hint.className = "rm-hint rm-hint-alerta";
      refs.hint.textContent =
        resultado.marca.marca + " (" + resultado.marca.principioAtivo +
        ") não consta na REMUME deste município.";
    } else if (resultado.marca) {
      refs.hint.className = "rm-hint";
      refs.hint.textContent =
        "Mostrando " + resultado.marca.principioAtivo +
        " — princípio ativo de " + resultado.marca.marca + ".";
    } else if (resultado.termoReconhecido) {
      refs.hint.className = "rm-hint";
      refs.hint.textContent = 'Mostrando resultados para "' + resultado.termoReconhecido + '"';
    } else {
      refs.hint.hidden = true;
      refs.hint.className = "rm-hint";
      refs.hint.textContent = "";
    }

    refs.results.innerHTML = "";
    itensRenderizados = [];
    indiceFocado = -1;

    if (filtrados.length === 0) {
      var vazio = document.createElement("li");
      vazio.className = "rm-vazio";
      vazio.textContent = resultado.naoConsta
        ? "Este município não padroniza esse medicamento. Considere uma alternativa que esteja na lista."
        : termo
        ? 'Nenhum medicamento encontrado para "' + termo + '".'
        : "Nenhum medicamento cadastrado para este município.";
      refs.results.appendChild(vazio);
      return;
    }

    var fragment = document.createDocumentFragment();
    filtrados.slice(0, 300).forEach(function (par) {
      var li = document.createElement("li");

      var principal = document.createElement("div");
      principal.className = "rm-item-main";

      var textoSpan = document.createElement("span");
      textoSpan.className = "rm-item-text";
      textoSpan.innerHTML = destacarTrecho(par.nome, termo);
      principal.appendChild(textoSpan);

      // so sinaliza o local de acesso quando o municipio informa esse
      // dado na fonte; sem o dado nao ha nada a indicar
      if (par.local) {
        var localSpan = document.createElement("span");
        localSpan.className = "rm-local";
        localSpan.title = "Local de acesso informado pelo municipio";
        localSpan.textContent = "\u{1F4CD} " + par.local;
        principal.appendChild(localSpan);
      }
      li.appendChild(principal);

      var botaoCopiar = document.createElement("button");
      botaoCopiar.type = "button";
      botaoCopiar.className = "rm-copiar";
      botaoCopiar.title = "Copiar nome do medicamento";
      botaoCopiar.textContent = "\u{1F4CB}";
      // copia SO o nome (sem o sufixo de local): o local e sinal visual
      // pro medico, nao faz parte do que ele cola na prescricao
      botaoCopiar.addEventListener("click", function () {
        copiarParaAreaDeTransferencia(par.nome, botaoCopiar);
      });
      li.appendChild(botaoCopiar);

      itensRenderizados.push({ li: li, botaoCopiar: botaoCopiar });
      fragment.appendChild(li);
    });
    refs.results.appendChild(fragment);
  }

  /* ----------------------------------------------------------------
   * CONTRATO DE MODULO
   * ---------------------------------------------------------------- */
  raiz.MeedsSuite.registerModule({
    id: "remume",
    nome: "Assistente REMUME",
    descricao:
      "Consulta a relacao municipal de medicamentos do municipio do atendimento, com busca tolerante a erro de digitacao e a nome comercial.",
    versao: "2.0.1",
    configPadrao: {},

    botao: {
      icone: "\u{1F48A}",
      variante: "icone",
      titulo: "Consultar REMUME",
      prioridade: 50,
    },

    assinaturasRede: [{ regex: /\/api\/v1\/Atendimento\/[^/?]+(?:[?#].*)?$/i, metodos: ["GET"] }],

    aoCargaRede: function (evt) {
      if (evt.status !== 200) return;
      var json = evt.json();
      if (json) processarRespostaAtendimento(json);
    },

    start: function (deps) {
      d = deps;
      montarUI();
      deps.aoClicarBotao(abrirModal);
      atualizarRemumesRemoto();
      tentarAtualizarMunicipioViaDOM();
      timers.push(setInterval(tentarAtualizarMunicipioViaDOM, 1500));
    },

    stop: function () {
      timers.forEach(clearInterval);
      timers = [];
      if (overlay) {
        overlay.remover();
        overlay = null;
      }
      refs = null;
      itensRenderizados = [];
      indiceFocado = -1;
      atendimentoAtual = null;
      municipioDetectado = null;
      d = null;
    },
  });

  void atendimentoAtual; // guardado so em memoria, para depuracao no console
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
