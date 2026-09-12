import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert.ok(script, 'script do frontend deve existir');
assert.match(html, /assets\/identidade-cabecalho\.png/, 'cabeçalho deve usar a máscara institucional aprovada');
assert.match(html, /assets\/identidade-rodape\.png/, 'rodapé deve usar a composição decorativa aprovada');
assert.match(html, /#reader:not\(:empty\)\{height:clamp\(185px,28vh,230px\)/, 'viewport do scanner deve permanecer compacto');
assert.match(html, /\.search button\{flex:0 0 auto;min-width:115px/, 'busca mobile deve manter botão acessível na mesma linha');
assert.match(html, /\.identity-footer\{position:fixed;z-index:0;left:0;bottom:0/, 'composição inferior deve permanecer atrás da interface');
assert.match(html, /\.identity-header\{display:block;width:100%;height:auto;max-width:620px/, 'cabeçalho deve manter a proporção da máscara sem distorção');
assert.match(html, /\.meta\{margin-top:9px;[^}]*flex-wrap:nowrap/, 'faixa de operação não deve quebrar precocemente');
assert.match(html, /\.operator-wrap\{display:block!important;flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis/, 'operador longo deve truncar sem sobrepor a data');
assert.match(html, /id="scanFrame"[^>]*aria-hidden="true"/, 'frame do scanner deve existir sem interferir na acessibilidade');
assert.match(html, /\.scanner-stage\.scanning \.scan-frame\{display:block\}/, 'frame deve aparecer somente com scanner ativo');
assert.match(html, /@keyframes scanPulse/, 'scanner ativo deve ter animação sutil');
assert.match(html, /@media\(prefers-reduced-motion:reduce\)/, 'movimento reduzido deve ser respeitado');
assert.match(html, /class="spinner" aria-hidden="true"/, 'spinner deve ser decorativo e manter rótulo textual');
const helpers = script.slice(0, script.indexOf("$('start').onclick"));
const makeElement = () => {
  const classes = new Set();
  return {
    className: '', innerHTML: '', textContent: '', value: '', disabled: false, attributes: {},
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      contains: name => classes.has(name)
    },
    setAttribute(name, value) { this.attributes[name] = value; },
    querySelectorAll: () => []
  };
};
const elements = Object.fromEntries(['scannerStage','scanFrame','stop','searchBtn','search','matches','feedback'].map(id => [id, makeElement()]));
const context = {
  console, URL,
  navigator: { vibrate: () => true },
  localStorage: { getItem: () => null, setItem: () => {} },
  document: { getElementById: id => elements[id] || makeElement(), querySelectorAll: () => [] }
};
vm.createContext(context);
vm.runInContext(`${helpers}; globalThis.exports_={APP_VERSION,CACHE_KEY,ID_KEY,norm,normalizarQrLido,manterFeedbackDuplicado_,register,processQR,search,setOperationalState,estadoOperacionalAtual_,indiceCompativel,filtrarIndiceLocal,buscarComFallback};`, context);
const app = context.exports_;

const indice = {
  appVersion: app.APP_VERSION,
  baseVersion: '1',
  pessoas: [
    { idPessoa: 'P1', nome: 'Cadastro Institucional', nomeCracha: 'Diego Bento', nomeExibicao: 'Diego Bento' },
    { idPessoa: 'P3', nome: 'Cadastro Alternativo', nomeCracha: 'Crachá Árvore', nomeExibicao: 'Crachá Árvore' },
    { idPessoa: 'P2', nome: 'Nome Principal', nomeCracha: '', nomeExibicao: 'Nome Principal' }
  ],
  inscricaoParaPessoa: { '75817561': { idPessoa: 'P1', categoria: '' } }
};

assert.equal(app.CACHE_KEY, 'simposio50.indice.2026.09.12.9');
assert.equal(app.ID_KEY, 'simposio50.identidade', 'identidade do operador deve permanecer em chave separada');
assert.deepEqual(app.filtrarIndiceLocal(indice, 'Diego Bento').map(p => p.idPessoa), ['P1']);
assert.deepEqual(app.filtrarIndiceLocal(indice, 'diego bento').map(p => p.idPessoa), ['P1']);
assert.deepEqual(app.filtrarIndiceLocal(indice, 'DIEGO BENTO').map(p => p.idPessoa), ['P1']);
assert.deepEqual(app.filtrarIndiceLocal(indice, 'Diego').map(p => p.idPessoa), ['P1']);
assert.deepEqual(app.filtrarIndiceLocal(indice, 'Bento').map(p => p.idPessoa), ['P1']);
assert.deepEqual(app.filtrarIndiceLocal(indice, 'Cracha Arvore').map(p => p.idPessoa), ['P3']);
assert.deepEqual(app.filtrarIndiceLocal(indice, 'Nome Principal').map(p => p.idPessoa), ['P2']);
assert.equal(app.norm('  Árvore  CAFÉ '), 'ARVORE CAFE', 'normalização deve ignorar acentos e espaços extras');
assert.equal(app.normalizarQrLido('  00012345\n'), '00012345', 'QR numérico simples deve preservar zeros à esquerda');
assert.equal(app.normalizarQrLido('https://e3.gl/99a0046e75817561?n=Ortopedia'), '75817561', 'URL QR confirmada deve extrair somente a inscrição');
assert.equal(app.normalizarQrLido('https://outro.exemplo/99a0046e75817561'), 'https://outro.exemplo/99a0046e75817561', 'URL não reconhecida não pode ser convertida arbitrariamente');
assert.equal(app.normalizarQrLido('codigo-invalido'), 'codigo-invalido', 'payload inválido deve seguir para o erro QR_NAO_LOCALIZADO');
assert.ok(indice.inscricaoParaPessoa[app.normalizarQrLido('https://e3.gl/99a0046e75817561?n=Ortopedia')], 'QR URL e índice local devem resolver a mesma inscrição');
assert.equal(app.manterFeedbackDuplicado_('DUPLICADA'), true, 'duplicidade deve ter tratamento visual persistente');
assert.equal(app.manterFeedbackDuplicado_('REGISTRADA'), false, 'outros feedbacks devem manter timeout normal');
assert.match(html, /if\(manterFeedbackDuplicado_\(r\.status\)\)\{[\s\S]*?setOperationalState\('DUPLICATE'\);return\}/, 'duplicidade não pode chamar rearm ou limpar feedback automaticamente');
assert.match(html, /async function processQR\(decoded\)[\s\S]*?setOperationalState\('QR_DETECTED'\);clearFeedback\(\);vibrateQr_\(\);setOperationalState\('PROCESSING_QR'\)/, 'novo QR deve bloquear concorrência e mostrar processamento imediatamente');
assert.match(html, /async function search\(\)\{if\(busy\)return;[\s\S]*?setOperationalState\('SEARCHING'\)/, 'busca deve bloquear concorrência antes de consultar');
assert.match(html, /if\(e\.key==='Enter'\)\{e\.preventDefault\(\);search\(\)\}/, 'Enter deve reutilizar o fluxo protegido de busca');

vm.runInContext("scanning=true; setOperationalState('SCANNING')", context);
assert.equal(elements.scannerStage.classList.contains('scanning'), true, 'frame deve ativar quando scanner aguarda QR');
assert.equal(elements.scannerStage.attributes['aria-busy'], 'false');

vm.runInContext(`
  globalThis.apiActions_ = [];
  globalThis.lookupResolve_ = null;
  api = async action => {
    globalThis.apiActions_.push(action);
    if (action === 'buscarPorInscricao') return new Promise(resolve => { globalThis.lookupResolve_ = resolve; });
    return { status: 'REGISTRADA', participante: { nomeExibicao: 'Pessoa teste' }, presenca: { data: '01/01', hora: '10:00', periodo: 'MANHA' } };
  };
  rearm = () => setOperationalState(scanning ? 'SCANNING' : 'IDLE');
`, context);
const primeiraLeitura = app.processQR('00012346');
assert.equal(app.estadoOperacionalAtual_(), 'PROCESSING_QR', 'decode deve entrar em processamento sem aguardar servidor');
assert.equal(elements.scannerStage.attributes['aria-busy'], 'true');
assert.match(elements.stop.innerHTML, /spinner[\s\S]*Consultando…/, 'consulta QR deve exibir spinner imediatamente');
await app.processQR('00012346');
assert.equal(context.apiActions_.join(','), 'buscarPorInscricao', 'mesmo QR repetido não pode gerar outra consulta');
context.lookupResolve_({ idPessoa: 'P1', nomeExibicao: 'Pessoa teste' });
await primeiraLeitura;
assert.equal(app.estadoOperacionalAtual_(), 'SCANNING', 'loader deve terminar quando consulta conclui');
assert.equal(elements.stop.innerHTML, '■ Parar câmera');

vm.runInContext(`
  globalThis.duplicateFeedback_ = null; globalThis.rearmCalls_ = 0;
  api = async () => ({ status: 'DUPLICADA', participante: { nomeExibicao: 'Pessoa teste' }, presenca: { data: '01/01', hora: '10:00', periodo: 'MANHA' } });
  show = (...args) => { globalThis.duplicateFeedback_ = args; };
  rearm = () => { globalThis.rearmCalls_++; };
  setOperationalState('PROCESSING_QR');
`, context);
await app.register({ origemRegistro: 'BUSCA_NOME', idPessoa: 'P1' }, { nomeExibicao: 'Pessoa teste' });
assert.equal(context.rearmCalls_, 0, 'duplicidade não deve agendar limpeza após 3 ou 10 segundos');
assert.equal(context.duplicateFeedback_?.[0], '⚠️ Presença já registrada');
assert.equal(app.estadoOperacionalAtual_(), 'DUPLICATE', 'scanner deve aceitar um novo QR após duplicidade');

vm.runInContext(`
  scanning = false;
  setOperationalState('IDLE');
  document.getElementById('search').value = 'Nome teste';
  globalThis.searchCalls_ = 0;
  globalThis.searchResolve_ = null;
  api = async action => {
    if (action !== 'buscarParticipantes') throw new Error('ação inesperada');
    globalThis.searchCalls_++;
    return new Promise(resolve => { globalThis.searchResolve_ = resolve; });
  };
`, context);
const primeiraBusca = app.search();
assert.equal(app.estadoOperacionalAtual_(), 'SEARCHING');
assert.equal(elements.searchBtn.disabled, true, 'botão deve ser desabilitado durante busca');
assert.equal(elements.searchBtn.attributes['aria-busy'], 'true');
assert.match(elements.searchBtn.innerHTML, /spinner[\s\S]*Buscando…/);
await app.search();
assert.equal(context.searchCalls_, 1, 'clique ou Enter repetido não pode iniciar outra busca');
context.searchResolve_({ participantes: [] });
await primeiraBusca;
assert.equal(elements.searchBtn.disabled, false, 'botão deve ser restaurado após resultado');
assert.equal(elements.searchBtn.innerHTML, 'Buscar');

vm.runInContext("api = async () => { throw new Error('falha simulada'); }; document.getElementById('search').value = 'Outra busca';", context);
await app.search();
assert.equal(elements.searchBtn.disabled, false, 'botão deve ser restaurado também após erro');
assert.equal(app.estadoOperacionalAtual_(), 'IDLE');

assert.equal(app.indiceCompativel(indice, '1'), true);
assert.equal(app.indiceCompativel({ ...indice, appVersion: '2026.09.11.1' }, '1'), false, 'cache de frontend anterior deve ser rejeitado');
assert.equal(app.indiceCompativel({ ...indice, baseVersion: '2' }, '1'), false, 'baseVersion divergente deve ser rejeitada');
assert.equal(app.indiceCompativel({ baseVersion: '1', pessoas: [], inscricaoParaPessoa: {} }, '1'), false, 'cache legado sem metadados deve ser rejeitado');
assert.equal(app.indiceCompativel({ ...indice, pessoas: [{ idPessoa: 'P1', nome: 'x' }] }, '1'), false, 'cache sem campos de busca deve ser rejeitado');

let chamadas = 0;
const resultadoLocal = await app.buscarComFallback('Cracha', indice, async () => { chamadas++; return []; });
assert.equal(resultadoLocal.length, 1);
assert.equal(chamadas, 0, 'resultado local não deve consultar o backend');
const resultadoFallback = await app.buscarComFallback('Inexistente', indice, async () => { chamadas++; return [{ idPessoa: 'PX' }]; });
assert.equal(resultadoFallback.length, 1);
assert.equal(chamadas, 1, 'zero resultados locais deve consultar o backend');
console.log('OK: regressões de cache e busca do frontend aprovadas');
