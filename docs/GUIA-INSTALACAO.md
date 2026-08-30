# Guia de instalação — Assistente Meeds

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

## 4.1 Na primeira vez que você abrir

Duas telas aparecem sozinhas, uma vez só:

- **Boas-vindas**, mostrando onde ficam os botões e para que serve o ⚙️.
  Tem um atalho "Cadastrar agora" que leva direto ao cadastro do médico.
- **Aviso de botões duplicados**, se algum dos cinco scripts antigos ainda
  estiver ativo. Ele diz quais são e como desativar. Se você já resolveu,
  clique em "Não avisar de novo".

## 4.2 Cadastre-se uma vez

Por segurança, os dados dos médicos **não ficam mais no código do programa** —
eles são dados pessoais e o repositório é público. No ⚙️, seção **Médicos**,
preencha:

| Campo | Usado por |
|---|---|
| Nome completo | todos os laudos (é o único obrigatório) |
| CRM | Sete Lagoas e Conceição do Mato Dentro |
| CPF | os três laudos, inclusive a APAC |

O CPF se formata sozinho enquanto você digita: basta teclar os números.

> **Não pedimos mais o CNS.** O formulário da APAC aceita CNS **ou** CPF, e
> quase ninguém sabe o próprio CNS de cabeça. O laudo sai com a caixa do CPF
> marcada.

Logo abaixo, em **Estabelecimentos**, cadastre as unidades solicitantes com o
CNES. Elas aparecem para escolher no gerador de APAC, e o CNES preenche sozinho
quando você escolhe a unidade.

Leva menos de um minuto e **não se repete**: atualizar o Assistente não apaga
o cadastro.

Se você tiver **um só médico cadastrado**, ele já vem selecionado nos laudos —
um clique a menos por documento. Com dois ou mais, o sistema não escolhe
sozinho, de propósito: assinatura errada num laudo é um problema sério.

**Trocando de computador?** No ⚙️ → **Fazer backup** gera um arquivo. No outro
computador, **Restaurar backup**. O administrador também pode te enviar um
arquivo pronto com a equipe inteira.

## 5. Primeira vez em cada ferramenta

**Alarme de fila.** Clique no 🔕 para ligar (vira 🔔). O navegador só libera
som depois de um clique seu, então esse primeiro clique é obrigatório — não dá
para deixar "ligado sozinho" ao abrir a página.

Para escolher o som, o volume e quando alertar: ⚙️ → na linha "Alarme de Fila",
clique em **Ajustes**. (Clique com o botão direito no 🔔 é um atalho para a
mesma tela.)

Quando dispara, além do som você vê uma faixa vermelha no topo **e uma moldura
pulsante na borda da tela** — feita para ser percebida de canto de olho em sala
com pouca luz.

**Os três geradores de laudo.** Todos leem os dados do paciente da tela do
atendimento sozinhos; confira antes de gerar. Se algo não vier, use
**🔄 Atualizar paciente**.

Depois de gerar, aparece uma confirmação verde com o nome do arquivo, e o
documento fica no **📜 Histórico**. Ali, o botão **Reabrir** repõe
procedimento, CID e justificativa de um laudo anterior — útil quando você
precisa emitir outro parecido. Os dados do paciente **não** são repostos: eles
vêm sempre da tela, para não misturar pacientes.

O histórico guarda apenas as iniciais e os três últimos dígitos do CPF
(`M.A.S. · •••909`) — o suficiente para você reconhecer o atendimento, sem
gravar dado de paciente no computador.

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
Quase sempre é um script antigo ainda ativo — o próprio Assistente detecta e
avisa. Volte à seção 2. Se o aviso não aparecer e o problema persistir,
confira no painel do Tampermonkey se você não tem o Assistente instalado duas
vezes.

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
- O que fica salvo neste navegador: quais funções estão ligadas, som e volume
  do alarme, a lista de médicos que você cadastrou, e o histórico dos
  documentos gerados — este último **sem** nome, CPF completo, nascimento,
  nome da mãe ou telefone do paciente.
