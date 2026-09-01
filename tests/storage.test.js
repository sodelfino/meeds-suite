const fs = require("fs");
const vm = require("vm");

/* IndexedDB de mentira: guarda num Map que sobrevive entre "sessoes",
 * que e exatamente o que precisamos provar. So implementa o que
 * core/storage.js usa. */
function fakeIndexedDB(disco) {
  function tx(store) {
    return {
      objectStore: () => ({
        put: (v, k) => disco.set(k, JSON.parse(JSON.stringify(v))),
        delete: (k) => disco.delete(k),
        openCursor: () => {
          const req = {};
          const chaves = [...disco.keys()];
          let i = 0;
          setImmediate(function passo() {
            if (i >= chaves.length) { req.result = null; req.onsuccess && req.onsuccess(); return; }
            const k = chaves[i++];
            req.result = { key: k, value: disco.get(k), continue: () => setImmediate(passo) };
            req.onsuccess && req.onsuccess();
          });
          return req;
        },
      }),
    };
  }
  return {
    open: () => {
      const req = { result: { objectStoreNames: { contains: () => true }, transaction: tx } };
      setImmediate(() => req.onsuccess && req.onsuccess());
      return req;
    },
  };
}

function novoAmbiente(comGM, localInicial, disco) {
  const gm = new Map();
  const ls = new Map(Object.entries(localInicial || {}));
  const ctx = {
    setTimeout, setImmediate, clearTimeout, Promise,
    indexedDB: disco ? fakeIndexedDB(disco) : undefined,
    localStorage: {
      getItem: (k) => (ls.has(k) ? ls.get(k) : null),
      setItem: (k, v) => ls.set(k, String(v)),
      removeItem: (k) => ls.delete(k),
      clear: () => ls.clear(),
      get length() { return ls.size; },
      key: (i) => [...ls.keys()][i],
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

/* Deixa as gravacoes assincronas no banco chegarem ao fim. */
const descansar = () => new Promise((r) => setImmediate(() => setImmediate(r)));

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
  ok("sem GM e sem carregar(): permanece no localStorage", Object.keys(nucleo.ler("modulos", {})).length === 0);
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

/* ---- iPad: sem GM, com IndexedDB ---- */
(async function () {
  /* 7. o cenario do iPad: escolhe, faz logout, volta */
  {
    const disco = new Map();
    let c = novoAmbiente(false, {}, disco);
    await c.MeedsSuiteStorage.carregar();
    c.MeedsSuiteStorage.storageDoNucleo().gravar("modulos", { remume: false, cid10: false });
    c.localStorage.clear();                    // <- o logout do Meeds
    ok("iPad: sobrevive ao logout na mesma sessao",
       c.MeedsSuiteStorage.storageDoNucleo().ler("modulos", {}).remume === false);

    /* nova sessao: outro ambiente, mesmo disco */
    c = novoAmbiente(false, {}, disco);
    await c.MeedsSuiteStorage.carregar();
    const lido = c.MeedsSuiteStorage.storageDoNucleo().ler("modulos", {});
    ok("iPad: sobrevive a fechar e reabrir o Safari", lido.remume === false && lido.cid10 === false);
  }

  /* 8. iPad: migra quem ja tinha preferencia no localStorage */
  {
    const disco = new Map();
    const c = novoAmbiente(false, { "meeds-suite:_core:modulos": JSON.stringify({ cmd: false }) }, disco);
    await c.MeedsSuiteStorage.carregar();
    ok("iPad: migrou do localStorage para o banco", disco.has("meeds-suite:_core:modulos"));
    ok("iPad: nao deixou copia para tras", !c._ls.has("meeds-suite:_core:modulos"));
    c.localStorage.clear();
    ok("iPad: a preferencia migrada sobrevive",
       c.MeedsSuiteStorage.storageDoNucleo().ler("modulos", {}).cmd === false);
  }

  /* 9. sem IndexedDB (navegacao privada): nao pode travar o boot */
  {
    const c = novoAmbiente(false, {}, null);
    let resolveu = false;
    await Promise.race([
      c.MeedsSuiteStorage.carregar().then(() => { resolveu = true; }),
      new Promise((r) => setTimeout(r, 4500)),
    ]);
    ok("sem IndexedDB o boot segue mesmo assim", resolveu);
    ok("e ainda grava (so nao e duravel)",
       c.MeedsSuiteStorage.storageDoNucleo().gravar("modulos", { x: 1 }) === true);
  }

  /* 10. Tampermonkey nao entra no caminho assincrono */
  {
    const c = novoAmbiente(true, {}, new Map());
    await c.MeedsSuiteStorage.carregar();
    const n = c.MeedsSuiteStorage.storageDoNucleo();
    n.gravar("modulos", { apac: false });
    c.localStorage.clear();
    ok("com GM continua sincrono e duravel", n.ler("modulos", {}).apac === false);
  }

  /* ---- camada duravel compartilhada (cadastro, historico, novidades) ---- */

  /* 11. iPad: o CADASTRO sobrevive ao logout. E o dado mais caro de
   *     perder — o medico teria que se recadastrar a cada plantao. */
  {
    const disco = new Map();
    let c = novoAmbiente(false, {}, disco);
    await c.MeedsSuiteStorage.carregar();
    const porta = c.MeedsSuiteStorage.duravel("medicos", "meeds-suite:medicos");
    porta.gravar({ versao: 1, medicos: [{ nome: "FULANA", crm: "123" }] });
    c.localStorage.clear();
    ok("iPad: cadastro sobrevive ao logout", porta.ler(null).medicos[0].crm === "123");

    c = novoAmbiente(false, {}, disco);
    await c.MeedsSuiteStorage.carregar();
    ok("iPad: cadastro sobrevive a reabrir o Safari",
       c.MeedsSuiteStorage.duravel("medicos", "meeds-suite:medicos").ler(null).medicos[0].nome === "FULANA");
  }

  /* 12. promocao na leitura: chave sem prefixo (marca das boas-vindas)
   *     nao e varrida no boot, entao tem que migrar quando for lida. */
  {
    const disco = new Map();
    const c = novoAmbiente(false, { meeds_assistente_boas_vindas_v1: JSON.stringify("concluida") }, disco);
    await c.MeedsSuiteStorage.carregar();
    const porta = c.MeedsSuiteStorage.duravel("meeds_assistente_boas_vindas_v1", "meeds_assistente_boas_vindas_v1");
    ok("le a marca antiga sem prefixo", porta.ler(null) === "concluida");
    /* A gravacao no banco e assincrona de proposito (a leitura seguinte
     * ja e servida da memoria), entao aqui o teste precisa esperar. */
    await descansar();
    ok("e promoveu para o banco na leitura", disco.has("meeds_assistente_boas_vindas_v1"));
    c.localStorage.clear();
    ok("boas-vindas nao reaparecem depois do logout", porta.ler(null) === "concluida");
  }

  /* 13. com GM a camada compartilhada usa a chave PELADA, que e onde o
   *     cadastro dos medicos ja esta hoje. Trocar isso apagaria o
   *     cadastro de quem atualizasse. */
  {
    const c = novoAmbiente(true, {}, new Map());
    await c.MeedsSuiteStorage.carregar();
    c.MeedsSuiteStorage.duravel("medicos", "meeds-suite:medicos").gravar({ x: 1 });
    ok("GM grava na chave sem prefixo", c._gm.has("medicos") && !c._gm.has("meeds-suite:medicos"));
  }

  /* 14. remover apaga das duas pontas tambem na camada compartilhada */
  {
    const disco = new Map();
    const c = novoAmbiente(false, {}, disco);
    await c.MeedsSuiteStorage.carregar();
    const porta = c.MeedsSuiteStorage.duravel("historico:apac", "meeds-suite:historico:apac");
    porta.gravar([1, 2, 3]);
    await descansar();
    porta.remover();
    await descansar();
    ok("remover limpa o banco", !disco.has("meeds-suite:historico:apac"));
    ok("remover devolve o padrao", porta.ler("PADRAO") === "PADRAO");
  }

  console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
  process.exit(falhas ? 1 : 0);
})();
