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

  var d = null;
  var timers = [];
  var municipioPorAtendimento = {}; // id do atendimento -> nome do municipio (so memoria)
  var dispensados = {};             // id do atendimento -> true se o medico fechou no X
  var aberto = null;                // { id, municipio, aviso }
  var vistoDesde = {};              // id do atendimento -> quando a pagina dele apareceu

  /* A leitura pela tela so vale depois deste tempo SEM resposta da rede.
   * A chamada do atendimento costuma chegar em menos de 1 s; esperar
   * evita mostrar por um instante o cartao de uma cidade que a rede,
   * logo em seguida, desmentiria. */
  var ESPERA_REDE_MS = 3000;

  var RX_PAGINA_ATENDIMENTO = /^\/atendimento\/([0-9a-fA-F-]{36})(?:\/|$)/;
  var RX_API_ATENDIMENTO = /\/api\/v1\/atendimento\/([0-9a-fA-F-]{36})(?:[?#].*)?$/i;

  function regras() {
    var dados = raiz.MEEDS_AVISOS_MUNICIPIO;
    return (dados && dados.municipios) || {};
  }

  function atendimentoDaPagina() {
    try {
      var m = RX_PAGINA_ATENDIMENTO.exec((raiz.location && raiz.location.pathname) || "");
      return m ? m[1].toLowerCase() : null;
    } catch (e) {
      return null;
    }
  }

  /* Leitura pela TELA, restrita ao campo "Vinculos" do cartao do paciente
   * (ex.: "PREFEITURA MUNICIPAL DE MACAÉ / CENTRO DE SAUDE ..."). Procurar
   * o nome em qualquer lugar da pagina nao serve: na gravacao de
   * 24/09/2026, a tela de um atendimento de Macae mostrava ao mesmo tempo
   * um aviso de fila com "PREFEITURA MUNICIPAL DE BARBACENA".
   *
   * So decide com EXATAMENTE uma prefeitura no vinculo e ela na lista —
   * paciente vinculado a duas cidades nao tem como saber qual e a do
   * atendimento, e ai o certo e nao mostrar. */
  var PREFIXOS = [
    "prefeitura municipal de ",
    "prefeitura do municipio de ",
    "prefeitura de ",
    "municipio de ",
    "fundacao municipal de saude de ",
    "secretaria municipal de saude de ",
  ];

  function municipioPeloVinculo(nomes) {
    var Dom = raiz.MeedsSuiteDom;
    if (!Dom || !nomes.length) return null;
    var vinculo = Dom.lerValorPorRotulo(["Vínculos", "Vínculo"]);
    var texto = Dom.normalizarTexto(vinculo || "");
    if (!texto) return null;

    var instituicoes = 0;
    PREFIXOS.forEach(function (p) {
      instituicoes += texto.split(p).length - 1;
    });
    /* "prefeitura de " esta contido em nenhum dos outros, mas "municipio
     * de " esta dentro de "prefeitura do municipio de ": desconta. */
    instituicoes -= texto.split("prefeitura do municipio de ").length - 1;
    if (instituicoes !== 1) return null;

    var achados = nomes.filter(function (m) {
      var alvo = Dom.normalizarTexto(m);
      return PREFIXOS.some(function (p) {
        return texto.indexOf(p + alvo) !== -1;
      });
    });
    return achados.length === 1 ? achados[0] : null;
  }

  function montarAviso(r) {
    var corpo = [];
    (r.pode || []).forEach(function (item) {
      corpo.push("✅ " + item);
    });
    if ((r.pode || []).length && (r.naoPode || []).length) corpo.push("");
    (r.naoPode || []).forEach(function (n) {
      corpo.push("❌ " + n.item + (n.fazer ? " → " + n.fazer : ""));
    });
    return { titulo: "⚠️ " + r.titulo, corpo: corpo, destaque: "atencao" };
  }

  function fechar() {
    if (aberto) {
      aberto.aviso.fechar();
      aberto = null;
    }
  }

  function verificar() {
    if (!d) return;

    /* O medico fechou no X: vale para este atendimento ate o fim. */
    if (aberto && !aberto.aviso.estaVisivel()) {
      dispensados[aberto.id] = true;
      aberto = null;
    }

    var id = atendimentoDaPagina();
    if (!id) return fechar();
    if (aberto && aberto.id !== id) fechar();
    if (aberto || dispensados[id]) return;

    var tabela = regras();
    var municipio;
    if (Object.prototype.hasOwnProperty.call(municipioPorAtendimento, id)) {
      /* A rede respondeu por ESTE atendimento: ela decide, inclusive
       * quando diz "outro municipio". Nao cai para a leitura da tela. */
      municipio = municipioPorAtendimento[id];
    } else {
      /* Sem a rede (Safari no iPad em escopo isolado, ou a chamada passou
       * antes do script subir): so o campo "Vinculos" do cartao. */
      if (!vistoDesde[id]) vistoDesde[id] = Date.now();
      if (Date.now() - vistoDesde[id] < ESPERA_REDE_MS) return;
      municipio = municipioPeloVinculo(Object.keys(tabela));
    }
    if (!municipio || !tabela[municipio]) return;

    aberto = { id: id, municipio: municipio, aviso: d.dock.criarAviso(montarAviso(tabela[municipio])) };
  }

  raiz.MeedsSuite.registerModule({
    id: "avisos-municipio",
    nome: "Avisos do município",
    descricao: "Mostra, dentro do atendimento, o que a teleconsulta resolve naquele município e o que vai para o presencial.",
    versao: "1.0.0",
    configPadrao: {},

    assinaturasRede: [{ regex: /\/api\/v1\/atendimento\/[0-9a-fA-F-]{36}(?:[?#].*)?$/i, metodos: ["GET"] }],

    aoCargaRede: function (evt) {
      if (evt.status !== 200) return;
      var m = RX_API_ATENDIMENTO.exec(evt.url || "");
      if (!m || !raiz.MeedsSuiteMunicipio) return;
      var json = evt.json();
      var municipio = raiz.MeedsSuiteMunicipio.detectar(json, Object.keys(regras()));
      var id = m[1].toLowerCase();
      municipioPorAtendimento[id] = municipio || null;
      /* A rede desmentiu o cartao que a tela abriu (vinculo de uma cidade,
       * atendimento de outra): a rede vence. Fecha sem contar como
       * "dispensado pelo medico". */
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
      dispensados = {};
      vistoDesde = {};
      d = null;
    },

    _verificar: function () { verificar(); },
  });
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
