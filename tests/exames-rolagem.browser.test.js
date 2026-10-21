/* Regressão de layout: npm run teste:exames-ui. Requer Chromium/Playwright. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");
const raiz = path.join(__dirname, "..");
const macae = require("../dados/exames.json").municipios["Macaé"];

async function main() {
  const servidor = http.createServer((req, res) => {
    const destino = path.resolve(raiz, "." + new URL(req.url, "http://localhost").pathname);
    if (!destino.startsWith(raiz + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(destino, (erro, bytes) => {
      if (erro) { res.writeHead(404).end(); return; }
      res.setHeader("Content-Type", destino.endsWith(".js") ? "text/javascript" : destino.endsWith(".json") ? "application/json" : "text/html");
      res.end(bytes);
    });
  });
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  let navegador;
  try {
    const executavel = process.env.CHROMIUM_PATH || (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
    navegador = await chromium.launch({ executablePath: executavel, headless: true });
    for (const tela of [
      { nome: "desktop", width: 1091, height: 895 },
      { nome: "janela pequena", width: 800, height: 600 },
      { nome: "celular", width: 390, height: 700, toque: true },
      { nome: "espaço equivalente a zoom de 200%", width: 546, height: 448, escala: 2 },
    ]) {
      const contexto = await navegador.newContext({
        viewport: { width: tela.width, height: tela.height },
        deviceScaleFactor: tela.escala || 1, hasTouch: !!tela.toque, isMobile: !!tela.toque,
      });
      const pagina = await contexto.newPage();
      // A cena de captura congela timers: usar o smoke interativo.
      await pagina.route("**/*", (rota) => new URL(rota.request().url()).hostname === "127.0.0.1" ? rota.continue() : rota.abort());
      await pagina.goto("http://127.0.0.1:" + servidor.address().port + "/tests/smoke.html");
      await pagina.locator("#btn-login").click();
      await pagina.getByRole("button", { name: "Agora não", exact: true }).click();
      await pagina.locator(".ms-btn").filter({ hasText: "Exames" }).click();
      await pagina.getByRole("button", { name: "Pular tutorial", exact: true }).click();
      await pagina.locator("#ex-municipio").selectOption("Macaé");
      const orientacoes = pagina.locator("#ex-obs");
      assert.strictEqual(await orientacoes.evaluate((e) => e.tagName), "DETAILS");
      assert.strictEqual(await orientacoes.evaluate((e) => e.open), false);
      const resumo = orientacoes.locator("summary");
      assert((await resumo.innerText()).includes("13"));
      await resumo.focus();
      await pagina.keyboard.press("Enter");
      assert.strictEqual(await orientacoes.evaluate((e) => e.open), true);
      for (const aviso of macae.observacoes) assert((await orientacoes.innerText()).includes(aviso));
      await pagina.locator("#ex-encaminhamentos-btn").click();
      assert.strictEqual(await pagina.locator("#ex-encaminhamentos-btn").getAttribute("aria-expanded"), "true");
      assert.strictEqual(await pagina.locator(".ex-enc-cartao").count(), 5);

      const medidas = await pagina.evaluate(() => {
        const s = document.querySelector("#meeds-suite-dock-host").shadowRoot;
        const r = s.querySelector(".ex-rolagem");
        const modal = s.querySelector(".ex-modal").getBoundingClientRect();
        return { altura: r.clientHeight, largura: r.clientWidth, larguraConteudo: r.scrollWidth,
          dentro: r.contains(s.querySelector("#ex-obs")), topo: modal.top, fundo: modal.bottom };
      });
      assert(medidas.dentro, "Orientações precisam rolar junto do conteúdo");
      assert(medidas.altura > tela.height * 0.35, tela.nome + ": área de consulta insuficiente");
      assert(medidas.larguraConteudo <= medidas.largura + 1, "Não deve haver rolagem horizontal");
      assert(medidas.topo >= 0 && medidas.fundo <= tela.height + 1);
      const buscaAntes = await pagina.locator("#ex-busca").boundingBox();
      const rolagem = pagina.locator(".ex-rolagem");
      await rolagem.evaluate((e) => { e.scrollTop = 0; });
      await rolagem.hover();
      if (tela.toque) {
        const caixa = await rolagem.boundingBox();
        const sessao = await contexto.newCDPSession(pagina);
        const x = caixa.x + caixa.width / 2;
        const y = caixa.y + caixa.height - 30;
        await sessao.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
        for (let i = 1; i <= 8; i++) {
          await sessao.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - i * 25 }] });
        }
        await sessao.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await sessao.detach();
      } else {
        await pagina.mouse.wheel(0, 600);
      }
      await pagina.waitForFunction(() => document.querySelector("#meeds-suite-dock-host").shadowRoot.querySelector(".ex-rolagem").scrollTop > 100);
      const buscaDepois = await pagina.locator("#ex-busca").boundingBox();
      assert.strictEqual(buscaAntes.y, buscaDepois.y, "Busca deve permanecer fixa");

      // Chegar ao último exame e carregar todas as páginas deve ser possível.
      for (let i = 0; i < 10 && await pagina.locator("#ex-mais").isVisible(); i++) await pagina.locator("#ex-mais").click();
      assert.strictEqual(await pagina.locator("#ex-lista .ex-item").count(), macae.exames.length);
      await pagina.locator("#ex-lista .ex-item").last().scrollIntoViewIfNeeded();
      const ultimo = await pagina.locator("#ex-lista .ex-item").last().boundingBox();
      assert(ultimo.y < tela.height && ultimo.y + ultimo.height > 0);
      await pagina.locator("#ex-busca").fill("mamografia");
      await pagina.waitForFunction(() => document.querySelector("#meeds-suite-dock-host").shadowRoot.querySelector("#ex-contagem").textContent.includes("que casam"));
      assert((await pagina.locator("#ex-lista").innerText()).includes("Ficha do SISCAN"));
      await pagina.locator("#ex-municipio").selectOption("Betim");
      assert.strictEqual(await orientacoes.evaluate((e) => e.open), false, "Troca de município recolhe as orientações");
      await contexto.close();
      console.log("ok: " + tela.nome + " — orientações, rolagem, busca fixa e último exame acessíveis");
    }
  } finally {
    if (navegador) await navegador.close();
    await new Promise((resolve) => servidor.close(resolve));
  }
}
main().catch((erro) => { console.error(erro); process.exitCode = 1; });
