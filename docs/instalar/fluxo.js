/* Regras puras de navegação; conclusão não é persistida nem inferida por links. */
(function (raiz) {
  'use strict';
  const vazio = () => ({ plataforma: null, navegador: null, etapa: 'escolha' });
  function chave(estado) {
    if (estado.plataforma === 'ios' || estado.plataforma === 'android') return estado.plataforma;
    if (estado.plataforma === 'computador' && ['chrome', 'edge', 'firefox', 'outro'].includes(estado.navegador)) return estado.navegador;
    return null;
  }
  function passos(estado) { return raiz.MeedsInstalacaoConteudo.roteiros[chave(estado)] || []; }
  function sugerir(ua, toque) {
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && toque > 1)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    if (/Windows|Macintosh|X11|Linux/i.test(ua)) return 'computador';
    return null;
  }
  function normalizar(estado) {
    if (!chave(estado)) return vazio();
    const resultado = { plataforma: estado.plataforma,
      navegador: estado.plataforma === 'computador' ? estado.navegador : null, etapa: estado.etapa };
    if (resultado.etapa === 'concluido') resultado.etapa = 'conferir';
    return passos(resultado).some(p => p.id === resultado.etapa) ? resultado : vazio();
  }
  function lerEstado(hash) {
    try {
      const texto = hash.replace(/^#/, '');
      decodeURIComponent(texto);
      const params = new URLSearchParams(texto);
      if (Array.from(params.keys()).some(k => !['plataforma', 'navegador', 'etapa'].includes(k) || params.getAll(k).length !== 1)) return vazio();
      return normalizar({ plataforma: params.get('plataforma'), navegador: params.get('navegador'), etapa: params.get('etapa') });
    } catch (_) { return vazio(); }
  }
  function serializarEstado(estado) {
    const seguro = normalizar(estado);
    if (!seguro.plataforma) return '';
    const params = new URLSearchParams();
    params.set('plataforma', seguro.plataforma);
    if (seguro.navegador) params.set('navegador', seguro.navegador);
    params.set('etapa', seguro.etapa);
    return '#' + params.toString();
  }
  function transicionar(estado, acao) {
    if (acao.tipo === 'trocar') return vazio();
    if (acao.tipo === 'escolher') {
      const novo = { plataforma: acao.plataforma, navegador: acao.navegador || null };
      const lista = passos(novo);
      return lista.length ? normalizar(Object.assign(novo, { etapa: lista[0].id })) : vazio();
    }
    const atual = normalizar(estado);
    const lista = passos(atual);
    const indice = lista.findIndex(p => p.id === atual.etapa);
    if (acao.tipo === 'confirmar' && atual.etapa === 'conferir') return Object.assign({}, atual, { etapa: 'concluido' });
    if (acao.tipo === 'voltar') {
      if (estado.etapa === 'concluido') return atual;
      return indice > 0 ? Object.assign({}, atual, { etapa: lista[indice - 1].id }) : vazio();
    }
    if (acao.tipo === 'avancar' && indice >= 0 && indice < lista.length - 1) return Object.assign({}, atual, { etapa: lista[indice + 1].id });
    return atual;
  }
  raiz.MeedsInstalacaoFluxo = { sugerir, passos, lerEstado, serializarEstado, transicionar };
})(window);
