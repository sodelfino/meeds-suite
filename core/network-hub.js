/* ------------------------------------------------------------------
 * core/network-hub.js — hook UNICO de fetch/XHR + barramento de eventos
 * ------------------------------------------------------------------
 * PROBLEMA QUE ESTE ARQUIVO RESOLVE
 * Tres dos cinco scripts originais (alarme de fila, APAC e REMUME)
 * instalavam CADA UM o seu proprio patch em XMLHttpRequest.prototype e
 * em window.fetch. Com os tres instalados, toda chamada da aplicacao
 * atravessava tres camadas de wrapper encadeadas, cada uma clonando e
 * parseando a resposta por conta propria. Alem do desperdicio, a ordem
 * de instalacao passava a importar e desinstalar um deles no meio ficava
 * impossivel sem quebrar os outros.
 *
 * SOLUCAO
 * O nucleo instala o patch UMA unica vez, o mais cedo possivel
 * (@run-at document-start), e publica cada resposta em um barramento.
 * Modulo nenhum toca em fetch/XHR: cada um so ASSINA os padroes de URL
 * que lhe interessam.
 *
 * GARANTIAS QUE O HUB DA AOS MODULOS
 *  - o corpo da resposta e lido no maximo UMA vez por chamada, e so se
 *    existir pelo menos um assinante interessado naquela URL;
 *  - um assinante que lanca excecao nunca derruba os outros nem a
 *    pagina do Meeds (todo callback roda dentro de try/catch);
 *  - o wrapper SEMPRE devolve a Promise/valor original intactos, entao
 *    a aplicacao nao percebe que esta sendo observada;
 *  - assinar() devolve uma funcao de cancelamento, o que torna o
 *    stop() de modulo (desativar sem recarregar a pagina) possivel.
 *
 * PRIVACIDADE: o hub NAO guarda historico de respostas. Ele repassa o
 * corpo para os assinantes no momento da chamada e esquece. Nada e
 * gravado em disco nem enviado para fora do navegador.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var instalado = false;
  var proximoId = 1;
  var assinaturas = []; // { id, regex, metodos, callback, idModulo }

  function normalizarMetodos(metodos) {
    if (!metodos || !metodos.length) return null; // null = qualquer metodo
    return metodos.map(function (m) {
      return String(m).toUpperCase();
    });
  }

  /* assinar({ regex, metodos, idModulo }, callback)
   * callback recebe { url, metodo, status, corpo, json() } */
  function assinar(spec, callback) {
    var registro = {
      id: proximoId++,
      regex: spec.regex,
      metodos: normalizarMetodos(spec.metodos),
      callback: callback,
      idModulo: spec.idModulo || null,
    };
    assinaturas.push(registro);
    return function cancelar() {
      for (var i = assinaturas.length - 1; i >= 0; i--) {
        if (assinaturas[i].id === registro.id) assinaturas.splice(i, 1);
      }
    };
  }

  function cancelarPorModulo(idModulo) {
    for (var i = assinaturas.length - 1; i >= 0; i--) {
      if (assinaturas[i].idModulo === idModulo) assinaturas.splice(i, 1);
    }
  }

  function interessadosEm(url, metodo) {
    var saida = [];
    for (var i = 0; i < assinaturas.length; i++) {
      var a = assinaturas[i];
      if (a.metodos && a.metodos.indexOf(metodo) === -1) continue;
      var bate = false;
      try {
        bate = a.regex.test(url);
      } catch (e) {
        bate = false;
      }
      // regex com flag /g mantem lastIndex entre chamadas e daria falso
      // negativo na chamada seguinte — zeramos por seguranca.
      if (a.regex && typeof a.regex.lastIndex === "number") a.regex.lastIndex = 0;
      if (bate) saida.push(a);
    }
    return saida;
  }

  function publicar(alvos, evento) {
    for (var i = 0; i < alvos.length; i++) {
      try {
        alvos[i].callback(evento);
      } catch (e) {
        // um assinante quebrado nunca pode derrubar os outros nem a pagina
        console.warn("[Meeds Suite] assinante de rede falhou:", alvos[i].idModulo, e);
      }
    }
  }

  function montarEvento(url, metodo, status, corpoTexto) {
    var jsonCache;
    var jsonParseado = false;
    return {
      url: url,
      metodo: metodo,
      status: status,
      corpo: corpoTexto,
      /* parse preguicoso e memoizado: se cinco modulos assinarem a mesma
       * URL, o JSON.parse acontece uma vez so. */
      json: function () {
        if (!jsonParseado) {
          jsonParseado = true;
          try {
            jsonCache = JSON.parse(corpoTexto);
          } catch (e) {
            jsonCache = null;
          }
        }
        return jsonCache;
      },
    };
  }

  function instalar() {
    if (instalado) return;
    instalado = true;

    /* --- XMLHttpRequest --- */
    var xhrOpenOriginal = XMLHttpRequest.prototype.open;
    var xhrSendOriginal = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (metodo, url) {
      this.__msMetodo = metodo;
      this.__msUrl = url;
      return xhrOpenOriginal.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      this.addEventListener("load", function () {
        try {
          var metodo = String(this.__msMetodo || "GET").toUpperCase();
          var url = this.__msUrl || "";
          var alvos = interessadosEm(url, metodo);
          if (!alvos.length) return; // ninguem quer: nem le o corpo
          publicar(alvos, montarEvento(url, metodo, this.status, this.responseText));
        } catch (e) {
          /* silencioso: nunca deve quebrar a pagina do Meeds */
        }
      });
      return xhrSendOriginal.apply(this, arguments);
    };

    /* --- fetch --- */
    if (typeof raiz.fetch === "function") {
      var fetchOriginal = raiz.fetch;
      raiz.fetch = function (input, init) {
        var url = "";
        var metodo = "GET";
        try {
          url = typeof input === "string" ? input : (input && input.url) || "";
          metodo = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
        } catch (e) {
          /* segue com os padroes */
        }

        var promessa = fetchOriginal.apply(this, arguments);

        var alvos = interessadosEm(url, metodo);
        if (alvos.length) {
          promessa
            .then(function (resposta) {
              try {
                if (resposta && resposta.ok) {
                  // .clone() e obrigatorio: consumir o corpo original
                  // deixaria a aplicacao sem resposta para ler.
                  resposta
                    .clone()
                    .text()
                    .then(function (texto) {
                      publicar(alvos, montarEvento(url, metodo, resposta.status, texto));
                    })
                    .catch(function () {});
                }
              } catch (e) {
                /* silencioso */
              }
              return resposta;
            })
            .catch(function () {});
        }

        return promessa; // sempre a promessa original, intacta
      };
    }
  }

  raiz.MeedsSuiteNetwork = {
    instalar: instalar,
    assinar: assinar,
    cancelarPorModulo: cancelarPorModulo,
    _assinaturas: assinaturas,
    estaInstalado: function () {
      return instalado;
    },
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
