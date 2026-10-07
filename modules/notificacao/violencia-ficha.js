/* ------------------------------------------------------------------
 * modules/notificacao/violencia-ficha.js — Violência interpessoal/autoprovocada
 * ------------------------------------------------------------------
 * FICHA DE NOTIFICACAO INDIVIDUAL — VIOLENCIA INTERPESSOAL/AUTOPROVOCADA
 * (SINAN, SVS 03.06.2015, CID-10 Y09, versao 5.1). Mesmo desenho das
 * outras fichas: PDF oficial por baixo, valores desenhados na coordenada
 * da celula, logica pura testada em Node (tests/notificacao-violencia.test.js).
 * As pecas comuns (paciente, residencia, telefone, CPF, desenho, datas)
 * vem de MeedsNotificacaoDengue.base.
 *
 * O PDF OFICIAL DESTA FICHA E UMA IMAGEM ESCANEADA (sem texto nem campos):
 * as coordenadas foram medidas por analise de pixels a 300 dpi e conferidas
 * a olho sobre a pagina. O asset embutido e um raster 1-bit da mesma pagina
 * (595 x 842 pt), para o pacote nao crescer 2 MB.
 *
 * PREMISSAS (as mesmas das demais fichas):
 *  - so a primeira consulta; o que a vigilancia completa fica em branco
 *    (data de encerramento, assinatura, campos de georreferencia);
 *  - o numero do paciente e SEMPRE o CPF (sai no campo "Cartao SUS" com a
 *    marca "(CPF)");
 *  - item obrigatorio nunca sai em branco: o medico ATESTA o quadro e as
 *    caixas nao marcadas recebem 2 (Nao); "nao se aplica" sai 8 e
 *    "ignorado" sai 9 — o que a ficha oficial define;
 *  - dado sensivel: nada e gravado em disco.
 *
 * COORDENADAS: pontos, origem no canto superior esquerdo (595 x 842).
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  const D = function () { return raiz.MeedsNotificacaoDengue; };

  const SIM_NAO = [{ v: "1", r: "Sim" }, { v: "2", r: "Não" }, { v: "9", r: "Ignorado" }];
  const ESTADO_CIVIL = [
    { v: "1", r: "Solteiro" }, { v: "2", r: "Casado/união consensual" }, { v: "3", r: "Viúvo" },
    { v: "4", r: "Separado" }, { v: "8", r: "Não se aplica" }, { v: "9", r: "Ignorado" },
  ];
  const ORIENTACAO = [
    { v: "1", r: "Heterossexual" }, { v: "2", r: "Homossexual (gay/lésbica)" }, { v: "3", r: "Bissexual" },
    { v: "8", r: "Não se aplica" }, { v: "9", r: "Ignorado" },
  ];
  const IDENTIDADE = [
    { v: "1", r: "Travesti" }, { v: "2", r: "Mulher transexual" }, { v: "3", r: "Homem transexual" },
    { v: "8", r: "Não se aplica" }, { v: "9", r: "Ignorado" },
  ];
  const LOCAIS = [
    { v: "01", r: "Residência" }, { v: "02", r: "Habitação coletiva" }, { v: "03", r: "Escola" },
    { v: "04", r: "Local de prática esportiva" }, { v: "05", r: "Bar ou similar" }, { v: "06", r: "Via pública" },
    { v: "07", r: "Comércio/serviços" }, { v: "08", r: "Indústrias/construção" }, { v: "09", r: "Outro" }, { v: "99", r: "Ignorado" },
  ];
  const MOTIVACOES = [
    { v: "01", r: "Sexismo" }, { v: "02", r: "Homofobia/Lesbofobia/Bifobia/Transfobia" }, { v: "03", r: "Racismo" },
    { v: "04", r: "Intolerância religiosa" }, { v: "05", r: "Xenofobia" }, { v: "06", r: "Conflito geracional" },
    { v: "07", r: "Situação de rua" }, { v: "08", r: "Deficiência" }, { v: "09", r: "Outros" },
    { v: "88", r: "Não se aplica" }, { v: "99", r: "Ignorado" },
  ];
  const ENVOLVIDOS = [{ v: "1", r: "Um" }, { v: "2", r: "Dois ou mais" }, { v: "9", r: "Ignorado" }];
  const SEXO_AUTOR = [
    { v: "1", r: "Masculino" }, { v: "2", r: "Feminino" }, { v: "3", r: "Ambos os sexos" }, { v: "9", r: "Ignorado" },
  ];
  const CICLOS = [
    { v: "1", r: "Criança (0 a 9 anos)" }, { v: "2", r: "Adolescente (10 a 19 anos)" }, { v: "3", r: "Jovem (20 a 24 anos)" },
    { v: "4", r: "Pessoa adulta (25 a 59 anos)" }, { v: "5", r: "Pessoa idosa (60 anos ou mais)" }, { v: "9", r: "Ignorado" },
  ];
  const CAT = [{ v: "1", r: "Sim" }, { v: "2", r: "Não" }, { v: "8", r: "Não se aplica" }, { v: "9", r: "Ignorado" }];

  /* Caixas de marcar [x0, y0, x1, y1]. Cada grupo e 1-Sim / 2-Nao / 9-Ignorado. */
  const DEFICIENCIAS = [
    { id: "fisica", rotulo: "Deficiência física", caixa: [196.1, 598.3, 205.9, 607.0] },
    { id: "visual", rotulo: "Deficiência visual", caixa: [293.3, 598.8, 302.9, 607.4] },
    { id: "mental", rotulo: "Transtorno mental", caixa: [387.6, 599.3, 397.4, 607.9] },
    { id: "outras", rotulo: "Outras", caixa: [472.6, 600.2, 482.6, 609.1] },
    { id: "intelectual", rotulo: "Deficiência intelectual", caixa: [196.1, 610.1, 205.7, 619.2] },
    { id: "auditiva", rotulo: "Deficiência auditiva", caixa: [293.3, 610.6, 302.9, 619.7] },
    { id: "comportamento", rotulo: "Transtorno de comportamento", caixa: [387.6, 611.0, 397.2, 620.2] },
  ];
  const TIPOS = [
    { id: "fisica", rotulo: "Física", caixa: [67.4, 84.7, 78.5, 95.3] },
    { id: "psicologica", rotulo: "Psicológica/Moral", caixa: [67.4, 98.2, 78.5, 109.0] },
    { id: "tortura", rotulo: "Tortura", caixa: [67.9, 110.9, 79.0, 121.7] },
    { id: "sexual", rotulo: "Sexual", caixa: [67.7, 122.0, 79.0, 133.6] },
    { id: "trafico", rotulo: "Tráfico de seres humanos", caixa: [152.9, 84.0, 163.7, 94.8] },
    { id: "financeira", rotulo: "Financeira/Econômica", caixa: [152.4, 98.2, 163.4, 108.7] },
    { id: "negligencia", rotulo: "Negligência/Abandono", caixa: [152.4, 110.9, 163.4, 121.7] },
    { id: "trabalhoInfantil", rotulo: "Trabalho infantil", caixa: [152.2, 122.0, 163.7, 133.6] },
    { id: "intervencao", rotulo: "Intervenção legal", caixa: [255.6, 96.7, 266.4, 107.5] },
    { id: "outros", rotulo: "Outros", caixa: [255.6, 112.3, 266.6, 123.1] },
  ];
  const MEIOS = [
    { id: "forcaCorporal", rotulo: "Força corporal/espancamento", caixa: [346.3, 91.9, 356.2, 102.2] },
    { id: "enforcamento", rotulo: "Enforcamento", caixa: [346.1, 108.7, 356.2, 119.0] },
    { id: "contundente", rotulo: "Objeto contundente", caixa: [346.3, 124.6, 356.4, 134.6] },
    { id: "perfurocortante", rotulo: "Objeto perfurocortante", caixa: [422.6, 88.3, 433.0, 98.4] },
    { id: "substancia", rotulo: "Substância/objeto quente", caixa: [422.6, 104.9, 432.7, 115.0] },
    { id: "envenenamento", rotulo: "Envenenamento/intoxicação", caixa: [423.4, 120.7, 433.7, 130.8] },
    { id: "armaFogo", rotulo: "Arma de fogo", caixa: [495.6, 90.0, 505.7, 100.1] },
    { id: "ameaca", rotulo: "Ameaça", caixa: [496.1, 102.5, 506.2, 112.6] },
    { id: "outro", rotulo: "Outro", caixa: [496.6, 114.7, 506.4, 125.0] },
  ];
  const SEXUAIS = [
    { id: "assedio", rotulo: "Assédio sexual", caixa: [68.2, 150.5, 79.7, 161.3] },
    { id: "estupro", rotulo: "Estupro", caixa: [151.9, 149.3, 163.4, 160.1] },
    { id: "pornografia", rotulo: "Pornografia infantil", caixa: [231.6, 148.6, 242.9, 159.4] },
    { id: "exploracao", rotulo: "Exploração sexual", caixa: [335.5, 148.1, 346.8, 158.9] },
    { id: "outros", rotulo: "Outros", caixa: [438.2, 147.4, 450.0, 158.2] },
  ];
  const PROCEDIMENTOS = [
    { id: "profDst", rotulo: "Profilaxia DST", caixa: [67.2, 185.0, 78.2, 195.8] },
    { id: "profHiv", rotulo: "Profilaxia HIV", caixa: [67.0, 198.0, 78.2, 208.8] },
    { id: "profHepB", rotulo: "Profilaxia hepatite B", caixa: [153.6, 184.6, 164.6, 195.1] },
    { id: "sangue", rotulo: "Coleta de sangue", caixa: [153.6, 197.3, 164.6, 208.1] },
    { id: "semen", rotulo: "Coleta de sêmen", caixa: [266.2, 184.3, 277.0, 195.1] },
    { id: "secrecao", rotulo: "Coleta de secreção vaginal", caixa: [266.2, 197.0, 277.0, 207.8] },
    { id: "contracepcao", rotulo: "Contracepção de emergência", caixa: [407.0, 184.6, 418.3, 195.1] },
    { id: "aborto", rotulo: "Aborto previsto em lei", caixa: [407.0, 197.8, 418.3, 208.6] },
  ];
  const VINCULOS = [
    { id: "pai", rotulo: "Pai", caixa: [116.4, 227.8, 127.4, 238.6] },
    { id: "mae", rotulo: "Mãe", caixa: [115.9, 239.0, 127.4, 250.6] },
    { id: "padrasto", rotulo: "Padrasto", caixa: [116.4, 253.2, 127.4, 263.8] },
    { id: "madrasta", rotulo: "Madrasta", caixa: [116.2, 264.2, 127.4, 275.4] },
    { id: "conjuge", rotulo: "Cônjuge", caixa: [115.9, 276.0, 127.9, 287.4] },
    { id: "exConjuge", rotulo: "Ex-cônjuge", caixa: [171.1, 227.8, 182.2, 238.6] },
    { id: "namorado", rotulo: "Namorado(a)", caixa: [170.9, 239.0, 182.4, 250.6] },
    { id: "exNamorado", rotulo: "Ex-namorado(a)", caixa: [171.1, 253.2, 182.2, 263.8] },
    { id: "filho", rotulo: "Filho(a)", caixa: [170.9, 264.2, 182.4, 275.4] },
    { id: "irmao", rotulo: "Irmão(ã)", caixa: [170.9, 276.0, 182.4, 287.4] },
    { id: "amigos", rotulo: "Amigos/conhecidos", caixa: [250.1, 228.5, 260.9, 239.3] },
    { id: "desconhecido", rotulo: "Desconhecido(a)", caixa: [249.6, 239.7, 260.9, 251.4] },
    { id: "cuidador", rotulo: "Cuidador(a)", caixa: [250.1, 253.9, 260.9, 264.5] },
    { id: "patrao", rotulo: "Patrão/chefe", caixa: [250.1, 264.9, 261.1, 276.1] },
    { id: "institucional", rotulo: "Pessoa com relação institucional", caixa: [250.1, 276.9, 261.1, 288.1] },
    { id: "policial", rotulo: "Policial/agente da lei", caixa: [338.4, 229.2, 349.4, 239.8] },
    { id: "propria", rotulo: "Própria pessoa", caixa: [338.4, 254.6, 349.4, 265.2] },
    { id: "outros", rotulo: "Outros", caixa: [338.4, 265.6, 349.9, 276.8] },
  ];
  const ENCAMINHAMENTOS = [
    { id: "saude", rotulo: "Rede da Saúde (UBS, hospital, outras)", caixa: [50.4, 357.8, 62.2, 369.1] },
    { id: "assistencia", rotulo: "Rede da Assistência Social (CRAS, CREAS, outras)", caixa: [50.4, 372.2, 62.2, 383.5] },
    { id: "educacao", rotulo: "Rede da Educação (creche, escola, outras)", caixa: [50.6, 386.6, 62.2, 397.9] },
    { id: "mulher", rotulo: "Rede de Atendimento à Mulher", caixa: [50.9, 400.8, 62.4, 412.3] },
    { id: "tutelar", rotulo: "Conselho Tutelar", caixa: [50.9, 415.4, 62.4, 426.7] },
    { id: "conselhoIdoso", rotulo: "Conselho do Idoso", caixa: [283.2, 352.1, 294.7, 363.1] },
    { id: "delegIdoso", rotulo: "Delegacia de Atendimento ao Idoso", caixa: [283.2, 367.2, 294.7, 378.7] },
    { id: "centroDH", rotulo: "Centro de Referência dos Direitos Humanos", caixa: [283.2, 381.8, 294.7, 393.1] },
    { id: "ministerio", rotulo: "Ministério Público", caixa: [283.2, 397.0, 294.7, 408.5] },
    { id: "delegProtecao", rotulo: "Delegacia Especializada de Proteção à Criança e ao Adolescente", caixa: [283.2, 412.8, 294.7, 424.1] },
    { id: "delegMulher", rotulo: "Delegacia de Atendimento à Mulher", caixa: [432.5, 349.2, 444.2, 360.2] },
    { id: "outrasDeleg", rotulo: "Outras delegacias", caixa: [432.5, 366.0, 444.2, 377.3] },
    { id: "justica", rotulo: "Justiça da Infância e da Juventude", caixa: [432.5, 381.4, 444.0, 392.9] },
    { id: "defensoria", rotulo: "Defensoria Pública", caixa: [432.5, 400.1, 444.0, 411.6] },
  ];

  const CX = {
    tipoUnidade: [146.9, 171.1, 157.7, 181.9],
    gestante: [417.8, 256.8, 428.9, 267.6],
    sexo: [230.9, 257.5, 241.9, 268.1],
    raca: [550.3, 258.2, 561.6, 269.0],
    idadeUnidade: [108.2, 264.7, 119.3, 275.3],
    escolaridade: [551.3, 287.3, 562.1, 298.1],
    zona: [332.2, 451.4, 343.2, 462.2],
    estadoCivil: [548.2, 527.0, 559.7, 538.6],
    orientacao: [289.0, 554.6, 300.5, 565.9],
    identidade: [549.1, 556.6, 560.6, 568.1],
    deficiencia: [167.3, 589.2, 178.2, 600.4],
    ocorZona: [332.9, 704.2, 343.9, 714.7],
    outrasVezes: [551.3, 727.9, 562.3, 738.7],
    autoprovocada: [551.5, 754.8, 562.3, 765.6],
    envolvidos: [91.2, 235.9, 102.5, 246.5],
    sexoAutor: [480.7, 237.8, 492.0, 248.4],
    alcool: [549.6, 234.7, 560.9, 245.3],
    ciclo: [230.6, 297.6, 242.2, 308.9],
    trabalho: [163.4, 445.0, 175.9, 457.2],
    cat: [353.0, 445.9, 364.3, 456.7],
  };

  function uniforme(x0, x1, n) {
    const out = [];
    for (let i = 0; i <= n; i++) out.push(x0 + ((x1 - x0) * i) / n);
    return out;
  }

  /* Celulas de digitos: bordas (x) e o centro vertical. */
  const PENTE = {
    dataNotificacao: { bordas: uniforme(440.2, 561.5, 8), cy: 142.7 },
    ibgeNotif: { bordas: [473.8, 488.9, 503.8, 518.6, 533.5, 548.5, 561.4], cy: 163.1 },
    cnes: { bordas: [332.3, 346.7, 361.7, 376.6, 391.4, 406.3, 421.2, 435.7], cy: 227.4 },
    dataOcorrencia: { bordas: uniforme(439.5, 558.2, 8), cy: 217.5 },
    nascimento: { bordas: uniforme(444.7, 562.7, 8), cy: 248.4 },
    idade: { bordas: [60.8, 74.8, 88.9, 103.0], cy: 278.9 },
    cpf: { bordas: [52.1, 62.9, 74.6, 86.4, 98.2, 109.9, 121.7, 133.4, 145.2, 157.0, 168.7, 180.6, 192.4, 204.1, 215.9, 227.5], cy: 338.9 },
    ibgeRes: { bordas: [324.8, 338.3, 353.2, 368.2, 383.0, 397.9, 409.4], cy: 368.4 },
    cepA: { bordas: [454.7, 468.5, 483.4, 498.2, 513.1, 524.5], cy: 445.6 },
    cepB: { bordas: [528.3, 538.3, 553.3, 565.5], cy: 445.6 },
    telefone10: { bordas: [53.0, 67.0, 81.8, 96.7, 111.6, 126.5, 141.4, 156.2, 171.1, 186.1, 201.2], cy: 469.8 },
    ibgeOcor: { bordas: [324.8, 338.3, 353.2, 368.2, 383.0, 397.9, 410.9], cy: 648.0 },
    hora: { bordas: [490.7, 504.5, 517.6, 531.4, 544.8], cy: 722.0 },
    local: { bordas: [379.4, 391.4, 403.4], cy: 733.0 },
    motivacao: { bordas: [543.4, 554.3, 565.2], cy: 56.9 },
    cid: { bordas: [504.0, 517.7, 532.7, 547.4, 558.7], cy: 471.5 },
    telAcomp: { bordas: [417.2, 432.0, 446.9, 461.8, 476.6, 491.5, 506.4, 521.3, 536.3, 551.2, 564.5], cy: 556.3 },
    cnesNotif: { bordas: [449.4, 463.2, 478.1, 493.0, 507.8, 522.7, 537.7, 552.6], cy: 702.3 },
  };
  const UF_NOTIF = { bordas: [53.0, 66.3, 79.0], cy: 164.5 };
  const UF_RES = { bordas: [53.0, 66.5, 80.5], cy: 368.5 };
  const UF_OCOR = { bordas: [54.4, 67.8, 81.5], cy: 648.5 };
  const LINHAS_OBS = [584.3, 595.9, 607.5, 617.9, 632.0];

  /* ------------------------------------------------------------------
   * Utilidades
   * ------------------------------------------------------------------ */
  function lista(x) { return D().base.lista(x); }
  function tem(grupo, id) { return lista(grupo).indexOf(id) !== -1; }
  function codigoEm(valor, validos) { return validos.indexOf(String(valor == null ? "" : valor)) !== -1; }
  function opcaoEm(valor, opcoes) { return codigoEm(valor, opcoes.map(function (o) { return o.v; })); }
  function vazio(v) { return D().base.vazio(v); }

  function idadeEmAnos(d, hojeIso) {
    const i = D().idadeDe(d.nascimento, hojeIso);
    if (!i) return null;
    return i.unidade === "4" ? i.valor : 0;
  }

  /* Ciclo de vida (item 64) a partir da idade em anos. */
  function cicloDe(anos) {
    if (anos == null) return "";
    if (anos < 10) return "1";
    if (anos < 20) return "2";
    if (anos < 25) return "3";
    if (anos < 60) return "4";
    return "5";
  }

  function sexual(d) { return tem(d.tipos, "sexual"); }
  function autoprovocada(d) { return String(d.autoprovocada || "") === "1"; }

  /* "HH:MM" -> 4 digitos (ou "" se invalido). */
  function horaEmDigitos(h) {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(h || "").trim());
    return m ? m[1] + m[2] : "";
  }

  /* CID-10 do capitulo XX (X60-Y09): "X95", "X954", "x95.4" -> "X954". */
  function normalizarCid(v) {
    return String(v == null ? "" : v).toUpperCase().replace(/[^A-Z0-9]/g, "");
  }
  function cidValido(v) {
    const c = normalizarCid(v);
    if (!/^[XY]\d{2}\d?$/.test(c)) return false;
    const n = (c.charAt(0) === "X" ? 0 : 100) + Number(c.slice(1, 3));
    return n >= 60 && n <= 109; // X60 ... Y09
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

  /* Grupo de caixas 1/2/9: ao menos uma marcada OU a atestacao. */
  function atestado(c, o) {
    const marcou = lista(c.d[o.itens]).length > 0;
    const atesta = !!c.d[o.atesta];
    if (!marcou && !atesta) c.erro(o.itens, o.faltando);
    else if (marcou && atesta) c.erro(o.itens, o.contradicao);
  }

  function validarOcorrencia(c) {
    const d = c.d;
    if (vazio(d.dataOcorrencia)) c.erro("dataOcorrencia", "Informe a data da ocorrência da violência (9).");
    else {
      const dt = dataNaoFutura(c, "dataOcorrencia", "A data da ocorrência");
      if (dt && c.nasc && dt.t < c.nasc.t) c.erro("dataOcorrencia", "A data da ocorrência é anterior ao nascimento do paciente — confira as duas datas.");
    }
    const uf = String(d.ocorUf || "").toUpperCase();
    if (D().UFS.indexOf(uf) === -1) c.erro("ocorUf", "Informe a UF onde ocorreu a violência (40).");
    else if (!D().saneaTexto(d.ocorMunicipio)) c.erro("ocorMunicipio", "Informe o município de ocorrência (41).");
    else if (!D().buscarMunicipio(uf, d.ocorMunicipio)) c.erro("ocorMunicipio", "O município de ocorrência não consta na UF " + uf + ". Escolha um da lista.");
    if (!vazio(d.ocorHora) && !horaEmDigitos(d.ocorHora)) c.erro("ocorHora", "A hora da ocorrência precisa estar entre 00:00 e 23:59.");
    if (!opcaoEm(d.local, LOCAIS)) c.erro("local", "Informe o local de ocorrência (52).");
    if (!opcaoEm(d.outrasVezes, SIM_NAO)) c.erro("outrasVezes", "Informe se a violência ocorreu outras vezes (53).");
    if (!opcaoEm(d.autoprovocada, SIM_NAO)) c.erro("autoprovocada", "Informe se a lesão foi autoprovocada (54).");
  }

  function validarPessoa(c) {
    const d = c.d;
    if (!codigoEm(d.raca, ["1", "2", "3", "4", "5", "9"])) c.erro("raca", "Informe a raça/cor do paciente (15).");
    if (!opcaoEm(d.estadoCivil, ESTADO_CIVIL)) c.erro("estadoCivil", "Informe a situação conjugal (35).");
    if (!opcaoEm(d.orientacao, ORIENTACAO)) c.erro("orientacao", "Informe a orientação sexual (36) — “Não se aplica” ou “Ignorado” valem.");
    if (!opcaoEm(d.identidade, IDENTIDADE)) c.erro("identidade", "Informe a identidade de gênero (37) — “Não se aplica” ou “Ignorado” valem.");
    if (!opcaoEm(d.deficiencia, SIM_NAO)) c.erro("deficiencia", "Informe se o paciente tem deficiência ou transtorno (38).");
    else if (d.deficiencia === "1" && lista(d.defTipos).length === 0) {
      c.erro("defTipos", "Deficiência/transtorno “Sim”: marque o tipo (39).");
    }
  }

  function validarViolencia(c) {
    const d = c.d;
    if (!opcaoEm(d.motivacao, MOTIVACOES)) c.erro("motivacao", "Informe a motivação da violência (55) — “Não se aplica” ou “Ignorado” valem.");
    if (lista(d.tipos).length === 0) c.erro("tipos", "Marque ao menos um tipo de violência (56).");
    atestado(c, {
      itens: "meios", atesta: "meiosIgnorado",
      faltando: "Meio de agressão (57): marque os meios usados ou confirme “Ignorado”.",
      contradicao: "Meio de agressão (57): você marcou “Ignorado” e também marcou meios — desfaça um dos dois.",
    });
    if (!sexual(d)) return;
    atestado(c, {
      itens: "sexTipos", atesta: "sexIgnorado",
      faltando: "Violência sexual (58): marque o tipo ou confirme “Ignorado”.",
      contradicao: "Violência sexual (58): você marcou “Ignorado” e também marcou tipos — desfaça um dos dois.",
    });
    atestado(c, {
      itens: "procedimentos", atesta: "procNenhum",
      faltando: "Procedimentos realizados (59): marque os realizados ou confirme “Nenhum procedimento nesta consulta”.",
      contradicao: "Procedimentos (59): você marcou “Nenhum” e também marcou procedimentos — desfaça um dos dois.",
    });
  }

  function validarAutor(c) {
    const d = c.d;
    if (!opcaoEm(d.envolvidos, ENVOLVIDOS)) c.erro("envolvidos", "Informe o número de envolvidos (60).");
    atestado(c, {
      itens: "vinculos", atesta: "vinculoIgnorado",
      faltando: "Vínculo com o provável autor (61): marque os que se aplicam ou confirme “Ignorado”.",
      contradicao: "Vínculo (61): você marcou “Ignorado” e também marcou vínculos — desfaça um dos dois.",
    });
    if (autoprovocada(d) && !tem(d.vinculos, "propria")) c.erro("vinculos", "Lesão autoprovocada (54): o vínculo (61) é “Própria pessoa”.");
    if (String(d.autoprovocada || "") === "2" && tem(d.vinculos, "propria")) {
      c.erro("vinculos", "“Própria pessoa” só vale quando a lesão foi autoprovocada (54 = Sim).");
    }
    if (!opcaoEm(d.sexoAutor, SEXO_AUTOR)) c.erro("sexoAutor", "Informe o sexo do provável autor (62).");
    if (!opcaoEm(d.alcool, SIM_NAO)) c.erro("alcool", "Informe se há suspeita de uso de álcool (63).");
    if (!opcaoEm(d.ciclo, CICLOS)) c.erro("ciclo", "Informe o ciclo de vida do provável autor (64).");
  }

  function validarEncaminhamento(c) {
    const d = c.d;
    atestado(c, {
      itens: "encaminhamentos", atesta: "encNenhum",
      faltando: "Encaminhamento (65): marque os feitos ou confirme “Nenhum encaminhamento nesta consulta”.",
      contradicao: "Encaminhamento (65): você marcou “Nenhum” e também marcou encaminhamentos — desfaça um dos dois.",
    });
    if (!opcaoEm(d.trabalho, SIM_NAO)) c.erro("trabalho", "Informe se a violência é relacionada ao trabalho (66).");
    else if (d.trabalho === "1" && !opcaoEm(d.cat, CAT.filter(function (o) { return o.v !== "8"; }))) {
      c.erro("cat", "Violência relacionada ao trabalho: informe se foi emitida a CAT (67).");
    }
    if (!vazio(d.cid) && !cidValido(d.cid)) {
      c.erro("cid", "A circunstância da lesão (68) usa o CID-10 do capítulo XX, de X60 a Y09 (ex.: X954).");
    }
  }

  function validarAcompanhante(c) {
    const tel = D().base.soDigitos(c.d.acompTelefone);
    if (tel && ((tel.length !== 10 && tel.length !== 11) || tel.charAt(0) === "0")) {
      c.erro("acompTelefone", "O telefone do acompanhante precisa ter DDD + número (10 ou 11 dígitos).");
    }
  }

  function validar(d, hojeIso) {
    const b = D().base;
    const c = b.novoContexto(d, hojeIso);
    [b.validarPaciente, b.validarResidencia, b.validarTelefone, b.validarOpcionais, validarPessoa, validarOcorrencia,
      validarViolencia, validarAutor, validarEncaminhamento, validarAcompanhante]
      .forEach(function (etapa) { etapa(c); });
    return c.erros;
  }

  /* ------------------------------------------------------------------
   * Operacoes de desenho
   * ------------------------------------------------------------------ */
  /* A trama sombreada do PDF escaneado atrapalha a leitura: cada celula
   * ganha um fundo branco (com folga de 0,8 pt, para o traco divisor ficar). */
  function limparCelulas(b, pg, def, altura) {
    for (let i = 0; i < def.bordas.length - 1; i++) {
      b.fundo({ pg: pg, x: def.bordas[i] + 0.8, y: def.cy - altura / 2, w: def.bordas[i + 1] - def.bordas[i] - 1.6, h: altura });
    }
  }

  function ufEmCelulas(b, pg, uf, def) {
    const u = String(uf || "").toUpperCase();
    if (D().UFS.indexOf(u) === -1) return;
    limparCelulas(b, pg, def, 8.4);
    b.pente(pg, def, u);
  }

  function secaoDadosGerais(b, d, hoje) {
    const base = D().base;
    b.caixa(0, CX.tipoUnidade, "1"); // unidade de saude: o atendimento e por telemedicina na unidade
    b.pente(0, PENTE.dataNotificacao, base.ddmmaaaa(hoje));
    ufEmCelulas(b, 0, d.ufNotif, UF_NOTIF);
    b.texto({ pg: 0, x: 90, y: 164.0, valor: d.municipioNotif, larg: 370 });
    const mun = D().buscarMunicipio(String(d.ufNotif || "").toUpperCase(), d.municipioNotif);
    if (mun) b.pente(0, PENTE.ibgeNotif, mun.codigo);
    b.texto({ pg: 0, x: 130, y: 226.0, valor: d.unidade, larg: 195 });
    if (base.soDigitos(d.cnes).length === 7) b.pente(0, PENTE.cnes, base.soDigitos(d.cnes));
    if (base.lerData(d.dataOcorrencia)) b.pente(0, PENTE.dataOcorrencia, base.ddmmaaaa(d.dataOcorrencia));
  }

  function secaoPaciente(b, d, hoje) {
    const base = D().base;
    b.texto({ pg: 0, x: 58, y: 252.5, valor: d.nome, tam: 9.5, larg: 370, negrito: true });
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
      b.texto({ pg: 0, x: 160, y: 326.0, valor: "(CPF)", tam: 8, negrito: true });
    }
    b.texto({ pg: 0, x: 248, y: 341.0, valor: d.mae, larg: 305 });
  }

  /* A ficha tem 10 celulas de telefone; celular (11) divide a ultima. */
  function telefoneDe11(b, def, tel, pg) {
    const bd = def.bordas;
    const centro = function (i) { return (bd[i] + bd[i + 1]) / 2; };
    for (let i = 0; i < 9; i++) b.centro({ pg: pg, cx: centro(i), cy: def.cy, texto: tel.charAt(i), tam: 9 });
    b.centro({ pg: pg, cx: centro(9) - 3.6, cy: def.cy, texto: tel.charAt(9), tam: 8 });
    b.centro({ pg: pg, cx: centro(9) + 3.6, cy: def.cy, texto: tel.charAt(10), tam: 8 });
  }

  function telefone(b, def, valor, pg) {
    const tel = D().base.soDigitos(valor);
    if (tel.length === 10) b.pente(pg, def, tel);
    else if (tel.length === 11) telefoneDe11(b, def, tel, pg);
  }

  function secaoResidencia(b, d) {
    const base = D().base;
    const uf = String(d.ufRes || "").toUpperCase();
    ufEmCelulas(b, 0, uf, UF_RES);
    const mun = D().buscarMunicipio(uf, d.municipioRes);
    b.texto({ pg: 0, x: 90, y: 371.0, valor: mun ? mun.nome : d.municipioRes, larg: 230 });
    if (mun) b.pente(0, PENTE.ibgeRes, mun.codigo);
    b.texto({ pg: 0, x: 61, y: 393.0, valor: d.bairro, larg: 132 });
    b.texto({ pg: 0, x: 200, y: 393.0, valor: d.logradouro, larg: 250 });
    b.texto({ pg: 0, x: 61, y: 414.0, valor: d.numero, larg: 52 });
    b.texto({ pg: 0, x: 130, y: 414.0, valor: d.complemento, larg: 275 });
    b.texto({ pg: 0, x: 222, y: 443.0, valor: d.referencia, larg: 215 });
    const cep = base.soDigitos(d.cep);
    if (cep.length === 8) {
      b.pente(0, PENTE.cepA, cep.slice(0, 5));
      b.pente(0, PENTE.cepB, cep.slice(5));
    }
    telefone(b, PENTE.telefone10, d.telefone, 0);
    if (d.zona) b.caixa(0, CX.zona, d.zona);
  }

  /* 38-39: deficiencia. Sim -> tipos 1/2; Nao/Ignorado -> tipos 8. */
  function secaoDeficiencia(b, d) {
    if (d.deficiencia) b.caixa(0, CX.deficiencia, String(d.deficiencia));
    const sel = lista(d.defTipos);
    DEFICIENCIAS.forEach(function (i) {
      if (d.deficiencia === "1") b.caixa(0, i.caixa, sel.indexOf(i.id) !== -1 ? "1" : "2", 8);
      else if (d.deficiencia) b.caixa(0, i.caixa, "8", 8);
    });
    if (d.deficiencia === "1" && tem(d.defTipos, "outras")) b.texto({ pg: 0, x: 511, y: 607.0, valor: d.defOutras, tam: 7, larg: 42 });
  }

  function secaoComplementares(b, d) {
    b.texto({ pg: 0, x: 61, y: 513.0, valor: d.nomeSocial, larg: 283 });
    b.texto({ pg: 0, x: 356, y: 513.0, valor: d.ocupacao, larg: 200 });
    if (d.estadoCivil) b.caixa(0, CX.estadoCivil, String(d.estadoCivil));
    if (d.orientacao) b.caixa(0, CX.orientacao, String(d.orientacao));
    if (d.identidade) b.caixa(0, CX.identidade, String(d.identidade));
    secaoDeficiencia(b, d);
  }

  function secaoOcorrencia(b, d) {
    const uf = String(d.ocorUf || "").toUpperCase();
    ufEmCelulas(b, 0, uf, UF_OCOR);
    const mun = D().buscarMunicipio(uf, d.ocorMunicipio);
    b.texto({ pg: 0, x: 98, y: 651.0, valor: mun ? mun.nome : d.ocorMunicipio, larg: 222 });
    if (mun) b.pente(0, PENTE.ibgeOcor, mun.codigo);
    b.texto({ pg: 0, x: 61, y: 672.5, valor: d.ocorBairro, larg: 132 });
    b.texto({ pg: 0, x: 200, y: 672.5, valor: d.ocorLogradouro, larg: 250 });
    b.texto({ pg: 0, x: 61, y: 696.0, valor: d.ocorNumero, larg: 52 });
    b.texto({ pg: 0, x: 130, y: 696.0, valor: d.ocorComplemento, larg: 275 });
    b.texto({ pg: 0, x: 61, y: 723.0, valor: d.ocorReferencia, larg: 220 });
    if (d.ocorZona) b.caixa(0, CX.ocorZona, d.ocorZona);
    const hora = horaEmDigitos(d.ocorHora);
    if (hora) b.pente(0, PENTE.hora, hora);
    if (d.local) {
      b.pente(0, PENTE.local, d.local);
      if (d.local === "09") b.texto({ pg: 0, x: 321, y: 758.5, valor: d.localOutro, tam: 7, larg: 52 });
    }
    if (d.outrasVezes) b.caixa(0, CX.outrasVezes, String(d.outrasVezes));
    if (d.autoprovocada) b.caixa(0, CX.autoprovocada, String(d.autoprovocada));
  }

  /* Grupo 1/2/9: o medico atestou — 1 nas marcadas, 2 nas demais, ou 9. */
  function grupo(b, catalogo, marcados, ignorado) {
    const sel = lista(marcados);
    catalogo.forEach(function (i) {
      b.caixa(1, i.caixa, ignorado ? "9" : sel.indexOf(i.id) !== -1 ? "1" : "2", 9);
    });
  }

  function secaoViolencia(b, d) {
    if (d.motivacao) {
      b.pente(1, PENTE.motivacao, d.motivacao);
    }
    grupo(b, TIPOS, d.tipos, false);
    if (tem(d.tipos, "outros")) b.texto({ pg: 1, x: 271, y: 129.5, valor: d.tipoOutro, tam: 7, larg: 55 });
    grupo(b, MEIOS, d.meios, !!d.meiosIgnorado);
    if (tem(d.meios, "outro")) b.texto({ pg: 1, x: 531, y: 121.7, valor: d.meioOutro, tam: 7, larg: 29 });
    /* 58 e 59 so existem se houve violencia sexual; senao, 8 - nao se aplica. */
    SEXUAIS.forEach(function (i) {
      b.caixa(1, i.caixa, sexual(d) ? (d.sexIgnorado ? "9" : tem(d.sexTipos, i.id) ? "1" : "2") : "8", 9);
    });
    PROCEDIMENTOS.forEach(function (i) {
      b.caixa(1, i.caixa, sexual(d) ? (tem(d.procedimentos, i.id) ? "1" : "2") : "8", 9);
    });
    if (sexual(d) && tem(d.sexTipos, "outros")) b.texto({ pg: 1, x: 479, y: 155.8, valor: d.sexOutro, tam: 7, larg: 49 });
  }

  function secaoAutor(b, d) {
    if (d.envolvidos) b.caixa(1, CX.envolvidos, String(d.envolvidos));
    grupo(b, VINCULOS, d.vinculos, !!d.vinculoIgnorado);
    if (tem(d.vinculos, "outros")) b.texto({ pg: 1, x: 377, y: 272.3, valor: d.vinculoOutro, tam: 7, larg: 31 });
    if (d.sexoAutor) b.caixa(1, CX.sexoAutor, String(d.sexoAutor));
    if (d.alcool) b.caixa(1, CX.alcool, String(d.alcool));
    if (d.ciclo) b.caixa(1, CX.ciclo, String(d.ciclo));
  }

  function secaoEncaminhamento(b, d) {
    grupo(b, ENCAMINHAMENTOS, d.encaminhamentos, false);
    if (d.trabalho) b.caixa(1, CX.trabalho, String(d.trabalho));
    /* 67: so se a violencia foi relacionada ao trabalho; senao, 8. */
    if (d.trabalho === "1") b.caixa(1, CX.cat, String(d.cat || ""));
    else if (d.trabalho) b.caixa(1, CX.cat, "8");
    if (cidValido(d.cid)) {
      limparCelulas(b, 1, PENTE.cid, 9.5);
      b.pente(1, PENTE.cid, normalizarCid(d.cid));
    }
  }

  /* Textos "outros" que nao cabem na linha impressa tambem vao para as
   * observacoes — a linha da ficha tem de 14 a 55 pt. */
  function observacoes(d) {
    const extras = [];
    [["55", d.motivacao === "09" ? d.motivacaoOutro : ""],
      ["56", tem(d.tipos, "outros") ? d.tipoOutro : ""],
      ["57", tem(d.meios, "outro") ? d.meioOutro : ""],
      ["58", sexual(d) && tem(d.sexTipos, "outros") ? d.sexOutro : ""],
      ["61", tem(d.vinculos, "outros") ? d.vinculoOutro : ""],
      ["39", d.deficiencia === "1" && tem(d.defTipos, "outras") ? d.defOutras : ""],
      ["52", d.local === "09" ? d.localOutro : ""]].forEach(function (p) {
      const t = D().saneaTexto(p[1]);
      if (t) extras.push("(" + p[0] + " outros) " + t);
    });
    return [D().saneaTexto(d.observacoes, true)].concat(extras).filter(Boolean).join(" — ");
  }

  function secaoFinais(b, d) {
    b.texto({ pg: 1, x: 36, y: 557.0, valor: d.acompNome, larg: 190 });
    b.texto({ pg: 1, x: 244, y: 557.0, valor: d.acompVinculo, larg: 165 });
    telefone(b, PENTE.telAcomp, d.acompTelefone, 1);
    const obs = observacoes(d);
    if (obs) b.ops.push({ pg: 1, tipo: "bloco", x: 32, linhas: LINHAS_OBS, larg: 526, texto: obs, tam: 9 });
    /* Bloco "Notificador": so com medico escolhido (sem ele ficaria uma unidade sem responsavel). */
    if (!D().saneaTexto(d.medicoNome)) return;
    b.texto({ pg: 1, x: 57, y: 703.5, valor: [d.municipioNotif, d.unidade].filter(Boolean).join(" / "), larg: 385 });
    if (D().base.soDigitos(d.cnes).length === 7) b.pente(1, PENTE.cnesNotif, D().base.soDigitos(d.cnes));
    b.texto({ pg: 1, x: 57, y: 733.5, valor: d.medicoNome, larg: 185 });
    b.texto({ pg: 1, x: 260, y: 733.5, valor: d.medicoFuncao, larg: 190 });
  }

  function montarOperacoes(d, hojeIso) {
    const b = D().base.criarDesenho();
    const hoje = String(hojeIso || "");
    secaoDadosGerais(b, d, hoje);
    secaoPaciente(b, d, hoje);
    secaoResidencia(b, d);
    secaoComplementares(b, d);
    secaoOcorrencia(b, d);
    secaoViolencia(b, d);
    secaoAutor(b, d);
    secaoEncaminhamento(b, d);
    secaoFinais(b, d);
    return b.ops;
  }

  raiz.MeedsNotificacaoViolencia = {
    SIM_NAO: SIM_NAO,
    ESTADO_CIVIL: ESTADO_CIVIL,
    ORIENTACAO: ORIENTACAO,
    IDENTIDADE: IDENTIDADE,
    LOCAIS: LOCAIS,
    MOTIVACOES: MOTIVACOES,
    ENVOLVIDOS: ENVOLVIDOS,
    SEXO_AUTOR: SEXO_AUTOR,
    CICLOS: CICLOS,
    CAT: CAT,
    DEFICIENCIAS: DEFICIENCIAS,
    TIPOS: TIPOS,
    MEIOS: MEIOS,
    SEXUAIS: SEXUAIS,
    PROCEDIMENTOS: PROCEDIMENTOS,
    VINCULOS: VINCULOS,
    ENCAMINHAMENTOS: ENCAMINHAMENTOS,
    CX: CX,
    cicloDe: cicloDe,
    cidValido: cidValido,
    normalizarCid: normalizarCid,
    horaEmDigitos: horaEmDigitos,
    idadeEmAnos: idadeEmAnos,
    temViolenciaSexual: sexual,
    validar: validar,
    montarOperacoes: montarOperacoes,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
