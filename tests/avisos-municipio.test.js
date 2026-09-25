#!/usr/bin/env node
/**
 * tests/avisos-municipio.test.js — aviso de regras por municipio
 *
 * Pedido de 25/09/2026: quando o atendimento for de Barbacena ou de Franco
 * da Rocha, o medico ve sozinho o que a teleconsulta resolve e o que tem
 * que ir para o presencial. SO DENTRO do atendimento: na fila, no painel
 * ou em qualquer outra tela o aviso nao aparece.
 *
 * Uso:  node tests/avisos-municipio.test.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
const DADOS = JSON.parse(fs.readFileSync(path.join(RAIZ, "dados/avisos-municipio.json"), "utf8"));

let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs !== undefined ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}

const ID = "e4d04000-1d1f-4520-a413-e41511f1c68a";
const URL_API = "https://doctor-calltech.meeds.com.br/bff/api/v1/atendimento/" + ID;

function carregar() {
  let definicao = null;
  const avisos = [];
  const ctx = {
    console: { debug() {}, warn() {}, log() {} },
    setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval() {},
    JSON, Object, Array, String, RegExp,
    Date: { now: () => ctx.relogio },
    relogio: 1000000,
    location: { pathname: "/pronto-atendimento" },
    MEEDS_AVISOS_MUNICIPIO: DADOS,
    MeedsSuite: { registerModule: (d) => { definicao = d; } },
    MeedsSuiteDecisao: { unicoOuNada: (l) => (l.length === 1 ? l[0] : null) },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "core/dom-reader.js"), "utf8"), ctx);
  ctx.MeedsSuiteDom.textoDaPaginaNormalizado = () => ctx.textoDaPagina || "";
  /* O campo "Vinculos" do cartao do paciente, como a tela o mostraria. */
  ctx.MeedsSuiteDom.lerValorPorRotulo = (v) => (/v[ií]nculo/i.test(String(v)) ? ctx.vinculo || null : null);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "core/municipio.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "modules/avisos-municipio/index.js"), "utf8"), ctx);

  definicao.start({
    dock: {
      criarAviso(spec) {
        const a = { spec, visivel: true, fechar() { a.visivel = false; }, estaVisivel() { return a.visivel; } };
        avisos.push(a);
        return a;
      },
    },
  });

  return {
    ctx, def: definicao, avisos,
    visiveis: () => avisos.filter((a) => a.visivel),
    ir(p) { ctx.location.pathname = p; definicao._verificar(); },
    tela(vinculo, textoDaPagina) {
      ctx.vinculo = vinculo; ctx.textoDaPagina = textoDaPagina;
      definicao._verificar();          // pagina apareceu
      ctx.relogio += 3100;             // passou a espera pela rede
      definicao._verificar();
    },
    passar(ms) { ctx.relogio += ms; definicao._verificar(); },
    rede(json, url) {
      definicao.aoCargaRede({ url: url || URL_API, status: 200, json: () => json });
    },
  };
}

const atendimentoDe = (razao) => ({ id: ID, cliente: { razaoSocialNome: razao } });

/* 1. Barbacena, dentro do atendimento: aparece, com o conteudo pedido. */
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE BARBACENA"));
  const v = t.visiveis();
  ok("Barbacena dentro do atendimento: o aviso aparece", v.length === 1, v.length);
  const texto = v.length ? [v[0].spec.titulo].concat(v[0].spec.corpo).join("\n") : "";
  ok("o titulo diz Barbacena (UPA)", /Barbacena \(UPA\)/.test(texto));
  ok("lista o que pode (VO, IM, atestado)", /Medicação VO/.test(texto) && /Medicação IM/.test(texto) && /Atestado com critério/.test(texto));
  ok("lista o que nao pode e o que fazer", /Medicação EV.*presencial/.test(texto) && /Exames.*presencial/.test(texto));
  ok("nao some sozinho (sem autoFecharMs)", v.length && !v[0].spec.autoFecharMs);

  t.ir("/pronto-atendimento");
  ok("saiu do atendimento: o aviso some", t.visiveis().length === 0);

  t.ir("/atendimento/" + ID);
  ok("voltou ao mesmo atendimento: o aviso volta", t.visiveis().length === 1);
}

/* 2. Franco da Rocha, inclusive com "Prefeitura do Municipio de". */
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("PREFEITURA DO MUNICIPIO DE FRANCO DA ROCHA"));
  const v = t.visiveis();
  const texto = v.length ? [v[0].spec.titulo].concat(v[0].spec.corpo).join("\n") : "";
  ok("Franco da Rocha: o aviso aparece", v.length === 1);
  ok("lista medicação para domicílio e casos eletivos para UBS",
     /Medicação para domicílio/.test(texto) && /eletivos.*UBS/.test(texto));
  ok("EV, IM e VO na unidade vão ao presencial", /EV, IM e VO na unidade.*presencial/.test(texto));
}

/* 3. Fora do atendimento nunca aparece, mesmo sabendo o municipio. */
{
  const t = carregar();
  t.ir("/pronto-atendimento");
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE BARBACENA"));
  ok("na fila (Pronto Atendimento) o aviso NAO aparece", t.visiveis().length === 0);
  t.ir("/dashboard");
  ok("no painel inicial tambem nao", t.visiveis().length === 0);
}

/* 4. Municipio sem regra: nada. */
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE ITAUNA"));
  ok("municipio sem regra cadastrada: nenhum aviso", t.visiveis().length === 0);
}

/* 5. Atendimento de outro paciente nao herda o aviso do anterior. */
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE BARBACENA"));
  const OUTRO = "aaaaaaaa-1111-2222-3333-444444444444";
  t.ir("/atendimento/" + OUTRO);
  ok("abriu outro atendimento (municipio ainda desconhecido): o aviso de Barbacena some",
     t.visiveis().length === 0);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE ITAUNA"), URL_API.replace(ID, OUTRO));
  ok("e o outro, de Itaúna, continua sem aviso", t.visiveis().length === 0);
}

/* 6. Fechou no X: nao reaparece no mesmo atendimento. */
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE BARBACENA"));
  t.visiveis()[0].fechar();
  t.ir("/atendimento/" + ID);
  ok("o medico fechou: nao reabre no mesmo atendimento", t.visiveis().length === 0);
  t.ir("/pronto-atendimento");
  t.ir("/atendimento/" + ID);
  ok("nem ao sair e voltar para ele", t.visiveis().length === 0);
}

/* 7. stop() fecha o que estiver aberto. */
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE BARBACENA"));
  t.def.stop();
  ok("desligar o modulo fecha o aviso", t.avisos.every((a) => !a.visivel));
}


/* ==================================================================
 * QA DE REGRESSAO — o aviso NUNCA abre fora do atendimento nem para
 * outro municipio. Casos tirados das gravacoes reais de 24/09/2026.
 * ================================================================== */

/* 8. Todas as telas que nao sao um atendimento aberto. */
{
  const t = carregar();
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE BARBACENA"));
  t.ctx.vinculo = "PREFEITURA MUNICIPAL DE BARBACENA";
  const fora = [
    "/", "/dashboard", "/pronto-atendimento", "/pronto-atendimento?tab=waiting",
    "/atendimento", "/atendimento/", "/atendimentos", "/historico",
    "/pacientes/" + ID, "/agenda/" + ID, "/meus-atendimentos/" + ID,
    "/atendimento/nao-e-um-id",
  ];
  const abriram = fora.filter((p) => { t.ir(p); return t.visiveis().length > 0; });
  ok("nenhuma tela fora do atendimento abre o aviso (" + fora.length + " telas)", abriram.length === 0, abriram.join(", "));
}

/* 9. Atendimento de OUTRO municipio, com Barbacena aparecendo na tela.
 *    Gravacao de 24/09: atendimento de Macae e, na mesma tela, um aviso de
 *    fila "PREFEITURA MUNICIPAL DE BARBACENA — 2 aguardando". */
{
  const t = carregar();
  t.ctx.textoDaPagina = "prefeitura municipal de macae ... novo paciente na fila prefeitura municipal de barbacena 2 aguardando";
  t.ctx.vinculo = "PREFEITURA MUNICIPAL DE MACAÉCENTRO DE SAUDE MOACYR SANTOS";
  t.ir("/atendimento/" + ID);
  ok("sem rede, vínculo Macaé e 'Barbacena' em outro canto da tela: nenhum aviso", t.visiveis().length === 0);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE MACAÉ"));
  ok("com rede dizendo Macaé: nenhum aviso", t.visiveis().length === 0);
}

/* 10. A rede decide: se ela disse "outro municipio", a tela nao desempata. */
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE ITAUNA"));
  t.tela("PREFEITURA MUNICIPAL DE BARBACENA");
  ok("rede disse Itaúna, vínculo diz Barbacena: vale a rede, nenhum aviso", t.visiveis().length === 0);
}

/* 11. Paciente vinculado a DUAS prefeituras: nao ha como saber qual e a
 *     do atendimento, entao sem rede nao mostra. */
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.tela("PREFEITURA MUNICIPAL DE BARBACENAUBS CENTROPREFEITURA MUNICIPAL DE MACAÉ");
  ok("vínculo com duas prefeituras (uma é Barbacena): nenhum aviso", t.visiveis().length === 0);
  t.tela("PREFEITURA MUNICIPAL DE BARBACENAPREFEITURA DO MUNICIPIO DE FRANCO DA ROCHA");
  ok("vínculo com Barbacena E Franco: nenhum aviso", t.visiveis().length === 0);
}

/* 12. Nomes parecidos nao passam por Barbacena/Franco. */
{
  const parecidos = [
    "CONSORCIO INTERMUNICIPAL DA REGIAO DE BARBACENA",
    "HOSPITAL REGIONAL DE BARBACENA",
    "PREFEITURA MUNICIPAL DE FRANCISCO MORATO",
    "PREFEITURA MUNICIPAL DE CAIEIRAS",
  ];
  const abriram = parecidos.filter((nome) => {
    const t = carregar();
    t.ir("/atendimento/" + ID);
    t.rede(atendimentoDe(nome));
    return t.visiveis().length > 0;
  });
  ok("instituições e cidades parecidas não abrem aviso", abriram.length === 0, abriram.join(" | "));
}

/* 13. Caminho do Safari no iPad (sem rede): so o vínculo, e dá certo. */
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.tela("PREFEITURA MUNICIPAL DE BARBACENAUPA BARBACENA");
  ok("sem rede, vínculo único Barbacena: aviso de Barbacena", t.visiveis().length === 1 && /Barbacena/.test(t.visiveis()[0].spec.titulo));
}
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.tela("PREFEITURA DO MUNICIPIO DE FRANCO DA ROCHA");
  ok("sem rede, vínculo único Franco da Rocha: aviso de Franco", t.visiveis().length === 1 && /Franco da Rocha/.test(t.visiveis()[0].spec.titulo));
}

/* 14. Nunca dois cartoes: chamadas repetidas do mesmo atendimento. */
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  for (let i = 0; i < 5; i++) t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE BARBACENA"));
  t.ir("/atendimento/" + ID);
  ok("5 respostas do mesmo atendimento: um cartão só", t.avisos.length === 1, t.avisos.length);
}

/* 15. Atendimento A (Barbacena) -> B (Franco): troca o cartao. */
{
  const t = carregar();
  const B = "bbbbbbbb-1111-2222-3333-444444444444";
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE BARBACENA"));
  t.ir("/atendimento/" + B);
  t.rede(atendimentoDe("PREFEITURA DO MUNICIPIO DE FRANCO DA ROCHA"), URL_API.replace(ID, B));
  const v = t.visiveis();
  ok("de Barbacena para Franco: um cartão só, e é o de Franco", v.length === 1 && /Franco/.test(v[0].spec.titulo));
}

/* 16. ACHADO NO QA NO NAVEGADOR (25/09): atendimento de Macae com vinculo
 *     mostrando Barbacena. A tela abria o cartao de Barbacena e a rede,
 *     chegando depois com "Macae", nao o fechava. */
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.ctx.vinculo = "PREFEITURA MUNICIPAL DE BARBACENA";
  t.passar(500);
  ok("antes da espera pela rede, a tela sozinha não abre cartão", t.visiveis().length === 0);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE MACAÉ"));
  t.passar(5000);
  ok("rede chegou dizendo Macaé: nenhum cartão, nem depois da espera", t.visiveis().length === 0);
}
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.tela("PREFEITURA MUNICIPAL DE BARBACENA");
  ok("(rede atrasada) a tela abriu Barbacena", t.visiveis().length === 1);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE MACAÉ"));
  ok("a rede chegou atrasada dizendo Macaé: o cartão de Barbacena fecha", t.visiveis().length === 0);
  t.passar(1000);
  ok("e não reabre", t.visiveis().length === 0);
}

console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
if (falhas) process.exit(1);
