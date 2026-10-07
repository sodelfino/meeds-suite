/* ------------------------------------------------------------------
 * modules/notificacao/index.js — ficha de notificacao (SINAN)
 * ------------------------------------------------------------------
 * Gera, na primeira consulta de telemedicina, a ficha de investigacao do
 * SINAN por cima do PDF oficial. O botao abre uma escolha da ficha
 * (Dengue/Chikungunya ou Leishmaniose Tegumentar Americana); o formulario
 * e os dados do paciente sao os mesmos, so o que e da doenca muda. O
 * modulo tem id generico ("notificacao") para receber outras fichas.
 *
 * Este arquivo e so a TELA e a ligacao com o nucleo. Tudo que decide
 * alguma coisa (o que e obrigatorio, idade, onde cada valor cai na ficha,
 * como desenhar) vive em dengue-ficha.js e lta-ficha.js, que nao conhecem
 * DOM e sao testados em Node (tests/notificacao-*.test.js). O PDF e o IBGE chegam como
 * assets gerados por script.
 *
 * PRIVACIDADE: nada do formulario e gravado em disco. Nao ha historico
 * nem modelo salvo nesta ficha de proposito: ao contrario de um laudo, o
 * conteudo clinico de uma notificacao NAO se repete de um paciente para
 * outro — reaproveitar sinais do paciente anterior seria um risco, nao um
 * atalho.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  let d = null;
  let overlay = null;
  let guia = null;
  let pacienteNoFormulario = ""; // assinatura (nome|nascimento) de quem esta no formulario
  let ficha = ""; // "" (tela de escolha) | "dengue" | "lta"

  const F = function () { return raiz.MeedsNotificacaoDengue; };
  const L = function () { return raiz.MeedsNotificacaoLta; };

  const FICHAS = {
    dengue: {
      titulo: "Ficha de notificação — Dengue e Chikungunya",
      info: "Primeira consulta: preenche a Ficha de Investigação de Dengue e Febre de Chikungunya do SINAN por cima do PDF oficial. Exames, hospitalização, classificação final e encerramento ficam em branco para a vigilância epidemiológica completar.",
      pdf: "MEEDS_NOTIF_DENGUE_BASE_PDF_B64",
    },
    lta: {
      titulo: "Ficha de notificação — Leishmaniose Tegumentar",
      info: "Primeira consulta: preenche a Ficha de Investigação de Leishmaniose Tegumentar Americana do SINAN por cima do PDF oficial. Exames (já como “não realizado”), conclusão e encerramento ficam para a vigilância epidemiológica completar; o tratamento só entra se foi iniciado na consulta.",
      pdf: "MEEDS_NOTIF_LTA_BASE_PDF_B64",
    },
  };

  /* ----------------------------------------------------------------
   * Datas e acesso aos campos
   * ---------------------------------------------------------------- */
  function dois(n) { return String(n).padStart(2, "0"); }

  function paraIso(data) {
    return data.getFullYear() + "-" + dois(data.getMonth() + 1) + "-" + dois(data.getDate());
  }

  function hojeIso() { return paraIso(new Date()); }

  function diasAtras(n) {
    const t = new Date();
    t.setDate(t.getDate() - n);
    return paraIso(t);
  }

  function el(id) { return overlay ? overlay.elemento.querySelector("#" + id) : null; }
  function valor(id) { const e = el(id); return e ? String(e.value || "").trim() : ""; }
  function definir(id, v) { const e = el(id); if (e) e.value = v; }

  function marcados(grupo) {
    return Array.prototype.slice
      .call(overlay.elemento.querySelectorAll('input[data-grupo="' + grupo + '"]:checked'))
      .map(function (c) { return c.getAttribute("data-id"); });
  }

  function radio(nome) {
    const r = overlay.elemento.querySelector('input[name="' + nome + '"]:checked');
    return r ? r.value : "";
  }

  /* ----------------------------------------------------------------
   * Os dados do formulario, no formato que a logica entende
   * ---------------------------------------------------------------- */
  function coletar() {
    return {
      ficha: ficha,
      formaClinica: radio("nt-forma"),
      cicatriz: valor("nt-cicatriz"),
      hiv: valor("nt-hiv"),
      tipoEntrada: radio("nt-tipo"),
      parasitologico: valor("nt-lab-parasito"),
      irm: valor("nt-lab-irm"),
      histopatologia: valor("nt-lab-histo"),
      dataTratamento: valor("nt-data-trat"),
      drogaInicial: valor("nt-droga"),
      peso: valor("nt-peso"),
      agravo: radio("nt-agravo"),
      inicioSintomas: valor("nt-inicio"),
      sinais: marcados("sinais"),
      doencas: marcados("doencas"),
      alarme: marcados("alarme"),
      gravidade: marcados("gravidade"),
      semAlarme: !!(el("nt-sem-alarme") && el("nt-sem-alarme").checked),
      dataAlarme: valor("nt-data-alarme"),
      dataGravidade: valor("nt-data-gravidade"),
      outrosOrgaos: valor("nt-outros-orgaos"),
      nome: valor("nt-nome"),
      nascimento: valor("nt-nasc"),
      sexo: radio("nt-sexo"),
      gestante: valor("nt-gestante"),
      raca: valor("nt-raca"),
      escolaridade: valor("nt-escolaridade"),
      sus: valor("nt-sus"),
      mae: valor("nt-mae"),
      ocupacao: valor("nt-ocupacao"),
      ufRes: valor("nt-uf-res"),
      municipioRes: valor("nt-mun-res"),
      bairro: valor("nt-bairro"),
      logradouro: valor("nt-logradouro"),
      numero: valor("nt-numero"),
      complemento: valor("nt-complemento"),
      referencia: valor("nt-referencia"),
      cep: valor("nt-cep"),
      telefone: valor("nt-telefone"),
      zona: valor("nt-zona"),
      ufNotif: valor("nt-uf-notif"),
      municipioNotif: valor("nt-mun-notif"),
      unidade: valor("nt-unidade"),
      cnes: valor("nt-cnes"),
      observacoes: valor("nt-obs"),
      medicoNome: valor("nt-medico-nome"),
      medicoFuncao: valor("nt-medico-funcao"),
    };
  }

  /* ----------------------------------------------------------------
   * HTML
   * ---------------------------------------------------------------- */
  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function checks(grupo, itens) {
    return itens.map(function (i) {
      return '<label class="nt-check"><input type="checkbox" data-grupo="' + grupo + '" data-id="' + i.id + '"> ' + esc(i.rotulo) + "</label>";
    }).join("");
  }

  function opcoes(itens, vazio) {
    return '<option value="">' + esc(vazio || "—") + "</option>" +
      itens.map(function (i) { return '<option value="' + esc(i.v) + '">' + esc(i.v + " — " + i.r) + "</option>"; }).join("");
  }

  function opcoesUf() {
    return '<option value="">UF</option>' + F().UFS.map(function (u) { return "<option>" + u + "</option>"; }).join("");
  }

  const CSS = [
    raiz.MeedsSuiteCabecalho.CSS,
    raiz.MeedsSuiteGuia.CSS,
    "#nt-modal { background:#fff; border-radius:6px; max-width:760px; width:100%; max-height:90vh; overflow-y:auto; box-shadow:0 8px 24px rgba(15,23,42,.2); }",
    "#nt-body { padding:16px 20px; }",
    ".nt-sec { margin-bottom:16px; }",
    ".nt-sec h3 { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#123a7a; margin:0 0 8px; }",
    ".nt-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }",
    ".nt-grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }",
    ".nt-grid-uf { display:grid; grid-template-columns:90px 1fr; gap:10px; }",
    "#nt-body label.nt-rot { display:block; font-size:10.5px; font-weight:700; color:#5b6672; margin-bottom:4px; }",
    "#nt-body input[type=text], #nt-body input[type=date], #nt-body input[type=search], #nt-body select, #nt-body textarea {",
    "  width:100%; box-sizing:border-box; padding:8px 9px; border:1px solid #d8dfe6; border-radius:7px; font-size:12.5px; color:#16221f; background:#fff; }",
    "#nt-body textarea { min-height:64px; resize:vertical; }",
    ".nt-checks { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:6px 12px; }",
    ".nt-check, .nt-radio { display:flex; align-items:center; gap:7px; font-size:12.5px; color:#16221f; cursor:pointer; }",
    ".nt-radios { display:flex; flex-wrap:wrap; gap:6px 18px; }",
    ".nt-sub { font-size:11px; font-weight:700; color:#5b6672; margin:10px 0 6px; }",
    ".nt-info { background:#e8f0f8; color:#123a7a; font-size:11px; padding:8px 10px; border-radius:7px; margin-bottom:12px; line-height:1.4; }",
    "#nt-alerta { display:none; background:#fde8e8; border:2px solid #d92d20; color:#a12626; font-size:13px; font-weight:800; padding:11px 13px; border-radius:9px; margin-bottom:12px; line-height:1.45; }",
    "#nt-alerta.ativo { display:block; }",
    "#nt-erro { display:none; background:#fde8e8; border:1px solid #f0b8b8; color:#a12626; font-size:11.5px; padding:10px 12px; border-radius:8px; margin-top:6px; line-height:1.5; }",
    "#nt-erro ul { margin:6px 0 0; padding-left:18px; }",
    "#nt-sucesso { display:none; background:#e6f6f2; border:1px solid #9ed8c9; color:#0b6a62; font-size:12.5px; line-height:1.55; padding:11px 13px; border-radius:9px; margin-top:6px; }",
    "#nt-aviso-auto { display:none; background:#fff4e2; color:#a15c00; font-size:11px; padding:8px 10px; border-radius:7px; margin-bottom:12px; }",
    ".nt-idade { font-size:11px; color:#5b6672; margin-top:4px; min-height:14px; }",
    ".nt-oculto { display:none; }",
    "#nt-modal:not([data-ficha=\"dengue\"]):not([data-ficha=\"lta\"]) #nt-trocar, #nt-modal:not([data-ficha=\"dengue\"]):not([data-ficha=\"lta\"]) #nt-atualizar { display:none; }",
    "#nt-modal[data-ficha=\"lta\"] .nt-so-dengue, #nt-modal[data-ficha=\"dengue\"] .nt-so-lta { display:none; }",
    "#nt-modal:not([data-ficha=\"dengue\"]):not([data-ficha=\"lta\"]) #nt-form, #nt-modal:not([data-ficha=\"dengue\"]):not([data-ficha=\"lta\"]) #nt-footer { display:none; }",
    "#nt-modal[data-ficha=\"dengue\"] #nt-escolha, #nt-modal[data-ficha=\"lta\"] #nt-escolha { display:none; }",
    ".nt-fotos { margin:10px 0; }",
    ".nt-aviso-foto { background:#fff4e2; color:#8a4d00; font-size:11.5px; padding:9px 11px; border-radius:8px; margin-bottom:8px; line-height:1.45; }",
    ".nt-fotos-lista { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }",
    ".nt-foto { display:flex; flex-direction:column; align-items:center; gap:3px; width:84px; }",
    ".nt-foto img { width:84px; height:84px; object-fit:cover; display:block; border-radius:8px; border:1px solid #d8dfe6; }",
    ".nt-foto button { border:none; background:none; color:#a12626; font-size:11px; font-weight:700; cursor:pointer; padding:0; }",
    "#nt-escolha h3 { font-size:13px; color:#16221f; margin:0 0 4px; }",
    "#nt-escolha p { font-size:11.5px; color:#5b6672; margin:0 0 14px; }",
    ".nt-cartoes { display:grid; grid-template-columns:1fr 1fr; gap:14px; }",
    "button.nt-cartao { display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px; background:#f5f8fc; border:1.6px solid #c9d6e8; border-radius:14px; padding:18px 12px 16px; cursor:pointer; color:#16221f; font-family:inherit; }",
    "button.nt-cartao:hover, button.nt-cartao:focus-visible { border-color:#1a56ad; background:#eaf1fb; outline:none; box-shadow:0 0 0 3px rgba(26,86,173,.15); }",
    "button.nt-cartao svg { width:96px; height:96px; }",
    "button.nt-cartao .nt-cartao-nome { font-size:14px; font-weight:800; line-height:1.25; }",
    "button.nt-cartao .nt-cartao-sub { font-size:11px; color:#5b6672; line-height:1.35; }",
    "button.nt-cartao .nt-cartao-cid { font-size:10.5px; font-weight:700; color:#123a7a; background:#dde8f7; border-radius:999px; padding:2px 9px; }",
    "#nt-footer { display:flex; justify-content:flex-end; gap:8px; padding:14px 20px; border-top:1px solid #eee; }",
    "button.nt-primario { background:#1a4fa0; color:#fff; border:none; border-radius:9px; padding:10px 18px; font-size:13px; font-weight:800; cursor:pointer; }",
    "button.nt-primario:hover { background:#123a7a; }",
    "button.nt-primario:disabled { background:#a7bcdd; cursor:not-allowed; }",
    "button.nt-secundario { background:#fff; color:#123a7a; border:1.4px solid #1a56ad; border-radius:9px; padding:9px 14px; font-size:12.5px; font-weight:700; cursor:pointer; }",
    "details.nt-det > summary { cursor:pointer; font-size:11px; font-weight:700; color:#123a7a; margin-bottom:8px; }",
    "@media (max-width:640px) { .nt-grid2, .nt-grid3, .nt-cartoes { grid-template-columns:1fr; } }",
  ].join("\n");

  function campo(id, rotulo, extra) {
    return '<div><label class="nt-rot" for="' + id + '">' + esc(rotulo) + '</label><input type="text" id="' + id + '" autocomplete="off" ' + (extra || "") + "></div>";
  }

  function secaoDoenca() {
    return '<div class="nt-sec"><h3>Doença suspeita *</h3><div class="nt-radios">' +
      '<label class="nt-radio"><input type="radio" name="nt-agravo" id="nt-agravo-dengue" value="dengue"> Dengue (A90)</label>' +
      '<label class="nt-radio"><input type="radio" name="nt-agravo" id="nt-agravo-chik" value="chikungunya"> Chikungunya (A92.0)</label>' +
      "</div></div>";
  }

  function secaoSintomas() {
    return '<div class="nt-sec"><h3>Sintomas</h3>' +
      '<div class="nt-grid3"><div><label class="nt-rot" for="nt-inicio">Início dos sintomas *</label><input type="date" id="nt-inicio"></div></div>' +
      '<div class="nt-sub" id="nt-sinais-rot">Sinais clínicos * (marque os presentes)</div>' +
      '<div class="nt-checks" id="nt-sinais">' + checks("sinais", F().SINAIS_CLINICOS) + "</div>" +
      '<div class="nt-sub">Doenças pré-existentes (opcional)</div>' +
      '<div class="nt-checks">' + checks("doencas", F().DOENCAS) + "</div></div>";
  }

  function secaoAlarme() {
    return '<div class="nt-sec" id="nt-sec-alarme"><h3>Sinais de alarme e de gravidade *</h3>' +
      '<label class="nt-check"><input type="checkbox" id="nt-sem-alarme"> <b>Sem sinais de alarme</b> (atesto que o paciente não apresenta nenhum)</label>' +
      '<div class="nt-sub">Dengue com sinais de alarme</div><div class="nt-checks">' + checks("alarme", F().ALARME) + "</div>" +
      '<div id="nt-linha-data-alarme" class="nt-oculto" style="margin-top:8px;max-width:240px"><label class="nt-rot" for="nt-data-alarme">Início dos sinais de alarme</label><input type="date" id="nt-data-alarme"></div>' +
      '<details class="nt-det" style="margin-top:10px"><summary>Dengue grave (sinais de gravidade)</summary><div class="nt-checks">' + checks("gravidade", F().GRAVIDADE) + "</div>" +
      '<div class="nt-grid2" style="margin-top:8px"><div id="nt-linha-data-grav" class="nt-oculto"><label class="nt-rot" for="nt-data-gravidade">Início dos sinais de gravidade</label><input type="date" id="nt-data-gravidade"></div>' +
      '<div id="nt-linha-outros" class="nt-oculto"><label class="nt-rot" for="nt-outros-orgaos">Outros órgãos (especificar)</label><input type="text" id="nt-outros-orgaos" maxlength="40"></div></div></details></div>';
  }

  function secaoPaciente() {
    return '<div class="nt-sec"><h3>Paciente</h3>' +
      '<div class="nt-grid2">' + campo("nt-nome", "Nome completo *") +
      '<div><label class="nt-rot" for="nt-nasc">Data de nascimento *</label><input type="date" id="nt-nasc"><div class="nt-idade" id="nt-idade"></div></div></div>' +
      '<div class="nt-sub">Sexo *</div><div class="nt-radios">' +
      '<label class="nt-radio"><input type="radio" name="nt-sexo" id="nt-sexo-f" value="F"> Feminino</label>' +
      '<label class="nt-radio"><input type="radio" name="nt-sexo" value="M"> Masculino</label>' +
      '<label class="nt-radio"><input type="radio" name="nt-sexo" value="I"> Ignorado</label></div>' +
      '<div id="nt-linha-gestante" class="nt-oculto" style="margin-top:8px;max-width:300px"><label class="nt-rot" for="nt-gestante">Gestante *</label><select id="nt-gestante">' + opcoes(F().GESTANTE, "Selecione…") + "</select></div>" +
      '<div class="nt-grid3" style="margin-top:8px">' +
      '<div><label class="nt-rot" for="nt-raca">Raça/cor</label><select id="nt-raca">' + opcoes(F().RACAS) + "</select></div>" +
      '<div><label class="nt-rot" for="nt-escolaridade">Escolaridade</label><select id="nt-escolaridade">' + opcoes(F().ESCOLARIDADES) + "</select></div>" +
      campo("nt-ocupacao", "Ocupação", 'maxlength="40"') + "</div>" +
      '<div class="nt-grid2" style="margin-top:8px">' + campo("nt-sus", "Cartão SUS (15 dígitos)", 'inputmode="numeric" maxlength="19"') + campo("nt-mae", "Nome da mãe", 'maxlength="60"') + "</div></div>";
  }

  function secaoResidencia() {
    return '<div class="nt-sec"><h3>Residência do paciente</h3>' +
      '<div class="nt-grid-uf"><div><label class="nt-rot" for="nt-uf-res">UF *</label><select id="nt-uf-res">' + opcoesUf() + "</select></div>" +
      '<div><label class="nt-rot" for="nt-mun-res">Município de residência *</label><input type="text" id="nt-mun-res" list="nt-lista-mun-res" autocomplete="off" placeholder="digite e escolha da lista"><datalist id="nt-lista-mun-res"></datalist></div></div>' +
      '<div class="nt-grid3" style="margin-top:8px">' + campo("nt-bairro", "Bairro", 'maxlength="40"') + campo("nt-logradouro", "Logradouro", 'maxlength="60"') + campo("nt-numero", "Número", 'maxlength="8"') + "</div>" +
      '<div class="nt-grid3" style="margin-top:8px">' + campo("nt-complemento", "Complemento", 'maxlength="40"') + campo("nt-referencia", "Ponto de referência", 'maxlength="40"') + campo("nt-cep", "CEP", 'inputmode="numeric" maxlength="9"') + "</div>" +
      '<div class="nt-grid3" style="margin-top:8px">' + campo("nt-telefone", "Telefone com DDD *", 'inputmode="tel" maxlength="16" placeholder="(22) 99999-9999"') +
      '<div><label class="nt-rot" for="nt-zona">Zona</label><select id="nt-zona">' + opcoes(F().ZONAS) + "</select></div></div></div>";
  }

  function secaoUnidade() {
    return '<details class="nt-det nt-sec" id="nt-det-unidade"><summary>Unidade e município da notificação (lidos da tela do atendimento)</summary>' +
      '<div class="nt-grid-uf"><div><label class="nt-rot" for="nt-uf-notif">UF</label><select id="nt-uf-notif">' + opcoesUf() + "</select></div>" +
      '<div><label class="nt-rot" for="nt-mun-notif">Município da notificação</label><input type="text" id="nt-mun-notif" list="nt-lista-mun-notif" autocomplete="off"><datalist id="nt-lista-mun-notif"></datalist></div></div>' +
      '<div class="nt-grid2" style="margin-top:8px"><div><label class="nt-rot" for="nt-unidade">Unidade de saúde</label><input type="text" id="nt-unidade" list="nt-lista-unidades" autocomplete="off"><datalist id="nt-lista-unidades"></datalist></div>' +
      campo("nt-cnes", "CNES (7 dígitos, opcional)", 'inputmode="numeric" maxlength="7"') + "</div></details>";
  }

  function secaoObservacoes() {
    return '<div class="nt-sec"><h3>Observações e responsável</h3>' +
      '<label class="nt-rot" for="nt-obs">Observações adicionais (opcional — vão para a página 2 da ficha)</label>' +
      '<textarea id="nt-obs" maxlength="600"></textarea>' +
      '<div class="nt-grid3" style="margin-top:8px"><div><label class="nt-rot" for="nt-medico-sel">Médico (preenche o bloco "Investigador")</label><select id="nt-medico-sel"></select></div>' +
      campo("nt-medico-nome", "Nome", 'maxlength="60"') + campo("nt-medico-funcao", "Função", 'maxlength="40"') + "</div></div>";
  }

  /* Ilustracoes da tela de escolha: SVG proprio (sem imagem externa). */
  const SVG_DENGUE =
    '<svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="45" fill="#fde8e8"/>' +
    '<ellipse cx="36" cy="38" rx="17" ry="6" transform="rotate(-38 36 38)" fill="#fff" stroke="#9aa9bd" stroke-width="1.3"/>' +
    '<ellipse cx="60" cy="38" rx="17" ry="6" transform="rotate(38 60 38)" fill="#fff" stroke="#9aa9bd" stroke-width="1.3"/>' +
    '<g stroke="#3a2f2f" stroke-width="2" fill="none" stroke-linecap="round">' +
    '<path d="M44 44 L30 50 L22 64"/><path d="M52 44 L66 50 L74 64"/><path d="M44 48 L28 58 L24 74"/><path d="M52 48 L68 58 L72 74"/><path d="M45 52 L36 66 L38 80"/><path d="M51 52 L60 66 L58 80"/></g>' +
    '<ellipse cx="48" cy="64" rx="8.5" ry="15" fill="#3a2f2f"/>' +
    '<g stroke="#fff" stroke-width="2"><path d="M40 58 H56"/><path d="M40 64 H56"/><path d="M40.5 70 H55.5"/></g>' +
    '<circle cx="48" cy="44" r="7" fill="#3a2f2f"/><circle cx="48" cy="34" r="5" fill="#3a2f2f"/>' +
    '<path d="M48 30 L48 15" stroke="#3a2f2f" stroke-width="2.4" stroke-linecap="round"/>' +
    '<path d="M76 18 C76 18 69 27 69 31 A7 7 0 0 0 83 31 C83 27 76 18 76 18Z" fill="#d92d20"/></svg>';
  const SVG_LTA =
    '<svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="45" fill="#fff1e0"/>' +
    '<ellipse cx="46" cy="60" rx="31" ry="25" fill="#efc3a0"/>' +
    '<ellipse cx="46" cy="60" rx="19" ry="15" fill="#c9553d"/><ellipse cx="46" cy="60" rx="13" ry="9.5" fill="#8e2a22"/>' +
    '<ellipse cx="42" cy="57" rx="4" ry="2.5" fill="#d98a7a"/>' +
    '<g transform="translate(66 22)"><path d="M0 0 L-12 -10 L-6 3Z" fill="#fff" stroke="#9aa9bd" stroke-width="1.2"/>' +
    '<path d="M2 0 L14 -10 L8 3Z" fill="#fff" stroke="#9aa9bd" stroke-width="1.2"/>' +
    '<ellipse cx="1" cy="6" rx="3.4" ry="9" fill="#a98a4d"/><circle cx="1" cy="-3" r="3.2" fill="#a98a4d"/>' +
    '<g stroke="#6b5427" stroke-width="1.3" fill="none" stroke-linecap="round"><path d="M-1 4 L-10 10 L-12 20"/><path d="M3 4 L12 10 L14 20"/><path d="M-1 8 L-8 16 L-9 25"/><path d="M3 8 L10 16 L11 25"/></g></g></svg>';

  function cartaoFicha(c) {
    return '<button type="button" class="nt-cartao" data-ficha="' + c.id + '">' + c.svg +
      '<span class="nt-cartao-nome">' + esc(c.nome) + '</span><span class="nt-cartao-sub">' + esc(c.sub) + '</span>' +
      '<span class="nt-cartao-cid">' + esc(c.cid) + "</span></button>";
  }

  const ESCOLHA =
    '<div id="nt-escolha"><h3>Qual ficha de notificação?</h3><p>Escolha a doença suspeita. Os dados do paciente são lidos da tela do atendimento nas duas.</p>' +
    '<div class="nt-cartoes">' +
    cartaoFicha({ id: "dengue", svg: SVG_DENGUE, nome: "Dengue e Febre de Chikungunya", sub: "Transmitida pelo mosquito Aedes aegypti", cid: "CID A90 · A92.0" }) +
    cartaoFicha({ id: "lta", svg: SVG_LTA, nome: "Leishmaniose Tegumentar Americana", sub: "Úlcera na pele ou nas mucosas — flebotomíneo", cid: "CID B55.1" }) +
    "</div></div>";

  function radios(nome, itens) {
    return '<div class="nt-radios" style="flex-direction:column;gap:6px">' + itens.map(function (i, n) {
      return '<label class="nt-radio"><input type="radio" name="' + nome + '" id="' + nome + "-" + (n + 1) + '" value="' + esc(i.v) + '"> ' + esc(i.r) + "</label>";
    }).join("") + "</div>";
  }

  function opcoesPadrao(itens, padrao) {
    return '<option value="">—</option>' + itens.map(function (i) {
      return '<option value="' + esc(i.v) + '"' + (i.v === padrao ? " selected" : "") + ">" + esc(i.v + " — " + i.r) + "</option>";
    }).join("");
  }

  /* Parte da ficha de Leishmaniose: forma clinica (+ fotos da lesao),
   * cicatrizes, HIV, tipo de entrada, laboratorio e tratamento. */
  function secaoLta() {
    const pad = L().PADRAO_LAB;
    return '<div class="nt-sec nt-so-lta" id="nt-sec-forma"><h3>Quadro clínico *</h3>' +
      '<div class="nt-sub">Forma clínica *</div>' + radios("nt-forma", L().FORMAS) +
      '<div class="nt-fotos"><div class="nt-aviso-foto">📷 Por se tratar de telemedicina, anexe fotos nítidas da lesão cutânea/mucosa para subsidiar a investigação e o acompanhamento fitoterápico/médico do caso. As fotos entram no final do PDF da ficha e não ficam guardadas neste computador.</div>' +
      '<input type="file" id="nt-fotos-arq" accept="image/*" multiple class="nt-oculto">' +
      '<button type="button" class="nt-secundario" id="nt-fotos-add">📷 Anexar fotos da lesão</button>' +
      '<div id="nt-fotos-lista" class="nt-fotos-lista"></div></div>' +
      '<div class="nt-sub">Tipo de entrada *</div>' + radios("nt-tipo", L().TIPOS_ENTRADA.filter(function (t) { return t.v !== "9"; })) +
      '<div class="nt-grid2" style="margin-top:10px">' +
      '<div id="nt-linha-cicatriz" class="nt-oculto"><label class="nt-rot" for="nt-cicatriz">Cicatrizes cutâneas (lesão mucosa)</label><select id="nt-cicatriz">' + opcoes(L().CICATRIZ) + "</select></div>" +
      '<div><label class="nt-rot" for="nt-hiv">Co-infecção HIV</label><select id="nt-hiv">' + opcoes(L().HIV) + "</select></div></div></div>" +
      '<details class="nt-det nt-sec nt-so-lta" id="nt-det-lab"><summary>Exames (opcional — já vêm como “não realizado”, comum na primeira consulta)</summary>' +
      '<div class="nt-grid3"><div><label class="nt-rot" for="nt-lab-parasito">Parasitológico direto</label><select id="nt-lab-parasito">' + opcoesPadrao(L().LAB_PARASITO, pad.parasitologico) + "</select></div>" +
      '<div><label class="nt-rot" for="nt-lab-irm">IRM (Montenegro)</label><select id="nt-lab-irm">' + opcoesPadrao(L().LAB_PARASITO, pad.irm) + "</select></div>" +
      '<div><label class="nt-rot" for="nt-lab-histo">Histopatologia</label><select id="nt-lab-histo">' + opcoesPadrao(L().LAB_HISTO, pad.histopatologia) + "</select></div></div></details>" +
      '<details class="nt-det nt-sec nt-so-lta" id="nt-det-trat"><summary>Tratamento — só se foi iniciado nesta consulta (senão: “Não iniciado nesta consulta”)</summary>' +
      '<div class="nt-grid3"><div><label class="nt-rot" for="nt-data-trat">Data de início do tratamento</label><input type="date" id="nt-data-trat"></div>' +
      '<div><label class="nt-rot" for="nt-droga">Droga inicial administrada</label><select id="nt-droga">' + opcoes(L().DROGAS) + "</select></div>" +
      campo("nt-peso", "Peso (kg)", 'inputmode="decimal" maxlength="5"') + '</div>' +
      '<div class="nt-idade" id="nt-aviso-trat">Não iniciado nesta consulta.</div></details>';
  }

  const HTML =
    '<div id="nt-modal" role="dialog" aria-modal="true">' +
    raiz.MeedsSuiteCabecalho.html({
      tom: "documento",
      titulo: "Ficha de notificação",
      idTitulo: "nt-titulo",
      idFechar: "nt-fechar",
      acoes: [
        { id: "nt-trocar", rotulo: "↩ Trocar ficha", titulo: "Volta para a escolha da ficha" },
        { id: "nt-atualizar", rotulo: "🔄 Atualizar paciente", titulo: "Lê a tela do atendimento e busca os dados do paciente atual" },
      ],
    }) +
    '<div id="nt-body">' + ESCOLHA + '<div id="nt-form">' +
    '<div class="nt-info" id="nt-info"></div>' +
    '<div id="nt-aviso-auto"></div>' +
    '<div id="nt-alerta" role="alert"></div>' +
    '<div class="nt-so-dengue">' + secaoDoenca() + secaoSintomas() + secaoAlarme() + "</div>" +
    secaoLta() + secaoPaciente() + secaoResidencia() + secaoUnidade() + secaoObservacoes() +
    '<div id="nt-sucesso"></div><div id="nt-erro"></div>' +
    "</div></div>" +
    '<div id="nt-footer"><button class="nt-secundario" id="nt-limpar" type="button">Limpar</button>' +
    '<button class="nt-primario" id="nt-gerar" type="button">Gerar e baixar PDF</button></div>' +
    "</div>";

  /* ----------------------------------------------------------------
   * Obrigatorios: o guia pergunta a MESMA validacao que recusa a geracao
   * ---------------------------------------------------------------- */
  function soDengue() { return ficha === "dengue"; }
  function soLta() { return ficha === "lta"; }

  const OBRIGATORIOS = [
    { campo: "formaClinica", id: "nt-forma-1", rotulo: "Forma clínica", descricao: "a forma clínica", comoResolver: "cutânea (pele) ou mucosa (nariz/boca)", so: soLta },
    { campo: "tipoEntrada", id: "nt-tipo-1", rotulo: "Tipo de entrada", descricao: "o tipo de entrada", comoResolver: "caso novo, recidiva ou transferência", so: soLta },
    { campo: "dataTratamento", id: "nt-data-trat", rotulo: "Data do tratamento", descricao: "a data de início do tratamento", comoResolver: "informe a data (ou limpe a droga)", so: function () { return soLta() && !!valor("nt-droga") && valor("nt-droga") !== "5"; } },
    { campo: "drogaInicial", id: "nt-droga", rotulo: "Droga inicial", descricao: "a droga inicial administrada", comoResolver: "escolha a droga do tratamento iniciado", so: function () { return soLta() && !!valor("nt-data-trat"); } },
    { campo: "peso", id: "nt-peso", rotulo: "Peso", descricao: "o peso em kg", comoResolver: "a dose é calculada por quilo", so: function () { return soLta() && !!valor("nt-data-trat"); } },
    { campo: "agravo", id: "nt-agravo-dengue", rotulo: "Doença suspeita", descricao: "a doença suspeita", comoResolver: "escolha Dengue ou Chikungunya", so: soDengue },
    { campo: "inicioSintomas", id: "nt-inicio", rotulo: "Início dos sintomas", descricao: "a data de início dos sintomas", comoResolver: "no máximo 15 dias atrás, nunca futura", so: soDengue },
    { campo: "sinais", id: "nt-sinais", rotulo: "Sinais clínicos", descricao: "ao menos um sinal clínico", comoResolver: "marque os presentes", so: soDengue },
    { campo: "alarme", id: "nt-sec-alarme", rotulo: "Sinais de alarme", descricao: "a confirmação dos sinais de alarme", comoResolver: "marque os existentes ou “Sem sinais de alarme”", so: soDengue },
    { campo: "nome", id: "nt-nome", rotulo: "Nome completo", descricao: "o nome do paciente", comoResolver: "clique em “Atualizar paciente” para ler da tela" },
    { campo: "nascimento", id: "nt-nasc", rotulo: "Data de nascimento", descricao: "a data de nascimento", comoResolver: "clique em “Atualizar paciente” para ler da tela" },
    { campo: "sexo", id: "nt-sexo-f", rotulo: "Sexo", descricao: "o sexo do paciente", comoResolver: "clique em “Atualizar paciente” para ler da tela" },
    { campo: "gestante", id: "nt-gestante", rotulo: "Gestante", descricao: "se a paciente está gestante", comoResolver: "escolha o trimestre ou “Não”",
      so: function () { return radio("nt-sexo") === "F"; } },
    { campo: "ufRes", id: "nt-uf-res", rotulo: "UF de residência", descricao: "a UF de residência", comoResolver: "é onde a vigilância vai agir" },
    { campo: "municipioRes", id: "nt-mun-res", rotulo: "Município de residência", descricao: "o município de residência", comoResolver: "escolha um da lista da UF" },
    { campo: "telefone", id: "nt-telefone", rotulo: "Telefone", descricao: "o telefone de contato", comoResolver: "com DDD — é por ele que a vigilância acompanha o paciente" },
  ];

  function errosAtuais() {
    return (ficha === "lta" ? L() : F()).validar(coletar(), hojeIso());
  }

  function aplicaveis() {
    return OBRIGATORIOS.filter(function (o) { return typeof o.so !== "function" || o.so(); });
  }

  function faltando() {
    const comErro = {};
    errosAtuais().forEach(function (e) { comErro[e.campo] = true; });
    return aplicaveis().filter(function (o) { return comErro[o.campo]; });
  }

  /* ----------------------------------------------------------------
   * Comportamento da tela
   * ---------------------------------------------------------------- */
  function atualizarAlerta() {
    const caixa = el("nt-alerta");
    const ativo = ficha === "dengue" && F().temSinalDeAlarme(coletar());
    caixa.classList.toggle("ativo", ativo);
    caixa.textContent = ativo ? "🚨 " + F().TEXTO_ALERTA : "";
  }

  function atualizarCondicionais() {
    const dados = coletar();
    el("nt-linha-gestante").classList.toggle("nt-oculto", dados.sexo !== "F");
    el("nt-linha-cicatriz").classList.toggle("nt-oculto", dados.formaClinica !== "2");
    const trat = !!(dados.dataTratamento || (dados.drogaInicial && dados.drogaInicial !== "5"));
    el("nt-aviso-trat").textContent = trat ? "Tratamento iniciado: informe data, droga e peso." : "Não iniciado nesta consulta.";
    if (trat) el("nt-det-trat").open = true;
    el("nt-linha-data-alarme").classList.toggle("nt-oculto", dados.alarme.length === 0);
    el("nt-linha-data-grav").classList.toggle("nt-oculto", dados.gravidade.length === 0);
    el("nt-linha-outros").classList.toggle("nt-oculto", dados.gravidade.indexOf("outrosOrgaos") === -1);
    const idade = F().idadeDe(dados.nascimento, hojeIso());
    const rotulos = { "4": "ano(s)", "3": "mês(es)", "2": "dia(s)" };
    el("nt-idade").textContent = idade ? "Idade: " + idade.valor + " " + rotulos[idade.unidade] : "";
  }

  /* "Sem sinais de alarme" e qualquer sinal marcado se excluem. */
  function reconciliarAlarme(alvo) {
    const sem = el("nt-sem-alarme");
    const grupo = alvo && alvo.getAttribute && alvo.getAttribute("data-grupo");
    if (alvo === sem && sem.checked) {
      overlay.elemento.querySelectorAll('input[data-grupo="alarme"], input[data-grupo="gravidade"]').forEach(function (c) { c.checked = false; });
    } else if ((grupo === "alarme" || grupo === "gravidade") && alvo.checked) {
      sem.checked = false;
    }
  }

  function preencherMunicipios(idUf, idLista) {
    const lista = el(idLista);
    lista.innerHTML = "";
    F().municipiosDe(valor(idUf)).forEach(function (nome) {
      const o = document.createElement("option");
      o.value = nome;
      lista.appendChild(o);
    });
  }

  /* CNES pelo cadastro de estabelecimentos do proprio navegador. */
  function sugerirUnidades() {
    const lista = el("nt-lista-unidades");
    lista.innerHTML = "";
    const todos = d.cadastro && d.cadastro.listarEstabelecimentosDe ? d.cadastro.listarEstabelecimentosDe(valor("nt-mun-notif")) : [];
    todos.forEach(function (e) {
      const o = document.createElement("option");
      o.value = e.nome;
      lista.appendChild(o);
    });
    return todos;
  }

  function completarCnes() {
    const n = F().normalizar(valor("nt-unidade"));
    const achado = sugerirUnidades().filter(function (e) { return F().normalizar(e.nome) === n && e.cnes; })[0];
    if (achado && !valor("nt-cnes")) definir("nt-cnes", achado.cnes);
  }

  function aoMudar(ev) {
    const alvo = ev.target;
    reconciliarAlarme(alvo);
    if (alvo.id === "nt-uf-res") preencherMunicipios("nt-uf-res", "nt-lista-mun-res");
    if (alvo.id === "nt-uf-notif") preencherMunicipios("nt-uf-notif", "nt-lista-mun-notif");
    if (alvo.id === "nt-unidade" || alvo.id === "nt-mun-notif") completarCnes();
    atualizarCondicionais();
    atualizarAlerta();
    if (guia) guia.atualizar();
  }

  /* ----------------------------------------------------------------
   * Leitura da tela do atendimento
   * ---------------------------------------------------------------- */
  function preencherSeVazio(id, v, sobrescrever) {
    if (v && (sobrescrever || !valor(id))) definir(id, v);
  }

  function aplicarVinculo(vin) {
    if (vin.uf) { preencherSeVazio("nt-uf-notif", vin.uf); preencherMunicipios("nt-uf-notif", "nt-lista-mun-notif"); }
    preencherSeVazio("nt-mun-notif", vin.municipio);
    preencherSeVazio("nt-unidade", vin.unidade);
    /* O paciente costuma morar no municipio onde e atendido: sugere, e o
     * medico corrige se nao for. */
    if (vin.uf && !valor("nt-uf-res")) {
      definir("nt-uf-res", vin.uf);
      preencherMunicipios("nt-uf-res", "nt-lista-mun-res");
      preencherSeVazio("nt-mun-res", vin.municipio);
    }
    completarCnes();
  }

  function aplicarPaciente(p, sobrescrever) {
    preencherSeVazio("nt-nome", p.nome, sobrescrever);
    preencherSeVazio("nt-nasc", p.nascimentoISO, sobrescrever);
    preencherSeVazio("nt-telefone", p.telefone, sobrescrever);
    preencherSeVazio("nt-sus", F().interpretarDocumentos(d.dom.lerLinhasPorRotulo(["Documentos"])).sus, sobrescrever);
    preencherSeVazio("nt-mae", F().interpretarParentesco(d.dom.lerLinhasPorRotulo(["Parentesco", "Nome da Mãe", "Filiação"])), sobrescrever);
    if (p.sexo && (sobrescrever || !radio("nt-sexo"))) {
      const r = overlay.elemento.querySelector('input[name="nt-sexo"][value="' + p.sexo + '"]');
      if (r) r.checked = true;
    }
  }

  function lerDaTela(sobrescrever) {
    const p = d.dom.lerPaciente();
    const linhas = d.dom.lerLinhasPorRotulo(["Vínculos", "Vínculo"]);
    aplicarPaciente(p, sobrescrever);
    aplicarVinculo(F().interpretarVinculo(linhas));
    atualizarCondicionais();
    if (guia) guia.atualizar();
    return p;
  }

  /* ----------------------------------------------------------------
   * Fotos da lesao (Leishmaniose): ficam so em memoria ate o PDF sair
   * ---------------------------------------------------------------- */
  let fotos = []; // { bytes: Uint8Array (JPEG), url: miniatura }
  const LADO_MAX_FOTO = 1600;

  /* Qualquer formato que o navegador abra (inclusive HEIC no Safari) vira
   * JPEG reduzido: o PDF so entende JPEG/PNG e a foto de celular e enorme. */
  function lerFoto(arquivo) {
    return new Promise(function (resolve, reject) {
      const origem = URL.createObjectURL(arquivo);
      const img = new Image();
      img.onload = function () {
        const k = Math.min(1, LADO_MAX_FOTO / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(origem);
        c.toBlob(function (blob) {
          if (!blob) { reject(new Error("sem imagem")); return; }
          blob.arrayBuffer().then(function (buf) {
            resolve({ bytes: new Uint8Array(buf), url: URL.createObjectURL(blob) });
          }, reject);
        }, "image/jpeg", 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(origem); reject(new Error("formato não suportado")); };
      img.src = origem;
    });
  }

  function desenharFotos() {
    const caixa = el("nt-fotos-lista");
    if (!caixa) return;
    caixa.textContent = "";
    fotos.forEach(function (f, i) {
      const wrap = document.createElement("div");
      wrap.className = "nt-foto";
      const img = document.createElement("img");
      img.src = f.url;
      img.alt = "Foto " + (i + 1) + " da lesão";
      const x = document.createElement("button");
      x.type = "button";
      x.title = "Remover esta foto";
      x.textContent = "Remover";
      x.addEventListener("click", function () {
        URL.revokeObjectURL(f.url);
        fotos.splice(i, 1);
        desenharFotos();
      });
      wrap.appendChild(img);
      wrap.appendChild(x);
      caixa.appendChild(wrap);
    });
    el("nt-fotos-add").textContent = fotos.length ? "📷 Anexar mais fotos (" + fotos.length + "/" + L().MAX_FOTOS + ")" : "📷 Anexar fotos da lesão";
  }

  function limparFotos() {
    fotos.forEach(function (f) { URL.revokeObjectURL(f.url); });
    fotos = [];
    desenharFotos();
  }

  async function aoEscolherFotos(ev) {
    const arquivos = Array.prototype.slice.call(ev.target.files || []);
    ev.target.value = "";
    let recusadas = 0;
    for (let i = 0; i < arquivos.length; i++) {
      if (fotos.length >= L().MAX_FOTOS) { recusadas++; continue; }
      try {
        fotos.push(await lerFoto(arquivos[i]));
      } catch (e) {
        recusadas++;
      }
    }
    desenharFotos();
    if (recusadas) d.core.toast(recusadas + " foto(s) não entraram: formato não suportado ou limite de " + L().MAX_FOTOS + " fotos.", 5000);
  }

  function limparForm() {
    overlay.elemento.querySelectorAll("#nt-body input, #nt-body select, #nt-body textarea").forEach(function (c) {
      if (c.type === "checkbox" || c.type === "radio") c.checked = false;
      else if (c.type !== "file") c.value = "";
    });
    definir("nt-lab-parasito", L().PADRAO_LAB.parasitologico);
    definir("nt-lab-irm", L().PADRAO_LAB.irm);
    definir("nt-lab-histo", L().PADRAO_LAB.histopatologia);
    limparFotos();
    el("nt-aviso-auto").style.display = "none";
    el("nt-erro").style.display = "none";
    el("nt-sucesso").style.display = "none";
    if (seletorMedico) seletorMedico.atualizar();
    atualizarCondicionais();
    atualizarAlerta();
    if (guia) guia.atualizar();
  }

  function assinatura(p) {
    return p.nome ? p.nome + "|" + (p.nascimentoISO || "") : "";
  }

  function abrirModal() {
    const p = d.dom.lerPaciente();
    const sig = assinatura(p);
    /* Outro paciente na tela: formulario novo. Nada do anterior pode
     * sobrar (sinais clinicos de uma pessoa na ficha de outra). */
    if (sig && sig !== pacienteNoFormulario) {
      limparForm();
      pacienteNoFormulario = sig;
      ficha = ""; // outro paciente: volta para a escolha da ficha
    }
    mostrarTela();
    lerDaTela(false);
    el("nt-inicio").max = hojeIso();
    el("nt-data-trat").max = hojeIso();
    el("nt-inicio").min = diasAtras(15);
    el("nt-nasc").max = hojeIso();
    el("nt-det-unidade").open = !valor("nt-mun-notif");
    atualizarAlerta();
    overlay.abrir();
    if (raiz.MeedsSuiteTutorial) raiz.MeedsSuiteTutorial.iniciarSePrimeiraVez("notificacao", { dock: d.dock });
  }

  /* Escolha da ficha: mostra o formulario da ficha ou a tela de escolha. */
  function mostrarTela() {
    const m = el("nt-modal");
    if (ficha) m.setAttribute("data-ficha", ficha);
    else m.removeAttribute("data-ficha");
    el("nt-titulo").textContent = ficha ? FICHAS[ficha].titulo : "Ficha de notificação";
    if (ficha) el("nt-info").textContent = FICHAS[ficha].info;
    el("nt-sucesso").style.display = "none";
    el("nt-erro").style.display = "none";
    atualizarCondicionais();
    atualizarAlerta();
    if (guia) guia.atualizar();
  }

  function escolherFicha(id) {
    if (!FICHAS[id]) return;
    ficha = id;
    /* O agravo da ficha de dengue so existe nela; ao escolher "dengue" ele
     * continua em branco para o medico decidir (Dengue ou Chikungunya). */
    mostrarTela();
    lerDaTela(false);
    overlay.elemento.querySelector("#nt-modal").scrollTop = 0;
  }

  function atualizarPaciente() {
    const p = lerDaTela(true);
    pacienteNoFormulario = assinatura(p) || pacienteNoFormulario;
    const aviso = el("nt-aviso-auto");
    aviso.style.display = "block";
    aviso.textContent = p.nome
      ? "Dados lidos da tela. Confira antes de gerar."
      : "Não consegui ler os dados do paciente na tela. Preencha manualmente.";
    d.core.toast(p.nome ? "Paciente atualizado." : "Nada encontrado na tela.", 3000);
  }

  /* ----------------------------------------------------------------
   * Medico (opcional): so preenche o bloco "Investigador" da pagina 2
   * ---------------------------------------------------------------- */
  let seletorMedico = null;

  function montarMedicos() {
    seletorMedico = d.cadastro.montarSelect(el("nt-medico-sel"), {
      aoEscolher: function (ficha) {
        definir("nt-medico-nome", ficha ? ficha.nome : "");
        definir("nt-medico-funcao", ficha ? "Médico" + (ficha.crm ? " (CRM " + ficha.crm + ")" : "") : "");
      },
      aoPedirCadastro: function () { d.abrirCadastro(); },
    });
  }

  /* ----------------------------------------------------------------
   * PDF
   * ---------------------------------------------------------------- */
  function b64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function resolverPdfLib() {
    const escopos = [raiz];
    try { if (typeof unsafeWindow !== "undefined") escopos.push(unsafeWindow); } catch (e) { /* sem unsafeWindow */ }
    try { escopos.push(window); } catch (e) { /* sem window */ }
    for (let i = 0; i < escopos.length; i++) {
      if (escopos[i] && escopos[i].PDFLib) return escopos[i].PDFLib;
    }
    return null;
  }

  let pdfLibPromessa = null;
  function garantirPdfLib() {
    const direto = resolverPdfLib();
    if (direto) return Promise.resolve(direto);
    if (pdfLibPromessa) return pdfLibPromessa;
    pdfLibPromessa = new Promise(function (resolve, reject) {
      if (typeof GM_xmlhttpRequest !== "function") {
        reject(new Error("o componente pdf-lib não está disponível e o Tampermonkey não concedeu permissão para baixá-lo"));
        return;
      }
      GM_xmlhttpRequest({
        method: "GET",
        url: "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js",
        onload: function (res) {
          try {
            (0, eval)(res.responseText);
            const lib = resolverPdfLib();
            if (lib) resolve(lib);
            else reject(new Error("pdf-lib avaliado mas não exposto."));
          } catch (e) { reject(e); }
        },
        onerror: function () { reject(new Error("a rede bloqueou o download do pdf-lib")); },
      });
    });
    return pdfLibPromessa;
  }

  function baixarPdf(bytes, nomeArquivo) {
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* FONTE UNICA do documento: o botao "Gerar" e a previa passam por aqui,
   * entao o que se ve na previa e o arquivo que sera baixado. Nao valida
   * (a previa precisa desenhar com o formulario pela metade). */
  async function produzirPdf() {
    const PDFLib = await garantirPdfLib();
    const dados = coletar();
    if (!FICHAS[ficha]) throw new Error("Escolha a ficha de notificação antes de gerar.");
    const logica = ficha === "lta" ? L() : F();
    const doc = await PDFLib.PDFDocument.load(b64ToBytes(raiz[FICHAS[ficha].pdf]));
    await F().aplicarNoPdf(PDFLib, doc, logica.montarOperacoes(dados, hojeIso()));
    if (ficha === "lta" && fotos.length) {
      const h = hojeIso().split("-");
      await L().anexarFotos(PDFLib, doc, fotos.map(function (f) { return { bytes: f.bytes, tipo: "jpg" }; }),
        (dados.nome || "Paciente") + " - " + h[2] + "/" + h[1] + "/" + h[0]);
    }
    const bytes = await doc.save();
    const slug = String(dados.nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
    const doenca = ficha === "lta" ? "LEISHMANIOSE" : dados.agravo === "chikungunya" ? "CHIKUNGUNYA" : "DENGUE";
    return { bytes: bytes, filename: "NOTIFICACAO_" + doenca + "_" + (slug || "PACIENTE") + ".pdf", nome: dados.nome };
  }

  function mostrarErros(erros) {
    const caixa = el("nt-erro");
    caixa.textContent = "";
    const titulo = document.createElement("div");
    titulo.textContent = "Não consegui gerar a ficha porque " + (erros.length === 1 ? "há 1 ponto a corrigir:" : "há " + erros.length + " pontos a corrigir:");
    caixa.appendChild(titulo);
    const ul = document.createElement("ul");
    erros.forEach(function (e) {
      const li = document.createElement("li");
      li.textContent = e.mensagem;
      ul.appendChild(li);
    });
    caixa.appendChild(ul);
    caixa.style.display = "block";
    caixa.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function gerarPdf() {
    el("nt-erro").style.display = "none";
    el("nt-sucesso").style.display = "none";
    const erros = errosAtuais();
    if (erros.length) {
      mostrarErros(erros);
      if (guia) guia.apontarPrimeiroPendente();
      return;
    }
    const botao = el("nt-gerar");
    const original = botao.textContent;
    botao.textContent = "Gerando…";
    botao.disabled = true;
    try {
      const doc = await produzirPdf();
      baixarPdf(doc.bytes, doc.filename);
      const ok = el("nt-sucesso");
      ok.textContent = "";
      const negrito = document.createElement("b");
      negrito.textContent = "Ficha gerada e baixada.";
      ok.appendChild(document.createTextNode("✅ "));
      ok.appendChild(negrito);
      ok.appendChild(document.createElement("br"));
      ok.appendChild(document.createTextNode("Arquivo: " + doc.filename + " — procure na pasta de downloads. Encaminhe à vigilância epidemiológica do município conforme o fluxo local."));
      ok.style.display = "block";
      d.core.toast("Pronto — ficha de notificação baixada.", 5000);
    } catch (e) {
      const msg = e && e.message ? e.message : "";
      mostrarErros([{ mensagem: /pdf-lib|componente|rede/i.test(msg)
        ? raiz.MeedsSuiteMensagens.BIBLIOTECA_NAO_CARREGOU("pdf-lib", msg)
        : raiz.MeedsSuiteMensagens.erroTecnico("gerar o PDF", "o programa encontrou um problema ao montar o arquivo",
          "Confira os campos e tente de novo. Se repetir, avise o administrador com a mensagem entre parênteses.", msg) }]);
    } finally {
      botao.textContent = original;
      botao.disabled = false;
    }
  }

  /* ----------------------------------------------------------------
   * Montagem
   * ---------------------------------------------------------------- */
  function montarGuia() {
    guia = raiz.MeedsSuiteGuia.criar({
      aplicaveis: aplicaveis,
      faltando: faltando,
      elementoDe: function (c) { return el(c.id); },
    });
    el("nt-form").insertBefore(guia.elemento, el("nt-form").firstChild);
    guia.atualizar();
  }

  function montarUI() {
    overlay = d.dock.criarOverlay({ estilo: CSS, html: HTML });
    el("nt-fechar").addEventListener("click", overlay.fechar);
    el("nt-atualizar").addEventListener("click", atualizarPaciente);
    el("nt-fotos-add").addEventListener("click", function () { el("nt-fotos-arq").click(); });
    el("nt-fotos-arq").addEventListener("change", aoEscolherFotos);
    el("nt-trocar").addEventListener("click", function () { ficha = ""; mostrarTela(); });
    overlay.elemento.querySelectorAll(".nt-cartao").forEach(function (b) {
      b.addEventListener("click", function () { escolherFicha(b.getAttribute("data-ficha")); });
    });
    el("nt-gerar").addEventListener("click", gerarPdf);
    el("nt-limpar").addEventListener("click", limparForm);
    ["input", "change"].forEach(function (tipo) { el("nt-modal").addEventListener(tipo, aoMudar); });
    montarMedicos();
    montarGuia();
    atualizarCondicionais();
  }

  if (raiz.MeedsSuiteTutorial) {
    raiz.MeedsSuiteTutorial.registrar("notificacao", {
      titulo: "Ficha de notificação",
      passos: [
        { icone: "📋", titulo: "O que esta função faz",
          texto: "Preenche a ficha de investigação do SINAN por cima do PDF oficial, na primeira consulta: Dengue e Febre de Chikungunya, ou Leishmaniose Tegumentar Americana. Você escolhe a ficha pelo desenho e o nome. Exames, tratamento, classificação final e encerramento ficam em branco para a vigilância epidemiológica." },
        { icone: "🩺", titulo: "O que você precisa informar",
          texto: "Dengue/Chikungunya: a doença suspeita, o início dos sintomas (no máximo 15 dias atrás), ao menos um sinal clínico e a confirmação dos sinais de alarme. Leishmaniose: a forma clínica (cutânea ou mucosa) e o tipo de entrada; se iniciou o tratamento, também a droga e o peso. Dá para anexar fotos da lesão, que vão no final do PDF. Nome, nascimento, sexo, Cartão SUS e telefone vêm da tela do atendimento; confira." },
        { icone: "🚨", titulo: "Sinais de alarme (dengue)",
          texto: "Marque os sinais presentes ou escolha “Sem sinais de alarme”. Se houver algum sinal, aparece um aviso vermelho: oriente o deslocamento imediato a um serviço de pronto atendimento presencial." },
        { icone: "📍", titulo: "Onde o paciente mora",
          texto: "A vigilância age no município de residência, não onde o médico está. O município vem sugerido pela tela; troque se for outro. Escolha da lista para o código do IBGE entrar sozinho." },
        { icone: "💾", titulo: "Gerar",
          texto: "“Gerar e baixar PDF” recusa e aponta o que falta. A ficha baixada deve seguir para a vigilância do município pelo fluxo local. Nada do formulário fica gravado neste computador." },
      ],
    });
  }

  raiz.MeedsSuite.registerModule({
    id: "notificacao",
    nome: "Ficha de notificação",
    descricao: "Gera a ficha de investigação do SINAN (Dengue e Febre de Chikungunya; Leishmaniose Tegumentar Americana) na primeira consulta, com validação dos campos obrigatórios.",
    versao: "1.1.0",
    configPadrao: {},
    temBotao: true,
    assinaturasRede: [],

    start: function (deps) {
      d = deps;
      montarUI();

      function anunciarPreview() {
        deps.publicarEvento("preview:registrar-gerador", {
          id: "notificacao",
          nome: "Ficha de notificação",
          seletorModal: "#nt-modal",
          overlay: overlay,
          produzirPdf: produzirPdf,
        });
      }
      anunciarPreview();
      deps.assinarEvento("preview:pronto", function () {
        anunciarPreview();
        return true;
      });

      deps.aoMudarCadastro(function () {
        if (seletorMedico) seletorMedico.atualizar();
      });
      deps.aoClicarBotao(abrirModal);
      if (typeof deps.aoIniciarTutorial === "function") {
        deps.aoIniciarTutorial(function () {
          if (raiz.MeedsSuiteTutorial) raiz.MeedsSuiteTutorial.iniciar("notificacao", { dock: d.dock });
        });
      }
    },

    stop: function () {
      limparFotos();
      if (overlay) { overlay.remover(); overlay = null; }
      guia = null;
      seletorMedico = null;
      pacienteNoFormulario = "";
      d = null;
    },
  });
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
