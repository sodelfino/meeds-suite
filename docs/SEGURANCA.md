# Segurança e privacidade — modelo de ameaça

Documento de referência. As decisões estão espalhadas nos cabeçalhos dos
arquivos e na lista de decisões de [ARQUITETURA.md](ARQUITETURA.md) (D1, D38,
D70, D71); aqui elas ficam juntas.

## O que o Assistente pode fazer

O userscript roda **dentro da página autenticada do Meeds** (`*.meeds.com.br`),
no mesmo contexto de origem da aplicação. Na prática, ele pode:

- ler o DOM, incluindo o cartão do paciente (nome, CPF, nascimento, nome da
  mãe, telefone);
- observar todas as chamadas de `fetch`/`XHR` da aplicação (é como o alarme de
  fila e o preenchimento automático da APAC funcionam);
- fazer chamadas à API do Meeds com o cookie de sessão do médico
  (`credentials: "include"` — APAC e Sala de Espera, conforme suas assinaturas e consultas de atendimento);
- gravar no armazenamento do gerenciador de scripts (Tampermonkey) ou no
  IndexedDB (Safari).

É bastante poder. O que segue é o que limita o uso desse poder.

## O que ele deliberadamente NÃO faz

| Não faz | Como se garante |
|---|---|
| Enviar dado de paciente para fora do navegador | Não há servidor nem telemetria. As únicas saídas de rede são: a própria API do Meeds (mesma origem); GitHub Releases / API pública para conferir atualizações sem dados de pacientes; GitHub `raw` para buscar listas públicas (medicamentos, CID, exames, rótulos) — GET, sem PII na URL; `assinador.iti.br` aberto pelo médico (sem dados no caminho). O "Enviar feedback" é `mailto:` — abre o e-mail do médico. |
| Executar código remoto | `manifest.carregamentoRemotoDeCodigo: false`. O pacote é autocontido (o build embute núcleo e módulos). `eval`/`new Function` **reprovam o build** (D70). jsPDF e pdf-lib entram só por `@require`, com `#sha512=` (SRI). |
| Instalar hook de rede por módulo | Um único hub no núcleo (`core/network-hub.js`); módulo que patcheia `fetch`/`XHR` reprova o build. O hub não guarda histórico de respostas. |
| Copiar campos estruturados de identificação para o histórico | Os campos estruturados de identificação não são copiados para o histórico; texto clínico livre pode conter identificação informada pelo médico. Ver abaixo. |

## A exceção: o histórico dos geradores

`core/historico.js` persiste (no navegador, nunca numa nuvem) as últimas ~30
emissões de APAC e laudo, para o médico não redigitar a parte clínica:

- **grava:** procedimento, CID, justificativa, unidade, médico, data e uma
  referência **pseudonimizada** — iniciais + 3 últimos dígitos do CPF
  (`M.A.S. · •••909`);
- **não copia como campos do histórico:** nome completo, CPF completo,
  nascimento, nome da mãe e telefone, nem o PDF. O texto clínico é salvo como
  digitado e pode conter identificação incluída pelo médico.

Sob a LGPD isso é dado pessoal **pseudonimizado**, não anônimo: em uma clínica
pequena, iniciais + final de CPF + data + médico têm algum risco de
reidentificação. Mitigações: o médico pode limpar o histórico a qualquer
momento; "Reabrir" repõe só a parte clínica; a função `referenciaDoPaciente`
tem teste (`tests/historico.test.js`) que falha se o nome ou o CPF completo
vazarem.

Quem instala numa unidade deve confirmar a conformidade com a LGPD e as
políticas locais antes de usar em produção.

## Fronteiras de confiança

| Depende de | Para quê | Se cair |
|---|---|---|
| Conta GitHub `sodelfino` | Serve o `.user.js` (via Release) e os arquivos de dados (via `main`) | Código malicioso na sessão do médico. Mitigação: **branch protection + 2FA** (ver [RELEASE.md](RELEASE.md)); dados são validados por formato com fallback embutido; código só sai por Release marcada, com CI. |
| cdnjs.cloudflare.com | jsPDF e pdf-lib, na instalação | Versões e hashes `#sha512=` fixados; a verificação depende do suporte do gerenciador de scripts. Os hashes foram conferidos contra os pacotes npm oficiais. |
| Gerenciador de scripts (Tampermonkey / Userscripts) | Executa o script, guarda preferências, valida `@require` | Fora do modelo — é a plataforma. |

## Distribuição

O `@updateURL`/`@downloadURL` aponta para `releases/latest/download/…`, não
para um branch: um push no `main` não chega ao navegador de ninguém. Só uma
tag `vX.Y.Z` dispara o workflow que publica a Release. O workflow `verificar`
roda em todo push e PR. Ver [RELEASE.md](RELEASE.md) e a decisão D71.

## Relatar um problema de segurança

Por e-mail: `marcelonovetech@gmail.com`. Descreva a classe do problema; não é
preciso anexar exploit funcional.

No Safari, a checagem manual usa a API pública de releases, com `credentials:
"omit"`; o endpoint de download do GitHub não fornece CORS no redirecionamento.
Se a rede, a CSP ou o limite da API impedir a consulta, o Assistente informa a
falha e não declara a versão atualizada. A instalação pode ser feita pelo guia.
