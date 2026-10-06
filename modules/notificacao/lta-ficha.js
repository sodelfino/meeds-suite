/* ------------------------------------------------------------------
 * modules/notificacao/lta-ficha.js — Leishmaniose Tegumentar Americana
 * ------------------------------------------------------------------
 * FICHA DE INVESTIGACAO LEISHMANIOSE TEGUMENTAR AMERICANA (SINAN NET, SVS
 * 27/09/2005, CID-10 B55.1). Mesmo desenho da ficha de dengue
 * (dengue-ficha.js): PDF oficial achatado, valores desenhados na
 * coordenada da celula, logica pura testada em Node
 * (tests/notificacao-lta.test.js). As pecas comuns — validacao de
 * paciente/residencia/telefone, desenho, datas — vem de
 * MeedsNotificacaoDengue.base; aqui ficam so o que e da leishmaniose.
 *
 * ESCOPO (primeira consulta): agravo (ja impresso), notificacao, paciente,
 * residencia, data da investigacao, ocupacao, presenca de lesao (cutanea /
 * mucosa), cicatrizes cutaneas, co-infeccao HIV e tipo de entrada. Ficam
 * EM BRANCO para a vigilancia: dados laboratoriais (36-38), forma clinica
 * (40), tratamento (41-46), conclusao (47-58) e o quadro de deslocamento.
 *
 * COORDENADAS: pontos, origem no canto superior esquerdo da pagina
 * (595 x 841), medidas no proprio PDF (ver o cabecalho de dengue-ficha.js).
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  const D = function () { return raiz.MeedsNotificacaoDengue; };

  const TIPOS_ENTRADA = [
    { v: "1", r: "Caso novo" }, { v: "2", r: "Recidiva" }, { v: "3", r: "Transferência" }, { v: "9", r: "Ignorado" },
  ];
  const HIV = [{ v: "1", r: "Sim" }, { v: "2", r: "Não" }, { v: "9", r: "Ignorado" }];
  const CICATRIZ = [{ v: "1", r: "Sim" }, { v: "2", r: "Não" }];
  const LESOES = [
    { id: "cutanea", rotulo: "Lesão cutânea (úlcera de fundo granuloso e bordas infiltradas)" },
    { id: "mucosa", rotulo: "Lesão mucosa (nasal, lábios, palato ou nasofaringe)" },
  ];

  /* Caixas de codigo unico (x0, y0, x1, y1). */
  const CX = {
    idadeUnidade: [113.4, 290.4, 124.1, 301.1],
    sexo: [236.0, 283.2, 246.7, 293.9],
    gestante: [430.5, 283.3, 441.3, 294.0],
    raca: [555.5, 284.0, 566.3, 294.7],
    escolaridade: [556.0, 313.1, 566.7, 323.8],
    zona: [336.8, 478.1, 347.5, 488.8],
    lesaoCutanea: [144.5, 576.4, 155.3, 587.1],
    lesaoMucosa: [144.5, 592.1, 155.3, 602.9],
    cicatriz: [351.5, 592.1, 362.2, 603.4],
    hiv: [541.4, 566.9, 552.2, 577.7],
    tipoEntrada: [300.7, 654.2, 311.4, 664.9],
  };

  const PENTE = {
    dataNotificacao: { bordas: [447.5, 462.0, 477.4, 490.6, 506.0, 519.4, 533.6, 548.0, 567.0], cy: 184.8 },
    ibgeNotif: { bordas: [482.5, 495.6, 510.1, 524.4, 538.9, 553.4, 568.6], cy: 216.3 },
    cnes: { bordas: [340.8, 353.9, 368.1, 382.6, 397.1, 411.6, 426.1, 443.4], cy: 244.7 },
    dataDiagnostico: { bordas: [444.6, 460.4, 476.8, 489.4, 505.0, 518.1, 532.6, 546.9, 568.6], cy: 244.7 },
    nascimento: { bordas: [449.5, 464.4, 479.4, 493.0, 509.0, 521.6, 536.4, 551.0, 568.4], cy: 273.4 },
    idade: { bordas: [57.2, 79.5, 93.1, 107.5], cy: 304.5 },
    sus: { bordas: [57.2, 67.6, 79.1, 90.4, 101.9, 113.4, 124.9, 136.4, 147.9, 159.1, 170.6, 182.1, 193.6, 205.1, 216.6, 227.9], cy: 364.4 },
    ibgeRes: { bordas: [329.5, 342.5, 357.0, 371.5, 386.0, 400.5, 415.8], cy: 394.7 },
    cep: { bordas: [459.4, 472.6, 487.0, 501.6, 516.0, 528.0, 541.6, 555.0, 569.0], cy: 471.3 },
    telefone10: { bordas: [58.0, 71.4, 86.0, 100.2, 114.6, 129.0, 143.4, 158.0, 172.4, 187.0, 205.6], cy: 493.3 },
    dataInvestigacao: { bordas: [57.6, 74.4, 90.6, 103.4, 117.0, 130.4, 144.8, 159.6, 173.0], cy: 545.8 },
    cnesInvestigador: { bordas: [466.4, 479.4, 493.6, 508.0, 522.4, 537.0, 551.4, 565.8], cy: 624.8 },
  };

  /* Linhas (baseline) das "Informacoes complementares e observacoes" —
   * 14 linhas pautadas da pagina 2. */
  const LINHAS_OBS = [393.0, 408.4, 423.7, 439.4, 454.7, 470.2, 485.9, 501.4, 517.2, 532.4, 548.2, 563.9, 579.2, 594.9];

  /* ------------------------------------------------------------------
   * Validacao
   * ------------------------------------------------------------------ */
  function validarLesoes(c) {
    if (D().base.lista(c.d.lesoes).length === 0) {
      c.erro("lesoes", "Marque a presença de lesão: cutânea e/ou mucosa. Sem lesão, o caso não é suspeito de leishmaniose tegumentar.");
    }
  }

  /* Opcionais de codigo: so validam quando o medico escolheu. */
  const CODIGOS = [
    { campo: "cicatriz", validos: ["1", "2"], mensagem: "Cicatrizes cutâneas: escolha Sim ou Não (ou deixe em branco)." },
    { campo: "hiv", validos: ["1", "2", "9"], mensagem: "Co-infecção HIV: escolha Sim, Não ou Ignorado (ou deixe em branco)." },
    { campo: "tipoEntrada", validos: ["1", "2", "3", "9"], mensagem: "Tipo de entrada: escolha Caso novo, Recidiva, Transferência ou Ignorado (ou deixe em branco)." },
  ];

  function validarCodigos(c) {
    CODIGOS.forEach(function (o) {
      const x = String(c.d[o.campo] == null ? "" : c.d[o.campo]);
      if (x && o.validos.indexOf(x) === -1) c.erro(o.campo, o.mensagem);
    });
  }

  function validar(d, hojeIso) {
    const b = D().base;
    const c = b.novoContexto(d, hojeIso);
    [validarLesoes, b.validarPaciente, b.validarResidencia, b.validarTelefone, b.validarOpcionais, validarCodigos]
      .forEach(function (etapa) { etapa(c); });
    return c.erros;
  }

  /* ------------------------------------------------------------------
   * Operacoes de desenho
   * ------------------------------------------------------------------ */
  function ufEmDuasCelulas(b, pg, uf, cy) {
    const u = String(uf || "").toUpperCase();
    if (D().UFS.indexOf(u) === -1) return;
    b.centro({ pg: pg, cx: 63.7, cy: cy, texto: u.charAt(0), tam: 9, negrito: true });
    b.centro({ pg: pg, cx: 77.2, cy: cy, texto: u.charAt(1), tam: 9, negrito: true });
  }

  function secaoDadosGerais(b, d, hoje) {
    const base = D().base;
    b.pente(0, PENTE.dataNotificacao, base.ddmmaaaa(hoje));
    /* Primeira consulta: o diagnostico (clinico) e feito na propria
     * consulta, entao a data do diagnostico e a de hoje. */
    b.pente(0, PENTE.dataDiagnostico, base.ddmmaaaa(hoje));
    ufEmDuasCelulas(b, 0, d.ufNotif, 215.0);
    b.texto({ pg: 0, x: 88, y: 217.8, valor: d.municipioNotif, larg: 390 });
    const mun = D().buscarMunicipio(String(d.ufNotif || "").toUpperCase(), d.municipioNotif);
    if (mun) b.pente(0, PENTE.ibgeNotif, mun.codigo);
    b.texto({ pg: 0, x: 59, y: 246.2, valor: d.unidade, larg: 272 });
    if (base.soDigitos(d.cnes).length === 7) b.pente(0, PENTE.cnes, base.soDigitos(d.cnes));
  }

  function secaoPaciente(b, d, hoje) {
    const base = D().base;
    b.texto({ pg: 0, x: 60, y: 275.0, valor: d.nome, tam: 10, larg: 372, negrito: true });
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
    if (base.soDigitos(d.sus).length === 15) b.pente(0, PENTE.sus, base.soDigitos(d.sus));
    b.texto({ pg: 0, x: 249, y: 366.0, valor: d.mae, larg: 312 });
  }

  /* A ficha tem 10 celulas (DDD + 8 digitos) e o celular tem 11: DDD nas
   * duas primeiras, o resto uma por celula e os dois ultimos dividindo a
   * ultima celula (a mais larga) — nenhum digito cai em cima de uma
   * divisoria. */
  function telefoneDe11(b, tel) {
    const bd = PENTE.telefone10.bordas;
    const cy = PENTE.telefone10.cy;
    const centro = function (i) { return (bd[i] + bd[i + 1]) / 2; };
    for (let i = 0; i < 9; i++) b.centro({ pg: 0, cx: centro(i), cy: cy, texto: tel.charAt(i), tam: 9 });
    b.centro({ pg: 0, cx: centro(9) - 4.3, cy: cy, texto: tel.charAt(9), tam: 8 });
    b.centro({ pg: 0, cx: centro(9) + 4.3, cy: cy, texto: tel.charAt(10), tam: 8 });
  }

  function secaoResidencia(b, d) {
    const base = D().base;
    const uf = String(d.ufRes || "").toUpperCase();
    ufEmDuasCelulas(b, 0, uf, 393.5);
    const mun = D().buscarMunicipio(uf, d.municipioRes);
    b.texto({ pg: 0, x: 88, y: 396.3, valor: mun ? mun.nome : d.municipioRes, larg: 232 });
    if (mun) b.pente(0, PENTE.ibgeRes, mun.codigo);
    b.texto({ pg: 0, x: 59, y: 420.2, valor: d.bairro, larg: 125 });
    b.texto({ pg: 0, x: 200, y: 420.2, valor: d.logradouro, larg: 270 });
    b.texto({ pg: 0, x: 59, y: 445.2, valor: d.numero, larg: 46 });
    b.texto({ pg: 0, x: 130, y: 445.2, valor: d.complemento, larg: 272 });
    b.texto({ pg: 0, x: 222, y: 469.0, valor: d.referencia, larg: 228 });
    if (base.soDigitos(d.cep).length === 8) b.pente(0, PENTE.cep, base.soDigitos(d.cep));
    const tel = base.soDigitos(d.telefone);
    if (tel.length === 10) b.pente(0, PENTE.telefone10, tel);
    else if (tel.length === 11) telefoneDe11(b, tel);
    if (d.zona) b.caixa(0, CX.zona, d.zona);
  }

  function secaoClinica(b, d, hoje) {
    const lesoes = D().base.lista(d.lesoes);
    b.pente(0, PENTE.dataInvestigacao, D().base.ddmmaaaa(hoje));
    b.texto({ pg: 0, x: 184, y: 547.3, valor: d.ocupacao, larg: 375 });
    /* O medico viu as duas opcoes: a marcada recebe 1 (Sim) e a outra 2
     * (Nao) — mesma logica do "sem sinais de alarme" da dengue. */
    b.caixa(0, CX.lesaoCutanea, lesoes.indexOf("cutanea") !== -1 ? "1" : "2");
    b.caixa(0, CX.lesaoMucosa, lesoes.indexOf("mucosa") !== -1 ? "1" : "2");
    if (lesoes.indexOf("mucosa") !== -1 && d.cicatriz) b.caixa(0, CX.cicatriz, String(d.cicatriz));
    if (d.hiv) b.caixa(0, CX.hiv, String(d.hiv));
    if (d.tipoEntrada) b.caixa(0, CX.tipoEntrada, String(d.tipoEntrada));
  }

  function secaoObservacoesEInvestigador(b, d) {
    const base = D().base;
    const obs = D().saneaTexto(d.observacoes, true);
    if (obs) b.ops.push({ pg: 1, tipo: "bloco", x: 38, linhas: LINHAS_OBS, larg: 528, texto: obs, tam: 9 });
    if (!D().saneaTexto(d.medicoNome)) return;
    b.texto({ pg: 1, x: 63, y: 626.5, valor: [d.municipioNotif, d.unidade].filter(Boolean).join(" / "), larg: 395 });
    if (base.soDigitos(d.cnes).length === 7) b.pente(1, PENTE.cnesInvestigador, base.soDigitos(d.cnes));
    b.texto({ pg: 1, x: 63, y: 657.5, valor: d.medicoNome, larg: 190 });
    b.texto({ pg: 1, x: 265, y: 657.5, valor: d.medicoFuncao, larg: 195 });
  }

  function montarOperacoes(d, hojeIso) {
    const b = D().base.criarDesenho();
    const hoje = String(hojeIso || "");
    secaoDadosGerais(b, d, hoje);
    secaoPaciente(b, d, hoje);
    secaoResidencia(b, d);
    secaoClinica(b, d, hoje);
    secaoObservacoesEInvestigador(b, d);
    return b.ops;
  }

  raiz.MeedsNotificacaoLta = {
    TIPOS_ENTRADA: TIPOS_ENTRADA,
    HIV: HIV,
    CICATRIZ: CICATRIZ,
    LESOES: LESOES,
    CX: CX,
    validar: validar,
    montarOperacoes: montarOperacoes,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
