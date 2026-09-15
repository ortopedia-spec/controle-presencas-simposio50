// Cache segmentado: cada bucket fica muito abaixo do limite por entrada do CacheService.
const CACHE_BUCKETS = 32;
// Altere quando o conteúdo serializado do cache mudar. Isso evita reutilizar buckets legados.
const CACHE_SCHEMA_VERSION = '7';

function obterConflitosIdentidadeEvent3_() {
  const bruto = PropertiesService.getScriptProperties().getProperty('CONFLITOS_IDENTIDADE_EVENT3');
  if (!bruto) return { numerosInscricao: [], idsOrigem: [] };
  try { const v = JSON.parse(bruto); return { numerosInscricao: v.numerosInscricao || [], idsOrigem: v.idsOrigem || [] }; }
  catch (_) { return { numerosInscricao: [], idsOrigem: [] }; }
}
function inscricaoEvent3Conflitante_(numero) { return obterConflitosIdentidadeEvent3_().numerosInscricao.indexOf(normalizarNumeroInscricao_(numero)) !== -1; }
function idOrigemEvent3Conflitante_(idOrigem) { return obterConflitosIdentidadeEvent3_().idsOrigem.indexOf(texto_(idOrigem)) !== -1; }
function registrarConflitoIdentidadeEvent3_(numero, idOrigem) {
  const atual = obterConflitosIdentidadeEvent3_(), n = normalizarNumeroInscricao_(numero), i = texto_(idOrigem);
  let mudou = false;
  if (n && atual.numerosInscricao.indexOf(n) === -1) { atual.numerosInscricao.push(n); mudou = true; }
  if (i && atual.idsOrigem.indexOf(i) === -1) { atual.idsOrigem.push(i); mudou = true; }
  PropertiesService.getScriptProperties().setProperty('CONFLITOS_IDENTIDADE_EVENT3', JSON.stringify(atual));
  return mudou;
}

function obterBaseVersion_() { return PropertiesService.getScriptProperties().getProperty('BASE_VERSION') || '1'; }
function incrementarBaseVersion_(chaveIdempotencia) {
  const propriedades = PropertiesService.getScriptProperties();
  const marcador = chaveIdempotencia ? 'BASE_VERSION_APLICADA_' + hashCurto_(chaveIdempotencia, 32) : '';
  if (marcador && propriedades.getProperty(marcador)) { invalidarCacheDaVersao_(obterBaseVersion_()); return obterBaseVersion_(); }
  const anterior = obterBaseVersion_();
  invalidarCacheDaVersao_(anterior);
  const proxima = String(Number(anterior) + 1);
  if (marcador) { const alteracoes={ BASE_VERSION: proxima };alteracoes[marcador]=proxima;propriedades.setProperties(alteracoes,false); }
  else propriedades.setProperty('BASE_VERSION', proxima);
  invalidarCacheDaVersao_(proxima);
  return proxima;
}
function chaveCache_(versao,tipo,bucket) { return ['PRESENCAS',CACHE_SCHEMA_VERSION,versao,tipo,bucket].join('_'); }
function bucketCache_(valor) { let h=0,s=texto_(valor);for(let i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;return Math.abs(h)%CACHE_BUCKETS; }
function chavesCacheVersao_(versao) { const chaves=[chaveCache_(versao,'META','0')];for(let i=0;i<CACHE_BUCKETS;i++){chaves.push(chaveCache_(versao,'PESSOA',i));chaves.push(chaveCache_(versao,'QR',i));}return chaves; }
function invalidarCacheDaVersao_(versao) { CacheService.getScriptCache().removeAll(chavesCacheVersao_(versao)); }
function invalidarIndice_() { invalidarCacheDaVersao_(obterBaseVersion_()); }
function aquecerCacheBaseSeguro_() { try { return garantirCacheBase_(); } catch (erro) { console.warn('[CACHE_WARM_FAILED] '+texto_(erro&&erro.message)); return ''; } }

function garantirCacheBase_() {
  const versao=obterBaseVersion_(),cache=CacheService.getScriptCache(),meta=chaveCache_(versao,'META','0');
  if(cache.get(meta))return versao;
  const lock=LockService.getScriptLock();
  try {
    lock.waitLock(20000); if(cache.get(meta))return versao;
    const pessoasBuckets=Array.from({length:CACHE_BUCKETS},()=>({})),qrBuckets=Array.from({length:CACHE_BUCKETS},()=>({})),crachaPorPessoa={},cpfPorPessoa={};
    const inscricoes=lerTabela_(CONFIG.SHEETS.INSCRICOES).rows;
    inscricoes.forEach(function(i){const id=texto_(i.ID_PESSOA),numero=normalizarNumeroInscricao_(i.NUMERO_INSCRICAO),conflito=inscricaoEvent3Conflitante_(numero)||idOrigemEvent3Conflitante_(i.ID_ORIGEM);if(id&&!conflito){crachaPorPessoa[id]=crachaPorPessoa[id]||[];crachaPorPessoa[id].push(texto_(i.NOME_CRACHA_ORIGEM));cpfPorPessoa[id]=cpfPorPessoa[id]||[];cpfPorPessoa[id].push(somenteDigitos_(i.CPF_ORIGEM));}if(numero&&!conflito)qrBuckets[bucketCache_(numero)][numero]={idPessoa:id,categoria:texto_(i.CATEGORIA)};});
    lerTabela_(CONFIG.SHEETS.PARTICIPANTES).rows.forEach(function(p){const id=texto_(p.ID_PESSOA);if(!id)return;const nome=texto_(p.NOME),nomesCrachaOrigem=crachaPorPessoa[id]||[],nomeCracha=nomeCrachaParaCache_(texto_(p.NOME_CRACHA),nomesCrachaOrigem);pessoasBuckets[bucketCache_(id)][id]={idPessoa:id,nome:nome,nomeCracha:nomeCracha,nomeExibicao:nomeCracha||nome,nomesCrachaOrigem:nomesCrachaOrigem,cpfsBusca:cpfsBuscaPessoa_(p.CPF,cpfPorPessoa[id]||[]),qtdInscricoes:Number(p.QTD_INSCRICOES)||0,busca:textoBuscaPessoa_(nome,p.NOME_NORMALIZADO,nomeCracha,nomesCrachaOrigem)};});
    for(let i=0;i<CACHE_BUCKETS;i++){cache.put(chaveCache_(versao,'PESSOA',i),JSON.stringify(pessoasBuckets[i]),CONFIG.CACHE_SECONDS);cache.put(chaveCache_(versao,'QR',i),JSON.stringify(qrBuckets[i]),CONFIG.CACHE_SECONDS);}
    cache.put(meta,JSON.stringify({versao:versao,buckets:CACHE_BUCKETS}),CONFIG.CACHE_SECONDS); return versao;
  } finally { if(lock.hasLock())lock.releaseLock(); }
}
function objetoCache_(versao,tipo,bucket) { const bruto=CacheService.getScriptCache().get(chaveCache_(versao,tipo,bucket));return bruto?JSON.parse(bruto):null; }
function objectoOuReconstruir_(versao,tipo,bucket) { const obj=objetoCache_(versao,tipo,bucket);if(obj!==null)return obj;invalidarCacheDaVersao_(versao);garantirCacheBase_();return objetoCache_(versao,tipo,bucket)||{}; }
function obterPessoaCache_(id) { const versao=garantirCacheBase_(),bucket=objectoOuReconstruir_(versao,'PESSOA',bucketCache_(id));return bucket[texto_(id)]||null; }
function obterQrCache_(numero) { const versao=garantirCacheBase_(),bucket=objectoOuReconstruir_(versao,'QR',bucketCache_(numero));return bucket[normalizarNumeroInscricao_(numero)]||null; }
function obterIndiceInterno_() { const versao=garantirCacheBase_(),pessoas={},inscricaoParaPessoa={};for(let i=0;i<CACHE_BUCKETS;i++){Object.assign(pessoas,objectoOuReconstruir_(versao,'PESSOA',i));Object.assign(inscricaoParaPessoa,objectoOuReconstruir_(versao,'QR',i));}return{baseVersion:versao,pessoas:pessoas,inscricaoParaPessoa:inscricaoParaPessoa}; }
function obterIndiceParticipantes_() { const i=obterIndiceInterno_();return{baseVersion:i.baseVersion,pessoas:Object.keys(i.pessoas).map(function(id){const p=i.pessoas[id];return{idPessoa:p.idPessoa,nome:p.nome,nomeCracha:p.nomeCracha,nomeExibicao:p.nomeExibicao,nomesBusca:nomesBuscaPublicas_(p),qtdInscricoes:p.qtdInscricoes};}),inscricaoParaPessoa:i.inscricaoParaPessoa}; }
function nomeCrachaParaCache_(canonico,valoresOrigem) {
  const valorOrigem=valorHumanoUnico_(valoresOrigem,normalizarComparacao_).valor;
  return valorOrigem||texto_(canonico);
}
function textoBuscaPessoa_(nome,nomeNormalizado,nomeCracha,nomesCrachaOrigem) { return normalizarComparacao_([nome,nomeNormalizado,nomeCracha].concat(nomesCrachaOrigem||[]).join(' ')); }
function nomesBuscaPublicas_(pessoa) { const vistos={};return [pessoa.nome,pessoa.nomeCracha,pessoa.nomeExibicao].concat(pessoa.nomesCrachaOrigem||[]).map(texto_).filter(function(valor){const chave=normalizarComparacao_(valor);if(!chave||vistos[chave])return false;vistos[chave]=true;return true;}); }
function cpfsBuscaPessoa_(canonico,origens) { const vistos={};return [canonico].concat(origens||[]).map(somenteDigitos_).filter(function(cpf){if(!/^\d{11}$/.test(cpf)||vistos[cpf])return false;vistos[cpf]=true;return true;}); }
function hashCurto_(valor,tamanho) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,texto_(valor),Utilities.Charset.UTF_8).map(function(byte){return ('0'+((byte+256)%256).toString(16)).slice(-2);}).join('').slice(0,tamanho||24).toUpperCase(); }
