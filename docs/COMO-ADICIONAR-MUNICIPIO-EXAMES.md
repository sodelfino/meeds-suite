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
  "observacoes": ["regras que o médico precisa saber antes de pedir"],
  "exames": [
    { "nome": "HEMOGRAMA COMPLETO", "codigo": "28040481", "local": "UPA Barra", "exige": "APAC" }
  ]
}
```

### Só `nome` é obrigatório

`codigo`, `local`, `exige` e `observacoes` são **opcionais**, e isso não é
descuido — é o que permite representar fontes desiguais sem inventar dado:

| Município | Traz código | Traz local | Traz sigla |
|---|---|---|---|
| Betim | sim (contrato) | não | não |
| Macaé | não (o PDF não tem) | sim | não |
| Congonhas | sim (SIGTAP) | não | APAC |

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

Sigla nova precisa ser acrescentada ali **antes** de ser usada, senão o teste
falha — e sem isso a tela mostraria um selo com texto cru ao lado do exame.

### `observacoes`: regras, não curiosidades

Aparecem em destaque no topo do painel, antes da lista. Servem para o que muda a
conduta do médico **antes** de pedir. Em Macaé são duas, tiradas do PDF:
consentimento assinado para sorologia de HIV, e data de nascimento obrigatória na
requisição. Eram regras que só existiam no PDF — e um dado assim, escondido numa
gaveta, vale menos que nada.

---

## Quando um exame se desdobra

O Doppler de Congonhas vira **oito** linhas, uma por território; o Eco vira três,
uma por variante. O médico procura "doppler carótida", não "doppler" — uma linha
genérica o obrigaria a saber de cor que aquele exame tem variantes.

Ver `lerCongonhas()` em `scripts/montar-exames.js`.

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

---

## O que ainda não existe

- **Nenhum município usa `LAUDO` ainda.** O campo existe e a tela sabe pintá-lo;
  falta a informação de quais exames exigem laudo em cada município.
- **Betim não tem local.** O contrato não diz onde cada exame é feito. Quando a
  prefeitura mandar essa informação, é acrescentar `local` em cada item.
- **Macaé não tem código.** O PDF da UPA não traz código de procedimento.
