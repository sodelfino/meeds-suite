# Aviso do município em passos (modal) — Plano de execução

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o cartão de texto corrido por um modal em passos ("Avançar" → próximo bloco → "Li e estou ciente"), primeiro em Pará de Minas (release 2.70.0) e depois em todos os municípios (release 2.71.0).

**Architecture:** O módulo `modules/avisos-municipio` ganha uma função pura `montarPassos(regraMun, unidade)` que quebra a regra em páginas (contexto → ❌ não pode → ✅ pode → 📌 orientações + ciência), e um renderizador que usa o overlay de tela cheia que o núcleo já oferece (`deps.dock.criarOverlay`, com `fecharAoClicarFora: false`). Fase 1: só regras com `exigeCiencia: true` usam o modal; as demais continuam no cartão. Fase 2: o modal vira o único formato, a flag e o caminho do cartão (com o "Entendi" de 3h) são apagados.

**Tech Stack:** userscript JS puro (ES2017, IIFE, sem dependências), testes em Node (`vm`), build `scripts/build.js`.

**Spec:**
- Pedido da operação (13/11/2026): "o texto grande acaba cansando a leitura, era melhor quebrar em avançar e ver a próxima dela e depois clicar em ciente… o modelo anterior que foi proposto aqui de aviso trazia mais atenção". Gravação: https://jam.dev/c/c0cf42c3-757e-4856-94f4-22477276fc55 (não foi possível abrir pelo conector; o pedido escrito é a referência).
- Modelo visual aprovado como "o que chama mais atenção": `/Users/marcelodelfino/Downloads/04_Produto-Meeds/Prototipos-Mockups/prototipo-alerta-para-de-minas.html` (cabeçalho vermelho com ícone pulsando, "ATENÇÃO — LEITURA OBRIGATÓRIA", regras numeradas, proibições em vermelho e orientações em âmbar, checkbox + botão desabilitado até marcar).
- Estado atual: PR sodelfino/meeds-suite#9 (v2.69.0) — conteúdo de Pará de Minas, `exigeCiencia`, ciência por login (`entendidos[chave] = Infinity`, esquecida na tela de login).

## Global Constraints

- `scripts/build.js` reprova: posicionar elemento em pixel no módulo, hook próprio de fetch/XHR, `eval`/`new Function`. Posicionamento é do dock: usar `criarOverlay`.
- Mexeu em `core/`, `modules/` ou `dados/`: `npm run build` e commitar `dist/` junto; `npm run verificar` precisa sair 0 (é o CI). Node 20.
- Versão sobe só em `manifest.json` (`versao` raiz e a do módulo `avisos-municipio`) + bloco novo no topo de `dados/changelog.json`, escrito para o médico.
- Texto da tela vindo de `dados/` entra escapado (helper `escapeHtml` local no módulo, como em `core/historico.js:171`) ou por `textContent`. Nunca HTML cru.
- Município/unidade continuam decididos como hoje (rede > vínculo, "na dúvida não mostra"). Nada desta mudança toca `core/municipio.js` nem `unidadeDoVinculo`.
- O modal só abre dentro de `/atendimento/<id>` e some ao sair do atendimento (mesma regra do cartão).
- Textos fixos da tela (copy exata): cabeçalho `ATENÇÃO — LEITURA OBRIGATÓRIA`; botões `Avançar`, `Voltar`, `Confirmar ciência`; checkbox `Li e estou ciente`; progresso `Passo N de M`.
- Publicar (tag `vX.Y.Z`) é decisão do dono do repo: o executor para antes da tag e pergunta.

## Review Focus

1. Médico sai do atendimento (ou troca de atendimento) com o modal aberto → o modal fecha, sem registrar ciência, e reabre no próximo atendimento daquela cidade/unidade.
2. Regra com um grupo vazio (ex.: Clínica do Autista só tem orientações; Lagomar só tem ❌) → o passo vazio não existe; regra de um bloco só vira um passo único, já com a ciência.
3. Regra do município + regra da unidade juntas (Congonhas não tem unidade; Macaé tem várias) → os itens das duas entram no mesmo passo de cada grupo, sem duplicar título; a chave de ciência continua `municipio|unidade`.
4. Tela de login aparece com o modal aberto → modal fecha e a ciência é esquecida (regra da 2.69.0 continua valendo).
5. Teclado: Esc não fecha antes da ciência; Tab não sai do modal para o formulário de trás; foco vai para o primeiro botão de cada passo.

Cada item tem teste no task que é dono do código (marcado "RF1"… "RF5").

---

## Mapa de arquivos

- `modules/avisos-municipio/index.js` — lógica de quando abrir (inalterada na decisão), `montarPassos` (nova, pura), renderização do modal (nova), caminho do cartão (removido na Fase 2).
- `modules/avisos-municipio/estilo.js` *(novo)* — só a string de CSS do modal, para o `index.js` não crescer. Se o build não empacota arquivos extras do módulo, manter a string no topo do `index.js` (conferir em `scripts/build.js` como `arquivo` do manifest é lido antes de criar).
- `dados/avisos-municipio.json` — Fase 1: campo opcional `resumo` em Pará de Minas. Fase 2: remove `exigeCiencia`.
- `tests/avisos-municipio.test.js` — testes de `montarPassos` e do fluxo com um `criarOverlay` falso.
- `tests/fixtures/atendimento/11111111-1111-1111-1111-111111111111/index.html` *(novo)* — página que imita um atendimento com "Vínculos", para conferência no navegador (servir a raiz do repo com `python3 -m http.server`).
- `manifest.json`, `dados/changelog.json`, `dist/*` — versão e release.

---

# FASE 1 — Pará de Minas (release 2.70.0)

### Task 1: `montarPassos` — quebrar a regra em páginas

**Files:**
- Modify: `modules/avisos-municipio/index.js` (nova função perto de `montarAviso`, exposta como `_montarPassos` no objeto do módulo, como `_verificar`)
- Modify: `dados/avisos-municipio.json` (Pará de Minas → `"resumo"`)
- Test: `tests/avisos-municipio.test.js`

**Interfaces:**
- Produces: `montarPassos(regraMun, unidade) -> { titulo: string, passos: Passo[] } | null`, onde `Passo = { tipo: "contexto"|"naoPode"|"pode"|"orientacoes", titulo: string, itens: Array<{ texto: string, fazer?: string }> }`. `unidade` tem o formato que `unidadeDoVinculo` já devolve (`{ chave, regra }` ou `null`).

Regras da função:
- Junta município + unidade como `montarAviso` faz hoje (mesma ordem: município primeiro).
- Passo `contexto` só existe se alguma das regras tiver `resumo` (string); itens = os `resumo` existentes.
- Depois, nesta ordem e só se tiverem itens: `naoPode` (título `O que NÃO fazer`; item = `{texto: item, fazer}`), `pode` (título `O que a unidade oferece`), `orientacoes` (título `Orientações`).
- `titulo` = título da última regra com conteúdo (mesma regra do `montarAviso`).
- Sem nenhum item em lugar nenhum → `null`.

- [ ] **Step 1: Escrever os testes**

```js
/* 29. montarPassos (13/11/2026): o aviso vira páginas. */
{
  const t = carregar();
  const R = DADOS.municipios;
  const para = t.def._montarPassos(null, { chave: "UBS", regra: R["Pará de Minas"].unidades.UBS });
  ok("Pará: 4 passos na ordem contexto → naoPode → pode → orientacoes",
     para.passos.map((p) => p.tipo).join() === "contexto,naoPode,pode,orientacoes");
  ok("Pará: contexto traz a UPA da UBS", /UPA da UBS/.test(para.passos[0].itens[0].texto));
  ok("Pará: 5 proibições, a 1ª é nome comercial", para.passos[1].itens.length === 5 && /nome comercial/.test(para.passos[1].itens[0].texto));
  const autista = t.def._montarPassos(null, { chave: "Clínica do Autista", regra: R["Macaé"].unidades["Clínica do Autista"] });
  ok("RF2: só orientações → um passo só", autista.passos.length === 1 && autista.passos[0].tipo === "orientacoes");
  const barb = t.def._montarPassos(R["Barbacena"], null);
  ok("Barbacena: sem resumo não tem contexto", barb.passos[0].tipo === "naoPode");
  ok("vazio → null", t.def._montarPassos({ titulo: "x" }, null) === null);
}
```

- [ ] **Step 2: Rodar e ver falhar** — `node tests/avisos-municipio.test.js` → FALHA em `_montarPassos is not a function`.
- [ ] **Step 3: Implementar `montarPassos` e acrescentar no JSON**, em Pará de Minas/UBS: `"resumo": "Nestas UBS atendemos DEMANDA ESPONTÂNEA — \"a UPA da UBS\": siga o raciocínio de uma UPA."` e remover a orientação equivalente (`Atendemos DEMANDA ESPONTÂNEA…`) para não repetir. Documentar `resumo` no `_leia_me`.
- [ ] **Step 4: Rodar** — `node tests/avisos-municipio.test.js` → `todos passaram`. (O teste antigo "Pará de Minas: pontos de atenção" que procura `UPA da UBS` no cartão será reescrito no Task 2; se falhar aqui, ajustar para procurar no `resumo`.)
- [ ] **Step 5: Commit** — `feat(avisos): montarPassos quebra o aviso em páginas`

### Task 2: Modal em passos para regras com `exigeCiencia`

**Files:**
- Modify: `modules/avisos-municipio/index.js` (`abrirCartao` → escolhe entre cartão e modal; nova `abrirModal(id, municipio, chave, passos)`; `fechar()` fecha qualquer um dos dois)
- Create (se o build permitir, ver Mapa): `modules/avisos-municipio/estilo.js`
- Test: `tests/avisos-municipio.test.js` (overlay falso em `carregar()`)
- Create: `tests/fixtures/atendimento/11111111-1111-1111-1111-111111111111/index.html`

**Interfaces:**
- Consumes: `montarPassos` (Task 1); `deps.dock.criarOverlay({ html, estilo, fecharAoClicarFora: false })` → `{ elemento, $, $$, abrir, fechar, estaAberto, remover }` (core/dock.js:776).
- Produces: `aberto` passa a ser `{ id, municipio, chave, tipo: "cartao"|"modal", aviso?, overlay? }`. Ciência continua `entendidos[chave] = Infinity`.

Comportamento:
- HTML do modal = cabeçalho vermelho (ícone ⚠ pulsando, `ATENÇÃO — LEITURA OBRIGATÓRIA`, título), corpo do passo atual, rodapé com `Passo N de M`, `Voltar` (oculto no passo 1) e `Avançar`. No último passo, no lugar de `Avançar`: checkbox `Li e estou ciente` + `Confirmar ciência` (desabilitado até marcar). Visual do protótipo (Spec): ❌ em cartões vermelhos numerados, ✅ e 📌 em âmbar/neutro, `fazer` em linha menor abaixo do item.
- Renderização: o modal monta o HTML do passo com `escapeHtml` e troca o conteúdo de `.msam-corpo` a cada passo (prefixo de classe `msam-` para não colidir).
- `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby` no título; foco no botão principal a cada troca de passo; `keydown` no overlay: Esc ignorado, Tab circula entre os focáveis do modal (RF5); `@media (prefers-reduced-motion: reduce)` desliga a pulsação.
- Confirmar → `entendidos[chave] = Infinity`, `overlay.remover()`, `aberto = null`.
- Saiu do atendimento / trocou de atendimento / tela de login → `overlay.remover()` sem registrar ciência (RF1, RF4).
- Regras sem `exigeCiencia`: cartão exatamente como hoje.

- [ ] **Step 1: Overlay falso no teste.** Em `carregar()`, `dock.criarOverlay(opcoes)` devolve um objeto que guarda `opcoes`, mantém `html` atual em `el.innerHTML`, e cujo `$(sel)` devolve um stub `{ addEventListener(ev, fn), click(), checked, disabled, hidden, textContent, focus() }` por seletor, para o teste clicar. Guardar os overlays criados em `overlays` (como `avisos`).
- [ ] **Step 2: Escrever os testes**

```js
/* 30. Modal em passos (Pará de Minas). */
{
  const t = abrirPara();                         // helper: Pará + UBS WALTER MARTINS, como no teste 27
  const m = t.overlays.at(-1);
  ok("abre o modal, não o cartão", m && m.estaAberto() && t.visiveis().length === 0);
  ok("não fecha clicando fora", m.opcoes.fecharAoClicarFora === false);
  ok("passo 1 de 4", /Passo 1 de 4/.test(m.elemento.innerHTML));
  m.$(".msam-avancar").click(); m.$(".msam-avancar").click(); m.$(".msam-avancar").click();
  ok("último passo: Confirmar desabilitado", /Passo 4 de 4/.test(m.elemento.innerHTML) && m.$(".msam-confirmar").disabled === true);
  m.$(".msam-ciente").checked = true; m.$(".msam-ciente").click();
  m.$(".msam-confirmar").click();
  ok("confirmou: fecha e não reabre no próximo atendimento", !m.estaAberto() && reabreEmOutroAtendimento(t) === false);
}
/* RF1 */ ok("saiu do atendimento com o modal aberto: fecha sem ciência e volta no próximo", ...);
/* RF4 */ ok("tela de login com o modal aberto: fecha e esquece a ciência", ...);
/* RF3 */ ok("Barbacena (sem exigeCiencia) continua com cartão e 'Entendi'", ...);
/* escape */ ok("título com <b> no JSON aparece escapado", ...); // injetar DADOS alterado num carregar() próprio
```

Os três `...` são o mesmo roteiro dos testes 18/27/28 já existentes, trocando a asserção para o overlay.
- [ ] **Step 3: Rodar e ver falhar.**
- [ ] **Step 4: Implementar** `abrirModal` e a escolha em `abrirCartao`/`verificar`; `fechar()` trata os dois tipos.
- [ ] **Step 5: Rodar** `node tests/avisos-municipio.test.js` → `todos passaram`; `npm run build && npm run verificar` → exit 0.
- [ ] **Step 6: Conferir no navegador (obrigatório: geometria e teclado não são cobertos em Node).** Criar a fixture (cartão de paciente com rótulo `Vínculos` = `PARÁ DE MINAS - MG` / `UBS WALTER MARTINS`, uma `<textarea>` de formulário, `<script src="/dist/meeds-suite.safari.user.js">`), servir a raiz do repo e abrir `/tests/fixtures/atendimento/11111111-1111-1111-1111-111111111111/`. Conferir em 1280×860 e 375×812: modal centralizado, botões visíveis sem rolar a página, Avançar/Voltar, Confirmar só depois do checkbox, Esc não fecha, Tab não sai do modal, sem erros no console, e que não reabre após 6 s. Screenshot de cada passo no relatório.
- [ ] **Step 7: Commit** — `feat(avisos): Pará de Minas em modal de passos com ciência`

### Task 3: Release 2.70.0 (Pará de Minas)

**Files:** `manifest.json` (raiz `2.70.0`, módulo `avisos-municipio` `1.7.0`), `dados/changelog.json`, `dist/*`

- [ ] **Step 1:** Bloco 2.70.0 no changelog (novidade: "Pará de Minas: o aviso agora aparece em passos — avance bloco a bloco e confirme 'Li e estou ciente' no fim."). Subir versões.
- [ ] **Step 2:** `npm run build && npm run verificar && node tests/instalacao-guiada.test.js` → exit 0.
- [ ] **Step 3:** Commit, push da branch `feat/aviso-modal-passos`, PR para `main`, esperar o check `verificar` verde.
- [ ] **Step 4: PARAR e pedir ao dono:** merge + tag `v2.70.0` (docs/RELEASE.md, passo 6). Só seguir para a Fase 2 depois de a operação validar o modal em Pará de Minas no Meeds real.

---

# FASE 2 — Todos os municípios (release 2.71.0)

### Task 4: Modal como formato único

**Files:**
- Modify: `modules/avisos-municipio/index.js` — apaga `abrirCartao` (caminho do cartão), `TEMPO_ENTENDIDO_MS`, `dispensados` (o X deixa de existir) e o ramo `exigeCiencia`; todo aviso abre `abrirModal`. `estaEntendido` vira `entendidos[chave] === true` (ciência por login).
- Modify: `dados/avisos-municipio.json` — remove `exigeCiencia`; `_leia_me` atualizado (todo aviso pede ciência por login).
- Modify: `tests/avisos-municipio.test.js` — testes que verificam cartão/"Entendi"/3h (18, 27 parte do botão, 28 "Franco 'Entendi'") passam a verificar o modal; o teste "passadas as 3h, Barbacena volta a avisar" é substituído por "Barbacena: confirmada a ciência, não volta até o login".
- Modify: `core/dock.js` — nada (o `flex-shrink: 0` da 2.69.0 continua útil para outros avisos do topo).

**Interfaces:** Consumes `montarPassos`, `abrirModal` (Tasks 1-2).

- [ ] **Step 1: Ajustar os testes** listados acima para o modal; acrescentar: um caso por município/unidade da tabela (Barbacena, Franco, Congonhas, Piraí, as 7 regras de Macaé, Pará) asserindo que abre modal com `Passo 1 de M` e M = número de grupos não vazios (gerar a lista a partir de `DADOS`, não à mão).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** a remoção. Conferir com `grep -n "Entendi\|TEMPO_ENTENDIDO\|dispensados\|exigeCiencia" modules/avisos-municipio/index.js dados/avisos-municipio.json` → nenhuma ocorrência.
- [ ] **Step 4: Rodar** testes + `npm run build && npm run verificar` → exit 0.
- [ ] **Step 5: Navegador** — mesma fixture com `?v=` trocando o vínculo para `BARBACENA - MG` e `MACAÉ - RJ|CLINICA DO AUTISTA` (a fixture lê `?v=` e troca o conteúdo de `Vínculos`, linhas separadas por `|`): modal de 3 passos e de 1 passo, ambos confirmáveis.
- [ ] **Step 6: Commit** — `feat(avisos): todos os municípios em modal de passos com ciência por login`

### Task 5: Release 2.71.0

- [ ] Mesmo roteiro do Task 3 com `2.71.0` / módulo `1.8.0`; changelog: "Avisos do município: todas as cidades agora mostram o aviso em passos, com 'Li e estou ciente' uma vez por login." Atualizar a `descricao` do módulo no manifest. **PARAR antes da tag.**

---

## Decisões já tomadas (rulings)

- Passos por **grupo** (contexto / não pode / pode / orientações), não um item por tela: Pará daria 4 cliques em vez de ~12 a cada login. Se a operação quiser item a item, só `montarPassos` muda.
- O modal bloqueia a tela até a ciência. Isso reverte a decisão de 25/09/2026 (cartão no canto porque o modal cobria o formulário) por pedido explícito da operação em 13/11; o custo é o médico não ver o formulário até confirmar, uma vez por login por cidade/unidade.
- Sem botão "Ver regras de novo" depois da ciência (o manifest diz `formaBotao: "nenhum"` para este módulo). Fica como ideia para depois.
- Fase 2 apaga o cartão e o "Entendi" de 3h em vez de manter os dois formatos.
