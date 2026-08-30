/* ------------------------------------------------------------------
 * modules/apac-itauna/index.js
 * Origem: sodelfino/apac-itauna-meeds -> APAC_GERADOR_FINAL.user.js v1.9.0
 * ------------------------------------------------------------------
 * O QUE MUDOU NA MIGRACAO (e o que NAO mudou)
 *  - REMOVIDO daqui: trava de frame, deteccao de login, patch proprio de
 *    fetch/XHR, o shadow host proprio, o CSS de posicionamento do botao
 *    (#apac-fab bottom:24px right:24px) e o toast proprio. Tudo isso e
 *    do nucleo agora.
 *  - PRESERVADO byte a byte: a funcao gerarPdfInterno() inteira, com
 *    TODAS as coordenadas do formulario da APAC, e as tabelas de dados
 *    (CATALOGO, ECO_VARIANTES, TERRITORIOS, CID_DIC, MEDICOS_PADRAO).
 *    Essas coordenadas foram calibradas na mao contra o formulario
 *    oficial; reescrever qualquer uma seria arriscar o layout do laudo.
 *  - PRESERVADO em comportamento: captura passiva da API + polling de
 *    URL, leitura da tela como reforco, painel de medicos, historico
 *    local, validacao de campos e as duas saidas (assinar via gov.br /
 *    baixar sem assinar).
 *
 * DADOS DOS MEDICOS: MEDICOS_PADRAO abaixo mantem os mesmos CNS que
 * estavam no repositorio de origem. Continuam sendo apenas o
 * PRE-CADASTRO: na primeira execucao sao copiados para o armazenamento
 * local do Tampermonkey (GM_setValue) e a partir dai o medico edita ou
 * remove pelo painel "Gerenciar medicos" — a escolha dele e respeitada e
 * nunca mais sobrescrita.
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
        reject(new Error("jsPDF indisponível e GM_xmlhttpRequest não concedido."));
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
          reject(new Error("Falha de rede ao baixar o jsPDF."));
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
  var CHAVE_MEDICOS = "apac_medicos_v1";
  var CHAVE_HISTORICO = "apac_historico_v1";

  function lerGuardado(chave, padrao) {
    try {
      if (typeof GM_getValue === "function") return GM_getValue(chave, padrao);
    } catch (e) {}
    return d.storage.ler(chave, padrao);
  }
  function gravarGuardado(chave, valor) {
    try {
      if (typeof GM_setValue === "function") { GM_setValue(chave, valor); return; }
    } catch (e) {}
    d.storage.gravar(chave, valor);
  }

  function carregarMedicos() {
    try {
      var salvo = lerGuardado(CHAVE_MEDICOS, undefined);
      if (salvo === undefined) {
        gravarGuardado(CHAVE_MEDICOS, MEDICOS_PADRAO.slice());
        return MEDICOS_PADRAO.slice();
      }
      return salvo;
    } catch (e) {
      return MEDICOS_PADRAO.slice();
    }
  }
  function salvarMedicos(lista) { gravarGuardado(CHAVE_MEDICOS, lista); }
  function carregarHistorico() { return lerGuardado(CHAVE_HISTORICO, []) || []; }
  function registrarHistorico(entrada) {
    var lista = carregarHistorico();
    lista.unshift(entrada);
    gravarGuardado(CHAVE_HISTORICO, lista.slice(0, 30));
  }
  function limparHistorico() { gravarGuardado(CHAVE_HISTORICO, []); }

  function titleCase(s) {
    return String(s).split(" ").map(function (w) {
      return w ? w[0] + w.slice(1).toLowerCase() : w;
    }).join(" ");
  }
  var ESCAPE_HTML_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) { return ESCAPE_HTML_MAP[c]; });
  }
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
          : "Não encontrei o identificador do atendimento na URL nem consegui ler a tela. Abra o paciente na tela de Atendimento e tente de novo.",
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
            ? "A busca pela API falhou (" + e.message + "), mas preenchi " + camposDaTela + " campo(s) lendo a tela."
            : "Erro: " + e.message,
          4500
        );
      })
      .then(function () {
        btn.textContent = original;
        btn.disabled = false;
      });
  }


  /* ---- tabelas de dados, preservadas do repositorio de origem ---- */

  const CATALOGO = {
    HOLTER:  { nome: 'Holter 24h',              codigo: '02.11.02.004-4', label: 'MONITORAMENTO PELO SISTEMA HOLTER 24 HS (3 CANAIS)' },
    MAPA:    { nome: 'MAPA 24h',                codigo: '02.11.02.005-2', label: 'MONITORIZAÇÃO AMBULATORIAL DE PRESSÃO ARTERIAL (MAPA)' },
    TE:      { nome: 'Teste Ergométrico',       codigo: '02.11.02.006-0', label: 'TESTE DE ESFORÇO / TESTE ERGOMÉTRICO' },
    DOPPLER: { nome: 'Doppler vascular',        codigo: '02.05.01.004-0', label: null },
    CINTILO: { nome: 'Cintilografia miocárdio', codigo: '02.08.01.002-5', label: 'CINTILOGRAFIA DE MIOCÁRDIO P/ AVALIAÇÃO DA PERFUSÃO EM SITUAÇÃO DE ESTRESSE (MÍNIMO 3 PROJEÇÕES)' },
    ECO:     { nome: 'Ecocardiograma',          codigo: '02.05.01.003-2', label: null },
    CATETER: { nome: 'Cateterismo cardíaco',    codigo: '02.11.02.001-0', label: 'CATETERISMO CARDÍACO (CINECORONARIOGRAFIA)' },
    OUTRO:   { nome: 'Outro procedimento…',     codigo: '', label: null }, // médico digita código e nome
  };

  const ECO_VARIANTES = {
    REPOUSO:        { codigo: '02.05.01.003-2', nome: 'ECOCARDIOGRAFIA TRANSTORACICA' },
    ESTRESSE:       { codigo: '02.05.01.001-6', nome: 'ECOCARDIOGRAFIA COM ESTRESSE' },
    TRANSESOFAGICO: { codigo: '02.05.01.002-4', nome: 'ECOCARDIOGRAFIA BI-DIMENSIONAL TRANSESOFAGICO' },
  };

  const TERRITORIOS = [
    'DOPPLER DE ARTÉRIAS CARÓTIDAS E VERTEBRAIS', 'DOPPLER DE VEIAS CERVICAIS',
    'DOPPLER AORTA ABDOMINAL', 'DOPPLER DE ARTÉRIAS RENAIS',
    'DOPPLER ARTERIAL DE MEMBROS SUPERIORES', 'DOPPLER ARTERIAL DE MEMBROS INFERIORES',
    'DOPPLER VENOSO DE MEMBROS SUPERIORES', 'DOPPLER VENOSO DE MEMBROS INFERIORES',
  ];

  const CID_DIC = {
    "I10":"Hipertensão essencial (primária)","I11.9":"Doença cardíaca hipertensiva sem insuficiência cardíaca",
    "I15.9":"Hipertensão secundária não especificada",
    "I20.0":"Angina instável","I20.9":"Angina pectoris, não especificada",
    "I21.9":"Infarto agudo do miocárdio não especificado","I22.9":"Infarto do miocárdio recorrente não especificado",
    "I24.9":"Doença isquêmica aguda do coração, não especificada","I25.1":"Doença aterosclerótica do coração",
    "I25.9":"Doença isquêmica crônica do coração, não especificada",
    "I27.9":"Doença cardiopulmonar não especificada",
    "I34.0":"Insuficiência da valva mitral","I34.9":"Transtorno não-reumático da valva mitral, não especificado",
    "I35.0":"Estenose aórtica","I35.9":"Transtorno da valva aórtica não especificado",
    "I36.1":"Insuficiência não-reumática da valva tricúspide",
    "I38":"Endocardite de valva não especificada",
    "I42.0":"Cardiomiopatia dilatada","I42.9":"Cardiomiopatia não especificada",
    "I44.2":"Bloqueio atrioventricular total","I45.9":"Transtorno de condução não especificado",
    "I47.1":"Taquicardia supraventricular","I47.2":"Taquicardia ventricular",
    "I48":"Flutter e fibrilação atrial","I48.9":"Flutter e fibrilação atrial",
    "I49.5":"Síndrome do nó sinusal","I49.9":"Arritmia cardíaca não especificada",
    "I50":"Insuficiência cardíaca","I50.9":"Insuficiência cardíaca não especificada",
    "I51.7":"Cardiomegalia",
    "I70.0":"Aterosclerose da aorta","I70.2":"Aterosclerose das artérias das extremidades",
    "I71.4":"Aneurisma da aorta abdominal, sem menção de ruptura",
    "I73.9":"Doença vascular periférica não especificada",
    "I80.2":"Flebite e tromboflebite de outros vasos profundos dos membros inferiores",
    "I82.9":"Embolia e trombose venosa não especificada",
    "Q21.1":"Comunicação interatrial","Q24.9":"Malformação congênita do coração não especificada",
    "E11":"Diabetes mellitus não-insulino-dependente","E11.9":"Diabetes mellitus não-insulino-dependente - sem complicações",
    "E78.0":"Hipercolesterolemia pura","E78.5":"Hiperlipidemia não especificada",
    "R00.0":"Taquicardia não especificada","R00.1":"Bradicardia não especificada",
    "R00.2":"Palpitações",
    "R07.2":"Dor precordial","R07.4":"Dor torácica, não especificada",
    "R42":"Tontura e instabilidade","R55":"Síncope e colapso",
    "Z95.0":"Presença de marca-passo cardíaco","Z95.1":"Presença de enxerto de ponte aortocoronária",
    "Z95.5":"Presença de implante e enxerto de angioplastia coronária"
  };

  /* PRE-CADASTRO de medicos (nome, CNS). Copiado para o armazenamento
   * local do Tampermonkey na primeira execucao; depois disso o medico
   * gerencia a lista pelo painel e esta escolha NAO e mais sobrescrita.
   * Mantidos exatamente como estavam em apac-itauna-meeds. */

  const MEDICOS_PADRAO = [
    ['NEMER MARTINS TARRAF', '702604785248241'],
    ['KARLA PEREIRA RESENDE', '704604186091724'],
    ['ANA BEATRIZ JUNQUEIRA DE CASTRO', '709809077179292'],
  ];

  /* ---- CSS e HTML do modal (o posicionamento e do dock) ---- */
  var CSS = "#apac-modal{\n      background:#fff; border-radius:16px; max-width:720px; width:100%; max-height:88vh; overflow-y:auto;\n      padding:0; box-shadow:0 20px 60px rgba(0,0,0,.35);\n    }\n    #apac-modal-head{\n      background:linear-gradient(135deg,#0e7a70,#17ab9e); color:#fff; padding:16px 20px; border-radius:16px 16px 0 0;\n      display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; z-index:2;\n    }\n    #apac-modal-head h2{ margin:0; font-size:15px; }\n    #apac-close{ background:rgba(255,255,255,.2); border:none; color:#fff; width:26px; height:26px; border-radius:50%; cursor:pointer; font-size:14px; }\n    #apac-body{ padding:18px 20px; }\n    .apac-sec{ margin-bottom:16px; }\n    .apac-sec h3{ font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#0e7a70; margin:0 0 8px; }\n    .apac-grid2{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }\n    .apac-grid3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }\n    label{ display:block; font-size:10.5px; font-weight:700; color:#5b6c68; margin-bottom:4px; }\n    input,select,textarea{\n      width:100%; padding:8px 9px; border:1px solid #d8e6e3; border-radius:7px; font-size:12.5px; color:#16221f;\n    }\n    textarea{ min-height:56px; resize:vertical; }\n    .apac-proc-grid{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:7px; }\n    .apac-proc-btn{ border:1.4px solid #d8e6e3; border-radius:9px; padding:9px; cursor:pointer; }\n    .apac-proc-btn:hover{ border-color:#17ab9e; }\n    .apac-proc-btn.sel{ border-color:#12958a; background:#e3f5f3; }\n    .apac-proc-btn .t{ font-size:11.5px; font-weight:700; }\n    .apac-proc-btn .c{ font-size:9.5px; color:#0e7a70; font-family:monospace; }\n    #apac-territorio-wrap{ display:none; margin-top:8px; }\n    #apac-territorio-wrap.show{ display:block; }\n    #apac-eco-variante-wrap{ display:none; margin-top:8px; }\n    #apac-eco-variante-wrap.show{ display:block; }\n    #apac-outro-wrap{ display:none; margin-top:8px; }\n    #apac-outro-wrap.show{ display:block; }\n    #apac-auto-aviso{ display:none; background:#fff4e2; color:#a15c00; font-size:11px; padding:8px 10px; border-radius:7px; margin-bottom:12px; }\n    #apac-sec-assinatura{ border:1.5px dashed #17ab9e; border-radius:12px; padding:14px; background:#f9fdfc; }\n    .apac-opcoes-assinatura{ display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; }\n    button.apac-primary{ background:#12958a; color:#fff; border:none; border-radius:9px; padding:10px 18px; font-size:13px; font-weight:800; cursor:pointer; }\n    button.apac-primary:hover{ background:#0b6a62; }\n    button.apac-primary:disabled{ background:#a0c9c4; cursor:not-allowed; }\n    button.apac-secondary{ background:#fff; color:#0e7a70; border:1.4px solid #17ab9e; border-radius:9px; padding:9px 14px; font-size:12.5px; font-weight:700; cursor:pointer; }\n    button.apac-secondary:hover{ background:#e3f5f3; }\n    button.apac-tertiary{ background:#f0f4f3; color:#0e7a70; border:1px solid #d8e6e3; border-radius:9px; padding:9px 14px; font-size:12px; font-weight:700; cursor:pointer; }\n    button.apac-tertiary:hover{ background:#e3f5f3; }\n    #apac-footer{ display:flex; justify-content:flex-end; gap:8px; padding:14px 20px; border-top:1px solid #eee; }\n    #apac-erro{ display:none; background:#fde8e8; border:1px solid #f0b8b8; color:#a12626; font-size:11.5px; padding:10px 12px; border-radius:8px; margin-top:6px; line-height:1.5; }\n    .apac-info-box{ background:#e8f4f8; color:#0e7a70; font-size:11px; padding:8px 10px; border-radius:7px; margin-bottom:10px; line-height:1.4; }";

  var HTML = "<div id=\"apac-modal\">\n      <div id=\"apac-modal-head\"><h2>Gerador de APAC — Itaúna</h2>\n        <div style=\"display:flex; gap:8px; align-items:center;\">\n          <button id=\"apac-refresh-modal\" title=\"Lê a tela do atendimento e busca os dados do paciente atual\" style=\"background:rgba(255,255,255,.2); border:none; color:#fff; border-radius:14px; padding:5px 10px; font-size:11px; font-weight:700; cursor:pointer;\">🔄 Atualizar paciente</button>\n          <button id=\"apac-historico-abrir\" title=\"Últimas APACs geradas nesta máquina\" style=\"background:rgba(255,255,255,.2); border:none; color:#fff; border-radius:14px; padding:5px 10px; font-size:11px; font-weight:700; cursor:pointer;\">📜 Histórico</button>\n          <button id=\"apac-close\">✕</button>\n        </div>\n      </div>\n      <div id=\"apac-body\">\n        <div id=\"apac-auto-aviso\"></div>\n\n        <div id=\"apac-historico-painel\" style=\"display:none;border:1px solid #d8e6e3;border-radius:9px;padding:10px;margin-bottom:12px;background:#f7fbfa;\">\n          <div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;\">\n            <strong style=\"font-size:11px;color:#0e7a70;text-transform:uppercase;\">Últimos gerados nesta máquina</strong>\n            <button id=\"apac-historico-limpar\" class=\"apac-tertiary\" style=\"padding:3px 8px;font-size:10.5px;\">Limpar</button>\n          </div>\n          <div id=\"apac-historico-lista\" style=\"font-size:11.5px;line-height:1.6;\"></div>\n        </div>\n\n        <div class=\"apac-sec\">\n          <h3>Estabelecimento</h3>\n          <div class=\"apac-grid2\">\n            <div><label>Nome</label><input id=\"apac-estab-nome\" value=\"CENTRO DE ESPEC MEDICAS E ODONTO DR OVIDIO NOGUEIRA MACHADO\"></div>\n            <div><label>CNES</label><input id=\"apac-estab-cnes\" value=\"2105578\"></div>\n          </div>\n        </div>\n\n        <div class=\"apac-sec\">\n          <h3>Médico solicitante\n            <button id=\"apac-medicos-gerenciar\" class=\"apac-tertiary\" style=\"padding:3px 8px;font-size:10.5px;margin-left:6px;text-transform:none;letter-spacing:normal;\">⚙️ Gerenciar médicos</button>\n          </h3>\n          <div class=\"apac-grid3\">\n            <div><label>Selecionar *</label><select id=\"apac-medico-sel\"></select></div>\n            <div><label>Nome *</label><input id=\"apac-medico-nome\"></div>\n            <div><label>CNS *</label><input id=\"apac-medico-cns\"></div>\n          </div>\n          <div id=\"apac-medicos-painel\" style=\"display:none;margin-top:10px;border:1px solid #d8e6e3;border-radius:9px;padding:10px;background:#f7fbfa;\">\n            <div id=\"apac-medicos-lista\" style=\"margin-bottom:8px;font-size:12px;\"></div>\n            <div class=\"apac-grid3\">\n              <input id=\"apac-novo-medico-nome\" placeholder=\"Nome completo\">\n              <input id=\"apac-novo-medico-cns\" placeholder=\"CNS (15 dígitos)\">\n              <button id=\"apac-novo-medico-add\" class=\"apac-secondary\">+ Adicionar</button>\n            </div>\n            <div style=\"font-size:10.5px;color:#5b6c68;margin-top:6px;\">Fica salvo só neste navegador (Tampermonkey) — não é enviado a lugar nenhum nem entra no código do script.</div>\n          </div>\n        </div>\n\n        <div class=\"apac-sec\">\n          <h3>Paciente</h3>\n          <div class=\"apac-grid2\">\n            <div><label>Nome completo *</label><input id=\"apac-pac-nome\"></div>\n            <div><label>CPF *</label><input id=\"apac-pac-cpf\"></div>\n          </div>\n          <div class=\"apac-grid3\" style=\"margin-top:8px;\">\n            <div><label>Nascimento *</label><input type=\"date\" id=\"apac-pac-nasc\"></div>\n            <div><label>Sexo *</label><select id=\"apac-pac-sexo\"><option value=\"\" selected disabled>Selecione…</option><option value=\"M\">Masculino</option><option value=\"F\">Feminino</option></select></div>\n            <div><label>Nome da mãe *</label><input id=\"apac-pac-mae\"></div>\n          </div>\n        </div>\n\n        <div class=\"apac-sec\">\n          <h3>Procedimento *</h3>\n          <div class=\"apac-proc-grid\" id=\"apac-proc-grid\"></div>\n          <div id=\"apac-territorio-wrap\">\n            <label>Território vascular (obrigatório para Doppler)</label>\n            <select id=\"apac-territorio-sel\"></select>\n          </div>\n          <div id=\"apac-eco-variante-wrap\">\n            <label>Variante do ecocardiograma</label>\n            <select id=\"apac-eco-variante-sel\">\n              <option value=\"REPOUSO\">Transtorácica de repouso (padrão)</option>\n              <option value=\"ESTRESSE\">Com estresse (farmacológico/Dobutamina)</option>\n              <option value=\"TRANSESOFAGICO\">Transesofágico</option>\n            </select>\n          </div>\n          <div id=\"apac-outro-wrap\">\n            <label>Código SIGTAP *</label>\n            <input id=\"apac-outro-codigo\" placeholder=\"ex: 02.11.02.001-0\" style=\"margin-bottom:8px;\">\n            <label>Nome do procedimento *</label>\n            <input id=\"apac-outro-nome\" placeholder=\"como deve aparecer no campo 19\">\n          </div>\n        </div>\n\n        <div class=\"apac-sec\">\n          <h3>CID-10 *</h3>\n          <div class=\"apac-grid3\">\n            <div><label>Principal *</label><input id=\"apac-cid1\" list=\"apac-cid-list\" placeholder=\"digite ou escolha\" autocomplete=\"off\"></div>\n            <div><label>Secundário</label><input id=\"apac-cid2\" list=\"apac-cid-list\" autocomplete=\"off\"></div>\n            <div><label>Associados</label><input id=\"apac-cid3\" list=\"apac-cid-list\" autocomplete=\"off\"></div>\n          </div>\n          <div style=\"margin-top:8px;\"><label>Descrição (campo 36) *</label><input id=\"apac-cid-desc\"></div>\n        </div>\n\n        <div class=\"apac-sec\">\n          <h3>Texto do pedido (campo 40) *</h3>\n          <textarea id=\"apac-obs\"></textarea>\n        </div>\n\n        <!-- ETAPA 2 — Assinatura -->\n        <div class=\"apac-sec\" id=\"apac-sec-assinatura\" style=\"display:none;\">\n          <h3>Etapa 2 — Assinatura</h3>\n          <div class=\"apac-info-box\">\n            PDF gerado com sucesso. Escolha uma opção abaixo:\n          </div>\n\n          <div class=\"apac-opcoes-assinatura\">\n            <button id=\"apac-assinar-govbr\" class=\"apac-primary\">\n              🏛️ Assinar via gov.br<br><small style=\"font-weight:400;opacity:.9;\">Baixa PDF e abre o portal</small>\n            </button>\n            <button id=\"apac-baixar-sem\" class=\"apac-tertiary\">\n              💾 Baixar sem assinar<br><small style=\"font-weight:400;opacity:.8;\">PDF simples</small>\n            </button>\n          </div>\n        </div>\n\n        <div id=\"apac-erro\"></div>\n        <datalist id=\"apac-cid-list\"></datalist>\n      </div>\n      <div id=\"apac-footer\">\n        <button class=\"apac-secondary\" id=\"apac-limpar\">Limpar</button>\n        <button class=\"apac-primary\" id=\"apac-gerar\">Gerar PDF</button>\n      </div>\n    </div>";

  /* ---- extraidas do original sem alteracao ---- */

  function camposFaltando(){
    const faltam = []; const v = id => shadow.getElementById(id).value.trim();
    if(!shadow.getElementById('apac-medico-sel').value) faltam.push('seleção do médico');
    if(!v('apac-medico-nome')) faltam.push('nome do médico');
    if(!v('apac-medico-cns')) faltam.push('CNS do médico');
    if(!v('apac-pac-nome')) faltam.push('nome do paciente');
    if(!v('apac-pac-cpf')) faltam.push('CPF do paciente');
    if(!v('apac-pac-nasc')) faltam.push('data de nascimento');
    if(!v('apac-pac-sexo')) faltam.push('sexo');
    if(!v('apac-pac-mae')) faltam.push('nome da mãe');
    if(!procedimentoAtivo) faltam.push('procedimento');
    if(procedimentoAtivo === 'DOPPLER' && !v('apac-territorio-sel')) faltam.push('território vascular');
    if(procedimentoAtivo === 'OUTRO'){
      if(!v('apac-outro-codigo')) faltam.push('código SIGTAP do procedimento');
      if(!v('apac-outro-nome')) faltam.push('nome do procedimento');
    }
    if(!v('apac-cid1')) faltam.push('CID-10 principal');
    if(!v('apac-cid-desc')) faltam.push('descrição do diagnóstico');
    if(!v('apac-obs')) faltam.push('texto do pedido');
    return faltam;
  }

  function renderMedicosPainel() {
    const lista = carregarMedicos();
    const box = shadow.getElementById('apac-medicos-lista');
    if (!lista.length) {
      box.innerHTML = '<em style="color:#5b6c68;">Nenhum médico cadastrado ainda neste navegador. Adicione abaixo.</em>';
      return;
    }
    box.innerHTML = lista.map(([nome, cns], i) =>
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #e5efed;">
        <span>${escapeHtml(titleCase(nome))} <span style="color:#5b6c68;font-family:monospace;font-size:10.5px;">(${escapeHtml(cns)})</span></span>
        <button data-idx="${i}" class="apac-medico-remover" style="background:none;border:none;color:#a12626;cursor:pointer;font-size:11px;">remover</button>
      </div>`
    ).join('');
    box.querySelectorAll('.apac-medico-remover').forEach(btn => {
      btn.addEventListener('click', () => {
        const atual = carregarMedicos();
        atual.splice(Number(btn.dataset.idx), 1);
        salvarMedicos(atual);
        renderMedicosPainel();
        montarMedicos();
        const sel = shadow.getElementById('apac-medico-sel');
        if (!sel.value) {
          shadow.getElementById('apac-medico-nome').value = '';
          shadow.getElementById('apac-medico-cns').value = '';
        }
      });
    });
  }

  function renderHistorico() {
    const lista = carregarHistorico();
    const box = shadow.getElementById('apac-historico-lista');
    if (!lista.length) {
      box.innerHTML = '<em style="color:#5b6c68;">Nenhuma APAC gerada ainda nesta máquina.</em>';
      return;
    }
    box.innerHTML = lista.map(item =>
      `<div style="padding:3px 0;border-bottom:1px solid #e5efed;">
        <strong>${escapeHtml(item.paciente)}</strong> — ${escapeHtml(item.procedimento)} <span style="color:#5b6c68;">(${escapeHtml(item.quando)})</span>
      </div>`
    ).join('');
  }



  /* GERACAO DO PDF — funcao extraida VERBATIM do original.
   * Todas as coordenadas (x, y, larguras, tamanhos de fonte, posicao dos
   * X de sexo, das caixinhas de digito do CNS) foram calibradas na mao
   * contra o formulario oficial da APAC. Nada aqui foi reescrito. */

  function gerarPdfInterno(jsPDFCtor) {
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
    box(M, y, CW-170, 20, '1 - NOME DO ESTABELECIMENTO', shadow.getElementById('apac-estab-nome').value, {size:8});
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
      const p = CATALOGO[procedimentoAtivo]; principal = { codigo: p.codigo, nome: p.label, qtde: '01' };
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
    const medicoCns = shadow.getElementById('apac-medico-cns').value;
    const hoje = new Date();
    const dataHoje = `${String(hoje.getDate()).padStart(2,'0')} / ${String(hoje.getMonth()+1).padStart(2,'0')} / ${hoje.getFullYear()}`;
    box(M, y, CW-300, 24, '41 - NOME DO PROFISSIONAL', medicoNome);
    box(M+CW-300, y, 120, 24, '42-DATA', dataHoje, {center:true});
    box(M+CW-180, y, 180, 24, '45-ASSINATURA/CARIMBO', null); y += 24;
    box(M, y, 110, 24, '43 - DOCUMENTO', null);
    doc.setFontSize(6); doc.text('(X) CNS', M+8, y+16); doc.text('(   ) CPF', M+58, y+16);
    digitBox(M+110, y, CW-110, 24, '44 - Nº DOCUMENTO', medicoCns); y += 24;

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
    pdfGerado = { bytes: new Uint8Array(doc.output('arraybuffer')), filename };
    registrarHistorico({
      paciente: nome || 'Paciente',
      procedimento: principal.nome || procedimentoAtivo,
      quando: new Date().toLocaleString('pt-BR'),
    });
    shadow.getElementById('apac-sec-assinatura').style.display = 'block';
    shadow.getElementById('apac-sec-assinatura').scrollIntoView({ behavior:'smooth', block:'center' });
    toast('PDF gerado. Escolha como assinar ou baixar.', 5000);
  }


  /* ----------------------------------------------------------------
   * UI — montagem, paineis e validacao
   * ---------------------------------------------------------------- */
  function montarMedicos() {
    var sel = shadow.getElementById("apac-medico-sel");
    var valorAtual = sel.value;
    sel.innerHTML = "";
    var ph = document.createElement("option");
    ph.value = ""; ph.textContent = "Selecione o médico…"; ph.selected = true; ph.disabled = true;
    sel.appendChild(ph);
    carregarMedicos().forEach(function (par) {
      var o = document.createElement("option");
      o.value = par[0] + "|" + par[1];
      o.textContent = titleCase(par[0]);
      sel.appendChild(o);
    });
    var outro = document.createElement("option");
    outro.value = "outro"; outro.textContent = "Outro médico…";
    sel.appendChild(outro);
    if (valorAtual && Array.prototype.some.call(sel.options, function (o) { return o.value === valorAtual; })) {
      sel.value = valorAtual;
    }
  }

  function alternarPainelMedicos() {
    var p = shadow.getElementById("apac-medicos-painel");
    var abrindo = p.style.display === "none";
    p.style.display = abrindo ? "block" : "none";
    if (abrindo) renderMedicosPainel();
  }

  function adicionarMedico() {
    var nomeEl = shadow.getElementById("apac-novo-medico-nome");
    var cnsEl = shadow.getElementById("apac-novo-medico-cns");
    var nome = nomeEl.value.trim().toUpperCase();
    var cns = cnsEl.value.replace(/\D/g, "");
    if (!nome || cns.length !== 15) { toast("Informe nome e CNS com 15 dígitos.", 3500); return; }
    var atual = carregarMedicos();
    atual.push([nome, cns]);
    salvarMedicos(atual);
    nomeEl.value = ""; cnsEl.value = "";
    renderMedicosPainel();
    montarMedicos();
    toast("Médico adicionado.", 2500);
  }

  function alternarPainelHistorico() {
    var p = shadow.getElementById("apac-historico-painel");
    var abrindo = p.style.display === "none";
    p.style.display = abrindo ? "block" : "none";
    if (abrindo) renderHistorico();
  }

  function onMedicoChange() {
    var sel = shadow.getElementById("apac-medico-sel");
    if (sel.value === "" || sel.value === "outro") {
      shadow.getElementById("apac-medico-nome").value = "";
      shadow.getElementById("apac-medico-cns").value = "";
      return;
    }
    var partes = sel.value.split("|");
    shadow.getElementById("apac-medico-nome").value = partes[0];
    shadow.getElementById("apac-medico-cns").value = partes[1];
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

  function montarCidList() {
    var dl = shadow.getElementById("apac-cid-list");
    Object.keys(CID_DIC).sort().forEach(function (cod) {
      var o = document.createElement("option");
      o.value = cod; o.label = cod + " — " + CID_DIC[cod]; o.textContent = CID_DIC[cod];
      dl.appendChild(o);
    });
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
     "apac-cid-desc","apac-obs","apac-medico-nome","apac-medico-cns","apac-outro-codigo","apac-outro-nome"
    ].forEach(function (id) { shadow.getElementById(id).value = ""; });
    shadow.getElementById("apac-pac-nasc").value = "";
    shadow.getElementById("apac-pac-sexo").value = "";
    shadow.getElementById("apac-medico-sel").value = "";
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
    preencherDoCache();
    // reforco: ao abrir, tambem le a tela na hora — cobre o caso do cache
    // (API) estar vazio ou desatualizado quando o medico clica.
    aplicarLeituraDaTela(lerDadosDaTela());
    overlay.abrir();
  }

  function gerarPdf() {
    limparErro();
    var faltam = camposFaltando();
    if (faltam.length) { mostrarErro("Preencha: " + faltam.join(", ") + "."); return; }
    var btn = shadow.getElementById("apac-gerar");
    var original = btn.textContent;
    btn.textContent = "Gerando…";
    btn.disabled = true;
    garantirJsPDF()
      .then(function (jsPDFCtor) {
        try { gerarPdfInterno(jsPDFCtor); }
        catch (e) { mostrarErro("Erro ao gerar PDF: " + e.message); }
      })
      .catch(function (e) { mostrarErro("jsPDF não carregou: " + e.message); })
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

  function montarUI() {
    overlay = d.dock.criarOverlay({ estilo: CSS, html: HTML });

    shadow.getElementById("apac-refresh-modal").addEventListener("click", forcarAtualizacao);
    shadow.getElementById("apac-close").addEventListener("click", overlay.fechar);
    shadow.getElementById("apac-gerar").addEventListener("click", gerarPdf);
    shadow.getElementById("apac-limpar").addEventListener("click", limparForm);
    shadow.getElementById("apac-cid1").addEventListener("input", autoDescricaoCid);
    shadow.getElementById("apac-medico-sel").addEventListener("change", onMedicoChange);
    shadow.getElementById("apac-assinar-govbr").addEventListener("click", assinarGovBr);
    shadow.getElementById("apac-baixar-sem").addEventListener("click", baixarSemAssinar);
    shadow.getElementById("apac-medicos-gerenciar").addEventListener("click", alternarPainelMedicos);
    shadow.getElementById("apac-novo-medico-add").addEventListener("click", adicionarMedico);
    shadow.getElementById("apac-historico-abrir").addEventListener("click", alternarPainelHistorico);
    shadow.getElementById("apac-historico-limpar").addEventListener("click", function () {
      limparHistorico();
      renderHistorico();
    });

    montarMedicos();
    montarProcGrid();
    montarCidList();
  }

  /* ----------------------------------------------------------------
   * CONTRATO DE MODULO
   * ---------------------------------------------------------------- */
  raiz.MeedsSuite.registerModule({
    id: "apac-itauna",
    nome: "APAC — Itaúna",
    descricao:
      "Gera o Laudo para Solicitação/Autorização de Procedimento Ambulatorial (APAC) de Itaúna em PDF e encaminha para assinatura no gov.br.",
    versao: "2.0.0",
    configPadrao: {},

    botao: {
      icone: "📋",
      rotulo: "APAC - Itaúna",
      titulo: "Gerador de APAC — Itaúna",
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
