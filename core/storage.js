/* ------------------------------------------------------------------
 * core/storage.js — configuracao por modulo, namespaced
 * ------------------------------------------------------------------
 * REQUISITO DE SEGURANCA HERDADO DOS 5 SCRIPTS ORIGINAIS: e proibido
 * gravar em disco qualquer dado de PACIENTE (nome, CPF, id de
 * atendimento). Este storage existe so para PREFERENCIA DE USO do
 * medico (modulo ligado/desligado, som do alarme, volume, lista de
 * medicos cadastrados nesta maquina). Nada aqui sai do navegador.
 *
 * Todas as chaves sao prefixadas com "meeds-suite:" e depois com o id
 * do modulo, entao dois modulos nunca colidem e o painel de
 * gerenciamento consegue limpar tudo de uma vez se precisar.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var PREFIXO = "meeds-suite:";

  function chaveDe(idModulo, nome) {
    return PREFIXO + idModulo + ":" + nome;
  }

  function lerBruto(chave, padrao) {
    try {
      var cru = localStorage.getItem(chave);
      if (cru === null) return padrao;
      return JSON.parse(cru);
    } catch (e) {
      return padrao;
    }
  }

  function gravarBruto(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
      return true;
    } catch (e) {
      // modo privado / quota estourada: a preferencia simplesmente nao
      // sobrevive ao F5, mas nada quebra.
      return false;
    }
  }

  function removerBruto(chave) {
    try {
      localStorage.removeItem(chave);
    } catch (e) {
      /* silencioso */
    }
  }

  /* Storage do NUCLEO (usado pelo manager para saber quais modulos
   * estao habilitados). Fica sob o id reservado "_core". */
  function storageDoNucleo() {
    return criarStorage("_core");
  }

  /* Storage entregue a cada modulo em start({ storage }). O modulo nao
   * consegue (nem precisa) enxergar as chaves de outro modulo. */
  function criarStorage(idModulo) {
    return {
      id: idModulo,

      ler: function (nome, padrao) {
        return lerBruto(chaveDe(idModulo, nome), padrao);
      },

      gravar: function (nome, valor) {
        return gravarBruto(chaveDe(idModulo, nome), valor);
      },

      remover: function (nome) {
        removerBruto(chaveDe(idModulo, nome));
      },

      /* Le um objeto de config aplicando os padroes do modulo por cima
       * do que estiver salvo — mesmo comportamento do carregarConfig()
       * original do alarme de fila. */
      lerConfig: function (configPadrao) {
        var salvo = lerBruto(chaveDe(idModulo, "config"), {});
        var saida = {};
        var k;
        for (k in configPadrao) {
          if (Object.prototype.hasOwnProperty.call(configPadrao, k)) saida[k] = configPadrao[k];
        }
        if (salvo && typeof salvo === "object") {
          for (k in salvo) {
            if (Object.prototype.hasOwnProperty.call(salvo, k)) saida[k] = salvo[k];
          }
        }
        return saida;
      },

      gravarConfig: function (config) {
        return gravarBruto(chaveDe(idModulo, "config"), config);
      },
    };
  }

  raiz.MeedsSuiteStorage = {
    criarStorage: criarStorage,
    storageDoNucleo: storageDoNucleo,
    PREFIXO: PREFIXO,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
