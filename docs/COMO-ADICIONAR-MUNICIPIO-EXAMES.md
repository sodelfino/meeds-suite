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
| Congonhas | não (o documento não traz) | não | não | não | não |
| Sete Lagoas | 456 de 521 (só na fonte laboratorial) | 64 de 521 (só na fonte de orientações) | APAC / LAUDO / Alto Custo | 34 com `nota`, 2 já com `orientacao` | não |

> Um "Congonhas" diferente existiu nesta tabela até setembro de 2026 — na
> verdade era o catálogo `_comum` de `dados/apac.json` (procedimentos APAC,
> compartilhados por Itaúna/Betim/Sete Lagoas no gerador de APAC) sob um nome
> de município que nunca teve fonte própria — erro de rótulo desde o pedido
> original, não dado real de Congonhas. Removido; o Congonhas da tabela acima
> é a lista real (laboratório da UPA 24h), que entrou depois.

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
| `LABORATORIO_UPA` | O único canal conhecido é "o laboratório da própria UPA" — hoje usado em Congonhas, onde só existe uma fonte e ela é inteira desse laboratório. |
| `OUTRO` | Nenhum dos anteriores — mesma regra de `fluxo`: não force um encaixe. |

Igual a `fluxo`, um valor fora dessa lista **falha o build**. E, igual a
`fluxo`, o ícone da tela muda por **valor**, não é um ícone fixo com texto do
lado.

> **Estado atual: `canalEncaminhamento` não é usado em nenhum exame de Macaé.**
> Foi removido a pedido — os 8 exames que tinham `SISREG`, `CENTRAL_MUNICIPAL`
> ou `REGULACAO_ESTADUAL` ficaram só com o texto correspondente em
> `observacoes` (a frase, não o campo estruturado). O raciocínio acima
> continua válido para quem for usar o campo de novo, em Macaé ou em outro
> município — só não há exemplo ativo dele em Macaé neste momento. Quem usa o
> campo hoje é Congonhas, com `LABORATORIO_UPA` em todos os exames (ver
> `lerCongonhas()`).
>
> O caso que motivou a frase abaixo — canal variando por especialidade para o
> mesmo exame — segue documentado porque o **princípio** (não force um valor
> único que a fonte não afirma) continua valendo, mesmo sem `canalEncaminhamento`
> ativo em Macaé hoje: "Ecodoppler de Carótidas" entraria pelo SISREG quando
> pedido via Neurologia Adulto, mas pela Central Municipal quando pedido via
> Cardiologia — a fonte não afirma um canal único para o exame. Nesse caso o
> campo ficaria **ausente**, e a variação iria para `observacoes` como texto —
> a mesma disciplina de "só campo tipado quando o documento afirma sem
> ambiguidade".

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

**Congonhas usa a mesma regra de normalização de nome que Macaé** ("erro se
corrige, não se preserva", exceção ao padrão de Betim/Sete Lagoas) — o
documento original está em CAIXA ALTA ("DETERMINAÇÃO DO TEMPO DE PROTROMBINA
/ RNI") e foi normalizado pelo mesmo motivo: o nome existe para ser
encontrado, não para reproduzir a formatação do PDF.

### `justificativaObrigatoria`: exige justificativa no pedido?

Campo novo do EXAME (`boolean`, opcional, `default false`/ausente — nunca
`false` escrito no JSON, a mesma disciplina de todo campo opcional deste
arquivo). Responde uma pergunta que nem `orientacao` nem `especialidade`
cobrem: **este exame exige que o médico escreva uma justificativa no
pedido?**

**O critério é LABORATORIAL × NÃO-LABORATORIAL — uma coisa só, factual:**

> O exame analisa uma amostra biológica colhida do paciente (sangue, urina,
> fezes, escarro) — **laboratorial**, `justificativaObrigatoria` ausente — ou
> faz algo COM/NO paciente: captura uma imagem, registra um sinal fisiológico,
> executa um procedimento — **não-laboratorial**, `justificativaObrigatoria: true`.

Não é "tem risco", não é "é caro", não é opinião — é a mesma pergunta,
sempre, e hoje todo exame da base cai claramente de um lado ou do outro.
Exemplos de não-laboratorial: RX, USG, TC, RM, mamografia, densitometria,
cintilografia, endoscopia, colonoscopia, biópsia, cateterismo, teste
ergométrico, ECG, Holter, MAPA, EEG, espirometria, audiometria. Exemplos de
laboratorial: hemograma, dosagem bioquímica (glicose, colesterol, ureia...),
urina, fezes, sorologia, teste rápido.

**Como é aplicado no código: por FONTE, não por regex item a item.** Cada
fonte, hoje, é inteiramente laboratorial ou inteiramente não-laboratorial —
nenhuma mistura as duas coisas:

| Fonte | Classificação |
|---|---|
| Betim (contrato laboratorial) | 100% laboratorial → campo ausente |
| Macaé, UPA Barra | 100% laboratorial → campo ausente |
| Macaé, especialidades SEMUSA | 100% não-laboratorial → `true` |
| Congonhas, laboratório da UPA | 100% laboratorial → campo ausente |
| Sete Lagoas, orientações da Central | 100% não-laboratorial → `true` |
| Sete Lagoas, tabela SIGTAP laboratorial | 100% laboratorial → campo ausente |

Por isso o código não escreve `justificativaObrigatoria: true` exame a
exame: a fonte inteira sai com `exames.map(e => ({...e, justificativaObrigatoria: true}))`
no retorno da função. Se uma fonte nova misturar as duas categorias (ainda
não aconteceu), aí sim caberia decidir item a item — sempre por leitura
humana do documento, nunca por classificador automático de texto livre
(mesma disciplina do construtor `orientacao(...)`, abaixo).

**Testável sem depender do código do gerador.** `tests/exames.test.js`
reimplementa o mesmo critério do zero, como lista de palavras-chave, e
confere que ele bate com o valor de `justificativaObrigatoria` de cada exame
da base — uma segunda opinião independente, que pega contradição (um exame
marcado errado) em vez de confiar cegamente em como o dado foi gerado. Não
exige 100% de cobertura por palavra-chave (nomes curtos como "PET-CT" não
carregam vocabulário reconhecível, e está tudo bem) — exige zero contradição,
e uma cobertura mínima fora de Betim (cujos 1.983 itens de contrato nunca
foram ambíguos, e por isso não entram na medida).

UI: renderiza **"⚠️ Justificativa médica obrigatória no pedido"** no exame,
fora do bloco de `orientacao` (muitos exames com o campo não têm `orientacao`
nenhuma) — ver `linhaJustificativaObrigatoria()` em `modules/exames/index.js`.

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

## Exame suspenso: removido, não marcado

Congonhas teve dois exames que a própria fonte confirmou não estarem mais
disponíveis: "Baciloscopia direta para BAAR" (suspensa pelo Ministério da
Saúde) e "Pesquisa de sangue oculto". A política adotada foi **tirar o item
da lista**, não deixá-lo lá com um selo de "indisponível".

Existiu uma política anterior — campo `status` (`ATIVO`/`SUSPENSO`), com um
badge vermelho na tela — que foi **substituída** por esta, mais restritiva,
a pedido. O raciocínio: um exame que a unidade não realiza não deveria
aparecer pesquisável, exigindo que o médico leia um selo para só então
descobrir que não pode pedir. É mais simples e mais seguro simplesmente não
listar.

Isso não é uma regra nova de transcrição — é a mesma velha regra de sempre
("a lista de cada município é a única fonte de verdade do que ele oferece")
aplicada ao caso "a fonte diz que isto não está mais disponível": o item
não entra, do mesmo jeito que um exame nunca ofertado nunca entrou.

**Se a fonte não afirma suspensão com clareza, não remova por suposição.**
O documento de Congonhas mostrava "Pesquisa de sangue oculto" com formatação
de texto riscado, mas sem a frase explicativa que acompanhava a Baciloscopia
— só depois de confirmar com quem publicou a lista é que o item saiu.
Formatação visual ambígua (texto riscado, cor diferente) não é, sozinha,
uma afirmação do documento — é o mesmo princípio de "na dúvida, não invente"
aplicado a remoção, não só a inclusão.

---

## `encaminhamentos`: quando não é exame

A aba "Serviços e Programas Especiais" do XLSX de Macaé lista 5 serviços de
referência — Casa da Criança e do Adolescente, CRA (Centro de Referência do
Adolescente), Núcleo de Saúde Mental, Clínica do Autista, GAN (Gerência de
Alimentação e Nutrição). Nenhum deles é "exame": são estabelecimentos/serviços
para onde um especialista encaminha o paciente, cada um com seu próprio
público-alvo, atendimentos oferecidos e fluxo de entrada.

**Por que uma entidade separada, e não um "exame" com campos vazios.** Um
serviço de referência não tem faixa etária de "quem pode pedir o exame" — tem
público-alvo de "quem o serviço atende". Não tem documentos/pré-requisitos —
tem uma lista de atendimentos oferecidos. Forçar isso dentro do schema de
exame obrigaria a inventar equivalências que não existem, ou a deixar metade
dos campos de `orientacao` sempre vazios — o mesmo tipo de "endurecer o
schema para um formato" que a regra de ouro proíbe.

**Estrutura**, um objeto por serviço:

```json
{
  "nome": "CRA — Centro de Referência do Adolescente",
  "publicoAlvo": "Adolescentes de 12 a 19 anos, 11 meses e 29 dias — autolesão, tentativa de suicídio...",
  "atendimentos": [
    "Atendimento médico: ginecologia, dermatologia, clínica geral, psiquiatria...",
    "Apoio psicossocial: psicólogos, assistentes sociais, terapeutas ocupacionais.",
    "Prevenção e testes rápidos (HIV, sífilis, hepatites B/C).",
    "Grupos educativos.",
    "Serviço social."
  ],
  "fluxo": "Encaminhar adolescentes para o CRA."
}
```

`fluxo` aqui é **texto livre**, não o enum `FICA_NA_UNIDADE`/`VAI_PARA_CENTRAL`
de exame — a fonte não usa esse vocabulário para serviço, e forçar seria
inventar estrutura que ela não pede (mesma disciplina de "só campo tipado
quando o documento afirma sem ambiguidade").

**Onde mora: `dados/exames.json`, chave nova `encaminhamentos`, irmã de
`municipios` — não um arquivo novo, e nunca dentro de `municipios[x].exames`.**

- **Por que não um `dados/encaminhamentos.json` separado:** um arquivo novo
  pediria novo endpoint remoto, novo fallback embutido no pacote, novo script
  de sincronização e novo teste de "o fallback bate com a fonte" — toda a
  infraestrutura que já existe e já é testada para `exames.json` (busca
  offline, atualização sem republicar o userscript, detecção de fallback
  desatualizado). Reusar o mesmo arquivo dá a mesma garantia sem duplicar
  mecanismo nenhum. Se o volume crescer muito no futuro (hoje são 5 serviços,
  só em Macaé), a decisão pode ser revisitada.
- **Por que não dentro de `municipios["Macaé"].exames`:** misturar as duas
  listas obrigaria a busca, a paginação e a renderização de cada item a
  checar "isto é exame ou é serviço?" a cada linha — o mesmo argumento que já
  separa `dados/apac.json` de `dados/exames.json` como dois arquivos, em vez
  de um só com uma flag "isto é APAC ou é exame comum".

Formato do bloco por município (hoje só `"Macaé"` existe):

```json
"encaminhamentos": {
  "Macaé": {
    "_leia_me": "...",
    "fonte": "Serviços e Programas Especiais (SEMUSA Macaé)",
    "atualizadoEm": "2026-09-09",
    "observacoes": ["Apenas profissionais especialistas podem encaminhar para estes serviços."],
    "servicos": [ { "nome": "...", "publicoAlvo": "...", "atendimentos": [...], "fluxo": "..." } ]
  }
}
```

`observacoes`, no nível do bloco, é a mesma regra válida para o município
inteiro (aqui: só especialista encaminha) — escrita **uma vez**, não repetida
em cada um dos 5 serviços.

UI: seção própria **"📋 Encaminhamentos / Serviços de referência"**, em
paleta azul (nem aviso de risco, nem categoria de exame — informativo,
cor diferente das duas outras já usadas no módulo), renderizada uma vez por
município, antes da lista de exames. Não entra na busca, na paginação nem na
ordenação alfabética de exame — ver `pintarEncaminhamentos()` em
`modules/exames/index.js`.

Ver `lerMacaeEncaminhamentos()` em `scripts/montar-exames.js` para o exemplo
completo.

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
- **Congonhas só tem a lista de laboratório da UPA 24h, por enquanto.** O grupo
  de imagem/especialidade (equivalente ao que Macaé tem na SEMUSA) ainda não foi
  transcrito — vai ser a segunda fonte do município, mesmo padrão "um
  município, duas fontes" abaixo, quando o documento chegar.
- **`especialidade` só existe em Macaé, por enquanto.** Nada no campo é
  "específico de Macaé" — qualquer município organizado por especialidade pode
  usar o mesmo array.
- **`canalEncaminhamento` só existe em Congonhas (`LABORATORIO_UPA`), por
  enquanto.** Foi removido de Macaé a pedido (ver a nota em "`especialidade` e
  `canalEncaminhamento`: o que Macaé acrescentou", acima). O campo continua
  genérico — nenhum valor do vocabulário é exclusivo de um município.
- **A lista de laboratoriais de bancada de Macaé ainda não chegou.** Hemograma,
  glicemia, TSH, sorologia... nenhuma das duas fontes atuais lista isso — vai
  ser a **terceira** fonte do município (a segunda foi a lista por
  especialidade, somada à UPA Barra que já existia), no mesmo padrão "um
  município, duas fontes" abaixo, quando a prefeitura mandar.
- **34 dos 65 exames de "orientações" de Sete Lagoas ainda estão em `nota`, não
  em `orientacao`.** Só os dois exemplos deste guia foram reclassificados. A
  migração é releitura item a item, com a mesma dupla conferência de sempre —
  não um script automático (ver "Como preencher: o construtor `orientacao(...)`",
  acima, sobre por que não existe um classificador automático aqui).
- **As consultas/encaminhamentos de Sete Lagoas ficaram de fora.** O mesmo PDF
  tem uma segunda seção ("Consultas agendadas pela Central de Marcação") com
  encaminhamento para especialista — outra categoria, não "exame", e fora do
  escopo deste módulo. Agora existe precedente pronto para isso: a entidade
  `encaminhamentos` (ver "`encaminhamentos`: quando não é exame", abaixo),
  criada para os serviços de referência de Macaé, serviria sem mudança de
  estrutura — só uma função `lerSeteLagoasConsultas()` a mais.
