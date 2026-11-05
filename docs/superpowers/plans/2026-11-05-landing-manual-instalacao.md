# Landing traz o manual de instalação — plano

Objetivo: a landing `docs/instalar/` (GitHub Pages em https://sodelfino.github.io/meeds-suite/instalar/)
passa a oferecer o guia ilustrado em HTML (`docs/manual/instalacao.html`) como fonte principal
do passo a passo no computador, e a raiz do site deixa de dar 404.

Spec: este plano é a spec (pedido do usuário: "atualizar a landing page trazendo o manual de instalação").

## Global Constraints

- Páginas estáticas, sem build, sem dependências, sem analytics. Texto em pt-BR, tom da landing atual.
- Todos os caminhos relativos devem funcionar sob o prefixo `/meeds-suite/` (Pages de projeto).
- Não alterar `docs/manual/instalacao.html`, PDFs, `core/`, `modulos/`, `dist/`, `package.json`.
- `node tests/instalacao-guiada.test.js` e `npm run verificar` devem passar.
- O PDF continua disponível (secundário). Os guias em markdown no GitHub continuam linkados para iPhone/iPad.

## Task 1: Landing aponta para o guia ilustrado em HTML

Arquivos: `docs/instalar/index.html`, `docs/instalar/conteudo.js`, `tests/instalacao-guiada.test.js`.

1. `docs/instalar/index.html`, cabeçalho: trocar o link
   `<a class="link-manual" href="../manual/Assistente-Meeds-Instalacao.pdf">Prefere o guia em PDF? ...`
   por `<a class="link-manual" href="../manual/instalacao.html">Ver guia ilustrado <span aria-hidden="true">↗</span></a>`.
2. `docs/instalar/index.html`, `nav.guias-basicos`: o primeiro link passa a ser
   `<a href="../manual/instalacao.html">Computador (Chrome e Edge) — guia ilustrado <span aria-hidden="true">↗</span></a>`.
   Manter, nesta ordem, depois dele: o link `GUIA-INSTALACAO.md` com rótulo
   `Computador — guia em texto (inclui Firefox)`, o link `GUIA-IPAD.md` (inalterado) e o link do PDF (inalterado).
3. `docs/instalar/conteudo.js`: exportar `guiaIlustrado: '../manual/instalacao.html'` em
   `MeedsInstalacaoConteudo` (ao lado de `manual`). Na etapa `scripts` (função `permissao`, usada só por
   Chrome e Edge), adicionar `alternativa: link('Ver este passo com imagens no guia ilustrado', '../manual/instalacao.html')`
   ao objeto `extra`, mantendo `referencia`, `copiar` e `continuar` como estão.
4. `tests/instalacao-guiada.test.js`:
   - no teste "página tem alternativa sem JavaScript...": adicionar `assert.match(html, /manual\/instalacao\.html/)`
     e incluir `'../manual/instalacao.html'` na lista de recursos verificados com prefixo; adicionar uma
     verificação de que o arquivo `docs/manual/instalacao.html` existe (`fs.existsSync`).
   - novo teste "Chrome e Edge levam ao guia ilustrado no passo de permissão": para `chrome` e `edge`, a etapa
     `scripts` tem `alternativa.href === '../manual/instalacao.html'`; para `firefox`, `ios`, `android`, `outro`
     nenhuma etapa tem `alternativa.href` igual a esse caminho; e `conteudo.guiaIlustrado === '../manual/instalacao.html'`.
5. Rodar `node tests/instalacao-guiada.test.js` e `npx eslint docs/instalar tests/instalacao-guiada.test.js`. Commit.

## Task 2: Raiz do site leva à landing

Arquivos: `docs/index.html` (novo), `docs/instalar/VALIDACAO.md`, `tests/instalacao-guiada.test.js`.

1. Criar `docs/index.html`: página mínima pt-BR com `<meta http-equiv="refresh" content="0; url=instalar/">`,
   `<link rel="canonical" href="instalar/">`, `<title>Assistente Meeds</title>`, viewport, e no corpo um link
   visível `<a href="instalar/">Ir para a instalação do Assistente Meeds</a>` (funciona sem JavaScript; sem script).
2. `tests/instalacao-guiada.test.js`: novo teste "raiz do site redireciona para a landing": lê `docs/index.html`,
   confere o meta refresh para `instalar/` e o link visível, e que `new URL('instalar/', 'https://example.test/meeds-suite/').pathname === '/meeds-suite/instalar/'`.
3. `docs/instalar/VALIDACAO.md`, seção Hospedagem: acrescentar uma linha dizendo que a raiz
   `https://sodelfino.github.io/meeds-suite/` redireciona para `/instalar/` via `docs/index.html`, e que a landing
   aponta para o guia ilustrado `docs/manual/instalacao.html` (05/11/2026).
4. Rodar `node tests/instalacao-guiada.test.js` e `npm run verificar`. Commit.
