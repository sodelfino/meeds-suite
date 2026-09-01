/* ------------------------------------------------------------------
 * core/historico.js — historico dos documentos gerados
 * ------------------------------------------------------------------
 * PARA QUE SERVE
 * Depois de um plantao, o medico quer conferir o que ja emitiu ("ja pedi
 * o Holter dessa paciente?") e, principalmente, NAO redigitar a parte
 * clinica quando precisa emitir um segundo laudo parecido. O botao
 * "Reabrir" devolve procedimento, codigo, CID, diagnostico,
 * justificativa e unidade — que e o que da trabalho.
 *
 * O QUE E GRAVADO, E O QUE NAO E  (leia antes de mexer aqui)
 * A regra herdada dos cinco scripts originais e clara: NENHUM dado de
 * paciente vai para o disco. O historico que existia no APAC gravava o
 * NOME COMPLETO do paciente no armazenamento do Tampermonkey — ou seja,
 * ja contrariava a propria descricao do script.
 *
 * Aqui isso foi corrigido. E gravado:
 *   - data e hora, medico, e a parte CLINICA/administrativa do documento;
 *   - uma referencia NAO identificavel do paciente: iniciais e os tres
 *     ultimos digitos do CPF ("M.A.S. •••456"), o suficiente para o
 *     medico reconhecer qual foi, insuficiente para identificar alguem a
 *     partir do arquivo.
 * NAO e gravado: nome completo, CPF completo, data de nascimento, nome da
 * mae, telefone, nem o PDF.
 *
 * Por consequencia, "Reabrir" repoe a parte clinica e NAO repoe a
 * identificacao do paciente — que continua vindo fresca da tela do
 * atendimento. Isso tem um efeito colateral desejado: elimina a chance
 * de o dado de um paciente vazar para o laudo de outro, que e a mesma
 * preocupacao que ja levou LME e CMD a limpar o formulario quando o CPF
 * da tela muda.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  var PREFIXO = "historico:";
  var LIMITE = 30; // igual ao do APAC original

  /* Mesmo caminho duravel do cadastro — ver core/storage.js. */
  function porta(chave) {
    return raiz.MeedsSuiteStorage.duravel(chave, "meeds-suite:" + chave);
  }

  function ler(chave, padrao) {
    return porta(chave).ler(padrao);
  }

  function gravar(chave, valor) {
    return porta(chave).gravar(valor);
  }

  /* ------------------------------------------------------------------
   * REFERENCIA NAO IDENTIFICAVEL DO PACIENTE
   * "MARIA APARECIDA DE SOUZA" + "12345678909" -> "M.A.S. · •••890"
   * Preposicoes ficam de fora das iniciais para o resultado ser legivel.
   * ------------------------------------------------------------------ */
  var PARTICULAS = ["de", "da", "do", "das", "dos", "e"];

  function referenciaDoPaciente(nome, cpf) {
    var partes = [];
    String(nome || "")
      .trim()
      .split(/\s+/)
      .forEach(function (palavra) {
        if (!palavra) return;
        if (PARTICULAS.indexOf(palavra.toLowerCase()) !== -1) return;
        partes.push(palavra.charAt(0).toUpperCase() + ".");
      });

    var digitos = String(cpf || "").replace(/\D/g, "");
    var finalCpf = digitos.length >= 3 ? "•••" + digitos.slice(-3) : "";

    var iniciais = partes.slice(0, 4).join("");
    if (!iniciais && !finalCpf) return "Paciente";
    return [iniciais, finalCpf].filter(Boolean).join(" · ");
  }

  function agoraLegivel() {
    var d = new Date();
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  /* ------------------------------------------------------------------
   * API
   * ------------------------------------------------------------------
   * registrar(idModulo, {
   *   nomePaciente, cpfPaciente,   // usados SO para montar a referencia,
   *                                // nunca gravados
   *   titulo,                      // ex: "Holter 24h"
   *   medico,                      // nome do medico solicitante
   *   clinico: { ... }             // o que "Reabrir" repoe
   * })
   * ------------------------------------------------------------------ */
  function registrar(idModulo, entrada) {
    entrada = entrada || {};
    var lista = listar(idModulo);
    lista.unshift({
      quando: agoraLegivel(),
      paciente: referenciaDoPaciente(entrada.nomePaciente, entrada.cpfPaciente),
      titulo: entrada.titulo || "Documento",
      medico: entrada.medico || "",
      clinico: entrada.clinico || {},
    });
    gravar(PREFIXO + idModulo, lista.slice(0, LIMITE));
  }

  function listar(idModulo) {
    var lista = ler(PREFIXO + idModulo, []);
    return Array.isArray(lista) ? lista : [];
  }

  function limpar(idModulo) {
    gravar(PREFIXO + idModulo, []);
  }

  /* MIGRACAO do historico antigo do APAC, que gravava o nome completo.
   * As entradas existentes sao convertidas para a referencia curta — o
   * nome completo e descartado do disco na primeira execucao desta
   * versao. Roda uma vez; depois a chave antiga fica vazia. */
  function migrarHistoricoApac() {
    var antigo = ler("apac_historico_v1", undefined);
    if (!Array.isArray(antigo) || antigo.length === 0) return 0;

    var convertidas = antigo.map(function (e) {
      return {
        quando: e.quando || "",
        paciente: referenciaDoPaciente(e.paciente, ""),
        titulo: e.procedimento || "APAC",
        medico: "",
        clinico: {},
      };
    });

    var atual = listar("apac-itauna");
    gravar(PREFIXO + "apac-itauna", convertidas.concat(atual).slice(0, LIMITE));
    gravar("apac_historico_v1", []); // o nome completo sai do disco
    console.debug("[Assistente Meeds] historico do APAC migrado:", convertidas.length, "registro(s) sem nome completo.");
    return convertidas.length;
  }

  /* ------------------------------------------------------------------
   * PAINEL — o mesmo em todos os modulos, para um sexto ganhar pronto
   * ------------------------------------------------------------------ */
  var CSS = [
    ".msh-painel { border:1px solid #d8e6e3; border-radius:9px; padding:10px; margin-bottom:12px; background:#f7fbfa; }",
    ".msh-painel[hidden] { display:none; }",
    ".msh-topo { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; gap:8px; }",
    ".msh-topo strong { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:#0e7a70; }",
    ".msh-limpar { background:none; border:1px solid #d8e6e3; border-radius:7px; color:#5b6c68; cursor:pointer; font-size:10.5px; padding:3px 8px; }",
    ".msh-limpar:hover { background:#e3f5f3; }",
    ".msh-item { display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid #e5efed; font-size:11.5px; }",
    ".msh-item:last-child { border-bottom:none; }",
    ".msh-item-txt { flex:1; min-width:0; line-height:1.45; }",
    ".msh-item-titulo { font-weight:700; color:#16221f; }",
    ".msh-item-meta { color:#5b6c68; font-size:10.5px; }",
    ".msh-reabrir { background:#fff; border:1.3px solid #17ab9e; color:#0e7a70; border-radius:7px; cursor:pointer; font-size:10.5px; font-weight:700; padding:4px 9px; flex-shrink:0; }",
    ".msh-reabrir:hover { background:#e3f5f3; }",
    ".msh-vazio { font-size:11.5px; color:#8a97a4; font-style:italic; }",
    ".msh-nota { font-size:10px; color:#9aa5b1; margin-top:8px; line-height:1.45; }",
  ].join("\n");

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* montarPainel(elemento, idModulo, { aoReabrir(entrada) })
   * `elemento` e um contentor vazio dentro do modal do modulo. */
  function montarPainel(elemento, idModulo, opcoes) {
    opcoes = opcoes || {};
    elemento.className = "msh-painel";
    elemento.hidden = true;

    function render() {
      var lista = listar(idModulo);
      var corpo = lista.length
        ? lista
            .map(function (e, i) {
              var meta = [e.quando, e.paciente, e.medico].filter(Boolean).join("  ·  ");
              var temClinico = e.clinico && Object.keys(e.clinico).length > 0;
              return (
                '<div class="msh-item">' +
                '  <div class="msh-item-txt">' +
                '    <div class="msh-item-titulo">' + escapeHtml(e.titulo) + "</div>" +
                '    <div class="msh-item-meta">' + escapeHtml(meta) + "</div>" +
                "  </div>" +
                (temClinico
                  ? '  <button type="button" class="msh-reabrir" data-i="' + i +
                    '" title="Repõe procedimento, CID e justificativa deste documento. Os dados do paciente continuam vindo da tela.">Reabrir</button>'
                  : "") +
                "</div>"
              );
            })
            .join("")
        : '<div class="msh-vazio">Nenhum documento gerado ainda neste computador.</div>';

      elemento.innerHTML =
        '<div class="msh-topo"><strong>Gerados neste computador</strong>' +
        (lista.length ? '<button type="button" class="msh-limpar">Limpar histórico</button>' : "") +
        "</div>" +
        corpo +
        '<div class="msh-nota">Guardamos apenas as iniciais e os três últimos dígitos do CPF — o suficiente para você reconhecer o atendimento, sem gravar dado de paciente no computador. “Reabrir” repõe a parte clínica; os dados do paciente vêm da tela.</div>';

      var limpar = elemento.querySelector(".msh-limpar");
      if (limpar) {
        limpar.addEventListener("click", function () {
          limparHistorico(idModulo);
          render();
        });
      }
      elemento.querySelectorAll(".msh-reabrir").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var e = listar(idModulo)[Number(btn.getAttribute("data-i"))];
          if (e && typeof opcoes.aoReabrir === "function") opcoes.aoReabrir(e);
        });
      });
    }

    function limparHistorico(id) {
      limpar(id);
    }

    return {
      render: render,
      alternar: function () {
        var abrindo = elemento.hidden;
        elemento.hidden = !abrindo;
        if (abrindo) render();
        return abrindo;
      },
      esconder: function () {
        elemento.hidden = true;
      },
    };
  }

  raiz.MeedsSuiteHistorico = {
    registrar: registrar,
    listar: listar,
    limpar: limpar,
    montarPainel: montarPainel,
    migrarHistoricoApac: migrarHistoricoApac,
    referenciaDoPaciente: referenciaDoPaciente,
    CSS: CSS,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
