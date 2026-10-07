/* ------------------------------------------------------------------
 * modules/lme-mg/lme-mg-ficha.js — o LME de Minas Gerais, sem tela
 * ------------------------------------------------------------------
 * LME — COMPONENTE ESPECIALIZADO DA ASSISTENCIA FARMACEUTICA, LAUDO DE
 * SOLICITACAO, AVALIACAO E AUTORIZACAO DE MEDICAMENTO(S). Novo modelo
 * editavel da SES-MG (dez/2025). Diferente das fichas de notificacao, este
 * PDF oficial e um FORMULARIO com campos (AcroForm): o modulo preenche os
 * campos pelo nome (Text1... Button82) e depois acha o resultado.
 *
 * Este arquivo e PURO: nao toca DOM nem conhece o pdf-lib (chega por
 * parametro). Decide o que e obrigatorio (validar — cada asterisco do
 * proprio formulario), o que vai em cada campo (valoresDo) e aplica no PDF
 * (preencherPdf). Testado em Node: tests/lme-mg.test.js.
 *
 * PREMISSA DO SISTEMA — SEMPRE CPF, NUNCA CNS:
 *  - campo 21 (documento do paciente): a opcao CPF fica marcada e o
 *    numero do CPF e obrigatorio;
 *  - campo 15 (o formulario rotula "CNS do medico solicitante"): recebe o
 *    CPF do medico, obrigatorio. O cadastro de medicos do Assistente nao
 *    guarda CNS (docs/ARQUITETURA.md, D19) — o proprio valor do campo
 *    sai como "CPF 000.000.000-00", para nao haver duvida sobre o numero.
 *
 * ESCOPO: so a parte de SOLICITACAO (campos 1 a 23 do medico/paciente).
 * Assinatura e carimbo (17 e 23) ficam em branco: o medico assina o
 * papel/PDF. Avaliacao tecnica e autorizacao sao de outras partes do
 * processo, nao desta pagina.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  /* ------------------------------------------------------------------
   * O mapa do formulario: nome do campo no PDF -> campo do formulario
   * (conferido visualmente preenchendo cada campo com o proprio nome).
   * ------------------------------------------------------------------ */
  const CAMPO = {
    cnes: "Text1", estabelecimento: "Text2", nome: "Text3", nomeSocial: "Text4", mae: "Text5",
    peso: "Text6", altura: "Text7", cid: "Text14", diagnostico: "Text31", anamnese: "Text15",
    tratamentoPrevio: "Button29", tratamentoRelato: "Text30", incapaz: "Button38", responsavel: "Text39",
    medicoNome: "Text46", medicoCpf: "Text47", data: "Text48",
    outroNome: "Text49", outroCpf: "Text50", etnia: "Text51",
    tel1Ddd: "Text73", tel1: "Text74", tel2Ddd: "Text75", tel2: "Text76",
    documentoTipo: "Button82", cpfPaciente: "Text52", email: "Text53",
  };
  /* Linhas de medicamento (7) e as colunas de quantidade (8): 1o ao 6o mes. */
  const MEDICAMENTO = ["Text8", "Text9", "Text10", "Text11", "Text12", "Text13"];
  const QUANTIDADE = [
    ["Text16", "Text17", "Text18", "Text19", "Text20", "Text21"], // 1o mes
    ["Text22", "Text23", "Text24", "Text25", "Text26", "Text27"], // 2o
    ["Text32", "Text33", "Text34", "Text35", "Text36", "Text37"], // 3o
    ["Text40", "Text41", "Text42", "Text43", "Text44", "Text45"], // 4o
    ["Text56", "Text57", "Text58", "Text59", "Text60", "Text61"], // 5o
    ["Text62", "Text63", "Text64", "Text65", "Text66", "Text67"], // 6o
  ];
  /* Quem preencheu os campos 19 a 23 (18) e raca/cor (19): caixas de marcar. */
  const PREENCHIDO_POR = { paciente: "Button68", mae: "Button69", responsavel: "Button70", medico: "Button71", outro: "Button72" };
  const RACA = { branca: "Button77", amarela: "Button78", indigena: "Button79", preta: "Button80", parda: "Button81" };
  /* Nos tres grupos de opcao, a primeira e NAO / CPF e a segunda SIM / CNS. */
  const OPCAO = { primeira: "<1>", segunda: "<2>" };

  const MAX_MEDICAMENTOS = 6;
  const MAX_ANAMNESE = 800;
  const MAX_RELATO = 280;

  /* Largura util (pt) dos campos de uma linha, medida no PDF; o limite de
   * caracteres e conservador (MAIUSCULAS a 6 pt), assim o que a validacao
   * aceita sempre cabe. */
  const LARGURA = {
    estabelecimento: 400, nome: 431, nomeSocial: 431, mae: 556, medicamento: 333, cid: 83, diagnostico: 402,
    medicoNome: 388, medicoCpf: 270, outroNome: 201, outroCpf: 188, etnia: 103, responsavel: 256, email: 584,
  };
  function limite(chave) { return Math.floor((LARGURA[chave] - 4) / 4.2); }

  /* ------------------------------------------------------------------
   * Texto, datas, CPF
   * ------------------------------------------------------------------ */
  /* Helvetica so codifica WinAnsi; qualquer outro caractere derrubaria a
   * geracao inteira — vira "?". */
  const RX_FORA_DO_WINANSI = /[^\u0020-\u007E\u00A0-\u00FF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]/g;

  function limpa(s, manterCaixa) {
    const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    return (manterCaixa ? t : t.toUpperCase()).replace(RX_FORA_DO_WINANSI, "?");
  }

  function soDigitos(s) { return String(s == null ? "" : s).replace(/\D/g, ""); }
  function vazio(s) { return !String(s == null ? "" : s).trim(); }

  function lerData(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!m) return null;
    const a = +m[1], mes = +m[2], d = +m[3];
    const t = new Date(Date.UTC(a, mes - 1, d));
    if (t.getUTCFullYear() !== a || t.getUTCMonth() !== mes - 1 || t.getUTCDate() !== d) return null;
    return { t: t.getTime(), texto: String(d).padStart(2, "0") + "/" + String(mes).padStart(2, "0") + "/" + a };
  }

  function cpfValido(valor) {
    const c = soDigitos(valor);
    if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
    for (let n = 9; n <= 10; n++) {
      let soma = 0;
      for (let i = 0; i < n; i++) soma += Number(c.charAt(i)) * (n + 1 - i);
      if ((soma * 10 % 11) % 10 !== Number(c.charAt(n))) return false;
    }
    return true;
  }

  function formatarCpf(valor) {
    const c = soDigitos(valor);
    return c.length === 11 ? c.slice(0, 3) + "." + c.slice(3, 6) + "." + c.slice(6, 9) + "-" + c.slice(9) : String(valor || "");
  }

  /* "62,5" ou "62.5" -> 62.5 (numero) ou null. */
  function numero(texto) {
    const n = parseFloat(String(texto == null ? "" : texto).replace(",", "."));
    return isFinite(n) ? n : null;
  }

  function textoDoNumero(texto) {
    return String(texto).trim().replace(".", ",");
  }

  function telefoneValido(ddd, num) {
    const d = soDigitos(ddd);
    const n = soDigitos(num);
    return d.length === 2 && d.charAt(0) !== "0" && (n.length === 8 || n.length === 9);
  }

  function formatarTelefone(num) {
    const n = soDigitos(num);
    return n.length === 9 ? n.slice(0, 5) + "-" + n.slice(5) : n.length === 8 ? n.slice(0, 4) + "-" + n.slice(4) : String(num || "");
  }

  /* ------------------------------------------------------------------
   * Validacao: cada asterisco do formulario
   * ------------------------------------------------------------------ */
  const RX_CID = /^[A-Z]\d{2}\.?\d{0,2}$/;
  const RX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function maximo(c, campo, chave, rotulo) {
    if (limpa(c.d[campo]).length > limite(chave)) {
      c.erro(campo, rotulo + " é longo demais para caber no campo (máximo " + limite(chave) + " caracteres).");
    }
  }

  function validarEstabelecimento(c) {
    if (soDigitos(c.d.cnes).length !== 7) c.erro("cnes", "Campo 1: informe o CNES do estabelecimento (7 dígitos).");
    maximo(c, "estabelecimento", "estabelecimento", "Campo 2 (nome do estabelecimento)");
  }

  function validarPaciente(c) {
    const d = c.d;
    if (vazio(d.nome)) c.erro("nome", "Campo 3.1: informe o nome civil completo do paciente.");
    maximo(c, "nome", "nome", "Campo 3.1 (nome)");
    maximo(c, "nomeSocial", "nomeSocial", "Campo 3.2 (nome social)");
    if (vazio(d.mae)) c.erro("mae", "Campo 4: informe o nome da mãe do paciente.");
    maximo(c, "mae", "mae", "Campo 4 (nome da mãe)");
    const peso = numero(d.peso);
    if (vazio(d.peso)) c.erro("peso", "Campo 5: informe o peso do paciente em kg.");
    else if (peso === null || peso < 1 || peso > 400) c.erro("peso", "Campo 5: o peso precisa estar entre 1 e 400 kg.");
    const altura = numero(d.altura);
    if (vazio(d.altura)) c.erro("altura", "Campo 6: informe a altura do paciente em centímetros.");
    else if (altura === null || altura < 30 || altura > 250 || String(d.altura).indexOf(",") !== -1 && altura < 3) {
      c.erro("altura", "Campo 6: a altura é em centímetros (ex.: 165).");
    }
  }

  function validarMedicamentos(c) {
    const lista = Array.isArray(c.d.medicamentos) ? c.d.medicamentos : [];
    const usadas = lista.filter(function (m) { return m && (!vazio(m.nome) || (m.qtd || []).some(function (q) { return !vazio(q); })); });
    if (usadas.length === 0) return c.erro("medicamentos", "Campo 7: informe ao menos um medicamento, com a quantidade solicitada.");
    if (usadas.length > MAX_MEDICAMENTOS) return c.erro("medicamentos", "O formulário comporta no máximo " + MAX_MEDICAMENTOS + " medicamentos.");
    usadas.forEach(function (m, i) {
      const n = i + 1;
      if (vazio(m.nome)) return c.erro("medicamentos", "Medicamento " + n + ": informe o nome (campo 7).");
      if (limpa(m.nome).length > limite("medicamento")) return c.erro("medicamentos", "Medicamento " + n + ": nome longo demais para o campo (máximo " + limite("medicamento") + " caracteres).");
      const qtd = (m.qtd || []).filter(function (q) { return !vazio(q); });
      if (qtd.length === 0) return c.erro("medicamentos", "Medicamento " + n + ": informe a quantidade solicitada em ao menos um mês (campo 8).");
      if (qtd.some(function (q) { return !/^\d{1,4}$/.test(String(q).trim()) || Number(q) < 1; })) {
        return c.erro("medicamentos", "Medicamento " + n + ": a quantidade é um número inteiro de 1 a 9999.");
      }
      return null;
    });
  }

  function validarClinica(c) {
    const d = c.d;
    const cid = limpa(d.cid);
    if (!cid) c.erro("cid", "Campo 9: informe o CID-10.");
    else if (!RX_CID.test(cid)) c.erro("cid", "Campo 9: o CID-10 está num formato inválido (ex.: M05.8).");
    maximo(c, "diagnostico", "diagnostico", "Campo 10 (diagnóstico)");
    if (vazio(d.anamnese)) c.erro("anamnese", "Campo 11: preencha a anamnese.");
    else if (limpa(d.anamnese, true).length > MAX_ANAMNESE) c.erro("anamnese", "Campo 11: a anamnese é longa demais para o campo (máximo " + MAX_ANAMNESE + " caracteres). Resuma e anexe o relatório, se precisar.");
    if (["nao", "sim"].indexOf(d.tratamentoPrevio) === -1) c.erro("tratamentoPrevio", "Campo 12: informe se o paciente já fez ou faz tratamento (não/sim).");
    else if (d.tratamentoPrevio === "sim") {
      if (vazio(d.tratamentoRelato)) c.erro("tratamentoRelato", "Campo 12: relate o(s) esquema(s) terapêutico(s) já usado(s).");
      else if (limpa(d.tratamentoRelato, true).length > MAX_RELATO) c.erro("tratamentoRelato", "Campo 12: o relato é longo demais para o campo (máximo " + MAX_RELATO + " caracteres).");
    }
    if (["nao", "sim"].indexOf(d.incapaz) === -1) c.erro("incapaz", "Campo 13: informe se o paciente é considerado incapaz (atestado de capacidade).");
    else if (d.incapaz === "sim") {
      if (vazio(d.responsavel)) c.erro("responsavel", "Campo 13: informe o nome do responsável pelo paciente.");
      maximo(c, "responsavel", "responsavel", "Campo 13 (responsável)");
    }
  }

  function validarMedico(c) {
    const d = c.d;
    if (vazio(d.medicoNome)) c.erro("medicoNome", "Campo 14: informe o nome do médico solicitante.");
    maximo(c, "medicoNome", "medicoNome", "Campo 14 (nome do médico)");
    if (vazio(d.medicoCpf)) c.erro("medicoCpf", "Campo 15: informe o CPF do médico solicitante (o sistema usa sempre o CPF, não o CNS).");
    else if (!cpfValido(d.medicoCpf)) c.erro("medicoCpf", "Campo 15: o CPF do médico não é válido (11 dígitos).");
    const dt = lerData(d.data);
    if (vazio(d.data)) c.erro("data", "Campo 16: informe a data da solicitação.");
    else if (!dt) c.erro("data", "Campo 16: a data da solicitação não é uma data válida.");
    else if (dt.t > c.hoje.t) c.erro("data", "Campo 16: a data da solicitação não pode ser futura.");
  }

  function validarPreenchimento(c) {
    const d = c.d;
    if (!PREENCHIDO_POR[d.preenchidoPor]) return c.erro("preenchidoPor", "Campo 18: indique quem preencheu os campos 19 a 23.");
    if (d.preenchidoPor === "outro") {
      if (vazio(d.outroNome)) c.erro("outroNome", "Campo 18: informe o nome completo de quem preencheu.");
      maximo(c, "outroNome", "outroNome", "Campo 18 (nome)");
      if (!cpfValido(d.outroCpf)) c.erro("outroCpf", "Campo 18: informe o CPF válido de quem preencheu.");
    }
    return null;
  }

  function validarContato(c) {
    const d = c.d;
    if (!RACA[d.raca]) c.erro("raca", "Campo 19: informe a raça/cor do paciente.");
    else if (d.raca === "indigena") {
      if (vazio(d.etnia)) c.erro("etnia", "Campo 19: raça/cor indígena — informe a etnia.");
      maximo(c, "etnia", "etnia", "Campo 19 (etnia)");
    }
    if (!telefoneValido(d.tel1Ddd, d.tel1)) c.erro("tel1", "Campo 20: informe o telefone do paciente com DDD (2 dígitos) e 8 ou 9 dígitos.");
    if ((!vazio(d.tel2) || !vazio(d.tel2Ddd)) && !telefoneValido(d.tel2Ddd, d.tel2)) c.erro("tel2", "Campo 20: o segundo telefone precisa de DDD (2 dígitos) e 8 ou 9 dígitos (ou deixe em branco).");
    if (vazio(d.cpfPaciente)) c.erro("cpfPaciente", "Campo 21: informe o CPF do paciente (o sistema usa sempre o CPF, não o CNS).");
    else if (!cpfValido(d.cpfPaciente)) c.erro("cpfPaciente", "Campo 21: o CPF do paciente não é válido (11 dígitos).");
    if (!vazio(d.email) && (!RX_EMAIL.test(String(d.email).trim()) || String(d.email).trim().length > limite("email"))) {
      c.erro("email", "Campo 22: o e-mail não parece válido (ou deixe em branco).");
    }
  }

  function validar(d, hojeIso) {
    const erros = [];
    const hoje = lerData(hojeIso);
    const c = { d: d, hoje: hoje, erro: function (campo, mensagem) { erros.push({ campo: campo, mensagem: mensagem }); } };
    [validarEstabelecimento, validarPaciente, validarMedicamentos, validarClinica, validarMedico, validarPreenchimento, validarContato]
      .forEach(function (etapa) { etapa(c); });
    return erros;
  }

  /* ------------------------------------------------------------------
   * Valores por campo do PDF
   * ------------------------------------------------------------------ */
  function valoresDo(d) {
    const textos = {};
    const maiusculas = {
      cnes: soDigitos(d.cnes), estabelecimento: limpa(d.estabelecimento), nome: limpa(d.nome), nomeSocial: limpa(d.nomeSocial), mae: limpa(d.mae),
      cid: limpa(d.cid).replace(/^([A-Z]\d{2})(\d)$/, "$1.$2"), diagnostico: limpa(d.diagnostico),
      medicoNome: limpa(d.medicoNome), medicoCpf: "CPF " + formatarCpf(d.medicoCpf), cpfPaciente: formatarCpf(d.cpfPaciente),
    };
    Object.keys(maiusculas).forEach(function (k) { if (maiusculas[k]) textos[CAMPO[k]] = maiusculas[k]; });
    if (!vazio(d.peso)) textos[CAMPO.peso] = textoDoNumero(d.peso);
    if (!vazio(d.altura)) textos[CAMPO.altura] = String(Math.round(numero(d.altura)));
    textos[CAMPO.anamnese] = limpa(d.anamnese, true);
    if (d.tratamentoPrevio === "sim") textos[CAMPO.tratamentoRelato] = limpa(d.tratamentoRelato, true);
    if (d.incapaz === "sim") textos[CAMPO.responsavel] = limpa(d.responsavel);
    const dt = lerData(d.data);
    if (dt) textos[CAMPO.data] = dt.texto;
    if (d.preenchidoPor === "outro") {
      textos[CAMPO.outroNome] = limpa(d.outroNome);
      textos[CAMPO.outroCpf] = formatarCpf(d.outroCpf);
    }
    if (d.raca === "indigena") textos[CAMPO.etnia] = limpa(d.etnia);
    [["tel1Ddd", "tel1"], ["tel2Ddd", "tel2"]].forEach(function (par) {
      if (telefoneValido(d[par[0]], d[par[1]])) {
        textos[CAMPO[par[0]]] = soDigitos(d[par[0]]);
        textos[CAMPO[par[1]]] = formatarTelefone(d[par[1]]);
      }
    });
    if (!vazio(d.email)) textos[CAMPO.email] = String(d.email).trim();
    (d.medicamentos || []).filter(function (m) { return m && !vazio(m.nome); }).slice(0, MAX_MEDICAMENTOS).forEach(function (m, i) {
      textos[MEDICAMENTO[i]] = limpa(m.nome);
      for (let mes = 0; mes < 6; mes++) {
        const q = String((m.qtd || [])[mes] == null ? "" : m.qtd[mes]).trim();
        if (q) textos[QUANTIDADE[mes][i]] = q;
      }
    });
    const marcas = [PREENCHIDO_POR[d.preenchidoPor], RACA[d.raca]].filter(Boolean);
    const radios = {};
    radios[CAMPO.tratamentoPrevio] = d.tratamentoPrevio === "sim" ? OPCAO.segunda : OPCAO.primeira;
    radios[CAMPO.incapaz] = d.incapaz === "sim" ? OPCAO.segunda : OPCAO.primeira;
    radios[CAMPO.documentoTipo] = OPCAO.primeira; // CPF, sempre
    return { textos: textos, marcas: marcas, radios: radios };
  }

  /* ------------------------------------------------------------------
   * Aplicacao no PDF (pdf-lib chega por parametro)
   * ------------------------------------------------------------------ */
  const TAM_MAX = 9;
  const TAM_MIN = 6;

  function larguraDoCampo(campo) {
    return campo.acroField.getWidgets()[0].getRectangle();
  }

  function cabeEmUmaLinha(fonte, texto, tam, larg) {
    return fonte.widthOfTextAtSize(texto, tam) <= larg - 4;
  }

  /* Quebra por palavras e conta as linhas, como o campo de varias linhas. */
  function linhasQueOcupa(fonte, texto, tam, larg) {
    let linhas = 1;
    let atual = "";
    texto.split(/\s+/).forEach(function (palavra) {
      const t = atual ? atual + " " + palavra : palavra;
      if (fonte.widthOfTextAtSize(t, tam) > larg - 4 && atual) {
        linhas++;
        atual = palavra;
      } else {
        atual = t;
      }
    });
    return linhas;
  }

  /* Maior tamanho de fonte (de 9 a 6) em que o texto cabe no campo. */
  function melhorTamanho(fonte, campo, texto, multilinha) {
    const r = larguraDoCampo(campo);
    for (let tam = TAM_MAX; tam >= TAM_MIN; tam -= 0.5) {
      const cabe = multilinha
        ? linhasQueOcupa(fonte, texto, tam, r.width) * tam * 1.2 <= r.height - 3
        : cabeEmUmaLinha(fonte, texto, tam, r.width);
      if (cabe) return tam;
    }
    return TAM_MIN;
  }

  function preencherTextos(form, fonte, textos) {
    Object.keys(textos).forEach(function (nome) {
      const campo = form.getTextField(nome);
      const multilinha = campo.isMultiline();
      campo.setText(textos[nome]);
      campo.setFontSize(melhorTamanho(fonte, campo, textos[nome], multilinha));
    });
  }

  async function preencherPdf(PDFLib, doc, d, hojeIso, opcoes) {
    const form = doc.getForm();
    const fonte = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    const v = valoresDo(d, hojeIso);
    preencherTextos(form, fonte, v.textos);
    v.marcas.forEach(function (nome) { form.getCheckBox(nome).check(); });
    Object.keys(v.radios).forEach(function (nome) { form.getRadioGroup(nome).select(v.radios[nome]); });
    form.updateFieldAppearances(fonte);
    /* NAO achata por padrao: o formulario oficial e editavel (o medico ou a
     * recepcao podem ajustar um campo antes de imprimir) e o achatamento do
     * pdf-lib deixa referencias soltas nos botoes de opcao (o MuPDF
     * reclama de objetos ausentes). Fica disponivel so por pedido. */
    if (opcoes && opcoes.achatar === true) form.flatten();
    return v;
  }

  raiz.MeedsLmeMg = {
    CAMPO: CAMPO,
    MAX_MEDICAMENTOS: MAX_MEDICAMENTOS,
    MAX_ANAMNESE: MAX_ANAMNESE,
    MAX_RELATO: MAX_RELATO,
    RACAS: [
      { id: "branca", rotulo: "Branca" }, { id: "amarela", rotulo: "Amarela" }, { id: "indigena", rotulo: "Indígena" },
      { id: "preta", rotulo: "Preta" }, { id: "parda", rotulo: "Parda" },
    ],
    PREENCHIDO_POR: [
      { id: "paciente", rotulo: "Paciente" }, { id: "mae", rotulo: "Mãe do paciente" },
      { id: "responsavel", rotulo: "Responsável (descrito no item 13)" }, { id: "medico", rotulo: "Médico solicitante" }, { id: "outro", rotulo: "Outro" },
    ],
    limite: limite,
    cpfValido: cpfValido,
    formatarCpf: formatarCpf,
    validar: validar,
    valoresDo: valoresDo,
    preencherPdf: preencherPdf,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
