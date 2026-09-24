# Migração para o Meeds novo (v2)

Este repositório é **de teste**. O que os médicos usam no plantão continua sendo
o [meeds-suite](https://github.com/sodelfino/meeds-suite) (v1), e ele não deve
ser tocado até a virada.

---

## 1. O que já sabemos, e de onde

Tudo nesta seção veio da gravação de sessão de **03/09/2026** no ambiente de
homologação. É o que se pode afirmar olhando a tela; o que depende do HTML está
na seção 3.

**Ambiente:** `https://des-doctor-calltech.meeds.com.br/`
O `des-` é homologação. O time de produto confirmou que **o HTML será o mesmo em
produção**, sem o prefixo — por isso nada aqui pode depender do host.

### A navegação virou uma barra lateral

`Dashboard · Consultas · Pronto Atendimento · Saúde Mental · Histórico ·
Pacientes · Prescrições · Modelos`

### Pronto Atendimento

O contador de fila **mudou de forma**. No v1 era um cartão com o rótulo
"Aguardando" e um número grande embaixo. Agora é uma **aba com contador ao
lado**:

```
Aguardando (0)   Em Atendimento (1)   Atendidos (1)   Ausentes (1)   Cancelados (1)
```

Há também um botão **"Chamar Próximo"**, busca por paciente, filtros, e uma
tabela com `Horário · Paciente · Especialidade · Espera · SLA · Vínculos`.
Aparece um estado transitório "Atualizando atendimentos".

Isso importa direto para o **alarme de fila**, que lê esse contador como um dos
seus três sinais.

### Dentro de um atendimento

A videochamada agora é **embutida na própria página** (no v1 abria em janela
separada), com uma miniatura flutuante em alguns momentos.

Abas do atendimento:
`Atendimento · Prescrever · Histórico · Exames · Condições · Sintomas · Dados Cadastrais`

**A aba Prescrever tem três sub-abas: `MEMED · Meeds Docs · APAC`.**

### A Ficha de Atendimento virou SOAP + e-SUS

- `Subjetivo`, `Objetivo`, `Avaliação`, `Plano de Tratamento`
- **`CID *` e `CIAP`**, os dois com busca própria
- `Tipo de Atendimento` (Consulta agendada programada/Cuidado continuado,
  Consulta agendada, Escuta inicial/Orientação, Consulta no dia, Atendimento de
  urgência)
- `Conduta` (Retorno para consulta agendada, Retorno consulta programada,
  Agendamento para NASF, Alta do episódio, Agendamento para grupos)
- `Encaminhamento` (CAPS, Internação Hospitalar, Urgência, Serviço de Atenção
  Domiciliar, Intersetorial)
- Painel lateral **"Ficha histórica"** com os mesmos quatro campos do SOAP

### O cartão do paciente mudou de campos

`Paciente · Data de Nascimento · Vínculos · Documentos (CPF, CNS) · Parentesco`

**Atenção:** não há mais um rótulo "Nome da Mãe". O nome da mãe aparece sob
**"Parentesco"**. O `dom-reader` procura por rótulo, então isso é uma mudança
real — e é uma das perguntas da sonda.

---

## 2. O que isso muda no escopo

### APAC e CID entram desligados

O Meeds novo passou a ter **APAC nativo** (sub-aba em Prescrever) e **busca de
CID/CIAP nativa** na Ficha de Atendimento. Os nossos dois módulos equivalentes
foram mantidos, mas com `padraoHabilitado: false` no `manifest.json`.

O motivo de não removê-los agora: na gravação a aba APAC **não chegou a ser
aberta**, então não há como afirmar que a nativa gera o laudo de Itaúna com os
códigos SIGTAP e o layout que a prefeitura aceita. Se gerar, os dois módulos
saem do pacote e o repositório fica menor. Se não gerar, é um clique para ligar.

Decidir agora, sem ver, seria trocar uma certeza por uma suposição no meio do
caminho de um médico que precisa emitir o laudo.

Preferência gravada vence o padrão: quem ligar o APAC uma vez não o vê desligar
numa atualização.

### O CID voltou a ser uma chave de verdade (e por que isso contradiz o v1)

Em **03/09/2026** o v1 recebeu um `sempreAtivo` para a busca de CID e a prévia
do documento, tirando as duas do liga/desliga. A razão registrada lá: *não são
funções que o médico escolhe usar, são melhorias do próprio formulário; oferecer
uma chave para desligá-las era oferecer um jeito de piorar o formulário, sem
nada em troca.*

**Essa premissa cai no Meeds novo para o CID.** O campo CID passou a ter busca
própria. Encaixar a nossa em cima significaria duas listas de autocompletar no
mesmo input — o que não é melhoria, é conflito.

Então no v2:

- **`preview-pdf` continua `sempreAtivo`.** A premissa original vale inteira: ela
  aparece ao lado do formulário, não cria botão, e não existe nada nativo
  equivalente.
- **`cid10` voltou a ser chave**, com `padraoHabilitado: false`.

Os dois campos são contraditórios por construção — um diz "não há como
desligar", o outro "entra desligado". Se caíssem no mesmo módulo, o resultado
dependeria da ordem em que `estaHabilitado()` consulta cada um. O
`tests/inventario.test.js` falha se isso acontecer.

### O v2 só roda no host de homologação

O `@match` do v1 é `*://*.meeds.com.br/*`, o que **inclui** o
`des-doctor-calltech`. Se o v2 casasse o mesmo padrão, os dois rodariam na mesma
página: dois docks, dois alarmes, dois avisos para o mesmo paciente.

Então o v2 está preso a `*://des-doctor-calltech.meeds.com.br/*`. Ver a seção 5
para a virada.

Além disso:

- **A marca de instância única foi separada** (`__ASSISTENTE_MEEDS_V2_ATIVO__`).
  Com a marca compartilhada, um dos dois desistiria de subir **em silêncio**, e
  qual dos dois dependeria da ordem de carregamento do Tampermonkey. Falha
  silenciosa e imprevisível é o pior resultado possível: o médico concluiria que
  o Assistente quebrou.
- **O id do host do dock foi separado** (`meeds-suite-v2-dock-host`). Com o
  mesmo id, o `limparDockOrfao` do v2 apagaria o dock do v1 achando que era
  lixo de uma execução anterior sua.
- **O v2 reconhece o v1** e avisa na tela, com o texto ajustado para não soar
  como "desinstale o que você usa no plantão".

---

## 2.1 Revisão de 22/09/2026 — evidência real de duas gravações Jam

Duas gravações no `des-doctor-calltech.meeds.com.br` (não `des-`, o ambiente de
homologação de verdade), com rede capturada. Diferente da seção 1 (que veio de
vídeo do manual, só layout), aqui deu para ler **URLs, métodos, formato do
corpo e seletores reais de clique** — o que a sonda também faria, só que já
tinha acontecido.

### Rede: compatível por acaso, e por que isso não é sorte cega

A API mudou de raiz: `/api/v1/Atendimento` virou `/bff/api/v1/atendimento`
(prefixo `/bff/`, minúsculo). As assinaturas de rede de `alarme-fila`,
`remume` e `sala-espera` usam **regex sem `^`** — casam a URL inteira, não só
o começo. `/bff/api/v1/atendimento?...` ainda contém o substring
`/api/v1/atendimento?` (case-insensitive), então **as três continuam casando
sem precisar de nenhuma mudança**:

- `alarme-fila`: `ehChamadaFilaDeEspera()` confirmada contra a URL real —
  `statusAtendimentoId=2` (minúsculo, mas a regex já é `/i`), envelope do
  corpo é `{"items":[...],"totalCount":...}` — `items` já está na lista que
  `extrairListaDeItens()` procura. Nenhuma mudança necessária.
- `remume`: `/\/api\/v1\/Atendimento\/[^/?]+(?:[?#].*)?$/i` casou contra
  `.../bff/api/v1/atendimento/{uuid}` sem query — confirmado no evento de
  rede da segunda gravação.
- O campo `razaoSocialNome` (usado pela detecção de município) **continua
  existindo** em pelo menos uma resposta real (`clientes[0].razaoSocialNome`,
  visto em `/bff/api/v1/gestaohorario/now`) — não é garantia de que
  `/bff/api/v1/atendimento/{uuid}` traz o campo no mesmo caminho, mas é
  evidência a favor de manter a lógica multi-caminho que já existe em
  `core/municipio.js`, sem reescrever às cegas.

### Achado real, corrigido nesta revisão: o toast mudou de frase

O toast de "chegou paciente" não é mais "Novo Atendimento" — é **"Novo
paciente na fila de Pronto Atendimento"** (confirmado em frame de vídeo, não
só no manual). As duas frases não compartilham nenhum trecho contínuo, então
o casamento por `indexOf` nunca dispararia sozinho no v2: o Sinal A (toast) do
alarme ficaria **mudo, sem erro nenhum**.

Corrigido em `seletores.json` e no fallback embutido de `core/core.user.js`
— duas variantes novas acrescentadas, a frase do v1 mantida. Coberto por
`tests/toast-novo-atendimento.test.js`, que prova com o motor de normalização
real que o texto novo casa e que a frase antiga sozinha não casava (a razão
de a variante nova ser necessária).

### Confirmado visualmente, sem mudança necessária

O contador "Aguardando" virou aba com contorno arredondado ao lado do rótulo
— **elemento separado**, não texto fundido (`<span>Aguardando</span>
<span class="badge">0</span>` ou equivalente, a julgar pelo frame). Isso
importa porque `lerContadorPorRotulo()` (`core/dom-reader.js`) procura uma
folha com o rótulo EXATO e um irmão com número puro — se o número estivesse
colado no mesmo nó de texto do rótulo ("Aguardando0" sem separação), a leitura
falharia. O frame mostra os dois visualmente distintos (fundos diferentes),
o que é evidência a favor de continuarem sendo elementos separados — mas
**não é certeza absoluta sem inspecionar o HTML**, só inferência visual forte.

### O que continua sem confirmar (nenhuma das duas gravações passou por lá)

| Pergunta original (seção 3) | Status depois desta revisão |
|---|---|
| Rótulos ainda achados pelo `dom-reader`? | Parcial — confirmado para o toast e o contador de fila; não confirmado para o cartão do paciente |
| Nome da mãe sob "Parentesco"? Com que estrutura? | **Ainda não confirmado** — nenhuma das duas gravações abriu um cartão de paciente com esse campo visível |
| Campos do formulário SOAP novo (id/name/placeholder)? | **Ainda não confirmado** — as gravações foram fila → abrir atendimento, não chegaram no formulário |
| A aba APAC nativa cobre o laudo de Itaúna? | **Ainda não confirmado** — aba não foi aberta em nenhuma das duas |

Continuam precisando da sonda (seção 3) ou de uma gravação nova que passe por
esses três pontos especificamente.

---

## 2.2 Revisão de 22/09/2026 (2) — relatório real da sonda, rodado pelo usuário

O usuário rodou `dist/sonda-meeds-v2.user.js` contra `des-doctor-calltech.meeds.com.br`,
dentro de um atendimento aberto, e colou o relatório completo. Isso fecha (ou
deixa em aberto, com evidência real) os três pontos acima:

- **"Nome da mãe" / "Parentesco" — CONFIRMADO.** O rótulo "Nome da Mãe" não
  existe mais como leaf isolado; o cartão do paciente mostra "Parentesco" no
  lugar. `Parentesco` foi adicionado como variante de `mae` em
  `seletores.json`, no fallback embutido (`core/core.user.js`) **e**, o mais
  importante, na `VARIANTES` interna de `core/dom-reader.js` — só essa
  terceira cópia é lida de verdade por `lerPaciente()` (usado por `cmd`,
  `lme-sete-lagoas`, `apac-itauna`). O caminho DOM reportado
  (`div.mt-6.grid.gap-6 > div.flex.min-w-0.items-center > div.min-w-0 >
  span.block.text-sm.text-[var(--color-muted)]`, pai com 2 filhos) é
  compatível com o `lerValorPorRotulo` atual, que usa `textContent` do
  irmão — não exige que o irmão seja um leaf. Coberto por
  `tests/rotulo-parentesco.test.js`.

  **Lacuna arquitetural encontrada nesse processo:** `lerPaciente()` (e
  portanto `nascimento`/`cpf`/`mae`/`telefone`) NUNCA passou pelo mecanismo
  de seletor remoto (`d.seletor("rotulos", ...)`) — só `contadorFila`
  (usado pelo `alarme-fila`) passa por lá. `seletores.json`/
  `SELETORES_FALLBACK.rotulos` para esses quatro campos são hoje **letra
  morta**: editar o JSON remoto não corrige nada no cartão do paciente se o
  Meeds mudar de novo, só o `dom-reader.js` embutido no userscript
  corrige. Ficou assim porque é como o v1 sempre funcionou (cada módulo
  tinha sua cópia de `valorAoLadoDoRotulo()`); a unificação em
  `dom-reader.js` juntou as cópias mas não ligou `lerPaciente()` ao
  seletor remoto. Não mexido agora (mudança de arquitetura, fora do
  escopo desta rodada) — registrado aqui para não se perder.

- **CPF/CNS — AINDA EM ABERTO, DE PROPÓSITO.** A sonda só "achou" `cpf`
  porque uma de suas variantes exploratórias (mais ampla que o
  `seletores.json` de produção) é "Documentos" — e é esse o rótulo real na
  tela agora, cobrindo CPF *e* CNS juntos (bate com o que a seção 2.1 já
  registrava sobre o cartão do paciente). **Não foi adicionado "Documentos"
  como variante de `cpf`**: como o valor ao lado do rótulo viria com CPF e
  CNS concatenados, `lerPaciente()` (`out.cpf = cpf.replace(/\D/g, "")`)
  juntaria os dois números num valor corrompido, alimentando geração de
  APAC/LME com um CPF errado. Falta uma evidência mais funda (HTML real do
  bloco "Documentos", não só o rótulo) antes de mexer em código — próximo
  passo é rodar a sonda com uma variante exploratória que desça um nível
  a mais dentro do bloco "Documentos", ou inspecionar o HTML manualmente.

- **Campos do formulário SOAP — CONFIRMADO.** `textarea[name="evolution.subjective"]`,
  `evolution.objective`, `evolution.assessment`, `evolution.plan`. Nenhum
  módulo atual lê/preenche esses campos, mas fica registrado para uso
  futuro.

- **Aba APAC nativa / laudo de Itaúna — AINDA NÃO CONFIRMADO.** A sonda não
  mostra evidência de que a aba APAC foi aberta nessa sessão (nenhum campo
  ou âncora específica de APAC no relatório).

- **`apac-itauna` sem match na seção 5 do relatório — NÃO é um bug real.**
  A sonda normaliza UUID/id numérico no caminho para `{uuid}`/`{id}` antes
  de testar as assinaturas de rede antigas contra o relatório. A regex do
  `apac-itauna` (`/\/api\/v1\/Atendimento\/[0-9a-fA-F-]{36}(\?|$)/i`) exige
  36 caracteres hex/traço — o texto literal `{uuid}` não bate (tem "u", "i",
  "d", chaves). Contra a URL real (`.../bff/api/v1/atendimento/<uuid real>`)
  ela bate normalmente, do mesmo jeito que a do remume — é só um artefato de
  como a sonda relata, não uma quebra real. Não foi alterada.

- **`contadorFila`, `telefone`, `cns` não encontrados nesse relatório —
  esperado.** Essa sonda rodou dentro de um atendimento aberto, não na tela
  de lista do Pronto Atendimento, onde vive o contador de fila. Não é sinal
  de regressão; precisa de uma segunda rodada da sonda na tela de lista
  para confirmar `contadorFila` com evidência real (a leitura visual da
  seção 2.1 continua sendo a melhor evidência disponível até lá).

---

## 3. O que ainda não sabemos — e como a sonda resolve

Vídeo mostra layout. Não mostra HTML, nem chamadas de rede. Sem essas duas
coisas não é possível escrever seletor: dá para *adivinhar*, e cada palpite
errado custa um ciclo de ida e volta.

Perguntas abertas:

| Pergunta | Depende de |
|---|---|
| Os rótulos ainda são achados pelo `dom-reader`? | HTML real |
| O nome da mãe está sob "Parentesco"? Com que estrutura? | HTML real |
| O contador de fila, agora aba, ainda é legível por rótulo? | HTML real |
| `/api/v1/Atendimento?` e `/api/v1/Atendimento/{uuid}` ainda existem? | rede |
| Que campos (id, name, placeholder) existem no formulário novo? | HTML real |
| A aba APAC nativa cobre o laudo de Itaúna? | abrir a aba |

### A sonda

`dist/sonda-meeds-v2.user.js` — script isolado, sem `@require`, que **não altera
nada na página**. Instala, você navega, clica em *Gerar relatório* e me manda o
texto.

Ela responde as cinco primeiras perguntas de uma vez: rótulos encontrados com o
caminho no DOM e onde o valor mora, âncoras de UI, inventário de campos, rotas
de rede com contagem e status, e um veredito final dizendo **quais assinaturas
de rede do v1 ainda casam**.

**Regra que manda nela: nenhum dado de paciente sai.** O relatório vai ser
colado num chat, ou seja, sai do navegador. Então ela coleta estrutura, nunca
conteúdo:

- de um rótulo: se existe e onde mora. Nunca o valor ao lado.
- de um campo: `id`, `name`, `type`, `placeholder`, `aria-label`. Nunca o
  `value`. Campo de senha é ignorado por completo.
- de uma chamada: método, caminho e os **nomes** dos parâmetros. Nunca os
  valores (um `?PacienteId=…` identifica pessoa), nunca o corpo da resposta.
- de um toast: o seletor do container. Nunca o texto, porque toast de fila
  costuma trazer nome de paciente.

UUID e id numérico no caminho são substituídos por `{uuid}` e `{id}` — junta
rotas iguais e tira identificador do relatório de uma vez.

Isso foi verificado, não só declarado: rodando a sonda contra
`tests/smoke-sonda.html`, que tem nome, CPF, telefone e data de nascimento
fictícios na tela, o relatório saiu com **zero** ocorrências de qualquer um
deles, e um `?ProfissionalId=abc123` forçado apareceu como
`parametros: ProfissionalId` sem o valor.

### Como rodar

1. Instale `dist/sonda-meeds-v2.user.js` no Tampermonkey.
2. Abra o Meeds e **recarregue a página** (a sonda precisa estar ativa antes das
   chamadas do boot; se a aba já estava aberta, ela perde as primeiras).
3. Navegue: Pronto Atendimento → abra um atendimento → passe pelas abas,
   inclusive **Prescrever → APAC**.
4. Clique no botão roxo **🔍 Sonda v2** → *Gerar relatório* → *Copiar* (ou
   *Baixar .txt*).
5. Rode **duas vezes**: uma na lista do Pronto Atendimento e outra dentro de um
   atendimento aberto. As telas mostram campos diferentes, e o relatório é um
   retrato do que está na tela naquele momento.

---

## 4. Estado dos módulos no v2

| Módulo | Estado | O que falta |
|---|---|---|
| `alarme-fila` | migrado, **rede confirmada (22/09)** | toast corrigido; contador de fila confirmado só por frame — falta o cartão do paciente |
| `remume` | migrado, **rota de rede confirmada (22/09)** | detecção de município por `razaoSocialNome` ainda não vista dentro de `atendimento/{uuid}` especificamente |
| `lme-sete-lagoas` | migrado | lê `mae`/`cpf` do cartão do paciente via `core/dom-reader.js`; `mae`→"Parentesco" confirmado (sonda 22/09), `cpf` ainda pendente (ver 2.2) |
| `cmd` | migrado | idem (mesma leitura de `mae`/`cpf` do núcleo) |
| `preview-pdf` | migrado, **sempre ativa** | idem |
| `apac-itauna` | migrado, **desligado** | decidir contra a aba APAC nativa |
| `cid10` | migrado, **desligado** | decidir contra a busca CID/CIAP nativa (ver seção 2) |
| `sala-espera` | em standby (desde o v1) | — |

O núcleo migrou inteiro e sem alteração de arquitetura. As correções recentes do
v1 vieram junto: armazenamento durável com IndexedDB no Safari, caixa de botões
recolhível, e a busca do REMUME que não infla mais com palavra genérica.

---

## 5. A virada

Quando o Meeds novo entrar em produção, o caminho é **substituir o v1 pelo
conteúdo validado aqui** — não publicar os dois. Publicar dois significa dois
docks na tela do médico.

1. Trocar o `@match` do `bootloader.user.js` para
   `*://doctor-calltech.meeds.com.br/*` (uma linha).
2. Levar o conteúdo validado para o repositório do v1, mantendo lá o `@name`, o
   `@namespace` e as URLs de `@updateURL`/`@downloadURL`. **É isso que faz o
   Tampermonkey de cada médico atualizar sozinho**, sem ninguém reinstalar.
3. Restaurar o `MARCA_INSTANCIA` e o id do host do dock para os valores do v1,
   que passam a ser os únicos.
4. Tirar a detecção do "v1 ainda ativo" do `diagnostico.js`.
5. Arquivar este repositório.

O caminho inverso — publicar o v2 como instalação nova — obrigaria cada médico a
desinstalar e reinstalar, e quem não fizesse ficaria com a versão velha para
sempre. Por isso a atualização sobe pelo repositório do v1.

---

## 6. Virada feita em 24/09/2026

O Meeds novo entrou em produção em `admin-calltech.meeds.com.br` e o v1 foi
aposentado. O conteúdo validado no `meeds-suite-v2` veio para este
repositório (2.44.0), mantendo `@name`, `@namespace`, `@updateURL`,
`@downloadURL`, marca de instância e id do dock do v1 — quem já tem o
Assistente instalado recebe pela atualização normal. O `@match
*://*.meeds.com.br/*` do v1 já cobre o host de produção.

Correção que só apareceu em produção (Jam 176f19ca, 24/09): a aba
"Aguardando" pede `statusAtendimentoId=1&statusAtendimentoId=2`, e o alarme
recusava listas com dois status. Agora aceita `{2}` (Meeds antigo) e `{1,2}`
(Meeds novo), e ignora as consultas `take=1`, que só alimentam o contador da
aba. Coberto em `tests/fila-contagem.test.js`.

NÃO trazido do v2, por decisão pendente: APAC e CID-10 continuam ligados por
padrão. No v2 eles entravam desligados à espera de confirmar se as funções
nativas do Meeds novo os substituem; desligar em produção tiraria o botão de
quem usa hoje.
