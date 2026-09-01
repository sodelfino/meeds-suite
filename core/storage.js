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
 * E NO SAFARI/iPAD (v2.15.0)
 * La o script roda com @grant none e GM_setValue nao existe (ver D38).
 * O substituto e o IndexedDB, que e armazenamento separado do
 * localStorage e por isso NAO cai junto no logout do Meeds.
 *
 * O IndexedDB e assincrono e este `ler()` e sincrono — usado por todos
 * os modulos dentro de start(). Tornar tudo assincrono mudaria a
 * assinatura do contrato de modulo, ou seja, mexeria em codigo que hoje
 * funciona, para resolver um problema que e de armazenamento. Em vez
 * disso: CARREGA UMA VEZ NO BOOT e serve de memoria depois. A escrita e
 * que vai para o disco em segundo plano.
 *
 * O preco disso e uma regra que o nucleo precisa respeitar:
 * `carregar()` tem que terminar ANTES do primeiro modulo subir, senao o
 * modulo le um cache vazio e liga sozinho. E o que core.user.js faz.
 *
 * Onde ha GM_setValue (Tampermonkey), nada disso entra em cena: o
 * caminho continua sincrono e direto, como sempre foi.
 *
 * LIMITACAO QUE PERMANECE: o Safari apaga armazenamento de sites que
 * ficam 7 dias sem uso. Para quem abre o Meeds no plantao isso nunca
 * dispara, mas depois de umas ferias longas a configuracao volta ao
 * padrao. Nao ha como contornar pelo script — e politica do navegador.
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

  /* ---- camada do IndexedDB (Safari/iPad, onde nao ha GM) ----
   *
   * So entra em cena quando temGM() e falso. O cache em memoria e a
   * fonte que `ler()` consulta; o IndexedDB e o disco por tras dele. */

  var BANCO = "meeds-suite";
  var DEPOSITO = "preferencias";
  var cache = null; /* null = ainda nao carregado */
  var bancoAberto = null;

  function abrirBanco() {
    if (bancoAberto) return bancoAberto;
    bancoAberto = new Promise(function (resolver) {
      var idb = typeof indexedDB !== "undefined" ? indexedDB : null;
      if (!idb) return resolver(null);
      var req;
      try {
        req = idb.open(BANCO, 1);
      } catch (e) {
        return resolver(null);
      }
      req.onupgradeneeded = function () {
        try {
          if (!req.result.objectStoreNames.contains(DEPOSITO)) req.result.createObjectStore(DEPOSITO);
        } catch (e) {
          /* silencioso: resolve como null adiante */
        }
      };
      req.onsuccess = function () {
        resolver(req.result);
      };
      req.onerror = function () {
        resolver(null);
      };
      /* Navegacao privada no Safari pode deixar a requisicao pendurada
       * sem sucesso nem erro. Sem este limite, o nucleo nunca subiria —
       * o Assistente ficaria invisivel, que e pior que nao ser
       * duravel. */
      setTimeout(function () {
        resolver(null);
      }, 3000);
    });
    return bancoAberto;
  }

  function gravarNoBanco(chave, valor) {
    abrirBanco().then(function (db) {
      if (!db) return;
      try {
        var tx = db.transaction(DEPOSITO, "readwrite");
        tx.objectStore(DEPOSITO).put(valor, chave);
      } catch (e) {
        /* preferencia nao persistiu; o cache em memoria segue valendo
         * ate o fim da sessao */
      }
    });
  }

  function apagarDoBanco(chave) {
    abrirBanco().then(function (db) {
      if (!db) return;
      try {
        db.transaction(DEPOSITO, "readwrite").objectStore(DEPOSITO)["delete"](chave);
      } catch (e) {
        /* silencioso */
      }
    });
  }

  /* Le TUDO para a memoria e migra o que tiver ficado no localStorage.
   * Devolve uma Promise que o nucleo espera antes de subir modulo. */
  function carregar() {
    if (cache) return Promise.resolve();
    if (temGM()) {
      /* Caminho do Tampermonkey: leitura sincrona, sem cache. */
      cache = null;
      return Promise.resolve();
    }
    return abrirBanco().then(function (db) {
      var mapa = {};
      return new Promise(function (resolver) {
        if (!db) return resolver(mapa);
        var req;
        try {
          req = db.transaction(DEPOSITO, "readonly").objectStore(DEPOSITO).openCursor();
        } catch (e) {
          return resolver(mapa);
        }
        req.onsuccess = function () {
          var c = req.result;
          if (!c) return resolver(mapa);
          mapa[c.key] = c.value;
          c["continue"]();
        };
        req.onerror = function () {
          resolver(mapa);
        };
      });
    }).then(function (mapa) {
      cache = mapa;
      migrarLocalParaBanco();
    });
  }

  /* Quem ja usava o Assistente no iPad tem preferencia no localStorage.
   * Copia para o banco o que ainda nao esta la — e, como na migracao do
   * Tampermonkey, so limpa a origem depois de a copia existir. */
  function migrarLocalParaBanco() {
    var pendentes = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIXO) === 0 && !Object.prototype.hasOwnProperty.call(cache, k)) pendentes.push(k);
      }
    } catch (e) {
      return;
    }
    pendentes.forEach(function (k) {
      var v = lerLocal(k, VAZIO);
      if (ehVazio(v)) return;
      cache[k] = v;
      gravarNoBanco(k, v);
      removerLocal(k);
    });
  }

  /* ---- API interna usada pelos storages por modulo ---- */

  function lerBruto(chave, padrao) {
    var valor = migrarSeNecessario(chave);
    if (!ehVazio(valor)) return valor;
    /* Safari/iPad: o cache foi preenchido por carregar() no boot. */
    if (cache && Object.prototype.hasOwnProperty.call(cache, chave)) return cache[chave];
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
    if (cache) {
      /* Grava na memoria AGORA e no disco em segundo plano: a proxima
       * leitura desta sessao nao pode depender do banco ter respondido. */
      cache[chave] = valor;
      gravarNoBanco(chave, valor);
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
    if (cache) {
      delete cache[chave];
      apagarDoBanco(chave);
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

  /* ------------------------------------------------------------------
   * ARMAZENAMENTO DURAVEL COMPARTILHADO
   * ------------------------------------------------------------------
   * Ate a v2.14.0 cadastro.js, historico.js, novidades.js e
   * diagnostico.js tinham CADA UM a sua copia do par "GM se existir,
   * senao localStorage". No Tampermonkey isso funcionava, entao a
   * duplicacao passou despercebida. No iPad nao ha GM: os quatro caiam
   * no localStorage, e o logout do Meeds levava junto o cadastro de
   * medicos, o historico e ate a marca de "ja vi as boas-vindas".
   *
   * Agora existe um caminho so, e e este. Quem precisa de durabilidade
   * pede um `duravel(chaveGM, chaveLocal)` e esquece onde o dado mora.
   *
   * POR QUE DUAS CHAVES. Os dois formatos ja existem no navegador dos
   * medicos e nao podem mudar: as preferencias por modulo sempre usaram
   * a chave COM prefixo tambem no GM, enquanto o cadastro usa "medicos"
   * pelado no GM e "meeds-suite:medicos" no localStorage. Unificar
   * agora significaria um medico abrir o Assistente e nao encontrar o
   * proprio cadastro — que e exatamente o que a regra de chave fixa e
   * imutavel existe para impedir. Entao a camada aceita o par.
   * ------------------------------------------------------------------ */
  function duravel(chaveGM, chaveLocal) {
    return {
      ler: function (padrao) {
        if (temGM()) {
          var v = lerDuravel(chaveGM);
          if (!ehVazio(v)) return v;
        }
        if (cache && Object.prototype.hasOwnProperty.call(cache, chaveLocal)) return cache[chaveLocal];

        var antigo = lerLocal(chaveLocal, VAZIO);
        if (ehVazio(antigo)) return padrao;

        /* Achou so no localStorage: promove para o duravel AGORA. Sem
         * isto, um dado que e escrito uma vez e depois so lido — a marca
         * de "ja vi as boas-vindas" e o caso exato — nunca migraria, e
         * seria apagado no proximo logout. Migrar na leitura resolve
         * para qualquer chave, inclusive as que nao usam o prefixo e
         * portanto escapam da varredura do boot. */
        if (cache) {
          cache[chaveLocal] = antigo;
          gravarNoBanco(chaveLocal, antigo);
          removerLocal(chaveLocal);
        } else if (gravarDuravel(chaveGM, antigo)) {
          removerLocal(chaveLocal);
        }
        return antigo;
      },

      gravar: function (valor) {
        if (gravarDuravel(chaveGM, valor)) {
          removerLocal(chaveLocal);
          return true;
        }
        if (cache) {
          cache[chaveLocal] = valor;
          gravarNoBanco(chaveLocal, valor);
          removerLocal(chaveLocal);
          return true;
        }
        return gravarLocal(chaveLocal, valor);
      },

      remover: function () {
        if (temGM()) {
          try {
            if (typeof GM_deleteValue === "function") GM_deleteValue(chaveGM);
          } catch (e) {
            /* silencioso */
          }
        }
        if (cache) {
          delete cache[chaveLocal];
          apagarDoBanco(chaveLocal);
        }
        removerLocal(chaveLocal);
      },
    };
  }

  /* Uma frase para o painel "Sobre". Diagnosticar "sumiu minha
   * configuracao" a distancia depende de saber isto primeiro. */
  function ondeEstaGuardado() {
    if (temGM()) return "duravel";           /* Tampermonkey */
    if (cache && bancoAberto) return "banco"; /* IndexedDB (Safari/iPad) */
    return "sessao";                          /* so localStorage: cai no logout */
  }

  raiz.MeedsSuiteStorage = {
    criarStorage: criarStorage,
    storageDoNucleo: storageDoNucleo,
    carregar: carregar,
    duravel: duravel,
    ondeEstaGuardado: ondeEstaGuardado,
    PREFIXO: PREFIXO,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
