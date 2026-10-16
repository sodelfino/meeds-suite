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
      const raw = links.filter(l => l.includes('raw.githubusercontent.com'));
      assert.equal(raw.length, 1);
      assert.equal(raw[0].includes('.safari.user.js'), chave === 'ios');
    }
    assert.equal(passos.some(p => p.id === 'scripts'), ['chrome', 'edge'].includes(chave));
  }
  assert.match(JSON.stringify(conteudo.roteiros.android), /não validado em aparelho/);
  assert.match(JSON.stringify(conteudo.roteiros.android), /Chrome/);
});
console.log(casos + ' grupos de testes passaram');
