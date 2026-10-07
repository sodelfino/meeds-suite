/* ------------------------------------------------------------------
 * modules/notificacao/aids-form.js — a parte da TELA da ficha de AIDS
 * ------------------------------------------------------------------
 * index.js monta o modal e as secoes comuns (paciente, residencia,
 * unidade). Aqui ficam so as secoes proprias da ficha de AIDS, a leitura
 * dos campos e o que aparece/some conforme as respostas. Nao toca no dock
 * nem no PDF: recebe de index.js as pequenas ferramentas de que precisa
 * (esc, checks, opcoes, valor...), para nao duplicar nada.
 * A logica (obrigatorios, desenho) esta em aids-ficha.js.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  const A = function () { return raiz.MeedsNotificacaoAids; };

  /* Campos de data que nao podem ser futuros (max = hoje). */
  const IDS_DATA = ["nt-aids-diag", "nt-aids-t-data", "nt-aids-d-triagem", "nt-aids-d-confirm", "nt-aids-d-rapidos", "nt-aids-d-obito"];

  function secaoTransmissao(h) {
    const a = A();
    return '<div class="nt-sec" id="nt-sec-aids-transm"><h3>Provável modo de transmissão *</h3>' +
      '<div class="nt-grid3">' +
      '<div><label class="nt-rot" for="nt-aids-vertical">Transmissão vertical (32) *</label><select id="nt-aids-vertical">' + h.opcoes(a.VERTICAL, "Selecione…") + "</select></div>" +
      '<div><label class="nt-rot" for="nt-aids-sexual">Sexual (33) *</label><select id="nt-aids-sexual">' + h.opcoes(a.SEXUAL, "Selecione…") + "</select></div>" +
      '<div><label class="nt-rot" for="nt-aids-sang">Sanguínea (34) *</label><select id="nt-aids-sang">' + h.opcoes(a.SANGUINEA, "Selecione…") + "</select></div></div>" +
      '<div id="nt-aids-exposicoes" class="nt-oculto" style="margin-top:8px"><div class="nt-sub">Via de exposição sanguínea * (marque as que existirem)</div>' +
      '<div class="nt-checks">' + h.checks("exposicoes", a.EXPOSICOES) + "</div></div>" +
      '<div id="nt-aids-bloco-transf" class="nt-oculto" style="margin-top:10px"><div class="nt-sub">Transfusão / acidente com material biológico (35 a 39) — obrigatório</div>' +
      '<div class="nt-grid3"><div><label class="nt-rot" for="nt-aids-t-data">Data (35) *</label><input type="date" id="nt-aids-t-data"></div>' +
      '<div><label class="nt-rot" for="nt-aids-t-uf">UF (36) *</label><select id="nt-aids-t-uf">' + h.opcoesUf() + "</select></div>" +
      '<div><label class="nt-rot" for="nt-aids-t-mun">Município (37) *</label><input type="text" id="nt-aids-t-mun" list="nt-lista-mun-t" autocomplete="off"><datalist id="nt-lista-mun-t"></datalist></div></div>' +
      '<div class="nt-grid2" style="margin-top:8px">' + h.campo("nt-aids-t-inst", "Instituição onde ocorreu (38) *", 'maxlength="60"') +
      '<div><label class="nt-rot" for="nt-aids-t-concl">A transfusão/acidente foi considerada causa da infecção? (39) *</label><select id="nt-aids-t-concl">' + h.opcoes(a.CONCLUSAO_TRANSF, "Selecione…") + "</select></div></div></div></div>";
  }

  function linhaTeste(h, t, i, ids) {
    return '<div><label class="nt-rot" for="' + ids[i] + '">' + h.esc(t.rotulo) + '</label><select id="' + ids[i] + '">' + h.opcoes(A().RESULTADO_TESTE, "—") + "</select></div>";
  }

  function secaoLaboratorio(h) {
    const ids = ["nt-aids-l-triagem", "nt-aids-l-confirm", "nt-aids-l-r1", "nt-aids-l-r2", "nt-aids-l-r3"];
    const t = A().TESTES;
    return '<div class="nt-sec" id="nt-sec-aids-lab"><h3>Evidência laboratorial de infecção pelo HIV (40) *</h3>' +
      '<div class="nt-sub">Resultado dos testes (informe ao menos um; “Não realizado” vale)</div>' +
      '<div class="nt-grid3">' + [0, 1, 2, 3, 4].map(function (i) { return linhaTeste(h, t[i], i, ids); }).join("") + "</div>" +
      '<div class="nt-grid3" style="margin-top:8px">' +
      '<div><label class="nt-rot" for="nt-aids-d-triagem">Coleta — triagem</label><input type="date" id="nt-aids-d-triagem"></div>' +
      '<div><label class="nt-rot" for="nt-aids-d-confirm">Coleta — confirmatório</label><input type="date" id="nt-aids-d-confirm"></div>' +
      '<div><label class="nt-rot" for="nt-aids-d-rapidos">Coleta — testes rápidos</label><input type="date" id="nt-aids-d-rapidos"></div></div></div>';
  }

  function secaoCriterio(h, o) {
    return '<div class="nt-sec" id="' + o.secao + '"><h3>' + h.esc(o.titulo) + " *</h3>" +
      '<label class="nt-check"><input type="checkbox" id="' + o.nenhum + '"> <b>' + h.esc(o.rotuloNenhum) + "</b> (atesto que o paciente não apresenta nenhum)</label>" +
      '<div class="nt-checks" style="margin-top:8px">' + h.checks(o.grupo, o.itens) + "</div>" + (o.extra || "") + "</div>";
  }

  function secaoObito(h) {
    return '<div class="nt-sec" id="nt-sec-aids-obito"><h3>Critério óbito (43) *</h3>' +
      '<div class="nt-grid3"><div><label class="nt-rot" for="nt-aids-obito">Caso notificado só pela declaração de óbito?</label><select id="nt-aids-obito">' + h.opcoes(A().CRITERIO_OBITO, "Selecione…") + "</select></div>" +
      '<div id="nt-aids-linha-obito" class="nt-oculto"><label class="nt-rot" for="nt-aids-d-obito">Data do óbito (48) *</label><input type="date" id="nt-aids-d-obito"></div></div></div>';
  }

  function secaoTratamento(h) {
    return '<details class="nt-det nt-sec" id="nt-aids-det-trat"><summary>Onde o paciente faz o tratamento (44 a 46 — opcional)</summary>' +
      '<div class="nt-grid-uf"><div><label class="nt-rot" for="nt-aids-trat-uf">UF</label><select id="nt-aids-trat-uf">' + h.opcoesUf() + "</select></div>" +
      '<div><label class="nt-rot" for="nt-aids-trat-mun">Município</label><input type="text" id="nt-aids-trat-mun" list="nt-lista-mun-trat" autocomplete="off"><datalist id="nt-lista-mun-trat"></datalist></div></div>' +
      '<div class="nt-grid2" style="margin-top:8px">' + h.campo("nt-aids-trat-unid", "Unidade de saúde onde se realiza o tratamento", 'maxlength="50"') +
      '<div style="display:flex;align-items:flex-end"><button type="button" class="nt-secundario" id="nt-aids-trat-usar">Usar a unidade do atendimento</button></div></div></details>';
  }

  /* Todas as secoes da ficha de AIDS, na ordem da ficha. */
  function secao(h) {
    const a = A();
    return '<div class="nt-so-aids">' +
      '<div class="nt-sigilo">🔒 Dado sensível (HIV/aids): a notificação é compulsória e sigilosa. O arquivo baixado deve seguir apenas para a vigilância epidemiológica.</div>' +
      '<div class="nt-sec"><h3>Diagnóstico</h3><div class="nt-grid3"><div><label class="nt-rot" for="nt-aids-diag">Data do diagnóstico (7) *</label><input type="date" id="nt-aids-diag"></div></div></div>' +
      secaoTransmissao(h) + secaoLaboratorio(h) +
      secaoCriterio(h, {
        secao: "nt-sec-aids-rj", titulo: "Critério Rio de Janeiro/Caracas (41)", nenhum: "nt-aids-rj-nenhum", rotuloNenhum: "Nenhum sinal ou doença",
        grupo: "rj", itens: a.RJ,
        extra: '<div class="nt-idade" id="nt-aids-rj-pontos"></div>',
      }) +
      secaoCriterio(h, {
        secao: "nt-sec-aids-cdc", titulo: "Critério CDC adaptado (42)", nenhum: "nt-aids-cdc-nenhum", rotuloNenhum: "Nenhuma doença indicativa de aids",
        grupo: "cdc", itens: a.CDC,
      }) +
      secaoObito(h) + secaoTratamento(h) + "</div>";
  }

  /* Le os campos da ficha de AIDS (h: valor, marcados, el). */
  function coletar(h) {
    return {
      diagnostico: h.valor("nt-aids-diag"),
      vertical: h.valor("nt-aids-vertical"),
      sexual: h.valor("nt-aids-sexual"),
      sanguinea: h.valor("nt-aids-sang"),
      exposicoes: h.marcados("exposicoes"),
      transfData: h.valor("nt-aids-t-data"),
      transfUf: h.valor("nt-aids-t-uf"),
      transfMunicipio: h.valor("nt-aids-t-mun"),
      transfInstituicao: h.valor("nt-aids-t-inst"),
      transfConclusao: h.valor("nt-aids-t-concl"),
      labTriagem: h.valor("nt-aids-l-triagem"),
      labConfirmatorio: h.valor("nt-aids-l-confirm"),
      labRapido1: h.valor("nt-aids-l-r1"),
      labRapido2: h.valor("nt-aids-l-r2"),
      labRapido3: h.valor("nt-aids-l-r3"),
      dataTriagem: h.valor("nt-aids-d-triagem"),
      dataConfirmatorio: h.valor("nt-aids-d-confirm"),
      dataRapidos: h.valor("nt-aids-d-rapidos"),
      rj: h.marcados("rj"),
      rjNenhum: !!(h.el("nt-aids-rj-nenhum") && h.el("nt-aids-rj-nenhum").checked),
      cdc: h.marcados("cdc"),
      cdcNenhum: !!(h.el("nt-aids-cdc-nenhum") && h.el("nt-aids-cdc-nenhum").checked),
      criterioObito: h.valor("nt-aids-obito"),
      dataObito: h.valor("nt-aids-d-obito"),
      ufTrat: h.valor("nt-aids-trat-uf"),
      municipioTrat: h.valor("nt-aids-trat-mun"),
      unidadeTrat: h.valor("nt-aids-trat-unid"),
    };
  }

  /* O que aparece conforme as respostas (dados = coletar(...)). */
  function condicionais(h, dados) {
    const a = A();
    h.el("nt-aids-exposicoes").classList.toggle("nt-oculto", dados.sanguinea !== "1");
    h.el("nt-aids-bloco-transf").classList.toggle("nt-oculto", !a.precisaBlocoTransf(dados));
    h.el("nt-aids-linha-obito").classList.toggle("nt-oculto", dados.criterioObito !== "1");
    const pts = a.pontosRj(dados.rj);
    h.el("nt-aids-rj-pontos").textContent = dados.rj.length
      ? "Pontos: " + pts + (pts >= 10 ? " — atinge o critério (10 ou mais)." : " — abaixo de 10; o critério RJ/Caracas não se completa só com estes itens.")
      : "";
  }

  /* "Nenhum" e qualquer item marcado se excluem (41 e 42). */
  function reconciliar(h, alvo) {
    const pares = [{ nenhum: "nt-aids-rj-nenhum", grupo: "rj" }, { nenhum: "nt-aids-cdc-nenhum", grupo: "cdc" }];
    const g = alvo && alvo.getAttribute && alvo.getAttribute("data-grupo");
    pares.forEach(function (p) {
      const sem = h.el(p.nenhum);
      if (alvo === sem && sem.checked) h.limparGrupo(p.grupo);
      else if (g === p.grupo && alvo.checked) sem.checked = false;
    });
  }

  raiz.MeedsNotificacaoAidsUi = { IDS_DATA: IDS_DATA, secao: secao, coletar: coletar, condicionais: condicionais, reconciliar: reconciliar };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
