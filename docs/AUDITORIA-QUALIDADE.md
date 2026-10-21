# Auditoria de qualidade — 21/10/2026

Revisão do [PR #1](https://github.com/sodelfino/meeds-suite/pull/1), adaptada ao
código atual na versão **2.68.3**, sem restaurar versões antigas dos módulos.

| Achado | Correção e evidência |
|---|---|
| Execução de bibliotecas baixadas durante o atendimento | Removida dos cinco geradores: APAC, CMD, Sete Lagoas, LME-MG e Notificação. A biblioteca já carregada é reutilizada; sua ausência rejeita com orientação de atualização. Testes exercitam os resolvedores reais, inclusive o escopo do gerenciador. |
| Integridade de jsPDF/pdf-lib | Versões e SHA-512 fixados em `@require`. Hashes conferidos contra `dist/jspdf.umd.min.js` do pacote npm oficial `jspdf@2.5.1` e `dist/pdf-lib.min.js` de `pdf-lib@1.17.1`. A aplicação da verificação depende do suporte do gerenciador. |
| Distribuição de código diretamente do main | Metadados, botão de atualização e instalação guiada usam releases. O Safari consulta a versão pela API pública, para evitar o redirecionamento de download sem CORS. O workflow de publicação instala dependências, testa, reconstrói e confere os artefatos; exige tag igual à versão e commit pertencente ao main. Não sobrescreve releases existentes. |
| Texto de privacidade incompatível com o histórico | README, painel, cabeçalho e guias descrevem o histórico local como pseudonimizado. Texto clínico é salvo como digitado e pode conter identificação. Não há promessa de anonimato. |
| Ausência de licença | Incluída a licença proprietária proposta no PR, com condições de uso e conferência dos documentos pelo profissional. |
| Falta de testes do histórico e hub de rede | Testes do PR incorporados. A checagem de respostas HTTP de erro foi adaptada à decisão D60: o diagnóstico recebe a falha e a aplicação mantém sua resposta intacta. |
| Documentação e HTML do catálogo | Incluídos `CONTRIBUTING.md`, `.editorconfig` e documentos de segurança/publicação. A APAC usa `textContent` para nomes e códigos; teste com texto que contém tags garante que não seja interpretado como HTML. |

## Execução reproduzível

Com Node 20 e as dependências instaladas por `npm ci`:

```bash
npm run auditoria
node tests/instalacao-guiada.test.js
npm run verificar
npm run build
git diff --exit-code
```

O último comando deve ser executado a partir de um checkout sem alterações
pendentes, depois de os artefatos gerados terem sido incluídos no commit.

`npm run auditoria` executa análise de sintaxe/AST do núcleo e dos módulos,
testes dos cinco carregadores, integridade/metadados, tratamento textual do
catálogo, testes do histórico e do hub. Também injeta doze tentativas de
`eval`/`Function` em cópias temporárias de núcleo, módulo ativo, módulo fora do
pacote e asset: o build deve recusar todas. Nenhum arquivo do checkout é
alterado por essas tentativas.

As verificações locais passaram, incluindo os **44 arquivos de testes** de
`npm run verificar`, o ESLint e os **14 grupos** de instalação guiada. A revisão
independente não apontou problemas importantes pendentes.

No Chromium, com acessos externos bloqueados, a consulta por `sertr` em
Pará de Minas retornou somente as duas apresentações de sertralina, mantendo
a condição para gestantes e o aviso geral curto. O PDF de instalação foi
regenerado com as orientações e os links atualizados, preservando suas 11
páginas e a estrutura de acessibilidade.

## Limites e controles externos

- A API do GitHub respondeu com bloqueio do proxy deste ambiente (HTTP 403).
  A consulta real da API no Safari e o estado remoto dos workflows não foram
  validados por essa rota. Os testes locais cobrem URL, resposta da release,
  recusa de rascunhos/prévias e ausência de cookies.
- Branch protection e 2FA são configurações externas, não verificadas aqui.
  Os passos para conferir esses controles estão em [RELEASE.md](RELEASE.md).
- Não foi executado um atendimento real no Meeds nem um teste em iPad físico.
