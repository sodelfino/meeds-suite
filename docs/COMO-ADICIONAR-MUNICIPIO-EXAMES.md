# Acrescentar um município à lista de exames

Chegou a lista de uma prefeitura nova. Este é o caminho — e ele foi desenhado
para ser **só dado**, sem tocar em código.

---

## O resumo

1. Guarde o documento da prefeitura (PDF, planilha) numa pasta sua.
2. Aponte para ele em `FONTES`, no topo de `scripts/montar-exames.js`.
3. Escreva a função que lê aquele formato (há três exemplos prontos no arquivo).
4. Rode:

```bash
npm run montar-exames
```

5. Confira, e publique:

```bash
npm run verificar && npm run build
```

---

## A regra que manda em tudo

**A lista de cada município é a única fonte de verdade do que ele oferece.**

- Não existe lista "geral" que complete a de um município.
- Nenhum exame é copiado de um município para outro.
- Havendo dúvida, o item **fica de fora**, não entra.

Errar para menos custa uma consulta ao portal da prefeitura. Errar para mais
custa um pedido que o paciente carrega até uma unidade que não realiza aquilo —
e o médico só descobre pelo retorno, semanas depois.

O `tests/exames.test.js` verifica isso a cada build: busca doze termos comuns em
todos os municípios e falha se um único resultado vier de fora da lista daquele
município.

---

## O formato

Cada município é um bloco em `dados/exames.json`:

```json
"Nome do Município": {
  "fonte": "de onde veio esta lista",
  "atualizadoEm": "2026-09-08",
  "observacoes": ["regras que o médico precisa saber antes de pedir, válidas para o município inteiro"],
  "exames": [
    {
      "nome": "HEMOGRAMA COMPLETO",
      "codigo": "28040481",
      "local": "UPA Barra",
      "exige": "APAC",
      "nota": "regra que vale só para ESTE exame — idade mínima, documento a anexar, como cadastrar"
    }
  ]
}
```

### Só `nome` é obrigatório

`codigo`, `local`, `exige`, `nota`, `orientacao` e `observacoes` são
**opcionais**, e isso não é descuido — é o que permite representar fontes
desiguais sem inventar dado:

| Município | Traz código | Traz local | Traz sigla | Traz nota/orientação por exame | Traz `especialidade` |
|---|---|---|---|---|---|
| Betim | sim (contrato) | não | não | não | não |
| Macaé | não (nenhuma das 2 fontes tem) | 28 de 94 (só na fonte UPA Barra) | não | 21 de 94 com `orientacao` (fonte SEMUSA) | 28 de 94 (fonte SEMUSA) |
| Sete Lagoas | 456 de 521 (só na fonte laboratorial) | 64 de 521 (só na fonte de orientações) | APAC / LAUDO / Alto Custo | 34 com `nota`, 2 já com `orientacao` | não |

> Um "Congonhas" existiu nesta tabela até setembro de 2026 — na verdade era o
> catálogo `_comum` de `dados/apac.json` (procedimentos APAC, compartilhados por
> Itaúna/Betim/Sete Lagoas no gerador de APAC) sob um nome de município que
> nunca teve fonte própria — erro de rótulo desde o pedido original, não dado
> real de Congonhas. Removido; a lista real de Congonhas (exames de laboratório
> da UPA) entra quando o documento correto for transcrito.

**Campo vazio significa "o município não publicou", nunca "faltou preencher".**
Completar por dedução colocaria no sistema informação que a prefeitura não deu —
exatamente o que a regra de ouro proíbe.

### `fonte` e `atualizadoEm` são obrigatórios

Aparecem no painel, abaixo da busca. Uma lista sem procedência parece oficial
mesmo quando está velha, e o médico não tem como julgar o que está lendo. O teste
falha se faltar qualquer um dos dois.

### `exige`: as siglas

Só valem as declaradas em `siglas`, no topo do arquivo:

| Sigla | Significa |
|---|---|
| `APAC` | Exige Laudo de Solicitação/Autorização de Procedimento Ambulatorial |
| `LAUDO` | Exige laudo médico específico do município |
| `ALTO_CUSTO` | Exige o formulário de Procedimento de Alto Custo/Complexidade, e não o pedido de exame comum |

Sigla nova precisa ser acrescentada ali **antes** de ser usada, senão o teste
falha — e sem isso a tela mostraria um selo com texto cru ao lado do exame.
`ALTO_CUSTO` veio de Sete Lagoas: a "Alto Custo" do SUS é uma categoria
burocrática tão real quanto a APAC, e forçá-la dentro de `LAUDO` esconderia que o
formulário a preencher é outro.

### `observacoes` (por município) x `nota` (por exame)

`observacoes` aparece em destaque no topo do painel, antes da lista, e vale para
**todos** os exames daquele município. Hoje nenhum município usa: as duas
regras que Macaé (UPA Barra) e Sete Lagoas (Central) tinham aqui foram removidas
a pedido — o campo continua existindo e a tela continua sabendo desenhá-lo, para
o próximo município que precisar dele.

`nota` é a mesma ideia, mas por **exame**: "a partir de 13 anos", "anexar
resultado de biópsia", "cadastrar o paciente uma vez por membro" mudam o que o
médico faz antes de pedir *aquele* exame específico, não o município inteiro.
Aparece como um aviso `ℹ️` dentro do próprio item, na tela.

As duas existem porque uma informação assim, escondida dentro de um PDF de
gaveta, vale menos que nada — e cada uma tem o alcance certo: município inteiro,
ou um exame só.

### `orientacao`: a evolução tipada do `nota`

`nota` é um parágrafo só. Funciona, mas mistura tudo — idade, documento a
anexar, prazo de validade, pra onde vai o pedido — numa frase corrida que só se
lê inteira, nunca se filtra nem se destaca por tipo. `orientacao` é o mesmo
conteúdo, decomposto em campos com nome, para virar o bloco **⚠️ Atenção ao
encaminhar** na tela — as "pegadinhas" que fazem o encaminhamento voltar.

Os dois **convivem por enquanto**: só alguns exames de Sete Lagoas já foram
reclassificados de `nota` para `orientacao`; os demais continuam com `nota`
até a próxima leva de transcrição. Um exame nunca precisa ter os dois.

```json
{
  "nome": "Estudo Urodinâmico",
  "local": "prestador terceirizado",
  "orientacao": {
    "faixaEtaria": "Não realiza em menores de 18 anos.",
    "preRequisitos": [
      "Resultado de urina rotina atual (até 15 dias), já avaliado pelo médico da unidade, anexado em PDF."
    ],
    "restricoes": ["Exame de urina alterado (infecção) contraindica o procedimento."],
    "fluxo": "FICA_NA_UNIDADE",
    "observacoes": "Solicitar via e-mail (agendacentralmarcacao2.saude@setelagoas.mg.gov.br) com nome completo, data de nascimento e contato do paciente."
  }
}
```

**Todo campo é opcional, e `orientacao` inteiro também é.** Um exame sem
pegadinha nenhuma simplesmente não tem a chave — nunca `"orientacao": {}`. É por
isso que a tela pode confiar em "existe" para decidir se desenha o bloco, sem
precisar checar "existe, mas será que tem algo dentro?".

| Campo | Tipo | Para que serve |
|---|---|---|
| `faixaEtaria` | string | Restrição de idade. Só idade — o resto de contraindicação vai em `restricoes`. |
| `preparo` | string | O que o **paciente** faz com o próprio corpo antes (jejum, suspender remédio). Boilerplate ("preparo conforme orientação do prestador") nunca entra — ver abaixo. |
| `documentos` | array | Papel de identificação **específico deste exame**, além do de rotina (CPF/CNS já é regra do município inteiro, em `observacoes`). |
| `preRequisitos` | array | Exame ou avaliação clínica anterior que precisa existir e ser anexada. |
| `restricoes` | array | Contraindicação que não é idade. |
| `comoCadastrar` | string | Peculiaridade de como lançar o pedido no sistema (GMUS/CADWEB) — não é requisito clínico, é comportamento de tela. |
| `validade` | string | Só quando é **um** prazo simples sobre o próprio exame. Quando cada pré-requisito tem sua própria validade (a Biópsia Renal de Sete Lagoas pede seis, cada um com prazo diferente), a validade fica embutida no texto do próprio item de `preRequisitos` — forçar um resumo aqui inventaria uma frase que a fonte não escreveu. |
| `fluxo` | enum | Onde o pedido fica depois de emitido. Ver tabela abaixo. |
| `observacoes` | string | Catch-all: o que é real, mas não cabe limpo em nenhum campo acima. |

`fluxo` só aceita três valores — um quarto valor **falha o build**, de propósito,
para um erro de digitação virar erro no terminal e não virar selo estranho na
tela:

| Valor | Quando usar |
|---|---|
| `FICA_NA_UNIDADE` | O pedido é cadastrado e resolvido ali mesmo, sem passar pela Central. |
| `VAI_PARA_CENTRAL` | O pedido segue para a Central de Marcação. |
| `OUTRO` | Nenhum dos dois — não force um encaixe que a fonte não pede. |

### `especialidade` e `canalEncaminhamento`: o que Macaé acrescentou

Sete Lagoas organiza tudo numa lista só. Macaé organiza por **especialidade**
(Cardiologia, Urologia, Neurologia Adulto...) e pensa o encaminhamento como
**canal de entrada**, não como "onde o papel fica" — dois conceitos que Sete
Lagoas não tinha e que os campos abaixo cobrem, sem quebrar nada do que já
existia.

**`especialidade`** é `array`, não `string`, e não é capricho: no levantamento
real de Macaé, exame como "Ecodoppler de Carótidas/Vertebrais" aparece em
**três** especialidades ao mesmo tempo (Cardiologia, Neurologia Adulto,
Endocrinologia). Uma `string` única forçaria escolher uma "principal" que a fonte
não elege — e é exatamente o tipo de invenção que a regra de ouro proíbe. Fica
**fora** de `orientacao`, ao lado de `nome`/`local`/`codigo`: é categoria do
exame, não aviso de conduta, e por isso a tela também desenha diferente — um
selo por especialidade, junto de código/local, nunca dentro do bloco "⚠️ Atenção
ao encaminhar".

```json
{
  "nome": "Ecodoppler de Carótidas/Vertebrais",
  "especialidade": ["Cardiologia", "Neurologia Adulto", "Endocrinologia"]
}
```

**`canalEncaminhamento`** mora dentro de `orientacao`, ao lado de `fluxo` — e
**não é o mesmo campo com outro nome**. A diferença é a pergunta que cada um
responde:

| Campo | Pergunta | Nasceu de |
|---|---|---|
| `fluxo` | Depois de emitido, o papel **fica onde**? | Sete Lagoas — "fica na unidade" x "vai para a Central" |
| `canalEncaminhamento` | Por **qual porta** o pedido **entra** na regulação? | Macaé — SISREG, Central Municipal, regulação estadual, direto ao serviço |

Um exame pode ter os dois, um só, ou nenhum — são eixos independentes, e
misturar os vocabulários seria forçar Macaé no molde de Sete Lagoas (ou
vice-versa), o que a regra de ouro também proíbe: cada município se organiza do
seu jeito, e o schema tem que caber nos dois sem "endurecer" para nenhum.

| Valor | Quando usar |
|---|---|
| `SISREG` | Pedido inserido no Sistema de Regulação de Vagas do Município. |
| `CENTRAL_MUNICIPAL` | Paciente dá entrada na Central de Regulação do Município. |
| `REGULACAO_ESTADUAL` | Encaminhado para regulação de outro estado (em Macaé, o Rio de Janeiro). |
| `DIRETO_AO_SERVICO` | Vai direto ao prestador, sem passar por regulação. |
| `OUTRO` | Nenhum dos anteriores — mesma regra de `fluxo`: não force um encaixe. |

Igual a `fluxo`, um valor fora dessa lista **falha o build**. E, igual a
`fluxo`, o ícone da tela muda por **valor**, não é um ícone fixo com texto do
lado.

**Quando o canal varia por especialidade, para o mesmo exame, não escolha um.**
"Ecodoppler de Carótidas" entra pelo SISREG quando pedido via Neurologia Adulto,
mas pela Central Municipal quando pedido via Cardiologia — a fonte não afirma um
canal único para o exame. Nesse caso `canalEncaminhamento` fica **ausente**, e a
variação vai para `observacoes` como texto — a mesma disciplina de "só campo
tipado quando o documento afirma sem ambiguidade", aplicada a um caso novo.

**Nomes normalizados: a única exceção deliberada a "erro se transcreve como
está".** A regra de sempre (mais abaixo) é preservar erro de digitação da fonte.
Para Macaé foi combinada uma regra **diferente**, só para o campo `nome`: corrigir
erro óbvio de grafia e padronizar acento/caixa. O documento original trazia
"ELTROCARDIOGRAMA", "GIADA", "PARATES", "ABDMINAL" — nada disso ajuda alguém a
achar o exame na busca, que é o único motivo de o nome existir. **`codigo`
continua com a regra antiga, sem exceção**: nenhuma das fontes de Macaé traz
código de procedimento, e o campo fica simplesmente ausente — nunca inventado
para "completar" o exame. Corrigir grafia de nome é tornar encontrável o que já
existe; inventar código seria criar dado que a fonte não deu. São operações
diferentes, e só a primeira é permitida.

Ver `lerMacaeEspecialidades()` em `scripts/montar-exames.js` para o exemplo
completo — inclusive os casos em que a especialidade some de propósito (linha
sem correspondência inequívoca entre as duas fontes de Macaé) em vez de ser
adivinhada.

### Como preencher: o construtor `orientacao(...)`

Não escreva o objeto à mão. `scripts/montar-exames.js` exporta um construtor —
`orientacao({ ...campos })` — que você chama depois de já ter **decidido**, lendo
o documento, em qual campo cada frase cabe:

```js
orientacao: orientacao({
  faixaEtaria: "A partir de 13 anos.",
  preRequisitos: ["Resultado de US de tireoide."],
}),
```

Ele cuida de três coisas por você:

- **Recusa `preparo` boilerplate.** "Preparo conforme orientação do prestador"
  não é informação — é a prefeitura dizendo "pergunte ao laboratório". Mesmo que
  você cole isso sem querer, o construtor descarta.
- **Limpa vazio.** String em branco e array vazio nunca sobram no JSON final —
  o campo fica simplesmente ausente.
- **Valida `fluxo`.** Um valor fora da tabela acima derruba
  `npm run montar-exames` na hora, com o nome do exame no erro.

**O que o construtor NÃO faz — e por que isso é proposital:** ele não lê o PDF,
não separa frase por regex, não tenta adivinhar sozinho se um trecho é
`faixaEtaria` ou `preRequisitos`. Um classificador automático **erra em
silêncio**, e é exatamente esse tipo de erro que a regra de ouro proíbe. Quem
decide em qual campo cada informação cabe é **você**, lendo o documento — o
construtor só organiza e valida o que você já decidiu.

Regras de transcrição, as mesmas de sempre, agora com um lugar tipado para cada
uma:

- **Só campo tipado quando o documento afirma sem ambiguidade.** Qualquer coisa
  que exigisse sua interpretação para caber num campo fica em `observacoes`, como
  texto o mais fiel possível ao original.
- **Erro do documento se transcreve como está.** Um código fora de ordem, um
  rótulo trocado — não se conserta, nem dentro de `orientacao`. Mesma disciplina
  do `ERITOGRAMA`/`ERITROGRAMA` de Betim.
- **Nome de pessoa nunca entra — em campo nenhum.** Médico "aberto a agenda",
  responsável pelo agendamento, telefone ou e-mail de alguém específico: fora.
  Um **e-mail institucional** (sem nome de pessoa, o único canal para de fato
  enviar o pedido) pode entrar em `observacoes` — é dado operacional, não dado
  pessoal de quem trabalha na Central. Na dúvida entre incluir ou não um contato,
  prefira não incluir.
- **`fluxo` entra; o nome do responsável, não.** "Fica na unidade" ou "vai para a
  Central" é informação sobre o **exame**. O nome de quem cuida daquele
  agendamento é informação sobre uma **pessoa**, e essa é a linha.

### Quando a única coisa que sobra é `observacoes`

Nem toda pegadinha decompõe limpo. "Informar na observação quando for com
Doppler" não é idade, documento, pré-requisito, restrição ou cadastro — é
instrução sobre o que **escrever no próprio pedido**. Fica ambíguo entre
`observacoes` e `comoCadastrar`; na dúvida, o catch-all genérico, nunca um campo
mais específico forçado:

```json
{
  "nome": "Ultrassonografia de Aparelho Urinário",
  "local": "HM",
  "orientacao": { "observacoes": "Informar na observação do pedido quando for com Doppler." }
}
```

---

## Quando um exame se desdobra

Não há exemplo ativo disso hoje (o antigo, um "Congonhas" que na verdade era o
catálogo de APAC, foi removido — ver nota acima). Mas o princípio continua
valendo para quando aparecer de novo: se a fonte descreve um exame que se
desdobra em variantes ou territórios (Doppler por região do corpo, Eco por
protocolo), cada variante vira **uma linha própria** na lista, não uma linha
genérica. O médico procura "doppler carótida", não "doppler" — uma linha só o
obrigaria a saber de cor que aquele exame tem variantes.

---

## Quando a fonte é boa demais para parser, e ruim demais para automatizar

Betim e Macaé têm formato regular (duas colunas; lista com marcador), e por isso
`lerBetim()`/`lerMacae()` **leem o arquivo em tempo de execução** — rodar
`npm run montar-exames` de novo, com um arquivo atualizado no mesmo caminho, já
traz os dados novos sozinho.

Sete Lagoas não: é uma tabela de 7 colunas por exame, com células que quebram em
várias linhas. `pdftotext -layout` devolve texto onde a posição horizontal de
cada coluna **muda conforme a altura da célula anterior** — um parser por posição
arriscaria trocar o conteúdo de uma coluna pela de outra, em silêncio, e esse
tipo de erro é o mais caro de todos: passa no build, passa no teste automático (a
regra de ouro continua batendo, só o *conteúdo* de um campo estaria errado), e só
aparece quando um médico lê um local ou uma nota que não bate com a realidade.

Por isso `lerSeteLagoas()` é **dado literal dentro do script**, transcrito à mão
e conferido duas vezes contra a fonte (uma lendo a página como imagem, outra
lendo o texto do `pdftotext -layout`). Rodar `npm run montar-exames` de novo
**não vai atualizar Sete Lagoas sozinho** — uma lista nova da prefeitura exige
reabrir `lerSeteLagoas()` e editar o array à mão, com a mesma dupla conferência.

Isso não é uma falha do script: é a leitura honesta de que, para esta fonte, a
transcrição cuidadosa é mais confiável que a automação. O comentário no topo de
`lerSeteLagoas()` documenta exatamente o que ficou de fora (nome de médico e de
funcionário, uma linha de encaminhamento para clínicas de BH que não é exame) e
por quê.

---

## Um município, duas fontes

Sete Lagoas foi o primeiro caso: as "orientações" da Central de Marcação
(`lerSeteLagoas()`) cobrem exame de imagem e procedimento agendado, e chegou
depois um segundo documento — o contrato de exames **laboratoriais**
(`lerSeteLagoasLaboratorio()`), com ~450 itens de bancada (bioquímica,
hematologia, sorologia, urina, hormônios...). Para o médico é um município só;
ele não precisa saber que são dois arquivos.

`juntarFontesDoMesmoMunicipio()`, em `scripts/montar-exames.js`, faz essa junção:
concatena os `exames` das duas fontes numa lista só, junta a `fonte` de cada
bloco (a procedência de cada metade continua rastreável na tela — "Orientações
da Central... + Tabela SIGTAP..."), e fica com a data **mais recente** entre as
duas como `atualizadoEm`.

Ela também **mede** — não supõe — que os códigos das duas fontes não colidem: se
algum dia um exame aparecer nos dois documentos com o mesmo código, o script
avisa no terminal em vez de silenciosamente duplicar a linha na busca.

Um segundo município com o mesmo padrão usa a mesma função:

```js
"Nome do Município": juntarFontesDoMesmoMunicipio([lerFonteA(), lerFonteB()]),
```

**Macaé é o segundo caso**, e testou uma variação: nenhuma das duas fontes
(UPA Barra e a lista por especialidade da SEMUSA) traz `codigo`, então não havia
como desempatar colisão por código. `juntarFontesDoMesmoMunicipio()` passou a
checar colisão por **nome normalizado** também, não só por código — usada
automaticamente quando o exame não tem código nenhum.

---

## Duas armadilhas que já custaram caro

**Duplicata que não parece duplicata.** A planilha de Betim quebra nomes longos
em várias linhas dentro da célula. Sem colapsar o espaço em branco, o mesmo exame
aparece duas vezes com quebras em posições diferentes — e a busca por duas
palavras que a quebra separou não casa. São 19 duplicatas reais em 2.002 linhas.

**A cópia embutida ficando para trás.** `dados/exames.json` é o que o módulo
busca pela internet; `modules/exames/assets/fallback.js` é o que o médico usa
quando essa busca falha (rede da unidade bloqueando, CSP, plantão sem internet).
Editar só o primeiro faz quem cai no fallback ver a lista antiga. Foi o que
aconteceu no REMUME quando Barbacena entrou só na fonte remota — por isso
`npm run verificar` barra a divergência, e `npm run montar-exames` já roda os
dois passos.

**Código impresso fora de ordem, e a tentação de "corrigir".** Na tabela
laboratorial de Sete Lagoas, o código de "Pesquisa de Anticorpos IgG contra
Arbovirus" está impresso `0020203792` — com os dígitos fora da sequência que
todo o resto da tabela segue (`0202...`). Zoom em 600dpi contra as linhas
vizinhas (que leem limpo) confirmou: não é erro de leitura, é o que está
impresso. Ficou exatamente assim — corrigir para o que "parece óbvio" seria
inventar o que a prefeitura quis dizer, a mesma disciplina do
`ERITOGRAMA`/`ERITROGRAMA` de Betim.

---

## O que ainda não existe

- **Betim não tem local.** O contrato não diz onde cada exame é feito. Quando a
  prefeitura mandar essa informação, é acrescentar `local` em cada item.
- **Betim não tem `nota` nem `orientacao`.** Os dois campos existem e a tela
  sabe pintá-los (Sete Lagoas e Macaé usam, por enquanto); se um exame de outro
  município precisar de um aviso específico, é só acrescentar.
- **A lista real de Congonhas ainda não existe.** O que havia aqui com esse nome
  era, na verdade, o catálogo de procedimentos APAC (removido — ver nota na
  seção "O formato"). A lista real (exames de laboratório da UPA de Congonhas)
  entra quando o documento correto for transcrito.
- **`especialidade` e `canalEncaminhamento` só existem em Macaé, por enquanto.**
  Nada nos dois campos é "específico de Macaé" — qualquer município organizado
  por especialidade ou com canal de entrada explícito pode usar os dois valores
  na mesma escala.
- **A lista de laboratoriais de bancada de Macaé ainda não chegou.** Hemograma,
  glicemia, TSH, sorologia... nenhuma das duas fontes atuais lista isso — vai
  ser a **terceira** fonte do município (a segunda foi a lista por
  especialidade, somada à UPA Barra que já existia), no mesmo padrão "um
  município, duas fontes" abaixo, quando a prefeitura mandar.
- **A aba "Serviços e Programas" do XLSX de Macaé ficou de fora.** Casa da
  Criança, CRA, Núcleo de Saúde Mental — é encaminhamento para serviço/programa,
  não pedido de exame, mesma categoria da seção "Consultas" já excluída de Sete
  Lagoas, abaixo.
- **34 dos 65 exames de "orientações" de Sete Lagoas ainda estão em `nota`, não
  em `orientacao`.** Só os dois exemplos deste guia foram reclassificados. A
  migração é releitura item a item, com a mesma dupla conferência de sempre —
  não um script automático (ver "Como preencher: o construtor `orientacao(...)`",
  acima, sobre por que não existe um classificador automático aqui).
- **As consultas/encaminhamentos de Sete Lagoas ficaram de fora.** O mesmo PDF
  tem uma segunda seção ("Consultas agendadas pela Central de Marcação") com
  encaminhamento para especialista — outra categoria, não "exame", e fora do
  escopo deste módulo. Poderia virar uma função irmã ("Especialidades do
  município"), com a mesma arquitetura, se algum dia fizer sentido.
