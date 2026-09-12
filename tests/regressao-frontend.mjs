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
const helpers = script.slice(0, script.indexOf("$('start').onclick"));
const context = { console, URL, localStorage: { getItem: () => null, setItem: () => {} }, document: { getElementById: () => null } };
vm.createContext(context);
vm.runInContext(`${helpers}; globalThis.exports_={APP_VERSION,CACHE_KEY,ID_KEY,norm,normalizarQrLido,manterFeedbackDuplicado_,register,indiceCompativel,filtrarIndiceLocal,buscarComFallback};`, context);
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

assert.equal(app.CACHE_KEY, 'simposio50.indice.2026.09.12.8');
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
assert.match(html, /if\(manterFeedbackDuplicado_\(r\.status\)\)\{[\s\S]*?busy=false;return\}/, 'duplicidade não pode chamar rearm ou limpar feedback automaticamente');
assert.match(html, /async function processQR\(decoded\)\{if\(busy\)return;busy=true;clearFeedback\(\)/, 'novo QR deve substituir alerta anterior');
assert.match(html, /async function search\(\)\{const q=[\s\S]*?clearFeedback\(\)/, 'nova busca deve limpar alerta persistente');

vm.runInContext(`
  globalThis.duplicateFeedback_ = null; globalThis.rearmCalls_ = 0;
  document.getElementById = id => id === 'matches' ? { innerHTML: 'resultado anterior' } : {};
  api = async () => ({ status: 'DUPLICADA', participante: { nomeExibicao: 'Pessoa teste' }, presenca: { data: '01/01', hora: '10:00', periodo: 'MANHA' } });
  show = (...args) => { globalThis.duplicateFeedback_ = args; };
  rearm = () => { globalThis.rearmCalls_++; };
`, context);
await app.register({ origemRegistro: 'BUSCA_NOME', idPessoa: 'P1' }, { nomeExibicao: 'Pessoa teste' });
assert.equal(context.rearmCalls_, 0, 'duplicidade não deve agendar limpeza após 3 ou 10 segundos');
assert.equal(context.duplicateFeedback_?.[0], '⚠️ Presença já registrada');

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
