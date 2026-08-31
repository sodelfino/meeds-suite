# Assistente Meeds — Por: Marcelo

Todas as ferramentas do Meeds numa **instalação única**. Cada função liga e
desliga num painel, sem reinstalar nada.

> ### Os repositórios antigos continuam válidos
>
> Este é o pacote unificado que substitui os cinco scripts separados. Eles
> seguem publicados e funcionando, e **continuam válidos até nova
> comunicação** — nada foi modificado neles.
>
> Se você instalar o Assistente, **desative os cinco scripts antigos** no
> Tampermonkey (desativar, não desinstalar). O próprio Assistente avisa na
> tela se detectar algum deles ainda ativo.

---

## 1. O que é

| Função | O que faz |
|---|---|
| 🔔 **Alarme de Fila** | Avisa com som e aviso na tela quando entra paciente na fila do Pronto Atendimento, ou quando alguém espera além do tempo definido. Para sozinho quando a fila esvazia. |
| 📋 **APAC — Itaúna** | Gera a APAC já preenchida com os dados da tela e leva direto para a assinatura no gov.br. |
| 📄 **Laudo — Sete Lagoas** | Preenche o Laudo Médico de Alto Custo no formulário oficial da prefeitura. |
| 📄 **Laudo — Conceição do Mato Dentro** | Idem, no formulário oficial de CMD. |
| 🪑 **Sala de Espera** | Avisa, sem som, quando um paciente de consulta agendada chega — com nome, hora marcada e tempo de espera. |
| 🔎 **Buscar CID-10** | Procura o código pelo nome da doença, na tabela completa (14.233 códigos), e preenche no laudo aberto. |
| 💊 **Assistente REMUME** | Consulta os medicamentos do município do atendimento. Aceita erro de digitação e nome comercial. |

---

## 2. Como instalar

Com o **Tampermonkey** instalado no navegador, abra:

<https://raw.githubusercontent.com/sodelfino/meeds-suite/main/dist/meeds-suite.user.js>

e clique em **Instalar**. Passo a passo completo, com o que fazer depois:
**[docs/GUIA-INSTALACAO.md](docs/GUIA-INSTALACAO.md)**

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
npm run build       # gera dist/meeds-suite.user.js
npm run verificar   # valida sem gerar
npm run sync-fallback   # sincroniza a lista de medicamentos embutida
npm run sync-cid10      # sincroniza a lista de CID embutida
```

O build **reprova** se um módulo posicionar o próprio botão em pixel ou
instalar hook próprio de fetch/XHR. As regras não são só documentação.

**Antes de publicar uma versão:** suba `versao` no `manifest.json` (é o único
lugar — o build propaga para o userscript, o núcleo e o `package.json`) e
descreva o que mudou em `dados/changelog.json`. O build avisa se você esquecer.

```
bootloader.user.js     o único arquivo que o médico instala
manifest.json          módulos, textos, versões, ordem dos botões
seletores.json         rótulos de tela, atualizáveis sem gerar o pacote
dados/                 dados dos formulários e modelo de cadastro
core/                  núcleo: dock, rede, leitura de tela, decisão, painel
modules/               uma pasta por função (+ _template para copiar)
scripts/               build e sincronização
tests/                 teste de fumaça com mock da API
docs/                  arquitetura, instalação, manual do admin, testes
```

Desenho, contrato de módulo, checklist de funções preservadas e decisões
técnicas: **[docs/ARQUITETURA.md](docs/ARQUITETURA.md)**

---

## Privacidade

Nenhum dado de paciente é gravado em disco nem enviado para fora do navegador.
Nome, CPF e identificador de atendimento vivem só na memória da aba.

A **Sala de Espera** roda inteiramente no navegador: a única chamada que ela faz
é para o próprio Meeds (mesma origem, com os cookies da sua sessão). Ela não
armazena nem transmite dado de paciente, e o console de depuração registra
apenas mensagens fixas — nunca nome, CPF ou CNS.

Os dados dos médicos (nome, CRM, CPF, CNS) **não ficam no código**: cada médico
se cadastra uma vez no próprio navegador, com backup e restauração no painel.
