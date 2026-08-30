/* ------------------------------------------------------------------
 * modules/_template/index.js — MODELO PARA UM MODULO NOVO
 * ------------------------------------------------------------------
 * COPIE esta pasta, renomeie e troque o que estiver marcado com
 * "TROQUE". Passo a passo completo em docs/COMO-ADICIONAR-MODULO.md.
 *
 * Esta pasta NAO entra no pacote: o build so empacota o que estiver
 * listado em manifest.json. Ela existe so como ponto de partida.
 *
 * AS TRES REGRAS QUE O BUILD COBRA (ele reprova se voce quebrar):
 *   1. NAO posicione o seu botao. Nada de bottom/top/left/right em px.
 *      Quem posiciona e o dock do nucleo; voce so declara a prioridade.
 *   2. NAO instale hook de fetch/XHR. Use "assinaturasRede" abaixo.
 *   3. LIMPE TUDO no stop(): timers, observers e overlays. O botao e as
 *      assinaturas de rede o nucleo remove sozinho.
 *
 * E a regra que o build nao consegue cobrar, mas vale igual:
 *   4. Mensagem de erro EXPLICA A CAUSA e o que fazer em seguida.
 *      "Não gerei porque falta o nome da mãe" — nunca só "Erro".
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  /* Estado do modulo. Recriado a cada start(), zerado a cada stop(). */
  var d = null;        // dependencias entregues pelo nucleo
  var overlay = null;  // janela do modulo, se tiver
  var timers = [];     // guarde TODO setInterval aqui, para o stop limpar

  /* CSS so do CONTEUDO da janela. Posicionamento e do nucleo. */
  var CSS = [
    ".tpl-modal { width:100%; max-width:520px; background:#fff; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.35); overflow:hidden; }",
    ".tpl-head { background:linear-gradient(135deg,#123a7a,#1a56ad); color:#fff; padding:16px 18px; display:flex; justify-content:space-between; align-items:center; }",
    ".tpl-head h2 { margin:0; font-size:15px; font-weight:700; }",
    ".tpl-fechar { background:rgba(255,255,255,.2); border:none; color:#fff; width:28px; height:28px; border-radius:50%; cursor:pointer; font-size:14px; }",
    ".tpl-body { padding:16px 18px; font-size:13px; color:#16221f; line-height:1.5; }",
  ].join("\n");

  var HTML =
    '<div class="tpl-modal" role="dialog" aria-modal="true">' +
    '  <div class="tpl-head"><h2>TROQUE: título da janela</h2>' +
    '    <button type="button" class="tpl-fechar" aria-label="Fechar">&#10005;</button></div>' +
    '  <div class="tpl-body" id="tpl-conteudo">TROQUE: conteúdo do módulo.</div>' +
    "</div>";

  function montarUI() {
    overlay = d.dock.criarOverlay({ estilo: CSS, html: HTML });
    overlay.$(".tpl-fechar").addEventListener("click", overlay.fechar);
  }

  function abrir() {
    /* MENOS CLIQUES: antecipe aqui. Se der para ler algo da tela do
     * atendimento e ja preencher, faca — nao espere o medico digitar.
     * O nucleo entrega isso pronto:
     *     var paciente = d.dom.lerPaciente();
     *     // { nome, cpf, nascimentoBR, nascimentoISO, nomeDaMae, telefone, sexo }
     */
    overlay.abrir();
  }

  raiz.MeedsSuite.registerModule({
    /* TROQUE: identificador curto, sem acento e sem espaco. Namespaceia
     * o armazenamento do modulo — nao mude depois de publicado. */
    id: "template",

    /* TROQUE: nome e descricao aparecem no painel da engrenagem.
     * A descricao e uma frase, em portugues claro, dizendo o que a
     * funcao faz para o MEDICO — nao como ela funciona por dentro. */
    nome: "Módulo modelo",
    descricao: "TROQUE: uma frase explicando o que esta função faz.",
    versao: "1.0.0",

    /* Preferencias do medico (nao dado de paciente). Chegam mescladas em
     * deps.config e voce grava com deps.storage.gravarConfig(). */
    configPadrao: {},

    /* Botao no dock. Use null se o modulo nao precisar de botao.
     * prioridade: MENOR = mais embaixo na pilha. As atuais vao de 10 em
     * 10 (alarme 10, APAC 20, Sete Lagoas 30, CMD 40, REMUME 50), entao
     * um numero como 25 ou 60 encaixa sem renumerar ninguem. */
    botao: {
      icone: "🧩",
      rotulo: "TROQUE: texto do botão",
      titulo: "TROQUE: o que aparece ao passar o mouse",
      prioridade: 60,
      // variante: "icone",  // use para botao redondo, so com o icone
    },

    /* Chamadas de rede que voce quer ouvir. O nucleo ja intercepta tudo
     * uma vez; aqui voce so diz o que lhe interessa. Deixe [] se nao
     * precisar. */
    assinaturasRede: [
      // { regex: /\/api\/v1\/Atendimento\/[0-9a-fA-F-]{36}/i, metodos: ["GET"] },
    ],

    /* Chega uma resposta que casou com as assinaturas acima.
     * evt = { url, metodo, status, corpo, json() } */
    aoCargaRede: function (evt) {
      if (evt.status !== 200) return;
      var dados = evt.json();
      if (!dados) return;
      // TROQUE: o que fazer com a resposta
    },

    /* Chamado quando o modulo e habilitado (na carga da pagina ou quando
     * o medico liga a chave no painel). */
    start: function (deps) {
      d = deps;
      montarUI();
      deps.aoClicarBotao(abrir);

      /* Se o seu modulo usa a lista de medicos, o nucleo monta o <select>
       * para voce — inclusive o "cadastrar medico" e a selecao automatica
       * quando ha um so cadastrado:
       *
       *   var seletor = deps.cadastro.montarSelect(elemento, {
       *     aoEscolher: function (ficha) { ... },
       *     aoPedirCadastro: function () { deps.abrirCadastro(); },
       *   });
       *   deps.aoMudarCadastro(function () { seletor.atualizar(); });
       */

      // timers.push(setInterval(algumaCoisa, 4000));
    },

    /* Chamado quando o medico desliga o modulo no painel. Tem que deixar
     * a tela como se o modulo nunca tivesse rodado — sem isso, o modulo
     * continua "meio ligado" depois de desligado. */
    stop: function () {
      timers.forEach(clearInterval);
      timers = [];
      if (overlay) {
        overlay.remover();
        overlay = null;
      }
      d = null;
    },
  });
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
