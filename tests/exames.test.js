/* ------------------------------------------------------------------
 * tests/exames.test.js — a base de exames e a regra de ouro
 * ------------------------------------------------------------------
 * O que este teste protege nao e a busca (isso e core/busca.js, ja
 * coberto em tests/busca-remume.test.js). E a INTEGRIDADE DA BASE e a
 * regra que da sentido ao modulo:
 *
 *   A lista de cada municipio e a unica fonte de verdade do que ele
 *   oferece. Nenhum exame pode vazar de um municipio para outro.
 *
 * Errar para menos custa uma consulta ao portal da prefeitura. Errar
 * para mais custa um pedido que o paciente carrega para uma unidade que
 * nao realiza aquilo — e o medico so descobre pelo retorno.
 *
 * Roda contra os dados REAIS, e nao contra fixture: o que quebra uma
 * base assim e a variedade entre as prefeituras, e fixture nao tem
 * variedade.
 * ------------------------------------------------------------------ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
const BASE = JSON.parse(fs.readFileSync(path.join(RAIZ, "dados/exames.json"), "utf8"));

let falhas = 0;
function ok(nome, cond, detalhe) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome);
  if (!cond) {
    falhas++;
    if (detalhe) console.log("         " + detalhe);
  }
}

const municipios = Object.keys(BASE.municipios).filter((k) => k.indexOf("_") !== 0);

/* --- 1. a base e utilizavel --- */
{
  ok("ha municipios na base", municipios.length > 0);

  const semExames = municipios.filter((m) => !Array.isArray(BASE.municipios[m].exames));
  ok("todo municipio tem lista de exames", semExames.length === 0, semExames.join(", "));

  const semNome = [];
  municipios.forEach((m) => {
    BASE.municipios[m].exames.forEach((e, i) => {
      if (!e.nome || typeof e.nome !== "string") semNome.push(m + "[" + i + "]");
    });
  });
  ok("todo exame tem nome", semNome.length === 0, semNome.slice(0, 5).join(", "));

  /* Nome partido em varias linhas nao so fica feio na tela: quebra a
   * busca por duas palavras que a quebra separou. Ja aconteceu com a
   * planilha de Betim, que quebra celulas longas. */
  const comQuebra = [];
  municipios.forEach((m) => {
    BASE.municipios[m].exames.forEach((e) => {
      if (/[\n\r]|\s{2,}/.test(e.nome)) comQuebra.push(m + ": " + e.nome.slice(0, 40));
    });
  });
  ok("nenhum nome tem quebra de linha ou espaco duplo", comQuebra.length === 0,
     comQuebra.slice(0, 3).join(" | "));
}

/* --- 2. a procedencia esta declarada --- */
{
  /* Uma lista sem origem parece oficial mesmo quando esta velha. O
   * painel mostra os dois campos; se faltarem, ele mostra vazio e o
   * medico nao tem como julgar o que esta lendo. */
  const semFonte = municipios.filter((m) => !BASE.municipios[m].fonte);
  ok("todo municipio declara a fonte da lista", semFonte.length === 0, semFonte.join(", "));

  const semData = municipios.filter((m) => !/^\d{4}-\d{2}-\d{2}$/.test(BASE.municipios[m].atualizadoEm || ""));
  ok("todo municipio declara quando foi atualizado (AAAA-MM-DD)", semData.length === 0,
     semData.join(", "));
}

/* --- 3. as siglas existem no vocabulario --- */
{
  /* Uma sigla que a tela nao sabe pintar viraria um selo com texto cru,
   * ou pior, um `undefined` ao lado do exame. */
  const desconhecidas = new Set();
  municipios.forEach((m) => {
    BASE.municipios[m].exames.forEach((e) => {
      if (e.exige && !BASE.siglas[e.exige]) desconhecidas.add(m + ": " + e.exige);
    });
  });
  ok("toda sigla usada esta declarada em `siglas`", desconhecidas.size === 0,
     [...desconhecidas].join(", "));

  const siglasSemRotulo = Object.keys(BASE.siglas).filter(
    (s) => !BASE.siglas[s].rotulo || !BASE.siglas[s].titulo
  );
  ok("toda sigla tem rotulo e explicacao", siglasSemRotulo.length === 0,
     siglasSemRotulo.join(", "));
}

/* --- 4. A REGRA DE OURO: nada vaza entre municipios --- */
{
  /* Monta o indice de cada municipio com o MESMO motor do modulo e
   * confere que todo resultado sai da lista daquele municipio. */
  const ctx = { console };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ["core/dom-reader.js", "core/busca.js"].forEach((f) =>
    vm.runInContext(fs.readFileSync(path.join(RAIZ, f), "utf8"), ctx)
  );
  const B = ctx.MeedsSuiteBusca;

  const indices = {};
  municipios.forEach((m) => {
    indices[m] = B.criarIndice(BASE.municipios[m].exames, (e) =>
      [e.nome, e.apelido || "", e.codigo || "", e.local || ""].join(" ")
    );
  });

  const TERMOS = [
    "hemograma", "creatinina", "holter", "doppler", "troponina", "glicose",
    "eco", "hiv", "colesterol", "urina", "cultura", "ferritina",
  ];

  let forasteiros = 0;
  const exemplos = [];
  municipios.forEach((m) => {
    const daCasa = new Set(BASE.municipios[m].exames.map((e) => e.nome));
    TERMOS.forEach((t) => {
      const r = B.buscar(t, indices[m]);
      (r.itens || []).forEach((x) => {
        const nome = (x.item || x).nome;
        if (!daCasa.has(nome)) {
          forasteiros++;
          if (exemplos.length < 3) exemplos.push(m + " <- " + nome);
        }
      });
    });
  });
  ok("nenhum resultado vem de fora da lista do municipio", forasteiros === 0,
     exemplos.join(" | "));

  /* O contrario tambem importa: um termo que nao existe naquele
   * municipio TEM que devolver vazio, e nao o item mais parecido de
   * outro lugar. */
  const holterEmBetim = B.buscar("holter", indices["Betim"]);
  ok('"holter" nao aparece em Betim (e da lista de Congonhas)',
     (holterEmBetim.itens || []).length === 0);

  const hemogramaEmCongonhas = B.buscar("hemograma", indices["Congonhas"]);
  ok('"hemograma" nao aparece em Congonhas (la so ha procedimentos com APAC)',
     (hemogramaEmCongonhas.itens || []).length === 0);

  ok("termo inexistente nao inventa resultado",
     (B.buscar("xyzabcexame", indices["Betim"]).itens || []).length === 0);
}

/* --- 5. o que cada municipio prometeu entregar --- */
{
  /* Estes numeros vem dos documentos das prefeituras. Se um deles cair,
   * ou a fonte mudou (e o `atualizadoEm` tem que mudar junto) ou o
   * conversor perdeu linhas em silencio — que e o defeito mais caro
   * possivel aqui. */
  const macae = BASE.municipios["Macaé"];
  if (macae) {
    ok("Macae traz o local em todos os exames",
       macae.exames.every((e) => e.local === "UPA Barra"));
    ok("Macae mantem as duas regras clinicas do PDF",
       Array.isArray(macae.observacoes) && macae.observacoes.length === 2);
    ok("uma das regras e o consentimento para HIV",
       (macae.observacoes || []).some((o) => /HIV/i.test(o) && /consentimento/i.test(o)));
  }

  const congonhas = BASE.municipios["Congonhas"];
  if (congonhas) {
    ok("todo exame de Congonhas exige APAC",
       congonhas.exames.every((e) => e.exige === "APAC"));
    ok("todo exame de Congonhas tem codigo SIGTAP",
       congonhas.exames.every((e) => /^\d{2}\.\d{2}\.\d{2}\.\d{3}-\d$/.test(e.codigo || "")),
       congonhas.exames.filter((e) => !/^\d{2}\.\d{2}\.\d{2}\.\d{3}-\d$/.test(e.codigo || ""))
         .map((e) => e.nome).join(", "));
    /* O Doppler se desdobra em territorios: uma linha generica obrigaria
     * o medico a saber de cor que aquele exame tem oito variantes. */
    ok("o Doppler aparece desdobrado por territorio",
       congonhas.exames.filter((e) => /^DOPPLER/i.test(e.nome)).length >= 8);
  }

  const betim = BASE.municipios["Betim"];
  if (betim) {
    ok("Betim traz codigo em todos os exames",
       betim.exames.every((e) => !!e.codigo));
    ok("Betim nao traz sigla (o contrato laboratorial nao exige APAC)",
       betim.exames.every((e) => !e.exige));
  }
}

/* --- 6. a copia embutida esta em dia --- */
{
  /* Quem cai no fallback (sem internet, dominio bloqueado, CSP) precisa
   * ver a mesma lista. Ja aconteceu no REMUME de Barbacena entrar so na
   * fonte remota. */
  const caminho = path.join(RAIZ, "modules/exames/assets/fallback.js");
  ok("o fallback embutido existe", fs.existsSync(caminho));
  if (fs.existsSync(caminho)) {
    const ctx2 = { console };
    ctx2.window = ctx2;
    ctx2.globalThis = ctx2;
    vm.createContext(ctx2);
    vm.runInContext(fs.readFileSync(caminho, "utf8"), ctx2);
    const embutida = ctx2.__MEEDS_EXAMES_FALLBACK__;
    ok("o fallback tem o mesmo conteudo de dados/exames.json",
       JSON.stringify(embutida) === JSON.stringify(BASE),
       "rode: node scripts/sync-exames.js");
  }
}

const total = municipios.reduce((a, m) => a + BASE.municipios[m].exames.length, 0);
console.log(
  "\n  " + municipios.length + " municipio(s), " + total + " exame(s): " +
  municipios.map((m) => m + " " + BASE.municipios[m].exames.length).join(", ")
);
console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
