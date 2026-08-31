# Arquitetura do Assistente Meeds

Documento de referência do monorepo. Explica o desenho, o contrato de módulo,
o **checklist de funções preservadas** de cada um dos 5 repositórios de origem,
a estratégia de migração e as decisões técnicas tomadas ao longo do caminho.

---

## 1. O problema que motivou a unificação

Até aqui existiam 5 userscripts independentes, todos rodando na mesma página:

| Repositório | Arquivo | Versão |
|---|---|---|
| `sodelfino/meeds-alarme-fila` | `meeds-alarme-fila.user.js` | 1.4.0 |
| `sodelfino/apac-itauna-meeds` | `APAC_GERADOR_FINAL.user.js` | 1.9.0 |
| `sodelfino/lme-sete-lagoas-gerador` | `LME_SETE_LAGOAS_GERADOR.user.js` | 1.4.0 |
| `sodelfino/laudo-cmd-meeds` | `CMD_GERADOR.user.js` | 1.4.0 |
| `sodelfino/meeds-remume-assistant` | `meeds-remume-assistant.user.js` | 1.7.4 |

Os cinco duplicavam o mesmo esqueleto:

- **Trava de frame** (`window.self !== window.top`) — copiada 5 vezes, com o
  mesmo comentário explicativo em 5 arquivos.
- **Detecção de login** (`input[type="password"]`) — em duas variantes
  divergentes: alarme e REMUME só checavam a existência do campo; APAC, LME e
  CMD checavam também se ele estava visível.
- **Leitura de rótulo no DOM** — `valorAoLadoDoRotulo()` triplicada, com
  listas de variantes **diferentes** em cada cópia (o CMD tentava 4 variantes
  para "nome da mãe", o APAC tentava 2, o LME não lia o campo).
- **Interceptação de rede** — 3 dos 5 (alarme, APAC, REMUME) instalavam
  **cada um o seu próprio** patch em `XMLHttpRequest.prototype` e em
  `window.fetch`. Com os três instalados, toda chamada da aplicação
  atravessava três camadas de wrapper encadeadas.
- **Botão flutuante com posição fixa em pixel**, coordenada manualmente entre
  repositórios: APAC `bottom:24`, LME `bottom:88`, CMD `bottom:152`,
  REMUME `bottom:224 right:80`, alarme `left:24` + engrenagem `left:82`.

E o custo prático: **5 instalações e 5 atualizações separadas por médico**.

> Evidência de que a coordenação manual não escalava: o comentário no topo do
> CSS do CMD dizia que o botão ficava em `bottom:224px`, "no topo da pilha,
> acima de todos" — enquanto o código logo abaixo dizia `bottom:152px`.
> Comentário e código já estavam fora de sincronia no repositório publicado.

---

## 2. Desenho alvo

```
  ┌──────────────────────────────────────────────────────────────┐
  │  bootloader.user.js   ← a ÚNICA coisa que o médico instala   │
  │  · trava de frame (1x)                                       │
  │  · instala o hook de rede em document-start                  │
  │  · carrega núcleo + módulos e sobe tudo no DOMContentLoaded   │
  └───────────────────────────┬──────────────────────────────────┘
                              │
  ┌───────────────────────────▼──────────────────────────────────┐
  │  NÚCLEO (window.MeedsSuite)                                  │
  │                                                              │
  │  auth.js            trava de frame + detecção de login       │
  │  storage.js         config por módulo, namespaced            │
  │  cadastro.js        médicos e estabelecimentos + backup      │
  │  formatos.js        máscara de CPF e formatação de campos    │
  │  busca.js           motor de busca em duas camadas            │
  │  fonetica-ptbr.js   código fonético do português              │
  │  historico.js       documentos gerados, sem dado de paciente │
  │  mensagens.js       como o sistema fala com o médico         │
  │  diagnostico.js     instância única, scripts antigos, 1ª vez │
  │  network-hub.js     hook ÚNICO de fetch/XHR → barramento     │
  │  dom-reader.js      leitura de rótulo com variantes          │
  │  decision-engine.js fusão de sinais com confiança            │
  │  dock.js            botões auto-empilháveis, toast, overlay   │
  │  manager.js         painel ⚙️ de ativar/desativar            │
  │  core.user.js       registro de módulos e ciclo de vida      │
  └───────────────────────────┬──────────────────────────────────┘
                              │  registerModule({...})
      ┌───────────┬───────────┼───────────┬────────────┐
      ▼           ▼           ▼           ▼            ▼
  alarme-fila  apac-itauna  lme-sete-  cmd        remume
                            lagoas
   ← cada módulo tem SÓ a sua regra de negócio →
```

### Regras de arquitetura (verificadas pelo build)

| Regra | Como é garantida |
|---|---|
| Nenhum módulo posiciona o próprio botão | `scripts/build.js` **reprova o build** se encontrar `bottom/top/left/right: Npx` fora de comentário num arquivo de módulo |
| Nenhum módulo instala hook de fetch/XHR | idem, para `XMLHttpRequest.prototype.open/send =` e `window.fetch =` |
| Um módulo novo não exige tocar em módulo existente | basta criar a pasta, chamar `registerModule` e adicionar uma entrada no `manifest.json` |
| Ativar/desativar não recarrega a página | `definirHabilitado()` chama `start()`/`stop()` na hora |

Essas duas primeiras regras não são só documentação: `node scripts/build.js`
sai com código 1 e lista arquivo e linha da violação. Isso foi testado
introduzindo violações de propósito.

---

## 3. Contrato de módulo

```js
window.MeedsSuite.registerModule({
  id: "alarme-fila",              // único; namespaceia o storage
  nome: "Alarme de Fila",         // exibido no painel ⚙️
  descricao: "…",                 // uma linha, exibida no painel
  versao: "2.0.0",
  configPadrao: { … },            // mesclado com o que estiver salvo

  botao: {                        // null se o módulo não quiser botão
    icone: "🔔",
    rotulo: "APAC - Itaúna",      // vazio em botão redondo
    variante: "icone",            // "icone" | "engrenagem" | ausente (pílula)
    titulo: "…",                  // tooltip
    prioridade: 10,               // MENOR = mais embaixo na pilha
  },

  assinaturasRede: [              // opcional
    { regex: /\/api\/v1\/Atendimento\?/i, metodos: ["GET"] },
  ],

  start(deps) { … },              // chamado quando o módulo é habilitado
  stop() { … },                   // chamado ao desabilitar: LIMPE TUDO
  aoCargaRede(evt) { … },         // evt = { url, metodo, status, corpo, json() }
});
```

### `deps` entregue ao `start()`

| Campo | O que é |
|---|---|
| `core` | API do núcleo (`toast`, `listarModulos`, `seletor`, …) |
| `network.assinar(spec, cb)` | assinatura extra em runtime; devolve função de cancelamento |
| `dom` | `lerPaciente()`, `lerValorPorRotulo()`, `lerContadorPorRotulo()`, `normalizarTexto()` |
| `storage` | `ler/gravar/lerConfig/gravarConfig`, já namespaceado por módulo |
| `dock` | `toast()`, `criarOverlay()`, `criarBanner()` — **sem** nada de posição |
| `decisao` | `criarDecisor()`, `unicoOuNada()` |
| `auth` | `estaLogado()`, `estaNaTelaDeLogin()` |
| `config` | config já carregada e mesclada com `configPadrao` |
| `botao` | handle do botão: `definirTexto`, `definirClasse`, `mostrar`, `esconder` |
| `seletor(grupo, chave)` | rótulos/textos, já com a config remota aplicada |
| `aoClicarBotao(fn)` | registra o que acontece no clique |

**Obrigação do `stop()`:** remover overlays, `clearInterval` de todos os
timers, desconectar `MutationObserver` e zerar estado. As assinaturas de rede
e o botão o núcleo remove sozinho. Um `stop()` incompleto vaza timer e o
módulo continua "meio rodando" depois de desligado no painel.

---

## 4. Checklist de funções preservadas

Este é o critério de aceite "nenhuma funcionalidade perdida", item por item.
Todos os itens marcados foram verificados no teste de fumaça (`docs/TESTES.md`)
ou por inspeção direta do código migrado.

### 4.1 Alarme de Fila (`meeds-alarme-fila` v1.4.0)

- [x] Sinal A — toast nativo "Novo Atendimento", só em nós **adicionados** ao
      DOM, com limite de 80 caracteres no texto do elemento (evita casar com
      um botão estático "+ Novo Atendimento")
- [x] Sinal B — `GET /api/v1/Atendimento?…StatusAtendimentoId=2` **sem**
      `ProfissionalId` (distingue a fila geral de "meus atendimentos")
- [x] Assinatura de chamada ignorando `skip`/`take`/`version` (paginação não
      cria uma "fila nova")
- [x] Primeira leitura de cada assinatura **só define a base**, nunca dispara
- [x] Sinal C — contador "Aguardando" no DOM, a cada 4 s
- [x] Recusa de decidir sob leitura ambígua (dois números candidatos → `null`)
- [x] Sinal D — modo "tempo de espera", uma vez por paciente, até 120 min
- [x] Debounce de 2,5 s entre sinais do mesmo evento
- [x] 4 sons sintetizados (Web Audio, sem arquivo externo), volume e teste
- [x] Trava de segurança de 2 min **com parada completa** (o bug corrigido na
      v1.4.0: parar só o som deixava `tocando=true` e travava o alarme para
      sempre — preservado corrigido)
- [x] Reengate de 5 min se a fila não esvaziou
- [x] Parada automática quando a fila esvazia, **sem** reengate
- [x] Frescor do sinal de DOM (12 s): leitura velha não decide nada
- [x] Banner de topo + piscar do título da aba
- [x] Recalibração da base ao ligar o alarme
- [x] Desbloqueio do AudioContext no gesto de clique

### 4.2 APAC Itaúna (`apac-itauna-meeds` v1.9.0)

- [x] Captura passiva de `GET /api/v1/Atendimento/{uuid}` (detecta troca de
      paciente sem depender da URL mudar)
- [x] Polling de URL como segunda camada (1,5 s)
- [x] Busca ativa `fetch('/api/v1/Atendimento/{id}')` no botão "Atualizar"
- [x] Leitura da tela como reforço, com o fallback "a API falhou mas preenchi
      N campos lendo a tela"
- [x] Sexo lido da **palavra** na tela tem prioridade sobre o enum da API
- [x] `gerarPdfInterno()` **verbatim**: todas as coordenadas do formulário,
      caixas de dígito do CNS, X de sexo, quebra de texto e fonte adaptativa
- [x] Catálogo Itaúna: HOLTER, MAPA, TE, DOPPLER (8 territórios), CINTILO,
      ECO (3 variantes), CATETER, OUTRO
- [x] Dicionário CID-10 de cardiologia (autocomplete + descrição automática)
- [x] Estabelecimento pré-preenchido (CNES 2105578)
- [x] Painel "Gerenciar médicos" (CRUD local) — **CNS preservados**
- [x] Histórico das últimas 30 APACs desta máquina
- [x] Validação de campos obrigatórios com mensagem consolidada
- [x] Duas saídas: assinar via gov.br (baixa + abre `assinador.iti.br`) e
      baixar sem assinar

### 4.3 LME Sete Lagoas (`lme-sete-lagoas-gerador` v1.4.0)

- [x] PDF oficial da prefeitura embutido, **byte a byte idêntico**
      (conferido: mesmo base64, header `%PDF-` válido, 127 KB)
- [x] Página 2 (orientações) nunca é tocada
- [x] `gerarPdf()` **verbatim**: todas as coordenadas, os retângulos brancos
      que limpam a célula antes de reescrever, a fonte adaptativa do
      diagnóstico e a centralização do CID
- [x] Regra de negócio: Cartão Nacional do SUS recebe o **CPF do paciente**
- [x] Regra de negócio: Clínica Solicitante sempre repete a Origem
- [x] Lista de 6 médicos com CRM e CPF — **preservada**
- [x] Nenhum médico pré-selecionado (seleção obrigatória a cada laudo)
- [x] Unidades de origem + "Outra unidade…"
- [x] Catálogo de 34 procedimentos com código SIGTAP e autopreenchimento
- [x] Dicionário CID-10 (neuro, reuma, endócrino, geral)
- [x] Máscara dd/mm/aaaa
- [x] Reset do formulário ao detectar troca de paciente pelo CPF
      (impede vazamento de dado clínico entre pacientes)

### 4.4 CMD (`laudo-cmd-meeds` v1.4.0)

- [x] PDF oficial embutido, **byte a byte idêntico** (158 KB, AcroForm)
- [x] `gerarPdf()` **verbatim**, incluindo o ajuste manual do
      `DefaultAppearance` (`/Helv 9 Tf 0 g`) da justificativa — sem ele o
      pdf-lib não autoajusta a fonte e o texto sai enorme
- [x] Quebra de linha medida na mão (o wrap automático do pdf-lib deixava a
      última palavra vazar pela borda)
- [x] Preenchimento pelos nomes reais dos campos do AcroForm + `flatten()`
- [x] Seção 04 (Junta de Autorização) **nunca** é preenchida
- [x] Limite de 700 caracteres na justificativa, com contador ao vivo
- [x] Leitura do nome da mãe com variantes de rótulo — **agora no núcleo**
- [x] Mesma lista de 6 médicos com CRM e CPF — **preservada**
- [x] Campos de telefone e nome da mãe do paciente

### 4.5 REMUME (`meeds-remume-assistant` v1.7.4)

- [x] Base embutida como fallback: **11 municípios, 2.793 itens**, conferida
      contra o `remumes.json` (idênticas)
- [x] Atualização remota do `remumes.json` com validação de formato e queda
      para o fallback em qualquer falha
- [x] `_meta.atualizadoEm` exibido no cabeçalho
- [x] Detecção de município pela API, nos 4 formatos de payload
- [x] Remoção de prefixos institucionais ("Prefeitura Municipal de…")
- [x] Detecção por DOM que **recusa escolher** se achar mais de um município
- [x] Re-detecção periódica (o Meeds é SPA e nem sempre refaz a chamada)
- [x] Busca: normalização, tokenização, Levenshtein **com distância absoluta
      máxima** (impede "novalgina" casar com "valina")
- [x] Equivalência fonética (X~CH, S~SS~Z~C, G~J, H mudo)
- [x] Sinônimos por **frase**, exigindo casamento exato (impede "buscopan" →
      "escopolamina" → fuzzy → "escetamina", que são fármacos diferentes)
- [x] Guarda de 3 caracteres no gatilho de sinônimo (o "b" de `complexo_b`
      casava com quase tudo)
- [x] Índice de busca por cidade em cache, com forma fonética pré-calculada
- [x] Dica "Mostrando resultados para X" só quando houve correção
- [x] Selo 📍 de "Local de acesso" quando o município informa o dado
- [x] Copiar **só o nome** (sem o sufixo de local), com fallback de clipboard
- [x] Navegação por teclado (setas + Enter)
- [x] `scripts/sync-fallback.js` migrado, com o mesmo propósito

### 4.6 Comportamentos comuns preservados

- [x] Trava de frame (agora 1x, no bootloader)
- [x] Ocultar tudo na tela de login (agora 1x, no núcleo) — usando a variante
      **mais correta**, que checa visibilidade do campo de senha
- [x] Nenhum dado de paciente gravado em disco
- [x] Nenhum envio de dado de paciente para fora do navegador

---

## 5. Estratégia de migração

- O monorepo é um repositório **novo e separado**. Os 5 repositórios de origem
  **não foram modificados** — nenhum commit, nenhum push, nada.
- Os scripts antigos continuam publicados e funcionando normalmente. Os
  `@updateURL` deles continuam apontando para os repositórios originais.
- A coexistência é segura, mas **rodar os dois ao mesmo tempo duplica botão e
  duplica alarme**. Ver `docs/GUIA-INSTALACAO.md`: o médico instala a suite e
  **desativa** os 5 antigos no Tampermonkey (desativar, não desinstalar —
  reverter é um clique).
- Desligar os repositórios antigos é uma decisão manual, depois da validação.

---

## 6. Decisões técnicas tomadas

Registradas aqui porque foram tomadas sem consulta, conforme combinado.

**D1 — Carregamento remoto de código: desligado por padrão.**
O pedido original previa "carregar módulos remotos via manifest". O pacote
distribuído é **autocontido**: `scripts/build.js` embute núcleo e módulos no
`.user.js` final. Motivo: buscar e executar JavaScript remoto dentro de uma
página que exibe dado de paciente cria uma superfície de execução remota de
código — quem controlar o repositório, o CDN ou a rede da clínica passa a
executar código arbitrário na sessão autenticada do médico. O ganho
pretendido (atualizar sem redeploy) foi mantido onde importa e sem esse risco:
**dados** continuam remotos e atualizáveis a quente (`seletores.json` e
`remumes.json`), sempre validados por formato e com fallback embutido.
`manifest.json` continua sendo a fonte de verdade do build e o inventário que
o painel exibe. A flag `carregamentoRemotoDeCodigo: false` documenta a escolha.

**D2 — Detecção de login: adotada a variante que checa visibilidade.**
Existiam duas implementações divergentes. A do APAC/LME/CMD (que confere
`getBoundingClientRect` e `getComputedStyle`) é estritamente mais correta: um
campo de senha escondido num formulário inativo não significa tela de login.
O alarme e o REMUME ganharam esse comportamento de graça.

**D3 — Contador do DOM: `validadeMs` no lugar do `LIMITE_FRESCOR_DOM_MS`.**
O alarme comparava timestamps na mão para saber se a leitura do DOM ainda era
confiável. Isso virou a validade de voto do `decision-engine`. Comportamento
observável idêntico (12 s), mas agora é um mecanismo genérico e testável.

**D4 — Botões de laudo mantidos como pílula com rótulo.**
O dock suporta botão redondo, mas "📄 Laudo - CMD" e "📄 Laudo - Sete Lagoas"
seriam indistinguíveis como ícone. O médico que atende vários municípios
precisa ler o nome. Só alarme (🔔/🔕), REMUME (💊) e a engrenagem são redondos.

**D5 — Shim `shadow.getElementById` nos três geradores de PDF.**
APAC, LME e CMD acessavam o formulário por `shadow.getElementById()` em
centenas de pontos. Em vez de reescrever cada chamada (e arriscar trocar um
id em silêncio), há um objeto que reproduz essa interface por cima do overlay
do dock. É a fronteira explícita entre código migrado sem alteração e código
novo.

**D6 — Funções de geração de PDF extraídas verbatim, não reescritas.**
As coordenadas de `gerarPdfInterno()` (APAC) e `gerarPdf()` (LME) foram
calibradas na mão contra formulários oficiais. Foram extraídas
programaticamente do arquivo de origem, não transcritas. Os PDFs base foram
conferidos byte a byte contra os originais.

**D7 — Módulo novo entra habilitado por padrão.**
Quem migra dos 5 scripts encontra as 5 funções já ligadas, sem precisar
configurar nada. Quem quiser reduzir desliga no painel.

**D8 — Prioridades espaçadas de 10 em 10.**
`_manager: 0`, alarme 10, APAC 20, LME 30, CMD 40, REMUME 50. Um 6º módulo
cabe entre dois existentes sem renumerar ninguém.

**D9 — `MEDICOS_PADRAO` do APAC continua sendo pré-cadastro, não lista fixa.**
No repositório de origem os CNS já haviam saído da lista fixa e viraram
semente copiada para o `GM_setValue` na primeira execução. Esse desenho foi
mantido: os dados estão lá (como você pediu), mas a edição do médico continua
sendo respeitada e nunca sobrescrita.

**D10 — Repositório criado privado, depois tornado público por decisão sua.**
Foi criado privado para não ampliar a exposição de CPF/CNS antes de você
decidir. Como `raw.githubusercontent.com` não serve arquivo de repositório
privado sem autenticação, o Tampermonkey recebia 404 e a instalação não
funcionava. Apresentadas as três saídas (instalar do arquivo local, publicar,
ou tirar os dados do fonte antes de publicar), você optou por **publicar**.
O repositório está público desde 30/08/2026. A ressalva da seção 7 continua
valendo e o caminho de solução segue disponível.


**D11 — Dados dos médicos fora do código, num cadastro único.**
Com o repositório público, nome/CRM/CPF de 6 médicos (LME e CMD) e nome/CNS de
3 (APAC) eram dado pessoal exposto. O cadastro passou para o navegador do
próprio médico, em `GM_setValue` — e **não** em `localStorage`, porque o
armazenamento do Tampermonkey é independente da versão do userscript e
sobrevive tanto à atualização automática quanto a "limpar dados do site".
A chave é fixa (`medicos`) e imutável: mudança de estrutura se resolve por
migração, nunca trocando a chave, senão o médico perde o cadastro numa
atualização. É **um** cadastro para os três geradores — antes o APAC tinha a
sua lista e LME/CMD outra, e o médico teria que se cadastrar duas vezes.
Quem usava a v2.0.x tem os médicos migrados automaticamente da chave antiga
`apac_medicos_v1`.

**D12 — O histórico deixou de gravar o nome do paciente.**
O histórico do APAC gravava o **nome completo** do paciente em disco, enquanto
a descrição do próprio script promete que nenhum dado de paciente é salvo.
Copiar isso para LME e CMD triplicaria o problema. Agora é gravada uma
referência não identificável — iniciais e os três últimos dígitos do CPF
(`M.A.S. · •••909`) — suficiente para o médico reconhecer o atendimento,
insuficiente para identificar alguém a partir do arquivo. As entradas antigas
são convertidas na primeira execução e o nome completo sai do disco.
Consequência desejada: "Reabrir" repõe só a parte clínica, então o dado de um
paciente não tem como entrar no laudo de outro.

**D13 — Auto-seleção do médico só quando há exatamente um cadastrado.**
Menos cliques é premissa, e o caso comum é o médico usar o próprio computador.
Com dois ou mais cadastrados o sistema **não escolhe**: adivinhar de quem é a
assinatura do laudo seria um erro caro. É a mesma regra de não decidir sob
ambiguidade que o alarme e o REMUME já seguiam.

**D14 — `manifest.json` é a fonte de verdade dos textos dos módulos.**
Nome, descrição e versão vinham tanto do `registerModule()` quanto do manifest.
Dois lugares para o mesmo texto divergem com o tempo — foi exatamente o que
aconteceu com os comentários de posição dos botões nos scripts antigos. Agora
o manifest manda e o `registerModule()` vale como reserva, o que também torna
"mudar o texto que o médico lê" uma edição de arquivo de dados.

**D15 — Instância única por marca no objeto global.**
A trava de frame cobre o iframe da videochamada, mas não duas cópias instaladas
no Tampermonkey nem uma reexecução do script numa navegação da SPA. Uma marca
em `window.__ASSISTENTE_MEEDS_ATIVO__` faz a segunda execução desistir antes de
instalar hook ou criar UI. Há ainda uma segunda camada que remove host de dock
órfão do DOM.

**D16 — Ajustes do módulo passaram a viver no painel da engrenagem.**
A configuração do alarme só abria com clique **direito** no botão — ninguém
descobre isso sozinho. Qualquer módulo pode registrar uma tela de ajustes
(`deps.aoAbrirAjustes`) e ela aparece como link na linha dele no painel. O
clique direito continua valendo como atalho para quem já conhece.

**D17 — Detecção dos scripts antigos é repetida, não única.**
Eles rodam em `document-idle` e alguns só montam o botão depois que o médico
navega para o atendimento. Uma checagem única perderia esses casos e o médico
ficaria com botão duplicado sem saber por quê. São quatro tentativas (4s, 10s,
20s, 45s), parando na primeira que encontrar algo.

**D18 — Paleta unificada no azul.**
APAC e REMUME tinham cabeçalho verde-água; LME, CMD e o painel, azul. Sem um
padrão, cada módulo novo escolheria o seu. O azul virou a cor de identidade e o
verde ficou só como cor de ação nos botões primários, papel que já tinha.


**D19 — CNS saiu do cadastro; a APAC passou a usar o CPF do médico.**
O formulário oficial da APAC tem, no campo 43, uma caixa `( ) CNS  ( ) CPF` —
os dois são aceitos. O médico raramente sabe o próprio CNS de cabeça, então
exigi-lo travava o cadastro por nada. Agora a caixa marcada é a do CPF, o campo
44 recebe o CPF e passou a ter 11 casas em vez de 15. Um `cns` que venha de
cadastro antigo é simplesmente ignorado, sem quebrar nada.
Atenção: o campo **6** do formulário continua recebendo o CPF do **paciente** —
é outra regra de negócio, herdada e intocada.

**D20 — Overlay aberto vai para a frente do DOM.**
Todos os overlays vivem no mesmo shadow root e com o mesmo `z-index`, então
quem aparece por cima é quem está por último no DOM. Abrir o painel de cadastro
a partir do modal de um laudo abria o painel **atrás** do laudo: ele existia,
mas o médico não via — e parecia que o botão "Cadastrar médico" não funcionava.
Agora `abrir()` reposiciona o overlay no fim do shadow. Vale para qualquer
módulo, inclusive um sexto.

**D21 — Estabelecimentos viraram cadastro, com semente.**
Nome e CNES da unidade solicitante eram fixos em `dados/formularios.json`, então
o médico que atendesse por outra unidade redigitava os dois a cada laudo. Agora
são um cadastro local (chave `estabelecimentos`), com a lista do arquivo de
dados servindo de **semente** na primeira execução. A marca de "já semeei" é
separada da lista estar vazia — senão, apagar tudo faria a semente voltar na
recarga seguinte.


**D22 — A REMUME do município é a única fonte de medicamentos. Regra de ouro.**
`dados/marcas-medicamentos.json` traduz nome comercial para princípio ativo —
e **só isso**. Ele muda *o que* se procura, nunca *onde*. Nenhum resultado da
consulta REMUME pode vir dessa tabela: se a marca é reconhecida mas o princípio
ativo não está na lista daquele município, o Assistente diz que não consta e
**não oferece o item**. Na dúvida, filtra para fora; nunca acrescenta.
Consequência prática para quem for mexer: qualquer melhoria futura na busca
tem que preservar isso. Um medicamento oferecido a um médico e não disponível
na unidade é pior do que uma busca que não achou nada.
A REMUME não tem campo `principioAtivo`, então a tradução casa pelo **nome** do
item — foi verificado antes de decidir.

**D23 — Distância de edição com custos do português, e o limite escolhido.**
Trocar `s`/`z`, `c`/`s`, `g`/`j`, `l`/`u`, `m`/`n`, `x`/`s`, `b`/`v`, `e`/`i`,
`o`/`u` custa **meio ponto** em vez de um: é erro de grafia previsível, não
outra palavra. Inserção e remoção continuam custando um — falta ou sobra de
letra não é confusão de grafia.
O limite de tolerância é por tamanho do que foi digitado: **1,0** até 6 letras,
**2,0** até 10, **3,0** acima. Foi calibrado contra pares que não podem se
misturar — `dipirona`/`digoxina` exige 4 trocas não relacionadas e fica de
fora, enquanto `dipironá`/`dipirona` e `azitromissina`/`azitromicina` passam.

**D24 — Fonética própria do português, e como camada secundária.**
Soundex é para sobrenomes em inglês: não conhece Ç, LH, NH, o "ão" nasal, nem
que C antes de E/I soa como S. `core/fonetica-ptbr.js` implementa as regras do
português na ordem em que dependem umas das outras (dígrafos primeiro, depois
letras dependentes de vogal, depois nasais, depois L final). Convergências
verificadas: `cimvastatina` = `simvastatina` = `sinvastatina`,
`azitromicina` = `azitromissina`, `cefalexina` = `sefalexina` — e
`dipirona` ≠ `digoxina`.
Ela roda **só quando a camada 1 não achou nada**. Fonética é generosa por
natureza; correndo junto com a busca normal, colocaria um homófono na frente de
um resultado exato.

**PENDÊNCIA REGISTRADA (não implementada):** quando o princípio ativo não
consta na REMUME, sugerir alternativa terapêutica da mesma classe ATC que
esteja na lista. Exige uma classificação ATC por item, que a REMUME não traz
hoje — precisaria de uma fonte nova e de validação clínica antes de sugerir
troca de medicamento a um médico.

---

## 7. Risco aberto: CPF e CNS em repositório público

Os repositórios de origem `lme-sete-lagoas-gerador` e `laudo-cmd-meeds` são
**públicos** e contêm, no código-fonte, **nome completo, CRM e CPF de 6
médicos**. O `apac-itauna-meeds` contém nome e CNS de 3 médicos.

**Situação resolvida no código, mas não no histórico.** Desde a v2.1.0 esses
dados **não estão mais no código-fonte** (ver decisão D11): o cadastro vive no
navegador de cada médico. O que permanece é o **histórico do Git**: os commits
anteriores a essa mudança, neste repositório e nos dois repositórios de origem
que continuam públicos, ainda contêm os CPFs.

Para remover de vez seria preciso reescrever o histórico (`git filter-repo` ou
equivalente) nos três repositórios e forçar o push — o que invalida clones
existentes. É uma decisão sua; o código atual já não expõe nada novo.

> **Estado atual:** o monorepo é **público** desde 30/08/2026, por decisão
> tomada para destravar a instalação (ver D10). Os mesmos CPFs já estavam
> públicos em `lme-sete-lagoas-gerador` e `laudo-cmd-meeds`, então isso não
> criou uma exposição nova — mas duplicou a existente.

Duas observações, que continuam de pé:

1. **CPF é dado pessoal sob a LGPD.** Publicá-lo em repositório aberto expõe
   os médicos a uso indevido, e o histórico do Git preserva o dado mesmo depois
   de uma remoção futura. O repositório novo foi criado **privado** justamente
   para não ampliar essa exposição antes de você decidir.
2. **Existe um caminho já provado no seu próprio código.** O APAC resolveu
   exatamente este problema: tirou os médicos do fonte e passou a usar
   `GM_setValue` com pré-cadastro e painel de gerenciamento. LME e CMD podem
   receber o mesmo tratamento — a infraestrutura já está no monorepo, é o
   mesmo padrão do painel "Gerenciar médicos".

Se um dia quiser fechar o repositório de novo (lembrando que isso quebra o
`@updateURL` dos médicos, que passariam a receber 404):

```bash
gh repo edit sodelfino/meeds-suite --visibility private
```

E, para remover os dados do código-fonte aplicando em LME e CMD o mesmo padrão
que o APAC já usa, basta pedir — a infraestrutura do painel "Gerenciar médicos"
já está no monorepo. Note que remover do código **não** remove do histórico do
Git: para isso seria preciso reescrever o histórico dos repositórios afetados.
