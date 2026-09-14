import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../apps-script/AuditoriaImportacao.gs',import.meta.url),'utf8');
const headersParticipantes=['ID_PESSOA','NOME','NOME_NORMALIZADO','NOME_CRACHA','EMAIL','CPF','TELEFONE','NUMEROS_INSCRICAO','QTD_INSCRICOES','PRIMEIRA_INSCRICAO_EM','ULTIMA_ATUALIZACAO'];
const cpfFixture='11144477735';

function criarCenario({cpfAlvo=cpfFixture,nomeAlvo='Melissa Alonso',cpfOrigemAlvo='',nomeLegitimo='Pessoa Legítima'}={}) {
  const participantes=[
    {ID_PESSOA:'P000056',NOME:nomeAlvo,EMAIL:'alvo@example.org',CPF:cpfAlvo},
    {ID_PESSOA:'P000348',NOME:nomeLegitimo,EMAIL:'legitimo@example.org',CPF:cpfFixture}
  ];
  const inscricoes=[
    {ID_PESSOA:'P000056',CPF_ORIGEM:cpfOrigemAlvo},
    {ID_PESSOA:'P000348',CPF_ORIGEM:cpfFixture}
  ];
  let baseVersion=5,incrementos=0,aquecimentos=0;
  const sheet={getRange:(linha,coluna)=>({setValue:valor=>{assert.equal(coluna,headersParticipantes.indexOf('CPF')+1);participantes[linha-2].CPF=valor;}})};
  const lock={locked:false,tryLock(){this.locked=true;return true;},hasLock(){return this.locked;},releaseLock(){this.locked=false;}};
  const context={
    console:{log(){}},
    CONFIG:{SHEETS:{PARTICIPANTES:'PARTICIPANTES',INSCRICOES:'INSCRICOES'},HEADERS:{PARTICIPANTES:headersParticipantes,INSCRICOES:['ID_PESSOA','CPF_ORIGEM']}},
    LockService:{getScriptLock:()=>lock},
    lerTabela_:nome=>nome==='PARTICIPANTES'?{headers:headersParticipantes,rows:participantes,sheet}:{headers:['ID_PESSOA','CPF_ORIGEM'],rows:inscricoes},
    validarCabecalho_:()=>{},
    texto_:valor=>valor==null?'':String(valor).trim(),
    normalizarComparacao_:valor=>String(valor??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim(),
    somenteDigitos_:valor=>String(valor??'').replace(/\D/g,''),
    normalizarEmail_:valor=>String(valor??'').trim().toLowerCase(),
    nomesClaramenteDiferentes_:(a,b)=>{const palavras=valor=>new Set(String(valor??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().split(/\s+/).filter(x=>x.length>2)),pa=palavras(a),pb=palavras(b);return pa.size>0&&pb.size>0&&![...pa].some(x=>pb.has(x));},
    criarErro_:(code,message)=>Object.assign(new Error(message),{code}),
    obterBaseVersion_:()=>String(baseVersion),
    incrementarBaseVersion_:()=>{incrementos++;baseVersion++;return String(baseVersion);},
    aquecerCacheBaseSeguro_:()=>{aquecimentos++;}
  };
  vm.createContext(context);
  vm.runInContext(`${source};globalThis.executar_=repararCpfContaminadoP000056_;`,context);
  return{context,participantes,inscricoes,executar:context.executar_,metricas:()=>({baseVersion,incrementos,aquecimentos})};
}

{
  const c=criarCenario(),legitimoAntes=structuredClone(c.participantes[1]),resultado=c.executar();
  assert.equal(resultado.reparada,true,'cenário confirmado deve reparar');
  assert.equal(c.participantes[0].CPF,'','somente o CPF alvo deve ser limpo');
  assert.deepEqual(c.participantes[1],legitimoAntes,'P000348 deve permanecer inalterado');
  assert.deepEqual(c.metricas(),{baseVersion:6,incrementos:1,aquecimentos:1});
}

{
  const c=criarCenario({cpfOrigemAlvo:cpfFixture});
  assert.throws(()=>c.executar(),/origem de P000056 sustenta o CPF/);
  assert.equal(c.participantes[0].CPF,cpfFixture);
  assert.equal(c.metricas().incrementos,0);
}

{
  const c=criarCenario({nomeAlvo:'Outro Nome'});
  assert.throws(()=>c.executar(),/não corresponde ao caso confirmado/);
  assert.equal(c.metricas().incrementos,0);
}

{
  const c=criarCenario({cpfAlvo:''}),resultado=c.executar();
  assert.equal(resultado.reparada,false);
  assert.equal(resultado.jaEstavaVazio,true);
  assert.deepEqual(c.metricas(),{baseVersion:5,incrementos:0,aquecimentos:0});
}

assert.match(source,/function repararCpfContaminadoP000056\(\)/,'wrapper público deve persistir no seletor');
assert.match(source,/getRange\(indiceAlvo\+2,colunaCpf\)\.setValue\(''\)/,'reparo deve escrever somente a célula CPF guardada');
console.log('OK: reparo guardado de CPF aprovado');
