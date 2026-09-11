/* ------------------------------------------------------------------
 * core/diagnostico-tecnico.js — "copiar diagnóstico técnico"
 * ------------------------------------------------------------------
 * PARA QUE SERVE
 * Quando algo dá errado (a Memed não abre, um laudo não gera), a
 * primeira pergunta de quem vai investigar é sempre "o que apareceu no
 * console e na rede?" — e o médico não tem como responder isso. Este
 * arquivo mantém, em memória, um resumo do que aconteceu nos últimos 15
 * minutos, para virar um texto pronto de colar no WhatsApp ou e-mail com
 * um clique em ⚙️ → Sobre → "Copiar diagnóstico técnico".
 *
 * A DECISÃO QUE MOLDA TUDO AQUI: SÓ METADADO, NUNCA CONTEÚDO
 * O console da PÁGINA e as respostas de rede não são nossos — são do
 * Meeds e da Memed, e nós não controlamos o que eles escrevem ali. Uma
 * resposta de erro, em particular, às vezes ecoa de volta o que foi
 * enviado. Por isso este arquivo NUNCA guarda corpo de resposta, nunca
 * guarda query string de URL, e só guarda linha de console que comece
 * com um dos rótulos que os PRÓPRIOS módulos desta suíte usam — o resto
 * da página pode gritar o que quiser no console que não entra aqui.
 *
 * O que fica, então:
 *   - de rede: só chamadas que FALHARAM (sem resposta, ou status >= 400)
 *     — método, o HOST+CAMINHO da URL (sem "?...", onde costuma morar
 *     parâmetro de paciente), status, duração;
 *   - de console: só as linhas que os módulos desta suíte já imprimem,
 *     que seguem a convenção de nunca citar paciente (é a mesma regra
 *     de ouro de sempre, não uma nova);
 *   - do ambiente: versão, funções ligadas, navegador, o mesmo "modo de
 *     execução" que já aparece na aba Sobre.
 *
 * E, por cima disso, uma segunda trava: qualquer sequência de 6 ou mais
 * dígitos seguidos — CPF, CNS, CNES, telefone, data em formato numérico —
 * é mascarada antes de entrar no texto final, mesmo vindo de um lugar
 * "confiável". Defesa em profundidade, mesmo espírito das duas travas de
 * `core/modelos.js`.
 *
 * NADA AQUI VAI PARA SERVIDOR NENHUM. O texto monta na memória do
 * navegador e só sai quando o médico aperta "Copiar" — mesmo caminho
 * (área de transferência) que `core/feedback.js` já usa.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var JANELA_MS = 15 * 60 * 1000; // so o que aconteceu nos ultimos 15 min
  var LIMITE_REDE = 40;
  var LIMITE_CONSOLE = 40;

  /* Rotulos que OS PROPRIOS modulos desta suite usam em console.debug/
   * warn/error — conferido contra o codigo-fonte inteiro. Uma linha que
   * nao comece com um destes e ignorada, nunca guardada. Um modulo novo
   * que esqueca de entrar nesta lista simplesmente nao aparece no
   * diagnostico — falha "escondendo de menos", nunca "vazando de mais". */
  var ROTULOS_NOSSOS = [
    "[Assistente Meeds]",
    "[Alarme Fila]",
    "[Sala de espera]",
    "[Assistente REMUME]",
    "[CID-10]",
    "[CMD Laudo]",
  ];

  var redeBuffer = [];
  var consoleBuffer = [];
  var totalChamadas = 0;
  var totalFalhas = 0;
  var instalado = false;

  /* Mascara qualquer sequencia longa de digito — CPF (11), CNS (15),
   * CNES (7), telefone, data numerica. Mantem so as pontas, para quem le
   * ainda enxergar "e um numero de X digitos" sem o numero inteiro. */
  function mascararDigitos(texto) {
    return String(texto == null ? "" : texto).replace(/\d{6,}/g, function (seq) {
      return seq.slice(0, 2) + "…" + seq.slice(-2) + "(" + seq.length + "díg)";
    });
  }

  function caminhoSemQuery(url) {
    var semQuery = String(url || "").split("?")[0].split("#")[0];
    return mascararDigitos(semQuery);
  }

  function podar(lista) {
    var limite = Date.now() - JANELA_MS;
    while (lista.length && lista[0].ts < limite) lista.shift();
  }

  /* ------------------------------------------------------------------
   * SINAL 1: chamadas de rede que falharam
   * ------------------------------------------------------------------ */
  function assinarRede() {
    if (!raiz.MeedsSuiteNetwork || typeof raiz.MeedsSuiteNetwork.assinar !== "function") return;
    raiz.MeedsSuiteNetwork.assinar(
      { regex: /.*/, idModulo: "diagnostico-tecnico" },
      function (evt) {
        totalChamadas++;
        // status 0 = a chamada nem completou (rede caiu, CORS, timeout).
        // status >= 400 = o servidor recusou. Os dois interessam; 2xx/3xx
        // nao — nem guardamos, pra nao virar ruido nem crescer memoria.
        if (evt.status !== 0 && evt.status < 400) return;
        totalFalhas++;
        redeBuffer.push({
          ts: Date.now(),
          metodo: evt.metodo,
          caminho: caminhoSemQuery(evt.url),
          status: evt.status,
        });
        podar(redeBuffer);
        if (redeBuffer.length > LIMITE_REDE) redeBuffer.shift();
      }
    );
  }

  /* ------------------------------------------------------------------
   * SINAL 2: nossos próprios avisos — nunca os da página
   * ------------------------------------------------------------------ */
  function comecaComRotuloNosso(primeiroArgumento) {
    if (typeof primeiroArgumento !== "string") return false;
    for (var i = 0; i < ROTULOS_NOSSOS.length; i++) {
      if (primeiroArgumento.indexOf(ROTULOS_NOSSOS[i]) === 0) return true;
    }
    return false;
  }

  function instalarEscutaDeConsole() {
    ["debug", "warn", "error"].forEach(function (nivel) {
      var original = console[nivel];
      if (typeof original !== "function") return;
      console[nivel] = function () {
        try {
          if (comecaComRotuloNosso(arguments[0])) {
            var texto = Array.prototype.slice
              .call(arguments)
              .map(function (a) {
                if (typeof a === "string") return a;
                try {
                  return JSON.stringify(a);
                } catch (e) {
                  return String(a);
                }
              })
              .join(" ");
            consoleBuffer.push({ ts: Date.now(), nivel: nivel, texto: mascararDigitos(texto) });
            podar(consoleBuffer);
            if (consoleBuffer.length > LIMITE_CONSOLE) consoleBuffer.shift();
          }
        } catch (e) {
          /* a captura nunca pode ser o motivo de um novo erro */
        }
        return original.apply(console, arguments);
      };
    });
  }

  function instalar() {
    if (instalado) return;
    instalado = true;
    assinarRede();
    instalarEscutaDeConsole();
  }

  /* ------------------------------------------------------------------
   * MONTAGEM DO TEXTO
   * ------------------------------------------------------------------ */
  function navegadorCurto() {
    var ua = (raiz.navigator && raiz.navigator.userAgent) || "";
    var nome = /Edg\//.test(ua) ? "Edge"
      : /Chrome\//.test(ua) ? "Chrome"
      : /Firefox\//.test(ua) ? "Firefox"
      : /Safari\//.test(ua) ? "Safari"
      : "navegador desconhecido";
    var sistema = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
    return [nome, sistema].filter(Boolean).join(" · ");
  }

  function horaCurta(ts) {
    var d = new Date(ts);
    function p2(n) { return String(n).padStart(2, "0"); }
    return p2(d.getHours()) + ":" + p2(d.getMinutes()) + ":" + p2(d.getSeconds());
  }

  function montarRelatorio(ctx) {
    podar(redeBuffer);
    podar(consoleBuffer);

    var linhas = [];
    linhas.push("Assistente Meeds — diagnóstico técnico");
    linhas.push("Versão " + (ctx.versao || "?") + " · gerado em " + new Date().toLocaleString("pt-BR"));

    var funcoes = (ctx.modulos || []).filter(function (m) { return m.habilitado; }).map(function (m) { return m.nome; });
    linhas.push("Funções ligadas: " + (funcoes.join(", ") || "nenhuma"));
    linhas.push("Navegador: " + navegadorCurto());

    var diag = raiz.MeedsSuiteDiagnostico;
    if (diag && typeof diag.escopoDeExecucao === "function") {
      linhas.push(
        "Execução: " +
          (diag.escopoDeExecucao() === "pagina"
            ? "funcionando com todos os sinais"
            : "modo restrito (o navegador isolou o Assistente)")
      );
    }

    linhas.push("");
    linhas.push(
      "Rede, últimos 15 min: " + totalChamadas + " chamada(s) observada(s), " + totalFalhas + " falharam"
    );
    if (redeBuffer.length) {
      redeBuffer.forEach(function (e) {
        linhas.push("  " + horaCurta(e.ts) + "  " + e.metodo + "  " + e.caminho + "  → " + (e.status || "sem resposta"));
      });
    } else {
      linhas.push("  (nenhuma chamada com falha nesta janela)");
    }

    linhas.push("");
    linhas.push("Avisos do Assistente, últimos 15 min:");
    if (consoleBuffer.length) {
      consoleBuffer.forEach(function (e) {
        linhas.push("  " + horaCurta(e.ts) + "  " + e.texto);
      });
    } else {
      linhas.push("  (nenhum)");
    }

    linhas.push("");
    linhas.push("---");
    linhas.push("Nenhum dado de paciente está neste texto — nem nome, nem CPF, nem conteúdo de formulário.");

    return linhas.join("\n");
  }

  /* ------------------------------------------------------------------
   * CÓPIA — mesmo caminho de core/feedback.js: área de transferência,
   * com reserva via textarea para navegador antigo.
   * ------------------------------------------------------------------ */
  function copiarFallback(texto, aoCopiar, aoFalhar) {
    try {
      var ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      aoCopiar();
    } catch (e) {
      aoFalhar();
    }
  }

  function copiar(ctx, aoCopiar, aoFalhar) {
    var texto = montarRelatorio(ctx);
    if (raiz.navigator && raiz.navigator.clipboard && raiz.navigator.clipboard.writeText) {
      raiz.navigator.clipboard.writeText(texto).then(aoCopiar, function () {
        copiarFallback(texto, aoCopiar, aoFalhar);
      });
    } else {
      copiarFallback(texto, aoCopiar, aoFalhar);
    }
  }

  raiz.MeedsSuiteDiagnosticoTecnico = {
    instalar: instalar,
    montarRelatorio: montarRelatorio,
    copiar: copiar,
    /* exposto so para o teste */
    _mascararDigitos: mascararDigitos,
    _caminhoSemQuery: caminhoSemQuery,
    _comecaComRotuloNosso: comecaComRotuloNosso,
    _estado: function () {
      return { redeBuffer: redeBuffer, consoleBuffer: consoleBuffer, totalChamadas: totalChamadas, totalFalhas: totalFalhas };
    },
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
