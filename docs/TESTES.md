# Testes

O que existe hoje é um **teste de fumaça manual** com página estática e mock da
API. Não é suíte automatizada — é o mínimo para confirmar, sem tocar em
produção, que o núcleo sobe, que o dock empilha, que o hook único de rede
entrega os eventos e que a leitura de tela responde.

## Como rodar

```bash
node scripts/build.js
python3 -m http.server 8731
```

Abra <http://localhost:8731/tests/smoke.html>.

> Precisa ser por HTTP, não `file://` — o `fetch` do mock e as buscas remotas
> se comportam diferente em `file://`.

A página imita a tela do Meeds: cartão de paciente com os rótulos reais
("Nome da Mãe", "CPF", "Data de Nascimento", "Feminino", "47 anos e 2 meses"),
card de métrica "Aguardando" e um mock de `GET /api/v1/Atendimento` que
responde `{ data: [{ id }] }`, o mesmo formato que o alarme espera.

## Roteiro e resultados obtidos

Executado em 30/08/2026 contra `dist/meeds-suite.user.js` v2.0.1.

| # | Passo | Esperado | Resultado |
|---|---|---|---|
| 1 | Carregar a página | núcleo sobe, hook de rede instalado 1x | ✅ núcleo 2.0.0, `estaInstalado() === true` |
| 2 | Campo de senha visível | nada da suite aparece | ✅ dock oculto |
| 3 | Esconder o campo de senha | dock aparece | ✅ 6 botões: ⚙️, 🔔, APAC, Sete Lagoas, CMD, 💊 |
| 4 | Conferir a pilha | ordem por prioridade, ⚙️ embaixo | ✅ nenhum módulo declara posição |
| 5 | "Ler paciente da tela" | 7 campos lidos | ✅ nome, CPF, nascimento (BR e ISO), mãe, telefone, sexo |
| 6 | Trocar o rótulo "Nome da Mãe" por "Filiação" | continua lendo | ✅ variantes do núcleo funcionando |
| 7 | Dois contadores "Aguardando" divergentes | **recusa** decidir | ✅ `lerContadorPorRotulo()` devolve `null` |
| 8 | Ligar o alarme e chamar a API 1x | só define a base, não toca | ✅ banner permanece oculto |
| 9 | Chamar a API com um id novo | dispara | ✅ banner aparece |
| 10 | Esvaziar a fila | silencia sozinho | ✅ banner some |
| 11 | Desligar um módulo no ⚙️ | botão some na hora, sem reload | ✅ e assinaturas de rede vão a 0 |
| 12 | Religar | volta a funcionar | ✅ assinaturas voltam a 1 |
| 13 | REMUME sem internet no repo | fallback embutido segura | ✅ 11 municípios, 538 itens em Macaé |
| 14 | Buscar "lozartna" | corrige e avisa | ✅ "Mostrando resultados para Losartana potássica" |
| 15 | Buscar "buscopan" | acha pelo princípio ativo | ✅ 4 resultados de escopolamina, com selo 📍 |
| 16 | Gerar LME de Sete Lagoas | PDF baixa | ✅ `LME_PACIENTE_DE_TESTE.pdf`, 117 KB |
| 17 | Gerar laudo CMD | PDF baixa, contador funciona | ✅ `LAUDO_CMD_….pdf`, 144 KB, "94/700" |
| 18 | Gerar APAC | PDF + fluxo gov.br | ✅ `APAC_….pdf`, 22 KB, abriu `assinador.iti.br` |
| 19 | Médicos pré-cadastrados | CNS/CRM/CPF preservados | ✅ 3 no APAC, 6 no LME e no CMD |

Para os passos 16–18 é preciso ter jsPDF e pdf-lib na página — no uso real o
`@require` do Tampermonkey cuida disso; no teste, carregue os dois pelo CDN
antes de gerar.

## Verificações que rodam sem navegador

```bash
node scripts/build.js --check       # manifest coerente + regras de arquitetura
node scripts/sync-fallback.js --check   # fallback do REMUME em dia
```

O `build.js` **reprova** (código de saída 1) se algum módulo tiver posição
hardcoded em pixel ou hook próprio de fetch/XHR. Isso foi verificado
introduzindo as duas violações de propósito e confirmando a reprovação.

## O que ainda não é coberto

- Não há teste automatizado em CI. O roteiro acima é manual.
- O layout dos PDFs gerados não é comparado pixel a pixel com o original — a
  garantia aqui é que as funções de geração foram extraídas **verbatim** e que
  os PDFs base são byte a byte idênticos aos dos repositórios de origem.
- O comportamento contra a API real do Meeds (formatos de payload que o mock
  não reproduz) só será exercido na validação em produção.
