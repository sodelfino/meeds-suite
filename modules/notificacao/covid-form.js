/* ------------------------------------------------------------------
 * modules/notificacao/covid-form.js — a TELA da ficha COVID-19
 * ------------------------------------------------------------------
 * index.js monta o modal e as secoes comuns (paciente, residencia,
 * unidade). Aqui ficam so as secoes proprias da ficha de sindrome gripal,
 * a leitura dos campos e o que aparece/some conforme as respostas. A
 * logica (obrigatorios, desenho) esta em covid-ficha.js.
 *
 * Ordem pensada para a teleconsulta: o que o medico decide (datas,
 * sintomas, condicoes) vem primeiro; o que vem da tela fica abaixo. Os
 * quatro Sim/Nao da ficha sao interruptores (desligado = Nao).
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  const C = function () { return raiz.MeedsNotificacaoCovid; };

  /* Campos de data que nao podem ser futuros (max = hoje). */
  const IDS_DATA = ["nt-c-data-notif", "nt-c-inicio"];

  function interruptor(id, texto) {
    return '<label class="nt-switch"><input type="checkbox" role="switch" id="' + id + '"><span class="nt-slider"></span> ' + texto + "</label>";
  }

  function oculto(id, miolo, estilo) {
    return '<div id="' + id + '" class="nt-oculto"' + (estilo ? ' style="' + estilo + '"' : "") + ">" + miolo + "</div>";
  }

  function secaoClinica(h) {
    const c = C();
    return '<div class="nt-sec" id="nt-sec-c-clin"><h3>Dados clínicos *</h3>' +
      '<div class="nt-grid3">' +
      '<div><label class="nt-rot" for="nt-c-data-notif">Data da notificação *</label><input type="date" id="nt-c-data-notif"></div>' +
      '<div><label class="nt-rot" for="nt-c-inicio">Início dos sintomas *</label><input type="date" id="nt-c-inicio"></div></div>' +
      '<div class="nt-sub" id="nt-c-sint-rot">Sintomas * (marque os presentes)</div>' +
      '<div class="nt-checks">' + h.checks("c-sint", c.SINTOMAS) + "</div>" +
      oculto("nt-c-linha-sint-outros", h.campo("nt-c-sint-outros", "Quais outros sintomas? *", 'maxlength="40"'), "margin-top:8px;max-width:360px") +
      '<div class="nt-sub" id="nt-c-cond-rot">Condições (marque se houver)</div>' +
      '<div class="nt-checks">' + h.checks("c-cond", c.CONDICOES) + "</div></div>";
  }

  function secaoIdentificacao(h) {
    const racas = C().RACAS.map(function (r) {
      return '<label class="nt-radio"><input type="radio" name="nt-c-raca" value="' + r.v + '"> ' + h.esc(r.r) + "</label>";
    }).join("");
    return '<div class="nt-sec" id="nt-sec-c-ident"><h3>Identificação</h3>' +
      '<div class="nt-switches">' + interruptor("nt-c-tem-cpf", "Tem CPF?") + interruptor("nt-c-estrangeiro", "Estrangeiro") +
      interruptor("nt-c-prof-saude", "Profissional de saúde") + interruptor("nt-c-prof-seg", "Profissional de segurança") + "</div>" +
      oculto("nt-c-linha-estrangeiro", '<div class="nt-grid2">' + h.campo("nt-c-pais", "País de origem", 'maxlength="30"') +
        h.campo("nt-c-passaporte", "Passaporte", 'maxlength="9"') + "</div>", "margin-top:8px") +
      oculto("nt-c-linha-cbo", h.campo("nt-c-cbo", "CBO (ocupação do profissional)", 'maxlength="40"'), "margin-top:8px;max-width:360px") +
      '<div class="nt-grid2" style="margin-top:8px">' + h.campo("nt-c-cns", "CNS (opcional — 15 dígitos)", 'inputmode="numeric" maxlength="18"') +
      h.campo("nt-c-tel-contato", "Telefone de contato (opcional)", 'inputmode="tel" maxlength="16"') + "</div>" +
      '<div class="nt-sub">Raça/cor (opcional)</div><div class="nt-radios">' + racas + "</div>" +
      oculto("nt-c-linha-etnia", h.campo("nt-c-etnia", "Etnia", 'maxlength="20"'), "margin-top:8px;max-width:300px") + "</div>";
  }

  function secao(h) {
    return '<div class="nt-so-covid">' + secaoClinica(h) + secaoIdentificacao(h) + "</div>";
  }

  /* Le os campos da ficha COVID. Fora dela devolve {}: inicioSintomas e
   * raca tambem existem nas outras fichas e nao podem ser sobrescritos. */
  function coletar(h) {
    if (h.ficha() !== "covid") return {};
    const ligado = function (id) { return !!(h.el(id) && h.el(id).checked); };
    return {
      temCpf: ligado("nt-c-tem-cpf"),
      estrangeiro: ligado("nt-c-estrangeiro"),
      profSaude: ligado("nt-c-prof-saude"),
      profSeguranca: ligado("nt-c-prof-seg"),
      cbo: h.valor("nt-c-cbo"),
      cns: h.valor("nt-c-cns"),
      pais: h.valor("nt-c-pais"),
      passaporte: h.valor("nt-c-passaporte"),
      raca: h.radio("nt-c-raca"),
      etnia: h.valor("nt-c-etnia"),
      telContato: h.valor("nt-c-tel-contato"),
      dataNotificacao: h.valor("nt-c-data-notif"),
      inicioSintomas: h.valor("nt-c-inicio"),
      sintomas: h.marcados("c-sint"),
      sintomaOutros: h.valor("nt-c-sint-outros"),
      condicoes: h.marcados("c-cond"),
    };
  }

  function caixaCond(h, id) {
    return h.el("nt-sec-c-clin").querySelector('input[data-grupo="c-cond"][data-id="' + id + '"]');
  }

  /* O que aparece conforme as respostas (dados = coletar(...) completo). */
  function condicionais(h, dados) {
    const covid = h.ficha() === "covid";
    const liga = function (id, aparece) { h.el(id).classList.toggle("nt-oculto", !aparece); };
    const tem = function (lista, id) { return (lista || []).indexOf(id) !== -1; };
    /* O campo de CPF e comum: so a ficha COVID o esconde. */
    h.el("nt-cpf").parentNode.classList.toggle("nt-oculto", covid && !dados.temCpf);
    if (!covid) return;
    liga("nt-c-linha-sint-outros", tem(dados.sintomas, "outros"));
    liga("nt-c-linha-estrangeiro", dados.estrangeiro);
    liga("nt-c-linha-cbo", dados.profSaude || dados.profSeguranca);
    liga("nt-c-linha-etnia", dados.raca === "indigena");
    ["gestante", "puerpera"].forEach(function (id) {
      const c = caixaCond(h, id);
      if (dados.sexo !== "F") c.checked = false;
      c.parentNode.classList.toggle("nt-oculto", dados.sexo !== "F");
    });
    /* A unidade vem recolhida; se falta UF ou municipio, abre para o medico ver. */
    if (!dados.ufNotif || !dados.municipioNotif) h.el("nt-det-unidade").open = true;
  }

  /* "Assintomatico" e os demais sintomas se excluem; o interruptor de CPF
   * guarda que o medico mexeu (a tela nao o liga mais sozinha). */
  function reconciliar(h, alvo) {
    if (!alvo || !alvo.getAttribute) return;
    if (alvo.id === "nt-c-tem-cpf") alvo.setAttribute("data-mexido", "1");
    if (alvo.getAttribute("data-grupo") !== "c-sint" || !alvo.checked) return;
    const assint = alvo.getAttribute("data-id") === "assintomatico";
    h.el("nt-sec-c-clin").querySelectorAll('input[data-grupo="c-sint"]').forEach(function (c) {
      if (c !== alvo && (assint || c.getAttribute("data-id") === "assintomatico")) c.checked = false;
    });
  }

  /* Itens que o guia ("Falta: ...") acompanha — os que a lista comum de
   * index.js nao cobre para a ficha COVID. */
  function obrigatorios(h) {
    const aqui = function () { return h.ficha() === "covid"; };
    const e = function (campo, id, rotulo, descricao, comoResolver, so) {
      return { campo: campo, id: id, rotulo: rotulo, descricao: descricao, comoResolver: comoResolver, so: so || aqui };
    };
    const temCpf = function () { return aqui() && !!(h.el("nt-c-tem-cpf") && h.el("nt-c-tem-cpf").checked); };
    return [
      e("dataNotificacao", "nt-c-data-notif", "Data da notificação", "a data da notificação", "nasce com hoje; nunca futura"),
      e("inicioSintomas", "nt-c-inicio", "Início dos sintomas", "a data de início dos sintomas", "nunca futura nem depois da notificação"),
      e("sintomas", "nt-c-sint-rot", "Sintomas", "ao menos um sintoma", "marque os presentes ou “Assintomático”"),
      e("sintomaOutros", "nt-c-sint-outros", "Outros sintomas", "quais são os outros sintomas", "escreva ou desmarque “Outros”"),
      e("condicoes", "nt-c-cond-rot", "Condições", "as condições (gestante/puérpera só no sexo feminino)", "confira o sexo ou desmarque"),
      e("ufNotif", "nt-uf-notif", "UF da notificação", "a UF da notificação", "vem do Vínculo; escolha da lista"),
      e("municipioNotif", "nt-mun-notif", "Município da notificação", "o município da notificação", "vem do Vínculo; escolha da lista"),
      e("cpf", "nt-cpf", "CPF", "um CPF válido", "confira o número ou desligue “Tem CPF?”", temCpf),
      e("cns", "nt-c-cns", "CNS", "um CNS válido", "15 dígitos, ou deixe em branco"),
      e("cep", "nt-cep", "CEP", "um CEP de 8 dígitos", "ou deixe em branco"),
    ];
  }

  raiz.MeedsNotificacaoCovidUi = {
    IDS_DATA: IDS_DATA,
    secao: secao,
    coletar: coletar,
    condicionais: condicionais,
    reconciliar: reconciliar,
    obrigatorios: obrigatorios,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
