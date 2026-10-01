#!/usr/bin/env node
/**
 * tests/leitura-paciente-cartao.test.js — nome e sexo pelo rótulo "Paciente"
 *
 * Achado em produção por print real (30/09/2026, atendimento de Macaé,
 * enviado pelo usuário): o cartão do paciente no Meeds novo mostra, sob o
 * rótulo "Paciente", o NOME numa linha e "Masculino"/"Feminino" na linha de
 * baixo — mesmo valor, duas linhas. O textContent cru gruda as duas
 * ("DARA ARRUDA MAGALHÃESFeminino"), o mesmo problema já resolvido para
 * "Vínculos" (prefeitura/unidade) e "Documentos" (CPF/CNS).
 *
 * Isso quebrava DOIS campos ao mesmo tempo:
 *   - sexo: lerPorTextoExato(["Masculino","Feminino"]) exige um leaf cujo
 *     texto seja EXATAMENTE "Feminino" — se "Feminino" estiver colado com
 *     o nome no mesmo leaf, nunca bate.
 *   - nome: lerAnteriorAoPadrao(RX_IDADE) pega o irmão anterior ao texto
 *     "NN anos e MM meses" — que agora fica sob "Data de Nascimento", não
 *     mais ao lado do nome. O vizinho virou "18/05/2000" (começa com
 *     dígito, rejeitado pela guarda), e o nome nunca é lido.
 *
 * Este teste prova, com o motor real (core/dom-reader.js), que
 * lerPaciente() lê os dois certo nesse layout, e que as duas leituras
 * antigas continuam valendo como PLANO B noutra tela sem o rótulo
 * "Paciente" nesse formato.
 *
 * Uso:  node tests/leitura-paciente-cartao.test.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");

let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs !== undefined ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}

class FakeEl {
  constructor(tag, texto, filhos, innerText) {
    this.tagName = tag;
    this._texto = texto || "";
    this.innerText = innerText;
    this.children = filhos || [];
    this.children.forEach((f) => (f.parentElement = this));
    this.parentElement = null;
  }
  get textContent() {
    if (this._texto) return this._texto;
    return this.children.map((f) => f.textContent).join("");
  }
  get nextElementSibling() {
    if (!this.parentElement) return null;
    const irmaos = this.parentElement.children;
    const i = irmaos.indexOf(this);
    return i >= 0 && i + 1 < irmaos.length ? irmaos[i + 1] : null;
  }
  get previousElementSibling() {
    if (!this.parentElement) return null;
    const irmaos = this.parentElement.children;
    const i = irmaos.indexOf(this);
    return i > 0 ? irmaos[i - 1] : null;
  }
  querySelectorAll() {
    const out = [];
    function visita(el) {
      out.push(el);
      el.children.forEach(visita);
    }
    this.children.forEach(visita);
    return out;
  }
}

function carregarDom(bodyFake) {
  const ctx = {
    console, JSON, String, Object, Array, RegExp,
    document: {
      querySelectorAll: (sel) => (sel === "body *" ? bodyFake.querySelectorAll() : []),
      body: { innerText: "" },
    },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "core/dom-reader.js"), "utf8"), ctx);
  return ctx.MeedsSuiteDom;
}

/* Cenário real do print: "Paciente" com nome + "Feminino" colados (mesmo
 * padrão de "Vínculos" e "Documentos" — innerText separa em linhas,
 * textContent gruda). */
{
  const rotulo = new FakeEl("span", "Paciente", []);
  const valor = new FakeEl("div", "DARA ARRUDA MAGALHÃESFeminino", [], "DARA ARRUDA MAGALHÃES\nFeminino");
  const grupo = new FakeEl("div", "", [rotulo, valor]);
  const anoFake = new FakeEl("span", "26 anos e 4 meses", []);
  const dataFake = new FakeEl("span", "18/05/2000", []);
  const grupoData = new FakeEl("div", "", [dataFake, anoFake]); // "Data de Nascimento": data e idade juntas, SEM o nome do paciente do lado
  const bodyFake = new FakeEl("body", "", [grupo, grupoData]);
  const Dom = carregarDom(bodyFake);

  const p = Dom.lerPaciente();
  ok("lê o nome certo (não '18/05/2000', que é o vizinho da idade agora)", p.nome === "DARA ARRUDA MAGALHÃES", p.nome);
  ok("lê o sexo certo (Feminino → F)", p.sexo === "F", p.sexo);
}

/* Caso masculino, mesma estrutura — confere que não ficou hard-coded pro feminino. */
{
  const rotulo = new FakeEl("span", "Paciente", []);
  const valor = new FakeEl("div", "JOÃO DA SILVAMasculino", [], "JOÃO DA SILVA\nMasculino");
  const grupo = new FakeEl("div", "", [rotulo, valor]);
  const bodyFake = new FakeEl("body", "", [grupo]);
  const Dom = carregarDom(bodyFake);

  const p = Dom.lerPaciente();
  ok("masculino: nome certo", p.nome === "JOÃO DA SILVA", p.nome);
  ok("masculino: sexo certo (Masculino → M)", p.sexo === "M", p.sexo);
}

/* PLANO B: tela SEM o rótulo "Paciente" nesse formato (ex.: layout antigo,
 * já coberto pelos testes existentes) — nome pela idade, sexo pelo texto
 * isolado na tela, do jeito que já funcionava antes deste pedido. */
{
  const nomeAntigo = new FakeEl("div", "MARIA DOS SANTOS", []);
  const idadeAntiga = new FakeEl("div", "40 anos", []);
  const sexoIsolado = new FakeEl("div", "Feminino", []);
  const grupoNome = new FakeEl("div", "", [nomeAntigo, idadeAntiga]);
  const bodyFake = new FakeEl("body", "", [grupoNome, sexoIsolado]);
  const Dom = carregarDom(bodyFake);

  const p = Dom.lerPaciente();
  ok("sem rótulo 'Paciente': nome ainda vem pela idade (plano B)", p.nome === "MARIA DOS SANTOS", p.nome);
  ok("sem rótulo 'Paciente': sexo ainda vem do texto isolado (plano B)", p.sexo === "F", p.sexo);
}

console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
if (falhas) process.exit(1);
