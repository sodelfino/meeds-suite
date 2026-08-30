# Manual do administrador

Para quem cuida do Assistente Meeds **sem programar**. Quase tudo que muda no
dia a dia é edição de um arquivo de texto, seguida de um comando.

---

## O ciclo, sempre o mesmo

1. Abra o arquivo indicado na tabela abaixo e edite.
2. Rode, na pasta do projeto:

```bash
npm run build
```

3. Publique:

```bash
git add . && git commit -m "ajuste: descreva aqui o que mudou" && git push
```

Os médicos recebem a mudança sozinhos, sem reinstalar nada.

> Se o passo 2 responder **BUILD FALHOU** ou **BUILD REPROVADO**, a mensagem diz
> o arquivo e a linha do problema. O erro mais comum é vírgula sobrando ou
> faltando num arquivo `.json` — veja "Quando der erro", no fim.

---

## Quero fazer X → abro o arquivo Y

| Quero… | Abra | Onde exatamente |
|---|---|---|
| Acrescentar uma **unidade de origem** num laudo | `dados/formularios.json` | `"lme-sete-lagoas"` → `"origens"`, ou `"cmd"` → `"origens"` |
| Acrescentar um **exame/procedimento** com código SIGTAP | `dados/formularios.json` | o bloco `"procedimentos"` do laudo correspondente |
| Acrescentar ou corrigir um **CID-10** | `dados/formularios.json` | o bloco `"cids"` do laudo correspondente |
| Mudar o **estabelecimento/CNES** da APAC | `dados/formularios.json` | `"apac-itauna"` → `"estabelecimento"` |
| Acrescentar um **território vascular** (Doppler) | `dados/formularios.json` | `"apac-itauna"` → `"territorios"` |
| Mudar o **nome ou a descrição** de uma função no painel ⚙️ | `manifest.json` | bloco `"modulos"`, campos `nome` e `descricao` |
| Mudar a **ordem dos botões** na tela | `manifest.json` | campo `prioridadeBotao` (menor = mais embaixo) |
| Atualizar a **lista de medicamentos** (REMUME) | `modules/remume/remumes.json` | depois rode `npm run sync-fallback` |
| Corrigir um **rótulo que o Meeds mudou** (ex: "Nome da Mãe") | `seletores.json` | veja a seção abaixo |
| Preparar a **lista de médicos** da equipe | `dados/medicos.exemplo.json` | veja a seção abaixo |
| Criar uma **função nova** | — | siga [COMO-ADICIONAR-MODULO.md](COMO-ADICIONAR-MODULO.md) |

---

## Comandos disponíveis

| Comando | Para que serve |
|---|---|
| `npm run build` | Gera o pacote que os médicos instalam. **Rode sempre depois de editar qualquer arquivo.** |
| `npm run verificar` | Confere se está tudo coerente, sem gerar nada. Bom para checar antes de publicar. |
| `npm run sync-fallback` | Depois de editar `remumes.json`: copia a lista para dentro do pacote (a cópia que funciona sem internet). |

---

## Casos que merecem explicação

### Corrigir um rótulo que o Meeds mudou

O sistema lê os dados do paciente procurando textos na tela: "Nome da Mãe",
"CPF", "Data de Nascimento", "Aguardando". Se o Meeds mudar um desses textos,
a leitura para de encontrar o campo.

Abra `seletores.json` e acrescente a grafia nova **na frente** da lista:

```json
"mae": ["Nome da Genitora", "Nome da Mãe", "Mãe", "Filiação"]
```

O sistema tenta as opções de cima para baixo e usa a primeira que encontrar.
Acentos e maiúsculas não importam.

**Este arquivo é especial:** ele também é lido pela internet a cada vez que o
médico abre o Meeds. Se você editar e der `git push`, a correção chega aos
médicos **sem precisar de `npm run build`**. É o caminho mais rápido quando
alguma coisa quebra no meio do plantão.

### Preparar a lista de médicos da equipe

Os dados dos médicos (nome, CRM, CPF, CNS) **não ficam no código** — são dados
pessoais e o repositório é público. Cada médico se cadastra no painel ⚙️.

Para poupar esse trabalho da equipe:

1. Copie `dados/medicos.exemplo.json` para um arquivo novo, fora do projeto.
2. Preencha com os dados reais da equipe.
3. Envie o arquivo para cada médico (e-mail, pen drive, o que for).
4. O médico abre o Meeds → ⚙️ → **Restaurar backup** → escolhe o arquivo.

**Nunca faça `git commit` desse arquivo preenchido.** O `.gitignore` já bloqueia
os nomes mais prováveis, mas confira antes de publicar.

### Atualizar a lista de medicamentos (REMUME)

1. Edite `modules/remume/remumes.json`.
2. Rode `npm run sync-fallback` (copia para dentro do pacote e sobe a versão).
3. Rode `npm run build`.
4. `git add . && git commit -m "..." && git push`.

O passo 2 existe porque a lista mora em dois lugares: o arquivo que o sistema
busca pela internet e uma cópia embutida, usada quando a internet falha ou a
rede da unidade bloqueia o GitHub. O comando mantém as duas iguais — se você
pular, quem cair na cópia embutida não vê os medicamentos novos.

---

## Quando der erro

**"Unexpected token" / "BUILD FALHOU" ao rodar `npm run build`.**
Algum arquivo `.json` está com erro de digitação. Quase sempre é vírgula:
todo item da lista termina com `,`, menos o último. Cole o conteúdo em
<https://jsonlint.com> para ver a linha exata.

**"BUILD REPROVADO — regras de arquitetura violadas".**
Alguém mexeu em código de módulo e quebrou uma das duas regras (posicionar
botão à mão ou interceptar a rede por conta própria). A mensagem diz arquivo e
linha. Não acontece por editar arquivos de dados.

**Editei e o médico não viu a mudança.**
Confira, nesta ordem: (1) rodou `npm run build`? (2) fez `git push`? (3) o
médico pode forçar em Tampermonkey → painel → o script → **Atualizar**.

**Preciso desfazer o que eu fiz.**

```bash
git checkout -- .
```

Isso descarta as edições ainda não publicadas e volta ao último estado bom.

---

## Onde fica cada coisa

```
manifest.json          nomes, descrições, ordem dos botões, versões
seletores.json         textos que o sistema procura na tela do Meeds
dados/formularios.json unidades, procedimentos, CIDs, estabelecimento
dados/medicos.exemplo.json   modelo da lista de médicos (não comitar preenchido)
modules/remume/remumes.json  lista de medicamentos por município
dist/meeds-suite.user.js     o pacote gerado — NUNCA edite à mão
core/  modules/  scripts/    código; só mexa seguindo o guia de módulos
docs/                  esta documentação
```
