# Testes

O que existe é um **teste de fumaça manual** com página estática e mock da API.
Não é suíte automatizada — é o mínimo para confirmar, sem tocar em produção,
que tudo continua funcionando depois de uma mudança.

## Como rodar

```bash
npm run build
python3 -m http.server 8731
```

Abra <http://localhost:8731/tests/smoke.html>.

> Precisa ser por HTTP, não `file://` — o `fetch` do mock e as buscas remotas
> se comportam diferente em `file://`.

A página imita a tela do Meeds: cartão de paciente com os rótulos reais
("Nome da Mãe", "CPF", "Data de Nascimento", "Feminino", "47 anos e 2 meses"),
card de métrica "Aguardando" e um mock de `GET /api/v1/Atendimento`.

Para os testes que geram PDF, carregue jsPDF e pdf-lib pelo CDN antes — no uso
real quem faz isso é o `@require` do Tampermonkey.

## Resultado da última execução

**86 casos, 86 passaram, 0 falharam.** Executado em 31/08/2026 contra
`dist/meeds-suite.user.js` v2.7.0.

### Núcleo, dock e login

| # | O que verifica | Resultado |
|---|---|---|
| 1 | Núcleo sobe | ✅ |
| 2 | Hook de rede instalado uma única vez | ✅ |
| 3 | **Instância única**: a segunda execução desiste | ✅ |
| 4 | Um único dock no DOM | ✅ |
| 5 | Dock empilha os 6 botões sozinho | ✅ |
| 6 | Engrenagem no pé da pilha | ✅ |
| 7 | Tudo some na tela de login | ✅ |
| 8 | Volta a aparecer depois do login | ✅ |

### Leitura de tela

| # | O que verifica | Resultado |
|---|---|---|
| 9 | Lê os 7 campos do cartão do paciente | ✅ |
| 10 | Variantes de rótulo: "Filiação" no lugar de "Nome da Mãe" | ✅ |
| 11 | **Recusa decidir** com dois contadores divergentes | ✅ |

### Cadastro de médicos *(novo)*

| # | O que verifica | Resultado |
|---|---|---|
| 12 | Começa vazio — os dados saíram do código | ✅ |
| 13 | Cadastro grava e sobrevive ao recarregar | ✅ |
| 14 | Backup e restauração (troca de computador) | ✅ |
| 15 | Backup rejeita arquivo inválido, com mensagem que explica | ✅ |

### Alarme de fila

| # | O que verifica | Resultado |
|---|---|---|
| 16 | Primeira leitura só define a base, não dispara | ✅ |
| 17 | Paciente novo dispara o alarme | ✅ |
| 18 | **Moldura noturna** aparece junto com o banner | ✅ |
| 19 | Silencia sozinho quando a fila esvazia | ✅ |
| 20 | Moldura some junto | ✅ |

### Assistente REMUME

| # | O que verifica | Resultado |
|---|---|---|
| 21 | Fallback embutido: 11 municípios sem internet | ✅ |
| 22 | "lozartna" → "Losartana potássica" | ✅ |
| 23 | "buscopan" → escopolamina | ✅ |

### Geradores de laudo

| # | O que verifica | Resultado |
|---|---|---|
| 24 | **Erro nomeia o campo que falta**, com o rótulo da tela | ✅ |
| 25 | **Médico auto-selecionado** quando há um só cadastrado | ✅ |
| 26 | Gera o PDF do CMD (`LAUDO_CMD_….pdf`) | ✅ |
| 27 | Caixa verde de sucesso no modal | ✅ |
| 32 | Gera o PDF de Sete Lagoas (`LME_….pdf`) | ✅ |
| 33 | Caixa verde de sucesso | ✅ |
| 35 | Estabelecimento/CNES vem de `dados/formularios.json` | ✅ |
| 36 | Gera e baixa o PDF da APAC (22 KB) | ✅ |
| 37 | Seção de assinatura aparece após gerar | ✅ |
| 38 | Fluxo gov.br abre o portal | ✅ |

> **Atenção ao escrever teste para a APAC:** ela gera o PDF e só baixa quando o
> médico escolhe "Assinar via gov.br" ou "Baixar sem assinar". Verificar o
> download logo após "Gerar PDF" dá falso negativo — foi o que aconteceu na
> primeira execução deste roteiro.

### Histórico *(novo)*

| # | O que verifica | Resultado |
|---|---|---|
| 28 | Registra o documento gerado (CMD) | ✅ |
| 29 | **Não grava nome completo**: só "J.C.S. · •••909" | ✅ |
| 30 | "Reabrir" repõe a parte clínica | ✅ |
| 31 | "Reabrir" **não** repõe os dados do paciente | ✅ |
| 34 | Histórico do LME | ✅ |
| 39 | Histórico da APAC, também sem nome completo | ✅ |

### Painel da engrenagem

| # | O que verifica | Resultado |
|---|---|---|
| 40 | Lista as 5 funções | ✅ |
| 41 | Link "Ajustes" aparece no alarme | ✅ |
| 42 | Crédito "Assistente Meeds — Por: Marcelo" | ✅ |
| 43 | Desligar tira o botão na hora, sem recarregar | ✅ |
| 44 | Religar traz de volta | ✅ |
| 45 | "Ajustes" abre a configuração do alarme | ✅ |

### Primeira instalação e scripts antigos *(novo)*

| # | O que verifica | Resultado |
|---|---|---|
| 46 | Boas-vindas na primeira execução, apontando o ⚙️ | ✅ |
| 47 | **Detecta script antigo ativo** e explica como desativar | ✅ |
| 48 | "Não avisar de novo" fica salvo | ✅ |

> O teste 47 simula o script antigo montando o botão **6 segundos** depois do
> carregamento, porque é assim no mundo real (eles rodam em `document-idle`).
> A checagem é repetida em 4s, 10s, 20s e 45s — uma checagem única perderia
> esse caso.

### Busca de CID-10 *(novo)*

| # | O que verifica | Resultado |
|---|---|---|
| 49 | Base completa (14.233 códigos) baixa da internet | ✅ |
| 50 | Sem internet, o fallback embutido (90 códigos) segura | ✅ |
| 51 | "enxaqueca" → G43; "diabetes" → E10; "dpoc" → J44.0 | ✅ |
| 52 | "AVC" (sigla) → I64 Acidente Vascular Cerebral | ✅ |
| 53 | "dor lombar" → M54.5, e não uma lista de cefaleias | ✅ |
| 54 | "dor de cabeça" → Cefaleia, e não "Deformidades…" | ✅ |
| 55 | "Usar" preenche o CID no laudo que está aberto | ✅ |
| 56 | REMUME não regrediu depois de o motor virar núcleo | ✅ |

> Os testes 52–54 existem porque cada um deles **falhou** durante a
> implementação, por um motivo diferente: sinônimo curto casando dentro de
> outra palavra ("iam" em "tiamina"), gatilho por substring ("pressao"
> ativando "depressao") e palavra vazia pontuando ("de" em "deformidades").
> São casos de regressão — não remova.

### Aviso de atualização *(novo)*

| # | O que verifica | Resultado |
|---|---|---|
| 57 | Primeira instalação mostra boas-vindas, **não** "atualizado" | ✅ |
| 58 | Primeira instalação já registra a versão atual | ✅ |
| 59 | Reabrir na mesma versão não mostra nada | ✅ |
| 60 | Atualização mostra o aviso, com as três categorias | ✅ |
| 61 | A versão é gravada ao **exibir**, não ao fechar (evita repetir em outra aba) | ✅ |
| 62 | Pulo de versões (2.2.0 → 2.5.0) mostra as 3 acumuladas | ✅ |
| 63 | Comparação numérica: 2.10.0 é maior que 2.9.0 | ✅ |
| 64 | ⚙️ → Sobre mostra crédito, versão e histórico completo | ✅ |

Para simular uma atualização sem publicar nada:

```js
localStorage.setItem("meeds-suite:ultima_versao_vista", "2.2.0");
location.reload();
```


### Busca do REMUME — marcas, acentos e fonética *(novo)*

| # | O que verifica | Resultado |
|---|---|---|
| 65 | Erro com acento: "dipironá" → Dipirona | ✅ 5 resultados |
| 66 | Erro fonético: "cimvastatina" → Sinvastatina | ✅ 4 resultados |
| 67 | Marca presente: "Tylenol" → Paracetamol do município | ✅ 3 resultados |
| 68 | Avisa de onde veio: *"Mostrando Paracetamol — princípio ativo de Tylenol."* | ✅ |
| 69 | Marca ausente: "Allegra" → *"Allegra (Fexofenadina) não consta na REMUME deste município."* | ✅ |
| 70 | Marca ausente **não** vira item selecionável | ✅ só a explicação |
| 71 | **Nenhum resultado vem de fora da REMUME do município** | ✅ 24 itens conferidos, 0 violações |
| 72 | Falsos positivos: "dipirona" não traz digoxina | ✅ |
| 73 | Falsos positivos: "losartana" não traz lorazepam | ✅ |
| 74 | Falsos positivos: "clonazepam" não traz clonidina | ✅ |
| 75 | Falsos positivos: "amoxicilina" não traz amitriptilina | ✅ |

> O teste **71** é o mais importante do arquivo. Ele pega cada resultado
> devolvido pela busca e confere, item por item, que o texto existe
> literalmente na REMUME do município selecionado. Foi rodado em Macaé e Sete
> Lagoas, com termos que exercitam todos os caminhos (marca, acento, fonética,
> marca ausente). **Nunca remova nem afrouxe este teste:** ele é a garantia
> mecânica da regra de ouro (ver ARQUITETURA.md, D22).

Como reproduzir a garantia do teste 71:

```js
// no console, com a consulta REMUME aberta
const host = document.getElementById("meeds-suite-dock-host").shadowRoot;
const norm = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
const lista = window.MEEDS_REMUMES_FALLBACK["Macaé"].map(x => norm(String(x).split("(Local de acesso:")[0]));
// digite algo na busca, depois:
Array.from(host.querySelectorAll("#rm-results li .rm-item-text"))
  .map(li => norm(li.textContent))
  .filter(n => !lista.includes(n));   // tem que devolver []
```


### Sala de Espera *(novo)*

| # | O que verifica | Resultado |
|---|---|---|
| 76 | Primeira leitura fotografa o estado e **não** notifica | ✅ |
| 77 | Contador no botão mostra quantos aguardam | ✅ |
| 78 | Paciente novo gera aviso, com nome, hora e espera | ✅ |
| 79 | Mesmo paciente na leitura seguinte **não** notifica de novo | ✅ |
| 80 | Três chegando juntos viram **um** aviso: "3 pacientes na sala de espera" | ✅ |
| 81 | Quem sai da fila some do conjunto de vistos | ✅ |
| 82 | Quem volta a aguardar conta como chegada nova | ✅ |
| 83 | Painel lista todos, com o tempo de espera de cada um | ✅ |
| 84 | Não consulta a API na tela de login | ✅ 0 chamadas |
| 85 | Desligar o módulo interrompe a consulta periódica | ✅ 0 chamadas |
| 86 | Religar volta a funcionar | ✅ |

Auditoria de privacidade do módulo (feita por inspeção do código):

| Verificação | Resultado |
|---|---|
| Grava algo em disco? | ❌ nada — `localStorage`, `GM_setValue` e afins não aparecem |
| Envia dados para fora? | ❌ só um `fetch` same-origin para o próprio Meeds |
| Registra nome de paciente no console? | ❌ os dois `console.debug` usam texto fixo, sem PII |

O mock de agendados na página de teste (`window.__agendados`) reproduz a forma
real da resposta — `items`, `statusAtendimentoId`, `agendamento.checkinStatus`,
`gestaoHorario.horarioInicial`, `cliente.razaoSocialNome` — para os testes
exercitarem o mesmo caminho que roda em produção.


### Extensibilidade

Verificado à parte: criei um sexto módulo a partir de `modules/_template`,
acrescentei uma linha ao `manifest.json` e rodei `npm run build`. Ele apareceu
na pilha, na posição declarada, com a janela funcionando — **sem uma linha
alterada** nos cinco módulos existentes nem no núcleo. Depois removi.

## Verificações que rodam sem navegador

```bash
npm run verificar   # manifest coerente, regras de arquitetura, fallback em dia
```

O build **reprova** (código de saída 1) se algum módulo — ou o próprio
`modules/_template` — tiver posição hardcoded em pixel ou hook próprio de
fetch/XHR. Verificado introduzindo as duas violações de propósito.

## O que ainda não é coberto

- Não há teste automatizado em CI. O roteiro acima é manual.
- O layout dos PDFs não é comparado pixel a pixel com o original. A garantia é
  que as funções de geração foram extraídas **verbatim** e que os PDFs base são
  byte a byte idênticos aos dos repositórios de origem.
- O comportamento contra a API real do Meeds (formatos de payload que o mock não
  reproduz) só será exercido na validação em produção.
- A detecção dos scripts antigos depende de eles manterem os mesmos ids no DOM.
  Se algum dia mudarem, atualize a lista em `core/diagnostico.js`.
