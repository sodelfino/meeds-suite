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
  │  feedback.js        o médico conta o que achou (mailto)      │
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
  nunca receberam commit nosso — nenhuma linha foi alterada neles.
- **Migração concluída em 31/08/2026:** os cinco repositórios passaram a
  privados. Consequências, todas conhecidas e aceitas:
  - os links antigos de instalação devolvem 404;
  - quem tem um script antigo instalado continua com ele funcionando, mas sem
    atualização automática;
  - o Assistente REMUME **antigo** deixa de baixar o `remumes.json` daquele
    repositório e cai para a cópia embutida — que é a mesma lista, congelada
    na data em que o script foi instalado. O Assistente novo busca a lista
    daqui, e segue atualizando normalmente.
  - nenhum dos cinco tinha GitHub Pages, fork ou estrela; nada externo quebrou.
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


**D25 — A Sala de Espera não adivinha o `ProfissionalId`; ela espera.**
O módulo precisa do id do médico logado para consultar a agenda dele. Em vez de
tentar deduzir de um token ou de um endpoint de perfil, ele **ouve** as chamadas
que a própria tela já faz — pelo hub de rede do núcleo — e aproveita o valor.
Até conhecer o id, não consulta nada. Chutar o id exibiria a agenda de outra
pessoa, que é um vazamento de dado de paciente, não um bug de conveniência.
O painel explica o que fazer: abrir a tela de Consultas Agendadas uma vez.

**D26 — Aviso discreto, e não alarme.**
A Sala de Espera é irmã do Alarme de Fila, mas para outro contexto: fila aberta
de Pronto Atendimento pede interrupção (som, banner, moldura); agenda marcada
pede informação. Por isso o aviso é um cartão no canto superior direito, sem
som, que sai sozinho em 10 segundos. O médico costuma estar atendendo alguém
quando o próximo chega — um susto ali atrapalha o atendimento em curso.
Vários pacientes chegando viram **um** aviso que conta quantos são, nunca uma
pilha de cartões sobre a tela.


**D22 — O índice de busca é invertido, e preguiçoso.**
Guardar tokens por item funcionava com a REMUME (centenas de itens) e travou
com a CID-10 (14.233): 910 ms para montar, 600–1500 ms por busca. O índice
passou a guardar cada **palavra distinta** uma vez, com a lista dos itens em
que ela aparece — 8.391 palavras para 14.233 itens. E não é montado na carga
da página: é montado na primeira busca, adiantado em tempo ocioso quando o
navegador oferece. A pontuação final não mudou; mudou quantas vezes a conta é
feita. Por isso a REMUME não muda de comportamento.

**D23 — A aproximação é dispensada quando a palavra já casa exato.**
Uma palavra que aparece em 3 ou mais itens existe na base; adivinhar o que ela
"queria ser" só acrescenta ruído e é a parte cara. Não altera a ordem: um
casamento exato vale 1.0 e um aproximado no máximo 0.45 por palavra.

**D24 — Módulos se acoplam por anúncio, nunca por nome.**
O CID-10 precisava aparecer dentro do campo dos laudos. Se o módulo de busca
conhecesse os laudos (ou vice-versa), desligar um quebraria o outro e a
promessa de "adicionar um módulo sem tocar nos existentes" cairia. Cada laudo
**anuncia** o próprio campo (`cid:conectar-campo`) e diz o que fazer com a
escolha; quem souber atender, atende. Como a ordem de subida importa, o módulo
de CID publica `cid:pronto` ao iniciar e cada laudo anuncia de novo. Sem o
módulo de CID, o campo é texto livre — exatamente como antes.

**D25 — A marca de "já viu" é gravada ao exibir, não ao fechar.**
O aviso de boas-vindas voltava a cada visita porque só gravava quando o médico
usava um dos botões; fechar clicando fora — o caminho mais natural — não
gravava nada. Agora grava assim que aparece, e vai para o armazenamento do
Tampermonkey, que sobrevive a "limpar dados do site". A chave é
`meeds_assistente_boas_vindas_v1`: o sufixo permite reapresentar de propósito
numa mudança futura, subindo para `_v2`.


**D27 — Um módulo pode não ter tela. O de CID-10 não tem.**
Ele nasceu com botão no dock e janela própria, e depois ganhou o autocomplete
dentro do campo do laudo. Ficaram os dois — e um médico com dois caminhos para
a mesma coisa não escolhe o melhor, ele hesita. O botão saiu.
O contrato já previa `botao: null`; agora existe um módulo que usa isso de
verdade, o que é útil como referência: **módulo não é sinônimo de botão**. Este
existe para servir um campo de outro módulo, via barramento
(`cid:conectar-campo` / `cid:pronto`), e é invisível até o médico clicar no
campo certo.

Consequência para quem for criar o oitavo módulo: se a função só faz sentido
dentro de um formulário que já existe, não crie botão. Anuncie o campo e
conecte-se a ele.

**D28 — O `<datalist>` nativo é incompatível com autocomplete próprio.**
Os geradores traziam `<input list="…">` desde a versão original. Quando o
autocomplete do módulo passou a se acoplar ao mesmo input, o navegador
continuou desenhando o dropdown dele por cima — dois menus concorrendo, um com
90 códigos e outro com 14.233. Não há como "coordenar" os dois: o datalist é
desenhado pelo navegador, fora do alcance do CSS e do JavaScript da página.
Por isso ele foi removido **dos campos de CID**, e só deles. O datalist de
*procedimento* continua, porque lá não há autocomplete próprio competindo.


**D29 — Todo campo de CID recebe a busca; só o principal alimenta a descrição.**
A APAC tem três campos de CID (37 principal, 38 secundário, 39 associados) e
todos recebem código — logo, todos ganham o autocomplete. Mas o campo 36,
"Descrição do diagnóstico", descreve o diagnóstico **principal**. Por isso a
função que preenche recebe um parâmetro: só o `apac-cid1` escreve na descrição.
Sem essa distinção, escolher um CID associado sobrescreveria a descrição do
principal e o médico perderia o que já tinha, sem perceber.
Sete Lagoas e CMD têm um campo de CID cada, e nele o comportamento é o do
principal.


**D30 — O painel virou abas; formulário fechado por padrão.**
Tudo vivia numa rolagem só: lista de módulos, lista de médicos, formulário
sempre aberto, três botões lado a lado, lista de unidades, outro formulário
aberto e o rodapé. O sintoma mais claro era o cabeçalho contradizendo a tela —
quem rolava até o cadastro lia "ative apenas as funções que você usa".
Agora são quatro abas, uma coisa por vez, com o subtítulo acompanhando. Duas
regras vieram junto: **formulário fechado até ser pedido** (a lista é o que se
consulta; o formulário se usa uma vez) e **ação secundária não compete** —
backup e restauração saíram da fileira de botões e viraram uma linha no rodapé
da aba.

**D31 — Feedback por `mailto:`, nunca por serviço externo.**
O botão abre o programa de e-mail do próprio médico com a mensagem pronta, ou
copia para a área de transferência. Não há servidor, formulário na nuvem nem
serviço de terceiro. Num sistema que exibe dado de paciente, um "enviar
feedback" que posta texto livre para fora é um vazamento esperando acontecer —
basta um médico colar o nome do paciente para descrever o problema.
Vão junto, automaticamente: versão, funções ligadas e navegador — as três
perguntas que sempre se faz ao receber um relato. E a tela **mostra ao médico**
o que está sendo anexado, antes de enviar: nada segue às escondidas.
O destino fica em `manifest.json` → `contato.email`, editável pelo
administrador.

**D32 — Módulo suspenso sai do manifest, não do repositório.**
A Sala de Espera foi para `_modulosEmStandby`. O build só empacota o que está
em `modulos`, então ela deixa de chegar ao médico sem que uma linha de código
seja removida — e volta movendo o bloco de lugar. Apagar o módulo perderia os
testes e as decisões junto; comentar o registro deixaria código morto no
bundle. Mover no manifest é reversível e não custa bytes ao médico.


**D33 — A prévia chama `produzirPdf()`, a mesma função do botão.**
Cada gerador anuncia a própria função de produção pelo barramento; a prévia a
chama e exibe o resultado num `<iframe blob:>`. Não existe layout paralelo: se
alguém mudar uma coordenada, a prévia muda junto, porque é o mesmo desenho.
Um preview aproximado em HTML seria uma segunda fonte de verdade — divergiria
do documento no primeiro ajuste, e o médico confiaria na versão errada.
A única diferença deliberada é a validação: `gerarPdf()` exige campos
obrigatórios; a prévia precisa desenhar com o formulário pela metade.

**D34 — Prévia e final não são byte-idênticos, e isso é esperado.**
jsPDF e pdf-lib carimbam data nos metadados. Medido: 99,28% do arquivo é byte a
byte idêntico, e **dois PDFs finais gerados com um segundo de diferença também
divergem, no mesmo offset**. A comparação correta é conteúdo, não hash bruto.
Registrado para ninguém "corrigir" isso desligando o carimbo — mexer nisso
mudaria o documento final, que é justamente o que não pode acontecer.

**D35 — `<iframe>` com o visualizador nativo, não pdf.js em canvas.**
O médico vê literalmente o arquivo, com o mesmo motor que vai imprimi-lo.
O preço é que o visualizador nativo não expõe a rolagem à página: preservamos
**página e zoom** pelo fragmento (`#page=N&zoom=Z`), não o ponto exato.
pdf.js permitiria guardar o `scrollTop`, mas acrescentaria uma terceira
biblioteca, buscaria o worker na rede no momento de renderizar — proibido — e
entregaria uma *re-renderização* do PDF em vez do PDF.

**D36 — O que protege a digitação são quatro guardas, não só o debounce.**
Debounce de 700 ms; nada renderiza com o painel fechado ou com o modal do
gerador fechado; nada renderiza com a aba em segundo plano (`document.hidden`);
e uma assinatura do formulário evita re-render quando nenhum campo mudou.
Renderizações em voo são descartadas por um contador de geração — a que chega
atrasada não sobrescreve a mais nova. Medido: **20 teclas → 1 renderização**.

**D37 — A prévia é tela clínica.**
Mostra dado de paciente, então: nada vai para a rede, nada é gravado, nada
aparece no console. O `blob:` anterior é revogado antes de cada novo, e tudo é
limpo ao fechar o painel, ao desligar o módulo e após 10 minutos de
inatividade — consultório compartilhado não deveria depender de o médico
lembrar de fechar a janela.


**D38 — No Safari/iPad, `@grant none` em vez de armazenamento durável.**
A extensão Userscripts documenta: *"When using API methods, it's only possible
to inject into the content script scope."* Pedir qualquer `@grant` de GM tira o
script do contexto da página — e ali o hub de rede não enxerga as chamadas do
Meeds. Isso cegaria o alarme de fila, o preenchimento automático da APAC e a
detecção de município do REMUME.
A troca foi deliberada: `@grant none` (com `@inject-into auto`, ver D40), com o cadastro
caindo para `localStorage`. Custo: "limpar dados do site" no Safari apaga o
cadastro. Benefício: três funções continuam funcionando. Cadastro se refaz em
um minuto e tem backup; alarme cego, não.
As APIs do Userscripts também são assíncronas (`GM.setValue` devolve Promise),
e a forma síncrona não existe — o núcleo já caía para `localStorage`, então
nada precisou mudar no código.

**D39 — Uma base de código, dois cabeçalhos.**
O `build.js` gera os dois pacotes do mesmo fonte; só o bloco de metadados
difere, e o corpo é idêntico byte a byte. Não existe um "Assistente do iPad"
mantido à parte — manter dois seria garantir que um deles fica para trás.
O teste de fumaça passou a carregar a variante Safari justamente porque o
navegador comum não tem GM nem `unsafeWindow`: testar por ali cobre os dois.

**D40 — `@inject-into auto` no Safari: rodar com um sinal a menos é melhor que
não rodar.**
A D38 escolheu `@inject-into page` para preservar o hub de rede. No iPad do
plantão isso falhou de um jeito silencioso: o script aparecia **instalado e
casado** no popup do Userscripts, com a chave ligada, e nada acontecia na tela.
Com `page`, a extensão injeta uma tag `<script>` no documento — e a CSP do Meeds
recusa executá-la. A documentação da própria extensão aponta `auto` como remédio
para CSP estrita.
`auto` tenta a página e, se barrado, cai para o escopo isolado. Ali o DOM é o
mesmo (dock, painéis, leitura de tela e os três geradores de PDF seguem
inteiros), mas o `window` não é o da página: o hub de rede deixa de ver as
chamadas do Meeds e o alarme de fila passa a decidir só pelos sinais de tela —
um voto a menos no motor de decisão, não cegueira.
A premissa da D38 continua correta; o que estava errado era supor que `page`
sempre funcionaria. Para não repetir o diagnóstico às cegas, o painel **Sobre**
agora informa em qual escopo o Assistente está rodando.

**D41 — Preferência de uso também é dado que não pode sumir.**
Até a v2.13.1 as preferências (quais funções aparecem, som e volume do alarme)
viviam só no `localStorage`, com a justificativa de que "preferência corriqueira"
não exigia a durabilidade do cadastro de médicos. Estava errado, e o erro só
aparece em uso real: **o Meeds limpa o `localStorage` no logout**, como quase
todo sistema com login. No acesso seguinte o Assistente não achava nada salvo e
caía no padrão de fábrica — que é *tudo ligado*. O médico desligava o que não
usava e, a cada troca de plantão, todos os botões voltavam.
Agora vale a mesma regra do cadastro: `GM_setValue` quando existe, que é
armazenamento do Tampermonkey e não do site, e por isso sobrevive a logout, a
limpeza de dados do site e à atualização do script.
**As chaves não mudaram** — continuam `meeds-suite:<módulo>:<nome>`, só mudou
onde moram. Quem já tinha preferência salva não perde nada: a migração copia
para o durável na primeira leitura, e só apaga a cópia antiga **depois** de
confirmar que a gravação deu certo (a ordem inversa trocaria um incômodo por uma
perda).
Pendência aberta na v2.14.0 e **resolvida na v2.15.0** — ver D42.

**D42 — No iPad, IndexedDB por trás de uma API que continua síncrona.**
A D41 deixou o Safari de fora porque `GM_setValue` não existe lá e o
substituto natural, o IndexedDB, é assíncrono — enquanto `storage.ler()` é
síncrono e é chamado por todos os módulos dentro de `start()`. Tornar a leitura
assíncrona resolveria o armazenamento mexendo na assinatura do contrato de
módulo, ou seja, alterando código que funciona para consertar outra coisa.
A saída foi inverter onde a espera acontece: **carrega tudo uma vez no boot** e
serve de memória depois; só a escrita vai ao disco em segundo plano. O núcleo
passou a aguardar `Storage.carregar()` antes de subir o primeiro módulo — e essa
ordem não é detalhe: um módulo que leia o cache vazio conclui que nunca foi
configurado e liga sozinho, que é o bug original de volta.
Onde há `GM_setValue`, nada disso entra em cena: o caminho segue síncrono.

**D43 — Um caminho durável, não cinco.**
`cadastro.js`, `historico.js`, `novidades.js` e `diagnostico.js` tinham **cada
um** a sua cópia do par "GM se existir, senão localStorage". No Tampermonkey os
cinco funcionavam, então a duplicação passou despercebida por doze versões. No
iPad, onde não há GM, os quatro caíam no `localStorage` — e o logout levava
junto o cadastro dos médicos, o histórico de laudos e a marca de "já vi as
boas-vindas". O sintoma que o médico relatou (botões voltando) era a ponta
visível de um problema que apagava coisa bem mais cara.
Agora existe `Storage.duravel(chaveGM, chaveLocal)` e os quatro usam ele.
**A camada aceita um par de chaves de propósito**: as preferências por módulo
sempre usaram a chave com prefixo também no GM, enquanto o cadastro usa
`"medicos"` pelado. Unificar agora faria um médico atualizar e não encontrar o
próprio cadastro — exatamente o que a regra de chave fixa e imutável (D11)
existe para impedir.
A migração acontece em dois momentos: uma varredura no boot para as chaves com
prefixo, e uma **promoção na leitura** para as demais. A segunda não é redundante
— a marca das boas-vindas é anterior ao prefixo e é escrita uma vez e depois só
lida, então sem ela nunca migraria e seria apagada no logout seguinte.

**D44 — A caixa de botões recolhe, e o alarme escapa dela.**
Com as sete funções ligadas, a pilha ocupava boa parte da lateral direita. A
alça no canto recolhe tudo; no computador, aproximar o mouse já reabre (zero
clique, premissa A), e no iPad é um toque — a diferença é feita por
`@media (hover: hover) and (pointer: fine)`, sem código condicional.
Duas regras não são preferência: **botão em alerta não se esconde** (se a fila
encheu, o alarme sai da caixa e continua piscando — esconder um alerta é o
oposto do que ele existe para fazer), e a engrenagem recolhe junto com o resto,
porque mantê-la fora anularia metade do ganho de espaço.
Detalhe de CSS que custou um bug: a regra que reabre no hover precisa repetir os
`:not()` da regra que esconde, senão perde em especificidade e o hover não abre
nada. E precisa de `:not([hidden])`, senão ressuscita botões que o próprio
módulo desligou.

**D45 — Palavra genérica desempata, mas não escolhe.**
Qualquer token que casasse trazia o item para a lista. Numa REMUME isso
degenera: "comprimido" está em 44% da lista de Mendes e a sigla "hpm" em 80%
da de Macaé. Resultado medido: `acetilcisteina comprimido` devolvia **159 dos
357** itens de Mendes, e `dipirona comprimido` **201 de 538** em Macaé — os
certos no topo e o resto ruído, dentro de uma lista que a tela corta em 80.
O médico rolava 80 linhas para achar 2.
Agora um token presente em mais de 30% dos itens **pontua mas não seleciona**.
O corte é por frequência medida, não por lista fixa de palavras: uma lista fixa
quebraria justamente em Sete Lagoas, onde *nenhuma* palavra passa de 10% porque
o município não publica forma farmacêutica. A medição nos 11 municípios mostrou
separação larga — acima de 30% só existem formas e siglas de unidade, e nenhum
princípio ativo passa de 10% em lugar nenhum.
A palavra genérica segue somando pontos, então "amoxicilina suspensão" continua
priorizando a suspensão; ela só não pode, sozinha, trazer uma suspensão que nada
tem a ver com amoxicilina. Há rede de segurança: se a busca inteira for genérica
("comprimido", "UBS"), a restrição é suspensa, senão a tela diria "não consta"
para termo que existe.
**Isto só remove item do resultado, nunca acrescenta** — a regra de a REMUME do
município ser a única fonte de verdade continua valendo por construção.
Efeito colateral bom: em Macaé, dois itens com Dipirona que estavam além da
posição 80, escondidos pelo ruído, voltaram a aparecer.

**D46 — Extrair princípio ativo cortando no primeiro dígito estava errado.**
`extrairPrincipioAtivo()` cortava no primeiro dígito ou na primeira forma
farmacêutica. Rodando contra os 2.793 itens reais, isso produzia **20 textos
quebrados**, e eles vão para a tela como "você quis dizer": `Piridoxina
(Vitamina B6)` virava `Piridoxina (Vitamina B`, `Lamivudina (3TC)` virava
`Lamivudina (` — com parêntese aberto.
Três correções: corta na concentração (número **seguido de unidade**), e não em
qualquer dígito; ignora forma que esteja no início do nome, porque ali ela faz
parte do produto ("Solução Ringer", "Sachê oral Polimixina"); e recua o corte
quando ele deixaria um parêntese aberto.
A dica também ganhou teto de tamanho: itens como "Nutrição Parenteral Tripla …
via venosa central." não têm onde cortar, a função devolve a linha inteira por
contrato, e um parágrafo como sugestão confunde em vez de ajudar.

**D47 — Os bugs de fronteira de palavra são uma família, não incidentes.**
A revisão da planilha-modelo de REMUME encontrou seis defeitos, e cinco eram a
mesma coisa em roupas diferentes: casar palavra por "contém" em vez de por
fronteira, ou confiar em `\b` onde ele não vale.
O `\b` falha em três situações que ocorrem em dado real: depois de `%` (`%` e
espaço são ambos não-palavra, então `2%` escapava para dentro do princípio
ativo), antes de dígito colado (`comprimido150 mg`, que existe na lista de
Barbacena) e antes de plural (`comprimidos`). Onde o fim correto é "não vem
letra depois", a expressão é `(?![a-z])`, não `\b`.
Já tinha mordido a busca do REMUME uma vez (sinônimo curto casando dentro de
palavra). Vale conferir esta família primeiro sempre que um casamento de texto
se comportar de forma estranha — e vale avisar quem for implementar o importador
do lado do servidor, porque a decomposição lá terá os mesmos riscos.


**D26 — Funções que melhoram o formulário não têm chave liga/desliga.**
A busca de CID-10 dentro do campo e a prévia do documento não são funções que
o médico escolhe usar: são melhorias do próprio formulário do laudo. Não criam
botão nem ruído na tela, então uma chave para desligá-las só ofereceria um jeito
de piorar o formulário. Passaram a ser `sempreAtivo: true` no `manifest.json`,
o que faz três coisas: `estaHabilitado()` devolve sempre `true`, o painel omite
a chave, e `definirHabilitado()` ignora o pedido — inclusive vindo do console.
Elas aparecem numa nota no rodapé da aba **Funções**, para o médico saber que
existem. Uma preferência antiga de "desligado", de quem tinha desativado antes,
deixa de valer e a função volta sozinha.


**D27 — A APAC é um módulo só, com seletor de município; o que separa é o
estabelecimento.**
A APAC de Itaúna virou a APAC e passou a atender Betim e Sete Lagoas. Duas
opções estavam na mesa: um módulo por município (como LME‑Sete Lagoas e CMD) ou
um módulo com seletor. Venceu o seletor, por um motivo concreto: o formulário da
APAC é **nacional** — `gerarPdfInterno()` não tem uma única referência a
município, e o catálogo de procedimentos, CIDs e territórios é o mesmo em
qualquer cidade. Um módulo por município seria o mesmo código e os mesmos dados
clínicos copiados N vezes, e cada correção teria que ser feita N vezes.

Isso **não** vale para LME‑Sete Lagoas e CMD: ali o formulário é próprio do
município, e por isso eles continuam separados.

O que de fato varia por município é o **estabelecimento (nome + CNES)**, e é aí
que mora o risco: uma APAC emitida com o CNES de outra cidade é devolvida pela
regulação e o paciente perde a vaga. Por isso:

- os dados saíram de `dados/formularios.json` para `dados/apac.json`, com o
  catálogo clínico em `_comum` e só os estabelecimentos por município;
- o cadastro guarda `municipio` em cada estabelecimento e a listagem é filtrada
  (`listarEstabelecimentosDe`);
- **trocar de município zera o estabelecimento e o CNES.** É deliberadamente
  incômodo: o contrário — manter o que estava lá — é exatamente como se emite um
  laudo com o CNES errado sem perceber;
- o município é campo obrigatório na validação;
- a semente carimba o município na ficha. Sem esse carimbo a unidade fica "sem
  município" e a regra de compatibilidade a mostraria em **todas** as cidades;
- quem vinha da versão anterior tem o estabelecimento salvo sem município: a
  migração preenche pelo **CNES**, que é único e está em `dados/apac.json`. É
  conferência, não adivinhação — CNES fora da tabela fica como estava.

A detecção automática do município lê o cliente do atendimento
(`cliente.razaoSocialNome`, a prefeitura contratante) e, na dúvida, devolve
`null` em vez de escolher. Chutar aqui seria pior que não detectar: escolheria a
cidade errada sem o médico perceber. Com mais de um município disponível, nada
vem pré‑selecionado.

O id do módulo mudou de `apac-itauna` para `apac`, o que exigiu migrar duas
coisas guardadas por id: a preferência de ligado/desligado e o histórico de
documentos. Ambas rodam na subida do núcleo.

Regressão coberta por `tests/apac-municipio.test.js`.

**D48 — Hover pode mudar opacidade; não pode mudar layout.**
A caixa de botões abria no hover. Na prática isso falhou de dois jeitos, e o
médico sentiu os dois:

1. **Abria sem ninguém pedir.** O canto inferior direito é rota de passagem, não
   destino. Atravessar a região fazia a pilha inteira saltar sobre o conteúdo.
2. **Fechava sem ninguém pedir.** Como só ficava aberta enquanto o ponteiro
   estivesse dentro, cortar caminho na diagonal para alcançar um botão fechava a
   caixa no meio do movimento.

E havia um terceiro, mais silencioso: **não existia o estado "quero isso
aberto"**. Hover é sempre temporário; não dá para olhar a lista com calma.

O hover não foi banido — foi movido de propriedade. Agora mexe **só na
opacidade**: em repouso a pilha fica a 28%, e volta a 100% ao primeiro sinal de
intenção (ponteiro, foco de teclado ou toque), voltando ao repouso 2,5s depois.
A distinção é o ponto da decisão: opacidade não desloca nada, não cobre conteúdo
novo e não muda área clicável — não há como "sair sem querer" de algo que não
mudou de lugar. **Layout no hover é armadilha; opacidade no hover é conforto.**

Minimizar e expandir voltaram a ser decisão explícita, pela alça, com o estado
guardado. O ícone deixou de ser `✕` (que significa fechar/descartar) e virou `⌄`,
que mostra o movimento real — a pilha se recolhe em direção ao canto.

Três regras que não são preferência:

- **Alerta nunca fica translúcido.** Se a fila encheu, o alarme é o único motivo
  para olhar o canto; apagá-lo seria desligar o aviso pela metade.
- **Foco de teclado acorda.** Quem navega de Tab não gera hover nenhum, e uma
  pilha a 28% seria invisível para essa pessoa.
- **No toque o repouso é 50%, não 28%.** Sem hover não dá para "espiar antes", e
  um botão apagado demais vira adivinhação.

A transição é assimétrica de propósito: some em .45s, volta em .12s. Sumir é
enfeite e pode ser suave; reaparecer é resposta a uma intenção e precisa parecer
instantâneo.

A translucidez é preferência, com chave no painel. Ela mora na API do **núcleo**,
não nas dependências do módulo: como o módulo não decide posição de botão,
também não decide opacidade da pilha inteira.

**D49 — O que foi recusado, e por quê.**
Antes de chegar na translucidez foram considerados três caminhos. Vale registrar
os recusados, porque a razão pode mudar:

- **Filtrar por município** (mostrar só o gerador que serve ao paciente da tela).
  Ataca a causa — cinco botões viram dois — e a detecção já existe no módulo
  REMUME. Recusado *por ora*: o médico preferiu manter todos conforme a
  configuração, e o dock mudando de conteúdo entre pacientes pode parecer
  instável. A porta fica aberta.
- **Um botão que abre um cartão ao clicar.** Previsível, mas custa um clique a
  mais sempre — e menos cliques é premissa do projeto, não desejo.
- **Barra só de ícones.** Esbarra em `📄` aparecer duas vezes (Sete Lagoas e
  CMD): dois ícones idênticos é ambiguidade real. Só ficaria viável junto com o
  filtro por município, que resolveria o par.


**D28 — Um aviso escolhe o CANAL pela atenção do médico, não pelo volume.**
O alarme de fila tinha banner, moldura pulsante e título piscando — três
sinais, todos **dentro** da aba do Meeds. As gravações mostram o médico dentro
do Memed, em outra tela, esperando 13 s por uma prescrição: exatamente quando o
alarme mais importa, nenhum dos três é visto por ninguém.

A saída **não** foi piscar mais forte, por duas razões que não são estéticas.
A WCAG 2.3.1 limita qualquer coisa a menos de três flashes por segundo, por
risco de crise fotossensível. E fadiga de alarme é o problema clássico da
categoria em saúde: alarme demais faz o profissional ignorar o alarme —
inclusive o que importava. Um alarme que incomoda é um alarme que o médico
desliga, e aí não há alarme nenhum.

Ficou uma **escada**, em `core/atencao.js`, onde cada degrau muda de canal:

| onde ele está | canal |
|---|---|
| na aba, olhando | som + banner + moldura (o que já existia) |
| na aba, de fundo | contador no título e no favicone: `(3) Meeds` |
| fora da aba ou do navegador | notificação do sistema, **clicável** |
| ninguém reagiu | o reengate de 5 min que já existia renotifica |

Três decisões dentro disso merecem registro:

- **A notificação só dispara com o médico fora da aba.** Dentro dela o banner já
  grita, e o mesmo aviso duas vezes é a definição de fadiga de alarme.
- **O distintivo acompanha a fila, não o alarme.** Ele continua depois de
  silenciar, porque os pacientes continuam ali; some quando a fila esvazia.
- **Clicar na notificação equivale a "estou indo"**: traz a aba para frente e
  silencia com reengate. Se o médico não atender de fato, o alarme volta — que é
  o `acknowledge` do plantão de software, e não um `dismiss`.

O núcleo é dono da tela (D3), então favicone, título, notificação e Wake Lock
moram em `core/atencao.js` e não no módulo: qualquer módulo pode precisar avisar
alguém que não está olhando. A permissão de notificação só é pedida a partir de
um clique do médico, no painel — navegador ignora (e alguns punem) pedido sem
gesto do usuário. Onde o recurso não existe — Safari do iPad não tem notificação
fora de app instalado — a tela **diz isso**, em vez de oferecer uma chave que não
faz nada.

Regressão em `tests/atencao.test.js`.


**D29 — CSS de módulo é escopado; o shadow root é compartilhado.**
Encontrado ao montar o painel do alarme: as bolinhas de escolha apareciam
**acima** do texto, e a bolinha esticava até 344 px. A causa não estava no
alarme. APAC, LME‑Sete Lagoas e CMD declaravam `input,select,textarea{width:100%}`
e `label{display:block}` **sem escopo**, e como todos os módulos dividem o mesmo
shadow root, essas regras alcançavam a interface de todos os outros.

Regra: **seletor de elemento sem escopo é proibido no CSS de módulo.** Toda
regra é prefixada pelo container do módulo (`#apac-body`, `#lme-body`,
`#cmd-body`). O sintoma aqui foi cosmético; o mesmo vazamento numa regra de
`display` ou `visibility` esconderia um campo obrigatório de outro laudo sem
ninguém notar.

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
