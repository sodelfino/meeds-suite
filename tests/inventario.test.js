/* ------------------------------------------------------------------
 * tests/inventario.test.js
 * ------------------------------------------------------------------
 * Protege um defeito que ja aconteceu e que e caro justamente por ser
 * silencioso.
 *
 * O build nao embute o manifesto inteiro: ele PROJETA um subconjunto
 * (`inventario`, em scripts/build.js), porque campos como `arquivo` e
 * `requer` so servem ao build e nao ha razao para carrega-los no pacote
 * de 1 MB.
 *
 * O problema da lista fixa: um campo NOVO no manifesto e descartado
 * sem aviso. Foi o que aconteceu com `padraoHabilitado`. O manifesto
 * dizia que APAC e CID entram desligados; o nucleo lia o inventario; o
 * campo nao existia mais. Nenhum erro no console, build verde, e os
 * dois modulos subindo ligados — o efeito aparecia longe da causa.
 *
 * Este teste faz o caminho inverso: le o manifesto, separa os campos
 * que MUDAM COMPORTAMENTO e exige que cada um esteja no pacote gerado.
 * ------------------------------------------------------------------ */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(RAIZ, "manifest.json"), "utf8"));
const CAMINHO_PACOTE = path.join(RAIZ, manifest.saida);

let falhas = 0;
function ok(nome, cond, detalhe) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome);
  if (!cond) {
    falhas++;
    if (detalhe) console.log("         " + detalhe);
  }
}

if (!fs.existsSync(CAMINHO_PACOTE)) {
  console.log("  FALHA  o pacote nao existe: " + manifest.saida);
  console.log("         rode `npm run build` antes deste teste.");
  process.exit(1);
}

const pacote = fs.readFileSync(CAMINHO_PACOTE, "utf8");

/* O inventario embutido, recuperado do pacote. Extrair de dentro do
 * arquivo gerado — em vez de recalcular a partir do manifesto — e o que
 * torna o teste util: ele mede o que foi ENTREGUE, nao o que a gente
 * queria entregar. */
function inventarioDoPacote() {
  const marca = "raiz.__MEEDS_SUITE_MANIFESTO__ = __inv;";
  const fim = pacote.indexOf(marca);
  if (fim === -1) return null;
  const inicio = pacote.lastIndexOf("var __inv = ", fim);
  if (inicio === -1) return null;
  const bruto = pacote.slice(inicio + "var __inv = ".length, pacote.lastIndexOf(";", fim));
  try {
    return JSON.parse(bruto);
  } catch (e) {
    return null;
  }
}

const inv = inventarioDoPacote();
ok("o inventario embutido existe e e JSON valido", !!inv);
if (!inv) {
  console.log("\n1 FALHA(S)");
  process.exit(1);
}

ok("a versao do pacote e a do manifesto", inv.versao === manifest.versao,
   "manifesto " + manifest.versao + " x pacote " + inv.versao);

ok("todos os modulos do manifesto estao no inventario",
   inv.modulos.length === manifest.modulos.length,
   manifest.modulos.length + " no manifesto x " + inv.modulos.length + " no pacote");

/* Campos que mudam COMPORTAMENTO em runtime. Um campo daqui que se
 * perca na projecao vira bug silencioso — e e exatamente essa a lista
 * que precisa ser mantida junto com o build. Campos que so o build usa
 * (`arquivo`, `requer`, `prioridadeBotao`) NAO entram aqui de proposito. */
const CAMPOS_DE_COMPORTAMENTO = ["sempreAtivo", "padraoHabilitado", "motivoPadraoDesligado"];

CAMPOS_DE_COMPORTAMENTO.forEach(function (campo) {
  /* So exige o campo de quem o declarou: um modulo sem
   * `padraoHabilitado` esta correto — o padrao dele e "ligado". */
  const declaram = manifest.modulos.filter(function (m) {
    return m[campo] !== undefined;
  });
  if (!declaram.length) {
    console.log("  --     nenhum modulo declara " + campo + " (nada a verificar)");
    return;
  }
  const perdidos = declaram.filter(function (m) {
    const noPacote = inv.modulos.find(function (x) { return x.id === m.id; });
    return !noPacote || noPacote[campo] === undefined;
  });
  ok(campo + " chega ao pacote (" + declaram.length + " modulo(s) declaram)",
     perdidos.length === 0,
     perdidos.length ? "perdidos na projecao do build: " + perdidos.map(function (m) { return m.id; }).join(", ") : null);
});

/* O caso concreto que motivou o teste, escrito por extenso: se alguem
 * religar APAC ou CID no manifesto, este teste passa; se o campo se
 * perder no build, ele falha. */
["apac-itauna", "cid10"].forEach(function (id) {
  const noManifesto = manifest.modulos.find(function (m) { return m.id === id; });
  if (!noManifesto) {
    console.log("  --     " + id + " nao esta mais no manifesto (removido: ok)");
    return;
  }
  if (noManifesto.padraoHabilitado !== false) {
    console.log("  --     " + id + " voltou a entrar ligado por decisao de produto");
    return;
  }
  const noPacote = inv.modulos.find(function (x) { return x.id === id; });
  ok(id + " entra desligado tambem no pacote",
     noPacote && noPacote.padraoHabilitado === false);
  ok(id + " diz POR QUE esta desligado",
     !!(noPacote && noPacote.motivoPadraoDesligado && noPacote.motivoPadraoDesligado.length > 20),
     "sem o motivo, quem abrir a engrenagem em seis meses nao sabe se e proposito ou esquecimento");
});

/* `sempreAtivo` e `padraoHabilitado: false` se contradizem: um diz que
 * nao ha como desligar, o outro que entra desligado. Se os dois caissem
 * no mesmo modulo, o resultado dependeria da ordem em que
 * estaHabilitado() consulta cada um — o tipo de ambiguidade que so
 * aparece meses depois. Melhor falhar o build. */
const contraditorios = manifest.modulos.filter(function (m) {
  return m.sempreAtivo && m.padraoHabilitado === false;
});
ok("nenhum modulo e sempreAtivo E desligado por padrao",
   contraditorios.length === 0,
   contraditorios.map(function (m) { return m.id; }).join(", "));

/* A sonda mora fora do dist gerado justamente para o build nao a
 * apagar. Se um dia ela sumir do repositorio, o v2 perde a unica forma
 * de mapear o ambiente novo sem palpite. */
ok("a sonda de diagnostico continua no repositorio",
   fs.existsSync(path.join(RAIZ, "dist/sonda-meeds-v2.user.js")));

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
