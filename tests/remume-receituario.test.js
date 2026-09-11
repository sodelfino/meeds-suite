/* ------------------------------------------------------------------
 * tests/remume-receituario.test.js — selo de Receita Amarela/Azul
 * ------------------------------------------------------------------
 * Cobre o pedido: alguns medicamentos das REMUMEs exigem Notificacao de
 * Receita A (amarela) ou B (azul) — Portaria 344/98 —, que ainda nao tem
 * aprovacao para prescricao digital. Precisam ser prescritos em
 * separado, para transcricao por medico presencial.
 *
 * POR QUE OS 11 MUNICIPIOS, E NAO SO MACAÉ
 * Comecou so em Macaé, cuja REMUME ja anota o dispositivo legal de cada
 * item ("port.nº 344/98 Lista X") no proprio nome — fonte primaria.
 * Nenhum outro municipio publica essa anotacao. A classificacao
 * amarela/azul, porem, NAO e dado municipal: e lei federal, e o mesmo
 * principio ativo (diazepam, morfina, midazolam...) exige a mesma
 * receita em qualquer municipio. Por isso o campo foi replicado por
 * CASAMENTO DE NOME DE SUBSTANCIA — nunca copiando ou inferindo POLITICA
 * de um municipio a partir de outro, que e o que a regra de ouro proibe.
 * A lista de substancias usada e so a que ja foi verificada uma por uma
 * em Macaé (secao 5c abaixo), incluindo a excecao de dose que tira
 * tramadol/codeina/nalbufina do amarelo.
 *
 * DOIS FORMATOS PRECISAM CONCORDAR:
 *   1. o objeto {nome, local, receituario} de modules/remume/remumes.json
 *      (o que o modulo busca via rede);
 *   2. a STRING legada do fallback embutido, gerada por
 *      scripts/sync-fallback.js — "Nome (Local de acesso: X)
 *      [Receituário: azul]" — usada quando a rede falha.
 * Se um sincronizar e o outro nao, quem cai no fallback (sem internet,
 * dominio bloqueado) perde o aviso de seguranca sem saber.
 * ------------------------------------------------------------------ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs !== undefined ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}

const RAIZ = path.join(__dirname, "..");

/* Sobe modules/remume/index.js num sandbox minimo, so para alcancar
 * normalizarItemRemume() atraves do hook _normalizarItemRemume exposto
 * no contrato do modulo — nenhuma outra parte do modulo e exercitada
 * aqui (a UI e coberta manualmente, ver docs/TESTES.md). */
function carregarModulo() {
  let capturado = null;
  const ctx = {
    console,
    JSON,
    String,
    Object,
    Array,
    RegExp,
    Promise,
    setInterval: function () { return 0; },
    clearInterval: function () {},
    setTimeout: function () { return 0; },
    document: { createElement: function () { return {}; } },
    MeedsSuite: { registerModule: function (def) { capturado = def; } },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "modules/remume/index.js"), "utf8"), ctx);
  return capturado;
}

const modulo = carregarModulo();
ok("o modulo registrou e expos o hook de teste", !!modulo && typeof modulo._normalizarItemRemume === "function");

if (modulo) {
  const N = modulo._normalizarItemRemume;

  /* 1. objeto do JSON remoto, com receituario valido */
  {
    const r = N({ nome: "Morfina, sulfato 10mg comprimido", local: "HPM", receituario: "amarela" });
    ok("objeto: nome preservado", r.nome === "Morfina, sulfato 10mg comprimido", r.nome);
    ok("objeto: local preservado", r.local === "HPM", r.local);
    ok("objeto: receituario amarela preservado", r.receituario === "amarela", r.receituario);
  }
  {
    const r = N({ nome: "Diazepam 5mg comprimido", local: "HPM", receituario: "azul" });
    ok("objeto: receituario azul preservado", r.receituario === "azul", r.receituario);
  }

  /* 2. objeto sem receituario (a maioria dos ~2.954 itens da suite) */
  {
    const r = N({ nome: "Dipirona 500mg comprimido", local: "UBS" });
    ok("objeto sem receituario vira null (nao 'undefined', nao string vazia)", r.receituario === null, r.receituario);
  }

  /* 3. valor invalido na fonte nao pode virar um selo na tela — a regra
   *    e "so mostra o que a fonte marcou com um dos dois valores
   *    validos", nunca um terceiro valor a interpretar */
  {
    const r = N({ nome: "Item qualquer", receituario: "verde" });
    ok("receituario fora de amarela/azul e descartado, nao propagado", r.receituario === null, r.receituario);
  }

  /* 4. string legada do FALLBACK — o caminho que o sync-fallback.js
   *    gera e que precisa continuar batendo com o parser aqui */
  {
    const r = N("Diazepam 5mg comprimido (port.nº 344/98 Lista B1) (Local de acesso: HPM, HPMS) [Receituário: azul]");
    ok("string legada: nome sem os marcadores", r.nome === "Diazepam 5mg comprimido (port.nº 344/98 Lista B1)", r.nome);
    ok("string legada: local extraido", r.local === "HPM, HPMS", r.local);
    ok("string legada: receituario extraido", r.receituario === "azul", r.receituario);
  }
  {
    const r = N("Morfina, sulfato 30mg comprimido (port.nº 344/98 Lista A1) [Receituário: amarela]");
    ok("string legada sem local, so receituario: nome correto", r.nome === "Morfina, sulfato 30mg comprimido (port.nº 344/98 Lista A1)", r.nome);
    ok("string legada sem local, so receituario: extraido", r.receituario === "amarela", r.receituario);
  }
  {
    const r = N("Dipirona 500mg comprimido (Local de acesso: UBS)");
    ok("string legada sem receituario: local ainda funciona como antes", r.local === "UBS", r.local);
    ok("string legada sem receituario: receituario null", r.receituario === null, r.receituario);
  }

  /* 5. ida e volta: todo item de remumes.json com receituario, em
   *    QUALQUER municipio, precisa sobreviver ao formato de string do
   *    fallback.js gerado — prova viva de que os dois arquivos nao
   *    podem divergir */
  {
    const REMUMES = JSON.parse(fs.readFileSync(path.join(RAIZ, "modules/remume/remumes.json"), "utf8"));
    function itemParaStringLegado(item) {
      const nome = item.nome || "";
      let s = item.local ? `${nome} (Local de acesso: ${item.local})` : nome;
      if (item.receituario === "amarela" || item.receituario === "azul") s += ` [Receituário: ${item.receituario}]`;
      return s;
    }
    const cidades = Object.keys(REMUMES).filter((c) => c !== "_meta");
    const marcados = [];
    cidades.forEach((c) => REMUMES[c].filter((i) => i.receituario).forEach((i) => marcados.push(i)));
    ok("ha itens marcados, em mais de um municipio, para testar a ida e volta", marcados.length > 0, marcados.length);

    let quebrou = 0;
    marcados.forEach((item) => {
      const string = itemParaStringLegado(item);
      const volta = N(string);
      if (volta.nome !== item.nome || volta.local !== item.local || volta.receituario !== item.receituario) quebrou++;
    });
    ok("todos os itens marcados, de todos os municipios, sobrevivem objeto -> string -> objeto", quebrou === 0, quebrou + " quebrado(s)");

    const amarelaMacae = REMUMES["Macaé"].filter((i) => i.receituario === "amarela").length;
    const azulMacae = REMUMES["Macaé"].filter((i) => i.receituario === "azul").length;
    ok("Macaé: 11 itens amarela (Lista A1 pura, sem excecao de dose)", amarelaMacae === 11, amarelaMacae);
    ok("Macaé: 15 itens azul (Lista B1)", azulMacae === 15, azulMacae);
  }

  /* 6. REPLICACAO PARA OS OUTROS 10 MUNICIPIOS, POR SUBSTANCIA
   *
   * A regra de ouro proibe copiar POLITICA de um municipio para outro —
   * mas receituario amarela/azul nao e politica municipal, e lei federal
   * (Portaria 344/98) que vale igual em qualquer lugar. O casamento e
   * por NOME DE SUBSTANCIA, sempre no INICIO do nome do medicamento (e
   * onde o principio ativo sempre fica, nestas REMUMEs), usando so os
   * principios ativos ja verificados um a um em Macaé — nunca a lista
   * inteira do guia do HSL, que tambem lista substancias com excecao de
   * dose (tramadol, codeina) que Macaé provou NAO poderem ir para o
   * amarelo sem checar a concentracao.
   *
   * Este classificador e escrito de novo aqui, INDEPENDENTE do que gerou
   * os dados (ver conversa/commit) — se algum dia o campo receituario
   * dos dados divergir do que a lei diz para aquela substancia, em
   * qualquer municipio, isto acusa. */
  {
    const REMUMES = JSON.parse(fs.readFileSync(path.join(RAIZ, "modules/remume/remumes.json"), "utf8"));

    function semAcento(s) {
      return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }
    // Lista A1 pura (entorpecentes) e Lista B1 (psicotropicos), so as
    // substancias ja conferidas item a item na REMUME de Macaé.
    const AMARELA_SUBST = ["alfentanila", "fentanila", "metadona", "morfina", "petidina", "meperidina"];
    const AZUL_SUBST = ["alprazolam", "bromazepam", "clobazam", "clonazepam", "diazepam", "lorazepam", "midazolam", "nitrazepam"];
    function classificar(nome) {
      const n = semAcento(nome).toLowerCase().trimStart();
      if (AMARELA_SUBST.some((s) => n.startsWith(s))) return "amarela";
      if (AZUL_SUBST.some((s) => n.startsWith(s))) return "azul";
      return null;
    }

    const cidades = Object.keys(REMUMES).filter((c) => c !== "_meta");
    let divergencias = [];
    cidades.forEach((c) => {
      REMUMES[c].forEach((item) => {
        const esperado = classificar(item.nome);
        const atual = item.receituario || null;
        if (esperado !== atual) divergencias.push(c + " | " + item.nome + " | esperado=" + esperado + " atual=" + atual);
      });
    });
    ok(
      "em todos os 11 municipios, receituario bate com a classificacao por substancia",
      divergencias.length === 0,
      divergencias.slice(0, 5).join(" ; ")
    );

    // combinacao com outro ativo pode mudar a classificacao legal — o
    // casamento por nome nao pode ter marcado uma sozinho. Macaé fica de
    // fora desta checagem: "Fentanila + Droperidol (port.nº 344/98 Lista
    // A1)" e um combo real, ja verificado item a item na fonte oficial —
    // e continua Lista A1 mesmo associado. So os outros 10 municipios,
    // marcados so por casamento de nome (sem conferencia individual),
    // precisam vir 100% livres de combo.
    const combosMarcados = [];
    cidades
      .filter((c) => c !== "Macaé")
      .forEach((c) => {
        REMUMES[c].forEach((item) => {
          if (item.receituario && item.nome.indexOf("+") !== -1) combosMarcados.push(c + " | " + item.nome);
        });
      });
    ok("nos 10 municipios replicados por nome, nenhuma associacao ('+') foi marcada", combosMarcados.length === 0, combosMarcados.join(" ; "));

    // tramadol/codeina/nalbufina: a excecao de dose vale em TODO municipio,
    // nao so em Macaé — nenhum dos tres pode ter sido marcado em lugar nenhum
    const excecaoIndevida = [];
    cidades.forEach((c) => {
      REMUMES[c].forEach((item) => {
        const n = semAcento(item.nome).toLowerCase();
        if (item.receituario && /^(tramadol|codeina|nalbufina)/.test(n.trimStart())) {
          excecaoIndevida.push(c + " | " + item.nome);
        }
      });
    });
    ok("tramadol/codeina/nalbufina continuam sem selo em todo municipio (excecao de dose)", excecaoIndevida.length === 0, excecaoIndevida.join(" ; "));

    // mais de metade dos municipios precisa ter pelo menos um item
    // marcado — se a replicacao falhar silenciosamente (ex.: acento
    // quebrando o casamento), isto teria ficado em 1 (so Macaé)
    const comMarca = cidades.filter((c) => REMUMES[c].some((i) => i.receituario)).length;
    ok("pelo menos 9 dos 11 municipios tem algum item marcado", comMarca >= 9, comMarca + "/" + cidades.length);

    const totalGeral = cidades.reduce((s, c) => s + REMUMES[c].filter((i) => i.receituario).length, 0);
    ok("96 itens marcados no total, nos 11 municipios (26 em Macaé + 70 nos outros 10)", totalGeral === 96, totalGeral);
  }
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
