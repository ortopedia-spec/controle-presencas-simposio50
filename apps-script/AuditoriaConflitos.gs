function aplicarContencaoConflitosEvent3V1() {
  const antes = obterBaseVersion_();
  registrarConflitoIdentidadeEvent3_('74994630', '21352060');
  registrarConflitoIdentidadeEvent3_('74994631', '26027939');
  const participantes = lerTabela_(CONFIG.SHEETS.PARTICIPANTES), inscricoes = lerTabela_(CONFIG.SHEETS.INSCRICOES);
  const candidatos = inscricoes.rows.filter(function(i){return idOrigemEvent3Conflitante_(i.ID_ORIGEM) && normalizarComparacao_(i.NOME_ORIGEM).indexOf('FELIPE CANDIDO') === -1;});
  const nomes = candidatos.map(function(i){return texto_(i.NOME_ORIGEM);}).filter(Boolean);
  const nome = valorHumanoUnico_(nomes, normalizarComparacao_).valor;
  let criado = false;
  if (nome && !participantes.rows.some(function(p){return normalizarComparacao_(p.NOME) === normalizarComparacao_(nome);})) {
    const id = 'P' + String(proximoIdPessoa_(participantes.rows)).padStart(6, '0');
    participantes.sheet.getRange(participantes.sheet.getLastRow()+1,1,1,CONFIG.HEADERS.PARTICIPANTES.length).setValues([[id,nome,normalizarComparacao_(nome),'','','','', '',0,'',agoraTexto_()]]); criado = true;
  }
  const mudou = criado || antes !== obterBaseVersion_();
  if (mudou) incrementarBaseVersion_();
  if (mudou) aquecerCacheBaseSeguro_();
  return { criado: criado, conflitos: obterConflitosIdentidadeEvent3_(), baseVersion: obterBaseVersion_() };
}
