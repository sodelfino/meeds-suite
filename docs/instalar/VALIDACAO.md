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

A configuração externa não foi alterada; o site não foi publicado por esta tarefa.
Para teste local, servir `docs` por HTTP. Para reproduzir o prefixo de projeto, montar a pasta como `/meeds-suite/` e acessar `/meeds-suite/instalar/`. Não divulgar endereços localhost aos médicos.

## Limites

- A página sugere o aparelho, mas o visitante confirma a escolha.
- A conclusão é uma confirmação humana da engrenagem, não uma detecção.
- Estado compartilhado na URL nunca persiste a conclusão.
- Android: Firefox + Tampermonkey é uma orientação ainda não validada em aparelho. O Chrome comum não oferece o caminho necessário.
- Instalação real com extensão em computador, Safari iOS/iPadOS e Android exige aparelhos e permissões correspondentes.
- Não há coleta de dados, analytics, backend ou dependências externas de interface.
