# Módulo Alarme de Fila

Documentação técnica de `modules/alarme-fila/index.js`. Escrita para quem vai
manter o módulo, não para o médico que o usa — o texto voltado ao usuário está
em `docs/manual/Assistente-Meeds-Manual.pdf`.

---

## Visão geral do Assistente Meeds

O Assistente Meeds é um userscript único que o médico instala uma vez e que
reúne todas as funções da suíte. Ele não é um conjunto de scripts soltos: o
`manifest.json` é a fonte de verdade do que existe, e `scripts/build.js` embute
núcleo, módulos e dados num só arquivo distribuível. O carregamento remoto de
código está desligado por decisão de arquitetura (D1): buscar e executar
JavaScript remoto num sistema que exibe dado de paciente seria abrir uma
superfície de execução remota que nada aqui justifica. O que se atualiza sem
redeploy são dados — seletores, REMUMEs, CID-10 —, nunca código.

O arquivo que o médico instala é o `bootloader.user.js` compilado. Ele roda em
`document-start`, respeita a trava de frame antes de qualquer outra coisa,
instala o hook único de rede do núcleo e então registra os módulos habilitados.
Cada módulo é independente e nunca nomeia outro: a comunicação entre eles passa
por um barramento de eventos. Essa regra não é estilística — `scripts/build.js`
falha a compilação quando um módulo referencia outro diretamente.

A distribuição sai em duas variantes do mesmo corpo, idênticas byte a byte
exceto pelo cabeçalho: `dist/meeds-suite.user.js` para Tampermonkey no
Windows, Mac e Android, e `dist/meeds-suite.safari.user.js` para o app
Userscripts no Safari do iPad, iPhone e Mac. A variante do Safari roda com
`@grant none`, o que muda onde as preferências são guardadas — ver a seção de
compatibilidade adiante.

## Por que o alarme existe, e por que ele é o módulo mais delicado da suíte

O Pronto Atendimento do Meeds funciona por atração: o paciente entra na fila e
aguarda que algum médico olhe a tela e o puxe. Isso significa que parte do tempo
de espera não é falta de médico, é falta de aviso — existe fila acontecendo com
plantonista logado, disponível e com a atenção em outra janela, seja no Memed,
seja num laudo, seja em outra aba do próprio Meeds. O alarme ataca exatamente
essa lacuna.

Ele é delicado porque um alarme errado é pior que nenhum. Um alarme que anuncia
paciente que não está esperando ensina o médico a ignorá-lo; um que mostra um
número diferente do que está na tela destrói a confiança na suíte inteira; e um
que toca sem parar é desligado no primeiro plantão movimentado, levando junto o
aviso que importava. Todas as três coisas já aconteceram nesta base de código, e
cada uma virou um teste automatizado que não se remove.

## Como o módulo se integra ao núcleo

O módulo declara ao núcleo, no registro, a assinatura de rede que lhe interessa
— chamadas `GET` para `/api/v1/Atendimento?` — e recebe as respostas pelo hook
único do núcleo. Ele não instala hook próprio e não faz requisição alguma: só
observa o tráfego que a própria aplicação já produz, dentro da sessão legítima
do médico. Essa é a fronteira que sustenta a promessa de que a extensão não
consulta agenda de outro profissional nem contorna autorização.

A entrada do módulo no `manifest.json` traz `prioridadeBotao`, que é como a
suíte ordena os botões da barra sem que nenhum módulo saiba da existência dos
outros nem precise se posicionar na tela. Nenhum botão usa posicionamento
absoluto; o núcleo é quem monta a barra a partir dessa prioridade. O painel de
ajustes segue o mesmo padrão: o módulo entrega o conteúdo, e o núcleo o
apresenta dentro da engrenagem, no mesmo Shadow DOM que todos compartilham.

O aviso fora da aba não é do módulo: ele vem de `core/atencao.js`, que é a
escada de atenção compartilhada — contador no título, distintivo no favicone,
notificação do sistema, `Wake Lock` e detecção de aba suspensa. O módulo decide
*quando* avisar; o núcleo decide *onde*. Essa separação é o que permitiu, por
exemplo, corrigir o comportamento da janela de aviso no iPad sem tocar no
alarme.

## Como o código funciona

A pergunta central do módulo é enganosamente simples: há alguém esperando? A
resposta vem da fusão de três sinais independentes, porque nenhum deles é
confiável sozinho.

O primeiro sinal é a rede. O módulo lê as listas de atendimento que a aplicação
busca e mantém, por assinatura de chamada, um mapa dos identificadores vistos e
de quando cada um apareceu pela primeira vez. Aqui mora a correção mais
importante da história do módulo: a tela de monitoramento do administrador abre
várias vistas da mesma fila, com filtros diferentes, e o mesmo paciente aparece
em mais de uma. Somar as vistas contava a mesma pessoa duas ou três vezes.
Passou-se a usar a união dos identificadores, e assinaturas que param de ser
atualizadas são esquecidas depois de dois minutos, para que o número não cresça
indefinidamente conforme o médico troca de filtro.

Ainda no primeiro sinal, nem toda lista de atendimento é a fila de espera. Uma
chamada com `ProfissionalId` é "meus atendimentos", não a fila, e uma chamada
que pede dois estados ao mesmo tempo é uma lista mista. O módulo só aceita a
chamada que pede exclusivamente o estado de aguardando, e o teste que fixa isso
usa endereços reais capturados em gravação de sessão, inclusive os casos em que
o valor do estado é `12` ou `20` e não pode ser confundido com `2`.

O segundo sinal é o aviso que a própria aplicação emite na tela, observado por
`MutationObserver`. O terceiro é o cartão "Aguardando" do painel, lido
periodicamente do DOM. Quando o cartão está visível e fresco, é ele que manda:
discordar do número que o médico está lendo na frente dele destrói a confiança
no alarme inteiro, mesmo quando o número do alarme é o mais correto dos dois.

Definido que há alguém esperando, o módulo decide o quanto incomodar. São três
intensidades, cicladas no próprio botão, à maneira do botão de som do Waze. No
modo silencioso, só o contador na aba e no favicone — para quem está em consulta
e não pode ser interrompido, mas quer ver a fila crescer. No modo discreto, um
cartão no canto com o município de origem e um som curto, que aparece e sai
sozinho. No modo completo, a sirene repetindo, a faixa no topo e a moldura na
borda, até alguém silenciar. A escada de atenção vale nas três, porque ela é
sobre onde avisar, não sobre o quanto incomodar.

A biblioteca de sons é sintetizada em `AudioContext`, sem nenhum arquivo de
áudio embarcado, e é dividida por um campo `curto`: as sirenes foram feitas para
repetir e soam truncadas se tocadas uma vez só, enquanto os toques únicos têm
começo, meio e fim em menos de um segundo. Todos sobem o ganho a partir de zero
em alguns milissegundos e descem quase a zero antes de parar o oscilador; sem
essa rampa o navegador produz um estalo audível no início e no fim, o que num
fone de plantão noturno é pior que o alarme. O contexto de áudio só é criado e
destravado a partir de um clique do médico, porque navegador nenhum permite som
sem gesto do usuário — e alguns punem a tentativa.

Três travas de segurança fecham o comportamento. O som para sozinho depois de
dois minutos, mesmo que ninguém silencie. Depois de silenciado, o alarme só
volta a tocar cinco minutos depois, e apenas se a fila continuar ocupada. E há
um teto de disparos por janela de tempo, porque alarme que pisca sem parar vira
ruído, e ruído é desligado.

## Privacidade

A regra da suíte é que nenhum dado de paciente vai para disco, e o alarme vai
além dela: desde a v2.33.2, o módulo **não lê** o nome do paciente. Até a
versão anterior ele o procurava em cinco caminhos plausíveis da resposta e o
guardava em memória, embora o cartão discreto já mostrasse apenas o município. A
leitura sobrou de uma decisão de produto anterior e ficou sem uso.

Dado de paciente que ninguém exibe ainda assim custa: ele vive numa variável de
módulo enquanto a aba estiver aberta e reaparece em despejo de memória, em
depurador e em qualquer relatório de erro. Dizer que "está em memória, não em
disco" é uma atenuante, não o cumprimento da regra. O que o módulo retém da
chegada é o município — que não é dado clínico e sustenta uma decisão real do
médico, porque é ele que diz qual REMUME e qual laudo valem para aquele
atendimento.

Um teste em `tests/fila-contagem.test.js` alimenta a fila com uma resposta que
traz o nome em todos os caminhos que o módulo já tentou e varre recursivamente o
que ele reteve atrás dessa string. Se alguém reintroduzir a leitura, em qualquer
nível da ficha, a verificação quebra.

A notificação do sistema merece nota à parte: ela sai do navegador e para na
central de notificações e na tela de bloqueio do computador, que é o pior lugar
possível para nome de paciente. Ela carrega quantidade e tempo de espera, nunca
identificação.

## Compatibilidade

O módulo roda idêntico nas duas variantes de build, e nenhuma função dele chama
`GM_*` diretamente. Toda persistência passa por `MeedsSuiteStorage.duravel()`,
que usa `GM_setValue` quando existe — no Tampermonkey — e cai para IndexedDB
quando não existe, que é o caso do Safari com `@grant none` (decisões D38 e
D42). O `localStorage` é apenas último recurso, porque o logout do Meeds o
limpa, e uma preferência que some no logout é uma preferência que o médico
reconfigura toda semana.

Duas diferenças de plataforma estão tratadas explicitamente. No Safari do iOS,
`window.open` existe mas não abre janela separada — o iOS abre uma aba, por cima
do Meeds, e apenas a partir de um gesto. Por isso a opção de janela de aviso é
oferecida como indisponível ali, com a explicação no lugar da instrução de
desktop, que mandaria o médico procurar um ícone de pop-up bloqueado que no iPad
não existe (decisão D33). E a prévia de PDF, de outro módulo, é desligada no
iPad pelo mesmo tipo de razão.

O módulo também sobrevive à suspensão de aba, que Edge e Chrome fazem de fábrica
em guias de fundo. O núcleo pulsa a cada trinta segundos e, quando percebe que o
relógio saltou muito além disso, avisa que a aba ficou congelada — para o médico
saber que pode ter perdido aviso, em vez de concluir que o alarme falhou.

## Como testar

A verificação completa roda com `npm run verificar`. Ela compila o pacote em
modo de checagem, valida a sincronia dos dados derivados e executa a bateria de
testes automatizados, incluindo os do alarme. Nenhuma dependência externa é
necessária: o projeto não tem `dependencies` nem `devDependencies`, roda em
Node 14 ou superior e usa apenas a biblioteca padrão. Manter isso assim é
deliberado — uma suíte que exibe dado de paciente não deve arrastar uma árvore
de pacotes de terceiros para tocar um som.

Para rodar só o que diz respeito ao alarme, `npm run teste-contagem` cobre a
contagem da fila e a privacidade da chegada, e `npm run teste-atencao` cobre a
escada de avisos, incluindo o comportamento no iPad. O `npm run build` gera as
duas variantes e imprime um resumo com versão, módulos e tamanho.

A verificação manual usa `tests/smoke.html`, servido por HTTP — abrir o arquivo
direto do disco não reproduz o ambiente. A página tem um roteiro de cenas
acionado por `?cena=`, com estados prontos do alarme: `alarme-ajustes`,
`alarme-completo` e `alarme-discreto`. É o mesmo roteiro que
`scripts/capturar-telas.sh` usa para gerar as imagens do manual, o que garante
que as telas do PDF são o produto de verdade e não uma reconstrução.

No produto real, o caminho mais rápido é abrir a tela de monitoramento com o
alarme ligado, conferir que o contador da aba bate com o cartão "Aguardando", e
trocar o filtro de período algumas vezes para verificar que o número não cresce
sozinho — esse era exatamente o defeito antigo. Depois vale silenciar o alarme e
confirmar que ele não volta antes dos cinco minutos, e trocar as três
intensidades no botão para ouvir a diferença entre o som que repete e o som que
toca uma vez.

---

## Checklist antes de commitar

- [ ] `npm run verificar` passa por inteiro, sem teste pulado
- [ ] `npm run build` roda e o resumo mostra a versão esperada
- [ ] As duas variantes foram geradas e a do Safari não perdeu `@grant none` nem `@inject-into auto`
- [ ] `manifest.json` teve a versão ajustada, e `dados/changelog.json` ganhou o bloco correspondente no topo
- [ ] O texto do changelog está escrito para o médico — o que mudou na tela dele, não o que mudou no código
- [ ] Nenhuma chamada direta a `GM_*` foi introduzida; toda persistência passa por `MeedsSuiteStorage`
- [ ] Nenhum dado de paciente é lido, retido ou enviado; o teste de privacidade da chegada continua passando
- [ ] `carregamentoRemotoDeCodigo` continua `false` e nenhuma dependência nova entrou no `package.json`
- [ ] Nenhum módulo referencia outro pelo nome; a comunicação continua pelo barramento de eventos
- [ ] Nenhum botão foi posicionado de forma absoluta; a ordem vem de `prioridadeBotao`
- [ ] Regras de CSS novas estão escopadas ao módulo, sem seletor de elemento solto que vaze pelo Shadow DOM compartilhado
- [ ] O comportamento foi conferido em `tests/smoke.html` servido por HTTP, nas três intensidades
- [ ] Se houve mudança de comportamento visível, a cena correspondente foi recapturada e o manual regenerado
- [ ] Se a mudança afeta iPad, foi verificada na variante Safari e não só no Tampermonkey
