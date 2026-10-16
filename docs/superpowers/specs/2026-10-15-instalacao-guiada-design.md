# Página de instalação guiada do Assistente Meeds

Status: aprovada pelo usuário no chat. Página implementada e testada; publicação e validação da instalação em aparelhos reais permanecem pendentes.

## Objetivo e público

Dar aos médicos um único link para instalar o Assistente, com instruções adequadas ao dispositivo e ajuda onde houver dificuldade. O usuário escolheu priorizar instalação em computador, iPhone/iPad e Android. Sucesso significa conseguir chegar à engrenagem do Assistente no Meeds sem precisar escolher arquivos técnicos ou consultar vários guias.

A redução de pedidos de ajuda é um resultado esperado, ainda não medido. A primeira versão não terá analytics; a avaliação com médicos será manual.

## Abordagem

Página estática em português, sem framework, backend, conta ou formulário de dados pessoais. HTML, CSS e JavaScript locais em `docs/instalar/`. Preferir GitHub Pages para hospedagem, desde que disponível e configurado para o repositório. A publicação é uma etapa separada; criar os arquivos não estabelece um site publicado.

Usar o checkout existente. Não alterar o funcionamento, o build, os pacotes ou o armazenamento do userscript. Reutilizar a identidade verde do guia e, onde forem adequadas, as imagens existentes em `docs/manual/telas/`. O guia PDF continua disponível como alternativa.

## Jornada

### 1. Escolher onde vai instalar

Título: “Instale o Assistente Meeds”. Explicação curta: “Vamos mostrar os passos para o seu aparelho.”

Oferecer Computador, iPhone/iPad e Android. Sugerir a plataforma detectada, sem avançar automaticamente. Manter “Trocar aparelho” disponível em todo o fluxo, pois alguém pode abrir o link no celular para instalar no computador. Em computador, pedir Chrome, Edge, Firefox ou Outro. Em Android, apresentar a necessidade de navegador compatível antes de oferecer a instalação.

User agent e heurística de iPad com interface de desktop são sugestões, não provas. Dispositivo desconhecido recebe escolha manual.

### 2. Preparar o navegador

Mostrar uma tarefa por tela, com indicador textual de progresso, Voltar, Continuar e Preciso de ajuda. Abrir lojas e destinos externos por ação explícita, preservando a página do guia.

Computador Chrome/Edge: instalar Tampermonkey pelo destino oficial correspondente; depois orientar a autorização para executar scripts de usuário. Usar os nomes atuais do navegador, conferidos antes de publicar. Endereços internos de configuração devem poder ser copiados, sem depender de links clicáveis.

Firefox no computador: usar instalação e permissões próprias do Firefox; não mostrar instruções de Chrome/Edge.

iPhone/iPad: usar Safari; instalar Userscripts, abrir o app e conferir a pasta; ativar a extensão nas configurações do Safari e permitir acesso aos sites necessários para instalar e usar o Assistente. Explicar separadamente ativação e permissão. Não reutilizar a afirmação antiga de que não existe Tampermonkey para iOS sem verificação atual.

Android: Chrome comum não oferece o caminho de extensão necessário. Orientar a escolha de um navegador suportado, com instruções e links oficiais verificados na implementação. A combinação navegador/gerenciador precisa de teste em aparelho antes de receber indicação de validada. Enquanto não testada, mostrar claramente essa condição e oferecer o caminho de computador; não inventar um roteiro supostamente confirmado.

Navegador interno de WhatsApp e outros apps: orientar a abrir no navegador apropriado. Usar ajuda textual e cópia do link quando a abertura automática não for possível.

### 3. Instalar o Assistente

Computador e Android com configuração compatível: botão “Instalar o Assistente” para `https://raw.githubusercontent.com/sodelfino/meeds-suite/main/dist/meeds-suite.user.js`.

iPhone/iPad: usar apenas `https://raw.githubusercontent.com/sodelfino/meeds-suite/main/dist/meeds-suite.safari.user.js`. Avisar antes que ver código no Safari é esperado; orientar abrir Userscripts pelo menu de extensões e confirmar a instalação.

Alternativa Apple: baixar `https://github.com/sodelfino/meeds-suite/releases/latest/download/meeds-suite.safari.user.js` e mover para a pasta escolhida no Userscripts. Verificar que o asset está disponível antes de publicar o botão. Não presumir que a pasta escolhida será sempre “No meu iPad/Userscripts”.

Botões de avanço devem descrever confirmação humana (“Já instalei”), sem representar detecção automática.

### 4. Conferir no Meeds

Orientar abrir o Meeds usado normalmente pelo médico, entrar e procurar a engrenagem no canto inferior direito. Mostrar a imagem existente do dock após conferir sua adequação à versão atual. Não escolher silenciosamente um perfil de acesso específico nem pedir credenciais.

Perguntar “A engrenagem apareceu?” com Sim e Ainda não. Somente a confirmação explícita do usuário leva à mensagem “Você confirmou que o Assistente apareceu”. Abrir um link ou avançar etapas não prova instalação.

Ao confirmar, explicar brevemente atualizações pelo gerenciador e apontar o manual de uso. A configuração das ferramentas fica fora desta primeira jornada.

### 5. Ajuda contextual

“Preciso de ajuda” revela soluções do passo atual e permite voltar sem perder a escolha do dispositivo:

- Apareceu código: instrução específica por plataforma, incluindo o caminho esperado no Safari.
- Não apareceu a engrenagem: confirmar login, extensão ativa, permissão para o site e script habilitado; recarregar o Meeds.
- Não encontro a extensão: conferir instalação, navegador correto e ativação no Safari.
- Não consigo instalar no Android: explicar compatibilidade e oferecer orientação para computador.
- Aparecem botões duplicados: indicar desativação de scripts antigos e cópias duplicadas, sem apagar cadastro.

Usar as instruções do projeto como base, corrigindo conteúdo desatualizado por confronto com o manifest e fontes oficiais. Não transportar instruções antigas de APAC ou contagens antigas de módulos para a página.

## Interface e acessibilidade

Layout de uma coluna, legível em celular, tablet e computador. Botões com área de toque mínima de 44px, foco visível, contraste adequado e HTML semântico. Navegação completa por teclado. Ao trocar de passo, mover o foco para o título e anunciar o progresso de forma acessível. Não depender somente de cor, ícone ou animação.

Sem CDN, fontes externas, rastreadores ou dependências de execução. Links externos com rótulos claros; se abrirem nova aba, informar isso. JavaScript indisponível deve deixar um resumo utilizável com links para os guias, sem mostrar uma página vazia.

## Estado e limites

Guardar plataforma, navegador e passo apenas na URL usando fragmento ou parâmetros não sensíveis, permitindo retornar após visitar a loja e compartilhar uma etapa. Validar valores contra uma lista fixa; valores desconhecidos voltam à seleção. Trocar de plataforma reinicia o roteiro correspondente. Não armazenar dados pessoais ou estado que alegue instalação concluída.

A página não pode instalar extensões, conceder permissões, detectar com segurança o gerenciador nem inspecionar o Meeds em outra origem. Nenhuma tela deve alegar essas capacidades. Não coletar dados de pacientes ou médicos.

## Arquivos previstos e publicação

- `docs/instalar/index.html`: estrutura, alternativa sem JavaScript e textos principais.
- `docs/instalar/styles.css`: apresentação responsiva e acessibilidade visual.
- `docs/instalar/app.js`: seleção, navegação, detecção sugerida e ajuda contextual.
- Testes focados na navegação e seleção de links, seguindo a infraestrutura que for adequada após inspeção.
- README e guias: referências à página quando seu destino público estiver confirmado.

Antes de definir deploy, conferir visibilidade do repositório, disponibilidade de Pages, configurações existentes e eventual site já publicado. Não substituir um site existente. Se Pages puder usar `/docs`, a página fica no subcaminho `/instalar/`; se exigir workflow, preservar o CI e definir o deploy no plano. Usar caminhos relativos que funcionem em subdiretórios. Não anunciar URL pública nem publicação sem evidência.

## Validação e critérios de aceite

1. Seleção manual de todas as plataformas funciona, inclusive quando a sugestão automática está errada.
2. Chrome/Edge e Firefox recebem instruções próprias; Apple recebe somente o pacote Safari; Android não recebe promessa de suporte no Chrome.
3. Voltar, ajuda, troca de dispositivo, recarregamento e links de etapas mantêm um estado coerente.
4. Link de instalação não marca sucesso; apenas a confirmação de engrenagem visível avança à conclusão.
5. A página é utilizável por teclado e sem JavaScript, e não apresenta rolagem horizontal em larguras móveis usuais.
6. Recursos locais carregam por HTTP sob um subdiretório como o do GitHub Pages; verificar destinos oficiais e downloads sem contornar TLS.
7. Executar `npm run verificar` para detectar regressões do projeto e testes específicos do fluxo implementado.
8. Verificar o fluxo da página em navegador de computador e em tamanhos de celular/tablet. Emulação não substitui instalação real: registrar separadamente a validação em Chrome/Edge, Safari iOS/iPadOS e Android compatível.
9. Só indicar uma plataforma como testada após completar nela extensão, permissão, instalação e confirmação do dock. Suporte ainda não validado deve ser identificado de forma explícita.

## Fora do escopo

Extensão própria, aplicativo nativo, mudanças nas funções clínicas, integração com APIs privadas, alteração dos userscripts, telemetria, cadastro, atendimento por chat e publicação automática sem verificar as configurações do repositório.

## Próxima etapa

O usuário revisa este documento. Após aprovação, elaborar o plano de implementação, incluindo os resultados da verificação de compatibilidade e da hospedagem. Publicação e validação em aparelhos reais terão evidências próprias, distintas dos testes da página.
