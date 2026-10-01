#!/usr/bin/env node
/**
 * tests/lembrete-exames.test.js — lembrete fixo de justificativa+CID
 *
 * Pedido de 01/10/2026: os Protocolos 1 e 2 da Callmed exigem, em TODA
 * solicitação de exame ou encaminhamento (não só quando o exame falta na
 * lista do município), justificativa clínica, resumo da história clínica,
 * hipótese diagnóstica e CID — "Resumo prático" dos dois documentos.
 *
 * mensagemNaoConsta() (ver tests/mensagem-nao-consta.test.js) já cobre o
 * caso do exame fora da lista; este teste cobre o lembrete GERAL, sempre
 * visível na aba de Exames, independente de busca ou de o exame constar.
 *
 * O modal é montado dentro de start() (precisa de dependências de DOM que
 * não existem em Node), então este teste verifica o HTML-fonte do módulo
 * diretamente — é o padrão mais simples para marcação estática sem
 * ramificação, e evita montar um harness de DOM só para isso.
 *
 * Uso:  node tests/lembrete-exames.test.js
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(RAIZ, "modules/exames/index.js"), "utf8");

let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs !== undefined ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}

ok("tem a classe CSS do lembrete fixo (.ex-lembrete)", /\.ex-lembrete\s*\{/.test(src));
ok('o HTML do modal inclui um elemento "ex-lembrete" (sempre no DOM, sem "oculto"/"hidden")',
   /<div class="ex-lembrete"[^>]*id="ex-lembrete">/.test(src));
ok("o texto cita justificativa clínica", /justificativa cl[ií]nica/i.test(src));
ok("o texto cita resumo da história", /resumo da hist[oó]ria/i.test(src));
ok("o texto cita CID", /\bCID\b/.test(src));

console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
if (falhas) process.exit(1);
