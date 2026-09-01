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
 *
 * POR QUE ISTO NAO E MAIS localStorage PURO (v2.14.0)
 * Ate a v2.13.1 estas preferencias viviam so no localStorage, com a
 * justificativa de que "preferencia corriqueira" nao precisava da mesma
 * durabilidade do cadastro de medicos. Estava errado, e o plantao
 * mostrou onde: o Meeds limpa o localStorage no logout, como quase todo
 * sistema com login faz. No proximo acesso o Assistente nao achava nada
 * salvo, caia no padrao de fabrica — e o padrao de fabrica e TUDO
 * LIGADO. Resultado: todos os botoes de volta na tela, toda vez.
 *
 * Agora vale a mesma regra do cadastro: GM_setValue quando existe, que
 * e armazenamento do Tampermonkey e nao do site, e por isso sobrevive a
 * logout, a limpeza de dados do site e a atualizacao do script.
 *
 * AS CHAVES NAO MUDARAM. Continuam "meeds-suite:<modulo>:<nome>", so
 * mudou onde elas moram. Quem ja tinha preferencia salva no
 * localStorage nao perde nada: migrarSeNecessario() copia para o GM na
 * primeira leitura.
 *
 * LIMITACAO CONHECIDA (Safari/iPad): la o script roda com @grant none e
 * nao existe GM_setValue, entao continua valendo o localStorage e o
 * problema do logout permanece. Resolver isso exige um armazenamento
 * assincrono (IndexedDB) e uma API de leitura assincrona, o que mudaria
 * a assinatura usada por todos os modulos. Fica registrado como
 * pendencia, nao como esquecimento.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var PREFIXO = "meeds-suite:";

  function chaveDe(idModulo, nome) {
    return PREFIXO + idModulo + ":" + nome;
  }

  function temGM() {
    return typeof GM_getValue === "function" && typeof GM_setValue === "function";
  }

  /* ---- camada do site (volatil: o logout do Meeds apaga) ---- */

  function lerLocal(chave, padrao) {
    try {
      var cru = localStorage.getItem(chave);
      if (cru === null) return padrao;
      return JSON.parse(cru);
    } catch (e) {
      return padrao;
    }
  }

  function gravarLocal(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
      return true;
    } catch (e) {
      // modo privado / quota estourada: a preferencia simplesmente nao
      // sobrevive ao F5, mas nada quebra.
      return false;
    }
  }

  function removerLocal(chave) {
    try {
      localStorage.removeItem(chave);
    } catch (e) {
      /* silencioso */
    }
  }

  /* ---- camada duravel (armazenamento do gerenciador de scripts) ---- */

  /* Marcador de ausencia. Nao da para usar undefined: uma preferencia
   * pode legitimamente ter sido gravada como undefined, e precisamos
   * distinguir "nunca gravado" de "gravado vazio" — e essa distincao
   * que decide se a migracao roda. */
  var VAZIO = { __meedsVazio: true };

  /* Comparar por identidade nao basta. GM_getValue devolve o proprio
   * objeto padrao quando a chave nao existe (identidade bate), mas um
   * VAZIO que tenha sido GRAVADO volta desserializado — outro objeto,
   * mesmo conteudo. As duas formas significam "nao ha valor". */
  function ehVazio(v) {
    return v === VAZIO || (v !== null && typeof v === "object" && v.__meedsVazio === true);
  }

  function lerDuravel(chave) {
    if (!temGM()) return VAZIO;
    try {
      return GM_getValue(chave, VAZIO);
    } catch (e) {
      return VAZIO;
    }
  }

  function gravarDuravel(chave, valor) {
    if (!temGM()) return false;
    try {
      GM_setValue(chave, valor);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* Copia para o armazenamento duravel o que ficou para tras no
   * localStorage, uma chave por vez, na primeira vez que ela e lida.
   *
   * A ordem aqui e deliberada: so apaga do localStorage DEPOIS de
   * confirmar que a gravacao duravel deu certo. Se apagasse antes e a
   * gravacao falhasse (quota, GM indisponivel), a preferencia sumiria
   * das duas pontas — trocariamos um incomodo por uma perda. */
  function migrarSeNecessario(chave) {
    if (!temGM()) return VAZIO;
    var duravel = lerDuravel(chave);
    if (!ehVazio(duravel)) return duravel;

    var antigo = lerLocal(chave, VAZIO);
    if (ehVazio(antigo)) return VAZIO;

    if (gravarDuravel(chave, antigo)) removerLocal(chave);
    return antigo;
  }

  /* ---- API interna usada pelos storages por modulo ---- */

  function lerBruto(chave, padrao) {
    var valor = migrarSeNecessario(chave);
    if (!ehVazio(valor)) return valor;
    /* sem GM (Safari/iPad) ou nada gravado ainda: cai para o site */
    return lerLocal(chave, padrao);
  }

  function gravarBruto(chave, valor) {
    if (gravarDuravel(chave, valor)) {
      /* Uma unica fonte de verdade. Se sobrasse copia no localStorage,
       * ela viraria um valor fantasma esperando o dia em que o GM
       * falhasse para ressuscitar uma preferencia antiga. */
      removerLocal(chave);
      return true;
    }
    return gravarLocal(chave, valor);
  }

  function removerBruto(chave) {
    if (temGM()) {
      try {
        if (typeof GM_deleteValue === "function") GM_deleteValue(chave);
        else GM_setValue(chave, VAZIO);
      } catch (e) {
        /* silencioso */
      }
    }
    removerLocal(chave);
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
