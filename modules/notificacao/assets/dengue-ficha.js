/* ------------------------------------------------------------------
 * modules/notificacao/assets/dengue-ficha.js — a ficha, sem tela
 * ------------------------------------------------------------------
 * FICHA DE INVESTIGACAO DENGUE E FEBRE DE CHIKUNGUNYA (SINAN, SVS
 * 14/03/2016). O PDF oficial e achatado (sem campos de formulario), entao
 * cada valor e desenhado na coordenada da celula certa, igual ao laudo de
 * Sete Lagoas (modules/lme-sete-lagoas).
 *
 * Este arquivo e PURO: nao toca DOM, nao conhece o dock nem o pdf-lib (que
 * chega por parametro). E ele que decide:
 *   - o que o medico PRECISA informar (validar);
 *   - o que sai automatico (data da notificacao, tipo, idade, "nao se
 *     aplica" para gestante em homem);
 *   - onde cada valor cai na ficha (montarOperacoes);
 *   - como isso vira desenho (aplicarNoPdf).
 * Assim tudo e testavel em Node (tests/notificacao-dengue*.test.js).
 *
 * COORDENADAS: em pontos (1/72"), origem no canto SUPERIOR ESQUERDO da
 * pagina (591 x 842), medidas a partir do proprio PDF — caixas, bordas de
 * cada celula das datas/codigos e linhas de observacao. "cy" e o centro
 * vertical da celula; o texto e centrado nele (baseline = cy + 0,35*tam).
 *
 * ESCOPO (primeira consulta, sem exames nem encerramento): as secoes de
 * dados laboratoriais (35-49), hospitalizacao (50-55), local provavel de
 * infeccao (56-61), classificacao final, evolucao e encerramento (62-67)
 * ficam EM BRANCO para a vigilancia completar.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  /* ------------------------------------------------------------------
   * Constantes da ficha
   * ------------------------------------------------------------------ */
  const TEXTO_ALERTA =
    "Paciente com sinais de alarme. Oriente o deslocamento imediato a um serviço de pronto atendimento presencial.";

  const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

  const GESTANTE = [
    { v: "1", r: "1º trimestre" },
    { v: "2", r: "2º trimestre" },
    { v: "3", r: "3º trimestre" },
    { v: "4", r: "Idade gestacional ignorada" },
    { v: "5", r: "Não" },
    { v: "9", r: "Ignorado" },
  ];
  const RACAS = [
    { v: "1", r: "Branca" }, { v: "2", r: "Preta" }, { v: "3", r: "Amarela" },
    { v: "4", r: "Parda" }, { v: "5", r: "Indígena" }, { v: "9", r: "Ignorado" },
  ];
  const ESCOLARIDADES = [
    { v: "0", r: "Analfabeto" },
    { v: "1", r: "1ª a 4ª série incompleta do EF" },
    { v: "2", r: "4ª série completa do EF" },
    { v: "3", r: "5ª à 8ª série incompleta do EF" },
    { v: "4", r: "Ensino fundamental completo" },
    { v: "5", r: "Ensino médio incompleto" },
    { v: "6", r: "Ensino médio completo" },
    { v: "7", r: "Educação superior incompleta" },
    { v: "8", r: "Educação superior completa" },
    { v: "9", r: "Ignorado" },
    { v: "10", r: "Não se aplica" },
  ];
  const ZONAS = [
    { v: "1", r: "Urbana" }, { v: "2", r: "Rural" }, { v: "3", r: "Periurbana" }, { v: "9", r: "Ignorado" },
  ];

  /* Caixas de marcar (x0, y0, x1, y1), medidas no PDF. Cada uma recebe o
   * codigo "1" (Sim) — a ficha e 1-Sim / 2-Nao. */
  const SINAIS_CLINICOS = [
    { id: "febre", rotulo: "Febre", caixa: [55.0, 570.3, 67.7, 582.8] },
    { id: "mialgia", rotulo: "Mialgia", caixa: [55.0, 585.2, 67.7, 597.9] },
    { id: "cefaleia", rotulo: "Cefaleia", caixa: [100.8, 569.6, 113.3, 582.1] },
    { id: "exantema", rotulo: "Exantema", caixa: [100.8, 584.5, 113.3, 597.2] },
    { id: "vomito", rotulo: "Vômito", caixa: [158.6, 570.3, 171.1, 583.0] },
    { id: "nauseas", rotulo: "Náuseas", caixa: [158.6, 585.2, 171.1, 597.9] },
    { id: "dorCostas", rotulo: "Dor nas costas", caixa: [215.5, 571.0, 228.0, 583.8] },
    { id: "conjuntivite", rotulo: "Conjuntivite", caixa: [215.5, 585.9, 228.0, 598.6] },
    { id: "artrite", rotulo: "Artrite", caixa: [298.8, 568.9, 311.3, 581.4] },
    { id: "artralgia", rotulo: "Artralgia intensa", caixa: [298.8, 583.8, 311.3, 596.5] },
    { id: "petequias", rotulo: "Petéquias", caixa: [386.4, 567.2, 399.1, 579.9] },
    { id: "leucopenia", rotulo: "Leucopenia", caixa: [386.4, 582.3, 399.1, 595.0] },
    { id: "provaLaco", rotulo: "Prova do laço positiva", caixa: [470.4, 567.2, 483.1, 579.9] },
    { id: "retroorbital", rotulo: "Dor retroorbital", caixa: [470.4, 585.2, 483.1, 597.9] },
  ];

  const DOENCAS = [
    { id: "diabetes", rotulo: "Diabetes", caixa: [54.2, 621.9, 66.7, 634.6] },
    { id: "hematologicas", rotulo: "Doenças hematológicas", caixa: [54.2, 637.8, 67.0, 650.5] },
    { id: "hepatopatias", rotulo: "Hepatopatias", caixa: [189.4, 619.8, 202.6, 633.0] },
    { id: "renal", rotulo: "Doença renal crônica", caixa: [188.6, 635.6, 201.8, 648.8] },
    { id: "hipertensao", rotulo: "Hipertensão arterial", caixa: [311.5, 619.8, 324.0, 632.5] },
    { id: "acidoPeptica", rotulo: "Doença ácido-péptica", caixa: [310.8, 634.6, 323.3, 647.4] },
    { id: "autoimunes", rotulo: "Doenças auto-imunes", caixa: [424.1, 619.0, 436.6, 631.8] },
  ];

  /* Pagina 2, item 68 — dengue com sinais de alarme. */
  const ALARME = [
    { id: "hipotensao", rotulo: "Hipotensão postural e/ou lipotímia", caixa: [55.0, 293.6, 67.7, 306.3] },
    { id: "plaquetas", rotulo: "Queda abrupta de plaquetas", caixa: [55.0, 308.7, 67.7, 321.4] },
    { id: "vomitos", rotulo: "Vômitos persistentes", caixa: [211.4, 264.8, 223.9, 276.8] },
    { id: "dorAbdominal", rotulo: "Dor abdominal intensa e contínua", caixa: [211.0, 280.2, 223.4, 292.6] },
    { id: "letargia", rotulo: "Letargia ou irritabilidade", caixa: [210.2, 296.7, 222.7, 309.4] },
    { id: "sangramento", rotulo: "Sangramento de mucosa/outras hemorragias", caixa: [209.5, 311.6, 222.0, 324.3] },
    { id: "hematocrito", rotulo: "Aumento progressivo do hematócrito", caixa: [343.0, 266.5, 355.4, 278.7] },
    { id: "hepatomegalia", rotulo: "Hepatomegalia >= 2 cm", caixa: [342.7, 284.0, 355.2, 296.2] },
    { id: "liquidos", rotulo: "Acúmulo de líquidos", caixa: [342.5, 299.4, 355.2, 312.1] },
  ];

  /* Pagina 2, item 70 — dengue grave. */
  const GRAVIDADE = [
    { id: "pulsoDebil", grupo: "Extravasamento grave de plasma", rotulo: "Pulso débil ou indetectável", caixa: [56.6, 361.8, 69.1, 374.5] },
    { id: "paConvergente", grupo: "Extravasamento grave de plasma", rotulo: "PA convergente <= 20 mmHg", caixa: [56.4, 379.0, 69.1, 391.8] },
    { id: "enchimentoCapilar", grupo: "Extravasamento grave de plasma", rotulo: "Tempo de enchimento capilar >= 3 s", caixa: [55.7, 395.6, 68.4, 408.3] },
    { id: "liquidosInsuf", grupo: "Extravasamento grave de plasma", rotulo: "Acúmulo de líquidos com insuficiência respiratória", caixa: [55.7, 410.5, 68.2, 423.2] },
    { id: "taquicardia", grupo: "Extravasamento grave de plasma", rotulo: "Taquicardia", caixa: [200.4, 364.2, 212.9, 376.9] },
    { id: "extremidadesFrias", grupo: "Extravasamento grave de plasma", rotulo: "Extremidades frias", caixa: [200.4, 379.0, 212.9, 391.8] },
    { id: "hipotensaoTardia", grupo: "Extravasamento grave de plasma", rotulo: "Hipotensão arterial em fase tardia", caixa: [200.4, 395.6, 212.9, 408.3] },
    { id: "hematemese", grupo: "Sangramento grave", rotulo: "Hematêmese", caixa: [331.4, 346.9, 344.2, 359.6] },
    { id: "melena", grupo: "Sangramento grave", rotulo: "Melena", caixa: [331.4, 364.2, 344.2, 376.9] },
    { id: "metrorragia", grupo: "Sangramento grave", rotulo: "Metrorragia volumosa", caixa: [426.0, 345.7, 438.7, 358.2] },
    { id: "sangramentoSnc", grupo: "Sangramento grave", rotulo: "Sangramento do SNC", caixa: [425.8, 364.2, 438.5, 376.9] },
    { id: "astAlt", grupo: "Comprometimento grave de órgãos", rotulo: "AST/ALT > 1.000", caixa: [330.0, 397.8, 342.5, 410.5] },
    { id: "miocardite", grupo: "Comprometimento grave de órgãos", rotulo: "Miocardite", caixa: [425.0, 396.3, 437.5, 409.0] },
    { id: "consciencia", grupo: "Comprometimento grave de órgãos", rotulo: "Alteração da consciência", caixa: [484.3, 394.9, 496.8, 407.6] },
    { id: "outrosOrgaos", grupo: "Comprometimento grave de órgãos", rotulo: "Outros órgãos", caixa: [329.8, 415.8, 342.2, 428.5] },
  ];

  /* Caixas de codigo unico. */
  const CX = {
    agravo: [346.6, 171.7, 357.4, 182.2],
    idadeUnidade: [106.8, 291.9, 117.4, 302.7],
    sexo: [229.2, 284.7, 240.0, 295.5],
    gestante: [423.8, 284.7, 434.6, 295.5],
    raca: [548.9, 285.4, 559.7, 296.2],
    escolaridade: [549.4, 314.5, 560.2, 325.3],
    zona: [330.7, 478.9, 341.5, 489.7],
  };

  /* Bordas (x) de cada celula dos campos "pente" (uma casa por celula) e
   * o centro vertical da linha. Medidas no PDF. */
  const PENTE = {
    dataNotificacao: { bordas: [446.5, 461.7, 476.9, 490.8, 505.2, 519.6, 534.4, 549.3, 566.1], cy: 188.0 },
    inicioSintomas: { bordas: [442.4, 458.8, 474.4, 487.9, 502.8, 516.7, 531.6, 546.4, 566.6], cy: 244.4 },
    nascimento: { bordas: [440.8, 457.9, 472.8, 486.9, 502.5, 515.7, 530.6, 545.4, 562.2], cy: 275.6 },
    idade: { bordas: [52.5, 73.3, 87.4, 101.5], cy: 306.1 },
    sus: { bordas: [50.7, 61.4, 73.2, 84.9, 96.7, 108.4, 120.2, 131.9, 143.7, 155.4, 167.2, 179.1, 190.8, 202.6, 214.3, 226.1], cy: 366.4 },
    ibgeNotif: { bordas: [477.4, 491.6, 506.4, 521.3, 536.2, 551.1, 566.2], cy: 217.5 },
    cnes: { bordas: [338.6, 352.1, 366.9, 381.8, 396.7, 411.6, 426.4, 441.1], cy: 245.8 },
    ibgeRes: { bordas: [323.5, 336.9, 351.8, 366.7, 381.6, 396.4, 409.2], cy: 396.0 },
    cep: { bordas: [453.2, 467.1, 481.9, 496.8, 511.7, 524.5, 536.8, 551.7, 563.9], cy: 473.2 },
    telefone10: { bordas: [52.2, 65.9, 80.8, 95.7, 110.6, 125.4, 140.3, 155.2, 170.1, 185.1, 200.0], cy: 497.1 },
    dataInvestigacao: { bordas: [54.1, 75.3, 90.0, 103.9, 118.0, 131.9, 146.8, 161.7, 176.1], cy: 543.6 },
    dataAlarme: { bordas: [453.5, 469.9, 484.3, 498.2, 512.2, 526.3, 541.2, 556.1, 567.1], cy: 320.0 },
    dataGravidade: { bordas: [52.1, 68.6, 83.2, 97.9, 111.9, 125.7, 140.6, 155.4, 170.9], cy: 465.7 },
    cnesInvestigador: { bordas: [458.1, 472.1, 486.9, 501.8, 516.7, 531.6, 546.4, 564.8], cy: 755.5 },
  };

  /* Linhas (baseline) das "Observacoes adicionais" — 9 linhas, pagina 2. */
  const LINHAS_OBS = [534.3, 555.8, 578.2, 601.6, 625.6, 649.2, 672.4, 696.0, 725.8];

  /* ------------------------------------------------------------------
   * Texto e datas
   * ------------------------------------------------------------------ */
  function normalizar(s) {
    return String(s == null ? "" : s)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  /* Helvetica do pdf-lib so codifica WinAnsi (ASCII + Latin-1 + alguns
   * sinais do CP1252). Qualquer outro caractere (ex.: "Ł") derrubaria a
   * geracao do PDF inteiro — vira "?" aqui. */
  const RX_FORA_DO_WINANSI = /[^ -~ -ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g;

  function saneaTexto(s, manterCaixa) {
    const limpo = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    return (manterCaixa ? limpo : limpo.toUpperCase()).replace(RX_FORA_DO_WINANSI, "?");
  }

  function soDigitos(s) {
    return String(s == null ? "" : s).replace(/\D/g, "");
  }

  function lerData(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!m) return null;
    const a = +m[1], mes = +m[2], d = +m[3];
    const t = new Date(Date.UTC(a, mes - 1, d));
    if (t.getUTCFullYear() !== a || t.getUTCMonth() !== mes - 1 || t.getUTCDate() !== d) return null;
    return { a: a, m: mes, d: d, t: t.getTime() };
  }

  function diasEntre(isoA, isoB) {
    return Math.round((lerData(isoB).t - lerData(isoA).t) / 86400000);
  }

  function ddmmaaaa(iso) {
    const x = lerData(iso);
    if (!x) return "";
    return String(x.d).padStart(2, "0") + String(x.m).padStart(2, "0") + String(x.a);
  }

  /* Idade na data de hoje: anos; menor de 1 ano em meses; menor de 1 mes
   * em dias. A unidade e o codigo da ficha (4 ano, 3 mes, 2 dia). Quem faz
   * 29/02 completa o ano em 01/03. */
  function idadeDe(nascimentoIso, hojeIso) {
    const n = lerData(nascimentoIso);
    const h = lerData(hojeIso);
    if (!n || !h || n.t > h.t) return null;
    const antesDoAniversario = h.m < n.m || (h.m === n.m && h.d < n.d);
    const anos = h.a - n.a - (antesDoAniversario ? 1 : 0);
    if (anos >= 1) return { valor: anos, unidade: "4" };
    const meses = (h.a - n.a) * 12 + (h.m - n.m) - (h.d < n.d ? 1 : 0);
    if (meses >= 1) return { valor: meses, unidade: "3" };
    return { valor: diasEntre(nascimentoIso, hojeIso), unidade: "2" };
  }

  /* ------------------------------------------------------------------
   * Municipios (lista do IBGE embutida)
   * ------------------------------------------------------------------ */
  function municipiosDe(uf) {
    const base = raiz.MEEDS_MUNICIPIOS_IBGE || {};
    return (base[String(uf || "").toUpperCase()] || []).map(function (m) { return m[1]; });
  }

  function buscarMunicipio(uf, nome) {
    const base = raiz.MEEDS_MUNICIPIOS_IBGE || {};
    const lista = base[String(uf || "").toUpperCase()] || [];
    const alvo = normalizar(nome);
    if (!alvo) return null;
    for (let i = 0; i < lista.length; i++) {
      if (normalizar(lista[i][1]) === alvo) return { codigo: lista[i][0], nome: lista[i][1] };
    }
    return null;
  }

  /* ------------------------------------------------------------------
   * Validacao
   * ------------------------------------------------------------------ */
  function lista(x) {
    return Array.isArray(x) ? x : [];
  }

  function temSinalDeAlarme(d) {
    return lista(d.alarme).length > 0 || lista(d.gravidade).length > 0;
  }

  /* Devolve [{ campo, mensagem }] — vazio quando a ficha pode ser gerada.
   * "campo" e a chave de dados (o formulario aponta o elemento por ela). */
  function validar(d, hojeIso) {
    const e = [];
    const erro = function (campo, mensagem) { e.push({ campo: campo, mensagem: mensagem }); };
    const hoje = lerData(hojeIso);
    const nasc = lerData(d.nascimento);

    if (d.agravo !== "dengue" && d.agravo !== "chikungunya") {
      erro("agravo", "Escolha a doença suspeita: Dengue ou Chikungunya.");
    }

    const ini = lerData(d.inicioSintomas);
    if (!String(d.inicioSintomas || "").trim()) {
      erro("inicioSintomas", "Informe a data de início dos sintomas.");
    } else if (!ini) {
      erro("inicioSintomas", "A data de início dos sintomas não é uma data válida.");
    } else if (ini.t > hoje.t) {
      erro("inicioSintomas", "A data de início dos sintomas não pode ser futura.");
    } else if (diasEntre(d.inicioSintomas, hojeIso) > 15) {
      erro("inicioSintomas", "Início dos sintomas há mais de 15 dias: fora da fase aguda. Confira a data; se estiver certa, esse caso não segue esta ficha de primeira consulta.");
    } else if (nasc && ini.t < nasc.t) {
      erro("inicioSintomas", "O início dos sintomas é anterior ao nascimento do paciente — confira as duas datas.");
    }

    if (lista(d.sinais).length === 0) {
      erro("sinais", "Marque pelo menos um sinal clínico.");
    }

    const marcouAlarme = temSinalDeAlarme(d);
    if (!marcouAlarme && !d.semAlarme) {
      erro("alarme", "Confirme os sinais de alarme: marque os que existirem ou escolha “Sem sinais de alarme”.");
    } else if (marcouAlarme && d.semAlarme) {
      erro("alarme", "Você marcou “Sem sinais de alarme” e também marcou sinais — desfaça um dos dois.");
    }

    if (!saneaTexto(d.nome)) erro("nome", "Informe o nome completo do paciente.");

    if (!String(d.nascimento || "").trim()) {
      erro("nascimento", "Informe a data de nascimento.");
    } else if (!nasc) {
      erro("nascimento", "A data de nascimento não é uma data válida.");
    } else if (nasc.t > hoje.t) {
      erro("nascimento", "A data de nascimento não pode ser futura.");
    } else if (hoje.a - nasc.a > 130) {
      erro("nascimento", "A data de nascimento indica mais de 130 anos — confira o ano.");
    }

    if (["M", "F", "I"].indexOf(d.sexo) === -1) {
      erro("sexo", "Informe o sexo do paciente.");
    } else if (d.sexo === "F" && ["1", "2", "3", "4", "5", "9"].indexOf(String(d.gestante || "")) === -1) {
      erro("gestante", "Paciente do sexo feminino: informe se está gestante (trimestre) ou “Não”.");
    }

    if (UFS.indexOf(String(d.ufRes || "").toUpperCase()) === -1) {
      erro("ufRes", "Informe a UF de residência.");
    } else if (!saneaTexto(d.municipioRes)) {
      erro("municipioRes", "Informe o município de residência.");
    } else if (!buscarMunicipio(d.ufRes, d.municipioRes)) {
      erro("municipioRes", "O município de residência não consta na UF " + String(d.ufRes).toUpperCase() + ". Escolha um da lista.");
    }

    const tel = soDigitos(d.telefone);
    if (!tel) {
      erro("telefone", "Informe um telefone de contato com DDD — é por ele que a vigilância acompanha o paciente.");
    } else if ((tel.length !== 10 && tel.length !== 11) || tel.charAt(0) === "0") {
      erro("telefone", "O telefone precisa ter DDD + número (10 ou 11 dígitos).");
    }

    if (String(d.sus || "").trim() && soDigitos(d.sus).length !== 15) {
      erro("sus", "O Cartão SUS tem 15 dígitos (deixe em branco se o paciente não souber).");
    }
    if (String(d.cep || "").trim() && soDigitos(d.cep).length !== 8) {
      erro("cep", "O CEP tem 8 dígitos (deixe em branco se o paciente não souber).");
    }
    if (String(d.cnes || "").trim() && soDigitos(d.cnes).length !== 7) {
      erro("cnes", "O CNES tem 7 dígitos (deixe em branco se não souber).");
    }

    return e;
  }

  /* ------------------------------------------------------------------
   * Operacoes de desenho
   * ------------------------------------------------------------------
   *   centro: { pg, tipo:"centro", cx, cy, texto, tam, negrito }
   *   texto:  { pg, tipo:"texto", x, y, texto, tam, negrito, larg }
   *   bloco:  { pg, tipo:"bloco", x, linhas:[baselines], larg, texto, tam }
   * pg: 0 = pagina 1, 1 = pagina 2. */
  function montarOperacoes(d, hojeIso) {
    const ops = [];
    const centro = function (pg, cx, cy, texto, tam, negrito) {
      ops.push({ pg: pg, tipo: "centro", cx: cx, cy: cy, texto: String(texto), tam: tam || 9, negrito: !!negrito });
    };
    const texto = function (pg, x, y, valor, tam, larg, negrito) {
      const t = saneaTexto(valor);
      if (t) ops.push({ pg: pg, tipo: "texto", x: x, y: y, texto: t, tam: tam || 9, larg: larg, negrito: !!negrito });
    };
    const caixa = function (pg, c, valor, tam) {
      centro(pg, (c[0] + c[2]) / 2, (c[1] + c[3]) / 2, valor, tam || 10, true);
    };
    /* Um digito por celula, da esquerda para a direita (ou da direita, p/ numero). */
    const pente = function (pg, def, digitos, tam, daDireita) {
      const celulas = def.bordas.length - 1;
      const dig = String(digitos).slice(0, celulas);
      const inicio = daDireita ? celulas - dig.length : 0;
      for (let i = 0; i < dig.length; i++) {
        const cx = (def.bordas[inicio + i] + def.bordas[inicio + i + 1]) / 2;
        centro(pg, cx, def.cy, dig.charAt(i), tam || 9, false);
      }
    };

    const hoje = String(hojeIso || "");

    // ---- Dados gerais ----
    caixa(0, CX.agravo, d.agravo === "chikungunya" ? "2" : d.agravo === "dengue" ? "1" : "");
    pente(0, PENTE.dataNotificacao, ddmmaaaa(hoje));

    const ufNotif = String(d.ufNotif || "").toUpperCase();
    if (UFS.indexOf(ufNotif) !== -1) centro(0, 67.5, 216.0, ufNotif, 9, true);
    texto(0, 87, 217.5, d.municipioNotif, 9, 340);
    const munNotif = buscarMunicipio(ufNotif, d.municipioNotif);
    if (munNotif) pente(0, PENTE.ibgeNotif, munNotif.codigo);
    texto(0, 58, 246.5, d.unidade, 9, 272);
    if (soDigitos(d.cnes).length === 7) pente(0, PENTE.cnes, soDigitos(d.cnes));
    pente(0, PENTE.inicioSintomas, ddmmaaaa(d.inicioSintomas));

    // ---- Notificacao individual ----
    texto(0, 56, 277.0, d.nome, 10, 372, true);
    pente(0, PENTE.nascimento, ddmmaaaa(d.nascimento));
    const idade = idadeDe(d.nascimento, hoje);
    if (idade) {
      pente(0, PENTE.idade, String(idade.valor), 9, true);
      caixa(0, CX.idadeUnidade, idade.unidade, 9);
    }
    if (["M", "F", "I"].indexOf(d.sexo) !== -1) caixa(0, CX.sexo, d.sexo);
    if (d.sexo === "M") caixa(0, CX.gestante, "6");
    else if (d.sexo === "I") caixa(0, CX.gestante, "9");
    else if (d.sexo === "F" && d.gestante) caixa(0, CX.gestante, d.gestante);
    if (d.raca) caixa(0, CX.raca, d.raca);
    if (d.escolaridade) caixa(0, CX.escolaridade, d.escolaridade, d.escolaridade === "10" ? 7 : 10);
    if (soDigitos(d.sus).length === 15) pente(0, PENTE.sus, soDigitos(d.sus));
    texto(0, 232, 368.0, d.mae, 9, 318);

    // ---- Residencia ----
    const ufRes = String(d.ufRes || "").toUpperCase();
    if (UFS.indexOf(ufRes) !== -1) centro(0, 66.0, 396.0, ufRes, 9, true);
    const munRes = buscarMunicipio(ufRes, d.municipioRes);
    texto(0, 85, 397.5, munRes ? munRes.nome : d.municipioRes, 9, 232);
    if (munRes) pente(0, PENTE.ibgeRes, munRes.codigo);
    texto(0, 55, 421.5, d.bairro, 9, 128);
    texto(0, 196, 421.5, d.logradouro, 9, 270);
    texto(0, 55, 446.5, d.numero, 9, 50);
    texto(0, 112, 446.5, d.complemento, 9, 290);
    texto(0, 216, 470.5, d.referencia, 9, 230);
    if (soDigitos(d.cep).length === 8) pente(0, PENTE.cep, soDigitos(d.cep));
    const tel = soDigitos(d.telefone);
    if (tel.length === 10 || tel.length === 11) {
      const def = PENTE.telefone10;
      if (tel.length === 10) {
        pente(0, def, tel);
      } else {
        /* 11 digitos (celular com 9): mesma faixa, 11 posicoes iguais. */
        const x0 = def.bordas[0];
        const x1 = def.bordas[def.bordas.length - 1];
        const passo = (x1 - x0) / 11;
        const bordas = [];
        for (let i = 0; i <= 11; i++) bordas.push(x0 + passo * i);
        pente(0, { bordas: bordas, cy: def.cy }, tel);
      }
    }
    if (d.zona) caixa(0, CX.zona, d.zona);

    // ---- Investigacao ----
    pente(0, PENTE.dataInvestigacao, ddmmaaaa(hoje));
    texto(0, 184, 548.0, d.ocupacao, 9, 360);

    // ---- Dados clinicos: so as marcadas recebem "1" ----
    lista(d.sinais).forEach(function (id) {
      const s = SINAIS_CLINICOS.filter(function (x) { return x.id === id; })[0];
      if (s) caixa(0, s.caixa, "1");
    });
    lista(d.doencas).forEach(function (id) {
      const s = DOENCAS.filter(function (x) { return x.id === id; })[0];
      if (s) caixa(0, s.caixa, "1");
    });

    // ---- Pagina 2: sinais de alarme (68) e gravidade (70) ----
    const alarmes = lista(d.alarme);
    const graves = lista(d.gravidade);
    if (alarmes.length > 0 || d.semAlarme) {
      /* O medico atestou o quadro (1 nas marcadas, 2 nas demais). */
      ALARME.forEach(function (a) { caixa(1, a.caixa, alarmes.indexOf(a.id) !== -1 ? "1" : "2"); });
    }
    GRAVIDADE.forEach(function (g) {
      if (graves.indexOf(g.id) !== -1) caixa(1, g.caixa, "1");
    });
    if (alarmes.length > 0 && lerData(d.dataAlarme)) pente(1, PENTE.dataAlarme, ddmmaaaa(d.dataAlarme));
    if (graves.length > 0 && lerData(d.dataGravidade)) pente(1, PENTE.dataGravidade, ddmmaaaa(d.dataGravidade));
    if (graves.indexOf("outrosOrgaos") !== -1) texto(1, 454, 424.0, d.outrosOrgaos, 8, 100);

    // ---- Pagina 2: observacoes e investigador ----
    const obs = saneaTexto(d.observacoes, true);
    if (obs) ops.push({ pg: 1, tipo: "bloco", x: 66, linhas: LINHAS_OBS, larg: 490, texto: obs, tam: 9 });
    /* O bloco "Investigador" so e preenchido quando ha um medico escolhido
     * (sem ele, ficaria uma unidade sem ninguem responsavel). */
    if (saneaTexto(d.medicoNome)) {
      texto(1, 56, 757.0, [d.municipioNotif, d.unidade].filter(Boolean).join(" / "), 9, 390);
      if (soDigitos(d.cnes).length === 7) pente(1, PENTE.cnesInvestigador, soDigitos(d.cnes));
      texto(1, 56, 787.0, d.medicoNome, 9, 190);
      texto(1, 253, 787.0, d.medicoFuncao, 9, 270);
    }

    return ops;
  }

  /* ------------------------------------------------------------------
   * Aplicacao no PDF (pdf-lib chega por parametro)
   * ------------------------------------------------------------------ */
  async function aplicarNoPdf(PDFLib, pdfDoc, operacoes) {
    const fonteR = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const fonteB = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const preto = PDFLib.rgb(0, 0, 0);
    const paginas = pdfDoc.getPages();
    const resultado = { desenhadas: 0, ignoradas: 0 };

    function ajustar(fonte, texto, tam, larg) {
      let t = texto;
      let s = tam;
      if (!larg) return { texto: t, tam: s };
      while (s > 6 && fonte.widthOfTextAtSize(t, s) > larg) s -= 0.5;
      while (t.length > 1 && fonte.widthOfTextAtSize(t, s) > larg) t = t.slice(0, -1);
      return { texto: t, tam: s };
    }

    function desenhar(pagina, fonte, texto, x, baselineTopo, tam) {
      pagina.drawText(texto, { x: x, y: pagina.getHeight() - baselineTopo, size: tam, font: fonte, color: preto });
      resultado.desenhadas++;
    }

    operacoes.forEach(function (op) {
      try {
        const pagina = paginas[op.pg];
        const fonte = op.negrito ? fonteB : fonteR;
        if (op.tipo === "centro") {
          const larguraMax = op.larg || 0;
          const a = ajustar(fonte, op.texto, op.tam, larguraMax);
          const w = fonte.widthOfTextAtSize(a.texto, a.tam);
          desenhar(pagina, fonte, a.texto, op.cx - w / 2, op.cy + 0.35 * a.tam, a.tam);
        } else if (op.tipo === "texto") {
          const a = ajustar(fonte, op.texto, op.tam, op.larg);
          desenhar(pagina, fonte, a.texto, op.x, op.y, a.tam);
        } else if (op.tipo === "bloco") {
          const palavras = op.texto.split(" ");
          const linhas = [];
          let atual = "";
          palavras.forEach(function (p) {
            const tentativa = atual ? atual + " " + p : p;
            if (fonte.widthOfTextAtSize(tentativa, op.tam) > op.larg && atual) {
              linhas.push(atual);
              atual = p;
            } else {
              atual = tentativa;
            }
          });
          if (atual) linhas.push(atual);
          const cabem = op.linhas.length;
          linhas.slice(0, cabem).forEach(function (linha, i) {
            let t = linha;
            if (i === cabem - 1 && linhas.length > cabem) {
              t = linha.length > 3 ? linha.slice(0, -3) + "..." : linha + "...";
            }
            const a = ajustar(fonte, t, op.tam, op.larg);
            desenhar(pagina, fonte, a.texto, op.x, op.linhas[i], a.tam);
          });
        }
      } catch (e) {
        resultado.ignoradas++;
      }
    });
    return resultado;
  }

  raiz.MeedsNotificacaoDengue = {
    TEXTO_ALERTA: TEXTO_ALERTA,
    UFS: UFS,
    GESTANTE: GESTANTE,
    RACAS: RACAS,
    ESCOLARIDADES: ESCOLARIDADES,
    ZONAS: ZONAS,
    SINAIS_CLINICOS: SINAIS_CLINICOS,
    DOENCAS: DOENCAS,
    ALARME: ALARME,
    GRAVIDADE: GRAVIDADE,
    normalizar: normalizar,
    saneaTexto: saneaTexto,
    idadeDe: idadeDe,
    municipiosDe: municipiosDe,
    buscarMunicipio: buscarMunicipio,
    temSinalDeAlarme: temSinalDeAlarme,
    validar: validar,
    montarOperacoes: montarOperacoes,
    aplicarNoPdf: aplicarNoPdf,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
