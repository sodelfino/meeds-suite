#!/usr/bin/env node
/**
 * scripts/build.js — empacota bootloader + nucleo + modulos no
 * .user.js final que o medico instala.
 *
 * Por que empacotar em vez de carregar remoto: ver decisao D1 em
 * docs/ARQUITETURA.md. Em resumo, buscar e executar JavaScript remoto
 * dentro de uma pagina que exibe dado de paciente cria uma superficie de
 * execucao remota de codigo (quem controlar o repositorio, o CDN ou a
 * rede passa a executar codigo na sessao autenticada do medico). O que
 * PRECISA ser atualizavel sem redeploy sao DADOS — seletores de tela e a
 * lista de medicamentos — e esses continuam sendo buscados remotamente,
 * validados por formato, com fallback embutido.
 *
 * Uso:
 *   node scripts/build.js                # gera dist/meeds-suite.user.js
 *   node scripts/build.js --check        # so valida, nao escreve
 *
 * O que faz:
 *   1. le manifest.json (fonte de verdade de ordem e versoes);
 *   2. confere que todo arquivo declarado existe;
 *   3. confere as REGRAS DE ARQUITETURA (nenhum modulo com posicao
 *      hardcoded, nenhum modulo com hook proprio de rede) — o build
 *      FALHA se alguem violar, para a regra nao virar so documentacao;
 *   4. substitui os marcadores do bootloader e escreve o dist.
 */

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const MANIFEST = path.join(RAIZ, "manifest.json");
const BOOTLOADER = path.join(RAIZ, "bootloader.user.js");

const MARCADOR_NUCLEO = "/* __MEEDS_SUITE_NUCLEO__ */";
const MARCADOR_MODULOS = "/* __MEEDS_SUITE_MODULOS__ */";

const soChecar = process.argv.includes("--check");

function ler(rel) {
  const abs = path.join(RAIZ, rel);
  if (!fs.existsSync(abs)) throw new Error(`arquivo declarado no manifest nao existe: ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

/* ------------------------------------------------------------------
 * REGRAS DE ARQUITETURA VERIFICADAS AUTOMATICAMENTE
 * ------------------------------------------------------------------
 * Estas sao as duas regras dos criterios de aceite que dependem de
 * disciplina em cada modulo. Se ficarem so no README, o proximo modulo
 * as quebra em silencio — entao o build reprova.
 * ------------------------------------------------------------------ */
const REGRAS = [
  {
    nome: "posicao hardcoded (bottom/top/left/right em px)",
    // pega "bottom: 24px", "right:24px" etc. Permite inset:0 (overlay em
    // tela cheia) porque isso e ancoragem de modal, nao de botao — e de
    // qualquer forma o overlay vem pronto do dock do nucleo.
    regex: /(^|[^-\w])(bottom|top|left|right)\s*:\s*-?\d+(\.\d+)?(px|em|rem|vh|vw)/i,
  },
  {
    nome: "hook proprio de fetch/XHR",
    regex: /(XMLHttpRequest\.prototype\.(open|send)\s*=)|(\bwindow\.fetch\s*=)|(\braiz\.fetch\s*=)/,
  },
];

function verificarRegras(rel, conteudo) {
  const problemas = [];
  const linhas = conteudo.split("\n");
  for (const regra of REGRAS) {
    linhas.forEach((linha, i) => {
      // ignora linhas de comentario: os modulos EXPLICAM nos comentarios
      // que costumavam ter posicao fixa, e o texto nao e codigo.
      const semEspaco = linha.trim();
      if (semEspaco.startsWith("//") || semEspaco.startsWith("*") || semEspaco.startsWith("/*")) return;
      if (regra.regex.test(linha)) {
        problemas.push(`${rel}:${i + 1} — ${regra.nome}\n      ${semEspaco.slice(0, 120)}`);
      }
    });
  }
  return problemas;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  let bootloader = fs.readFileSync(BOOTLOADER, "utf8");

  if (!bootloader.includes(MARCADOR_NUCLEO) || !bootloader.includes(MARCADOR_MODULOS)) {
    throw new Error("bootloader.user.js perdeu um dos marcadores de injecao.");
  }

  /* --- nucleo --- */
  const pecasNucleo = manifest.nucleo.map((rel) => {
    const conteudo = ler(rel);
    return `/* ===== ${rel} ===== */\n${conteudo}`;
  });

  /* --- modulos (assets primeiro: o index usa a constante do asset) --- */
  const pecasModulos = [];
  const problemas = [];
  for (const mod of manifest.modulos) {
    for (const asset of mod.assets || []) {
      pecasModulos.push(`/* ===== ${asset} ===== */\n${ler(asset)}`);
    }
    const conteudo = ler(mod.arquivo);
    problemas.push(...verificarRegras(mod.arquivo, conteudo));
    pecasModulos.push(`/* ===== ${mod.arquivo} (v${mod.versao}) ===== */\n${conteudo}`);
  }

  if (problemas.length) {
    console.error("\nBUILD REPROVADO — regras de arquitetura violadas:\n");
    problemas.forEach((p) => console.error("  " + p));
    console.error(
      "\nModulo nao posiciona botao (use dock.registrarBotao) nem instala hook de rede\n" +
        "(use assinaturasRede / deps.network.assinar). Ver docs/ARQUITETURA.md.\n"
    );
    process.exit(1);
  }

  /* --- inventario embutido, para o painel exibir mesmo offline --- */
  const inventario =
    "var __inv = " +
    JSON.stringify(
      {
        versao: manifest.versao,
        modulos: manifest.modulos.map((m) => ({
          id: m.id,
          nome: m.nome,
          descricao: m.descricao,
          versao: m.versao,
          origem: m.origem,
        })),
      },
      null,
      2
    ) +
    ";\n  raiz.__MEEDS_SUITE_MANIFESTO__ = __inv;";

  /* ATENCAO: a substituicao usa FUNCAO, nao string.
   * String.prototype.replace interpreta padroes de dolar no texto de
   * substituicao ("$$" vira "$", "$&" vira o trecho casado). Com o texto
   * literal, todo `overlay.$$(...)` do nucleo virava `overlay.$(...)` no
   * bundle — o seletor de lista sobrescrevia o seletor unico e o painel
   * quebrava em runtime, com o codigo-fonte aparentemente correto.
   * Passar uma funcao desliga essa interpretacao. */
  const injetar = (texto) => () => texto;

  const saida = bootloader
    .replace(MARCADOR_NUCLEO, injetar(pecasNucleo.join("\n\n") + "\n\n  " + inventario))
    .replace(MARCADOR_MODULOS, injetar(pecasModulos.join("\n\n")))
    .replace(/@version\s+[\d.]+/, injetar(`@version      ${manifest.versao}`));

  if (soChecar) {
    console.log("OK — manifest coerente, regras de arquitetura respeitadas.");
    console.log(`   nucleo: ${manifest.nucleo.length} arquivo(s)`);
    console.log(`   modulos: ${manifest.modulos.map((m) => m.id).join(", ")}`);
    return;
  }

  const destino = path.join(RAIZ, manifest.saida);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, saida, "utf8");

  const kb = (Buffer.byteLength(saida, "utf8") / 1024).toFixed(0);
  console.log(`Gerado: ${manifest.saida} (${kb} KB)`);
  console.log(`  nucleo:  ${manifest.nucleo.length} arquivo(s)`);
  console.log(`  modulos: ${manifest.modulos.length} (${manifest.modulos.map((m) => m.id).join(", ")})`);
  console.log(`  versao:  ${manifest.versao}`);
  console.log("\nInstale/atualize dist/meeds-suite.user.js no Tampermonkey.");
}

try {
  main();
} catch (e) {
  console.error("BUILD FALHOU:", e.message);
  process.exit(1);
}
