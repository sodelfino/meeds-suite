/* ------------------------------------------------------------------
 * core/cadastro.js — cadastro de medicos (dado pessoal, fora do codigo)
 * ------------------------------------------------------------------
 * POR QUE ESTE ARQUIVO EXISTE
 * Ate a v2.0.1, nome/CRM/CPF de 6 medicos ficavam escritos dentro de
 * modules/lme-sete-lagoas/index.js e modules/cmd/index.js, e nome/CNS de
 * 3 medicos em modules/apac-itauna/index.js. Com o repositorio publico,
 * isso e dado pessoal exposto. Agora o cadastro vive SO no navegador do
 * proprio medico.
 *
 * TRES DECISOES QUE IMPORTAM PARA A MANUTENCAO
 *
 * 1. CADASTRO UNICO, NAO UM POR MODULO.
 *    Antes, APAC tinha a sua lista (nome+CNS) e LME/CMD tinham outra
 *    (nome+CRM+CPF). O medico teria que se cadastrar duas vezes. Aqui e
 *    UMA ficha por medico, com todos os campos; cada modulo usa o que
 *    precisa. Cadastra uma vez, funciona nos tres geradores.
 *
 * 2. CHAVE FIXA E IMUTAVEL: "medicos".
 *    Nunca troque essa string. Se a estrutura do registro mudar, faca
 *    MIGRACAO (le o formato antigo, grava o novo, apaga o antigo) — e o
 *    que migrarSeNecessario() faz. Trocar a chave faria o medico perder
 *    o cadastro numa atualizacao, que e exatamente o que nao pode
 *    acontecer.
 *
 * 3. ATUALIZAR O SCRIPT NAO APAGA O CADASTRO.
 *    GM_setValue guarda o dado no armazenamento do Tampermonkey, que e
 *    independente da versao do userscript e sobrevive a atualizacao
 *    automatica, a limpeza de cache e a limpeza de cookies do site.
 *    (localStorage NAO daria essa garantia: o Meeds apaga o
 *    localStorage no logout, e "limpar dados do site" apagaria o
 *    resto.) Desde a v2.14.0 as preferencias de uso seguem a MESMA
 *    regra, em core/storage.js — antes elas ficavam em localStorage e
 *    o medico perdia a configuracao a cada logout.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  /* NUNCA TROQUE ESTAS CHAVES. Ver decisao 2 acima. */
  var CHAVE = "medicos";
  var CHAVE_ESTABELECIMENTOS = "estabelecimentos";

  /* Chaves de formatos anteriores, lidas uma vez e apagadas depois de
   * migradas. Nao remova daqui sem ter certeza de que nenhum medico
   * ficou para tras numa versao antiga. */
  var CHAVES_ANTIGAS = ["apac_medicos_v1"];

  var VERSAO_ESTRUTURA = 1;

  /* Uma linha por chave, e o resto e problema de core/storage.js:
   * ele decide entre GM (Tampermonkey) e IndexedDB (Safari/iPad) e
   * migra o que ficou no localStorage. Este arquivo tinha a sua propria
   * copia dessa logica ate a v2.14.0, e era ela que fazia o cadastro
   * evaporar no logout do iPad. */
  function porta(chave) {
    return raiz.MeedsSuiteStorage.duravel(chave, "meeds-suite:" + chave);
  }

  function lerBruto(chave, padrao) {
    return porta(chave).ler(padrao);
  }

  function gravarBruto(chave, valor) {
    return porta(chave).gravar(valor);
  }

  function apagarBruto(chave) {
    porta(chave).remover();
  }

  /* --- normalizacao de uma ficha ---
   * Aceita o formato novo (objeto) e os dois formatos antigos de par
   * ([nome, cns] do APAC e [nome, crm, cpf] do LME/CMD). */
  function normalizarFicha(item) {
    if (!item) return null;

    if (Array.isArray(item)) {
      // [nome, cns] — formato antigo do APAC. O CNS nao e mais usado
      // (ver abaixo), entao so o nome sobrevive: o medico completa o CPF.
      if (item.length === 2) {
        return { nome: String(item[0] || "").trim(), crm: "", cpf: "" };
      }
      // [nome, crm, cpf] — formato antigo de LME/CMD
      return {
        nome: String(item[0] || "").trim(),
        crm: String(item[1] || "").trim(),
        cpf: String(item[2] || "").trim(),
      };
    }

    if (typeof item === "object") {
      /* O CNS (Cartao Nacional de Saude) FOI REMOVIDO do cadastro.
       * Motivo: o medico raramente sabe o proprio CNS de cabeca, e o
       * formulario da APAC aceita CPF no campo 43/44 — ele tem uma caixa
       * "( ) CNS  ( ) CPF" justamente para isso. Pedir um numero que a
       * pessoa nao tem a mao era travar o cadastro por nada.
       * Um `cns` que venha de cadastro antigo e simplesmente ignorado. */
      return {
        nome: String(item.nome || "").trim(),
        crm: String(item.crm || "").trim(),
        cpf: String(item.cpf || "").trim(),
      };
    }
    return null;
  }

  function chaveDeIdentidade(ficha) {
    return String(ficha.nome || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  /* Mescla duas fichas do mesmo medico sem perder campo preenchido: um
   * cadastro vindo do APAC (so CNS) somado a um vindo do LME (CRM+CPF)
   * vira uma ficha completa. */
  function mesclarFichas(a, b) {
    return {
      nome: a.nome || b.nome,
      crm: a.crm || b.crm,
      cpf: a.cpf || b.cpf,
    };
  }

  function listar() {
    var guardado = lerBruto(CHAVE, null);
    if (!guardado) return [];
    var lista = Array.isArray(guardado) ? guardado : guardado.medicos;
    if (!Array.isArray(lista)) return [];
    return lista.map(normalizarFicha).filter(function (f) {
      return f && f.nome;
    });
  }

  function gravar(lista) {
    return gravarBruto(CHAVE, { versao: VERSAO_ESTRUTURA, medicos: lista });
  }

  function adicionar(ficha) {
    var nova = normalizarFicha(ficha);
    if (!nova || !nova.nome) return { ok: false, erro: "Informe pelo menos o nome do médico." };
    var lista = listar();
    var id = chaveDeIdentidade(nova);
    var existente = -1;
    for (var i = 0; i < lista.length; i++) {
      if (chaveDeIdentidade(lista[i]) === id) existente = i;
    }
    if (existente >= 0) lista[existente] = mesclarFichas(nova, lista[existente]);
    else lista.push(nova);
    gravar(lista);
    return { ok: true, atualizou: existente >= 0 };
  }

  function remover(indice) {
    var lista = listar();
    if (indice < 0 || indice >= lista.length) return false;
    lista.splice(indice, 1);
    gravar(lista);
    return true;
  }

  function estaVazio() {
    return listar().length === 0;
  }

  /* --- MIGRACAO ---
   * Roda uma vez, no start do nucleo. Le os formatos antigos, mescla no
   * formato novo e apaga o antigo. Idempotente: rodar de novo nao
   * duplica nada, porque adicionar() mescla por nome. */
  function migrarSeNecessario() {
    var migrados = 0;
    CHAVES_ANTIGAS.forEach(function (chaveAntiga) {
      var antigo = lerBruto(chaveAntiga, undefined);
      if (!Array.isArray(antigo) || antigo.length === 0) return;
      antigo.forEach(function (item) {
        var f = normalizarFicha(item);
        if (f && f.nome) {
          adicionar(f);
          migrados++;
        }
      });
      apagarBruto(chaveAntiga);
    });
    if (migrados > 0) {
      console.debug("[Assistente Meeds] cadastro migrado do formato antigo:", migrados, "medico(s).");
    }
    return migrados;
  }

  /* --- BACKUP / RESTAURACAO ---
   * Cobre troca de computador ou de navegador, e tambem serve para o
   * administrador preparar UM arquivo com a equipe inteira e distribuir:
   * cada medico importa e ja fica com a lista pronta, sem que nenhum CPF
   * precise entrar no codigo. */
  function exportar() {
    return JSON.stringify(
      {
        _formato: "assistente-meeds/cadastro-medicos",
        _versao: VERSAO_ESTRUTURA,
        _exportadoEm: new Date().toISOString().slice(0, 10),
        medicos: listar(),
      },
      null,
      2
    );
  }

  function importar(textoJson) {
    var dados;
    try {
      dados = JSON.parse(textoJson);
    } catch (e) {
      return { ok: false, erro: "O arquivo não é um backup válido: não consegui ler o conteúdo dele." };
    }
    var lista = Array.isArray(dados) ? dados : dados && dados.medicos;
    if (!Array.isArray(lista)) {
      return {
        ok: false,
        erro: 'O arquivo não parece um backup do Assistente Meeds: não encontrei a lista "medicos" dentro dele.',
      };
    }
    var validos = lista.map(normalizarFicha).filter(function (f) {
      return f && f.nome;
    });
    if (validos.length === 0) {
      return { ok: false, erro: "O backup foi lido, mas não tem nenhum médico com nome preenchido." };
    }
    // acrescenta ao que ja existe, mesclando por nome — restaurar um
    // backup nunca apaga um cadastro que ja estava ali
    validos.forEach(adicionar);
    return { ok: true, quantidade: validos.length };
  }


  /* ------------------------------------------------------------------
   * montarSelect(elemento, opcoes) — o <select> de medico dos laudos
   * ------------------------------------------------------------------
   * Fica aqui, e nao em cada modulo, para que um sexto gerador de laudo
   * ganhe o mesmo comportamento de graca. Os modulos so dizem onde e o
   * que fazer quando o medico e escolhido.
   *
   * MENOS CLIQUES: se houver exatamente UM medico cadastrado neste
   * navegador, ele ja vem selecionado — o caso comum e o medico usar o
   * proprio computador. Com dois ou mais, NAO escolhemos nenhum: seria
   * adivinhar de quem e a assinatura do laudo, e assinatura errada e um
   * erro caro. E a mesma filosofia do resto do sistema (nao decidir sob
   * ambiguidade).
   *
   * opcoes = {
   *   aoEscolher(ficha | null),   // ficha escolhida, ou null ao limpar
   *   aoPedirCadastro(),          // abrir o painel de cadastro
   * }
   * ------------------------------------------------------------------ */
  var VALOR_CADASTRAR = "__cadastrar";

  function montarSelect(elemento, opcoes) {
    opcoes = opcoes || {};

    function atualizar() {
      var lista = listar();
      var anterior = elemento.value;
      elemento.innerHTML = "";

      var ph = document.createElement("option");
      ph.value = "";
      ph.textContent = lista.length ? "Selecione o médico…" : "Nenhum médico cadastrado ainda";
      ph.disabled = true;
      ph.selected = true;
      elemento.appendChild(ph);

      lista.forEach(function (ficha, i) {
        var op = document.createElement("option");
        op.value = String(i);
        op.textContent = ficha.nome;
        elemento.appendChild(op);
      });

      var cadastrar = document.createElement("option");
      cadastrar.value = VALOR_CADASTRAR;
      cadastrar.textContent = lista.length ? "＋ Cadastrar outro médico…" : "＋ Cadastrar médico…";
      elemento.appendChild(cadastrar);

      // um so cadastrado: ja seleciona (ver comentario acima)
      if (lista.length === 1) {
        elemento.value = "0";
        if (typeof opcoes.aoEscolher === "function") opcoes.aoEscolher(lista[0]);
      } else if (anterior && anterior !== VALOR_CADASTRAR && lista[Number(anterior)]) {
        elemento.value = anterior;
      }
    }

    elemento.addEventListener("change", function () {
      if (elemento.value === VALOR_CADASTRAR) {
        elemento.value = "";
        if (typeof opcoes.aoPedirCadastro === "function") opcoes.aoPedirCadastro();
        if (typeof opcoes.aoEscolher === "function") opcoes.aoEscolher(null);
        return;
      }
      var ficha = listar()[Number(elemento.value)];
      if (typeof opcoes.aoEscolher === "function") opcoes.aoEscolher(ficha || null);
    });

    atualizar();

    return {
      atualizar: atualizar,
      limpar: function () {
        elemento.value = "";
        if (typeof opcoes.aoEscolher === "function") opcoes.aoEscolher(null);
      },
      escolhido: function () {
        return listar()[Number(elemento.value)] || null;
      },
    };
  }


  /* ------------------------------------------------------------------
   * ESTABELECIMENTOS (nome + CNES)
   * ------------------------------------------------------------------
   * Mesmo desenho do cadastro de medicos: vive no navegador, chave fixa,
   * sobrevive a atualizacao. Antes o estabelecimento da APAC vinha fixo
   * de dados/formularios.json e o medico que atendia por outra unidade
   * tinha que digitar nome e CNES a cada laudo.
   *
   * A lista de dados/formularios.json continua servindo de SEMENTE: na
   * primeira execucao ela e copiada para ca, e a partir dai quem manda e
   * o que o medico cadastrou.
   * ------------------------------------------------------------------ */
  function normalizarEstabelecimento(item) {
    if (!item || typeof item !== "object") return null;
    return {
      nome: String(item.nome || "").trim(),
      cnes: String(item.cnes || "").replace(/\D/g, "").trim(),
    };
  }

  function listarEstabelecimentos() {
    var guardado = lerBruto(CHAVE_ESTABELECIMENTOS, null);
    var lista = guardado && (Array.isArray(guardado) ? guardado : guardado.estabelecimentos);
    if (!Array.isArray(lista)) return [];
    return lista.map(normalizarEstabelecimento).filter(function (e) {
      return e && e.nome;
    });
  }

  function gravarEstabelecimentos(lista) {
    return gravarBruto(CHAVE_ESTABELECIMENTOS, { versao: VERSAO_ESTRUTURA, estabelecimentos: lista });
  }

  function adicionarEstabelecimento(item) {
    var novo = normalizarEstabelecimento(item);
    if (!novo || !novo.nome) return { ok: false, erro: "Informe o nome do estabelecimento." };
    var lista = listarEstabelecimentos();
    var id = novo.nome.toLowerCase();
    var existente = -1;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].nome.toLowerCase() === id) existente = i;
    }
    if (existente >= 0) lista[existente] = { nome: novo.nome, cnes: novo.cnes || lista[existente].cnes };
    else lista.push(novo);
    gravarEstabelecimentos(lista);
    return { ok: true, atualizou: existente >= 0 };
  }

  function removerEstabelecimento(indice) {
    var lista = listarEstabelecimentos();
    if (indice < 0 || indice >= lista.length) return false;
    lista.splice(indice, 1);
    gravarEstabelecimentos(lista);
    return true;
  }

  /* Copia a semente de dados/formularios.json na primeira execucao. Roda
   * uma vez: depois disso a lista do medico e a que vale, mesmo que ele
   * tenha apagado tudo (por isso a marca separada, e nao "lista vazia"). */
  function semearEstabelecimentos(sementes) {
    if (lerBruto("estabelecimentosSemeados", false)) return 0;
    var n = 0;
    (sementes || []).forEach(function (s) {
      if (s && s.nome) {
        adicionarEstabelecimento(s);
        n++;
      }
    });
    gravarBruto("estabelecimentosSemeados", true);
    return n;
  }

  raiz.MeedsSuiteCadastro = {
    CHAVE: CHAVE,
    listar: listar,
    adicionar: adicionar,
    remover: remover,
    estaVazio: estaVazio,
    migrarSeNecessario: migrarSeNecessario,
    exportar: exportar,
    importar: importar,
    normalizarFicha: normalizarFicha,
    montarSelect: montarSelect,
    listarEstabelecimentos: listarEstabelecimentos,
    adicionarEstabelecimento: adicionarEstabelecimento,
    removerEstabelecimento: removerEstabelecimento,
    semearEstabelecimentos: semearEstabelecimentos,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
