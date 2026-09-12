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
    var el = shadow.getElementById("cmd-sucesso");
    el.innerHTML =
      "✅ <b>Laudo gerado e baixado.</b><br>Arquivo: <b>" + nomeArquivo + "</b> — procure na pasta de downloads do navegador. " +
      "Ele já ficou registrado no <b>📜 Histórico</b>, caso precise repetir depois.";
    el.style.display = "block";
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function limparSucesso() {
    var el = shadow.getElementById("cmd-sucesso");
    if (el) { el.style.display = "none"; el.innerHTML = ""; }
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


  /* ---- dados do formulario ----
   * Unidades de origem, catalogo de procedimentos e lista de CID-10 vem
   * de dados/formularios.json, injetado no pacote pelo build. Ficam fora
   * do codigo de proposito: sao a parte que o administrador precisa
   * editar de vez em quando (uma unidade nova, um exame novo, um CID que
   * faltava) e ninguem deveria abrir um .js para isso.
   * Se o arquivo faltar, os padroes abaixo seguram — o modulo nunca
   * quebra por causa de dado ausente. */
  var DADOS = (raiz.MEEDS_DADOS_FORMULARIOS || {})["cmd"] || {};

  var MUNICIPIO_FIXO = DADOS.municipio || "CONCEIÇÃO DO MATO DENTRO";
  var ORIGENS = DADOS.origens || [];
  var CID_DIC = DADOS.cids || {};
  var CATALOGO_PROCEDIMENTOS = DADOS.procedimentos || {};

  /* ---- CSS e HTML do modal (o posicionamento e do dock) ---- */
  var CSS = raiz.MeedsSuiteHistorico.CSS + "\n" + raiz.MeedsSuiteModelos.CSS + "\n" + raiz.MeedsSuiteCabecalho.CSS + "\n" + raiz.MeedsSuiteGuia.CSS + "\n" + "#cmd-sucesso{ background:#e6f6f2; border:1px solid #9ed8c9; color:#0b6a62; font-size:12.5px; line-height:1.55; padding:11px 13px; border-radius:9px; margin-top:6px; } #cmd-sucesso b{ color:#08574f; }\n" + "#cmd-modal{\n      background:#fff; border-radius:16px; max-width:720px; width:100%; max-height:88vh; overflow-y:auto;\n      padding:0; box-shadow:0 20px 60px rgba(0,0,0,.35);\n    }\n    #cmd-modal-head{\n      background:linear-gradient(135deg,#123a7a,#1a56ad); color:#fff; padding:16px 20px; border-radius:16px 16px 0 0;\n      display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; z-index:2;\n    }\n    #cmd-modal-head h2{ margin:0; font-size:15px; }\n    #cmd-close{ background:rgba(255,255,255,.2); border:none; color:#fff; width:26px; height:26px; border-radius:50%; cursor:pointer; font-size:14px; }\n    #cmd-body{ padding:18px 20px; }\n    .cmd-sec{ margin-bottom:16px; }\n    .cmd-sec h3{ font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#123a7a; margin:0 0 8px; }\n    .cmd-grid2{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }\n    .cmd-grid3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }\n    .cmd-grid4{ display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:10px; }\n    #cmd-body label{ display:block; font-size:10.5px; font-weight:700; color:#5b6672; margin-bottom:4px; }\n    #cmd-body input,#cmd-body select,#cmd-body textarea{\n      width:100%; padding:8px 9px; border:1px solid #d8dfe6; border-radius:7px; font-size:12.5px; color:#16221f;\n    }\n    #cmd-body textarea{ min-height:90px; resize:vertical; }\n    #cmd-origem-outro-wrap{ display:none; margin-top:8px; }\n    #cmd-origem-outro-wrap.show{ display:block; }\n    #cmd-auto-aviso{ display:none; background:#fff4e2; color:#a15c00; font-size:11px; padding:8px 10px; border-radius:7px; margin-bottom:12px; }\n    .cmd-info-box{ background:#e8f0f8; color:#123a7a; font-size:11px; padding:8px 10px; border-radius:7px; margin-bottom:12px; line-height:1.4; }\n    .cmd-contador{ text-align:right; font-size:10.5px; color:#8a97a4; margin-top:4px; }\n    button.cmd-primary{ background:#1a4fa0; color:#fff; border:none; border-radius:9px; padding:10px 18px; font-size:13px; font-weight:800; cursor:pointer; }\n    button.cmd-primary:hover{ background:#123a7a; }\n    button.cmd-primary:disabled{ background:#a7bcdd; cursor:not-allowed; }\n    button.cmd-secondary{ background:#fff; color:#123a7a; border:1.4px solid #1a56ad; border-radius:9px; padding:9px 14px; font-size:12.5px; font-weight:700; cursor:pointer; }\n    button.cmd-secondary:hover{ background:#e8f0f8; }\n    #cmd-footer{ display:flex; justify-content:flex-end; gap:8px; padding:14px 20px; border-top:1px solid #eee; }\n    #cmd-erro{ display:none; background:#fde8e8; border:1px solid #f0b8b8; color:#a12626; font-size:11.5px; padding:10px 12px; border-radius:8px; margin-top:6px; line-height:1.5; }";

  var HTML = "<div id=\"cmd-modal\">\n      " +
    raiz.MeedsSuiteCabecalho.html({
      tom: "documento", titulo: "Laudo Médico de Alto Custo — Conceição do Mato Dentro", idFechar: "cmd-close",
      acoes: [
        { id: "cmd-refresh", rotulo: "🔄 Atualizar paciente", titulo: "Lê a tela do atendimento e busca os dados do paciente atual" },
        { id: "cmd-historico-abrir", rotulo: "📜 Histórico", titulo: "Documentos gerados neste computador" },
      ],
    }) +
    "\n      <div id=\"cmd-body\">\n        <div class=\"cmd-info-box\">\n          Gera o Laudo Médico de Alto Custo oficial de Conceição do Mato Dentro (mesmo PDF da prefeitura, preenchido pelos campos reais do formulário). A seção 04 (Junta de Autorização) não é preenchida — é reservada para a regulação.\n        </div>\n        <div id=\"cmd-historico-painel\"></div>\n        <div id=\"cmd-auto-aviso\"></div>\n\n        <div class=\"msmod\">\n          <div class=\"msmod-rot\">Modelos salvos</div>\n          <div class=\"msmod-vazio\" id=\"cmd-modelo-vazio\">Preencha o procedimento, o CID e a justificativa que você mais repete e dê um nome abaixo. Da próxima vez, escolha na lista e tudo volta preenchido.</div>\n          <div class=\"msmod-linha msmod-salvos\" id=\"cmd-modelo-salvos\">\n            <select id=\"cmd-modelo-sel\"></select>\n            <button type=\"button\" class=\"msmod-btn\" id=\"cmd-modelo-padrao\">\u2605 Usar sempre</button>\n            <button type=\"button\" class=\"msmod-btn perigo\" id=\"cmd-modelo-excluir\">Apagar</button>\n          </div>\n          <div class=\"msmod-linha\">\n            <input type=\"text\" id=\"cmd-modelo-nome\" maxlength=\"40\" placeholder=\"Nome do novo modelo (ex.: Holter rotina)\">\n            <button type=\"button\" class=\"msmod-btn principal\" id=\"cmd-modelo-criar\">\uff0b Salvar como modelo</button>\n          </div>\n          <div class=\"msmod-dica\" id=\"cmd-modelo-dica\"></div>\n        </div>\n\n        <div class=\"cmd-sec\">\n          <h3>Médico solicitante *</h3>\n          <div class=\"cmd-grid3\">\n            <div><label>Selecionar *</label><select id=\"cmd-medico-sel\"></select></div>\n            <div><label>Nome *</label><input id=\"cmd-medico-nome\"></div>\n            <div><label>CRM *</label><input id=\"cmd-medico-crm\"></div>\n          </div>\n          <div style=\"margin-top:8px;\"><label>CPF *</label><input id=\"cmd-medico-cpf\" placeholder=\"000.000.000-00\"></div>\n        </div>\n\n        <div class=\"cmd-sec\">\n          <h3>Dados do atendimento</h3>\n          <div>\n            <label>Unidade de origem *</label>\n            <select id=\"cmd-origem-sel\"></select>\n            <div id=\"cmd-origem-outro-wrap\"><label>Nome da unidade</label><input id=\"cmd-origem-outro\"></div>\n          </div>\n        </div>\n\n        <div class=\"cmd-sec\">\n          <h3>Paciente</h3>\n          <div class=\"cmd-grid2\">\n            <div><label>Nome completo *</label><input id=\"cmd-pac-nome\"></div>\n            <div><label>CPF</label><input id=\"cmd-pac-cpf\" placeholder=\"000.000.000-00\"></div>\n          </div>\n          <div class=\"cmd-grid3\" style=\"margin-top:8px;\">\n            <div><label>Data de nascimento</label><input id=\"cmd-pac-nasc\" placeholder=\"dd/mm/aaaa\" inputmode=\"numeric\" maxlength=\"10\"></div>\n            <div><label>Sexo *</label><select id=\"cmd-pac-sexo\"><option value=\"\" selected disabled>Selecione…</option><option value=\"FEM\">Feminino</option><option value=\"MASC\">Masculino</option></select></div>\n            <div><label>Telefone</label><input id=\"cmd-pac-telefone\"></div>\n          </div>\n          <div style=\"margin-top:8px;\"><label>Nome da mãe</label><input id=\"cmd-pac-mae\"></div>\n        </div>\n\n        <div class=\"cmd-sec\">\n          <h3>Procedimento solicitado *</h3>\n          <div class=\"cmd-grid2\">\n            <div><label>Nome do procedimento *</label><input id=\"cmd-proc-nome\" list=\"cmd-proc-list\" placeholder=\"digite o exame\" autocomplete=\"off\"></div>\n            <div><label>Código do procedimento</label><input id=\"cmd-proc-codigo\" placeholder=\"ex: 41101170\"></div>\n          </div>\n          <datalist id=\"cmd-proc-list\"></datalist>\n        </div>\n\n        <div class=\"cmd-sec\">\n          <h3>Diagnóstico</h3>\n          <div class=\"cmd-grid2\">\n            <div><label>CID-10</label><input id=\"cmd-cid\" placeholder=\"digite ou escolha\" autocomplete=\"off\"></div>\n            <div><label>Diagnóstico inicial</label><input id=\"cmd-diagnostico\" placeholder=\"preenche sozinho a partir do CID conhecido\"></div>\n          </div>\n          \n        </div>\n\n        <div class=\"cmd-sec\">\n          <h3>Justificativa clínica *</h3>\n          <textarea id=\"cmd-justificativa\" maxlength=\"700\" placeholder=\"história da moléstia, exames prévios e objetivo do exame solicitado (até 700 caracteres)\"></textarea>\n          <div class=\"cmd-contador\" id=\"cmd-justificativa-contador\">0/700</div>\n        </div>\n\n        <div id=\"cmd-sucesso\" style=\"display:none;\"></div>\n        <div id=\"cmd-erro\"></div>\n      </div>\n      <div id=\"cmd-footer\">\n        <button class=\"cmd-secondary\" id=\"cmd-limpar\">Limpar</button>\n        <button class=\"cmd-primary\" id=\"cmd-gerar\">Gerar e baixar PDF</button>\n      </div>\n    </div>";

  /* ---- extraidas do original sem alteracao ---- */
  /* ---- validacao dos campos obrigatorios ----
   * Cada campo declara o ROTULO como ele aparece na tela e, quando existe
   * um jeito mais rapido de preencher, a dica. E o que permite a mensagem
   * dizer "falta o nome da mae, preencha o campo Nome da mae, e se ele
   * nao veio sozinho clique em Atualizar paciente" em vez de "campo
   * obrigatorio". O texto final e montado pelo nucleo
   * (core/mensagens.js), para o tom ser o mesmo em todos os modulos. */
  var CAMPOS_OBRIGATORIOS = [
      { id: "cmd-medico-sel", descricao: "escolher o médico solicitante", rotulo: "Médico solicitante",
        comoResolver: "se a lista estiver vazia, cadastre-se no painel da engrenagem (⚙️)" },
      { id: "cmd-medico-nome", descricao: "o nome do médico", rotulo: "Nome" },
      { id: "cmd-medico-crm", descricao: "o CRM do médico", rotulo: "CRM",
        comoResolver: "complete o cadastro dele no painel da engrenagem (⚙️)" },
      { id: "cmd-medico-cpf", descricao: "o CPF do médico", rotulo: "CPF",
        comoResolver: "complete o cadastro dele no painel da engrenagem (⚙️)" },
      { id: "cmd-origem-sel", descricao: "a unidade de origem", rotulo: "Unidade de origem" },
      { id: "cmd-origem-outro", descricao: "o nome da unidade de origem", rotulo: "Nome da unidade",
        so: function () { return shadow.getElementById("cmd-origem-sel").value === "outro"; } },
      { id: "cmd-pac-nome", descricao: "o nome do paciente", rotulo: "Nome completo",
        comoResolver: "clique em “Atualizar paciente” para ler da tela do atendimento" },
      { id: "cmd-pac-sexo", descricao: "o sexo do paciente", rotulo: "Sexo" },
      { id: "cmd-justificativa", descricao: "a justificativa clínica", rotulo: "Justificativa clínica",
        comoResolver: "descreva a história, os exames prévios e o objetivo do exame (até 700 caracteres)" },
      { id: "cmd-proc-nome", descricao: "o procedimento solicitado", rotulo: "Nome do procedimento" }
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
    return raiz.MeedsSuiteMensagens.camposFaltando(faltas, { acao: "gerar o laudo de Conceição do Mato Dentro" });
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
  /* ------------------------------------------------------------------
   * produzirPdf() — FONTE UNICA DE VERDADE do documento
   * ------------------------------------------------------------------
   * Monta o PDF e devolve { bytes, filename }. NAO baixa, NAO mexe na
   * tela, NAO registra historico. E chamada por duas portas:
   *
   *   gerarPdf()  — o botao do medico: valida, produz, registra e baixa;
   *   o preview   — produz e mostra, sem validar (precisa desenhar mesmo
   *                 com o formulario pela metade).
   *
   * Como as duas passam por AQUI, o que o medico ve no preview e o mesmo
   * arquivo que ele vai baixar. Se alguem mudar uma coordenada, muda nos
   * dois — nao ha layout paralelo para divergir.
   * ------------------------------------------------------------------ */
  async function produzirPdf() {
    const PDFLibRef = await garantirPdfLib();
      const { PDFDocument, StandardFonts } = PDFLibRef;
      const origemSel = shadow.getElementById('cmd-origem-sel').value;
      const origem = (origemSel === 'outro' ? shadow.getElementById('cmd-origem-outro').value : origemSel).trim().toUpperCase();

      const nome = shadow.getElementById('cmd-pac-nome').value.trim().toUpperCase();
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
      void MUNICIPIO_FIXO; // 'municipio_1' já vem impresso no PDF oficial (Conceição do Mato Dentro)
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
    return { bytes: bytes, filename: filename, nome: nome, procNome: procNome, medicoNome: medicoNome };
  }

  async function gerarPdf() {
    limparErro();
    limparSucesso();
    const faltam = camposFaltando();
    if (faltam.length) {
      mostrarErro(mensagemDeCamposFaltando(faltam));
      /* Listar o que falta ainda deixa o medico procurando. Levar ate o
       * primeiro campo e o que transforma a recusa em instrucao. */
      if (guia) guia.apontarPrimeiroPendente();
      return;
    }

    const btn = shadow.getElementById('cmd-gerar');
    const original = btn.textContent;
    btn.textContent = 'Gerando…'; btn.disabled = true;

    try {
      const documento = await produzirPdf();
      const bytes = documento.bytes;
      const filename = documento.filename;
      const nome = documento.nome;
      const procNome = documento.procNome;
      const medicoNome = documento.medicoNome;

      raiz.MeedsSuiteHistorico.registrar("cmd", {
        nomePaciente: nome,
        cpfPaciente: shadow.getElementById("cmd-pac-cpf").value,
        titulo: procNome || "Laudo",
        medico: medicoNome,
        clinico: {
          "cmd-proc-nome": shadow.getElementById("cmd-proc-nome").value,
          "cmd-proc-codigo": shadow.getElementById("cmd-proc-codigo").value,
          "cmd-cid": shadow.getElementById("cmd-cid").value,
          "cmd-diagnostico": shadow.getElementById("cmd-diagnostico").value,
          "cmd-justificativa": shadow.getElementById("cmd-justificativa").value,
          "cmd-origem-outro": shadow.getElementById("cmd-origem-outro").value,
          "cmd-origem-sel": shadow.getElementById("cmd-origem-sel").value
        },
      });

      baixarPdf(bytes, filename);
      mostrarSucesso(filename);
      toast("Pronto — laudo de Conceição do Mato Dentro baixado.", 5000);
    } catch (e) {
      var msg = e && e.message ? e.message : "";
      if (/pdf-lib|componente|rede/i.test(msg)) {
        /* biblioteca que nao carrega tem causa e solucao proprias — quase
         * sempre a rede da unidade bloqueando o CDN — e por isso a
         * mensagem e outra. */
        mostrarErro(raiz.MeedsSuiteMensagens.BIBLIOTECA_NAO_CARREGOU("pdf-lib", msg));
      } else {
        mostrarErro(
          raiz.MeedsSuiteMensagens.erroTecnico(
            "gerar o PDF",
            "o programa encontrou um problema ao montar o arquivo",
            "Confira se os campos estão preenchidos como esperado e tente de novo. Se repetir, avise o administrador com a mensagem entre parênteses.",
            msg
          )
        );
      }
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
    aplicarModeloPadraoSeVazio();
    overlay.abrir();
    if (raiz.MeedsSuiteTutorial) {
      raiz.MeedsSuiteTutorial.iniciarSePrimeiraVez("cmd", { dock: d.dock });
    }
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
    shadow.getElementById("cmd-origem-outro-wrap").classList.toggle(
      "show",
      shadow.getElementById("cmd-origem-sel").value === "outro"
    );
    historico.esconder();
    var aviso = shadow.getElementById("cmd-auto-aviso");
    aviso.style.display = "block";
    aviso.textContent =
      "Repus procedimento, CID e justificativa de “" + entrada.titulo + "”. " +
      "Os dados do paciente continuam sendo os da tela — confira antes de gerar.";
    d.core.toast("Dados clínicos repostos do histórico.", 3500);
  }

  /* Preenche codigo e descricao nos campos certos deste laudo. Usada
   * tanto pelo autocomplete de dentro do campo quanto pela janela de
   * busca separada — um caminho so, para os dois nunca divergirem. */
  function preencherCidEscolhido(codigo, descricao) {
    var campo = shadow.getElementById("cmd-cid");
    if (campo) campo.value = codigo;
    var desc = shadow.getElementById("cmd-diagnostico");
    if (desc && (!desc.value || desc.dataset.auto === "1")) {
      desc.value = descricao || "";
      desc.dataset.auto = "1";
    }
  }

  function montarUI() {
    overlay = d.dock.criarOverlay({ estilo: CSS, html: HTML });

    historico = raiz.MeedsSuiteHistorico.montarPainel(
      shadow.getElementById("cmd-historico-painel"),
      "cmd",
      { aoReabrir: reabrirDoHistorico }
    );
    shadow.getElementById("cmd-historico-abrir").addEventListener("click", historico.alternar);
    shadow.getElementById("cmd-refresh").addEventListener("click", atualizarPaciente);
    shadow.getElementById("cmd-close").addEventListener("click", overlay.fechar);
    shadow.getElementById("cmd-gerar").addEventListener("click", gerarPdf);
    shadow.getElementById("cmd-limpar").addEventListener("click", limparForm);
    shadow.getElementById("cmd-proc-nome").addEventListener("input", autoPreencherCodigoProc);
    shadow.getElementById("cmd-cid").addEventListener("input", autoDescricaoCid);
    shadow.getElementById("cmd-justificativa").addEventListener("input", atualizarContadorJustificativa);
    // CPF se formata sozinho enquanto o medico digita (000.000.000-00)
    raiz.MeedsSuiteFormatos.aplicarMascaraCpf(shadow.getElementById("cmd-pac-cpf"));
    raiz.MeedsSuiteFormatos.aplicarMascaraCpf(shadow.getElementById("cmd-medico-cpf"));
    ativarMascaraData(shadow.getElementById("cmd-pac-nasc"));
    montarOrigens(); montarProcList(); montarMedicos(); }

  /* ----------------------------------------------------------------
   * CONTRATO DE MODULO
   * ---------------------------------------------------------------- */

  /* ------------------------------------------------------------------
   * MODELOS SALVOS
   * ------------------------------------------------------------------
   * A parte que se repete laudo a laudo — procedimento, codigo, CID,
   * justificativa — guardada uma vez e reposta com um clique. Nada de
   * paciente entra: ver core/modelos.js, que recusa esses campos por
   * duas travas independentes.
   *
   * CAMPOS_DO_MODELO e a MESMA lista que alimenta o historico, de
   * proposito: se as duas divergirem, um campo passa a ser "clinico" num
   * lugar e "de paciente" no outro, e a fronteira deixa de valer.
   * ------------------------------------------------------------------ */
  var CAMPOS_DO_MODELO = [
    "cmd-proc-nome",
    "cmd-proc-codigo",
    "cmd-cid",
    "cmd-diagnostico",
    "cmd-justificativa",
    "cmd-origem-outro",
    "cmd-origem-sel"
  ];

  function Modelos() { return raiz.MeedsSuiteModelos; }

  /* Este laudo nao tem grid de procedimento — o procedimento e um campo
   * de texto comum, ja coberto por CAMPOS_DO_MODELO. As duas portas
   * existem so para o formato do modelo ser o mesmo nos tres geradores. */
  function procedimentoDoModelo() { return null; }
  function aplicarProcedimentoDoModelo() { return false; }

  function lerCamposDoFormulario() {
    var fora = {};
    CAMPOS_DO_MODELO.forEach(function (id) {
      if (id === "procedimento") {
        var p = procedimentoDoModelo();
        if (p) fora.procedimento = p;
        return;
      }
      var el = shadow.getElementById(id);
      if (el && el.value) fora[id] = el.value;
    });
    return fora;
  }

  function aplicarModelo(clinico) {
    if (!clinico) return 0;
    var n = 0;
    Object.keys(clinico).forEach(function (id) {
      if (id === "procedimento") { if (aplicarProcedimentoDoModelo(clinico[id])) n++; return; }
      var el = shadow.getElementById(id);
      if (!el) return;
      el.value = clinico[id];
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      n++;
    });
    return n;
  }

  function montarModelos() {
    var sel = shadow.getElementById("cmd-modelo-sel");
    if (!sel) return;
    var lista = Modelos().listar("cmd");
    var escolhido = sel.value;

    /* Sem nenhum modelo, a lista de escolha nao aparece: um seletor
     * vazio parece defeito. Aparece so o convite para criar o primeiro. */
    var linhaSalvos = shadow.getElementById("cmd-modelo-salvos");
    var vazio = shadow.getElementById("cmd-modelo-vazio");
    if (linhaSalvos) linhaSalvos.hidden = !lista.length;
    if (vazio) vazio.hidden = !!lista.length;

    sel.innerHTML = "";
    var ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "Escolha um modelo para preencher\u2026";
    sel.appendChild(ph);
    lista.forEach(function (m) {
      var o = document.createElement("option");
      o.value = m.nome;
      o.textContent = (m.padrao ? "\u2605 " : "") + m.nome;
      sel.appendChild(o);
    });
    if (escolhido) sel.value = escolhido;

    var dica = shadow.getElementById("cmd-modelo-dica");
    if (dica) {
      var padrao = Modelos().padraoDe("cmd");
      if (padrao) {
        dica.textContent = "\u2605 " + padrao.nome + " entra sozinho quando você abre este gerador com os campos clínicos vazios.";
      } else if (lista.length) {
        dica.textContent = "Escolha \u201c\u2605 Usar sempre\u201d num modelo para ele vir preenchido sozinho, sem você clicar em nada.";
      } else {
        dica.textContent = "Nada de paciente entra num modelo: nome, CPF, nascimento, mãe e sexo ficam sempre de fora.";
      }
    }
  }

  function ligarModelos() {
    var sel = shadow.getElementById("cmd-modelo-sel");
    if (!sel) return;
    var nome = shadow.getElementById("cmd-modelo-nome");

    /* Escolher na lista preenche na hora — e o caminho de todo dia, e
     * um botao "Aplicar" a mais so acrescentaria clique. */
    sel.addEventListener("change", function () {
      if (!sel.value) return;
      var m = Modelos().obter("cmd", sel.value);
      if (!m) return;
      var n = aplicarModelo(m.clinico);
      /* O campo de NOME nao e preenchido aqui — e essa linha, que existia
       * "para facilitar corrigir", fazia o medico perder modelo: ele
       * aplicava um, montava OUTRO procedimento, clicava em salvar e o
       * antigo era sobrescrito em silencio. Para ele, so dava para ter um
       * modelo. Substituir agora e um ato deliberado: o botao muda de
       * texto quando o nome digitado ja existe. */
      atualizarBotaoDeSalvar();
      toast("Modelo \u201c" + m.nome + "\u201d aplicado (" + n + " campo" + (n > 1 ? "s" : "") + "). Confira antes de gerar.", 4000);
    });

    /* Criar e salvar sao o MESMO botao, de proposito: nome novo cria,
     * nome que ja existe corrige. O medico que salva "Holter rotina" de
     * novo esta acertando o dele, nao pedindo dois. */
    function criar() {
      var r = Modelos().salvar("cmd", nome.value, lerCamposDoFormulario(), CAMPOS_DO_MODELO);
      if (!r.ok) { toast(r.erro, 6000); nome.focus(); return; }
      montarModelos();
      sel.value = r.nome;
      /* Limpar depois de CRIAR e o que deixa o proximo salvar ser um
       * modelo novo por padrao, em vez de uma substituicao por acidente. */
      if (!r.substituiu) nome.value = "";
      atualizarBotaoDeSalvar();
      var quantos = Modelos().listar("cmd").length;
      toast(
        r.substituiu
          ? "Modelo \u201c" + r.nome + "\u201d substituído."
          : "Modelo \u201c" + r.nome + "\u201d salvo. Você tem " + quantos + " modelo" + (quantos > 1 ? "s" : "") + ".",
        4000
      );
    }

    /* O botao anuncia o que vai acontecer ANTES do clique. Sem isto,
     * criar e substituir sao o mesmo gesto — e o medico so descobre qual
     * dos dois aconteceu quando o modelo antigo ja se foi. */
    function atualizarBotaoDeSalvar() {
      var botao = shadow.getElementById("cmd-modelo-criar");
      if (!botao) return;
      var digitado = (nome.value || "").trim();
      var existe = digitado && Modelos().obter("cmd", digitado);
      botao.textContent = existe ? "\u21bb Substituir \u201c" + digitado + "\u201d" : "\uff0b Salvar como modelo";
      botao.classList.toggle("substituir", !!existe);
    }

    shadow.getElementById("cmd-modelo-criar").addEventListener("click", criar);
    nome.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); criar(); }
    });
    nome.addEventListener("input", atualizarBotaoDeSalvar);

    shadow.getElementById("cmd-modelo-padrao").addEventListener("click", function () {
      if (!sel.value) { toast("Escolha um modelo na lista para ele vir preenchido sozinho.", 4000); return; }
      Modelos().definirPadrao("cmd", sel.value);
      montarModelos();
      var padrao = Modelos().padraoDe("cmd");
      toast(
        padrao && padrao.nome === sel.value
          ? "\u201c" + sel.value + "\u201d agora vem preenchido sozinho ao abrir."
          : "\u201c" + sel.value + "\u201d deixou de vir preenchido sozinho.",
        4000
      );
    });

    shadow.getElementById("cmd-modelo-excluir").addEventListener("click", function () {
      if (!sel.value) { toast("Escolha um modelo na lista para apagar.", 4000); return; }
      if (!raiz.confirm("Apagar o modelo \u201c" + sel.value + "\u201d?")) return;
      Modelos().remover("cmd", sel.value);
      nome.value = "";
      atualizarBotaoDeSalvar();
      montarModelos();
      toast("Modelo apagado.", 3000);
    });

    montarModelos();
    atualizarBotaoDeSalvar();
  }

  /* O modelo padrao so entra com a parte clinica VAZIA. Ele existe para
   * poupar digitacao, nunca para apagar o que o medico ja escreveu. */
  function aplicarModeloPadraoSeVazio() {
    var padrao = Modelos().padraoDe("cmd");
    if (!padrao) return;
    if (!formularioClinicoVazio()) return;
    aplicarModelo(padrao.clinico);
  }


  /* ------------------------------------------------------------------
   * GUIA DE PREENCHIMENTO
   * ------------------------------------------------------------------
   * Barra de progresso e "falta: X", alimentadas pela MESMA
   * camposFaltando() que recusa a emissao. Uma barra que chega a 100%
   * com o botao ainda recusando ensinaria o medico a nao confiar na
   * tela — por isso a fonte e uma so. Ver D32.
   * ------------------------------------------------------------------ */
  var guia = null;

  function camposAplicaveis() {
    return CAMPOS_OBRIGATORIOS.filter(function (campo) {
      return typeof campo.so !== "function" || campo.so();
    });
  }

  function montarGuia() {
    if (!raiz.MeedsSuiteGuia) return;
    guia = raiz.MeedsSuiteGuia.criar({
      aplicaveis: camposAplicaveis,
      faltando: camposFaltando,
      elementoDe: function (campo) {
        return shadow.getElementById(campo.id);
      },
    });

    var corpo = shadow.getElementById("cmd-body");
    if (corpo) corpo.insertBefore(guia.elemento, corpo.firstChild);

    /* Um ouvinte delegado no modal, nao um por campo: o formulario muda
     * de forma (grid de procedimento, campos condicionais) e ouvintes
     * por campo ficariam para tras. */
    var modal = shadow.getElementById("cmd-modal");
    if (modal) {
      modal.addEventListener("input", atualizarGuia);
      modal.addEventListener("change", atualizarGuia);
      modal.addEventListener("click", atualizarGuia);
    }
    atualizarGuia();
  }

  function atualizarGuia() {
    if (guia) guia.atualizar();
  }

  /* ----------------------------------------------------------------
   * TUTORIAL GUIADO — ver core/tutorial.js para o mecanismo.
   * Registro estatico, independente de o modulo estar rodando.
   * ---------------------------------------------------------------- */
  if (raiz.MeedsSuiteTutorial) {
    raiz.MeedsSuiteTutorial.registrar("cmd", {
      titulo: "Laudo — Conceição do Mato Dentro",
      passos: [
        {
          icone: "📄",
          titulo: "O que esta função faz",
          texto:
            "Preenche o Laudo Médico de Alto Custo oficial de Conceição do Mato Dentro usando os campos " +
            "reais do formulário em PDF (AcroForm) — não é uma cópia redesenhada, é o formulário oficial " +
            "preenchido. A seção 04 (Junta de Autorização) não é preenchida — é reservada para a regulação.",
        },
        {
          icone: "🏥",
          titulo: "Médico e unidade de origem",
          texto:
            "Escolha o médico solicitante no cadastro (nome, CRM e CPF vêm sozinhos), e a unidade de " +
            "origem no seletor — se a unidade não estiver na lista, escolha \"outro\" e digite o nome.",
        },
        {
          icone: "🩺",
          titulo: "Procedimento, CID e justificativa",
          texto:
            "Digite o nome do procedimento e busque na lista de sugestões. O CID-10 busca pelo nome da " +
            "doença; o diagnóstico inicial preenche sozinho a partir dele. A justificativa clínica é " +
            "obrigatória, com limite de 700 caracteres — o contador mostra quanto falta.",
        },
        {
          icone: "💾",
          titulo: "Modelos, histórico e gerar",
          texto:
            "Salve como modelo o que você repete sempre. \"Gerar e baixar PDF\" produz o documento final; " +
            "ele fica registrado no 📜 Histórico deste computador para reabrir depois.",
        },
      ],
    });
  }

  raiz.MeedsSuite.registerModule({
    id: "cmd",
    nome: "Laudo — Conceição do Mato Dentro",
    descricao: "Preenche o LAUDO MÉDICO DE ALTO CUSTO oficial de Conceição do Mato Dentro usando os campos reais do formulário PDF (AcroForm).",
    versao: "2.0.0",
    configPadrao: {},

    // Botao: apresentacao no manifest.json (ficha "cmd"). Ver D58.
    temBotao: true,

    // Este modulo nao precisa ouvir a rede: le tudo da tela do
    // atendimento. Fica sem assinaturasRede de proposito.
    assinaturasRede: [],

    start: function (deps) {
      d = deps;
      montarUI();
      ligarModelos();
      montarGuia();

      /* Quando o medico e cadastrado ou removido no painel da engrenagem,
       * o <select> se redesenha sozinho — sem precisar fechar e reabrir
       * este modal. */



      /* O campo de CID deste laudo e anunciado para quem souber buscar
       * CID-10. O modulo de busca se acopla a ele: o medico clica no
       * campo, digita o codigo ou o nome da doenca e escolhe — codigo e
       * descricao entram sozinhos. Se aquele modulo estiver desligado,
       * ninguem atende e o campo continua sendo texto livre. */
      function anunciarCampoCid() {
        var campo = shadow.getElementById("cmd-cid");
        if (!campo) return;
        deps.publicarEvento("cid:conectar-campo", {
          input: campo,
          aoEscolher: preencherCidEscolhido,
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
          id: "cmd",
          nome: "Laudo — CMD",
          seletorModal: "#cmd-modal",
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
      });

      deps.aoClicarBotao(abrirModal);
      if (typeof deps.aoIniciarTutorial === "function") {
        deps.aoIniciarTutorial(function () {
          if (raiz.MeedsSuiteTutorial) raiz.MeedsSuiteTutorial.iniciar("cmd", { dock: d.dock });
        });
      }
    },

    stop: function () {
      timers.forEach(clearInterval);
      timers = [];
      if (overlay) { overlay.remover(); overlay = null; }
      d = null;
    },
  });
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
