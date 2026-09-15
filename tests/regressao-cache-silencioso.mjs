import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert.ok(script, 'script do frontend deve existir');
const helpers = script.slice(0, script.indexOf("$('start').onclick"));

function element() { return { className:'', innerHTML:'', textContent:'', value:'', disabled:false, classList:{add(){},remove(){},toggle(){}}, setAttribute(){}, querySelectorAll:()=>[] }; }
function indice(baseVersion='1') { return { baseVersion, pessoas:[{idPessoa:'P1',nome:'Pessoa Local',nomeCracha:'Cracha',nomeExibicao:'Cracha',nomesBusca:['Pessoa Local','Cracha']}], inscricaoParaPessoa:{'100':{idPessoa:'P1',categoria:'TESTE'}} }; }
function harness({fresh=indice('2')}={}) {
  const storage = new Map(), calls = [], elements = Object.fromEntries(['scannerStage','stop','searchBtn','search','matches','feedback','status','refreshBase'].map(id=>[id,element()]));
  const context = { console, URL, setTimeout, clearTimeout, navigator:{vibrate(){}}, localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),key:i=>[...storage.keys()][i]??null,get length(){return storage.size}}, document:{getElementById:id=>elements[id]||element(),querySelectorAll:()=>[]} };
  vm.createContext(context);
  vm.runInContext(`${helpers}; api=async action=>{globalThis.calls.push(action);if(action==='obterIndiceParticipantes')return globalThis.fresh;if(action==='registrarPresenca')return {status:'REGISTRADA',participante:{nomeExibicao:'Pessoa Local'},presenca:{data:'15/09',hora:'10:00',periodo:'MANHA'}};throw new Error('acao remota inesperada: '+action)};globalThis.calls=[];globalThis.fresh=undefined;globalThis.exports_={loadIndex,atualizarBaseManual_,buscarComFallback,processQR,setLocalIndex:v=>{localIndex=v},getLocalIndex:()=>localIndex};`, context);
  context.fresh = fresh;
  return {app:context.exports_,calls:context.calls,storage,elements};
}

assert.doesNotMatch(html, /BACKGROUND_REFRESH_/);
assert.doesNotMatch(html, /executarAtualizacaoSilenciosa_|solicitarAtualizacaoSilenciosa_|agendarVerificacaoTemporal_|registrarOperacaoConcluida_/);
assert.doesNotMatch(html, /api\('buscarParticipantes'/, 'busca nao pode consultar backend');
assert.doesNotMatch(html, /api\('buscarPorInscricao'/, 'QR nao pode consultar backend');

{
  const h = harness();
  h.storage.set('simposio50.indice', JSON.stringify({...indice('1'),appVersion:'versao anterior'}));
  await h.app.loadIndex();
  assert.equal(h.app.getLocalIndex().baseVersion, '1');
  assert.equal(h.calls.length, 0, 'cache valido abre sem consulta automatica');
  assert.equal(h.elements.status.textContent, 'Base local pronta');
}

{
  const h = harness({fresh:indice('2')});
  await h.app.loadIndex();
  assert.equal(h.calls.join(','), 'obterIndiceParticipantes', 'sem cache, carrega uma unica vez');
  assert.equal(h.app.getLocalIndex().baseVersion, '2');
}

{
  const h = harness({fresh:indice('2')});
  const old = {...indice('1'),appVersion:'2026.09.15.3'};
  h.app.setLocalIndex(old); h.storage.set('simposio50.indice', JSON.stringify(old));
  const result = await h.app.atualizarBaseManual_();
  assert.equal(result.atualizada, true);
  assert.equal(h.calls.join(','), 'obterIndiceParticipantes');
  assert.equal(h.app.getLocalIndex().baseVersion, '2');
  assert.equal(h.elements.status.textContent, 'Base atualizada');
  assert.equal(h.elements.refreshBase.disabled, false);
}

{
  const h = harness();
  h.app.setLocalIndex({...indice('1'),appVersion:'2026.09.15.3'});
  await h.app.processQR('100');
  assert.equal(h.calls.join(','), 'registrarPresenca', 'QR conhecido usa indice local antes do registro');
  h.calls.length = 0;
  assert.equal(h.app.buscarComFallback('Pessoa',h.app.getLocalIndex()).length,1);
  assert.equal(h.calls.length, 0, 'busca e exclusivamente local');
}

console.log('OK: atualizacao manual e cache local aprovados');
