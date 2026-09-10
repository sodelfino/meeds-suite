# Contribuir com o Assistente Meeds

## Antes de qualquer coisa

O código é proprietário (ver [LICENSE](LICENSE)). Correções e ideias são
bem-vindas por PR ou por e-mail (`marcelonovetech@gmail.com`); publicar
versões modificadas por fora, não.

## O ciclo

1. Branch a partir do `main`.
2. Faça a mudança. Se mexeu em `core/`, `modules/`, `bootloader.user.js` ou nos
   arquivos de `dados/`, rode `npm run build` e **commite o `dist/` junto** — o
   CI reprova se ele estiver dessincronizado.
3. `npm run verificar` tem que passar (é o que o CI roda: a suíte de testes +
   as verificações de build e de sincronização).
4. Abra o PR. O check **`verificar`** precisa ficar verde para o merge.

Não há dependências: os scripts usam só módulos nativos do Node (>= 14). Não
existe `npm install` neste projeto.

## Regras de arquitetura (o build cobra)

`scripts/build.js` **reprova** o build se um módulo:

- posicionar o próprio botão em pixel (`bottom: 24px` etc.) — use
  `dock.registrarBotao`;
- instalar hook próprio de `fetch`/`XHR` — use `deps.network.assinar`;
- usar `eval` ou `new Function` — o pacote é autocontido; nada de buscar e
  executar código em runtime.

Detalhes e o contrato de módulo: [docs/ARQUITETURA.md](docs/ARQUITETURA.md).
Criar uma função nova: [docs/COMO-ADICIONAR-MODULO.md](docs/COMO-ADICIONAR-MODULO.md).

## Princípios

- **Nenhuma função existente é tocada ao adicionar outra.** Cada módulo é uma
  pasta; o `manifest.json` liga.
- **Nada que identifique o paciente vai para o disco nem sai do navegador.**
  Ao mexer em algo que lê a tela ou a rede, mantenha a regra — e o teste
  `tests/network-hub.test.js` / `tests/historico.test.js` passando.
- **Toda mensagem de erro** diz o que não aconteceu, por quê, e o que fazer
  agora (`core/mensagens.js`).

## Publicar uma versão

É tarefa de quem mantém o repositório: [docs/RELEASE.md](docs/RELEASE.md).
