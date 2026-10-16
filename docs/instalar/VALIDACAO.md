# Instalação guiada — validação e publicação

## Fontes e conectividade

Verificação em 15/10/2026 (America/Sao_Paulo):

| Destino | Evidência |
|---|---|
| Pacote Tampermonkey em raw.githubusercontent.com | HTTP 200; 3.243.427 bytes |
| Pacote Safari em raw.githubusercontent.com | HTTP 200; 3.243.264 bytes |
| Asset Safari do release mais recente | HTTP 200; 3.243.264 bytes |
| Projeto oficial Userscripts: github.com/quoid/userscripts | HTTP 200; documentação acessível |
| Tampermonkey FAQ e catálogo Mozilla Android | Proxy do ambiente retornou 403; instruções baseadas no guia existente e destinos oficiais, requerem conferência antes da divulgação |
| API GitHub Pages | Acesso retornou Forbidden; configuração de hospedagem não verificada |

Lojas Chrome e Edge: destinos já presentes em `docs/manual/instalacao.html`.
Userscripts: gerenciador Safari do projeto quoid, App Store ID 1463298887.
Não interpretar sucesso de download como instalação validada. Nenhuma validação em produção foi realizada.

## Hospedagem

A página fica em `docs/instalar/index.html`, sem compilação ou dependências de runtime.
Inspecionar Settings → Pages antes de mudar qualquer site existente. Se não houver outro site e Pages estiver disponível, usar Deploy from a branch, branch contendo esta alteração, pasta `/docs`. A rota do guia será `/instalar/` abaixo da URL de Pages informada pelo GitHub. Não há configuração de deploy automático adicionada por esta alteração.

A publicação foi ativada pelo usuário em 16/10/2026. O workflow [pages build and deployment](https://github.com/sodelfino/meeds-suite/actions/runs/38904168042) concluiu com SUCCESS e informou a base `https://sodelfino.github.io/meeds-suite/`. A [página guiada](https://sodelfino.github.io/meeds-suite/instalar/) fica em `/instalar/`. A abertura direta do domínio github.io e a API de Pages continuam bloqueadas pelo proxy deste ambiente (403); portanto, a evidência confirma o deploy pelo GitHub, sem afirmar uma verificação HTTP externa da página.
Para teste local, servir `docs` por HTTP. Para reproduzir o prefixo de projeto, montar a pasta como `/meeds-suite/` e acessar `/meeds-suite/instalar/`. Não divulgar endereços localhost aos médicos.

## Limites

- A página sugere o aparelho, mas o visitante confirma a escolha.
- A conclusão é uma confirmação humana da engrenagem, não uma detecção.
- Estado compartilhado na URL nunca persiste a conclusão.
- Android: Firefox + Tampermonkey é uma orientação ainda não validada em aparelho. O Chrome comum não oferece o caminho necessário.
- Instalação real com extensão em computador, Safari iOS/iPadOS e Android exige aparelhos e permissões correspondentes.
- Não há coleta de dados, analytics, backend ou dependências externas de interface.

## Evidências da página

- Node 20.20.2: 14 grupos de testes de regras, variantes e controlador passaram.
- ESLint: sem erros nos arquivos novos.
- Chromium 154.0.8037.57 via Playwright: seis roteiros em três larguras (360, 768 e 1280px), totalizando 18 jornadas; nenhuma exceção de JavaScript e nenhum transbordamento horizontal.
- Navegação por teclado, foco no título após avançar, ida/volta no histórico, recarregamento e URL adulterada conferidos.
- Cópia com API indisponível (Node) e promessa rejeitada (Chromium): seleção manual oferecida, sem alegar cópia bem-sucedida.
- JavaScript desativado: guias e PDF acessíveis nas três larguras.
- Servidor HTTP com prefixo `/meeds-suite/`: página, quatro scripts/estilos, imagem e dois PDFs responderam HTTP 200.
- Imagem existente do dock conferida visualmente: engrenagem reconhecível; legenda informa que botões variam.

Esses testes exercitam a página no Chromium. Selecionar o roteiro Safari/Firefox/Edge ou usar uma largura móvel não executa esses navegadores nem valida extensões em aparelhos reais. A instalação real continua pendente em cada plataforma; Android e iOS informam essa limitação na página.

## Como repetir

```bash
export PATH=/workspace/.cloud-tools/node_modules/.bin:$PATH
node tests/instalacao-guiada.test.js
npm run verificar
python3 -m http.server 8732 --bind 127.0.0.1 --directory docs
```

No navegador, percorrer cada roteiro, expandir ajuda, voltar, trocar aparelho e recarregar a conferência. Repetir sem JavaScript e com teclado. A confirmação “Sim, apareceu” só deve ser usada após observar a engrenagem no Meeds.

- Regressão: `npm run verificar` completou com código 0 no Node 20.20.2; 40 arquivos de teste existentes e lint, além do novo teste separado no CI.
- `git diff --check` passou; core, módulos, dados, manifest, userscripts, package.json e lockfile não foram alterados.

- Revisão independente encontrou conflito entre o atalho de pular para conteúdo e o fragmento de navegação; corrigido com teste de regressão RED→GREEN e confirmação no Chromium de que a etapa restaurada é preservada.
