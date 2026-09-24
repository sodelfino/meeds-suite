// ==UserScript==
// @name         Sonda do Assistente Meeds v2
// @namespace    novetech-meeds-sonda-v2
// @version      1.0.0
// @description  Mapeia a tela e as chamadas de rede do Meeds novo e gera um relatorio para colar de volta. Nao altera nada na pagina e nao coleta dado de paciente.
// @author       Marcelo
// @match        *://des-doctor-calltech.meeds.com.br/*
// @match        *://doctor-calltech.meeds.com.br/*
// @match        *://admin-calltech.meeds.com.br/*
// @exclude      *://meet.meeds.com.br/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

/* ------------------------------------------------------------------
 * SONDA DO ASSISTENTE MEEDS v2
 * ------------------------------------------------------------------
 * POR QUE ELA EXISTE
 * O Meeds novo mudou a tela inteira. Os modulos do Assistente nao
 * dependem de layout, mas dependem de tres coisas concretas:
 *
 *   1. ROTULOS na tela ("Data de Nascimento", "CPF", "Nome da Mãe") —
 *      e como o dom-reader acha o valor a partir deles;
 *   2. CONTADOR da fila (era um cartao "Aguardando" com um numero;
 *      no v2 virou uma aba com contador ao lado);
 *   3. CHAMADAS DE REDE (/api/v1/Atendimento e afins) — e delas que o
 *      alarme de fila e o preenchimento automatico se alimentam.
 *
 * Escrever seletor por deducao, olhando video, custa um ciclo de ida e
 * volta por erro. Esta sonda troca isso por uma medicao.
 *
 * ------------------------------------------------------------------
 * A REGRA QUE MANDA AQUI: NENHUM DADO DE PACIENTE SAI DAQUI
 * ------------------------------------------------------------------
 * O relatorio vai ser colado num chat, o que significa que ele sai do
 * navegador do medico. Entao a sonda coleta ESTRUTURA, nunca CONTEUDO:
 *
 *   - de um rotulo: se existe e onde mora no DOM. Nunca o valor ao lado.
 *   - de um campo: id, name, type, placeholder, aria-label. Nunca o
 *     `value` que o medico digitou.
 *   - de uma chamada: metodo, caminho e os NOMES dos parametros. Nunca
 *     os valores (um `?PacienteId=...` identifica pessoa) e nunca o
 *     corpo da resposta.
 *   - de um toast: o seletor do container e qual padrao casou. Nunca o
 *     texto, porque toast de fila costuma trazer nome de paciente.
 *
 * Onde havia duvida entre "mais util" e "mais seguro", ficou o seguro:
 * um campo faltando no relatorio custa uma pergunta; um CPF vazando num
 * chat nao tem como voltar.
 * ------------------------------------------------------------------ */
(function () {
  "use strict";

  /* Trava de frame: a videochamada roda em <iframe> e a sonda nao tem
   * nada para fazer lá dentro. */
  if (window.top !== window.self) return;

  var VERSAO = "1.0.0";
  var ID_HOST = "meeds-sonda-v2-host";

  /* ------------------------------------------------------------------
   * 1) GRAVADOR DE REDE
   * ------------------------------------------------------------------
   * Mesmo padrao do network-hub do Assistente: um unico patch em
   * fetch e XHR, instalado em document-start para nao perder as
   * chamadas que a SPA faz no boot.
   *
   * Guarda so o esqueleto da chamada. Um Map com chave
   * "METODO caminho" faz a deduplicacao sozinha: a mesma rota chamada
   * 200 vezes vira uma linha com contador, e nao 200 linhas.
   * ------------------------------------------------------------------ */
  var chamadas = new Map();

  function anotarChamada(metodo, urlBruta, status) {
    var caminho, nomesDeParametro;
    try {
      var u = new URL(urlBruta, location.origin);
      /* Só rotas do proprio Meeds interessam. Sem este filtro o
       * relatorio afoga em CDN, fonte, telemetria e imagem. */
      if (u.origin !== location.origin && u.hostname.indexOf("meeds.com.br") === -1) return;
      caminho = u.pathname;

      /* UUID e id numerico no caminho viram marcador: /Atendimento/a1b2...
       * e /Atendimento/c3d4... sao a MESMA rota, e mante-los separados
       * enche o relatorio e ainda por cima carrega identificador. */
      caminho = caminho
        .replace(/\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?=\/|$)/g, "/{uuid}")
        .replace(/\/\d{2,}(?=\/|$)/g, "/{id}");

      /* Só os NOMES dos parametros. O valor de ProfissionalId ou
       * PacienteId identifica pessoa. */
      nomesDeParametro = [];
      u.searchParams.forEach(function (_valor, nome) {
        if (nomesDeParametro.indexOf(nome) === -1) nomesDeParametro.push(nome);
      });
      nomesDeParametro.sort();
    } catch (e) {
      return;
    }

    var chave = metodo + " " + caminho;
    var reg = chamadas.get(chave);
    if (!reg) {
      reg = { metodo: metodo, caminho: caminho, parametros: [], vezes: 0, status: {} };
      chamadas.set(chave, reg);
    }
    reg.vezes++;
    if (status) reg.status[status] = (reg.status[status] || 0) + 1;
    nomesDeParametro.forEach(function (n) {
      if (reg.parametros.indexOf(n) === -1) reg.parametros.push(n);
    });
  }

  function instalarGravadorDeRede() {
    var fetchOriginal = window.fetch;
    if (typeof fetchOriginal === "function") {
      window.fetch = function (entrada, opcoes) {
        var metodo = ((opcoes && opcoes.method) || (entrada && entrada.method) || "GET").toUpperCase();
        var url = typeof entrada === "string" ? entrada : entrada && entrada.url;
        var p = fetchOriginal.apply(this, arguments);
        try {
          p.then(
            function (r) {
              anotarChamada(metodo, url, r && r.status);
            },
            function () {
              anotarChamada(metodo, url, "erro");
            }
          );
        } catch (e) {
          anotarChamada(metodo, url, null);
        }
        return p;
      };
    }

    var abrirOriginal = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (metodo, url) {
      this.__sondaMetodo = String(metodo || "GET").toUpperCase();
      this.__sondaUrl = url;
      try {
        this.addEventListener("loadend", function () {
          anotarChamada(this.__sondaMetodo, this.__sondaUrl, this.status);
        });
      } catch (e) {
        /* silencioso: a sonda nunca pode quebrar a pagina */
      }
      return abrirOriginal.apply(this, arguments);
    };
  }

  /* ------------------------------------------------------------------
   * 2) LEITURA DE ESTRUTURA (sem valor)
   * ------------------------------------------------------------------ */

  function normalizar(t) {
    return String(t || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  /* Caminho curto e legivel de um elemento: o suficiente para eu
   * entender a estrutura sem receber a pagina inteira. */
  function caminhoDoElemento(el, profundidade) {
    var partes = [];
    var atual = el;
    var limite = profundidade || 4;
    while (atual && atual.nodeType === 1 && partes.length < limite) {
      var p = atual.tagName.toLowerCase();
      if (atual.id) p += "#" + atual.id;
      else if (atual.className && typeof atual.className === "string") {
        var cls = atual.className.trim().split(/\s+/).slice(0, 3).join(".");
        if (cls) p += "." + cls;
      }
      partes.unshift(p);
      atual = atual.parentElement;
    }
    return partes.join(" > ");
  }

  /* Procura um rotulo pelo TEXTO e descreve onde o valor provavelmente
   * mora. Devolve estrutura, jamais o texto do valor: o que interessa
   * para mim e "o valor fica no proximo irmao" ou "fica no ultimo filho
   * do avo", nao o que esta escrito la. */
  function investigarRotulo(variantes) {
    var alvos = variantes.map(normalizar);
    var achados = [];
    var todos = document.querySelectorAll("body *");

    for (var i = 0; i < todos.length && achados.length < 3; i++) {
      var el = todos[i];
      /* Só elementos-folha de texto: sem isto, cada ancestral do rotulo
       * casaria tambem e o relatorio viria com dezenas de duplicatas. */
      if (el.children.length > 0) continue;
      var texto = normalizar(el.textContent);
      if (!texto || texto.length > 60) continue;
      if (alvos.indexOf(texto) === -1 && alvos.indexOf(texto.replace(/[:*]$/, "").trim()) === -1) continue;

      /* Onde o Assistente tentaria achar o valor, em ordem. */
      var pistas = [];
      if (el.nextElementSibling) {
        pistas.push("irmao seguinte: " + el.nextElementSibling.tagName.toLowerCase() +
          " (folha=" + (el.nextElementSibling.children.length === 0) + ")");
      }
      var pai = el.parentElement;
      if (pai) {
        pistas.push("pai tem " + pai.children.length + " filho(s)");
        if (pai.nextElementSibling) pistas.push("irmao do pai: " + pai.nextElementSibling.tagName.toLowerCase());
      }

      achados.push({
        rotuloExato: el.textContent.trim().slice(0, 40),
        tag: el.tagName.toLowerCase(),
        caminho: caminhoDoElemento(el),
        pistasDeValor: pistas,
      });
    }
    return achados;
  }

  /* Existe um texto na tela? Usado para as ancoras de UI (nomes de aba,
   * botoes). Devolve o caminho do primeiro que casar. */
  function procurarTexto(texto) {
    var alvo = normalizar(texto);
    var todos = document.querySelectorAll("body *");
    for (var i = 0; i < todos.length; i++) {
      var el = todos[i];
      if (el.children.length > 0) continue;
      var t = normalizar(el.textContent);
      if (t === alvo || (t.length < alvo.length + 12 && t.indexOf(alvo) === 0)) {
        return {
          tag: el.tagName.toLowerCase(),
          caminho: caminhoDoElemento(el),
          clicavel: !!el.closest("button, a, [role=tab], [role=button]"),
          dentroDe: el.closest("button, a, [role=tab], [role=button]")
            ? el.closest("button, a, [role=tab], [role=button]").tagName.toLowerCase() +
              (el.closest("[role=tab]") ? "[role=tab]" : "")
            : null,
        };
      }
    }
    return null;
  }

  /* Inventario de campos: e o que permite ligar os geradores e a busca
   * de CID nos lugares certos. Sem `value`, por regra. */
  function inventariarCampos() {
    var saida = [];
    var campos = document.querySelectorAll("input, textarea, select, [contenteditable=true]");
    for (var i = 0; i < campos.length && saida.length < 120; i++) {
      var c = campos[i];
      if (c.type === "password") continue; /* nunca descrever campo de senha */
      saida.push({
        tag: c.tagName.toLowerCase(),
        type: c.getAttribute("type") || null,
        id: c.id || null,
        name: c.getAttribute("name") || null,
        placeholder: c.getAttribute("placeholder") || null,
        ariaLabel: c.getAttribute("aria-label") || null,
        opcoes: c.tagName === "SELECT" ? c.options.length : null,
        caminho: caminhoDoElemento(c, 3),
      });
    }
    return saida;
  }

  /* ------------------------------------------------------------------
   * 3) O QUE PERGUNTAR
   * ------------------------------------------------------------------
   * Cada item aqui existe porque um modulo do Assistente depende dele.
   * Nao ha campo "por curiosidade": o relatorio precisa caber numa
   * mensagem de chat.
   * ------------------------------------------------------------------ */
  var ROTULOS = {
    nascimento: ["Data de Nascimento", "Data de nascimento", "Nascimento", "Dt. Nascimento"],
    cpf: ["CPF", "C.P.F.", "CPF do paciente", "Documentos"],
    cns: ["CNS", "Cartão SUS", "Cartao SUS"],
    mae: ["Nome da Mãe", "Nome da mãe", "Mãe", "Filiação", "Parentesco"],
    telefone: ["Telefone", "Celular", "Contato"],
    paciente: ["Paciente", "Nome do Paciente"],
    vinculos: ["Vínculos", "Vinculos", "Vínculo"],
    contadorFila: ["Aguardando", "Aguardando atendimento", "Na fila", "Em Atendimento"],
  };

  var ANCORAS = [
    "Pronto Atendimento", "Chamar Próximo", "Aguardando", "Em Atendimento",
    "Atendidos", "Ausentes", "Cancelados",
    "Atendimento", "Prescrever", "Histórico", "Exames", "Condições", "Sintomas",
    "Dados Cadastrais",
    "MEMED", "Meeds Docs", "APAC",
    "Ficha de Atendimento", "Subjetivo", "Objetivo", "Avaliação", "Plano de Tratamento",
    "CIAP", "Tipo de Atendimento", "Conduta", "Encaminhamento",
    "Video Chamada", "Dados do Paciente", "Ficha histórica",
    "Dashboard", "Consultas", "Saúde Mental", "Pacientes", "Prescrições", "Modelos",
  ];

  /* Os regex que os modulos usam HOJE. O relatorio diz quais ainda
   * casam com alguma chamada real — e essa e a pergunta que decide se o
   * alarme de fila continua funcionando no v2. */
  var ASSINATURAS_ATUAIS = [
    { modulo: "alarme-fila", regex: /\/api\/v1\/Atendimento\?/i },
    { modulo: "apac-itauna", regex: /\/api\/v1\/Atendimento\/[0-9a-fA-F-]{36}(\?|$)/i },
    { modulo: "remume", regex: /\/api\/v1\/Atendimento\/[^/?]+(?:[?#].*)?$/i },
    { modulo: "sala-espera (standby)", regex: /\/api\/v1\/Atendimento\?[^]*ProfissionalId=/i },
  ];

  function montarRelatorio() {
    var L = [];
    var linha = function (t) { L.push(t == null ? "" : String(t)); };

    linha("=== SONDA DO ASSISTENTE MEEDS v2 — relatorio ===");
    linha("sonda: " + VERSAO);
    linha("host: " + location.hostname);
    linha("caminho: " + location.pathname);
    linha("gerado em: " + new Date().toISOString());
    linha("largura da janela: " + window.innerWidth + "x" + window.innerHeight);
    linha("");
    linha("NENHUM DADO DE PACIENTE NESTE ARQUIVO: so estrutura de tela,");
    linha("nomes de campo e caminhos de rota. Sem valores, sem corpo de");
    linha("resposta, sem texto de toast.");
    linha("");

    /* --- rotulos --- */
    linha("--- 1. ROTULOS NA TELA ---");
    Object.keys(ROTULOS).forEach(function (chave) {
      var achados = investigarRotulo(ROTULOS[chave]);
      if (!achados.length) {
        linha("[ ] " + chave + ": NAO ENCONTRADO (variantes testadas: " + ROTULOS[chave].join(" | ") + ")");
        return;
      }
      achados.forEach(function (a, i) {
        linha("[x] " + chave + (achados.length > 1 ? " #" + (i + 1) : "") + ': "' + a.rotuloExato + '"');
        linha("      caminho: " + a.caminho);
        a.pistasDeValor.forEach(function (p) { linha("      " + p); });
      });
    });
    linha("");

    /* --- ancoras --- */
    linha("--- 2. ANCORAS DE UI ---");
    var faltando = [];
    ANCORAS.forEach(function (texto) {
      var r = procurarTexto(texto);
      if (!r) { faltando.push(texto); return; }
      linha('[x] "' + texto + '" -> ' + r.caminho + (r.dentroDe ? "   (clicavel: " + r.dentroDe + ")" : ""));
    });
    if (faltando.length) {
      linha("");
      linha("[ ] nao visiveis nesta tela: " + faltando.join(", "));
      linha("    (normal: cada tela mostra um subconjunto. Rode a sonda em");
      linha("     Pronto Atendimento E dentro de um atendimento aberto.)");
    }
    linha("");

    /* --- campos --- */
    var campos = inventariarCampos();
    linha("--- 3. CAMPOS DE FORMULARIO (" + campos.length + ") ---");
    campos.forEach(function (c) {
      var partes = [c.tag + (c.type ? "[" + c.type + "]" : "")];
      if (c.id) partes.push("id=" + c.id);
      if (c.name) partes.push("name=" + c.name);
      if (c.placeholder) partes.push('placeholder="' + c.placeholder + '"');
      if (c.ariaLabel) partes.push('aria-label="' + c.ariaLabel + '"');
      if (c.opcoes != null) partes.push(c.opcoes + " opcao(oes)");
      linha("  " + partes.join("  ") );
      linha("      " + c.caminho);
    });
    linha("");

    /* --- rede --- */
    var lista = Array.from(chamadas.values()).sort(function (a, b) { return b.vezes - a.vezes; });
    linha("--- 4. CHAMADAS DE REDE (" + lista.length + " rotas distintas) ---");
    if (!lista.length) {
      linha("  nenhuma capturada. Se a pagina ja estava aberta antes de");
      linha("  instalar a sonda, recarregue e navegue um pouco antes de gerar.");
    }
    lista.forEach(function (r) {
      linha("  " + r.metodo + " " + r.caminho + "   (" + r.vezes + "x, status " +
        Object.keys(r.status).join("/") + ")");
      if (r.parametros.length) linha("      parametros: " + r.parametros.join(", "));
    });
    linha("");

    /* --- o veredito que importa --- */
    linha("--- 5. AS ASSINATURAS DO v1 AINDA CASAM? ---");
    ASSINATURAS_ATUAIS.forEach(function (a) {
      var casou = lista.filter(function (r) {
        return a.regex.test(r.caminho) || a.regex.test(r.caminho + "?");
      });
      linha((casou.length ? "[x] " : "[ ] ") + a.modulo + "  " + a.regex);
      casou.slice(0, 3).forEach(function (r) { linha("      casa com: " + r.metodo + " " + r.caminho); });
    });
    linha("");
    linha("=== fim ===");
    return L.join("\n");
  }

  /* ------------------------------------------------------------------
   * 4) A JANELINHA
   * ------------------------------------------------------------------
   * Shadow DOM pelo mesmo motivo do Assistente: o CSS do Meeds nao
   * vaza para dentro e o nosso nao vaza para fora.
   * ------------------------------------------------------------------ */
  function montarUI() {
    if (document.getElementById(ID_HOST)) return;

    var host = document.createElement("div");
    host.id = ID_HOST;
    document.body.appendChild(host);
    var sombra = host.attachShadow({ mode: "open" });

    sombra.innerHTML =
      "<style>" +
      ":host { all: initial; }" +
      "* { box-sizing: border-box; font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; }" +
      "#b { position: fixed; right: 24px; bottom: 24px; z-index: 2147483000;" +
      "  background: #6d28d9; color: #fff; border: none; border-radius: 999px;" +
      "  padding: 12px 18px; font-size: 13px; font-weight: 800; cursor: pointer;" +
      "  box-shadow: 0 8px 22px rgba(109,40,217,.45); }" +
      "#p { position: fixed; right: 24px; bottom: 84px; z-index: 2147483000; width: 460px;" +
      "  max-width: calc(100vw - 48px); background: #fff; border-radius: 14px;" +
      "  box-shadow: 0 24px 70px rgba(0,0,0,.35); overflow: hidden; }" +
      "#p[hidden] { display: none; }" +
      "header { background: #6d28d9; color: #fff; padding: 13px 16px; display: flex;" +
      "  justify-content: space-between; align-items: center; }" +
      "header h2 { margin: 0; font-size: 14px; font-weight: 800; }" +
      "header button { background: transparent; border: none; color: #fff; font-size: 16px; cursor: pointer; }" +
      ".c { padding: 14px 16px; }" +
      ".c p { margin: 0 0 10px; font-size: 12.5px; color: #3f4753; line-height: 1.5; }" +
      ".c b { color: #16221f; }" +
      "textarea { width: 100%; height: 130px; font: 11px ui-monospace, Menlo, monospace;" +
      "  border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; resize: vertical; }" +
      ".acoes { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }" +
      ".acoes button { flex: 1 1 auto; background: #6d28d9; color: #fff; border: none;" +
      "  border-radius: 8px; padding: 9px 12px; font-size: 12.5px; font-weight: 700; cursor: pointer; }" +
      ".acoes button.sec { background: #eef2f7; color: #334155; }" +
      "#st { font-size: 12px; color: #0a7d32; font-weight: 700; margin-top: 8px; min-height: 16px; }" +
      "</style>" +
      '<button id="b" type="button">🔍 Sonda v2</button>' +
      '<div id="p" hidden>' +
      "  <header><h2>Sonda do Assistente v2</h2>" +
      '  <button type="button" id="x" aria-label="Fechar">&#10005;</button></header>' +
      '  <div class="c">' +
      "    <p>Gera um retrato da <b>estrutura</b> desta tela e das chamadas de rede," +
      "       para eu escrever os seletores do v2 sem adivinhar.</p>" +
      "    <p><b>Nenhum dado de paciente entra no relatório</b> — só nomes de campo," +
      "       caminhos de rota e onde os rótulos ficam no HTML.</p>" +
      "    <p>Rode <b>duas vezes</b>: uma na lista do Pronto Atendimento e outra" +
      "       dentro de um atendimento aberto. As telas mostram campos diferentes.</p>" +
      '    <textarea id="t" readonly placeholder="Clique em Gerar relatório"></textarea>' +
      '    <div class="acoes">' +
      '      <button type="button" id="g">Gerar relatório</button>' +
      '      <button type="button" id="c" class="sec">Copiar</button>' +
      '      <button type="button" id="d" class="sec">Baixar .txt</button>' +
      "    </div>" +
      '    <div id="st"></div>' +
      "  </div>" +
      "</div>";

    var painel = sombra.getElementById("p");
    var area = sombra.getElementById("t");
    var estado = sombra.getElementById("st");

    sombra.getElementById("b").addEventListener("click", function () {
      painel.hidden = !painel.hidden;
    });
    sombra.getElementById("x").addEventListener("click", function () {
      painel.hidden = true;
    });

    sombra.getElementById("g").addEventListener("click", function () {
      try {
        area.value = montarRelatorio();
        estado.textContent = "Pronto: " + area.value.split("\n").length + " linhas.";
      } catch (e) {
        area.value = "A sonda falhou ao montar o relatorio:\n" + (e && e.stack ? e.stack : e);
        estado.textContent = "Falhou — copie o texto acima do mesmo jeito.";
      }
    });

    sombra.getElementById("c").addEventListener("click", function () {
      if (!area.value) { estado.textContent = "Gere o relatório primeiro."; return; }
      /* navigator.clipboard exige contexto seguro e permissao; o
       * caminho antigo com execCommand ainda e a reserva que funciona
       * quando ele nega. */
      function reserva() {
        area.removeAttribute("readonly");
        area.select();
        var deu = false;
        try { deu = document.execCommand("copy"); } catch (e) { deu = false; }
        area.setAttribute("readonly", "readonly");
        estado.textContent = deu
          ? "Copiado."
          : "Não consegui copiar. Selecione o texto e use Cmd+C.";
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(area.value).then(
          function () { estado.textContent = "Copiado."; },
          reserva
        );
      } else {
        reserva();
      }
    });

    sombra.getElementById("d").addEventListener("click", function () {
      if (!area.value) { estado.textContent = "Gere o relatório primeiro."; return; }
      try {
        var blob = new Blob([area.value], { type: "text/plain;charset=utf-8" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "sonda-meeds-v2-" + location.hostname.split(".")[0] + "-" +
          new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".txt";
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        estado.textContent = "Baixado para a pasta de downloads.";
      } catch (e) {
        estado.textContent = "Download bloqueado. Use Copiar.";
      }
    });
  }

  instalarGravadorDeRede();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", montarUI);
  } else {
    montarUI();
  }
  /* A SPA remonta o <body> em algumas navegacoes e leva o host embora.
   * Um recheque barato mantem o botao na tela sem MutationObserver. */
  setInterval(montarUI, 3000);
})();
