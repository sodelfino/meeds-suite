/* ------------------------------------------------------------------
 * tests/noturno.test.js — core/noturno.js
 * ------------------------------------------------------------------
 * Botão discreto em ⚙️ → Sobre que evita o logout por inatividade
 * despachando "mousemove"/"scroll" sintéticos a cada 30 min. Enfraquece
 * um controle de segurança de propósito — por isso o que este teste
 * garante é justamente o que limita o risco:
 *   - vem DESLIGADO por padrão, sempre;
 *   - só liga quando alguém pede (alternar), nunca sozinho;
 *   - a preferência sobrevive a reiniciar o núcleo (iniciar() lê o que
 *     foi salvo), então ligar uma vez no plantão não precisa repetir;
 *   - o temporizador é exatamente 30 min, nem mais liberal nem mais
 *     agressivo do que o pedido;
 *   - nada do que ele despacha carrega dado nenhum (os eventos não tem
 *     payload — não ha o que verificar de conteudo, so de tipo/alvo).
 * ------------------------------------------------------------------ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs !== undefined ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}

const RAIZ = path.join(__dirname, "..");

/* DOM/relogio de mentira: so o que core/noturno.js toca. setInterval de
 * mentira guarda a funcao e o atraso, para o teste disparar na hora que
 * quiser em vez de esperar 30 min de verdade. */
function carregar(opcoes) {
  const o = opcoes || {};
  const armazenado = o.armazenadoInicial ? Object.assign({}, o.armazenadoInicial) : {};
  const eventosDespachados = [];
  const timers = [];

  const doc = {
    dispatchEvent: function (ev) {
      eventosDespachados.push({ alvo: "document", tipo: ev.type, detalhe: ev });
      return true;
    },
  };

  const ctx = {
    console: { debug() {}, warn() {}, log() {} },
    Math, JSON, Object, Array, String,
    MouseEvent: function (tipo, opts) {
      this.type = tipo;
      Object.assign(this, opts || {});
    },
    Event: function (tipo, opts) {
      this.type = tipo;
      Object.assign(this, opts || {});
    },
    document: o.semDocument ? undefined : doc,
    innerWidth: 1024,
    innerHeight: 768,
    setInterval: function (fn, atraso) {
      const id = timers.length + 1;
      timers.push({ id, fn, atraso });
      return id;
    },
    clearInterval: function (id) {
      const i = timers.findIndex((t) => t.id === id);
      if (i !== -1) timers.splice(i, 1);
    },
    dispatchEvent: function (ev) {
      eventosDespachados.push({ alvo: "window", tipo: ev.type, detalhe: ev });
      return true;
    },
    MeedsSuiteStorage: o.semStorage
      ? undefined
      : {
          storageDoNucleo: function () {
            return {
              ler: function (nome, padrao) {
                return Object.prototype.hasOwnProperty.call(armazenado, nome) ? armazenado[nome] : padrao;
              },
              gravar: function (nome, valor) {
                armazenado[nome] = valor;
              },
            };
          },
        },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "core/noturno.js"), "utf8"), ctx);
  return { Noturno: ctx.MeedsSuiteNoturno, armazenado, eventosDespachados, timers };
}

/* 1. sem nunca chamar iniciar(): estaLigado() e false (padrao seguro) */
{
  const { Noturno } = carregar();
  ok("sem storage/iniciar, estaLigado e false", Noturno.estaLigado() === false);
}

/* 2. iniciar() sem preferencia salva: fica desligado, nenhum timer */
{
  const { Noturno, timers } = carregar();
  Noturno.iniciar();
  ok("primeira vez (nada salvo): fica desligado", Noturno.estaLigado() === false);
  ok("e nenhum temporizador foi criado", timers.length === 0);
}

/* 3. alternar() liga, grava, e cria o temporizador de 30 min */
{
  const { Noturno, armazenado, timers } = carregar();
  Noturno.iniciar();
  const novoEstado = Noturno.alternar();
  ok("alternar() devolve o novo estado (true)", novoEstado === true);
  ok("estaLigado() reflete o novo estado", Noturno.estaLigado() === true);
  ok("a preferencia foi gravada no storage do nucleo", armazenado.noturno_ativo === true);
  ok("criou exatamente um temporizador", timers.length === 1);
  ok("o temporizador e de 30 minutos, nem mais nem menos", timers[0].atraso === 30 * 60 * 1000);
}

/* 4. alternar() de novo desliga e limpa o temporizador */
{
  const { Noturno, armazenado, timers } = carregar();
  Noturno.iniciar();
  Noturno.alternar(); // liga
  const desligou = Noturno.alternar(); // desliga
  ok("segundo alternar() devolve false", desligou === false);
  ok("a preferencia gravada agora e false", armazenado.noturno_ativo === false);
  ok("o temporizador foi removido ao desligar", timers.length === 0);
}

/* 5. preferencia sobrevive a reiniciar o nucleo — liga uma vez no
 *    plantao, nao precisa religar a cada carregamento da pagina */
{
  const primeira = carregar();
  primeira.Noturno.iniciar();
  primeira.Noturno.alternar(); // liga e grava no "storage"

  const segunda = carregar({ armazenadoInicial: primeira.armazenado });
  segunda.Noturno.iniciar();
  ok("depois de reiniciar, volta ligado sozinho", segunda.Noturno.estaLigado() === true);
  ok("e o temporizador volta a existir sem precisar clicar de novo", segunda.timers.length === 1);
}

/* 6. o que de fato e despachado, quando o temporizador dispara */
{
  const { Noturno, timers, eventosDespachados } = carregar();
  Noturno.iniciar();
  Noturno.alternar(); // liga
  ok("um temporizador foi armado", timers.length === 1);

  timers[0].fn(); // simula os 30 minutos passando

  const tipos = eventosDespachados.map((e) => e.alvo + ":" + e.tipo);
  ok(
    "disparou mousemove e scroll no document, e scroll na window — nada mais",
    tipos.length === 3 &&
      tipos.indexOf("document:mousemove") !== -1 &&
      tipos.indexOf("document:scroll") !== -1 &&
      tipos.indexOf("window:scroll") !== -1,
    tipos.join(", ")
  );

  const eventosDeTeclado = eventosDespachados.filter((e) => /key|click|mousedown/i.test(e.tipo));
  ok(
    "NUNCA simula tecla, clique nem mousedown — so poderia disparar acao real do Meeds",
    eventosDeTeclado.length === 0
  );
}

/* 7. sem MeedsSuiteStorage (nao deveria acontecer, mas nao pode quebrar
 *    o resto do nucleo se acontecer) */
{
  const { Noturno } = carregar({ semStorage: true });
  let quebrou = false;
  try {
    Noturno.iniciar();
    Noturno.alternar();
  } catch (e) {
    quebrou = true;
  }
  ok("sem MeedsSuiteStorage, iniciar()/alternar() nao lancam excecao", !quebrou);
}

/* 8. sem document (cenario improvavel, mas simularAtividade nao pode
 *    lancar excecao e travar o temporizador do nucleo) */
{
  const { Noturno, timers } = carregar({ semDocument: true });
  Noturno.iniciar();
  Noturno.alternar();
  let quebrou = false;
  try {
    timers[0].fn();
  } catch (e) {
    quebrou = true;
  }
  ok("sem document, o disparo do temporizador nao lanca excecao", !quebrou);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
