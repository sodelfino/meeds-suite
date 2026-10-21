/* ------------------------------------------------------------------
 * core/atualizacao.js — "Verificar atualização" da aba Sobre
 * ------------------------------------------------------------------
 * O QUE FAZ
 * Consulta o arquivo `.meta.js` publicado (so o cabecalho, alguns
 * centenas de bytes), le o `@version` e compara com a versao em uso.
 * No Safari, consulta a API publica da release (CORS) em vez do .meta.js.
 * Se houver versao nova, devolve o endereco do `.user.js` para o medico
 * abrir — o Tampermonkey (ou o Userscripts, no iPad) mostra a tela de
 * atualizacao dele.
 *
 * O QUE NAO FAZ (de proposito)
 * Um userscript nao consegue se instalar sozinho, e baixar codigo e
 * executa-lo por conta propria violaria `carregamentoRemotoDeCodigo:
 * false`. Entao o botao CONSULTA e ABRE a tela de instalacao; quem
 * confirma e o medico. So le texto: nada e executado do que chega.
 *
 * CACHE
 * O GitHub pode manter metadados em cache por alguns minutos. A
 * consulta leva `?t=<agora>` para furar o cache do navegador; o do
 * proprio GitHub nao da para furar — por isso "acabei de publicar e
 * ainda nao aparece" pode levar alguns minutos. O link de instalacao
 * NAO leva query string: o Tampermonkey reconhece o `.user.js` pela
 * extensao.
 *
 * PRIVACIDADE: nenhum dado do medico ou de paciente trafega; e um GET
 * sem corpo e sem cookies, para o host do @updateURL ou a API publica do GitHub.
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  const PRAZO_MS = 10000;

  /* Tampermonkey = tem GM_getValue; Safari/Userscripts roda com @grant none. */
  function variante() {
    return typeof GM_getValue === "function" ? "tampermonkey" : "safari";
  }

  function extrairVersao(textoMeta) {
    const m = /\/\/\s*@version\s+([0-9]+(?:\.[0-9]+)*)/.exec(String(textoMeta || ""));
    return m ? m[1] : null;
  }

  function extrairVersaoRelease(texto) {
    try {
      const release = JSON.parse(texto);
      if (!release || release.draft || release.prerelease) return null;
      const m = /^v(\d+\.\d+\.\d+)$/.exec(release.tag_name || "");
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  }

  function nomes(v) {
    const base = v === "safari" ? "meeds-suite.safari" : "meeds-suite";
    return { meta: base + ".meta.js", instalar: base + ".user.js" };
  }

  function urlsDe(baseReleases, v) {
    const n = nomes(v);
    const base = String(baseReleases || "").replace(/\/+$/, "");
    let meta = base + "/" + n.meta;
    if (v === "safari") {
      // GitHub releases/download redireciona sem CORS. A API pública
      // informa somente a versão publicada, sem consultar o código do main.
      const repo = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/latest\/download$/.exec(base);
      meta = repo ? "https://api.github.com/repos/" + repo[1] + "/" + repo[2] + "/releases/latest" : null;
    }
    return { meta: meta, instalar: base + "/" + n.instalar };
  }

  /* GET de texto: GM_xmlhttpRequest quando existe (nao sofre CORS/CSP da
   * pagina do Meeds), fetch no resto. Prazo de 10 s nos dois caminhos. */
  function buscarTexto(url, ok, falha) {
    let encerrado = false;
    function fim(fn, arg) {
      if (encerrado) return;
      encerrado = true;
      fn(arg);
    }
    const relogio = setTimeout(function () {
      fim(falha, "tempo esgotado");
    }, PRAZO_MS);
    function com(fn, arg) {
      clearTimeout(relogio);
      fim(fn, arg);
    }

    if (typeof GM_xmlhttpRequest === "function") {
      try {
        GM_xmlhttpRequest({
          method: "GET",
          anonymous: true,
          url: url,
          timeout: PRAZO_MS,
          onload: function (r) {
            if (r.status >= 200 && r.status < 300) com(ok, r.responseText);
            else com(falha, "HTTP " + r.status);
          },
          onerror: function () {
            com(falha, "sem conexão");
          },
          ontimeout: function () {
            com(falha, "tempo esgotado");
          },
        });
        return;
      } catch (e) {
        /* cai para fetch */
      }
    }
    if (typeof raiz.fetch !== "function") {
      com(falha, "navegador sem fetch");
      return;
    }
    raiz
      .fetch(url, { cache: "no-store", credentials: "omit" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then(function (t) {
        com(ok, t);
      })
      .catch(function (e) {
        com(falha, (e && e.message) || "sem conexão");
      });
  }

  /* verificar({ versaoAtual, baseReleases, buscar?, variante? }, aoTerminar)
   * aoTerminar({ situacao, versaoAtual, versaoNova?, urlInstalar?, motivo? })
   * situacao: "atualizado" | "disponivel" | "mais-nova" | "erro"
   * "mais-nova" = o navegador tem versao MAIOR que a publicada (build de
   * teste local); nao e erro, mas nao ha o que instalar. */
  function verificar(opcoes, aoTerminar) {
    const v = opcoes.variante || variante();
    const urls = urlsDe(opcoes.baseReleases, v);
    const buscar = opcoes.buscar || buscarTexto;
    const atual = opcoes.versaoAtual;
    const comparar = raiz.MeedsSuiteNovidades && raiz.MeedsSuiteNovidades.compararVersoes;

    if (!opcoes.baseReleases || !urls.meta || !comparar) {
      aoTerminar({ situacao: "erro", versaoAtual: atual, motivo: "configuração incompleta" });
      return;
    }

    const sep = urls.meta.indexOf("?") === -1 ? "?" : "&";
    buscar(
      urls.meta + sep + "t=" + Date.now(),
      function (texto) {
        const nova = v === "safari" ? extrairVersaoRelease(texto) : extrairVersao(texto);
        if (!nova) {
          aoTerminar({ situacao: "erro", versaoAtual: atual, motivo: "resposta inesperada" });
          return;
        }
        const c = comparar(nova, atual);
        aoTerminar({
          situacao: c > 0 ? "disponivel" : c < 0 ? "mais-nova" : "atualizado",
          versaoAtual: atual,
          versaoNova: nova,
          urlInstalar: urls.instalar,
          variante: v,
        });
      },
      function (motivo) {
        aoTerminar({ situacao: "erro", versaoAtual: atual, motivo: motivo || "sem conexão" });
      }
    );
  }

  raiz.MeedsSuiteAtualizacao = {
    extrairVersao: extrairVersao,
    variante: variante,
    urlsDe: urlsDe,
    verificar: verificar,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
