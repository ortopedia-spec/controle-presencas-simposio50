import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert.ok(script);
const helpers = script.slice(0, script.indexOf("$('start').onclick"));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function elemento() {
  const classes = new Set();
  return {
    className: '', innerHTML: '', textContent: '', value: '', disabled: false, attributes: {}, dataset: { index: '0' },
    classList: { add: (...n) => n.forEach(x => classes.add(x)), remove: (...n) => n.forEach(x => classes.delete(x)), toggle: (n, on) => on ? classes.add(n) : classes.delete(n) },
    setAttribute(name, value) { this.attributes[name] = value; }, querySelectorAll: () => []
  };
}

function indice(version, device, suffix = 'A') {
  return {
    appVersion: '2026.09.14.2', baseVersion: version,
    pessoas: [{ idPessoa: `P-${device}-${suffix}`, nome: `Pessoa ${device} ${suffix}`, nomeCracha: '', nomeExibicao: `Pessoa ${device} ${suffix}` }],
    inscricaoParaPessoa: { [`7000000${device}`]: { idPessoa: `P-${device}-${suffix}`, categoria: 'TESTE' } }
  };
}

function dispositivo(numero, { random = numero / 7, version = 'N', fresh = indice('N+1', numero, 'B'), handler } = {}) {
  const elements = Object.fromEntries(['scannerStage', 'stop', 'searchBtn', 'search', 'matches', 'feedback', 'status', 'refreshBase'].map(id => [id, elemento()]));
  const storage = new Map([['simposio50.identidade', JSON.stringify({ operador: `Operador ${numero}`, dispositivo: `Dispositivo ${numero}` })]]);
  const calls = [];
  const timings = [];
  const math = Object.create(Math);
  math.random = () => random;
  const timer = (fn, ms) => { const id = setTimeout(fn, ms); id.unref?.(); return id; };
  const defaultHandler = async (action, body = {}) => {
    const start = performance.now();
    calls.push({ action, at: start });
    await sleep(action === 'obterIndiceParticipantes' ? 35 : 12);
    timings.push({ action, duration: performance.now() - start });
    if (action === 'obterBaseVersion') return { baseVersion: version };
    if (action === 'obterIndiceParticipantes') return fresh;
    if (action === 'buscarParticipantes') return { participantes: [] };
    if (action === 'registrarPresenca') return { status: body.simularDuplicada ? 'DUPLICADA' : 'REGISTRADA', participante: { nomeExibicao: `Pessoa ${numero}` }, presenca: { data: '12/09', hora: '20:00', periodo: 'NOITE' } };
    if (action === 'buscarPorInscricao') return { idPessoa: `P-${numero}-A`, nomeExibicao: `Pessoa ${numero}` };
    throw new Error(`ação inesperada: ${action}`);
  };
  const context = {
    console, URL, Math: math, Date, performance,
    navigator: { vibrate: () => true }, setTimeout: timer, clearTimeout,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    document: { getElementById: id => elements[id] || elemento(), querySelectorAll: () => [] },
    apiHandler_: handler || defaultHandler
  };
  vm.createContext(context);
  vm.runInContext(`${helpers}; api=(action,body)=>globalThis.apiHandler_(action,body); rearm=()=>setOperationalState('IDLE');
    globalThis.perfExports_={
      APP_VERSION,registrarOperacaoConcluida_,solicitarAtualizacaoSilenciosa_,executarAtualizacaoSilenciosa_,atualizarBaseManual_,estadoSincronizacaoSilenciosa_,
      filtrarIndiceLocal,buscarComFallback,processQR,register,search,estadoOperacionalAtual_,
      setLocalIndex:value=>{localIndex=value},getLocalIndex:()=>localIndex,setApi:fn=>{api=fn},setState:value=>setOperationalState(value)
    };`, context);
  const app = context.perfExports_;
  const initial = indice('N', numero);
  app.setLocalIndex(initial);
  storage.set(`simposio50.indice.${app.APP_VERSION || '2026.09.14.2'}`, JSON.stringify(initial));
  return { numero, context, app, storage, calls, timings, elements, initial };
}

async function esperar(predicate, timeout = 5000) {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeout) throw new Error('timeout aguardando cenário');
    await sleep(5);
  }
}

function metricas(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = p => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
  return {
    min: +sorted[0].toFixed(2), media: +(sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2),
    p50: +percentile(.5).toFixed(2), p95: +percentile(.95).toFixed(2), max: +sorted.at(-1).toFixed(2)
  };
}

// Cenário 1: 15 operações, versão igual, jitter real de 0 a 2 segundos.
const sameVersion = Array.from({ length: 7 }, (_, i) => dispositivo(i + 1, { random: i / 6, version: 'N' }));
const scenario1Start = performance.now();
for (const d of sameVersion) for (let i = 0; i < 15; i++) d.app.registrarOperacaoConcluida_();
await esperar(() => sameVersion.every(d => d.calls.filter(c => c.action === 'obterBaseVersion').length === 1 && !d.app.estadoSincronizacaoSilenciosa_().isBackgroundRefreshRunning), 6000);
const versionStarts = sameVersion.map(d => d.calls.find(c => c.action === 'obterBaseVersion').at - scenario1Start);
assert.equal(sameVersion.reduce((n, d) => n + d.calls.filter(c => c.action === 'obterBaseVersion').length, 0), 7);
assert.equal(sameVersion.reduce((n, d) => n + d.calls.filter(c => c.action === 'obterIndiceParticipantes').length, 0), 0);

// Cenário 2: gatilho temporal em sete contextos; o relógio controlado foi validado na suíte unitária.
const timed = Array.from({ length: 7 }, (_, i) => dispositivo(i + 1, { random: i / 6, version: 'N' }));
for (const d of timed) d.app.solicitarAtualizacaoSilenciosa_('tempo');
await esperar(() => timed.every(d => d.calls.filter(c => c.action === 'obterBaseVersion').length === 1 && !d.app.estadoSincronizacaoSilenciosa_().isBackgroundRefreshRunning), 6000);
assert.equal(timed.reduce((n, d) => n + d.calls.filter(c => c.action === 'obterBaseVersion').length, 0), 7);

// Cenário 3: todos detectam N+1, validam e trocam o índice.
const changed = Array.from({ length: 7 }, (_, i) => dispositivo(i + 1, { random: i / 6, version: 'N+1' }));
const changedStart = performance.now();
for (const d of changed) for (let i = 0; i < 15; i++) d.app.registrarOperacaoConcluida_();
await esperar(() => changed.every(d => d.app.getLocalIndex()?.baseVersion === 'N+1' && !d.app.estadoSincronizacaoSilenciosa_().isBackgroundRefreshRunning), 6000);
const changedDurations = changed.map(d => d.timings.filter(t => ['obterBaseVersion', 'obterIndiceParticipantes'].includes(t.action)).reduce((n, t) => n + t.duration, 0));
const detectionDurations = changed.map(d => d.calls.find(c => c.action === 'obterIndiceParticipantes').at - changedStart + d.timings.find(t => t.action === 'obterIndiceParticipantes').duration);
assert.equal(changed.reduce((n, d) => n + d.calls.filter(c => c.action === 'obterIndiceParticipantes').length, 0), 7);

// Cenário 4: operações continuam enquanto o download está pendente e o índice antigo permanece ativo.
const during = [];
for (let i = 1; i <= 7; i++) {
  let release;
  const d = dispositivo(i);
  d.app.setApi(async (action, body) => {
    d.calls.push({ action, at: performance.now() });
    if (action === 'obterBaseVersion') return { baseVersion: 'N+1' };
    if (action === 'obterIndiceParticipantes') return new Promise(resolve => { release = () => resolve(indice('N+1', i, 'B')); });
    if (action === 'registrarPresenca') return { status: 'REGISTRADA', participante: { nomeExibicao: `Pessoa ${i}` }, presenca: { data: '12/09', hora: '20:00', periodo: 'NOITE' } };
    if (action === 'buscarParticipantes') return { participantes: [] };
    throw new Error(`ação inesperada durante uso: ${action}`);
  });
  const refresh = d.app.executarAtualizacaoSilenciosa_('teste');
  await esperar(() => typeof release === 'function');
  during.push({ d, release, refresh });
}
const duringLatencies = [];
for (const { d } of during) {
  assert.equal(d.app.getLocalIndex().baseVersion, 'N', 'índice antigo deve permanecer disponível durante download');
  const start = performance.now();
  if (d.numero % 3 === 1) assert.equal(d.app.filtrarIndiceLocal(d.app.getLocalIndex(), `Pessoa ${d.numero}`).length, 1);
  else if (d.numero % 3 === 2) await d.app.register({ origemRegistro: 'BUSCA_NOME', idPessoa: `P-${d.numero}-A` }, { nomeExibicao: `Pessoa ${d.numero}` });
  else await d.app.buscarComFallback('inexistente', d.app.getLocalIndex(), termo => d.context.apiHandler_('buscarParticipantes', { termo }).then(r => r.participantes));
  duringLatencies.push(performance.now() - start);
  assert.equal(d.app.estadoSincronizacaoSilenciosa_().isBackgroundRefreshRunning, true);
}
for (const item of during) item.release();
await Promise.all(during.map(item => item.refresh));
assert.ok(during.every(({ d }) => d.app.getLocalIndex().baseVersion === 'N+1'));

// Cenário 5: falhas distintas preservam integralmente o cache anterior.
const failures = Array.from({ length: 7 }, (_, i) => dispositivo(i + 1));
failures.forEach((d, index) => d.app.setApi(async action => {
  d.calls.push({ action, at: performance.now() });
  if (index === 0) throw new Error('rede');
  if (index === 1) { await sleep(25); throw new Error('timeout'); }
  if (action === 'obterBaseVersion') return { baseVersion: index >= 4 ? 'N' : 'N+1' };
  if (index === 2) throw new Error('download');
  if (index === 3) return { baseVersion: 'N+1', pessoas: [{ nome: 'inválida', nomeCracha: '', nomeExibicao: 'inválida' }], inscricaoParaPessoa: {} };
  throw new Error('índice não deveria ser solicitado');
}));
const failureResults = await Promise.all(failures.map(d => d.app.executarAtualizacaoSilenciosa_('teste')));
assert.equal(failureResults.filter(result => result.falhou).length, 4);
assert.ok(failures.every(d => d.app.getLocalIndex() === d.initial), 'todas as falhas devem preservar o índice anterior');
assert.ok(failures.every(d => !d.app.estadoSincronizacaoSilenciosa_().isBackgroundRefreshRunning));

// Cenário 6: sete cliques manuais simultâneos, incluindo clique duplo em cada aparelho.
const manual = Array.from({ length: 7 }, (_, i) => dispositivo(i + 1, { version: 'N+1' }));
const manualResults = await Promise.all(manual.flatMap(d => [d.app.atualizarBaseManual_(), d.app.atualizarBaseManual_()]));
assert.ok(manualResults.every(result => result.atualizada));
assert.equal(manual.reduce((n, d) => n + d.calls.filter(c => c.action === 'obterBaseVersion').length, 0), 7);
assert.equal(manual.reduce((n, d) => n + d.calls.filter(c => c.action === 'obterIndiceParticipantes').length, 0), 7);
assert.ok(manual.every(d => d.app.getLocalIndex().baseVersion === 'N+1'));
assert.ok(manual.every(d => !d.app.estadoSincronizacaoSilenciosa_().isBackgroundRefreshRunning));

// Cenário 7: 70 ciclos mistos com um version check temporal por aparelho.
const stress = Array.from({ length: 7 }, (_, i) => dispositivo(i + 1, { random: i / 6, version: 'N' }));
const heapBefore = process.memoryUsage().heapUsed;
const cycleLatencies = [];
let cycleErrors = 0;
for (let cycle = 0; cycle < 10; cycle++) {
  await Promise.all(stress.map(async d => {
    const start = performance.now();
    try {
      if (cycle === 4) d.app.solicitarAtualizacaoSilenciosa_('tempo');
      if (cycle % 5 === 0) d.app.filtrarIndiceLocal(d.app.getLocalIndex(), `Pessoa ${d.numero}`);
      else if (cycle % 5 === 1) await d.app.buscarComFallback('inexistente', d.app.getLocalIndex(), async () => []);
      else if (cycle % 5 === 2) await d.app.processQR(`7000000${d.numero}`);
      else await d.app.register({ origemRegistro: 'BUSCA_NOME', idPessoa: `P-${d.numero}-A`, simularDuplicada: cycle % 5 === 4 }, { nomeExibicao: `Pessoa ${d.numero}` });
      d.app.setState('IDLE');
    } catch (_) { cycleErrors++; }
    cycleLatencies.push(performance.now() - start);
  }));
}
await esperar(() => stress.every(d => d.calls.filter(c => c.action === 'obterBaseVersion').length === 1 && !d.app.estadoSincronizacaoSilenciosa_().isBackgroundRefreshRunning), 6000);
const heapDelta = process.memoryUsage().heapUsed - heapBefore;
assert.equal(cycleErrors, 0);
assert.equal(cycleLatencies.length, 70);
assert.equal(stress.reduce((n, d) => n + d.calls.filter(c => c.action === 'obterBaseVersion').length, 0), 7);
assert.equal(stress.reduce((n, d) => n + d.calls.filter(c => c.action === 'obterIndiceParticipantes').length, 0), 0);
assert.ok(stress.every(d => !d.app.estadoSincronizacaoSilenciosa_().isBackgroundRefreshRunning));

const report = {
  devices: 7,
  isolatedContexts: 7,
  scenario15Operations: {
    versionChecks: 7, indexDownloads: 0,
    jitterStart: metricas(versionStarts),
    apiLatency: metricas(sameVersion.flatMap(d => d.timings.filter(t => t.action === 'obterBaseVersion').map(t => t.duration)))
  },
  scenario5Minutes: { versionChecks: 7, indexDownloads: 0 },
  scenarioChanged: {
    devicesUpdated: 7, indexDownloads: 7,
    networkWork: metricas(changedDurations), detectionIncludingJitter: metricas(detectionDurations)
  },
  duringUse: { operations: 7, errors: 0, latency: metricas(duringLatencies), oldCacheAvailable: true, atomicSwap: true },
  failures: { simulated: 4, controlled: failureResults.filter(r => r.falhou).length, oldCachePreserved: 7, stuckStates: 0 },
  manualRefresh: { devices: 7, clicks: 14, versionChecks: 7, indexDownloads: 7, stuckStates: 0, atomicSwap: true },
  stress: {
    cycles: 70, successes: 70 - cycleErrors, errors: cycleErrors,
    latency: metricas(cycleLatencies), versionChecks: 7, indexDownloads: 0,
    heapDeltaBytes: heapDelta, stuckStates: 0
  }
};

console.log(JSON.stringify(report, null, 2));
console.log('OK: performance da sincronização silenciosa aprovada em 7 contextos isolados');
