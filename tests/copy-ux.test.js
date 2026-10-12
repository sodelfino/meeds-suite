#!/usr/bin/env node
/**
 * tests/copy-ux.test.js — regras de UX writing (D68)
 *
 * 1. O diálogo de confirmação (core/confirmar.js) só executa a ação quando o
 *    médico confirma; Esc e "manter" não executam; o foco inicial é o botão
 *    seguro; e o botão que confirma nomeia a ação.
 * 2. Varredura estática: nenhum confirm() nativo fora do próprio diálogo e
 *    nenhum rótulo de botão genérico ("OK", "Sim", "Limpar", "Apagar"...).
 *
 * Uso:  node tests/copy-ux.test.js
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

/* ---------- 1. comportamento ---------- */
function elemento() {
  const ouvintes = {};
  return {
    textContent: "", focado: false, ouvintes,
    addEventListener(t, f) { (ouvintes[t] = ouvintes[t] || []).push(f); },
    focus() { this.focado = true; },
    dispara(t, ev) { (ouvintes[t] || []).forEach((f) => f(ev || {})); },
  };
}
function montar(comDock) {
  const ctx = { console };
  ctx.window = ctx; ctx.globalThis = ctx;
  const nativo = { chamadas: 0, resposta: false };
  ctx.confirm = () => { nativo.chamadas++; return nativo.resposta; };
  const els = { "#msc-titulo": elemento(), "#msc-texto": elemento(), "#msc-confirmar": elemento(), "#msc-manter": elemento() };
  const raizEl = elemento();
  const estado = { aberto: false, aberturas: 0 };
  if (comDock) {
    ctx.MeedsSuiteDock = {
      criarOverlay: () => ({
        elemento: raizEl,
        $: (s) => els[s],
        abrir: () => { estado.aberto = true; estado.aberturas++; },
        fechar: () => { estado.aberto = false; },
      }),
    };
  }
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "core/confirmar.js"), "utf8"), ctx);
  return { C: ctx.MeedsSuiteConfirmar, els, raizEl, estado, nativo };
}

{
  const t = montar(true);
  let rodou = 0;
  t.C.apagarModelo("Rotina", () => { rodou++; });
  ok("abre o diálogo e ainda não executa a ação", t.estado.aberto && rodou === 0);
  ok("título diz o que vai acontecer (nomeia o modelo)", /Apagar o modelo .Rotina.\?/.test(t.els["#msc-titulo"].textContent), t.els["#msc-titulo"].textContent);
  ok("texto descreve a consequência", /não pode ser desfeito/.test(t.els["#msc-texto"].textContent));
  ok("botões nomeiam a ação (nunca OK/Cancelar)", t.els["#msc-confirmar"].textContent === "Apagar modelo" && t.els["#msc-manter"].textContent === "Manter modelo");
  ok("foco inicial no botão seguro (manter)", t.els["#msc-manter"].focado === true && t.els["#msc-confirmar"].focado === false);
  t.els["#msc-manter"].dispara("click");
  ok("'manter' fecha e NÃO executa", !t.estado.aberto && rodou === 0);
  t.C.apagarModelo("Rotina", () => { rodou++; });
  t.raizEl.dispara("keydown", { key: "Escape", stopPropagation() {} });
  ok("Esc fecha e NÃO executa", !t.estado.aberto && rodou === 0);
  t.C.apagarModelo("Rotina", () => { rodou++; });
  t.els["#msc-confirmar"].dispara("click");
  ok("confirmar executa a ação exatamente uma vez e fecha", rodou === 1 && !t.estado.aberto);
  t.els["#msc-confirmar"].dispara("click");
  ok("clicar de novo sem nova pergunta não repete a ação", rodou === 1);
  t.C.limparCampos(() => { rodou++; });
  ok("limpar campos: rótulos 'Limpar campos' / 'Manter campos'", t.els["#msc-confirmar"].textContent === "Limpar campos" && t.els["#msc-manter"].textContent === "Manter campos");
  t.els["#msc-manter"].dispara("click");
  t.C.apagarHistorico(() => {});
  ok("histórico: 'Apagar histórico' / 'Manter histórico'", t.els["#msc-confirmar"].textContent === "Apagar histórico" && t.els["#msc-manter"].textContent === "Manter histórico");
  t.els["#msc-manter"].dispara("click");
  t.C.removerCadastro("médico", "Dra. Ana", () => {});
  ok("remover médico nomeia a pessoa e o botão", /Remover .Dra\. Ana. do cadastro\?/.test(t.els["#msc-titulo"].textContent) && t.els["#msc-confirmar"].textContent === "Remover médico");
  t.els["#msc-manter"].dispara("click");
  t.C.removerCadastro("unidade", "ESF Aroeira", () => {});
  ok("remover unidade: 'Remover unidade' / 'Manter unidade'", t.els["#msc-confirmar"].textContent === "Remover unidade" && t.els["#msc-manter"].textContent === "Manter unidade");
}
{
  const t = montar(false);
  let rodou = 0;
  t.nativo.resposta = false;
  t.C.apagarModelo("X", () => { rodou++; });
  ok("sem o dock: cai no confirm() nativo e respeita o 'não'", t.nativo.chamadas === 1 && rodou === 0);
  t.nativo.resposta = true;
  t.C.apagarModelo("X", () => { rodou++; });
  ok("sem o dock: executa só se o nativo confirmar", rodou === 1);
}

/* ---------- 2. varredura estática ---------- */
function arquivos(dir, acc) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "assets") arquivos(p, acc); }
    else if (e.name.endsWith(".js")) acc.push(p);
  });
  return acc;
}
const FONTES = arquivos(path.join(RAIZ, "core"), []).concat(arquivos(path.join(RAIZ, "modules"), []))
  .filter((p) => !/modules\/_template/.test(p));
const usoNativo = [];
const rotulosRuins = [];
const PROIBIDOS = ["OK", "Ok", "Sim", "Não", "Cancelar", "Limpar", "Apagar", "Remover", "remover", "Voltar", "Próximo", "Entendi", "Copiar"];
FONTES.forEach((p) => {
  const s = fs.readFileSync(p, "utf8");
  const rel = path.relative(RAIZ, p);
  if (rel !== "core/confirmar.js" && /\b(raiz|window)\.confirm\(|[^.\w]confirm\(/.test(s)) usoNativo.push(rel);
  const re = /<button[^>]*>([^<]{1,40})<\/button>/g;
  let m;
  while ((m = re.exec(s))) {
    const rotulo = m[1].trim();
    if (PROIBIDOS.indexOf(rotulo) !== -1 && !(rel === "modules/avisos-municipio/index.js") && !(rel === "modules/exames/index.js" && rotulo === "Copiar")) {
      rotulosRuins.push(rel + ": “" + rotulo + "”");
    }
  }
});
ok("nenhum confirm() nativo fora de core/confirmar.js", usoNativo.length === 0, usoNativo.join(", "));
ok("nenhum botão com rótulo genérico (OK, Limpar, Apagar, Voltar, Próximo...)", rotulosRuins.length === 0, rotulosRuins.join("; "));
const GERAR = FONTES.filter((p) => /Gerar PDF"|>Gerar PDF</.test(fs.readFileSync(p, "utf8")));
ok("mesma ação, mesmo nome: 'Gerar PDF' não aparece mais", GERAR.length === 0, GERAR.map((p) => path.relative(RAIZ, p)).join(", "));

console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
if (falhas) process.exit(1);
