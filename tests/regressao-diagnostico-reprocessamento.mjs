import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps-script/InscricaoLocal.gs', import.meta.url), 'utf8');
assert.match(source, /function reprocessarInscricoesLocalPendentes\(\)/, 'função de reprocessamento deve existir');
const logs = [];
const context = {
  FORM_LOCAL: { PROPERTIES: { ID: 'FORM_ID' } },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'FORM-1' }) },
  CONFIG: { SHEETS: { INSCRICOES_LOCAL_CONTROLE: 'CONTROLE' } },
  texto_: value => value == null ? '' : String(value).trim(),
  normalizarComparacao_: value => String(value ?? '').trim().toUpperCase(),
  lerTabela_: () => ({ rows: [] }),
  FormApp: { openById: () => ({ getResponses: () => [{ getId: () => 'RESPOSTA-REAL' }] }) },
  extrairRegistroFormulario_: () => ({ responseId: 'RESPOSTA-REAL' }),
  processarInscricaoLocal_: () => { const error = new Error('Falha técnica da fixture'); error.code = 'CAUSA_FIXTURE'; throw error; },
  criarErro_: (code, message) => { const error = new Error(message); error.code = code; return error; },
  console: { log: value => logs.push(value) }
};
vm.createContext(context);
vm.runInContext(`${source}; extrairRegistroFormulario_=()=>({responseId:'RESPOSTA-REAL'}); processarInscricaoLocal_=()=>{const error=new Error('Falha técnica da fixture');error.code='CAUSA_FIXTURE';throw error;}; globalThis.executar_=reprocessarInscricoesLocalPendentes;`, context);
const resultado = context.executar_();
assert.deepEqual(JSON.parse(JSON.stringify(resultado)), { analisadas: 1, reprocessadas: 0, erros: 1, errosDetalhes: [{ codigo: 'CAUSA_FIXTURE', mensagemTecnica: 'Falha técnica da fixture' }] });
assert.equal(logs.length, 1, 'diagnóstico deve registrar um único resumo agregado');
console.log('OK: diagnóstico de erro individual do reprocessamento sem PII');
