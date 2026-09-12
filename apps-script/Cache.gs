// Cache segmentado: cada bucket fica muito abaixo do limite por entrada do CacheService.
const CACHE_BUCKETS = 32;

function obterBaseVersion_() { return PropertiesService.getScriptProperties().getProperty('BASE_VERSION') || '1'; }
function incrementarBaseVersion_() {
  const anterior = obterBaseVersion_();
  invalidarCacheDaVersao_(anterior);
  const proxima = String(Number(anterior) + 1);
  PropertiesService.getScriptProperties().setProperty('BASE_VERSION', proxima);
  invalidarCacheDaVersao_(proxima);
  return proxima;
}
function chaveCache_(versao,tipo,bucket) { return ['PRESENCAS',versao,tipo,bucket].join('_'); }
function bucketCache_(valor) { let h=0,s=texto_(valor);for(let i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;return Math.abs(h)%CACHE_BUCKETS; }
function chavesCacheVersao_(versao) { const chaves=[chaveCache_(versao,'META','0')];for(let i=0;i<CACHE_BUCKETS;i++){chaves.push(chaveCache_(versao,'PESSOA',i));chaves.push(chaveCache_(versao,'QR',i));}return chaves; }
function invalidarCacheDaVersao_(versao) { CacheService.getScriptCache().removeAll(chavesCacheVersao_(versao)); }
function invalidarIndice_() { invalidarCacheDaVersao_(obterBaseVersion_()); }

function garantirCacheBase_() {
  const versao=obterBaseVersion_(),cache=CacheService.getScriptCache(),meta=chaveCache_(versao,'META','0');
  if(cache.get(meta))return versao;
  const lock=LockService.getScriptLock();
  try {
    lock.waitLock(20000); if(cache.get(meta))return versao;
    const pessoasBuckets=Array.from({length:CACHE_BUCKETS},()=>({})),qrBuckets=Array.from({length:CACHE_BUCKETS},()=>({}));
    lerTabela_(CONFIG.SHEETS.PARTICIPANTES).rows.forEach(function(p){const id=texto_(p.ID_PESSOA);if(!id)return;const nome=texto_(p.NOME),nomeCracha=texto_(p.NOME_CRACHA);pessoasBuckets[bucketCache_(id)][id]={idPessoa:id,nome:nome,nomeCracha:nomeCracha,nomeExibicao:nomeCracha||nome,qtdInscricoes:Number(p.QTD_INSCRICOES)||0,busca:normalizarComparacao_([nome,p.NOME_NORMALIZADO,nomeCracha].join(' '))};});
    lerTabela_(CONFIG.SHEETS.INSCRICOES).rows.forEach(function(i){const numero=normalizarNumeroInscricao_(i.NUMERO_INSCRICAO),id=texto_(i.ID_PESSOA);if(numero)qrBuckets[bucketCache_(numero)][numero]={idPessoa:id,categoria:texto_(i.CATEGORIA)};});
    for(let i=0;i<CACHE_BUCKETS;i++){cache.put(chaveCache_(versao,'PESSOA',i),JSON.stringify(pessoasBuckets[i]),CONFIG.CACHE_SECONDS);cache.put(chaveCache_(versao,'QR',i),JSON.stringify(qrBuckets[i]),CONFIG.CACHE_SECONDS);}
    cache.put(meta,JSON.stringify({versao:versao,buckets:CACHE_BUCKETS}),CONFIG.CACHE_SECONDS); return versao;
  } finally { if(lock.hasLock())lock.releaseLock(); }
}
function objetoCache_(versao,tipo,bucket) { const bruto=CacheService.getScriptCache().get(chaveCache_(versao,tipo,bucket));return bruto?JSON.parse(bruto):null; }
function objectoOuReconstruir_(versao,tipo,bucket) { const obj=objetoCache_(versao,tipo,bucket);if(obj!==null)return obj;invalidarCacheDaVersao_(versao);garantirCacheBase_();return objetoCache_(versao,tipo,bucket)||{}; }
function obterPessoaCache_(id) { const versao=garantirCacheBase_(),bucket=objectoOuReconstruir_(versao,'PESSOA',bucketCache_(id));return bucket[texto_(id)]||null; }
function obterQrCache_(numero) { const versao=garantirCacheBase_(),bucket=objectoOuReconstruir_(versao,'QR',bucketCache_(numero));return bucket[normalizarNumeroInscricao_(numero)]||null; }
function obterIndiceInterno_() { const versao=garantirCacheBase_(),pessoas={},inscricaoParaPessoa={};for(let i=0;i<CACHE_BUCKETS;i++){Object.assign(pessoas,objectoOuReconstruir_(versao,'PESSOA',i));Object.assign(inscricaoParaPessoa,objectoOuReconstruir_(versao,'QR',i));}return{baseVersion:versao,pessoas:pessoas,inscricaoParaPessoa:inscricaoParaPessoa}; }
function obterIndiceParticipantes_() { const i=obterIndiceInterno_();return{baseVersion:i.baseVersion,pessoas:Object.keys(i.pessoas).map(function(id){const p=i.pessoas[id];return{idPessoa:p.idPessoa,nome:p.nome,nomeCracha:p.nomeCracha,nomeExibicao:p.nomeExibicao,qtdInscricoes:p.qtdInscricoes};}),inscricaoParaPessoa:i.inscricaoParaPessoa}; }
