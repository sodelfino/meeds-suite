# Meeds Suite

**Versão unificada** das cinco ferramentas Meeds da Novetech. Uma única
instalação no Tampermonkey; cada função é um módulo que o médico liga ou
desliga num painel.

> ### Os repositórios antigos continuam válidos
>
> Este monorepo é uma **cópia refatorada** que coexiste com os cinco
> repositórios originais. Eles seguem publicados e funcionando normalmente, e
> **continuam sendo a versão oficial até nova comunicação**. Nada foi
> modificado neles. A migração só é considerada concluída depois da validação
> em plantão real — e a decisão de desativá-los é manual.
>
> Se você instalar a suite, **desative os cinco scripts antigos** no
> Tampermonkey (desativar, não desinstalar), senão verá botão duplicado e
> alarme tocando duas vezes. Ver [docs/GUIA-INSTALACAO.md](docs/GUIA-INSTALACAO.md).

---

## Para o médico

Instale só isto:

<https://raw.githubusercontent.com/sodelfino/meeds-suite/main/dist/meeds-suite.user.js>

Passo a passo, com telas e solução de problemas:
**[docs/GUIA-INSTALACAO.md](docs/GUIA-INSTALACAO.md)**

---

## Os cinco módulos

| Módulo | O que faz | Vem de |
|---|---|---|
| 🔔 **Alarme de Fila** | Alarme sonoro e visual quando entra paciente na fila do Pronto Atendimento, ou quando alguém ultrapassa um tempo de espera. Para sozinho quando a fila esvazia. | [`meeds-alarme-fila`](https://github.com/sodelfino/meeds-alarme-fila) |
| 📋 **APAC — Itaúna** | Gera a APAC de Itaúna em PDF e encaminha para assinatura no gov.br. | [`apac-itauna-meeds`](https://github.com/sodelfino/apac-itauna-meeds) |
| 📄 **Laudo — Sete Lagoas** | Preenche o LME oficial por cima do PDF da prefeitura. | [`lme-sete-lagoas-gerador`](https://github.com/sodelfino/lme-sete-lagoas-gerador) |
| 📄 **Laudo — CMD** | Preenche o laudo de alto custo de Conceição do Mato Dentro pelos campos reais do formulário PDF. | [`laudo-cmd-meeds`](https://github.com/sodelfino/laudo-cmd-meeds) |
| 💊 **Assistente REMUME** | Consulta a relação municipal de medicamentos do município do atendimento. | [`meeds-remume-assistant`](https://github.com/sodelfino/meeds-remume-assistant) |

Nenhuma funcionalidade foi perdida na unificação. O checklist item por item
está em [docs/ARQUITETURA.md](docs/ARQUITETURA.md#4-checklist-de-funções-preservadas).

---

## O que a unificação resolve

Antes: **5 instalações e 5 atualizações** por médico, e cinco cópias do mesmo
esqueleto — trava de frame, detecção de login, leitura de rótulo, e **três
hooks concorrentes** de `fetch`/`XHR` na mesma página. Os botões tinham posição
fixa em pixel, coordenada na mão entre repositórios, e quebravam sempre que um
script entrava ou saía.

Agora: **1 instalação**, um hook de rede, um dock que empilha os botões
sozinho, e um painel para ligar só o que se usa.

---

## Para quem mexe no código

```bash
node scripts/build.js            # gera dist/meeds-suite.user.js
node scripts/build.js --check    # valida sem escrever
node scripts/sync-fallback.js    # sincroniza o fallback do REMUME
```

O build **reprova** se um módulo posicionar o próprio botão em pixel ou
instalar hook próprio de fetch/XHR. As regras não são só documentação.

```
bootloader.user.js     o único arquivo que o médico instala
manifest.json          fonte de verdade do build: módulos, versões, ordem
seletores.json         rótulos de tela, atualizáveis sem redeploy
core/                  núcleo compartilhado (dock, rede, DOM, decisão, painel)
modules/               um diretório por módulo — só regra de negócio
scripts/               build e sincronização do fallback
tests/                 teste de fumaça com mock da API
docs/                  arquitetura, guia de instalação e testes
```

Adicionar um 6º módulo não exige tocar em nenhum módulo existente: crie a
pasta, chame `MeedsSuite.registerModule({...})` e acrescente uma entrada no
`manifest.json`. O contrato está em
[docs/ARQUITETURA.md](docs/ARQUITETURA.md#3-contrato-de-módulo).

---

## Privacidade

Nenhum dado de paciente é gravado em disco nem enviado para fora do navegador.
Nome, CPF e identificador de atendimento vivem só na memória da aba. O que fica
salvo localmente é preferência de uso: módulos ativos, som e volume do alarme, e
a lista de médicos cadastrada naquele navegador.
