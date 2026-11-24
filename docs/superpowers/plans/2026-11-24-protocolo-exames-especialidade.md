# Protocolo de exames por especialidade (Varginha) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No painel Exames, para Varginha, mostrar o protocolo de solicitação de exames da especialidade do atendimento (Cardiologia, Endocrinologia, Dermatologia).

**Architecture:** O texto do PDF é transcrito à mão em `scripts/protocolos/varginha.js`; `scripts/montar-exames.js` grava esse texto em `dados/exames.json` sob a chave nova `protocolos`, irmã de `municipios`/`encaminhamentos`. O módulo `modules/exames/index.js` detecta a especialidade no mesmo GET de atendimento que já assina e desenha um bloco recolhível com as condições.

**Tech Stack:** JS puro (userscript ES5-ish, IIFE), testes Node com `vm` (padrão de `tests/mensagem-nao-consta.test.js`), `npm run verificar`, `npm run build`.

**Spec:** `docs/superpowers/specs/2026-11-24-protocolo-exames-especialidade-design.md`

## Global Constraints

- Texto clínico transcrito fiel ao PDF `~/Downloads/Protocolo Exames Telemedicina.pdf`, sem resumir nem corrigir.
- Regra de transcrição: rótulo em **negrito** seguido de ":" → item `{ exame, quando }`; parágrafo sem rótulo em negrito → string em `notas`.
- Protocolo nunca entra em `municipios[x].exames` (regra de ouro do módulo).
- Especialidades e condições: Cardiologia 9, Endocrinologia 5, Dermatologia 31.
- Sem nome de pessoa em lugar nenhum.
- Todo campo opcional fica ausente quando vazio (nunca `[]`, `""`).

## Review Focus

1. Especialidade escrita como "ATENDIMENTO EM CARDIOLOGIA" (padrão de "ATENDIMENTO EM PEDIATRIA", visto no payload real) → deve reconhecer Cardiologia. Teste na Task 2.
2. Payload sem `gestaoHorario` ou sem `especialidades` → retorna `null`, sem exceção. Teste na Task 2.
3. Clínico Geral em Varginha → bloco aparece recolhido, com os botões das 3 especialidades, sem nenhuma aberta. Teste na Task 3.
4. Município sem protocolo (ex.: Betim) → nenhum bloco de protocolo e lista de exames igual a antes. Teste na Task 3.
5. Texto do protocolo com `<`/`&` → escapado no HTML. Teste na Task 3.

---

### Task 1: Dados do protocolo

**Files:**
- Create: `scripts/protocolos/varginha.js`
- Modify: `scripts/montar-exames.js` (função `main`, perto da montagem de `saida.encaminhamentos`)
- Regenerate: `dados/exames.json`, `modules/exames/assets/fallback.js`
- Create: `tests/protocolos.test.js`
- Modify: `package.json` (`verificar`: acrescentar `node tests/protocolos.test.js` depois de `node tests/exames.test.js`)

**Interfaces:**
- Produces: `module.exports = { "Varginha": Protocolo }` em `scripts/protocolos/varginha.js`, com
  `Protocolo = { fonte: string, atualizadoEm: "2026-11-24", especialidades: { [nome]: { orientacoesGerais?: string[], condicoes: Condicao[] } } }`,
  `Condicao = { nome: string, grupos?: { titulo?: string, itens: { exame: string, quando: string }[] }[], notas?: string[] }`.
  Em `dados/exames.json`: `protocolos: { "Varginha": Protocolo }`.
- `fonte`: `"Protocolo de Orientações para Solicitação de Exames por Telemedicina — Secretaria Municipal de Saúde de Varginha (MG)"`.
- Orientações gerais existem para Cardiologia e Endocrinologia (5 itens numerados + os 2 parágrafos finais = 7 strings); Dermatologia não tem.
- Condição sem subtítulo no PDF (ex.: "7. Avaliação pré-operatória…") → um grupo sem `titulo`.
- Nome da condição sem o número ("Cardiopatia isquêmica").

- [ ] **Step 1: Escrever `tests/protocolos.test.js`** (mesmo `ok()` de `tests/exames.test.js`) contra o `dados/exames.json` real:
  - `BASE.protocolos.Varginha` existe, com `fonte` e `atualizadoEm` (`/^\d{4}-\d{2}-\d{2}$/`)
  - as chaves de especialidade são exatamente `["Cardiologia","Dermatologia","Endocrinologia"]` (ordenadas)
  - número de condições: 9 / 31 / 5
  - toda condição tem `nome`, e pelo menos um item ou uma nota
  - todo item tem `exame` e `quando`, strings não vazias, sem `\n` nem espaço duplo
  - nenhum campo vazio (`[]` ou `""`) em lugar nenhum do protocolo
  - "Varginha" NÃO está em `BASE.municipios` (protocolo não é lista de oferta)
  - pontos de checagem literais: Cardiologia › "Cardiopatia isquêmica" tem item `exame === "Doppler de carótidas"`; Endocrinologia › "Nódulos da tireoide" tem item `exame` começando por `"Punção aspirativa por agulha fina"`; Dermatologia › "Dermatose papulosa nigra — DPN" é a última condição.
- [ ] **Step 2: Rodar `node tests/protocolos.test.js`.** Esperado: FALHA ("protocolos.Varginha existe").
- [ ] **Step 3: Transcrever o PDF em `scripts/protocolos/varginha.js`**, páginas 1–35, seguindo as regras de transcrição das Global Constraints. Comentário de cabeçalho: de onde veio e a regra negrito → item / parágrafo → nota.
- [ ] **Step 4: Em `main()` de `scripts/montar-exames.js`**, `saida.protocolos = require("./protocolos/varginha.js")`, gravado depois de `encaminhamentos`. Comentário de uma linha explicando por que é chave irmã e não `municipios`.
- [ ] **Step 5: Rodar `npm run montar-exames`, depois `git diff --stat dados/exames.json`.** Esperado: mudam só `atualizadoEm` e o bloco `protocolos`. Se outro município mudar (fonte ausente nesta máquina), reverter `dados/exames.json` e acrescentar só o bloco `protocolos` com um script `node -e` de uma vez, e anotar isso no PR.
- [ ] **Step 6: Rodar `node tests/protocolos.test.js && node tests/exames.test.js && node scripts/sync-exames.js --check`.** Esperado: tudo passa.
- [ ] **Step 7: Commit** `feat(exames): transcreve o protocolo de exames de Varginha (3 especialidades)`.

### Task 2: Especialidade do atendimento

**Files:**
- Modify: `modules/exames/index.js`
- Create: `tests/protocolo-especialidade.test.js`
- Modify: `package.json` (`verificar`)

**Interfaces:**
- Produces: `especialidadeDoAtendimento(corpo: object, nomes: string[]) -> string | null`, função pura no módulo, exposta como `_especialidadeDoAtendimento` no `registerModule` (igual a `_mensagemNaoConsta`).
- Como lê: `g = corpo.gestaoHorario`; procura em `g.profissional.especialidades` a que tem `id === g.especialidadeId`; sem `especialidadeId`, cai no caso de uma única especialidade. Casa a `descricao` com `nomes`: sem acento e sem caixa, alguma palavra da descrição começando pelos 6 primeiros caracteres do nome ("CARDIO", "ENDOCR", "DERMAT").

- [ ] **Step 1: Escrever o teste** (carregamento `vm` igual a `tests/mensagem-nao-consta.test.js`), com `nomes = ["Cardiologia","Dermatologia","Endocrinologia"]`:
  - `{gestaoHorario:{especialidadeId:"a", profissional:{especialidades:[{id:"b",descricao:"ATENDIMENTO EM PEDIATRIA"},{id:"a",descricao:"CARDIOLOGIA"}]}}}` → `"Cardiologia"`
  - descrição `"ATENDIMENTO EM CARDIOLOGIA"` → `"Cardiologia"`
  - descrição `"ENDOCRINOLOGIA E METABOLOGIA"` → `"Endocrinologia"`
  - descrição `"DERMATOLOGIA"` → `"Dermatologia"`
  - descrição `"CLÍNICO GERAL"` → `null`
  - `{}`, `null`, `{gestaoHorario:{}}` → `null`, sem exceção
  - `especialidadeId` aponta para "CLÍNICO GERAL" enquanto o profissional também tem "CARDIOLOGIA" → `null` (vale a especialidade da agenda, não a do médico)
- [ ] **Step 2: Rodar.** Esperado: FALHA ("o hook de teste existe").
- [ ] **Step 3: Implementar** `especialidadeDoAtendimento` e expor `_especialidadeDoAtendimento`.
- [ ] **Step 4: Rodar.** Esperado: PASSA.
- [ ] **Step 5: Commit** `feat(exames): lê a especialidade do atendimento`.

### Task 3: Bloco do protocolo no painel

**Files:**
- Modify: `modules/exames/index.js`
- Modify: `tests/protocolo-especialidade.test.js` (mesmo arquivo da Task 2)

**Interfaces:**
- Consumes: `especialidadeDoAtendimento` (Task 2); `BASE.protocolos` (Task 1).
- Produces:
  - `protocoloDe(municipio) -> Protocolo | null`
  - `htmlProtocolo(municipio: string, protocolo: Protocolo, especialidade: string | null) -> string`, pura, exposta como `_htmlProtocolo`.
  - `municipios()` passa a ser a união das chaves de `BASE.municipios` e `BASE.protocolos` (filtro `_` mantido, ordenada).
- O que `htmlProtocolo` desenha: título `📋 Protocolo de <municipio>`; um botão por especialidade (`data-esp`, `aria-pressed`); para a especialidade ativa, `<details>` "Orientações gerais" (se houver) e um `<details>` por condição contendo os grupos (`<h4>` com o título, quando houver) com `<b>exame:</b> quando`, e as notas com `ⓘ`. Com `especialidade === null`: só os botões e a linha "Escolha a especialidade para ver as orientações."
- Estado: `especialidadeDetectada` (vinda do GET do atendimento, no mesmo callback que já chama `aplicarMunicipio`) e `especialidadeEscolhida` (clique do médico, que vence a detectada, mesma regra do município).
- Na tela: `<div id="ex-protocolo">` logo abaixo de `#ex-lembrete`; os cliques nos botões redesenham só esse div (delegação de eventos). `pintarCabecalho()` passa a funcionar com `blocoDe() === null`: a origem mostra a fonte do protocolo, e `#ex-vazio` mostra `"<municipio> ainda não enviou a lista de exames que oferece. Abaixo, o protocolo de solicitação."`. Opção do select sem lista: `Varginha (protocolo)` em vez de `(0)`.
- CSS: reusar a paleta de `.ex-encaminhamentos`; botões no estilo de `.ex-selo`.

- [ ] **Step 1: Acrescentar testes de `_htmlProtocolo`** com um protocolo mínimo inline (2 especialidades, 1 condição cada, um item com `quando: "a < b & c"`):
  - com `"Cardiologia"`: contém o nome da condição, `aria-pressed="true"` no botão Cardiologia, e `a &lt; b &amp; c`
  - com `null`: contém "Escolha a especialidade", nenhum `<details`, e os dois botões
  - especialidade fora do protocolo (`"Pediatria"`) → igual ao caso `null`
- [ ] **Step 2: Rodar.** Esperado: FALHA nos testes novos.
- [ ] **Step 3: Implementar** `protocoloDe`, `htmlProtocolo`, a união em `municipios()`, o div, o CSS, os estados e a mudança em `pintarCabecalho`/`montarSelect`. Betim/Macaé (sem protocolo): `#ex-protocolo` vazio e com a classe `oculto`.
- [ ] **Step 4: Rodar** `node tests/protocolo-especialidade.test.js && node tests/exames.test.js && node tests/mensagem-nao-consta.test.js`. Esperado: PASSA.
- [ ] **Step 5: Conferir na tela:** `npm run build`, abrir `tests/smoke.html` (ou o preview usado por `tests/exames-rolagem.browser.test.js`) e checar Varginha com Cardiologia, a troca para Dermatologia e Betim sem bloco, além de `npm run teste:exames-ui`. Esperado: sem erro no console e rolagem intacta.
- [ ] **Step 6: Commit** `feat(exames): mostra o protocolo de Varginha por especialidade`.

### Task 4: Versão, changelog, docs, verificação completa

**Files:**
- Modify: `manifest.json` (versão do módulo exames `1.5.0` → `1.6.0`; versão do pacote: próxima minor sobre o `main` atual, conforme `docs/RELEASE.md`)
- Modify: `dados/changelog.json` (bloco no topo, `novidades`: "Exames: em Varginha, o painel mostra o protocolo de solicitação de exames da especialidade do atendimento (Cardiologia, Endocrinologia, Dermatologia) — quando cada exame se justifica para a Central de Regulação.")
- Modify: `docs/COMO-ADICIONAR-MUNICIPIO-EXAMES.md` (seção `### protocolos`: formato, regra negrito → item, e por que não é `municipios`)
- Modify: tutorial do módulo (passo "📋 Protocolo de solicitação (quando existir)")
- Regenerate: `dist/*` via `npm run build`

- [ ] **Step 1: Fazer as edições acima.**
- [ ] **Step 2: Rodar `npm run verificar && npm run build`.** Esperado: tudo passa e `dist/` é regerado.
- [ ] **Step 3: Commit** `chore(exames): versão, changelog e doc do protocolo`.
