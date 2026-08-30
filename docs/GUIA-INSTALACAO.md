# Guia de instalação — Meeds Suite

**Uma única instalação.** Depois dela, as 5 ferramentas aparecem sozinhas na
tela do Meeds, e você liga ou desliga cada uma pelo botão ⚙️.

---

## 1. Instalar

1. Tenha a extensão **Tampermonkey** no navegador (Chrome, Edge ou Firefox).
   Se ainda não tiver: <https://www.tampermonkey.net>
2. Abra este link:

   <https://raw.githubusercontent.com/sodelfino/meeds-suite/main/dist/meeds-suite.user.js>

3. O Tampermonkey abre a tela de instalação. Clique em **Instalar**.
4. Abra o Meeds e faça login normalmente.

Pronto. Os botões aparecem no canto inferior direito assim que você entra.

> As atualizações passam a ser automáticas: o Tampermonkey busca a versão nova
> sozinho. Você não precisa mais instalar nada de novo, nem para as 5
> ferramentas juntas.

---

## 2. Desativar os scripts antigos (importante)

Se você já usava os scripts separados, **desative-os** depois de instalar a
suite. Se os dois ficarem ativos ao mesmo tempo, você vai ver **botão
duplicado e alarme tocando duas vezes**.

1. Clique no ícone do Tampermonkey → **Painel de controle**.
2. Na lista, encontre estes cinco e clique no interruptor da coluna
   **Ativado** para deixá-los cinza:

   - Meeds - Alarme de Fila (Plantao Noturno)
   - Gerador de APAC Itaúna — Meeds + Assinatura
   - Gerador de Laudo Procedimento Médico — Sete Lagoas (Meeds)
   - Gerador de Laudo Médico de Alto Custo — Conceição do Mato Dentro (Meeds)
   - Meeds - Assistente REMUME

**Desative, não desinstale.** Assim, se algo não sair como esperado, você
volta ao estado anterior com um clique — e os repositórios antigos continuam
publicados e válidos até nova comunicação.

---

## 3. Escolher o que aparece na tela

Clique no botão **⚙️** (o menorzinho, embaixo de todos, no canto inferior
direito). O painel lista as 5 funções com um interruptor cada.

Desligar uma função **tira o botão dela da tela na hora** — não precisa
recarregar a página nem reinstalar nada. A escolha fica salva neste navegador.

Exemplos:

| Situação | Deixe ligado |
|---|---|
| Plantão noturno em Itaúna | Alarme de Fila + APAC — Itaúna |
| Atende vários municípios | tudo |
| Só consulta medicamento | Assistente REMUME |

O ⚙️ **sempre** aparece, mesmo com tudo desligado — é o caminho de volta.

---

## 4. Os botões

Do mais baixo para o mais alto, no canto inferior direito:

| Botão | O que faz |
|---|---|
| ⚙️ | Painel: liga e desliga cada função |
| 🔔 / 🔕 | **Alarme de fila.** Clique para ligar/desligar. Clique com o **botão direito** (ou Shift+clique) para configurar som, volume e quando alertar |
| 📋 APAC - Itaúna | Gera a APAC de Itaúna e encaminha para assinatura gov.br |
| 📄 Laudo - Sete Lagoas | Preenche o LME oficial de Sete Lagoas |
| 📄 Laudo - CMD | Preenche o laudo de alto custo de Conceição do Mato Dentro |
| 💊 | Consulta a REMUME do município do atendimento |

Nada disso aparece na tela de login — só depois que você entra.

---

## 5. Primeira vez em cada ferramenta

**Alarme de fila.** Clique no 🔕 para ligar (vira 🔔). O navegador só libera
som depois de um clique seu, então esse primeiro clique é obrigatório — não dá
para deixar "ligado sozinho" ao abrir a página. Configure com o botão direito.

**APAC — Itaúna.** Os médicos vêm pré-cadastrados. Para adicionar ou remover,
use **⚙️ Gerenciar médicos** dentro do modal. A lista fica salva só neste
navegador.

**Sete Lagoas e CMD.** A seleção do médico é obrigatória a cada laudo, de
propósito — evita gerar um laudo com a assinatura errada.

**REMUME.** O município do atendimento é detectado sozinho. Se aparecer mais
de um município na tela, a ferramenta prefere **não escolher** — selecione na
lista. Você pode digitar com erro ("lozartna" acha "Losartana") ou pelo nome
comercial ("buscopan" acha escopolamina).

---

## 6. Quando algo não funciona

**Os botões não aparecem.**
Confirme que você está logado (na tela de login eles ficam escondidos de
propósito) e que o script está ativo no painel do Tampermonkey.

**Botão duplicado ou alarme tocando duas vezes.**
Algum script antigo continua ativo. Volte à seção 2.

**"jsPDF não carregou" ou "pdf-lib indisponível".**
A rede da unidade está bloqueando `cdnjs.cloudflare.com`. Peça liberação do
domínio ao TI local.

**A lista de medicamentos parece desatualizada.**
O cabeçalho do REMUME mostra a data dos dados. Se a busca remota falhar (rede
bloqueando o GitHub), a ferramenta usa a cópia embutida e continua
funcionando — apenas sem as atualizações mais recentes.

**O alarme não toca.**
Verifique se está 🔔 (ligado) e se o volume não está em zero (botão direito →
Volume → **🔊 Testar som**). Lembre que no modo "tempo de espera" ele **não**
toca na chegada, só quando alguém ultrapassa o limite configurado.

---

## 7. Privacidade

- Nenhum dado de paciente é gravado em disco: nome, CPF e identificador de
  atendimento vivem só na memória da aba e somem quando você fecha ou recarrega.
- Nada de paciente é enviado para fora do navegador.
- O que fica salvo neste navegador é só preferência de uso: quais funções estão
  ligadas, som e volume do alarme, e a lista de médicos que você cadastrou.
