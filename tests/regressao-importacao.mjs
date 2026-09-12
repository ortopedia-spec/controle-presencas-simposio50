import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps-script/Importacao.gs', import.meta.url), 'utf8');
let scriptToken = '';
const context = {
  texto_: value => value == null ? '' : String(value).trim(),
  normalizarNumeroInscricao_: value => String(value ?? '').trim().replace(/\s+/g, ''),
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === 'TOKEN_IMPORTACAO' ? scriptToken : '' }) },
  sheetObrigatoria_: () => ({ getDataRange: () => ({ getDisplayValues: () => [['TOKEN_IMPORTACAO', 'token-da-config']] }) }),
  CONFIG: { SHEETS: { CONFIG: 'CONFIG' } },
  normalizarComparacao_: value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
};
vm.createContext(context);
vm.runInContext(`${source}; globalThis.exports_={numerosInscricaoUnicos_,normalizarRegistroImportado_,obterTokenImportacao_};`, context);
const api = context.exports_;

const oito = '75802661|75102633|75802664|75102635|75102634|75102636|75802662|75802663'.split('|');
const nove = api.numerosInscricaoUnicos_([...oito, '75102633', '99999999']);
assert.equal(nove.length, 9, '8 inscrições existentes + 1 nova devem resultar em 9');
assert.equal(nove.join('|'), `${oito.join('|')}|99999999`);

const payload = { arquivo: 'ListaCredenciamento_15-09-2026_08-00-00.xlsx' };
const registro = api.normalizarRegistroImportado_({ numeroInscricao: '75102633', idOrigem: '1', nome: 'Amanda', nomeCracha: 'Amanda Miranda', email: 'a@example.org', cpf: '123.456.789-00', telefone: '1', categoria: 'MANHA', dataInscricao: '15/09/2026', horaInscricao: '09:00:00' }, payload);
assert.equal(registro.arquivoOrigem, payload.arquivo, 'arquivo do payload deve preencher ARQUIVO_ORIGEM');
assert.equal(registro.numeroInscricao, '75102633');
assert.equal(api.obterTokenImportacao_(), 'token-da-config', 'CONFIG deve ser fallback de token');
scriptToken = 'token-da-script-property';
assert.equal(api.obterTokenImportacao_(), scriptToken, 'Script Properties deve ter prioridade sobre CONFIG');

assert.match(source, /payload\.arquivoDataHora\|\|payload\.dataHoraArquivo/, 'arquivoDataHora deve ter prioridade no log');
assert.match(source, /arquivo: texto_\(payload\.arquivo\)/, 'resposta deve preservar arquivo para PowerShell');
const cache = fs.readFileSync(new URL('../apps-script/Cache.gs', import.meta.url), 'utf8');
assert.match(cache, /const CACHE_BUCKETS = 32/, 'cache deve usar buckets');
assert.match(cache, /invalidarCacheDaVersao_\(anterior\)/, 'versão anterior deve ser invalidada');
console.log('OK: regressões de importação e cache aprovadas');
