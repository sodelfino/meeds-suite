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

  /* `nota` e texto livre — a unica higiene que cabe cobrar e a mesma do
   * nome: sem quebra de linha crua nem espaco duplo, que denunciam texto
   * colado direto de um PDF sem passar por limpeza. */
  const notaSuja = [];
  municipios.forEach((m) => {
    BASE.municipios[m].exames.forEach((e) => {
      if (e.nota && /[\n\r]|\s{2,}/.test(e.nota)) notaSuja.push(m + ": " + e.nome);
    });
  });
  ok("nenhuma nota tem quebra de linha ou espaco duplo", notaSuja.length === 0,
     notaSuja.slice(0, 3).join(" | "));
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

  const sl = BASE.municipios["Sete Lagoas"];
  if (sl) {
    /* Sete Lagoas e o primeiro municipio com DUAS fontes na mesma
     * lista: as "orientacoes" da Central (sem codigo — o documento nao
     * traz numero de procedimento nenhum) e a tabela SIGTAP de exames
     * laboratoriais (codigo em todo item). As duas continuam
     * distinguiveis pela presenca de `codigo`, mesmo depois da juncao. */
    const semCodigo = sl.exames.filter((e) => !e.codigo);
    const comCodigo = sl.exames.filter((e) => e.codigo);
    ok("Sete Lagoas tem os itens sem codigo da fonte de orientacoes (65)",
       semCodigo.length === 65, "achou " + semCodigo.length);
    ok("Sete Lagoas tem os itens com codigo da fonte laboratorial (456)",
       comCodigo.length === 456, "achou " + comCodigo.length);
    ok("nenhum codigo laboratorial se repete",
       new Set(comCodigo.map((e) => e.codigo)).size === comCodigo.length);
    /* Lote I/II usam 10 digitos (prefixo "02..."); Lote III imprime 9,
     * sem o zero a esquerda. Os dois formatos sao os que a fonte traz —
     * nao ha um terceiro formato que denunciaria erro de transcricao. */
    ok("todo codigo laboratorial tem 9 ou 10 digitos",
       comCodigo.every((e) => /^\d{9,10}$/.test(e.codigo)),
       comCodigo.filter((e) => !/^\d{9,10}$/.test(e.codigo)).map((e) => e.codigo).join(", "));
    ok("Sete Lagoas mantem as duas regras da Central (GMUS/CADWEB, carimbo/contato)",
       Array.isArray(sl.observacoes) && sl.observacoes.length === 2);
    ok("a fonte combinada menciona as duas origens",
       /orienta/i.test(sl.fonte) && /SIGTAP/i.test(sl.fonte));
    ok("quase todo item da fonte de orientacoes traz o local de realizacao",
       semCodigo.filter((e) => e.local).length >= semCodigo.length - 1,
       "so 1 pode ficar sem local: a celula da fonte estava mesmo vazia");
    /* ALTO_CUSTO e a sigla que a fonte de orientacoes introduziu —
     * categoria burocratica do SUS distinta de APAC, tao real quanto
     * ela. */
    ok("Sete Lagoas usa a sigla ALTO_CUSTO em algum exame",
       sl.exames.some((e) => e.exige === "ALTO_CUSTO"));
    ok("nenhum exame de Sete Lagoas fica com nome de medico ou de funcionario",
       sl.exames.every((e) => !/Dr\.|Dra\.|DANIEL|BRENO|FONSECA/i.test(e.nome)),
       "nome de pessoa vazou para dentro do campo nome — era para ter ficado de fora");
  }
}

/* --- 6. a ordem alfabetica trata acento como letra --- */
{
  /* A comparacao byte a byte poe "ÁCIDO" DEPOIS de "ZINCO", porque o "Á"
   * tem codigo maior que qualquer letra sem acento. Numa base onde
   * metade dos nomes comeca com acento, isso e a diferenca entre uma
   * lista navegavel e uma lista que parece embaralhada. */
  const opcoes = { sensitivity: "base", ignorePunctuation: true, numeric: true };
  const cmp = (a, b) => String(a).localeCompare(String(b), "pt-BR", opcoes);

  ok('"ÁCIDO" vem antes de "BILIRRUBINA" (acento nao joga para o fim)',
     cmp("ÁCIDO ÚRICO", "BILIRRUBINA TOTAL") < 0);
  ok('"ÁCIDO" e "ACIDO" empatam (o acento nao separa)',
     cmp("ÁCIDO FÓLICO", "ACIDO FOLICO") === 0);
  ok('numeros em ordem numerica: "3-METIL" antes de "10,11 EPÓXIDO"',
     cmp("3-METIL HISTIDINA", "10,11 EPÓXIDO CARBAMAZEPINAM") < 0);

  /* A lista de cada municipio precisa ficar estavel: ordenar duas vezes
   * nao pode mudar a ordem, senao o item "pula" a cada redesenho. */
  municipios.forEach((m) => {
    const nomes = BASE.municipios[m].exames.map((e) => e.nome);
    const uma = nomes.slice().sort(cmp);
    const duas = uma.slice().sort(cmp);
    ok("a ordenacao de " + m + " e estavel", JSON.stringify(uma) === JSON.stringify(duas));
  });
}

/* --- 7. a tela declara as pecas que a lista completa precisa --- */
{
  /* Guarda contra remocao acidental: sem qualquer uma destas, a lista
   * completa deixa de funcionar de um jeito que so aparece na tela. */
  const fonte = fs.readFileSync(path.join(RAIZ, "modules/exames/index.js"), "utf8");
  const pecas = [
    [".oculto", "a classe que esconde item filtrado"],
    ["ex-spinner", "o sinal de que o filtro esta rodando"],
    ["ex-mais", 'o botao "+ Mais" da paginacao'],
    ["ordenarAlfabeticamente", "a ordenacao da lista"],
    ["indicesQuePassam", "o filtro sobre a base inteira"],
    ["localeCompare", "a comparacao que trata acento como letra"],
  ];
  pecas.forEach(([marca, oQueE]) => {
    ok("o modulo ainda tem " + oQueE, fonte.indexOf(marca) !== -1);
  });
}

/* --- 8. a copia embutida esta em dia --- */
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
