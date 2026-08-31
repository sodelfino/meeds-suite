# Instalação no iPad (e no iPhone)

O Assistente funciona no Safari do iPad. Não existe Tampermonkey para iOS, mas
existe um app equivalente e gratuito: **Userscripts**, na App Store.

Há uma versão do Assistente feita para ele — mesmo programa, cabeçalho
diferente. **Não instale a versão do Tampermonkey no iPad**; ela não funciona
direito ali, pelo motivo explicado no fim desta página.

---

## 1. Instalar o app

Na App Store, procure por **Userscripts** (ícone `</>` laranja). É gratuito.
Abra o app uma vez; ele já vem com uma pasta escolhida.

## 2. LIGAR A EXTENSÃO — é aqui que quase todo mundo trava

**Instalar o app não liga a extensão.** Enquanto ela estiver desligada, nada
acontece no Safari e nenhum script instala. A própria tela inicial do app
avisa isso: *"You can turn on the Userscripts iOS Safari extension in
Settings"*.

1. **Ajustes** (o app cinza de engrenagem) → **Aplicativos** → **Safari**
   → **Extensões**.
   *(Em iPadOS mais antigo: Ajustes → Safari → Extensões.)*
2. Toque em **Userscripts** e ligue a chave.
3. Ainda nessa tela, toque em **Todos os sites** e escolha **Permitir**.

> Sem o passo 3 a extensão fica ligada mas sem permissão, e o resultado é o
> mesmo: nada acontece.

Para conferir se funcionou: abra qualquer site no Safari e toque no ícone de
extensões, na barra de endereço. O Userscripts tem que aparecer na lista.

## 3. Instalar o Assistente

Há dois caminhos. Tente o primeiro; se não der, o segundo funciona sempre.

### Caminho A — direto pelo Safari

1. No Safari do iPad, abra:

   <https://raw.githubusercontent.com/sodelfino/meeds-suite/main/dist/meeds-suite.safari.user.js>

2. A tela vai encher de código. **É isso mesmo** — não é erro.
3. Com essa página aberta, toque no **ícone de extensões** na barra de
   endereço → **Userscripts**.
4. Deve aparecer a oferta de instalar. Confirme.

### Caminho B — pelo app Arquivos (se o A não oferecer nada)

O caminho A depende de a extensão reconhecer a página como script. Se não
aparecer nada, use este, que não depende disso:

1. No Safari, abra:

   <https://github.com/sodelfino/meeds-suite/releases/latest/download/meeds-suite.safari.user.js>

   Este endereço **baixa o arquivo** em vez de mostrar o código. Confirme o
   download.
2. Abra o app **Arquivos** → **Transferências** (ou Downloads).
3. Mantenha o dedo sobre `meeds-suite.safari.user.js` → **Mover**.
4. Escolha **No meu iPad** → pasta **Userscripts** → **Mover**.
5. Volte ao app Userscripts. O script tem que aparecer na lista.

> Se a pasta **Userscripts** não aparecer em "No meu iPad", abra o app
> Userscripts, toque em **Change Userscripts Directory** e escolha uma pasta
> que você consiga achar no Arquivos — a de dentro do próprio app serve.

## 4. Usar

Abra o Meeds no Safari, faça login, e os botões aparecem no canto inferior
direito. O painel da engrenagem (⚙️) funciona igual ao do computador.

Se os botões não aparecerem, toque no ícone de extensões com o Meeds aberto e
confirme que o Userscripts está **permitido nesse site**.

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

**Abri o link e só apareceu um monte de código.**
É o esperado: o Safari mostra o arquivo como texto. A instalação acontece
tocando no ícone de extensões → Userscripts, **com essa página aberta**. Se
mesmo assim não aparecer a oferta, use o Caminho B.

**Toquei no ícone de extensões e o Userscripts não está lá.**
A extensão não foi ligada, ou foi ligada sem permissão. Volte ao passo 2 —
os dois sub-passos, o de ligar e o de "Todos os sites".

**Os botões não aparecem no Meeds.**
Confira, nesta ordem: (1) a extensão está ligada; (2) o Userscripts tem
permissão **para o site do Meeds**; (3) o script aparece na lista quando você
toca no ícone da extensão com o Meeds aberto; (4) o script não está
desativado ali (há uma chavinha por script).

**Instalei e o ícone da extensão não mostra nada.**
Verifique se o endereço que você abriu termina exatamente em `.user.js`. Se o
Safari abriu o arquivo como texto e nada aconteceu, toque no ícone da extensão
com essa página aberta — o Userscripts oferece a instalação a partir dali.

**Instalei a versão errada (a do Tampermonkey).**
Remova-a pelo app Userscripts e instale a que tem `.safari.` no endereço.

**O alarme não toca.**
O iPad exige um toque seu para liberar áudio. O primeiro toque no 🔕 já serve.
Confira também se o iPad não está no modo silencioso.
