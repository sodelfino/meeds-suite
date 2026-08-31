/* ------------------------------------------------------------------
 * core/feedback.js — o médico conta o que achou
 * ------------------------------------------------------------------
 * COMO O RECADO SAI DAQUI
 * Por e-mail, abrindo o programa de e-mail do próprio médico com tudo
 * já escrito (link `mailto:`), ou pela área de transferência, para quem
 * prefere mandar por WhatsApp.
 *
 * Não existe servidor, não existe formulário na nuvem, não existe
 * serviço de terceiro. O texto sai do navegador do médico direto para o
 * programa de e-mail dele — nada trafega por lugar nenhum antes disso.
 * Num sistema que exibe dado de paciente, um "enviar feedback" que posta
 * texto livre para um serviço externo seria um vazamento esperando
 * acontecer.
 *
 * O QUE VAI JUNTO, AUTOMATICAMENTE
 * Versão do Assistente, funções ligadas e o navegador. São as três
 * perguntas que sempre se faz ao receber um relato — e que o médico
 * não deveria precisar responder.
 *
 * O QUE NÃO VAI
 * Nada de paciente. Nem nome, nem CPF, nem identificador de
 * atendimento, nem o conteúdo dos formulários. O aviso na tela pede
 * explicitamente que o médico também não escreva esses dados.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var CSS = [
    ".msf-modal { width:100%; max-width:520px; max-height:86vh; background:#fff; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.35); display:flex; flex-direction:column; overflow:hidden; }",
    ".msf-modal header { background:linear-gradient(135deg,#123a7a,#1a56ad); color:#fff; padding:15px 18px; display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }",
    ".msf-modal header h2 { margin:0; font-size:15px; font-weight:700; }",
    ".msf-sub { margin:3px 0 0; font-size:11.5px; opacity:.9; }",
    ".msf-fechar { background:rgba(255,255,255,.2); border:none; color:#fff; width:28px; height:28px; border-radius:50%; cursor:pointer; font-size:14px; flex-shrink:0; }",
    ".msf-corpo { padding:15px 18px; overflow-y:auto; }",
    ".msf-tipos { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }",
    ".msf-tipo { background:#fff; border:1.4px solid #d8dfe6; color:#5b6672; border-radius:999px; padding:7px 14px; font-size:12px; font-weight:700; font-family:inherit; cursor:pointer; }",
    ".msf-tipo:hover { border-color:#1a56ad; color:#123a7a; }",
    ".msf-tipo[aria-pressed='true'] { background:#123a7a; border-color:#123a7a; color:#fff; }",
    ".msf-corpo label { display:block; font-size:10.5px; font-weight:700; color:#5b6672; margin-bottom:4px; }",
    ".msf-corpo textarea { width:100%; box-sizing:border-box; min-height:120px; padding:10px; border:1px solid #d8dfe6; border-radius:8px; font-size:13px; font-family:inherit; line-height:1.5; resize:vertical; }",
    ".msf-aviso { background:#fff4e2; border:1px solid #f5d9ac; color:#8a5200; font-size:11.5px; line-height:1.55; padding:9px 11px; border-radius:8px; margin-top:10px; }",
    ".msf-anexo { font-size:11px; color:#8a97a4; line-height:1.6; margin-top:10px; }",
    ".msf-anexo code { font-family:ui-monospace,Menlo,monospace; font-size:10.5px; }",
    ".msf-erro { background:#fde8e8; border:1px solid #f0b8b8; color:#a12626; font-size:11.5px; padding:9px 11px; border-radius:8px; margin-top:10px; }",
    ".msf-ok { background:#e6f6f2; border:1px solid #b6e3d8; color:#0b6a62; font-size:11.5px; padding:9px 11px; border-radius:8px; margin-top:10px; }",
    ".msf-rodape { display:flex; gap:8px; justify-content:flex-end; padding:12px 18px; border-top:1px solid #eef2f6; flex-wrap:wrap; }",
    ".msf-btn { background:#1a4fa0; color:#fff; border:none; border-radius:8px; padding:10px 16px; font-size:12.5px; font-weight:700; font-family:inherit; cursor:pointer; }",
    ".msf-btn:hover { background:#123a7a; }",
    ".msf-btn-sec { background:#fff; color:#123a7a; border:1.3px solid #cbd5e1; }",
    ".msf-btn-sec:hover { background:#eef4fb; }",
  ].join("\n");

  var TIPOS = [
    { id: "problema", rotulo: "Algo não funcionou", prefixo: "[problema]" },
    { id: "ideia", rotulo: "Tenho uma ideia", prefixo: "[ideia]" },
    { id: "outro", rotulo: "Outro assunto", prefixo: "[feedback]" },
  ];

  var overlay = null;
  var ctx = null;
  var tipoAtual = "problema";

  /* Navegador em uma linha, sem o user-agent inteiro — que é longo,
   * ilegível e ainda funciona como impressão digital. */
  function navegadorCurto() {
    var ua = navigator.userAgent || "";
    var nome = /Edg\//.test(ua)
      ? "Edge"
      : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
      ? "Firefox"
      : /Safari\//.test(ua)
      ? "Safari"
      : "navegador desconhecido";
    var sistema = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
    return [nome, sistema].filter(Boolean).join(" · ");
  }

  function funcoesLigadas() {
    return (ctx.modulos || [])
      .filter(function (m) {
        return m.habilitado;
      })
      .map(function (m) {
        return m.nome;
      });
  }

  /* O rodapé técnico. Só isto — nenhum dado de paciente. */
  function assinaturaTecnica() {
    return [
      "---",
      "Assistente Meeds " + ctx.versao,
      "Funções ligadas: " + (funcoesLigadas().join(", ") || "nenhuma"),
      "Navegador: " + navegadorCurto(),
    ].join("\n");
  }

  function montarTexto() {
    var escrito = overlay.$("#msf-texto").value.trim();
    return escrito + "\n\n" + assinaturaTecnica();
  }

  function assuntoAtual() {
    var t = TIPOS.filter(function (x) {
      return x.id === tipoAtual;
    })[0];
    return "Assistente Meeds " + ctx.versao + " " + (t ? t.prefixo : "[feedback]");
  }

  function mostrarMensagem(texto, tipo) {
    var caixa = overlay.$("#msf-mensagem");
    caixa.innerHTML = texto
      ? '<div class="msf-' + (tipo || "ok") + '"></div>'
      : "";
    if (texto) caixa.firstChild.textContent = texto;
  }

  function enviarPorEmail() {
    var texto = overlay.$("#msf-texto").value.trim();
    if (!texto) {
      mostrarMensagem("Escreva o que aconteceu antes de enviar — nem que seja uma linha.", "erro");
      overlay.$("#msf-texto").focus();
      return;
    }
    var destino = (ctx.contato && ctx.contato.email) || "";
    if (!destino) {
      mostrarMensagem(
        "Não há endereço de contato configurado nesta instalação. Use “Copiar” e mande o texto pelo canal que preferir.",
        "erro"
      );
      return;
    }
    var url =
      "mailto:" + encodeURIComponent(destino) +
      "?subject=" + encodeURIComponent(assuntoAtual()) +
      "&body=" + encodeURIComponent(montarTexto());
    try {
      raiz.open(url, "_blank");
      mostrarMensagem("Abri o seu programa de e-mail com a mensagem pronta. Confira e envie.", "ok");
    } catch (e) {
      mostrarMensagem(
        "Não consegui abrir o programa de e-mail deste computador. Use “Copiar” e mande pelo canal que preferir.",
        "erro"
      );
    }
  }

  function copiar() {
    var texto = overlay.$("#msf-texto").value.trim();
    if (!texto) {
      mostrarMensagem("Escreva o que aconteceu antes de copiar.", "erro");
      overlay.$("#msf-texto").focus();
      return;
    }
    var completo = assuntoAtual() + "\n\n" + montarTexto();

    function ok() {
      mostrarMensagem("Copiado. Cole no WhatsApp, no e-mail ou onde preferir.", "ok");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(completo).then(ok).catch(function () {
        copiarFallback(completo, ok);
      });
    } else {
      copiarFallback(completo, ok);
    }
  }

  function copiarFallback(texto, aoCopiar) {
    try {
      var ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      aoCopiar();
    } catch (e) {
      mostrarMensagem("Não consegui copiar automaticamente. Selecione o texto acima e copie com Ctrl+C.", "erro");
    }
  }

  function selecionarTipo(id) {
    tipoAtual = id;
    overlay.$$(".msf-tipo").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-tipo") === id));
    });
    var campo = overlay.$("#msf-texto");
    campo.setAttribute(
      "placeholder",
      id === "problema"
        ? "O que você estava fazendo, o que esperava que acontecesse e o que aconteceu."
        : id === "ideia"
        ? "O que facilitaria a sua rotina? Pode ser uma frase."
        : "Escreva à vontade."
    );
  }

  function abrir(contexto) {
    ctx = contexto;

    if (!overlay) {
      overlay = ctx.dock.criarOverlay({
        estilo: CSS,
        html:
          '<div class="msf-modal" role="dialog" aria-modal="true">' +
          "  <header><div>" +
          "    <h2>Enviar feedback</h2>" +
          '    <p class="msf-sub">Vai direto para quem cuida do Assistente</p>' +
          "  </div>" +
          '  <button type="button" class="msf-fechar" aria-label="Fechar">&#10005;</button></header>' +
          '  <div class="msf-corpo">' +
          '    <div class="msf-tipos">' +
          TIPOS.map(function (t) {
            return (
              '<button type="button" class="msf-tipo" data-tipo="' + t.id +
              '" aria-pressed="false">' + t.rotulo + "</button>"
            );
          }).join("") +
          "    </div>" +
          '    <label for="msf-texto">Conte o que aconteceu</label>' +
          '    <textarea id="msf-texto"></textarea>' +
          '    <div class="msf-aviso">Por favor, <b>não escreva dados de paciente</b> — nome, CPF ou número de atendimento. Para relatar um problema, descrever a tela e o que você fez já basta.</div>' +
          '    <div class="msf-anexo" id="msf-anexo"></div>' +
          '    <div id="msf-mensagem"></div>' +
          "  </div>" +
          '  <div class="msf-rodape">' +
          '    <button type="button" class="msf-btn msf-btn-sec" id="msf-copiar">Copiar</button>' +
          '    <button type="button" class="msf-btn" id="msf-email">Enviar por e-mail</button>' +
          "  </div>" +
          "</div>",
      });

      overlay.$(".msf-fechar").addEventListener("click", overlay.fechar);
      overlay.$("#msf-email").addEventListener("click", enviarPorEmail);
      overlay.$("#msf-copiar").addEventListener("click", copiar);
      overlay.$$(".msf-tipo").forEach(function (b) {
        b.addEventListener("click", function () {
          selecionarTipo(b.getAttribute("data-tipo"));
        });
      });
    }

    overlay.$("#msf-texto").value = "";
    mostrarMensagem(null);
    selecionarTipo("problema");

    /* O médico vê exatamente o que segue junto — nada é anexado às
     * escondidas. */
    overlay.$("#msf-anexo").textContent =
      "Vai junto, automaticamente: versão " + ctx.versao +
      ", funções ligadas (" + (funcoesLigadas().length || 0) + ") e o navegador. " +
      "Nenhum dado de paciente é incluído.";

    overlay.abrir();
    setTimeout(function () {
      overlay.$("#msf-texto").focus();
    }, 60);
  }

  raiz.MeedsSuiteFeedback = {
    abrir: abrir,
    _assinaturaTecnica: function () {
      return assinaturaTecnica();
    },
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
