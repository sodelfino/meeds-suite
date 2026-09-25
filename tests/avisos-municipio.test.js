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
  /* O mesmo campo, linha a linha (prefeitura em cima, unidade embaixo). */
  ctx.MeedsSuiteDom.lerLinhasPorRotulo = (v) => (/v[ií]nculo/i.test(String(v)) ? ctx.linhas || (ctx.vinculo ? [ctx.vinculo] : null) : null);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "core/municipio.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "modules/avisos-municipio/index.js"), "utf8"), ctx);

  definicao.start({
    dock: {
      criarAviso(spec) {
        const a = { spec, visivel: true, fechar() { a.visivel = false; }, estaVisivel() { return a.visivel; },
          atualizar(novo) { a.spec = Object.assign({}, a.spec, novo); } };
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
  ok("vem com destaque de atenção (âmbar, pulsa 3x)", v.length && v[0].spec.destaque === "atencao");

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

/* 17. ACHADO EM PRODUCAO (Jam 379c57a1, 25/09): o atendimento de Barbacena
 *     chegou pela rede sem a prefeitura nos caminhos conhecidos, e o aviso
 *     nao abriu embora o "Vinculos" dissesse BARBACENA. */
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede({ id: ID, status: 3, paciente: { nome: "X" } });
  t.tela("PREFEITURA MUNICIPAL DE BARBACENAUPA BARBACENA");
  ok("rede sem prefeitura + vínculo Barbacena: o aviso de Barbacena abre", t.visiveis().length === 1 && /Barbacena/.test(t.visiveis()[0].spec.titulo));
}
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede({ id: ID });
  t.tela("PREFEITURA MUNICIPAL DE MACAÉ");
  ok("rede sem prefeitura + vínculo Macaé: nenhum aviso", t.visiveis().length === 0);
}

/* 18. Abre na LATERAL SUPERIOR (acima dos botoes), pulsando; "Entendi"
 *     para a pulsacao e o cartao fica ali; o X fecha. */
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE BARBACENA"));
  const a = t.visiveis()[0];
  ok("abre na lateral superior, pulsando (não no meio da tela)", a && a.spec.topo === true && !a.spec.centro && a.spec.destaque === "atencao");
  const entendi = a && (a.spec.acoes || []).find((x) => x.rotulo === "Entendi");
  ok("tem o botão Entendi, que não fecha o cartão", !!entendi && entendi.fecha === false);
  entendi.aoClicar();
  ok("Entendi: continua na lateral superior, âmbar e parado", a.spec.topo === true && a.spec.destaque === "atencao-calmo" && t.visiveis().length === 1);
  t.ir("/atendimento/" + ID);
  ok("e continua lá (não é tratado como dispensado)", t.visiveis().length === 1 && t.avisos.length === 1);
}

/* ==================================================================
 * UNIDADE (pedido de 25/09/2026): regras por unidade de Macae e regra
 * do municipio de Congonhas.
 * ================================================================== */
const PMM = "PREFEITURA MUNICIPAL DE MACAÉ";
function macae(linhas, opts) {
  const t = carregar();
  t.ctx.linhas = linhas;
  t.ir("/atendimento/" + ID);
  if (!opts || opts.rede !== false) t.rede(atendimentoDe(PMM));
  t.passar(3100);
  return t;
}
const textoDe = (a) => [a.spec.titulo].concat(a.spec.corpo).join("\n");

[
  ["UPA UNIDADE DE PRONTO ATENDIMENTO BARRA", "UPA Barra"],
  ["UPA UNIDADE DE PRONTO ATENDIMENTO LAGOMAR", "UPA Lagomar"],
  ["PRONTO SOCORRO MUNICIPAL IMBETIBA", "Imbetiba"],
  ["PRONTO SOCORRO PARQUE AEROPORTO", "Parque Aeroporto"],
].forEach(([unidade, rotulo]) => {
  const t = macae([PMM, unidade]);
  const v = t.visiveis();
  ok("Macaé, " + rotulo + ": aviso de encaminhamento → UBS", v.length === 1 && v[0].spec.titulo.indexOf(rotulo) !== -1 &&
     /Encaminhamento para especialidades.*UBS mais próxima/.test(textoDe(v[0])));
});
{
  const t = macae([PMM, "Casa da Criança e do Adolescente"]);
  const v = t.visiveis();
  ok("Macaé, Casa da Criança (com acento, caixa mista): orientações", v.length === 1 &&
     /A unidade oferta atendimentos/.test(textoDe(v[0])) && /neuropsicólogo nem psicopedagogo/.test(textoDe(v[0])));
}
{
  const t = macae([PMM, "CLINICA DO AUTISTA"]);
  const v = t.visiveis();
  ok("Macaé, Clínica do Autista: orientações", v.length === 1 && /psiquiatria infantil/.test(textoDe(v[0])) && /grupo de apoio/.test(textoDe(v[0])));
}
{
  const t = macae([PMM, "CENTRO DE SAUDE MOACYR SANTOS"]);
  ok("Macaé, unidade SEM regra (Moacyr Santos): nenhum aviso", t.visiveis().length === 0);
}
{
  const t = macae([PMM, "UPA UNIDADE DE PRONTO ATENDIMENTO BARRA DE SAO JOAO"]);
  ok("nome parecido (…BARRA DE SÃO JOÃO) não casa com UPA Barra", t.visiveis().length === 0);
}
{
  const t = macae([PMM]);
  ok("Macaé sem unidade no vínculo: nenhum aviso", t.visiveis().length === 0);
}
{
  const t = macae([PMM, "UPA UNIDADE DE PRONTO ATENDIMENTO BARRA", "PRONTO SOCORRO MUNICIPAL IMBETIBA"]);
  ok("duas unidades com regra no vínculo: não decide, nenhum aviso", t.visiveis().length === 0);
}
{
  /* Rede diz Macae, mas o vinculo e de OUTRA prefeitura com uma "UPA
   * BARRA": a unidade nao pertence ao municipio do atendimento. */
  const t = macae(["PREFEITURA MUNICIPAL DE BARBACENA", "UPA UNIDADE DE PRONTO ATENDIMENTO BARRA"]);
  ok("unidade listada, mas no vínculo de outra prefeitura: nenhum aviso de Macaé", t.visiveis().length === 0);
}
{
  /* Sem rede (iPad): Macae pelo vinculo e a unidade pela linha de baixo. */
  const t = carregar();
  t.ctx.vinculo = PMM + "UPA UNIDADE DE PRONTO ATENDIMENTO LAGOMAR";
  t.ctx.linhas = [PMM, "UPA UNIDADE DE PRONTO ATENDIMENTO LAGOMAR"];
  t.ir("/atendimento/" + ID);
  t.passar(3100);
  const v = t.visiveis();
  ok("sem rede: Macaé + UPA Lagomar pelo vínculo", v.length === 1 && /Lagomar/.test(v[0].spec.titulo));
}
{
  /* A unidade chega na tela DEPOIS da rede: o cartao aparece quando ela chega. */
  const t = macae(null);
  ok("rede disse Macaé, unidade ainda não na tela: nada ainda", t.visiveis().length === 0);
  t.ctx.linhas = [PMM, "PRONTO SOCORRO PARQUE AEROPORTO"];
  t.passar(1000);
  ok("a unidade apareceu: o cartão abre", t.visiveis().length === 1 && /Parque Aeroporto/.test(t.visiveis()[0].spec.titulo));
  t.passar(1000);
  ok("e não abre outro a cada segundo", t.avisos.length === 1);
}
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE CONGONHAS"));
  const v = t.visiveis();
  ok("Congonhas: sempre mostra a orientação dos exames da UPA", v.length === 1 &&
     /Congonhas/.test(v[0].spec.titulo) && /pedidos juntos/.test(textoDe(v[0])) && /pedido separado/.test(textoDe(v[0])));
}
{
  const t = macae([PMM, "UPA UNIDADE DE PRONTO ATENDIMENTO BARRA"]);
  t.ir("/pronto-atendimento");
  ok("unidade de Macaé também não abre fora do atendimento", t.visiveis().length === 0);
}

/* 19. Textos REAIS dos Jams de 25/09 (6bcd8fd5 e 3fb8ec6e). */
{
  const t = macae(["PREFEITURA MUNICIPAL DE MACAE", "UPA UNIDADE DE PRONTO ATENDIMENTO BARRA"]);
  ok("Jam real: 'MACAE' sem acento + UPA Barra", t.visiveis().length === 1 && /UPA Barra/.test(t.visiveis()[0].spec.titulo));
}
{
  const t = macae(["PREFEITURA MUNICIPAL DE MACAEUPA UNIDADE DE PRONTO ATENDIMENTO BARRA"]);
  ok("as duas linhas grudadas numa só: ainda acha a UPA Barra", t.visiveis().length === 1 && /UPA Barra/.test(t.visiveis()[0].spec.titulo));
}
{
  const t = macae(["PREFEITURA MUNICIPAL DE MACAEUPA UNIDADE DE PRONTO ATENDIMENTO BARRA DE SAO JOAO"]);
  ok("grudado com nome parecido: continua não casando", t.visiveis().length === 0);
}
{
  const t = carregar();
  t.ctx.linhas = ["PREFEITURA MUNICIPAL DE CONGONHAS", "PSF IDEAL"];
  t.ctx.vinculo = "PREFEITURA MUNICIPAL DE CONGONHASPSF IDEAL";
  t.ir("/atendimento/" + ID);
  t.passar(3100);
  ok("Jam real: Congonhas + PSF IDEAL, sem rede: aviso de Congonhas", t.visiveis().length === 1 && /Congonhas/.test(t.visiveis()[0].spec.titulo));
}

/* 20. FORMATO NOVO DE CLIENTE (25/09): "MACAÉ - RJ" em vez de
 *     "PREFEITURA MUNICIPAL DE MACAÉ", com a unidade embaixo. */
{
  /* O print enviado: Vinculos = "MACAÉ - RJ" / "CLINICA DO AUTISTA", sem rede. */
  const t = carregar();
  t.ctx.linhas = ["MACAÉ - RJ", "CLINICA DO AUTISTA"];
  t.ir("/atendimento/" + ID);
  t.passar(3100);
  const v = t.visiveis();
  ok("print de 25/09 (MACAÉ - RJ / CLINICA DO AUTISTA), sem rede: aviso da Clínica do Autista",
     v.length === 1 && /Clínica do Autista/.test(v[0].spec.titulo));
}
{
  const t = carregar();
  t.ctx.linhas = ["MACAÉ - RJ", "UPA UNIDADE DE PRONTO ATENDIMENTO BARRA"];
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("MACAÉ - RJ"));
  ok("rede 'MACAÉ - RJ' + UPA Barra: aviso da UPA Barra", t.visiveis().length === 1 && /UPA Barra/.test(t.visiveis()[0].spec.titulo));
}
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("BARBACENA - MG"));
  ok("rede 'BARBACENA - MG': aviso de Barbacena", t.visiveis().length === 1 && /Barbacena/.test(t.visiveis()[0].spec.titulo));
}
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("FRANCO DA ROCHA - SP"));
  ok("rede 'FRANCO DA ROCHA - SP': aviso de Franco", t.visiveis().length === 1 && /Franco/.test(t.visiveis()[0].spec.titulo));
}
{
  const t = carregar();
  t.ctx.linhas = ["CONGONHAS - MG", "PSF IDEAL"];
  t.ir("/atendimento/" + ID);
  t.passar(3100);
  ok("vínculo 'CONGONHAS - MG / PSF IDEAL', sem rede: aviso de Congonhas", t.visiveis().length === 1 && /Congonhas/.test(t.visiveis()[0].spec.titulo));
}
{
  /* Rede no formato novo dizendo Macae; vinculo mostra Barbacena: a rede vence. */
  const t = carregar();
  t.ctx.linhas = ["BARBACENA - MG", "UPA BARBACENA"];
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("MACAÉ - RJ"));
  t.passar(5000);
  ok("rede 'MACAÉ - RJ' e vínculo Barbacena: nenhum aviso (nem de Barbacena, nem de unidade)", t.visiveis().length === 0);
}
{
  const t = carregar();
  t.ctx.linhas = ["MACAÉ - RJ", "BARBACENA - MG"];
  t.ir("/atendimento/" + ID);
  t.passar(3100);
  ok("vínculo com duas cidades no formato novo, sem rede: nenhum aviso", t.visiveis().length === 0);
}
{
  const t = carregar();
  t.ctx.linhas = ["MARICÁ - RJ", "UPA UNIDADE DE PRONTO ATENDIMENTO BARRA"];
  t.ir("/atendimento/" + ID);
  t.passar(3100);
  ok("cidade sem regra com unidade de nome igual ao de Macaé: nenhum aviso", t.visiveis().length === 0);
}

/* 21. Textos revisados (25/09): sem público-alvo; o destaque da Casa da
 *     Criança vem primeiro; Piraí. */
{
  const t = macae([PMM, "CASA DA CRIANCA E DO ADOLESCENTE"]);
  const v = t.visiveis();
  const corpo = v.length ? v[0].spec.corpo : [];
  ok("Casa da Criança: sem público-alvo", v.length === 1 && !/Público-alvo/.test(corpo.join("\n")));
  ok("Casa da Criança: o que o município NÃO oferta vem em destaque, primeiro", /^❌ O município não oferta neuropsicólogo nem psicopedagogo$/.test(corpo[0] || ""));
  ok("Casa da Criança: 'a unidade oferta atendimentos de…' e o fluxo", /A unidade oferta atendimentos de fonoaudiologia/.test(corpo.join("\n")) && /Fluxo: presencial/.test(corpo.join("\n")));
}
{
  const t = macae([PMM, "CLINICA DO AUTISTA"]);
  const v = t.visiveis();
  ok("Clínica do Autista: sem público-alvo, com atendimentos e fluxo", v.length === 1 && !/Público-alvo/.test(textoDe(v[0])) && /psiquiatria infantil/.test(textoDe(v[0])));
}
[["PREFEITURA MUNICIPAL DE PIRAÍ", "formato antigo"], ["PIRAÍ - RJ", "formato novo"]].forEach(([nome, rot]) => {
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe(nome));
  const v = t.visiveis();
  ok("Piraí (" + rot + "): aviso da regulação para o Rio e dos encaminhamentos detalhados", v.length === 1 &&
     /Piraí \(RJ\)/.test(v[0].spec.titulo) && /SISREG/.test(textoDe(v[0])) && /classificação de risco/.test(textoDe(v[0])));
});
{
  const t = carregar();
  t.ctx.linhas = ["PIRAÍ - RJ", "UBS QUALQUER"];
  t.ir("/pronto-atendimento");
  t.rede(atendimentoDe("PIRAÍ - RJ"));
  ok("Piraí também não abre fora do atendimento", t.visiveis().length === 0);
}

console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
if (falhas) process.exit(1);
