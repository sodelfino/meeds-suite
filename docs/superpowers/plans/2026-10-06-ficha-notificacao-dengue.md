# Ficha de notificação — Dengue e Chikungunya (SINAN) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Novo módulo `notificacao` do Assistente que gera, na primeira consulta de telemedicina, a **Ficha de Investigação Dengue e Febre de Chikungunya (SINAN, SVS 14/03/2016)** preenchida por cima do PDF oficial, com as validações de campos obrigatórios pedidas pelo usuário e alerta de urgência para sinais de alarme.

**Architecture:** O PDF oficial é achatado (sem AcroForm), então o preenchimento é por coordenadas x/y — mesma técnica do laudo de Sete Lagoas (`modules/lme-sete-lagoas`). A lógica (mapa de campos, validação, idade, operações de desenho, aplicação no pdf-lib) fica numa camada **pura**, sem DOM, testável em Node; `index.js` só monta o formulário e liga ao núcleo (botão do dock, guia de campos faltando, histórico, prévia, tutorial). O módulo é pensado para receber outras fichas de notificação depois (id genérico `notificacao`; a ficha de dengue é a primeira).

**Tech Stack:** JavaScript puro (userscript), pdf-lib 1.17.1 (já carregado pelo bootloader; entra também como devDependency para o teste ponta a ponta), pymupdf só localmente para conferir visualmente a calibração.

**Spec:** (1) PDF `Ficha_DENGCHIK_FINAL (1).pdf` (2 páginas A4, 595x842 pt, vetorial, 0 campos de formulário); (2) texto do usuário em 06/10/2026 ("estrutura exata… blocos lógicos"); (3) decisões confirmadas no chat: **escopo = só o que a primeira consulta tem**; **lista do IBGE embutida**; **ligado por padrão em qualquer município**.

## Global Constraints

- Nenhum dado de paciente é gravado em disco além do que o Histórico já grava (iniciais + 3 últimos dígitos). O campo `clinico` do histórico NUNCA recebe endereço, telefone, nome ou data de nascimento.
- Sem chamada de rede nova (a lista do IBGE vai embutida; nada de `@connect` novo).
- Regras de arquitetura do build: sem `top|left|right|bottom: Npx` no CSS do módulo, sem `botao: {` dentro do módulo, sem hook próprio de XHR/fetch.
- Texto do alerta de alarme, exatamente como pedido: "Paciente com sinais de alarme. Oriente o deslocamento imediato a um serviço de pronto atendimento presencial."
- Data de início dos sintomas: obrigatória, não futura, no máximo 15 dias atrás (bloqueia a geração).
- Pdf-lib/Helvetica só codifica WinAnsi: todo texto passa por saneamento (maiúsculas, caracteres fora do WinAnsi viram `?`), nunca lança.
- `npm run verificar` tem que passar (exit code REAL conferido) antes de cada commit; rodar `node scripts/sync-*.js --check` antes do verificar.
- Publicação: bump em `package.json`+`manifest.json` (o build sincroniza), entrada no `dados/changelog.json`, build, verify, commit, push, CI verde, **`gh release create`** com os dois arquivos (`.user.js` e `.safari.user.js`).

## Review Focus

- **Paciente do sexo masculino com "Gestante" preenchido por engano:** a ficha precisa sair com `6 - Não se aplica`, nunca com trimestre. Pinado pelo teste de operações da Task 2.
- **Data de início dos sintomas com ano errado ou futura:** o médico digita 2025 em vez de 2026; a geração tem que bloquear com mensagem clara (Task 2, `validar`).
- **Município com acento/caixa diferente ("macae", "SAO PAULO"):** a busca ignora acento e caixa e devolve o código IBGE de 6 dígitos; município que não existe na UF não gera a ficha (Task 1/2).
- **Texto longo (nome, observações, logradouro) estourando a célula:** fonte adaptativa/recorte, nunca texto invadindo a célula vizinha (Task 3).
- **Sinal de alarme marcado junto com "sem sinais de alarme":** contradição — bloqueia (Task 2). Alarme marcado e geração liberada: alerta vermelho fica visível (Task 4).
- **Caractere fora do WinAnsi no nome (ex.: "Łukasz"):** não pode derrubar a geração do PDF (Task 3).

## Arquivos

- Create `scripts/gerar-asset-pdf.js` — converte um PDF em asset `.js` (base64), reprodutível (não existia script).
- Create `scripts/sync-municipios-ibge.js` — baixa a lista oficial do IBGE e gera o asset compacto (UF → [[cod6, nome]]).
- Create `modules/notificacao/assets/base-pdf-dengue.js` (gerado), `modules/notificacao/assets/municipios-ibge.js` (gerado).
- Create `modules/notificacao/assets/dengue-ficha.js` — lógica pura: `MeedsNotificacaoDengue`.
- Create `modules/notificacao/index.js` — UI e ligação com o núcleo.
- Create `tests/notificacao-ibge.test.js`, `tests/notificacao-dengue.test.js`, `tests/notificacao-dengue-pdf.test.js`.
- Modify `manifest.json` (módulo novo), `tests/padrao-laudos.test.js` (lista dos módulos ligados por padrão), `package.json` (devDependency `pdf-lib`, cadeia `verificar`), `core/icones.js` (ícone `notificacao`, se não reaproveitar `laudo`), `README.md`, `docs/MANUAL-ADMIN.md`, `dados/changelog.json`.

## Mapa de campos (página 1; coordenadas em pt, origem no canto superior esquerdo)

| # | Campo da ficha | Origem do valor | Obrigatório | Regra |
|---|---|---|---|---|
| 1 | Tipo de notificação | fixo (impresso: "2 - Individual") | — | nada a escrever |
| 2 | Agravo/doença | escolha do médico | sim | caixa recebe `1` (Dengue) ou `2` (Chikungunya); CID impresso (A90 / A92.0) |
| 3 | Data da notificação | hoje (automático) | — | comb de 8 células |
| 4/5 | UF / Município de notificação (+IBGE) | Vínculos da tela ("MACAÉ - RJ") | — | pode ser corrigido |
| 6 | Unidade de saúde (+CNES) | Vínculos (2ª linha) / cadastro de estabelecimentos | não | CNES 7 dígitos se informado |
| 7 | Data dos primeiros sintomas | médico | sim | não futura, ≤ 15 dias |
| 8 | Nome do paciente | tela (`lerPaciente`) | sim | maiúsculas |
| 9/10 | Nascimento / idade | tela; idade calculada | sim | idade em anos (ou meses/dias se < 1 ano) |
| 11 | Sexo | tela / médico | sim | `M`, `F`, `I` |
| 12 | Gestante | médico | sim se F | F: 1/2/3 trimestre, 4 IG ignorada, 5 não, 9 ignorado; M: `6` automático |
| 13 / 14 | Raça/cor, escolaridade | médico | não | códigos da ficha |
| 15 / 16 | Cartão SUS, nome da mãe | médico | não | SUS: 15 dígitos |
| 17/18 | UF / Município de residência (+IBGE) | médico (padrão: município do atendimento) | sim | só município que existe na UF |
| 20–23, 26, 27 | Bairro, logradouro, número, complemento, ponto de referência, CEP | médico | não | CEP 8 dígitos se informado |
| 28 | (DDD) Telefone | tela / médico | sim | 10 ou 11 dígitos |
| 29 | Zona | médico | não | 1/2/3/9 |
| 31 / 32 | Data da investigação, ocupação | hoje (automático) / médico | — / não | |
| 33 | Sinais clínicos | médico | ≥ 1 | `1` nas marcadas; as demais ficam em branco |
| 34 | Doenças pré-existentes | médico | não | `1` nas marcadas |
| 38–49 | Dados laboratoriais | — | — | em branco (fora do escopo da 1ª consulta) |

Página 2: 68 (sinais de alarme), 69 (data), 70 (gravidade), 71 (data) — `1` nas marcadas e, se o médico atestar "sem sinais de alarme", `2` em todas as caixas do 68; Observações adicionais (texto livre, até 9 linhas); Investigador (município/unidade, código, nome e função do médico, se escolhido). Hospitalização, local provável de infecção, classificação, evolução e encerramento ficam em branco para a vigilância.

---

### Task 1: Assets gerados (PDF base e municípios IBGE)

**Files:** `scripts/gerar-asset-pdf.js`, `scripts/sync-municipios-ibge.js`, `modules/notificacao/assets/*.js`, `tests/notificacao-ibge.test.js`

**Interfaces:**
- Produces: `raiz.MEEDS_NOTIF_DENGUE_BASE_PDF_B64` (string base64 do PDF) e `raiz.MEEDS_MUNICIPIOS_IBGE` (`{ "RJ": [["330240","Macaé"], …], … }`, 27 UFs, 5.571 municípios, códigos de 6 dígitos únicos).

- [ ] Escrever `tests/notificacao-ibge.test.js` (RED): 27 UFs; 5.571 itens; códigos únicos de 6 dígitos; Macaé=330240 (RJ), Congonhas=311800 (MG), Sete Lagoas=316720 (MG), Piraí=330400 (RJ); o PDF base decodifica para `%PDF` com 2 páginas (conta `/Type /Page`).
- [ ] Implementar os dois scripts e gerar os assets; teste GREEN.
- [ ] Commit.

### Task 2: Lógica pura — validação, idade e operações de desenho

**Files:** `modules/notificacao/assets/dengue-ficha.js`, `tests/notificacao-dengue.test.js`

**Interfaces:**
- Produces `raiz.MeedsNotificacaoDengue = { validar(dados, hoje), idadeDe(nascISO, hoje), buscarMunicipio(uf, nome), ufsDoMunicipio, temSinalDeAlarme(dados), montarOperacoes(dados, hoje), aplicarNoPdf(PDFLib, pdfDoc, operacoes), SINAIS_CLINICOS, DOENCAS, ALARME, GRAVIDADE, TEXTO_ALERTA }`.
- `dados` (todos strings, exceto listas): `agravo` (`"dengue"|"chikungunya"`), `inicioSintomas` (ISO), `sinais` (ids), `doencas` (ids), `alarme` (ids), `gravidade` (ids), `semAlarme` (bool), `dataAlarme`, `dataGravidade`, `nome`, `nascimento` (ISO), `sexo` (`M|F|I`), `gestante` (`1..6|9`), `raca`, `escolaridade`, `sus`, `mae`, `ufRes`, `municipioRes`, `bairro`, `logradouro`, `numero`, `complemento`, `referencia`, `cep`, `telefone`, `zona`, `ocupacao`, `ufNotif`, `municipioNotif`, `unidade`, `cnes`, `observacoes`, `medicoNome`, `medicoFuncao`.

- [ ] Testes RED para: obrigatórios (cada um sozinho faltando gera 1 erro com `id` do campo); data de sintoma futura / >15 dias / ano trocado; sinais clínicos vazio; alarme contraditório; gestante só exigida para F e `6` automático para M; município inexistente na UF; telefone com 9 e 10/11 dígitos; SUS e CEP e CNES com tamanho errado; idade (anos/meses/dias, aniversário hoje, 29/02); `temSinalDeAlarme`.
- [ ] Testes RED das operações: agravo escreve `1`/`2` dentro da caixa certa; data da notificação em 8 células (`ddmmaaaa`); IBGE em 6 células; telefone em células; sinais clínicos só marcam os escolhidos; `semAlarme` escreve `2` nas 9 caixas do 68 e nenhuma do 70; texto vira maiúsculo e sem caractere fora do WinAnsi.
- [ ] Implementar até GREEN. Commit.

### Task 3: Aplicação no PDF com pdf-lib (ponta a ponta)

**Files:** `tests/notificacao-dengue-pdf.test.js`, `package.json`/`package-lock.json` (devDependency `pdf-lib@1.17.1`)

- [ ] Teste RED: carrega o asset real, gera com um caso completo e outro mínimo, confirma 2 páginas, bytes > base, PDF reabre; nome com `Ł` não lança; observação com 600 caracteres vira no máximo 9 linhas.
- [ ] `aplicarNoPdf`: centraliza dentro da caixa, comb por célula, fonte adaptativa (reduz até caber, nunca invade), quebra de linha, saneamento WinAnsi. GREEN. Commit.
- [ ] Conferência visual local (pymupdf → PNG) dos casos completo/mínimo; ajustar coordenadas até cada valor cair dentro da própria célula. Registrar as correções.

### Task 4: Módulo (UI) e encaixe no pacote

**Files:** `modules/notificacao/index.js`, `manifest.json`, `tests/padrao-laudos.test.js`, `core/icones.js`

- [ ] `manifest.json`: módulo `notificacao`, `padraoHabilitado` ausente (ligado por padrão), `prioridadeBotao` 35, `assets` na ordem dados → lógica, `apresentacao` rótulo "Notificação".
- [ ] `tests/padrao-laudos.test.js`: a lista dos ligados por padrão inclui `notificacao`.
- [ ] `index.js`: formulário por seções (doença e datas → sinais clínicos → alarme/gravidade com alerta vermelho → paciente → residência → unidade → observações/investigador), preenchimento a partir de `lerPaciente` e do Vínculos, `MeedsSuiteGuia`, histórico (só `clinico` não identificável), prévia (`preview:registrar-gerador`), tutorial, botão do dock.
- [ ] Build; `npm run verificar` (exit real). Commit.

### Task 5: Publicação

- [ ] README (tabela de funções), manual admin, changelog (novidade), bump de versão, build, verify, commit, push, CI verde, release com os dois arquivos (Tampermonkey e Safari/iPad), conferência do `.safari.user.js` publicado.

## O que fica de fora (de propósito)

- Dados laboratoriais (35–49), hospitalização (50–55), local provável de infecção (56–61), classificação final, evolução e encerramento (62–67): não existem na primeira consulta; a vigilância completa.
- Envio da ficha à vigilância: o médico baixa o PDF e segue o fluxo do município (fora do Assistente).
- Outras fichas de notificação (a estrutura aceita, mas só a de dengue/chikungunya entra agora).
