/* ------------------------------------------------------------------
 * core/diagnostico.js — instancia unica, scripts antigos e primeira vez
 * ------------------------------------------------------------------
 * Tres problemas de tela que so aparecem no mundo real:
 *
 * 1. BOTAO DUPLICADO POR DUPLA EXECUCAO
 *    A trava de frame ja impede o script de rodar dentro do <iframe> da
 *    videochamada. Mas ela nao cobre tudo: o Meeds e uma SPA e pode
 *    reexecutar o script numa navegacao; e o medico pode acabar com duas
 *    copias instaladas no Tampermonkey (por exemplo, instalando de novo
 *    por um link diferente). Nesses casos apareciam dois docks, um por
 *    cima do outro, e o alarme tocava duas vezes.
 *    Solucao: uma marca no objeto global. A segunda execucao desiste.
 *
 * 2. BOTAO DUPLICADO PELOS SCRIPTS ANTIGOS
 *    Os cinco scripts originais continuam publicados e podem estar
 *    ativos. Cada um injeta o proprio botao. O resultado e a tela com
 *    botoes repetidos e o alarme tocando duas vezes — e o medico nao tem
 *    como saber que a causa e essa.
 *    Solucao: procurar as marcas que os scripts antigos deixam no DOM e
 *    avisar, dizendo exatamente o que fazer (DESATIVAR, nao desinstalar).
 *
 * 3. A PRIMEIRA VEZ
 *    Quem instala nao sabe que existe um painel, nem que da para desligar
 *    o que nao usa. Um aviso unico, na primeira execucao, aponta o ⚙️.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var MARCA_INSTANCIA = "__ASSISTENTE_MEEDS_ATIVO__";

  /* ------------------------------------------------------------------
   * BOAS-VINDAS: UMA VEZ SO, PARA SEMPRE
   * ------------------------------------------------------------------
   * A versao anterior guardava a marca em localStorage e so gravava
   * quando o medico clicava em "Ver depois", "Cadastrar agora" ou no X.
   * Fechar clicando FORA da janela — que e o jeito mais natural de
   * dispensar um aviso — nao passava por nenhum desses caminhos, entao
   * nada era gravado e a apresentacao voltava a cada visita. Era esse o
   * incomodo relatado.
   *
   * Duas mudancas:
   *   1. a marca e gravada assim que a apresentacao APARECE, e nao
   *      quando ela e fechada. Qualquer forma de dispensar conta;
   *   2. a marca vai para o armazenamento do Tampermonkey (GM_setValue),
   *      que sobrevive a "limpar dados do site" e a troca de aba, com
   *      localStorage apenas como reserva.
   *
   * O SUFIXO _v1 NA CHAVE E PROPOSITAL: se um dia houver uma mudanca
   * grande que justifique reapresentar o assistente, basta subir para
   * _v2 aqui. Sem isso, ninguem ve de novo — que e o comportamento
   * desejado no dia a dia.
   * ------------------------------------------------------------------ */
  var CHAVE_BOAS_VINDAS = "meeds_assistente_boas_vindas_v1";
  var VALOR_CONCLUIDO = "concluido";
  var CHAVE_ANTIGA_BOAS_VINDAS = "meeds-suite:_core:boasVindas";

  function temGM() {
    return typeof GM_getValue === "function" && typeof GM_setValue === "function";
  }

  function boasVindasConcluidas() {
    try {
      if (temGM() && GM_getValue(CHAVE_BOAS_VINDAS, null) === VALOR_CONCLUIDO) return true;
    } catch (e) {}
    try {
      if (localStorage.getItem(CHAVE_BOAS_VINDAS) === VALOR_CONCLUIDO) return true;
      // quem ja tinha visto na versao anterior nao ve de novo
      if (localStorage.getItem(CHAVE_ANTIGA_BOAS_VINDAS) === '"vista"') {
        marcarBoasVindasConcluidas();
        return true;
      }
    } catch (e) {}
    return false;
  }

  function marcarBoasVindasConcluidas() {
    try {
      if (temGM()) GM_setValue(CHAVE_BOAS_VINDAS, VALOR_CONCLUIDO);
    } catch (e) {}
    try {
      localStorage.setItem(CHAVE_BOAS_VINDAS, VALOR_CONCLUIDO);
    } catch (e) {}
  }

  /* ------------------------------------------------------------------
   * 1) INSTANCIA UNICA
   * Devolve false quando JA existe uma instancia viva nesta pagina.
   * Chamado pelo bootloader antes de qualquer coisa criar UI.
   * ------------------------------------------------------------------ */
  function reservarInstancia(versao) {
    try {
      if (raiz[MARCA_INSTANCIA]) {
        console.warn(
          "[Assistente Meeds] ja existe uma instancia rodando nesta pagina (versao " +
            raiz[MARCA_INSTANCIA] +
            "). Esta execucao vai parar aqui para nao duplicar os botoes."
        );
        return false;
      }
      raiz[MARCA_INSTANCIA] = versao || true;
      return true;
    } catch (e) {
      return true; // na duvida, deixa rodar: melhor duplicar do que sumir
    }
  }

  /* Segunda camada, contra duplicacao no DOM: se o host do dock ja existe
   * mas foi criado por OUTRA instancia (por exemplo, a marca global se
   * perdeu numa navegacao da SPA), removemos o orfao antes de montar. */
  function limparDockOrfao(idHost) {
    try {
      var hosts = document.querySelectorAll("#" + idHost);
      for (var i = 0; i < hosts.length - 1; i++) {
        hosts[i].parentNode.removeChild(hosts[i]);
      }
      return hosts.length > 1;
    } catch (e) {
      return false;
    }
  }

  /* ------------------------------------------------------------------
   * 2) SCRIPTS ANTIGOS AINDA ATIVOS
   * Cada um deixa uma marca propria no DOM. Sao os seletores reais dos
   * cinco repositorios originais — se mudarem la, atualize aqui.
   * ------------------------------------------------------------------ */
  var ANTIGOS = [
    { seletor: "#af-fab", nome: "Meeds - Alarme de Fila (Plantao Noturno)" },
    { seletor: "#apac-host-root", nome: "Gerador de APAC Itaúna — Meeds + Assinatura" },
    { seletor: "#lme-host-root", nome: "Gerador de Laudo — Sete Lagoas (Meeds)" },
    { seletor: "#cmd-host-root", nome: "Gerador de Laudo de Alto Custo — Conceição do Mato Dentro" },
    { seletor: "#remume-fab", nome: "Meeds - Assistente REMUME" },
  ];

  function detectarAntigos() {
    var achados = [];
    ANTIGOS.forEach(function (a) {
      try {
        if (document.querySelector(a.seletor)) achados.push(a.nome);
      } catch (e) {
        /* silencioso */
      }
    });
    return achados;
  }

  /* ------------------------------------------------------------------
   * 3) AVISOS NA TELA
   * ------------------------------------------------------------------ */
  var CSS = [
    ".msd-aviso { width:100%; max-width:520px; background:#fff; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.35); overflow:hidden; }",
    ".msd-aviso header { padding:16px 18px; color:#fff; display:flex; justify-content:space-between; align-items:center; gap:12px; }",
    ".msd-aviso header h2 { margin:0; font-size:15px; font-weight:700; }",
    ".msd-alerta header { background:linear-gradient(135deg,#b45309,#f59e0b); }",
    ".msd-boas-vindas header { background:linear-gradient(135deg,#123a7a,#1a56ad); }",
    ".msd-fechar { background:rgba(255,255,255,.2); border:none; color:#fff; width:28px; height:28px; border-radius:50%; cursor:pointer; font-size:14px; flex-shrink:0; }",
    ".msd-corpo { padding:16px 18px; font-size:13px; line-height:1.6; color:#16221f; }",
    ".msd-corpo ol, .msd-corpo ul { margin:10px 0; padding-left:20px; }",
    ".msd-corpo li { margin-bottom:5px; }",
    ".msd-lista-scripts { background:#fff7ed; border:1px solid #fed7aa; border-radius:9px; padding:10px 12px; margin:10px 0; font-size:12.5px; }",
    ".msd-lista-scripts li { color:#8a5200; }",
    ".msd-rodape { display:flex; justify-content:flex-end; gap:8px; padding:12px 18px; border-top:1px solid #eef2f6; }",
    ".msd-btn { background:#1a4fa0; color:#fff; border:none; border-radius:9px; padding:10px 16px; font-size:13px; font-weight:700; cursor:pointer; }",
    ".msd-btn:hover { background:#123a7a; }",
    ".msd-btn-sec { background:#fff; color:#123a7a; border:1.4px solid #1a56ad; }",
    ".msd-btn-sec:hover { background:#e8f0f8; }",
    ".msd-destaque { color:#123a7a; font-weight:700; }",
  ].join("\n");

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function avisarScriptsAntigos(dock, nomes, storage) {
    var overlay = dock.criarOverlay({
      estilo: CSS,
      html:
        '<div class="msd-aviso msd-alerta" role="dialog" aria-modal="true">' +
        "  <header><h2>⚠️ Botões duplicados na tela</h2>" +
        '  <button type="button" class="msd-fechar" aria-label="Fechar">&#10005;</button></header>' +
        '  <div class="msd-corpo">' +
        "    <p>O Assistente Meeds já faz tudo o que os scripts antigos faziam. Encontrei " +
        (nomes.length === 1 ? "<b>1 deles</b> ainda ativo" : "<b>" + nomes.length + " deles</b> ainda ativos") +
        " neste navegador — por isso você está vendo botões repetidos" +
        " (e o alarme pode tocar duas vezes).</p>" +
        '    <ul class="msd-lista-scripts">' +
        nomes.map(function (n) { return "<li>" + escapeHtml(n) + "</li>"; }).join("") +
        "    </ul>" +
        "    <p>Para resolver, <span class=\"msd-destaque\">desative</span> esses scripts:</p>" +
        "    <ol>" +
        "      <li>Clique no ícone do Tampermonkey, no canto do navegador.</li>" +
        "      <li>Escolha <b>Painel de controle</b>.</li>" +
        "      <li>Na coluna <b>Ativado</b>, clique no interruptor de cada um deles para ficar cinza.</li>" +
        "      <li>Recarregue a página do Meeds.</li>" +
        "    </ol>" +
        "    <p><b>Desative, não desinstale.</b> Assim, se precisar, você volta atrás com um clique.</p>" +
        "  </div>" +
        '  <div class="msd-rodape">' +
        '    <button type="button" class="msd-btn msd-btn-sec" id="msd-nao-avisar">Não avisar de novo</button>' +
        '    <button type="button" class="msd-btn" id="msd-entendi">Entendi</button>' +
        "  </div>" +
        "</div>",
    });

    function fechar() {
      overlay.fechar();
    }
    overlay.$(".msd-fechar").addEventListener("click", fechar);
    overlay.$("#msd-entendi").addEventListener("click", fechar);
    overlay.$("#msd-nao-avisar").addEventListener("click", function () {
      storage.gravar("avisoScriptsAntigos", "silenciado");
      fechar();
    });
    overlay.abrir();
    return overlay;
  }

  function darBoasVindas(dock, storage) {
    /* Marca ANTES de mostrar: assim, qualquer jeito de dispensar (X, os
     * botoes, clique fora, fechar a aba) ja conta como visto. */
    marcarBoasVindasConcluidas();

    var overlay = dock.criarOverlay({
      estilo: CSS,
      /* Clicar fora fecha, como em qualquer aviso — e agora isso e
       * seguro, porque a marca ja foi gravada. */
      html:
        '<div class="msd-aviso msd-boas-vindas" role="dialog" aria-modal="true">' +
        "  <header><h2>Bem-vindo ao Assistente Meeds</h2>" +
        '  <button type="button" class="msd-fechar" aria-label="Fechar">&#10005;</button></header>' +
        '  <div class="msd-corpo">' +
        "    <p>Os botões ficam no <b>canto inferior direito</b> da tela e só aparecem depois que você entra no Meeds.</p>" +
        "    <p>O botão <b>⚙️</b>, o menor de todos, embaixo da pilha, é onde você:</p>" +
        "    <ul>" +
        "      <li><b>liga e desliga</b> cada função — deixe só as que você usa;</li>" +
        "      <li><b>cadastra seu nome e CRM</b>, uma única vez, para os laudos.</li>" +
        "    </ul>" +
        "    <p>Por segurança, os dados dos médicos não ficam mais no código do programa. " +
        "O cadastro leva menos de um minuto e você não precisa repetir.</p>" +
        "  </div>" +
        '  <div class="msd-rodape">' +
        '    <button type="button" class="msd-btn msd-btn-sec" id="msd-depois">Ver depois</button>' +
        '    <button type="button" class="msd-btn" id="msd-cadastrar">Cadastrar agora</button>' +
        "  </div>" +
        "</div>",
    });

    function encerrar() {
      marcarBoasVindasConcluidas(); // idempotente
      overlay.fechar();
    }
    overlay.$(".msd-fechar").addEventListener("click", encerrar);
    overlay.$("#msd-depois").addEventListener("click", encerrar);
    overlay.$("#msd-cadastrar").addEventListener("click", function () {
      encerrar();
      raiz.MeedsSuiteManager.abrir("medicos");
    });
    overlay.abrir();
    return overlay;
  }

  /* Roda os dois diagnosticos no start do nucleo.
   *
   * A checagem dos scripts antigos e REPETIDA, nao unica. Eles rodam em
   * document-idle e alguns so montam o botao depois que o medico navega
   * para a tela de atendimento — uma checagem unica aos 4s perderia
   * esses casos e o medico ficaria com botao duplicado sem saber por que.
   * Tentamos algumas vezes, com intervalo crescente, e paramos assim que
   * encontrarmos algo (ou depois da ultima tentativa). */
  var TENTATIVAS_MS = [4000, 10000, 20000, 45000];

  function verificar(dock, storage) {
    if (!boasVindasConcluidas()) {
      setTimeout(function () {
        darBoasVindas(dock, storage);
      }, 1200);
    }

    if (storage.ler("avisoScriptsAntigos", null) === "silenciado") return;

    var jaAvisou = false;
    TENTATIVAS_MS.forEach(function (atraso) {
      setTimeout(function () {
        if (jaAvisou) return;
        if (storage.ler("avisoScriptsAntigos", null) === "silenciado") return;
        var achados = detectarAntigos();
        if (achados.length) {
          jaAvisou = true;
          avisarScriptsAntigos(dock, achados, storage);
        }
      }, atraso);
    });
  }

  raiz.MeedsSuiteDiagnostico = {
    boasVindasConcluidas: boasVindasConcluidas,
    marcarBoasVindasConcluidas: marcarBoasVindasConcluidas,
    CHAVE_BOAS_VINDAS: CHAVE_BOAS_VINDAS,
    reservarInstancia: reservarInstancia,
    limparDockOrfao: limparDockOrfao,
    detectarAntigos: detectarAntigos,
    verificar: verificar,
    MARCA_INSTANCIA: MARCA_INSTANCIA,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
