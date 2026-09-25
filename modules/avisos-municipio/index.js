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
  var aberto = null;                // { id, municipio, chave, aviso }
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
    var Dom = raiz.MeedsSuiteDom;
    var M = raiz.MeedsSuiteMunicipio;
    if (!Dom || !M || typeof Dom.lerLinhasPorRotulo !== "function") return null;
    var linhas = Dom.lerLinhasPorRotulo(["Vínculos", "Vínculo"]);
    return linhas ? M.analisarVinculo(linhas, nomes) : null;
  }

  function municipioPeloVinculo(nomes) {
    if (!nomes.length) return null;
    var v = vinculo(nomes);
    if (!v || v.cidades.length !== 1) return null;
    var Dom = raiz.MeedsSuiteDom;
    var achados = nomes.filter(function (n) { return Dom.normalizarTexto(n) === v.cidades[0]; });
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
    var unidades = regraMun && regraMun.unidades;
    if (!unidades) return null;
    var Dom = raiz.MeedsSuiteDom;
    var v = vinculo(Object.keys(regras()));
    if (!v || v.cidades.length !== 1 || v.cidades[0] !== Dom.normalizarTexto(municipio)) return null;

    var achadas = Object.keys(unidades).filter(function (k) {
      return (unidades[k].nomes || []).some(function (n) {
        return v.unidades.indexOf(Dom.normalizarTexto(n)) !== -1;
      });
    });
    return achadas.length === 1 ? { chave: achadas[0], regra: unidades[achadas[0]] } : null;
  }

  function linhasDe(r) {
    var corpo = [];
    (r.pode || []).forEach(function (item) {
      corpo.push("✅ " + item);
    });
    if ((r.pode || []).length && (r.naoPode || []).length) corpo.push("");
    (r.naoPode || []).forEach(function (n) {
      corpo.push("❌ " + n.item + (n.fazer ? " → " + n.fazer : ""));
    });
    if (corpo.length && (r.orientacoes || []).length) corpo.push("");
    (r.orientacoes || []).forEach(function (o) {
      corpo.push("📌 " + o);
    });
    return corpo;
  }

  /* Regra do municipio (se houver) + regra da unidade (se houver), num
   * cartao so. O titulo e o da unidade quando ela existe. */
  function montarAviso(regraMun, unidade) {
    var partes = [];
    if (temConteudo(regraMun)) partes.push(regraMun);
    if (unidade && temConteudo(unidade.regra)) partes.push(unidade.regra);
    if (!partes.length) return null;
    var corpo = [];
    partes.forEach(function (r, i) {
      if (i > 0) { corpo.push(""); corpo.push(r.titulo + ":"); }
      corpo = corpo.concat(linhasDe(r));
    });
    /* Com as duas, o titulo e o da unidade e cada bloco ganha o seu nome. */
    if (partes.length > 1) corpo = [partes[0].titulo + ":"].concat(corpo);
    return { titulo: "⚠️ " + partes[partes.length - 1].titulo, corpo: corpo, destaque: "atencao" };
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
    if (dispensados[id]) return;

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

    var unidade = unidadeDoVinculo(municipio, tabela[municipio]);
    var spec = montarAviso(tabela[municipio], unidade);
    if (!spec) return;
    var chave = municipio + "|" + (unidade ? unidade.chave : "");
    if (aberto && aberto.chave === chave) return;
    /* A unidade apareceu (ou mudou) depois do cartao do municipio: troca
     * o cartao, sem contar como "dispensado pelo medico". */
    if (aberto) fechar();

    /* Abre na LATERAL SUPERIOR DIREITA, acima dos botoes do Assistente,
     * pulsando. "Entendi" para a pulsacao e o cartao fica ali, ambar e
     * parado, como referencia ate o fim do atendimento. O X fecha de vez
     * (naquele atendimento). Pedido de 25/09/2026: no meio da tela ele
     * cobria o formulario do atendimento. */
    spec.topo = true;
    spec.acoes = [{
      rotulo: "Entendi",
      fecha: false,
      aoClicar: function () {
        if (aberto && aberto.aviso) {
          aberto.aviso.atualizar({ destaque: "atencao-calmo", acoes: [] });
        }
      },
    }];
    aberto = { id: id, municipio: municipio, chave: chave, aviso: d.dock.criarAviso(spec) };
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
      var id = m[1].toLowerCase();
      /* ACHADO EM PRODUCAO (Jam de 25/09/2026, atendimento de Barbacena):
       * a resposta do Meeds novo nao trouxe a prefeitura nos caminhos que
       * conhecemos, e isso era gravado como "a rede decidiu: nenhuma
       * cidade da lista" — o que bloqueava a leitura do "Vinculos", que
       * mostrava BARBACENA. Agora, se a rede nao traz cidade NENHUMA, ela
       * nao decide nada e a tela responde. So quando ela traz uma cidade
       * (listada ou nao) e que a decisao e dela. */
      if (!raiz.MeedsSuiteMunicipio.cidadesDoAtendimento(json).length) return;
      var municipio = raiz.MeedsSuiteMunicipio.detectar(json, Object.keys(regras()));
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
