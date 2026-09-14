import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const configSource=fs.readFileSync(new URL('../apps-script/Config.gs',import.meta.url),'utf8');
const painelSource=fs.readFileSync(new URL('../apps-script/Painel.gs',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../painel.html',import.meta.url),'utf8');
const context={
  texto_:value=>value==null?'':String(value).trim(),
  normalizarComparacao_:value=>String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' '),
  criarErro_:(code,message)=>Object.assign(new Error(message),{code}),
  Utilities:{formatDate:(date,_tz,format)=>format==='yyyy-MM-dd'?'2026-09-15':format==='dd/MM/yyyy'?'15/09/2026':''}
};
vm.createContext(context);
vm.runInContext(`${configSource}\n${painelSource}\nglobalThis.painelExports_={montarPainelAgregado_,normalizarDataPainel_,normalizarPeriodoPainel_,percentualSeguro_};`,context);
const api=context.painelExports_;

const participantes=[
  {ID_PESSOA:'P1'},{ID_PESSOA:'P2'},{ID_PESSOA:'P3'},{ID_PESSOA:'P4'},{ID_PESSOA:''}
];
const inscricoes=[
  {NUMERO_INSCRICAO:'100',ID_PESSOA:'P1',ORIGEM_INSCRICAO:'EVENT3'},
  {NUMERO_INSCRICAO:'101',ID_PESSOA:'P1',ORIGEM_INSCRICAO:'FORM_EVENTO'},
  {NUMERO_INSCRICAO:'102',ID_PESSOA:'P2',ORIGEM_INSCRICAO:'EVENT3'},
  {NUMERO_INSCRICAO:'103',ID_PESSOA:'P3',ORIGEM_INSCRICAO:'EVENT3'},
  {NUMERO_INSCRICAO:'LOCAL-ABC',ID_PESSOA:'P4',ID_ORIGEM:'FORM:abc',ORIGEM_INSCRICAO:''},
  {NUMERO_INSCRICAO:'',ID_PESSOA:'P4',ORIGEM_INSCRICAO:'FORM_EVENTO'}
];
const presencas=[
  {ID_PESSOA:'P1',DATA:'15/09/2026',PERIODO:'MANHÃ'},
  {ID_PESSOA:'P1',DATA:'15/09/2026',PERIODO:'MANHÃ'},
  {ID_PESSOA:'P2',DATA:'15/09/2026',PERIODO:'MANHA'},
  {ID_PESSOA:'P3',DATA:'15/09/2026',PERIODO:'TARDE'},
  {ID_PESSOA:'P1',DATA:'16/09/2026',PERIODO:'MANHÃ'},
  {ID_PESSOA:'',DATA:'15/09/2026',PERIODO:'MANHÃ'}
];
const data={iso:'2026-09-15',display:'15/09/2026'};
const resultado=api.montarPainelAgregado_(participantes,inscricoes,presencas,3,data,'MANHÃ','2026-09-15T10:00:00-03:00');
assert.equal(resultado.participantesUnicos,4);
assert.equal(resultado.inscricoesTotal,5);
assert.equal(resultado.inscricoesEvent3,3);
assert.equal(resultado.inscricoesLocal,2);
assert.equal(resultado.participantesEvent3,3);
assert.equal(resultado.participantesLocal,2);
assert.equal(resultado.presencasHoje,3,'a mesma pessoa no mesmo período deve contar uma vez');
assert.equal(resultado.presencasPeriodo,2);
assert.equal(resultado.saldoCapacidade,1);
assert.equal(resultado.acimaCapacidade,0);
assert.ok(Math.abs(resultado.ocupacaoPercentual-66.6666666667)<1e-6);
assert.equal(resultado.comparecimentoPercentual,50);
assert.ok(Math.abs(resultado.inscricoesCapacidadePercentual-133.3333333333)<1e-6);
assert.deepEqual(JSON.parse(JSON.stringify(resultado.resumoPeriodos.map(item=>[item.data,item.periodo,item.presencas]))),[
  ['15/09/2026','MANHÃ',2],['15/09/2026','TARDE',1],['16/09/2026','MANHÃ',1]
]);
assert.ok(Math.abs(resultado.resumoPeriodos[0].capacidadePercentual-200/3)<1e-6);
assert.ok(Math.abs(resultado.resumoPeriodos[1].capacidadePercentual-100/3)<1e-6);

const vazio=api.montarPainelAgregado_([],[],[],458,data,'MANHÃ','agora');
assert.equal(vazio.ocupacaoPercentual,0);
assert.equal(vazio.comparecimentoPercentual,0);
assert.equal(vazio.inscricoesCapacidadePercentual,0);
assert.ok(Number.isFinite(vazio.ocupacaoPercentual));

const atingida=api.montarPainelAgregado_(participantes.slice(0,3),[],presencas.slice(0,3),2,data,'MANHÃ','agora');
assert.equal(atingida.saldoCapacidade,0);
assert.equal(atingida.acimaCapacidade,0);
assert.equal(atingida.ocupacaoPercentual,100);
const ultrapassada=api.montarPainelAgregado_(participantes,[],presencas.slice(0,4),1,data,'MANHÃ','agora');
assert.equal(ultrapassada.saldoCapacidade,0);
assert.equal(ultrapassada.acimaCapacidade,1);
assert.equal(ultrapassada.ocupacaoPercentual,200);

assert.equal(api.normalizarPeriodoPainel_('manhã'),'MANHÃ');
assert.equal(api.normalizarPeriodoPainel_('TARDE'),'TARDE');
assert.throws(()=>api.normalizarPeriodoPainel_('noite'),/MANHÃ ou TARDE/);
assert.deepEqual(JSON.parse(JSON.stringify(api.normalizarDataPainel_('2026-09-16',new Date()))),{iso:'2026-09-16',display:'16/09/2026'});
assert.throws(()=>api.normalizarDataPainel_('31/02/2026',new Date()),/inválida/);

assert.match(html,/const PANEL_VERSION='2026\.09\.13\.1',REFRESH_INTERVAL_MS=10000/);
assert.match(html,/if\(atualizando\)return false/,'atualizações sobrepostas devem ser bloqueadas');
assert.match(html,/action:'obterPainel'/);
assert.doesNotMatch(html,/obterIndiceParticipantes|buscarParticipantes|PARTICIPANTES\/PRESENCAS completos/);
assert.doesNotMatch(html,/\bCPF\b|telefone|e-mail/i,'painel não deve mencionar nem renderizar PII');
assert.match(painelSource,/CacheService\.getScriptCache\(\)/);
assert.match(painelSource,/CONFIG\.PAINEL_CACHE_SECONDS/);
const serializado=JSON.stringify(resultado).toLowerCase();
for(const campo of ['cpf','email','telefone','nome'])assert.equal(serializado.includes(campo),false,`resposta agregada não pode conter ${campo}`);

console.log('OK: painel agregado, privacidade, percentuais e frontend aprovados');
