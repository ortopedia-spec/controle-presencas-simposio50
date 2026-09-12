import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps-script/Importacao.gs', import.meta.url), 'utf8');
const migracao = fs.readFileSync(new URL('../apps-script/Migracao.gs', import.meta.url), 'utf8');
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
vm.runInContext(`${source};${migracao}; globalThis.exports_={numerosInscricaoUnicos_,normalizarRegistroImportado_,obterTokenImportacao_,avaliarEnriquecimentoCanonico_,valorHumanoUnico_,completarPessoa_};`, context);
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

const participante = { ID_PESSOA: 'P000007', NOME: 'Ortopedia SORRI', NOME_CRACHA: '', EMAIL: '', CPF: '', NUMEROS_INSCRICAO: 'nao-mudar', QTD_INSCRICOES: '8' };
const umaPessoa = api.avaliarEnriquecimentoCanonico_(participante, Array.from({ length: 7 }, () => ({ NOME_CRACHA_ORIGEM: '', EMAIL_ORIGEM: '', CPF_ORIGEM: '' })).concat([{ NOME_CRACHA_ORIGEM: 'Diego Bento', EMAIL_ORIGEM: '', CPF_ORIGEM: '' }]));
assert.equal(umaPessoa.alterado, true); assert.equal(participante.NOME, 'Ortopedia SORRI'); assert.equal(participante.NOME_CRACHA, 'Diego Bento');
const conflito = api.avaliarEnriquecimentoCanonico_({ NOME_CRACHA: '', EMAIL: '', CPF: '' }, [{ NOME_CRACHA_ORIGEM: 'Diego Bento' }, { NOME_CRACHA_ORIGEM: 'João Silva' }]);
assert.equal(conflito.alterado, false); assert.equal(conflito.conflitos[0].campo, 'NOME_CRACHA');
const preenchido = api.avaliarEnriquecimentoCanonico_({ NOME_CRACHA: 'Nome Canônico', EMAIL: '', CPF: '' }, [{ NOME_CRACHA_ORIGEM: 'Diego Bento' }]);
assert.equal(preenchido.alterado, false, 'nome de crachá canônico não pode ser sobrescrito');
const reimportada = { NOME: 'Ortopedia SORRI', NOME_CRACHA: '', EMAIL: '', CPF: '', TELEFONE: '', NUMEROS_INSCRICAO: oito.join('|'), QTD_INSCRICOES: 8 };
assert.equal(api.completarPessoa_(reimportada, { nomeCracha: 'Diego Bento', email: '', cpf: '', telefone: '' }), true);
assert.equal(reimportada.NOME_CRACHA, 'Diego Bento'); assert.equal(reimportada.NUMEROS_INSCRICAO, oito.join('|')); assert.equal(reimportada.QTD_INSCRICOES, 8);
assert.match(source, /if \(porInscricao\[r\.numeroInscricao\]\)/, 'QR existente deve seguir o caminho de enriquecimento');

assert.match(source, /payload\.arquivoDataHora\|\|payload\.dataHoraArquivo/, 'arquivoDataHora deve ter prioridade no log');
assert.match(source, /arquivo: texto_\(payload\.arquivo\)/, 'resposta deve preservar arquivo para PowerShell');
const cache = fs.readFileSync(new URL('../apps-script/Cache.gs', import.meta.url), 'utf8');
assert.match(cache, /const CACHE_BUCKETS = 32/, 'cache deve usar buckets');
assert.match(cache, /invalidarCacheDaVersao_\(anterior\)/, 'versão anterior deve ser invalidada');
vm.runInContext(`${cache}; globalThis.cacheExports_={nomeCrachaParaCache_};`, context);
assert.equal(context.cacheExports_.nomeCrachaParaCache_('', ['Diego Bento']), 'Diego Bento', 'cache deve usar o único nome de crachá de origem');
assert.equal(context.cacheExports_.nomeCrachaParaCache_('', ['Diego Bento', 'João Silva']), '', 'cache não deve escolher nome em conflito');
console.log('OK: regressões de importação e cache aprovadas');
