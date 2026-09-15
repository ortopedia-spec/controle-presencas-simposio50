function doGet() { return respostaJson_({ ok: true, service: 'controle-presencas-simposio50' }); }

function doPost(e) {
  try {
    const payload = lerPayload_(e);
    const action = normalizarAcao_(payload.action);
    let data;
    switch (action) {
      case 'status': data = status_(); break;
      case 'obterbaseversion': data = { baseVersion: obterBaseVersion_() }; break;
      case 'obterindiceparticipantes': data = obterIndiceParticipantes_(); break;
      case 'buscarparticipantes': data = buscarParticipantes_(payload.termo); break;
      case 'buscarporinscricao': data = buscarPorInscricao_(payload.numeroInscricao); break;
      case 'obterpainel': data = obterPainel_(payload.data, payload.periodo); break;
      case 'registrarpresenca': data = registrarPresenca_(payload); break;
      case 'importarcredenciamento': data = importarCredenciamento_(payload); break;
      case 'aplicarcontencaoconflitoseventv': if (texto_(payload.tokenImportacao || payload.TOKEN_IMPORTACAO || payload.token) !== obterTokenImportacao_()) throw criarErro_('NAO_AUTORIZADO', 'Token de importação inválido.'); data = aplicarContencaoConflitosEvent3V1(); break;
      default: throw criarErro_('ACAO_INVALIDA', 'Ação não reconhecida.');
    }
    return respostaJson_({ ok: true, data: data });
  } catch (erro) { return respostaErro_(erro); }
}

function lerPayload_(e) {
  if (!e || !e.postData || !e.postData.contents) throw criarErro_('JSON_INVALIDO', 'Envie um JSON no corpo da requisição.');
  try { return JSON.parse(e.postData.contents); } catch (_) { throw criarErro_('JSON_INVALIDO', 'Não foi possível interpretar os dados enviados.'); }
}
function respostaJson_(objeto) { return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON); }
function respostaErro_(erro) { return respostaJson_({ ok: false, error: { code: erro && erro.code || 'ERRO_INTERNO', message: erro && erro.message || String(erro) } }); }
function criarErro_(code, message) { const erro = new Error(message); erro.code = code; return erro; }
function texto_(valor) { return valor === null || valor === undefined ? '' : String(valor).trim(); }
function normalizarComparacao_(valor) { return texto_(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }
function normalizarAcao_(valor) { return normalizarComparacao_(valor).toLowerCase().replace(/[^a-z]/g, ''); }
function normalizarNumeroInscricao_(valor) { return texto_(valor).replace(/\s+/g, ''); }
function linhaComoObjeto_(headers, values) { return headers.reduce(function(o, h, i) { o[h] = values[i] === undefined ? '' : values[i]; return o; }, {}); }
function spreadsheet_() { return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID); }
function sheetObrigatoria_(nome) { const sh = spreadsheet_().getSheetByName(nome); if (!sh) throw criarErro_('ABA_NAO_ENCONTRADA', 'A aba obrigatória não existe: ' + nome); return sh; }
function lerTabela_(nome) { const sh = sheetObrigatoria_(nome); const values = sh.getDataRange().getDisplayValues(); if (!values.length) return { sheet: sh, headers: [], rows: [] }; return { sheet: sh, headers: values[0].map(texto_), rows: values.slice(1).filter(r => r.some(v => texto_(v))).map(r => linhaComoObjeto_(values[0], r)) }; }
function obterConfiguracaoValor_(chave) { const valores=sheetObrigatoria_(CONFIG.SHEETS.CONFIG).getDataRange().getDisplayValues(),alvo=normalizarComparacao_(chave);for(let i=0;i<valores.length;i++)if(normalizarComparacao_(valores[i][0])===alvo)return texto_(valores[i].slice(1).find(texto_));return ''; }
