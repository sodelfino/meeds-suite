/* ------------------------------------------------------------------
 * modules/lme-mg/index.js — LME de Minas Gerais (medicamentos)
 * ------------------------------------------------------------------
 * Gera o LME — COMPONENTE ESPECIALIZADO DA ASSISTENCIA FARMACEUTICA,
 * LAUDO DE SOLICITACAO, AVALIACAO E AUTORIZACAO DE MEDICAMENTO(S) — no
 * formulario oficial editavel da SES-MG, com os dados do paciente da tela.
 *
 * Este arquivo e a TELA e a ligacao com o nucleo. O que decide algo (o
 * que e obrigatorio — cada asterisco do formulario —, o que vai em cada
 * campo, como preencher o PDF) vive em lme-mg-ficha.js, que nao conhece
 * DOM e e testado em Node (tests/lme-mg.test.js).
 *
 * PREMISSA DO SISTEMA: o documento do paciente e do medico e SEMPRE o
 * CPF, nunca o CNS (ver o cabecalho de lme-mg-ficha.js).
 *
 * PRIVACIDADE: nada do formulario e gravado em disco. Ao abrir o
 * atendimento de outro paciente, o formulario e limpo (menos medico e
 * estabelecimento, que nao sao do paciente).
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  let d = null;
  let overlay = null;
  let guia = null;
  let seletorMedico = null;
  let pacienteNoFormulario = ""; // assinatura (nome|nascimento) de quem esta no formulario
  let linhasVisiveis = 1;

  const M = function () { return raiz.MeedsLmeMg; };
  const LINHAS = 6;
  const MESES = ["1º", "2º", "3º", "4º", "5º", "6º"];

  /* ----------------------------------------------------------------
   * Datas e acesso aos campos
   * ---------------------------------------------------------------- */
  function dois(n) { return String(n).padStart(2, "0"); }
  function hojeIso() { const t = new Date(); return t.getFullYear() + "-" + dois(t.getMonth() + 1) + "-" + dois(t.getDate()); }

  function el(id) { return overlay ? overlay.elemento.querySelector("#" + id) : null; }
  function valor(id) { const e = el(id); return e ? String(e.value || "").trim() : ""; }
  function definir(id, v) { const e = el(id); if (e) e.value = v; }
  function radio(nome) {
    const r = overlay.elemento.querySelector('input[name="' + nome + '"]:checked');
    return r ? r.value : "";
  }

  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ----------------------------------------------------------------
   * Os dados do formulario, no formato que a logica entende
   * ---------------------------------------------------------------- */
  function medicamentos() {
    const lista = [];
    for (let i = 1; i <= LINHAS; i++) {
      const qtd = [];
      for (let m = 1; m <= 6; m++) qtd.push(valor("lm-q-" + i + "-" + m));
      lista.push({ nome: valor("lm-med-" + i), qtd: qtd });
    }
    return lista;
  }

  function coletar() {
    return {
      cnes: valor("lm-cnes"), estabelecimento: valor("lm-estab"),
      nome: valor("lm-nome"), nomeSocial: valor("lm-social"), mae: valor("lm-mae"), peso: valor("lm-peso"), altura: valor("lm-altura"),
      medicamentos: medicamentos(),
      cid: valor("lm-cid"), diagnostico: valor("lm-diag"), anamnese: valor("lm-anamnese"),
      tratamentoPrevio: radio("lm-trat"), tratamentoRelato: valor("lm-trat-relato"),
      incapaz: radio("lm-incapaz"), responsavel: valor("lm-responsavel"),
      medicoNome: valor("lm-medico-nome"), medicoCpf: valor("lm-medico-cpf"), data: valor("lm-data"),
      preenchidoPor: radio("lm-por"), outroNome: valor("lm-outro-nome"), outroCpf: valor("lm-outro-cpf"),
      raca: radio("lm-raca"), etnia: valor("lm-etnia"),
      tel1Ddd: valor("lm-tel1-ddd"), tel1: valor("lm-tel1"), tel2Ddd: valor("lm-tel2-ddd"), tel2: valor("lm-tel2"),
      cpfPaciente: valor("lm-cpf"), email: valor("lm-email"),
    };
  }

  /* ----------------------------------------------------------------
   * HTML
   * ---------------------------------------------------------------- */
  function campo(id, rotulo, extra, largura) {
    return '<div' + (largura ? ' style="grid-column:span ' + largura + '"' : "") + '><label class="lm-rot" for="' + id + '">' + esc(rotulo) + '</label><input type="text" id="' + id + '" autocomplete="off" ' + (extra || "") + "></div>";
  }

  function radios(nome, itens) {
    return '<div class="lm-radios">' + itens.map(function (i) {
      return '<label class="lm-radio"><input type="radio" name="' + nome + '" id="' + nome + "-" + esc(i.id) + '" value="' + esc(i.id) + '"> ' + esc(i.rotulo) + "</label>";
    }).join("") + "</div>";
  }

  const CSS = [
    raiz.MeedsSuiteCabecalho.CSS,
    raiz.MeedsSuiteGuia.CSS,
    "#lm-modal { background:#fff; border-radius:6px; max-width:780px; width:100%; max-height:90vh; overflow-y:auto; box-shadow:0 8px 24px rgba(15,23,42,.2); }",
    "#lm-body { padding:16px 20px; }",
    ".lm-sec { margin-bottom:16px; }",
    ".lm-sec h3 { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#123a7a; margin:0 0 8px; }",
    ".lm-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }",
    ".lm-grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }",
    ".lm-grid4 { display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; }",
    "#lm-body label.lm-rot { display:block; font-size:10.5px; font-weight:700; color:#5b6672; margin-bottom:4px; }",
    "#lm-body input[type=text], #lm-body input[type=date], #lm-body select, #lm-body textarea {",
    "  width:100%; box-sizing:border-box; padding:8px 9px; border:1px solid #d8dfe6; border-radius:7px; font-size:12.5px; color:#16221f; background:#fff; }",
    "#lm-body textarea { min-height:90px; resize:vertical; }",
    ".lm-radios { display:flex; flex-wrap:wrap; gap:6px 18px; }",
    ".lm-radio { display:flex; align-items:center; gap:7px; font-size:12.5px; color:#16221f; cursor:pointer; }",
    ".lm-sub { font-size:11px; font-weight:700; color:#5b6672; margin:10px 0 6px; }",
    ".lm-info { background:#e8f0f8; color:#123a7a; font-size:11px; padding:8px 10px; border-radius:7px; margin-bottom:12px; line-height:1.4; }",
    ".lm-med { border:1px solid #e2e8f0; border-radius:9px; padding:10px; margin-bottom:8px; background:#fafcff; }",
    ".lm-meses { display:grid; grid-template-columns:repeat(6, 1fr) auto; gap:6px; margin-top:6px; align-items:end; }",
    ".lm-meses label.lm-rot { text-align:center; margin-bottom:2px; }",
    "#lm-body .lm-meses input { text-align:center; padding:7px 4px; }",
    ".lm-contador { font-size:10.5px; color:#5b6672; text-align:right; margin-top:3px; }",
    ".lm-contador.lm-estourou { color:#a12626; font-weight:700; }",
    "#lm-aviso-auto { display:none; background:#fff4e2; color:#a15c00; font-size:11px; padding:8px 10px; border-radius:7px; margin-bottom:12px; }",
    "#lm-erro { display:none; background:#fde8e8; border:1px solid #f0b8b8; color:#a12626; font-size:11.5px; padding:10px 12px; border-radius:8px; margin-top:6px; line-height:1.5; }",
    "#lm-erro ul { margin:6px 0 0; padding-left:18px; }",
    "#lm-sucesso { display:none; background:#e6f6f2; border:1px solid #9ed8c9; color:#0b6a62; font-size:12.5px; line-height:1.55; padding:11px 13px; border-radius:9px; margin-top:6px; }",
    ".lm-oculto { display:none; }",
    "#lm-footer { display:flex; justify-content:flex-end; gap:8px; padding:14px 20px; border-top:1px solid #eee; }",
    "button.lm-primario { background:#1a4fa0; color:#fff; border:none; border-radius:9px; padding:10px 18px; font-size:13px; font-weight:800; cursor:pointer; }",
    "button.lm-primario:hover { background:#123a7a; }",
    "button.lm-primario:disabled { background:#a7bcdd; cursor:not-allowed; }",
    "button.lm-secundario { background:#fff; color:#123a7a; border:1.4px solid #1a56ad; border-radius:9px; padding:9px 14px; font-size:12.5px; font-weight:700; cursor:pointer; }",
    "button.lm-mini { background:#fff; color:#123a7a; border:1px solid #1a56ad; border-radius:7px; padding:6px 8px; font-size:10.5px; font-weight:700; cursor:pointer; }",
    "@media (max-width:640px) { .lm-grid2, .lm-grid3, .lm-grid4 { grid-template-columns:1fr; } .lm-meses { grid-template-columns:repeat(3, 1fr); } }",
  ].join("\n");

  function secaoEstabelecimento() {
    return '<div class="lm-sec"><h3>Estabelecimento solicitante</h3><div class="lm-grid3">' +
      campo("lm-cnes", "1. CNES * (7 dígitos)", 'inputmode="numeric" maxlength="7"') +
      campo("lm-estab", "2. Nome do estabelecimento", 'maxlength="90" list="lm-lista-unidades"', 2) +
      '<datalist id="lm-lista-unidades"></datalist></div></div>';
  }

  function secaoPaciente() {
    const racas = M().RACAS;
    return '<div class="lm-sec"><h3>Paciente</h3>' +
      '<div class="lm-grid2">' + campo("lm-nome", "3.1 Nome civil completo *", 'maxlength="100"') + campo("lm-social", "3.2 Nome social", 'maxlength="100"') + "</div>" +
      '<div class="lm-grid3" style="margin-top:8px">' + campo("lm-mae", "4. Nome da mãe *", 'maxlength="100"') + campo("lm-peso", "5. Peso (kg) *", 'inputmode="decimal" maxlength="6" placeholder="62,5"') + campo("lm-altura", "6. Altura (cm) *", 'inputmode="numeric" maxlength="3" placeholder="165"') + "</div>" +
      '<div class="lm-grid3" style="margin-top:8px">' + campo("lm-cpf", "21. CPF do paciente * (sempre o CPF)", 'inputmode="numeric" maxlength="14" placeholder="000.000.000-00"') +
      campo("lm-email", "22. E-mail", 'maxlength="80"', 2) + "</div>" +
      '<div id="lm-sec-raca" style="margin-top:10px"><div class="lm-sub">19. Raça/cor *</div>' + radios("lm-raca", racas) + "</div>" +
      '<div id="lm-linha-etnia" class="lm-oculto" style="margin-top:8px;max-width:320px">' + campo("lm-etnia", "Etnia (raça/cor indígena) *", 'maxlength="30"') + "</div>" +
      '<div class="lm-sub">20. Telefone(s) de contato * (DDD + número)</div><div class="lm-grid4">' +
      campo("lm-tel1-ddd", "DDD", 'inputmode="numeric" maxlength="2"') + campo("lm-tel1", "Telefone *", 'inputmode="tel" maxlength="10"') +
      campo("lm-tel2-ddd", "DDD (2º)", 'inputmode="numeric" maxlength="2"') + campo("lm-tel2", "2º telefone", 'inputmode="tel" maxlength="10"') + "</div></div>";
  }

  function linhaMedicamento(i) {
    const meses = MESES.map(function (rotulo, m) {
      return '<div><label class="lm-rot" for="lm-q-' + i + "-" + (m + 1) + '">' + rotulo + ' mês</label><input type="text" id="lm-q-' + i + "-" + (m + 1) + '" inputmode="numeric" maxlength="4"></div>';
    }).join("");
    return '<div class="lm-med' + (i > 1 ? " lm-oculto" : "") + '" id="lm-linha-' + i + '">' +
      campo("lm-med-" + i, i + ". Medicamento" + (i === 1 ? " *" : "") + " (nome conforme a Tabela SUS)", 'maxlength="85" autocomplete="off"') +
      '<div class="lm-meses">' + meses + '<button type="button" class="lm-mini" data-repetir="' + i + '" title="Copia a quantidade do 1º mês para os 6 meses">Repetir 1º mês</button></div></div>';
  }

  function secaoMedicamentos() {
    let linhas = "";
    for (let i = 1; i <= LINHAS; i++) linhas += linhaMedicamento(i);
    return '<div class="lm-sec" id="lm-sec-med"><h3>7. Medicamentos * e 8. Quantidade solicitada por mês *</h3>' + linhas +
      '<button type="button" class="lm-secundario" id="lm-mais-med">＋ Adicionar medicamento</button></div>';
  }

  function secaoClinica() {
    return '<div class="lm-sec"><h3>Diagnóstico e história clínica</h3>' +
      '<div class="lm-grid3">' + campo("lm-cid", "9. CID-10 *", 'maxlength="7" placeholder="digite ou busque (M05.8)"') + campo("lm-diag", "10. Diagnóstico", 'maxlength="100"', 2) + "</div>" +
      '<div style="margin-top:8px"><label class="lm-rot" for="lm-anamnese">11. Anamnese *</label><textarea id="lm-anamnese" maxlength="' + M().MAX_ANAMNESE + '"></textarea><div class="lm-contador" id="lm-anamnese-cont"></div></div>' +
      '<div id="lm-sec-trat" style="margin-top:8px"><div class="lm-sub">12. Paciente realizou tratamento prévio ou está em tratamento na doença? *</div>' +
      radios("lm-trat", [{ id: "nao", rotulo: "Não" }, { id: "sim", rotulo: "Sim — relatar o esquema" }]) +
      '<div id="lm-linha-relato" class="lm-oculto" style="margin-top:6px"><label class="lm-rot" for="lm-trat-relato">Esquema(s) terapêutico(s) utilizado(s) *</label><input type="text" id="lm-trat-relato" maxlength="' + M().MAX_RELATO + '"></div></div>' +
      '<div id="lm-sec-incapaz" style="margin-top:8px"><div class="lm-sub">13. Atestado de capacidade: o paciente é considerado incapaz (arts. 3º e 4º do Código Civil)? *</div>' +
      radios("lm-incapaz", [{ id: "nao", rotulo: "Não" }, { id: "sim", rotulo: "Sim — indicar o responsável" }]) +
      '<div id="lm-linha-responsavel" class="lm-oculto" style="margin-top:6px">' + campo("lm-responsavel", "Nome do responsável pelo paciente *", 'maxlength="60"') + "</div></div></div>";
  }

  function secaoMedico() {
    return '<div class="lm-sec"><h3>Médico solicitante</h3>' +
      '<div class="lm-grid3"><div><label class="lm-rot" for="lm-medico-sel">Selecionar</label><select id="lm-medico-sel"></select></div>' +
      campo("lm-medico-nome", "14. Nome do médico *", 'maxlength="90"') + campo("lm-medico-cpf", "15. CPF do médico * (no lugar do CNS)", 'inputmode="numeric" maxlength="14" placeholder="000.000.000-00"') + "</div>" +
      '<div class="lm-grid3" style="margin-top:8px"><div><label class="lm-rot" for="lm-data">16. Data da solicitação *</label><input type="date" id="lm-data"></div></div></div>';
  }

  function secaoPreenchimento() {
    return '<div class="lm-sec" id="lm-sec-por"><h3>18. Campos 19 a 23 preenchidos por *</h3>' + radios("lm-por", M().PREENCHIDO_POR) +
      '<div id="lm-linha-outro" class="lm-oculto lm-grid2" style="margin-top:8px">' + campo("lm-outro-nome", "Nome completo *", 'maxlength="60"') + campo("lm-outro-cpf", "CPF *", 'inputmode="numeric" maxlength="14"') + "</div>" +
      '<div class="lm-info" style="margin-top:10px">As assinaturas e o carimbo (campos 17 e 23) ficam em branco: assine o PDF ou o papel depois de gerar.</div></div>';
  }

  const HTML =
    '<div id="lm-modal" role="dialog" aria-modal="true">' +
    raiz.MeedsSuiteCabecalho.html({
      tom: "documento",
      titulo: "LME — Medicamentos (Minas Gerais)",
      idFechar: "lm-fechar",
      acoes: [{ id: "lm-atualizar", rotulo: "🔄 Atualizar paciente", titulo: "Lê a tela do atendimento e busca os dados do paciente atual" }],
    }) +
    '<div id="lm-body">' +
    '<div class="lm-info">Laudo de Solicitação, Avaliação e Autorização de Medicamento(s) do Componente Especializado da Assistência Farmacêutica — novo modelo da SES-MG, parte de <b>solicitação</b>. Campos com * são de preenchimento obrigatório no formulário. O documento do paciente e do médico é <b>sempre o CPF</b>.</div>' +
    '<div id="lm-aviso-auto"></div>' +
    secaoEstabelecimento() + secaoPaciente() + secaoMedicamentos() + secaoClinica() + secaoMedico() + secaoPreenchimento() +
    '<div id="lm-sucesso"></div><div id="lm-erro"></div></div>' +
    '<div id="lm-footer"><button class="lm-secundario" id="lm-limpar" type="button">Limpar</button>' +
    '<button class="lm-primario" id="lm-gerar" type="button">Gerar e baixar PDF</button></div></div>';

  /* ----------------------------------------------------------------
   * Obrigatorios: o guia pergunta a MESMA validacao que recusa a geracao
   * ---------------------------------------------------------------- */
  const OBRIGATORIOS = [
    { campo: "cnes", id: "lm-cnes", rotulo: "CNES", descricao: "o CNES do estabelecimento (campo 1)", comoResolver: "7 dígitos; vem do cadastro da unidade" },
    { campo: "nome", id: "lm-nome", rotulo: "Nome do paciente", descricao: "o nome do paciente (3.1)", comoResolver: "clique em “Atualizar paciente”" },
    { campo: "mae", id: "lm-mae", rotulo: "Nome da mãe", descricao: "o nome da mãe (4)", comoResolver: "pergunte ao paciente" },
    { campo: "peso", id: "lm-peso", rotulo: "Peso", descricao: "o peso em kg (5)", comoResolver: "ex.: 62,5" },
    { campo: "altura", id: "lm-altura", rotulo: "Altura", descricao: "a altura em cm (6)", comoResolver: "ex.: 165" },
    { campo: "medicamentos", id: "lm-sec-med", rotulo: "Medicamentos", descricao: "o medicamento e a quantidade mensal (7 e 8)", comoResolver: "nome e quantidade em ao menos um mês" },
    { campo: "cid", id: "lm-cid", rotulo: "CID-10", descricao: "o CID-10 (9)", comoResolver: "digite o nome da doença ou o código" },
    { campo: "anamnese", id: "lm-anamnese", rotulo: "Anamnese", descricao: "a anamnese (11)", comoResolver: "histórico do paciente até a observação clínica" },
    { campo: "tratamentoPrevio", id: "lm-trat-nao", rotulo: "Tratamento prévio", descricao: "se houve tratamento prévio (12)", comoResolver: "não ou sim (com o relato)" },
    { campo: "tratamentoRelato", id: "lm-trat-relato", rotulo: "Relato do tratamento", descricao: "o relato do tratamento prévio", comoResolver: "esquemas já utilizados", so: function () { return radio("lm-trat") === "sim"; } },
    { campo: "incapaz", id: "lm-incapaz-nao", rotulo: "Atestado de capacidade", descricao: "o atestado de capacidade (13)", comoResolver: "não ou sim (com o responsável)" },
    { campo: "responsavel", id: "lm-responsavel", rotulo: "Responsável", descricao: "o nome do responsável pelo paciente", comoResolver: "paciente considerado incapaz", so: function () { return radio("lm-incapaz") === "sim"; } },
    { campo: "medicoNome", id: "lm-medico-nome", rotulo: "Nome do médico", descricao: "o nome do médico (14)", comoResolver: "escolha o médico na lista" },
    { campo: "medicoCpf", id: "lm-medico-cpf", rotulo: "CPF do médico", descricao: "o CPF do médico (15)", comoResolver: "sempre o CPF, não o CNS" },
    { campo: "data", id: "lm-data", rotulo: "Data da solicitação", descricao: "a data da solicitação (16)", comoResolver: "hoje, ou outra data não futura" },
    { campo: "preenchidoPor", id: "lm-sec-por", rotulo: "Quem preencheu", descricao: "quem preencheu os campos 19 a 23 (18)", comoResolver: "marque uma opção" },
    { campo: "outroNome", id: "lm-outro-nome", rotulo: "Nome de quem preencheu", descricao: "o nome de quem preencheu", comoResolver: "opção “Outro”", so: function () { return radio("lm-por") === "outro"; } },
    { campo: "outroCpf", id: "lm-outro-cpf", rotulo: "CPF de quem preencheu", descricao: "o CPF de quem preencheu", comoResolver: "opção “Outro”", so: function () { return radio("lm-por") === "outro"; } },
    { campo: "raca", id: "lm-sec-raca", rotulo: "Raça/cor", descricao: "a raça/cor (19)", comoResolver: "conforme declarado pelo paciente" },
    { campo: "etnia", id: "lm-etnia", rotulo: "Etnia", descricao: "a etnia (raça/cor indígena)", comoResolver: "conforme a tabela de etnias", so: function () { return radio("lm-raca") === "indigena"; } },
    { campo: "tel1", id: "lm-tel1", rotulo: "Telefone", descricao: "o telefone com DDD (20)", comoResolver: "DDD + 8 ou 9 dígitos" },
    { campo: "cpfPaciente", id: "lm-cpf", rotulo: "CPF do paciente", descricao: "o CPF do paciente (21)", comoResolver: "sempre o CPF, não o CNS" },
  ];

  function errosAtuais() { return M().validar(coletar(), hojeIso()); }
  function aplicaveis() { return OBRIGATORIOS.filter(function (o) { return typeof o.so !== "function" || o.so(); }); }
  function faltando() {
    const comErro = {};
    errosAtuais().forEach(function (e) { comErro[e.campo] = true; });
    return aplicaveis().filter(function (o) { return comErro[o.campo]; });
  }

  /* ----------------------------------------------------------------
   * Comportamento da tela
   * ---------------------------------------------------------------- */
  function mostrarLinhas() {
    for (let i = 1; i <= LINHAS; i++) {
      const preenchida = i === 1 || i <= linhasVisiveis || valor("lm-med-" + i);
      el("lm-linha-" + i).classList.toggle("lm-oculto", !preenchida);
      if (preenchida && i > linhasVisiveis) linhasVisiveis = i;
    }
    el("lm-mais-med").style.display = linhasVisiveis >= LINHAS ? "none" : "";
  }

  function atualizarCondicionais() {
    const dados = coletar();
    el("lm-linha-etnia").classList.toggle("lm-oculto", dados.raca !== "indigena");
    el("lm-linha-relato").classList.toggle("lm-oculto", dados.tratamentoPrevio !== "sim");
    el("lm-linha-responsavel").classList.toggle("lm-oculto", dados.incapaz !== "sim");
    el("lm-linha-outro").classList.toggle("lm-oculto", dados.preenchidoPor !== "outro");
    const cont = el("lm-anamnese-cont");
    cont.textContent = dados.anamnese.length + " / " + M().MAX_ANAMNESE + " caracteres";
    cont.classList.toggle("lm-estourou", dados.anamnese.length > M().MAX_ANAMNESE);
    mostrarLinhas();
  }

  function aoMudar(ev) {
    const alvo = ev.target;
    if (alvo.id === "lm-cid") {
      const maiusc = alvo.value.toUpperCase();
      if (alvo.value !== maiusc) alvo.value = maiusc;
    }
    if (alvo.id === "lm-estab") completarCnes();
    atualizarCondicionais();
    if (guia) guia.atualizar();
  }

  function repetirPrimeiroMes(i) {
    const q1 = valor("lm-q-" + i + "-1");
    if (!q1) { d.core.toast("Preencha a quantidade do 1º mês primeiro.", 3000); return; }
    for (let m = 2; m <= 6; m++) definir("lm-q-" + i + "-" + m, q1);
    if (guia) guia.atualizar();
  }

  /* ----------------------------------------------------------------
   * Leitura da tela do atendimento
   * ---------------------------------------------------------------- */
  function preencherSeVazio(id, v, sobrescrever) {
    if (v && (sobrescrever || !valor(id))) definir(id, v);
  }

  /* "(22) 99772-1523" -> { ddd: "22", numero: "997721523" }. Sem DDD no
   * texto, so o numero. */
  function separarTelefone(texto) {
    const x = String(texto || "").replace(/\D/g, "").replace(/^0+/, "");
    if (x.length === 10 || x.length === 11) return { ddd: x.slice(0, 2), numero: x.slice(2) };
    return { ddd: "", numero: x };
  }

  /* Mae so quando ha certeza (linha "Mae: X" ou uma unica linha): com dois
   * nomes sem rotulo, prefere branco a gravar o nome errado. */
  function maeDasLinhas(linhas) {
    const limpas = (linhas || []).map(function (l) { return String(l || "").trim(); }).filter(Boolean);
    for (let i = 0; i < limpas.length; i++) {
      const m = limpas[i].match(/^m[aã]e\s*[:-]\s*(.+)$/i);
      if (m) return m[1].trim();
    }
    return limpas.length === 1 && !/^(pai|respons)/i.test(limpas[0]) ? limpas[0] : "";
  }

  /* Municipio e unidade do "Vinculos": a cidade vem numa linha
   * ("MACAE - RJ" ou "PREFEITURA MUNICIPAL DE MACAE") e a unidade na outra. */
  function lerVinculo() {
    const linhas = d.dom.lerLinhasPorRotulo(["Vínculos", "Vínculo"]) || [];
    const out = { municipio: "", unidade: "" };
    linhas.forEach(function (linha, i) {
      const t = String(linha || "").trim();
      const cidade = t.match(/^(.+?)\s+-\s+[A-Za-z]{2}$/) || t.match(/^prefeitura\s+(?:municipal\s+)?(?:de|do|da)\s+(.+)$/i);
      if (cidade && !out.municipio && i === 0) out.municipio = cidade[1].trim();
      else if (!out.unidade && t) out.unidade = t;
    });
    return out;
  }

  function sugerirUnidades(municipio) {
    const lista = el("lm-lista-unidades");
    lista.innerHTML = "";
    const todos = d.cadastro && d.cadastro.listarEstabelecimentosDe ? d.cadastro.listarEstabelecimentosDe(municipio || "") : [];
    todos.forEach(function (e) {
      const o = document.createElement("option");
      o.value = e.nome;
      lista.appendChild(o);
    });
    return todos;
  }

  let municipioDaTela = "";

  function completarCnes() {
    const n = String(valor("lm-estab")).toLowerCase();
    const achado = sugerirUnidades(municipioDaTela).filter(function (e) { return String(e.nome).toLowerCase() === n && e.cnes; })[0];
    if (achado && !valor("lm-cnes")) definir("lm-cnes", achado.cnes);
  }

  function aplicarPaciente(p, sobrescrever) {
    preencherSeVazio("lm-nome", p.nome, sobrescrever);
    preencherSeVazio("lm-cpf", M().formatarCpf(p.cpf), sobrescrever);
    const tel = separarTelefone(p.telefone);
    preencherSeVazio("lm-tel1-ddd", tel.ddd, sobrescrever);
    preencherSeVazio("lm-tel1", tel.numero, sobrescrever);
    preencherSeVazio("lm-mae", maeDasLinhas(d.dom.lerLinhasPorRotulo(["Parentesco", "Nome da Mãe", "Filiação"])), sobrescrever);
  }

  function lerDaTela(sobrescrever) {
    const p = d.dom.lerPaciente();
    aplicarPaciente(p, sobrescrever);
    const v = lerVinculo();
    municipioDaTela = v.municipio;
    sugerirUnidades(municipioDaTela);
    preencherSeVazio("lm-estab", v.unidade, sobrescrever);
    completarCnes();
    atualizarCondicionais();
    if (guia) guia.atualizar();
    return p;
  }

  function limparForm() {
    overlay.elemento.querySelectorAll("#lm-body input, #lm-body select, #lm-body textarea").forEach(function (c) {
      if (c.type === "checkbox" || c.type === "radio") c.checked = false;
      else c.value = "";
    });
    definir("lm-data", hojeIso());
    overlay.elemento.querySelector("#lm-por-medico").checked = true;
    linhasVisiveis = 1;
    el("lm-aviso-auto").style.display = "none";
    el("lm-erro").style.display = "none";
    el("lm-sucesso").style.display = "none";
    if (seletorMedico) seletorMedico.atualizar();
    atualizarCondicionais();
    if (guia) guia.atualizar();
  }

  function assinatura(p) { return p.nome ? p.nome + "|" + (p.nascimentoISO || "") : ""; }

  function abrirModal() {
    const p = d.dom.lerPaciente();
    const sig = assinatura(p);
    /* Outro paciente na tela: formulario novo. Nada do anterior pode sobrar
     * (medicamento e anamnese de uma pessoa no laudo de outra). Medico e
     * estabelecimento nao sao do paciente: ficam. */
    if (sig && sig !== pacienteNoFormulario) {
      const medico = { nome: valor("lm-medico-nome"), cpf: valor("lm-medico-cpf") };
      const estab = { nome: valor("lm-estab"), cnes: valor("lm-cnes") };
      limparForm();
      definir("lm-medico-nome", medico.nome);
      definir("lm-medico-cpf", medico.cpf);
      definir("lm-estab", estab.nome);
      definir("lm-cnes", estab.cnes);
      pacienteNoFormulario = sig;
    }
    if (!valor("lm-data")) definir("lm-data", hojeIso());
    el("lm-data").max = hojeIso();
    lerDaTela(false);
    overlay.abrir();
    if (raiz.MeedsSuiteTutorial) raiz.MeedsSuiteTutorial.iniciarSePrimeiraVez("lme-mg", { dock: d.dock });
  }

  function atualizarPaciente() {
    const p = lerDaTela(true);
    pacienteNoFormulario = assinatura(p) || pacienteNoFormulario;
    const aviso = el("lm-aviso-auto");
    aviso.style.display = "block";
    aviso.textContent = p.nome ? "Dados lidos da tela. Confira antes de gerar." : "Não consegui ler os dados do paciente na tela. Preencha manualmente.";
    d.core.toast(p.nome ? "Paciente atualizado." : "Nada encontrado na tela.", 3000);
  }

  /* ----------------------------------------------------------------
   * Medico
   * ---------------------------------------------------------------- */
  function montarMedicos() {
    seletorMedico = d.cadastro.montarSelect(el("lm-medico-sel"), {
      aoEscolher: function (ficha) {
        definir("lm-medico-nome", ficha ? ficha.nome : "");
        definir("lm-medico-cpf", ficha ? M().formatarCpf(ficha.cpf) : "");
        if (guia) guia.atualizar();
      },
      aoPedirCadastro: function () { d.abrirCadastro(); },
    });
  }

  /* CID: o modulo de busca (cid10) conecta o campo; a escolha traz o codigo
   * e a descricao, que preenche o diagnostico se ele estiver vazio. */
  function aoEscolherCid(codigo, descricao) {
    definir("lm-cid", codigo);
    if (descricao && (!valor("lm-diag") || el("lm-diag").dataset.auto === "1")) {
      definir("lm-diag", String(descricao).slice(0, 100));
      el("lm-diag").dataset.auto = "1";
    }
    atualizarCondicionais();
    if (guia) guia.atualizar();
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

  /* FONTE UNICA do documento: o botao "Gerar" e a previa passam por aqui. */
  async function produzirPdf() {
    const PDFLib = await garantirPdfLib();
    const dados = coletar();
    const doc = await PDFLib.PDFDocument.load(b64ToBytes(raiz.MEEDS_LME_MG_BASE_PDF_B64));
    await M().preencherPdf(PDFLib, doc, dados, hojeIso());
    const bytes = await doc.save();
    const slug = String(dados.nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
    return { bytes: bytes, filename: "LME_MG_" + (slug || "PACIENTE") + ".pdf", nome: dados.nome };
  }

  function mostrarErros(erros) {
    const caixa = el("lm-erro");
    caixa.textContent = "";
    const titulo = document.createElement("div");
    titulo.textContent = "Não consegui gerar o LME porque " + (erros.length === 1 ? "há 1 ponto a corrigir:" : "há " + erros.length + " pontos a corrigir:");
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

  function mostrarSucesso(nomeArquivo) {
    const ok = el("lm-sucesso");
    ok.textContent = "";
    const negrito = document.createElement("b");
    negrito.textContent = "LME gerado e baixado.";
    ok.appendChild(document.createTextNode("✅ "));
    ok.appendChild(negrito);
    ok.appendChild(document.createElement("br"));
    ok.appendChild(document.createTextNode("Arquivo: " + nomeArquivo + " — procure na pasta de downloads. O formulário continua editável; assine e carimbe (campos 17 e 23) antes de enviar."));
    ok.style.display = "block";
  }

  function erroDaGeracao(e) {
    const msg = e && e.message ? e.message : "";
    return [{ mensagem: /pdf-lib|componente|rede/i.test(msg)
      ? raiz.MeedsSuiteMensagens.BIBLIOTECA_NAO_CARREGOU("pdf-lib", msg)
      : raiz.MeedsSuiteMensagens.erroTecnico("gerar o PDF", "o programa encontrou um problema ao montar o arquivo",
        "Confira os campos e tente de novo. Se repetir, avise o administrador com a mensagem entre parênteses.", msg) }];
  }

  async function gerarPdf() {
    el("lm-erro").style.display = "none";
    el("lm-sucesso").style.display = "none";
    const erros = errosAtuais();
    if (erros.length) {
      mostrarErros(erros);
      if (guia) guia.apontarPrimeiroPendente();
      return;
    }
    const botao = el("lm-gerar");
    const original = botao.textContent;
    botao.textContent = "Gerando…";
    botao.disabled = true;
    try {
      const doc = await produzirPdf();
      baixarPdf(doc.bytes, doc.filename);
      mostrarSucesso(doc.filename);
      d.core.toast("Pronto — LME baixado.", 5000);
    } catch (e) {
      mostrarErros(erroDaGeracao(e));
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
    el("lm-body").insertBefore(guia.elemento, el("lm-body").firstChild);
    guia.atualizar();
  }

  function montarUI() {
    overlay = d.dock.criarOverlay({ estilo: CSS, html: HTML });
    el("lm-fechar").addEventListener("click", overlay.fechar);
    el("lm-atualizar").addEventListener("click", atualizarPaciente);
    el("lm-gerar").addEventListener("click", gerarPdf);
    el("lm-limpar").addEventListener("click", limparForm);
    el("lm-mais-med").addEventListener("click", function () {
      if (linhasVisiveis < LINHAS) linhasVisiveis++;
      mostrarLinhas();
    });
    overlay.elemento.querySelectorAll("[data-repetir]").forEach(function (b) {
      b.addEventListener("click", function () { repetirPrimeiroMes(Number(b.getAttribute("data-repetir"))); });
    });
    el("lm-diag").addEventListener("input", function () { el("lm-diag").dataset.auto = ""; });
    ["input", "change"].forEach(function (tipo) { el("lm-modal").addEventListener(tipo, aoMudar); });
    el("lm-por-medico").checked = true;
    definir("lm-data", hojeIso());
    montarMedicos();
    montarGuia();
    atualizarCondicionais();
  }

  if (raiz.MeedsSuiteTutorial) {
    raiz.MeedsSuiteTutorial.registrar("lme-mg", {
      titulo: "LME — Medicamentos (MG)",
      passos: [
        { icone: "💊", titulo: "O que esta função faz",
          texto: "Preenche o LME (Laudo de Solicitação, Avaliação e Autorização de Medicamento(s) do Componente Especializado da Assistência Farmacêutica) no formulário oficial editável da SES-MG. Só a parte de solicitação." },
        { icone: "🆔", titulo: "Sempre o CPF",
          texto: "O documento do paciente e o do médico é sempre o CPF, nunca o CNS. O CPF do paciente vem da tela do atendimento; o do médico, do cadastro de médicos do Assistente." },
        { icone: "✱", titulo: "Campos obrigatórios",
          texto: "Os campos com * são os do próprio formulário: CNES, paciente (nome, mãe, peso, altura), medicamentos com a quantidade de cada mês, CID-10, anamnese, tratamento prévio, atestado de capacidade, médico, data, quem preencheu, raça/cor, telefone e CPF." },
        { icone: "💾", titulo: "Gerar",
          texto: "“Gerar e baixar PDF” recusa e aponta o que falta. O arquivo continua editável: confira, assine e carimbe (campos 17 e 23). Nada do formulário fica gravado neste computador." },
      ],
    });
  }

  raiz.MeedsSuite.registerModule({
    id: "lme-mg",
    nome: "LME — Medicamentos (MG)",
    descricao: "Gera o LME (Componente Especializado da Assistência Farmacêutica) no novo modelo editável da SES-MG, com os dados do paciente da tela e o CPF no lugar do CNS.",
    versao: "1.0.0",
    configPadrao: {},
    temBotao: true,
    assinaturasRede: [],

    start: function (deps) {
      d = deps;
      montarUI();

      function anunciarPreview() {
        deps.publicarEvento("preview:registrar-gerador", {
          id: "lme-mg",
          nome: "LME — Medicamentos (MG)",
          seletorModal: "#lm-modal",
          overlay: overlay,
          produzirPdf: produzirPdf,
        });
      }
      anunciarPreview();
      deps.assinarEvento("preview:pronto", function () { anunciarPreview(); return true; });

      function anunciarCampoCid() {
        const campoCid = el("lm-cid");
        if (campoCid) deps.publicarEvento("cid:conectar-campo", { input: campoCid, aoEscolher: aoEscolherCid });
      }
      anunciarCampoCid();
      deps.assinarEvento("cid:pronto", function () { anunciarCampoCid(); return true; });

      deps.aoMudarCadastro(function () { if (seletorMedico) seletorMedico.atualizar(); });
      deps.aoClicarBotao(abrirModal);
      if (typeof deps.aoIniciarTutorial === "function") {
        deps.aoIniciarTutorial(function () {
          if (raiz.MeedsSuiteTutorial) raiz.MeedsSuiteTutorial.iniciar("lme-mg", { dock: d.dock });
        });
      }
    },

    stop: function () {
      if (overlay) { overlay.remover(); overlay = null; }
      guia = null;
      seletorMedico = null;
      pacienteNoFormulario = "";
      d = null;
    },
  });
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
