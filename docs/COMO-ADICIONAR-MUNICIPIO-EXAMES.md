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

`codigo`, `local`, `exige`, `nota` e `observacoes` são **opcionais**, e isso não
é descuido — é o que permite representar fontes desiguais sem inventar dado:

| Município | Traz código | Traz local | Traz sigla | Traz nota por exame |
|---|---|---|---|---|
| Betim | sim (contrato) | não | não | não |
| Macaé | não (o PDF não tem) | sim | não | não |
| Congonhas | sim (SIGTAP) | não | APAC | não |
| Sete Lagoas | 456 de 521 (só na fonte laboratorial) | 64 de 521 (só na fonte de orientações) | APAC / LAUDO / Alto Custo | 36 de 521 |

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
**todos** os exames daquele município — em Macaé são duas, tiradas do PDF:
consentimento assinado para sorologia de HIV, e data de nascimento obrigatória na
requisição.

`nota` é a mesma ideia, mas por **exame**: "a partir de 13 anos", "anexar
resultado de biópsia", "cadastrar o paciente uma vez por membro" mudam o que o
médico faz antes de pedir *aquele* exame específico, não o município inteiro.
Aparece como um aviso `ℹ️` dentro do próprio item, na tela.

As duas existem porque uma informação assim, escondida dentro de um PDF de
gaveta, vale menos que nada — e cada uma tem o alcance certo: município inteiro,
ou um exame só.

---

## Quando um exame se desdobra

O Doppler de Congonhas vira **oito** linhas, uma por território; o Eco vira três,
uma por variante. O médico procura "doppler carótida", não "doppler" — uma linha
genérica o obrigaria a saber de cor que aquele exame tem variantes.

Ver `lerCongonhas()` em `scripts/montar-exames.js`.

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
- **Macaé e Congonhas não têm `nota`.** O campo existe e a tela sabe pintá-lo (só
  Sete Lagoas usa, por enquanto); se um exame de outro município precisar de um
  aviso específico, é só acrescentar.
- **As consultas/encaminhamentos de Sete Lagoas ficaram de fora.** O mesmo PDF
  tem uma segunda seção ("Consultas agendadas pela Central de Marcação") com
  encaminhamento para especialista — outra categoria, não "exame", e fora do
  escopo deste módulo. Poderia virar uma função irmã ("Especialidades do
  município"), com a mesma arquitetura, se algum dia fizer sentido.
