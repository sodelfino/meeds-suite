# Protocolos Callmed: avisos de município e listagem de exames — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alinhar os avisos de município (`modules/avisos-municipio`) e a mensagem de "exame não consta" (`modules/exames`) aos três protocolos assistenciais estruturados pelo RT médico (Dr. Guilherme Borges / Callmed), corrigindo duas lacunas de dado e uma mensagem desalinhada com a conduta oficial.

**Architecture:** Nenhum mecanismo novo é necessário. `modules/avisos-municipio` já suporta `pode`/`naoPode`/`orientacoes` por município e por unidade — as lacunas encontradas se resolvem editando `dados/avisos-municipio.json` e rodando `npm run build` (o pacote embute o JSON). A mensagem de "exame não consta" em `modules/exames/index.js` está hoje incompleta frente ao Protocolo 1 (não menciona a solicitação com justificativa clínica) — a correção extrai o texto para uma função pura testável sem harness de DOM.

**Tech Stack:** JavaScript puro (userscript), Node para testes (`node tests/*.test.js`), build via `scripts/build.js`.

**Spec:** Os três PDFs fornecidos pelo usuário (não versionados no repo):
- `CallMed Protocolo 1 Fluxo Atendimento - UPAs.pdf` — fluxo UPA, quando agir antes de encaminhar, teleatendimento elegível, Memed vs texto livre, SIGTAP.
- `CallMed Protocolo 2 Telemedicina UBS-ESF.pdf` — teleatendimento em UBS/ESF, condutas completas por tipo de demanda.
- `CallMed Protocolo 3 Condutas por Unidade.pdf` — matriz de condutas por unidade (Barbacena, Franco da Rocha, Barra, Congonhas, Macaé). **Esta é a fonte principal das mudanças de dado abaixo — seção 3 e 4 do documento.**

Confirmado com o usuário nesta sessão: a "UPA da Barra" do Protocolo 3 é a mesma unidade já cadastrada como `UPA UNIDADE DE PRONTO ATENDIMENTO BARRA` dentro de Macaé em `dados/avisos-municipio.json` — as regras dela ficaram mais completas, não é uma unidade nova.

## Global Constraints

- Nunca alterar `dados/avisos-municipio.json` sem rodar `npm run build` depois — o pacote (`dist/*.user.js`) embute o JSON, e o build desatualizado é como o bug de município já resolvido em versões anteriores.
- Todo texto de aviso é português, tom direto, sem jargão desnecessário — seguir o estilo já usado nas entradas existentes (Barbacena, Franco da Rocha, Piraí).
- `npm run verificar` tem que passar limpo (build --check, todos os testes, eslint --quiet) antes de cada commit.
- Publicação segue o padrão já estabelecido no repo: bump de versão em `package.json` + `manifest.json`, entrada nova em `dados/changelog.json`, `npm run build`, `npm run verificar`, commit, push, **e `gh release create`** (o "latest" do GitHub é o que o fallback do iPad e o Tampermonkey enxergam — esquecer o release já causou um bug de "atualização não disponível" nesta sessão).
- Nenhum dado de paciente entra em nenhum dos arquivos tocados aqui — todos são conteúdo estático (regras de município, texto de UI).

## Review Focus

- **Unidade "UPA Barra" de Macaé recebendo alta sem o aviso de reavaliação.** O Protocolo 3 exige reavaliação por telemedicina após a medicação e os resultados dos exames nessa unidade — se o texto novo não deixar isso claro no aviso, o médico pode dar alta sem reagendar. Coberto pelo teste da Task 1 que verifica a presença da palavra "reavaliação" no corpo do aviso.
- **Congonhas: dipirona em comprimido passando pelo aviso sem alerta.** O Protocolo 3 é explícito — REMUME de Congonhas só dispensa dipirona em gotas. Um médico de fora do município prescreveria comprimido por hábito. Coberto pelo teste da Task 2 que verifica a presença de "dipirona" e "gotas" no corpo do aviso de Congonhas.
- **Renovação de receita em Congonhas sem a receita prévia em mãos.** O protocolo condiciona a renovação à apresentação da receita anterior — sem esse aviso, o médico pode renovar de memória, sem comprovação de posologia. Coberto pelo teste da Task 2.
- **Mensagem de exame "não consta" sugerindo apenas encaminhamento, quando o Protocolo 1 manda solicitar mesmo assim.** O texto atual (`modules/exames/index.js:818-820`) diz "o caminho é o fluxo de encaminhamento ou a regulação" — omite a orientação central do Protocolo 1 (art. 32 do Código de Ética Médica): solicitar o exame fora da SIGTAP mesmo assim, com justificativa clínica em prontuário. Um médico que segue só a mensagem atual pode deixar de solicitar um exame necessário. Coberto pelo teste da Task 3.
- **Regressão nas unidades de Macaé já corretas (UPA Lagomar, PS Imbetiba, PS Parque Aeroporto, Casa da Criança, Clínica do Autista) ao editar o JSON.** Editar `dados/avisos-municipio.json` à mão é o tipo de mudança que corrompe uma vírgula e quebra o JSON inteiro, ou edita a chave errada. Coberto rodando a suíte completa de `tests/avisos-municipio.test.js` (já existente, 40+ asserções) em cada task, não só o teste novo.

---

## Arquivos afetados

- `dados/avisos-municipio.json` — editado nas Tasks 1 e 2 (dado puro, sem lógica).
- `tests/avisos-municipio.test.js` — estendido nas Tasks 1 e 2 (harness já existe, só acrescenta blocos de teste no padrão já usado no arquivo).
- `modules/exames/index.js` — editado na Task 3: extrai a mensagem de "não consta" para uma função pura `mensagemNaoConsta(municipio)`, testável sem harness de DOM.
- `tests/mensagem-nao-consta.test.js` — novo, Task 3.
- `package.json`, `manifest.json`, `dados/changelog.json`, `dist/*` — Task 4 (publicação).

---

### Task 1: UPA Barra (Macaé) — matriz completa do Protocolo 3

**Files:**
- Modify: `dados/avisos-municipio.json` (bloco `municipios.Macaé.unidades["UPA Barra"]`)
- Test: `tests/avisos-municipio.test.js` (novo bloco, seguindo o padrão dos blocos numerados existentes)

**Interfaces:**
- Consumes: nada de outra task.
- Produces: nenhuma interface nova — só dado que `modules/avisos-municipio/index.js` (já existente, não modificado) já sabe ler via `montarAviso()`/`linhasDe()`.

- [ ] **Step 1: Ler o bloco atual de "UPA Barra" para confirmar o texto exato a substituir**

Ler `dados/avisos-municipio.json`. O bloco atual (dentro de `municipios.Macaé.unidades`) é:

```json
"UPA Barra": {
  "titulo": "Macaé — UPA Barra",
  "nomes": [
    "UPA UNIDADE DE PRONTO ATENDIMENTO BARRA"
  ],
  "naoPode": [
    {
      "item": "Encaminhamento para especialidades",
      "fazer": "orientar o paciente a procurar a UBS mais próxima"
    }
  ]
}
```

- [ ] **Step 2: Escrever o teste que falha primeiro**

Adicionar ao final de `tests/avisos-municipio.test.js` (depois do último bloco numerado, antes do bloco de UNIDADE de Macaé que já testa `macae([PMM, unidade])` — usar a mesma função `macae()` e `textoDe()` já definidas no arquivo):

```javascript
/* 22. Protocolo 3 (Documento 3, 30/09/2026): a UPA Barra de Macaé passou a
 *     ter medicação EV/IM/VO na unidade, exames pertinentes ao PA e
 *     atestado com critério — mas exige reavaliação por telemedicina após
 *     a medicação e os resultados. Exames eletivos continuam indo para a
 *     UBS, e a Clínica do Autista/Casa da Criança continuam ligadas ao
 *     "não oferta especialista" que já existia (agora reforçado pela
 *     reavaliação, não substituído). */
{
  const t = macae([PMM, "UPA UNIDADE DE PRONTO ATENDIMENTO BARRA"]);
  const v = t.visiveis();
  const texto = textoDe(v[0]);
  ok("UPA Barra: aviso abre", v.length === 1);
  ok("UPA Barra: medicação VO/IM/EV na unidade", /VO/.test(texto) && /IM/.test(texto) && /EV/.test(texto));
  ok("UPA Barra: exames pertinentes ao pronto atendimento", /exame/i.test(texto));
  ok("UPA Barra: atestado com critério", /atestado/i.test(texto));
  ok("UPA Barra: pede reavaliação por telemedicina depois da medicação/exames",
     /reavalia/i.test(texto));
  ok("UPA Barra: exames eletivos continuam indo para a UBS",
     /eletivo/i.test(texto) && /UBS/.test(texto));
}
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `node tests/avisos-municipio.test.js`
Expected: FALHA nas linhas "medicação VO/IM/EV na unidade", "atestado com critério", "pede reavaliação..." e "exames eletivos..." (o bloco atual só tem o item de encaminhamento a especialidade).

- [ ] **Step 4: Substituir o bloco no JSON**

Em `dados/avisos-municipio.json`, trocar o bloco `"UPA Barra": { ... }` (dentro de `municipios.Macaé.unidades`) por:

```json
"UPA Barra": {
  "titulo": "Macaé — UPA Barra",
  "nomes": [
    "UPA UNIDADE DE PRONTO ATENDIMENTO BARRA"
  ],
  "pode": [
    "Medicação VO, IM e EV na unidade",
    "Exames pertinentes ao pronto atendimento (hemograma, eletrólitos, função renal, glicemia, urina, ECG, radiografia, conforme oferta local)",
    "Atestado com critério"
  ],
  "naoPode": [
    {
      "item": "Encaminhamento para especialidades",
      "fazer": "orientar o paciente a procurar a UBS mais próxima"
    },
    {
      "item": "Exames eletivos, sem relação com a queixa aguda",
      "fazer": "encaminhar à UBS"
    }
  ],
  "orientacoes": [
    "Depois da medicação e dos resultados dos exames, solicitar reavaliação por telemedicina para decidir entre alta, nova conduta ou atendimento presencial."
  ]
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `node tests/avisos-municipio.test.js`
Expected: PASS em todas as linhas, incluindo as 5 novas do bloco 22 e as pré-existentes (UPA Lagomar, PS Imbetiba, PS Parque Aeroporto, Casa da Criança, Clínica do Autista — nenhuma delas deve mudar).

- [ ] **Step 6: Rebuild e verificação completa**

Run: `npm run build && npm run verificar`
Expected: build reporta `avisos-municipio` normalmente; `verificar` termina em "todos passaram" em cada arquivo de teste e 0 erros de eslint.

- [ ] **Step 7: Commit**

```bash
git add dados/avisos-municipio.json tests/avisos-municipio.test.js
git commit -m "$(cat <<'EOF'
feat(avisos-municipio): UPA Barra (Macaé) ganha a matriz completa do Protocolo 3

O aviso da UPA Barra só bloqueava encaminhamento a especialidade. O
Protocolo 3 (Documento 3, Callmed) da RT médica traz uma matriz bem
mais completa para essa unidade: medicação VO/IM/EV na própria
unidade, exames pertinentes ao pronto atendimento, atestado com
critério, exames eletivos indo para a UBS, e uma exigência de
reavaliação por telemedicina depois da medicação e dos resultados —
que não existia no aviso.

Confirmado nesta sessão: é a mesma UPA Barra já cadastrada em Macaé,
não uma unidade nova.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Congonhas — dipirona só em gotas e renovação só com receita prévia

**Files:**
- Modify: `dados/avisos-municipio.json` (bloco `municipios.Congonhas`)
- Test: `tests/avisos-municipio.test.js` (novo bloco)

**Interfaces:**
- Consumes: nada de outra task.
- Produces: nenhuma interface nova.

- [ ] **Step 1: Ler o bloco atual de Congonhas**

```json
"Congonhas": {
  "titulo": "Município de Congonhas (MG)",
  "orientacoes": [
    "Exames do laboratório da UPA devem ser pedidos juntos. Qualquer exame fora da lista deve ir em pedido separado — senão o paciente não consegue marcar. Consulte a listagem de exames do Assistente."
  ]
}
```

- [ ] **Step 2: Escrever o teste que falha primeiro**

Adicionar ao final de `tests/avisos-municipio.test.js`:

```javascript
/* 23. Protocolo 3 (Documento 3, 30/09/2026): Congonhas é UBS/ESF de
 *     demanda espontânea, com duas regras específicas que faltavam no
 *     aviso — renovação de receita só com a receita prévia em mãos, e a
 *     REMUME do município só dispensa dipirona em gotas (não em
 *     comprimido). A orientação de exames do laboratório, já existente,
 *     continua valendo. */
{
  const t = carregar();
  t.ir("/atendimento/" + ID);
  t.rede(atendimentoDe("PREFEITURA MUNICIPAL DE CONGONHAS"));
  const v = t.visiveis();
  const texto = textoDe(v[0]);
  ok("Congonhas: aviso abre", v.length === 1);
  ok("Congonhas: renovação de receita exige a receita prévia",
     /receita pr[eé]via/i.test(texto));
  ok("Congonhas: dipirona só em gotas, não em comprimido",
     /dipirona/i.test(texto) && /gotas/i.test(texto));
  ok("Congonhas: a orientação de exames do laboratório continua",
     /pedidos juntos/.test(texto) && /pedido separado/.test(texto));
}
```

Confirmado nesta sessão: `atendimentoDe("PREFEITURA MUNICIPAL DE CONGONHAS")` é exatamente o texto já usado nos blocos existentes que testam Congonhas (linhas ~433 e ~461 do arquivo original) — usar o mesmo, para não introduzir uma segunda forma de nomear o mesmo município.

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `node tests/avisos-municipio.test.js`
Expected: FALHA em "renovação de receita exige a receita prévia" e "dipirona só em gotas" (o bloco atual não tem esse texto).

- [ ] **Step 4: Substituir o bloco no JSON**

```json
"Congonhas": {
  "titulo": "Município de Congonhas (MG)",
  "naoPode": [
    {
      "item": "Renovar receita sem a receita prévia em mãos",
      "fazer": "pedir ao paciente a receita anterior, para comprovar uso e posologia"
    }
  ],
  "orientacoes": [
    "REMUME de Congonhas: dipirona é dispensada apenas em gotas, não em comprimido — prescrever na apresentação certa para o paciente conseguir retirar.",
    "Exames do laboratório da UPA devem ser pedidos juntos. Qualquer exame fora da lista deve ir em pedido separado — senão o paciente não consegue marcar. Consulte a listagem de exames do Assistente."
  ]
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `node tests/avisos-municipio.test.js`
Expected: PASS em todas as linhas, incluindo o bloco 23 novo e os blocos pré-existentes que testam Congonhas (linha ~433-437 e ~461-464 do arquivo original — confirmado nesta sessão que `atendimentoDe("PREFEITURA MUNICIPAL DE CONGONHAS")` é exatamente a forma já usada nesses blocos).

- [ ] **Step 6: Rebuild e verificação completa**

Run: `npm run build && npm run verificar`
Expected: "todos passaram" em cada teste, 0 erros de eslint.

- [ ] **Step 7: Commit**

```bash
git add dados/avisos-municipio.json tests/avisos-municipio.test.js
git commit -m "$(cat <<'EOF'
feat(avisos-municipio): Congonhas — dipirona só em gotas e receita prévia

O aviso de Congonhas só falava dos exames do laboratório da UPA. O
Protocolo 3 (Documento 3, Callmed) traz duas regras específicas da
UBS/ESF de Congonhas que faltavam: a renovação de receita só pode ser
feita com a receita anterior em mãos (para comprovar uso e
posologia), e a REMUME do município só dispensa dipirona em gotas,
nunca em comprimido.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Mensagem de "exame não consta" alinhada ao Protocolo 1 (art. 32 do CEM)

**Files:**
- Modify: `modules/exames/index.js` (extrai a mensagem de dentro de `redesenhar()`, por volta da linha 808-824, para uma função nova `mensagemNaoConsta(municipio)`)
- Create: `tests/mensagem-nao-consta.test.js`

**Interfaces:**
- Consumes: nada de outra task.
- Produces: `mensagemNaoConsta(municipio)` — função pura, `(string) => string` (HTML), usada só dentro de `modules/exames/index.js`. Não exportada para `raiz.MeedsSuite*` porque nenhum outro módulo precisa dela.

- [ ] **Step 1: Ler o trecho atual completo**

Em `modules/exames/index.js`, o trecho (dentro de `redesenhar()`) é:

```javascript
    if (!visiveis.length) {
      /* A MENSAGEM E ESPECIFICA DE PROPOSITO. "Nenhum resultado" faria o
       * medico achar que errou a digitacao. O que aconteceu foi outra
       * coisa, e ela muda a conduta: este municipio nao oferece. */
      refs.vazio.innerHTML =
        "<b>Não consta na lista de " + escapar(municipioEscolhido) + ".</b><br>" +
        "Isso não quer dizer que o exame não exista — quer dizer que ele não está na lista que este município publicou. " +
        "Confira a grafia; se estiver certa, o caminho é o fluxo de encaminhamento ou a regulação.";
      refs.vazio.classList.remove("oculto");
      atualizarRodape();
      return;
    }
```

- [ ] **Step 2: Escrever o teste que falha primeiro**

O padrão já estabelecido neste repositório para testar uma função interna de um módulo sem harness de DOM é expor um hook `_algumaCoisa` no objeto passado a `registerModule` (ver `_verificar` em `modules/avisos-municipio/index.js:295` e o harness de `tests/avisos-municipio.test.js`, que carrega o módulo inteiro num contexto `vm` com stubs mínimos). Este task segue o mesmo padrão: expõe `_mensagemNaoConsta` e carrega o módulo com os stubs mínimos que ele precisa (`raiz.MeedsSuite.registerModule`, mais nada — a função em si não toca DOM).

Criar `tests/mensagem-nao-consta.test.js`:

```javascript
#!/usr/bin/env node
/**
 * tests/mensagem-nao-consta.test.js — mensagem de exame fora da lista
 *
 * Protocolo 1 (Documento 1, Callmed), seção "Sobre a solicitação de
 * exames e a Tabela SIGTAP": quando o exame necessário não consta na
 * Tabela SIGTAP (ou na lista do município), ele deve ser solicitado
 * assim mesmo, com justificativa clínica registrada em prontuário — o
 * Código de Ética Médica (Res. CFM 2.217/2018, art. 32) veda deixar de
 * usar meios diagnósticos disponíveis. A mensagem antiga só sugeria
 * "o fluxo de encaminhamento ou a regulação", sem essa orientação central.
 *
 * Uso:  node tests/mensagem-nao-consta.test.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");

let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs !== undefined ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}

// Carrega o modulo inteiro num contexto vm minimo — mesmo padrao de
// tests/avisos-municipio.test.js. O modulo so precisa de
// MeedsSuite.registerModule para nao explodir ao carregar; nenhuma
// chamada de DOM acontece so por carregar o arquivo (so dentro de
// start()/aoCargaRede(), que este teste nao chama).
let definicao = null;
const ctx = {
  console, JSON, Object, Array, String, RegExp,
  MeedsSuite: { registerModule: function (d) { definicao = d; } },
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, "modules/exames/index.js"), "utf8"), ctx);

ok("o hook de teste existe", typeof definicao._mensagemNaoConsta === "function");

const msg = definicao._mensagemNaoConsta("Betim");
ok("cita o município", /Betim/.test(msg));
ok('orienta a SOLICITAR mesmo assim, não só encaminhar',
   /solicit/i.test(msg) && /mesmo assim/i.test(msg));
ok("pede justificativa clínica em prontuário",
   /justificativa cl[ií]nica/i.test(msg) && /prontu[aá]rio/i.test(msg));
ok("escapa HTML do nome do município (XSS)",
   definicao._mensagemNaoConsta("<b>x</b>").indexOf("<b>x</b>") === -1);

console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
if (falhas) process.exit(1);
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `node tests/mensagem-nao-consta.test.js`
Expected: FALHA logo na primeira linha — `definicao._mensagemNaoConsta` é `undefined` (o hook ainda não existe no objeto passado a `registerModule`).

- [ ] **Step 4: Extrair a função e atualizar o texto**

Em `modules/exames/index.js`, logo depois da função `escapar` (por volta da linha 554), adicionar:

```javascript
  /* Mensagem exibida quando o exame buscado nao esta na lista do
   * municipio. NAO e "nenhum resultado" — e uma conduta diferente: o
   * Protocolo 1 da Callmed (Documento 1, secao "Sobre a solicitacao de
   * exames e a Tabela SIGTAP") manda o medico solicitar o exame ASSIM
   * MESMO quando ele nao consta na tabela/lista do municipio, com
   * justificativa clinica registrada em prontuario — o Codigo de Etica
   * Medica (Res. CFM 2.217/2018, art. 32) veda deixar de usar meios
   * diagnosticos disponiveis. A mensagem anterior so mencionava
   * encaminhamento/regulacao, sem essa orientacao central. */
  function mensagemNaoConsta(municipio) {
    return "<b>Não consta na lista de " + escapar(municipio) + ".</b><br>" +
      "Isso não quer dizer que o exame não exista — quer dizer que ele não está na lista que este município publicou. " +
      "Confira a grafia; se estiver certa, <b>solicite mesmo assim</b>, com a justificativa clínica registrada em prontuário " +
      "(art. 32 do Código de Ética Médica) — não deixe de pedir só por não constar na lista.";
  }
```

E trocar o corpo de `redesenhar()` (dentro do `if (!visiveis.length) { ... }`) para:

```javascript
    if (!visiveis.length) {
      /* A MENSAGEM E ESPECIFICA DE PROPOSITO. "Nenhum resultado" faria o
       * medico achar que errou a digitacao. O que aconteceu foi outra
       * coisa, e ela muda a conduta: este municipio nao oferece — mas o
       * Protocolo 1 manda pedir assim mesmo (ver mensagemNaoConsta). */
      refs.vazio.innerHTML = mensagemNaoConsta(municipioEscolhido);
      refs.vazio.classList.remove("oculto");
      atualizarRodape();
      return;
    }
```

Por fim, expor o hook de teste no objeto passado a `registerModule` (mesmo padrão de `_verificar` em `modules/avisos-municipio/index.js`) — adicionar logo antes do fechamento `});` em `modules/exames/index.js:1110`, depois de `aoCargaRede`:

```javascript
    aoCargaRede: function () {
      /* A SPA troca de tela sem recarregar: o municipio do atendimento
       * anterior nao vale para o proximo. */
      detectarNaTela();
    },

    _mensagemNaoConsta: mensagemNaoConsta,
  });
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `node tests/mensagem-nao-consta.test.js`
Expected: PASS em todas as 4 linhas.

- [ ] **Step 6: Adicionar o teste novo ao `npm run verificar` e rodar a verificação completa**

Em `package.json`, no script `"verificar"`, inserir `node tests/mensagem-nao-consta.test.js &&` logo depois de `node tests/documentos-cpf.test.js &&` (mesmo padrão dos testes já encadeados).

Run: `npm run build && npm run verificar`
Expected: "todos passaram" em cada teste, incluindo o novo, e 0 erros de eslint (rodar `npx eslint modules/exames/index.js tests/mensagem-nao-consta.test.js` isoladamente primeiro se o `verificar` completo demorar — o arquivo `modules/exames/index.js` tem 1111 linhas, checar se a função nova não estourou nenhum limite de `max-lines-per-function`/`quality/max-lines` já configurado em `eslint.config.mjs`).

- [ ] **Step 7: Commit**

```bash
git add modules/exames/index.js tests/mensagem-nao-consta.test.js package.json
git commit -m "$(cat <<'EOF'
feat(exames): mensagem de "não consta" orienta a solicitar mesmo assim

A mensagem quando um exame não está na lista do município só
mencionava "o fluxo de encaminhamento ou a regulação" — incompleta
frente ao Protocolo 1 da Callmed (Documento 1, RT médica): exames
fora da Tabela SIGTAP/lista do município devem ser solicitados assim
mesmo, com justificativa clínica em prontuário (art. 32 do Código de
Ética Médica). Extraída para mensagemNaoConsta(), testável sem
harness de DOM.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Publicação (versão, changelog, build, release)

**Files:**
- Modify: `package.json`, `manifest.json`, `dados/changelog.json`
- Modify: `dist/meeds-suite.user.js`, `dist/meeds-suite.safari.user.js`, `dist/meeds-suite.meta.js`, `dist/meeds-suite.safari.meta.js` (gerados pelo build, não editados à mão)

**Interfaces:**
- Consumes: os commits das Tasks 1-3 já na branch.
- Produces: nada consumido por outra task — é o passo final.

- [ ] **Step 1: Ler a versão atual**

Run: `grep '"version"' package.json` e `grep '"versao"' manifest.json` — confirmar que ambos estão em `2.51.0` (última versão publicada nesta sessão, ver `git log --oneline -5`). Se um número diferente aparecer, usar esse como base do próximo bump.

- [ ] **Step 2: Bump de versão (minor — são melhorias de conteúdo/mensagem, não correção de bug)**

Em `package.json`, trocar `"version": "2.51.0"` por `"version": "2.52.0"`.
Em `manifest.json`, trocar `"versao": "2.51.0"` por `"versao": "2.52.0"`.

- [ ] **Step 3: Adicionar entrada no changelog**

Em `dados/changelog.json`, inserir no topo da lista `"versoes"` (antes do bloco `"2.51.0"`):

```json
{
  "versao": "2.52.0",
  "data": "2026-09-30",
  "novidades": [],
  "melhorias": [
    "Aviso do município: UPA Barra (Macaé) agora mostra a regra completa — medicação VO/IM/EV na unidade, exames do pronto atendimento, atestado, e o lembrete de pedir reavaliação por telemedicina depois da medicação e dos exames.",
    "Aviso do município: Congonhas ganhou dois avisos que faltavam — dipirona só em gotas (não em comprimido) e renovação de receita só com a receita anterior em mãos.",
    "Listagem de exames: quando um exame não consta na lista do município, a mensagem agora orienta a solicitar mesmo assim, com justificativa clínica em prontuário — como manda o protocolo."
  ],
  "correcoes": []
},
```

- [ ] **Step 4: Rebuild e verificação final**

Run: `npm run build && npm run verificar`
Expected: build reporta versão `2.52.0`; "todos passaram" em cada teste; 0 erros de eslint; exit code 0.

- [ ] **Step 5: Commit**

```bash
git add package.json manifest.json dados/changelog.json dist/meeds-suite.user.js dist/meeds-suite.safari.user.js dist/meeds-suite.meta.js dist/meeds-suite.safari.meta.js
git commit -m "$(cat <<'EOF'
chore: publica 2.52.0 — avisos de UPA Barra e Congonhas, mensagem de exame

Três protocolos assistenciais estruturados pela RT médica (Dr.
Guilherme Borges / Callmed) revisados nesta sessão: Fluxo em UPAs,
Teleatendimento UBS/ESF e Condutas por Unidade. Consolida as Tasks
1-3 deste plano.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Push, aguardar CI, criar release**

Run: `git push origin main`
Aguardar o CI (`gh run list --branch main --limit 1`) reportar `completed success`.

Run:
```bash
gh release create v2.52.0 dist/meeds-suite.user.js dist/meeds-suite.safari.user.js \
  --title "v2.52.0 — Avisos de UPA Barra e Congonhas, mensagem de exame" \
  --notes "Três protocolos assistenciais da RT médica (Callmed) revisados: UPA Barra (Macaé) ganha a matriz completa de condutas e o lembrete de reavaliação; Congonhas ganha os avisos de dipirona-só-em-gotas e renovação-só-com-receita-prévia; a mensagem de exame fora da lista do município agora orienta a solicitar mesmo assim, com justificativa clínica.

- Chrome / Edge / Firefox (Tampermonkey): \`meeds-suite.user.js\`
- Safari no iPad/iPhone/Mac (app Userscripts): \`meeds-suite.safari.user.js\`"
```

Expected: `gh release list --limit 2` mostra `v2.52.0` marcado como `Latest`.

---

## O que fica de fora deste plano (de propósito)

- **Protocolo 1 e 2 (regras gerais de UPA/UBS, elegibilidade de telemedicina, Memed vs texto livre)**: são condutas médicas gerais, já vividas no dia a dia via o próprio Meeds/Memed — não geram aviso de município porque não variam por cidade. Nenhuma ação de código.
- **UBS/ESF de Macaé — nota genérica de "seguir a REMUME e os fluxos de regulação"**: é a mesma orientação que já vale para qualquer município (a REMUME de Macaé já é a fonte de verdade no módulo de REMUME). Um aviso de município redundante com o que a busca de REMUME já mostra teria baixo valor e poluiria a tela. Não incluído.
- **Piraí**: não aparece no Protocolo 3 (que cobre só Barbacena, Franco da Rocha, Barra, Congonhas e Macaé) — sem mudança de dado indicada por essa leitura.
