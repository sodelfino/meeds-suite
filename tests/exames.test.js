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
  ok('"holter" nao aparece em Betim (e da lista de Macae/Cardiologia)',
     (holterEmBetim.itens || []).length === 0);

  const cateterismoEmBetim = B.buscar("cateterismo", indices["Betim"]);
  ok('"cateterismo" nao aparece em Betim (e da lista de Macae/Cardiologia)',
     (cateterismoEmBetim.itens || []).length === 0);

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
    /* Macae e o segundo municipio com duas fontes (Sete Lagoas foi o
     * primeiro): a UPA Barra (local, sem especialidade) e a lista por
     * especialidade da SEMUSA (especialidade, sem local — o `local`
     * so faz sentido para quem descreve "onde", nao "por qual porta de
     * entrada"). Cada exame pertence a exatamente UMA das duas fontes,
     * entao nunca tem as duas coisas ao mesmo tempo. */
    ok("nenhum exame de Macae tem local (UPA Barra) E especialidade (SEMUSA) ao mesmo tempo",
       macae.exames.every((e) => {
         const temLocal = e.local === "UPA Barra";
         const temEspecialidade = Array.isArray(e.especialidade) && e.especialidade.length > 0;
         return !(temLocal && temEspecialidade);
       }));
    ok("os 28 exames da UPA Barra continuam com local",
       macae.exames.filter((e) => e.local === "UPA Barra").length === 28);
    ok("Ecodoppler de carotidas/vertebrais tem 3 especialidades (o exemplo que motivou o array)",
       (macae.exames.find((e) => e.nome === "Ecodoppler de carótidas/vertebrais") || {}).especialidade
         ?.length === 3);
    ok("nenhum canalEncaminhamento de Macae fica fora do vocabulario",
       macae.exames.every((e) =>
         !e.orientacao || !e.orientacao.canalEncaminhamento ||
         ["SISREG", "CENTRAL_MUNICIPAL", "REGULACAO_ESTADUAL", "DIRETO_AO_SERVICO", "OUTRO"]
           .includes(e.orientacao.canalEncaminhamento)));
  }

  const congonhas = BASE.municipios["Congonhas"];
  if (congonhas) {
    /* Congonhas e a lista real (laboratorio da UPA 24h), nao mais o
     * catalogo de APAC mal rotulado que existiu aqui ate esta leva. */
    ok("Congonhas tem os 52 exames do laboratorio da UPA",
       congonhas.exames.length === 52, "achou " + congonhas.exames.length);
    ok("nenhum exame de Congonhas tem codigo (o documento nao traz)",
       congonhas.exames.every((e) => !e.codigo));
    ok("todo exame de Congonhas usa o canal LABORATORIO_UPA",
       congonhas.exames.every((e) => e.orientacao && e.orientacao.canalEncaminhamento === "LABORATORIO_UPA"));
    ok("nenhum status usado em Congonhas foge do vocabulario ATIVO/SUSPENSO",
       congonhas.exames.every((e) => !e.status || ["ATIVO", "SUSPENSO"].includes(e.status)));
    ok("so a Baciloscopia direta para BAAR esta SUSPENSO",
       congonhas.exames.filter((e) => e.status === "SUSPENSO").map((e) => e.nome)
         .join(", ") === "Baciloscopia direta para BAAR");
    ok("nenhum exame ATIVO grava status (campo ausente e o padrao implicito)",
       congonhas.exames.filter((e) => e.status === "ATIVO").length === 0);
    ok("os 7 exames restritos a urgencia/emergencia ou indicacao especifica tem `restricoes`",
       congonhas.exames.filter((e) => e.orientacao && e.orientacao.restricoes).length === 7);
    ok("Congonhas reativa a observacao municipal (regra de pedido separado)",
       Array.isArray(congonhas.observacoes) && congonhas.observacoes.length === 1 &&
       /pedido separado/i.test(congonhas.observacoes[0]));
    ok("fonte e data batem com o documento",
       congonhas.fonte === "Laboratório da UPA 24h – Congonhas (MG)" && congonhas.atualizadoEm === "2025-10-21");
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

/* --- 5b. o campo `orientacao` (opcional, por exame) --- */
{
  const FLUXOS_VALIDOS = ["FICA_NA_UNIDADE", "VAI_PARA_CENTRAL", "OUTRO"];
  /* Achata TODO texto de uma orientacao — os campos string e os itens
   * dos campos array — numa lista so, pra rodar a mesma bateria de
   * checagem (hygiene, nome de pessoa) sem repetir o codigo por campo. */
  function textosDaOrientacao(o) {
    const t = [];
    ["faixaEtaria", "preparo", "comoCadastrar", "validade", "observacoes"].forEach((k) => {
      if (o[k]) t.push(o[k]);
    });
    ["documentos", "preRequisitos", "restricoes"].forEach((k) => {
      (o[k] || []).forEach((item) => t.push(item));
    });
    return t;
  }

  let comOrientacao = 0;
  const vazias = [];
  const fluxoInvalido = [];
  const listaVazia = [];
  const textoSujo = [];
  const nomeDePessoa = [];

  municipios.forEach((m) => {
    BASE.municipios[m].exames.forEach((e) => {
      if (!e.orientacao) return;
      comOrientacao++;
      const o = e.orientacao;

      /* O gerador (orientacao(), em scripts/montar-exames.js) promete
       * nunca deixar passar um objeto sem conteudo — `orientacao: {}`
       * obrigaria o renderizador a checar "existe mas esta vazio" em
       * vez de so "existe". Aqui e onde essa promessa e cobrada. */
      const temAlgumCampo = Object.keys(o).some((k) => {
        const v = o[k];
        return Array.isArray(v) ? v.length > 0 : !!v;
      });
      if (!temAlgumCampo) vazias.push(m + ": " + e.nome);

      if (o.fluxo && FLUXOS_VALIDOS.indexOf(o.fluxo) === -1) {
        fluxoInvalido.push(m + ": " + e.nome + " -> " + o.fluxo);
      }

      /* Array presente mas vazio e o mesmo bug que `orientacao: {}`,
       * um nivel abaixo: melhor o campo nem existir. */
      ["documentos", "preRequisitos", "restricoes"].forEach((k) => {
        if (o[k] && o[k].length === 0) listaVazia.push(m + ": " + e.nome + " (" + k + ")");
      });

      textosDaOrientacao(o).forEach((texto) => {
        if (/[\n\r]|\s{2,}/.test(texto)) textoSujo.push(m + ": " + e.nome);
        /* A mesma regra do campo `nome`: nenhum nome de pessoa entra em
         * `orientacao`, nem escondido dentro de uma frase — e onde a
         * regra 4 (excluir nome de medico/responsavel) e cobrada de
         * verdade, porque e o campo de texto livre mais provavel de
         * "vazar" um nome colado sem querer. */
        if (/Dr\.|Dra\.|DANIEL|BRENO|FONSECA|SOFIA|JAQUELINE/i.test(texto)) {
          nomeDePessoa.push(m + ": " + e.nome);
        }
      });
    });
  });

  ok("ha pelo menos um exame com `orientacao` na base (a feature esta em uso)",
     comOrientacao > 0);
  ok("nenhum `orientacao` ficou vazio depois de gerado",
     vazias.length === 0, vazias.join(" | "));
  ok("todo `fluxo` usado esta no vocabulario FICA_NA_UNIDADE/VAI_PARA_CENTRAL/OUTRO",
     fluxoInvalido.length === 0, fluxoInvalido.join(" | "));
  ok("nenhuma lista de orientacao (documentos/preRequisitos/restricoes) ficou vazia",
     listaVazia.length === 0, listaVazia.join(" | "));
  ok("nenhum texto de orientacao tem quebra de linha ou espaco duplo",
     textoSujo.length === 0, textoSujo.join(" | "));
  ok("nenhum texto de orientacao contem nome de medico ou funcionario",
     nomeDePessoa.length === 0, nomeDePessoa.join(" | "));

  /* Os dois exemplos apresentados no desenho do schema, fixados aqui
   * para o teste falhar se algum deles regredir num proximo commit —
   * ou se `orientacao()` mudar de comportamento sem ninguem notar. */
  const sl = BASE.municipios["Sete Lagoas"];
  if (sl) {
    const urodinamico = sl.exames.find((e) => e.nome === "Estudo Urodinâmico");
    ok('"Estudo Urodinâmico" tem orientacao totalmente tipada',
       !!urodinamico && !!urodinamico.orientacao);
    if (urodinamico && urodinamico.orientacao) {
      const o = urodinamico.orientacao;
      ok("  ...com faixaEtaria, preRequisitos, restricoes, fluxo e observacoes",
         !!o.faixaEtaria && Array.isArray(o.preRequisitos) && Array.isArray(o.restricoes) &&
         !!o.fluxo && !!o.observacoes);
      ok('  ...fluxo e FICA_NA_UNIDADE (nao vai fisicamente para a Central)',
         o.fluxo === "FICA_NA_UNIDADE");
      ok("  ...nao decompos em documentos nem comoCadastrar (a fonte nao pedia isso)",
         !o.documentos && !o.comoCadastrar);
    }

    const usgUrinario = sl.exames.find((e) => e.nome === "Ultrassonografia de Aparelho Urinário");
    ok('"Ultrassonografia de Aparelho Urinário" tem orientacao SO com observacoes',
       !!usgUrinario && !!usgUrinario.orientacao &&
       Object.keys(usgUrinario.orientacao).length === 1 &&
       !!usgUrinario.orientacao.observacoes);
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
