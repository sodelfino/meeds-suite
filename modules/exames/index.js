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
 *   Betim      1.983 exames laboratoriais COM codigo do contrato.
 *              Sem local (o contrato nao diz onde), sem sigla.
 *   Macae         94 exames de duas fontes: 28 da UPA Barra (COM local,
 *              SEM codigo) e 66 por especialidade da SEMUSA (COM
 *              especialidade e, em parte, canalEncaminhamento — tambem
 *              sem codigo, nenhuma das duas fontes traz).
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
    /* Quantos itens entram na tela por vez. A lista de Betim tem 1.983:
     * desenhar tudo de uma vez trava a abertura do painel no notebook do
     * plantao, que e onde isso precisa funcionar. */
    BLOCO: 100,
    /* Abaixo de 3 letras o motor difuso devolve meia base — ele foi feito
     * para tolerar erro de digitacao, e com uma letra tudo "parece" com
     * tudo. Ate 2 letras o filtro e literal (contem o texto), que e
     * exatamente o que a pessoa espera ao digitar "he". */
    MIN_CARACTERES_DIFUSO: 3,
    /* Espera depois da ultima tecla. 200ms e o intervalo entre teclas de
     * quem digita rapido: menos que isso refiltra a lista no meio da
     * palavra, mais que isso ja parece travamento. */
    DEBOUNCE_MS: 200,
  };

  /* Adiar a execucao ate a pessoa parar de digitar.
   *
   * NAO existe um `debounce` compartilhado no nucleo — procurei em
   * core/decision-engine.js e nos demais. Cada modulo que precisou disso
   * fez o seu com setTimeout. Como sao seis linhas, repetir aqui custa
   * menos que criar uma dependencia nova entre modulo e nucleo por tao
   * pouco. */
  function adiar(fn, ms) {
    var timer = null;
    return function () {
      var args = arguments, esse = this;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        fn.apply(esse, args);
      }, ms);
    };
  }

  var d = null;              // dependencias entregues pelo nucleo
  var overlay = null;
  var refs = {};
  var municipioDetectado = null;
  var municipioEscolhido = null;
  var indicePorMunicipio = {};
  var cancelarRede = null;

  /* ------------------------------------------------------------------
   * ESTADO DA LISTA NA TELA
   * ------------------------------------------------------------------
   * `ordenados` e a lista COMPLETA do municipio, em ordem alfabetica.
   * `visiveis` sao os indices que passaram no filtro atual — quando nao
   * ha filtro, e a lista inteira. `desenhados` conta quantos ja viraram
   * elemento na tela.
   *
   * O filtro trabalha sempre sobre `ordenados`, e nao sobre o que esta
   * desenhado: um exame que ainda nao coube no primeiro bloco continua
   * encontravel. Se o filtro olhasse so a tela, buscar "zinco" numa
   * lista parada no item 100 nao acharia nada — e o medico concluiria
   * que o municipio nao oferece.
   * ------------------------------------------------------------------ */
  var ordenados = [];
  var visiveis = [];
  var desenhados = 0;

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

  /* `encaminhamentos` e uma entidade SEPARADA de exame — servico de
   * referencia (Casa da Crianca, CRA...), nao exame. Por isso vive numa
   * chave irma de `municipios` no mesmo JSON (nunca dentro de
   * `municipios[x].exames`), e tem sua propria funcao de leitura e sua
   * propria secao na tela, renderizada uma vez por municipio (nao entra
   * na busca/paginacao/ordenacao de exames). */
  function blocoDeEncaminhamentosDe(municipio) {
    return (BASE.encaminhamentos || {})[municipio] || null;
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

  /* Ordem alfabetica de gente, nao de computador.
   *
   * A comparacao byte a byte poe "ÁCIDO" depois de "ZINCO", porque o "Á"
   * tem codigo maior que qualquer letra sem acento. `localeCompare` com
   * sensitivity "base" trata A e Á como a mesma letra, e
   * `ignorePunctuation` impede que um parenteses ou uma virgula no comeco
   * jogue o item para outro lugar da lista. Numa base onde metade dos
   * nomes tem acento, a diferenca e entre uma lista navegavel e uma
   * lista aparentemente embaralhada. */
  function ordenarAlfabeticamente(lista) {
    return lista.slice().sort(function (a, b) {
      return String(a.nome).localeCompare(String(b.nome), "pt-BR", {
        sensitivity: "base",
        ignorePunctuation: true,
        numeric: true,
      });
    });
  }

  function normalizar(t) {
    return String(t == null ? "" : t)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  /* Quais itens da lista COMPLETA passam no filtro.
   *
   * Duas estrategias, escolhidas pelo tamanho do que foi digitado:
   *
   *   ate 2 letras  filtro literal (o texto aparece no nome, no codigo ou
   *                 no local), sem acento e sem caixa. Com uma letra so,
   *                 o motor difuso acharia semelhanca em quase tudo.
   *
   *   3 ou mais     o mesmo motor do REMUME e da CID-10: erro de
   *                 digitacao, fonetica do portugues, palavra inteira.
   *                 Reaproveitar significa que uma correcao de busca vale
   *                 nos tres modulos de uma vez.
   *
   * Devolve INDICES de `ordenados`, e nao os itens: e o indice que
   * permite saber se aquele item ja esta desenhado na tela. */
  function indicesQuePassam(termo) {
    var limpo = String(termo || "").trim();
    var todos = ordenados.map(function (_, i) { return i; });
    if (!limpo) return todos;

    if (limpo.length < CONFIG_BUSCA.MIN_CARACTERES_DIFUSO) {
      var alvo = normalizar(limpo);
      return todos.filter(function (i) {
        var e = ordenados[i];
        return normalizar([e.nome, e.codigo || "", e.local || ""].join(" ")).indexOf(alvo) !== -1;
      });
    }

    var r = raiz.MeedsSuiteBusca.buscar(limpo, indiceDe(municipioEscolhido), {
      /* Sem teto: o filtro cobre a lista inteira, e a paginacao e que
       * decide quanto disso vai para a tela. Cortar aqui esconderia
       * resultado legitimo sem avisar ninguem. */
      limite: ordenados.length,
    });

    /* AQUI A ORDEM MUDA, E DE PROPOSITO.
     *
     * Sem termo digitado, a lista e alfabetica: a pessoa esta
     * PERCORRENDO, e ordem alfabetica e como se acha algo percorrendo.
     *
     * Com termo digitado, ela esta PROCURANDO, e vale o ranking do
     * motor. Forcar alfabetica aqui foi um erro meu que o teste pegou:
     * buscar "acido folico" trazia "ÁCIDO 2-3 DIFOSFOGLICÉRICO" no topo,
     * porque vem antes no alfabeto — e o que a pessoa pediu ficava
     * enterrado no meio de setenta e quatro resultados. */
    var posicao = new Map();
    ordenados.forEach(function (e, i) { posicao.set(e, i); });
    var saida = [];
    (r.itens || []).forEach(function (x) {
      var i = posicao.get(x.item || x);
      if (i !== undefined) saida.push(i);
    });
    return saida;
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

    /* --- ex-enc-*: secao "Encaminhamentos / Serviços de referência" ---
     * Paleta azul (nao ambar, nao vermelha): nao e aviso de risco nem
     * de conduta sobre um exame — e informativo, uma categoria de
     * conteudo diferente das duas outras que ja usam cor. So flex,
     * nunca position:fixed/absolute — mesma regra do resto do modulo. */
    ".ex-encaminhamentos { margin:10px 18px 0; }",
    ".ex-enc-titulo { font-size:12px; font-weight:800; color:#1e3a8a; text-transform:uppercase; letter-spacing:.02em; margin-bottom:6px; }",
    ".ex-enc-nota-geral { font-size:11.5px; color:#1e3a8a; background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:6px 9px; margin-bottom:8px; line-height:1.5; }",
    ".ex-enc-lista { display:flex; flex-direction:column; gap:8px; }",
    ".ex-enc-cartao { background:#eff6ff; border:1px solid #bfdbfe; border-radius:9px; padding:9px 11px; }",
    ".ex-enc-nome { font-size:13px; font-weight:700; color:#1e3a8a; margin-bottom:4px; }",
    ".ex-enc-linha { font-size:11.5px; color:#1e40af; line-height:1.5; margin-top:3px; }",
    ".ex-enc-linha ul { margin:2px 0 0; padding-left:16px; }",
    ".ex-enc-linha li { margin:2px 0; }",
    ".ex-rolagem { overflow-y:auto; padding:8px 18px 16px; flex:1; }",
    ".ex-lista { padding:0; }",
    ".ex-item { padding:10px 0; border-bottom:1px solid #f1f5f9; display:flex; gap:10px; align-items:flex-start; }",
    ".ex-item:last-child { border-bottom:none; }",
    ".ex-item-txt { flex:1; min-width:0; }",
    ".ex-nome { font-size:13.5px; color:#0f172a; font-weight:600; line-height:1.4; }",
    ".ex-meta { font-size:11.5px; color:#64748b; margin-top:3px; display:flex; gap:10px; flex-wrap:wrap; }",
    ".ex-selo { display:inline-flex; align-items:center; gap:4px; }",
    /* Badge de especialidade: mesmo formato de `.ex-selo`, cor propria
     * (roxo suave) so para diferenciar visualmente de codigo/local, que
     * sao dado bruto — especialidade e categoria clinica. */
    ".ex-especialidade { background:#f5f3ff; color:#5b21b6; border:1px solid #ddd6fe; border-radius:999px; padding:1px 8px; }",
    /* Badge de `status: SUSPENSO` — vermelho, nao ambar: e a unica
     * marca de alerta do modulo que nao usa a paleta padrao, de
     * proposito (ver comentario em elementoDoExame()). */
    ".ex-suspenso { background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; border-radius:999px; padding:1px 8px; font-weight:700; }",
    ".ex-nota { font-size:11.5px; color:#78350f; background:#fffbeb; border:1px solid #fde68a; border-radius:7px; padding:5px 8px; margin-top:5px; line-height:1.5; }",

    /* --- ex-orientacao: bloco "⚠️ Atenção ao encaminhar" ---
     * Mesma paleta ambar de `.ex-nota`/`.ex-obs` — pedido explicito de
     * reutilizar o padrao visual, e faz sentido: e o mesmo tipo de
     * aviso (conduta antes de pedir), so que agora com estrutura.
     * SO FLEX, NUNCA position:absolute/fixed — a regra de arquitetura
     * do build proibe posicao fixa em modulo (ela existe para impedir
     * modulo de decidir sozinho onde fica botao/painel na tela); um
     * bloco dentro do proprio item da lista nunca precisa escapar do
     * fluxo normal do documento, entao a regra nunca chega a apertar
     * aqui. */
    ".ex-orientacao { display:flex; flex-direction:column; gap:6px; margin-top:6px; padding:8px 10px; background:#fffbeb; border:1px solid #fde68a; border-radius:8px; }",
    ".ex-or-titulo { font-size:11px; font-weight:800; color:#92400e; text-transform:uppercase; letter-spacing:.02em; }",
    ".ex-or-linha { display:flex; align-items:flex-start; gap:7px; font-size:11.5px; color:#78350f; line-height:1.5; }",
    /* Largura fixa no icone: sem isso, um icone mais estreito ("📝")
     * ao lado de um mais largo ("🖥️") deixa o texto das linhas
     * desalinhado verticalmente — flex sozinho nao resolve, porque o
     * proprio glifo do emoji tem largura variavel. */
    ".ex-or-icone { flex:0 0 18px; text-align:center; line-height:1.5; }",
    ".ex-or-txt { flex:1; min-width:0; }",
    ".ex-or-txt ul { margin:2px 0 0; padding-left:16px; }",
    ".ex-or-txt li { margin:2px 0; }",
    ".ex-sigla { flex-shrink:0; background:#7c3aed; color:#fff; font-size:10.5px; font-weight:800; padding:3px 8px; border-radius:999px; letter-spacing:.03em; white-space:nowrap; }",
    ".ex-copiar { flex-shrink:0; background:#f1f5f9; border:none; color:#475569; border-radius:7px; padding:6px 9px; font-size:11.5px; font-weight:700; cursor:pointer; }",
    ".ex-copiar:hover { background:#e2e8f0; }",
    ".ex-aviso { padding:22px 18px; text-align:center; color:#64748b; font-size:13px; line-height:1.6; }",
    ".ex-aviso b { color:#0f172a; }",
    ".ex-nao-consta { background:#fef2f2; border:1px solid #fecaca; color:#7f1d1d; border-radius:10px; padding:12px 14px; margin:10px 0; font-size:12.5px; line-height:1.55; }",
    ".ex-contagem { font-size:11px; color:#94a3b8; padding:6px 18px 0; }",

    /* Uma classe so para esconder, usada no lugar de mexer em
     * `style.display` item a item: com quase dois mil elementos, trocar
     * uma classe e mais barato e deixa o motivo visivel no inspetor. */
    ".oculto { display:none !important; }",

    /* A lista virou <ul>: `list-style:none` e `margin:0` desfazem o que o
     * navegador poe por padrao. O shadow root isola do CSS do Meeds, mas
     * nao do estilo padrao do proprio navegador. */
    "ul.ex-lista { list-style:none; margin:0; }",
    "li.ex-item { list-style:none; }",

    /* Sinal de que o filtro esta rodando. Fica DENTRO do campo, a
     * direita: um spinner longe do campo obriga a procurar o que mudou. */
    /* Sem `position:absolute` de proposito: a regra de arquitetura que o
     * build cobra proibe posicao fixa em modulo, e ela existe por um bom
     * motivo (impedir que modulo decida onde fica botao na tela). Dava
     * para abrir excecao — mas enfraquecer a regra por conveniencia de um
     * spinner sairia mais caro que resolver com flex.
     *
     * O resultado e o mesmo: o campo reserva espaco a direita
     * (padding-right) e a margem negativa traz o disco para dentro dele. */
    ".ex-campo { flex:1; display:flex; align-items:center; }",
    ".ex-campo input { width:100%; padding-right:32px; }",
    ".ex-spinner { width:15px; height:15px; margin-left:-24px; flex-shrink:0;",
    "  border:2px solid #cbd5e1; border-top-color:#0ea5a4; border-radius:50%;",
    "  animation:ex-girar .7s linear infinite; pointer-events:none; }",
    "@keyframes ex-girar { to { transform:rotate(360deg); } }",
    /* Quem pediu para reduzir animacao no sistema nao deve receber um
     * disco girando: o ponto vira estatico e continua indicando trabalho. */
    "@media (prefers-reduced-motion: reduce) { .ex-spinner { animation:none; border-top-color:#0ea5a4; } }",

    ".ex-mais { display:block; width:100%; margin:12px 0 4px; padding:11px; border:1px dashed #cbd5e1;",
    "  background:#f8fafc; color:#0f766e; border-radius:10px; font:inherit; font-size:12.5px;",
    "  font-weight:700; cursor:pointer; }",
    ".ex-mais:hover { background:#f1f5f9; border-color:#0ea5a4; }",
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

    pintarEncaminhamentos();
  }

  /* Secao "Encaminhamentos / Serviços de referência" — SEPARADA da
   * lista de exames: nao entra na busca, na paginacao nem na
   * ordenacao alfabetica de exames, porque nao e exame. Aparece uma
   * vez, fixa, logo abaixo do aviso de observacoes do municipio (se
   * houver) e antes da lista — hoje so Macae tem conteudo aqui; para
   * qualquer outro municipio a secao fica oculta. */
  function pintarEncaminhamentos() {
    var enc = blocoDeEncaminhamentosDe(municipioEscolhido);
    if (!enc || !enc.servicos || !enc.servicos.length) {
      refs.encaminhamentos.hidden = true;
      refs.encaminhamentos.innerHTML = "";
      return;
    }

    var cartoes = enc.servicos.map(function (s) {
      var linhas = "";
      if (s.publicoAlvo) {
        linhas += '<div class="ex-enc-linha"><b>Público-alvo:</b> ' + escapar(s.publicoAlvo) + "</div>";
      }
      if (s.atendimentos && s.atendimentos.length) {
        linhas +=
          '<div class="ex-enc-linha"><b>Atendimentos:</b><ul>' +
          s.atendimentos.map(function (a) { return "<li>" + escapar(a) + "</li>"; }).join("") +
          "</ul></div>";
      }
      if (s.fluxo) {
        linhas += '<div class="ex-enc-linha"><b>Fluxo:</b> ' + escapar(s.fluxo) + "</div>";
      }
      if (s.observacoes) {
        linhas += '<div class="ex-enc-linha"><b>Observações:</b> ' + escapar(s.observacoes) + "</div>";
      }
      return (
        '<div class="ex-enc-cartao">' +
        '<div class="ex-enc-nome">' + escapar(s.nome) + "</div>" +
        linhas +
        "</div>"
      );
    }).join("");

    var notaGeral = enc.observacoes && enc.observacoes.length
      ? '<div class="ex-enc-nota-geral">ℹ️ ' + enc.observacoes.map(escapar).join(" ") + "</div>"
      : "";

    refs.encaminhamentos.hidden = false;
    refs.encaminhamentos.innerHTML =
      '<div class="ex-enc-titulo">📋 Encaminhamentos / Serviços de referência</div>' +
      notaGeral +
      '<div class="ex-enc-lista">' + cartoes + "</div>";
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

  /* ------------------------------------------------------------------
   * DESENHAR A LISTA
   * ------------------------------------------------------------------
   * A lista completa aparece assim que o painel abre, em ordem
   * alfabetica. Antes ela so existia depois de digitar tres letras, e o
   * campo vazio mostrava um convite a digitar — o que obriga a saber o
   * nome ANTES de olhar. Quem nao sabe o nome exato (a maioria das
   * vezes) nao tinha por onde comecar.
   *
   * A tela recebe os itens em blocos porque Betim tem 1.983: desenhar
   * tudo de uma vez trava a abertura no notebook do plantao.
   * ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------
   * BLOCO "⚠️ ATENÇÃO AO ENCAMINHAR" — renderiza `orientacao`
   * ------------------------------------------------------------------
   * `orientacao` (dados/exames.json) e opcional e, quando existe, ja
   * chega SEM campo vazio — quem monta o dado (scripts/montar-exames.js)
   * garante isso na fonte. Aqui a regra e simples: cada campo que
   * existir vira uma linha com icone; campo ausente nao aparece — nunca
   * um rotulo com valor vazio do lado.
   *
   * NENHUM DADO DE PACIENTE PASSA POR AQUI. `orientacao` e metadado do
   * EXAME (regra de conduta, documento a anexar, faixa etaria) —
   * nunca nome, CPF ou qualquer coisa de quem esta sendo atendido.
   * ------------------------------------------------------------------ */

  /* Icone por VALOR de fluxo, nao um so para o campo: "para onde o
   * pedido vai" e mais legivel com um icone que muda conforme a
   * resposta do que com um icone fixo mais um texto ao lado. */
  var ICONE_FLUXO = {
    FICA_NA_UNIDADE: "🏥",
    VAI_PARA_CENTRAL: "📤",
    OUTRO: "🔀",
  };
  var ROTULO_FLUXO = {
    FICA_NA_UNIDADE: "Fica na unidade",
    VAI_PARA_CENTRAL: "Vai para a Central",
    OUTRO: "Outro fluxo",
  };

  /* `canalEncaminhamento` (nasceu com Macae) responde uma pergunta
   * DIFERENTE de `fluxo` (nasceu com Sete Lagoas): fluxo e "o papel
   * fica onde depois de emitido"; canal e "por qual porta o pedido
   * entra na regulacao". Os dois tem o mesmo tratamento visual (icone
   * que muda por valor) porque sao o mesmo TIPO de informacao — so
   * eixos diferentes — mas aparecem como linhas separadas quando um
   * exame tiver os dois, nunca fundidos numa frase so. */
  var ICONE_CANAL = {
    SISREG: "🗂️",
    CENTRAL_MUNICIPAL: "🏛️",
    REGULACAO_ESTADUAL: "🗺️",
    DIRETO_AO_SERVICO: "➡️",
    LABORATORIO_UPA: "🧪",
    OUTRO: "🔀",
  };
  var ROTULO_CANAL = {
    SISREG: "Via SISREG",
    CENTRAL_MUNICIPAL: "Via Central de Regulação do Município",
    REGULACAO_ESTADUAL: "Via regulação estadual",
    DIRETO_AO_SERVICO: "Direto ao serviço",
    LABORATORIO_UPA: "Laboratório da UPA",
    OUTRO: "Outro canal",
  };

  /* Uma linha simples: icone + rotulo + texto corrido. */
  function linhaDeOrientacao(icone, rotulo, texto) {
    return (
      '<div class="ex-or-linha">' +
      '<span class="ex-or-icone" aria-hidden="true">' + icone + "</span>" +
      '<span class="ex-or-txt"><b>' + escapar(rotulo) + ":</b> " + escapar(texto) + "</span>" +
      "</div>"
    );
  }

  /* Uma linha com lista: mesmo icone+rotulo, mas o conteudo vira <ul> —
   * usado pelos campos que sao array (documentos, pre-requisitos,
   * restricoes), porque um pre-requisito com seis itens (caso real: a
   * Biopsia Renal de Sete Lagoas) legivel um por linha, nao um paragrafo
   * so com virgula separando tudo. */
  function linhaDeOrientacaoComLista(icone, rotulo, itens) {
    return (
      '<div class="ex-or-linha">' +
      '<span class="ex-or-icone" aria-hidden="true">' + icone + "</span>" +
      '<span class="ex-or-txt"><b>' + escapar(rotulo) + ":</b>" +
      "<ul>" + itens.map(function (i) { return "<li>" + escapar(i) + "</li>"; }).join("") + "</ul>" +
      "</span></div>"
    );
  }

  function blocoDeOrientacao(o) {
    if (!o) return "";
    var linhas = [];

    if (o.faixaEtaria) linhas.push(linhaDeOrientacao("🎂", "Faixa etária", o.faixaEtaria));
    if (o.preparo) linhas.push(linhaDeOrientacao("🩺", "Preparo", o.preparo));
    if (o.documentos) linhas.push(linhaDeOrientacaoComLista("📄", "Documentos", o.documentos));
    if (o.preRequisitos) linhas.push(linhaDeOrientacaoComLista("✅", "Pré-requisitos", o.preRequisitos));
    if (o.restricoes) linhas.push(linhaDeOrientacaoComLista("🚫", "Restrições", o.restricoes));
    if (o.comoCadastrar) linhas.push(linhaDeOrientacao("🖥️", "Como cadastrar", o.comoCadastrar));
    if (o.validade) linhas.push(linhaDeOrientacao("⏳", "Validade", o.validade));
    if (o.fluxo) {
      linhas.push(linhaDeOrientacao(
        ICONE_FLUXO[o.fluxo] || "🔀",
        "Fluxo",
        ROTULO_FLUXO[o.fluxo] || o.fluxo
      ));
    }
    if (o.canalEncaminhamento) {
      linhas.push(linhaDeOrientacao(
        ICONE_CANAL[o.canalEncaminhamento] || "🔀",
        "Canal",
        ROTULO_CANAL[o.canalEncaminhamento] || o.canalEncaminhamento
      ));
    }
    if (o.observacoes) linhas.push(linhaDeOrientacao("📝", "Observações", o.observacoes));

    /* Defensivo: `orientacao()` no gerador ja garante que so chega aqui
     * com pelo menos um campo, mas o modulo nao deve confiar cegamente
     * num JSON externo (o remoto pode, um dia, vir de outra fonte). Sem
     * linha nenhuma, nao ha bloco. */
    if (!linhas.length) return "";

    return (
      '<div class="ex-orientacao">' +
      '<div class="ex-or-titulo">⚠️ Atenção ao encaminhar</div>' +
      linhas.join("") +
      "</div>"
    );
  }

  /* `justificativaObrigatoria` e campo do EXAME (fora de `orientacao`),
   * mas a linha entra no MESMO lugar/estilo do bloco de orientacao —
   * e aviso de conduta, nao categoria. Renderizada A PARTE de
   * blocoDeOrientacao() porque muitos exames com justificativa
   * obrigatoria nao tem `orientacao` nenhuma (o campo nao depende de
   * `orientacao` existir), entao nao da pra so acrescentar mais uma
   * linha dentro daquele bloco condicional. */
  function linhaJustificativaObrigatoria(e) {
    if (!e.justificativaObrigatoria) return "";
    return (
      '<div class="ex-orientacao ex-justificativa">' +
      '<div class="ex-or-linha">' +
      '<span class="ex-or-icone" aria-hidden="true">⚠️</span>' +
      '<span class="ex-or-txt">Justificativa médica obrigatória no pedido</span>' +
      "</div></div>"
    );
  }

  function elementoDoExame(e, indice) {
    var meta = [];
    if (e.codigo) meta.push('<span class="ex-selo">🔢 ' + escapar(e.codigo) + "</span>");
    if (e.local) meta.push('<span class="ex-selo">📍 ' + escapar(e.local) + "</span>");
    /* `especialidade` fica no `.ex-meta`, junto de codigo/local — e
     * CATEGORIA do exame, nao aviso de conduta, entao nao entra no
     * bloco `.ex-orientacao` (o "⚠️ Atenção ao encaminhar" e so para
     * o que muda a conduta de quem pede). Um badge por especialidade:
     * o mesmo exame pode pertencer a mais de uma (Ecodoppler de
     * Carótidas, em Macaé, esta em 3). */
    if (e.especialidade) {
      e.especialidade.forEach(function (esp) {
        meta.push('<span class="ex-selo ex-especialidade">🩺 ' + escapar(esp) + "</span>");
      });
    }
    /* `status: "SUSPENSO"` vira badge de alerta — vermelho de proposito,
     * diferente da paleta ambar do resto do modulo, porque a mensagem
     * e diferente: nao e "atencao ao encaminhar" (o exame se pede, com
     * cuidado), e "nao se pede, por enquanto, em caso nenhum". `ATIVO`
     * (ou campo ausente, que e o mesmo) nao mostra nada — a ausencia de
     * badge JA significa "oferta normal", a mesma leitura de todo campo
     * opcional deste modulo. */
    if (e.status === "SUSPENSO") {
      meta.push('<span class="ex-selo ex-suspenso">⛔ Suspenso</span>');
    }
    var sigla = e.exige ? siglaDe(e.exige) : null;

    var li = document.createElement("li");
    li.className = "ex-item";
    /* `listitem`, e nao `option`: a linha tem um botao de copiar dentro,
     * e um `option` com controle interno confunde o leitor de tela — ele
     * anuncia a linha como escolhivel quando o que e clicavel e o botao.
     * A spec pedia `listbox`/`option`, mas esses papeis nunca existiram
     * neste modulo e aplica-los aqui pioraria a leitura em vez de
     * melhorar. */
    li.setAttribute("role", "listitem");
    li.setAttribute("data-idx", String(indice));
    li.innerHTML =
      '<div class="ex-item-txt">' +
      '  <div class="ex-nome">' + escapar(e.nome) + "</div>" +
      (meta.length ? '  <div class="ex-meta">' + meta.join("") + "</div>" : "") +
      /* `nota`: aviso ANTES de pedir (idade minima, documento a
       * anexar, como cadastrar). Vem de Sete Lagoas, cuja fonte mistura
       * "impresso" com regra pratica na mesma celula. Fica separada do
       * `.ex-meta` porque nao e dado do exame (codigo, local) — e
       * instrucao de conduta, e precisa ler como aviso, nao como selo. */
      (e.nota ? '  <div class="ex-nota">ℹ️ ' + escapar(e.nota) + "</div>" : "") +
      /* `orientacao` e a evolucao tipada de `nota` — os dois convivem
       * por enquanto porque so 2 dos 65 itens de orientacoes de Sete
       * Lagoas foram reclassificados ate aqui; os outros 34 `nota`
       * continuam do jeito antigo ate a proxima leva de transcricao.
       * Um exame nunca tem os dois ao mesmo tempo na pratica (a fonte
       * de dados evita isso de proposito), mas o `if` abaixo nao
       * assume isso — so desenha o que existir. */
      blocoDeOrientacao(e.orientacao) +
      linhaJustificativaObrigatoria(e) +
      "</div>" +
      /* `icone`, por sigla, e opcional — hoje so ALTO_CUSTO tem. APAC e
       * LAUDO continuam so com o selo de texto, sem quebrar nada: o
       * icone e um prefixo extra dentro do MESMO selo, nao um elemento
       * novo. */
      (sigla
        ? '<span class="ex-sigla" title="' + escapar(sigla.titulo) + '">' +
          (sigla.icone ? escapar(sigla.icone) + " " : "") + escapar(sigla.rotulo) + "</span>"
        : "") +
      '<button type="button" class="ex-copiar" aria-label="Copiar ' + escapar(e.nome) + '">Copiar</button>';

    li.querySelector(".ex-copiar").addEventListener("click", function (ev) {
      copiar(textoParaCopiar(e), ev.currentTarget);
    });
    return li;
  }

  /* Desenha o proximo bloco do conjunto que passou no filtro. */
  function desenharBloco() {
    var ate = Math.min(desenhados + CONFIG_BUSCA.BLOCO, visiveis.length);
    var pedaco = document.createDocumentFragment();
    for (var k = desenhados; k < ate; k++) {
      var i = visiveis[k];
      pedaco.appendChild(elementoDoExame(ordenados[i], i));
    }
    refs.lista.appendChild(pedaco);
    desenhados = ate;
    atualizarRodape();
  }

  function atualizarRodape() {
    var restam = visiveis.length - desenhados;
    refs.mais.textContent = restam > 0
      ? "+ Mais " + Math.min(CONFIG_BUSCA.BLOCO, restam) + " (faltam " + restam + ")"
      : "";
    refs.mais.classList.toggle("oculto", restam <= 0);

    var termo = refs.busca.value.trim();
    refs.contagem.textContent = termo
      ? "mostrando " + desenhados + " de " + visiveis.length + " que casam · " +
        ordenados.length + " na lista de " + municipioEscolhido
      : "mostrando " + desenhados + " de " + ordenados.length +
        " exame(s) em " + municipioEscolhido;
  }

  /* Recomeca a lista: usado ao abrir o painel, ao trocar de municipio e
   * a cada filtro novo. */
  function redesenhar() {
    refs.lista.innerHTML = "";
    desenhados = 0;
    refs.vazio.classList.add("oculto");

    if (!visiveis.length) {
      /* A MENSAGEM E ESPECIFICA DE PROPOSITO. "Nenhum resultado" faria o
       * medico achar que errou a digitacao. O que aconteceu foi outra
       * coisa, e ela muda a conduta: este municipio nao oferece. */
      refs.vazio.innerHTML =
        "<b>Não consta na lista de " + escapar(municipioEscolhido) + ".</b><br>" +
        "Isso não quer dizer que o exame não exista — quer dizer que ele não está na lista que este município publicou. " +
        "Confira a grafia; se estiver certa, o caminho é o fluxo de encaminhamento ou a regulação.";
      refs.vazio.classList.remove("oculto");
      atualizarRodape();
      return;
    }
    desenharBloco();
  }

  /* Aplica o filtro sobre a lista COMPLETA e redesenha. */
  function filtrarExames() {
    visiveis = indicesQuePassam(refs.busca.value);
    redesenhar();
    /* O spinner some depois do trabalho, nao antes: ele existe para
     * cobrir justamente o intervalo em que a lista de 1.983 itens esta
     * sendo percorrida. */
    refs.spinner.classList.add("oculto");
  }

  var filtrarComAtraso = adiar(filtrarExames, CONFIG_BUSCA.DEBOUNCE_MS);

  /* Carrega a lista do municipio escolhido, do zero. */
  function carregarMunicipio() {
    ordenados = ordenarAlfabeticamente(examesDe(municipioEscolhido));
    visiveis = ordenados.map(function (_, i) { return i; });
    refs.busca.value = "";
    refs.spinner.classList.add("oculto");
    redesenhar();
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

  function abrirPainel() {
    if (overlay && overlay.estaAberto && overlay.estaAberto()) {
      overlay.fechar();
      return;
    }
    if (!overlay) montarPainel();
    montarSelect();
    carregarMunicipio();
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
        '      <div class="ex-campo">' +
        '        <input type="search" id="ex-busca" autocomplete="off"' +
        '               placeholder="Filtrar exames…" aria-label="Filtrar exames pelo nome, código ou local" />' +
        '        <span class="ex-spinner oculto" id="ex-spinner" role="status" aria-label="Filtrando"></span>' +
        "      </div>" +
        "    </div>" +
        '    <div class="ex-origem" id="ex-origem"></div>' +
        "  </div>" +
        '  <div class="ex-obs" id="ex-obs" hidden></div>' +
        '  <div class="ex-encaminhamentos" id="ex-encaminhamentos" hidden></div>' +
        '  <div class="ex-contagem" id="ex-contagem" role="status"></div>' +
        '  <div class="ex-rolagem">' +
        '    <div class="ex-nao-consta oculto" id="ex-vazio"></div>' +
        '    <ul class="ex-lista" id="ex-lista" role="list" aria-label="Exames disponíveis neste município"></ul>' +
        '    <button type="button" class="ex-mais oculto" id="ex-mais"></button>' +
        "  </div>" +
        "</div>",
    });

    refs.select = overlay.$("#ex-municipio");
    refs.busca = overlay.$("#ex-busca");
    refs.lista = overlay.$("#ex-lista");
    refs.origem = overlay.$("#ex-origem");
    refs.obs = overlay.$("#ex-obs");
    refs.encaminhamentos = overlay.$("#ex-encaminhamentos");
    refs.contagem = overlay.$("#ex-contagem");
    refs.spinner = overlay.$("#ex-spinner");
    refs.mais = overlay.$("#ex-mais");
    refs.vazio = overlay.$("#ex-vazio");

    overlay.$(".ex-fechar").addEventListener("click", function () { overlay.fechar(); });

    refs.busca.addEventListener("input", function () {
      /* O spinner acende JA, no evento de tecla, e nao dentro do filtro:
       * o que ele cobre e justamente a espera do debounce mais o tempo de
       * percorrer a lista. Acender depois seria acender tarde demais. */
      refs.spinner.classList.remove("oculto");
      filtrarComAtraso();
    });

    refs.mais.addEventListener("click", desenharBloco);

    refs.select.addEventListener("change", function () {
      municipioEscolhido = refs.select.value;
      pintarCabecalho();
      carregarMunicipio();
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
      if (overlay) { overlay.remover(); overlay = null; refs = {}; }
      indicePorMunicipio = {};
      ordenados = [];
      visiveis = [];
      desenhados = 0;
    },

    aoCargaRede: function () {
      /* A SPA troca de tela sem recarregar: o municipio do atendimento
       * anterior nao vale para o proximo. */
      detectarNaTela();
    },
  });
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
