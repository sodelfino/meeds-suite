#!/usr/bin/env node
/**
 * tests/padrao-laudos.test.js — o que entra ligado, o que entra
 * desligado, e o que ficou guardado (v2.49.0, pedido de 26/09/2026)
 *
 *  - APAC: tirada do pacote (o Meeds tem gerador nativo), mas GUARDADA
 *    em "_modulosEmStandby" — nao excluida.
 *  - Laudo de Sete Lagoas e de Conceicao: DESLIGADOS na primeira
 *    instalacao; o resto ligado.
 *  - Quem JA usava o Assistente nao perde os laudos na atualizacao.
 *
 * Uso:  node tests/padrao-laudos.test.js
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

const manifest = JSON.parse(fs.readFileSync(path.join(RAIZ, "manifest.json"), "utf8"));
const ids = manifest.modulos.map((m) => m.id);
const ficha = (id) => manifest.modulos.find((m) => m.id === id);

/* 1. APAC guardada, nao excluida. */
ok("APAC fora do pacote", ids.indexOf("apac") === -1);
const apacGuardada = (manifest._modulosEmStandby.modulos || []).find((m) => m.id === "apac");
ok("APAC guardada em _modulosEmStandby, com o motivo", !!apacGuardada && /nativo/.test(apacGuardada.motivoStandby || ""));
ok("o código da APAC continua no repositório", fs.existsSync(path.join(RAIZ, "modules/apac/index.js")));
ok("e o arquivo diz que só volta com pedido explícito",
   /SO VOLTA COM PEDIDO CLARO E EXPLICITO/.test(fs.readFileSync(path.join(RAIZ, "modules/apac/index.js"), "utf8").slice(0, 1500)));
ok("os dados da APAC continuam no repositório", fs.existsSync(path.join(RAIZ, "dados/apac.json")));

/* 2. Padrao de primeira instalacao. */
ok("Laudo — Sete Lagoas entra DESLIGADO", ficha("lme-sete-lagoas").padraoHabilitado === false);
ok("Laudo — Conceição entra DESLIGADO", ficha("cmd").padraoHabilitado === false);
const ligados = manifest.modulos.filter((m) => m.padraoHabilitado !== false).map((m) => m.id);
ok("todo o resto entra LIGADO", ligados.sort().join() ===
   ["alarme-fila", "avisos-municipio", "cid10", "exames", "preview-pdf", "remume"].sort().join(), ligados.join(", "));

/* 3. Quem ja usava nao perde os laudos. */
const ctx = { console: { log() {}, warn() {}, debug() {} }, JSON, String, Object, Array, RegExp, Promise,
  fetch: () => Promise.resolve(null) };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, "core/dom-reader.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, "core/core.user.js"), "utf8"), ctx);
const preservar = ctx.MeedsSuite._preservarLaudosDeQuemJaUsava;

function storage(inicial) {
  const d = JSON.parse(JSON.stringify(inicial || {}));
  return { d, ler: (k, p) => (k in d ? d[k] : p), gravar: (k, v) => { d[k] = v; } };
}

{
  const s = storage();
  preservar(s, false);
  ok("instalação nova: não liga nenhum laudo", !s.d.modulos);
  preservar(s, true); // proxima abertura: boas-vindas ja vistas
  ok("instalação nova, na 2ª abertura: continua sem ligar (não vira 'quem já usava')", !s.d.modulos);
}
{
  const s = storage();
  preservar(s, true);
  ok("quem já usava e nunca mexeu: os dois laudos continuam ligados",
     s.d.modulos && s.d.modulos["lme-sete-lagoas"] === true && s.d.modulos.cmd === true);
}
{
  const s = storage({ modulos: { "lme-sete-lagoas": false, remume: false } });
  preservar(s, true);
  ok("quem já usava e desligou Sete Lagoas: continua desligado", s.d.modulos["lme-sete-lagoas"] === false);
  ok("e o que ele nunca mexeu (Conceição) continua ligado", s.d.modulos.cmd === true);
  ok("e as outras escolhas dele ficam intactas", s.d.modulos.remume === false);
}
{
  const s = storage();
  preservar(s, true);
  s.d.modulos.cmd = false; // o medico desliga depois
  ok("roda uma vez só: não religa o que o médico desligou depois", preservar(s, true) === false && s.d.modulos.cmd === false);
}

/* 4. Boas-vindas. */
const diag = fs.readFileSync(path.join(RAIZ, "core/diagnostico.js"), "utf8");
ok("boas-vindas: jornada de atendimento", /apoiar você na jornada de/.test(diag) && /atendimento<\/b>/.test(diag));
ok("boas-vindas: aponta a engrenagem e as funções", /⚙️ engrenagem/.test(diag) && /Conhecer as funções/.test(diag) && /abrir\("funcoes"\)/.test(diag));

console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
if (falhas) process.exit(1);
