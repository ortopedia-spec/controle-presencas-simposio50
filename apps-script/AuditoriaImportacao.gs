function auditarAtualizacoesImportacaoEvent3() {
  const resultado=auditarAtualizacoesImportacaoEvent3_();
  console.log(JSON.stringify(resultado,null,2));
  return resultado;
}
function repararNomeCrachaMelissaAlonso() { return repararNomeCrachaMelissaAlonso_(); }
function repararCpfContaminadoP000056() {
  const resultado=repararCpfContaminadoP000056_();
  console.log(JSON.stringify(resultado,null,2));
  return resultado;
}

function auditarAtualizacoesImportacaoEvent3_() {
  const participantes=lerTabela_(CONFIG.SHEETS.PARTICIPANTES),inscricoes=lerTabela_(CONFIG.SHEETS.INSCRICOES),importacoes=lerTabela_(CONFIG.SHEETS.IMPORTACOES);
  validarCabecalho_(participantes.headers,CONFIG.HEADERS.PARTICIPANTES,CONFIG.SHEETS.PARTICIPANTES);validarCabecalho_(inscricoes.headers,CONFIG.HEADERS.INSCRICOES,CONFIG.SHEETS.INSCRICOES);validarCabecalho_(importacoes.headers,CONFIG.HEADERS.IMPORTACOES,CONFIG.SHEETS.IMPORTACOES);
  const ultima=importacoes.rows.filter(function(i){return normalizarComparacao_(i.STATUS)==='SUCESSO';}).sort(function(a,b){return texto_(b.IMPORTADO_EM).localeCompare(texto_(a.IMPORTADO_EM));})[0];
  if(!ultima)return{somenteLeitura:true,totalAuditado:0,integros:0,suspeitos:0,idsSuspeitos:[],causas:[],observacao:'Nenhuma importação bem-sucedida encontrada.'};
  const porPessoa={};inscricoes.rows.filter(function(i){return normalizarComparacao_(i.ORIGEM_INSCRICAO)==='EVENT3';}).forEach(function(i){const id=texto_(i.ID_PESSOA);if(id)(porPessoa[id]=porPessoa[id]||[]).push(i);});
  const pessoasNovas=Math.max(0,Number(ultima.PESSOAS_NOVAS)||0),idsNovos={};participantes.rows.map(function(p){return texto_(p.ID_PESSOA);}).sort(function(a,b){return Number((b.match(/\d+$/)||['0'])[0])-Number((a.match(/\d+$/)||['0'])[0]);}).slice(0,pessoasNovas).forEach(function(id){idsNovos[id]=true;});
  const minutoReferencia=texto_(ultima.IMPORTADO_EM).slice(0,16),candidatos=participantes.rows.filter(function(p){const id=texto_(p.ID_PESSOA);return !idsNovos[id]&&texto_(p.ULTIMA_ATUALIZACAO).slice(0,16)===minutoReferencia&&!!porPessoa[id];});
  const suspeitos=[];
  candidatos.forEach(function(p){const registros=porPessoa[texto_(p.ID_PESSOA)]||[],causas=[];const crachas=registros.map(function(i){return normalizarComparacao_(i.NOME_CRACHA_ORIGEM);}).filter(Boolean);if(texto_(p.NOME_CRACHA)&&nomesClaramenteDiferentes_(p.NOME,p.NOME_CRACHA)&&crachas.indexOf(normalizarComparacao_(p.NOME_CRACHA))===-1)causas.push('NOME_CRACHA_SEM_ORIGEM_COMPATIVEL');[['EMAIL','EMAIL_ORIGEM'],['CPF','CPF_ORIGEM'],['TELEFONE','TELEFONE']].forEach(function(par){const canonico=normalizarComparacao_(p[par[0]]),origens=registros.map(function(i){return normalizarComparacao_(i[par[1]]);}).filter(Boolean);if(canonico&&origens.length&&origens.indexOf(canonico)===-1)causas.push(par[0]+'_DIVERGENTE_ORIGEM');});if(causas.length)suspeitos.push({idPessoa:texto_(p.ID_PESSOA),causas:causas});});
  return{somenteLeitura:true,referenciaImportacao:texto_(ultima.IMPORTADO_EM),totalAuditado:candidatos.length,integros:candidatos.length-suspeitos.length,suspeitos:suspeitos.length,idsSuspeitos:suspeitos.map(function(s){return s.idPessoa;}),causas:suspeitos,baseVersion:obterBaseVersion_()};
}

function repararNomeCrachaMelissaAlonso_() {
  const lock=LockService.getScriptLock();let reparada=false,versao=obterBaseVersion_();
  try{if(!lock.tryLock(30000))throw criarErro_('SISTEMA_OCUPADO','Há uma operação em andamento.');const participantes=lerTabela_(CONFIG.SHEETS.PARTICIPANTES),inscricoes=lerTabela_(CONFIG.SHEETS.INSCRICOES);validarCabecalho_(participantes.headers,CONFIG.HEADERS.PARTICIPANTES,CONFIG.SHEETS.PARTICIPANTES);validarCabecalho_(inscricoes.headers,CONFIG.HEADERS.INSCRICOES,CONFIG.SHEETS.INSCRICOES);const indice=participantes.rows.findIndex(function(p){return texto_(p.ID_PESSOA)==='P000056';});if(indice===-1)throw criarErro_('PESSOA_NAO_ENCONTRADA','P000056 não encontrada.');const pessoa=participantes.rows[indice];if(normalizarComparacao_(pessoa.NOME)!=='MELISSA ALONSO')throw criarErro_('REPARO_INTERROMPIDO','P000056 não corresponde ao caso confirmado.');const origemConfiavel=inscricoes.rows.filter(function(i){return texto_(i.ID_PESSOA)==='P000056';}).some(function(i){return texto_(i.NOME_CRACHA_ORIGEM);});if(origemConfiavel)throw criarErro_('REPARO_INTERROMPIDO','Há nome de crachá de origem preenchido; revisão manual necessária.');if(texto_(pessoa.NOME_CRACHA)!=='Simone Anselmo')return{reparada:false,idPessoa:'P000056',baseVersion:versao};const coluna=CONFIG.HEADERS.PARTICIPANTES.indexOf('NOME_CRACHA')+1;participantes.sheet.getRange(indice+2,coluna).setValue('');versao=incrementarBaseVersion_();reparada=true;}finally{if(lock.hasLock())lock.releaseLock();}
  if(reparada)aquecerCacheBaseSeguro_();return{reparada:reparada,idPessoa:'P000056',baseVersion:versao};
}

function repararCpfContaminadoP000056_() {
  const lock=LockService.getScriptLock();let reparada=false,versao=obterBaseVersion_(),resultado=null;
  try {
    if(!lock.tryLock(30000))throw criarErro_('SISTEMA_OCUPADO','Há uma operação em andamento.');
    const participantes=lerTabela_(CONFIG.SHEETS.PARTICIPANTES),inscricoes=lerTabela_(CONFIG.SHEETS.INSCRICOES);
    validarCabecalho_(participantes.headers,CONFIG.HEADERS.PARTICIPANTES,CONFIG.SHEETS.PARTICIPANTES);
    validarCabecalho_(inscricoes.headers,CONFIG.HEADERS.INSCRICOES,CONFIG.SHEETS.INSCRICOES);
    const indiceAlvo=participantes.rows.findIndex(function(p){return texto_(p.ID_PESSOA)==='P000056';}),pessoaLegitima=participantes.rows.find(function(p){return texto_(p.ID_PESSOA)==='P000348';});
    if(indiceAlvo===-1||!pessoaLegitima)throw criarErro_('REPARO_INTERROMPIDO','Os participantes guardados não foram encontrados.');
    const pessoaAlvo=participantes.rows[indiceAlvo];
    if(normalizarComparacao_(pessoaAlvo.NOME)!=='MELISSA ALONSO')throw criarErro_('REPARO_INTERROMPIDO','P000056 não corresponde ao caso confirmado.');
    const cpf=somenteDigitos_(pessoaAlvo.CPF);
    if(!cpf)return{reparada:false,jaEstavaVazio:true,guardasConfirmadas:true,cpfRemovido:true,p000348Preservado:true,baseVersion:versao};
    if(!nomesClaramenteDiferentes_(pessoaAlvo.NOME,pessoaLegitima.NOME))throw criarErro_('REPARO_INTERROMPIDO','Os nomes das pessoas guardadas não são inequivocamente diferentes.');
    const emailAlvo=normalizarEmail_(pessoaAlvo.EMAIL),emailLegitimo=normalizarEmail_(pessoaLegitima.EMAIL);
    if(!emailAlvo||!emailLegitimo||emailAlvo===emailLegitimo)throw criarErro_('REPARO_INTERROMPIDO','Os e-mails das pessoas guardadas não sustentam a separação esperada.');
    if(somenteDigitos_(pessoaLegitima.CPF)!==cpf)throw criarErro_('REPARO_INTERROMPIDO','P000348 não possui o CPF canônico esperado.');
    const origensAlvo=inscricoes.rows.filter(function(i){return texto_(i.ID_PESSOA)==='P000056';}),origensLegitimas=inscricoes.rows.filter(function(i){return texto_(i.ID_PESSOA)==='P000348';});
    if(!origensAlvo.length||origensAlvo.some(function(i){return somenteDigitos_(i.CPF_ORIGEM)===cpf;}))throw criarErro_('REPARO_INTERROMPIDO','Uma origem de P000056 sustenta o CPF; revisão manual necessária.');
    if(!origensLegitimas.some(function(i){return somenteDigitos_(i.CPF_ORIGEM)===cpf;}))throw criarErro_('REPARO_INTERROMPIDO','Nenhuma origem de P000348 sustenta o CPF.');
    const idsComCpf=participantes.rows.filter(function(p){return somenteDigitos_(p.CPF)===cpf;}).map(function(p){return texto_(p.ID_PESSOA);}).sort();
    if(idsComCpf.join('|')!=='P000056|P000348')throw criarErro_('REPARO_INTERROMPIDO','O CPF aparece em participantes fora do caso estritamente autorizado.');
    const colunaCpf=CONFIG.HEADERS.PARTICIPANTES.indexOf('CPF')+1;
    if(colunaCpf<1)throw criarErro_('REPARO_INTERROMPIDO','A coluna CPF não foi localizada.');
    participantes.sheet.getRange(indiceAlvo+2,colunaCpf).setValue('');
    versao=incrementarBaseVersion_();reparada=true;
    resultado={reparada:true,jaEstavaVazio:false,guardasConfirmadas:true,cpfRemovido:true,p000348Preservado:true,baseVersion:versao};
  } finally { if(lock.hasLock())lock.releaseLock(); }
  if(reparada)aquecerCacheBaseSeguro_();
  return resultado;
}
