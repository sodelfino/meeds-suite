#!/usr/bin/env node
/**
 * tests/documentos-cpf.test.js — "CPF" virou "Documentos" (CPF + CNS) no v2
 *
 * Pedido de 29/09/2026: o LME de Sete Lagoas e o de Conceição do Mato Dentro
 * pararam de trazer os dados do paciente sozinhos. Investigando o Jam do
 * usuário (nenhum erro no console, nenhuma chamada de rede diferente),
 * achamos uma lacuna já registrada em docs/MIGRACAO-V2.md (seção 2.2, sonda
 * de 22/09/2026): o cartão do paciente não tem mais o rótulo "CPF" isolado —
 * agora é "Documentos", com CPF e CNS (15 dígitos) lado a lado. Ficou de
 * propósito sem correção até aqui porque ler ingenuamente colaria os dois
 * números, produzindo um CPF errado no laudo — pior que nenhum.
 *
 * Este teste prova, com o motor real (core/dom-reader.js), que
 * lerCpfPorRotulo() separa CPF de CNS quando há separador confiável
 * (pontuação do CPF, espaço ou quebra de linha) e RECUSA decidir quando os
 * dois vêm colados sem separador nenhum.
 *
 * Uso:  node tests/documentos-cpf.test.js
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
    return null;
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

function carregar(rotulo, valorTexto, valorInnerText) {
  const rotuloEl = new FakeEl("span", rotulo, []);
  const valorEl = new FakeEl("div", valorTexto, [], valorInnerText);
  const grupo = new FakeEl("div", "", [rotuloEl, valorEl]);
  const bodyFake = new FakeEl("body", "", [grupo]);
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

const VARIANTES_CPF = ["CPF", "C.P.F.", "CPF do paciente", "Documentos"];

{
  const Dom = carregar("Documentos", "077.353.816-03 704205766783987");
  const cpf = Dom.lerCpfPorRotulo(VARIANTES_CPF);
  ok('"Documentos" com CPF formatado + CNS separado por espaço: extrai só o CPF',
     cpf === "07735381603", cpf);
}

{
  // innerText: CPF e CNS em linhas separadas, como o Vínculos já faz com prefeitura/unidade.
  const Dom = carregar("Documentos", "07735381603704205766783987", "077.353.816-03\n704205766783987");
  const cpf = Dom.lerCpfPorRotulo(VARIANTES_CPF);
  ok("Documentos em duas linhas (innerText): extrai o CPF da linha certa",
     cpf === "07735381603", cpf);
}

{
  // Sem separador nenhum entre CPF e CNS: não há como decidir com segurança — não inventa.
  const Dom = carregar("Documentos", "07735381603704205766783987");
  const cpf = Dom.lerCpfPorRotulo(VARIANTES_CPF);
  ok("CPF e CNS colados sem separador: recusa decidir (nunca corrompe o CPF)",
     cpf === null, cpf);
}

{
  // Só o CNS na tela (paciente sem CPF cadastrado, só CNS): não confunde CNS com CPF.
  const Dom = carregar("Documentos", "704205766783987");
  const cpf = Dom.lerCpfPorRotulo(VARIANTES_CPF);
  ok("só CNS (15 dígitos), sem CPF: não devolve o CNS como se fosse CPF",
     cpf === null, cpf);
}

{
  // Regressão: rótulo "CPF" isolado, sem pontuação — como funcionava antes da mudança do Meeds.
  const Dom = carregar("CPF", "07735381603");
  const cpf = Dom.lerCpfPorRotulo(VARIANTES_CPF);
  ok('rótulo "CPF" isolado, sem pontuação: continua funcionando', cpf === "07735381603", cpf);
}

{
  // Regressão: rótulo "CPF" isolado, com pontuação.
  const Dom = carregar("CPF", "077.353.816-03");
  const cpf = Dom.lerCpfPorRotulo(VARIANTES_CPF);
  ok('rótulo "CPF" isolado, com pontuação: continua funcionando', cpf === "07735381603", cpf);
}

{
  const variantes = VARIANTES_CPF.map((v) => v.toLowerCase());
  ok('"Documentos" está cadastrado nas variantes de cpf', variantes.indexOf("documentos") !== -1);
  ok('"CPF" continua cadastrado (nada foi removido)', variantes.indexOf("cpf") !== -1);
}

console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
if (falhas) process.exit(1);
