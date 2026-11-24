# Protocolo de solicitação de exames por especialidade (Varginha)

## Por quê

Varginha enviou o "Protocolo de Orientações para Solicitação de Exames por
Telemedicina" (Cardiologia, Endocrinologia, Dermatologia). Todo pedido de
exame passa pela Central de Regulação, que devolve pedido sem justificativa
clínica ("avaliação", "check-up", "controle"). O médico precisa ver, durante o
atendimento da especialidade, **quando** cada exame se justifica.

## Objetivo

No painel **Exames** do Meeds Suite, para o município Varginha, mostrar o
bloco **"📋 Protocolo de Varginha — <Especialidade>"** já aberto na
especialidade do atendimento, com:

- orientações gerais (as 5 regras + "verificar exames já realizados");
- as condições da especialidade (ex.: Cardiopatia isquêmica, IC, Arritmias…),
  cada uma recolhível, com os exames agrupados como no PDF ("Exames
  laboratoriais", "Exames de imagem"…) e o texto "quando solicitar";
- as notas de repetição / "não solicitar" de cada condição.

## Não-objetivos

- Aviso por exame na hora de buscar/copiar (opção B, descartada).
- Protocolo para outros municípios ou especialidades além das 3 do PDF.
- Transformar o protocolo em lista de exames oferecidos por Varginha (a regra
  de ouro do módulo: lista de exames só vem de documento de oferta).

## Anti-objetivos

- Reescrever, resumir ou "melhorar" o texto clínico: transcrição fiel.
- Esconder o painel de quem atende outra especialidade (o médico sempre pode
  trocar de especialidade no bloco).

## Abordagens consideradas

- **A — bloco de consulta no painel de Exames (escolhida).** Simples, não
  interfere no pedido, aproveita o padrão já usado em "encaminhamentos".
- B — aviso por exame ao buscar/copiar. Mais útil na hora do pedido, mas exige
  casar nomes do PDF com nomes de exame, frágil e maior.

## Como (decisões minhas — corrija o que quiser)

1. **Dados:** chave nova `protocolos` em `dados/exames.json`, irmã de
   `municipios` e `encaminhamentos` (mesmo precedente):
   `protocolos["Varginha"] = { fonte, atualizadoEm, especialidades: {
   "Cardiologia": { orientacoesGerais[], condicoes: [ { nome, grupos: [ {
   titulo, itens: [ { exame, quando } ] } ], notas[] } ] } } }`
   (orientações gerais por especialidade: Dermatologia não tem no PDF).
   O texto fica num arquivo-fonte próprio (`scripts/protocolos/varginha.js`)
   que `scripts/montar-exames.js` inclui na saída — o JSON é gerado, editar
   direto seria sobrescrito.
2. **Varginha no seletor de município:** passa a aparecer mesmo sem lista de
   exames. Sem lista, o painel diz que Varginha ainda não enviou a lista de
   exames oferecidos e mostra só o protocolo.
3. **Especialidade do atendimento:** lida do payload do atendimento
   (`gestaoHorario.especialidadeId` → `profissional.especialidades[].descricao`),
   comparada sem acento/caixa por prefixo ("CARDIOLOGIA" → Cardiologia,
   "ENDOCRINOLOGIA E METABOLOGIA" → Endocrinologia). Sem correspondência
   (ex.: Clínico Geral), o bloco aparece recolhido com os botões das 3
   especialidades.
4. **Testes:** dados do protocolo válidos (fonte, data, todo item com `exame`
   e `quando`, 9/5/31 condições), e detecção da especialidade a partir de um
   payload de atendimento.
5. Versão do módulo + `dados/changelog.json` + doc
   `COMO-ADICIONAR-MUNICIPIO-EXAMES.md` (seção `protocolos`), seguindo o
   CONTRIBUTING.

## Fica para quem implementar

Estilo visual do bloco (reusar classes de `encaminhamentos`), texto exato da
mensagem "sem lista de exames".
