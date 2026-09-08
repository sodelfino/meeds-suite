/* ------------------------------------------------------------------
 * core/modelos.js — modelos de laudo salvos pelo medico
 * ------------------------------------------------------------------
 * PARA QUE SERVE
 * Um cardiologista que pede Holter o dia inteiro redigita o mesmo
 * procedimento, o mesmo codigo, o mesmo CID e a mesma justificativa em
 * cada laudo. Isso nao e decisao clinica: e datilografia. O modelo
 * guarda essa parte uma vez e devolve com um clique.
 *
 * O QUE ENTRA NUM MODELO — E O QUE NUNCA ENTRA
 * So a parte CLINICA e ADMINISTRATIVA: procedimento, codigo, CID,
 * descricao, justificativa, texto do pedido, unidade de origem.
 * NUNCA entra nada de paciente — nome, CPF, nascimento, nome da mae,
 * sexo. E a mesma divisao que o historico ja faz ha versoes, e por bom
 * motivo: um modelo e feito para ser aplicado a OUTRA pessoa. Um modelo
 * que carregasse o CPF do paciente anterior colocaria o dado errado num
 * documento oficial toda vez que fosse usado — e ninguem perceberia,
 * porque o campo pareceria preenchido.
 *
 * A funcao `apenasClinico()` abaixo e a fronteira, e ela desconfia: alem
 * de aceitar so o que o modulo declarou como clinico, ela recusa
 * qualquer chave com cara de campo de paciente. Duas travas para o mesmo
 * erro, porque esse erro sai em papel timbrado.
 *
 * ONDE FICA GUARDADO
 * No navegador do proprio medico, pelo caminho duravel do nucleo (o
 * mesmo do cadastro e do historico): sobrevive a logout, a limpeza de
 * site e a atualizacao do Assistente. Nada vai para servidor nenhum.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var CHAVE = "modelos";
  var LIMITE_POR_MODULO = 20;
  var LIMITE_NOME = 40;

  function porta() {
    return raiz.MeedsSuiteStorage.duravel(CHAVE, "meeds-suite:" + CHAVE);
  }

  function tudo() {
    var dados = porta().ler({});
    return dados && typeof dados === "object" && !Array.isArray(dados) ? dados : {};
  }

  function gravarTudo(dados) {
    return porta().gravar(dados);
  }

  /* ------------------------------------------------------------------
   * A FRONTEIRA: nada de paciente atravessa
   * ------------------------------------------------------------------
   * `permitidos` e a lista que o modulo declara — a mesma que ele ja usa
   * para o historico. O teste de padrao abaixo e a segunda trava: se um
   * dia alguem acrescentar "cmd-pac-cpf" aquela lista por engano, ele
   * ainda assim nao entra no modelo.
   * ------------------------------------------------------------------ */
  var CARA_DE_PACIENTE = /(^|-)(pac|paciente|cpf|nasc|nascimento|mae|sexo|nome-completo)(-|$)/i;

  function apenasClinico(bruto, permitidos) {
    var saida = {};
    if (!bruto || typeof bruto !== "object") return saida;
    var chaves = Array.isArray(permitidos) && permitidos.length ? permitidos : Object.keys(bruto);
    chaves.forEach(function (chave) {
      if (CARA_DE_PACIENTE.test(chave)) {
        console.warn("[Assistente Meeds] campo recusado no modelo por parecer dado de paciente:", chave);
        return;
      }
      var valor = bruto[chave];
      if (valor === undefined || valor === null) return;
      if (typeof valor !== "string" && typeof valor !== "number") return;
      saida[chave] = String(valor);
    });
    return saida;
  }

  /* ------------------------------------------------------------------
   * API
   * ------------------------------------------------------------------ */
  function listar(idModulo) {
    var lista = tudo()[idModulo];
    return Array.isArray(lista) ? lista : [];
  }

  function padraoDe(idModulo) {
    var lista = listar(idModulo);
    for (var i = 0; i < lista.length; i++) {
      if (lista[i] && lista[i].padrao) return lista[i];
    }
    return null;
  }

  function salvar(idModulo, nome, clinico, permitidos) {
    var limpo = String(nome || "").trim().slice(0, LIMITE_NOME);
    if (!limpo) return { ok: false, erro: "Dê um nome ao modelo para você reconhecê-lo depois." };

    var campos = apenasClinico(clinico, permitidos);
    if (!Object.keys(campos).length) {
      return {
        ok: false,
        erro: "Não há nada para salvar: preencha o procedimento, o CID e a justificativa antes de criar o modelo.",
      };
    }

    var dados = tudo();
    var lista = Array.isArray(dados[idModulo]) ? dados[idModulo] : [];

    /* Mesmo nome sobrescreve, em vez de criar um segundo igual: o medico
     * que salva "Holter rotina" de novo esta corrigindo o dele, nao
     * pedindo dois. */
    var existente = -1;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i] && lista[i].nome === limpo) { existente = i; break; }
    }

    var ficha = {
      nome: limpo,
      clinico: campos,
      padrao: existente >= 0 ? !!lista[existente].padrao : false,
      criadoEm: new Date().toISOString().slice(0, 10),
    };

    if (existente >= 0) lista[existente] = ficha;
    else {
      if (lista.length >= LIMITE_POR_MODULO) {
        return { ok: false, erro: "Você já tem " + LIMITE_POR_MODULO + " modelos aqui. Apague um antes de criar outro." };
      }
      lista.push(ficha);
    }

    lista.sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
    dados[idModulo] = lista;
    gravarTudo(dados);
    return { ok: true, substituiu: existente >= 0, nome: limpo };
  }

  function remover(idModulo, nome) {
    var dados = tudo();
    var lista = Array.isArray(dados[idModulo]) ? dados[idModulo] : [];
    var antes = lista.length;
    dados[idModulo] = lista.filter(function (m) { return m && m.nome !== nome; });
    if (dados[idModulo].length === antes) return false;
    gravarTudo(dados);
    return true;
  }

  /* Um modelo padrao por modulo: marcar um desmarca o anterior. Dois
   * padroes seria o Assistente escolhendo qual aplicar, e essa escolha e
   * do medico. */
  function definirPadrao(idModulo, nome) {
    var dados = tudo();
    var lista = Array.isArray(dados[idModulo]) ? dados[idModulo] : [];
    var achou = false;
    lista.forEach(function (m) {
      if (!m) return;
      var eu = m.nome === nome;
      if (eu) achou = true;
      m.padrao = eu ? !m.padrao : false;
    });
    if (!achou) return false;
    dados[idModulo] = lista;
    gravarTudo(dados);
    return true;
  }

  function obter(idModulo, nome) {
    var lista = listar(idModulo);
    for (var i = 0; i < lista.length; i++) {
      if (lista[i] && lista[i].nome === nome) return lista[i];
    }
    return null;
  }

  /* Migracao de id, para o caso de um modulo ser renomeado (ja aconteceu
   * com apac-itauna -> apac). */
  function migrarId(idAntigo, idNovo) {
    var dados = tudo();
    if (!Array.isArray(dados[idAntigo]) || !dados[idAntigo].length) return 0;
    var quantos = dados[idAntigo].length;
    if (!Array.isArray(dados[idNovo])) dados[idNovo] = [];
    dados[idNovo] = dados[idNovo].concat(dados[idAntigo]);
    delete dados[idAntigo];
    gravarTudo(dados);
    return quantos;
  }

  var CSS = [
    ".msmod { background:#f6f9f8; border:1px solid #dfe9e7; border-radius:9px; padding:10px 12px; margin-bottom:12px; }",
    ".msmod-rot { font-size:10.5px; font-weight:700; color:#5b6c68; text-transform:uppercase; letter-spacing:.04em; margin-bottom:7px; }",
    ".msmod-linha { display:flex; gap:7px; align-items:center; flex-wrap:wrap; }",
    ".msmod-linha + .msmod-linha { margin-top:8px; padding-top:8px; border-top:1px dashed #dfe9e7; }",
    ".msmod-linha > select, .msmod-linha > input { flex:1; min-width:160px; }",
    /* Estes dois sobrescrevem a regra generica de campo do gerador, que
       e mais larga. Sem isto o input de nome ocuparia a linha inteira e
       jogaria o botao de criar para baixo. */
    ".msmod input[type=text] { padding:8px 9px; border:1px solid #cddad7; border-radius:7px; font-size:12.5px; font-family:inherit; }",
    ".msmod-btn { background:#fff; border:1.3px solid #c9d8d5; color:#0e7a70; border-radius:8px; padding:8px 12px; font-size:11.5px; font-weight:700; cursor:pointer; font-family:inherit; white-space:nowrap; }",
    ".msmod-btn:hover { background:#e3f5f3; border-color:#17ab9e; }",
    ".msmod-btn.principal { background:#12958a; border-color:#12958a; color:#fff; }",
    ".msmod-btn.principal:hover { background:#0b6a62; border-color:#0b6a62; }",
    /* Substituir tem cor propria: a diferenca entre criar e sobrescrever
       precisa ser visivel ANTES do clique, nao descoberta depois. */
    ".msmod-btn.principal.substituir { background:#a15c00; border-color:#a15c00; }",
    ".msmod-btn.principal.substituir:hover { background:#7d4700; border-color:#7d4700; }",
    ".msmod-btn.perigo { color:#a12626; border-color:#e6c3c3; }",
    ".msmod-btn.perigo:hover { background:#fdeaea; border-color:#c96b6b; }",
    ".msmod-dica { font-size:10.5px; color:#7c8c88; margin-top:7px; line-height:1.45; }",
    ".msmod-vazio { font-size:11.5px; color:#5b6c68; line-height:1.5; margin-bottom:8px; }",
    ".msmod-salvos[hidden] { display:none; }",
  ].join("\n");

  raiz.MeedsSuiteModelos = {
    CHAVE: CHAVE,
    CSS: CSS,
    listar: listar,
    obter: obter,
    salvar: salvar,
    remover: remover,
    definirPadrao: definirPadrao,
    padraoDe: padraoDe,
    apenasClinico: apenasClinico,
    migrarId: migrarId,
    LIMITE_POR_MODULO: LIMITE_POR_MODULO,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
