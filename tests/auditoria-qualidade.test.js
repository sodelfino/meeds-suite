/* Regressões dos achados de alto risco: executado por npm run verificar. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const vm = require("vm");
const { spawnSync } = require("child_process");
const { parse } = require("espree");
const raiz = path.join(__dirname, "..");
function arquivos(pasta) {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(pasta, e.name);
    return e.isDirectory() ? arquivos(p) : p.endsWith(".js") ? [p] : [];
  });
}
function visitar(n, fn) {
  if (!n || typeof n !== "object") return;
  if (n.type) fn(n);
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) v.forEach((x) => visitar(x, fn));
    else if (v && typeof v === "object") visitar(v, fn);
  }
}
for (const p of [path.join(raiz, "bootloader.user.js"), ...arquivos(path.join(raiz, "core")), ...arquivos(path.join(raiz, "modules"))]) {
  const codigo = fs.readFileSync(p, "utf8");
  visitar(parse(codigo, { ecmaVersion: "latest" }), (n) => {
    if (n.type !== "CallExpression" && n.type !== "NewExpression") return;
    visitar(n.callee, (c) => {
      assert(!(c.type === "Identifier" && /^(eval|Function)$/.test(c.name)), "Execução dinâmica em " + p);
    });
  });
}
console.log("ok: núcleo e todos os módulos, inclusive standby, sem eval/Function");

// Exercita os cinco carregadores reais: ausência da lib rejeita, sem rede;
// presença reutiliza exatamente o objeto já carregado pelo gerenciador.
async function carregadores() {
  for (const id of ["apac", "cmd", "lme-sete-lagoas", "lme-mg", "notificacao"]) {
    const codigo = fs.readFileSync(path.join(raiz, "modules", id, "index.js"), "utf8");
    const lib = id === "apac" ? "JsPDF" : "PdfLib";
    const trecho = codigo.match(new RegExp("  function garantir" + lib + "\\(\\) \\{[\\s\\S]*?\\n  \\}"));
    const resolver = codigo.match(new RegExp("  function resolver" + lib + "\\(\\) \\{[\\s\\S]*?\\n  \\}"));
    assert(trecho, "Carregador ausente: " + id);
    assert(resolver, "Resolvedor ausente: " + id);
    const ctx = { Promise, Error, raiz: {}, window: {} };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(resolver[0] + "\n" + trecho[0], ctx);
    await assert.rejects(ctx["garantir" + lib](), /carregado|carregada/);
    const existente = {};
    if (id === "apac") ctx.jspdf = { jsPDF: existente };
    else ctx.PDFLib = existente;
    assert.strictEqual(await ctx["garantir" + lib](), existente);
  }
  console.log("ok: cinco geradores falham sem executar downloads e reutilizam bibliotecas presentes");
}

async function main() {
  await carregadores();
  const boot = fs.readFileSync(path.join(raiz, "bootloader.user.js"), "utf8");
  const hashes = {
    "jspdf/2.5.1/jspdf.umd.min.js": "qZvrmS2ekKPF2mSznTQsxqPgnpkI4DNTlrdUmTzrDgektczlKNRRhy5X5AAOnx5S09ydFYWWNSfcEqDTTHgtNA==",
    "pdf-lib/1.17.1/pdf-lib.min.js": "z8IYLHO8bTgFqj+yrPyIJnzBDf7DDhWwiEsk4sY+Oe6J2M+WQequeGS7qioI5vT6rXgVRb4K1UVQC5ER7MKzKQ==",
  };
  for (const [arquivo, hash] of Object.entries(hashes)) assert(boot.includes(arquivo + "#sha512=" + hash));
  for (const f of ["bootloader.user.js", "dist/meeds-suite.user.js", "dist/meeds-suite.safari.user.js", "dist/meeds-suite.meta.js", "dist/meeds-suite.safari.meta.js"]) {
    const codigo = fs.readFileSync(path.join(raiz, f), "utf8");
    const metadados = codigo.split("\n").filter((l) => /^\/\/ @(?:updateURL|downloadURL)\s+/.test(l));
    assert.strictEqual(metadados.length, 2, f + ": metadados ausentes");
    for (const linha of metadados) {
      assert(linha.includes("https://github.com/sodelfino/meeds-suite/releases/latest/download/"), f + ": canal incorreto");
    }
  }
  console.log("ok: bibliotecas com hashes fixados; metadados publicados usam releases");

  // O catálogo remoto é texto: conteúdo que parece HTML não pode virar nós.
  const apac = fs.readFileSync(path.join(raiz, "modules/apac/index.js"), "utf8");
  const montar = apac.match(/ {2}function montarProcGrid\(\) \{[\s\S]*?\n {2}\}/);
  assert(montar);
  const criar = () => ({
    filhos: [], appendChild(n) { this.filhos.push(n); }, addEventListener() {},
    set innerHTML(valor) { throw new Error("Catálogo foi interpretado como HTML: " + valor); },
  });
  const grid = criar();
  const entrada = { nome: '<img src=x onerror="alert(1)">', codigo: "<script>código</script>" };
  const ctx = {
    CATALOGO: { TESTE: entrada }, document: { createElement: criar },
    shadow: { getElementById: () => grid }, selecionarProc() {},
  };
  vm.createContext(ctx);
  vm.runInContext(montar[0] + "\nmontarProcGrid();", ctx);
  assert.strictEqual(grid.filhos[0].filhos[0].textContent, entrada.nome);
  assert.strictEqual(grid.filhos[0].filhos[1].textContent, entrada.codigo);
  console.log("ok: nomes e códigos do catálogo da APAC são exibidos como texto");


  const copia = fs.mkdtempSync(path.join(os.tmpdir(), "meeds-build-audit-"));
  try {
    for (const f of ["scripts", "core", "modules", "dados", "manifest.json", "package.json", "seletores.json", "bootloader.user.js"]) {
      fs.cpSync(path.join(raiz, f), path.join(copia, f), { recursive: true });
    }
    for (const arquivo of ["core/log.js", "modules/remume/index.js", "modules/apac/index.js", "modules/remume/assets/fallback.js"]) {
      const p = path.join(copia, arquivo);
      const original = fs.readFileSync(p, "utf8");
      for (const perigo of ["eval('x')", "(0, eval)('x')", "new Function('x')"]) {
        fs.writeFileSync(p, original + "\n" + perigo + ";\n");
        const r = spawnSync(process.execPath, ["scripts/build.js", "--check"], { cwd: copia, encoding: "utf8" });
        assert.notStrictEqual(r.status, 0, "Build aceitou " + perigo + " em " + arquivo);
        assert.match(r.stdout + r.stderr, /execucao de codigo remoto/);
      }
      fs.writeFileSync(p, original);
    }
  } finally {
    fs.rmSync(copia, { recursive: true, force: true });
  }
  console.log("ok: build bloqueia 12 reintroduções de execução dinâmica em núcleo, módulos e assets");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
