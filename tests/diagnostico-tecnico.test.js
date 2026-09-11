/* ------------------------------------------------------------------
 * tests/diagnostico-tecnico.test.js — core/diagnostico-tecnico.js
 * ------------------------------------------------------------------
 * O que mais importa provar aqui não é "o texto sai bonito" — é que a
 * regra de ouro do arquivo (só metadado, nunca conteúdo; só rótulo
 * nosso, nunca o console da página) realmente segura na prática:
 *
 *   1. uma resposta de rede que falha É capturada, mas SEM o corpo e
 *      SEM a query string da URL;
 *   2. uma linha de console que NÃO comece com um rótulo da suíte é
 *      descartada, mesmo que pareça inofensiva;
 *   3. um CPF, CNS ou qualquer sequência longa de dígito que escape até
 *      uma URL ou uma mensagem nossa sai mascarado do texto final;
 *   4. o texto montado nunca contém a palavra literal usada como corpo
 *      de uma resposta de rede — prova negativa, não só positiva.
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

/* Duble mínimo do hub de rede: guarda o callback que
 * MeedsSuiteDiagnosticoTecnico assina, para o teste disparar eventos na
 * hora que quiser — sem instalar hook nenhum de verdade. */
function carregar() {
  var callbackAssinado = null;
  var logsCapturados = [];

  var ctx = {
    console: {
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
      createElement: function () {
        return { style: {}, select: function () {} };
      },
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

/* 1. so falha de rede entra, e sem corpo nem query string */
{
  const c = carregar();
  c.api.instalar();

  c.dispararEventoDeRede({
    url: "https://api-calltech.meeds.com.br/api/v1/Atendimento?nome=JOSE+DA+SILVA&cpf=12345678900",
    metodo: "GET",
    status: 200,
    corpo: '{"paciente":"deveria ser ignorado, e sucesso"}',
  });
  c.dispararEventoDeRede({
    url: "https://sherlock-api.memed.com.br/v1/log?token=abc123",
    metodo: "POST",
    status: 422,
    corpo: '{"erro":"payload invalido", "paciente_enviado":"MARIA TESTE"}',
  });
  c.dispararEventoDeRede({
    url: "https://api-calltech.meeds.com.br/api/v1/GestaoHorario/f301b654-f69f-4bf0-8077-39fe71ce258b",
    metodo: "GET",
    status: 400,
    corpo: '"Object reference not set to an instance of an object."',
  });

  const estado = c.api._estado();
  ok("chamada 200 (sucesso) NAO entra no buffer", estado.redeBuffer.length === 2, estado.redeBuffer.length);
  ok("total de chamadas observadas conta as 3", estado.totalChamadas === 3);
  ok("total de falhas conta so as 2", estado.totalFalhas === 2);

  const texto = c.api.montarRelatorio({ versao: "2.43.0", modulos: [] });
  ok("a query string (?token=...) NAO aparece no texto final", texto.indexOf("token=abc123") === -1);
  ok("o corpo da resposta (payload invalido) NAO aparece no texto final", texto.indexOf("payload invalido") === -1);
  ok("o nome de paciente ecoado no corpo NAO aparece no texto final", texto.indexOf("MARIA TESTE") === -1);
  ok("o caminho da URL (sem query) aparece", texto.indexOf("sherlock-api.memed.com.br/v1/log") !== -1);
  ok("o status da falha aparece", texto.indexOf("422") !== -1 && texto.indexOf("400") !== -1);
}

/* 2. so linha com rotulo nosso entra no console; o resto e ignorado */
{
  const c = carregar();
  c.api.instalar();

  c.consoleReal.debug("[Alarme Fila] disparo via rede-fila-espera");
  c.consoleReal.warn("Uncaught (in promise) AxiosError: Request failed with status code 400"); // NAO e nosso
  c.consoleReal.error("[Assistente Meeds] assinante de rede falhou: apac TypeError: x is not a function");
  c.consoleReal.debug("Paciente Jose da Silva carregado com sucesso"); // NAO e nosso, e teria dado de paciente

  const estado = c.api._estado();
  ok("so 2 das 4 linhas de console entraram no buffer", estado.consoleBuffer.length === 2, estado.consoleBuffer.length);

  const texto = c.api.montarRelatorio({ versao: "2.43.0", modulos: [] });
  ok("a linha do Alarme de Fila aparece", texto.indexOf("[Alarme Fila] disparo via rede-fila-espera") !== -1);
  ok("a linha que nao comeca com rotulo nosso (AxiosError da pagina) NAO aparece", texto.indexOf("AxiosError") === -1);
  ok('a linha "Paciente Jose da Silva" NAO aparece de jeito nenhum', texto.indexOf("Jose da Silva") === -1);

  /* prova de que o console real da pagina continua funcionando */
  ok(
    "as chamadas de console ainda chegam ao console de verdade (nao foram silenciadas)",
    c.logsCapturados.length === 4
  );
}

/* 3. mascaramento de sequencia longa de digito — CPF, CNS, CNES, telefone */
{
  const c = carregar();
  ok("CPF (11 digitos) mascarado", c.api._mascararDigitos("CPF 12345678900 invalido") === "CPF 12…00(11díg) invalido");
  ok(
    "CNS (15 digitos) mascarado",
    c.api._mascararDigitos("cns=123456789012345").indexOf("123456789012345") === -1
  );
  ok("numero curto (ex: ano, 4 digitos) NAO e mascarado", c.api._mascararDigitos("versao 2026") === "versao 2026");
  ok(
    "query string some do caminho, digito longo no path e mascarado",
    c.api._caminhoSemQuery("https://x.com/api/paciente/12345678900123?a=1").indexOf("?") === -1
  );
}

/* 4. relatorio sempre traz o rodape de privacidade e o ambiente */
{
  const c = carregar();
  c.api.instalar();
  const texto = c.api.montarRelatorio({
    versao: "2.43.0",
    modulos: [
      { nome: "Alarme de Fila", habilitado: true },
      { nome: "APAC", habilitado: false },
    ],
  });
  ok("cita a versao", texto.indexOf("2.43.0") !== -1);
  ok("lista so as funcoes LIGADAS", texto.indexOf("Alarme de Fila") !== -1 && texto.indexOf("APAC") === -1);
  ok(
    "termina com o aviso de que nao ha dado de paciente",
    texto.indexOf("Nenhum dado de paciente está neste texto") !== -1
  );
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
