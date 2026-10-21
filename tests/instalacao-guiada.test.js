"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const raiz = path.join(__dirname, '..');
const ctx = { window: {}, URLSearchParams };
vm.createContext(ctx);
for (const nome of ['conteudo', 'fluxo']) {
  vm.runInContext(fs.readFileSync(path.join(raiz, 'docs/instalar', nome + '.js'), 'utf8'), ctx);
}
const fluxo = ctx.window.MeedsInstalacaoFluxo;
const conteudo = ctx.window.MeedsInstalacaoConteudo;
let casos = 0;
function teste(nome, executar) { executar(); casos++; console.log('  ok ' + nome); }
teste('sugestão permite iPad desktop e dispositivo desconhecido', () => {
  assert.equal(fluxo.sugerir('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 5), 'ios');
  assert.equal(fluxo.sugerir('Android Chrome', 1), 'android');
  assert.equal(fluxo.sugerir('Windows NT', 0), 'computador');
  assert.equal(fluxo.sugerir('unknown', 0), null);
});
teste('estado adulterado, duplicado ou incompleto volta à escolha', () => {
  for (const hash of ['#plataforma=alien&etapa=<script>', '#plataforma=ios&plataforma=android',
    '#plataforma=%E0%A4%A', '#plataforma=computador&etapa=concluido', '#etapa=concluido']) {
    assert.equal(fluxo.lerEstado(hash).etapa, 'escolha');
  }
});
teste('URL de conclusão sempre exige confirmação novamente', () => {
  assert.equal(fluxo.lerEstado('#plataforma=ios&etapa=concluido').etapa, 'conferir');
  const estado = { plataforma: 'ios', navegador: null, etapa: 'conferir' };
  assert.equal(fluxo.transicionar(estado, { tipo: 'avancar' }).etapa, 'conferir');
  const fim = fluxo.transicionar(estado, { tipo: 'confirmar' });
  assert.equal(fim.etapa, 'concluido');
  assert.equal(fluxo.lerEstado(fluxo.serializarEstado(fim)).etapa, 'conferir');
  assert.equal(fluxo.transicionar(estado, { tipo: 'trocar' }).etapa, 'escolha');
});
for (const [plataforma, navegador] of [['computador','chrome'], ['computador','edge'],
  ['computador','firefox'], ['ios',null], ['android',null], ['computador','outro']]) {
  teste('ida, volta e restauração: ' + plataforma + '/' + navegador, () => {
    let estado = fluxo.transicionar({}, { tipo: 'escolher', plataforma, navegador });
    const passos = fluxo.passos(estado);
    assert.ok(passos.length);
    for (let i = 0; i < passos.length - 1; i++) {
      const anterior = estado.etapa;
      estado = fluxo.transicionar(estado, { tipo: 'avancar' });
      assert.equal(fluxo.transicionar(estado, { tipo: 'voltar' }).etapa, anterior);
      assert.equal(JSON.stringify(fluxo.lerEstado(fluxo.serializarEstado(estado))), JSON.stringify(estado));
    }
    if (navegador === 'outro') assert.equal(estado.etapa, 'alternativa');
    else assert.equal(estado.etapa, 'conferir');
  });
}
teste('variantes corretas e permissões específicas', () => {
  for (const [chave, passos] of Object.entries(conteudo.roteiros)) {
    const links = passos.flatMap(p => p.links || []).map(l => l.href);
    if (chave !== 'outro') {
      const raw = links.filter(l => l.includes('/releases/latest/download/'));
      assert.equal(raw.length, 1);
      assert.equal(raw[0].includes('.safari.user.js'), chave === 'ios');
    }
    assert.equal(passos.some(p => p.id === 'scripts'), ['chrome', 'edge'].includes(chave));
  }
  assert.match(JSON.stringify(conteudo.roteiros.android), /não validado em aparelho/);
  assert.match(JSON.stringify(conteudo.roteiros.android), /Chrome/);
});
teste('página tem alternativa sem JavaScript e recursos válidos em subdiretório', () => {
  const html = fs.readFileSync(path.join(raiz, 'docs/instalar/index.html'), 'utf8');
  assert.match(html, /Instale o Assistente Meeds/);
  assert.match(html, /id="resumo"/);
  assert.match(html, /GUIA-INSTALACAO.md/);
  assert.match(html, /GUIA-IPAD.md/);
  assert.match(html, /Assistente-Meeds-Instalacao.pdf/);
  assert.match(html, /aria-live="polite"/);
  for (const recurso of ['styles.css', 'conteudo.js', 'fluxo.js', 'app.js', '../manual/Assistente-Meeds-Instalacao.pdf']) {
    assert.ok(html.includes(recurso));
    assert.ok(new URL(recurso, 'https://example.test/meeds-suite/instalar/').pathname.startsWith('/meeds-suite/'));
  }
});
// DOM mínimo: eventos reais do controlador, sem simular regras do fluxo.
class Elemento {
  constructor(tag) { this.tagName = tag; this.children = []; this.attrs = {}; this.events = {}; this.hidden = false; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; this.textContent = ''; }
  setAttribute(k,v) { this.attrs[k] = v; }
  addEventListener(k,f) { this.events[k] = f; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  click() { return this.events.click && this.events.click(); }
}
function ambiente() {
  const ids = {};
  for (const id of ['pular','guia','titulo-etapa','progresso','conteudo-etapa','resumo','acoes','ajuda-etapa','ajuda-conteudo','trocar','trilha']) ids[id] = new Elemento('div');
  const doc = { getElementById: id => ids[id], createElement: tag => new Elemento(tag) };
  const win = { navigator: { userAgent:'Windows NT', maxTouchPoints:0 }, location: { hash:'', href:'https://example.test/meeds-suite/instalar/', pathname:'/meeds-suite/instalar/', search:'' },
    history: { pushState(_a,_b,url) { win.location.hash = url.startsWith('#') ? url : ''; } }, events:{}, addEventListener(k,f) { this.events[k] = f; } };
  Object.assign(win, ctx.window);
  const controle = { window:win, document:doc };
  vm.createContext(controle);
  vm.runInContext(fs.readFileSync(path.join(raiz,'docs/instalar/app.js'),'utf8'), controle);
  return { ids, doc, win };
}
function encontrar(el, texto) {
  if (el.attrs['aria-label'] === texto || el.textContent === texto) return el;
  for (const filho of el.children) { const achou = encontrar(filho,texto); if (achou) return achou; }
}
teste('controlador: seleção explícita, ajuda, confirmação e retorno da URL', () => {
  const {ids, win} = ambiente();
  assert.equal(win.location.hash, '');
  encontrar(ids['conteudo-etapa'],'Computador').click();
  encontrar(ids['conteudo-etapa'],'Chrome').click();
  assert.match(win.location.hash, /navegador=chrome/);
  assert.equal(ids['titulo-etapa'].textContent, 'Primeiro, instale o Tampermonkey');
  encontrar(ids.acoes,'Já instalei o Tampermonkey').click();
  encontrar(ids.acoes,'Já autorizei os scripts').click();
  const instalar = encontrar(ids['conteudo-etapa'],'Instalar o Assistente');
  instalar.click();
  assert.equal(ids['titulo-etapa'].textContent, 'Agora, instale o Assistente');
  encontrar(ids.acoes,'Já instalei o Assistente').click();
  encontrar(ids.acoes,'Ainda não').click();
  assert.equal(ids['ajuda-etapa'].open, true);
  encontrar(ids.acoes,'Sim, apareceu').click();
  assert.equal(ids['titulo-etapa'].textContent, 'Você confirmou que o Assistente apareceu');
  assert.match(win.location.hash, /etapa=conferir/);
  win.events.hashchange();
  assert.equal(ids['titulo-etapa'].textContent, 'Vamos conferir no Meeds?');
  ids.trocar.click();
  assert.equal(ids['titulo-etapa'].textContent, 'Onde você vai usar o Assistente?');
  win.location.hash = '#plataforma=<img>&etapa=concluido'; win.events.hashchange();
  assert.equal(ids['titulo-etapa'].textContent, 'Onde você vai usar o Assistente?');
});
teste('clipboard ausente oferece seleção manual, sem alegar cópia', () => {
  const {ids} = ambiente();
  encontrar(ids['conteudo-etapa'],'Computador').click();
  encontrar(ids['conteudo-etapa'],'Chrome').click();
  encontrar(ids.acoes,'Já instalei o Tampermonkey').click();
  encontrar(ids['conteudo-etapa'],'Copiar endereço').click();
  assert.ok(encontrar(ids['conteudo-etapa'],'Selecione e copie o endereço acima.'));
});
teste('atalho de teclado preserva uma etapa restaurada e foca seu título', () => {
  const {ids, win} = ambiente();
  win.location.hash = '#plataforma=computador&navegador=chrome&etapa=instalar';
  win.events.hashchange();
  const hash = win.location.hash;
  assert.equal(typeof ids.pular.events.click, 'function');
  let impedido = false;
  ids.pular.events.click({ preventDefault() { impedido = true; } });
  assert.ok(impedido);
  assert.equal(win.location.hash, hash);
  assert.equal(ids['titulo-etapa'].textContent, 'Agora, instale o Assistente');
  assert.ok(ids['titulo-etapa'].focused);
});
console.log(casos + ' grupos de testes passaram');
