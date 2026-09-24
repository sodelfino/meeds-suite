#!/usr/bin/env node
/**
 * tests/rotulo-parentesco.test.js — "Nome da Mãe" virou "Parentesco" no v2
 *
 * CONFIRMADO em 22/09/2026 por relatório real da sonda (sonda-meeds-v2.user.js
 * rodado pelo usuário contra des-doctor-calltech.meeds.com.br): o cartão do
 * paciente não tem mais o leaf "Nome da Mãe" — o rótulo agora é "Parentesco".
 * Este teste prova, com o motor real de leitura (core/dom-reader.js) e um DOM
 * simulado no formato reportado pela sonda, que lerPaciente() ainda consegue
 * achar o valor.
 *
 * Uso:  node tests/rotulo-parentesco.test.js
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

// DOM mínimo: replica o padrão "span.rotulo + div.valor" dentro de
// div.min-w-0 com exatamente 2 filhos, como reportado pela sonda.
class FakeEl {
  constructor(tag, texto, filhos) {
    this.tagName = tag;
    this._texto = texto || "";
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
    var irmaos = this.parentElement.children;
    var i = irmaos.indexOf(this);
    return i >= 0 && i + 1 < irmaos.length ? irmaos[i + 1] : null;
  }
  get previousElementSibling() {
    if (!this.parentElement) return null;
    var irmaos = this.parentElement.children;
    var i = irmaos.indexOf(this);
    return i > 0 ? irmaos[i - 1] : null;
  }
  querySelectorAll() {
    // varredura recursiva simples o bastante para coletarFolhas()
    var out = [];
    function visita(el) {
      out.push(el);
      el.children.forEach(visita);
    }
    this.children.forEach(visita);
    return out;
  }
}

const rotuloParentesco = new FakeEl("span", "Parentesco", []);
const valorMae = new FakeEl("div", "Maria da Silva", []); // "folha=false" na sonda: div, nao span — mas ainda 1 texto direto aqui
const grupoParentesco = new FakeEl("div", "", [rotuloParentesco, valorMae]); // pai com 2 filhos, como reportado

const bodyFake = new FakeEl("body", "", [grupoParentesco]);

const ctx = {
  console,
  JSON,
  String,
  Object,
  Array,
  RegExp,
  document: {
    querySelectorAll: function (sel) {
      return sel === "body *" ? bodyFake.querySelectorAll() : [];
    },
    body: { innerText: "" },
  },
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, "core/dom-reader.js"), "utf8"), ctx);

const valor = ctx.MeedsSuiteDom.lerValorPorRotulo(ctx.MeedsSuiteDom.VARIANTES.mae);
ok('lerValorPorRotulo acha o valor ao lado de "Parentesco"', valor === "Maria da Silva", valor);

const variantes = ctx.MeedsSuiteDom.VARIANTES.mae.map(ctx.MeedsSuiteDom.normalizarTexto);
ok('"Parentesco" está cadastrado nas variantes de mae', variantes.indexOf("parentesco") !== -1);
ok("variantes antigas do v1 continuam cadastradas (nada foi removido)",
   variantes.indexOf(ctx.MeedsSuiteDom.normalizarTexto("Nome da Mãe")) !== -1);

console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
if (falhas) process.exit(1);
