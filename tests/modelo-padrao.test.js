/* ------------------------------------------------------------------
 * tests/modelo-padrao.test.js — "Usar sempre" nao pode travar o gerador
 * ------------------------------------------------------------------
 * O QUE ACONTECEU (v2.28.1 a v2.43.3): um commit de texto da tela de
 * modelos apagou campoFoiPreenchido() e formularioClinicoVazio() dos
 * tres geradores, mas deixou a chamada em aplicarModeloPadraoSeVazio().
 * Quem tinha marcado um modelo com "★ Usar sempre" clicava na APAC, no
 * CMD ou no laudo de Sete Lagoas e a janela simplesmente nao abria — o
 * ReferenceError acontecia antes de overlay.abrir(), sem nenhum aviso.
 *
 * Os testes de core/modelos.js nao pegaram porque a funcao que sumiu
 * mora nos modulos, e nenhum teste carregava os modulos.
 *
 * Este teste roda as funcoes DE VERDADE, recortadas do fonte de cada
 * modulo, contra um formulario falso. Garante duas coisas:
 *   1. elas existem nos tres geradores (a regressao exata);
 *   2. a regra continua certa: um <select> que nasce com valor so conta
 *      como preenchido se o medico o mudou (ver docs/TESTES.md, 169-170).
 * ------------------------------------------------------------------ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");

let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs !== undefined ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}

/* Recorta "function nome(...) { ... }" contando chaves. As funcoes
 * recortadas aqui nao tem chave dentro de string, entao basta. */
function extrairFuncao(fonte, nome) {
  const i = fonte.indexOf("function " + nome + "(");
  if (i < 0) return null;
  const abre = fonte.indexOf("{", i);
  let prof = 0;
  for (let k = abre; k < fonte.length; k++) {
    if (fonte[k] === "{") prof++;
    else if (fonte[k] === "}") {
      prof--;
      if (prof === 0) return fonte.slice(i, k + 1);
    }
  }
  return null;
}

function select(valor, opcoes) {
  return { tagName: "SELECT", value: valor, options: opcoes.map((v) => ({ value: v })) };
}
function texto(valor) {
  return { tagName: "INPUT", value: valor };
}

/* Para cada gerador: um <select> que nasce com valor e um campo de texto
 * clinico, os dois da propria lista CAMPOS_DO_MODELO do modulo. */
const GERADORES = {
  apac: { sel: "apac-eco-variante-sel", opcoes: ["REPOUSO", "ESTRESSE"], texto: "apac-obs" },
  cmd: { sel: "cmd-origem-sel", opcoes: ["UBS CENTRO", "UBS RURAL"], texto: "cmd-justificativa" },
  "lme-sete-lagoas": { sel: "lme-origem-sel", opcoes: ["UNIDADE 1", "UNIDADE 2"], texto: "lme-justificativa" },
};

for (const [id, g] of Object.entries(GERADORES)) {
  console.log("\n" + id);
  const fonte = fs.readFileSync(path.join(RAIZ, "modules", id, "index.js"), "utf8");

  const vazio = extrairFuncao(fonte, "formularioClinicoVazio");
  const preenchido = extrairFuncao(fonte, "campoFoiPreenchido");
  const procedimento = extrairFuncao(fonte, "procedimentoDoModelo");
  const lista = (fonte.match(/var CAMPOS_DO_MODELO = \[[\s\S]*?\];/) || [])[0];

  ok("formularioClinicoVazio() existe", !!vazio);
  ok("campoFoiPreenchido() existe", !!preenchido);
  ok("quem chama formularioClinicoVazio() e o gerador que a define",
     !/formularioClinicoVazio\(\)/.test(fonte) || !!vazio);
  if (!vazio || !preenchido || !procedimento || !lista) continue;

  ok("o select de teste esta na lista de campos clinicos", lista.includes('"' + g.sel + '"'));
  ok("o campo de texto de teste esta na lista de campos clinicos", lista.includes('"' + g.texto + '"'));

  function rodar(campos, procedimentoAtivo) {
    const ctx = {
      procedimentoAtivo: procedimentoAtivo || null,
      shadow: { getElementById: (x) => campos[x] || null },
    };
    vm.createContext(ctx);
    vm.runInContext([lista, procedimento, preenchido, vazio, "formularioClinicoVazio();"].join("\n"), ctx);
    return vm.runInContext("formularioClinicoVazio()", ctx);
  }

  ok("formulario sem nada: vazio — o modelo padrao entra", rodar({}) === true);
  ok("select ainda no valor com que nasceu: continua vazio",
     rodar({ [g.sel]: select(g.opcoes[0], g.opcoes) }) === true);
  ok("select que o medico mudou: nao esta vazio",
     rodar({ [g.sel]: select(g.opcoes[1], g.opcoes) }) === false);
  ok("texto clinico escrito: nao esta vazio — nunca sobrescreve o medico",
     rodar({ [g.texto]: texto("Paciente com dor precordial.") }) === false);
  if (id === "apac") {
    ok("procedimento escolhido no grid: nao esta vazio", rodar({}, "HOLTER") === false);
  }
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
