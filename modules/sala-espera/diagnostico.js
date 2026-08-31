/* ------------------------------------------------------------------
 * modules/sala-espera/diagnostico.js — evidencia da API, sem PII
 * ------------------------------------------------------------------
 * POR QUE ISTO EXISTE
 * Nao da para consertar a deteccao de chegada no chute. E preciso ver o
 * que a API DE VERDADE devolve antes e depois do paciente fazer
 * check-in — quais campos existem, qual muda, e se o atendimento
 * continua aparecendo no filtro depois da mudanca.
 *
 * Este arquivo tira duas fotos da mesma consulta, espacadas no tempo, e
 * mostra a diferenca. Ele roda na sessao do proprio medico, com o
 * ProfissionalId dele, e imprime no console do navegador dele.
 *
 * O QUE NUNCA SAI DAQUI
 * Nome, CPF, CNS, telefone, data de nascimento, nome da mae — nada
 * disso e impresso. O relatorio mostra:
 *   - quantidade de itens;
 *   - id do atendimento reduzido a um apelido curto e nao reversivel;
 *   - statusAtendimentoId (numero);
 *   - os campos CANDIDATOS a "chegada", com valor e tipo;
 *   - o FORMATO da resposta (nomes de campo e tipos), com o conteudo de
 *     texto substituido por "texto(n)" — o nome do campo ajuda a achar a
 *     chegada, o conteudo dele nao;
 *   - carimbo de tempo.
 * Nada e enviado para lugar nenhum: e console local.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  /* Apelido curto e NAO reversivel para o id do atendimento. Serve para
   * acompanhar o mesmo item entre duas fotos sem escrever o id real. */
  function apelido(id) {
    var s = String(id || "");
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return "#" + h.toString(36).slice(0, 5);
  }

  /* Campos que PODEM representar a chegada do paciente. A lista e ampla
   * de proposito: o objetivo do diagnostico e descobrir qual deles a API
   * realmente usa, e nao confirmar um palpite. */
  var CAMINHOS_CANDIDATOS = [
    "agendamento.checkinStatus",
    "agendamento.checkIn",
    "agendamento.checkin",
    "agendamento.chegou",
    "agendamento.presente",
    "agendamento.dataCheckin",
    "agendamento.dataChegada",
    "agendamento.horarioChegada",
    "agendamento.statusAgendamentoId",
    "agendamento.situacao",
    "checkinStatus",
    "checkIn",
    "chegou",
    "presente",
    "dataCheckin",
    "dataChegada",
    "statusAtendimentoId",
    "situacaoId",
  ];

  function pegar(obj, caminho) {
    var partes = caminho.split(".");
    var atual = obj;
    for (var i = 0; i < partes.length; i++) {
      if (atual === null || atual === undefined) return undefined;
      atual = atual[partes[i]];
    }
    return atual;
  }

  /* Valor seguro de imprimir: booleano e numero vao inteiros (nao
   * identificam ninguem); texto vira o tamanho; data vira so o fato de
   * existir. */
  function valorSeguro(v) {
    if (v === null) return "null";
    if (v === undefined) return "ausente";
    var t = typeof v;
    if (t === "boolean") return v + " (booleano)";
    if (t === "number") return v + " (numero)";
    if (t === "string") {
      if (v === "true" || v === "false") return '"' + v + '" (texto)';
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) return "data preenchida (texto)";
      if (/^\d+$/.test(v)) return '"' + v + '" (numero em texto)';
      return "texto(" + v.length + ")";
    }
    if (t === "object") return Array.isArray(v) ? "lista(" + v.length + ")" : "objeto";
    return t;
  }

  /* Formato da resposta: nomes de campo e TIPOS, sem conteudo de texto.
   * E o que permite descobrir um campo de chegada que nao esta na lista
   * de candidatos acima. */
  function formato(obj, prefixo, saida, profundidade) {
    saida = saida || {};
    prefixo = prefixo || "";
    profundidade = profundidade || 0;
    if (profundidade > 2 || !obj || typeof obj !== "object") return saida;
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      var caminho = prefixo ? prefixo + "." + k : k;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        formato(v, caminho, saida, profundidade + 1);
      } else {
        saida[caminho] = valorSeguro(v);
      }
    });
    return saida;
  }

  function fotografar(itens) {
    return itens.map(function (item) {
      var candidatos = {};
      CAMINHOS_CANDIDATOS.forEach(function (c) {
        var v = pegar(item, c);
        if (v !== undefined) candidatos[c] = valorSeguro(v);
      });
      return {
        apelido: apelido(item.id || item.agendamentoId),
        statusAtendimentoId: item.statusAtendimentoId,
        candidatos: candidatos,
      };
    });
  }

  function comparar(antes, depois) {
    var porApelido = {};
    antes.forEach(function (x) {
      porApelido[x.apelido] = x;
    });

    var mudancas = [];
    depois.forEach(function (agora) {
      var antigo = porApelido[agora.apelido];
      if (!antigo) {
        mudancas.push({ item: agora.apelido, evento: "APARECEU", status: agora.statusAtendimentoId });
        return;
      }
      delete porApelido[agora.apelido];

      if (antigo.statusAtendimentoId !== agora.statusAtendimentoId) {
        mudancas.push({
          item: agora.apelido,
          evento: "statusAtendimentoId mudou",
          de: antigo.statusAtendimentoId,
          para: agora.statusAtendimentoId,
        });
      }
      Object.keys(agora.candidatos).forEach(function (campo) {
        if (antigo.candidatos[campo] !== agora.candidatos[campo]) {
          mudancas.push({
            item: agora.apelido,
            evento: "campo mudou",
            campo: campo,
            de: antigo.candidatos[campo] === undefined ? "ausente" : antigo.candidatos[campo],
            para: agora.candidatos[campo],
          });
        }
      });
    });

    Object.keys(porApelido).forEach(function (ap) {
      mudancas.push({
        item: ap,
        evento: "SUMIU DA RESPOSTA",
        status: porApelido[ap].statusAtendimentoId,
      });
    });

    return mudancas;
  }

  raiz.MeedsSuiteSalaEsperaDiag = {
    apelido: apelido,
    valorSeguro: valorSeguro,
    formato: formato,
    fotografar: fotografar,
    comparar: comparar,
    CAMINHOS_CANDIDATOS: CAMINHOS_CANDIDATOS,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
