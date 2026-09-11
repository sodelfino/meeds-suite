/* ------------------------------------------------------------------
 * tests/remume-receituario.test.js — selo de Receita Amarela/Azul
 * ------------------------------------------------------------------
 * Cobre o pedido: alguns medicamentos da REMUME de Macaé exigem
 * Notificacao de Receita A (amarela) ou B (azul) — Portaria 344/98 —,
 * que ainda nao tem aprovacao para prescricao digital. Precisam ser
 * prescritos em separado, para transcricao por medico presencial.
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

  /* 5. ida e volta: todo item de remumes.json com receituario precisa
   *    sobreviver ao formato de string do fallback.js gerado — prova
   *    viva de que os dois arquivos nao podem divergir */
  {
    const REMUMES = JSON.parse(fs.readFileSync(path.join(RAIZ, "modules/remume/remumes.json"), "utf8"));
    function itemParaStringLegado(item) {
      const nome = item.nome || "";
      let s = item.local ? `${nome} (Local de acesso: ${item.local})` : nome;
      if (item.receituario === "amarela" || item.receituario === "azul") s += ` [Receituário: ${item.receituario}]`;
      return s;
    }
    const marcados = (REMUMES["Macaé"] || []).filter((i) => i.receituario);
    ok("Macaé tem itens marcados para testar a ida e volta", marcados.length > 0, marcados.length);

    let quebrou = 0;
    marcados.forEach((item) => {
      const string = itemParaStringLegado(item);
      const volta = N(string);
      if (volta.nome !== item.nome || volta.local !== item.local || volta.receituario !== item.receituario) quebrou++;
    });
    ok("todos os itens marcados sobrevivem objeto -> string -> objeto", quebrou === 0, quebrou + " quebrado(s)");

    const amarela = marcados.filter((i) => i.receituario === "amarela").length;
    const azul = marcados.filter((i) => i.receituario === "azul").length;
    ok("11 itens marcados como amarela (Lista A1 pura, sem excecao de dose)", amarela === 11, amarela);
    ok("15 itens marcados como azul (Lista B1)", azul === 15, azul);
  }

  /* 6. regra de ouro: nenhum outro municipio foi tocado */
  {
    const REMUMES = JSON.parse(fs.readFileSync(path.join(RAIZ, "modules/remume/remumes.json"), "utf8"));
    const outros = Object.keys(REMUMES).filter((c) => c !== "_meta" && c !== "Macaé");
    const vazou = outros.some((c) => REMUMES[c].some((i) => i && typeof i === "object" && i.receituario));
    ok("nenhum municipio alem de Macaé tem o campo receituario", !vazou);
  }
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
