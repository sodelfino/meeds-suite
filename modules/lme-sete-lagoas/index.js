/* ------------------------------------------------------------------
 * modules/lme-sete-lagoas/index.js
 * Origem: sodelfino/lme-sete-lagoas-gerador -> LME_SETE_LAGOAS_GERADOR.user.js v1.4.0
 * ------------------------------------------------------------------
 * O QUE MUDOU NA MIGRACAO (e o que NAO mudou)
 *  - REMOVIDO daqui: trava de frame, deteccao de login, shadow host
 *    proprio, CSS de posicionamento do botao (#lme-fab) e do toast,
 *    e o loop proprio de recheque de login. Tudo isso e do nucleo.
 *  - PRESERVADO byte a byte: a funcao gerarPdf() inteira, com TODAS as
 *    coordenadas calibradas na mao contra o PDF oficial da prefeitura
 *    (posicao de cada campo, os retangulos brancos que limpam as celulas
 *    antes de reescrever, a fonte adaptativa do diagnostico e do CID), e
 *    as tabelas MEDICOS / ORIGENS / CID_DIC / CATALOGO_PROCEDIMENTOS.
 *  - A leitura da tela passou a usar o dom-reader do nucleo, que ja
 *    tenta as variantes de rotulo e normaliza acento. Ganho colateral: este
 *    gerador nao lia o nome da mae; agora a leitura e a mesma dos outros.
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
  var BASE_PDF_B64 = raiz.MEEDS_LME_BASE_PDF_B64;

  /* Nome herdado do original, para gerarPdf() continuar valendo sem
   * reescrita. */
  var LME_BASE_PDF_B64 = BASE_PDF_B64;

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
        reject(new Error("o componente pdf-lib não está disponível e o Tampermonkey não concedeu permissão para baixá-lo"));
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
        onerror: function () { reject(new Error("a rede bloqueou o download do pdf-lib")); },
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

  function mostrarSucesso(nomeArquivo) {
    var el = shadow.getElementById("lme-sucesso");
    el.innerHTML =
      "✅ <b>Laudo gerado e baixado.</b><br>Arquivo: <b>" + nomeArquivo + "</b> — procure na pasta de downloads do navegador. " +
      "Ele já ficou registrado no <b>📜 Histórico</b>, caso precise repetir depois.";
    el.style.display = "block";
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function limparSucesso() {
    var el = shadow.getElementById("lme-sucesso");
    if (el) { el.style.display = "none"; el.innerHTML = ""; }
  }

  function limparErro() {
    var el = shadow.getElementById("lme-erro");
    el.style.display = "none";
    el.textContent = "";
  }
  function mostrarErro(msg) {
    var el = shadow.getElementById("lme-erro");
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


  /* ---- dados do formulario ----
   * Unidades de origem, catalogo de procedimentos e lista de CID-10 vem
   * de dados/formularios.json, injetado no pacote pelo build. Ficam fora
   * do codigo de proposito: sao a parte que o administrador precisa
   * editar de vez em quando (uma unidade nova, um exame novo, um CID que
   * faltava) e ninguem deveria abrir um .js para isso.
   * Se o arquivo faltar, os padroes abaixo seguram — o modulo nunca
   * quebra por causa de dado ausente. */
  var DADOS = (raiz.MEEDS_DADOS_FORMULARIOS || {})["lme-sete-lagoas"] || {};

  var MUNICIPIO_FIXO = DADOS.municipio || "SETE LAGOAS";
  var ORIGENS = DADOS.origens || [];
  var CID_DIC = DADOS.cids || {};
  var CATALOGO_PROCEDIMENTOS = DADOS.procedimentos || {};

  /* ---- CSS e HTML do modal (o posicionamento e do dock) ---- */
  var CSS = raiz.MeedsSuiteHistorico.CSS + "\n" + "#lme-sucesso{ background:#e6f6f2; border:1px solid #9ed8c9; color:#0b6a62; font-size:12.5px; line-height:1.55; padding:11px 13px; border-radius:9px; margin-top:6px; } #lme-sucesso b{ color:#08574f; }\n" + "#lme-modal{\n      background:#fff; border-radius:16px; max-width:680px; width:100%; max-height:88vh; overflow-y:auto;\n      padding:0; box-shadow:0 20px 60px rgba(0,0,0,.35);\n    }\n    #lme-modal-head{\n      background:linear-gradient(135deg,#123a7a,#1a56ad); color:#fff; padding:16px 20px; border-radius:16px 16px 0 0;\n      display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; z-index:2;\n    }\n    #lme-modal-head h2{ margin:0; font-size:15px; }\n    #lme-close{ background:rgba(255,255,255,.2); border:none; color:#fff; width:26px; height:26px; border-radius:50%; cursor:pointer; font-size:14px; }\n    #lme-body{ padding:18px 20px; }\n    .lme-sec{ margin-bottom:16px; }\n    .lme-sec h3{ font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#123a7a; margin:0 0 8px; }\n    .lme-grid2{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }\n    .lme-grid3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }\n    label{ display:block; font-size:10.5px; font-weight:700; color:#5b6672; margin-bottom:4px; }\n    input,select,textarea{\n      width:100%; padding:8px 9px; border:1px solid #d8dfe6; border-radius:7px; font-size:12.5px; color:#16221f;\n    }\n    textarea{ min-height:70px; resize:vertical; }\n    #lme-origem-outro-wrap{ display:none; margin-top:8px; }\n    #lme-origem-outro-wrap.show{ display:block; }\n    #lme-auto-aviso{ display:none; background:#fff4e2; color:#a15c00; font-size:11px; padding:8px 10px; border-radius:7px; margin-bottom:12px; }\n    .lme-info-box{ background:#e8f0f8; color:#123a7a; font-size:11px; padding:8px 10px; border-radius:7px; margin-bottom:12px; line-height:1.4; }\n    button.lme-primary{ background:#1a4fa0; color:#fff; border:none; border-radius:9px; padding:10px 18px; font-size:13px; font-weight:800; cursor:pointer; }\n    button.lme-primary:hover{ background:#123a7a; }\n    button.lme-primary:disabled{ background:#a7bcdd; cursor:not-allowed; }\n    button.lme-secondary{ background:#fff; color:#123a7a; border:1.4px solid #1a56ad; border-radius:9px; padding:9px 14px; font-size:12.5px; font-weight:700; cursor:pointer; }\n    button.lme-secondary:hover{ background:#e8f0f8; }\n    #lme-footer{ display:flex; justify-content:flex-end; gap:8px; padding:14px 20px; border-top:1px solid #eee; }\n    #lme-erro{ display:none; background:#fde8e8; border:1px solid #f0b8b8; color:#a12626; font-size:11.5px; padding:10px 12px; border-radius:8px; margin-top:6px; line-height:1.5; }";

  var HTML = "<div id=\"lme-modal\">\n      <div id=\"lme-modal-head\"><h2>Laudo Procedimento Médico — Sete Lagoas</h2>\n        <div style=\"display:flex; gap:8px; align-items:center;\">\n          <button id=\"lme-historico-abrir\" title=\"Documentos gerados neste computador\" style=\"background:rgba(255,255,255,.2); border:none; color:#fff; border-radius:14px; padding:5px 10px; font-size:11px; font-weight:700; cursor:pointer;\">📜 Histórico</button>\n          <button id=\"lme-refresh\" title=\"Lê a tela do atendimento e busca os dados do paciente atual\" style=\"background:rgba(255,255,255,.2); border:none; color:#fff; border-radius:14px; padding:5px 10px; font-size:11px; font-weight:700; cursor:pointer;\">🔄 Atualizar paciente</button>\n          <button id=\"lme-close\">✕</button>\n        </div>\n      </div>\n      <div id=\"lme-body\">\n        <div class=\"lme-info-box\">\n          Gera o LAUDO MÉDICO DE ALTO CUSTO oficial de Sete Lagoas (mesmo PDF da prefeitura, logo e layout intactos). Município fixo: <b>SETE LAGOAS</b>. O Cartão Nacional do SUS é preenchido com o CPF do paciente.\n        </div>\n        <div id=\"lme-historico-painel\"></div>\n        <div id=\"lme-auto-aviso\"></div>\n\n        <div class=\"lme-sec\">\n          <h3>Médico solicitante *</h3>\n          <div class=\"lme-grid3\">\n            <div><label>Selecionar *</label><select id=\"lme-medico-sel\"></select></div>\n            <div><label>Nome *</label><input id=\"lme-medico-nome\"></div>\n            <div><label>CRM *</label><input id=\"lme-medico-crm\"></div>\n          </div>\n          <div style=\"margin-top:8px;\"><label>CPF *</label><input id=\"lme-medico-cpf\" placeholder=\"000.000.000-00\"></div>\n        </div>\n\n        <div class=\"lme-sec\">\n          <h3>Unidade de origem</h3>\n          <select id=\"lme-origem-sel\"></select>\n          <div id=\"lme-origem-outro-wrap\"><label>Nome da unidade</label><input id=\"lme-origem-outro\" placeholder=\"ex: UBS ITAPOÃ\"></div>\n        </div>\n\n        <div class=\"lme-sec\">\n          <h3>Paciente</h3>\n          <div class=\"lme-grid2\">\n            <div><label>Nome completo *</label><input id=\"lme-pac-nome\"></div>\n            <div><label>CPF (usado como Cartão do SUS) *</label><input id=\"lme-pac-cpf\" placeholder=\"000.000.000-00\"></div>\n          </div>\n          <div class=\"lme-grid2\" style=\"margin-top:8px;\">\n            <div><label>Data de nascimento</label><input id=\"lme-pac-nasc\" placeholder=\"dd/mm/aaaa\" inputmode=\"numeric\" maxlength=\"10\"></div>\n            <div><label>Sexo *</label><select id=\"lme-pac-sexo\"><option value=\"\" selected disabled>Selecione…</option><option value=\"FEM\">Feminino</option><option value=\"MASC\">Masculino</option></select></div>\n          </div>\n        </div>\n\n        <div class=\"lme-sec\">\n          <h3>Procedimento solicitado *</h3>\n          <div class=\"lme-grid2\">\n            <div><label>Nome do procedimento *</label><input id=\"lme-proc-nome\" list=\"lme-proc-list\" placeholder=\"digite e busque, ou digite algo novo\" autocomplete=\"off\"></div>\n            <div><label>Código SIGTAP *</label><input id=\"lme-proc-codigo\" placeholder=\"preenche sozinho se reconhecido\"></div>\n          </div>\n          <datalist id=\"lme-proc-list\"></datalist>\n        </div>\n\n        <div class=\"lme-sec\">\n          <h3>Diagnóstico</h3>\n          <div class=\"lme-grid2\">\n            <div><label>CID-10</label><input id=\"lme-cid\" list=\"lme-cid-list\" placeholder=\"digite ou escolha\" autocomplete=\"off\"></div>\n            <div><label>Diagnóstico inicial</label><input id=\"lme-diagnostico\" placeholder=\"preenche sozinho a partir do CID conhecido\"></div>\n          </div>\n          <datalist id=\"lme-cid-list\"></datalist>\n        </div>\n\n        <div class=\"lme-sec\">\n          <h3>Justificativa clínica *</h3>\n          <textarea id=\"lme-justificativa\" placeholder=\"história da moléstia, exames prévios e objetivo do exame solicitado\"></textarea>\n        </div>\n\n        <div id=\"lme-sucesso\" style=\"display:none;\"></div>\n        <div id=\"lme-erro\"></div>\n      </div>\n      <div id=\"lme-footer\">\n        <button class=\"lme-secondary\" id=\"lme-limpar\">Limpar</button>\n        <button class=\"lme-primary\" id=\"lme-gerar\">Gerar e baixar PDF</button>\n      </div>\n    </div>";

  /* ---- extraidas do original sem alteracao ---- */
  /* ---- validacao dos campos obrigatorios ----
   * Cada campo declara o ROTULO como ele aparece na tela e, quando existe
   * um jeito mais rapido de preencher, a dica. E o que permite a mensagem
   * dizer "falta o nome da mae, preencha o campo Nome da mae, e se ele
   * nao veio sozinho clique em Atualizar paciente" em vez de "campo
   * obrigatorio". O texto final e montado pelo nucleo
   * (core/mensagens.js), para o tom ser o mesmo em todos os modulos. */
  var CAMPOS_OBRIGATORIOS = [
      { id: "lme-medico-sel", descricao: "escolher o médico solicitante", rotulo: "Médico solicitante",
        comoResolver: "se a lista estiver vazia, cadastre-se no painel da engrenagem (⚙️)" },
      { id: "lme-medico-nome", descricao: "o nome do médico", rotulo: "Nome" },
      { id: "lme-medico-crm", descricao: "o CRM do médico", rotulo: "CRM",
        comoResolver: "complete o cadastro dele no painel da engrenagem (⚙️)" },
      { id: "lme-medico-cpf", descricao: "o CPF do médico", rotulo: "CPF",
        comoResolver: "complete o cadastro dele no painel da engrenagem (⚙️)" },
      { id: "lme-origem-sel", descricao: "a unidade de origem", rotulo: "Unidade de origem" },
      { id: "lme-origem-outro", descricao: "o nome da unidade de origem", rotulo: "Nome da unidade",
        so: function () { return shadow.getElementById("lme-origem-sel").value === "outro"; } },
      { id: "lme-pac-nome", descricao: "o nome do paciente", rotulo: "Nome completo",
        comoResolver: "clique em “Atualizar paciente” para ler da tela do atendimento" },
      { id: "lme-pac-cpf", descricao: "o CPF do paciente", rotulo: "CPF (usado como Cartão do SUS)",
        comoResolver: "clique em “Atualizar paciente” para ler da tela do atendimento" },
      { id: "lme-pac-sexo", descricao: "o sexo do paciente", rotulo: "Sexo" },
      { id: "lme-justificativa", descricao: "a justificativa clínica", rotulo: "Justificativa clínica",
        comoResolver: "descreva a história, os exames prévios e o objetivo do exame" },
      { id: "lme-proc-nome", descricao: "o procedimento solicitado", rotulo: "Nome do procedimento" },
      { id: "lme-proc-codigo", descricao: "o código SIGTAP do procedimento", rotulo: "Código SIGTAP",
        comoResolver: "ele preenche sozinho se o nome do procedimento for escolhido da lista" }
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
    return raiz.MeedsSuiteMensagens.camposFaltando(faltas, { acao: "gerar o laudo de Sete Lagoas" });
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
    return linhas;
  }

  /* GERACAO DO PDF — funcao extraida VERBATIM do original.
   * Sobrepoe o PDF OFICIAL embutido nas coordenadas ja calibradas e
   * validadas manualmente. A pagina 2 (orientacoes) e copiada sem
   * nenhuma alteracao. Nada aqui foi reescrito. */
  async function gerarPdf() {
    limparErro();
    const faltam = camposFaltando();
    if (faltam.length) { mostrarErro(mensagemDeCamposFaltando(faltam)); return; }

    const btn = shadow.getElementById('lme-gerar');
    const original = btn.textContent;
    btn.textContent = 'Gerando…'; btn.disabled = true;

    try {
      let PDFLibRef;
      try {
        PDFLibRef = await garantirPdfLib();
      } catch (e) {
        // biblioteca que nao carrega tem causa e solucao proprias (quase
        // sempre rede da unidade bloqueando o CDN), diferentes de um erro
        // ao montar o PDF — por isso a mensagem e outra.
        mostrarErro(raiz.MeedsSuiteMensagens.BIBLIOTECA_NAO_CARREGOU("pdf-lib", e.message));
        btn.textContent = original;
        btn.disabled = false;
        return;
      }
      const { PDFDocument, StandardFonts, rgb } = PDFLibRef;

      const origemSel = shadow.getElementById('lme-origem-sel').value;
      const origem = (origemSel === 'outro' ? shadow.getElementById('lme-origem-outro').value : origemSel).trim().toUpperCase();
      const nome = shadow.getElementById('lme-pac-nome').value.trim().toUpperCase();
      const cpf = shadow.getElementById('lme-pac-cpf').value.trim();
      const nasc = shadow.getElementById('lme-pac-nasc').value.trim();
      const sexo = shadow.getElementById('lme-pac-sexo').value;
      const diagnostico = shadow.getElementById('lme-diagnostico').value.trim();
      const cid = shadow.getElementById('lme-cid').value.trim().toUpperCase();
      const justificativa = shadow.getElementById('lme-justificativa').value.trim();

      const procNome = shadow.getElementById('lme-proc-nome').value.trim();
      const procCodigo = shadow.getElementById('lme-proc-codigo').value.trim();

      const pdfDoc = await PDFDocument.load(b64ToBytes(LME_BASE_PDF_B64));
      const page = pdfDoc.getPages()[0]; // pagina 2 (orientacoes) fica intocada
      const H = page.getHeight();
      const y = (top) => H - top;

      const fontR = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const WHITE = rgb(1, 1, 1);
      const BLACK = rgb(0, 0, 0);

      function rectSpan(x, topTop, topBottom, width) {
        page.drawRectangle({ x, y: y(topBottom), width, height: topBottom - topTop, color: WHITE });
      }
      function text(str, x, topBaseline, opts) {
        opts = opts || {};
        page.drawText(str, { x, y: y(topBaseline), size: opts.size || 10, font: opts.bold ? fontB : fontR, color: BLACK });
      }
      function fitFont(str, font, maxSize, minSize, maxWidth) {
        let size = maxSize;
        while (size > minSize && font.widthOfTextAtSize(str, size) > maxWidth) size -= 1;
        return size;
      }

      // --- ORIGEM (limpa a celula inteira, rotulo + valor, e redesenha) ---
      rectSpan(54, 80, 101, 186);
      text('ORIGEM', 56.1, 87.3, { bold: true, size: 7 });
      text(origem, 74, 100.4, { bold: true, size: 11 });

      // --- NOME / DATA NASCIMENTO / SEXO ---
      text(nome, 56, 177, { bold: true, size: 11 });
      if (nasc) text(nasc, 335, 177, { size: 10 });
      if (sexo === 'FEM') text('X', 504.2, 174.2, { bold: true, size: 9 });
      else if (sexo === 'MASC') text('X', 445.4, 174.2, { bold: true, size: 9 });

      // --- CARTAO NACIONAL DO SUS (regra de negocio: usa o CPF do paciente) ---
      text(cpf, 335, 259, { size: 10 });

      // --- JUSTIFICATIVA CLINICA (quebra automatica de linha) ---
      const linhasJust = wrapTexto(fontR, 9, justificativa, 484);
      let ty = 302;
      linhasJust.forEach(linha => { text(linha, 56, ty, { size: 9 }); ty += 11.5; });

      // --- DIAGNOSTICO INICIAL (fonte reduz automaticamente ate nao invadir o CID) ---
      if (diagnostico) {
        const diagMaxWidth = 458.9 - 56 - 4;
        const diagFont = fitFont(diagnostico, fontR, 9, 6, diagMaxWidth);
        text(diagnostico, 56, 557, { size: diagFont });
      }

      // --- CID (limpa a faixa de caixinhas e centraliza, com fonte adaptativa) ---
      if (cid) {
        rectSpan(459.9, 551.5, 562, 81.2);
        const cidColWidth = 542.1 - 458.9;
        const cidFont = fitFont(cid, fontR, 10, 5, cidColWidth - 4);
        const cidWidth = fontR.widthOfTextAtSize(cid, cidFont);
        text(cid, 458.9 + (cidColWidth - cidWidth) / 2, 558.5, { size: cidFont });
      }

      // --- CLINICA SOLICITANTE (regra de negocio: sempre repete ORIGEM) ---
      rectSpan(54, 564, 584, 456);
      text('CLÍNICA SOLICITANTE', 56.1, 571.5, { bold: true, size: 7 });
      text(origem, 65, 581, { bold: true, size: 11 });

      // --- PROCEDIMENTO SOLICITADO + CODIGO SIGTAP ---
      text(procNome, 56, 604, { size: 10 });
      rectSpan(446.5, 594.5, 605.5, 94.5);
      const codeWidth = fontR.widthOfTextAtSize(procCodigo, 9);
      text(procCodigo, 445.5 + ((542.1 - 445.5) - codeWidth) / 2, 602.5, { size: 9 });

      // --- MEDICO SOLICITANTE (nome / CRM / CPF — agora selecionavel).
      //     O PDF oficial ja traz "JEAN MILLER NERY DE LACERDA" impresso
      //     como exemplo; a celula e limpa e redesenhada com o medico
      //     escolhido, ficando dentro das bordas da linha (top 606.2-646.8,
      //     divisores em x=307.5 e x=376.1) e acima da faixa de caixinhas
      //     de dígito que comeca em top=637.5.
      const medicoNome = shadow.getElementById('lme-medico-nome').value.trim().toUpperCase();
      const medicoCrm = shadow.getElementById('lme-medico-crm').value.trim();
      const medicoCpf = shadow.getElementById('lme-medico-cpf').value.trim();
      rectSpan(58, 617, 636, 247);
      rectSpan(309, 617, 632, 65);
      rectSpan(378, 617, 632, 162);
      const medicoFont = fitFont(medicoNome, fontB, 14, 8, 245);
      text(medicoNome, 62.5, 633.9, { bold: true, size: medicoFont });
      text(medicoCrm, 314.3, 627.4, { size: 10 });
      text(medicoCpf, 399.4, 629.6, { size: 10 });

      void MUNICIPIO_FIXO; // ja vem impresso no PDF oficial (SETE LAGOAS)

      const bytes = await pdfDoc.save();
      const slug = nome.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
      const filename = `LME_${slug || 'PACIENTE'}.pdf`;
      raiz.MeedsSuiteHistorico.registrar("lme-sete-lagoas", {
        nomePaciente: nome,
        cpfPaciente: shadow.getElementById("lme-pac-cpf").value,
        titulo: procNome || "Laudo",
        medico: medicoNome,
        clinico: {
          "lme-proc-nome": shadow.getElementById("lme-proc-nome").value,
          "lme-proc-codigo": shadow.getElementById("lme-proc-codigo").value,
          "lme-cid": shadow.getElementById("lme-cid").value,
          "lme-diagnostico": shadow.getElementById("lme-diagnostico").value,
          "lme-justificativa": shadow.getElementById("lme-justificativa").value,
          "lme-origem-outro": shadow.getElementById("lme-origem-outro").value,
          "lme-origem-sel": shadow.getElementById("lme-origem-sel").value
        },
      });

      baixarPdf(bytes, filename);
      mostrarSucesso(filename);
      toast("Pronto — laudo de Sete Lagoas baixado.", 5000);
    } catch (e) {
      mostrarErro(
        raiz.MeedsSuiteMensagens.erroTecnico(
          "gerar o PDF",
          "o programa encontrou um problema ao montar o arquivo",
          "Confira se os campos estão preenchidos como esperado e tente de novo. Se repetir, avise o administrador com a mensagem entre parênteses.",
          e.message
        )
      );
    } finally {
      btn.textContent = original; btn.disabled = false;
    }
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
    shadow.getElementById("lme-medico-nome").value = ficha ? ficha.nome : "";
    shadow.getElementById("lme-medico-crm").value = ficha ? ficha.crm : "";
    shadow.getElementById("lme-medico-cpf").value = ficha ? ficha.cpf : "";
  }

  function montarMedicos() {
    seletorMedico = d.cadastro.montarSelect(shadow.getElementById("lme-medico-sel"), {
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
    var sel = shadow.getElementById("lme-origem-sel");
    ORIGENS.forEach(function (o) {
      var op = document.createElement("option");
      op.value = o; op.textContent = o;
      sel.appendChild(op);
    });
    var outro = document.createElement("option");
    outro.value = "outro"; outro.textContent = "Outra unidade…";
    sel.appendChild(outro);
    sel.addEventListener("change", function () {
      shadow.getElementById("lme-origem-outro-wrap").classList.toggle("show", sel.value === "outro");
    });
  }

  function montarCidList() {
    var dl = shadow.getElementById("lme-cid-list");
    Object.keys(CID_DIC).sort().forEach(function (cod) {
      var o = document.createElement("option");
      o.value = cod; o.label = cod + " — " + CID_DIC[cod]; o.textContent = CID_DIC[cod];
      dl.appendChild(o);
    });
  }

  function autoDescricaoCid() {
    var campo = shadow.getElementById("lme-cid");
    var cid = campo.value.trim().toUpperCase();
    if (campo.value !== cid) campo.value = cid;
    var desc = shadow.getElementById("lme-diagnostico");
    if (CID_DIC[cid] && (!desc.value || desc.dataset.auto === "1")) {
      desc.value = CID_DIC[cid]; desc.dataset.auto = "1";
    } else if (desc.dataset.auto === "1" && !CID_DIC[cid]) {
      desc.value = ""; desc.dataset.auto = "";
    }
  }

  function montarProcList() {
    var dl = shadow.getElementById("lme-proc-list");
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
    var nomeCampo = shadow.getElementById("lme-proc-nome");
    var codigoCampo = shadow.getElementById("lme-proc-codigo");
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
    if (dadosTela.nome) { shadow.getElementById("lme-pac-nome").value = dadosTela.nome; n++; }
    if (dadosTela.cpf) { shadow.getElementById("lme-pac-cpf").value = formatarCpf(dadosTela.cpf); n++; }
    if (dadosTela.nascimentoBR) { shadow.getElementById("lme-pac-nasc").value = dadosTela.nascimentoBR; n++; }
    if (dadosTela.sexo) { shadow.getElementById("lme-pac-sexo").value = dadosTela.sexo === "F" ? "FEM" : "MASC"; n++; }
    return n;
  }

  /* Evita que dados clinicos (diagnostico, CID, justificativa,
   * procedimento, medico) de um paciente vazem para o laudo de outro
   * quando o medico troca de atendimento sem clicar em "Limpar" antes.
   * Se o CPF lido da tela for diferente do que ja esta no formulario, o
   * formulario inteiro e resetado antes de aplicar a nova leitura. */
  function trocouDePaciente(dadosTela) {
    var cpfTela = (dadosTela.cpf || "").replace(/\D/g, "");
    var cpfForm = shadow.getElementById("lme-pac-cpf").value.replace(/\D/g, "");
    return !!cpfTela && !!cpfForm && cpfTela !== cpfForm;
  }

  function atualizarPaciente() {
    var btn = shadow.getElementById("lme-refresh");
    var original = btn.textContent;
    btn.textContent = "Atualizando…";
    btn.disabled = true;
    var dadosTela = d.dom.lerPaciente();
    if (trocouDePaciente(dadosTela)) limparForm();
    var n = aplicarLeituraDaTela(dadosTela);
    var aviso = shadow.getElementById("lme-auto-aviso");
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
    if (trocouDePaciente(dadosTela) || !shadow.getElementById("lme-pac-cpf").value.trim()) limparForm();
    aplicarLeituraDaTela(dadosTela);
    overlay.abrir();
  }

  function limparForm() {
    ["lme-pac-nome","lme-pac-cpf","lme-pac-nasc","lme-diagnostico","lme-cid",
     "lme-justificativa","lme-origem-outro","lme-proc-nome","lme-proc-codigo"].forEach(function (id) { shadow.getElementById(id).value = ""; });
    shadow.getElementById("lme-pac-sexo").value = "";
    shadow.getElementById("lme-origem-sel").value = "";
    shadow.getElementById("lme-origem-outro-wrap").classList.remove("show");
    shadow.getElementById("lme-auto-aviso").style.display = "none";
    // O medico volta ao estado inicial. Com um so cadastrado neste
    // navegador, o helper o reseleciona sozinho — um clique a menos.
    if (seletorMedico) seletorMedico.atualizar();
    limparErro();
  }

  var historico = null;

  /* Repoe a parte CLINICA de um documento anterior. Os dados do paciente
   * NAO sao repostos de proposito: continuam vindo da tela do atendimento,
   * o que evita que o dado de um paciente entre no laudo de outro. */
  function reabrirDoHistorico(entrada) {
    var c = entrada.clinico || {};
    Object.keys(c).forEach(function (id) {
      var el = shadow.getElementById(id);
      if (el) el.value = c[id];
    });
    // a unidade "outra" tem um campo que so aparece quando selecionada
    shadow.getElementById("lme-origem-outro-wrap").classList.toggle(
      "show",
      shadow.getElementById("lme-origem-sel").value === "outro"
    );
    historico.esconder();
    var aviso = shadow.getElementById("lme-auto-aviso");
    aviso.style.display = "block";
    aviso.textContent =
      "Repus procedimento, CID e justificativa de “" + entrada.titulo + "”. " +
      "Os dados do paciente continuam sendo os da tela — confira antes de gerar.";
    d.core.toast("Dados clínicos repostos do histórico.", 3500);
  }

  function montarUI() {
    overlay = d.dock.criarOverlay({ estilo: CSS, html: HTML });

    historico = raiz.MeedsSuiteHistorico.montarPainel(
      shadow.getElementById("lme-historico-painel"),
      "lme-sete-lagoas",
      { aoReabrir: reabrirDoHistorico }
    );
    shadow.getElementById("lme-historico-abrir").addEventListener("click", historico.alternar);
    shadow.getElementById("lme-refresh").addEventListener("click", atualizarPaciente);
    shadow.getElementById("lme-close").addEventListener("click", overlay.fechar);
    shadow.getElementById("lme-gerar").addEventListener("click", gerarPdf);
    shadow.getElementById("lme-limpar").addEventListener("click", limparForm);
    shadow.getElementById("lme-proc-nome").addEventListener("input", autoPreencherCodigoProc);
    shadow.getElementById("lme-cid").addEventListener("input", autoDescricaoCid);
    // CPF se formata sozinho enquanto o medico digita (000.000.000-00)
    raiz.MeedsSuiteFormatos.aplicarMascaraCpf(shadow.getElementById("lme-pac-cpf"));
    raiz.MeedsSuiteFormatos.aplicarMascaraCpf(shadow.getElementById("lme-medico-cpf"));
    ativarMascaraData(shadow.getElementById("lme-pac-nasc"));
    montarOrigens(); montarProcList(); montarMedicos(); montarCidList();
  }

  /* ----------------------------------------------------------------
   * CONTRATO DE MODULO
   * ---------------------------------------------------------------- */
  raiz.MeedsSuite.registerModule({
    id: "lme-sete-lagoas",
    nome: "Laudo — Sete Lagoas",
    descricao: "Preenche o LAUDO MÉDICO DE ALTO CUSTO oficial de Sete Lagoas por cima do PDF da prefeitura, mantendo logo e layout intactos.",
    versao: "2.0.0",
    configPadrao: {},

    botao: {
      icone: "📄",
      rotulo: "Laudo - Sete Lagoas",
      titulo: "Laudo — Sete Lagoas",
      prioridade: 30,
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
      /* Busca de CID-10: o modulo de busca nao sabe qual laudo esta
       * aberto — ele publica e quem estiver aberto atende. Devolver true
       * e o que diz "eu peguei"; se ninguem devolver, a busca copia o
       * codigo para a area de transferencia. */
      deps.assinarEvento("cid:escolhido", function (evt) {
        if (!overlay || !overlay.estaAberto()) return false;
        var campo = shadow.getElementById("lme-cid");
        if (!campo) return false;
        campo.value = evt.codigo;
        campo.dispatchEvent(new Event("input"));
        var desc = shadow.getElementById("lme-diagnostico");
        if (desc && !desc.value) {
          desc.value = evt.descricao;
          desc.dataset.auto = "1";
        }
        return true;
      });

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
