const fs = require("fs");
const vm = require("vm");

function novoAmbiente(comGM, localInicial) {
  const gm = new Map();
  const ls = new Map(Object.entries(localInicial || {}));
  const ctx = {
    localStorage: {
      getItem: (k) => (ls.has(k) ? ls.get(k) : null),
      setItem: (k, v) => ls.set(k, String(v)),
      removeItem: (k) => ls.delete(k),
      clear: () => ls.clear(),
    },
    console,
    _gm: gm, _ls: ls,
  };
  if (comGM) {
    ctx.GM_getValue = (k, d) => (gm.has(k) ? gm.get(k) : d);
    ctx.GM_setValue = (k, v) => gm.set(k, JSON.parse(JSON.stringify(v)));
    ctx.GM_deleteValue = (k) => gm.delete(k);
  }
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("core/storage.js", "utf8"), ctx);
  return ctx;
}

let falhas = 0;
function ok(nome, cond) {
  console.log((cond ? "  PASSA  " : "  FALHA  ") + nome);
  if (!cond) falhas++;
}

/* 1. cenario do usuario: escolhe, faz logout (site limpa localStorage), volta */
{
  const c = novoAmbiente(true, {});
  const nucleo = c.MeedsSuiteStorage.storageDoNucleo();
  nucleo.gravar("modulos", { remume: false, cid10: false, cmd: true });
  c.localStorage.clear();                       // <- o logout do Meeds
  const depois = nucleo.ler("modulos", {});
  ok("preferencia sobrevive ao logout", depois.remume === false && depois.cid10 === false && depois.cmd === true);
  ok("nada ficou no localStorage do site", c._ls.size === 0);
}

/* 2. migracao: quem ja tinha preferencia no localStorage nao perde */
{
  const antigo = { "meeds-suite:_core:modulos": JSON.stringify({ remume: false }) };
  const c = novoAmbiente(true, antigo);
  const nucleo = c.MeedsSuiteStorage.storageDoNucleo();
  const lido = nucleo.ler("modulos", {});
  ok("le a preferencia antiga do localStorage", lido.remume === false);
  ok("copiou para o duravel", c._gm.has("meeds-suite:_core:modulos"));
  ok("removeu a copia antiga", !c._ls.has("meeds-suite:_core:modulos"));
  c.localStorage.clear();
  ok("e agora sobrevive ao logout", nucleo.ler("modulos", {}).remume === false);
}

/* 3. sem GM (Safari/iPad): nao pode quebrar, so nao e duravel */
{
  const c = novoAmbiente(false, {});
  const nucleo = c.MeedsSuiteStorage.storageDoNucleo();
  ok("grava sem GM", nucleo.gravar("modulos", { cid10: false }) === true);
  ok("le sem GM", nucleo.ler("modulos", {}).cid10 === false);
  c.localStorage.clear();
  ok("sem GM volta ao padrao (limitacao conhecida)", Object.keys(nucleo.ler("modulos", {})).length === 0);
}

/* 4. remover apaga das duas pontas */
{
  const c = novoAmbiente(true, {});
  const s = c.MeedsSuiteStorage.criarStorage("alarme-fila");
  s.gravar("config", { volume: 0.3 });
  s.remover("config");
  ok("remover devolve o padrao", s.ler("config", "PADRAO") === "PADRAO");
  ok("remover nao deixa fantasma", !c._ls.has("meeds-suite:alarme-fila:config"));
}

/* 5. lerConfig continua aplicando padroes por cima */
{
  const c = novoAmbiente(true, {});
  const s = c.MeedsSuiteStorage.criarStorage("alarme-fila");
  s.gravarConfig({ volume: 0.3 });
  c.localStorage.clear();
  const cfg = s.lerConfig({ volume: 1, som: "sino" });
  ok("lerConfig mantem o salvo", cfg.volume === 0.3);
  ok("lerConfig completa o que falta", cfg.som === "sino");
}

/* 6. modulos nao colidem */
{
  const c = novoAmbiente(true, {});
  const a = c.MeedsSuiteStorage.criarStorage("apac-itauna");
  const b = c.MeedsSuiteStorage.criarStorage("cmd");
  a.gravar("x", 1); b.gravar("x", 2);
  ok("namespaces isolados", a.ler("x") === 1 && b.ler("x") === 2);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
