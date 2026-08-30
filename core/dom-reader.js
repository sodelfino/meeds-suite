/* ------------------------------------------------------------------
 * core/dom-reader.js — leitura de tela com variantes de rotulo
 * ------------------------------------------------------------------
 * PROBLEMA QUE ESTE ARQUIVO RESOLVE
 * APAC, LME e CMD tinham CADA UM a sua copia (praticamente identica) de
 * valorAoLadoDoRotulo() e lerDadosDaTela(). O CMD foi o unico que evoluiu
 * a ideia: como o rotulo exato do "nome da mae" nunca pode ser conferido
 * numa gravacao, ele tenta VARIANTES em ordem ("Nome da Mãe", "Nome da
 * mãe do paciente", "Mãe", "Filiação"). O APAC so tentava duas variantes,
 * e o LME nem lia esse campo. Essa inteligencia estava presa num modulo.
 *
 * Aqui ela vira infraestrutura do nucleo, com duas melhorias:
 *   1. comparacao NORMALIZADA (sem acento, caixa baixa, espacos
 *      colapsados, ":" final ignorado) — antes a comparacao era um
 *      toUpperCase() cru, entao "Nome da Mae" nao batia com "Nome da Mãe"
 *      e cada modulo precisava listar as duas grafias na mao;
 *   2. leitura de contador numerico que RECUSA decidir sob ambiguidade,
 *      generalizando a regra do alarme de fila ("mais de um numero
 *      candidato e leituras divergentes => nao decide").
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  function normalizarTexto(str) {
    if (!str) return "";
    return String(str)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove acentos
      .replace(/\s+/g, " ")
      .replace(/[:：]\s*$/, "") // rotulos costumam vir com ":" no fim
      .trim()
      .toLowerCase();
  }

  /* Todos os elementos-FOLHA da pagina (sem filhos), que sao os que
   * carregam texto puro. Uma unica varredura serve para varias buscas
   * no mesmo "pulso" de leitura — os originais varriam
   * document.querySelectorAll('body *') de novo a cada rotulo, o que em
   * telas grandes custava caro. */
  function coletarFolhas() {
    var folhas = [];
    try {
      var todos = document.querySelectorAll("body *");
      for (var i = 0; i < todos.length; i++) {
        if (todos[i].children.length === 0) folhas.push(todos[i]);
      }
    } catch (e) {
      /* silencioso */
    }
    return folhas;
  }

  function textoDe(el) {
    return (el.textContent || "").trim();
  }

  /* Valor que aparece AO LADO de um rotulo. Aceita uma string ou uma
   * lista de variantes e devolve a primeira que casar — mesma estrategia
   * do CMD, agora com normalizacao de acento embutida. */
  function lerValorPorRotulo(variantes, folhasOpcional) {
    var lista = Array.isArray(variantes) ? variantes : [variantes];
    var folhas = folhasOpcional || coletarFolhas();

    for (var v = 0; v < lista.length; v++) {
      var alvo = normalizarTexto(lista[v]);
      if (!alvo) continue;
      for (var i = 0; i < folhas.length; i++) {
        var el = folhas[i];
        if (normalizarTexto(textoDe(el)) !== alvo) continue;
        var prox = el.nextElementSibling;
        if (!prox && el.parentElement) prox = el.parentElement.nextElementSibling;
        if (prox && textoDe(prox)) return textoDe(prox);
      }
    }
    return null;
  }

  /* Procura um texto exato isolado na tela (ex: "Masculino"/"Feminino").
   * Devolve o primeiro valor mapeado que aparecer. */
  function lerPorTextoExato(mapa, folhasOpcional) {
    var folhas = folhasOpcional || coletarFolhas();
    var chaves = Object.keys(mapa).map(function (k) {
      return { normalizado: normalizarTexto(k), valor: mapa[k] };
    });
    for (var i = 0; i < folhas.length; i++) {
      var t = normalizarTexto(textoDe(folhas[i]));
      if (!t) continue;
      for (var j = 0; j < chaves.length; j++) {
        if (t === chaves[j].normalizado) return chaves[j].valor;
      }
    }
    return null;
  }

  /* Texto do elemento imediatamente ANTERIOR ao que casa com um regex.
   * E como os tres geradores acham o nome do paciente: o nome fica logo
   * antes da linha "NN anos e MM meses" no cartao do paciente. */
  function lerAnteriorAoPadrao(regex, folhasOpcional) {
    var folhas = folhasOpcional || coletarFolhas();
    for (var i = 0; i < folhas.length; i++) {
      var t = textoDe(folhas[i]);
      if (!t || !regex.test(t)) continue;
      var ant = folhas[i].previousElementSibling;
      if (!ant && folhas[i].parentElement) ant = folhas[i].parentElement.previousElementSibling;
      var texto = ant && textoDe(ant);
      if (texto && texto.length > 2 && !/^\d/.test(texto)) return texto;
      return null;
    }
    return null;
  }

  var numeroPuroRx = /^\d{1,4}$/;

  /* Contador numerico associado a um rotulo (ex: o card "Aguardando" do
   * dashboard). REGRA HERDADA DO ALARME DE FILA, agora no nucleo: se
   * houver mais de uma leitura candidata e elas nao baterem entre si,
   * devolve null — preferimos NAO decidir a arriscar um falso disparo. */
  function lerContadorPorRotulo(variantes, folhasOpcional) {
    var lista = Array.isArray(variantes) ? variantes : [variantes];
    var folhas = folhasOpcional || coletarFolhas();
    var normalizadas = lista.map(normalizarTexto);

    var rotulos = folhas.filter(function (el) {
      return normalizadas.indexOf(normalizarTexto(textoDe(el))) !== -1;
    });
    if (rotulos.length === 0) return null;

    var leituras = {};
    var quantas = 0;
    rotulos.forEach(function (rotulo) {
      var pai = rotulo.parentElement;
      if (!pai) return;
      for (var i = 0; i < pai.children.length; i++) {
        var irmao = pai.children[i];
        if (irmao === rotulo) continue;
        var t = textoDe(irmao);
        if (numeroPuroRx.test(t)) {
          var n = parseInt(t, 10);
          if (!(n in leituras)) {
            leituras[n] = true;
            quantas++;
          }
        }
      }
    });

    if (quantas !== 1) return null; // ambiguo ou nao encontrado: nao decide
    return parseInt(Object.keys(leituras)[0], 10);
  }

  /* Texto normalizado da pagina inteira — usado pelo REMUME para achar
   * o nome do municipio na tela. */
  function textoDaPaginaNormalizado() {
    try {
      return normalizarTexto(document.body ? document.body.innerText : "");
    } catch (e) {
      return "";
    }
  }

  /* Leitura padronizada do cartao de paciente do Meeds, unificando o que
   * APAC/LME/CMD faziam separado. Devolve so o que conseguiu ler; nunca
   * inventa valor. Os campos ficam em memoria e vao direto para o
   * formulario — nada e gravado em disco. */
  var VARIANTES = {
    nascimento: ["Data de Nascimento", "Data de nascimento", "Nascimento", "Dt. Nascimento"],
    cpf: ["CPF", "C.P.F.", "CPF do paciente"],
    mae: ["Nome da Mãe", "Nome da mãe do paciente", "Nome da Mae", "Mãe", "Filiação", "Filiacao"],
    telefone: ["Telefone", "Celular", "Contato"],
  };

  var RX_IDADE = /^\d+\s*anos?(\s+e\s+\d+\s*m[eê]s(es)?)?$/i;

  function lerPaciente() {
    var folhas = coletarFolhas();
    var out = {};

    var nascimento = lerValorPorRotulo(VARIANTES.nascimento, folhas);
    if (nascimento) {
      var m = nascimento.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) {
        out.nascimentoBR = m[1] + "/" + m[2] + "/" + m[3]; // dd/mm/aaaa (LME, CMD)
        out.nascimentoISO = m[3] + "-" + m[2] + "-" + m[1]; // aaaa-mm-dd (APAC, input date)
      }
    }

    var cpf = lerValorPorRotulo(VARIANTES.cpf, folhas);
    if (cpf) out.cpf = cpf.replace(/\D/g, "");

    var mae = lerValorPorRotulo(VARIANTES.mae, folhas);
    if (mae) out.nomeDaMae = mae;

    var telefone = lerValorPorRotulo(VARIANTES.telefone, folhas);
    if (telefone) out.telefone = telefone;

    // sexo: le a PALAVRA exibida na tela, nao um enum de API. Decisao
    // herdada do APAC, onde o enum nunca pode ser confirmado com um caso
    // feminino real — a palavra na tela e o dado mais confiavel.
    var sexo = lerPorTextoExato({ Masculino: "M", Feminino: "F" }, folhas);
    if (sexo) out.sexo = sexo;

    var nome = lerAnteriorAoPadrao(RX_IDADE, folhas);
    if (nome) out.nome = nome;

    return out;
  }

  raiz.MeedsSuiteDom = {
    normalizarTexto: normalizarTexto,
    coletarFolhas: coletarFolhas,
    lerValorPorRotulo: lerValorPorRotulo,
    lerPorTextoExato: lerPorTextoExato,
    lerAnteriorAoPadrao: lerAnteriorAoPadrao,
    lerContadorPorRotulo: lerContadorPorRotulo,
    textoDaPaginaNormalizado: textoDaPaginaNormalizado,
    lerPaciente: lerPaciente,
    VARIANTES: VARIANTES,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
