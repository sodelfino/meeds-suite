# Testes

O que existe é um **teste de fumaça manual** com página estática e mock da API.
Não é suíte automatizada — é o mínimo para confirmar, sem tocar em produção,
que tudo continua funcionando depois de uma mudança.

## Como rodar

```bash
npm run build
python3 -m http.server 8731
```

Abra <http://localhost:8731/tests/smoke.html>.

> Precisa ser por HTTP, não `file://` — o `fetch` do mock e as buscas remotas
> se comportam diferente em `file://`.

A página imita a tela do Meeds: cartão de paciente com os rótulos reais
("Nome da Mãe", "CPF", "Data de Nascimento", "Feminino", "47 anos e 2 meses"),
card de métrica "Aguardando" e um mock de `GET /api/v1/Atendimento`.

Para os testes que geram PDF, carregue jsPDF e pdf-lib pelo CDN antes — no uso
real quem faz isso é o `@require` do Tampermonkey.

## Resultado da última execução

**160 casos, 160 passaram, 0 falharam.** Executado em 31/08/2026 contra
`dist/meeds-suite.safari.user.js` v2.13.0 (corpo idêntico ao pacote do Tampermonkey).

### Núcleo, dock e login

| # | O que verifica | Resultado |
|---|---|---|
| 1 | Núcleo sobe | ✅ |
| 2 | Hook de rede instalado uma única vez | ✅ |
| 3 | **Instância única**: a segunda execução desiste | ✅ |
| 4 | Um único dock no DOM | ✅ |
| 5 | Dock empilha os 6 botões sozinho | ✅ |
| 6 | Engrenagem no pé da pilha | ✅ |
| 7 | Tudo some na tela de login | ✅ |
| 8 | Volta a aparecer depois do login | ✅ |

### Leitura de tela

| # | O que verifica | Resultado |
|---|---|---|
| 9 | Lê os 7 campos do cartão do paciente | ✅ |
| 10 | Variantes de rótulo: "Filiação" no lugar de "Nome da Mãe" | ✅ |
| 11 | **Recusa decidir** com dois contadores divergentes | ✅ |

### Cadastro de médicos *(novo)*

| # | O que verifica | Resultado |
|---|---|---|
| 12 | Começa vazio — os dados saíram do código | ✅ |
| 13 | Cadastro grava e sobrevive ao recarregar | ✅ |
| 14 | Backup e restauração (troca de computador) | ✅ |
| 15 | Backup rejeita arquivo inválido, com mensagem que explica | ✅ |

### Alarme de fila

| # | O que verifica | Resultado |
|---|---|---|
| 16 | Primeira leitura só define a base, não dispara | ✅ |
| 17 | Paciente novo dispara o alarme | ✅ |
| 18 | **Moldura noturna** aparece junto com o banner | ✅ |
| 19 | Silencia sozinho quando a fila esvazia | ✅ |
| 20 | Moldura some junto | ✅ |

### Assistente REMUME

| # | O que verifica | Resultado |
|---|---|---|
| 21 | Fallback embutido: 11 municípios sem internet | ✅ |
| 22 | "lozartna" → "Losartana potássica" | ✅ |
| 23 | "buscopan" → escopolamina | ✅ |

### Geradores de laudo

| # | O que verifica | Resultado |
|---|---|---|
| 24 | **Erro nomeia o campo que falta**, com o rótulo da tela | ✅ |
| 25 | **Médico auto-selecionado** quando há um só cadastrado | ✅ |
| 26 | Gera o PDF do CMD (`LAUDO_CMD_….pdf`) | ✅ |
| 27 | Caixa verde de sucesso no modal | ✅ |
| 32 | Gera o PDF de Sete Lagoas (`LME_….pdf`) | ✅ |
| 33 | Caixa verde de sucesso | ✅ |
| 35 | Estabelecimento/CNES vem de `dados/formularios.json` | ✅ |
| 36 | Gera e baixa o PDF da APAC (22 KB) | ✅ |
| 37 | Seção de assinatura aparece após gerar | ✅ |
| 38 | Fluxo gov.br abre o portal | ✅ |

> **Atenção ao escrever teste para a APAC:** ela gera o PDF e só baixa quando o
> médico escolhe "Assinar via gov.br" ou "Baixar sem assinar". Verificar o
> download logo após "Gerar PDF" dá falso negativo — foi o que aconteceu na
> primeira execução deste roteiro.

### Histórico *(novo)*

| # | O que verifica | Resultado |
|---|---|---|
| 28 | Registra o documento gerado (CMD) | ✅ |
| 29 | **Não grava nome completo**: só "J.C.S. · •••909" | ✅ |
| 30 | "Reabrir" repõe a parte clínica | ✅ |
| 31 | "Reabrir" **não** repõe os dados do paciente | ✅ |
| 34 | Histórico do LME | ✅ |
| 39 | Histórico da APAC, também sem nome completo | ✅ |

### Painel da engrenagem

| # | O que verifica | Resultado |
|---|---|---|
| 40 | Lista as 5 funções | ✅ |
| 41 | Link "Ajustes" aparece no alarme | ✅ |
| 42 | Crédito "Assistente Meeds — Por: Marcelo" | ✅ |
| 43 | Desligar tira o botão na hora, sem recarregar | ✅ |
| 44 | Religar traz de volta | ✅ |
| 45 | "Ajustes" abre a configuração do alarme | ✅ |

### Primeira instalação e scripts antigos *(novo)*

| # | O que verifica | Resultado |
|---|---|---|
| 46 | Boas-vindas na primeira execução, apontando o ⚙️ | ✅ |
| 47 | **Detecta script antigo ativo** e explica como desativar | ✅ |
| 48 | "Não avisar de novo" fica salvo | ✅ |

> O teste 47 simula o script antigo montando o botão **6 segundos** depois do
> carregamento, porque é assim no mundo real (eles rodam em `document-idle`).
> A checagem é repetida em 4s, 10s, 20s e 45s — uma checagem única perderia
> esse caso.


### Aviso de atualização *(novo)*

| # | O que verifica | Resultado |
|---|---|---|
| 57 | Primeira instalação mostra boas-vindas, **não** "atualizado" | ✅ |
| 58 | Primeira instalação já registra a versão atual | ✅ |
| 59 | Reabrir na mesma versão não mostra nada | ✅ |
| 60 | Atualização mostra o aviso, com as três categorias | ✅ |
| 61 | A versão é gravada ao **exibir**, não ao fechar (evita repetir em outra aba) | ✅ |
| 62 | Pulo de versões (2.2.0 → 2.5.0) mostra as 3 acumuladas | ✅ |
| 63 | Comparação numérica: 2.10.0 é maior que 2.9.0 | ✅ |
| 64 | ⚙️ → Sobre mostra crédito, versão e histórico completo | ✅ |

Para simular uma atualização sem publicar nada:

```js
localStorage.setItem("meeds-suite:ultima_versao_vista", "2.2.0");
location.reload();
```


### Busca do REMUME — marcas, acentos e fonética *(novo)*

| # | O que verifica | Resultado |
|---|---|---|
| 65 | Erro com acento: "dipironá" → Dipirona | ✅ 5 resultados |
| 66 | Erro fonético: "cimvastatina" → Sinvastatina | ✅ 4 resultados |
| 67 | Marca presente: "Tylenol" → Paracetamol do município | ✅ 3 resultados |
| 68 | Avisa de onde veio: *"Mostrando Paracetamol — princípio ativo de Tylenol."* | ✅ |
| 69 | Marca ausente: "Allegra" → *"Allegra (Fexofenadina) não consta na REMUME deste município."* | ✅ |
| 70 | Marca ausente **não** vira item selecionável | ✅ só a explicação |
| 71 | **Nenhum resultado vem de fora da REMUME do município** | ✅ 24 itens conferidos, 0 violações |
| 72 | Falsos positivos: "dipirona" não traz digoxina | ✅ |
| 73 | Falsos positivos: "losartana" não traz lorazepam | ✅ |
| 74 | Falsos positivos: "clonazepam" não traz clonidina | ✅ |
| 75 | Falsos positivos: "amoxicilina" não traz amitriptilina | ✅ |

> O teste **71** é o mais importante do arquivo. Ele pega cada resultado
> devolvido pela busca e confere, item por item, que o texto existe
> literalmente na REMUME do município selecionado. Foi rodado em Macaé e Sete
> Lagoas, com termos que exercitam todos os caminhos (marca, acento, fonética,
> marca ausente). **Nunca remova nem afrouxe este teste:** ele é a garantia
> mecânica da regra de ouro (ver ARQUITETURA.md, D22).

Como reproduzir a garantia do teste 71:

```js
// no console, com a consulta REMUME aberta
const host = document.getElementById("meeds-suite-dock-host").shadowRoot;
const norm = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
const lista = window.MEEDS_REMUMES_FALLBACK["Macaé"].map(x => norm(String(x).split("(Local de acesso:")[0]));
// digite algo na busca, depois:
Array.from(host.querySelectorAll("#rm-results li .rm-item-text"))
  .map(li => norm(li.textContent))
  .filter(n => !lista.includes(n));   // tem que devolver []
```


### Sala de Espera *(EM STANDBY — fora da distribuição desde a v2.11.0)*

> Os casos abaixo passaram quando o módulo foi escrito e continuam válidos como
> registro. Eles **não rodam** no teste de fumaça atual, porque o módulo saiu do
> pacote: `manifest.json` o move para `_modulosEmStandby`. Ao reativá-lo, rode
> esta seção de novo antes de publicar.

| # | O que verifica | Resultado |
|---|---|---|
| 76 | Primeira leitura fotografa o estado e **não** notifica | ✅ |
| 77 | Contador no botão mostra quantos aguardam | ✅ |
| 78 | Paciente novo gera aviso, com nome, hora e espera | ✅ |
| 79 | Mesmo paciente na leitura seguinte **não** notifica de novo | ✅ |
| 80 | Três chegando juntos viram **um** aviso: "3 pacientes na sala de espera" | ✅ |
| 81 | Quem sai da fila some do conjunto de vistos | ✅ |
| 82 | Quem volta a aguardar conta como chegada nova | ✅ |
| 83 | Painel lista todos, com o tempo de espera de cada um | ✅ |
| 84 | Não consulta a API na tela de login | ✅ 0 chamadas |
| 85 | Desligar o módulo interrompe a consulta periódica | ✅ 0 chamadas |
| 86 | Religar volta a funcionar | ✅ |

Auditoria de privacidade do módulo (feita por inspeção do código):

| Verificação | Resultado |
|---|---|
| Grava algo em disco? | ❌ nada — `localStorage`, `GM_setValue` e afins não aparecem |
| Envia dados para fora? | ❌ só um `fetch` same-origin para o próprio Meeds |
| Registra nome de paciente no console? | ❌ os dois `console.debug` usam texto fixo, sem PII |

O mock de agendados na página de teste (`window.__agendados`) reproduz a forma
real da resposta — `items`, `statusAtendimentoId`, `agendamento.checkinStatus`,
`gestaoHorario.horarioInicial`, `cliente.razaoSocialNome` — para os testes
exercitarem o mesmo caminho que roda em produção.


### Desempenho da busca de CID-10 *(novo)*

Medido com a base completa publicada (14.233 códigos), no mesmo computador,
antes e depois da otimização:

| O que | Antes | Depois |
|---|---|---|
| Montar o índice | 910 ms, **na carga da página** | 348 ms, fora do caminho crítico |
| Busca "enxaqueca" | 1424 ms | 6 ms |
| Busca "diabetes" | ~600 ms | 9 ms |
| Busca "dor lombar" | 1492 ms | 9 ms |
| Busca com erro de digitação | ~1000 ms | ~88 ms |
| Pior caso medido | 1500 ms | 127 ms |
| Linhas desenhadas de uma vez | todas | no máximo 50 |

| # | O que verifica | Resultado |
|---|---|---|
| 65 | O índice **não** é montado na carga da página | ✅ |
| 66 | Busca larga ("dor") não desenha milhares de linhas | ✅ 50 linhas |
| 67 | O contador diz quantos ficaram de fora | ✅ |
| 68 | Erro de digitação continua achando ("enxaqeca" → G43) | ✅ |
| 69 | REMUME sem regressão depois da otimização | ✅ 6 termos |

> Para repetir a medição, com o pacote carregado:
> ```js
> const B = window.MeedsSuiteBusca;
> const cids = (await (await fetch("/dados/cid10.json")).json()).cids;
> let t = performance.now();
> const idx = B.criarIndice(Object.keys(cids).map(c => ({codigo:c, descricao:cids[c]})),
>                           i => i.codigo + " " + i.descricao);
> console.log("índice", Math.round(performance.now()-t), "ms");
> t = performance.now(); B.buscar("enxaqueca", idx, {}); 
> console.log("busca", Math.round(performance.now()-t), "ms");
> ```

### CID-10 dentro do laudo *(novo)*

| # | O que verifica | Resultado |
|---|---|---|
| 70 | O campo de CID dos três laudos é conectado | ✅ |
| 71 | Digitar o nome da doença mostra sugestões (máx. 8) | ✅ |
| 72 | Digitar o código também funciona ("I10") | ✅ |
| 73 | Escolher preenche **código e descrição** nos campos certos | ✅ |
| 74 | Setas + Enter selecionam sem o mouse | ✅ |
| 75 | Desligar o módulo devolve o campo a texto livre | ✅ |
| 76 | Religar reconecta o campo | ✅ |

> O teste 75 existe porque o autocomplete envolve o campo num contêiner: se o
> `stop()` não desfizesse isso, desligar o módulo deixaria lixo no formulário
> de **outro** módulo.

### Boas-vindas uma vez só *(corrigido)*

| # | O que verifica | Resultado |
|---|---|---|
| 77 | Primeira visita mostra a apresentação | ✅ |
| 78 | A marca é gravada ao **exibir**, não ao fechar | ✅ |
| 79 | Dispensar clicando **fora** mantém gravado | ✅ |
| 80 | F5 não traz de volta | ✅ |
| 81 | Navegar entre telas (SPA) não traz de volta | ✅ |
| 82 | Guarda só `meeds_assistente_boas_vindas_v1=concluido` | ✅ |

> O teste 79 é a regressão que motivou a correção: fechar clicando fora era o
> único caminho que não gravava nada, e era o mais natural de todos.


### CID-10 dentro do campo do laudo *(reescrito na v2.9.0)*

A busca de CID **não tem mais tela própria**. Ela existe apenas no campo
CID-10 dos geradores. Os casos abaixo cobrem os critérios de aceite do escopo
contextual.

| # | O que verifica | Resultado |
|---|---|---|
| 87 | O dock **não** tem mais entrada de CID | ✅ 7 botões, nenhum de CID |
| 88 | Não existe overlay global de CID | ✅ `.cid-modal` não existe |
| 89 | Campo do APAC busca por código ("J06.9") | ✅ |
| 90 | Campo do APAC busca por código sem ponto ("J069") | ✅ casamento exato |
| 91 | Campo do APAC busca por texto ("enxaqueca") | ✅ G43 em primeiro |
| 92 | Campo de Sete Lagoas por código e por texto | ✅ I10 / M54.5 |
| 93 | Campo de CMD por código e por texto | ✅ I10 / M54.5 |
| 94 | Selecionar preenche **código e descrição** | ✅ nos três geradores |
| 95 | A lista fecha ao escolher e **não reabre** | ✅ |
| 96 | Teclado: ↑ ↓ movem, Enter escolhe, Esc fecha | ✅ |
| 97 | Um único autocomplete por campo (sem datalist) | ✅ `list=null` |
| 98 | Buscar **não** dispara chamada de rede | ✅ 0 chamadas |
| 99 | Módulo desativado devolve o campo ao original | ✅ sem wrap, sem lista, sem marca, sem estilo; placeholder restaurado |
| 100 | O índice **não** é reconstruído a cada tecla | ✅ 0 reconstruções em 3 teclas |

> O teste **99** confere resíduo por resíduo, porque desligar um módulo tem que
> devolver a tela ao estado anterior: `.cid-campo-wrap`, `.cid-sug`, a marca
> `__cidConectado`, o `<style>` do autocomplete e o `placeholder` original.

#### Todos os campos de CID (v2.10.0)

Os **cinco** campos de CID dos geradores usam o mesmo motor, o mesmo índice e o
mesmo debounce.

| Campo | Gerador | Campo do formulário oficial |
|---|---|---|
| `apac-cid1` | APAC | 37 — CID-10 principal |
| `apac-cid2` | APAC | 38 — CID-10 secundário |
| `apac-cid3` | APAC | 39 — associados |
| `lme-cid` | Sete Lagoas | Diagnóstico |
| `cmd-cid` | CMD | Diagnóstico |

| # | O que verifica | Resultado |
|---|---|---|
| 101 | Busca por texto nos três campos da APAC | ✅ G43 em todos |
| 102 | Código com e sem ponto em `apac-cid2` e `apac-cid3` | ✅ J06.9 em ambos |
| 103 | Seleção no principal preenche código **e** descrição | ✅ G43.0 |
| 104 | Seleção no secundário preenche **só ele** | ✅ M54.5 |
| 105 | Secundário **não** sobrescreve a descrição do principal | ✅ |
| 106 | Seleção nos associados não mexe nos outros dois | ✅ G43.0 / M54.5 / I10 |
| 107 | A lista fecha após a seleção, nos três | ✅ |
| 108 | Um autocomplete por campo: 5 listas no total | ✅ |
| 109 | Desativar não deixa resíduo em nenhum dos cinco | ✅ placeholder restaurado em cada um |
| 110 | Religar reconecta os cinco, sem wrap duplo | ✅ |
| 111 | Sem listener duplicado: 1 busca por digitação | ✅ |
| 112 | Índice não reconstruído a cada tecla | ✅ 0 reconstruções |
| 113 | Nenhuma chamada de rede | ✅ |
| 114 | Sem botão, janela ou datalist reintroduzidos | ✅ |
| 115 | LME e CMD: código sem ponto e seleção | ✅ M54.5 + descrição |
| 116 | Regressão: REMUME, Sala de Espera e os 7 módulos | ✅ 7/7 ativos |

> O teste **105** é o que justifica o desenho: só o CID **principal** alimenta a
> "Descrição do diagnóstico" (campo 36). Se o secundário também escrevesse ali,
> escolher um CID associado apagaria a descrição do principal — o médico
> perderia o que já tinha, sem perceber.


#### Desempenho (v2.9.0)

Medido no motor, sobre a base completa de **14.233 códigos**, sem UI:

| Operação | Tempo |
|---|---|
| Montagem do índice (uma vez, sob demanda) | 369 ms |
| Busca "diabetes" | 8 ms |
| Busca "enxaqueca" | 10 ms |
| Busca "J06.9" | 10 ms |
| Busca "dia" (prefixo curto) | 6 ms |
| Busca "dor lombar" | 3 ms |
| Busca sem resultado ("abc", "xyz") | 11–19 ms |

Equivalente ao medido na v2.8.0 — a mudança de escopo não custou desempenho.
O índice continua sendo montado **uma vez**, sob demanda, e o debounce de
180 ms segue no lugar.

Para repetir a medição:

```js
const B = window.MeedsSuiteBusca;
const cids = (await (await fetch("/dados/cid10.json")).json()).cids;
const t0 = performance.now();
const idx = B.criarIndice(
  Object.keys(cids).map(c => ({ codigo: c, descricao: cids[c] })),
  i => i.codigo + " " + i.codigo.replace(/[^A-Za-z0-9]/g, "") + " " + i.descricao
);
console.log("índice:", Math.round(performance.now() - t0), "ms");
["diabetes","enxaqueca","J06.9","dia"].forEach(t => {
  const a = performance.now();
  B.buscar(t, idx, { limite: 8 });
  console.log(t, Math.round(performance.now() - a), "ms");
});
```


### Painel em abas e feedback *(v2.11.0)*

| # | O que verifica | Resultado |
|---|---|---|
| 117 | Sala de Espera fora da distribuição (6 módulos, 6 botões) | ✅ |
| 118 | Painel tem 4 abas e abre em "Funções" | ✅ |
| 119 | Só um painel visível por vez | ✅ |
| 120 | O subtítulo do cabeçalho acompanha a aba | ✅ |
| 121 | Formulário de médico começa fechado; o botão abre | ✅ |
| 122 | Máscara de CPF segue ativa dentro da aba | ✅ |
| 123 | Salvar fecha o formulário e mostra confirmação | ✅ |
| 124 | Backup/restauração no rodapé discreto da aba | ✅ |
| 125 | Aba Unidades cadastra normalmente | ✅ |
| 126 | Aba Sobre: crédito, versão, "ver o que mudou" e feedback | ✅ |
| 127 | Feedback: 3 tipos de assunto | ✅ |
| 128 | Feedback avisa para não escrever dado de paciente | ✅ |
| 129 | Feedback mostra o que vai junto, antes de enviar | ✅ |
| 130 | Enviar vazio é recusado, com explicação | ✅ |
| 131 | `mailto:` com destino, assunto e corpo corretos | ✅ |
| 132 | Corpo leva versão, funções ligadas e navegador | ✅ |
| 133 | **A assinatura técnica não carrega dado de paciente** | ✅ |
| 134 | "Copiar" monta assunto + corpo | ✅ |
| 135 | Regressão: REMUME e CID inline intactos | ✅ |

> O teste **133** compara a assinatura técnica contra uma lista de termos que
> nunca podem aparecer (nomes usados no mock, CPF, a palavra "paciente"). É a
> garantia mecânica de que o feedback não vira um canal de vazamento — o risco
> real de qualquer botão que envie texto livre a partir de uma tela clínica.

O subtítulo do cabeçalho (teste **120**) existe por causa de um defeito
concreto da versão anterior: quem rolava até o formulário de cadastro via o
título ainda dizendo *"ative apenas as funções que você usa"*.


### Prévia do documento *(v2.12.0)*

| # | O que verifica | Resultado |
|---|---|---|
| 136 | Prévia reflete o digitado, depois do debounce | ✅ 1 render, 88 ms |
| 137 | **Prévia e PDF final são o mesmo documento** | ✅ 99,28% byte a byte |
| 138 | Nenhuma renderização com o painel fechado | ✅ 0 |
| 139 | 20 teclas geram muito menos de 20 renderizações | ✅ **1** |
| 140 | Fechar revoga o blob e remove o iframe | ✅ |
| 141 | Abrir/fechar 3× não duplica painel nem iframe | ✅ 3 painéis, 0 iframes órfãos |
| 142 | Alternar entre geradores não mistura dados | ✅ `LME_…` / `LAUDO_CMD_…` |
| 143 | Zero chamadas de rede no ciclo | ✅ |
| 144 | Nada do documento em `localStorage` | ✅ só a preferência do painel |
| 145 | Desativar não deixa resíduo | ✅ 0 painéis, 0 alças, CSS removido |
| 146 | Modal volta ao lugar original | ✅ filho direto do overlay |
| 147 | Religar reconecta os 3, sem duplicar | ✅ |
| 148 | Tela estreita não oferece o painel, formulário intacto | ✅ |
| 149 | Formulário vazio não gera erro | ✅ APAC desenha com procedimento em branco |
| 150 | Acentuação renderiza corretamente | ✅ "alteração de enzimas hepáticas" |
| 151 | Regressão: REMUME, CID nos 5 campos, dock | ✅ 7 módulos, 6 botões |

#### Teste 137 — a evidência que mais importa

Gerei o PDF pela prévia e pelo botão, com os mesmos dados, e comparei byte a
byte:

```
tamanho preview: 147.365 bytes
tamanho final:   147.365 bytes
primeiros 146.311 bytes: IDÊNTICOS  (99,28% do arquivo)
```

Os 1.054 bytes finais diferem. Para provar que a diferença é o carimbo de
tempo da biblioteca, e não a prévia, gerei **dois PDFs finais seguidos**:

```
final A vs final B: também diferem, no MESMO offset (146.312)
```

Ou seja: dois arquivos "oficiais" gerados com um segundo de diferença já não
são byte-idênticos entre si. A prévia não é mais diferente do final do que o
final é de si mesmo. Está previsto em `docs/VIABILIDADE-PREVIEW.md`.

#### Desempenho

Medido pela porta real (`produzirPdf`, a mesma do botão "Gerar"):

| Gerador | Medições limpas | Tamanho |
|---|---|---|
| APAC | 8 · 11 · 12 · 13 · 22 ms | 19 KB |
| Sete Lagoas | 23 · 28 · 29 · 33 · 41 · 53 ms | 117 KB |
| CMD | 50 · 52 · 54 · 68 · 80 · 88 · 100 ms | 141 KB |

**Todos abaixo dos ~400 ms.** Pior caso limpo: 100 ms (CMD).

> **Ressalva honesta sobre a medição.** O painel do navegador do ambiente de
> teste é escondido entre uma chamada e outra, e o Chrome estrangula timers e
> continuações assíncronas em aba de segundo plano. Em rajadas de gerações
> coladas, o CMD chegou a marcar ~3.000 ms — mas a instrumentação por fase
> mostrou que **as etapas síncronas ficaram em 3 a 8 ms em todas as
> iterações**; só os dois `await` (`PDFDocument.load` e `doc.save()`)
> incharam. É a assinatura de throttling, não de custo de CPU.
>
> Para medir com rigor, rode o trecho abaixo num Chrome comum, com a aba em
> primeiro plano:

```js
// com um gerador aberto e a prévia ligada
let fichas = [];
MeedsSuite.assinarEvento("preview:registrar-gerador", f => { fichas.push(f); return true; });
MeedsSuite.publicarEvento("preview:pronto", {});
setTimeout(async () => {
  for (const f of fichas) {
    const ms = [];
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 800));   // mesmo intervalo do debounce
      const t = performance.now();
      await f.produzirPdf();
      ms.push(Math.round(performance.now() - t));
    }
    console.log(f.id, ms);
  }
}, 300);
```


### Safari / iPad *(v2.13.0)*

O teste de fumaça passou a carregar **a variante Safari**, de propósito: um
navegador comum não tem `GM_setValue` nem `unsafeWindow` — que é exatamente o
ambiente do app Userscripts com `@grant none`. Como o corpo dos dois arquivos é
idêntico byte a byte, a suíte inteira cobre os dois alvos.

| # | O que verifica | Resultado |
|---|---|---|
| 152 | Ambiente sem GM e sem `unsafeWindow` (igual ao Safari) | ✅ |
| 153 | Núcleo sobe sem GM: 7 módulos, 6 botões | ✅ |
| 154 | Hub de rede instalado no escopo da página | ✅ |
| 155 | **O hub enxerga o `fetch` da página** — o que o escopo isolado quebraria | ✅ evento recebido |
| 156 | Cadastro cai para `localStorage` e funciona | ✅ |
| 157 | Detecção de iOS: Mac sem toque → `false` | ✅ |
| 158 | Detecção de iOS: Mac **com** toque (iPadOS 13+) → `true` | ✅ |
| 159 | Corpo dos dois pacotes é idêntico | ✅ byte a byte |
| 160 | REMUME e CID intactos na variante Safari | ✅ |

O teste **155** é o que justifica a escolha de `@grant none`: com qualquer
`@grant`, o Userscripts move o script para o content script scope e esse evento
não chegaria — o alarme de fila, a captura do paciente na APAC e a detecção de
município do REMUME ficariam cegos.

> **O que ainda não foi verificado em aparelho real.** Não tenho iPad aqui.
> Falta confirmar no dispositivo: a instalação pelo app Userscripts, o download
> do PDF indo para Arquivos, e a suposição de que o Safari do iOS não renderiza
> PDF em `<iframe>` — é por causa dela que a prévia não é oferecida ali. Se a
> prévia funcionar no seu iPad, o comentário em `modules/preview-pdf/index.js`
> diz qual linha trocar.


### Faxina do repositório *(QA de limpeza)*

Executado em 01/09/2026 contra `dist/meeds-suite.user.js` v2.14.0.

**Método:** um cruzamento automático de cada arquivo versionado contra o
`manifest.json` e contra o texto de todos os outros arquivos, mais um detector
de funções definidas e nunca chamadas. Nada foi removido por impressão.

| # | O que verifica | Resultado |
|---|---|---|
| 83 | Nenhum arquivo versionado ficou sem referência | ✅ |
| 84 | Nenhuma função definida e nunca chamada | ✅ |
| 85 | `cimvastatina` → sinvastatina (capacidade que a fonética removida cobria) | ✅ |
| 86 | REMUME sem regressão (6 termos) | ✅ |
| 87 | CID no campo dos três laudos: sugestão e preenchimento | ✅ |
| 88 | Máscara de CPF | ✅ |
| 89 | Painel: abas, crédito, versão e histórico | ✅ |
| 90 | Ligar/desligar módulo ao vivo | ✅ |
| 91 | Alarme: base → disparo → auto-silêncio + moldura | ✅ |
| 92 | Boas-vindas aparece na 1ª visita e **não** na 2ª | ✅ |
| 93 | Sala de Espera: 31 testes de unidade | ✅ |

> **Dois testes meus deram falso negativo e vale registrar por quê**, porque a
> mesma armadilha volta:
> 1. o crédito do painel foi procurado por `.msm-credito`, mas a classe virou
>    `.msm-sobre-credito` quando o painel ganhou abas — o produto estava certo;
> 2. o teste das boas-vindas limpou o `localStorage` **depois** de a página já
>    ter decidido se mostrava o aviso. Para valer, é preciso limpar **e
>    recarregar**.

### Defeitos encontrados pela própria limpeza

O detector de código morto achou dois defeitos reais na Sala de Espera, que os
testes anteriores não pegavam:

| Defeito | Como aparecia |
|---|---|
| `confirmarDesaparecidos` definida e **nunca chamada** | a consulta de confirmação — peça central da detecção — não rodava |
| `confirmacaoEmAndamento` e `falhasSeguidas` **nunca declaradas** | `ReferenceError` no primeiro paciente que saísse do filtro |

Os dois passaram por `node --check` porque ele só valida sintaxe. O teste 7 foi
reescrito para exigir que a consulta de confirmação **aconteça** (antes ele só
verificava que "não quebra"), e ganhou dois vizinhos: 7b (quem já chegou não
gera consulta extra) e 10b (nenhuma URL sem `ProfissionalId`).

### Funções sempre ativas *(novo)*

Executado em 01/09/2026 contra `dist/meeds-suite.user.js` v2.18.0.
**31 verificações, 31 passaram.**

| # | O que verifica | Resultado |
|---|---|---|
| 94 | O painel não mostra chave para a busca de CID nem para a prévia | ✅ |
| 95 | As outras cinco funções seguem com chave | ✅ |
| 96 | A nota do rodapé nomeia as duas sempre ativas | ✅ |
| 97 | Quem tinha **desligado** antes: as duas voltam sozinhas | ✅ |
| 98 | `definirHabilitado` pelo console é ignorado para elas | ✅ |
| 99 | Ligar/desligar as demais continua valendo na hora | ✅ |
| 100 | Campo de CID conectado nos três laudos, com a função sempre ativa | ✅ |
| 101 | Prévia do documento montada ao abrir o laudo | ✅ |

> **Como resetar o estado para testar do zero.** O armazenamento deixou de ser
> só `localStorage`: as preferências vivem num banco durável (IndexedDB
> `meeds-suite`), para sobreviver a "limpar dados do site" no iPad. Um
> `localStorage.clear()` **não** reseta mais nada — e isso me custou três
> rodadas de falso negativo neste QA. O reset correto:
>
> ```js
> localStorage.clear(); sessionStorage.clear();
> // feche as outras abas do mesmo endereço: uma conexão aberta bloqueia o delete
> indexedDB.deleteDatabase("meeds-suite");
> ```
>
> Depois disso, recarregue a página **numa aba nova** — o painel de teste
> reaproveita o contexto JS ao renavegar para a mesma URL, então o núcleo não
> reinicializa e o estado antigo continua em memória.

### Extensibilidade

Verificado à parte: criei um sexto módulo a partir de `modules/_template`,
acrescentei uma linha ao `manifest.json` e rodei `npm run build`. Ele apareceu
na pilha, na posição declarada, com a janela funcionando — **sem uma linha
alterada** nos cinco módulos existentes nem no núcleo. Depois removi.

## Verificações que rodam sem navegador

```bash
npm run verificar   # manifest coerente, regras de arquitetura, fallback em dia
```

O build **reprova** (código de saída 1) se algum módulo — ou o próprio
`modules/_template` — tiver posição hardcoded em pixel ou hook próprio de
fetch/XHR. Verificado introduzindo as duas violações de propósito.

## O que ainda não é coberto

- Não há teste automatizado em CI. O roteiro acima é manual.
- O layout dos PDFs não é comparado pixel a pixel com o original. A garantia é
  que as funções de geração foram extraídas **verbatim** e que os PDFs base são
  byte a byte idênticos aos dos repositórios de origem.
- O comportamento contra a API real do Meeds (formatos de payload que o mock não
  reproduz) só será exercido na validação em produção.
- A detecção dos scripts antigos depende de eles manterem os mesmos ids no DOM.
  Se algum dia mudarem, atualize a lista em `core/diagnostico.js`.
