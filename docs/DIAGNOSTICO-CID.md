# Diagnóstico: pontos de entrada da busca de CID-10

Levantamento feito **antes** de alterar qualquer código, a pedido, para que a
remoção fosse cirúrgica e não por nome.

## Resumo

Não eram dois pontos de entrada — eram **três**, em duas duplicações distintas.
E a que aparece na tela do médico não é a que se suspeitava.

| # | Onde | Quem cria | O que mostra |
|---|---|---|---|
| A | Botão 🔎 "CID-10" no dock | `modules/cid10` (`botao:` + `aoClicarBotao(abrir)`) | Janela própria de busca, base completa |
| B | `<datalist>` nativo no campo CID | **os próprios geradores** (HTML: `list="…-cid-list"`) | Os ~90 códigos curados de `dados/formularios.json` |
| C | Lista inline `.cid-sug` no campo CID | `modules/cid10` (`cid:conectar-campo`) | Base completa, 14.233 códigos |

**A duplicação visível na captura de tela é B + C**, não A. São dois
autocompletes concorrendo **no mesmo `<input>`**: o dropdown do navegador
(datalist) e a lista desenhada pelo módulo. Um mostra 90 códigos, o outro
14.233 — e o médico vê os dois sobrepostos.

## Respostas às cinco perguntas

**1. Componentes que criam atalhos, botões ou ícones de CID**
- `modules/cid10/index.js`, bloco `botao:` do `registerModule` — botão do dock.
- `modules/cid10/index.js`, `montarUI()` + `abrir()` — a janela.
- Nenhum outro módulo cria atalho de CID. Nenhum comando de menu.

**2. Pontos que registram o módulo no dock**
- Um só: o `botao:` do contrato, em `modules/cid10/index.js`. Quem posiciona é
  o dock do núcleo; o módulo apenas declara. `prioridadeBotao: 25` no
  `manifest.json` é apenas inventário.

**3. Overlays/painéis independentes**
- Um só: o criado em `montarUI()` (`.cid-modal`), com `refs.busca`,
  `#cid-lista` e o rodapé explicativo.
- Alimentam esse overlay, e **só ele**: `abrir()`, `renderizar()`,
  `moverFoco()`, `usarCodigo()`, `copiar()`, `copiarFallback()`,
  `atualizarSubtitulo()` e o bloco `CSS`.

**4. Campos anunciados pelos geradores**

| Gerador | Campo do código | Campo da descrição | Anuncia? |
|---|---|---|---|
| APAC — Itaúna | `apac-cid1` (principal) | `apac-cid-desc` | sim |
| Laudo — Sete Lagoas | `lme-cid` | `lme-diagnostico` | sim |
| Laudo — CMD | `cmd-cid` | `cmd-diagnostico` | sim |

APAC tem ainda `apac-cid2` e `apac-cid3` (secundário e associados), que
**não** são anunciados — só o principal era conectado.

Módulos sem campo de CID, que continuam sem: Alarme de Fila, Sala de Espera,
Assistente REMUME. Nenhum campo novo foi criado em tela que não tinha.

**5. Os atalhos são duas instâncias do mesmo módulo?**
Não. São de donos diferentes:
- **A** e **C** vêm do mesmo módulo, mas são caminhos distintos: A é a janela
  autônoma; C é a integração inline pelo barramento.
- **B** não vem do módulo: é HTML herdado dos geradores originais, anterior ao
  módulo de CID existir. Por isso continuou aparecendo mesmo depois de a
  integração inline entrar.

## Conclusão que orientou a remoção

- Remover **A** por completo (era o pedido).
- Remover **B**, porque é a duplicação que o médico enxerga — mas só o
  `list=`/`<datalist>` **do CID**; o datalist de *procedimento* fica, que é
  outro campo e não tem substituto.
- Preservar **C**, que passa a ser o único caminho.
- Preservar `CID_DIC` e `autoDescricaoCid()` nos geradores: preenchem a
  descrição a partir do código digitado e funcionam mesmo com o módulo
  desligado.
