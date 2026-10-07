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
 * residencia, data da investigacao, ocupacao, forma clinica (cutanea ou
 * mucosa) e a lesao correspondente, cicatrizes cutaneas, co-infeccao HIV,
 * tipo de entrada, laboratorio (36-38, opcional; o formulario sugere "nao
 * realizado") e o inicio do tratamento (41-43), so se o medico iniciou
 * na consulta — nesse caso droga e peso passam a ser obrigatorios. Ficam
 * EM BRANCO: dose e ampolas (44-45), falencia (46), conclusao (47-58) e o
 * quadro de deslocamento.
 *
 * FOTOS DA LESAO: a telemedicina nao tem exame fisico presencial, entao o
 * medico pode anexar fotos; anexarFotos() acrescenta paginas ao PDF.
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
  const FORMAS = [
    { v: "1", r: "Cutânea (úlcera na pele)" },
    { v: "2", r: "Mucosa (nariz, lábios, palato ou nasofaringe)" },
  ];
  const DROGAS = [
    { v: "1", r: "Antimonial pentavalente" }, { v: "2", r: "Anfotericina B" }, { v: "3", r: "Pentamidina" },
    { v: "4", r: "Outras" }, { v: "5", r: "Não utilizada" },
  ];
  const LAB_PARASITO = [{ v: "1", r: "Positivo" }, { v: "2", r: "Negativo" }, { v: "3", r: "Não realizado" }];
  const LAB_HISTO = [
    { v: "1", r: "Encontro do parasita" }, { v: "2", r: "Compatível" }, { v: "3", r: "Não compatível" }, { v: "4", r: "Não realizado" },
  ];
  /* O que o formulario ja deixa escolhido: na primeira consulta o exame
   * quase nunca existe (poupa cliques; o medico pode trocar ou limpar). */
  const PADRAO_LAB = { parasitologico: "3", irm: "3", histopatologia: "4" };
  const MAX_FOTOS = 6;

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
    formaClinica: [553.5, 656.4, 564.2, 667.7],
    parasitologico: [195.6, 620.4, 206.3, 630.8],
    irm: [373.7, 624.2, 384.4, 635.2],
    histopatologia: [552.8, 620.4, 564.0, 631.7],
    droga: [553.1, 686.2, 564.6, 697.7],
  };

  const PENTE = {
    dataNotificacao: { bordas: [447.5, 462.0, 477.4, 490.6, 506.0, 519.4, 533.6, 548.0, 567.0], cy: 184.8 },
    ibgeNotif: { bordas: [482.5, 495.6, 510.1, 524.4, 538.9, 553.4, 568.6], cy: 216.3 },
    cnes: { bordas: [340.8, 353.9, 368.1, 382.6, 397.1, 411.6, 426.1, 443.4], cy: 244.7 },
    dataDiagnostico: { bordas: [444.6, 460.4, 476.8, 489.4, 505.0, 518.1, 532.6, 546.9, 568.6], cy: 244.7 },
    nascimento: { bordas: [449.5, 464.4, 479.4, 493.0, 509.0, 521.6, 536.4, 551.0, 568.4], cy: 273.4 },
    idade: { bordas: [57.2, 79.5, 93.1, 107.5], cy: 304.5 },
    cpf: { bordas: [57.2, 67.6, 79.1, 90.4, 101.9, 113.4, 124.9, 136.4, 147.9, 159.1, 170.6, 182.1, 193.6, 205.1, 216.6, 227.9], cy: 364.4 },
    ibgeRes: { bordas: [329.5, 342.5, 357.0, 371.5, 386.0, 400.5, 415.8], cy: 394.7 },
    cep: { bordas: [459.4, 472.6, 487.0, 501.6, 516.0, 528.0, 541.6, 555.0, 569.0], cy: 471.3 },
    telefone10: { bordas: [58.0, 71.4, 86.0, 100.2, 114.6, 129.0, 143.4, 158.0, 172.4, 187.0, 205.6], cy: 493.3 },
    dataInvestigacao: { bordas: [57.6, 74.4, 90.6, 103.4, 117.0, 130.4, 144.8, 159.6, 173.0], cy: 545.8 },
    dataTratamento: { bordas: [59.4, 75.6, 91.0, 103.6, 119.4, 132.4, 147.0, 161.6, 176.5], cy: 704.0 },
    peso: { bordas: [90.6, 104.0, 120.4, 136.0], cy: 734.5 },
    cnesInvestigador: { bordas: [466.4, 479.4, 493.6, 508.0, 522.4, 537.0, 551.4, 565.8], cy: 624.8 },
  };

  /* Linhas (baseline) das "Informacoes complementares e observacoes" —
   * 14 linhas pautadas da pagina 2. */
  const LINHAS_OBS = [393.0, 408.4, 423.7, 439.4, 454.7, 470.2, 485.9, 501.4, 517.2, 532.4, 548.2, 563.9, 579.2, 594.9];

  /* ------------------------------------------------------------------
   * Validacao
   * ------------------------------------------------------------------ */
  function validarClinica(c) {
    if (["1", "2"].indexOf(String(c.d.formaClinica || "")) === -1) {
      c.erro("formaClinica", "Escolha a forma clínica: cutânea (ferida na pele) ou mucosa (nariz/boca).");
    }
    if (["1", "2", "3"].indexOf(String(c.d.tipoEntrada || "")) === -1) {
      c.erro("tipoEntrada", "Informe o tipo de entrada: caso novo, recidiva ou transferência.");
    }
  }

  /* Opcionais de codigo: so validam quando o medico escolheu. */
  const CODIGOS = [
    { campo: "cicatriz", validos: ["1", "2"], mensagem: "Cicatrizes cutâneas: escolha Sim ou Não (ou deixe em branco)." },
    { campo: "hiv", validos: ["1", "2", "9"], mensagem: "Co-infecção HIV: escolha Sim, Não ou Ignorado (ou deixe em branco)." },
    { campo: "parasitologico", validos: ["1", "2", "3"], mensagem: "Parasitológico direto: escolha Positivo, Negativo ou Não realizado." },
    { campo: "irm", validos: ["1", "2", "3"], mensagem: "IRM (Montenegro): escolha Positivo, Negativo ou Não realizado." },
    { campo: "histopatologia", validos: ["1", "2", "3", "4"], mensagem: "Histopatologia: escolha uma das opções da ficha." },
  ];

  function validarCodigos(c) {
    CODIGOS.forEach(function (o) {
      const x = String(c.d[o.campo] == null ? "" : c.d[o.campo]);
      if (x && o.validos.indexOf(x) === -1) c.erro(o.campo, o.mensagem);
    });
  }

  /* "62" e "62,5" -> 62 / 63 (a ficha tem 3 casas inteiras). */
  function pesoEmKg(texto) {
    const n = parseFloat(String(texto == null ? "" : texto).replace(",", "."));
    return isFinite(n) ? Math.round(n) : null;
  }

  /* Tratamento: so e exigido se o medico comecou na consulta. Data, droga
   * e peso andam juntos (a dose e por quilo). */
  function validarTratamento(c) {
    const b = D().base;
    const d = c.d;
    const iniciou = !b.vazio(d.dataTratamento);
    const droga = String(d.drogaInicial || "");
    if (iniciou) {
      const dt = b.lerData(d.dataTratamento);
      if (!dt) c.erro("dataTratamento", "A data de início do tratamento não é uma data válida.");
      else if (dt.t > c.hoje.t) c.erro("dataTratamento", "A data de início do tratamento não pode ser futura.");
      if (!droga) c.erro("drogaInicial", "Início de tratamento informado: escolha a droga inicial administrada.");
      else if (droga === "5") c.erro("drogaInicial", "Você informou data de início do tratamento e “Não utilizada” — desfaça um dos dois.");
      if (b.vazio(d.peso)) c.erro("peso", "Início de tratamento informado: informe o peso em kg (a dose é calculada por quilo).");
    } else if (droga && droga !== "5") {
      c.erro("dataTratamento", "Droga escolhida sem a data de início do tratamento: informe a data (ou limpe a droga).");
    }
    if (!b.vazio(d.peso)) {
      const kg = pesoEmKg(d.peso);
      if (kg === null || kg < 1 || kg > 300) c.erro("peso", "O peso precisa estar entre 1 e 300 kg.");
    }
  }

  function validar(d, hojeIso) {
    const b = D().base;
    const c = b.novoContexto(d, hojeIso);
    [validarClinica, b.validarPaciente, b.validarResidencia, b.validarTelefone, b.validarOpcionais, validarCodigos, validarTratamento]
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
    if (base.cpfValido(d.cpf)) {
      b.pente(0, PENTE.cpf, base.soDigitos(d.cpf));
      b.texto({ pg: 0, x: 166, y: 352.0, valor: "(CPF)", tam: 9, negrito: true });
    }
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

  function secaoLaboratorio(b, d) {
    ["parasitologico", "irm", "histopatologia"].forEach(function (k) {
      if (d[k]) b.caixa(0, CX[k], String(d[k]));
    });
  }

  function secaoTratamento(b, d) {
    const base = D().base;
    if (!base.lerData(d.dataTratamento)) return;
    b.pente(0, PENTE.dataTratamento, base.ddmmaaaa(d.dataTratamento));
    if (d.drogaInicial) b.caixa(0, CX.droga, String(d.drogaInicial));
    const kg = pesoEmKg(d.peso);
    if (kg !== null && kg >= 1) b.pente(0, PENTE.peso, String(kg), { daDireita: true });
  }

  function secaoClinica(b, d, hoje) {
    b.pente(0, PENTE.dataInvestigacao, D().base.ddmmaaaa(hoje));
    b.texto({ pg: 0, x: 184, y: 547.3, valor: d.ocupacao, larg: 375 });
    const forma = String(d.formaClinica || "");
    /* A forma clinica dita a lesao: so a presente e marcada (a ausencia da
     * outra nao foi perguntada, entao fica em branco). */
    if (forma === "1") b.caixa(0, CX.lesaoCutanea, "1");
    if (forma === "2") b.caixa(0, CX.lesaoMucosa, "1");
    if (forma === "1" || forma === "2") b.caixa(0, CX.formaClinica, forma);
    if (forma === "2" && d.cicatriz) b.caixa(0, CX.cicatriz, String(d.cicatriz));
    if (d.hiv) b.caixa(0, CX.hiv, String(d.hiv));
    if (d.tipoEntrada) b.caixa(0, CX.tipoEntrada, String(d.tipoEntrada));
    secaoLaboratorio(b, d);
    secaoTratamento(b, d);
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

  /* ------------------------------------------------------------------
   * Fotos da lesao (anexo)
   * ------------------------------------------------------------------
   * Cada foto chega ja como { bytes, tipo: "jpg"|"png" } (a tela converte
   * qualquer formato para JPEG reduzido). Duas por pagina A4, abaixo de um
   * cabecalho com o paciente e a data. Foto que o pdf-lib nao consegue ler
   * e pulada: a ficha em si nunca deixa de sair por causa de um anexo. */
  async function anexarFotos(PDFLib, doc, fotos, rotulo) {
    const lista = (Array.isArray(fotos) ? fotos : []).slice(0, MAX_FOTOS);
    const fonte = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    const negrito = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const preto = PDFLib.rgb(0, 0, 0);
    const cinza = PDFLib.rgb(0.35, 0.35, 0.35);
    const LARG = 523;
    const ALT = 335;
    let pagina = null;
    let naPagina = 0;
    let entraram = 0;
    for (let i = 0; i < lista.length; i++) {
      let img = null;
      try {
        img = lista[i].tipo === "png" ? await doc.embedPng(lista[i].bytes) : await doc.embedJpg(lista[i].bytes);
      } catch (e) {
        img = null;
      }
      if (!img) continue;
      if (!pagina || naPagina === 2) {
        pagina = doc.addPage();
        pagina.setSize(595, 842);
        naPagina = 0;
        pagina.drawText("ANEXO - FOTOS DA LESÃO", { x: 36, y: 806, size: 13, font: negrito, color: preto });
        pagina.drawText(D().saneaTexto(rotulo || ""), { x: 36, y: 790, size: 9, font: fonte, color: cinza });
      }
      const k = Math.min(LARG / img.width, ALT / img.height, 1.5);
      const w = img.width * k;
      const h = img.height * k;
      const topo = 770 - naPagina * (ALT + 40);
      pagina.drawImage(img, { x: 36 + (LARG - w) / 2, y: topo - 12 - h, width: w, height: h });
      pagina.drawText("Foto " + (entraram + 1), { x: 36, y: topo - 12 - h - 12, size: 8, font: fonte, color: cinza });
      naPagina++;
      entraram++;
    }
    return entraram;
  }

  raiz.MeedsNotificacaoLta = {
    TIPOS_ENTRADA: TIPOS_ENTRADA,
    HIV: HIV,
    CICATRIZ: CICATRIZ,
    FORMAS: FORMAS,
    DROGAS: DROGAS,
    LAB_PARASITO: LAB_PARASITO,
    LAB_HISTO: LAB_HISTO,
    PADRAO_LAB: PADRAO_LAB,
    MAX_FOTOS: MAX_FOTOS,
    CX: CX,
    validar: validar,
    montarOperacoes: montarOperacoes,
    anexarFotos: anexarFotos,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
