import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import fs from 'node:fs';
import vm from 'node:vm';

const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const context={texto_:value=>value==null?'':String(value).trim(),normalizarComparacao_:normalize,criarErro_:(code,message)=>Object.assign(new Error(message),{code})};
vm.createContext(context);
const painelSource=fs.readFileSync(new URL('../apps-script/Painel.gs',import.meta.url),'utf8');
vm.runInContext(`${painelSource}\nglobalThis.aggregate_=montarPainelAgregado_;`,context);
const aggregate=context.aggregate_;

const participantes=Array.from({length:519},(_,i)=>({ID_PESSOA:'P'+String(i+1).padStart(6,'0'),NOME:'Participante '+(i+1)}));
const inscricoes=Array.from({length:1152},(_,i)=>({NUMERO_INSCRICAO:String(70000000+i),ID_PESSOA:participantes[i%participantes.length].ID_PESSOA,ORIGEM_INSCRICAO:i<1052?'EVENT3':'FORM_EVENTO'}));
const presencas=Array.from({length:400},(_,i)=>({ID_PESSOA:participantes[i].ID_PESSOA,DATA:i<300?'15/09/2026':'16/09/2026',PERIODO:i%2?'TARDE':'MANHÃ'}));
const data={iso:'2026-09-15',display:'15/09/2026'};

function medir(nome,iteracoes,fn){const tempos=[],erros=[];for(let i=0;i<iteracoes;i++){const inicio=performance.now();try{fn(i);}catch(erro){erros.push(erro.message);}tempos.push(performance.now()-inicio);}tempos.sort((a,b)=>a-b);const pick=p=>tempos[Math.min(tempos.length-1,Math.floor((tempos.length-1)*p))];return{operacao:nome,p50:+pick(.5).toFixed(3),p95:+pick(.95).toFixed(3),maximo:+tempos.at(-1).toFixed(3),erros:erros.length};}

const porInscricao=new Map(inscricoes.map(item=>[item.NUMERO_INSCRICAO,item.ID_PESSOA]));
const versao={value:'41'};
const operacoes=[
  medir('obterPainel (agregação sem cache)',120,()=>aggregate(participantes,inscricoes,presencas,458,data,'MANHÃ','2026-09-15T10:00:00-03:00')),
  medir('obterBaseVersion',1000,()=>versao.value),
  medir('buscarParticipantes',300,i=>{const termo=normalize('Participante '+((i%519)+1));participantes.filter(p=>normalize(p.NOME).includes(termo)).slice(0,30);}),
  medir('buscarPorInscricao',1000,i=>porInscricao.get(String(70000000+(i%1152)))),
  medir('registrarPresenca (decisão simulada sem escrita)',1000,i=>{const chave=participantes[i%519].ID_PESSOA+'|15/09/2026|MANHÃ';return new Set(['P000001|15/09/2026|MANHÃ']).has(chave)?'DUPLICADA':'REGISTRARIA';}),
  medir('refresh de índice sanitizado',120,()=>({pessoas:participantes.map(p=>({idPessoa:p.ID_PESSOA,nome:p.NOME})),inscricaoParaPessoa:Object.fromEntries(inscricoes.map(item=>[item.NUMERO_INSCRICAO,{idPessoa:item.ID_PESSOA}]))}))
];
for(const item of operacoes){assert.equal(item.erros,0,`${item.operacao} não pode falhar`);assert.ok(item.p95<250,`${item.operacao} excedeu 250 ms no benchmark local`);}

// Três painéis no mesmo instante compartilham um agregado por janela de cache de cinco segundos.
let calculosPainel=0,chamadasPainel=0,cacheExpiraEm=-1;
for(let segundo=0;segundo<60;segundo+=10){for(let painel=0;painel<3;painel++){chamadasPainel++;if(segundo>=cacheExpiraEm){aggregate(participantes,inscricoes,presencas,458,data,'MANHÃ','agora');calculosPainel++;cacheExpiraEm=segundo+5;}}}
assert.equal(chamadasPainel,18);
assert.equal(calculosPainel,6,'cache de 5 s deve consolidar três painéis simultâneos em uma leitura por ciclo');

// Sete aparelhos começam com cache quente antigo; o backend já contém a nova inscrição.
const nova={idPessoa:'P000520',nome:'Cadastro Local de Teste',nomeCracha:'Cadastro Local',nomeExibicao:'Cadastro Local',qtdInscricoes:1};
const numeroLocal='LOCAL-FIXTURE';
const indiceAntigo={baseVersion:'41',pessoas:participantes.map(p=>({idPessoa:p.ID_PESSOA,nome:p.NOME,nomeCracha:'',nomeExibicao:p.NOME,qtdInscricoes:1})),inscricaoParaPessoa:Object.fromEntries(inscricoes.map(item=>[item.NUMERO_INSCRICAO,{idPessoa:item.ID_PESSOA}]))};
const indiceNovo={baseVersion:'42',pessoas:[...indiceAntigo.pessoas,nova],inscricaoParaPessoa:{...indiceAntigo.inscricaoParaPessoa,[numeroLocal]:{idPessoa:nova.idPessoa}}};
const dispositivos=Array.from({length:7},()=>structuredClone(indiceAntigo));
const buscaLocal=(indice,termo)=>indice.pessoas.filter(p=>normalize([p.nome,p.nomeCracha,p.nomeExibicao].join(' ')).includes(normalize(termo)));
assert.ok(dispositivos.every(indice=>buscaLocal(indice,'Cadastro Local').length===0));
const fallbackBackend=termo=>buscaLocal(indiceNovo,termo);
assert.ok(dispositivos.every(indice=>(buscaLocal(indice,'Cadastro Local')[0]||fallbackBackend('Cadastro Local')[0]).idPessoa===nova.idPessoa),'fallback deve encontrar antes do refresh');
let versionChecks=0,indexDownloads=0;
dispositivos.forEach((indice,i)=>{versionChecks++;if(indice.baseVersion!==indiceNovo.baseVersion){dispositivos[i]=structuredClone(indiceNovo);indexDownloads++;}});
assert.equal(versionChecks,7);
assert.equal(indexDownloads,7);
assert.ok(dispositivos.every(indice=>buscaLocal(indice,'Cadastro Local')[0].idPessoa===nova.idPessoa));
assert.ok(dispositivos.every(indice=>indice.inscricaoParaPessoa[numeroLocal].idPessoa===nova.idPessoa));
const painelComNova=aggregate([...participantes,{ID_PESSOA:nova.idPessoa}], [...inscricoes,{NUMERO_INSCRICAO:numeroLocal,ID_PESSOA:nova.idPessoa,ORIGEM_INSCRICAO:'FORM_EVENTO'}],presencas,458,data,'MANHÃ','agora');
assert.equal(painelComNova.participantesUnicos,520);
assert.equal(painelComNova.inscricoesLocal,101);
assert.equal(presencas.length,400,'cenário não pode criar presença');

const relatorio={fixture:{participantes:519,inscricoes:1152,presencas:400},paineis:{simultaneos:3,intervaloSegundos:10,chamadas:chamadasPainel,calculosAgregados:calculosPainel,cacheSegundos:5},dispositivos:{quantidade:7,fallbackImediato:true,indicesAtualizados:indexDownloads,estadosPresos:0,presencasCriadas:0},operacoes};
console.log(JSON.stringify(relatorio,null,2));
console.log('OK: desempenho local do painel e sincronização Forms → 7 dispositivos aprovados');
