import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert.ok(script, 'script do frontend deve existir');
const helpers = script.slice(0, script.indexOf("$('start').onclick"));

function criarTimers() {
  let now = 1_000_000;
  let nextId = 1;
  const queue = new Map();
  return {
    get now() { return now; },
    setTimeout(callback, delay = 0) {
      const id = nextId++;
      queue.set(id, { id, due: now + Math.max(0, Number(delay) || 0), callback });
      return id;
    },
    clearTimeout(id) { queue.delete(id); },
    async avancar(ms) {
      now += ms;
      for (;;) {
        const due = [...queue.values()].filter(item => item.due <= now).sort((a, b) => a.due - b.due || a.id - b.id);
        if (!due.length) break;
        for (const item of due) {
          if (!queue.delete(item.id)) continue;
          await item.callback();
          await Promise.resolve();
        }
      }
    },
    pendentes() { return queue.size; }
  };
}

function criarElemento() {
  const classes = new Set();
  return {
    className: '', innerHTML: '', textContent: '', value: '', disabled: false, attributes: {}, dataset: { index: '0' },
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
    },
    setAttribute(name, value) { this.attributes[name] = value; },
    querySelectorAll: () => []
  };
}

function indice(baseVersion, sufixo = 'A') {
  return {
    appVersion: '2026.09.14.3',
    baseVersion,
    pessoas: [{ idPessoa: `P-${sufixo}`, nome: `Pessoa ${sufixo}`, nomeCracha: '', nomeExibicao: `Pessoa ${sufixo}` }],
    inscricaoParaPessoa: { [`100${sufixo}`]: { idPessoa: `P-${sufixo}`, categoria: 'TESTE' } }
  };
}

function criarHarness({ baseVersion = 'N', fresh = indice('N+1', 'B'), random = 0 } = {}) {
  const timers = criarTimers();
  const storage = new Map();
  const calls = [];
  const elementos = Object.fromEntries(['scannerStage', 'stop', 'searchBtn', 'search', 'matches', 'feedback', 'status', 'refreshBase'].map(id => [id, criarElemento()]));
  const math = Object.create(Math);
  math.random = () => random;
  class FakeDate extends Date { static now() { return timers.now; } }
  const context = {
    console, URL, Math: math, Date: FakeDate,
    navigator: { vibrate: () => true },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      key: index => Array.from(storage.keys())[index] ?? null,
      get length() { return storage.size; }
    },
    document: {
      getElementById: id => elementos[id] || criarElemento(),
      querySelectorAll: () => []
    },
    apiHandler_: async action => {
      calls.push(action);
      if (action === 'obterBaseVersion') return { baseVersion };
      if (action === 'obterIndiceParticipantes') return fresh;
      if (action === 'registrarPresenca') return { status: 'REGISTRADA', participante: { nomeExibicao: 'Pessoa A' }, presenca: { data: '12/09', hora: '20:00', periodo: 'NOITE' } };
      if (action === 'buscarParticipantes') return { participantes: [] };
      throw new Error(`ação inesperada: ${action}`);
    }
  };
  vm.createContext(context);
  vm.runInContext(`${helpers};
    api=(action,body)=>globalThis.apiHandler_(action,body);
    globalThis.cacheExports_={
      APP_VERSION,CACHE_KEY,ID_KEY,BACKGROUND_REFRESH_OPERATION_LIMIT,BACKGROUND_REFRESH_INTERVAL_MS,BACKGROUND_REFRESH_JITTER_MAX_MS,
      reiniciarJanelaVerificacaoBase_,registrarOperacaoConcluida_,solicitarAtualizacaoSilenciosa_,executarAtualizacaoSilenciosa_,atualizarBaseManual_,estadoSincronizacaoSilenciosa_,
      register,search,indiceCompativel,indiceEstruturalmenteValido_,obterIndiceLocalDisponivel_,loadIndex,
      setLocalIndex:value=>{localIndex=value},getLocalIndex:()=>localIndex,
      setApi:handler=>{api=handler},setIdentity:value=>{identity=value},
      resetState:()=>{operationsSinceVersionCheck=0;lastBaseVersionCheckAt=Date.now();isBackgroundRefreshRunning=false;isBackgroundRefreshScheduled=false;backgroundRefreshTimer=null;backgroundRefreshJitterTimer=null;backgroundRefreshPromise=null;manualRefreshPromise=null}
    };`, context);
  return { context, app: context.cacheExports_, timers, storage, calls, elementos };
}

{
  const h = criarHarness({ baseVersion: 'N' });
  h.app.setLocalIndex(indice('N'));
  h.app.reiniciarJanelaVerificacaoBase_();
  for (let i = 0; i < 14; i++) h.app.registrarOperacaoConcluida_();
  assert.equal(h.app.estadoSincronizacaoSilenciosa_().operationsSinceVersionCheck, 14, '14 operações não devem verificar a versão');
  assert.deepEqual(h.calls, []);
  h.app.registrarOperacaoConcluida_();
  assert.equal(h.app.estadoSincronizacaoSilenciosa_().isBackgroundRefreshScheduled, true, '15ª operação deve agendar a verificação');
  await h.timers.avancar(0);
  assert.deepEqual(h.calls, ['obterBaseVersion'], '15ª operação deve produzir uma única verificação');
  assert.equal(h.app.estadoSincronizacaoSilenciosa_().operationsSinceVersionCheck, 0);
}

{
  const h = criarHarness({ baseVersion: 'N' });
  h.app.setLocalIndex(indice('N'));
  h.app.reiniciarJanelaVerificacaoBase_();
  await h.timers.avancar(5 * 60 * 1000);
  assert.deepEqual(h.calls, ['obterBaseVersion'], 'cinco minutos devem produzir uma única verificação');
}

{
  const h = criarHarness({ baseVersion: 'N' });
  h.app.setLocalIndex(indice('N'));
  h.app.reiniciarJanelaVerificacaoBase_();
  for (let i = 0; i < 15; i++) h.app.registrarOperacaoConcluida_();
  await h.timers.avancar(5 * 60 * 1000);
  assert.equal(h.calls.filter(action => action === 'obterBaseVersion').length, 1, 'gatilhos simultâneos não podem duplicar chamadas');
}

{
  const h = criarHarness({ baseVersion: 'N' });
  h.app.setLocalIndex(indice('N'));
  const result = await h.app.executarAtualizacaoSilenciosa_('teste');
  assert.equal(result.atualizada, false);
  assert.deepEqual(h.calls, ['obterBaseVersion'], 'versão igual não deve baixar índice');
}

{
  const h = criarHarness({ baseVersion: 'N+1' });
  const old = indice('N');
  h.app.setLocalIndex(old);
  h.storage.set(h.app.CACHE_KEY, JSON.stringify(old));
  const result = await h.app.executarAtualizacaoSilenciosa_('teste');
  assert.equal(result.atualizada, true);
  assert.deepEqual(h.calls, ['obterBaseVersion', 'obterIndiceParticipantes']);
  assert.equal(h.app.getLocalIndex().baseVersion, 'N+1');
  assert.equal(JSON.parse(h.storage.get(h.app.CACHE_KEY)).baseVersion, 'N+1', 'índice válido deve substituir o cache');
}

{
  const invalid = { baseVersion: 'N+1', pessoas: [{ nome: 'Incompleta', nomeCracha: '', nomeExibicao: 'Incompleta' }], inscricaoParaPessoa: {} };
  const h = criarHarness({ baseVersion: 'N+1', fresh: invalid });
  const old = indice('N');
  h.app.setLocalIndex(old);
  h.storage.set(h.app.CACHE_KEY, JSON.stringify(old));
  const result = await h.app.executarAtualizacaoSilenciosa_('teste');
  assert.equal(result.falhou, true);
  assert.equal(h.app.getLocalIndex(), old, 'índice inválido deve preservar a referência anterior');
  assert.equal(JSON.parse(h.storage.get(h.app.CACHE_KEY)).baseVersion, 'N', 'índice inválido deve preservar o cache anterior');
}

{
  const h = criarHarness();
  const old = indice('N');
  h.app.setLocalIndex(old);
  h.app.setApi(async action => { h.calls.push(action); throw new Error('rede indisponível'); });
  const result = await h.app.executarAtualizacaoSilenciosa_('teste');
  assert.equal(result.falhou, true);
  assert.equal(h.app.getLocalIndex(), old, 'erro em obterBaseVersion deve preservar o índice');
}

{
  const h = criarHarness({ baseVersion: 'N+1' });
  const old = indice('N');
  h.app.setLocalIndex(old);
  h.app.setApi(async action => {
    h.calls.push(action);
    if (action === 'obterBaseVersion') return { baseVersion: 'N+1' };
    throw new Error('download indisponível');
  });
  const result = await h.app.executarAtualizacaoSilenciosa_('teste');
  assert.equal(result.falhou, true);
  assert.equal(h.app.getLocalIndex(), old, 'erro no download deve preservar o índice');
}

{
  const h = criarHarness();
  h.app.setLocalIndex(indice('N'));
  let liberar;
  h.app.setApi(action => {
    h.calls.push(action);
    return new Promise(resolve => { liberar = () => resolve({ baseVersion: 'N' }); });
  });
  const first = h.app.executarAtualizacaoSilenciosa_('teste');
  const secondPromise = h.app.executarAtualizacaoSilenciosa_('teste');
  assert.equal(h.calls.length, 1);
  liberar();
  const [firstResult, secondResult] = await Promise.all([first, secondPromise]);
  assert.equal(firstResult, secondResult, 'refresh em andamento deve compartilhar o mesmo resultado');
}

{
  const h = criarHarness({ baseVersion: 'N+1' });
  const identidade = JSON.stringify({ operador: 'Operador 01', dispositivo: 'Dispositivo 01' });
  h.storage.set(h.app.ID_KEY, identidade);
  h.app.setIdentity(JSON.parse(identidade));
  h.app.setLocalIndex(indice('N'));
  await h.app.executarAtualizacaoSilenciosa_('teste');
  assert.equal(h.storage.get(h.app.ID_KEY), identidade, 'refresh não pode alterar operador/dispositivo');
}

for (const status of ['REGISTRADA', 'DUPLICADA']) {
  const h = criarHarness();
  h.app.setApi(async action => {
    if (action !== 'registrarPresenca') throw new Error('ação inesperada');
    return { status, participante: { nomeExibicao: 'Pessoa A' }, presenca: { data: '12/09', hora: '20:00', periodo: 'NOITE' } };
  });
  vm.runInContext("rearm=()=>setOperationalState('IDLE'); setOperationalState('IDLE')", h.context);
  await h.app.register({ origemRegistro: 'BUSCA_NOME', idPessoa: 'P-A' }, { nomeExibicao: 'Pessoa A' });
  assert.equal(h.app.estadoSincronizacaoSilenciosa_().operationsSinceVersionCheck, 1, `${status} deve incrementar o contador`);
}

{
  const h = criarHarness();
  h.app.setApi(async action => { if (action === 'registrarPresenca') throw new Error('falha concluída'); throw new Error('ação inesperada'); });
  vm.runInContext("rearm=()=>setOperationalState('IDLE'); setOperationalState('IDLE')", h.context);
  await h.app.register({ origemRegistro: 'BUSCA_NOME', idPessoa: 'P-A' }, { nomeExibicao: 'Pessoa A' });
  assert.equal(h.app.estadoSincronizacaoSilenciosa_().operationsSinceVersionCheck, 1, 'erro final de registro deve incrementar o contador');
}

{
  const h = criarHarness();
  h.app.setLocalIndex(indice('N'));
  h.elementos.search.value = 'Pessoa A';
  vm.runInContext("renderMatches=()=>{}; setOperationalState('IDLE')", h.context);
  await h.app.search();
  assert.equal(h.app.estadoSincronizacaoSilenciosa_().operationsSinceVersionCheck, 0, 'busca simples não deve incrementar o contador');
}

assert.match(html, /finally\{registrarOperacaoConcluida_\(\)\}/, 'toda tentativa de registro iniciada deve contabilizar sua conclusão');
assert.match(html, /BACKGROUND_REFRESH_OPERATION_LIMIT=15/);
assert.match(html, /BACKGROUND_REFRESH_INTERVAL_MS=5\*60\*1000/);
assert.match(html, /BACKGROUND_REFRESH_JITTER_MAX_MS=2000/);
assert.match(html, /\['NETWORK_ERROR','HTTP_ERROR','PARSE_ERROR'\]/, 'retry deve ser restrito a falhas transitórias de leitura');
assert.match(html, /VERSION_CHECK_FAILED/);
assert.match(html, /INDEX_DOWNLOAD_FAILED/);
assert.match(html, /INDEX_INVALID/);

{
  const h = criarHarness({ baseVersion: 'N' });
  h.app.setLocalIndex(indice('N'));
  const resultado = await h.app.atualizarBaseManual_();
  assert.equal(resultado.atualizada, false);
  assert.deepEqual(h.calls, ['obterBaseVersion']);
  assert.equal(h.elementos.status.textContent, 'Base já está atualizada');
  assert.equal(h.elementos.refreshBase.disabled, false);
}

{
  const h = criarHarness({ baseVersion: 'N+1' });
  h.app.setLocalIndex(indice('N'));
  const resultado = await h.app.atualizarBaseManual_();
  assert.equal(resultado.atualizada, true);
  assert.equal(h.elementos.status.textContent, 'Base atualizada');
  assert.equal(h.app.estadoSincronizacaoSilenciosa_().operationsSinceVersionCheck, 0);
}

{
  const h = criarHarness({ baseVersion: 'N' });
  h.app.setLocalIndex(indice('N'));
  h.app.solicitarAtualizacaoSilenciosa_('operacoes');
  assert.equal(h.app.estadoSincronizacaoSilenciosa_().isBackgroundRefreshScheduled, true);
  const resultado = await h.app.atualizarBaseManual_();
  assert.equal(resultado.atualizada, false);
  assert.deepEqual(h.calls, ['obterBaseVersion'], 'manual deve cancelar o jitter e iniciar imediatamente uma única consulta');
  assert.equal(h.app.estadoSincronizacaoSilenciosa_().isBackgroundRefreshScheduled, false);
}

{
  const h = criarHarness({ baseVersion: 'N' });
  h.app.setLocalIndex(indice('N'));
  let liberar;
  h.app.setApi(action => {
    h.calls.push(action);
    return new Promise(resolve => { liberar = () => resolve({ baseVersion: 'N' }); });
  });
  const primeiro = h.app.atualizarBaseManual_();
  const segundo = h.app.atualizarBaseManual_();
  assert.equal(h.calls.length, 1, 'clique duplo não pode duplicar a consulta');
  liberar();
  const [a, b] = await Promise.all([primeiro, segundo]);
  assert.equal(a, b);
}

{
  const h = criarHarness();
  const antigo = indice('N');
  h.app.setLocalIndex(antigo);
  let tentativas = 0;
  h.app.setApi(async action => {
    h.calls.push(action); tentativas++;
    const erro = new Error('falha temporária'); erro.code = 'NETWORK_ERROR'; throw erro;
  });
  const atualizacao = h.app.atualizarBaseManual_();
  for (let i = 0; i < 8 && h.timers.pendentes() === 0; i++) await Promise.resolve();
  assert.ok(h.timers.pendentes() > 0, 'retry deve agendar a espera curta');
  await h.timers.avancar(300);
  const resultado = await atualizacao;
  assert.equal(tentativas, 2, 'falha transitória deve ter somente um retry');
  assert.equal(resultado.codigo, 'VERSION_CHECK_FAILED');
  assert.equal(resultado.causa, 'NETWORK_ERROR');
  assert.equal(h.app.getLocalIndex(), antigo);
  assert.equal(h.elementos.status.textContent, 'Não foi possível atualizar a base');
}

{
  const h = criarHarness({ baseVersion: '2' });
  const legado = { ...indice('2', 'LEGADO'), appVersion: '2026.09.14.2' };
  h.storage.set('simposio50.indice.2026.09.14.2', JSON.stringify(legado));
  await h.app.loadIndex();
  assert.equal(h.app.getLocalIndex().baseVersion, '2', 'mudança de APP_VERSION deve reaproveitar a base local');
  assert.equal(h.app.getLocalIndex().appVersion, h.app.APP_VERSION);
  assert.equal(JSON.parse(h.storage.get(h.app.CACHE_KEY)).baseVersion, '2', 'migração deve gravar a chave estável');
  assert.equal(h.elementos.status.textContent, 'Base local pronta');
}

{
  const h = criarHarness({ baseVersion: '3', fresh: indice('3', 'NOVA') });
  const legado = { ...indice('2', 'ANTIGA'), appVersion: '2026.09.14.2' };
  h.storage.set('simposio50.indice.2026.09.14.2', JSON.stringify(legado));
  await h.app.loadIndex();
  assert.equal(h.app.getLocalIndex().baseVersion, '2', 'a base antiga deve ficar disponível antes do download');
  assert.equal(h.elementos.status.textContent, 'Base local disponível; atualizando…');
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(h.app.getLocalIndex().baseVersion, '3', 'a troca deve ocorrer apenas após validar a nova base');
  assert.equal(h.elementos.status.textContent, 'Base atualizada');
  assert.deepEqual(h.calls, ['obterBaseVersion', 'obterBaseVersion', 'obterIndiceParticipantes']);
}

{
  const h = criarHarness();
  const legado = { ...indice('2', 'OFFLINE'), appVersion: '2026.09.14.2' };
  h.storage.set('simposio50.indice.2026.09.14.2', JSON.stringify(legado));
  h.app.setApi(async action => { h.calls.push(action); const erro = new Error('servidor indisponível'); erro.code = 'NETWORK_ERROR'; throw erro; });
  const abertura = h.app.loadIndex();
  for (let i = 0; i < 8 && h.timers.pendentes() === 0; i++) await Promise.resolve();
  await h.timers.avancar(300);
  await abertura;
  assert.equal(h.app.getLocalIndex().baseVersion, '2', 'falha do servidor não pode descartar cache utilizável');
  assert.equal(h.elementos.status.textContent, 'Usando base local; servidor temporariamente indisponível');
}

{
  const h = criarHarness({ baseVersion: '3', fresh: indice('3', 'PRIMEIRA') });
  await h.app.loadIndex();
  assert.equal(h.app.getLocalIndex().baseVersion, '3', 'sem cache, a base atual deve ser baixada normalmente');
  assert.equal(h.elementos.status.textContent, 'Base atualizada');
}
console.log('OK: sincronização silenciosa do cache aprovada');
