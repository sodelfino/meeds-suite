# Sala de Espera — diagnóstico

Documento de investigação do defeito "a chegada do paciente não é detectada".

---

## 1. O que o módulo fazia (v1.0.0)

Levantado por leitura do código, em `modules/sala-espera/index.js`.

| Item | Valor |
|---|---|
| Endpoint | `GET /api/v1/Atendimento` |
| Query completa | `?ProfissionalId={do médico}&StatusAtendimentoId=2&Agendado=true&sort=GestaoHorario.HorarioInicial` |
| Intervalo real do polling | `setInterval(consultar, 30000)` — 30 s, **sem trava de sobreposição** |
| Origem do `ProfissionalId` | capturado do próprio tráfego da aplicação (`aoCargaRede`), nunca digitado nem inferido |
| Campo identificador | `item.id \|\| item.agendamentoId` |
| Campo de chegada | `agendamento.checkinStatus === true` (comparação **estrita**) |
| Estado anterior | `Set` de ids já notificados (`vistos`) |

### O que acontecia em cada situação

| Situação | Comportamento observado no código |
|---|---|
| a) atendimento aparece pela primeira vez | entra em `vistos`; na 1ª leitura não avisa (correto), nas seguintes **avisa** |
| b) `checkinStatus` muda `false → true` | **nada acontece** — o id já estava em `vistos` |
| c) `statusAtendimentoId` muda | não é observado; se o item sair do filtro, ele some do contador silenciosamente |
| d) item deixa de ser retornado | sai de `vistos` e do contador |

---

## 2. Causa raiz confirmada

**A detecção era feita pela presença do id, não pela chegada.**

```js
var novos = naFilaAgora.filter(function (p) {
  return !vistos.has(p.id);           // ← "novo" = id que eu ainda não vi
});
```

A consulta já filtra `StatusAtendimentoId=2`. Ou seja: **todo item devolvido
já está com status "Aguardando"** — a query devolve o agendamento assim que
ele entra nesse estado, o que acontece *antes* de o paciente chegar. Então:

1. **Poll 1** — o agendamento já vem na resposta. Vai para `vistos`.
2. Paciente chega, a recepção marca a chegada → `checkinStatus: false → true`.
3. **Poll 2** — o id **já está** em `vistos` → `novos` fica vazio → **nenhum aviso**.

O campo de chegada chegava a ser lido:

```js
chegou: agendamento.checkinStatus === true,
```

mas era usado **apenas** no filtro da lista:

```js
return p.status === STATUS_AGUARDANDO || p.chegou;   // sempre verdadeiro
```

que é sempre verdadeiro, porque a query já garantiu `status === 2`. Ou seja:
`chegou` era calculado e **descartado**. A transição nunca foi observada.

### Defeitos secundários, também confirmados no código

| # | Defeito | Consequência |
|---|---|---|
| S1 | `checkinStatus === true` estrito | `"true"` (texto) ou `1` (número) contariam como **não chegou** |
| S2 | Contador usava `aguardando.length`, que é *tudo que veio na query* | o badge contava **agendados que ainda não chegaram** |
| S3 | `setInterval` sem trava de sobreposição | resposta lenta faz requisições empilharem |
| S4 | Falha da API caía no `catch` sem preservar explicitamente o estado | risco de a fila parecer vazia numa oscilação de rede |
| S5 | `Set` de ids | impossível representar transição — só "vi" ou "não vi" |

---

## 3. O que **não** dá para confirmar sem a API real

Sou honesto sobre o limite desta investigação: **não tenho acesso à API de
produção do Meeds**. Duas perguntas continuam abertas e ambas mudam a
estratégia:

1. **O atendimento continua aparecendo no filtro `StatusAtendimentoId=2`
   depois do check-in?** Se o check-in mudar o status (por exemplo para 3),
   o item **some** da resposta — e aí a chegada precisa ser detectada pelo
   desaparecimento + uma segunda consulta, não pelo campo.
2. **`agendamento.checkinStatus` é mesmo o campo da chegada?** O nome sugere
   que sim, mas nunca foi verificado contra uma resposta real.

### Como confirmar, na sessão do próprio médico

Foi criado um diagnóstico que tira **duas fotos** da mesma consulta e mostra a
diferença. No console do navegador, com o Meeds aberto:

```js
MeedsSuite.salaEspera.diagnosticar()
```

Ele consulta, espera 45 segundos (tempo de a recepção marcar a chegada de um
paciente na tela nativa) e consulta de novo, imprimindo **o que mudou**.

**O relatório não contém dado pessoal.** O id do atendimento vira um apelido
curto e não reversível (`#3f9k2`), texto vira só o tamanho (`texto(23)`), e
datas viram `data preenchida`. São impressos: quantidade de itens,
`statusAtendimentoId`, os campos candidatos a chegada com valor e tipo, e o
*formato* da resposta (nomes de campo e tipos). Nada sai do navegador — é
`console.log` local.

Exemplo do formato do relatório (dados fictícios):

```
Foto 1 — 2 item(ns) na resposta:
  item     status
  #3f9k2   2
  #a1b7c   2

O que mudou entre as duas fotos:
  item     evento          campo                        de                para
  #3f9k2   campo mudou     agendamento.checkinStatus    false (booleano)  true (booleano)
```

Se, em vez disso, aparecer `SUMIU DA RESPOSTA`, a conclusão é a oposta: o
check-in tira o atendimento do filtro, e vale a estratégia da seção 3 do
plano (segunda consulta autorizada, sempre com `ProfissionalId={self}`).

---

## 4. Decisão de projeto tomada diante da incerteza

Como as duas hipóteses são plausíveis e só a produção decide, o detector foi
escrito para **funcionar nas duas**, em vez de apostar numa:

- reconhece a chegada por **qualquer** um dos campos candidatos que existir na
  resposta, normalizando `true` / `"true"` / `1` / data preenchida;
- trata **desaparecimento** de um item que ainda não havia chegado como um
  sinal a ser confirmado, não como "sumiu, esqueça";
- nunca consulta sem `ProfissionalId`.

O que a evidência real vai fazer é *simplificar* este código — não corrigi-lo.
Quando você rodar o diagnóstico e me disser o resultado, eu removo o caminho
que não se aplica e deixo só o confirmado, com a evidência anotada aqui.
