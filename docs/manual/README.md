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

---

# Guia de instalação (Chrome e Edge)

`Assistente-Meeds-Instalacao.pdf` — o material que ensina o médico a **instalar**:
Tampermonkey, a permissão **"Permitir scripts de usuário"** (o passo que mais
trava — tem três páginas só para ele) e o Assistente, com imagens em cada passo.
Termina com um resumo de uma página do que o Assistente faz. O manual de bolso
acima ensina a **usar** depois de instalado.

```bash
./scripts/gerar-guia-instalacao.sh    # monta o PDF a partir de instalacao.html
```

Conteúdo em `instalacao.html` (HTML + SVG, feito para virar PDF pelo Chrome).

## Por que as telas do navegador são ilustrações

A loja de extensões e a página do Tampermonkey mostram a lista de extensões e o
perfil de quem tirou o print — material que vai para dezenas de médicos não pode
carregar isso. E um print de uma versão do Chrome envelhece no mês seguinte: o que
importa é o **nome do botão** e **onde ele fica**. Por isso essas telas são SVG
desenhado à mão, com a marcação vermelha do que clicar, e cada uma diz na legenda que
é ilustração.

A única imagem **real** é `telas/instalacao-dock.png` (o Assistente no Meeds, que é o
que o guia ensina a conseguir). Para refazê-la quando a interface mudar, veja o bloco
"instalacao-dock — como refazer" no fim de `scripts/gerar-guia-instalacao.sh`.

## O que conferir antes de reenviar o guia

- Os dois endereços de loja e o endereço do script (`dist/meeds-suite.user.js`) ainda
  abrem — o guia os escreve por extenso.
- O nome da chave ("Permitir scripts de usuário") ainda é o que o Chrome e o Edge
  mostram. Se um deles renomear, ajuste a página do Passo 2 (parte 2) e a legenda.
- Os botões do print real batem com o que o pacote distribui hoje.
