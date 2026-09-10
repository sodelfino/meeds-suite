# Como publicar uma versão

O **código** (o `.user.js`) é distribuído por **GitHub Release**. O `@updateURL`
e o `@downloadURL` que ficam no navegador do médico apontam para
`releases/latest/download/…` — **não** para um branch.

Consequência: **um push no `main` não chega sozinho ao navegador de ninguém.**
Só uma tag `vX.Y.Z` empurrada, que faz o workflow `publicar release` anexar os
artefatos à Release, é que vira atualização automática. Isso põe uma etapa
deliberada entre "commitei" e "todos os médicos rodam".

Os **dados** (`seletores.json`, `dados/cid10.json`, `modules/remume/remumes.json`,
`dados/exames.json`) continuam vindo do `main`, de propósito — é o que permite
corrigir um rótulo de tela ou uma lista a quente, sem release. O que protege o
`main` é **branch protection + 2FA** (ver o fim deste documento). O núcleo só
aceita esses arquivos se o formato bater, e cai para a cópia embutida se não
bater.

---

## Passo a passo

1. **Suba a versão** em `manifest.json` (`"versao"`). É o único lugar: o build
   propaga para o userscript, o núcleo e o `package.json`.
2. **Descreva o que mudou** em `dados/changelog.json` — um bloco novo no topo da
   lista `versoes`, com a mesma `versao`. O build avisa se você esquecer, e as
   notas da Release saem daqui.
3. **Gere o pacote:** `npm run build`.
4. **Confira:** `npm run verificar` (o CI roda o mesmo; melhor não descobrir
   falha no runner).
5. **Commit** de tudo — inclusive `dist/`. Abra um PR para o `main`
   (obrigatório com branch protection ligado). O workflow `verificar` roda no
   PR.
6. Depois do merge, **crie a tag e a release num comando só**, do `main`
   atualizado:

   ```bash
   git checkout main && git pull
   v=$(node -p "require('./manifest.json').versao")
   git tag "v$v"
   git push origin "v$v"
   ```

7. O workflow **`publicar release`** dispara com a tag: reconstrói num runner
   limpo, confere que `npm run verificar` passa, que a tag bate com o
   `manifest.json` e que o `dist/` commitado bate com o build, e anexa os
   quatro artefatos (`meeds-suite.user.js`, `.meta.js` e as duas variantes
   `.safari.`) à Release `v$v`. A partir daí, `releases/latest/download/…`
   serve a versão nova e o Tampermonkey/Userscripts atualiza sozinho.

Se preferir criar a Release pela interface do GitHub, tudo bem: o workflow
detecta que ela já existe e só anexa os artefatos (`--clobber`).

---

## A primeira release depois desta mudança

Os médicos que já têm o Assistente instalado têm, no cabeçalho, o `@updateURL`
**antigo** (`raw.githubusercontent.com/.../main/dist/meeds-suite.meta.js`).

Para a transição não deixar ninguém para trás, a **primeira** versão publicada
depois desta mudança precisa chegar pelos **dois** caminhos:

- **tag + release** (o caminho novo), e
- o `dist/` no `main` continua no repositório de qualquer forma (é o artefato
  versionado), então o `@updateURL` antigo ainda encontra o `meta.js` novo —
  que já traz o `@updateURL` apontando para as releases.

Da segunda release em diante, o caminho antigo fica órfão e pode ser ignorado.

---

## Proteções da conta (fazer uma vez, na interface do GitHub)

Estas duas não dá para versionar no repositório — são configuração da conta e
do repositório:

1. **Branch protection no `main`**
   `Settings → Branches → Add branch ruleset` (ou `Add rule`) para `main`:
   - exigir pull request antes de merge;
   - exigir o status check **`verificar`** verde;
   - (opcional, recomendado) exigir que o branch esteja atualizado com o
     `main` antes do merge.

   Por linha de comando:
   ```bash
   gh api -X PUT repos/sodelfino/meeds-suite/branches/main/protection \
     -F required_status_checks.strict=true \
     -F 'required_status_checks.contexts[]=verificar' \
     -F enforce_admins=true \
     -F required_pull_request_reviews.required_approving_review_count=0 \
     -F restrictions=
   ```

2. **2FA na conta `sodelfino`**
   `Settings → Password and authentication → Two-factor authentication`.
   A mesma conta serve os arquivos de dados que rodam no navegador do médico;
   se ela cair, cai a integridade de tudo.
