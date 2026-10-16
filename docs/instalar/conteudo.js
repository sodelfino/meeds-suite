/* Textos e destinos fixos da instalação. Nenhum link vem da URL do visitante. */
(function (raiz) {
  'use strict';
  const base = 'https://raw.githubusercontent.com/sodelfino/meeds-suite/main/dist/';
  const repositorio = 'https://github.com/sodelfino/meeds-suite';
  const link = (rotulo, href) => ({ rotulo, href });
  const etapa = (id, titulo, texto, links, ajuda, extra) =>
    Object.assign({ id, titulo, texto, links: links || [], ajuda: ajuda || [] }, extra);
  const ajudaInstalar = [
    'Apareceu código? Confira se o Tampermonkey está instalado e ativo neste navegador. Volte ao link do Assistente depois de permitir scripts de usuário, se o navegador pedir.',
    'A tela do Tampermonkey abriu? Confirme Instalar. Se já tiver o Assistente, ela pode mostrar Atualizar.',
    'Abriu pelo WhatsApp ou outro aplicativo? Copie o link desta página e abra no navegador em que vai usar o Meeds.'
  ];
  const instalar = etapa('instalar', 'Agora, instale o Assistente',
    'O botão abre o pacote no Tampermonkey. Na tela que abrir, confirme Instalar. Depois, volte aqui para conferir o resultado.',
    [link('Instalar o Assistente', base + 'meeds-suite.user.js')], ajudaInstalar,
    { continuar: 'Já instalei o Assistente' });
  const conferir = etapa('conferir', 'Vamos conferir no Meeds?',
    'Abra o Meeds pelo endereço que você usa normalmente e faça login. Procure a engrenagem do Assistente no canto inferior direito. Ela apareceu?', [], [
      'Ainda na tela de login? Entre no Meeds: os botões só aparecem depois do login.',
      'Confira se a extensão está ligada, tem permissão para o site do Meeds e mostra o Assistente como ativo. Depois, recarregue o Meeds.',
      'No iPhone ou iPad, confira também a permissão do Userscripts para o Meeds no menu de extensões do Safari.',
      'Botões duplicados? Desative os scripts antigos ou a cópia duplicada no gerenciador. Preserve seus cadastros.'
    ], { imagem: '../manual/telas/instalacao-dock.png' });
  const loja = (href) => etapa('extensao', 'Primeiro, instale o Tampermonkey',
    'O Tampermonkey permite que o Assistente funcione dentro do Meeds. Abra a loja do seu navegador, adicione a extensão e confirme a instalação. Depois, volte a esta página.',
    [link('Instalar Tampermonkey', href)], [
      'Não encontrou a extensão? Confira se abriu a loja no mesmo navegador em que vai usar o Meeds.',
      'Se o computador da unidade bloquear extensões, peça à equipe de TI para autorizar o Tampermonkey.'
    ], { continuar: 'Já instalei o Tampermonkey' });
  const permissao = (navegador, endereco) => etapa('scripts', 'Permita executar scripts de usuário',
    'No ' + navegador + ', abra as extensões e os detalhes do Tampermonkey. Ative “Permitir scripts de usuário” se essa opção aparecer. Os nomes podem variar conforme a versão do navegador.', [], [
      'Não encontrou a opção? Confira a orientação oficial do Tampermonkey para sua versão. Em versões que ainda usam esse caminho, a autorização fica no Modo de desenvolvedor da página de extensões.',
      'A chave já está ligada? Você pode continuar. Esta página não consegue conferir as permissões do navegador por você.'
    ], { copiar: endereco, continuar: 'Já autorizei os scripts',
      referencia: link('Consultar orientação do Tampermonkey', 'https://www.tampermonkey.net/faq.php#Q209') });
  raiz.MeedsInstalacaoConteudo = {
    repositorio,
    manual: '../manual/Assistente-Meeds-Manual.pdf',
    roteiros: {
      chrome: [loja('https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo'),
        permissao('Chrome', 'chrome://extensions'), instalar, conferir],
      edge: [loja('https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd'),
        permissao('Edge', 'edge://extensions'), instalar, conferir],
      firefox: [loja('https://addons.mozilla.org/firefox/addon/tampermonkey/'),
        etapa('acesso', 'Confira se a extensão está ativa',
          'Abra o menu de extensões do Firefox e confira se o Tampermonkey está ligado. Se o Firefox pedir uma permissão para funcionar no site do Meeds, autorize para esse site.', [], [
            'O Firefox tem suas próprias permissões. As instruções de scripts de usuário do Chrome e Edge não se aplicam aqui.'
          ]), instalar, conferir],
      ios: [
        etapa('app', 'Instale o app Userscripts',
          'No iPhone ou iPad, vamos usar o Safari com o app Userscripts. Instale o app gratuito, abra uma vez e confira a pasta escolhida para guardar os scripts.',
          [link('Abrir Userscripts na App Store', 'https://apps.apple.com/app/userscripts/id1463298887')], [
            'Procure o app Userscripts, do projeto quoid. O app é o gerenciador; o Assistente será instalado nos próximos passos.'
          ], { continuar: 'Já abri o Userscripts' }),
        etapa('ativar', 'Ligue o Userscripts no Safari',
          'Abra Ajustes → Aplicativos → Safari → Extensões → Userscripts e ative a extensão. Em versões anteriores, o caminho começa em Ajustes → Safari.', [], [
            'Instalar o app não liga a extensão. No Safari, toque no menu de extensões da barra de endereço: Userscripts deve aparecer.'
          ], { continuar: 'Já ativei a extensão' }),
        etapa('permissao', 'Permita o acesso aos sites',
          'Nas permissões do Userscripts, permita o acesso à página do script durante a instalação e ao Meeds durante o uso. Confira essas permissões também no menu de extensões do Safari.', [], [
            'A extensão pode estar ligada e sem acesso ao site. Confira separadamente as duas configurações.',
            'Se o Safari oferecer a opção Todos os sites, ela inclui esses endereços. Você pode revisar as permissões nas configurações da extensão.'
          ], { continuar: 'Já conferi as permissões' }),
        etapa('instalar', 'Instale o Assistente no Safari',
          'O botão pode abrir uma página cheia de código. No Safari, isso é esperado: com essa página aberta, toque no menu de extensões → Userscripts e confirme a instalação. Depois, volte aqui.',
          [link('Abrir Assistente para Safari', base + 'meeds-suite.safari.user.js')], [
            'Apareceu código? Mantenha a página aberta e acesse Userscripts pelo menu de extensões do Safari.',
            'Não ofereceu instalação? Baixe o arquivo alternativo abaixo. No app Arquivos, mova-o para a pasta escolhida no Userscripts. Abra o app para conferir se ele aparece na lista.',
            'Pasta não encontrada? Abra Userscripts → Change Userscripts Directory para conferir ou escolher uma pasta acessível no app Arquivos.',
            'Instalou outra versão? No Userscripts, remova somente o script errado e instale a versão Safari indicada nesta página.'
          ], { continuar: 'Já instalei o Assistente',
            alternativa: link('Baixar arquivo para mover pelo app Arquivos', repositorio + '/releases/latest/download/meeds-suite.safari.user.js') }), conferir
      ],
      android: [
        etapa('navegador', 'No Android, o navegador faz diferença',
          'O Chrome comum no Android não executa as extensões necessárias. O caminho sugerido é usar Firefox para Android com Tampermonkey. Status do roteiro do Assistente: ainda não validado em aparelho; se precisar de um caminho já documentado pelo projeto, use o computador.',
          [link('Conhecer Firefox para Android', 'https://www.mozilla.org/firefox/browsers/mobile/android/')], [
            'Quer instalar no computador? Use Trocar aparelho, no alto da página.',
            'Abriu pelo WhatsApp? Abra este guia no Firefox depois de instalar o navegador.'
          ], { continuar: 'Estou no Firefox para Android' }),
        loja('https://addons.mozilla.org/android/addon/tampermonkey/'), instalar, conferir
      ],
      outro: [etapa('alternativa', 'Vamos escolher um navegador compatível',
        'Este guia tem roteiros para Chrome, Edge e Firefox no computador. No Mac, você também pode usar um deles. Selecione Trocar aparelho e escolha o navegador em que vai abrir o Meeds.', [], [
          'Não é necessário mudar seu navegador padrão: a extensão e o Assistente precisam estar no navegador usado para o Meeds.'
        ])]
    }
  };
})(window);
