# Assistente Meeds — Por: Marcelo

Todas as ferramentas do Meeds numa **instalação única**. Cada função liga e
desliga num painel, sem reinstalar nada.

> ### Funciona no Meeds novo
>
> Desde a **versão 2.44.0 (24/09/2026)** o Assistente acompanha o Meeds novo,
> em produção no perfil do profissional (`doctor-calltech`) e no do operador
> (`admin-calltech`). Quem já tinha o Assistente instalado recebeu a
> atualização sozinho.
>
> A versão de teste **"Assistente Meeds v2 (TESTE)"** foi descontinuada e não
> recebe mais atualização. Se você a instalou, **desinstale-a** no
> Tampermonkey e fique só com esta. Como a migração foi feita está em
> [docs/MIGRACAO-V2.md](docs/MIGRACAO-V2.md).

> ### Os cinco scripts antigos foram recolhidos
>
> Este pacote substitui os cinco scripts separados, cujos repositórios são
> privados desde **31/08/2026**. Se algum deles ainda estiver ativo,
> **desative-o** no Tampermonkey — o próprio Assistente avisa na tela se
> detectar um.

---

## 1. O que é

| Função | O que faz |
|---|---|
| 🔔 **Alarme de Fila** | Avisa quando entra paciente na fila do Pronto Atendimento, ou quando alguém espera além do tempo definido — mesmo com o Meeds em outra aba. Tem modo **Completo** (sirene), **Discreto** (toque curto, com lembrete a cada 2 min) e **Silencioso**. Para sozinho quando a fila esvazia. |
| 📋 **APAC** | Gera a APAC (Autorização de Procedimento Ambulatorial) já preenchida com os dados da tela e leva direto para a assinatura no gov.br. Atende Itaúna, Betim e Sete Lagoas. |
| 📄 **Laudo — Sete Lagoas** | Preenche o Laudo Médico de Alto Custo no formulário oficial da prefeitura. |
| 📄 **Laudo — Conceição do Mato Dentro** | Idem, no formulário oficial da prefeitura de Conceição do Mato Dentro. |
| 🔎 **Busca de CID-10** | Procura o código pelo nome da doença, na tabela completa, e preenche na própria linha do laudo aberto. |
| 🧪 **Exames do município** | Mostra os exames que aquele município oferece — Betim, Macaé, Congonhas, Sete Lagoas e Piraí — com código, local de realização, especialidade, canal de encaminhamento, a marca de quem exige APAC/Laudo/Alto Custo (💰), e um aviso quando há uma regra específica daquele exame (idade mínima, documento a anexar, justificativa médica obrigatória). Macaé e Piraí também têm uma seção separada de **Encaminhamentos** — serviços de referência como CRA, Clínica do Autista, Especialidades Pediátricas e CEMAIA, que não são exame. O que não está na lista aparece como "não consta" — nunca como exame de outra cidade. |
| 💊 **Consulta REMUME** | Consulta os medicamentos do município do atendimento (14 municípios: Barbacena, Betim, Conceição do Mato Dentro, Congonhas, Coronel Fabriciano, Franco da Rocha, Itaúna, Macaé, Mendes, Piracema, Piraí, Santa Bárbara, Sete Lagoas e Varginha). Aceita erro de digitação e nome comercial. Os medicamentos de Receita Amarela e Receita Azul (Portaria 344/98) vêm com um aviso: precisam ser prescritos separadamente, para transcrição em receita física por um médico presencial — essas duas receitas ainda não têm aprovação para prescrição digital. |
| ⚠️ **Avisos do município** | Dentro do atendimento, mostra sozinho o que a teleconsulta resolve no município do paciente e o que deve ir para o presencial — hoje Barbacena e Franco da Rocha. Não aparece fora do atendimento; fechado no X, não volta naquele atendimento. |
| 👁️ **Prévia do documento** | Mostra o PDF ao lado do formulário enquanto você preenche a APAC ou um laudo — o mesmo arquivo que será baixado. Sempre ativa. |

Todas as funções têm um **tutorial guiado** (🎓) — as que têm painel próprio
oferecem sozinho na primeira vez que você abre; todas ficam disponíveis depois
no botão "🎓 Ver tutorial", no painel da engrenagem (nas duas que não têm botão
próprio na barra — Busca de CID-10 e Prévia do documento — o nome vira botão
clicável na linha "Sempre ativas").

---

## 2. Como instalar

**No computador** (Windows, Mac, Linux) ou no Android, com o **Tampermonkey**:

<https://raw.githubusercontent.com/sodelfino/meeds-suite/main/dist/meeds-suite.user.js>

Passo a passo: **[docs/GUIA-INSTALACAO.md](docs/GUIA-INSTALACAO.md)**

**No iPad ou iPhone**, com o app gratuito **Userscripts** no Safari:

<https://raw.githubusercontent.com/sodelfino/meeds-suite/main/dist/meeds-suite.safari.user.js>

> No iPad, **ligar a extensão em Ajustes → Safari → Extensões é um passo
> separado** de instalar o app — é onde quase todo mundo trava. Se o link
> acima só mostrar código e não oferecer instalação, baixe o arquivo pelo
> [release](https://github.com/sodelfino/meeds-suite/releases/latest) e mova
> para a pasta do Userscripts pelo app Arquivos.

Passo a passo e o que muda no iPad: **[docs/GUIA-IPAD.md](docs/GUIA-IPAD.md)**

> As duas versões têm o **mesmo código**, byte a byte — só o cabeçalho difere.
> Use a que tem `.safari.` no nome apenas no iPad/iPhone.

---

## 3. Como atualizar

Não precisa fazer nada: o Tampermonkey baixa as versões novas sozinho. Na
primeira vez que você abrir o Meeds depois de uma atualização, aparece um aviso
com o que mudou naquela versão. Ele aparece **uma vez só** por versão e **não
tem som**.

O histórico completo fica em ⚙️ → **Sobre** → *ver o que mudou*.

Para forçar agora: Tampermonkey → painel de controle → o script → **Atualizar**.

**Atualizar não apaga o cadastro de médicos.** Ele fica no armazenamento do
Tampermonkey, separado da versão do script.

---

## 4. Como adicionar uma função nova

Copiar uma pasta, preencher o que está marcado com "TROQUE", acrescentar uma
linha no `manifest.json` e rodar um comando. Nenhuma função existente é tocada.

Passo a passo: **[docs/COMO-ADICIONAR-MODULO.md](docs/COMO-ADICIONAR-MODULO.md)**

---

## 5. Como mudar um texto ou um dado

Nada disso exige mexer em código:

| Quero mudar | Arquivo |
|---|---|
| Nome/descrição de uma função no painel | `manifest.json` |
| Unidades de origem, procedimentos, CIDs | `dados/formularios.json` |
| Lista de medicamentos | `modules/remume/remumes.json` |
| Exames e encaminhamentos por município | `dados/exames.json` (ver [COMO-ADICIONAR-MUNICIPIO-EXAMES.md](docs/COMO-ADICIONAR-MUNICIPIO-EXAMES.md)) |
| Municípios e estabelecimentos (CNES) da APAC | `dados/apac.json` |
| Regras por município (o aviso dentro do atendimento) | `dados/avisos-municipio.json` |
| Rótulo que o Meeds mudou (ex: "Nome da Mãe") | `seletores.json` |
| O que aparece no aviso de atualização | `dados/changelog.json` |
| Códigos da CID-10 | `dados/cid10.json` |

Depois de editar:

```bash
npm run build
```

Tabela completa e explicações: **[docs/MANUAL-ADMIN.md](docs/MANUAL-ADMIN.md)**

---

## Para quem mexe no código

```bash
npm install             # uma vez: instala o ESLint e o exceljs
npm run build           # gera dist/meeds-suite.user.js e a variante .safari.
npm run verificar       # valida o build, as sincronizações, todos os testes e o lint
npm run sync-fallback   # sincroniza a lista de medicamentos embutida
npm run sync-cid10      # sincroniza a lista de CID embutida
npm run montar-exames   # remonta dados/exames.json e sincroniza o embutido
npm run lint            # só o ESLint
```

O build **reprova** se um módulo posicionar o próprio botão em pixel,
declarar a aparência do botão no próprio arquivo (ela vem do bloco
`apresentacao` no `manifest.json`) ou instalar hook próprio de fetch/XHR. As
regras não são só documentação.

**Antes de publicar uma versão:** suba `versao` no `manifest.json` (é o único
lugar — o build propaga para o userscript, o núcleo e o `package.json`) e
descreva o que mudou em `dados/changelog.json`. O build avisa se você esquecer.

```
bootloader.user.js     o único arquivo que o médico instala
manifest.json          módulos, textos, versões, ordem dos botões
seletores.json         rótulos de tela, atualizáveis sem gerar o pacote
dados/                 formulários, APAC, exames, avisos por município, CID-10, marcas, changelog
core/                  núcleo: dock, rede, leitura de tela, decisão, painel, tutorial
modules/               uma pasta por função (+ _template para copiar)
scripts/               build, sincronização e exportações
tests/                 testes em Node (npm run verificar) e smoke.html com mock da API
exports/               planilha-modelo e CSVs de importação nativa da REMUME
dist/                  pacotes gerados (Tampermonkey e Safari) e a sonda de diagnóstico
docs/                  arquitetura, instalação, manual do admin, testes, migração
```

### Documentação

| Documento | Para quê |
|---|---|
| [ARQUITETURA.md](docs/ARQUITETURA.md) | desenho, contrato de módulo, decisões técnicas |
| [COMO-ADICIONAR-MODULO.md](docs/COMO-ADICIONAR-MODULO.md) | criar uma função nova, em 6 passos |
| [MANUAL-ADMIN.md](docs/MANUAL-ADMIN.md) | "quero fazer X → abro o arquivo Y" |
| [GUIA-INSTALACAO.md](docs/GUIA-INSTALACAO.md) · [GUIA-IPAD.md](docs/GUIA-IPAD.md) | para o médico |
| [TESTES.md](docs/TESTES.md) | roteiro de QA e resultados |
| [DIAGNOSTICO-SALA-ESPERA.md](docs/DIAGNOSTICO-SALA-ESPERA.md) · [DIAGNOSTICO-CID.md](docs/DIAGNOSTICO-CID.md) | investigação de defeitos: causa raiz, evidência e o que foi corrigido |
| [VIABILIDADE-PREVIEW.md](docs/VIABILIDADE-PREVIEW.md) | por que a prévia do PDF foi feita assim |
| [MODULO-ALARME-FILA.md](docs/MODULO-ALARME-FILA.md) | como o alarme decide que chegou paciente |
| [COMO-ADICIONAR-MUNICIPIO-EXAMES.md](docs/COMO-ADICIONAR-MUNICIPIO-EXAMES.md) | incluir um município no módulo de Exames |
| [MIGRACAO-V2.md](docs/MIGRACAO-V2.md) | a passagem para o Meeds novo: evidências, decisões e o que ficou em aberto |

---

## Privacidade

Nenhum dado de paciente é gravado em disco nem enviado para fora do navegador.
Nome, CPF e identificador de atendimento vivem só na memória da aba.

> **Em desenvolvimento:** a função **Sala de Espera** (aviso de paciente
> agendado que chegou) está pronta, mas fora desta versão. Ela precisa de
> validação num plantão real antes de ir para os médicos. O código está em
> `modules/sala-espera/`, e o `manifest.json` explica como reativá-la.

Os dados dos médicos (nome, CRM, CPF, CNS) **não ficam no código**: cada médico
se cadastra uma vez no próprio navegador, com backup e restauração no painel.
