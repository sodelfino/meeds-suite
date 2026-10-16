/* Integração DOM. Não consulta o Meeds nem tenta detectar extensões. */
(function (raiz) {
  'use strict';
  function iniciar(doc, janela) {
    const guia = doc.getElementById('guia');
    if (!guia || guia.inicializado) return;
    const fluxo = janela.MeedsInstalacaoFluxo;
    const conteudo = janela.MeedsInstalacaoConteudo;
    if (!fluxo || !conteudo) return;
    const el = id => doc.getElementById(id);
    const corpo = el('conteudo-etapa');
    const acoes = el('acoes');
    const titulo = el('titulo-etapa');
    const ajuda = el('ajuda-etapa');
    let estado = fluxo.lerEstado(janela.location.hash);
    let escolhendoNavegador = false;
    function criar(tag, texto, classe) {
      const node = doc.createElement(tag);
      if (texto) node.textContent = texto;
      if (classe) node.setAttribute('class', classe);
      return node;
    }
    function botao(texto, executar, classe) {
      const node = criar('button', texto, classe || 'botao');
      node.setAttribute('type', 'button');
      node.addEventListener('click', executar);
      return node;
    }
    function externo(destino, classe) {
      const node = criar('a', destino.rotulo, classe || 'botao');
      node.setAttribute('href', destino.href);
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
      node.setAttribute('aria-label', destino.rotulo + ' (abre em nova aba)');
      return node;
    }
    function copiar(texto, destino) {
      const grupo = criar('div', '', 'endereco');
      const label = criar('label', destino ? 'Endereço das extensões do navegador' : 'Link deste passo a passo');
      const input = criar('input');
      const id = destino ? 'endereco-extensoes' : 'endereco-guia';
      input.setAttribute('id', id);
      input.setAttribute('readonly', '');
      input.setAttribute('type', 'text');
      input.value = texto;
      label.setAttribute('for', id);
      const aviso = criar('p', '', 'nota');
      aviso.setAttribute('role', 'status');
      function manual() {
        input.focus(); input.select();
        aviso.textContent = 'Selecione e copie o endereço acima.';
      }
      const copiarBotao = botao('Copiar endereço', function () {
        if (!janela.navigator.clipboard || !janela.navigator.clipboard.writeText) return manual();
        janela.navigator.clipboard.writeText(texto).then(function () {
          aviso.textContent = 'Endereço copiado.';
        }).catch(manual);
      }, 'botao secundario');
      grupo.append(label, input, copiarBotao, aviso);
      return grupo;
    }
    function salvar() {
      const hash = fluxo.serializarEstado(estado);
      if (janela.location.hash !== hash) janela.history.pushState(null, '', hash || janela.location.pathname + janela.location.search);
    }
    function agir(acao) {
      estado = fluxo.transicionar(estado, acao);
      escolhendoNavegador = false;
      salvar(); renderizar(true);
    }
    function definirAjuda(textos, referencia, alternativa) {
      const painel = el('ajuda-conteudo');
      painel.replaceChildren();
      for (const texto of textos) painel.append(criar('p', texto));
      if (referencia) painel.append(externo(referencia, 'link-ajuda'));
      if (alternativa) painel.append(externo(alternativa, 'botao secundario'));
      painel.append(copiar(janela.location.href, false));
    }
    function opcao(rotulo, detalhe, simbolo, executar) {
      const node = botao('', executar, 'escolha');
      const icone = criar('span', simbolo, 'simbolo');
      icone.setAttribute('aria-hidden', 'true');
      const texto = criar('span');
      // O nome do botão é o título; o detalhe visual acrescenta contexto.
      const nome = criar('strong', rotulo);
      const descricao = criar('small', detalhe);
      const seta = criar('span', '→', 'seta');
      seta.setAttribute('aria-hidden', 'true');
      texto.append(nome, descricao);
      node.append(icone, texto, seta);
      node.setAttribute('aria-label', rotulo);
      return node;
    }
    function selecionar() {
      const grupo = criar('div', '', 'escolhas');
      if (escolhendoNavegador) {
        titulo.textContent = 'Qual navegador você usa no computador?';
        corpo.append(criar('p', 'Escolha o navegador em que vai abrir o Meeds. A instalação fica disponível somente nele.'));
        for (const [valor, nome, detalhe] of [
          ['chrome', 'Chrome', 'Windows, Mac ou Linux'], ['edge', 'Edge', 'Windows ou Mac'],
          ['firefox', 'Firefox', 'Windows, Mac ou Linux'], ['outro', 'Outro navegador', 'Veja as alternativas disponíveis']
        ]) grupo.append(opcao(nome, detalhe, '◉', () => agir({ tipo: 'escolher', plataforma: 'computador', navegador: valor })));
        acoes.append(botao('Voltar', () => { escolhendoNavegador = false; renderizar(true); }, 'botao secundario'));
      } else {
        titulo.textContent = 'Onde você vai usar o Assistente?';
        corpo.append(criar('p', 'Escolha o aparelho em que você abre o Meeds. Mostraremos apenas os passos para ele.'));
        const sugestao = fluxo.sugerir(janela.navigator.userAgent || '', janela.navigator.maxTouchPoints || 0);
        for (const [valor, nome, detalhe, icone] of [
          ['computador', 'Computador', 'Windows, Mac ou Linux', '▱'],
          ['ios', 'iPhone ou iPad', 'Safari com o app Userscripts', '▯'],
          ['android', 'Android', 'Requer navegador compatível', '▯']
        ]) grupo.append(opcao(nome, detalhe, icone, function () {
          if (valor === 'computador') { escolhendoNavegador = true; renderizar(true); }
          else agir({ tipo: 'escolher', plataforma: valor });
        }));
        if (sugestao) {
          const nomes = { computador: 'computador', ios: 'iPhone ou iPad', android: 'Android' };
          corpo.append(criar('p', 'Parece que você está em um ' + nomes[sugestao] + '. Você pode escolher outro aparelho.', 'sugestao'));
        }
      }
      corpo.append(grupo);
      el('progresso').textContent = 'ANTES DE COMEÇAR';
      el('trilha').hidden = true;
      definirAjuda([
        'Recebeu o link pelo WhatsApp ou outro app? Abra este guia no navegador em que vai usar o Meeds.',
        'Está no celular, mas quer instalar no computador? Abra o mesmo link no computador e escolha essa opção.'
      ]);
    }
    function conclusao() {
      titulo.textContent = 'Você confirmou que o Assistente apareceu';
      el('progresso').textContent = 'PRONTO PARA USAR';
      corpo.append(criar('p', 'A engrenagem é seu ponto de partida: nela você escolhe as funções e encontra o cadastro do médico.'));
      corpo.append(criar('p', estado.plataforma === 'ios'
        ? 'Mantenha o Userscripts ativo. Confira as atualizações no gerenciador; se necessário, volte a este guia e instale a versão mais recente para Safari.'
        : 'O Tampermonkey procura atualizações do Assistente. Você também pode conferir atualizações em ⚙️ → Sobre, dentro do Meeds.'));
      const manual = criar('a', 'Conhecer as ferramentas', 'botao');
      manual.setAttribute('href', conteudo.manual);
      corpo.append(manual);
      acoes.append(botao('Voltar à conferência', () => agir({ tipo: 'voltar' }), 'botao secundario'));
      definirAjuda(['Para instalar em outro navegador ou aparelho, use Trocar aparelho. A instalação deve ser feita em cada navegador em que você usa o Meeds.']);
    }
    function etapaAtual() {
      const passos = fluxo.passos(estado);
      const indice = passos.findIndex(p => p.id === estado.etapa);
      const passo = passos[indice];
      titulo.textContent = passo.titulo;
      el('progresso').textContent = 'PASSO ' + (indice + 1) + ' DE ' + passos.length;
      corpo.append(criar('p', passo.texto));
      const destinos = criar('div', '', 'destinos');
      for (const destino of passo.links) destinos.append(externo(destino));
      if (passo.links.length) {
        corpo.append(destinos, criar('p', 'O link abre em nova aba. Depois, volte aqui para continuar.', 'nota'));
      }
      if (estado.plataforma === 'android' && passo.id !== 'navegador') corpo.append(criar('p', 'Android: roteiro ainda não validado em aparelho.', 'nota'));
      if (estado.plataforma === 'ios') corpo.append(criar('p', 'Este guia orienta o Safari. A instalação desta versão ainda precisa de conferência em iPhone/iPad.', 'nota'));
      if (passo.copiar) corpo.append(copiar(passo.copiar, true));
      if (passo.imagem) {
        const figura = criar('figure');
        const imagem = criar('img');
        imagem.setAttribute('src', passo.imagem);
        imagem.setAttribute('alt', 'Exemplo do Assistente: a engrenagem fica abaixo dos botões das ferramentas, na lateral direita.');
        figura.append(imagem, criar('figcaption', 'Procure a engrenagem. Os outros botões podem variar conforme as funções ligadas.'));
        corpo.append(figura);
      }
      acoes.append(botao('Voltar', () => agir({ tipo: 'voltar' }), 'botao secundario'));
      if (passo.id === 'conferir') {
        acoes.append(botao('Ainda não', () => { ajuda.open = true; ajuda.focus(); }, 'botao secundario'));
        acoes.append(botao('Sim, apareceu', () => agir({ tipo: 'confirmar' })));
      } else if (indice < passos.length - 1) {
        acoes.append(botao(passo.continuar || 'Continuar', () => agir({ tipo: 'avancar' })));
      }
      el('trilha').hidden = false;
      for (let i = 0; i < passos.length; i++) el('trilha').append(criar('span', '', i <= indice ? 'ativo' : ''));
      definirAjuda(passo.ajuda, passo.referencia, passo.alternativa);
    }
    function renderizar(focar) {
      corpo.replaceChildren(); acoes.replaceChildren(); el('trilha').replaceChildren();
      ajuda.open = false;
      el('trocar').hidden = estado.etapa === 'escolha' && !escolhendoNavegador;
      if (estado.etapa === 'escolha') selecionar();
      else if (estado.etapa === 'concluido') conclusao();
      else etapaAtual();
      if (focar) titulo.focus();
    }
    function restaurar() {
      estado = fluxo.lerEstado(janela.location.hash);
      escolhendoNavegador = false;
      renderizar(true);
    }
    el('trocar').addEventListener('click', () => agir({ tipo: 'trocar' }));
    janela.addEventListener('hashchange', restaurar);
    janela.addEventListener('popstate', restaurar);
    renderizar(false);
    el('resumo').hidden = true;
    acoes.hidden = false; ajuda.hidden = false;
    guia.inicializado = true;
  }
  raiz.MeedsInstalacaoApp = { iniciar };
  iniciar(document, raiz);
})(window);
