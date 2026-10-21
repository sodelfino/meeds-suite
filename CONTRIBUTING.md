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

Use Node 20 (como no CI) e `npm ci` para instalar as dependências pelo lockfile.
Execute também `node tests/instalacao-guiada.test.js`.

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
- **Não envie dados de pacientes a serviços externos. O histórico local contém
  dados clínicos e referência pseudonimizada; texto livre pode conter identificação.**
  Ao mexer em algo que lê a tela ou a rede, mantenha a regra — e o teste
  `tests/network-hub.test.js` / `tests/historico.test.js` passando.
- **Toda mensagem de erro** diz o que não aconteceu, por quê, e o que fazer
  agora (`core/mensagens.js`).

## Publicar uma versão

É tarefa de quem mantém o repositório: [docs/RELEASE.md](docs/RELEASE.md).
