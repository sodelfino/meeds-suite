/* ------------------------------------------------------------------
 * modules/apac/index.js
 * Origem: sodelfino/apac-itauna-meeds -> APAC_GERADOR_FINAL.user.js v1.9.0
 * ------------------------------------------------------------------
 * O QUE MUDOU NA MIGRACAO (e o que NAO mudou)
 *  - REMOVIDO daqui: trava de frame, deteccao de login, patch proprio de
 *    fetch/XHR, o shadow host proprio, o CSS de posicionamento do botao
 *    (#apac-fab bottom:24px right:24px) e o toast proprio. Tudo isso e
 *    do nucleo agora.
 *  - PRESERVADO byte a byte: a funcao gerarPdfInterno() inteira, com
 *    TODAS as coordenadas do formulario da APAC, e as tabelas de dados
 *    (CATALOGO, ECO_VARIANTES, TERRITORIOS, CID_DIC).
 *    Essas coordenadas foram calibradas na mao contra o formulario
 *    oficial; reescrever qualquer uma seria arriscar o layout do laudo.
 *  - PRESERVADO em comportamento: captura passiva da API + polling de
 *    URL, leitura da tela como reforco, painel de medicos, historico
 *    local, validacao de campos e as duas saidas (assinar via gov.br /
 *    baixar sem assinar).
 *
 * DADOS DOS MEDICOS: sairam do codigo na v2.1.0. O cadastro agora vive
 * so no navegador do medico (core/cadastro.js) e e compartilhado com os
 * laudos de Sete Lagoas e CMD. Quem ja usava a versao anterior tem os
 * seus medicos migrados automaticamente da chave "apac_medicos_v1".
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var d = null;
  var overlay = null;
  var timers = [];
  var procedimentoAtivo = null;
  var pdfGerado = null;
  var cache = null;    // ultimo payload de /api/v1/Atendimento/{uuid}
  var cacheId = null;
  var ultimaUrl = "";

  /* SHIM DE COMPATIBILIDADE
   * O codigo original acessava o formulario por shadow.getElementById().
   * Em vez de reescrever centenas de chamadas (e arriscar trocar um id),
   * este objeto reproduz a mesma interface por cima do overlay que o
   * dock do nucleo entrega. E a fronteira entre "codigo migrado sem
   * alteracao" e "codigo novo". */
  var shadow = {
    getElementById: function (id) {
      return overlay ? overlay.elemento.querySelector("#" + id) : null;
    },
    querySelector: function (sel) {
      return overlay ? overlay.elemento.querySelector(sel) : null;
    },
    querySelectorAll: function (sel) {
      return overlay ? overlay.elemento.querySelectorAll(sel) : [];
    },
  };

  function toast(msg, ms) {
    d.core.toast(msg, ms || 3000);
  }

  /* ----------------------------------------------------------------
   * jsPDF — resolvido do escopo global (o bootloader ja o carrega via
   * @require) com o mesmo fallback do original para o caso de o
   * @require nao ter exposto a lib no escopo esperado.
   * ---------------------------------------------------------------- */
  function resolverJsPDF() {
    var escopos = [];
    try { escopos.push(raiz); } catch (e) {}
    try { if (typeof unsafeWindow !== "undefined") escopos.push(unsafeWindow); } catch (e) {}
    try { escopos.push(window); } catch (e) {}
    try { escopos.push(globalThis); } catch (e) {}
    for (var i = 0; i < escopos.length; i++) {
      var g = escopos[i];
      if (g && g.jspdf && g.jspdf.jsPDF) return g.jspdf.jsPDF;
      if (g && g.jsPDF) return g.jsPDF;
    }
    return null;
  }

  var jsPDFCarregandoPromise = null;
  function garantirJsPDF() {
    var direto = resolverJsPDF();
    if (direto) return Promise.resolve(direto);
    if (jsPDFCarregandoPromise) return jsPDFCarregandoPromise;
    jsPDFCarregandoPromise = new Promise(function (resolve, reject) {
      if (typeof GM_xmlhttpRequest !== "function") {
        reject(new Error("o componente jsPDF não está disponível e o Tampermonkey não concedeu permissão para baixá-lo"));
        return;
      }
      GM_xmlhttpRequest({
        method: "GET",
        url: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
        onload: function (res) {
          try {
            (0, eval)(res.responseText);
            var lib = resolverJsPDF();
            if (lib) resolve(lib);
            else reject(new Error("jsPDF avaliado mas não exposto."));
          } catch (e) {
            reject(e);
          }
        },
        onerror: function () {
          reject(new Error("a rede bloqueou o download do jsPDF"));
        },
      });
    });
    return jsPDFCarregandoPromise;
  }

  /* ----------------------------------------------------------------
   * ARMAZENAMENTO LOCAL (medicos + historico)
   * Continua no GM_setValue/GM_getValue do Tampermonkey, como no
   * original: e por instalacao, nao sai do navegador e nao entra no
   * codigo publicado. Cai para o storage do nucleo se o grant faltar.
   * ---------------------------------------------------------------- */
  /* O historico agora e o do nucleo (core/historico.js), compartilhado
   * com os laudos de Sete Lagoas e CMD. Ele grava apenas a referencia
   * curta do paciente (iniciais + 3 ultimos digitos do CPF) — o nome
   * completo, que a versao anterior gravava, sai do disco na migracao. */

  function formatarCpf(digits) {
    var dd = (digits || "").replace(/\D/g, "").padStart(11, "0");
    return dd.slice(0,3) + "." + dd.slice(3,6) + "." + dd.slice(6,9) + "-" + dd.slice(9,11);
  }

  /* ----------------------------------------------------------------
   * CAPTURA DO PACIENTE (rede + URL + leitura de tela)
   * ---------------------------------------------------------------- */
  var ATEND_RE = /\/api\/v1\/Atendimento\/([0-9a-fA-F-]{36})(\?|$)/i;
  var UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

  function aplicarPayload(id, dados) {
    if (!dados || !dados.prontuario) return false;
    cache = dados;
    cacheId = id || cacheId;
    // se o modal ja estiver aberto, atualiza na hora
    if (overlay && overlay.estaAberto()) preencherDoCache();
    return true;
  }

  function idAtualDaUrl() {
    var m = location.href.match(UUID_RE);
    return m ? m[0] : null;
  }

  function buscarAtendimento(id) {
    return fetch("/api/v1/Atendimento/" + id, { credentials: "include" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (dados) {
        if (!aplicarPayload(id, dados)) throw new Error("Sem dados.");
        return dados;
      });
  }

  function tentarAtualizarAutomaticamente() {
    var idUrl = idAtualDaUrl();
    if (idUrl && idUrl !== cacheId) buscarAtendimento(idUrl).catch(function () {});
  }

  /* Leitura da tela: agora delega ao dom-reader do nucleo, que ja tenta
   * as variantes de rotulo e normaliza acento — antes cada gerador tinha
   * a sua copia com listas de variantes diferentes. */
  function lerDadosDaTela() {
    return d.dom.lerPaciente();
  }

  function aplicarLeituraDaTela(dadosTela) {
    if (!overlay || !dadosTela) return 0;
    var n = 0;
    if (dadosTela.nome) { shadow.getElementById("apac-pac-nome").value = dadosTela.nome; n++; }
    if (dadosTela.cpf) { shadow.getElementById("apac-pac-cpf").value = formatarCpf(dadosTela.cpf); n++; }
    if (dadosTela.nascimentoISO) { shadow.getElementById("apac-pac-nasc").value = dadosTela.nascimentoISO; n++; }
    if (dadosTela.nomeDaMae) { shadow.getElementById("apac-pac-mae").value = dadosTela.nomeDaMae; n++; }
    // sexo lido da tela (a palavra Masculino/Feminino) tem prioridade
    // sobre o enum da API, que nunca foi confirmado com um caso feminino
    if (dadosTela.sexo) { shadow.getElementById("apac-pac-sexo").value = dadosTela.sexo; n++; }
    return n;
  }

  function preencherDoCache() {
    if (!cache || !cache.prontuario) return;
    var ind = cache.prontuario.individuo || {};
    var ficha = ind.fichaIndividual || {};
    if (ind.nome) shadow.getElementById("apac-pac-nome").value = ind.nome;
    if (ind.cpf) shadow.getElementById("apac-pac-cpf").value = formatarCpf(ind.cpf);
    if (ind.dataNascimento) shadow.getElementById("apac-pac-nasc").value = ind.dataNascimento.slice(0, 10);
    if (ficha.nomeDaMae) shadow.getElementById("apac-pac-mae").value = ficha.nomeDaMae;
    if (typeof ficha.sexo === "number") shadow.getElementById("apac-pac-sexo").value = ficha.sexo === 0 ? "M" : "F";
    var aviso = shadow.getElementById("apac-auto-aviso");
    aviso.style.display = "block";
    aviso.textContent = "Preenchido automaticamente. Confira antes de gerar.";
  }

  function forcarAtualizacao() {
    var btn = shadow.getElementById("apac-refresh-modal");
    var original = btn.textContent;
    btn.textContent = "Atualizando…";
    btn.disabled = true;

    // 1) sempre le a tela primeiro — e instantaneo e nao depende de rede
    //    nem da URL conter o UUID do atendimento.
    var camposDaTela = aplicarLeituraDaTela(lerDadosDaTela());

    // 2) tambem tenta a API quando a URL trouxer o UUID: os dados de la
    //    sao mais completos e completam o que a tela nao deu.
    var id = idAtualDaUrl();
    if (!id) {
      var aviso = shadow.getElementById("apac-auto-aviso");
      aviso.style.display = "block";
      aviso.textContent = "Preenchido lendo a tela. Confira antes de gerar.";
      toast(
        camposDaTela > 0
          ? "Dados lidos da tela (" + camposDaTela + " campo" + (camposDaTela > 1 ? "s" : "") + ")."
          : "Não consegui preencher nada porque não encontrei os dados do paciente nem na tela nem no endereço da página. Abra o paciente na tela de Atendimento e clique de novo em “Atualizar paciente”.",
        4500
      );
      btn.textContent = original;
      btn.disabled = false;
      return;
    }
    buscarAtendimento(id)
      .then(function (dd) {
        toast(dd.prontuario.individuo.nome ? "Atualizado: " + dd.prontuario.individuo.nome : "OK");
      })
      .catch(function (e) {
        // a API falhou, mas a leitura da tela ja preencheu o que deu —
        // nunca deixa o medico sem nada so porque a rede falhou.
        toast(
          camposDaTela > 0
            ? "Preenchi " + camposDaTela + " campo(s) lendo a tela do atendimento. A consulta ao sistema falhou, então confira os dados antes de gerar."
            : "Não consegui buscar os dados do paciente: a consulta ao sistema falhou e não encontrei nada na tela. Abra o paciente na tela de Atendimento e clique de novo em “Atualizar paciente”.",
          4500
        );
      })
      .then(function () {
        btn.textContent = original;
        btn.disabled = false;
      });
  }


  /* ---- dados do formulario ----
   * Catalogo de procedimentos, variantes de eco, territorios vasculares,
   * CID-10 e o estabelecimento vem de dados/formularios.json, injetado no
   * pacote pelo build. Ficam fora do codigo porque sao a parte que o
   * administrador edita de vez em quando. Se o arquivo faltar, os padroes
   * seguram e o modulo continua funcionando. */
  /* O formulario da APAC e NACIONAL: o mesmo PDF vale para qualquer
   * municipio. O que muda e o ESTABELECIMENTO solicitante. Por isso o
   * catalogo vem do bloco comum e o municipio so escolhe a unidade. */
  var BASE = raiz.MEEDS_DADOS_APAC || { _comum: {}, municipios: {} };
  var COMUM = BASE._comum || {};

  function municipiosDisponiveis() {
    return Object.keys(BASE.municipios || {});
  }

  /* Um municipio pode sobrescrever o catalogo comum, mas hoje nenhum
   * precisa — a lista de cardiologia e a mesma nos tres. */
  function dadosDoMunicipio(nome) {
    var m = (BASE.municipios || {})[nome] || {};
    return {
      procedimentos: m.procedimentos || COMUM.procedimentos || {},
      ecoVariantes: m.ecoVariantes || COMUM.ecoVariantes || {},
      territorios: m.territorios || COMUM.territorios || [],
      cids: m.cids || COMUM.cids || {},
      estabelecimentos: m.estabelecimentos || [],
    };
  }

  var municipioAtual = null;
  var cnesSelecionado = ""; // ver montarEstabelecimentos: a selecao viaja por CNES, nao por indice
  var DADOS = dadosDoMunicipio(null);

  var CATALOGO = DADOS.procedimentos;
  var ECO_VARIANTES = DADOS.ecoVariantes;
  var TERRITORIOS = DADOS.territorios;
  var CID_DIC = DADOS.cids;


  /* ---- CSS e HTML do modal (o posicionamento e do dock) ---- */
  var CSS = raiz.MeedsSuiteHistorico.CSS + "\n" + "#apac-modal{\n      background:#fff; border-radius:16px; max-width:720px; width:100%; max-height:88vh; overflow-y:auto;\n      padding:0; box-shadow:0 20px 60px rgba(0,0,0,.35);\n    }\n    #apac-modal-head{\n      background:linear-gradient(135deg,#123a7a,#1a56ad); color:#fff; padding:16px 20px; border-radius:16px 16px 0 0;\n      display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; z-index:2;\n    }\n    #apac-modal-head h2{ margin:0; font-size:15px; }\n    #apac-close{ background:rgba(255,255,255,.2); border:none; color:#fff; width:26px; height:26px; border-radius:50%; cursor:pointer; font-size:14px; }\n    #apac-body{ padding:18px 20px; }\n    .apac-sec{ margin-bottom:16px; }\n    .apac-sec h3{ font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#123a7a; margin:0 0 8px; }\n    .apac-grid2{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }\n    .apac-grid3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }\n    #apac-body label{ display:block; font-size:10.5px; font-weight:700; color:#5b6c68; margin-bottom:4px; }\n    #apac-body input,#apac-body select,#apac-body textarea{\n      width:100%; padding:8px 9px; border:1px solid #d8e6e3; border-radius:7px; font-size:12.5px; color:#16221f;\n    }\n    #apac-body textarea{ min-height:56px; resize:vertical; }\n    .apac-proc-grid{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:7px; }\n    .apac-proc-btn{ border:1.4px solid #d8e6e3; border-radius:9px; padding:9px; cursor:pointer; }\n    .apac-proc-btn:hover{ border-color:#17ab9e; }\n    .apac-proc-btn.sel{ border-color:#12958a; background:#e3f5f3; }\n    .apac-proc-btn .t{ font-size:11.5px; font-weight:700; }\n    .apac-proc-btn .c{ font-size:9.5px; color:#0e7a70; font-family:monospace; }\n    #apac-territorio-wrap{ display:none; margin-top:8px; }\n    #apac-territorio-wrap.show{ display:block; }\n    #apac-eco-variante-wrap{ display:none; margin-top:8px; }\n    #apac-eco-variante-wrap.show{ display:block; }\n    #apac-outro-wrap{ display:none; margin-top:8px; }\n    #apac-outro-wrap.show{ display:block; }\n    #apac-auto-aviso{ display:none; background:#fff4e2; color:#a15c00; font-size:11px; padding:8px 10px; border-radius:7px; margin-bottom:12px; }\n    #apac-sec-assinatura{ border:1.5px dashed #17ab9e; border-radius:12px; padding:14px; background:#f9fdfc; }\n    .apac-opcoes-assinatura{ display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; }\n    button.apac-primary{ background:#12958a; color:#fff; border:none; border-radius:9px; padding:10px 18px; font-size:13px; font-weight:800; cursor:pointer; }\n    button.apac-primary:hover{ background:#0b6a62; }\n    button.apac-primary:disabled{ background:#a0c9c4; cursor:not-allowed; }\n    button.apac-secondary{ background:#fff; color:#0e7a70; border:1.4px solid #17ab9e; border-radius:9px; padding:9px 14px; font-size:12.5px; font-weight:700; cursor:pointer; }\n    button.apac-secondary:hover{ background:#e3f5f3; }\n    button.apac-tertiary{ background:#f0f4f3; color:#0e7a70; border:1px solid #d8e6e3; border-radius:9px; padding:9px 14px; font-size:12px; font-weight:700; cursor:pointer; }\n    button.apac-tertiary:hover{ background:#e3f5f3; }\n    #apac-footer{ display:flex; justify-content:flex-end; gap:8px; padding:14px 20px; border-top:1px solid #eee; }\n    #apac-erro{ display:none; background:#fde8e8; border:1px solid #f0b8b8; color:#a12626; font-size:11.5px; padding:10px 12px; border-radius:8px; margin-top:6px; line-height:1.5; }\n    .apac-info-box{ background:#e8f4f8; color:#0e7a70; font-size:11px; padding:8px 10px; border-radius:7px; margin-bottom:10px; line-height:1.4; }";

  var HTML = "<div id=\"apac-modal\">\n      <div id=\"apac-modal-head\"><h2>Gerador de APAC</h2>\n        <div style=\"display:flex; gap:8px; align-items:center;\">\n          <button id=\"apac-refresh-modal\" title=\"Lê a tela do atendimento e busca os dados do paciente atual\" style=\"background:rgba(255,255,255,.2); border:none; color:#fff; border-radius:14px; padding:5px 10px; font-size:11px; font-weight:700; cursor:pointer;\">🔄 Atualizar paciente</button>\n          <button id=\"apac-historico-abrir\" title=\"Últimas APACs geradas nesta máquina\" style=\"background:rgba(255,255,255,.2); border:none; color:#fff; border-radius:14px; padding:5px 10px; font-size:11px; font-weight:700; cursor:pointer;\">📜 Histórico</button>\n          <button id=\"apac-close\">✕</button>\n        </div>\n      </div>\n      <div id=\"apac-body\">\n        <div id=\"apac-auto-aviso\"></div>\n\n        <div id=\"apac-historico-painel\"></div>\n\n        <div class=\"apac-sec\">\n          <h3>Município *</h3>\n          <select id=\"apac-municipio-sel\"></select>\n          <div id=\"apac-municipio-dica\" style=\"font-size:10.5px;color:#5b6c68;margin-top:4px;\"></div>\n        </div>\n\n        <div class=\"apac-sec\">\n          <h3>Estabelecimento</h3>\n          <div class=\"apac-grid2\">\n            <div><label>Nome *</label><select id=\"apac-estab-sel\"></select></div>\n            <div><label>CNES *</label><input id=\"apac-estab-cnes\" readonly style=\"background:#f1f5f9;\"></div>\n          </div>\n        </div>\n\n        <div class=\"apac-sec\">\n          <h3>Médico solicitante</h3>\n          <div class=\"apac-grid3\">\n            <div><label>Selecionar *</label><select id=\"apac-medico-sel\"></select></div>\n            <div><label>Nome *</label><input id=\"apac-medico-nome\"></div>\n            <div><label>CPF *</label><input id=\"apac-medico-cpf\"></div>\n          </div>\n        </div>\n\n        <div class=\"apac-sec\">\n          <h3>Paciente</h3>\n          <div class=\"apac-grid2\">\n            <div><label>Nome completo *</label><input id=\"apac-pac-nome\"></div>\n            <div><label>CPF *</label><input id=\"apac-pac-cpf\"></div>\n          </div>\n          <div class=\"apac-grid3\" style=\"margin-top:8px;\">\n            <div><label>Nascimento *</label><input type=\"date\" id=\"apac-pac-nasc\"></div>\n            <div><label>Sexo *</label><select id=\"apac-pac-sexo\"><option value=\"\" selected disabled>Selecione…</option><option value=\"M\">Masculino</option><option value=\"F\">Feminino</option></select></div>\n            <div><label>Nome da mãe *</label><input id=\"apac-pac-mae\"></div>\n          </div>\n        </div>\n\n        <div class=\"apac-sec\">\n          <h3>Procedimento *</h3>\n          <div class=\"apac-proc-grid\" id=\"apac-proc-grid\"></div>\n          <div id=\"apac-territorio-wrap\">\n            <label>Território vascular (obrigatório para Doppler)</label>\n            <select id=\"apac-territorio-sel\"></select>\n          </div>\n          <div id=\"apac-eco-variante-wrap\">\n            <label>Variante do ecocardiograma</label>\n            <select id=\"apac-eco-variante-sel\">\n              <option value=\"REPOUSO\">Transtorácica de repouso (padrão)</option>\n              <option value=\"ESTRESSE\">Com estresse (farmacológico/Dobutamina)</option>\n              <option value=\"TRANSESOFAGICO\">Transesofágico</option>\n            </select>\n          </div>\n          <div id=\"apac-outro-wrap\">\n            <label>Código SIGTAP *</label>\n            <input id=\"apac-outro-codigo\" placeholder=\"ex: 02.11.02.001-0\" style=\"margin-bottom:8px;\">\n            <label>Nome do procedimento *</label>\n            <input id=\"apac-outro-nome\" placeholder=\"como deve aparecer no campo 19\">\n          </div>\n        </div>\n\n        <div class=\"apac-sec\">\n          <h3>CID-10 *</h3>\n          <div class=\"apac-grid3\">\n            <div><label>Principal *</label><input id=\"apac-cid1\" placeholder=\"digite ou escolha\" autocomplete=\"off\"></div>\n            <div><label>Secundário</label><input id=\"apac-cid2\" autocomplete=\"off\"></div>\n            <div><label>Associados</label><input id=\"apac-cid3\" autocomplete=\"off\"></div>\n          </div>\n          <div style=\"margin-top:8px;\"><label>Descrição (campo 36) *</label><input id=\"apac-cid-desc\"></div>\n        </div>\n\n        <div class=\"apac-sec\">\n          <h3>Texto do pedido (campo 40) *</h3>\n          <textarea id=\"apac-obs\"></textarea>\n        </div>\n\n        <!-- ETAPA 2 — Assinatura -->\n        <div class=\"apac-sec\" id=\"apac-sec-assinatura\" style=\"display:none;\">\n          <h3>Etapa 2 — Assinatura</h3>\n          <div class=\"apac-info-box\">\n            ✅ <b>APAC gerada.</b> Ela já ficou registrada no 📜 Histórico. Escolha como quer finalizar:\n          </div>\n\n          <div class=\"apac-opcoes-assinatura\">\n            <button id=\"apac-assinar-govbr\" class=\"apac-primary\">\n              🏛️ Assinar via gov.br<br><small style=\"font-weight:400;opacity:.9;\">Baixa PDF e abre o portal</small>\n            </button>\n            <button id=\"apac-baixar-sem\" class=\"apac-tertiary\">\n              💾 Baixar sem assinar<br><small style=\"font-weight:400;opacity:.8;\">PDF simples</small>\n            </button>\n          </div>\n        </div>\n\n        <div id=\"apac-erro\"></div>\n        \n      </div>\n      <div id=\"apac-footer\">\n        <button class=\"apac-secondary\" id=\"apac-limpar\">Limpar</button>\n        <button class=\"apac-primary\" id=\"apac-gerar\">Gerar PDF</button>\n      </div>\n    </div>";

  /* ---- extraidas do original sem alteracao ---- */

  /* ---- validacao dos campos obrigatorios ----
   * Cada campo declara o ROTULO como ele aparece na tela e, quando existe
   * um jeito mais rapido de preencher, a dica. E o que permite a mensagem
   * dizer "falta o nome da mae, preencha o campo Nome da mae, e se ele
   * nao veio sozinho clique em Atualizar paciente" em vez de "campo
   * obrigatorio". O texto final e montado pelo nucleo
   * (core/mensagens.js), para o tom ser o mesmo em todos os modulos. */
  var CAMPOS_OBRIGATORIOS = [
      { id: "apac-medico-sel", descricao: "escolher o médico solicitante", rotulo: "Médico solicitante",
        comoResolver: "se a lista estiver vazia, cadastre-se no painel da engrenagem (⚙️)" },
      { id: "apac-medico-nome", descricao: "o nome do médico", rotulo: "Nome" },
      { id: "apac-medico-cpf", descricao: "o CPF do médico", rotulo: "CPF",
        comoResolver: "complete o cadastro dele no painel da engrenagem (⚙️)" },
      { id: "apac-municipio-sel", descricao: "o município do atendimento", rotulo: "Município",
        comoResolver: "ele é escolhido sozinho quando o Assistente reconhece o atendimento; se não vier, selecione na lista" },
      { id: "apac-estab-sel", descricao: "o estabelecimento solicitante", rotulo: "Nome",
        comoResolver: "cadastre a unidade no painel da engrenagem (⚙️), em Estabelecimentos" },
      { id: "apac-pac-nome", descricao: "o nome do paciente", rotulo: "Nome completo",
        comoResolver: "clique em “Atualizar paciente” para ler da tela do atendimento" },
      { id: "apac-pac-cpf", descricao: "o CPF do paciente", rotulo: "CPF",
        comoResolver: "clique em “Atualizar paciente” para ler da tela do atendimento" },
      { id: "apac-pac-nasc", descricao: "a data de nascimento", rotulo: "Nascimento" },
      { id: "apac-pac-sexo", descricao: "o sexo do paciente", rotulo: "Sexo" },
      { id: "apac-pac-mae", descricao: "o nome da mãe do paciente", rotulo: "Nome da mãe",
        comoResolver: "clique em “Atualizar paciente”; se ainda assim não vier, o Meeds não está mostrando esse dado na tela e você precisa digitá-lo" },
      { id: "__procedimento", descricao: "escolher o procedimento", rotulo: "Procedimento",
        comoResolver: "clique em um dos quadros de procedimento",
        vazio: function () { return !procedimentoAtivo; } },
      { id: "apac-territorio-sel", descricao: "o território vascular", rotulo: "Território vascular",
        so: function () { return procedimentoAtivo === "DOPPLER"; } },
      { id: "apac-outro-codigo", descricao: "o código SIGTAP do procedimento", rotulo: "Código SIGTAP",
        so: function () { return procedimentoAtivo === "OUTRO"; } },
      { id: "apac-outro-nome", descricao: "o nome do procedimento", rotulo: "Nome do procedimento",
        so: function () { return procedimentoAtivo === "OUTRO"; } },
      { id: "apac-cid1", descricao: "o CID-10 principal", rotulo: "Principal" },
      { id: "apac-cid-desc", descricao: "a descrição do diagnóstico", rotulo: "Descrição (campo 36)",
        comoResolver: "ela preenche sozinha quando o CID digitado é conhecido" },
      { id: "apac-obs", descricao: "o texto do pedido", rotulo: "Texto do pedido (campo 40)" }
    ];

  function camposFaltando() {
    return CAMPOS_OBRIGATORIOS.filter(function (campo) {
      if (typeof campo.so === "function" && !campo.so()) return false;
      if (typeof campo.vazio === "function") return campo.vazio();
      var el = shadow.getElementById(campo.id);
      return !el || !String(el.value || "").trim();
    });
  }

  function mensagemDeCamposFaltando(faltas) {
    return raiz.MeedsSuiteMensagens.camposFaltando(faltas, { acao: "gerar a APAC" });
  }



  /* GERACAO DO PDF — funcao extraida VERBATIM do original.
   * Todas as coordenadas (x, y, larguras, tamanhos de fonte, posicao dos
   * X de sexo, das caixinhas de digito do CNS) foram calibradas na mao
   * contra o formulario oficial da APAC. Nada aqui foi reescrito. */

  /* gerarPdfInterno e a FONTE UNICA DE VERDADE do documento da APAC.
   * Com apenasProduzir = true ela so desenha e devolve os bytes, sem
   * mexer na tela nem registrar historico — e o caminho do preview.
   * Como as duas portas passam por aqui, o que o medico ve no preview e
   * o mesmo arquivo que ele vai baixar. */
  function gerarPdfInterno(jsPDFCtor, apenasProduzir) {
    const nome = shadow.getElementById('apac-pac-nome').value.trim();
    const cpf = shadow.getElementById('apac-pac-cpf').value.trim();
    const nascInput = shadow.getElementById('apac-pac-nasc').value;
    const doc = new jsPDFCtor({ unit: 'pt', format: 'a4' });
    const W = 595.28, M = 20, CW = W - 2 * M; const TEAL = [0, 51, 160]; let y = 20;
    function bar(h, texto, size) {
      size = size || 6.5;
      doc.setFillColor(0,0,0); doc.rect(M, y, CW, h, 'F');
      doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(size);
      doc.text(texto, W/2, y+h/2+size/3, {align:'center'}); doc.setTextColor(0,0,0); y += h;
    }
    function box(x, yy, w, h, rotulo, valor, opts) {
      opts = opts || {};
      doc.setDrawColor(0,0,0); doc.setLineWidth(0.6); doc.rect(x, yy, w, h);
      doc.setFont('helvetica','normal'); doc.setFontSize(6.2); doc.setTextColor(0,0,0);
      doc.text(rotulo, x+4, yy+7);
      if (valor) {
        doc.setTextColor(TEAL[0],TEAL[1],TEAL[2]);
        let size = opts.size || 9.5; doc.setFont('helvetica','bold'); doc.setFontSize(size);
        while (size > 4.2 && doc.getTextWidth(String(valor)) > w-9) { size -= 0.3; doc.setFontSize(size); }
        const vy = Math.max(yy+h-4, yy+13);
        if (opts.center) doc.text(String(valor), x+w/2, vy, {align:'center'}); else doc.text(String(valor), x+5, vy);
        doc.setTextColor(0,0,0);
      }
    }
    function digitBox(x, yy, w, h, rotulo, valor, n) {
      n = n || 15; box(x, yy, w, h, rotulo, null);
      const cw = w/n; for (let i=1;i<n;i++) doc.line(x+i*cw, yy+h-16, x+i*cw, yy+h);
      if (valor) {
        doc.setTextColor(TEAL[0],TEAL[1],TEAL[2]); doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
        String(valor).replace(/\D/g,'').slice(0,n).split('').forEach((c,i)=> doc.text(c, x+cw*(i+0.5), yy+h-4, {align:'center'}));
        doc.setTextColor(0,0,0);
      }
    }
    function linhaProc(yy, h, cod, nome_, qtd, rot) {
      const w1=150, w3=55, w2=CW-w1-w3;
      box(M, yy, w1, h, rot[0], cod, {center:true}); box(M+w1, yy, w2, h, rot[1], nome_, {center:true}); box(M+w1+w2, yy, w3, h, rot[2], qtd, {center:true});
    }
    function wrap(x, yy, w, texto, size, leading) {
      if (!texto) return; doc.setTextColor(TEAL[0],TEAL[1],TEAL[2]); doc.setFont('helvetica','normal'); doc.setFontSize(size);
      doc.splitTextToSize(String(texto), w).forEach((ln,i)=> doc.text(ln, x, yy+i*leading)); doc.setTextColor(0,0,0);
    }

    doc.rect(M, y, CW, 40); doc.line(M+180, y, M+180, y+40);
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('SUS', M+8, y+24);
    doc.setFont('helvetica','bolditalic'); doc.setFontSize(10.5);
    doc.text('LAUDO PARA SOLICITAÇÃO/AUTORIZAÇÃO DE', M+180+(CW-180)/2, y+18, {align:'center'});
    doc.text('PROCEDIMENTO AMBULATORIAL', M+180+(CW-180)/2, y+30, {align:'center'});
    y += 40;

    bar(11, 'IDENTIFICAÇÃO DO ESTABELECIMENTO DE SAÚDE (SOLICITANTE)');
    box(M, y, CW-170, 20, '1 - NOME DO ESTABELECIMENTO', estabelecimentoEscolhido(), {size:8});
    box(M+CW-170, y, 170, 20, '2 - CNES', shadow.getElementById('apac-estab-cnes').value); y += 20;

    bar(11, 'IDENTIFICAÇÃO DO PACIENTE');
    const sexo = shadow.getElementById('apac-pac-sexo').value;
    box(M, y, CW-210, 22, '3 - NOME DO PACIENTE', nome);
    box(M+CW-210, y, 100, 22, '4 - SEXO', null);
    doc.setFontSize(6); doc.text('Mas.', M+CW-203, y+14); doc.text('Fem.', M+CW-160, y+14);
    doc.rect(M+CW-183, y+9, 8, 8); doc.rect(M+CW-140, y+9, 8, 8);
    if (sexo) { doc.setTextColor(TEAL[0],TEAL[1],TEAL[2]); doc.setFont('helvetica','bold'); doc.setFontSize(8);
      doc.text('X', sexo==='M'? M+CW-181.5 : M+CW-138.5, y+16); doc.setTextColor(0,0,0); }
    box(M+CW-110, y, 110, 22, '5 - Nº DO PRONTUÁRIO', null); y += 22;

    const [ay,am,ad] = nascInput.split('-');
    digitBox(M, y, CW-320, 22, '6 - CNS', cpf);
    box(M+CW-320, y, 145, 22, '7 - DATA DE NASCIMENTO', `${ad} / ${am} / ${ay}`, {center:true});
    box(M+CW-175, y, 90, 22, '8 - RAÇA/COR', null); box(M+CW-85, y, 85, 22, '8.1 - ETNIA', null); y += 22;

    box(M, y, CW-170, 22, '9 - NOME DA MÃE', shadow.getElementById('apac-pac-mae').value);
    box(M+CW-170, y, 170, 22, '10 - TELEFONE', null); y += 22;
    box(M, y, CW-170, 22, '11 - RESPONSÁVEL', null);
    box(M+CW-170, y, 170, 22, '12 - TELEFONE', null); y += 22;
    box(M, y, CW, 22, '13 - ENDEREÇO', null); y += 22;
    box(M, y, CW-295, 22, '14 - MUNICÍPIO', null);
    box(M+CW-295, y, 115, 22, '15 - IBGE', null);
    box(M+CW-180, y, 55, 22, '16 - UF', null); box(M+CW-125, y, 125, 22, '17 - CEP', null); y += 22;

    bar(11, 'PROCEDIMENTO SOLICITADO');
    let principal;
    if (procedimentoAtivo === 'DOPPLER') {
      const terr = shadow.getElementById('apac-territorio-sel').value || 'ULTRASSONOGRAFIA DOPPLER COLORIDO DE VASOS';
      principal = { codigo: CATALOGO.DOPPLER.codigo, nome: terr, qtde: '01' };
    } else if (procedimentoAtivo === 'CINTILO') {
      principal = { codigo: CATALOGO.CINTILO.codigo, nome: CATALOGO.CINTILO.label, qtde: '01' };
    } else if (procedimentoAtivo === 'ECO') {
      const variante = ECO_VARIANTES[shadow.getElementById('apac-eco-variante-sel').value || 'REPOUSO'];
      principal = { codigo: variante.codigo, nome: variante.nome, qtde: '01' };
    } else if (procedimentoAtivo === 'OUTRO') {
      principal = {
        codigo: shadow.getElementById('apac-outro-codigo').value.trim().toUpperCase(),
        nome: shadow.getElementById('apac-outro-nome').value.trim().toUpperCase(),
        qtde: '01',
      };
    } else {
      /* Sem procedimento escolhido, a linha sai em branco em vez de
       * quebrar. So a PREVIA chega aqui assim: gerarPdf() valida antes e
       * exige a escolha, entao o documento final nunca sai sem
       * procedimento. Isto existe para a previa poder desenhar desde a
       * primeira tecla, com o formulario ainda pela metade. */
      const p = CATALOGO[procedimentoAtivo] || { codigo: '', label: '' };
      principal = { codigo: p.codigo, nome: p.label, qtde: procedimentoAtivo ? '01' : '' };
    }
    linhaProc(y, 24, principal.codigo, principal.nome, principal.qtde, ['18 - CÓDIGO','19 - NOME','20 - QTDE.']); y += 24;

    bar(11, 'PROCEDIMENTO(S) SECUNDÁRIO(S)');
    const rots = [
      ['21 - CÓDIGO','22 - NOME','23 - QTDE.'],['24 - CÓDIGO','25 - NOME','26 - QTDE.'],
      ['27 - CÓDIGO','28 - NOME','29 - QTDE.'],['30 - CÓDIGO','31 - NOME','32 - QTDE.'],
      ['33 - CÓDIGO','34 - NOME','35 - QTDE.'],
    ];
    rots.forEach((rot,i)=>{ linhaProc(y, 20, '', '', '', rot); y += 20; });

    bar(11, 'JUSTIFICATIVA');
    const cid1v = shadow.getElementById('apac-cid1').value.trim().toUpperCase();
    const cid2v = shadow.getElementById('apac-cid2').value.trim().toUpperCase();
    const cid3v = shadow.getElementById('apac-cid3').value.trim().toUpperCase();
    box(M, y, CW-240, 24, '36 - DESCRIÇÃO DO DIAGNÓSTICO', null, {size:7});
    wrap(M+4, y+13, CW-250, shadow.getElementById('apac-cid-desc').value, 6.6, 7);
    box(M+CW-240, y, 80, 24, '37-CID10 PRINC.', cid1v, {center:true});
    box(M+CW-160, y, 80, 24, '38-CID10 SEC.', cid2v, {center:true});
    box(M+CW-80, y, 80, 24, '39-ASSOC.', cid3v, {center:true}); y += 24;
    box(M, y, CW, 78, '40 - OBSERVAÇÕES', null);
    wrap(M+6, y+16, CW-12, shadow.getElementById('apac-obs').value, 7.4, 9); y += 78;

    bar(11, 'SOLICITAÇÃO');
    const medicoNome = shadow.getElementById('apac-medico-nome').value;
    // Documento do profissional: passou a ser o CPF. O formulario oficial
    // aceita CNS ou CPF no campo 43/44 — tem a caixa de marcacao para
    // isso — e o medico raramente sabe o proprio CNS de cabeca.
    const medicoCpf = shadow.getElementById('apac-medico-cpf').value;
    const hoje = new Date();
    const dataHoje = `${String(hoje.getDate()).padStart(2,'0')} / ${String(hoje.getMonth()+1).padStart(2,'0')} / ${hoje.getFullYear()}`;
    box(M, y, CW-300, 24, '41 - NOME DO PROFISSIONAL', medicoNome);
    box(M+CW-300, y, 120, 24, '42-DATA', dataHoje, {center:true});
    box(M+CW-180, y, 180, 24, '45-ASSINATURA/CARIMBO', null); y += 24;
    box(M, y, 110, 24, '43 - DOCUMENTO', null);
    doc.setFontSize(6); doc.text('(   ) CNS', M+8, y+16); doc.text('(X) CPF', M+58, y+16);
    // 11 caixinhas: o CPF tem 11 digitos (o CNS tinha 15)
    digitBox(M+110, y, CW-110, 24, '44 - Nº DOCUMENTO', medicoCpf, 11); y += 24;

    bar(11, 'AUTORIZAÇÃO');
    box(M, y, CW-320, 24, '46 - AUTORIZADOR', null);
    box(M+CW-320, y, 140, 24, '47 - ÓRGÃO EMISSOR', null);
    box(M+CW-180, y, 180, 24, '52 - Nº DA APAC', null); y += 24;
    box(M, y, 110, 24, '48 - DOCUMENTO', null);
    digitBox(M+110, y, CW-290, 24, '49 - Nº DOCUMENTO', null);
    box(M+CW-180, y, 180, 24, '53 - VALIDADE', null); y += 24;
    box(M, y, 120, 24, '50-DATA', null);
    box(M+120, y, CW-120, 24, '51 - ASSINATURA/CARIMBO', null); y += 24;

    bar(11, 'ESTABELECIMENTO EXECUTANTE');
    box(M, y, CW-170, 20, '54 - NOME FANTASIA', null);
    box(M+CW-170, y, 170, 20, '55 - CNES', null);

    const slug = nome.replace(/[^A-Za-z0-9]+/g,'_').toUpperCase().slice(0,40);
    const filename = `APAC_${slug || 'PACIENTE'}.pdf`;
    const documento = { bytes: new Uint8Array(doc.output('arraybuffer')), filename };
    if (apenasProduzir) return documento;   // caminho do preview: nao toca na tela
    pdfGerado = documento;
    raiz.MeedsSuiteHistorico.registrar("apac", {
      nomePaciente: nome,
      cpfPaciente: cpf,
      titulo: principal.nome || procedimentoAtivo,
      medico: medicoNome,
      clinico: {
        procedimento: procedimentoAtivo,
        "apac-territorio-sel": shadow.getElementById("apac-territorio-sel").value,
        "apac-eco-variante-sel": shadow.getElementById("apac-eco-variante-sel").value,
        "apac-outro-codigo": shadow.getElementById("apac-outro-codigo").value,
        "apac-outro-nome": shadow.getElementById("apac-outro-nome").value,
        "apac-cid1": cid1v,
        "apac-cid2": cid2v,
        "apac-cid3": cid3v,
        "apac-cid-desc": shadow.getElementById("apac-cid-desc").value,
        "apac-obs": shadow.getElementById("apac-obs").value,
      },
    });
    shadow.getElementById('apac-sec-assinatura').style.display = 'block';
    shadow.getElementById('apac-sec-assinatura').scrollIntoView({ behavior:'smooth', block:'center' });
    toast("Pronto — APAC gerada. Escolha como assinar ou baixar.", 5000);
  }


  /* ----------------------------------------------------------------
   * UI — montagem, paineis e validacao
   * ---------------------------------------------------------------- */
  /* O <select> e montado pelo nucleo (cadastro.montarSelect): ele cuida do
   * "cadastrar medico" e ja seleciona sozinho quando ha um so medico
   * cadastrado neste navegador. */
  var seletorMedico = null;

  /* ---- estabelecimento ----
   * A lista vem do cadastro do nucleo (⚙️ → Estabelecimentos), semeada
   * na primeira execucao com o que estava em dados/formularios.json.
   * Antes o nome e o CNES vinham fixos e o medico que atendesse por
   * outra unidade tinha que digitar os dois a cada laudo. */
  /* Troca o municipio: recarrega o catalogo e ZERA o estabelecimento.
   * Zerar e deliberado — manter a unidade da cidade anterior e o jeito
   * mais facil de emitir uma APAC com o CNES errado, que e glosada. */
  function aplicarMunicipio(nome) {
    municipioAtual = nome || null;
    var d2 = dadosDoMunicipio(municipioAtual);
    CATALOGO = d2.procedimentos;
    ECO_VARIANTES = d2.ecoVariantes;
    TERRITORIOS = d2.territorios;
    CID_DIC = d2.cids;

    /* Trocar de cidade zera a unidade — inclusive o CNES lembrado. E de
     * proposito incomodo: manter o que estava la e exatamente como se
     * emite uma APAC com o CNES de outro municipio sem perceber. */
    cnesSelecionado = "";
    var selEstab = shadow.getElementById("apac-estab-sel");
    if (selEstab) selEstab.value = "";
    var cnes = shadow.getElementById("apac-estab-cnes");
    if (cnes) cnes.value = "";

    semearEstabelecimentosDoMunicipio();
    montarEstabelecimentos();

    var dica = shadow.getElementById("apac-municipio-dica");
    if (dica) {
      var qtd = estabelecimentosVisiveis().length;
      dica.textContent = !municipioAtual
        ? "Escolha o município para liberar as unidades solicitantes."
        : qtd
        ? qtd + " unidade(s) cadastrada(s) em " + municipioAtual + "."
        : "Nenhuma unidade cadastrada em " + municipioAtual +
          ". Cadastre pelo painel da engrenagem, em Unidades.";
    }
  }

  /* Copia para o cadastro local as unidades que o municipio traz no
   * arquivo de dados. So na primeira vez de cada municipio: depois disso
   * quem manda e a lista que o medico mantem. */
  function semearEstabelecimentosDoMunicipio() {
    if (!municipioAtual) return;
    var sementes = (dadosDoMunicipio(municipioAtual).estabelecimentos || []).map(function (e) {
      return { nome: e.nome, cnes: e.cnes, municipio: municipioAtual };
    });
    if (sementes.length) d.cadastro.semearEstabelecimentos(sementes, municipioAtual);
  }

  function montarMunicipios() {
    var sel = shadow.getElementById("apac-municipio-sel");
    if (!sel) return;
    var lista = municipiosDisponiveis();
    sel.innerHTML = "";
    var ph = document.createElement("option");
    ph.value = ""; ph.textContent = "Selecione o município…"; ph.disabled = true; ph.selected = true;
    sel.appendChild(ph);
    lista.forEach(function (m) {
      var o = document.createElement("option");
      o.value = m; o.textContent = m;
      sel.appendChild(o);
    });
    /* Um municipio so: nao ha o que escolher. */
    if (lista.length === 1) {
      sel.value = lista[0];
      aplicarMunicipio(lista[0]);
    }
  }

  /* O municipio do atendimento aberto, quando da para saber com certeza.
   * MENOS CLIQUES: o medico nao deveria informar o que o sistema ja sabe. */
  function detectarMunicipio() {
    var lista = municipiosDisponiveis();
    var achado = raiz.MeedsSuiteMunicipio.detectar(cache, lista) ||
                 raiz.MeedsSuiteMunicipio.detectarNaTela(lista);
    if (!achado || achado === municipioAtual) return;
    var sel = shadow.getElementById("apac-municipio-sel");
    if (sel) sel.value = achado;
    aplicarMunicipio(achado);
  }

  /* ------------------------------------------------------------------
   * A ARMADILHA DO Number("")
   * ------------------------------------------------------------------
   * O select de estabelecimento guarda o INDICE como texto, e o
   * placeholder vale "". Number("") nao e NaN: e 0 — ou seja, "nenhum
   * escolhido" era lido como "o primeiro da lista". Numa APAC isso sai
   * caro: o CNES da primeira unidade do municipio aparecia preenchido
   * sozinho e ia para o PDF sem o medico ter escolhido nada.
   * Toda leitura da escolha passa por aqui.
   * ------------------------------------------------------------------ */
  function estabelecimentosVisiveis() {
    if (!municipioAtual) return [];
    return d.cadastro.listarEstabelecimentosDe(municipioAtual);
  }

  function estabelecimentoDaVez() {
    var sel = shadow.getElementById("apac-estab-sel");
    var v = sel ? sel.value : "";
    if (!/^\d+$/.test(v)) return null;
    return estabelecimentosVisiveis()[Number(v)] || null;
  }

  function estabelecimentoEscolhido() {
    var e = estabelecimentoDaVez();
    return e ? e.nome : "";
  }

  function montarEstabelecimentos() {
    var sel = shadow.getElementById("apac-estab-sel");
    var cnesEl = shadow.getElementById("apac-estab-cnes");
    var lista = estabelecimentosVisiveis();
    /* O que se guarda para restaurar e o CNES, NAO o indice: o indice e
     * posicional dentro do municipio, entao guardar "0" faria a selecao
     * virar o primeiro estabelecimento da cidade nova — outra unidade,
     * ja preenchida, sem o medico tocar em nada. */
    var anterior = estabelecimentoDaVez();
    var cnesAnterior = (anterior && anterior.cnes) || cnesSelecionado;
    sel.innerHTML = "";

    var ph = document.createElement("option");
    ph.value = "";
    ph.textContent = lista.length ? "Selecione o estabelecimento…" : "Nenhum estabelecimento cadastrado";
    ph.disabled = true;
    ph.selected = true;
    sel.appendChild(ph);

    lista.forEach(function (e, i) {
      var o = document.createElement("option");
      o.value = String(i);
      o.textContent = e.nome;
      sel.appendChild(o);
    });

    var cadastrar = document.createElement("option");
    cadastrar.value = "__cadastrar";
    cadastrar.textContent = lista.length ? "＋ Cadastrar outro estabelecimento…" : "＋ Cadastrar estabelecimento…";
    sel.appendChild(cadastrar);

    // um so cadastrado: ja seleciona — o caso comum e o medico atender
    // sempre pela mesma unidade. Com duas ou mais, escolher por ele
    // seria emitir a APAC pela unidade errada sem ele perceber.
    if (lista.length === 1) {
      sel.value = "0";
    } else if (cnesAnterior) {
      for (var k = 0; k < lista.length; k++) {
        if (lista[k].cnes === cnesAnterior) { sel.value = String(k); break; }
      }
    }
    refletirCnes();
  }

  function refletirCnes() {
    var e = estabelecimentoDaVez();
    cnesSelecionado = e ? e.cnes : "";
    shadow.getElementById("apac-estab-cnes").value = cnesSelecionado;
  }

  function preencherMedico(ficha) {
    shadow.getElementById("apac-medico-nome").value = ficha ? ficha.nome : "";
    shadow.getElementById("apac-medico-cpf").value = ficha ? ficha.cpf : "";
  }

  function montarMedicos() {
    seletorMedico = d.cadastro.montarSelect(shadow.getElementById("apac-medico-sel"), {
      aoEscolher: preencherMedico,
      aoPedirCadastro: function () {
        d.abrirCadastro();
      },
    });
  }

  function montarProcGrid() {
    var grid = shadow.getElementById("apac-proc-grid");
    Object.keys(CATALOGO).forEach(function (key) {
      var p = CATALOGO[key];
      var btn = document.createElement("div");
      btn.className = "apac-proc-btn";
      btn.id = "apac-proc-" + key;
      btn.innerHTML = '<div class="t">' + p.nome + '</div><div class="c">' + (p.codigo || "digitar manualmente") + "</div>";
      btn.addEventListener("click", function () { selecionarProc(key); });
      grid.appendChild(btn);
    });
  }

  function selecionarProc(key) {
    procedimentoAtivo = key;
    Array.prototype.forEach.call(shadow.querySelectorAll(".apac-proc-btn"), function (b) { b.classList.remove("sel"); });
    shadow.getElementById("apac-proc-" + key).classList.add("sel");
    shadow.getElementById("apac-territorio-wrap").classList.toggle("show", key === "DOPPLER");
    shadow.getElementById("apac-eco-variante-wrap").classList.toggle("show", key === "ECO");
    shadow.getElementById("apac-outro-wrap").classList.toggle("show", key === "OUTRO");
    if (key === "DOPPLER") {
      var sel = shadow.getElementById("apac-territorio-sel");
      if (!sel.dataset.filled) {
        TERRITORIOS.forEach(function (t) {
          var o = document.createElement("option");
          o.value = t; o.textContent = t;
          sel.appendChild(o);
        });
        sel.dataset.filled = "1";
      }
    }
  }

  function autoDescricaoCid() {
    var campo = shadow.getElementById("apac-cid1");
    var cid = campo.value.trim().toUpperCase();
    if (campo.value !== cid) campo.value = cid;
    var desc = shadow.getElementById("apac-cid-desc");
    if (CID_DIC[cid]) { desc.value = CID_DIC[cid]; desc.dataset.auto = "1"; }
    else if (desc.dataset.auto === "1") { desc.value = ""; desc.dataset.auto = ""; }
  }

  function limparErro() {
    var el = shadow.getElementById("apac-erro");
    el.style.display = "none";
    el.textContent = "";
  }
  function mostrarErro(msg) {
    var el = shadow.getElementById("apac-erro");
    el.textContent = msg;
    el.style.display = "block";
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function limparForm() {
    ["apac-pac-nome","apac-pac-cpf","apac-pac-mae","apac-cid1","apac-cid2","apac-cid3",
     "apac-cid-desc","apac-obs","apac-outro-codigo","apac-outro-nome"
    ].forEach(function (id) { shadow.getElementById(id).value = ""; });
    shadow.getElementById("apac-pac-nasc").value = "";
    shadow.getElementById("apac-pac-sexo").value = "";
    if (seletorMedico) seletorMedico.atualizar();
    /* o municipio NAO e limpo: ele descreve o atendimento, nao o pedido */
    shadow.getElementById("apac-auto-aviso").style.display = "none";
    limparErro();
    procedimentoAtivo = null;
    pdfGerado = null;
    Array.prototype.forEach.call(shadow.querySelectorAll(".apac-proc-btn"), function (b) { b.classList.remove("sel"); });
    shadow.getElementById("apac-territorio-wrap").classList.remove("show");
    shadow.getElementById("apac-eco-variante-wrap").classList.remove("show");
    shadow.getElementById("apac-outro-wrap").classList.remove("show");
    shadow.getElementById("apac-sec-assinatura").style.display = "none";
  }

  function abrirModal() {
    // o cadastro pode ter mudado desde a ultima abertura (outro modal,
    // outra aba, restauracao de backup)
    if (seletorMedico) seletorMedico.atualizar();
    detectarMunicipio();
    preencherDoCache();
    // reforco: ao abrir, tambem le a tela na hora — cobre o caso do cache
    // (API) estar vazio ou desatualizado quando o medico clica.
    aplicarLeituraDaTela(lerDadosDaTela());
    overlay.abrir();
  }

  /* Porta do preview: produz os bytes sem validar e sem tocar na tela. */
  function produzirPdf() {
    return garantirJsPDF().then(function (jsPDFCtor) {
      return gerarPdfInterno(jsPDFCtor, true);
    });
  }

  function gerarPdf() {
    limparErro();
    var faltam = camposFaltando();
    if (faltam.length) { mostrarErro(mensagemDeCamposFaltando(faltam)); return; }
    var btn = shadow.getElementById("apac-gerar");
    var original = btn.textContent;
    btn.textContent = "Gerando…";
    btn.disabled = true;
    garantirJsPDF()
      .then(function (jsPDFCtor) {
        try { gerarPdfInterno(jsPDFCtor); }
        catch (e) { mostrarErro("Erro ao gerar PDF: " + e.message); }
      })
      .catch(function (e) {
        // biblioteca que nao carrega tem causa e solucao proprias (quase
        // sempre a rede da unidade bloqueando o CDN)
        mostrarErro(raiz.MeedsSuiteMensagens.BIBLIOTECA_NAO_CARREGOU("jsPDF", e.message));
      })
      .then(function () { btn.textContent = original; btn.disabled = false; });
  }

  function baixarPdf(bytes, filename) {
    var blob = new Blob([bytes], { type: "application/pdf" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function baixarSemAssinar() {
    if (!pdfGerado) { mostrarErro("Gere o PDF primeiro."); return; }
    baixarPdf(pdfGerado.bytes, pdfGerado.filename);
  }

  function assinarGovBr() {
    if (!pdfGerado) { mostrarErro("Gere o PDF primeiro."); return; }
    baixarPdf(pdfGerado.bytes, pdfGerado.filename);
    window.open("https://assinador.iti.br", "_blank");
    toast("PDF baixado. Acesse assinador.iti.br, faça login com gov.br e assine o arquivo.", 7000);
  }

  var historico = null;

  /* Repoe a parte CLINICA de uma APAC anterior. A identificacao do
   * paciente NAO e reposta: continua vindo da tela do atendimento. */
  function reabrirDoHistorico(entrada) {
    var c = entrada.clinico || {};
    if (c.procedimento) selecionarProc(c.procedimento);
    Object.keys(c).forEach(function (id) {
      if (id === "procedimento") return;
      var el = shadow.getElementById(id);
      if (el) el.value = c[id];
    });
    historico.esconder();
    var aviso = shadow.getElementById("apac-auto-aviso");
    aviso.style.display = "block";
    aviso.textContent =
      "Repus procedimento, CID e texto do pedido de “" + entrada.titulo + "”. " +
      "Os dados do paciente continuam sendo os da tela — confira antes de gerar.";
    toast("Dados clínicos repostos do histórico.", 3500);
  }

  /* Preenche codigo e descricao nos campos certos deste laudo. Usada
   * tanto pelo autocomplete de dentro do campo quanto pela janela de
   * busca separada — um caminho so, para os dois nunca divergirem. */
  /* Os tres campos de CID da APAC sao os campos 37 (principal), 38
   * (secundario) e 39 (associados) do formulario oficial. Todos recebem
   * codigo de CID e por isso todos ganham a busca.
   *
   * So o PRINCIPAL alimenta a "Descricao do diagnostico" (campo 36): ela
   * descreve o diagnostico principal. Se o secundario tambem escrevesse
   * ali, escolher um CID associado sobrescreveria a descricao do
   * principal — o medico perderia o que ja tinha, sem perceber. */
  function preencherCidEmCampo(idCampo, alimentaDescricao) {
    return function (codigo, descricao) {
      var campo = shadow.getElementById(idCampo);
      if (campo) campo.value = codigo;
      if (!alimentaDescricao) return;
      var desc = shadow.getElementById("apac-cid-desc");
      if (desc && (!desc.value || desc.dataset.auto === "1")) {
        desc.value = descricao || "";
        desc.dataset.auto = "1";
      }
    };
  }

  var CAMPOS_CID = [
    { id: "apac-cid1", alimentaDescricao: true },  // 37 - CID10 principal
    { id: "apac-cid2", alimentaDescricao: false }, // 38 - CID10 secundario
    { id: "apac-cid3", alimentaDescricao: false }, // 39 - associados
  ];

  function montarUI() {
    overlay = d.dock.criarOverlay({ estilo: CSS, html: HTML });

    historico = raiz.MeedsSuiteHistorico.montarPainel(
      shadow.getElementById("apac-historico-painel"),
      "apac",
      { aoReabrir: reabrirDoHistorico }
    );

    shadow.getElementById("apac-refresh-modal").addEventListener("click", forcarAtualizacao);
    shadow.getElementById("apac-close").addEventListener("click", overlay.fechar);
    shadow.getElementById("apac-gerar").addEventListener("click", gerarPdf);
    shadow.getElementById("apac-limpar").addEventListener("click", limparForm);
    shadow.getElementById("apac-cid1").addEventListener("input", autoDescricaoCid);
    shadow.getElementById("apac-assinar-govbr").addEventListener("click", assinarGovBr);
    shadow.getElementById("apac-baixar-sem").addEventListener("click", baixarSemAssinar);
    shadow.getElementById("apac-historico-abrir").addEventListener("click", historico.alternar);

    montarMunicipios();
    shadow.getElementById("apac-municipio-sel").addEventListener("change", function () {
      aplicarMunicipio(shadow.getElementById("apac-municipio-sel").value);
    });
    montarEstabelecimentos();
    shadow.getElementById("apac-estab-sel").addEventListener("change", function () {
      var sel = shadow.getElementById("apac-estab-sel");
      if (sel.value === "__cadastrar") {
        sel.value = "";
        refletirCnes();
        d.core.abrirCadastroEstabelecimentos();
        return;
      }
      refletirCnes();
    });

    // CPF se formata sozinho enquanto o medico digita (000.000.000-00)
    raiz.MeedsSuiteFormatos.aplicarMascaraCpf(shadow.getElementById("apac-pac-cpf"));
    raiz.MeedsSuiteFormatos.aplicarMascaraCpf(shadow.getElementById("apac-medico-cpf"));
    montarMedicos();
    montarProcGrid();
    }

  /* ----------------------------------------------------------------
   * CONTRATO DE MODULO
   * ---------------------------------------------------------------- */
  raiz.MeedsSuite.registerModule({
    id: "apac",
    nome: "APAC",
    descricao:
      "Gera o Laudo para Solicitação/Autorização de Procedimento Ambulatorial (APAC) em PDF e encaminha para assinatura no gov.br. O formulário é o mesmo em qualquer município; muda só a unidade solicitante.",
    versao: "2.0.0",
    configPadrao: {},

    botao: {
      icone: "📋",
      rotulo: "APAC",
      titulo: "Gerador de APAC",
      prioridade: 20,
    },

    // captura passiva: e a via mais confiavel de detectar troca de
    // paciente, porque nao depende de a URL mudar nem de conter o UUID
    assinaturasRede: [{ regex: /\/api\/v1\/Atendimento\/[0-9a-fA-F-]{36}(\?|$)/i, metodos: ["GET"] }],

    aoCargaRede: function (evt) {
      if (evt.status !== 200) return;
      var m = evt.url.match(ATEND_RE);
      if (!m) return;
      var json = evt.json();
      if (json) aplicarPayload(m[1], json);
    },

    start: function (deps) {
      d = deps;
      montarUI();

      /* Quando o medico e cadastrado ou removido no painel da engrenagem,
       * o <select> se redesenha sozinho — sem precisar fechar e reabrir
       * este modal. */



      /* Os campos de CID deste gerador sao anunciados para quem souber
       * buscar CID-10. O modulo de busca se acopla a cada um: o medico
       * clica no campo, digita o codigo ou o nome da doenca e escolhe.
       * Se aquele modulo estiver desligado, ninguem atende e os campos
       * continuam sendo texto livre, como sempre foram. */
      function anunciarCampoCid() {
        CAMPOS_CID.forEach(function (c) {
          var campo = shadow.getElementById(c.id);
          if (!campo) return;
          deps.publicarEvento("cid:conectar-campo", {
            input: campo,
            aoEscolher: preencherCidEmCampo(c.id, c.alimentaDescricao),
          });
        });
      }
      anunciarCampoCid();

      /* O modulo de busca pode ter subido DEPOIS deste laudo; nesse caso
       * o anuncio acima nao encontrou ninguem. Ele avisa quando fica
       * pronto, e o laudo anuncia de novo. */
      deps.assinarEvento("cid:pronto", function () {
        anunciarCampoCid();
        return true;
      });


      /* Anuncia este gerador para quem souber pre-visualizar PDF. O
       * modulo de preview se acopla ao modal e chama produzirPdf() — a
       * MESMA funcao que o botao "Gerar" usa, entao o que aparece na
       * previa e o arquivo que vai ser baixado. Se o preview estiver
       * desligado, ninguem atende e nada muda aqui. */
      function anunciarPreview() {
        deps.publicarEvento("preview:registrar-gerador", {
          id: "apac",
          nome: "APAC",
          seletorModal: "#apac-modal",
          overlay: overlay,
          produzirPdf: produzirPdf,
        });
      }
      anunciarPreview();
      deps.assinarEvento("preview:pronto", function () {
        anunciarPreview();
        return true;
      });

      deps.aoMudarCadastro(function () {
        if (seletorMedico) seletorMedico.atualizar();
        montarEstabelecimentos();
      });

      deps.aoClicarBotao(abrirModal);

      // polling de URL: segunda camada, para o caso de a captura passiva
      // nao ter visto a chamada do paciente atual
      ultimaUrl = location.href;
      timers.push(
        setInterval(function () {
          if (location.href !== ultimaUrl) {
            ultimaUrl = location.href;
            setTimeout(tentarAtualizarAutomaticamente, 400);
          }
        }, 1500)
      );
    },

    stop: function () {
      timers.forEach(clearInterval);
      timers = [];
      if (overlay) { overlay.remover(); overlay = null; }
      cache = null;
      cacheId = null;
      pdfGerado = null;
      procedimentoAtivo = null;
      d = null;
    },
  });
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
