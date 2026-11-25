/* ------------------------------------------------------------------
 * modules/notificacao/covid-ficha.js - Sindrome gripal suspeita de COVID-19
 * ------------------------------------------------------------------
 * FICHA DE INVESTIGACAO DE SG SUSPEITO DE DOENCA PELO CORONAVIRUS 2019 —
 * COVID-19 (B34.2), e-SUS Notifica, versao 05/10/2020. Mesmo desenho das
 * outras fichas: PDF oficial por baixo, valores desenhados na coordenada
 * da celula, logica pura testada em Node (tests/notificacao-covid.test.js).
 * As pecas comuns (desenho, datas, CPF) vem de MeedsNotificacaoDengue.base.
 *
 * PREMISSAS (as mesmas das demais fichas):
 *  - so a primeira consulta; exames, evolucao, classificacao final e
 *    encerramento ficam em branco (vigilancia);
 *  - o numero do paciente e SEMPRE o CPF; o CNS so entra se a tela trouxer
 *    um CNS valido de 15 digitos;
 *  - dado sensivel: nada e gravado em disco.
 *
 * COORDENADAS: pontos, origem no canto superior esquerdo (595 x 842).
 * Medidas com PyMuPDF sobre o texto do PDF oficial (cada |__| e uma caixa
 * delimitada pelas duas barras; pentes = celulas de sublinhado) e conferidas
 * a olho sobre a pagina renderizada. Texto livre: "y" e a linha de base,
 * "larg" a largura util do campo. NOTA: a ficha traz 14 celulas para o CNS
 * (15 digitos); a 15a celula e extrapolada alem da ultima, na area em branco.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  /* Caixas de marcar [x0, y0, x1, y1]. */
  const SINTOMAS = [
    { id: "assintomatico", rotulo: "Assintomático", caixa: [70.4, 429.8, 84.9, 439.8] },
    { id: "febre", rotulo: "Febre", caixa: [153.9, 429.8, 168.5, 439.8] },
    { id: "garganta", rotulo: "Dor de garganta", caixa: [219.1, 429.8, 233.5, 439.8] },
    { id: "dispneia", rotulo: "Dispneia", caixa: [328.0, 429.8, 342.4, 439.8] },
    { id: "tosse", rotulo: "Tosse", caixa: [405.0, 429.8, 419.4, 439.8] },
    { id: "coriza", rotulo: "Coriza", caixa: [469.6, 429.8, 484.0, 439.8] },
    { id: "cabeca", rotulo: "Dor de cabeça", caixa: [70.4, 442.0, 84.9, 452.0] },
    { id: "gustativos", rotulo: "Distúrbios gustatórios", caixa: [153.0, 442.0, 167.5, 452.0] },
    { id: "olfativos", rotulo: "Distúrbios olfativos", caixa: [263.3, 442.0, 278.0, 452.0] },
    { id: "outros", rotulo: "Outros", caixa: [367.6, 442.0, 382.2, 452.0] },
  ];
  const CONDICOES = [
    { id: "respiratoria", rotulo: "Doenças respiratórias crônicas descompensadas", caixa: [70.4, 468.1, 84.9, 478.1] },
    { id: "diabetes", rotulo: "Diabetes", caixa: [396.3, 468.1, 410.7, 478.1] },
    { id: "obesidade", rotulo: "Obesidade", caixa: [500.9, 468.1, 515.3, 478.1] },
    { id: "renal", rotulo: "Doenças renais crônicas em estágio avançado (graus 3, 4 e 5)", caixa: [70.4, 480.3, 84.9, 490.3] },
    { id: "imunossupressao", rotulo: "Imunossupressão", caixa: [396.0, 480.3, 410.4, 490.3] },
    { id: "cromossomica", rotulo: "Portador de doenças cromossômicas ou estado de fragilidade imunológica", caixa: [70.4, 492.6, 84.9, 502.6] },
    { id: "gestante", rotulo: "Gestante", caixa: [395.8, 492.6, 410.4, 502.6] },
    { id: "cardiaca", rotulo: "Doenças cardíacas crônicas", caixa: [70.4, 504.8, 84.9, 514.8] },
    { id: "puerpera", rotulo: "Puérpera (até 45 dias do parto)", caixa: [396.7, 504.8, 411.1, 514.8] },
  ];
  const RACAS = [
    { v: "branca", r: "Branca", caixa: [201.5, 305.5, 217.6, 316.5] },
    { v: "preta", r: "Preta", caixa: [256.0, 305.5, 272.1, 316.5] },
    { v: "amarela", r: "Amarela", caixa: [303.5, 305.5, 319.5, 316.5] },
    { v: "parda", r: "Parda", caixa: [367.2, 305.5, 383.2, 316.5] },
    { v: "indigena", r: "Indígena", caixa: [201.5, 319.0, 217.6, 330.0] },
    { v: "ignorado", r: "Ignorado", caixa: [366.4, 319.0, 382.5, 330.0] },
  ];

  const CX = {
    ufNotif: { bordas: [51.0, 67.1, 83.2], cy: 168.5 },
    municipioNotif: { x: 143.4, y: 172.0, larg: 131.4 },
    temCpf: { sim: [70.6, 193.5, 86.7, 204.5], nao: [110.0, 193.5, 126.0, 204.5] },
    estrangeiro: { sim: [162.8, 193.5, 178.8, 204.5], nao: [204.7, 193.5, 220.6, 204.5] },
    profSaude: { sim: [269.1, 190.5, 285.2, 201.5], nao: [311.0, 190.5, 326.9, 201.5] },
    profSeguranca: { sim: [417.9, 193.5, 434.0, 204.5], nao: [459.8, 193.5, 475.8, 204.5] },
    cbo: { x: 97.0, y: 219.3, larg: 225 },
    cpf: { bordas: [354.4, 370.4, 386.4, 402.6, 418.2, 434.8, 450.2, 466.6, 482.4, 498.7, 514.3, 530.8], cy: 215.8 },
    cns: { bordas: [89.3, 105.5, 121.3, 137.7, 153.1, 169.9, 185.2, 201.6, 217.4, 233.7, 249.3, 265.8, 281.4, 297.8, 313.3, 330.0], cy: 232.7 },
    nome: { x: 152.3, y: 253.1, larg: 415 },
    mae: { x: 189.2, y: 270.0, larg: 378 },
    nascimento: { x: 167.3, y: 287.0, larg: 92.3 },
    pais: { x: 408.7, y: 287.0, larg: 160 },
    sexo: { M: [70.6, 305.5, 86.7, 316.5], F: [70.6, 319.0, 86.7, 330.0] },
    etnia: { x: 292.6, y: 327.8, larg: 71.2 },
    passaporte: { bordas: [443.0, 459.2, 475.2, 491.3, 507.2, 523.3, 539.3, 555.4, 571.1], cy: 310.8 },
    cep: { bordas: [88.1, 104.2, 120.2, 136.3, 152.3, 168.2, 190.9, 200.3, 223.1], cy: 338.2 },
    ufRes: { bordas: [170.1, 186.2, 202.1], cy: 352.1 },
    municipioRes: { x: 351.7, y: 355.6, larg: 158.8 },
    logradouro: { x: 127.8, y: 369.5, larg: 225 },
    numero: { x: 407.4, y: 369.5, larg: 33 },
    bairro: { x: 483.2, y: 369.5, larg: 87 },
    complemento: { x: 142.6, y: 383.4, larg: 425 },
    celular: { x: 149.7, y: 397.4, larg: 172 },
    contato: { x: 431.1, y: 397.4, larg: 138 },
    dataNotificacao: { x: 163.3, y: 411.3, larg: 65 },
    inicioSintomas: { x: 463.3, y: 411.3, larg: 65 },
    sintomaOutros: { x: 412.4, y: 450.0, larg: 144 },
    observacoes: { x: 47, larg: 524, linhas: [804.5, 818.5] },
    /* "Estado do Teste": a partir dessa altura a ficha e da vigilancia
     * (exames, evolucao, classificacao, encerramento) e nada e desenhado. */
    limiteEncerramento: 518.1,
  };

  const B = function () { return raiz.MeedsNotificacaoDengue.base; };

  /* CNS definitivo (15 digitos, comeca em 1/2/7/8/9): soma ponderada
   * dig[i] * (15 - i) divisivel por 11. Todos iguais e recusado. */
  function cnsValido(v) {
    const s = String(v == null ? "" : v);
    if (!/^[12789]\d{14}$/.test(s) || /^(\d)\1+$/.test(s)) return false;
    let soma = 0;
    for (let i = 0; i < 15; i++) soma += Number(s.charAt(i)) * (15 - i);
    return soma % 11 === 0;
  }

  /* Primeiro numero de exatamente 15 digitos que seja um CNS valido. */
  function extrairCns(linhas) {
    const achados = (Array.isArray(linhas) ? linhas : []).join("\n").match(/\d+/g) || [];
    return achados.filter(function (t) { return t.length === 15 && cnsValido(t); })[0] || "";
  }

  function validarNotificacao(c) {
    if (B().vazio(c.d.ufNotif) || B().vazio(c.d.municipioNotif)) {
      c.erro(B().vazio(c.d.ufNotif) ? "ufNotif" : "municipioNotif", "Falta a UF/o município da notificação — vêm do Vínculo; escolha da lista.");
    }
  }

  function validarIdentificacao(c) {
    const d = c.d;
    if (d.temCpf && !B().cpfValido(d.cpf)) {
      c.erro("cpf", "O CPF não é válido (11 dígitos). Confira o número ou marque que o paciente não tem CPF.");
    }
    if (!B().vazio(d.cns) && !cnsValido(B().soDigitos(d.cns))) {
      c.erro("cns", "O CNS tem 15 dígitos e não confere. Confira ou deixe em branco.");
    }
  }

  /* Mesmos textos de validarPaciente da dengue, sem gestante e sem "Ignorado". */
  function validarPaciente(c) {
    const d = c.d;
    if (B().vazio(d.nome)) c.erro("nome", "Informe o nome completo do paciente.");
    if (B().vazio(d.nascimento)) c.erro("nascimento", "Informe a data de nascimento.");
    else if (!c.nasc) c.erro("nascimento", "A data de nascimento não é uma data válida.");
    else if (c.nasc.t > c.hoje.t) c.erro("nascimento", "A data de nascimento não pode ser futura.");
    else if (c.hoje.a - c.nasc.a > 130) c.erro("nascimento", "A data de nascimento indica mais de 130 anos — confira o ano.");
    if (["M", "F"].indexOf(d.sexo) === -1) c.erro("sexo", "Informe o sexo do paciente.");
  }

  /* Devolve a data lida, ou null depois de registrar o erro. */
  function dataObrigatoria(c, campo, nome) {
    const v = c.d[campo];
    if (B().vazio(v)) return c.erro(campo, "Informe " + nome + "."), null;
    const x = B().lerData(v);
    if (!x) return c.erro(campo, "Esta data não é válida: " + nome + "."), null;
    if (x.t > c.hoje.t) return c.erro(campo, "Esta data não pode ser futura: " + nome + "."), null;
    return x;
  }

  function validarDatas(c) {
    const notif = dataObrigatoria(c, "dataNotificacao", "a data da notificação");
    const inicio = dataObrigatoria(c, "inicioSintomas", "o início dos sintomas");
    if (notif && inicio && inicio.t > notif.t) {
      c.erro("inicioSintomas", "O início dos sintomas não pode ser depois da data da notificação.");
    }
  }

  function validarSintomas(c) {
    const s = B().lista(c.d.sintomas);
    if (s.length === 0) return c.erro("sintomas", "Marque ao menos um sintoma ou “Assintomático”.");
    if (s.indexOf("assintomatico") !== -1 && s.length > 1) {
      c.erro("sintomas", "“Assintomático” não pode vir junto com outros sintomas — desfaça um dos dois.");
    }
    if (s.indexOf("outros") !== -1 && B().vazio(c.d.sintomaOutros)) {
      c.erro("sintomaOutros", "Você marcou “Outros” nos sintomas: escreva qual.");
    }
    return null;
  }

  function validarOpcionais(c) {
    const d = c.d;
    if (!B().vazio(d.cep) && B().soDigitos(d.cep).length !== 8) {
      c.erro("cep", "O CEP tem 8 dígitos (deixe em branco se o paciente não souber).");
    }
    const cond = B().lista(d.condicoes);
    if (d.sexo !== "F" && (cond.indexOf("gestante") !== -1 || cond.indexOf("puerpera") !== -1)) {
      c.erro("condicoes", "Gestante e puérpera só valem para paciente do sexo feminino — confira o sexo ou desmarque.");
    }
  }

  function validar(d, hojeIso) {
    const c = B().novoContexto(d, hojeIso);
    [validarNotificacao, validarIdentificacao, validarPaciente, validarDatas, validarSintomas, validarOpcionais]
      .forEach(function (etapa) { etapa(c); });
    return c.erros;
  }

  raiz.MeedsNotificacaoCovid = {
    SINTOMAS: SINTOMAS, CONDICOES: CONDICOES, RACAS: RACAS, CX: CX,
    cnsValido: cnsValido, extrairCns: extrairCns, validar: validar,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
