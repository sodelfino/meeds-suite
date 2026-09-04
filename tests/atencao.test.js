/* ------------------------------------------------------------------
 * tests/atencao.test.js — core/atencao.js
 * ------------------------------------------------------------------
 * O que se prova aqui e o que o alarme antigo errava: um aviso que so
 * existe DENTRO da aba nao chega a quem esta no Memed, em outra janela
 * ou com o navegador minimizado — que e exatamente quando ele importa.
 *
 * Tres regras nao negociaveis, todas cobertas abaixo:
 *   1. notificacao SO com o medico fora da aba (dentro dela o banner ja
 *      grita, e o mesmo aviso duas vezes e fadiga de alarme);
 *   2. o titulo do Meeds tem que voltar exatamente como estava;
 *   3. nada disso pode quebrar num navegador que nao tem os recursos —
 *      o Safari do iPad nao tem notificacao fora de app instalado.
 * ------------------------------------------------------------------ */
const fs = require("fs");
const vm = require("vm");

let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}

/* DOM de mentira: so o que core/atencao.js toca. */
function ambiente(opcoes) {
  const o = opcoes || {};
  const ouvintes = {};
  const link = { rel: "icon", attrs: { href: "/favicon-do-meeds.png" },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    setAttribute(k, v) { this.attrs[k] = v; },
    removeAttribute(k) { delete this.attrs[k]; } };

  const doc = {
    title: o.titulo || "Meeds - Pronto Atendimento",
    visibilityState: o.visibilidade || "visible",
    hasFocus: () => (o.foco === undefined ? true : o.foco),
    querySelector: (sel) => (sel.indexOf("icon") !== -1 ? link : null),
    createElement: (tag) => {
      if (tag !== "canvas") return { rel: "", setAttribute() {}, getAttribute() { return null; } };
      return {
        width: 0, height: 0,
        getContext: () => ({
          fillStyle: "", font: "", textAlign: "", textBaseline: "",
          beginPath() {}, roundRect() {}, rect() {}, fill() {}, arc() {}, fillText() {},
        }),
        toDataURL: () => "data:image/png;base64,FAVICONE",
      };
    },
    addEventListener(ev, fn) { (ouvintes[ev] = ouvintes[ev] || []).push(fn); },
    removeEventListener(ev, fn) {
      ouvintes[ev] = (ouvintes[ev] || []).filter((f) => f !== fn);
    },
    head: {}, documentElement: {},
  };

  const notificacoes = [];
  const ctx = {
    console, setInterval, clearInterval, setTimeout, clearTimeout, Promise, Math, JSON, String, Date,
    document: doc,
    addEventListener(ev, fn) { (ouvintes[ev] = ouvintes[ev] || []).push(fn); },
    removeEventListener(ev, fn) { ouvintes[ev] = (ouvintes[ev] || []).filter((f) => f !== fn); },
    focus() { ctx._focado = true; },
    navigator: o.semWakeLock ? {} : {
      wakeLock: { request: () => Promise.resolve({ release() { ctx._travaSolta = true; }, addEventListener() {} }) },
    },
    _notificacoes: notificacoes,
    _link: link,
    _doc: doc,
  };

  if (!o.semNotificacao) {
    const N = function (titulo, opts) {
      notificacoes.push({ titulo, ...opts });
      this.close = () => {};
    };
    N.permission = o.permissao || "granted";
    N.requestPermission = () => Promise.resolve(o.aoPedir || "granted");
    ctx.Notification = N;
  }

  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("core/atencao.js", "utf8"), ctx);
  return ctx;
}

/* 1. onde esta a atencao: "visivel mas sem foco" e uma janela atras de
 *    outra — na pratica, fora. */
{
  ok("aba visivel e com foco = aqui", ambiente({}).MeedsSuiteAtencao.ondeEstaOMedico() === "aqui");
  ok("aba escondida = fora",
     ambiente({ visibilidade: "hidden" }).MeedsSuiteAtencao.ondeEstaOMedico() === "fora");
  ok("visivel mas sem foco = fora",
     ambiente({ foco: false }).MeedsSuiteAtencao.ondeEstaOMedico() === "fora");
}

/* 2. contador no titulo, e o titulo do Meeds de volta intacto */
{
  const c = ambiente({ titulo: "Meeds - Pronto Atendimento" });
  const A = c.MeedsSuiteAtencao;
  A.marcar({ contagem: 3 });
  ok("titulo ganha o contador", c._doc.title === "(3) Meeds - Pronto Atendimento", c._doc.title);
  A.marcar({ contagem: 5 });
  ok("contador nao empilha prefixo", c._doc.title === "(5) Meeds - Pronto Atendimento", c._doc.title);
  A.limpar();
  ok("titulo volta exatamente como estava", c._doc.title === "Meeds - Pronto Atendimento", c._doc.title);
}

/* 3. a SPA troca de tela com o contador ligado: o titulo novo e que vale,
 *    e o contador tem que sobreviver a troca. */
{
  const c = ambiente({ titulo: "Meeds - Pronto Atendimento" });
  const A = c.MeedsSuiteAtencao;
  A.marcar({ contagem: 2 });
  c._doc.title = "Meeds - Criar Prescrição";     // navegou
  A.marcar({ contagem: 2 });                      // proxima leitura da fila
  ok("contador sobrevive a navegacao da SPA",
     c._doc.title === "(2) Meeds - Criar Prescrição", c._doc.title);
  A.limpar();
  ok("e limpa devolvendo o titulo NOVO, nao o antigo",
     c._doc.title === "Meeds - Criar Prescrição", c._doc.title);
}

/* 4. favicone: desenha com contador e devolve o do Meeds */
{
  const c = ambiente({});
  const A = c.MeedsSuiteAtencao;
  A.marcar({ contagem: 1 });
  ok("favicone vira o contador", c._link.getAttribute("href").indexOf("data:image/png") === 0);
  A.limpar();
  ok("favicone do Meeds volta", c._link.getAttribute("href") === "/favicon-do-meeds.png");
}

/* 5. A REGRA PRINCIPAL: notificacao so com o medico fora da aba. */
{
  const dentro = ambiente({});
  dentro.MeedsSuiteAtencao.marcar({ contagem: 1, notificar: true, titulo: "Paciente na fila" });
  ok("dentro da aba NAO notifica (o banner ja avisa)", dentro._notificacoes.length === 0);

  const fora = ambiente({ visibilidade: "hidden" });
  fora.MeedsSuiteAtencao.marcar({ contagem: 2, notificar: true, titulo: "Paciente na fila", corpo: "2 aguardando" });
  ok("fora da aba notifica", fora._notificacoes.length === 1, JSON.stringify(fora._notificacoes[0]));
  ok("a notificacao diz o motivo", fora._notificacoes[0].body === "2 aguardando");
  ok("usa tag: substitui a anterior em vez de empilhar",
     !!fora._notificacoes[0].tag, fora._notificacoes[0].tag);
  ok("nao toca som proprio (o som e do modulo, com o volume do medico)",
     fora._notificacoes[0].silent === true);
}

/* 6. sem permissao, nao notifica — e nao explode */
{
  const c = ambiente({ visibilidade: "hidden", permissao: "denied" });
  c.MeedsSuiteAtencao.marcar({ contagem: 1, notificar: true });
  ok("permissao negada nao notifica", c._notificacoes.length === 0);
  ok("e o contador continua funcionando", c._doc.title.indexOf("(1)") === 0, c._doc.title);
}

/* 7. Safari do iPad: sem Notification. Nada pode quebrar. */
{
  const c = ambiente({ semNotificacao: true, semWakeLock: true, visibilidade: "hidden" });
  const A = c.MeedsSuiteAtencao;
  ok("declara que nao suporta notificacao", A.suportaNotificacao() === false);
  ok("declara que nao suporta tela acesa", A.suportaTelaAcesa() === false);
  ok("permissao vira 'indisponivel'", A.permissaoDeNotificacao() === "indisponivel");
  let quebrou = false;
  try {
    A.marcar({ contagem: 4, notificar: true, titulo: "x" });
    A.limpar();
  } catch (e) { quebrou = true; }
  ok("marcar/limpar nao quebram sem os recursos", !quebrou);
}

/* 8. pedir permissao devolve booleano, inclusive quando o medico recusa */
(async () => {
  const sim = ambiente({ permissao: "default", aoPedir: "granted" });
  const nao = ambiente({ permissao: "default", aoPedir: "denied" });
  ok("permissao concedida devolve true", (await sim.MeedsSuiteAtencao.pedirPermissaoDeNotificacao()) === true);
  ok("permissao recusada devolve false", (await nao.MeedsSuiteAtencao.pedirPermissaoDeNotificacao()) === false);

  console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
  process.exit(falhas ? 1 : 0);
})();
