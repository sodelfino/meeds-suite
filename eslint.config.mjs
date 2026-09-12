// Quality gates do meeds-suite. Tier unico e rapido: este projeto e JavaScript
// puro, entao nao existe tier type-aware (eslint.typed.config.mjs) nem
// resolucao de alias de TypeScript.
//
// Regras instaladas:
//   quality/max-lines        -> teto de 350 linhas por arquivo
//   quality/no-direct-console -> proibe console.* direto
//
// quality/no-direct-data-access NAO foi instalada: este repositorio e um
// userscript de navegador e nao tem modulo de cliente de banco/ORM. Nao ha
// fronteira real para policiar, e inventar uma seria ruido.
//
// O bloco import-x tambem foi removido: o codigo de browser e concatenado em
// IIFE por scripts/build.js e nao usa import/export, so require() de modulos
// nativos em scripts/ e tests/. Nao existem caminhos de import para restringir.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";

import quality from "./eslint-rules/index.cjs";

export default defineConfig([
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        // Navegador: o alvo real do codigo em core/ e modules/.
        console: "readonly",
        document: "readonly",
        window: "readonly",
        navigator: "readonly",
        location: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        fetch: "readonly",
        XMLHttpRequest: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Blob: "readonly",
        File: "readonly",
        FileReader: "readonly",
        FormData: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
        AbortController: "readonly",
        MutationObserver: "readonly",
        IntersectionObserver: "readonly",
        ResizeObserver: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
        Audio: "readonly",
        AudioContext: "readonly",
        Image: "readonly",
        DOMParser: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        btoa: "readonly",
        atob: "readonly",
        alert: "readonly",
        confirm: "readonly",
        prompt: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        queueMicrotask: "readonly",
        structuredClone: "readonly",
        crypto: "readonly",
        indexedDB: "readonly",
        performance: "readonly",
        MouseEvent: "readonly",
        getComputedStyle: "readonly",
        MediaRecorder: "readonly",
        // APIs de userscript (Tampermonkey/Violentmonkey).
        GM: "readonly",
        GM_info: "readonly",
        GM_getValue: "readonly",
        GM_setValue: "readonly",
        GM_deleteValue: "readonly",
        GM_listValues: "readonly",
        GM_addStyle: "readonly",
        GM_xmlhttpRequest: "readonly",
        GM_setClipboard: "readonly",
        GM_notification: "readonly",
        GM_openInTab: "readonly",
        GM_registerMenuCommand: "readonly",
        GM_download: "readonly",
        unsafeWindow: "readonly",
        // Globais do proprio pacote: o bootloader publica o nucleo em
        // window.MeedsSuite e cada modulo se registra nele.
        MeedsSuite: "readonly",
        // Bibliotecas carregadas via @require no cabecalho do userscript.
        jspdf: "readonly",
        html2canvas: "readonly",
        XLSX: "readonly",
        JSZip: "readonly",
      },
    },
  },
  js.configs.recommended,

  {
    files: ["**/*.js"],
    plugins: { quality },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Baseline 12/09/2026: 1424 violacoes. O codigo antecede o gate --
      // fica em "warn" ate zerar (`npm run lint:fix` resolve a maioria).
      "no-var": "warn",
      // Baseline 12/09/2026: 2 violacoes.
      "prefer-const": "warn",
      // Baseline 12/09/2026: 101 violacoes; 83 delas eram `catch (e)` com o
      // `e` nao usado -- estilo idiomatico e consistente em 30 arquivos deste
      // repo, nao codigo morto. `caughtErrors: "none"` desliga SO esse caso;
      // variavel e argumento nao usados continuam reportados. Sem isso o
      // sinal real (18 casos) se perde em 83 linhas de ruido, e ruido que
      // ninguem le e o que faz alguem desligar o gate.
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
      // Baseline 12/09/2026: 1 violacao.
      "no-constant-condition": "warn",
      // Orcamento de tamanho e complexidade: conversa sobre fatoracao, nao
      // gate. Promova um destes para "error" quando a contagem chegar a zero.
      complexity: ["warn", 12],
      "max-depth": ["warn", 4],
      "max-statements": ["warn", 20],
      "max-params": ["warn", 4],
      "max-lines-per-function": [
        "warn",
        { max: 150, skipBlankLines: true, skipComments: true },
      ],
      "max-nested-callbacks": ["warn", 3],
      // Baseline medida em 12/09/2026: 11 arquivos acima de 350 linhas.
      // Fica em "warn" ate a lista zerar; entao volta para "error".
      "quality/max-lines": ["warn", { max: 350 }],
      // Baseline medida em 12/09/2026: 60 chamadas console.* diretas.
      // Este projeto ainda nao tem adaptador de log -- quando tiver, aponte a
      // mensagem para ele, adicione um bloco "off" DEPOIS deste para o proprio
      // adaptador, e promova a regra para "error".
      "quality/no-direct-console": [
        "warn",
        { logger: "um adaptador de log do MeedsSuite (ainda nao existe)" },
      ],
    },
  },
  {
    // Scripts de build/sync e testes rodam em Node, nao no navegador.
    files: ["scripts/**/*.js", "tests/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        module: "readonly",
        require: "readonly",
        exports: "writable",
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        global: "readonly",
        setImmediate: "readonly",
        queueMicrotask: "readonly",
      },
    },
  },
  {
    // Mesmo orcamento de tamanho para os testes, em "warn". Depois do bloco
    // que liga a regra: para um arquivo casado pelos dois, o flat config
    // aplica o bloco posterior por ultimo.
    files: ["tests/**/*.js", "**/*.test.js"],
    plugins: { quality },
    rules: {
      "quality/max-lines": ["warn", { max: 350, includeTests: true }],
      // Estas tres disparam em massa na estrutura dos testes sem apontar
      // problema real.
      "max-statements": "off",
      "max-lines-per-function": "off",
      "max-nested-callbacks": "off",
    },
  },
  {
    // Scripts de build/sync sao ferramentas de linha de comando: logar no
    // stdout e a interface deles, nao um vazamento de console de producao.
    files: ["scripts/**/*.js", "tests/**/*.js"],
    rules: {
      "quality/no-direct-console": "off",
    },
  },
  {
    // Este proprio config e o verify.mjs sao ESM; sem este bloco o parser
    // default (sourceType: "script") reporta erro de parse no `import`.
    files: ["**/*.mjs"],
    languageOptions: { sourceType: "module" },
  },
  {
    files: ["eslint-rules/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "readonly", require: "readonly" },
    },
  },
  globalIgnores([
    ".claude/**",
    "node_modules/**",
    // dist/ e saida do scripts/build.js -- codigo concatenado, nao autorado.
    "dist/**",
    "exports/**",
    "dados/**",
    "build/**",
    "coverage/**",
    "package-lock.json",
  ]),
]);
