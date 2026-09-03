/* ------------------------------------------------------------------
 * tests/apac-municipio.test.js
 * ------------------------------------------------------------------
 * A APAC deixou de ser "de Itauna" e passou a servir varios municipios
 * (ver D27 em docs/ARQUITETURA.md). O risco que este teste existe para
 * impedir e um so, e ele e grave: emitir uma APAC com o CNES do
 * estabelecimento de OUTRA cidade. Um laudo assim e devolvido pela
 * regulacao e o paciente perde a vaga.
 *
 * Por isso o que se prova aqui e a SEPARACAO: o estabelecimento de
 * Itauna nunca aparece quando o municipio e Betim, e vice-versa.
 * ------------------------------------------------------------------ */
const fs = require("fs");
const vm = require("vm");

let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}

/* Ambiente minimo: cadastro.js so precisa de storage e console. */
function ambiente() {
  const gm = new Map();
  const ctx = {
    console, setTimeout, setImmediate, clearTimeout, Promise, JSON,
    GM_getValue: (k, d) => (gm.has(k) ? gm.get(k) : d),
    GM_setValue: (k, v) => gm.set(k, JSON.parse(JSON.stringify(v))),
    GM_deleteValue: (k) => gm.delete(k),
    localStorage: (() => {
      const m = new Map();
      return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
        clear: () => m.clear(),
        get length() { return m.size; },
        key: (i) => [...m.keys()][i],
      };
    })(),
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  ctx.document = { body: { innerText: "" }, querySelectorAll: () => [], querySelector: () => null };
  vm.runInContext(fs.readFileSync("core/storage.js", "utf8"), ctx);
  vm.runInContext(fs.readFileSync("core/dom-reader.js", "utf8"), ctx);
  vm.runInContext(fs.readFileSync("core/decision-engine.js", "utf8"), ctx);
  vm.runInContext(fs.readFileSync("core/cadastro.js", "utf8"), ctx);
  vm.runInContext(fs.readFileSync("core/municipio.js", "utf8"), ctx);
  return ctx;
}

/* 1. os dados: cada municipio existe e o catalogo clinico e comum */
{
  const dados = JSON.parse(fs.readFileSync("dados/apac.json", "utf8"));
  const nomes = Object.keys(dados.municipios);
  ok("apac.json tem municipios", nomes.length >= 1, nomes.join(", "));
  ok("catalogo clinico fica em _comum, nao duplicado por municipio",
     !!dados._comum.procedimentos && nomes.every((n) => !dados.municipios[n].procedimentos));
  ok("Itauna manteve o CNES 2105578",
     (dados.municipios["Itaúna"].estabelecimentos || []).some((e) => e.cnes === "2105578"));
  nomes.forEach(function (n) {
    (dados.municipios[n].estabelecimentos || []).forEach(function (e) {
      ok("CNES de " + n + " tem 7 digitos", /^\d{7}$/.test(e.cnes), e.nome + " = " + e.cnes);
    });
  });
}

/* 2. o que importa: estabelecimento nao vaza de um municipio para outro */
{
  const c = ambiente();
  const C = c.MeedsSuiteCadastro;
  C.adicionarEstabelecimento({ nome: "CEM OVIDIO NOGUEIRA", cnes: "2105578", municipio: "Itaúna" });
  C.adicionarEstabelecimento({ nome: "POLICLINICA DE BETIM", cnes: "2118203", municipio: "Betim" });

  const emItauna = C.listarEstabelecimentosDe("Itaúna");
  const emBetim = C.listarEstabelecimentosDe("Betim");
  ok("Itauna ve so o seu", emItauna.length === 1 && emItauna[0].cnes === "2105578",
     emItauna.map((e) => e.cnes).join(","));
  ok("Betim ve so o seu", emBetim.length === 1 && emBetim[0].cnes === "2118203",
     emBetim.map((e) => e.cnes).join(","));
  ok("CNES de Itauna NAO aparece em Betim", !emBetim.some((e) => e.cnes === "2105578"));
  ok("municipio sem cadastro vem vazio", C.listarEstabelecimentosDe("Sete Lagoas").length === 0);
  ok("sem municipio, lista tudo (compatibilidade)", C.listarEstabelecimentosDe().length === 2);
}

/* 3. quem ja usava a versao antiga tinha estabelecimento sem municipio:
 *    ele precisa continuar visivel, senao o medico "perde" o cadastro. */
{
  const c = ambiente();
  const C = c.MeedsSuiteCadastro;
  C.adicionarEstabelecimento({ nome: "CADASTRADO ANTES DA MUDANCA", cnes: "1234567" });
  ok("estabelecimento antigo (sem municipio) aparece em qualquer municipio",
     C.listarEstabelecimentosDe("Betim").some((e) => e.cnes === "1234567"));
}

/* 4. semeadura e por municipio: semear Itauna nao semeia Betim */
{
  const c = ambiente();
  const C = c.MeedsSuiteCadastro;
  C.semearEstabelecimentos([{ nome: "CEM OVIDIO", cnes: "2105578" }], "Itaúna");
  C.semearEstabelecimentos([{ nome: "CEM OVIDIO", cnes: "2105578" }], "Itaúna"); // 2a vez nao duplica
  ok("semeia uma vez so", C.listarEstabelecimentosDe("Itaúna").length === 1,
     C.listarEstabelecimentosDe("Itaúna").length + " item(ns)");
  ok("semear Itauna nao criou nada em Betim",
     !C.listarEstabelecimentosDe("Betim").some((e) => e.cnes === "2105578"));
}

/* 5. deteccao: o municipio vem do CLIENTE do atendimento (a prefeitura
 *    contratante, campo cliente.razaoSocialNome). Acerta o conhecido e,
 *    na duvida, NAO chuta: escolher a cidade errada sem o medico
 *    perceber seria pior que nao detectar nada. */
{
  const c = ambiente();
  const M = c.MeedsSuiteMunicipio;
  const conhecidos = ["Itaúna", "Betim", "Sete Lagoas"];
  const cli = (nome) => ({ cliente: { razaoSocialNome: nome } });

  ok("acha Itauna com acento", M.detectar(cli("Itaúna"), conhecidos) === "Itaúna");
  ok("acha Itauna sem acento e em caixa alta", M.detectar(cli("ITAUNA"), conhecidos) === "Itaúna");
  ok("acha apesar do prefixo institucional",
     M.detectar(cli("PREFEITURA MUNICIPAL DE SETE LAGOAS"), conhecidos) === "Sete Lagoas");
  ok("le tambem pelo clienteId na lista de clientes",
     M.detectar({ clienteId: 7, clientes: [{ id: 3, razaoSocialNome: "Betim" }, { id: 7, razaoSocialNome: "Itaúna" }] },
                conhecidos) === "Itaúna");
  ok("cidade de fora nao vira nenhuma das conhecidas",
     M.detectar(cli("PREFEITURA MUNICIPAL DE DIVINOPOLIS"), conhecidos) === null);
  ok("atendimento vazio devolve null", M.detectar({}, conhecidos) === null);
  ok("sem lista de conhecidos devolve null", M.detectar(cli("Itaúna"), []) === null);
}

/* 6. quem vinha da versao anterior tinha o estabelecimento salvo SEM
 *    municipio. Se ficasse assim, ele apareceria na lista de Betim — e o
 *    CNES de Itauna sairia numa APAC de Betim. A migracao preenche o
 *    municipio pelo CNES, que e unico e esta em dados/apac.json. */
{
  const c = ambiente();
  const C = c.MeedsSuiteCadastro;
  const dados = JSON.parse(fs.readFileSync("dados/apac.json", "utf8"));
  const mapa = {};
  Object.keys(dados.municipios).forEach((cidade) => {
    (dados.municipios[cidade].estabelecimentos || []).forEach((e) => { mapa[e.cnes] = cidade; });
  });

  C.adicionarEstabelecimento({ nome: "CEM OVIDIO NOGUEIRA", cnes: "2105578" });   // legado
  C.adicionarEstabelecimento({ nome: "CLINICA PARTICULAR", cnes: "9999999" });    // fora da tabela

  const mudou = C.preencherMunicipioPeloCnes(mapa);
  ok("carimbou so o estabelecimento conhecido", mudou === 1, mudou + " alterado(s)");
  ok("legado de Itauna agora some de Betim",
     !C.listarEstabelecimentosDe("Betim").some((e) => e.cnes === "2105578"));
  ok("e continua visivel em Itauna",
     C.listarEstabelecimentosDe("Itaúna").some((e) => e.cnes === "2105578"));
  ok("estabelecimento fora da tabela fica como estava (visivel em todo lugar)",
     C.listarEstabelecimentosDe("Betim").some((e) => e.cnes === "9999999"));
  ok("rodar de novo nao muda nada", C.preencherMunicipioPeloCnes(mapa) === 0);
}

/* 7. a armadilha do Number(""), que este QA pegou tres vezes seguidas.
 *    O select guarda o INDICE como texto e o placeholder vale "".
 *    Number("") nao e NaN: e 0. Ou seja, "nenhum escolhido" era lido
 *    como "o primeiro da lista" — e o CNES da primeira unidade do
 *    municipio ia para o PDF sem o medico ter escolhido nada.
 *    O modulo le a escolha so por estabelecimentoDaVez(); aqui fica a
 *    regra dele, para ninguem reintroduzir o Number() cru. */
{
  const lista = [{ nome: "SAÚDE AUDITIVA", cnes: "6977073" },
                 { nome: "UBS CIDADE DE DEUS", cnes: "2209241" }];
  const escolhido = (valorDoSelect) =>
    (/^\d+$/.test(valorDoSelect) ? lista[Number(valorDoSelect)] : null) || null;

  ok('placeholder "" NAO e o indice 0', escolhido("") === null);
  ok('"__cadastrar" nao e escolha', escolhido("__cadastrar") === null);
  ok("indice 0 e a primeira", escolhido("0") === lista[0]);
  ok("indice 1 e a segunda", escolhido("1") === lista[1]);
  ok("indice fora da lista devolve null", escolhido("9") === null);
  ok("Number(\"\") continua sendo 0 — e por isso que o teste de digito existe",
     Number("") === 0);
}

/* 8. backup e restauracao levam as UNIDADES, nao so os medicos.
 *    As unidades semeadas voltam sozinhas na maquina nova; a que o
 *    medico cadastrou a mao — justamente a que nao esta na lista — so
 *    existe no navegador dele, e era a unica coisa que o backup nao
 *    salvava. */
{
  const origem = ambiente();
  origem.MeedsSuiteCadastro.adicionar({ nome: "DRA FULANA", cpf: "529.982.247-25", crm: "MG-1" });
  origem.MeedsSuiteCadastro.adicionarEstabelecimento(
    { nome: "UNIDADE QUE SO ELE TEM", cnes: "1111111", municipio: "Betim" });
  const arquivo = origem.MeedsSuiteCadastro.exportar();
  ok("backup leva a unidade cadastrada a mao", arquivo.indexOf("1111111") !== -1);

  const destino = ambiente();               // a "maquina nova"
  const r = destino.MeedsSuiteCadastro.importar(arquivo);
  ok("restaurou o medico", r.ok && r.quantidade === 1, JSON.stringify(r));
  ok("restaurou a unidade", r.unidades === 1);
  ok("a unidade chegou no municipio certo",
     destino.MeedsSuiteCadastro.listarEstabelecimentosDe("Betim").some((e) => e.cnes === "1111111"));
  ok("e nao vazou para outro municipio",
     !destino.MeedsSuiteCadastro.listarEstabelecimentosDe("Itaúna").some((e) => e.cnes === "1111111"));

  /* Backup antigo (so medicos) tem que continuar valendo. */
  const antigo = JSON.stringify({ medicos: [{ nome: "DR SICRANO", cpf: "", crm: "" }] });
  const r2 = ambiente().MeedsSuiteCadastro.importar(antigo);
  ok("backup antigo, sem unidades, continua importando", r2.ok && r2.quantidade === 1, JSON.stringify(r2));
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
