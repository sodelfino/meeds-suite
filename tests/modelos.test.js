/* ------------------------------------------------------------------
 * tests/modelos.test.js — core/modelos.js
 * ------------------------------------------------------------------
 * O RISCO DESTA FUNCIONALIDADE E UM SO, E ELE SAI EM PAPEL TIMBRADO:
 * um modelo e feito para ser aplicado a OUTRO paciente. Se ele guardar
 * o CPF ou o nome de quem estava na tela quando foi criado, todo laudo
 * gerado a partir dele sai com o dado da pessoa errada — e ninguem
 * percebe, porque o campo parece preenchido.
 *
 * Por isso a maior parte deste arquivo prova a fronteira, e nao as
 * funcionalidades.
 * ------------------------------------------------------------------ */
const fs = require("fs");
const vm = require("vm");

let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs !== undefined ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}

function ambiente() {
  const disco = new Map();
  const ctx = {
    console: { warn() {}, debug() {}, log() {} },
    JSON, Object, Array, String, Number, Date, parseInt, RegExp,
    MeedsSuiteStorage: {
      duravel: (chave) => ({
        ler: (padrao) => (disco.has(chave) ? JSON.parse(disco.get(chave)) : padrao),
        gravar: (v) => { disco.set(chave, JSON.stringify(v)); return true; },
      }),
    },
    _disco: disco,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("core/modelos.js", "utf8"), ctx);
  return ctx.MeedsSuiteModelos;
}

/* Os campos que a APAC declara como clinicos — a mesma lista que ela ja
 * usa no historico. */
const CLINICOS_APAC = [
  "procedimento", "apac-territorio-sel", "apac-eco-variante-sel",
  "apac-outro-codigo", "apac-outro-nome",
  "apac-cid1", "apac-cid2", "apac-cid3", "apac-cid-desc", "apac-obs",
];

/* 1. A FRONTEIRA — nenhum dado de paciente entra, por dois caminhos */
{
  const M = ambiente();
  const formularioInteiro = {
    procedimento: "HOLTER",
    "apac-cid1": "I48",
    "apac-obs": "Solicito Holter 24h.",
    /* isto tudo esta no formulario e NAO pode entrar no modelo */
    "apac-pac-nome": "MARIA APARECIDA DE SOUZA",
    "apac-pac-cpf": "123.456.789-09",
    "apac-pac-nasc": "1970-05-10",
    "apac-pac-mae": "JOANA DE SOUZA",
    "apac-pac-sexo": "F",
  };
  const r = M.salvar("apac", "Holter rotina", formularioInteiro, CLINICOS_APAC);
  ok("salvou", r.ok, JSON.stringify(r));

  const guardado = JSON.stringify(M.obter("apac", "Holter rotina"));
  ok("o modelo tem a parte clinica", /HOLTER/.test(guardado) && /I48/.test(guardado));
  ok("NENHUM nome de paciente", !/MARIA|JOANA/.test(guardado), guardado.slice(0, 120));
  ok("NENHUM CPF", !/123\.456|12345678909/.test(guardado));
  ok("nenhuma data de nascimento", !/1970-05-10/.test(guardado));
  ok("nenhum sexo", !JSON.parse(guardado).clinico["apac-pac-sexo"]);
}

{
  /* Segunda trava: mesmo que alguem inclua um campo de paciente na
   * lista de permitidos por engano, ele nao passa. */
  const M = ambiente();
  const listaEnvenenada = CLINICOS_APAC.concat(["apac-pac-cpf", "apac-pac-nome"]);
  M.salvar("apac", "X", { procedimento: "MAPA", "apac-pac-cpf": "111.222.333-44", "apac-pac-nome": "FULANO" }, listaEnvenenada);
  const g = JSON.stringify(M.obter("apac", "X"));
  ok("permitido por engano ainda assim NAO entra", !/111\.222|FULANO/.test(g), g);
  ok("e o que era clinico entrou", /MAPA/.test(g));
}

/* 2. o basico funcionando */
{
  const M = ambiente();
  M.salvar("apac", "Holter", { procedimento: "HOLTER", "apac-cid1": "I48" }, CLINICOS_APAC);
  M.salvar("apac", "MAPA", { procedimento: "MAPA", "apac-cid1": "I10" }, CLINICOS_APAC);
  M.salvar("cmd", "Fisio", { "cmd-proc-nome": "Fisioterapia" }, ["cmd-proc-nome"]);

  ok("lista por modulo", M.listar("apac").length === 2 && M.listar("cmd").length === 1);
  ok("um modulo nao ve o modelo do outro", !M.obter("cmd", "Holter"));
  ok("vem em ordem alfabetica", M.listar("apac").map((m) => m.nome).join(",") === "Holter,MAPA");

  M.salvar("apac", "Holter", { procedimento: "HOLTER", "apac-cid1": "I48.0" }, CLINICOS_APAC);
  ok("mesmo nome corrige, nao duplica", M.listar("apac").length === 2, M.listar("apac").length);
  ok("e o conteudo e o novo", M.obter("apac", "Holter").clinico["apac-cid1"] === "I48.0");

  ok("remover tira so aquele", M.remover("apac", "MAPA") && M.listar("apac").length === 1);
  ok("remover o que nao existe devolve false", M.remover("apac", "NAO EXISTE") === false);
}

/* 3. o modelo padrao — o que faz "ja vir preenchido" */
{
  const M = ambiente();
  M.salvar("apac", "Holter", { procedimento: "HOLTER" }, CLINICOS_APAC);
  M.salvar("apac", "MAPA", { procedimento: "MAPA" }, CLINICOS_APAC);

  ok("sem padrao definido, nao ha padrao", M.padraoDe("apac") === null);
  M.definirPadrao("apac", "Holter");
  ok("marcou o padrao", M.padraoDe("apac").nome === "Holter");

  M.definirPadrao("apac", "MAPA");
  ok("marcar outro desmarca o anterior", M.padraoDe("apac").nome === "MAPA");
  ok("so existe UM padrao", M.listar("apac").filter((m) => m.padrao).length === 1);

  M.definirPadrao("apac", "MAPA");
  ok("clicar de novo desmarca", M.padraoDe("apac") === null);

  /* Corrigir um modelo nao pode fazer ele deixar de ser o padrao. */
  M.definirPadrao("apac", "Holter");
  M.salvar("apac", "Holter", { procedimento: "HOLTER", "apac-cid1": "I48" }, CLINICOS_APAC);
  ok("corrigir o modelo preserva o padrao", M.padraoDe("apac") && M.padraoDe("apac").nome === "Holter");
}

/* 4. recusas com explicacao, nao silencio */
{
  const M = ambiente();
  ok("sem nome, recusa e explica", M.salvar("apac", "  ", { procedimento: "X" }, CLINICOS_APAC).erro.length > 10);
  ok("formulario vazio, recusa e explica",
     M.salvar("apac", "Vazio", {}, CLINICOS_APAC).erro.indexOf("preencha") !== -1);
  ok("so campo de paciente = nada para salvar",
     M.salvar("apac", "So paciente", { "apac-pac-nome": "FULANO" }, CLINICOS_APAC).ok === false);
}

/* 5. sobrevive ao logout — e o mesmo caminho duravel do cadastro */
{
  const M = ambiente();
  M.salvar("apac", "Holter", { procedimento: "HOLTER" }, CLINICOS_APAC);
  ok("gravou no armazenamento duravel", M.listar("apac").length === 1);
}

/* 6. renomear modulo nao perde os modelos do medico */
{
  const M = ambiente();
  M.salvar("apac-itauna", "Holter", { procedimento: "HOLTER" }, CLINICOS_APAC);
  ok("migrou pelo id novo", M.migrarId("apac-itauna", "apac") === 1);
  ok("chegou no id novo", M.listar("apac").length === 1 && M.listar("apac-itauna").length === 0);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
