function buscarPorInscricao_(numeroInscricao) {
  const numero = normalizarNumeroInscricao_(numeroInscricao); if (!numero) throw criarErro_('INSCRICAO_OBRIGATORIA', 'Informe o número de inscrição.');
  const match = obterQrCache_(numero);
  if (!match) throw criarErro_('QR_NAO_LOCALIZADO', 'QR não localizado.');
  return sanitizarPessoa_(obterPessoaCache_(match.idPessoa), numero, match.categoria);
}
function buscarParticipantes_(termo) {
  const q = normalizarComparacao_(termo); if (q.length < 2) throw criarErro_('BUSCA_CURTA', 'Digite ao menos 2 caracteres.');
  const partes = q.split(' '), indice = obterIndiceInterno_();
  const encontrados = Object.keys(indice.pessoas).map(id => indice.pessoas[id]).filter(p => partes.every(t => p.busca.indexOf(t) !== -1)).slice(0, CONFIG.MAX_SEARCH_RESULTS);
  return { baseVersion: indice.baseVersion, participantes: encontrados.map(p => sanitizarPessoa_(p)) };
}
function sanitizarPessoa_(pessoa, numeroInscricaoLido, categoriaInscricaoLida) {
  if (!pessoa) throw criarErro_('PARTICIPANTE_NAO_LOCALIZADO', 'Participante não localizado.');
  return { idPessoa: pessoa.idPessoa, nome: pessoa.nome, nomeCracha: pessoa.nomeCracha, nomeExibicao: pessoa.nomeExibicao, qtdInscricoes: pessoa.qtdInscricoes, numeroInscricaoLido: numeroInscricaoLido || '', categoriaInscricaoLida: categoriaInscricaoLida || '' };
}
function status_() { const agora = new Date(); return { baseVersion: obterBaseVersion_(), dataHoraServidor: Utilities.formatDate(agora, CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"), periodo: periodoDoMomento_(agora) }; }
