# Viabilidade: pré-visualização de PDF ao vivo

Levantamento feito **antes** de escrever código, para decidir se o preview pode
ser o documento real ou seria uma segunda fonte de verdade.

## Veredito

**Viável, e com fonte única de verdade.** Os três geradores montam o PDF
inteiramente no navegador, com bibliotecas já carregadas. O preview pode
chamar exatamente a mesma função de desenho — nenhuma reimplementação de
layout é necessária.

Não há dependência de servidor em nenhum ponto da geração.

## Como cada gerador produz o PDF hoje

| | APAC — Itaúna | Laudo — Sete Lagoas | Laudo — CMD |
|---|---|---|---|
| Biblioteca | **jsPDF** 2.5.1 | **pdf-lib** 1.17.1 | **pdf-lib** 1.17.1 |
| Onde monta | cliente | cliente | cliente |
| Template | nenhum — desenha do zero | PDF oficial embutido (base64), desenha por cima da página 1 | PDF oficial embutido (base64), preenche campos AcroForm e achata |
| Síncrono? | **síncrono** (dentro de um `.then` que resolve o jsPDF) | **assíncrono** (`await pdfDoc.save()`) | **assíncrono** |
| Ponto de entrada | `gerarPdf()` → `gerarPdfInterno(jsPDFCtor)` | `gerarPdf()` | `gerarPdf()` |
| Onde nascem os bytes | `doc.output('arraybuffer')` | `await pdfDoc.save()` | `await pdfDoc.save()` |
| Já devolve em memória sem baixar? | **sim** — guarda em `pdfGerado.bytes` e só baixa quando o médico escolhe "assinar" ou "baixar" | **não** — chama `baixarPdf()` na sequência | **não** — idem |

## O que precisa mudar (e o que não precisa)

**Não precisa mudar:** nenhuma coordenada, nenhuma fonte, nenhum template,
nenhuma regra de negócio. O desenho fica exatamente como está.

**Precisa mudar:** separar *produzir os bytes* de *baixar o arquivo* no LME e
no CMD. Hoje as duas coisas moram na mesma função. A APAC já é separada — foi
assim desde o repositório original, por causa do fluxo de assinatura gov.br.

O desenho passa a viver em `produzirPdf()`, que devolve `{ bytes, filename }`
e não toca na tela. `gerarPdf()` passa a ser: validar → `produzirPdf()` →
registrar no histórico → baixar → confirmar. O preview chama `produzirPdf()` e
mais nada.

## Duas diferenças conhecidas entre preview e arquivo final

Registradas aqui porque são reais e não devem ser descobertas depois.

**1. Validação.** `gerarPdf()` recusa gerar com campos obrigatórios vazios; o
preview precisa desenhar mesmo incompleto — é justamente para isso que serve.
Então o preview pula a validação e chama o desenho direto. O *desenho* é o
mesmo; o que muda é só a porta de entrada.

**2. Carimbo de data das bibliotecas.** jsPDF e pdf-lib gravam a data de
criação/modificação nos metadados do arquivo. Dois PDFs gerados com os mesmos
dados em segundos diferentes têm **bytes diferentes**, ainda que o conteúdo
visível seja idêntico.

Consequência para o teste de equivalência: comparar hash bruto daria falso
negativo. A comparação correta é **número de páginas + texto extraído + tamanho
aproximado**, ignorando o bloco de metadados. Está assim em `docs/TESTES.md`.

## Limitação da renderização, assumida de propósito

O preview usa `<iframe>` com `blob:` URL, exibido pelo visualizador de PDF do
próprio navegador. É a opção mais fiel possível: o médico vê literalmente o
arquivo, com o mesmo motor que vai imprimi-lo.

O preço: **o visualizador nativo não expõe a posição de rolagem à página**.
Não dá para restaurar o ponto exato após uma re-renderização. O que dá para
preservar, pelo fragmento da URL (`#page=N&zoom=Z`), é a **página** e o
**zoom** — e é o que fazemos.

A alternativa seria renderizar com pdf.js num `<canvas>`, o que permitiria
guardar o `scrollTop`. Foi descartada por três motivos: acrescenta uma terceira
biblioteca; o worker do pdf.js buscaria um arquivo na rede no momento de
renderizar, o que a especificação proíbe; e o resultado seria uma
*re-renderização* do PDF, não o PDF — menos fiel justamente no ponto que mais
importa aqui.

Com o debounce de 700 ms, a re-renderização é rara o bastante para que a
perda de posição dentro da página não atrapalhe. Documentos de 1 a 2 páginas,
como estes, praticamente não sofrem.
