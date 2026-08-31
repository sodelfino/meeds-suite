# Instalação no iPad (e no iPhone)

O Assistente funciona no Safari do iPad. Não existe Tampermonkey para iOS, mas
existe um app equivalente e gratuito: **Userscripts**, na App Store.

Há uma versão do Assistente feita para ele — mesmo programa, cabeçalho
diferente. **Não instale a versão do Tampermonkey no iPad**; ela não funciona
direito ali, pelo motivo explicado no fim desta página.

---

## 1. Instalar o app

1. Na App Store, procure por **Userscripts** (ícone laranja, do desenvolvedor
   *Justin Wasack*). É gratuito e sem anúncios.
2. Abra o app uma vez. Ele pede para escolher uma pasta onde vai guardar os
   scripts — pode aceitar a que ele sugere.

## 2. Ligar a extensão no Safari

1. **Ajustes** → **Safari** → **Extensões**.
2. Ligue **Userscripts**.
3. Toque em **Userscripts** → **Todos os sites** → **Permitir**.

> Se preferir liberar só o Meeds, escolha "Perguntar" e autorize quando
> aparecer. Mas aí não esqueça: se um dia o Assistente "sumir", é porque a
> permissão não foi dada naquele site.

## 3. Instalar o Assistente

No Safari do iPad, abra este endereço:

<https://raw.githubusercontent.com/sodelfino/meeds-suite/main/dist/meeds-suite.safari.user.js>

Toque no ícone da extensão (na barra de endereço) e escolha **instalar**.

> Repare no `.safari.` no meio do endereço. É essa versão que funciona no iPad.

## 4. Usar

Abra o Meeds, faça login, e os botões aparecem no canto inferior direito, como
no computador. O painel da engrenagem (⚙️) funciona igual: ligar e desligar
funções, cadastrar médico, ver o que mudou.

---

## O que muda no iPad

Quase nada. Três diferenças, todas explicadas:

### O cadastro fica no armazenamento do Safari

No computador, o cadastro de médicos fica guardado pelo Tampermonkey e
sobrevive até a "limpar dados do site". No iPad, ele fica no armazenamento do
próprio Safari.

Na prática: **limpar histórico e dados de sites no Safari apaga o cadastro.**

Não é grave, mas vale saber: se você faz isso com frequência, use o
⚙️ → **Médicos** → **Fazer backup** e guarde o arquivo. Restaurar leva dez
segundos.

### A prévia do documento não aparece

O Safari do iOS não consegue exibir PDF dentro do painel — mostraria um quadro
em branco, o que é pior do que não mostrar nada. Então a função "Prévia do
documento" simplesmente não é oferecida no iPad.

Tudo o mais dos geradores funciona: preencher, gerar e baixar o PDF.

### O PDF vai para o app Arquivos

Ao gerar um laudo, o iPad abre ou baixa o arquivo em **Arquivos → Downloads**,
em vez de salvar direto numa pasta. De lá você compartilha, imprime ou envia
para o assinador do gov.br normalmente.

---

## Por que existe uma versão separada

Duas restrições da extensão Userscripts, ambas documentadas por ela:

**1. Pedir qualquer função do gerenciador tira o script da página.**
A documentação do Userscripts diz: *"When using API methods, it's only possible
to inject into the content script scope."* Traduzindo o efeito prático: se o
script pedir qualquer recurso do gerenciador (como o armazenamento durável),
ele passa a rodar num contexto isolado, **sem enxergar as chamadas que a página
do Meeds faz ao servidor**.

E é dessas chamadas que dependem o alarme de fila, o preenchimento automático
dos dados do paciente na APAC e a detecção do município no REMUME. Ou seja:
pedir o armazenamento durável custaria três funções.

A versão do iPad opta pelo contrário — `@grant none` e `@inject-into page`.
Fica no contexto da página, enxerga a rede, e usa o armazenamento comum do
Safari para o cadastro. Foi a troca certa: cadastro se refaz em um minuto e tem
backup; alarme cego, não.

**2. As funções do gerenciador são assíncronas.**
No Userscripts, `GM.setValue` devolve uma promessa; a forma síncrona
`GM_setValue`, usada no computador, não existe. O Assistente já sabia cair para
o armazenamento comum quando o gerenciador não oferece essas funções — então
nada quebrou.

### Uma coisa que não muda: o programa

O corpo dos dois arquivos é **idêntico, byte a byte**. Só o cabeçalho difere.
Não existe um "Assistente do iPad" mantido à parte: é o mesmo código, gerado
pelo mesmo `npm run build`. Corrigir algo corrige nos dois.

---

## Se algo não funcionar

**Os botões não aparecem.**
Confira, nesta ordem: (1) a extensão está ligada em Ajustes → Safari →
Extensões; (2) o Userscripts tem permissão para o site do Meeds; (3) o script
aparece na lista quando você toca no ícone da extensão com o Meeds aberto.

**Instalei e o ícone da extensão não mostra nada.**
Verifique se o endereço que você abriu termina exatamente em `.user.js`. Se o
Safari abriu o arquivo como texto e nada aconteceu, toque no ícone da extensão
com essa página aberta — o Userscripts oferece a instalação a partir dali.

**Instalei a versão errada (a do Tampermonkey).**
Remova-a pelo app Userscripts e instale a que tem `.safari.` no endereço.

**O alarme não toca.**
O iPad exige um toque seu para liberar áudio. O primeiro toque no 🔕 já serve.
Confira também se o iPad não está no modo silencioso.
