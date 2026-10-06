/* ------------------------------------------------------------------
 * modules/notificacao/dengue-ficha.js — a ficha, sem tela
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
  const RX_FORA_DO_WINANSI = /[^\u0020-\u007E\u00A0-\u00FF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]/g;

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
   * "Vinculos" da tela -> municipio, UF e unidade
   * ------------------------------------------------------------------
   * O cartao do paciente mostra a cidade numa linha e a unidade na de
   * baixo, em dois formatos: "MACAE - RJ" (novo) e "PREFEITURA MUNICIPAL
   * DE MACAE" (antigo, sem UF). Cliente renomeado as vezes vem so como
   * "BARBACENA". A UF que falta so e deduzida quando o nome existe em UMA
   * unica UF — "Bom Jesus" existe em varias, e ai fica em branco para o
   * medico escolher (notificacao na cidade errada e pior que nenhuma). */
  const RX_CIDADE_UF = /^(.+?)\s+-\s+([A-Za-z]{2})$/;
  const RX_PREFEITURA = /^prefeitura\s+(?:municipal\s+)?(?:de|do|da)\s+(?:munic[ií]pio\s+(?:de|do|da)\s+)?(.+)$/i;

  function ufsDoNome(nome) {
    const base = raiz.MEEDS_MUNICIPIOS_IBGE || {};
    const alvo = normalizar(nome);
    return Object.keys(base).filter(function (uf) {
      return base[uf].some(function (m) { return normalizar(m[1]) === alvo; });
    });
  }

  function cidadeDaLinha(linha, primeira) {
    const cu = RX_CIDADE_UF.exec(linha);
    if (cu && UFS.indexOf(cu[2].toUpperCase()) !== -1) return { municipio: cu[1].trim(), uf: cu[2].toUpperCase() };
    const pf = RX_PREFEITURA.exec(linha);
    if (pf) return { municipio: pf[1].trim(), uf: "" };
    if (primeira && ufsDoNome(linha).length > 0) return { municipio: linha, uf: "" };
    return null;
  }

  function interpretarVinculo(linhas) {
    const out = { municipio: "", uf: "", unidade: "" };
    const limpas = (Array.isArray(linhas) ? linhas : []).map(function (l) { return String(l || "").trim(); }).filter(Boolean);
    limpas.forEach(function (linha, i) {
      const cidade = !out.municipio ? cidadeDaLinha(linha, i === 0) : null;
      if (cidade) {
        out.municipio = cidade.municipio;
        out.uf = cidade.uf;
      } else if (!out.unidade) {
        out.unidade = linha;
      }
    });
    if (out.municipio && !out.uf) {
      const ufs = ufsDoNome(out.municipio);
      if (ufs.length === 1) out.uf = ufs[0];
    }
    const oficial = out.uf ? buscarMunicipio(out.uf, out.municipio) : null;
    if (oficial) out.municipio = oficial.nome;
    return out;
  }

  /* "Documentos" do cartao novo: "CPF 0549..." e "CNS 7000..." em linhas
   * separadas. O CPF o leitor padrao ja entrega; aqui sai o CNS (15
   * digitos), que e o numero do Cartao SUS da ficha. */
  function interpretarDocumentos(linhas) {
    const out = { sus: "" };
    (Array.isArray(linhas) ? linhas : []).forEach(function (linha) {
      const t = String(linha || "");
      if (!/cns|sus/i.test(t)) return;
      const digitos = t.replace(/\D/g, "");
      if (digitos.length === 15) out.sus = digitos;
    });
    return out;
  }

  /* "Parentesco" traz nomes de familiares, as vezes sem dizer quem e quem.
   * So devolve a mae quando ha certeza: linha rotulada "Mae" ou uma unica
   * linha. Com varias linhas sem rotulo, prefere deixar em branco a
   * gravar o nome errado numa ficha oficial. */
  function interpretarParentesco(linhas) {
    const limpas = (Array.isArray(linhas) ? linhas : []).map(function (l) { return String(l || "").trim(); }).filter(Boolean);
    for (let i = 0; i < limpas.length; i++) {
      const m = limpas[i].match(/^m[aã]e\s*[:-]\s*(.+)$/i);
      if (m) return m[1].trim();
    }
    if (limpas.length === 1 && !/^(pai|respons)/i.test(limpas[0])) return limpas[0];
    return "";
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

  function vazio(valor) {
    return !String(valor == null ? "" : valor).trim();
  }

  function validarAgravo(c) {
    if (c.d.agravo !== "dengue" && c.d.agravo !== "chikungunya") {
      c.erro("agravo", "Escolha a doença suspeita: Dengue ou Chikungunya.");
    }
  }

  function validarSintomas(c) {
    const d = c.d;
    const ini = lerData(d.inicioSintomas);
    if (vazio(d.inicioSintomas)) return c.erro("inicioSintomas", "Informe a data de início dos sintomas.");
    if (!ini) return c.erro("inicioSintomas", "A data de início dos sintomas não é uma data válida.");
    if (ini.t > c.hoje.t) return c.erro("inicioSintomas", "A data de início dos sintomas não pode ser futura.");
    if (diasEntre(d.inicioSintomas, c.hojeIso) > 15) {
      return c.erro("inicioSintomas", "Início dos sintomas há mais de 15 dias: fora da fase aguda. Confira a data; se estiver certa, esse caso não segue esta ficha de primeira consulta.");
    }
    if (c.nasc && ini.t < c.nasc.t) {
      return c.erro("inicioSintomas", "O início dos sintomas é anterior ao nascimento do paciente — confira as duas datas.");
    }
    return null;
  }

  function validarSinais(c) {
    if (lista(c.d.sinais).length === 0) c.erro("sinais", "Marque pelo menos um sinal clínico.");
    const marcou = temSinalDeAlarme(c.d);
    if (!marcou && !c.d.semAlarme) {
      c.erro("alarme", "Confirme os sinais de alarme: marque os que existirem ou escolha “Sem sinais de alarme”.");
    } else if (marcou && c.d.semAlarme) {
      c.erro("alarme", "Você marcou “Sem sinais de alarme” e também marcou sinais — desfaça um dos dois.");
    }
  }

  function validarNascimento(c) {
    const d = c.d;
    if (vazio(d.nascimento)) return c.erro("nascimento", "Informe a data de nascimento.");
    if (!c.nasc) return c.erro("nascimento", "A data de nascimento não é uma data válida.");
    if (c.nasc.t > c.hoje.t) return c.erro("nascimento", "A data de nascimento não pode ser futura.");
    if (c.hoje.a - c.nasc.a > 130) return c.erro("nascimento", "A data de nascimento indica mais de 130 anos — confira o ano.");
    return null;
  }

  function validarPaciente(c) {
    const d = c.d;
    if (!saneaTexto(d.nome)) c.erro("nome", "Informe o nome completo do paciente.");
    validarNascimento(c);
    if (["M", "F", "I"].indexOf(d.sexo) === -1) {
      c.erro("sexo", "Informe o sexo do paciente.");
    } else if (d.sexo === "F" && ["1", "2", "3", "4", "5", "9"].indexOf(String(d.gestante || "")) === -1) {
      c.erro("gestante", "Paciente do sexo feminino: informe se está gestante (trimestre) ou “Não”.");
    }
  }

  function validarResidencia(c) {
    const d = c.d;
    const uf = String(d.ufRes || "").toUpperCase();
    if (UFS.indexOf(uf) === -1) return c.erro("ufRes", "Informe a UF de residência.");
    if (!saneaTexto(d.municipioRes)) return c.erro("municipioRes", "Informe o município de residência.");
    if (!buscarMunicipio(uf, d.municipioRes)) {
      return c.erro("municipioRes", "O município de residência não consta na UF " + uf + ". Escolha um da lista.");
    }
    return null;
  }

  function validarTelefone(c) {
    const tel = soDigitos(c.d.telefone);
    if (!tel) {
      c.erro("telefone", "Informe um telefone de contato com DDD — é por ele que a vigilância acompanha o paciente.");
    } else if ((tel.length !== 10 && tel.length !== 11) || tel.charAt(0) === "0") {
      c.erro("telefone", "O telefone precisa ter DDD + número (10 ou 11 dígitos).");
    }
  }

  /* Opcionais: so validam o formato quando o medico preencheu. */
  const OPCIONAIS = [
    { campo: "sus", digitos: 15, mensagem: "O Cartão SUS tem 15 dígitos (deixe em branco se o paciente não souber)." },
    { campo: "cep", digitos: 8, mensagem: "O CEP tem 8 dígitos (deixe em branco se o paciente não souber)." },
    { campo: "cnes", digitos: 7, mensagem: "O CNES tem 7 dígitos (deixe em branco se não souber)." },
  ];

  function validarOpcionais(c) {
    OPCIONAIS.forEach(function (o) {
      if (!vazio(c.d[o.campo]) && soDigitos(c.d[o.campo]).length !== o.digitos) c.erro(o.campo, o.mensagem);
    });
  }

  /* Contexto de validacao: o mesmo para qualquer ficha (a de Leishmaniose
   * reaproveita as etapas de paciente, residencia e telefone). */
  function novoContexto(d, hojeIso) {
    const erros = [];
    return {
      erros: erros,
      d: d,
      hojeIso: hojeIso,
      hoje: lerData(hojeIso),
      nasc: lerData(d.nascimento),
      erro: function (campo, mensagem) { erros.push({ campo: campo, mensagem: mensagem }); },
    };
  }

  /* Devolve [{ campo, mensagem }] — vazio quando a ficha pode ser gerada.
   * "campo" e a chave de dados (o formulario aponta o elemento por ela). */
  function validar(d, hojeIso) {
    const c = novoContexto(d, hojeIso);
    [validarAgravo, validarSintomas, validarSinais, validarPaciente, validarResidencia, validarTelefone, validarOpcionais]
      .forEach(function (etapa) { etapa(c); });
    return c.erros;
  }

  /* ------------------------------------------------------------------
   * Operacoes de desenho
   * ------------------------------------------------------------------
   *   centro: { pg, tipo:"centro", cx, cy, texto, tam, negrito }
   *   texto:  { pg, tipo:"texto", x, y, texto, tam, negrito, larg }
   *   bloco:  { pg, tipo:"bloco", x, linhas:[baselines], larg, texto, tam }
   * pg: 0 = pagina 1, 1 = pagina 2. */
  function criarDesenho() {
    const ops = [];
    const api = {
      ops: ops,
      centro: function (o) {
        ops.push({ pg: o.pg, tipo: "centro", cx: o.cx, cy: o.cy, texto: String(o.texto), tam: o.tam || 9, negrito: !!o.negrito });
      },
      /* Texto livre, da esquerda, na linha de base y; "larg" encolhe a fonte. */
      texto: function (o) {
        const t = saneaTexto(o.valor);
        if (t) ops.push({ pg: o.pg, tipo: "texto", x: o.x, y: o.y, texto: t, tam: o.tam || 9, larg: o.larg, negrito: !!o.negrito });
      },
      caixa: function (pg, c, valor, tam) {
        api.centro({ pg: pg, cx: (c[0] + c[2]) / 2, cy: (c[1] + c[3]) / 2, texto: valor, tam: tam || 10, negrito: true });
      },
      /* Um digito por celula, da esquerda (ou da direita, p/ numero). */
      pente: function (pg, def, digitos, opcoes) {
        const celulas = def.bordas.length - 1;
        const dig = String(digitos).slice(0, celulas);
        const inicio = opcoes && opcoes.daDireita ? celulas - dig.length : 0;
        for (let i = 0; i < dig.length; i++) {
          const cx = (def.bordas[inicio + i] + def.bordas[inicio + i + 1]) / 2;
          api.centro({ pg: pg, cx: cx, cy: def.cy, texto: dig.charAt(i), tam: 9 });
        }
      },
    };
    return api;
  }

  function secaoDadosGerais(b, d, hoje) {
    b.caixa(0, CX.agravo, d.agravo === "chikungunya" ? "2" : d.agravo === "dengue" ? "1" : "");
    b.pente(0, PENTE.dataNotificacao, ddmmaaaa(hoje));
    const ufNotif = String(d.ufNotif || "").toUpperCase();
    if (UFS.indexOf(ufNotif) !== -1) b.centro({ pg: 0, cx: 67.5, cy: 216.0, texto: ufNotif, tam: 9, negrito: true });
    b.texto({ pg: 0, x: 87, y: 217.5, valor: d.municipioNotif, larg: 340 });
    const munNotif = buscarMunicipio(ufNotif, d.municipioNotif);
    if (munNotif) b.pente(0, PENTE.ibgeNotif, munNotif.codigo);
    b.texto({ pg: 0, x: 58, y: 246.5, valor: d.unidade, larg: 272 });
    if (soDigitos(d.cnes).length === 7) b.pente(0, PENTE.cnes, soDigitos(d.cnes));
    b.pente(0, PENTE.inicioSintomas, ddmmaaaa(d.inicioSintomas));
  }

  function secaoGestante(b, d) {
    if (d.sexo === "M") b.caixa(0, CX.gestante, "6");
    else if (d.sexo === "I") b.caixa(0, CX.gestante, "9");
    else if (d.sexo === "F" && d.gestante) b.caixa(0, CX.gestante, d.gestante);
  }

  function secaoPaciente(b, d, hoje) {
    b.texto({ pg: 0, x: 56, y: 277.0, valor: d.nome, tam: 10, larg: 372, negrito: true });
    b.pente(0, PENTE.nascimento, ddmmaaaa(d.nascimento));
    const idade = idadeDe(d.nascimento, hoje);
    if (idade) {
      b.pente(0, PENTE.idade, String(idade.valor), { daDireita: true });
      b.caixa(0, CX.idadeUnidade, idade.unidade, 9);
    }
    if (["M", "F", "I"].indexOf(d.sexo) !== -1) b.caixa(0, CX.sexo, d.sexo);
    secaoGestante(b, d);
    if (d.raca) b.caixa(0, CX.raca, d.raca);
    if (d.escolaridade) b.caixa(0, CX.escolaridade, d.escolaridade, d.escolaridade === "10" ? 7 : 10);
    if (soDigitos(d.sus).length === 15) b.pente(0, PENTE.sus, soDigitos(d.sus));
    b.texto({ pg: 0, x: 232, y: 368.0, valor: d.mae, larg: 318 });
  }

  /* 11 digitos (celular com 9): mesma faixa do campo, 11 posicoes iguais. */
  function pente11(def) {
    const x0 = def.bordas[0];
    const passo = (def.bordas[def.bordas.length - 1] - x0) / 11;
    const bordas = [];
    for (let i = 0; i <= 11; i++) bordas.push(x0 + passo * i);
    return { bordas: bordas, cy: def.cy };
  }

  function secaoEndereco(b, d) {
    b.texto({ pg: 0, x: 55, y: 421.5, valor: d.bairro, larg: 128 });
    b.texto({ pg: 0, x: 196, y: 421.5, valor: d.logradouro, larg: 270 });
    b.texto({ pg: 0, x: 55, y: 446.5, valor: d.numero, larg: 50 });
    b.texto({ pg: 0, x: 112, y: 446.5, valor: d.complemento, larg: 290 });
    b.texto({ pg: 0, x: 216, y: 470.5, valor: d.referencia, larg: 230 });
    if (soDigitos(d.cep).length === 8) b.pente(0, PENTE.cep, soDigitos(d.cep));
    const tel = soDigitos(d.telefone);
    if (tel.length === 10) b.pente(0, PENTE.telefone10, tel);
    else if (tel.length === 11) b.pente(0, pente11(PENTE.telefone10), tel);
    if (d.zona) b.caixa(0, CX.zona, d.zona);
  }

  function secaoResidencia(b, d) {
    const ufRes = String(d.ufRes || "").toUpperCase();
    if (UFS.indexOf(ufRes) !== -1) b.centro({ pg: 0, cx: 66.0, cy: 396.0, texto: ufRes, tam: 9, negrito: true });
    const munRes = buscarMunicipio(ufRes, d.municipioRes);
    b.texto({ pg: 0, x: 85, y: 397.5, valor: munRes ? munRes.nome : d.municipioRes, larg: 232 });
    if (munRes) b.pente(0, PENTE.ibgeRes, munRes.codigo);
    secaoEndereco(b, d);
  }

  function marcarEscolhidos(b, catalogo, ids) {
    lista(ids).forEach(function (id) {
      const item = catalogo.filter(function (x) { return x.id === id; })[0];
      if (item) b.caixa(0, item.caixa, "1");
    });
  }

  function secaoClinica(b, d, hoje) {
    b.pente(0, PENTE.dataInvestigacao, ddmmaaaa(hoje));
    b.texto({ pg: 0, x: 184, y: 544.5, valor: d.ocupacao, larg: 360 });
    /* So as marcadas recebem "1"; as demais ficam em branco (nao afirma o
     * que ninguem perguntou). */
    marcarEscolhidos(b, SINAIS_CLINICOS, d.sinais);
    marcarEscolhidos(b, DOENCAS, d.doencas);
  }

  function secaoAlarme(b, d) {
    const alarmes = lista(d.alarme);
    const graves = lista(d.gravidade);
    /* O medico atestou o quadro: 1 nas marcadas, 2 nas demais (item 68). */
    if (alarmes.length > 0 || d.semAlarme) {
      ALARME.forEach(function (a) { b.caixa(1, a.caixa, alarmes.indexOf(a.id) !== -1 ? "1" : "2"); });
    }
    GRAVIDADE.forEach(function (g) {
      if (graves.indexOf(g.id) !== -1) b.caixa(1, g.caixa, "1");
    });
    if (alarmes.length > 0 && lerData(d.dataAlarme)) b.pente(1, PENTE.dataAlarme, ddmmaaaa(d.dataAlarme));
    if (graves.length > 0 && lerData(d.dataGravidade)) b.pente(1, PENTE.dataGravidade, ddmmaaaa(d.dataGravidade));
    if (graves.indexOf("outrosOrgaos") !== -1) b.texto({ pg: 1, x: 460, y: 424.0, valor: d.outrosOrgaos, tam: 8, larg: 96 });
  }

  function secaoObservacoesEInvestigador(b, d) {
    const obs = saneaTexto(d.observacoes, true);
    if (obs) b.ops.push({ pg: 1, tipo: "bloco", x: 36, linhas: LINHAS_OBS, larg: 524, texto: obs, tam: 9 });
    /* O bloco "Investigador" so e preenchido quando ha um medico escolhido
     * (sem ele, ficaria uma unidade sem ninguem responsavel). */
    if (!saneaTexto(d.medicoNome)) return;
    b.texto({ pg: 1, x: 56, y: 757.0, valor: [d.municipioNotif, d.unidade].filter(Boolean).join(" / "), larg: 390 });
    if (soDigitos(d.cnes).length === 7) b.pente(1, PENTE.cnesInvestigador, soDigitos(d.cnes));
    b.texto({ pg: 1, x: 56, y: 787.0, valor: d.medicoNome, larg: 182 });
    b.texto({ pg: 1, x: 253, y: 787.0, valor: d.medicoFuncao, larg: 270 });
  }

  function montarOperacoes(d, hojeIso) {
    const b = criarDesenho();
    const hoje = String(hojeIso || "");
    secaoDadosGerais(b, d, hoje);
    secaoPaciente(b, d, hoje);
    secaoResidencia(b, d);
    secaoClinica(b, d, hoje);
    secaoAlarme(b, d);
    secaoObservacoesEInvestigador(b, d);
    return b.ops;
  }

  /* ------------------------------------------------------------------
   * Aplicacao no PDF (pdf-lib chega por parametro)
   * ------------------------------------------------------------------ */
  /* Reduz a fonte (ate 6) e, se ainda nao couber, corta o texto: nunca
   * invade a celula vizinha. */
  function ajustar(fonte, texto, tam, larg) {
    let t = texto;
    let s = tam;
    if (!larg) return { texto: t, tam: s };
    while (s > 6 && fonte.widthOfTextAtSize(t, s) > larg) s -= 0.5;
    while (t.length > 1 && fonte.widthOfTextAtSize(t, s) > larg) t = t.slice(0, -1);
    return { texto: t, tam: s };
  }

  function quebrarEmLinhas(fonte, texto, tam, larg) {
    const linhas = [];
    let atual = "";
    texto.split(" ").forEach(function (palavra) {
      const tentativa = atual ? atual + " " + palavra : palavra;
      if (fonte.widthOfTextAtSize(tentativa, tam) > larg && atual) {
        linhas.push(atual);
        atual = palavra;
      } else {
        atual = tentativa;
      }
    });
    if (atual) linhas.push(atual);
    return linhas;
  }

  async function aplicarNoPdf(PDFLib, pdfDoc, operacoes) {
    const fontes = {
      normal: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
      negrito: await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold),
    };
    const preto = PDFLib.rgb(0, 0, 0);
    const paginas = pdfDoc.getPages();
    const resultado = { desenhadas: 0, ignoradas: 0 };

    function desenhar(pagina, fonte, p) {
      pagina.drawText(p.texto, { x: p.x, y: pagina.getHeight() - p.baseline, size: p.tam, font: fonte, color: preto });
      resultado.desenhadas++;
    }

    function aplicar(op) {
      const pagina = paginas[op.pg];
      const fonte = op.negrito ? fontes.negrito : fontes.normal;
      if (op.tipo === "centro") {
        const a = ajustar(fonte, op.texto, op.tam, op.larg);
        const w = fonte.widthOfTextAtSize(a.texto, a.tam);
        desenhar(pagina, fonte, { texto: a.texto, x: op.cx - w / 2, baseline: op.cy + 0.35 * a.tam, tam: a.tam });
      } else if (op.tipo === "texto") {
        const a = ajustar(fonte, op.texto, op.tam, op.larg);
        desenhar(pagina, fonte, { texto: a.texto, x: op.x, baseline: op.y, tam: a.tam });
      } else if (op.tipo === "bloco") {
        const cabem = op.linhas.length;
        const linhas = quebrarEmLinhas(fonte, op.texto, op.tam, op.larg);
        linhas.slice(0, cabem).forEach(function (linha, i) {
          const cortada = i === cabem - 1 && linhas.length > cabem;
          const t = cortada ? (linha.length > 3 ? linha.slice(0, -3) : linha) + "..." : linha;
          const a = ajustar(fonte, t, op.tam, op.larg);
          desenhar(pagina, fonte, { texto: a.texto, x: op.x, baseline: op.linhas[i], tam: a.tam });
        });
      }
    }

    operacoes.forEach(function (op) {
      try {
        aplicar(op);
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
    interpretarVinculo: interpretarVinculo,
    interpretarDocumentos: interpretarDocumentos,
    interpretarParentesco: interpretarParentesco,
    temSinalDeAlarme: temSinalDeAlarme,
    validar: validar,
    montarOperacoes: montarOperacoes,
    aplicarNoPdf: aplicarNoPdf,
    /* Pecas que outras fichas (Leishmaniose) reaproveitam. */
    base: {
      novoContexto: novoContexto,
      validarPaciente: validarPaciente,
      validarResidencia: validarResidencia,
      validarTelefone: validarTelefone,
      validarOpcionais: validarOpcionais,
      criarDesenho: criarDesenho,
      pente11: pente11,
      ddmmaaaa: ddmmaaaa,
      soDigitos: soDigitos,
      lerData: lerData,
      diasEntre: diasEntre,
      lista: lista,
      vazio: vazio,
    },
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
