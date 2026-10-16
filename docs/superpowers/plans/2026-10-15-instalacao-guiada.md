# Página de instalação guiada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Entregar uma página estática que guie o médico até a instalação do Assistente, adequada ao dispositivo e com ajuda contextual.

**Architecture:** HTML semântico com alternativa sem JavaScript, CSS local e scripts clássicos sem dependências. Separar conteúdo e regras de navegação da integração com o DOM para testar transições em Node. Hospedagem prevista no GitHub Pages; disponibilização pública depende de verificar as configurações existentes.

**Tech Stack:** HTML, CSS, JavaScript, Node 20, `node:assert/strict`, `node:vm`, ESLint existente e Python para servidor HTTP local.

**Spec:** `docs/superpowers/specs/2026-10-15-instalacao-guiada-design.md` — aprovada pelo usuário no chat após o commit `d41b17a`.

## Global Constraints

- Usar o checkout existente em `/workspace/meeds-suite`; não criar worktree.
- “Página estática em português, sem framework, backend, conta ou formulário de dados pessoais.”
- “Sem CDN, fontes externas, rastreadores ou dependências de execução.”
- “Não alterar o funcionamento, o build, os pacotes ou o armazenamento do userscript.”
- “Botões com área de toque mínima de 44px, foco visível, contraste adequado e HTML semântico.”
- “User agent e heurística de iPad com interface de desktop são sugestões, não provas.”
- “Nenhuma tela deve alegar” instalar extensões, conceder permissões, detectar com segurança o gerenciador ou inspecionar o Meeds em outra origem.
- Publicação e instalação em aparelhos reais têm resultados separados dos testes da página.
- Não adicionar dependências npm nem alterar manifest, lockfile ou pacotes de distribuição. Seguir o limite de 350 linhas por arquivo e as regras existentes de lint.

## Review Focus

- Link com estado adulterado: ignorar valores desconhecidos; nunca inserir entrada da URL como HTML (Tarefas 1 e 3).
- Reabrir uma URL de conclusão: pedir confirmação novamente; não alegar instalação verificada (Tarefas 1 e 3).
- iPad identificado como Mac ou navegador desconhecido: sugestão corrigível, seleção explícita antes do roteiro (Tarefas 1 e 3).
- Voltar da loja ou abrir pelo WhatsApp: manter etapa compartilhável e oferecer cópia do link sem depender de API de clipboard (Tarefas 2 e 3).
- Bloqueio de JavaScript ou hospedagem em subdiretório: instruções básicas e recursos locais continuam acessíveis (Tarefas 2 e 4).

## Arquivos e responsabilidades

Criar `docs/instalar/index.html`, `styles.css`, `conteudo.js`, `fluxo.js` e `app.js`. Os dois arquivos extras em relação à lista inicial da spec separam textos e transições do DOM; continuam scripts locais, sem módulos npm ou compilação. `conteudo.js` publica `window.MeedsInstalacaoConteudo`; `fluxo.js` publica `window.MeedsInstalacaoFluxo`; `app.js` inicializa a interface. Carregar os três nessa ordem, com `defer`.

Criar `tests/instalacao-guiada.test.js` para regras de comportamento em Node e `docs/instalar/VALIDACAO.md` para fontes oficiais, testes visuais, limites e instruções de hospedagem. Acrescentar execução do teste ao workflow existente, sem mudar `package.json`. Referenciar a página nos três guias somente após confirmar o destino da publicação, ou usar links relativos locais com identificação clara de que a página ainda aguarda hospedagem.

### Tarefa 1: Roteiros por plataforma e estado de navegação

**Files:** criar `docs/instalar/conteudo.js`, `docs/instalar/fluxo.js`, `tests/instalacao-guiada.test.js`, `docs/instalar/VALIDACAO.md`.

**Interfaces:**

- `MeedsInstalacaoConteudo.roteiros`: mapa por chave `chrome`, `edge`, `firefox`, `ios`, `android`, `outro`; etapas com `{id, titulo, texto, links, ajuda}`. Links são objetos `{rotulo, href}` com destinos fixos, nunca fornecidos pela URL.
- `MeedsInstalacaoFluxo.sugerir(userAgent: string, maxTouchPoints: number): 'computador'|'ios'|'android'|null`.
- `lerEstado(hash: string): {plataforma: string|null, navegador: string|null, etapa: string}` e `serializarEstado(estado): string` usam fragmento com chaves fixas. Plataformas: `computador`, `ios`, `android`; navegadores: `chrome`, `edge`, `firefox`, `outro` ou null; etapas pertencem ao roteiro escolhido, iniciando em `escolha` quando inválidas.
- `transicionar(estado, acao): estado` aceita ações `{tipo:'escolher', plataforma, navegador}`, `{tipo:'avancar'}`, `{tipo:'voltar'}`, `{tipo:'trocar'}` e `{tipo:'confirmar'}`. Etapas finais `conferir` e `concluido`; somente `confirmar` em `conferir` alcança `concluido`. Serializar conclusão como `conferir`.

- [x] **1. Conferir fontes oficiais:** consultar Tampermonkey, Userscripts e documentação dos navegadores para links de lojas e permissões. Testar via HTTPS os dois arquivos raw e o asset de release. Registrar data, fonte e resultado em `VALIDACAO.md`, sem marcar como instalação real. Se o asset não existir, omitir o botão alternativo e explicar a limitação. Android sem aparelho fica explicitamente “ainda não validado em aparelho”; orientar navegador com suporte documentado, sem prometer suporte do Chrome comum.
- [x] **2. Escrever testes que falham:** carregar os scripts em `vm` e usar `assert` para as regras abaixo. O teste deve retornar código diferente de zero em falha, como os testes existentes.

```js
assert.equal(fluxo.sugerir('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 5), 'ios');
assert.equal(fluxo.sugerir('unknown', 0), null);
assert.equal(fluxo.lerEstado('#plataforma=alien&etapa=<script>').etapa, 'escolha');
assert.equal(fluxo.lerEstado('#plataforma=ios&etapa=concluido').etapa, 'conferir');
const conferir = {plataforma:'ios', navegador:null, etapa:'conferir'};
assert.equal(fluxo.transicionar(conferir, {tipo:'avancar'}).etapa, 'conferir');
assert.equal(fluxo.transicionar(conferir, {tipo:'confirmar'}).etapa, 'concluido');
assert.equal(fluxo.transicionar(conferir, {tipo:'trocar'}).etapa, 'escolha');
```

Adicionar casos para permissões separadas Chrome/Edge, ausência dessas instruções em Firefox, pacote `.safari.user.js` exclusivo de iOS, transições de ida/volta por todos os roteiros, preservação da seleção no round-trip da URL, parâmetros duplicados/malformados e impossibilidade de saltar à conclusão com seleção incompleta. Parâmetros duplicados invalidam o estado; codificação malformada não lança exceção.

- [x] **3. Executar:** `node tests/instalacao-guiada.test.js`. Esperado: falha por arquivo ou interface ausente, antes da implementação.
- [x] **4. Implementar as interfaces:** roteiros usam os links fixos da spec e as fontes verificadas. Chrome e Edge têm uma etapa de permissão separada; iOS separa app, ativação, permissão, instalação e conferência. Android exige confirmação do navegador compatível antes de oferecer o script e exibe o status de validação. `outro` orienta escolher um navegador com roteiro, sem oferecer pacote automaticamente. Usar somente listas permitidas para ler a URL.
- [x] **5. Executar teste e lint:** `node tests/instalacao-guiada.test.js` e `npx --no-install eslint docs/instalar tests/instalacao-guiada.test.js --quiet`. Esperado: ambos código 0, com testes realmente executados.
- [x] **6. Commit:** `feat: define roteiros e navegacao da instalacao guiada`.

### Tarefa 2: Estrutura acessível e alternativa sem JavaScript

**Files:** criar `docs/instalar/index.html`, `docs/instalar/styles.css`; ampliar `tests/instalacao-guiada.test.js`.

**Interfaces:** HTML oferece `#titulo-etapa` com `tabindex="-1"`, `#progresso` com `aria-live="polite"`, `#conteudo-etapa`, `#ajuda-etapa` e controles de ação com `data-acao`. Resumo sem JavaScript e guias existentes ficam visíveis até a inicialização bem-sucedida de `app.js`. Imagem do dock usa caminho relativo `../manual/telas/instalacao-dock.png`.

- [x] **1. Escrever teste que falha:** conferir que o HTML inclui título português, resumo inicial com links GitHub para os dois guias Markdown, PDF relativo, e scripts e CSS locais. Incluir teste de resolução dos recursos locais contra a base `https://example.test/meeds-suite/instalar/`: todos devem permanecer sob `/meeds-suite/`.
- [x] **2. Rodar:** `node tests/instalacao-guiada.test.js`; esperado falhar pela ausência do HTML.
- [x] **3. Implementar:** página de uma coluna, fundo claro, verde do guia, tamanho de texto legível, alvos de 44px, foco explícito, sem altura fixa que corte textos. Controles sem ação antes de JS não aparecem. Incluir seleção de aparelho, navegador e sugestão confirmável; navegação e ajuda serão conectadas pela Tarefa 3. Fornecer links locais de leitura dos guias usando URLs GitHub absolutas quando o Markdown não for renderizado pelo servidor estático. Não copiar a antiga contagem de funções ou APAC ativa. Conferir visualmente a imagem do dock antes de usá-la.
- [x] **4. Verificar:** executar teste e servir `/workspace/meeds-suite/docs` com `python3 -m http.server 8732 --bind 127.0.0.1`. Requisitar `/instalar/` e cada recurso; código 200 e conteúdo correspondente. Inspecionar sem JS e em larguras 360, 768 e 1280px; textos e links devem ser utilizáveis, sem rolagem horizontal.
- [x] **5. Commit:** `feat: adiciona pagina acessivel de instalacao`.

### Tarefa 3: Interface interativa e ajuda contextual

**Files:** criar `docs/instalar/app.js`; ampliar `tests/instalacao-guiada.test.js`; atualizar HTML e CSS se necessário.

**Interfaces:** `MeedsInstalacaoApp.iniciar(documento, janela): void` liga DOM e interfaces da Tarefa 1. Inicializar uma única vez após os scripts deferidos. Renderizar textos com `textContent`, links com URLs do catálogo e atributos controlados. Estado da conclusão vive só em memória; fragmento guarda no máximo `conferir`.

- [x] **1. Escrever teste que falha:** executar `iniciar` em DOM simulado mínimo via `vm`, com eventos de seleção e clique. Conferir que a sugestão não escolhe plataforma, abrir instalação não conclui, “Ainda não” abre ajuda, “Sim” em conferência conclui, Voltar preserva seleção, trocar aparelho reinicia, e `hashchange` não injeta HTML nem restaura conclusão. Testar ausência/rejeição da API de clipboard: mostrar endereço selecionável, sem mensagem falsa de cópia. O DOM simulado testa eventos; não substitui testes de foco/layout em navegador.
- [x] **2. Rodar:** `node tests/instalacao-guiada.test.js`; esperado falhar antes de criar `app.js`.
- [x] **3. Implementar:** renderização dos roteiros, histórico de fragmentos e restauração em `hashchange`; foco no título e progresso textual ao navegar. Ajuda contém as situações da spec e se expande sem apagar escolhas. Links externos com `target="_blank"`, `rel="noopener noreferrer"` e aviso de nova aba. Endereços internos têm cópia com alternativa selecionável. Mostrar instrução de abrir no navegador em vez de navegador interno; não tentar forçar abertura por esquemas não verificados. Na conclusão usar exatamente “Você confirmou que o Assistente apareceu”. Não adicionar botão que escolha um perfil Meeds em nome do médico.
- [x] **4. Verificar:** teste Node, lint e navegador real disponível. Percorrer computador Chrome/Edge/Firefox, iOS e Android; teclado completo, foco após troca, ajuda, histórico, reload, clipboard indisponível e retorno da loja. Registrar navegador utilizado e limitações de emulação em `VALIDACAO.md`.
- [x] **5. Commit:** `feat: conecta passos e ajuda da instalacao guiada`.

### Tarefa 4: Integração, hospedagem e validação final

**Files:** modificar `.github/workflows/ci.yml`, `README.md`, `docs/GUIA-INSTALACAO.md`, `docs/GUIA-IPAD.md`, `docs/instalar/VALIDACAO.md`. Configuração externa de Pages é separada de alterações locais.

**Interfaces:** novo passo do job `verificar` executa `node tests/instalacao-guiada.test.js` depois de `npm ci`. Comando existente `npm run verificar` permanece intacto. Destino local da página: `docs/instalar/index.html`.

- [x] **1. Conferir hospedagem em modo leitura:** consultar configurações de Pages e visibilidade com ferramentas GitHub autorizadas, quando disponíveis. Usar autenticação injetada; ausência de token explícito não prova falta de acesso. Inspecionar também CNAME, index existente e workflows. Se configuração não estiver acessível, registrar “hospedagem não verificada” e continuar toda a validação local.
- [x] **2. Integrar:** acrescentar o teste ao CI; inserir nos três guias um atalho relativo para a página, mantendo os roteiros atuais como alternativa. Sem destino público confirmado, identificar o atalho como página no repositório e não anunciar site publicado. Registrar instrução preferencial para Pages servir `/docs`, sem substituir um site existente. Se a configuração existente exigir workflow de publicação, registrar a configuração encontrada e propor a integração concreta antes de alterar o mecanismo de deploy; isso não bloqueia entregar a página local.
- [x] **3. Executar:** `export PATH=/workspace/.cloud-tools/node_modules/.bin:$PATH`; `node tests/instalacao-guiada.test.js`; `npm run verificar`; `git diff --check`. Esperado: testes executados, código 0 e nenhum arquivo de userscript/dist/lockfile modificado. Fazer revisão do diff contra o escopo.
- [x] **4. Verificar pelo servidor:** montar a pasta docs sob `/meeds-suite/` em um diretório temporário e servir por HTTP. Percorrer a página e recursos em `/meeds-suite/instalar/` para validar o subdiretório, inclusive caminhos do PDF e imagem; não criar links de preview localhost para o usuário. Registrar resultados das larguras 360, 768 e 1280px, teclado, JS desabilitado, URLs externas e navegadores realmente utilizados.
- [x] **5. Registrar a matriz de evidências:** separar testes Node, página no navegador, emulação móvel e instalação real com extensão. Sem acesso a aparelhos, marcar iOS/Android como não validados em aparelho, manter isso na página e não alegar resultado completo. Pedir teste real somente quando toda tarefa independente estiver concluída.
- [x] **6. Commit:** `docs: integra guia de instalacao e registra validacao`.
- [ ] **7. Entregar:** arquivos e testes, limitações concretas e configuração exata necessária para hospedar. Publicar apenas dentro da autorização do usuário e da disponibilidade de acesso. Se publicado, testar a URL resultante antes de compartilhá-la como operacional.

## Ordem e revisão

Executar 1 → 2 → 3 → 4; as interfaces são compartilhadas e as tarefas dependem umas das outras. Revisão final deve conferir que atalhos por URL não fingem instalação, Android tem indicação honesta de compatibilidade e os caminhos funcionam sob o prefixo do repositório. Não executar build que regrave os userscripts nesta mudança de documentação e página estática.

## Auto-revisão do plano

Cobertura conferida: seleção, permissões, variantes de pacote, alternativa Apple, ajuda, atualização, confirmação humana, acessibilidade, estado na URL, ausência de JS, fontes externas e Pages possuem tarefas explícitas. Os cinco riscos de Review Focus têm testes ou verificação de navegador nas tarefas correspondentes. As novas interfaces usam scripts clássicos para respeitar o ESLint existente. Testes de layout e instalação real permanecem separados das asserções em Node.
