import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert.ok(script, 'script do frontend deve existir');
assert.match(html, /assets\/logo-sorri-simbolo\.png/, 'cabeçalho deve exibir o símbolo institucional');
assert.match(html, /assets\/logo-sorri-50-anos\.png/, 'cabeçalho deve controlar o elemento de aniversário separadamente');
assert.match(html, /#reader:not\(:empty\)\{height:clamp\(185px,28vh,230px\)/, 'viewport do scanner deve permanecer compacto');
assert.match(html, /\.search button\{flex:0 0 auto;min-width:115px/, 'busca mobile deve manter botão acessível na mesma linha');
const helpers = script.slice(0, script.indexOf("$('start').onclick"));
const context = { console, localStorage: { getItem: () => null, setItem: () => {} }, document: { getElementById: () => null } };
vm.createContext(context);
vm.runInContext(`${helpers}; globalThis.exports_={APP_VERSION,CACHE_KEY,ID_KEY,norm,indiceCompativel,filtrarIndiceLocal,buscarComFallback};`, context);
const app = context.exports_;

const indice = {
  appVersion: app.APP_VERSION,
  baseVersion: '1',
  pessoas: [
    { idPessoa: 'P1', nome: 'Cadastro Institucional', nomeCracha: 'Diego Bento', nomeExibicao: 'Diego Bento' },
    { idPessoa: 'P3', nome: 'Cadastro Alternativo', nomeCracha: 'Crachá Árvore', nomeExibicao: 'Crachá Árvore' },
    { idPessoa: 'P2', nome: 'Nome Principal', nomeCracha: '', nomeExibicao: 'Nome Principal' }
  ],
  inscricaoParaPessoa: {}
};

assert.equal(app.CACHE_KEY, 'simposio50.indice.2026.09.12.3');
assert.equal(app.ID_KEY, 'simposio50.identidade', 'identidade do operador deve permanecer em chave separada');
assert.deepEqual(app.filtrarIndiceLocal(indice, 'Diego Bento').map(p => p.idPessoa), ['P1']);
assert.deepEqual(app.filtrarIndiceLocal(indice, 'diego bento').map(p => p.idPessoa), ['P1']);
assert.deepEqual(app.filtrarIndiceLocal(indice, 'DIEGO BENTO').map(p => p.idPessoa), ['P1']);
assert.deepEqual(app.filtrarIndiceLocal(indice, 'Diego').map(p => p.idPessoa), ['P1']);
assert.deepEqual(app.filtrarIndiceLocal(indice, 'Bento').map(p => p.idPessoa), ['P1']);
assert.deepEqual(app.filtrarIndiceLocal(indice, 'Cracha Arvore').map(p => p.idPessoa), ['P3']);
assert.deepEqual(app.filtrarIndiceLocal(indice, 'Nome Principal').map(p => p.idPessoa), ['P2']);
assert.equal(app.norm('  Árvore  CAFÉ '), 'ARVORE CAFE', 'normalização deve ignorar acentos e espaços extras');

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
