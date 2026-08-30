/* ------------------------------------------------------------------
 * modules/cmd/index.js
 * Origem: sodelfino/laudo-cmd-meeds -> CMD_GERADOR.user.js v1.4.0
 * ------------------------------------------------------------------
 * O QUE MUDOU NA MIGRACAO (e o que NAO mudou)
 *  - REMOVIDO daqui: trava de frame, deteccao de login, shadow host
 *    proprio, CSS de posicionamento do botao (#cmd-fab) e do toast,
 *    e o loop proprio de recheque de login. Tudo isso e do nucleo.
 *  - PRESERVADO byte a byte: a funcao gerarPdf() inteira, incluindo o
 *    ajuste manual do DefaultAppearance da justificativa (o DA original
 *    do campo nao traz operador Tf, entao o pdf-lib nao consegue
 *    autoajustar a fonte e o texto saia enorme) e a quebra de linha
 *    medida na mao, e as tabelas MEDICOS / ORIGENS / CID_DIC /
 *    CATALOGO_PROCEDIMENTOS. A secao 04 (Junta de Autorizacao) continua
 *    intocada — e preenchida pela regulacao, nao pelo medico.
 *  - A leitura da tela passou a usar o dom-reader do nucleo, que ja
 *    tenta as variantes de rotulo e normaliza acento. A lista de variantes do
 *    rotulo do nome da mae, que era a inteligencia exclusiva deste
 *    modulo, virou infraestrutura do nucleo e agora serve a todos.
 *
 * PRIVACIDADE: os dados do paciente ficam so no formulario em memoria.
 * Nada e gravado em disco nem enviado para fora do navegador.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var d = null;
  var overlay = null;
  var timers = [];

  /* PDF base oficial, embutido em base64 pelo asset do modulo. */
  var BASE_PDF_B64 = raiz.MEEDS_CMD_BASE_PDF_B64;

  /* Nome herdado do original, para gerarPdf() continuar valendo sem
   * reescrita. */
  var CMD_BASE_PDF_B64 = BASE_PDF_B64;

  /* SHIM DE COMPATIBILIDADE — ver modules/apac-itauna/index.js.
   * Reproduz a interface shadow.getElementById() por cima do overlay do
   * dock, para o codigo migrado continuar valendo sem reescrita. */
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

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  /* ----------------------------------------------------------------
   * pdf-lib — resolvido do escopo global (o bootloader carrega via
   * @require), com o mesmo fallback do original.
   * ---------------------------------------------------------------- */
  function resolverPdfLib() {
    var escopos = [];
    try { escopos.push(raiz); } catch (e) {}
    try { if (typeof unsafeWindow !== "undefined") escopos.push(unsafeWindow); } catch (e) {}
    try { escopos.push(window); } catch (e) {}
    try { escopos.push(globalThis); } catch (e) {}
    for (var i = 0; i < escopos.length; i++) {
      if (escopos[i] && escopos[i].PDFLib) return escopos[i].PDFLib;
    }
    return null;
  }

  var pdfLibCarregandoPromise = null;
  function garantirPdfLib() {
    var direto = resolverPdfLib();
    if (direto) return Promise.resolve(direto);
    if (pdfLibCarregandoPromise) return pdfLibCarregandoPromise;
    pdfLibCarregandoPromise = new Promise(function (resolve, reject) {
      if (typeof GM_xmlhttpRequest !== "function") {
        reject(new Error("pdf-lib indisponível e GM_xmlhttpRequest não concedido."));
        return;
      }
      GM_xmlhttpRequest({
        method: "GET",
        url: "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js",
        onload: function (res) {
          try {
            (0, eval)(res.responseText);
            var lib = resolverPdfLib();
            if (lib) resolve(lib);
            else reject(new Error("pdf-lib avaliado mas não exposto."));
          } catch (e) { reject(e); }
        },
        onerror: function () { reject(new Error("Falha de rede ao baixar o pdf-lib.")); },
      });
    });
    return pdfLibCarregandoPromise;
  }

  function formatarCpf(digits) {
    var dd = (digits || "").replace(/\D/g, "");
    if (dd.length !== 11) return digits || "";
    return dd.slice(0,3) + "." + dd.slice(3,6) + "." + dd.slice(6,9) + "-" + dd.slice(9,11);
  }

  /* Mascara dd/mm/aaaa: insere as barras enquanto digita, aceita colar a
   * data ja formatada e ignora tudo que nao for digito. */
  function ativarMascaraData(input) {
    input.addEventListener("input", function () {
      var dd = input.value.replace(/\D/g, "").slice(0, 8);
      var out = dd;
      if (dd.length > 4) out = dd.slice(0,2) + "/" + dd.slice(2,4) + "/" + dd.slice(4);
      else if (dd.length > 2) out = dd.slice(0,2) + "/" + dd.slice(2);
      input.value = out;
    });
  }

  function limparErro() {
    var el = shadow.getElementById("cmd-erro");
    el.style.display = "none";
    el.textContent = "";
  }
  function mostrarErro(msg) {
    var el = shadow.getElementById("cmd-erro");
    el.textContent = msg;
    el.style.display = "block";
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function baixarPdf(bytes, filename) {
    var blob = new Blob([bytes], { type: "application/pdf" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }


  /* ---- dados fixos, preservados do repositorio de origem ---- */
  // Ja vem fixo no PDF oficial (campo municipio_1) — nao e reescrito.
  var MUNICIPIO_FIXO = "CONCEIÇÃO DO MATO DENTRO";

  /* Os medicos NAO ficam mais no codigo. Desde a v2.1.0 o cadastro vive
   * so no navegador do proprio medico (core/cadastro.js, armazenamento do
   * Tampermonkey), e e compartilhado pelos tres geradores de laudo: quem
   * se cadastra uma vez aparece na APAC, em Sete Lagoas e em CMD.
   * Motivo: com o repositorio publico, nome/CRM/CPF no fonte e dado
   * pessoal exposto. Ver docs/ARQUITETURA.md, decisao D11. */

  var ORIGENS = ['CEMO DR SEBASTIAO SOARES DOS SANTOS'];

  var CID_DIC = {
    // já usados no laudo de exemplo desta unidade
    'K83.8': 'Outras doenças especificadas das vias biliares',
    // cardiologia (Itaúna)
    'I10': 'Hipertensão essencial (primária)',
    'I11.9': 'Doença cardíaca hipertensiva sem insuficiência cardíaca',
    'I15.9': 'Hipertensão secundária não especificada',
    'I20.0': 'Angina instável',
    'I20.9': 'Angina pectoris, não especificada',
    'I21.9': 'Infarto agudo do miocárdio não especificado',
    'I22.9': 'Infarto do miocárdio recorrente não especificado',
    'I24.9': 'Doença isquêmica aguda do coração, não especificada',
    'I25.1': 'Doença aterosclerótica do coração',
    'I25.9': 'Doença isquêmica crônica do coração, não especificada',
    'I27.9': 'Doença cardiopulmonar não especificada',
    'I34.0': 'Insuficiência da valva mitral',
    'I34.9': 'Transtorno não-reumático da valva mitral, não especificado',
    'I35.0': 'Estenose aórtica',
    'I35.9': 'Transtorno da valva aórtica não especificado',
    'I36.1': 'Insuficiência não-reumática da valva tricúspide',
    'I38': 'Endocardite de valva não especificada',
    'I42.0': 'Cardiomiopatia dilatada',
    'I42.9': 'Cardiomiopatia não especificada',
    'I44.2': 'Bloqueio atrioventricular total',
    'I45.9': 'Transtorno de condução não especificado',
    'I47.1': 'Taquicardia supraventricular',
    'I47.2': 'Taquicardia ventricular',
    'I48': 'Flutter e fibrilação atrial',
    'I48.9': 'Flutter e fibrilação atrial',
    'I49.5': 'Síndrome do nó sinusal',
    'I49.9': 'Arritmia cardíaca não especificada',
    'I50': 'Insuficiência cardíaca',
    'I50.9': 'Insuficiência cardíaca não especificada',
    'I51.7': 'Cardiomegalia',
    'I70.0': 'Aterosclerose da aorta',
    'I70.2': 'Aterosclerose das artérias das extremidades',
    'I71.4': 'Aneurisma da aorta abdominal, sem menção de ruptura',
    'I73.9': 'Doença vascular periférica não especificada',
    'I80.2': 'Flebite e tromboflebite de outros vasos profundos dos membros inferiores',
    'I82.9': 'Embolia e trombose venosa não especificada',
    'Q21.1': 'Comunicação interatrial',
    'Q24.9': 'Malformação congênita do coração não especificada',
    'E78.5': 'Hiperlipidemia não especificada',
    'R00.0': 'Taquicardia não especificada',
    'R00.1': 'Bradicardia não especificada',
    'R00.2': 'Palpitações',
    'R07.2': 'Dor precordial',
    'R42': 'Tontura e instabilidade',
    'R55': 'Síncope e colapso',
    'Z95.0': 'Presença de marca-passo cardíaco',
    'Z95.1': 'Presença de enxerto de ponte aortocoronária',
    'Z95.5': 'Presença de implante e enxerto de angioplastia coronária',
    // neurologia / cefaleia (Sete Lagoas)
    'G43.0': 'Enxaqueca sem aura (enxaqueca comum)',
    'G43.8': 'Outras formas de enxaqueca',
    'G43.9': 'Enxaqueca não especificada',
    'G44.1': 'Cefaleia vascular, não classificada em outra parte',
    'G40.9': 'Epilepsia não especificada',
    'G93.4': 'Encefalopatia não especificada',
    'R51': 'Cefaleia',
    'G80.9': 'Paralisia cerebral não especificada',
    'F84.0': 'Autismo infantil',
    'F70': 'Retardo mental leve',
    'F71': 'Retardo mental moderado',
    'F82': 'Transtorno específico do desenvolvimento motor',
    'F80.9': 'Transtorno de desenvolvimento da fala ou linguagem não especificado',
    'Q90.9': 'Síndrome de Down não especificada',
    'P07.3': 'Outros recém-nascidos pré-termo',
    'P14.3': 'Outras lesões do plexo braquial devidas a traumatismo de parto',
    'L93': 'Lúpus eritematoso',
    'G00.9': 'Meningite bacteriana não especificada',
    'H90.3': 'Perda de audição neurossensorial bilateral',
    // reumatologia / ortopedia (Sete Lagoas)
    'M18.0': 'Artrose primária bilateral das primeiras articulações carpometacarpianas',
    'M19.9': 'Artrose não especificada',
    'M25.5': 'Dor articular',
    'M79.1': 'Mialgia',
    'M54.5': 'Dor lombar baixa',
    'M54.2': 'Cervicalgia',
    'M06.9': 'Artrite reumatoide não especificada',
    'M32.9': 'Lúpus eritematoso sistêmico não especificado',
    'M81.9': 'Osteoporose não especificada',
    'M85.8': 'Outros transtornos especificados da densidade e da estrutura ósseas',
    'M47.9': 'Espondilose não especificada',
    'M51.1': 'Transtornos de discos lombares e de outros discos intervertebrais com radiculopatia',
    // endocrinologia (Sete Lagoas)
    'E10.9': 'Diabetes mellitus tipo 1 sem complicações',
    'E11.9': 'Diabetes mellitus tipo 2 sem complicações',
    'E03.9': 'Hipotireoidismo não especificado',
    'E05.9': 'Tireotoxicose não especificada',
    'E66.9': 'Obesidade não especificada',
    'E78.0': 'Hipercolesterolemia pura',
    // geral (Sete Lagoas)
    'R73.9': 'Hiperglicemia não especificada',
    'J44.9': 'Doença pulmonar obstrutiva crônica não especificada',
    'N18.9': 'Doença renal crônica não especificada',
    'R07.4': 'Dor torácica, não especificada',
  };

  var CATALOGO_PROCEDIMENTOS = {
    RM_CRANIO:            { nome: 'Ressonância nuclear magnética de crânio',                              codigo: '02.07.01.006-4' },
    RM_BASE_CRANIO:       { nome: 'Ressonância nuclear magnética de base do crânio',                      codigo: '02.07.01.006-4' },
    RM_SELA_TURCICA:      { nome: 'Ressonância nuclear magnética de sela túrcica',                        codigo: '02.07.01.007-2' },
    RM_ATM:                { nome: 'Ressonância nuclear magnética de articulação temporomandibular (bilateral)', codigo: '02.07.01.002-1' },
    ANGIO_RM_CEREBRAL:     { nome: 'Angiorressonância cerebral',                                          codigo: '02.07.01.001-3' },
    RM_COLUNA_CERVICAL:    { nome: 'Ressonância nuclear magnética de coluna cervical',                    codigo: '02.07.01.003-0' },
    RM_COLUNA_TORACICA:    { nome: 'Ressonância nuclear magnética de coluna torácica',                    codigo: '02.07.01.005-6' },
    RM_COLUNA_LOMBOSSACRA: { nome: 'Ressonância nuclear magnética de coluna lombo-sacra',                  codigo: '02.07.01.004-8' },
    RM_CORACAO_AORTA:      { nome: 'Ressonância nuclear magnética de coração/aorta com cine',              codigo: '02.07.02.001-9' },
    RM_MEMBRO_SUPERIOR:    { nome: 'Ressonância nuclear magnética de membro superior (unilateral)',        codigo: '02.07.02.002-7' },
    TC_CRANIO:             { nome: 'Tomografia computadorizada do crânio',                                codigo: '02.06.01.007-9' },
    TC_SELA_TURCICA:       { nome: 'Tomografia computadorizada de sela túrcica',                           codigo: '02.06.01.006-0' },
    TC_FACE_ATM:           { nome: 'Tomografia computadorizada de face/seios da face/ATM',                 codigo: '02.06.01.004-4' },
    TC_PESCOCO:            { nome: 'Tomografia computadorizada do pescoço',                                codigo: '02.06.01.005-2' },
    TC_COLUNA_CERVICAL:    { nome: 'Tomografia computadorizada de coluna cervical (com ou sem contraste)', codigo: '02.06.01.001-0' },
    TC_COLUNA_TORACICA:    { nome: 'Tomografia computadorizada de coluna torácica (com ou sem contraste)', codigo: '02.06.01.003-6' },
    TC_COLUNA_LOMBOSSACRA: { nome: 'Tomografia computadorizada de coluna lombo-sacra (com ou sem contraste)', codigo: '02.06.01.002-8' },
    TC_TORAX:              { nome: 'Tomografia computadorizada de tórax (sem contraste)',                  codigo: '02.06.02.003-1' },
    TC_ABDOME_SUPERIOR:    { nome: 'Tomografia computadorizada de abdome superior',                        codigo: '02.06.03.001-0' },
    TC_PELVE:              { nome: 'Tomografia computadorizada de pelve/bacia/abdome inferior',            codigo: '02.06.03.003-7' },
    TC_ARTIC_MEMBRO_SUP:   { nome: 'Tomografia computadorizada de articulações de membro superior',        codigo: '02.06.02.001-5' },
    TC_ARTIC_MEMBRO_INF:   { nome: 'Tomografia computadorizada de articulações de membro inferior',        codigo: '02.06.03.002-9' },
    TC_SEGMENTOS_APENDIC:  { nome: 'Tomografia computadorizada de segmentos apendiculares (braço, antebraço, mão, coxa, perna, pé)', codigo: '02.06.02.002-3' },
    DENSITOMETRIA_2SEG:    { nome: 'Densitometria óssea (dois segmentos)',                                 codigo: '02.04.06.002-8' },
    DENSITOMETRIA_CORPO:   { nome: 'Densitometria óssea (corpo inteiro)',                                  codigo: '02.04.06.002-8' },
    ENDOSCOPIA_DIGESTIVA_ALTA: { nome: 'Endoscopia digestiva alta (esofagogastroduodenoscopia)',           codigo: '02.09.01.003-7' },
    COLONOSCOPIA:          { nome: 'Colonoscopia (coloscopia)',                                            codigo: '02.09.01.002-9' },
    ANGIOCORONARIOGRAFIA:  { nome: 'Angiocoronariografia (cateterismo cardíaco)',                           codigo: '02.11.02.001-0' },
    CINTILOGRAFIA_MIOCARDIO_ESTRESSE: { nome: 'Cintilografia de perfusão do miocárdio (estresse, mín. 3 projeções)', codigo: '02.08.01.002-5' },
    CINTILOGRAFIA_MIOCARDIO_REPOUSO:  { nome: 'Cintilografia de perfusão do miocárdio (repouso, mín. 3 projeções)',  codigo: '02.08.01.003-3' },
    ECOCARDIOGRAMA_TRANSTORACICO: { nome: 'Ecocardiograma transtorácico',                                  codigo: '02.05.01.003-2' },
    TESTE_ERGOMETRICO:     { nome: 'Teste ergométrico (teste de esforço)',                                 codigo: '02.11.02.006-0' },
    HOLTER_24H:            { nome: 'Holter 24 horas (eletrocardiograma dinâmico, 3 canais)',                codigo: '02.11.02.004-4' },
    MAPA_24H:              { nome: 'MAPA 24 horas (monitorização ambulatorial da pressão arterial)',        codigo: '02.11.02.005-2' },
    RETOSSIGMOIDOSCOPIA:   { nome: 'Retossigmoidoscopia (diagnóstica)',                                     codigo: '02.09.01.005-3' },
  };

  /* ---- CSS e HTML do modal (o posicionamento e do dock) ---- */
  var CSS = "#cmd-modal{\n      background:#fff; border-radius:16px; max-width:720px; width:100%; max-height:88vh; overflow-y:auto;\n      padding:0; box-shadow:0 20px 60px rgba(0,0,0,.35);\n    }\n    #cmd-modal-head{\n      background:linear-gradient(135deg,#123a7a,#1a56ad); color:#fff; padding:16px 20px; border-radius:16px 16px 0 0;\n      display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; z-index:2;\n    }\n    #cmd-modal-head h2{ margin:0; font-size:15px; }\n    #cmd-close{ background:rgba(255,255,255,.2); border:none; color:#fff; width:26px; height:26px; border-radius:50%; cursor:pointer; font-size:14px; }\n    #cmd-body{ padding:18px 20px; }\n    .cmd-sec{ margin-bottom:16px; }\n    .cmd-sec h3{ font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#123a7a; margin:0 0 8px; }\n    .cmd-grid2{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }\n    .cmd-grid3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }\n    .cmd-grid4{ display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:10px; }\n    label{ display:block; font-size:10.5px; font-weight:700; color:#5b6672; margin-bottom:4px; }\n    input,select,textarea{\n      width:100%; padding:8px 9px; border:1px solid #d8dfe6; border-radius:7px; font-size:12.5px; color:#16221f;\n    }\n    textarea{ min-height:90px; resize:vertical; }\n    #cmd-origem-outro-wrap{ display:none; margin-top:8px; }\n    #cmd-origem-outro-wrap.show{ display:block; }\n    #cmd-auto-aviso{ display:none; background:#fff4e2; color:#a15c00; font-size:11px; padding:8px 10px; border-radius:7px; margin-bottom:12px; }\n    .cmd-info-box{ background:#e8f0f8; color:#123a7a; font-size:11px; padding:8px 10px; border-radius:7px; margin-bottom:12px; line-height:1.4; }\n    .cmd-contador{ text-align:right; font-size:10.5px; color:#8a97a4; margin-top:4px; }\n    button.cmd-primary{ background:#1a4fa0; color:#fff; border:none; border-radius:9px; padding:10px 18px; font-size:13px; font-weight:800; cursor:pointer; }\n    button.cmd-primary:hover{ background:#123a7a; }\n    button.cmd-primary:disabled{ background:#a7bcdd; cursor:not-allowed; }\n    button.cmd-secondary{ background:#fff; color:#123a7a; border:1.4px solid #1a56ad; border-radius:9px; padding:9px 14px; font-size:12.5px; font-weight:700; cursor:pointer; }\n    button.cmd-secondary:hover{ background:#e8f0f8; }\n    #cmd-footer{ display:flex; justify-content:flex-end; gap:8px; padding:14px 20px; border-top:1px solid #eee; }\n    #cmd-erro{ display:none; background:#fde8e8; border:1px solid #f0b8b8; color:#a12626; font-size:11.5px; padding:10px 12px; border-radius:8px; margin-top:6px; line-height:1.5; }";

  var HTML = "<div id=\"cmd-modal\">\n      <div id=\"cmd-modal-head\"><h2>Laudo Médico de Alto Custo — Conceição do Mato Dentro</h2>\n        <div style=\"display:flex; gap:8px; align-items:center;\">\n          <button id=\"cmd-refresh\" title=\"Lê a tela do atendimento e busca os dados do paciente atual\" style=\"background:rgba(255,255,255,.2); border:none; color:#fff; border-radius:14px; padding:5px 10px; font-size:11px; font-weight:700; cursor:pointer;\">🔄 Atualizar paciente</button>\n          <button id=\"cmd-close\">✕</button>\n        </div>\n      </div>\n      <div id=\"cmd-body\">\n        <div class=\"cmd-info-box\">\n          Gera o LAUDO MÉDICO DE ALTO CUSTO oficial de Conceição do Mato Dentro (mesmo PDF da prefeitura, preenchido pelos campos reais do formulário). A seção 04 (Junta de Autorização) não é preenchida — é reservada para a regulação.\n        </div>\n        <div id=\"cmd-auto-aviso\"></div>\n\n        <div class=\"cmd-sec\">\n          <h3>Médico solicitante *</h3>\n          <div class=\"cmd-grid3\">\n            <div><label>Selecionar *</label><select id=\"cmd-medico-sel\"></select></div>\n            <div><label>Nome *</label><input id=\"cmd-medico-nome\"></div>\n            <div><label>CRM *</label><input id=\"cmd-medico-crm\"></div>\n          </div>\n          <div style=\"margin-top:8px;\"><label>CPF *</label><input id=\"cmd-medico-cpf\" placeholder=\"000.000.000-00\"></div>\n        </div>\n\n        <div class=\"cmd-sec\">\n          <h3>Dados do atendimento</h3>\n          <div>\n            <label>Unidade de origem *</label>\n            <select id=\"cmd-origem-sel\"></select>\n            <div id=\"cmd-origem-outro-wrap\"><label>Nome da unidade</label><input id=\"cmd-origem-outro\"></div>\n          </div>\n        </div>\n\n        <div class=\"cmd-sec\">\n          <h3>Paciente</h3>\n          <div class=\"cmd-grid2\">\n            <div><label>Nome completo *</label><input id=\"cmd-pac-nome\"></div>\n            <div><label>CPF</label><input id=\"cmd-pac-cpf\" placeholder=\"000.000.000-00\"></div>\n          </div>\n          <div class=\"cmd-grid3\" style=\"margin-top:8px;\">\n            <div><label>Data de nascimento</label><input id=\"cmd-pac-nasc\" placeholder=\"dd/mm/aaaa\" inputmode=\"numeric\" maxlength=\"10\"></div>\n            <div><label>Sexo *</label><select id=\"cmd-pac-sexo\"><option value=\"\" selected disabled>Selecione…</option><option value=\"FEM\">Feminino</option><option value=\"MASC\">Masculino</option></select></div>\n            <div><label>Telefone</label><input id=\"cmd-pac-telefone\"></div>\n          </div>\n          <div style=\"margin-top:8px;\"><label>Nome da mãe</label><input id=\"cmd-pac-mae\"></div>\n        </div>\n\n        <div class=\"cmd-sec\">\n          <h3>Procedimento solicitado *</h3>\n          <div class=\"cmd-grid2\">\n            <div><label>Nome do procedimento *</label><input id=\"cmd-proc-nome\" list=\"cmd-proc-list\" placeholder=\"digite o exame\" autocomplete=\"off\"></div>\n            <div><label>Código do procedimento</label><input id=\"cmd-proc-codigo\" placeholder=\"ex: 41101170\"></div>\n          </div>\n          <datalist id=\"cmd-proc-list\"></datalist>\n        </div>\n\n        <div class=\"cmd-sec\">\n          <h3>Diagnóstico</h3>\n          <div class=\"cmd-grid2\">\n            <div><label>CID-10</label><input id=\"cmd-cid\" list=\"cmd-cid-list\" placeholder=\"digite ou escolha\" autocomplete=\"off\"></div>\n            <div><label>Diagnóstico inicial</label><input id=\"cmd-diagnostico\" placeholder=\"preenche sozinho a partir do CID conhecido\"></div>\n          </div>\n          <datalist id=\"cmd-cid-list\"></datalist>\n        </div>\n\n        <div class=\"cmd-sec\">\n          <h3>Justificativa clínica *</h3>\n          <textarea id=\"cmd-justificativa\" maxlength=\"700\" placeholder=\"história da moléstia, exames prévios e objetivo do exame solicitado (até 700 caracteres)\"></textarea>\n          <div class=\"cmd-contador\" id=\"cmd-justificativa-contador\">0/700</div>\n        </div>\n\n        <div id=\"cmd-erro\"></div>\n      </div>\n      <div id=\"cmd-footer\">\n        <button class=\"cmd-secondary\" id=\"cmd-limpar\">Limpar</button>\n        <button class=\"cmd-primary\" id=\"cmd-gerar\">Gerar e baixar PDF</button>\n      </div>\n    </div>";

  /* ---- extraidas do original sem alteracao ---- */
  function camposFaltando() {
    const faltam = []; const v = id => shadow.getElementById(id).value.trim();
    if (!shadow.getElementById('cmd-medico-sel').value) faltam.push('seleção do médico');
    if (!v('cmd-medico-nome')) faltam.push('nome do médico');
    if (!v('cmd-medico-crm')) faltam.push('CRM do médico');
    if (!v('cmd-medico-cpf')) faltam.push('CPF do médico');
    const origemSel = shadow.getElementById('cmd-origem-sel').value;
    if (!origemSel) faltam.push('unidade de origem');
    if (origemSel === 'outro' && !v('cmd-origem-outro')) faltam.push('nome da unidade de origem');
    if (!v('cmd-pac-nome')) faltam.push('nome do paciente');
    if (!v('cmd-pac-sexo')) faltam.push('sexo');
    if (!v('cmd-justificativa')) faltam.push('justificativa clínica');
    if (!v('cmd-proc-nome')) faltam.push('nome do procedimento solicitado');
    return faltam;
  }

  function wrapTexto(font, size, texto, maxWidth) {
    const palavras = String(texto).split(/\s+/);
    const linhas = [];
    let atual = '';
    palavras.forEach(w => {
      const tentativa = atual ? atual + ' ' + w : w;
      if (font.widthOfTextAtSize(tentativa, size) > maxWidth && atual) {
        linhas.push(atual);
        atual = w;
      } else {
        atual = tentativa;
      }
    });
    if (atual) linhas.push(atual);
    return linhas.join('\n');
  }

  /* GERACAO DO PDF — funcao extraida VERBATIM do original.
   * Usa os campos reais do formulario (AcroForm) do PDF oficial: cada
   * valor e escrito no campo pelo proprio nome dele, sem coordenada
   * manual. Depois o formulario e achatado (flatten) para o PDF final
   * ficar identico em qualquer leitor/impressora. Nada foi reescrito. */
  async function gerarPdf() {
    limparErro();
    const faltam = camposFaltando();
    if (faltam.length) { mostrarErro('Preencha: ' + faltam.join(', ') + '.'); return; }

    const btn = shadow.getElementById('cmd-gerar');
    const original = btn.textContent;
    btn.textContent = 'Gerando…'; btn.disabled = true;

    try {
      const PDFLibRef = await garantirPdfLib();
      const { PDFDocument, StandardFonts } = PDFLibRef;

      const origemSel = shadow.getElementById('cmd-origem-sel').value;
      const origem = (origemSel === 'outro' ? shadow.getElementById('cmd-origem-outro').value : origemSel).trim().toUpperCase();

      const nome = shadow.getElementById('cmd-pac-nome').value.trim().toUpperCase();
      const cpf = shadow.getElementById('cmd-pac-cpf').value.trim();
      const nasc = shadow.getElementById('cmd-pac-nasc').value.trim();
      const sexo = shadow.getElementById('cmd-pac-sexo').value;
      const mae = shadow.getElementById('cmd-pac-mae').value.trim().toUpperCase();
      const telefone = shadow.getElementById('cmd-pac-telefone').value.trim();

      const diagnostico = shadow.getElementById('cmd-diagnostico').value.trim();
      const cid = shadow.getElementById('cmd-cid').value.trim().toUpperCase();
      const justificativa = shadow.getElementById('cmd-justificativa').value.trim();

      const procNome = shadow.getElementById('cmd-proc-nome').value.trim();
      const procCodigo = shadow.getElementById('cmd-proc-codigo').value.trim();

      const medicoNome = shadow.getElementById('cmd-medico-nome').value.trim().toUpperCase();
      const medicoCrm = shadow.getElementById('cmd-medico-crm').value.trim();
      const medicoCpf = shadow.getElementById('cmd-medico-cpf').value.trim();

      const pdfDoc = await PDFDocument.load(b64ToBytes(CMD_BASE_PDF_B64));
      const form = pdfDoc.getForm();
      const fontR = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // --- 01 - DADOS DO ATENDIMENTO DA UNIDADE / MUNICÍPIO SOLICITANTE ---
      setTexto(form, 'origem', origem);
      // 'municipio_1' já vem fixo no PDF oficial (Conceição do Mato Dentro) — não é reescrito.
      // 'codigo_sia' e 'n_prontuario' ficam em branco: removidos do formulário a pedido.
      // 'chefia_imediata' fica em branco: é assinatura/carimbo físico da chefia da unidade, não do médico solicitante.

      // --- 02 - DADOS DO PACIENTE ---
      setTexto(form, 'nome_paciente', nome);
      if (nasc) setTexto(form, 'data_nascimento', nasc);
      setCheckbox(form, 'sexo_masc', sexo === 'MASC');
      setCheckbox(form, 'sexo_fem', sexo === 'FEM');
      if (mae) setTexto(form, 'nome_mae', mae);
      if (telefone) setTexto(form, 'telefone', telefone);
      // Campos de endereço, nº consulta e carteira de identidade removidos do formulário a pedido.

      // --- 03 - JUSTIFICATIVA ---
      // O DA (default appearance) original do campo não traz operador Tf, então
      // o pdf-lib não consegue autoajustar o tamanho da fonte sozinho (texto saía
      // enorme). Fixamos a fonte manualmente em 9pt, que comporta os 700 caracteres
      // dentro da caixa sem invadir a seção de diagnóstico. A quebra de linha é
      // feita à mão (wrapTexto) porque o wrap automático do pdf-lib erra por
      // poucos pixels no pior caso e deixa a última palavra vazar pela borda.
      try {
        const campoJustificativa = form.getTextField('justificativa_clinica');
        campoJustificativa.acroField.setDefaultAppearance('/Helv 9 Tf 0 g');
        const larguraCampo = 555.2756; // largura real do campo no PDF oficial (575.28 - 20)
        const justificativaQuebrada = wrapTexto(fontR, 9, justificativa, larguraCampo - 16);
        campoJustificativa.setText(justificativaQuebrada);
      } catch (e) {
        console.warn('[CMD Laudo] Falha ao preencher justificativa_clinica:', e);
        setTexto(form, 'justificativa_clinica', justificativa);
      }
      if (diagnostico) setTexto(form, 'diagnostico_inicial', diagnostico);
      if (cid) setTexto(form, 'cid', cid);
      // Regra de negócio (herdada de Sete Lagoas): Clínica Solicitante sempre repete a Origem.
      setTexto(form, 'clinica_solicitante', origem);
      setTexto(form, 'procedimento_solicitado', procNome);
      if (procCodigo) setTexto(form, 'codigo_procedimento', procCodigo);
      setTexto(form, 'medico_solicitante', medicoNome);
      setTexto(form, 'crm_solicitante', medicoCrm);
      setTexto(form, 'cpf_medico', medicoCpf);

      // Seção 04 (JUNTA DE AUTORIZAÇÃO DE LAUDOS) não é tocada — preenchida pela regulação.

      form.updateFieldAppearances(fontR);
      form.flatten();

      const bytes = await pdfDoc.save();
      const slug = nome.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
      const filename = `LAUDO_CMD_${slug || 'PACIENTE'}.pdf`;
      baixarPdf(bytes, filename);
      toast('PDF gerado e baixado: ' + filename, 5000);
    } catch (e) {
      mostrarErro('Erro ao gerar PDF: ' + e.message);
    } finally {
      btn.textContent = original; btn.disabled = false;
    }
  }


  /* ---- helpers de AcroForm, extraidos do original ----
   * Escrevem num campo do formulario do PDF pelo NOME do campo. Se o
   * campo nao existir (PDF trocado pela prefeitura, por exemplo), avisa
   * no console e segue: um campo a menos e melhor do que um laudo que
   * nao gera. */
  function setTexto(form, nomeCampo, valor) {
    try {
      form.getTextField(nomeCampo).setText(valor || "");
    } catch (e) {
      console.warn("[CMD Laudo] Campo de texto nao encontrado no PDF:", nomeCampo, e);
    }
  }

  function setCheckbox(form, nomeCampo, marcado) {
    try {
      var campo = form.getCheckBox(nomeCampo);
      if (marcado) campo.check();
      else campo.uncheck();
    } catch (e) {
      console.warn("[CMD Laudo] Checkbox nao encontrado no PDF:", nomeCampo, e);
    }
  }

  /* O campo de justificativa do PDF oficial aceita 700 caracteres. O
   * contador e o corte vivem aqui para o medico ver o limite antes de
   * gerar, em vez de descobrir o texto truncado no PDF. */
  var JUSTIFICATIVA_MAX = 700;

  function atualizarContadorJustificativa() {
    var campo = shadow.getElementById("cmd-justificativa");
    if (!campo) return;
    if (campo.value.length > JUSTIFICATIVA_MAX) campo.value = campo.value.slice(0, JUSTIFICATIVA_MAX);
    shadow.getElementById("cmd-justificativa-contador").textContent =
      campo.value.length + "/" + JUSTIFICATIVA_MAX;
  }

  /* ----------------------------------------------------------------
   * UI
   * ---------------------------------------------------------------- */
  /* O <select> e montado pelo nucleo (cadastro.montarSelect), que tambem
   * cuida do "cadastrar medico" e do auto-preenchimento quando ha um so
   * medico cadastrado neste navegador. Aqui so dizemos o que fazer com a
   * ficha escolhida. */
  var seletorMedico = null;

  function preencherMedico(ficha) {
    shadow.getElementById("cmd-medico-nome").value = ficha ? ficha.nome : "";
    shadow.getElementById("cmd-medico-crm").value = ficha ? ficha.crm : "";
    shadow.getElementById("cmd-medico-cpf").value = ficha ? ficha.cpf : "";
  }

  function montarMedicos() {
    seletorMedico = d.cadastro.montarSelect(shadow.getElementById("cmd-medico-sel"), {
      aoEscolher: preencherMedico,
      aoPedirCadastro: function () {
        d.abrirCadastro();
      },
    });
  }

  function onMedicoChange() {
    if (seletorMedico) seletorMedico.limpar();
  }

  function montarOrigens() {
    var sel = shadow.getElementById("cmd-origem-sel");
    ORIGENS.forEach(function (o) {
      var op = document.createElement("option");
      op.value = o; op.textContent = o;
      sel.appendChild(op);
    });
    var outro = document.createElement("option");
    outro.value = "outro"; outro.textContent = "Outra unidade…";
    sel.appendChild(outro);
    sel.addEventListener("change", function () {
      shadow.getElementById("cmd-origem-outro-wrap").classList.toggle("show", sel.value === "outro");
    });
  }

  function montarCidList() {
    var dl = shadow.getElementById("cmd-cid-list");
    Object.keys(CID_DIC).sort().forEach(function (cod) {
      var o = document.createElement("option");
      o.value = cod; o.label = cod + " — " + CID_DIC[cod]; o.textContent = CID_DIC[cod];
      dl.appendChild(o);
    });
  }

  function autoDescricaoCid() {
    var campo = shadow.getElementById("cmd-cid");
    var cid = campo.value.trim().toUpperCase();
    if (campo.value !== cid) campo.value = cid;
    var desc = shadow.getElementById("cmd-diagnostico");
    if (CID_DIC[cid] && (!desc.value || desc.dataset.auto === "1")) {
      desc.value = CID_DIC[cid]; desc.dataset.auto = "1";
    } else if (desc.dataset.auto === "1" && !CID_DIC[cid]) {
      desc.value = ""; desc.dataset.auto = "";
    }
  }

  function montarProcList() {
    var dl = shadow.getElementById("cmd-proc-list");
    Object.keys(CATALOGO_PROCEDIMENTOS).forEach(function (k) {
      var p = CATALOGO_PROCEDIMENTOS[k];
      var o = document.createElement("option");
      o.value = p.nome; o.label = p.nome + " (" + p.codigo + ")";
      dl.appendChild(o);
    });
  }

  /* Campo de procedimento e 100% livre: o medico digita qualquer nome.
   * Se o texto bater exatamente (sem diferenciar caixa) com um
   * procedimento conhecido, o codigo preenche sozinho — mas pode ser
   * sobrescrito a qualquer momento, na mao. */
  function autoPreencherCodigoProc() {
    var nomeCampo = shadow.getElementById("cmd-proc-nome");
    var codigoCampo = shadow.getElementById("cmd-proc-codigo");
    var alvo = nomeCampo.value.trim().toLowerCase();
    var achado = Object.keys(CATALOGO_PROCEDIMENTOS)
      .map(function (k) { return CATALOGO_PROCEDIMENTOS[k]; })
      .find(function (p) { return p.nome.toLowerCase() === alvo; });
    if (achado && (!codigoCampo.value || codigoCampo.dataset.auto === "1")) {
      codigoCampo.value = achado.codigo; codigoCampo.dataset.auto = "1";
    } else if (!achado && codigoCampo.dataset.auto === "1") {
      codigoCampo.value = ""; codigoCampo.dataset.auto = "";
    }
  }

  function aplicarLeituraDaTela(dadosTela) {
    if (!overlay || !dadosTela) return 0;
    var n = 0;
    if (dadosTela.nome) { shadow.getElementById("cmd-pac-nome").value = dadosTela.nome; n++; }
    if (dadosTela.cpf) { shadow.getElementById("cmd-pac-cpf").value = formatarCpf(dadosTela.cpf); n++; }
    if (dadosTela.nascimentoBR) { shadow.getElementById("cmd-pac-nasc").value = dadosTela.nascimentoBR; n++; }
    if (dadosTela.sexo) { shadow.getElementById("cmd-pac-sexo").value = dadosTela.sexo === "F" ? "FEM" : "MASC"; n++; }
    if (dadosTela.nomeDaMae) { shadow.getElementById("cmd-pac-mae").value = dadosTela.nomeDaMae; n++; }
    if (dadosTela.telefone) { shadow.getElementById("cmd-pac-telefone").value = dadosTela.telefone; n++; }
    return n;
  }

  /* Evita que dados clinicos (diagnostico, CID, justificativa,
   * procedimento, medico) de um paciente vazem para o laudo de outro
   * quando o medico troca de atendimento sem clicar em "Limpar" antes.
   * Se o CPF lido da tela for diferente do que ja esta no formulario, o
   * formulario inteiro e resetado antes de aplicar a nova leitura. */
  function trocouDePaciente(dadosTela) {
    var cpfTela = (dadosTela.cpf || "").replace(/\D/g, "");
    var cpfForm = shadow.getElementById("cmd-pac-cpf").value.replace(/\D/g, "");
    return !!cpfTela && !!cpfForm && cpfTela !== cpfForm;
  }

  function atualizarPaciente() {
    var btn = shadow.getElementById("cmd-refresh");
    var original = btn.textContent;
    btn.textContent = "Atualizando…";
    btn.disabled = true;
    var dadosTela = d.dom.lerPaciente();
    if (trocouDePaciente(dadosTela)) limparForm();
    var n = aplicarLeituraDaTela(dadosTela);
    var aviso = shadow.getElementById("cmd-auto-aviso");
    aviso.style.display = "block";
    aviso.textContent = n > 0
      ? "Dados lidos da tela (" + n + " campo" + (n > 1 ? "s" : "") + "). Confira antes de gerar."
      : "Não consegui ler os dados do paciente na tela. Preencha manualmente.";
    toast(n > 0 ? "Paciente atualizado (" + n + " campo" + (n > 1 ? "s" : "") + ")." : "Nada encontrado na tela.", 3000);
    btn.textContent = original;
    btn.disabled = false;
  }

  function abrirModal() {
    var dadosTela = d.dom.lerPaciente();
    if (trocouDePaciente(dadosTela) || !shadow.getElementById("cmd-pac-cpf").value.trim()) limparForm();
    aplicarLeituraDaTela(dadosTela);
    overlay.abrir();
  }

  function limparForm() {
    ["cmd-pac-nome","cmd-pac-cpf","cmd-pac-nasc","cmd-pac-mae","cmd-pac-telefone",
     "cmd-diagnostico","cmd-cid","cmd-justificativa","cmd-origem-outro",
     "cmd-proc-nome","cmd-proc-codigo"].forEach(function (id) { shadow.getElementById(id).value = ""; });
    shadow.getElementById("cmd-pac-sexo").value = "";
    shadow.getElementById("cmd-origem-sel").value = "";
    shadow.getElementById("cmd-origem-outro-wrap").classList.remove("show");
    shadow.getElementById("cmd-auto-aviso").style.display = "none";
    atualizarContadorJustificativa();
    // O medico volta ao estado inicial. Com um so cadastrado neste
    // navegador, o helper o reseleciona sozinho — um clique a menos.
    if (seletorMedico) seletorMedico.atualizar();
    limparErro();
  }

  function montarUI() {
    overlay = d.dock.criarOverlay({ estilo: CSS, html: HTML });
    shadow.getElementById("cmd-refresh").addEventListener("click", atualizarPaciente);
    shadow.getElementById("cmd-close").addEventListener("click", overlay.fechar);
    shadow.getElementById("cmd-gerar").addEventListener("click", gerarPdf);
    shadow.getElementById("cmd-limpar").addEventListener("click", limparForm);
    shadow.getElementById("cmd-proc-nome").addEventListener("input", autoPreencherCodigoProc);
    shadow.getElementById("cmd-cid").addEventListener("input", autoDescricaoCid);
    shadow.getElementById("cmd-justificativa").addEventListener("input", atualizarContadorJustificativa);
    ativarMascaraData(shadow.getElementById("cmd-pac-nasc"));
    montarOrigens(); montarProcList(); montarMedicos(); montarCidList();
  }

  /* ----------------------------------------------------------------
   * CONTRATO DE MODULO
   * ---------------------------------------------------------------- */
  raiz.MeedsSuite.registerModule({
    id: "cmd",
    nome: "Laudo — Conceição do Mato Dentro",
    descricao: "Preenche o LAUDO MÉDICO DE ALTO CUSTO oficial de Conceição do Mato Dentro usando os campos reais do formulário PDF (AcroForm).",
    versao: "2.0.0",
    configPadrao: {},

    botao: {
      icone: "📄",
      rotulo: "Laudo - CMD",
      titulo: "Laudo — Conceição do Mato Dentro",
      prioridade: 40,
    },

    // Este modulo nao precisa ouvir a rede: le tudo da tela do
    // atendimento. Fica sem assinaturasRede de proposito.
    assinaturasRede: [],

    start: function (deps) {
      d = deps;
      montarUI();

      /* Quando o medico e cadastrado ou removido no painel da engrenagem,
       * o <select> se redesenha sozinho — sem precisar fechar e reabrir
       * este modal. */
      deps.aoMudarCadastro(function () {
        if (seletorMedico) seletorMedico.atualizar();
      });

      deps.aoClicarBotao(abrirModal);
    },

    stop: function () {
      timers.forEach(clearInterval);
      timers = [];
      if (overlay) { overlay.remover(); overlay = null; }
      d = null;
    },
  });
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
