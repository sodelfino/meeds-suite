/* ------------------------------------------------------------------
 * tests/diagnostico-tecnico.test.js — core/diagnostico-tecnico.js
 * ------------------------------------------------------------------
 * v2.43.0 só trazia metadado (sem corpo, sem query string, só console
 * nosso). Testado em campo, não bastou — faltava o que um Jam grava de
 * verdade. v2.43.1 corrigiu: o destino é interno, então URL completa,
 * console inteiro e corpo de resposta (truncado) agora entram.
 *
 * O que este teste prova:
 *   1. toda chamada de rede entra agora — sucesso e falha, com corpo;
 *   2. toda linha de console entra agora — nossa e da página;
 *   3. a única coisa que continua saindo do texto é o NÚMERO LONGO
 *      (CPF/CNS/CNES/telefone) — mascarado onde quer que apareça: na
 *      URL, no corpo, ou numa linha de console qualquer;
 *   4. o resto do conteúdo ao redor do número mascarado permanece
 *      literal e legível.
 * ------------------------------------------------------------------ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");

let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs !== undefined ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}

function carregar() {
  var callbackAssinado = null;
  var logsCapturados = [];

  var ctx = {
    console: {
      log: function () { logsCapturados.push(["log"].concat(Array.prototype.slice.call(arguments))); },
      info: function () { logsCapturados.push(["info"].concat(Array.prototype.slice.call(arguments))); },
      debug: function () { logsCapturados.push(["debug"].concat(Array.prototype.slice.call(arguments))); },
      warn: function () { logsCapturados.push(["warn"].concat(Array.prototype.slice.call(arguments))); },
      error: function () { logsCapturados.push(["error"].concat(Array.prototype.slice.call(arguments))); },
    },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Date: Date,
    JSON: JSON,
    String: String,
    Array: Array,
    Object: Object,
    Math: Math,
    Promise: Promise,
    document: {
      createElement: function () { return { style: {}, select: function () {} }; },
      body: { appendChild: function () {}, removeChild: function () {} },
      execCommand: function () { return true; },
    },
    navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120", clipboard: null },
    MeedsSuiteNetwork: {
      assinar: function (spec, callback) {
        callbackAssinado = callback;
        return function cancelar() { callbackAssinado = null; };
      },
    },
    MeedsSuiteDiagnostico: {
      escopoDeExecucao: function () { return "pagina"; },
    },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "core/diagnostico-tecnico.js"), "utf8"), ctx);

  return {
    api: ctx.MeedsSuiteDiagnosticoTecnico,
    dispararEventoDeRede: function (evt) { if (callbackAssinado) callbackAssinado(evt); },
    consoleReal: ctx.console,
    logsCapturados: logsCapturados,
  };
}

/* 1. toda chamada de rede entra — sucesso e falha — com URL e corpo */
{
  const c = carregar();
  c.api.instalar();

  c.dispararEventoDeRede({
    url: "https://api-calltech.meeds.com.br/api/v1/Atendimento?especialidade=Cardiologia",
    metodo: "GET",
    status: 200,
    corpo: '{"status":"ok"}',
  });
  c.dispararEventoDeRede({
    url: "https://sherlock-api.memed.com.br/v1/log?token=abc123",
    metodo: "POST",
    status: 422,
    corpo: '{"erro":"payload invalido"}',
  });

  const estado = c.api._estado();
  ok("a chamada de sucesso (200) TAMBEM entra no buffer agora", estado.redeBuffer.length === 2, estado.redeBuffer.length);
  ok("total de chamadas observadas conta as 2", estado.totalChamadas === 2);
  ok("total de falhas conta so a 1 (422)", estado.totalFalhas === 1);

  const texto = c.api.montarRelatorio({ versao: "2.43.1", modulos: [] });
  ok("a query string (?especialidade=...) aparece agora", texto.indexOf("especialidade=Cardiologia") !== -1);
  ok("a query string do token aparece agora", texto.indexOf("token=abc123") !== -1);
  ok('o corpo da resposta ("payload invalido") aparece agora', texto.indexOf("payload invalido") !== -1);
  ok("a chamada de sucesso tambem aparece no texto", texto.indexOf('"status":"ok"') !== -1);
}

/* 2. toda linha de console entra — a nossa e a da pagina */
{
  const c = carregar();
  c.api.instalar();

  c.consoleReal.debug("[Alarme Fila] disparo via rede-fila-espera");
  c.consoleReal.warn("Uncaught (in promise) AxiosError: Request failed with status code 400");
  c.consoleReal.error("[Assistente Meeds] assinante de rede falhou: apac TypeError: x is not a function");
  c.consoleReal.log("mensagem qualquer da propria pagina do Meeds");

  const estado = c.api._estado();
  ok("as 4 linhas de console entraram no buffer", estado.consoleBuffer.length === 4, estado.consoleBuffer.length);

  const texto = c.api.montarRelatorio({ versao: "2.43.1", modulos: [] });
  ok("a linha do Alarme de Fila aparece", texto.indexOf("[Alarme Fila] disparo via rede-fila-espera") !== -1);
  ok("a linha da pagina (AxiosError) TAMBEM aparece agora", texto.indexOf("AxiosError") !== -1);
  ok('a linha "mensagem qualquer da propria pagina" aparece', texto.indexOf("mensagem qualquer da propria pagina") !== -1);
  ok(
    "as chamadas de console ainda chegam ao console de verdade (nao foram silenciadas)",
    c.logsCapturados.length === 4
  );
}

/* 3 e 4. o unico filtro que resta: numero longo mascarado, resto literal */
{
  const c = carregar();
  c.api.instalar();

  c.dispararEventoDeRede({
    url: "https://api-calltech.meeds.com.br/api/v1/paciente/12345678900",
    metodo: "GET",
    status: 500,
    corpo: '{"mensagem":"CPF 12345678900 nao encontrado na base"}',
  });
  c.consoleReal.error("[Assistente Meeds] falha ao processar CNS 123456789012345 do paciente");

  const texto = c.api.montarRelatorio({ versao: "2.43.1", modulos: [] });
  ok("o CPF cru (11 digitos) NAO aparece em lugar nenhum do texto", texto.indexOf("12345678900") === -1);
  ok("o CNS cru (15 digitos) NAO aparece em lugar nenhum do texto", texto.indexOf("123456789012345") === -1);
  ok(
    "mas a frase ao redor do numero mascarado continua legivel",
    texto.indexOf("nao encontrado na base") !== -1 && texto.indexOf("falha ao processar CNS") !== -1
  );
  ok("a mascara mostra que havia um numero de 11 digitos", texto.indexOf("(11díg)") !== -1);

  ok("numero curto (ex: ano, 4 digitos) NAO e mascarado", c.api._mascararDigitos("versao 2026") === "versao 2026");
}

/* 5. corpo muito longo trunca, para o texto nao ficar gigante */
{
  const c = carregar();
  c.api.instalar();
  const corpoGigante = "x".repeat(2000);
  c.dispararEventoDeRede({ url: "https://x.com/api", metodo: "GET", status: 500, corpo: corpoGigante });

  const estado = c.api._estado();
  ok("o corpo guardado e truncado, nao os 2000 caracteres inteiros", estado.redeBuffer[0].corpo.length < 600);
  ok("o texto truncado avisa quantos caracteres faltam", estado.redeBuffer[0].corpo.indexOf("car.)") !== -1);
}

/* 6. relatorio traz ambiente e o aviso de uso interno (nao mais "sem dado") */
{
  const c = carregar();
  c.api.instalar();
  const texto = c.api.montarRelatorio({
    versao: "2.43.1",
    modulos: [
      { nome: "Alarme de Fila", habilitado: true },
      { nome: "APAC", habilitado: false },
    ],
  });
  ok("cita a versao", texto.indexOf("2.43.1") !== -1);
  ok("lista so as funcoes LIGADAS", texto.indexOf("Alarme de Fila") !== -1 && texto.indexOf("APAC") === -1);
  ok("avisa que e uso interno e pode conter dado de tela", texto.indexOf("Uso interno") !== -1);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
