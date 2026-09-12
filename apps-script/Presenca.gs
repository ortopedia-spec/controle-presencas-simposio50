function periodoDoMomento_(agora) { return Number(Utilities.formatDate(agora, CONFIG.TIMEZONE, 'H')) < 12 ? 'MANHÃ' : 'TARDE'; }
function registrarPresenca_(payload) {
  const origem = texto_(payload.origemRegistro).toUpperCase();
  if (origem !== 'QR' && origem !== 'BUSCA_NOME') throw criarErro_('ORIGEM_INVALIDA', 'Origem de registro inválida.');
  const operador = texto_(payload.operador), dispositivo = texto_(payload.dispositivo);
  if (!operador || !dispositivo) throw criarErro_('IDENTIFICACAO_OPERACIONAL_OBRIGATORIA', 'Informe operador e dispositivo.');
  let pessoa, numero = '';
  if (origem === 'QR') { numero = normalizarNumeroInscricao_(payload.numeroInscricao); pessoa = buscarPorInscricao_(numero); }
  else { const p = obterIndiceInterno_().pessoas[texto_(payload.idPessoa)]; pessoa = sanitizarPessoa_(p); }
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(20000)) throw criarErro_('SISTEMA_OCUPADO', 'Há outro registro em andamento. Tente novamente.');
    const agora = new Date(), data = Utilities.formatDate(agora, CONFIG.TIMEZONE, 'dd/MM/yyyy'), hora = Utilities.formatDate(agora, CONFIG.TIMEZONE, 'HH:mm:ss'), periodo = periodoDoMomento_(agora);
    const tabela = lerTabela_(CONFIG.SHEETS.PRESENCAS);
    const existente = tabela.rows.find(function(r) { return texto_(r.ID_PESSOA) === pessoa.idPessoa && texto_(r.DATA) === data && texto_(r.PERIODO) === periodo; });
    if (existente) return { status: 'DUPLICADA', participante: pessoa, presenca: { data: texto_(existente.DATA), hora: texto_(existente.HORA), periodo: texto_(existente.PERIODO), dataHora: texto_(existente.DATA_HORA) } };
    const id = 'PR' + Utilities.formatDate(agora, CONFIG.TIMEZONE, 'yyyyMMddHHmmss') + '-' + Utilities.getUuid().slice(0, 8);
    const linha = [id, pessoa.idPessoa, numero, pessoa.nomeExibicao, Utilities.formatDate(agora, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss'), data, hora, periodo, operador, dispositivo, origem, texto_(payload.observacao)];
    tabela.sheet.getRange(tabela.sheet.getLastRow() + 1, 1, 1, linha.length).setValues([linha]);
    return { status: 'REGISTRADA', participante: pessoa, presenca: { idPresenca: id, data: data, hora: hora, periodo: periodo, dataHora: linha[4] } };
  } finally { if (lock.hasLock()) lock.releaseLock(); }
}
