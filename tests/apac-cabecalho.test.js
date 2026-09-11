/* ------------------------------------------------------------------
 * tests/apac-cabecalho.test.js — o cabeçalho oficial não pode sumir
 * ------------------------------------------------------------------
 * NÃO testa geração de PDF (jsPDF só existe via @require do Tampermonkey
 * — não roda em Node, e testá-lo de verdade exige um navegador; isso foi
 * feito manualmente, gerando o PDF pelo fluxo real, para as 3 cidades e
 * 5 tipos de procedimento, incluindo os dois com campo condicional
 * — Doppler e "Outro". Ver docs/ARQUITETURA.md, decisão D59.
 *
 * O que ESTE teste garante, para sempre, sem precisar de navegador: que
 * o asset da imagem do cabeçalho continua no manifest, continua sendo
 * um PNG de verdade (não uma string vazia ou corrompida), e continua do
 * tamanho e proporção esperados. Sem isso, alguém poderia apagar o
 * arquivo, esquecer de listá-lo no manifest, ou colar um base64 quebrado
 * — e só descobriria abrindo o PDF gerado no consultório.
 * ------------------------------------------------------------------ */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");

let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs !== undefined ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}

/* 1. o manifest referencia o asset */
const manifest = JSON.parse(fs.readFileSync(path.join(RAIZ, "manifest.json"), "utf8"));
const apac = manifest.modulos.find((m) => m.id === "apac");
ok("a ficha da apac existe no manifest", !!apac);

const CAMINHO_ASSET = "modules/apac/assets/cabecalho-oficial.js";
ok(
  "o manifest lista o asset do cabeçalho oficial",
  !!(apac && Array.isArray(apac.assets) && apac.assets.includes(CAMINHO_ASSET))
);

/* 2. o arquivo existe e o base64 é um PNG de verdade */
const caminhoAbsoluto = path.join(RAIZ, CAMINHO_ASSET);
ok("o arquivo do asset existe", fs.existsSync(caminhoAbsoluto));

if (fs.existsSync(caminhoAbsoluto)) {
  const fonte = fs.readFileSync(caminhoAbsoluto, "utf8");
  const m = fonte.match(/MEEDS_APAC_CABECALHO_B64\s*=\s*"([^"]+)"/);
  ok("o arquivo declara MEEDS_APAC_CABECALHO_B64", !!m);

  if (m) {
    const b64 = m[1];
    let bytes = null;
    try {
      bytes = Buffer.from(b64, "base64");
    } catch (e) {
      bytes = null;
    }
    ok("o base64 decodifica sem erro", !!bytes && bytes.length > 0);

    if (bytes) {
      /* Assinatura PNG: 8 bytes fixos que todo PNG começa com. Se isso
       * não bater, não é uma imagem — é lixo, e o doc.addImage() do
       * jsPDF falharia silenciosamente ou geraria página em branco. */
      const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      ok("os bytes começam com a assinatura PNG", bytes.subarray(0, 8).equals(ASSINATURA_PNG));

      /* Tamanho plausível: o recorte real tem ~27KB. Um arquivo muito
       * menor sugere corte incompleto; muito maior, um recorte errado
       * (a página inteira em vez de só o cabeçalho) inflando o pacote. */
      const kb = bytes.length / 1024;
      ok("o tamanho é plausível para um recorte de cabeçalho (10–80 KB)", kb > 10 && kb < 80, kb.toFixed(1) + " KB");

      /* Largura e altura vêm do IHDR, os 8 bytes logo após a assinatura
       * + o campo de tamanho do chunk + "IHDR". Confere a proporção
       * (~12.3:1, uma faixa larga e baixa) sem precisar de biblioteca de
       * imagem — é exatamente a forma de um cabeçalho, não de uma
       * página inteira nem de um ícone quadrado. */
      const largura = bytes.readUInt32BE(16);
      const altura = bytes.readUInt32BE(20);
      const proporcao = altura ? largura / altura : 0;
      ok(
        "a proporção é de faixa larga (10 a 15 vezes mais larga que alta)",
        proporcao > 10 && proporcao < 15,
        largura + "x" + altura + " = " + proporcao.toFixed(2)
      );
    }
  }
}

/* 3. o módulo referencia o asset e tem a reserva para quando ele faltar */
const apacIndex = fs.readFileSync(path.join(RAIZ, "modules/apac/index.js"), "utf8");
ok(
  "o módulo lê MEEDS_APAC_CABECALHO_B64",
  apacIndex.includes("raiz.MEEDS_APAC_CABECALHO_B64")
);
ok(
  "gerarPdfInterno chama doc.addImage para o cabeçalho",
  /doc\.addImage\(CABECALHO_OFICIAL_PNG/.test(apacIndex)
);
ok(
  "existe reserva (desenho antigo) para se o asset não carregar",
  /if \(CABECALHO_OFICIAL_PNG\)/.test(apacIndex) && /\} else \{/.test(apacIndex)
);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
