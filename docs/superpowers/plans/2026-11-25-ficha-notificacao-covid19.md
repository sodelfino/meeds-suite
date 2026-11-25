# Ficha de investigação COVID-19 (e-SUS Notifica) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acrescentar ao módulo "Ficha de notificação" do Meeds Suite a ficha "Investigação de SG suspeito de COVID-19 (B34.2)" do e-SUS Notifica (05/10/2020), preenchida por cima do PDF oficial, com o mínimo de digitação do médico durante a teleconsulta.

**Architecture:** Mesmo desenho das 4 fichas que já existem (`dengue`, `lta`, `aids`, `violencia`): lógica pura sem DOM em `covid-ficha.js` (catálogos, validação, coordenadas, operações de desenho — testada em Node), tela própria em `covid-form.js` (seções que só aparecem com a ficha `covid`), e `index.js` só liga as duas peças. Paciente, CPF, nome da mãe, UF/município do vínculo já são lidos da tela pelo código atual (`lerDaTela`, `aplicarVinculo`); a ficha nova só reaproveita.

**Tech Stack:** JavaScript ES2017 sem bundler (IIFE em `raiz`), pdf-lib 1.17.1, testes `node tests/*.test.js` com `vm`, build `node scripts/build.js`.

**Spec:** pedido do usuário nesta sessão (resumido em "Requisitos" abaixo) + ficha oficial `~/Downloads/Ficha-COVID-19-05_10_20_rev (1).pdf` (1 página, A4 595,32 × 841,92 pt, PDF com texto — não é escaneado).

**Onde trabalhar:** worktree `~/Downloads/meeds-suite-covid`, branch `feat/notificacao-covid`, criada a partir de `origin/main` (c1427b3). O checkout `~/Downloads/meeds-suite` está com alterações locais e 13 commits atrás — não usar.

## Requisitos (do pedido)

| # | Requisito | Onde |
|---|---|---|
| R1 | Nova ficha dentro de "Fichas de notificação", obedecendo a ficha anexa | Tasks 1–4 |
| R2 | UF e município de notificação vêm do **Vínculo** (ex.: `CONGONHAS - MG`) | já existe (`aplicarVinculo`); Task 2 testa |
| R3 | Campos Sim/Não viram **interruptor liga/desliga** | Task 3 |
| R4 | CPF preenchido da tela; CNS preenchido quando houver (ignorar `CNS 0`) | Tasks 2 e 4 |
| R5 | Nome completo, nome da mãe, nascimento, sexo vêm da tela; raça/cor opcional | já existe + Task 2 |
| R6 | Endereço todo opcional | Tasks 2 e 4 |
| R7 | Data da notificação = hoje, editável; data do início dos sintomas **obrigatória** | Tasks 2 e 3 |
| R8 | Sintomas **obrigatórios** | Tasks 2 e 3 |
| R9 | Condições só se houver (opcional) | Tasks 2 e 3 |

## Global Constraints

- O número do paciente é **sempre o CPF** (premissa do sistema). O CNS só entra se a tela trouxer um CNS válido de 15 dígitos; nunca substitui o CPF.
- Nada do formulário é gravado em disco (sem histórico, sem modelo) — mesma regra do cabeçalho de `modules/notificacao/index.js`.
- **Nenhuma ficha existente muda de comportamento.** `tests/notificacao-{dengue,dengue-pdf,lta,aids,violencia,ibge}.test.js` continuam passando sem edição.
- Regras do build (`scripts/build.js`): sem botão posicionado em pixel, sem hook próprio de fetch/XHR, sem `eval`/`new Function`.
- Toda mensagem de erro diz o que não aconteceu, por quê e o que fazer (padrão "Não consegui gerar a ficha porque…" já existente em `mostrarErros`).
- Mexeu em `modules/` ou `dados/` → `npm run build` e commitar `dist/` junto; `npm run verificar` verde antes do PR.
- Exames, evolução, classificação final e data de encerramento **ficam em branco** para a vigilância (premissa de todas as fichas: "só a primeira consulta").
- Copy da tela em pt-BR com acento; código/comentários sem acento como no resto do módulo.

## Review Focus

1. **Paciente sem CPF / estrangeiro** — interruptor "Tem CPF?" desligado: o CPF some e deixa de ser exigido; a ficha sai com X em "Não". Teste em Task 2 (`semCpfNaoExigeCpf`).
2. **`CNS 0` ou CNS com dígito errado na tela** — o campo CNS fica vazio, nunca imprime "0". Teste em Task 2 (`extrairCnsIgnoraZero`).
3. **Início dos sintomas depois da data da notificação, ou no futuro** — recusa com mensagem. Teste em Task 2 (`inicioDepoisDaNotificacao`).
4. **Paciente masculino com "Gestante"/"Puérpera" marcados de uma sessão anterior** — as duas opções somem e não vão para o PDF quando sexo ≠ F. Teste em Task 2 (`gestanteSoComSexoF`).
5. **"Assintomático" junto com sintomas** — se excluem (marcar um limpa o outro na tela; a lógica recusa os dois juntos). Teste em Task 2 (`assintomaticoExcluiSintomas`).

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `modules/notificacao/assets/ficha-covid19.pdf` | Criar (cópia do anexo) | PDF oficial de referência |
| `modules/notificacao/assets/base-pdf-covid.js` | Gerar por script | PDF em base64, global `MEEDS_NOTIF_COVID_BASE_PDF_B64` |
| `modules/notificacao/covid-ficha.js` | Criar | Catálogos, `extrairCns`, `cnsValido`, `validar`, `montarOperacoes` → `raiz.MeedsNotificacaoCovid` |
| `modules/notificacao/covid-form.js` | Criar | Seções da tela, interruptores, coleta e condicionais → `raiz.MeedsNotificacaoCovidUi` |
| `modules/notificacao/index.js` | Modificar | Registrar a ficha, cartão, esconder campos comuns que a ficha COVID não tem, obrigatórios condicionados |
| `manifest.json` | Modificar | 3 assets novos, `resumo`/`descricao`, versão do módulo 1.3.0 |
| `tests/notificacao-covid.test.js` | Criar | Lógica + PDF gerado de verdade |
| `package.json` | Modificar | Incluir o teste novo em `verificar`; bump de versão |
| `dados/changelog.json`, `dist/*` | Modificar | Changelog e build |

---

### Task 1: Asset do PDF e catálogo de coordenadas

**Files:**
- Create: `modules/notificacao/assets/ficha-covid19.pdf`, `modules/notificacao/assets/base-pdf-covid.js`
- Create: `modules/notificacao/covid-ficha.js` (só catálogos e `CX` nesta task)
- Test: `tests/notificacao-covid.test.js`

**Interfaces:**
- Produces: `raiz.MEEDS_NOTIF_COVID_BASE_PDF_B64`; `raiz.MeedsNotificacaoCovid.{SINTOMAS, CONDICOES, RACAS, CX}`.
  - `SINTOMAS`: `[{id, rotulo, caixa:[x0,y0,x1,y1]}]` com ids `assintomatico, febre, garganta, dispneia, tosse, coriza, cabeca, gustativos, olfativos, outros`.
  - `CONDICOES`: ids `respiratoria, diabetes, obesidade, renal, imunossupressao, cromossomica, gestante, cardiaca, puerpera` (rótulos copiados da ficha: "Doenças respiratórias crônicas descompensadas", "Doenças renais crônicas em estágio avançado (graus 3, 4 e 5)", "Portador de doenças cromossômicas ou estado de fragilidade imunológica", "Puérpera (até 45 dias do parto)", …).
  - `RACAS`: `[{v:"branca",r:"Branca"},{v:"preta",r:"Preta"},{v:"amarela",r:"Amarela"},{v:"parda",r:"Parda"},{v:"indigena",r:"Indígena"},{v:"ignorado",r:"Ignorado"}]`, cada uma com `caixa`.
  - `CX`: caixas e linhas de base de texto, origem no canto **superior esquerdo** (mesma convenção de `violencia-ficha.js`): `ufNotif` (pente 2 células), `municipioNotif`, `temCpf.{sim,nao}`, `estrangeiro.{sim,nao}`, `profSaude.{sim,nao}`, `profSeguranca.{sim,nao}`, `cbo`, `cpf` (pente 11), `cns` (pente 15), `nome`, `mae`, `nascimento`, `pais`, `sexo.{M,F}`, `etnia`, `passaporte`, `cep` (pente 8), `ufRes` (pente 2), `municipioRes`, `logradouro`, `numero`, `bairro`, `complemento`, `celular`, `contato`, `dataNotificacao`, `inicioSintomas`, `sintomaOutros`, `observacoes` (bloco de linhas).

- [ ] **Step 1: Copiar o PDF e gerar o asset**

```bash
cp "$HOME/Downloads/Ficha-COVID-19-05_10_20_rev (1).pdf" modules/notificacao/assets/ficha-covid19.pdf
node scripts/gerar-asset-pdf.js modules/notificacao/assets/ficha-covid19.pdf modules/notificacao/assets/base-pdf-covid.js MEEDS_NOTIF_COVID_BASE_PDF_B64 "Ficha de Investigacao de SG suspeito de COVID-19 (e-SUS Notifica, 05/10/2020)"
```
Expected: `Gerado: modules/notificacao/assets/base-pdf-covid.js (~700 KB, global MEEDS_NOTIF_COVID_BASE_PDF_B64)`.

- [ ] **Step 2: Medir as coordenadas**

Run: `pdftotext -bbox-layout modules/notificacao/assets/ficha-covid19.pdf /tmp/covid-bbox.html`
Cada `|__|` aparece como palavra com `xMin/yMin/xMax/yMax` (já em pt, origem superior esquerda). Caixa = bbox do `|__|`; texto livre começa 4 pt depois do `xMax` do rótulo, linha de base = `yMax` do rótulo − 1,5. Pentes (CPF/CNS/CEP/UF): `bordas` = os `|` em sequência, `cy` = centro vertical.

- [ ] **Step 3: Escrever o teste do catálogo**

```js
// tests/notificacao-covid.test.js — mesmo esqueleto de notificacao-violencia.test.js
// carrega: assets/base-pdf-covid.js, assets/municipios-ibge.js, dengue-ficha.js, covid-ficha.js
ok("PDF base e A4 de 1 pagina", doc.getPageCount() === 1 && Math.round(doc.getPage(0).getWidth()) === 595);
ok("10 sintomas, 9 condicoes, 6 racas", C.SINTOMAS.length === 10 && C.CONDICOES.length === 9 && C.RACAS.length === 6);
ok("toda caixa cabe na pagina", todasAsCaixas(C).every(([x0, y0, x1, y1]) => x0 < x1 && y0 < y1 && x1 <= 595 && y1 <= 842));
```

- [ ] **Step 4:** `node tests/notificacao-covid.test.js` → FALHA (`covid-ficha.js` não existe).
- [ ] **Step 5:** Criar `covid-ficha.js` com cabeçalho no padrão de `violencia-ficha.js` (premissas + "COORDENADAS: pontos, origem no canto superior esquerdo") e os catálogos medidos.
- [ ] **Step 6:** `node tests/notificacao-covid.test.js` → todos `ok`.
- [ ] **Step 7: Commit** — `git add modules/notificacao/assets/ficha-covid19.pdf modules/notificacao/assets/base-pdf-covid.js modules/notificacao/covid-ficha.js tests/notificacao-covid.test.js && git commit -m "feat(notificacao): PDF e coordenadas da ficha COVID-19"`

---

### Task 2: Validação e leitura de CNS (lógica pura)

**Files:**
- Modify: `modules/notificacao/covid-ficha.js`
- Test: `tests/notificacao-covid.test.js`

**Interfaces:**
- Consumes: `raiz.MeedsNotificacaoDengue.base.{novoContexto, cpfValido, soDigitos, lerData, diasEntre, vazio, lista}`.
- Produces:
  - `extrairCns(linhas: string[]) -> string` — primeiro token de exatamente 15 dígitos que passa em `cnsValido`; senão `""`.
  - `cnsValido(v: string) -> boolean` — `/^[12789]\d{14}$/`, não todos iguais, `Σ dígito[i]·(15−i) ≡ 0 (mod 11)`.
  - `validar(d, hojeIso) -> [{campo, mensagem}]`.
  - Objeto de dados `d` (chaves que o form entrega): os comuns de `coletarBase()` em `index.js` (`nome, nascimento, sexo, raca, cpf, mae, ufRes, municipioRes, bairro, logradouro, numero, complemento, cep, telefone, ufNotif, municipioNotif, observacoes`) **mais** `temCpf:boolean, estrangeiro:boolean, profSaude:boolean, profSeguranca:boolean, cbo, cns, pais, passaporte, etnia, telContato, dataNotificacao, inicioSintomas, sintomas:string[], sintomaOutros, condicoes:string[]`.

Regras (cada uma vira uma mensagem):

| campo | regra | mensagem (início) |
|---|---|---|
| `ufNotif`, `municipioNotif` | obrigatórios | "Falta a UF/o município da notificação — vêm do Vínculo; escolha da lista." |
| `cpf` | se `temCpf`: obrigatório e `cpfValido` | "O CPF não é válido…" |
| `cns` | se preenchido: `cnsValido` | "O CNS tem 15 dígitos e não confere. Confira ou deixe em branco." |
| `nome`, `nascimento`, `sexo` | obrigatórios (sexo só M/F — a ficha não tem "Ignorado") | reaproveitar textos de `validarPaciente` |
| `dataNotificacao` | obrigatória, não futura | |
| `inicioSintomas` | obrigatório, não futuro, ≤ `dataNotificacao` | "O início dos sintomas não pode ser depois da data da notificação." |
| `sintomas` | ≥ 1; `assintomatico` não convive com outro; `outros` exige `sintomaOutros` | "Marque ao menos um sintoma ou “Assintomático”." |
| `cep` | se preenchido, 8 dígitos | |
| `condicoes` | opcional; `gestante`/`puerpera` recusados se `sexo !== "F"` | |

Endereço, telefones, raça, mãe, CBO, país, passaporte: **opcionais**.

- [ ] **Step 1: Testes** (constante `MINIMO` = Congonhas/MG, CPF `52998224725`, nascimento `1969-06-16`, sexo `M`, `dataNotificacao = HOJE = "2026-11-25"`, `inicioSintomas = "2026-11-22"`, `sintomas = ["febre","tosse"]`, `temCpf = true`)

```js
ok("minimo passa", C.validar(MINIMO, HOJE).length === 0);
ok("vinculo do print", JSON.stringify(D.interpretarVinculo(["CONGONHAS - MG", "PSF IDEAL"])) === JSON.stringify({ municipio: "Congonhas", uf: "MG", unidade: "PSF IDEAL" }));
ok("extrairCnsIgnoraZero", C.extrairCns(["CPF 71305890604", "CNS 0"]) === "");
ok("extrairCns acha valido", C.extrairCns(["CPF 71305890604", "CNS 700000000000005"]) === "700000000000005");
ok("cns todo zero recusado", !C.cnsValido("000000000000000"));
ok("semCpfNaoExigeCpf", C.validar({ ...MINIMO, temCpf: false, cpf: "" }, HOJE).length === 0);
ok("comCpfExigeCpf", campos(C.validar({ ...MINIMO, cpf: "" }, HOJE)).includes("cpf"));
ok("inicio obrigatorio", campos(C.validar({ ...MINIMO, inicioSintomas: "" }, HOJE)).includes("inicioSintomas"));
ok("inicioDepoisDaNotificacao", campos(C.validar({ ...MINIMO, dataNotificacao: "2026-11-20" }, HOJE)).includes("inicioSintomas"));
ok("sintomas obrigatorios", campos(C.validar({ ...MINIMO, sintomas: [] }, HOJE)).includes("sintomas"));
ok("assintomaticoExcluiSintomas", campos(C.validar({ ...MINIMO, sintomas: ["assintomatico", "febre"] }, HOJE)).includes("sintomas"));
ok("outros exige texto", campos(C.validar({ ...MINIMO, sintomas: ["outros"] }, HOJE)).includes("sintomaOutros"));
ok("gestanteSoComSexoF", campos(C.validar({ ...MINIMO, condicoes: ["gestante"] }, HOJE)).includes("condicoes"));
ok("endereco vazio passa", C.validar({ ...MINIMO, ufRes: "", municipioRes: "", telefone: "" }, HOJE).length === 0);
```

- [ ] **Step 2:** rodar → FALHA (`C.validar is not a function`).
- [ ] **Step 3:** Implementar `extrairCns`, `cnsValido`, `validar` em `covid-ficha.js` (etapas no estilo `validarOcorrencia/validarPessoa` de `violencia-ficha.js`, contexto de `D().base.novoContexto`).
- [ ] **Step 4:** rodar → todos `ok`; rodar também `node tests/notificacao-dengue.test.js` → sem regressão.
- [ ] **Step 5: Commit** — `feat(notificacao): validacao da ficha COVID-19 e leitura do CNS`

---

### Task 3: Desenho no PDF

**Files:**
- Modify: `modules/notificacao/covid-ficha.js`
- Test: `tests/notificacao-covid.test.js`

**Interfaces:**
- Consumes: `D().base.{criarDesenho, ddmmaaaa, soDigitos}`, `D().aplicarNoPdf(PDFLib, doc, ops)`; `CX`, `SINTOMAS`, `CONDICOES`, `RACAS` da Task 1.
- Produces: `montarOperacoes(d, hojeIso) -> ops[]` (todas em `pg: 0`).

Regras de desenho:
- Interruptor ligado → `"X"` na caixa **Sim**; desligado → `"X"` na **Não** (os quatro: Tem CPF, Estrangeiro, Profissional de saúde, Profissional de segurança). Nunca os dois em branco.
- CPF/CNS/CEP/UFs em pente, um dígito por célula; datas `dd/mm/aaaa` com `ddmmaaaa`.
- Sintomas, condições, sexo, raça: `"X"` só nas marcadas; condições não marcadas ficam em branco ("se houver").
- `sintomaOutros` ao lado de "Outros"; `etnia` só se raça = indígena; `observacoes` em bloco nas linhas de "Informações complementares e observações".
- Teste, evolução, classificação e encerramento: nenhuma operação.

- [ ] **Step 1: Testes**

```js
const ops = C.montarOperacoes(COMPLETO, HOJE);
const xEm = (cx) => ops.some((o) => o.texto === "X" && Math.abs(o.cx - (cx[0] + cx[2]) / 2) < 0.5 && Math.abs(o.cy - (cx[1] + cx[3]) / 2) < 0.5);
ok("Tem CPF ligado marca Sim", xEm(C.CX.temCpf.sim) && !xEm(C.CX.temCpf.nao));
ok("Estrangeiro desligado marca Nao", xEm(C.CX.estrangeiro.nao));
ok("CPF em 11 celulas", ops.filter((o) => o.tipo === "centro" && /^\d$/.test(o.texto) && o.cy === C.CX.cpf.cy).length === 11);
ok("sem CNS nao desenha pente", C.montarOperacoes({ ...COMPLETO, cns: "" }, HOJE).every((o) => o.cy !== C.CX.cns.cy));
ok("data notificacao dd/mm/aaaa", ops.some((o) => o.texto === "25/11/2026"));
ok("nada no encerramento", ops.every((o) => (o.y !== undefined ? o.y : o.cy) < C.CX.limiteEncerramento));
// PDF de verdade, como notificacao-violencia.test.js
const bytes = await gerarPdf(COMPLETO); ok("PDF abre", (await PDFLib.PDFDocument.load(bytes)).getPageCount() === 1);
if (process.env.NOTIF_SAIDA) fs.writeFileSync(path.join(process.env.NOTIF_SAIDA, "covid-completo.pdf"), bytes);
```
(`CX.limiteEncerramento` = `yMin` do rótulo "Estado do Teste" — tudo abaixo é da vigilância.)

- [ ] **Step 2:** rodar → FALHA.
- [ ] **Step 3:** Implementar `montarOperacoes` com uma função por bloco da ficha (`secaoNotificacao`, `secaoIdentificacao`, `secaoEndereco`, `secaoClinica`, `secaoObservacoes`), como em `violencia-ficha.js`.
- [ ] **Step 4:** rodar → `ok`; depois `mkdir -p /tmp/fichas && NOTIF_SAIDA=/tmp/fichas node tests/notificacao-covid.test.js` e **abrir `/tmp/fichas/covid-completo.pdf`**: cada X dentro da sua caixa, textos na linha, nada sobre rótulos. Ajustar `CX` até ficar certo.
- [ ] **Step 5: Commit** — `feat(notificacao): desenho da ficha COVID-19 sobre o PDF oficial`

---

### Task 4: Tela da ficha (`covid-form.js`) e ligação no `index.js`

**Files:**
- Create: `modules/notificacao/covid-form.js`
- Modify: `modules/notificacao/index.js`, `manifest.json`
- Test: `tests/smoke-notificacao.html` (manual, ver `docs/TESTES.md`) + `npm run verificar`

**Interfaces:**
- Consumes: `FERR` de `index.js` (`esc, checks, opcoes, opcoesUf, campo, valor, marcados, el, ficha, hoje, radio, limparGrupo`); `MeedsNotificacaoCovid` (Tasks 1–3); `d.dom.lerLinhasPorRotulo`.
- Produces: `raiz.MeedsNotificacaoCovidUi = { IDS_DATA, secao(h), coletar(h), condicionais(h, dados), reconciliar(h, alvo), obrigatorios(h) }` — mesmo contrato de `MeedsNotificacaoViolenciaUi`.

**Tela (ordem pensada para velocidade — o que vem da tela fica recolhido, o que o médico decide fica no topo):**
1. **Dados clínicos** (aberto, primeiro): Data da notificação (`nt-c-data-notif`, nasce com hoje, `max` = hoje) · Início dos sintomas * (`nt-c-inicio`, `max` = hoje) · Sintomas * em chips (`checks("c-sint", SINTOMAS)`), "Outros" abre `nt-c-sint-outros` · Condições (opcional) em chips (`checks("c-cond", CONDICOES)`); `gestante`/`puerpera` escondidas e desmarcadas quando sexo ≠ F.
2. **Identificação** — quatro interruptores numa linha: `nt-c-tem-cpf`, `nt-c-estrangeiro`, `nt-c-prof-saude`, `nt-c-prof-seg`, marcação `<label class="nt-switch"><input type="checkbox" role="switch" id="…"><span class="nt-slider"></span> Tem CPF?</label>`; CSS copiado de `.msm-switch` em `core/manager.js:86-94` renomeado para `.nt-switch/.nt-slider`. Condicionais: `Tem CPF?` desligado esconde `nt-cpf`; `Estrangeiro` ligado mostra País de origem + Passaporte; qualquer profissional ligado mostra CBO. CNS (`nt-c-cns`, opcional). Raça/cor como chips de rádio opcionais; "Indígena" mostra Etnia.
3. Seções comuns já existentes (Paciente, Residência, Unidade, Observações) — reaproveitadas; telefone celular = `nt-telefone`, mais `nt-c-tel-contato` opcional.

**Mudanças em `index.js`:**
- `FICHAS.covid = { titulo: "Ficha de investigação — COVID-19 (síndrome gripal)", info: "Ficha do e-SUS Notifica da primeira consulta. Exames, evolução, classificação e encerramento ficam para a vigilância.", pdf: "MEEDS_NOTIF_COVID_BASE_PDF_B64" }`.
- `const CV = function () { return raiz.MeedsNotificacaoCovid; };` e `logicaDaFicha()` devolve `CV()` quando `ficha === "covid"`.
- `U()`: incluir `raiz.MeedsNotificacaoCovidUi` em `uis`; `obrigatorios` passa a concatenar `uis.map(u => u.obrigatorios ? u.obrigatorios(h) : [])` (hoje só lê violência — a AIDS não tem a função, por isso o `?`).
- Cartão na tela de escolha: `cartaoFicha({ id: "covid", cor: "#2f7d4f", svg: SVG_COVID, nome: "COVID-19 (síndrome gripal)", sub: "Quadro respiratório agudo — e-SUS Notifica", cid: "B34.2" })` + SVG próprio no estilo das pranchas existentes; `.nt-cartoes` passa de 4 para `repeat(auto-fill,minmax(160px,1fr))` para caber 5.
- CSS: `.nt-so-covid` igual às demais; nova regra `#nt-modal[data-ficha="covid"] .nt-nao-covid { display:none; }` e a classe `nt-nao-covid` nos wrappers de Gestante, Escolaridade, Ocupação, Zona, Ponto de referência, CNES e no select de médico (a ficha COVID não tem esses campos).
- `OBRIGATORIOS`: entradas `gestante`, `ufRes`, `municipioRes`, `telefone` ganham `so` que devolve falso com `ficha === "covid"` (preservando o `so` atual de `gestante`). `sexo` aponta para o mesmo `id` (já existe).
- `escolherFicha("covid")`: se `nt-c-data-notif` vazio → hoje; se `nt-c-tem-cpf` nunca mexido → ligado quando `nt-cpf` tem valor; CNS: `preencherSeVazio("nt-c-cns", CV().extrairCns(d.dom.lerLinhasPorRotulo(["Documentos", "CNS"]) || []))`.
- `limparForm()`: nada a mais (os interruptores são checkbox e já são limpos).
- `produzirPdf()`: nome do arquivo `NOTIFICACAO_COVID19_<NOME>.pdf`.
- Tutorial e `descricao` do `registerModule`: acrescentar COVID-19; versão do módulo `1.3.0`.

**`manifest.json`:** em `assets` acrescentar `modules/notificacao/assets/base-pdf-covid.js`, `modules/notificacao/covid-ficha.js`, `modules/notificacao/covid-form.js` (lógica antes do form); `resumo`: `"SINAN/e-SUS: dengue, LTA, AIDS, violência e COVID-19."`; `versao`: `"1.3.0"`.

- [ ] **Step 1:** Escrever `covid-form.js` e as mudanças acima.
- [ ] **Step 2:** `npm run build` → sem erro de regra de arquitetura.
- [ ] **Step 3:** Smoke manual: servir a pasta, abrir `tests/smoke-notificacao.html` com um cartão de paciente igual ao do print (`DOROEDSON…`, `16/06/1969`, `CPF 71305890604` / `CNS 0`, Vínculo `CONGONHAS - MG` / `PSF IDEAL`, Parentesco com 2 nomes). Conferir: UF MG + Congonhas preenchidos; CPF formatado e "Tem CPF?" ligado; CNS vazio; mãe vazia (2 nomes sem rótulo — comportamento atual correto); data da notificação = hoje; Gestante/Puérpera ocultas; "Gerar" sem sintomas aponta "Sintomas" e "Início dos sintomas"; com eles, baixa `NOTIFICACAO_COVID19_DOROEDSON_HERMENEGILDO_PINTO.pdf`.
- [ ] **Step 4:** Abrir dengue, LTA, AIDS e violência no mesmo smoke: Escolaridade/Zona/Gestante voltam a aparecer e os obrigatórios de residência/telefone continuam valendo.
- [ ] **Step 5: Commit** — `feat(notificacao): tela da ficha COVID-19 com interruptores e leitura do CNS`

---

### Task 5: Integração no CI, versão e changelog

**Files:**
- Modify: `package.json`, `dados/changelog.json`, `dist/*` (gerado), `docs/manual` se listar as fichas

- [ ] **Step 1:** `package.json` → acrescentar `&& node tests/notificacao-covid.test.js` logo após `notificacao-violencia.test.js` em `verificar`; versão `2.79.0` (minor: função nova). Seguir `docs/RELEASE.md` para o bump nos demais pontos de versão.
- [ ] **Step 2:** `dados/changelog.json` → entrada 2.79.0: "Nova ficha de notificação: COVID-19 (síndrome gripal, e-SUS Notifica). UF e município vêm do vínculo, CPF/CNS e dados do paciente da tela; o médico informa data do início dos sintomas e sintomas."
- [ ] **Step 3:** `npm run build && npm run verificar` → verde (inclui ESLint).
- [ ] **Step 4: Commit** — `chore(notificacao): versao 2.79.0, changelog e teste no verificar` e abrir PR para `main`.

---

## Decisões que o revisor deve confirmar

1. **Sexo** sem "Ignorado" na ficha COVID (a ficha só tem Masculino/Feminino) → obrigatório M ou F.
2. **Nome da mãe** opcional (vem da tela quando dá; no print há 2 nomes sem rótulo e o código atual deixa em branco de propósito para não gravar o nome errado).
3. **Exames, evolução e classificação** fora da tela (ficam para a vigilância, como nas outras fichas). Se quiser registrar "Estado do teste" na teleconsulta, vira uma task a mais.
4. **Interruptor** só nos quatro campos Sim/Não da ficha; sintomas e condições ficam em chips de marcar (é lista múltipla, não Sim/Não).
