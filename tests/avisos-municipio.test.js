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

/* Elemento falso do overlay: cada seletor devolve sempre o mesmo stub ate
 * o modulo trocar o innerHTML (como no DOM real: HTML novo, elementos
 * novos). click() dispara "click" e "change", como num checkbox. focus()
 * atualiza o activeElement do shadow root falso (getRootNode()). */
function stub(raizShadow) {
  const ouvintes = {};
  const s = {
    checked: false, disabled: false, hidden: false, textContent: "", focado: false,
    addEventListener(ev, fn) { (ouvintes[ev] = ouvintes[ev] || []).push(fn); },
    click() { ["click", "change"].forEach((ev) => (ouvintes[ev] || []).forEach((fn) => fn({ target: s }))); },
    focus() { s.focado = true; raizShadow.activeElement = s; },
  };
  return s;
}
function overlayFalso(opcoes, overlays) {
  let html = opcoes.html || "";
  let stubs = {};
  const ouvintes = {};
  const raizShadow = { activeElement: null };
  const elemento = {
    get innerHTML() { return html; },
    set innerHTML(v) { html = v; stubs = {}; raizShadow.activeElement = null; },
    addEventListener(ev, fn) { (ouvintes[ev] = ouvintes[ev] || []).push(fn); },
    getRootNode() { return raizShadow; },
    evento(tipo, extra) {
      const e = Object.assign({ evitado: false, preventDefault() { e.evitado = true; }, stopPropagation() {} }, extra);
      (ouvintes[tipo] || []).forEach((fn) => fn(e));
      return e;
    },
    tecla(key, shiftKey) { return elemento.evento("keydown", { key, shiftKey: !!shiftKey }); },
  };
  const o = {
    opcoes, elemento, aberto: false, removido: false, raizShadow,
    $(sel) { return stubs[sel] || (stubs[sel] = stub(raizShadow)); },
    /* Focáveis na ordem do DOM: os stubs que o módulo pediu (ele pede na
     * ordem do rodapé), presentes no HTML e não desabilitados. O próprio
     * .msam-modal não é botão/input: fica de fora, como no seletor real. */
    $$() {
      return Object.keys(stubs).filter((sel) => sel !== ".msam-modal" && html.indexOf(sel.slice(1)) !== -1 && !stubs[sel].disabled)
        .map((sel) => stubs[sel]);
    },
    abrir() { o.aberto = true; },
    fechar() { o.aberto = false; },
    estaAberto() { return o.aberto; },
    remover() { o.aberto = false; o.removido = true; },
  };
  overlays.push(o);
  return o;
}

/* Le o modal aberto como o antigo cartao ({ titulo, corpo }), percorrendo
 * todos os passos e voltando ao primeiro. Cada linha leva a marca do grupo
 * (❌ / ✅ / 📌; o contexto leva 🏥), como o cartao fazia. */
const decodificar = (h) => h.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const MARCA = { naoPode: "❌", pode: "✅", orientacoes: "📌" };
function linhasDoPasso(html) {
  const linhas = [];
  html.replace(/<div class="msam-contexto">([\s\S]*?)<\/div>/g, (_, t) => { linhas.push(decodificar(t).trim()); });
  html.replace(/<li class="msam-(\w+)"><span[^>]*>[^<]*<\/span><div>([\s\S]*?)(?:<em>([\s\S]*?)<\/em>)?<\/div><\/li>/g,
    (_, tipo, t, f) => { linhas.push(MARCA[tipo] + " " + decodificar(t) + (f ? " → " + decodificar(f) : "")); });
  return linhas;
}
function comoAviso(o) {
  const titulo = decodificar((/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(o.elemento.innerHTML) || [])[1] || "");
  const corpo = linhasDoPasso(o.elemento.innerHTML);
  let n = 0;
  for (; n < 10 && /msam-avancar/.test(o.elemento.innerHTML); n++) {
    o.$(".msam-avancar").click();
    corpo.push.apply(corpo, linhasDoPasso(o.elemento.innerHTML));
  }
  while (n-- > 0) o.$(".msam-voltar").click();
  return { o, spec: { titulo, corpo } };
}

function carregar(dados) {
  let definicao = null;
  const avisos = [];
  const overlays = [];
  const ctx = {
    console: { debug() {}, warn() {}, log() {} },
    setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval() {},
    JSON, Object, Array, String, RegExp,
    Date: { now: () => ctx.relogio },
    relogio: 1000000,
    location: { pathname: "/pronto-atendimento" },
    MEEDS_AVISOS_MUNICIPIO: dados || DADOS,
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
  /* Sexo do paciente, como apareceria lido da tela (ctx.sexo: "F", "M" ou
   * undefined/ausente — simula o campo ainda nao ter carregado). */
  ctx.MeedsSuiteDom.lerPaciente = () => ({ sexo: ctx.sexo });
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
      criarOverlay(opcoes) { return overlayFalso(opcoes, overlays); },
    },
  });

  return {
    ctx, def: definicao, avisos, overlays,
    /* O cartao (criarAviso) nao existe mais: avisos tem que ficar vazio. */
    visiveis: () => overlays.filter((o) => o.estaAberto()).map(comoAviso),
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
  ok("abre em modal que não fecha clicando fora (nunca no cartão)", v.length && v[0].o.opcoes.fecharAoClicarFora === false && t.avisos.length === 0);

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

/* 6. Confirmou a ciencia: nao reaparece no mesmo atendimento. */
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE BARBACENA"));
  confirmarCiencia(t.visiveis()[0].o);
  t.ir("/atendimento/" + ID);
  ok("o medico confirmou: nao reabre no mesmo atendimento", t.visiveis().length === 0);
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
  ok("desligar o modulo fecha o aviso", t.overlays.length === 1 && t.overlays.every((o) => !o.estaAberto()));
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
  ok("5 respostas do mesmo atendimento: um modal só", t.overlays.length === 1, t.overlays.length);
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

/* 18. Fase 2 (13/11/2026): toda cidade em modal; confirmada a ciência,
 *     Barbacena não volta até o login — nem em outro atendimento, nem
 *     12h depois. Antes era o cartão com "Entendi" por 3h. */
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE BARBACENA"));
  const a = t.visiveis()[0];
  ok("Barbacena abre em modal no meio da tela, com ciência", a && /ATENÇÃO — LEITURA OBRIGATÓRIA/.test(a.o.elemento.innerHTML) &&
     /Li e estou ciente/.test(lerPassos(a.o).join("\n")));
  confirmarCiencia(a.o);
  ok("confirmou: o modal fecha", t.visiveis().length === 0);
  t.ir("/atendimento/" + ID);
  ok("e não reabre neste atendimento", t.visiveis().length === 0);
  const OUTRO_ID = "22222222-2222-2222-2222-222222222222";
  t.ir("/atendimento/" + OUTRO_ID);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE BARBACENA"), URL_API.replace(ID, OUTRO_ID));
  ok("nem em outro atendimento da mesma cidade", t.visiveis().length === 0);

  const TERCEIRO_ID = "33333333-3333-3333-3333-333333333333";
  t.ir("/atendimento/" + TERCEIRO_ID);
  t.rede(atendimentoDe("PREFEITURA DO MUNICIPIO DE FRANCO DA ROCHA"), URL_API.replace(ID, TERCEIRO_ID));
  ok("mas outra cidade continua avisando normalmente", t.visiveis().length === 1);
  confirmarCiencia(t.visiveis()[0].o);

  t.passar(12 * 60 * 60 * 1000);
  t.ir("/atendimento/" + OUTRO_ID);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE BARBACENA"), URL_API.replace(ID, OUTRO_ID));
  ok("Barbacena: confirmada a ciência, não volta até o login (nem 12h depois)", t.visiveis().length === 0);
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
  ok("e não abre outro a cada segundo", t.overlays.length === 1);
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

/* 22. Protocolo 3 (Documento 3, 30/09/2026): a UPA Barra de Macaé passou a
 *     ter medicação EV/IM/VO na unidade, exames pertinentes ao PA e
 *     atestado com critério — mas exige reavaliação por telemedicina após
 *     a medicação e os resultados. Exames eletivos continuam indo para a
 *     UBS, e a Clínica do Autista/Casa da Criança continuam ligadas ao
 *     "não oferta especialista" que já existia (agora reforçado pela
 *     reavaliação, não substituído). */
{
  const t = macae([PMM, "UPA UNIDADE DE PRONTO ATENDIMENTO BARRA"]);
  const v = t.visiveis();
  const texto = textoDe(v[0]);
  ok("UPA Barra: aviso abre", v.length === 1);
  ok("UPA Barra: medicação VO/IM/EV na unidade", /VO/.test(texto) && /IM/.test(texto) && /EV/.test(texto));
  ok("UPA Barra: exames pertinentes ao pronto atendimento", /exame/i.test(texto));
  ok("UPA Barra: atestado com critério", /atestado/i.test(texto));
  ok("UPA Barra: pede reavaliação por telemedicina depois da medicação/exames",
     /reavalia/i.test(texto));
  ok("UPA Barra: exames eletivos continuam indo para a UBS",
     /eletivo/i.test(texto) && /UBS/.test(texto));
}

/* 23. Protocolo 3 (Documento 3, 30/09/2026): Congonhas é UBS/ESF de
 *     demanda espontânea, com duas regras específicas que faltavam no
 *     aviso — renovação de receita só com a receita prévia em mãos, e a
 *     REMUME do município só dispensa dipirona em gotas (não em
 *     comprimido). A orientação de exames do laboratório, já existente,
 *     continua valendo. */
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE CONGONHAS"));
  const v = t.visiveis();
  const texto = textoDe(v[0]);
  ok("Congonhas: aviso abre", v.length === 1);
  ok("Congonhas: renovação de receita exige a receita prévia",
     /receita pr[eé]via/i.test(texto));
  ok("Congonhas: dipirona só em gotas, não em comprimido",
     /dipirona/i.test(texto) && /gotas/i.test(texto));
  ok("Congonhas: a orientação de exames do laboratório continua",
     /pedidos juntos/.test(texto) && /pedido separado/.test(texto));
}

/* 24. Pedido de 30/09/2026: a farmácia municipal de Congonhas não
 *     dispensa receita com só "uso contínuo" — no aviso de início de
 *     atendimento, isso entra como "naoPode" (❌), o mesmo destaque
 *     visual que a regra de renovação de receita já tem. */
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE CONGONHAS"));
  const v = t.visiveis();
  const texto = textoDe(v[0]);
  ok("Congonhas: aviso de 'uso contínuo' aparece com destaque (❌)",
     /❌[^\n]*uso cont[ií]nuo/i.test(texto) || /❌[^\n]*cont[ií]nuo[^\n]*uso/i.test(texto));
  ok("Congonhas: orienta a informar quantidade e duração exatas",
     /quantidade/i.test(texto) && /dura[cç][aã]o/i.test(texto));
}

/* 25. Pedido de 30/09/2026: em 13 unidades de Macaé, USG de mama,
 *     mamografia, papanicolau e USG transvaginal só podem ser
 *     solicitados pelo ginecologista — e isso SÓ vale para pacientes do
 *     sexo feminino. Sem confirmação do sexo na tela, não mostra (aviso
 *     errado é pior que nenhum aviso). */
{
  const t = macae([PMM, "ESF LAGOMAR"]);
  t.ctx.sexo = "F";
  t.passar(1000);
  const v = t.visiveis();
  const texto = v.length ? textoDe(v[0]) : "";
  ok("mulher em ESF Lagomar: o aviso aparece", v.length === 1);
  ok("cita os quatro exames", /USG.*mama/i.test(texto) && /mamografia/i.test(texto) &&
     /papanicolau/i.test(texto) && /transvaginal/i.test(texto));
  ok("orienta a encaminhar ao ginecologista", /ginecolog/i.test(texto));
  /* Pedido de 30/09/2026 (2): mesma frase da observação da aba de
   * Exames (dados/exames.json, município Macaé) — duas telas, um texto
   * só, para o médico reconhecer o mesmo aviso em qualquer lugar. */
  ok("mesma frase da aba de Exames: 'só podem ser solicitados pelo ginecologista'",
     /s[oó] podem ser solicitados pelo ginecologista/i.test(texto));
  ok("mesma frase da aba de Exames: 'Se houver necessidade, encaminhar a paciente ao profissional'",
     /se houver necessidade, encaminhar a paciente ao profissional/i.test(texto));
}
{
  const t = macae([PMM, "ESF LAGOMAR"]);
  t.ctx.sexo = "M";
  t.passar(1000);
  ok("homem em ESF Lagomar: nenhum aviso (regra é só para sexo feminino)", t.visiveis().length === 0);
}
{
  const t = macae([PMM, "ESF LAGOMAR"]);
  // ctx.sexo nao definido: sexo ainda nao apareceu na tela.
  t.passar(1000);
  ok("sexo ainda não confirmado: nenhum aviso (não inventa valor)", t.visiveis().length === 0);
}
{
  const t = macae([PMM, "UPA UNIDADE DE PRONTO ATENDIMENTO BARRA"]);
  t.ctx.sexo = "F";
  t.passar(1000);
  const v = t.visiveis();
  ok("mulher na UPA Barra: continua o aviso normal da UPA Barra, não o de ginecologia",
     v.length === 1 && /UPA Barra/.test(v[0].spec.titulo) && !/ginecolog/i.test(textoDe(v[0])));
}
[
  "CENTRO DE ESPECIALIDADES DONA ALBA",
  "UBS AROEIRA",
  "UMS SANA",
  /* ACHADO EM PRODUCAO (print real, 30/09/2026): o Vinculo mostra
   * "ESF AROEIRA", nao "UBS AROEIRA" — era esse o motivo do aviso nao
   * aparecer para essa unidade. As duas formas ficam cadastradas. */
  "ESF AROEIRA",
].forEach((unidade) => {
  const t = macae([PMM, unidade]);
  t.ctx.sexo = "F";
  t.passar(1000);
  ok("mulher em " + unidade + ": aviso de ginecologia aparece", /ginecolog/i.test(textoDe(t.visiveis()[0])));
});
{
  const t = macae([PMM, "UBS QUALQUER OUTRA"]);
  t.ctx.sexo = "F";
  t.passar(1000);
  ok("unidade de Macaé fora da lista: nenhum aviso de ginecologia", t.visiveis().length === 0);
}

/* 26. Pedido de 01/10/2026: "Atestado com critério" era texto solto, sem
 *     dizer o que "critério" exige. O Protocolo 3 explica — justificativa
 *     clínica, afastamento compatível com o avaliado, registro em
 *     prontuário, veda emitir sem ter praticado o ato (art. 80 do CEM) —
 *     e isso entra como orientação nas 3 unidades que já citam atestado. */
const CRITERIO_ATESTADO = /justificativa cl[ií]nica/i;
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE BARBACENA"));
  const texto = textoDe(t.visiveis()[0]);
  ok("Barbacena: detalha o critério do atestado", CRITERIO_ATESTADO.test(texto) && /prontu[aá]rio/i.test(texto));
}
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("PREFEITURA DO MUNICIPIO DE FRANCO DA ROCHA"));
  const texto = textoDe(t.visiveis()[0]);
  ok("Franco da Rocha: detalha o critério do atestado", CRITERIO_ATESTADO.test(texto) && /prontu[aá]rio/i.test(texto));
}
{
  const t = macae([PMM, "UPA UNIDADE DE PRONTO ATENDIMENTO BARRA"]);
  const texto = textoDe(t.visiveis()[0]);
  ok("UPA Barra: detalha o critério do atestado", CRITERIO_ATESTADO.test(texto) && /prontu[aá]rio/i.test(texto));
}

/* PARÁ DE MINAS (05/11/2026): fluxo de telemedicina só nas UBS
 * Nossa Senhora da Piedade e Walter Martins; UPA e AME ficam de fora. */
{
  const PPM = "PREFEITURA MUNICIPAL DE PARÁ DE MINAS";
  const para = (linhas) => {
    const t = carregar();
    t.ctx.linhas = linhas;
    t.ir("/atendimento/" + ID);
    t.rede(atendimentoDe(PPM));
    t.passar(3100);
    return t.visiveis();
  };
  ["UBS NOSSA SENHORA DA PIEDADE", "UBS Walter Martins"].forEach((unidade) => {
    const v = para([PPM, unidade]);
    const texto = v.length === 1 ? textoDe(v[0]) : "";
    ok("Pará de Minas, " + unidade + ": fluxo da UBS", v.length === 1 && /Pará de Minas — UBS/.test(texto) &&
       /azul ou verde/.test(texto) && /não renova receitas/.test(texto) &&
       /tenoxicam/.test(texto) && /Exames de imagem/.test(texto));
  });
  ok("Pará de Minas, UPA: nenhum aviso", para([PPM, "UPA 24 HORAS"]).length === 0);
  ok("Pará de Minas sem unidade no vínculo: nenhum aviso", para([PPM]).length === 0);
}

/* 27. Pedido de 13/11/2026: pontos de atenção de Pará de Minas, com
 *     ciência ("Li e estou ciente") que vale até recarregar a página —
 *     não volta depois de 3h, como o "Entendi". Desde o modal em passos
 *     (13/11), o conteúdo é lido passo a passo e a ciência é o checkbox +
 *     "Confirmar ciência" do último passo. */
const PPM = "PREFEITURA MUNICIPAL DE PARÁ DE MINAS";
const OUTRO_ID = "22222222-2222-2222-2222-222222222222";
const TERCEIRO_ID = "33333333-3333-3333-3333-333333333333";
function abrirPara(t) {
  t = t || carregar();
  t.ctx.linhas = [PPM, "UBS WALTER MARTINS"];
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe(PPM));
  t.passar(3100);
  return t;
}
/* Percorre todos os passos e devolve o HTML de cada um. */
function lerPassos(m) {
  const htmls = [m.elemento.innerHTML];
  for (let i = 0; i < 10 && !/msam-confirmar/.test(m.elemento.innerHTML); i++) {
    m.$(".msam-avancar").click();
    htmls.push(m.elemento.innerHTML);
  }
  return htmls;
}
function confirmarCiencia(m) {
  lerPassos(m);
  m.$(".msam-ciente").checked = true;
  m.$(".msam-ciente").click();
  m.$(".msam-confirmar").click();
}
const modaisAbertos = (t) => t.overlays.filter((o) => o.estaAberto());
function reabreEmOutroAtendimento(t, id) {
  id = id || OUTRO_ID;
  t.ir("/atendimento/" + id);
  t.rede(atendimentoDe(PPM), URL_API.replace(ID, id));
  t.passar(3100);
  return modaisAbertos(t).length > 0;
}
{
  const t = abrirPara();
  const m = t.overlays[t.overlays.length - 1];
  const htmls = lerPassos(m);
  const texto = htmls.join("\n");
  ok("Pará de Minas: proibições no passo logo após o contexto", /Prescrever com nome comercial/.test(htmls[1]) && !/Hemograma/.test(htmls[1]));
  ok("Pará de Minas: pontos de atenção de 13/11", /mesmo diante da receita prévia/.test(texto) &&
     /especialista/.test(texto) && /clínico, com resumo da história clínica e CID/.test(texto) &&
     /nunca sugerir conduta/.test(texto) && /Reavaliação sempre/.test(texto) &&
     CRITERIO_ATESTADO.test(texto) && !/enfermeira/.test(texto));
  ok("Pará de Minas: 'Li e estou ciente' no lugar do 'Entendi'", /Li e estou ciente/.test(htmls[htmls.length - 1]) && !/Entendi/.test(texto));
  confirmarCiencia(m);
  ok("ciência: o modal fecha", !m.estaAberto() && m.removido);
  t.passar(12 * 60 * 60 * 1000);
  ok("ciência: não volta nem 12h depois, na mesma página", reabreEmOutroAtendimento(t) === false);
}
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("PREFEITURA DO MUNICIPIO DE FRANCO DA ROCHA"));
  const texto = textoDe(t.visiveis()[0]);
  ok("Franco da Rocha: fichas azuis, sinal de alarme e eletivos (❌) no aviso", /fichas azuis/.test(texto) &&
     /❌ Paciente com sinal de alarme/.test(texto) && /❌ Casos eletivos → encaminhar para a UBS/.test(texto));
  ok("Franco da Rocha: também pede 'Li e estou ciente', sem 'Entendi'", /Li e estou ciente/.test(lerPassos(t.visiveis()[0].o).join("\n")) &&
     !/Entendi/.test(t.visiveis()[0].o.elemento.innerHTML));
}

/* 28. Achados do review de 13/11/2026: a ciência é por cidade/unidade, a
 *     ordem ❌ → ✅ vale para todos, o atestado não aparece duplicado, e
 *     voltar à tela de login (SPA, sem recarregar) pede a ciência de novo. */
{
  const t = abrirPara();
  confirmarCiencia(t.overlays[0]);
  t.ctx.linhas = null;
  t.ir("/atendimento/" + OUTRO_ID);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE BARBACENA"), URL_API.replace(ID, OUTRO_ID));
  ok("ciência de Pará de Minas não silencia outra cidade", t.visiveis().length === 1 && /Barbacena/.test(t.visiveis()[0].spec.titulo));

  const t2 = abrirPara();
  confirmarCiencia(t2.overlays[0]);
  t2.ctx.MeedsSuiteAuth = { estaNaTelaDeLogin: () => true };
  t2.ir("/login");
  t2.ctx.MeedsSuiteAuth = { estaNaTelaDeLogin: () => false };
  ok("voltou à tela de login sem recarregar: pede a ciência de novo", reabreEmOutroAtendimento(t2, TERCEIRO_ID) === true &&
     /Li e estou ciente/.test(lerPassos(t2.overlays[t2.overlays.length - 1]).join("\n")));
}
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE BARBACENA"));
  const corpo = t.visiveis()[0].spec.corpo;
  ok("Barbacena: ❌ antes de ✅", corpo.findIndex((l) => /^❌/.test(l)) < corpo.findIndex((l) => /^✅/.test(l)));
}
[["Barbacena", (t) => { t.ir("/atendimento/" + ID); t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE BARBACENA")); }],
 ["Franco da Rocha", (t) => { t.ir("/atendimento/" + ID); t.rede(atendimentoDe("PREFEITURA DO MUNICIPIO DE FRANCO DA ROCHA")); }]].forEach(([nome, abrir]) => {
  const t = carregar();
  abrir(t);
  const n = (textoDe(t.visiveis()[0]).match(/Atestado com critério/g) || []).length;
  ok(nome + ": 'Atestado com critério' aparece uma vez só", n === 1, n);
});
{
  const t = macae([PMM, "UPA UNIDADE DE PRONTO ATENDIMENTO BARRA"]);
  const n = (textoDe(t.visiveis()[0]).match(/Atestado com critério/g) || []).length;
  ok("UPA Barra: 'Atestado com critério' aparece uma vez só", n === 1, n);
}

/* 29. montarPassos (13/11/2026): o aviso vira páginas. */
{
  const t = carregar();
  const R = DADOS.municipios;
  const para = t.def._montarPassos(null, { chave: "UBS", regra: R["Pará de Minas"].unidades.UBS });
  ok("Pará: 4 passos na ordem contexto → naoPode → pode → orientacoes",
     para.passos.map((p) => p.tipo).join() === "contexto,naoPode,pode,orientacoes");
  ok("Pará: contexto traz a UPA da UBS", /UPA da UBS/.test(para.passos[0].itens[0].texto));
  ok("Pará: 5 proibições, a 1ª é nome comercial", para.passos[1].itens.length === 5 && /nome comercial/.test(para.passos[1].itens[0].texto));
  const autista = t.def._montarPassos(null, { chave: "Clínica do Autista", regra: R["Macaé"].unidades["Clínica do Autista"] });
  ok("RF2: só orientações → um passo só", autista.passos.length === 1 && autista.passos[0].tipo === "orientacoes");
  const barb = t.def._montarPassos(R["Barbacena"], null);
  ok("Barbacena: sem resumo não tem contexto", barb.passos[0].tipo === "naoPode");
  ok("vazio → null", t.def._montarPassos({ titulo: "x" }, null) === null);
  const junto = t.def._montarPassos({ titulo: "M", naoPode: [{ item: "m1" }], pode: ["m2"] },
    { chave: "U", regra: { titulo: "U", naoPode: [{ item: "u1", fazer: "f" }], pode: ["u2"] } });
  ok("município + unidade: itens do município primeiro em cada grupo, título da unidade",
     junto.titulo === "U" && junto.passos.map((p) => p.itens.map((i) => i.texto).join()).join("|") === "m1,u1|m2,u2" &&
     junto.passos[0].itens[1].fazer === "f");
}

/* 30. Modal em passos (Pará de Minas, 13/11/2026): regra com exigeCiencia
 *     abre um modal que não fecha clicando fora nem no Esc; o médico lê
 *     passo a passo e só confirma no último, marcando "Li e estou ciente". */
{
  const t = abrirPara();
  const m = t.overlays[t.overlays.length - 1];
  ok("abre o modal, não o cartão", m && m.estaAberto() && t.avisos.length === 0);
  ok("não fecha clicando fora", m.opcoes.fecharAoClicarFora === false);
  ok("alertdialog modal com título", /role="alertdialog"/.test(m.elemento.innerHTML) && /aria-modal="true"/.test(m.elemento.innerHTML) &&
     /aria-labelledby="msam-titulo"/.test(m.elemento.innerHTML) && /id="msam-titulo"/.test(m.elemento.innerHTML) &&
     /ATENÇÃO — LEITURA OBRIGATÓRIA/.test(m.elemento.innerHTML));
  ok("passo 1 de 4, sem Voltar; abriu sozinho: foco no modal, não no Avançar (espaço não pula passo)",
     /Passo 1 de 4/.test(m.elemento.innerHTML) && !/msam-voltar/.test(m.elemento.innerHTML) &&
     m.$(".msam-modal").focado && !m.$(".msam-avancar").focado);
  ok("Esc não fecha", m.elemento.tecla("Escape").evitado && m.estaAberto());
  m.$(".msam-avancar").click();
  ok("passo 2: Voltar aparece e volta ao 1", /Passo 2 de 4/.test(m.elemento.innerHTML) && /msam-voltar/.test(m.elemento.innerHTML) &&
     (m.$(".msam-voltar").click(), /Passo 1 de 4/.test(m.elemento.innerHTML)));
  m.$(".msam-avancar").click(); m.$(".msam-avancar").click(); m.$(".msam-avancar").click();
  ok("último passo: Confirmar desabilitado", /Passo 4 de 4/.test(m.elemento.innerHTML) && m.$(".msam-confirmar").disabled === true &&
     !/msam-avancar/.test(m.elemento.innerHTML));
  m.$(".msam-confirmar").click();
  ok("Confirmar sem marcar não faz nada", m.estaAberto());
  m.$(".msam-ciente").checked = true; m.$(".msam-ciente").click();
  ok("marcou: Confirmar habilita", m.$(".msam-confirmar").disabled === false);
  m.$(".msam-confirmar").click();
  ok("confirmou: fecha e não reabre no próximo atendimento", !m.estaAberto() && reabreEmOutroAtendimento(t) === false);
}
/* RF5 (review de 13/11): Tab circula dentro do modal, e clicar no texto
 * ou no fundo não tira o foco do shadow (senão o Tab caía no formulário
 * atrás do modal). */
{
  const t = abrirPara();
  const m = t.overlays[0];
  const ativo = () => m.raizShadow.activeElement;
  ok("modal focável (tabindex=-1) para o clique no texto manter o foco nele", /class="msam-modal"[^>]*tabindex="-1"/.test(m.elemento.innerHTML));
  const fundo = m.elemento.evento("mousedown", { target: m.elemento });
  const dentro = m.elemento.evento("mousedown", { target: {} });
  ok("mousedown no fundo escuro: preventDefault (foco fica onde está); dentro do modal não", fundo.evitado && !dentro.evitado);
  const avancar = m.$(".msam-avancar");
  ok("passo 1: Tab fica no Avançar", m.elemento.tecla("Tab").evitado && ativo() === avancar);
  ok("passo 1: Shift+Tab também", m.elemento.tecla("Tab", true).evitado && ativo() === avancar);
  avancar.click();
  const voltar = m.$(".msam-voltar");
  const avancar2 = m.$(".msam-avancar");
  ok("passo 2: foco no Avançar, Tab vai para o Voltar e volta", ativo() === avancar2 &&
     (m.elemento.tecla("Tab"), ativo() === voltar) && (m.elemento.tecla("Tab"), ativo() === avancar2));
  ok("passo 2: Shift+Tab Avançar → Voltar → Avançar", (m.elemento.tecla("Tab", true), ativo() === voltar) &&
     (m.elemento.tecla("Tab", true), ativo() === avancar2));
  m.raizShadow.activeElement = { modal: true }; // clicou no texto: o foco está no próprio .msam-modal
  ok("foco no corpo do modal: Tab vai para o primeiro focável", (m.elemento.tecla("Tab"), ativo() === voltar));
  lerPassos(m);
  const ciente = m.$(".msam-ciente");
  ok("último passo: Tab circula Voltar ↔ checkbox, pulando o Confirmar desabilitado",
     ativo() === ciente && (m.elemento.tecla("Tab"), ativo() === m.$(".msam-voltar")) &&
     (m.elemento.tecla("Tab"), ativo() === ciente));
}
/* Revisão final (13/11): foco inicial no modal também na regra de um passo
 * só (senão iria para o checkbox), e foco devolvido ao fechar. */
{
  const dados = JSON.parse(JSON.stringify(DADOS));
  const ubs = dados.municipios["Pará de Minas"].unidades.UBS;
  delete ubs.resumo; delete ubs.pode; delete ubs.naoPode;
  const t = abrirPara(carregar(dados));
  const m = t.overlays[0];
  ok("regra de um passo: foco no modal, não no checkbox", /Passo 1 de 1/.test(m.elemento.innerHTML) &&
     m.$(".msam-modal").focado && !m.$(".msam-ciente").focado);
}
{
  const foco = () => { const el = { focado: false, focus() { el.focado = true; } }; return el; };
  const t = carregar();
  const anamnese = foco();
  const body = foco();
  t.ctx.document = { body, activeElement: anamnese };
  abrirPara(t);
  confirmarCiencia(t.overlays[0]);
  ok("confirmou: o foco volta para onde estava (anamnese)", anamnese.focado);

  const t2 = carregar();
  const anamnese2 = foco();
  t2.ctx.document = { body, activeElement: anamnese2 };
  abrirPara(t2);
  t2.ir("/pronto-atendimento");
  ok("saiu do atendimento: o foco também volta", anamnese2.focado);

  const t3 = carregar();
  t3.ctx.document = { body, activeElement: body };
  abrirPara(t3);
  confirmarCiencia(t3.overlays[0]);
  ok("foco estava no body: não força foco em nada", !body.focado);
}
/* RF4 sem trocar de URL: sessão expirada mostra o login ainda em
 * /atendimento/<id>. O modal não pode ficar por cima do login. */
{
  const t = abrirPara();
  const m = t.overlays[0];
  t.ctx.MeedsSuiteAuth = { estaNaTelaDeLogin: () => true };
  t.passar(1000);
  const removido = !m.estaAberto() && m.removido;
  t.passar(1000);
  t.passar(1000);
  const naoReabriu = modaisAbertos(t).length === 0;
  t.ctx.MeedsSuiteAuth = { estaNaTelaDeLogin: () => false };
  t.passar(1000);
  ok("login aparece sem sair do atendimento: modal sai, não reabre com o login na tela, volta depois pedindo ciência",
     removido && naoReabriu && modaisAbertos(t).length === 1 && t.overlays.length === 2);
}
/* RF1 */
{
  const t = abrirPara();
  const m = t.overlays[0];
  t.ir("/pronto-atendimento");
  const fechouAoSair = !m.estaAberto() && m.removido;
  const t2 = abrirPara();
  t2.ir("/atendimento/" + TERCEIRO_ID);
  const fechouAoTrocar = !t2.overlays[0].estaAberto();
  ok("saiu do atendimento com o modal aberto: fecha sem ciência e volta no próximo",
     fechouAoSair && fechouAoTrocar && reabreEmOutroAtendimento(t) === true && t.overlays.length === 2);
}
/* RF4 */
{
  const t = abrirPara();
  const m = t.overlays[0];
  t.ctx.MeedsSuiteAuth = { estaNaTelaDeLogin: () => true };
  t.ir("/login");
  t.ctx.MeedsSuiteAuth = { estaNaTelaDeLogin: () => false };
  ok("tela de login com o modal aberto: fecha e esquece a ciência", !m.estaAberto() && m.removido &&
     reabreEmOutroAtendimento(t) === true);
}
/* Fase 2: um caso por município/unidade da tabela, gerado de DADOS —
 * todos abrem o modal com "Passo 1 de M", M = grupos não vazios. */
Object.keys(DADOS.municipios).forEach((nome) => {
  const regraMun = DADOS.municipios[nome];
  const casos = Object.keys(regraMun.unidades || {}).map((k) => ({ rotulo: nome + " / " + k, unidade: { chave: k, regra: regraMun.unidades[k] } }));
  if (regraMun.titulo) casos.unshift({ rotulo: nome, unidade: null });
  casos.forEach(({ rotulo, unidade }) => {
    const t = carregar();
    t.ctx.sexo = unidade && unidade.regra.apenasSexo;
    t.ctx.linhas = ["PREFEITURA MUNICIPAL DE " + nome].concat(unidade ? [unidade.regra.nomes[0]] : []);
    t.ir("/atendimento/" + ID);
    t.passar(3100);
    const M = t.def._montarPassos(regraMun, unidade).passos.length;
    const m = modaisAbertos(t);
    ok(rotulo + ": modal com Passo 1 de " + M, m.length === 1 && t.avisos.length === 0 &&
       new RegExp("Passo 1 de " + M + "<").test(m[0].elemento.innerHTML), m.length && /Passo \d+ de \d+/.exec(m[0].elemento.innerHTML));
    confirmarCiencia(m[0]);
    ok(rotulo + ": confirmável", m.length === 1 && !m[0].estaAberto());
  });
});
/* escape */
{
  const dados = JSON.parse(JSON.stringify(DADOS));
  const ubs = dados.municipios["Pará de Minas"].unidades.UBS;
  ubs.titulo = "<b>Pará</b>";
  ubs.resumo = "<img src=x onerror=alert(1)> & \"aspas\"";
  const t = abrirPara(carregar(dados));
  const html = t.overlays[0].elemento.innerHTML;
  ok("título com <b> no JSON aparece escapado", /&lt;b&gt;Pará&lt;\/b&gt;/.test(html) && !/<b>Pará/.test(html) &&
     /&lt;img src=x/.test(html) && !/<img/.test(html) && /&amp; &quot;aspas&quot;/.test(html));
}

console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
if (falhas) process.exit(1);
