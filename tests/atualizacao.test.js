/* Teste do "Verificar atualização" (core/atualizacao.js, D65). */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let falhas = 0;
function confere(ok, msg) {
  console.log((ok ? "  ok   " : "  FALHA ") + msg);
  if (!ok) falhas++;
}

function carregar(extra) {
  const ctx = Object.assign({ console: console, setTimeout: setTimeout, clearTimeout: clearTimeout }, extra || {});
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ["core/novidades.js", "core/atualizacao.js"].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx, { filename: f });
  });
  return ctx.MeedsSuiteAtualizacao;
}

const BASE = "https://raw.githubusercontent.com/sodelfino/meeds-suite/main";
const meta = (v) => "// ==UserScript==\n// @name X\n// @version      " + v + "\n// ==/UserScript==\n";

function com(at, opcoes, texto, motivoFalha) {
  const visto = { url: null, r: null };
  at.verificar(
    Object.assign({ baseRaw: BASE, versaoAtual: "2.59.0" }, opcoes, {
      buscar: function (url, ok, falha) {
        visto.url = url;
        if (motivoFalha) falha(motivoFalha); else ok(texto);
      },
    }),
    function (r) { visto.r = r; }
  );
  return visto;
}

console.log("1. extrairVersao");
const at = carregar();
confere(at.extrairVersao(meta("2.60.1")) === "2.60.1", "lê @version com espaços");
confere(at.extrairVersao("nada") === null, "sem @version → null");
confere(at.extrairVersao(undefined) === null, "undefined → null");

console.log("2. situações");
let v = com(at, {}, meta("2.60.0"));
confere(v.r.situacao === "disponivel" && v.r.versaoNova === "2.60.0", "mais nova → disponivel");
v = com(at, {}, meta("2.59.0"));
confere(v.r.situacao === "atualizado", "igual → atualizado");
v = com(at, {}, meta("2.58.9"));
confere(v.r.situacao === "mais-nova", "publicada menor → mais-nova");
v = com(at, { versaoAtual: "2.9.0" }, meta("2.10.0"));
confere(v.r.situacao === "disponivel", "2.10.0 > 2.9.0 (comparação numérica, não de texto)");
v = com(at, {}, "<html>404</html>");
confere(v.r.situacao === "erro" && v.r.motivo === "resposta inesperada", "corpo sem @version → erro");
v = com(at, {}, null, "sem conexão");
confere(v.r.situacao === "erro" && v.r.motivo === "sem conexão", "falha de rede → erro com motivo");

console.log("3. URLs");
v = com(at, { variante: "tampermonkey" }, meta("2.60.0"));
confere(/\/dist\/meeds-suite\.meta\.js\?t=\d+$/.test(v.url), "consulta o .meta.js com cache-bust");
confere(v.r.urlInstalar === BASE + "/dist/meeds-suite.user.js", "link de instalar é o .user.js SEM query");
v = com(at, { variante: "safari" }, meta("2.60.0"));
confere(v.url.indexOf("/dist/meeds-suite.safari.meta.js?t=") > -1, "Safari consulta o meta do Safari");
confere(v.r.urlInstalar === BASE + "/dist/meeds-suite.safari.user.js", "Safari instala o .safari.user.js");
v = com(at, { baseRaw: BASE + "/" }, meta("2.60.0"));
confere(v.r.urlInstalar.indexOf("main//dist") === -1, "barra final em baseRaw não duplica");

console.log("4. configuração incompleta");
v = com(at, { baseRaw: null }, meta("2.60.0"));
confere(v.r.situacao === "erro" && v.url === null, "sem baseRaw → erro, sem pedir nada");

console.log("5. variante");
confere(carregar().variante() === "safari", "sem GM_getValue → safari");
confere(carregar({ GM_getValue: function () {} }).variante() === "tampermonkey", "com GM_getValue → tampermonkey");

console.log("6. transporte padrão");
(function () {
  let pedido = null;
  const a1 = carregar({
    GM_xmlhttpRequest: function (o) { pedido = o; o.onload({ status: 200, responseText: meta("2.61.0") }); },
  });
  let r = null;
  a1.verificar({ baseRaw: BASE, versaoAtual: "2.59.0" }, function (x) { r = x; });
  confere(pedido && pedido.method === "GET" && r && r.situacao === "disponivel", "usa GM_xmlhttpRequest quando existe");

  const a2 = carregar({
    GM_xmlhttpRequest: function (o) { o.onload({ status: 503, responseText: "" }); },
  });
  a2.verificar({ baseRaw: BASE, versaoAtual: "2.59.0" }, function (x) { r = x; });
  confere(r.situacao === "erro" && r.motivo === "HTTP 503", "HTTP 503 → erro");

  const a3 = carregar({
    fetch: function (u, o) {
      pedido = { u: u, o: o };
      return Promise.resolve({ ok: true, text: () => Promise.resolve(meta("2.59.0")) });
    },
  });
  a3.verificar({ baseRaw: BASE, versaoAtual: "2.59.0" }, function (x) {
    confere(pedido.o.cache === "no-store" && x.situacao === "atualizado", "sem GM: fetch com cache no-store");
    fim();
  });
})();

function fim() {
  if (falhas) { console.log("\n" + falhas + " falha(s)"); process.exit(1); }
  console.log("\ntudo certo");
}
