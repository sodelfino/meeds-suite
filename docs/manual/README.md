# Manual de treinamento

`Assistente-Meeds-Manual.pdf` — o material que vai para o médico. Uma função
por página: o que faz, onde fica, e o que fazer quando não se comporta como
esperado.

## Como regerar quando a interface mudar

```bash
./scripts/capturar-telas.sh    # refaz as imagens de docs/manual/telas/
./scripts/gerar-manual.sh      # monta o PDF
```

O primeiro roda a página de fumaça no Chrome sem janela, uma cena por vez. As
cenas ficam em `tests/smoke.html` (bloco "ROTEIRO DE CENAS"), e cada uma deixa a
interface num estado conhecido — alarme tocando, APAC com modelos, REMUME com
busca feita.

**Rode os dois sempre que mexer na interface.** Manual com print velho ensina o
que o produto não faz mais, e o médico confia no manual, não na tela.

## Por que o fundo das imagens é neutro

As cenas escondem o andaime da página de teste e pintam um fundo cinza com uma
barra e uma coluna. Não é uma imitação da tela do Meeds: um print que finge ser o
produto de outra pessoa ensina errado e envelhece pior. O que aparece nas imagens
é o Assistente — que é o que o manual explica.

## Editar o texto

O conteúdo está em `manual.html`, escrito para virar PDF pelo Chrome. Depois de
editar, rode `./scripts/gerar-manual.sh`.
