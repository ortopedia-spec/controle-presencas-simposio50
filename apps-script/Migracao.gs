// Execute manualmente uma única vez, após conferir a cópia da planilha. Não é chamada pelo deploy.
function reconciliarDadosCanonicosParticipantes() {
  const lock=LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const participantes=lerTabela_(CONFIG.SHEETS.PARTICIPANTES),inscricoes=lerTabela_(CONFIG.SHEETS.INSCRICOES);
    validarCabecalho_(participantes.headers,CONFIG.HEADERS.PARTICIPANTES,CONFIG.SHEETS.PARTICIPANTES);
    const porPessoa={};
    inscricoes.rows.forEach(function(i){const id=texto_(i.ID_PESSOA);if(id){porPessoa[id]=porPessoa[id]||[];porPessoa[id].push(i);}});
    const resumo={participantesAnalisados:participantes.rows.length,participantesAtualizados:0,nomeCrachaPreenchidos:0,emailPreenchidos:0,cpfPreenchidos:0,conflitos:[]};
    participantes.rows.forEach(function(p,index){
      const resultado=avaliarEnriquecimentoCanonico_(p,porPessoa[texto_(p.ID_PESSOA)]||[]);
      if(resultado.conflitos.length)resumo.conflitos.push({idPessoa:texto_(p.ID_PESSOA),campos:resultado.conflitos});
      if(!resultado.alterado)return;
      p.ULTIMA_ATUALIZACAO=agoraTexto_();
      participantes.sheet.getRange(index+2,1,1,CONFIG.HEADERS.PARTICIPANTES.length).setValues([linhaPessoa_(p)]);
      resumo.participantesAtualizados++;
      if(resultado.preenchidos.NOME_CRACHA)resumo.nomeCrachaPreenchidos++;
      if(resultado.preenchidos.EMAIL)resumo.emailPreenchidos++;
      if(resultado.preenchidos.CPF)resumo.cpfPreenchidos++;
    });
    if(resumo.participantesAtualizados)resumo.baseVersion=incrementarBaseVersion_();else resumo.baseVersion=obterBaseVersion_();
    return resumo;
  } finally { if(lock.hasLock())lock.releaseLock(); }
}

function avaliarEnriquecimentoCanonico_(participante,inscricoes) {
  const campos=[['NOME_CRACHA','NOME_CRACHA_ORIGEM',normalizarComparacao_],['EMAIL','EMAIL_ORIGEM',normalizarEmail_],['CPF','CPF_ORIGEM',somenteDigitos_]];
  const preenchidos={},conflitos=[];let alterado=false;
  campos.forEach(function(def){
    const canonico=def[0],origem=def[1],normalizar=def[2];
    if(texto_(participante[canonico]))return;
    const candidato=valorHumanoUnico_(inscricoes.map(i=>texto_(i[origem])),normalizar);
    if(candidato.conflito){conflitos.push({campo:canonico,valores:candidato.valores});return;}
    if(candidato.valor){participante[canonico]=candidato.valor;preenchidos[canonico]=true;alterado=true;}
  });
  return {alterado:alterado,preenchidos:preenchidos,conflitos:conflitos};
}

function valorHumanoUnico_(valores,normalizar) {
  const unicos={},humanos=[];
  valores.forEach(function(valor){const humano=texto_(valor),chave=humano&&normalizar(humano);if(chave&&!unicos[chave]){unicos[chave]=humano;humanos.push(humano);}});
  return {valor:humanos.length===1?humanos[0]:'',conflito:humanos.length>1,valores:humanos};
}
