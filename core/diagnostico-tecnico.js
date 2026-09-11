/* ------------------------------------------------------------------
 * core/diagnostico-tecnico.js — "copiar diagnóstico técnico"
 * ------------------------------------------------------------------
 * PARA QUE SERVE
 * Quando algo dá errado (a Memed não abre, um laudo não gera), a
 * primeira pergunta de quem vai investigar é sempre "o que apareceu no
 * console e na rede?" — e o médico não tem como responder isso. Este
 * arquivo mantém, em memória, um resumo do que aconteceu nos últimos 20
 * minutos, para virar um texto pronto de colar no WhatsApp ou e-mail com
 * um clique em ⚙️ → Sobre → "Copiar diagnóstico técnico".
 *
 * V1 (v2.43.0) SÓ TROUXE METADADO — SEM CORPO, SEM QUERY STRING, SÓ
 * CONSOLE NOSSO. Testado em campo, não bastou: faltava exatamente o que
 * um Jam grava — a resposta inteira, a URL inteira, o console inteiro —
 * porque é ali que normalmente aparece "por que a Memed recusou".
 *
 * A CORREÇÃO (v2.43.1): o destino é interno — quem lê este texto é quem
 * já teria acesso a uma gravação de Jam do mesmo instante. Então o
 * cálculo de risco muda, e foi uma decisão explícita, não um relaxamento
 * por conveniência: agora entram URL completa (com query string),
 * console inteiro (não só o nosso) e o corpo das respostas de rede,
 * truncado para o texto não ficar gigante.
 *
 * O QUE CONTINUA VALENDO, MESMO ASSIM
 * Uma trava barata e redundante não é a mesma coisa que confiar demais:
 * qualquer sequência de 6+ dígitos seguidos (CPF, CNS, CNES, telefone,
 * data numérica) continua mascarada em TUDO que entra no texto —
 * inclusive na query string e no corpo, que agora aparecem inteiros. Não
 * esconde evento nenhum (a mensagem de erro ao redor do número continua
 * visível); só evita um CPF inteiro solto num texto que vai ser colado
 * num WhatsApp. Mesmo espírito das duas travas de `core/modelos.js`
 * (D31): desconfiar duas vezes custa pouco.
 *
 * NADA AQUI VAI PARA SERVIDOR NENHUM. O texto monta na memória do
 * navegador e só sai quando alguém aperta "Copiar" — mesmo caminho
 * (área de transferência) que `core/feedback.js` já usa.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var JANELA_MS = 20 * 60 * 1000; // so o que aconteceu nos ultimos 20 min
  var LIMITE_REDE = 60;
  var LIMITE_CONSOLE = 60;
  var LIMITE_CORPO = 500; // caracteres por corpo de resposta, truncado
  var LIMITE_LINHA_CONSOLE = 500;

  var redeBuffer = [];
  var consoleBuffer = [];
  var totalChamadas = 0;
  var totalFalhas = 0;
  var instalado = false;

  /* Mascara qualquer sequencia longa de digito — CPF (11), CNS (15),
   * CNES (7), telefone, data numerica. Mantem so as pontas, para quem le
   * ainda enxergar "e um numero de X digitos" sem o numero inteiro.
   * Roda em CIMA de tudo que entra no buffer — URL, corpo, console —
   * mesmo agora que o resto entra sem filtro de conteudo. */
  function mascararDigitos(texto) {
    return String(texto == null ? "" : texto).replace(/\d{6,}/g, function (seq) {
      return seq.slice(0, 2) + "…" + seq.slice(-2) + "(" + seq.length + "díg)";
    });
  }

  function truncar(texto, limite) {
    var s = String(texto == null ? "" : texto);
    return s.length > limite ? s.slice(0, limite) + "… (+" + (s.length - limite) + " car.)" : s;
  }

  function podar(lista) {
    var limite = Date.now() - JANELA_MS;
    while (lista.length && lista[0].ts < limite) lista.shift();
  }

  /* ------------------------------------------------------------------
   * SINAL 1: toda chamada de rede — sucesso e falha, como um Jam grava
   * ------------------------------------------------------------------ */
  function assinarRede() {
    if (!raiz.MeedsSuiteNetwork || typeof raiz.MeedsSuiteNetwork.assinar !== "function") return;
    raiz.MeedsSuiteNetwork.assinar(
      { regex: /.*/, idModulo: "diagnostico-tecnico" },
      function (evt) {
        totalChamadas++;
        var falhou = evt.status === 0 || evt.status >= 400;
        if (falhou) totalFalhas++;
        redeBuffer.push({
          ts: Date.now(),
          metodo: evt.metodo,
          url: mascararDigitos(evt.url),
          status: evt.status,
          falhou: falhou,
          corpo: mascararDigitos(truncar(evt.corpo, LIMITE_CORPO)),
        });
        podar(redeBuffer);
        if (redeBuffer.length > LIMITE_REDE) redeBuffer.shift();
      }
    );
  }

  /* ------------------------------------------------------------------
   * SINAL 2: console inteiro — o nosso e o da página
   * ------------------------------------------------------------------ */
  function instalarEscutaDeConsole() {
    ["log", "info", "debug", "warn", "error"].forEach(function (nivel) {
      var original = console[nivel];
      if (typeof original !== "function") return;
      console[nivel] = function () {
        try {
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
          consoleBuffer.push({
            ts: Date.now(),
            nivel: nivel,
            texto: mascararDigitos(truncar(texto, LIMITE_LINHA_CONSOLE)),
          });
          podar(consoleBuffer);
          if (consoleBuffer.length > LIMITE_CONSOLE) consoleBuffer.shift();
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
    linhas.push("Assistente Meeds — diagnóstico técnico (uso interno)");
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
      "Rede, últimos 20 min: " + totalChamadas + " chamada(s) observada(s), " + totalFalhas + " falharam"
    );
    if (redeBuffer.length) {
      redeBuffer.forEach(function (e) {
        linhas.push(
          "  " + horaCurta(e.ts) + "  " + (e.falhou ? "❌" : "  ") + " " + e.metodo + "  " +
          e.url + "  → " + (e.status || "sem resposta")
        );
        if (e.corpo) linhas.push("      corpo: " + e.corpo);
      });
    } else {
      linhas.push("  (nenhuma chamada observada nesta janela)");
    }

    linhas.push("");
    linhas.push("Console, últimos 20 min:");
    if (consoleBuffer.length) {
      consoleBuffer.forEach(function (e) {
        linhas.push("  " + horaCurta(e.ts) + "  [" + e.nivel + "]  " + e.texto);
      });
    } else {
      linhas.push("  (nenhuma linha nesta janela)");
    }

    linhas.push("");
    linhas.push("---");
    linhas.push(
      "Uso interno — este texto pode conter dado de tela (URL, resposta de API, mensagem de console). " +
      "Números com 6+ dígitos (CPF/CNS/CNES/telefone/data) saem mascarados, mas o resto do conteúdo é literal."
    );

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
    _truncar: truncar,
    _estado: function () {
      return { redeBuffer: redeBuffer, consoleBuffer: consoleBuffer, totalChamadas: totalChamadas, totalFalhas: totalFalhas };
    },
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
