/* ------------------------------------------------------------------
 * modules/notificacao/violencia-form.js — a TELA da ficha de violência
 * ------------------------------------------------------------------
 * index.js monta o modal e as secoes comuns (paciente, residencia,
 * unidade). Aqui ficam so as secoes proprias da ficha de violencia, a
 * leitura dos campos e o que aparece/some conforme as respostas. Nao toca
 * no dock nem no PDF: recebe de index.js as pequenas ferramentas de que
 * precisa (esc, checks, opcoes, valor...). A logica (obrigatorios,
 * desenho) esta em violencia-ficha.js.
 *
 * Mesma mecanica das demais fichas: onde ha "1-Sim 2-Nao 9-Ignorado" o
 * medico marca o que ocorreu OU ATESTA ("Ignorado", "Nenhum"); as
 * caixas nao marcadas saem 2 na ficha, nunca em branco.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  const V = function () { return raiz.MeedsNotificacaoViolencia; };

  /* Campos de data que nao podem ser futuros (max = hoje). */
  const IDS_DATA = ["nt-v-data-ocor"];

  /* Atestados: "nenhum/ignorado" e os itens do grupo se excluem. */
  const PARES = [
    { atesta: "nt-v-meios-ign", grupo: "v-meios" },
    { atesta: "nt-v-sex-ign", grupo: "v-sex" },
    { atesta: "nt-v-proc-nenhum", grupo: "v-proc" },
    { atesta: "nt-v-vinc-ign", grupo: "v-vinc" },
    { atesta: "nt-v-enc-nenhum", grupo: "v-enc" },
  ];

  function sel(h, id, rotulo, lista, vazio) {
    return '<div><label class="nt-rot" for="' + id + '">' + h.esc(rotulo) + '</label><select id="' + id + '">' + h.opcoes(lista, vazio || "Selecione…") + "</select></div>";
  }

  function atesta(h, id, texto) {
    return '<label class="nt-check" style="margin-bottom:6px"><input type="checkbox" id="' + id + '"> <b>' + h.esc(texto) + "</b></label>";
  }

  function oculto(id, miolo, estilo) {
    return '<div id="' + id + '" class="nt-oculto"' + (estilo ? ' style="' + estilo + '"' : "") + ">" + miolo + "</div>";
  }

  function secaoOcorrencia(h) {
    const v = V();
    return '<div class="nt-sec" id="nt-sec-v-ocor"><h3>Ocorrência da violência (9, 40 a 54) *</h3>' +
      '<div class="nt-grid3">' +
      '<div><label class="nt-rot" for="nt-v-data-ocor">Data da ocorrência (9) *</label><input type="date" id="nt-v-data-ocor"></div>' +
      '<div><label class="nt-rot" for="nt-v-hora">Hora (51, opcional)</label><input type="time" id="nt-v-hora"></div>' +
      sel(h, "nt-v-local", "Local de ocorrência (52) *", v.LOCAIS) + "</div>" +
      oculto("nt-v-linha-local-outro", h.campo("nt-v-local-outro", "Qual outro local? (52)", 'maxlength="30"'), "margin-top:8px") +
      '<div class="nt-grid3" style="margin-top:8px">' +
      sel(h, "nt-v-outras", "Ocorreu outras vezes? (53) *", v.SIM_NAO) +
      sel(h, "nt-v-autoprov", "A lesão foi autoprovocada? (54) *", v.SIM_NAO) + "</div>" +
      '<div class="nt-sub">Onde aconteceu — município de ocorrência (40, 41) *</div>' +
      '<div class="nt-grid-uf"><div><label class="nt-rot" for="nt-v-ocor-uf">UF *</label><select id="nt-v-ocor-uf">' + h.opcoesUf() + "</select></div>" +
      '<div><label class="nt-rot" for="nt-v-ocor-mun">Município *</label><input type="text" id="nt-v-ocor-mun" list="nt-lista-mun-ocor" autocomplete="off"><datalist id="nt-lista-mun-ocor"></datalist></div></div>' +
      '<details class="nt-det" id="nt-v-det-ocor" style="margin-top:8px"><summary>Endereço da ocorrência (43 a 50 — opcional)</summary>' +
      '<div style="margin:6px 0"><button type="button" class="nt-secundario" id="nt-v-copiar-res">Usar o endereço da residência</button></div>' +
      '<div class="nt-grid2">' + h.campo("nt-v-ocor-bairro", "Bairro (43)", 'maxlength="40"') + h.campo("nt-v-ocor-logr", "Logradouro (44)", 'maxlength="60"') + "</div>" +
      '<div class="nt-grid3" style="margin-top:8px">' + h.campo("nt-v-ocor-num", "Número (45)", 'maxlength="8"') + h.campo("nt-v-ocor-compl", "Complemento (46)", 'maxlength="30"') +
      sel(h, "nt-v-ocor-zona", "Zona (50)", [{ v: "1", r: "Urbana" }, { v: "2", r: "Rural" }, { v: "3", r: "Periurbana" }, { v: "9", r: "Ignorada" }], "—") + "</div>" +
      '<div style="margin-top:8px">' + h.campo("nt-v-ocor-ref", "Ponto de referência (49)", 'maxlength="50"') + "</div></details></div>";
  }

  function secaoPessoa(h) {
    const v = V();
    return '<div class="nt-sec" id="nt-sec-v-pessoa"><h3>Dados complementares do paciente (33 a 39)</h3>' +
      '<div class="nt-info" id="nt-v-dica" style="display:none"></div>' +
      '<div class="nt-grid2">' + h.campo("nt-v-nome-social", "Nome social (33, opcional)", 'maxlength="60"') +
      sel(h, "nt-v-civil", "Situação conjugal (35) *", v.ESTADO_CIVIL) + "</div>" +
      '<div class="nt-grid3" style="margin-top:8px">' +
      sel(h, "nt-v-orient", "Orientação sexual (36) *", v.ORIENTACAO) +
      sel(h, "nt-v-ident", "Identidade de gênero (37) *", v.IDENTIDADE) +
      sel(h, "nt-v-def", "Deficiência/transtorno? (38) *", v.SIM_NAO) + "</div>" +
      oculto("nt-v-bloco-def", '<div class="nt-sub">Qual tipo? (39) *</div><div class="nt-checks">' + h.checks("v-def", v.DEFICIENCIAS) + "</div>" +
        oculto("nt-v-linha-def-outras", h.campo("nt-v-def-outras", "Quais outras?", 'maxlength="30"'), "margin-top:8px"), "margin-top:8px") + "</div>";
  }

  function secaoViolencia(h) {
    const v = V();
    return '<div class="nt-sec" id="nt-sec-v-viol"><h3>A violência (55 a 59) *</h3>' +
      '<div class="nt-grid2">' + sel(h, "nt-v-motiv", "Foi motivada por… (55) *", v.MOTIVACOES) +
      oculto("nt-v-linha-mot-outro", h.campo("nt-v-motiv-outro", "Qual outro motivo?", 'maxlength="30"')) + "</div>" +
      '<div class="nt-sub" id="nt-v-tipos-rot">Tipo de violência (56) * — marque todos que ocorreram</div>' +
      '<div class="nt-checks">' + h.checks("v-tipos", v.TIPOS) + "</div>" +
      oculto("nt-v-linha-tipo-outro", h.campo("nt-v-tipo-outro", "Qual outro tipo?", 'maxlength="30"'), "margin-top:8px") +
      '<div class="nt-sub" id="nt-v-meios-rot">Meio de agressão (57) *</div>' + atesta(h, "nt-v-meios-ign", "Meio ignorado") +
      '<div class="nt-checks">' + h.checks("v-meios", v.MEIOS) + "</div>" +
      oculto("nt-v-linha-meio-outro", h.campo("nt-v-meio-outro", "Qual outro meio?", 'maxlength="30"'), "margin-top:8px") +
      oculto("nt-v-bloco-sexual",
        '<div class="nt-sub" id="nt-v-sex-rot">Violência sexual — qual o tipo? (58) *</div>' + atesta(h, "nt-v-sex-ign", "Tipo ignorado") +
        '<div class="nt-checks">' + h.checks("v-sex", v.SEXUAIS) + "</div>" +
        oculto("nt-v-linha-sex-outro", h.campo("nt-v-sex-outro", "Qual outro tipo?", 'maxlength="30"'), "margin-top:8px") +
        '<div class="nt-sub" id="nt-v-proc-rot">Procedimentos realizados (59) *</div>' + atesta(h, "nt-v-proc-nenhum", "Nenhum procedimento nesta consulta") +
        '<div class="nt-checks">' + h.checks("v-proc", v.PROCEDIMENTOS) + "</div>", "margin-top:4px") + "</div>";
  }

  function secaoAutor(h) {
    const v = V();
    return '<div class="nt-sec" id="nt-sec-v-autor"><h3>Provável autor da agressão (60 a 64) *</h3>' +
      '<div class="nt-grid3">' + sel(h, "nt-v-env", "Número de envolvidos (60) *", v.ENVOLVIDOS) +
      sel(h, "nt-v-sexo-autor", "Sexo do provável autor (62) *", v.SEXO_AUTOR) +
      sel(h, "nt-v-alcool", "Suspeita de uso de álcool (63) *", v.SIM_NAO) + "</div>" +
      '<div style="margin-top:8px;max-width:340px">' + sel(h, "nt-v-ciclo", "Ciclo de vida do provável autor (64) *", v.CICLOS) + "</div>" +
      '<div class="nt-sub" id="nt-v-vinc-rot">Vínculo/grau de parentesco com a pessoa atendida (61) *</div>' + atesta(h, "nt-v-vinc-ign", "Vínculo ignorado") +
      '<div class="nt-checks">' + h.checks("v-vinc", v.VINCULOS) + "</div>" +
      oculto("nt-v-linha-vinc-outro", h.campo("nt-v-vinc-outro", "Qual outro vínculo?", 'maxlength="30"'), "margin-top:8px") + "</div>";
  }

  function secaoEncaminhamento(h) {
    const v = V();
    return '<div class="nt-sec" id="nt-sec-v-enc"><h3>Encaminhamento e dados finais (65 a 68) *</h3>' +
      '<div class="nt-sub" id="nt-v-enc-rot">Encaminhamento (65) *</div>' + atesta(h, "nt-v-enc-nenhum", "Nenhum encaminhamento nesta consulta") +
      '<div class="nt-checks">' + h.checks("v-enc", v.ENCAMINHAMENTOS) + "</div>" +
      '<div class="nt-grid3" style="margin-top:10px">' + sel(h, "nt-v-trab", "Relacionada ao trabalho? (66) *", v.SIM_NAO) +
      oculto("nt-v-linha-cat", sel(h, "nt-v-cat", "Emitida a CAT? (67) *", v.CAT.filter(function (o) { return o.v !== "8"; }))) +
      h.campo("nt-v-cid", "Circunstância da lesão (68) — CID-10 X60 a Y09, opcional", 'maxlength="6" placeholder="ex.: X954"') + "</div></div>";
  }

  function secaoAcompanhante(h) {
    return '<details class="nt-det nt-sec" id="nt-v-det-acomp"><summary>Acompanhante (opcional)</summary>' +
      '<div class="nt-grid3">' + h.campo("nt-v-acomp-nome", "Nome do acompanhante", 'maxlength="60"') +
      h.campo("nt-v-acomp-vinc", "Vínculo/grau de parentesco", 'maxlength="30"') + h.campo("nt-v-acomp-tel", "Telefone com DDD", 'maxlength="16"') + "</div></details>";
  }

  /* Todas as secoes da ficha de violencia, na ordem da ficha. */
  function secao(h) {
    return '<div class="nt-so-violencia">' +
      '<div class="nt-sigilo">🔒 Dado sensível (violência): a notificação é compulsória e sigilosa. O arquivo baixado deve seguir apenas para a vigilância epidemiológica. Telefones úteis: Disque-Saúde 0800 61 1997 · Central de Atendimento à Mulher 180 · Disque-Denúncia 100.</div>' +
      secaoOcorrencia(h) + secaoPessoa(h) + secaoViolencia(h) + secaoAutor(h) + secaoEncaminhamento(h) + secaoAcompanhante(h) + "</div>";
  }

  /* Le os campos da ficha de violencia (h: valor, marcados, el). */
  function coletar(h) {
    const marcado = function (id) { return !!(h.el(id) && h.el(id).checked); };
    return {
      dataOcorrencia: h.valor("nt-v-data-ocor"),
      ocorHora: h.valor("nt-v-hora"),
      local: h.valor("nt-v-local"),
      localOutro: h.valor("nt-v-local-outro"),
      outrasVezes: h.valor("nt-v-outras"),
      autoprovocada: h.valor("nt-v-autoprov"),
      ocorUf: h.valor("nt-v-ocor-uf"),
      ocorMunicipio: h.valor("nt-v-ocor-mun"),
      ocorBairro: h.valor("nt-v-ocor-bairro"),
      ocorLogradouro: h.valor("nt-v-ocor-logr"),
      ocorNumero: h.valor("nt-v-ocor-num"),
      ocorComplemento: h.valor("nt-v-ocor-compl"),
      ocorZona: h.valor("nt-v-ocor-zona"),
      ocorReferencia: h.valor("nt-v-ocor-ref"),
      nomeSocial: h.valor("nt-v-nome-social"),
      estadoCivil: h.valor("nt-v-civil"),
      orientacao: h.valor("nt-v-orient"),
      identidade: h.valor("nt-v-ident"),
      deficiencia: h.valor("nt-v-def"),
      defTipos: h.marcados("v-def"),
      defOutras: h.valor("nt-v-def-outras"),
      motivacao: h.valor("nt-v-motiv"),
      motivacaoOutro: h.valor("nt-v-motiv-outro"),
      tipos: h.marcados("v-tipos"),
      tipoOutro: h.valor("nt-v-tipo-outro"),
      meios: h.marcados("v-meios"),
      meiosIgnorado: marcado("nt-v-meios-ign"),
      meioOutro: h.valor("nt-v-meio-outro"),
      sexTipos: h.marcados("v-sex"),
      sexIgnorado: marcado("nt-v-sex-ign"),
      sexOutro: h.valor("nt-v-sex-outro"),
      procedimentos: h.marcados("v-proc"),
      procNenhum: marcado("nt-v-proc-nenhum"),
      envolvidos: h.valor("nt-v-env"),
      vinculos: h.marcados("v-vinc"),
      vinculoIgnorado: marcado("nt-v-vinc-ign"),
      vinculoOutro: h.valor("nt-v-vinc-outro"),
      sexoAutor: h.valor("nt-v-sexo-autor"),
      alcool: h.valor("nt-v-alcool"),
      ciclo: h.valor("nt-v-ciclo"),
      encaminhamentos: h.marcados("v-enc"),
      encNenhum: marcado("nt-v-enc-nenhum"),
      trabalho: h.valor("nt-v-trab"),
      cat: h.valor("nt-v-cat"),
      cid: h.valor("nt-v-cid"),
      acompNome: h.valor("nt-v-acomp-nome"),
      acompVinculo: h.valor("nt-v-acomp-vinc"),
      acompTelefone: h.valor("nt-v-acomp-tel"),
    };
  }

  /* Dica conforme a idade: so orienta, nao bloqueia. */
  function dicaDaIdade(anos) {
    if (anos == null) return "";
    const partes = [];
    if (anos < 10) partes.push("Menor de 10 anos: nos itens 35, 36 e 37 use “Não se aplica”.");
    if (anos < 18) partes.push("Criança ou adolescente: a notificação é compulsória e o caso segue o fluxo de proteção. Marque o Conselho Tutelar em “Encaminhamento” quando ele for acionado.");
    if (anos >= 60) partes.push("Pessoa idosa: se for o caso, marque o Conselho do Idoso ou a Delegacia de Atendimento ao Idoso em “Encaminhamento”.");
    return partes.join(" ");
  }

  /* O que aparece conforme as respostas (dados = coletar(...) completo). */
  function condicionais(h, dados) {
    const v = V();
    const tem = function (lista, id) { return (lista || []).indexOf(id) !== -1; };
    const liga = function (id, aparece) { h.el(id).classList.toggle("nt-oculto", !aparece); };
    liga("nt-v-linha-local-outro", dados.local === "09");
    liga("nt-v-linha-mot-outro", dados.motivacao === "09");
    liga("nt-v-bloco-def", dados.deficiencia === "1");
    liga("nt-v-linha-def-outras", tem(dados.defTipos, "outras"));
    liga("nt-v-linha-tipo-outro", tem(dados.tipos, "outros"));
    liga("nt-v-linha-meio-outro", tem(dados.meios, "outro"));
    liga("nt-v-bloco-sexual", tem(dados.tipos, "sexual"));
    liga("nt-v-linha-sex-outro", tem(dados.sexTipos, "outros"));
    liga("nt-v-linha-vinc-outro", tem(dados.vinculos, "outros"));
    liga("nt-v-linha-cat", dados.trabalho === "1");
    const dica = dicaDaIdade(v.idadeEmAnos(dados, h.hoje()));
    const caixa = h.el("nt-v-dica");
    caixa.textContent = dica;
    caixa.style.display = dica ? "block" : "none";
  }

  /* Lesao autoprovocada: o provavel autor e a propria pessoa. Ao escolher
   * "Sim", a tela sugere o resto (o medico pode corrigir). */
  function aoMudarAutoprovocada(h, alvo) {
    const v = V();
    const propria = h.el("nt-sec-v-autor").querySelector('input[data-grupo="v-vinc"][data-id="propria"]');
    if (alvo.value === "1") {
      h.limparGrupo("v-vinc");
      h.el("nt-v-vinc-ign").checked = false;
      propria.checked = true;
      h.el("nt-v-env").value = "1";
      const sexo = h.radio("nt-sexo");
      h.el("nt-v-sexo-autor").value = sexo === "M" ? "1" : sexo === "F" ? "2" : "9";
      const ciclo = v.cicloDe(v.idadeEmAnos({ nascimento: h.valor("nt-nasc") }, h.hoje()));
      if (ciclo) h.el("nt-v-ciclo").value = ciclo;
    } else if (propria.checked) {
      propria.checked = false;
    }
  }

  /* "Nenhum/Ignorado" e os itens do grupo se excluem; autoprovocada sugere o autor. */
  function reconciliar(h, alvo) {
    const g = alvo && alvo.getAttribute && alvo.getAttribute("data-grupo");
    PARES.forEach(function (p) {
      const caixa = h.el(p.atesta);
      if (alvo === caixa && caixa.checked) h.limparGrupo(p.grupo);
      else if (g === p.grupo && alvo.checked) caixa.checked = false;
    });
    if (alvo && alvo.id === "nt-v-autoprov") aoMudarAutoprovocada(h, alvo);
  }

  /* Itens que o guia ("Falta: ...") acompanha. */
  function obrigatorios(h) {
    const aqui = function () { return h.ficha() === "violencia"; };
    const e = function (campo, id, rotulo, descricao, comoResolver, so) {
      return { campo: campo, id: id, rotulo: rotulo, descricao: descricao, comoResolver: comoResolver, so: so || aqui };
    };
    const dados = function () { return h.dados(); };
    const sexual = function () { return aqui() && V().temViolenciaSexual(dados()); };
    return [
      e("dataOcorrencia", "nt-v-data-ocor", "Data da ocorrência", "a data da ocorrência (9)", "nunca futura, nunca antes do nascimento"),
      e("local", "nt-v-local", "Local de ocorrência", "o local de ocorrência (52)", "escolha um local"),
      e("outrasVezes", "nt-v-outras", "Ocorreu outras vezes", "se ocorreu outras vezes (53)", "sim, não ou ignorado"),
      e("autoprovocada", "nt-v-autoprov", "Lesão autoprovocada", "se a lesão foi autoprovocada (54)", "sim, não ou ignorado"),
      e("ocorUf", "nt-v-ocor-uf", "UF da ocorrência", "a UF da ocorrência (40)", "ajuda: “Usar o endereço da residência”"),
      e("ocorMunicipio", "nt-v-ocor-mun", "Município da ocorrência", "o município da ocorrência (41)", "escolha um da lista da UF"),
      e("raca", "nt-raca", "Raça/cor", "a raça/cor (15)", "escolha uma opção (ignorado vale)"),
      e("estadoCivil", "nt-v-civil", "Situação conjugal", "a situação conjugal (35)", "“Não se aplica” vale"),
      e("orientacao", "nt-v-orient", "Orientação sexual", "a orientação sexual (36)", "“Não se aplica” ou “Ignorado” valem"),
      e("identidade", "nt-v-ident", "Identidade de gênero", "a identidade de gênero (37)", "“Não se aplica” ou “Ignorado” valem"),
      e("deficiencia", "nt-v-def", "Deficiência/transtorno", "se há deficiência ou transtorno (38)", "sim, não ou ignorado"),
      e("defTipos", "nt-v-bloco-def", "Tipo de deficiência", "o tipo de deficiência/transtorno (39)", "marque o tipo", function () { return aqui() && dados().deficiencia === "1"; }),
      e("motivacao", "nt-v-motiv", "Motivação", "a motivação da violência (55)", "“Não se aplica” ou “Ignorado” valem"),
      e("tipos", "nt-v-tipos-rot", "Tipo de violência", "ao menos um tipo de violência (56)", "marque os que ocorreram"),
      e("meios", "nt-v-meios-rot", "Meio de agressão", "o meio de agressão (57)", "marque os usados ou “Meio ignorado”"),
      e("sexTipos", "nt-v-sex-rot", "Tipo de violência sexual", "o tipo de violência sexual (58)", "marque o tipo ou “Tipo ignorado”", sexual),
      e("procedimentos", "nt-v-proc-rot", "Procedimentos", "os procedimentos realizados (59)", "marque os feitos ou “Nenhum procedimento”", sexual),
      e("envolvidos", "nt-v-env", "Número de envolvidos", "o número de envolvidos (60)", "um, dois ou mais, ignorado"),
      e("vinculos", "nt-v-vinc-rot", "Vínculo com o autor", "o vínculo com o provável autor (61)", "marque os que se aplicam ou “Vínculo ignorado”"),
      e("sexoAutor", "nt-v-sexo-autor", "Sexo do autor", "o sexo do provável autor (62)", "escolha uma opção"),
      e("alcool", "nt-v-alcool", "Suspeita de álcool", "a suspeita de uso de álcool (63)", "sim, não ou ignorado"),
      e("ciclo", "nt-v-ciclo", "Ciclo de vida do autor", "o ciclo de vida do provável autor (64)", "escolha uma faixa"),
      e("encaminhamentos", "nt-v-enc-rot", "Encaminhamento", "o encaminhamento (65)", "marque os feitos ou “Nenhum encaminhamento”"),
      e("trabalho", "nt-v-trab", "Relacionada ao trabalho", "se é relacionada ao trabalho (66)", "sim, não ou ignorado"),
      e("cat", "nt-v-cat", "CAT", "se foi emitida a CAT (67)", "sim, não ou ignorado", function () { return aqui() && dados().trabalho === "1"; }),
    ];
  }

  raiz.MeedsNotificacaoViolenciaUi = {
    IDS_DATA: IDS_DATA,
    secao: secao,
    coletar: coletar,
    condicionais: condicionais,
    reconciliar: reconciliar,
    obrigatorios: obrigatorios,
    dicaDaIdade: dicaDaIdade,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
