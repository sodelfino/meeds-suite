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

  /* O modelo nao entra no pacote (nao esta no manifest), mas e verificado
   * do mesmo jeito: um template com posicao hardcoded ensinaria o erro
   * para todo modulo criado a partir dele. */
  const CAMINHO_TEMPLATE = "modules/_template/index.js";
  if (fs.existsSync(path.join(RAIZ, CAMINHO_TEMPLATE))) {
    problemas.push(...verificarRegras(CAMINHO_TEMPLATE, ler(CAMINHO_TEMPLATE)));
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

  /* --- dados dos formularios ---
   * dados/formularios.json e injetado no pacote, nao buscado em runtime:
   * ele precisa estar disponivel no instante em que o modulo monta o
   * formulario, e uma busca de rede ali deixaria a tela meio pronta.
   * Editar o JSON + npm run build e o fluxo documentado no manual do
   * administrador. */
  const CAMINHO_DADOS = "dados/formularios.json";
  let injecaoDados = "";
  if (fs.existsSync(path.join(RAIZ, CAMINHO_DADOS))) {
    const dados = JSON.parse(ler(CAMINHO_DADOS)); // falha o build se o JSON estiver quebrado
    injecaoDados =
      "\n  /* ===== " + CAMINHO_DADOS + " ===== */\n  raiz.MEEDS_DADOS_FORMULARIOS = " +
      JSON.stringify(dados) + ";\n";
  } else {
    console.warn("AVISO: " + CAMINHO_DADOS + " nao encontrado — os formularios vao subir sem catalogo.");
  }

  /* --- tabela de marcas (tradutor marca -> principio ativo) ---
   * Vai embutida: e pequena e precisa estar disponivel no instante em que
   * o medico digita. Nao e fonte de medicamento — ver a regra de ouro em
   * docs/ARQUITETURA.md. */
  const CAMINHO_MARCAS = "dados/marcas-medicamentos.json";
  let injecaoMarcas = "";
  if (fs.existsSync(path.join(RAIZ, CAMINHO_MARCAS))) {
    const mk = JSON.parse(ler(CAMINHO_MARCAS));
    if (!Array.isArray(mk.marcas)) throw new Error(`${CAMINHO_MARCAS} precisa ter uma lista "marcas"`);
    const invalidas = mk.marcas.filter((m) => !m.marca || !m.principioAtivo);
    if (invalidas.length) {
      throw new Error(
        `${CAMINHO_MARCAS}: ${invalidas.length} entrada(s) sem "marca" ou sem "principioAtivo"`
      );
    }
    injecaoMarcas =
      "\n  /* ===== " + CAMINHO_MARCAS + " ===== */\n  raiz.MEEDS_MARCAS = " +
      JSON.stringify(mk) + ";\n";
  }

  /* --- changelog ---
   * Vai embutido, e nao buscado em runtime: a notificacao de atualizacao
   * tem que funcionar mesmo sem internet, e o arquivo e pequeno. Ele e a
   * UNICA fonte tanto do aviso quanto do historico no painel. */
  const CAMINHO_CHANGELOG = "dados/changelog.json";
  let injecaoChangelog = "";
  if (fs.existsSync(path.join(RAIZ, CAMINHO_CHANGELOG))) {
    const cl = JSON.parse(ler(CAMINHO_CHANGELOG)); // JSON quebrado falha o build
    if (!Array.isArray(cl.versoes)) throw new Error(`${CAMINHO_CHANGELOG} precisa ter uma lista "versoes"`);
    if (cl.versoes.length && cl.versoes[0].versao !== manifest.versao) {
      console.warn(
        `AVISO: a versao do manifest e ${manifest.versao}, mas o topo do changelog e ` +
          `${cl.versoes[0].versao}. Quem atualizar nao vera o que mudou. ` +
          `Acrescente o bloco da versao ${manifest.versao} em dados/changelog.json.`
      );
    }
    injecaoChangelog =
      "\n  /* ===== " + CAMINHO_CHANGELOG + " ===== */\n  raiz.MEEDS_CHANGELOG = " +
      JSON.stringify(cl) + ";\n";
  }

  /* --- inventario embutido, para o painel exibir mesmo offline --- */
  const inventario =
    "var __inv = " +
    JSON.stringify(
      {
        versao: manifest.versao,
        contato: manifest.contato || null,
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
    .replace(MARCADOR_NUCLEO, injetar(pecasNucleo.join("\n\n") + "\n" + injecaoDados + injecaoMarcas + injecaoChangelog + "\n  " + inventario))
    .replace(MARCADOR_MODULOS, injetar(pecasModulos.join("\n\n")))
    .replace(/@version\s+[\d.]+/, injetar(`@version      ${manifest.versao}`))
    .replace("__VERSAO__", injetar(manifest.versao));

  /* A versao aparece em tres lugares alem do metadata: o nucleo (para o
   * painel e a deteccao de atualizacao), o bootloader e o package.json.
   * Todos saem do manifest — e por isso que o admin so mexe em um. */
  const saidaComVersao = saida.split("__MEEDS_VERSAO__").join(manifest.versao);

  const pkgPath = path.join(RAIZ, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (pkg.version !== manifest.versao) {
      pkg.version = manifest.versao;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
      console.log(`  package.json sincronizado para ${manifest.versao}`);
    }
  }

  if (soChecar) {
    console.log("OK — manifest coerente, regras de arquitetura respeitadas.");
    console.log(`   nucleo: ${manifest.nucleo.length} arquivo(s)`);
    console.log(`   modulos: ${manifest.modulos.map((m) => m.id).join(", ")}`);
    return;
  }

  /* ------------------------------------------------------------------
   * VARIANTE PARA SAFARI / iPad (extensao "Userscripts", de quoid)
   * ------------------------------------------------------------------
   * Mesmo codigo, outro cabecalho. Duas restricoes da extensao mandam
   * nisso, e as duas foram conferidas na documentacao dela:
   *
   * 1. "When using API methods, it's only possible to inject into the
   *    content script scope." Ou seja: pedir QUALQUER @grant de GM joga
   *    o script para o escopo isolado, onde o `window` nao e o da
   *    pagina. Ali o hub de rede nao enxergaria as chamadas do Meeds — o
   *    alarme de fila, a captura do paciente na APAC e a deteccao de
   *    municipio do REMUME ficariam cegos. Por isso a variante usa
   *    `@grant none` e `@inject-into page`.
   *
   * 2. As APIs de GM da extensao sao ASSINCRONAS (GM.setValue devolve
   *    Promise) e nao existem na forma sincrona GM_setValue. Como o
   *    nucleo ja cai para localStorage quando o GM nao esta disponivel,
   *    nada quebra — muda so a durabilidade, o que esta documentado no
   *    guia de instalacao.
   *
   * O @require continua valendo: e a extensao que busca jsPDF e pdf-lib
   * na instalacao, nao a pagina em tempo de execucao.
   * ------------------------------------------------------------------ */
  const VARIANTE_SAFARI = "dist/meeds-suite.safari.user.js";

  function cabecalhoSafari(texto) {
    const fim = texto.indexOf("// ==/UserScript==");
    let meta = texto.slice(0, fim);
    const resto = texto.slice(fim);

    meta = meta
      /* O @name vira o NOME DO ARQUIVO no app Userscripts — a documentacao
       * dele diz isso com todas as letras. Entao aqui nao pode haver "/"
       * nem ":": os dois sao proibidos em nome de arquivo no iOS, e o
       * script simplesmente nao e salvo. O credito com dois-pontos
       * continua aparecendo na tela, no painel "Sobre"; so o nome do
       * arquivo e que precisa ser sobrio. */
      .replace(/\/\/ @name\s+.*\n/, `// @name         ${manifest.nome} para iPad - por ${manifest.autor}\n`)
      .replace(/\/\/ @namespace\s+.*\n/, "// @namespace    novetech-meeds-suite-safari\n")
      /* Sai todo @grant e entra `none`: e o que mantem o script no escopo
       * da pagina, onde o hub de rede funciona. */
      .replace(/\/\/ @grant\s+.*\n/g, "")
      .replace(/(\/\/ @connect\s+.*\n)+/g, "")
      .replace(
        /(\/\/ @run-at\s+.*\n)/,
        "// @grant        none\n// @inject-into page\n$1"
      )
      /* A documentacao do Userscripts e explicita: o @updateURL deve
       * terminar em .meta.js, e o @downloadURL em .user.js. Apontar os
       * dois para o mesmo arquivo faz o app baixar 1 MB so para conferir
       * a versao — e, pior, a checagem pode nem funcionar. */
      .replace(
        /\/\/ @updateURL\s+.*\n/,
        `// @updateURL    ${manifest.baseRaw}/${VARIANTE_SAFARI.replace(".user.js", ".meta.js")}\n`
      )
      .replace(
        /\/\/ @downloadURL\s+.*\n/,
        `// @downloadURL  ${manifest.baseRaw}/${VARIANTE_SAFARI}\n`
      );

    return meta + resto;
  }

  const conteudoSafari = cabecalhoSafari(saidaComVersao);
  const destinoSafari = path.join(RAIZ, VARIANTE_SAFARI);
  fs.mkdirSync(path.dirname(destinoSafari), { recursive: true });
  fs.writeFileSync(destinoSafari, conteudoSafari, "utf8");

  /* O .meta.js e so o bloco de metadados: e o que o gerenciador baixa
   * para saber se ha versao nova, sem puxar o pacote inteiro. */
  function soMetadados(texto) {
    const fim = texto.indexOf("// ==/UserScript==");
    return texto.slice(0, fim) + "// ==/UserScript==\n";
  }
  fs.writeFileSync(
    path.join(RAIZ, VARIANTE_SAFARI.replace(".user.js", ".meta.js")),
    soMetadados(conteudoSafari),
    "utf8"
  );
  fs.writeFileSync(
    path.join(RAIZ, manifest.saida.replace(".user.js", ".meta.js")),
    soMetadados(saidaComVersao),
    "utf8"
  );

  const destino = path.join(RAIZ, manifest.saida);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, saidaComVersao, "utf8");

  const kb = (Buffer.byteLength(saidaComVersao, "utf8") / 1024).toFixed(0);
  console.log(`Gerado: ${manifest.saida} (${kb} KB)`);
  console.log(`  nucleo:  ${manifest.nucleo.length} arquivo(s)`);
  console.log(`  modulos: ${manifest.modulos.length} (${manifest.modulos.map((m) => m.id).join(", ")})`);
  console.log(`  versao:  ${manifest.versao}`);
  if (injecaoMarcas) {
    console.log(`  marcas:  ${JSON.parse(ler(CAMINHO_MARCAS)).marcas.length} nome(s) comercial(is)`);
  }
  if (injecaoDados) {
    const d = JSON.parse(ler(CAMINHO_DADOS));
    const resumo = Object.keys(d)
      .filter((k) => !k.startsWith("_"))
      .map((k) => {
        const f = d[k];
        const partes = [];
        if (f.origens) partes.push(f.origens.length + " unidade(s)");
        if (f.procedimentos) partes.push(Object.keys(f.procedimentos).length + " procedimento(s)");
        if (f.cids) partes.push(Object.keys(f.cids).length + " CID(s)");
        return `           ${k}: ${partes.join(", ")}`;
      });
    console.log(`  dados:   ${CAMINHO_DADOS}`);
    resumo.forEach((l) => console.log(l));
  }
  const kbSafari = (fs.statSync(destinoSafari).size / 1024).toFixed(0);
  console.log(`  safari:  ${VARIANTE_SAFARI} (${kbSafari} KB) — @grant none, @inject-into page`);
  console.log("\nTampermonkey (Windows/Mac/Android): dist/meeds-suite.user.js");
  console.log("Safari no iPad/iPhone/Mac (app Userscripts): " + VARIANTE_SAFARI);
}

try {
  main();
} catch (e) {
  console.error("BUILD FALHOU:", e.message);
  process.exit(1);
}
