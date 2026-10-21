# REMUME — Pará de Minas/MG

Fonte: arquivo **Medicamentos - Farmácia Básica.xlsx**, fornecido pelo usuário,
aba **Medicamentos Disponíveis**, com disponibilidade do componente básico
datada de **21/10/2026**. O município está identificado no brasão da planilha.
[Planilha de origem](https://docs.google.com/spreadsheets/d/1y-iO2MArJIGd7DpGe_blmUpkwchi7snqBbfrOLP0B5o/edit?gid=1924961163).

A transcrição de conferência está em
[tests/fixtures/remume-para-de-minas.json](../tests/fixtures/remume-para-de-minas.json),
com as linhas de origem, os textos e o SHA-256 do Excel recebido.

- Componente básico: 130 medicamentos e insumos (linhas 15–123, 126–138 e
  141–148), com local **Farmácia Central**, explicitamente indicado no cabeçalho.
- Componente estratégico: 67 linhas (202–268), correspondentes a 66 itens
  distintos. A doxiciclina 100 mg aparece em dois programas; foi cadastrada uma
  vez e mantém as duas orientações, identificadas por programa. O local fica
  `null`, pois a seção não especifica o local por medicamento.
- Total no extensor: **196 itens**, no formato existente `{nome, local}` e,
  para clonazepam e diazepam, `receituario: "azul"`, seguindo a classificação
  federal já verificada pelo projeto. A anotação genérica de controle especial
  na fonte não basta para atribuir receita azul/amarela aos demais medicamentos.

As observações por item usam `_meta.avisosItens`, com o nome completo como
termo. Os programas estratégicos e seus documentos aparecem juntos em cada
aviso. As orientações gerais de documentos, conservação e validade de receita
usam `_meta.avisos`. Essas regras são exclusivas de Pará de Minas; as regras
universais preexistentes continuam sendo aplicadas pelo extensor.

A seção de medicamentos em falta não contém itens. A fotografia de estoque
do dia 21/10/2026 não é tratada como disponibilidade em tempo real. Os itens
estratégicos são uma relação de programas e requisitos para solicitação, sem
afirmação de estoque. A seção CEAF descreve o processo e não enumera fármacos:
foi preservada como orientação, sem acrescentar medicamentos de outra fonte.

Os nomes foram preservados literalmente, inclusive descrições incompletas
(como as de sertralina), grafias como “Nitonavir” e associações cujas doses
não estão integralmente descritas. Não foram corrigidos princípios ativos,
formas, doses ou apresentações por dedução. A decomposição das exportações
segue as heurísticas existentes, mantendo a descrição original para revisão.

Validação: `node tests/remume-para-de-minas.test.js` confere a lista contra
a transcrição, as observações, os programas, os locais e a cópia offline.
Integra também `npm run verificar`, junto dos testes de busca e detecção do
município existentes. Regere os artefatos com `npm run sync-fallback` e
`npm run build`, como nas outras REMUMEs.
