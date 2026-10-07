/* ------------------------------------------------------------------
 * modules/notificacao/aids-ficha.js — AIDS (pacientes com 13 anos ou mais)
 * ------------------------------------------------------------------
 * FICHA DE NOTIFICACAO/INVESTIGACAO AIDS (SINAN NET, SVS 08/06/2006,
 * CID-10 B24). Mesmo desenho das outras fichas: PDF oficial achatado,
 * valores desenhados na coordenada da celula, logica pura testada em Node
 * (tests/notificacao-aids.test.js). As pecas comuns — validacao de
 * paciente/residencia/telefone/CPF, desenho, datas — vem de
 * MeedsNotificacaoDengue.base.
 *
 * OBRIGATORIOS (instrumento de preenchimento do SINAN, Aids_adulto_v5):
 * data do diagnostico (7), paciente, residencia, transmissao vertical
 * (32), sexual (33), sanguinea (34), evidencia laboratorial de HIV (40),
 * criterios Rio de Janeiro/Caracas (41) e CDC adaptado (42) e criterio
 * obito (43). Os itens 35-39 so valem — e passam a ser obrigatorios — com
 * transfusao ou acidente com material biologico; 47-48 so com criterio
 * obito. Evolucao do caso, de resto, fica EM BRANCO (primeira consulta).
 *
 * COORDENADAS: pontos, origem no canto superior esquerdo (595 x 841),
 * medidas no proprio PDF (ver o cabecalho de dengue-ficha.js).
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  const D = function () { return raiz.MeedsNotificacaoDengue; };

  /* Criterio Rio de Janeiro/Caracas (41): cada item vale pontos; a soma
   * >= 10 caracteriza o caso. Itens com asterisco na ficha excluem a
   * tuberculose como causa. */
  const RJ = [
    { id: "sarcoma", rotulo: "Sarcoma de Kaposi", pontos: 10, caixa: [67.0, 40.9, 77.7, 51.6] },
    { id: "tbDisseminada", rotulo: "Tuberculose disseminada/extrapulmonar/não cavitária", pontos: 10, caixa: [67.0, 55.5, 77.7, 66.2] },
    { id: "candidoseOral", rotulo: "Candidose oral ou leucoplasia pilosa", pontos: 5, caixa: [67.0, 70.1, 77.7, 80.8] },
    { id: "tbPulmonar", rotulo: "Tuberculose pulmonar cavitária ou não especificada", pontos: 5, caixa: [67.0, 84.6, 77.7, 95.3] },
    { id: "herpesZoster", rotulo: "Herpes zoster em indivíduo menor ou igual a 60 anos", pontos: 5, caixa: [67.1, 99.1, 77.8, 109.9] },
    { id: "sncDisfuncao", rotulo: "Disfunção do sistema nervoso central", pontos: 5, caixa: [67.1, 113.7, 77.8, 124.4] },
    { id: "diarreia", rotulo: "Diarreia igual ou maior a 1 mês", pontos: 5, caixa: [67.1, 128.2, 77.8, 139.0] },
    { id: "febre", rotulo: "Febre ≥ 38 ºC por tempo ≥ 1 mês (excluída tuberculose)", pontos: 2, caixa: [67.8, 141.4, 78.5, 152.0] },
    { id: "caquexia", rotulo: "Caquexia ou perda de peso maior que 10% (excluída tuberculose)", pontos: 2, caixa: [301.0, 41.2, 311.7, 51.9] },
    { id: "astenia", rotulo: "Astenia maior ou igual a 1 mês (excluída tuberculose)", pontos: 2, caixa: [301.0, 55.7, 311.7, 66.5] },
    { id: "dermatite", rotulo: "Dermatite persistente", pontos: 2, caixa: [301.0, 70.3, 311.7, 81.0] },
    { id: "anemia", rotulo: "Anemia e/ou linfopenia e/ou trombocitopenia", pontos: 2, caixa: [301.1, 84.8, 311.8, 95.5] },
    { id: "tosse", rotulo: "Tosse persistente ou qualquer pneumonia (excluída tuberculose)", pontos: 2, caixa: [301.1, 99.4, 311.8, 110.1] },
    { id: "linfadenopatia", rotulo: "Linfadenopatia ≥ 1 cm em ≥ 2 sítios extra-inguinais por ≥ 1 mês", pontos: 2, caixa: [301.1, 113.9, 311.8, 124.6] },
  ];

  /* Criterio CDC adaptado (42): qualquer item caracteriza o caso. */
  const CDC = [
    { id: "cancerCervical", rotulo: "Câncer cervical invasivo", caixa: [65.6, 173.6, 76.3, 184.3] },
    { id: "candidoseEsofago", rotulo: "Candidose de esôfago", caixa: [65.6, 187.5, 76.3, 198.2] },
    { id: "candidoseTraqueia", rotulo: "Candidose de traqueia, brônquios ou pulmão", caixa: [65.6, 202.4, 76.3, 213.2] },
    { id: "citomegalovirose", rotulo: "Citomegalovirose (exceto fígado, baço ou linfonodos)", caixa: [65.6, 217.0, 76.3, 227.8] },
    { id: "criptococose", rotulo: "Criptococose extrapulmonar", caixa: [65.6, 231.5, 76.3, 242.3] },
    { id: "criptosporidiose", rotulo: "Criptosporidiose intestinal crônica > 1 mês", caixa: [65.6, 246.1, 76.4, 256.8] },
    { id: "herpesSimples", rotulo: "Herpes simples mucocutâneo > 1 mês", caixa: [65.6, 260.6, 76.4, 271.4] },
    { id: "histoplasmose", rotulo: "Histoplasmose disseminada", caixa: [65.6, 276.2, 76.4, 286.9] },
    { id: "isosporidiose", rotulo: "Isosporidiose intestinal crônica > 1 mês", caixa: [65.6, 290.6, 76.4, 301.3] },
    { id: "leucoencefalopatia", rotulo: "Leucoencefalopatia multifocal progressiva", caixa: [298.6, 172.8, 309.3, 183.5] },
    { id: "linfomaNaoHodgkin", rotulo: "Linfoma não Hodgkin e outros linfomas", caixa: [298.8, 189.6, 309.6, 200.3] },
    { id: "linfomaCerebro", rotulo: "Linfoma primário do cérebro", caixa: [298.8, 204.1, 309.6, 214.9] },
    { id: "micobacteriose", rotulo: "Micobacteriose disseminada exceto tuberculose e hanseníase", caixa: [298.8, 218.6, 309.6, 229.4] },
    { id: "pneumocystis", rotulo: "Pneumonia por Pneumocystis carinii", caixa: [298.5, 233.2, 309.6, 244.0] },
    { id: "chagas", rotulo: "Reativação de doença de Chagas (meningoencefalite e/ou miocardite)", caixa: [298.1, 247.4, 309.7, 258.2] },
    { id: "salmonelose", rotulo: "Salmonelose (sepse recorrente não-tifóide)", caixa: [298.2, 261.7, 309.0, 272.4] },
    { id: "toxoplasmose", rotulo: "Toxoplasmose cerebral", caixa: [298.5, 276.7, 309.6, 287.4] },
    { id: "cd4", rotulo: "Contagem de linfócitos T CD4+ menor que 350 cel/mm³", caixa: [298.5, 290.9, 309.6, 301.7] },
  ];

  /* Vias de exposicao sanguinea (34). */
  const EXPOSICOES = [
    { id: "drogas", rotulo: "Uso de drogas injetáveis" },
    { id: "hemofilia", rotulo: "Tratamento/hemotransfusão para hemofilia" },
    { id: "transfusao", rotulo: "Transfusão sanguínea" },
    { id: "acidente", rotulo: "Acidente com material biológico com posterior soroconversão até 6 meses" },
  ];

  const VERTICAL = [
    { v: "1", r: "Sim" }, { v: "2", r: "Não foi transmissão vertical" }, { v: "9", r: "Ignorado" },
  ];
  const SEXUAL = [
    { v: "1", r: "Relações sexuais com homens" }, { v: "2", r: "Relações sexuais com mulheres" },
    { v: "3", r: "Relações sexuais com homens e mulheres" }, { v: "4", r: "Não foi transmissão sexual" }, { v: "9", r: "Ignorado" },
  ];
  const SANGUINEA = [{ v: "2", r: "Não" }, { v: "1", r: "Sim (marque a via)" }, { v: "9", r: "Ignorado" }];
  const CONCLUSAO_TRANSF = [{ v: "1", r: "Sim" }, { v: "2", r: "Não" }, { v: "3", r: "Não se aplica" }];
  const RESULTADO_TESTE = [
    { v: "1", r: "Positivo/reagente" }, { v: "2", r: "Negativo/não reagente" }, { v: "3", r: "Inconclusivo" },
    { v: "4", r: "Não realizado" }, { v: "5", r: "Indeterminado" }, { v: "9", r: "Ignorado" },
  ];
  const CRITERIO_OBITO = [{ v: "2", r: "Não" }, { v: "1", r: "Sim" }, { v: "9", r: "Ignorado" }];

  /* Os 5 testes do item 40: chave do resultado, caixa na ficha. */
  const TESTES = [
    { id: "labTriagem", rotulo: "Teste de triagem" },
    { id: "labConfirmatorio", rotulo: "Teste confirmatório" },
    { id: "labRapido1", rotulo: "Teste rápido 1" },
    { id: "labRapido2", rotulo: "Teste rápido 2" },
    { id: "labRapido3", rotulo: "Teste rápido 3" },
  ];

  const CX = {
    idadeUnidade: [109.4, 262.7, 120.2, 273.4],
    sexo: [232.0, 255.5, 242.7, 266.2],
    gestante: [426.6, 255.5, 437.3, 266.3],
    raca: [551.6, 256.3, 562.3, 267.0],
    escolaridade: [552.0, 285.4, 562.8, 296.0],
    zona: [333.0, 451.1, 343.8, 461.8],
    vertical: [234.3, 543.1, 245.1, 553.8],
    sexual: [549.0, 538.3, 559.8, 549.1],
    drogas: [283.7, 585.5, 294.4, 596.2],
    hemofilia: [283.6, 604.2, 294.3, 614.9],
    transfusao: [483.2, 584.8, 493.9, 595.5],
    acidente: [483.1, 602.8, 493.8, 613.5],
    conclusaoTransf: [542.5, 691.9, 553.2, 701.3],
    labTriagem: [109.6, 753.1, 121.7, 765.1],
    labConfirmatorio: [309.3, 753.9, 321.3, 766.0],
    labRapido1: [153.7, 784.9, 165.7, 797.0],
    labRapido2: [233.9, 786.2, 245.9, 798.2],
    labRapido3: [310.1, 786.2, 322.2, 798.2],
    criterioObito: [503.4, 319.1, 515.5, 331.6],
    evolucao: [424.8, 383.8, 435.6, 394.6],
  };

  const PENTE = {
    dataNotificacao: { bordas: [445.0, 459.4, 473.9, 488.4, 502.8, 517.1, 531.4, 545.9, 560.4], cy: 159.5 },
    ibgeNotif: { bordas: [474.9, 489.4, 503.9, 518.4, 532.9, 547.4, 561.9], cy: 188.6 },
    cnes: { bordas: [335.6, 350.1, 364.6, 378.9, 393.4, 407.9, 422.4, 436.9], cy: 217.0 },
    dataDiagnostico: { bordas: [442.0, 456.4, 470.9, 485.4, 499.6, 514.1, 528.6, 542.9, 557.3], cy: 215.8 },
    nascimento: { bordas: [445.7, 460.1, 474.6, 489.1, 503.5, 517.9, 532.4, 546.6, 561.0], cy: 246.2 },
    idade: { bordas: [53.0, 67.0, 81.0, 95.0], cy: 270.0 },
    cpf: { bordas: [52.1, 63.6, 75.1, 86.6, 98.1, 109.6, 121.1, 132.6, 144.1, 155.6, 167.1, 178.6, 190.1, 201.6, 213.1, 224.6], cy: 336.8 },
    ibgeRes: { bordas: [324.5, 339.0, 353.2, 367.8, 382.2, 396.8, 411.3], cy: 367.5 },
    cep: { bordas: [454.5, 468.9, 483.1, 497.6, 512.1, 523.5, 536.6, 551.1, 565.5], cy: 445.1 },
    telefone10: { bordas: [53.1, 67.6, 81.9, 96.4, 110.9, 125.4, 139.9, 154.4, 168.6, 183.1, 197.6], cy: 468.9 },
    dataTransf: { bordas: [65.5, 79.9, 94.4, 108.9, 122.4, 135.6, 150.1, 164.4, 178.8], cy: 650.2 },
    ibgeTransf: { bordas: [480.5, 494.9, 509.1, 523.6, 538.1, 552.6, 567.0], cy: 650.7 },
    dataTriagem: { bordas: [165.6, 178.1, 190.6, 203.1, 215.5, 229.9, 244.4, 258.6, 273.0], cy: 767.8 },
    dataConfirmatorio: { bordas: [385.2, 399.6, 414.0, 428.4, 441.9, 455.4, 469.6, 484.1, 498.5], cy: 768.5 },
    dataRapidos: { bordas: [366.2, 380.6, 395.1, 409.6, 423.0, 436.4, 450.9, 465.1, 479.6], cy: 803.2 },
    ibgeTrat: { bordas: [249.9, 264.4, 278.9, 293.4, 307.9, 322.4, 336.9], cy: 376.1 },
    dataObito: { bordas: [450.5, 464.9, 478.2, 491.6, 504.5, 517.4, 531.9, 546.4, 560.9], cy: 408.3 },
  };

  /* ------------------------------------------------------------------
   * Criterios
   * ------------------------------------------------------------------ */
  function pontosRj(ids) {
    const marcados = D().base.lista(ids);
    return RJ.reduce(function (soma, i) { return soma + (marcados.indexOf(i.id) !== -1 ? i.pontos : 0); }, 0);
  }

  function rjAtendido(ids) {
    return pontosRj(ids) >= 10;
  }

  /* ------------------------------------------------------------------
   * Validacao
   * ------------------------------------------------------------------ */
  function dataNaoFutura(c, campo, rotulo) {
    const dt = D().base.lerData(c.d[campo]);
    if (!dt) { c.erro(campo, rotulo + " não é uma data válida."); return null; }
    if (dt.t > c.hoje.t) { c.erro(campo, rotulo + " não pode ser futura."); return null; }
    return dt;
  }

  function validarDiagnostico(c) {
    const b = D().base;
    if (b.vazio(c.d.diagnostico)) return c.erro("diagnostico", "Informe a data do diagnóstico.");
    const dt = dataNaoFutura(c, "diagnostico", "A data do diagnóstico");
    if (dt && c.nasc && dt.t < c.nasc.t) c.erro("diagnostico", "A data do diagnóstico é anterior ao nascimento do paciente — confira as duas datas.");
    return null;
  }

  function validarIdade(c) {
    if (!c.nasc || c.nasc.t > c.hoje.t) return; // o erro de nascimento ja foi dado
    const idade = D().idadeDe(c.d.nascimento, c.hojeIso);
    if (idade && !(idade.unidade === "4" && idade.valor >= 13)) {
      c.erro("nascimento", "Esta ficha é para pacientes com 13 anos ou mais. Para menor de 13 anos use a ficha de AIDS em criança (ainda não disponível aqui).");
    }
  }

  function codigoEm(valor, validos) {
    return validos.indexOf(String(valor == null ? "" : valor)) !== -1;
  }

  function validarTransmissao(c) {
    const d = c.d;
    if (!codigoEm(d.vertical, ["1", "2", "9"])) c.erro("vertical", "Informe a transmissão vertical (32): sim, não ou ignorado.");
    if (!codigoEm(d.sexual, ["1", "2", "3", "4", "9"])) c.erro("sexual", "Informe a transmissão sexual (33).");
    if (!codigoEm(d.sanguinea, ["1", "2", "9"])) c.erro("sanguinea", "Informe a exposição sanguínea (34): não, sim ou ignorado.");
    else if (d.sanguinea === "1" && D().base.lista(d.exposicoes).length === 0) {
      c.erro("exposicoes", "Exposição sanguínea “Sim”: marque a via (drogas injetáveis, hemofilia, transfusão ou acidente com material biológico).");
    }
  }

  function precisaBlocoTransf(d) {
    const v = D().base.lista(d.exposicoes);
    return d.sanguinea === "1" && (v.indexOf("transfusao") !== -1 || v.indexOf("acidente") !== -1);
  }

  /* 35-39: obrigatorios so com transfusao/acidente. */
  function validarTransfusao(c) {
    const b = D().base;
    const d = c.d;
    if (!precisaBlocoTransf(d)) return;
    if (b.vazio(d.transfData)) c.erro("transfData", "Informe a data da transfusão/acidente (35).");
    else dataNaoFutura(c, "transfData", "A data da transfusão/acidente");
    const uf = String(d.transfUf || "").toUpperCase();
    if (D().UFS.indexOf(uf) === -1) c.erro("transfUf", "Informe a UF onde ocorreu a transfusão/acidente (36).");
    if (!D().saneaTexto(d.transfMunicipio)) c.erro("transfMunicipio", "Informe o município onde ocorreu a transfusão/acidente (37).");
    else if (D().UFS.indexOf(uf) !== -1 && !D().buscarMunicipio(uf, d.transfMunicipio)) {
      c.erro("transfMunicipio", "O município da transfusão/acidente não consta na UF " + uf + ". Escolha um da lista.");
    }
    if (!D().saneaTexto(d.transfInstituicao)) c.erro("transfInstituicao", "Informe a instituição onde ocorreu a transfusão/acidente (38).");
    if (!codigoEm(d.transfConclusao, ["1", "2", "3"])) c.erro("transfConclusao", "Informe a conclusão da investigação da transfusão/acidente (39).");
  }

  const DATAS_LAB = [
    { campo: "dataTriagem", rotulo: "A data de coleta do teste de triagem" },
    { campo: "dataConfirmatorio", rotulo: "A data de coleta do teste confirmatório" },
    { campo: "dataRapidos", rotulo: "A data de coleta dos testes rápidos" },
  ];

  function validarLaboratorio(c) {
    const b = D().base;
    let algum = false;
    TESTES.forEach(function (t) {
      const x = String(c.d[t.id] == null ? "" : c.d[t.id]);
      if (!x) return;
      algum = true;
      if (!codigoEm(x, ["1", "2", "3", "4", "5", "9"])) c.erro(t.id, t.rotulo + ": resultado inválido.");
    });
    if (!algum) c.erro("lab", "Informe a evidência laboratorial de HIV (40): escolha o resultado de ao menos um teste (ou “Não realizado”).");
    DATAS_LAB.forEach(function (o) {
      if (!b.vazio(c.d[o.campo])) dataNaoFutura(c, o.campo, o.rotulo);
    });
  }

  /* 41 e 42: o medico atesta o quadro (marca os itens ou "nenhum"). */
  function validarCriterio(c, o) {
    const marcados = D().base.lista(c.d[o.itens]).length > 0;
    const nenhum = !!c.d[o.nenhum];
    if (!marcados && !nenhum) c.erro(o.itens, o.faltando);
    else if (marcados && nenhum) c.erro(o.itens, o.contradicao);
  }

  function validarCriterios(c) {
    validarCriterio(c, {
      itens: "rj", nenhum: "rjNenhum",
      faltando: "Critério Rio de Janeiro/Caracas (41): marque os sinais/doenças presentes ou confirme “Nenhum”.",
      contradicao: "Critério Rio de Janeiro/Caracas (41): você marcou “Nenhum” e também marcou itens — desfaça um dos dois.",
    });
    validarCriterio(c, {
      itens: "cdc", nenhum: "cdcNenhum",
      faltando: "Critério CDC adaptado (42): marque as doenças presentes ou confirme “Nenhuma”.",
      contradicao: "Critério CDC adaptado (42): você marcou “Nenhuma” e também marcou doenças — desfaça um dos dois.",
    });
  }

  function validarObitoETratamento(c) {
    const d = c.d;
    if (!codigoEm(d.criterioObito, ["1", "2", "9"])) c.erro("criterioObito", "Informe o critério óbito (43): sim, não ou ignorado.");
    else if (d.criterioObito === "1") {
      if (D().base.vazio(d.dataObito)) c.erro("dataObito", "Critério óbito “Sim”: informe a data do óbito (48).");
      else {
        const dt = dataNaoFutura(c, "dataObito", "A data do óbito");
        if (dt && c.nasc && dt.t < c.nasc.t) c.erro("dataObito", "A data do óbito é anterior ao nascimento do paciente.");
      }
    }
    const uf = String(d.ufTrat || "").toUpperCase();
    if (uf && D().UFS.indexOf(uf) === -1) c.erro("ufTrat", "UF do tratamento inválida.");
    else if (uf && !D().saneaTexto(d.municipioTrat)) c.erro("municipioTrat", "Local de tratamento: informe também o município (ou limpe a UF).");
    else if (uf && !D().buscarMunicipio(uf, d.municipioTrat)) c.erro("municipioTrat", "O município do tratamento não consta na UF " + uf + ". Escolha um da lista.");
  }

  function validar(d, hojeIso) {
    const b = D().base;
    const c = b.novoContexto(d, hojeIso);
    [validarDiagnostico, b.validarPaciente, validarIdade, b.validarResidencia, b.validarTelefone, b.validarOpcionais,
      validarTransmissao, validarTransfusao, validarLaboratorio, validarCriterios, validarObitoETratamento]
      .forEach(function (etapa) { etapa(c); });
    return c.erros;
  }

  /* ------------------------------------------------------------------
   * Operacoes de desenho
   * ------------------------------------------------------------------ */
  function ufEmDuasCelulas(b, pg, uf, cx1, cx2, cy) {
    const u = String(uf || "").toUpperCase();
    if (D().UFS.indexOf(u) === -1) return;
    b.centro({ pg: pg, cx: cx1, cy: cy, texto: u.charAt(0), tam: 9, negrito: true });
    b.centro({ pg: pg, cx: cx2, cy: cy, texto: u.charAt(1), tam: 9, negrito: true });
  }

  function secaoDadosGerais(b, d, hoje) {
    const base = D().base;
    b.pente(0, PENTE.dataNotificacao, base.ddmmaaaa(hoje));
    b.pente(0, PENTE.dataDiagnostico, base.ddmmaaaa(d.diagnostico));
    ufEmDuasCelulas(b, 0, d.ufNotif, 61.0, 74.5, 187.3);
    b.texto({ pg: 0, x: 88, y: 190.1, valor: d.municipioNotif, larg: 385 });
    const mun = D().buscarMunicipio(String(d.ufNotif || "").toUpperCase(), d.municipioNotif);
    if (mun) b.pente(0, PENTE.ibgeNotif, mun.codigo);
    b.texto({ pg: 0, x: 57, y: 218.6, valor: d.unidade, larg: 275 });
    if (base.soDigitos(d.cnes).length === 7) b.pente(0, PENTE.cnes, base.soDigitos(d.cnes));
  }

  function secaoPaciente(b, d, hoje) {
    const base = D().base;
    b.texto({ pg: 0, x: 57, y: 247.8, valor: d.nome, tam: 10, larg: 375, negrito: true });
    b.pente(0, PENTE.nascimento, base.ddmmaaaa(d.nascimento));
    const idade = D().idadeDe(d.nascimento, hoje);
    if (idade) {
      b.pente(0, PENTE.idade, String(idade.valor), { daDireita: true });
      b.caixa(0, CX.idadeUnidade, idade.unidade, 9);
    }
    if (["M", "F", "I"].indexOf(d.sexo) !== -1) b.caixa(0, CX.sexo, d.sexo);
    if (d.sexo === "M") b.caixa(0, CX.gestante, "6");
    else if (d.sexo === "I") b.caixa(0, CX.gestante, "9");
    else if (d.sexo === "F" && d.gestante) b.caixa(0, CX.gestante, d.gestante);
    if (d.raca) b.caixa(0, CX.raca, d.raca);
    if (d.escolaridade) b.caixa(0, CX.escolaridade, d.escolaridade, d.escolaridade === "10" ? 7 : 10);
    if (base.cpfValido(d.cpf)) {
      b.pente(0, PENTE.cpf, base.soDigitos(d.cpf));
      b.texto({ pg: 0, x: 162, y: 321.8, valor: "(CPF)", tam: 9, negrito: true });
    }
    b.texto({ pg: 0, x: 246, y: 338.4, valor: d.mae, larg: 315 });
  }

  /* A ficha tem 10 celulas de telefone; celular (11) divide a ultima. */
  function telefoneDe11(b, tel) {
    const bd = PENTE.telefone10.bordas;
    const cy = PENTE.telefone10.cy;
    const centro = function (i) { return (bd[i] + bd[i + 1]) / 2; };
    for (let i = 0; i < 9; i++) b.centro({ pg: 0, cx: centro(i), cy: cy, texto: tel.charAt(i), tam: 9 });
    b.centro({ pg: 0, cx: centro(9) - 3.6, cy: cy, texto: tel.charAt(9), tam: 8 });
    b.centro({ pg: 0, cx: centro(9) + 3.6, cy: cy, texto: tel.charAt(10), tam: 8 });
  }

  function secaoResidencia(b, d) {
    const base = D().base;
    const uf = String(d.ufRes || "").toUpperCase();
    ufEmDuasCelulas(b, 0, uf, 61.0, 74.5, 366.5);
    const mun = D().buscarMunicipio(uf, d.municipioRes);
    b.texto({ pg: 0, x: 88, y: 369.0, valor: mun ? mun.nome : d.municipioRes, larg: 232 });
    if (mun) b.pente(0, PENTE.ibgeRes, mun.codigo);
    b.texto({ pg: 0, x: 57, y: 393.0, valor: d.bairro, larg: 125 });
    b.texto({ pg: 0, x: 203, y: 393.0, valor: d.logradouro, larg: 275 });
    b.texto({ pg: 0, x: 57, y: 418.0, valor: d.numero, larg: 46 });
    b.texto({ pg: 0, x: 128, y: 418.0, valor: d.complemento, larg: 275 });
    b.texto({ pg: 0, x: 221, y: 441.8, valor: d.referencia, larg: 228 });
    if (base.soDigitos(d.cep).length === 8) b.pente(0, PENTE.cep, base.soDigitos(d.cep));
    const tel = base.soDigitos(d.telefone);
    if (tel.length === 10) b.pente(0, PENTE.telefone10, tel);
    else if (tel.length === 11) telefoneDe11(b, tel);
    if (d.zona) b.caixa(0, CX.zona, d.zona);
  }

  /* 34: a via marcada recebe 1; as demais, 2 (sim) — ou todas 2 / 9. */
  function secaoSanguinea(b, d) {
    const marcadas = D().base.lista(d.exposicoes);
    EXPOSICOES.forEach(function (e) {
      let codigo = "";
      if (d.sanguinea === "1") codigo = marcadas.indexOf(e.id) !== -1 ? "1" : "2";
      else if (d.sanguinea === "2") codigo = "2";
      else if (d.sanguinea === "9") codigo = "9";
      if (codigo) b.caixa(0, CX[e.id], codigo);
    });
  }

  function secaoTransfusao(b, d) {
    if (!precisaBlocoTransf(d)) return;
    const base = D().base;
    b.pente(0, PENTE.dataTransf, base.ddmmaaaa(d.transfData));
    const uf = String(d.transfUf || "").toUpperCase();
    ufEmDuasCelulas(b, 0, uf, 191.0, 206.5, 650.0);
    const mun = D().buscarMunicipio(uf, d.transfMunicipio);
    b.texto({ pg: 0, x: 222, y: 652.0, valor: mun ? mun.nome : d.transfMunicipio, larg: 255 });
    if (mun) b.pente(0, PENTE.ibgeTransf, mun.codigo);
    b.texto({ pg: 0, x: 62, y: 680.0, valor: d.transfInstituicao, larg: 400 });
    if (d.transfConclusao) b.caixa(0, CX.conclusaoTransf, String(d.transfConclusao));
  }

  function secaoClinica(b, d) {
    const base = D().base;
    b.texto({ pg: 0, x: 62, y: 521.5, valor: d.ocupacao, larg: 480 });
    if (d.vertical) b.caixa(0, CX.vertical, String(d.vertical));
    if (d.sexual) b.caixa(0, CX.sexual, String(d.sexual));
    secaoSanguinea(b, d);
    secaoTransfusao(b, d);
    TESTES.forEach(function (t) { if (d[t.id]) b.caixa(0, CX[t.id], String(d[t.id])); });
    if (base.lerData(d.dataTriagem)) b.pente(0, PENTE.dataTriagem, base.ddmmaaaa(d.dataTriagem));
    if (base.lerData(d.dataConfirmatorio)) b.pente(0, PENTE.dataConfirmatorio, base.ddmmaaaa(d.dataConfirmatorio));
    if (base.lerData(d.dataRapidos)) b.pente(0, PENTE.dataRapidos, base.ddmmaaaa(d.dataRapidos));
  }

  /* 41/42: o medico atestou o quadro — 1 nos marcados, 2 nos demais. */
  function secaoCriterios(b, d) {
    const base = D().base;
    [{ itens: RJ, marcados: d.rj, nenhum: d.rjNenhum }, { itens: CDC, marcados: d.cdc, nenhum: d.cdcNenhum }].forEach(function (g) {
      const sel = base.lista(g.marcados);
      if (sel.length === 0 && !g.nenhum) return;
      g.itens.forEach(function (i) { b.caixa(1, i.caixa, sel.indexOf(i.id) !== -1 ? "1" : "2"); });
    });
    if (d.criterioObito) b.caixa(1, CX.criterioObito, String(d.criterioObito));
    if (d.criterioObito === "1") {
      b.caixa(1, CX.evolucao, "2"); // com criterio obito, a evolucao e obrigatoriamente 2 (obito por aids)
      if (base.lerData(d.dataObito)) b.pente(1, PENTE.dataObito, base.ddmmaaaa(d.dataObito));
    }
  }

  function secaoTratamento(b, d) {
    const uf = String(d.ufTrat || "").toUpperCase();
    if (D().UFS.indexOf(uf) === -1) return;
    ufEmDuasCelulas(b, 1, uf, 59.2, 71.5, 372.5);
    const mun = D().buscarMunicipio(uf, d.municipioTrat);
    b.texto({ pg: 1, x: 89, y: 377.6, valor: mun ? mun.nome : d.municipioTrat, larg: 160 });
    if (mun) b.pente(1, PENTE.ibgeTrat, mun.codigo);
    b.texto({ pg: 1, x: 349, y: 377.6, valor: d.unidadeTrat, larg: 112 });
  }

  function secaoInvestigador(b, d) {
    if (!D().saneaTexto(d.medicoNome)) return;
    b.texto({ pg: 1, x: 56, y: 440.0, valor: d.medicoNome, larg: 280 });
    b.texto({ pg: 1, x: 353, y: 440.0, valor: d.medicoFuncao, larg: 200 });
  }

  function montarOperacoes(d, hojeIso) {
    const b = D().base.criarDesenho();
    const hoje = String(hojeIso || "");
    secaoDadosGerais(b, d, hoje);
    secaoPaciente(b, d, hoje);
    secaoResidencia(b, d);
    secaoClinica(b, d);
    secaoCriterios(b, d);
    secaoTratamento(b, d);
    secaoInvestigador(b, d);
    return b.ops;
  }

  raiz.MeedsNotificacaoAids = {
    RJ: RJ,
    CDC: CDC,
    EXPOSICOES: EXPOSICOES,
    VERTICAL: VERTICAL,
    SEXUAL: SEXUAL,
    SANGUINEA: SANGUINEA,
    CONCLUSAO_TRANSF: CONCLUSAO_TRANSF,
    RESULTADO_TESTE: RESULTADO_TESTE,
    CRITERIO_OBITO: CRITERIO_OBITO,
    TESTES: TESTES,
    CX: CX,
    pontosRj: pontosRj,
    rjAtendido: rjAtendido,
    precisaBlocoTransf: precisaBlocoTransf,
    validar: validar,
    montarOperacoes: montarOperacoes,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
