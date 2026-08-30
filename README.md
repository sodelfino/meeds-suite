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
| 💊 **Assistente REMUME** | Consulta os medicamentos do município do atendimento. Aceita erro de digitação e nome comercial. |

---

## 2. Como instalar

Com o **Tampermonkey** instalado no navegador, abra:

<https://raw.githubusercontent.com/sodelfino/meeds-suite/main/dist/meeds-suite.user.js>

e clique em **Instalar**. Passo a passo completo, com o que fazer depois:
**[docs/GUIA-INSTALACAO.md](docs/GUIA-INSTALACAO.md)**

---

## 3. Como atualizar

Não precisa fazer nada: o Tampermonkey baixa as versões novas sozinho.

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
```

O build **reprova** se um módulo posicionar o próprio botão em pixel ou
instalar hook próprio de fetch/XHR. As regras não são só documentação.

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

Os dados dos médicos (nome, CRM, CPF, CNS) **não ficam no código**: cada médico
se cadastra uma vez no próprio navegador, com backup e restauração no painel.
