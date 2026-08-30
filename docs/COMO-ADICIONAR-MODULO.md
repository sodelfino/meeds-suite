# Como adicionar uma função nova

Este guia é para quem vai **criar uma função nova** (um novo gerador de laudo,
um novo alerta, uma nova consulta). São 6 passos. Não é preciso mexer em
nenhuma função que já existe.

> **Antes de começar:** você precisa do Node.js instalado (`node --version`
> deve responder algum número). Só isso.

---

## Passo 1 — Copie a pasta modelo

Na pasta do projeto, copie `modules/_template` e dê o nome da sua função.
Use letras minúsculas e hífen, sem acento e sem espaço:

```bash
cp -R modules/_template modules/minha-funcao
```

---

## Passo 2 — Preencha o que está marcado com "TROQUE"

Abra `modules/minha-funcao/index.js` num editor de texto. Procure a palavra
**TROQUE** — cada ocorrência é um lugar que você precisa preencher:

| O que | Onde aparece para o médico |
|---|---|
| `id` | em lugar nenhum; é o nome interno. Não mude depois de publicado |
| `nome` | título no painel da engrenagem |
| `descricao` | frase embaixo do título, no painel |
| `botao.icone` e `botao.rotulo` | o botão na tela |
| `botao.prioridade` | posição na pilha de botões (menor = mais embaixo) |

As prioridades atuais são 10, 20, 30, 40 e 50. Escolha um número livre —
`60` coloca a sua função no topo da pilha, `25` a coloca entre a APAC e o
laudo de Sete Lagoas. Nenhuma outra função precisa ser renumerada.

---

## Passo 3 — Registre no `manifest.json`

Abra `manifest.json` e acrescente **um bloco** ao final da lista `"modulos"`,
copiando o formato dos que já estão lá:

```json
{
  "id": "minha-funcao",
  "nome": "Minha Função",
  "descricao": "Uma frase explicando o que ela faz.",
  "versao": "1.0.0",
  "arquivo": "modules/minha-funcao/index.js",
  "prioridadeBotao": 60
}
```

Atenção à vírgula: todo bloco menos o último termina com `,`.

---

## Passo 4 — Gere o pacote

```bash
npm run build
```

Se aparecer **BUILD REPROVADO**, leia a mensagem: ela diz o arquivo, a linha e
qual regra foi quebrada. As duas regras verificadas automaticamente são:

- **Não posicione o botão** (nada de `bottom: 24px` e parecidos). Quem
  posiciona é o sistema; você só escolhe a prioridade.
- **Não intercepte a rede por conta própria.** Use `assinaturasRede`.

Se aparecer `Gerado: dist/meeds-suite.user.js`, deu certo.

---

## Passo 5 — Teste antes de publicar

```bash
python3 -m http.server 8731
```

Abra <http://localhost:8731/tests/smoke.html>, esconda o campo de senha
(botão "Alternar tela de login") e confira que o seu botão aparece no canto
inferior direito e que a janela abre. Roteiro completo em [TESTES.md](TESTES.md).

---

## Passo 6 — Publique

```bash
git add .
git commit -m "feat: adiciona a função Minha Função"
git push
```

Os médicos recebem a atualização sozinhos, sem reinstalar nada.

---

## O que o sistema já te dá de graça

Não reimplemente nada disto — está tudo pronto em `deps`, o objeto que chega
no `start()`:

| Precisa de… | Use |
|---|---|
| dados do paciente que estão na tela | `d.dom.lerPaciente()` |
| ouvir uma chamada da API | `assinaturasRede` + `aoCargaRede` |
| mostrar um aviso rápido | `d.core.toast("mensagem")` |
| uma janela | `d.dock.criarOverlay({ estilo, html })` |
| a lista de médicos | `d.cadastro.montarSelect(elemento, {...})` |
| guardar uma preferência | `d.storage.gravarConfig({...})` |
| saber se o médico está logado | `d.auth.estaLogado()` |
| decidir com sinais que podem se contradizer | `d.decisao.criarDecisor({...})` |

---

## Erros comuns

**"Meu botão não aparece."**
Confirme que você adicionou o bloco no `manifest.json` (passo 3) e que rodou
`npm run build` (passo 4). Confira também se a função não está desligada no
painel da engrenagem.

**"Desliguei a função no painel, mas algo continua acontecendo."**
Seu `stop()` não está limpando tudo. Todo `setInterval` precisa estar no
array `timers`, e todo `MutationObserver` precisa de `.disconnect()`.

**"A janela abre atrás de outra coisa."**
Não mexa em `z-index`. Use `d.dock.criarOverlay()`, que já vem na camada certa.

**"Mudei o `id` e o médico perdeu as preferências."**
O `id` é a chave do armazenamento daquele módulo. Depois de publicado, não
mude mais.
