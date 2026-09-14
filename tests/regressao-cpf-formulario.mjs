import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps-script/InscricaoLocal.gs', import.meta.url), 'utf8');
const inicio = source.indexOf('function opcoesCategoriaFormulario_');
const fim = source.indexOf('function numeroInscricaoLocal_');
assert.ok(inicio >= 0 && fim > inicio, 'funções de validação devem existir');

const context = {
  FORM_LOCAL: { PROPERTIES: { ID: 'FORM_ID' } },
  texto_: value => value == null ? '' : String(value).trim(),
  normalizarComparacao_: value => String(value ?? '').trim().toUpperCase(),
  somenteDigitos_: value => String(value ?? '').replace(/\D/g, ''),
  normalizarEmail_: value => String(value ?? '').trim().toLowerCase(),
  cpfValido_: value => String(value) === '52998224725',
  emailValido_: value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)),
  categoriaRealCorrespondente_: value => String(value) === 'Categoria' ? 'Categoria' : '',
  numerosInscricaoUnicos_: values => [...new Set(values.filter(Boolean))],
  criarErro_: (code, message) => { const error = new Error(message); error.code = code; return error; },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'FORM-1' }) },
  FormApp: { ItemType: { CHECKBOX: 'CHECKBOX' }, openById: () => ({ getItems: () => [{ getTitle: () => 'Categoria', getType: () => 'CHECKBOX', asCheckboxItem: () => ({ getChoices: () => [{ getValue: () => 'Categoria' }] }) }] }) }
};
vm.createContext(context);
vm.runInContext(`${source.slice(inicio, fim)}; globalThis.exports_={validarRegistroFormulario_,localizarPessoaFormulario_};`, context);
const { validarRegistroFormulario_, localizarPessoaFormulario_ } = context.exports_;
const registro = cpf => ({ responseId: 'R', nome: 'Pessoa', cpf, email: '', categoria: 'Categoria' });

assert.doesNotThrow(() => validarRegistroFormulario_(registro('')), 'CPF vazio deve ser aceito');
const porCpf = { ID_PESSOA: 'P-VALIDA', CPF: '52998224725', EMAIL: '', NUMEROS_INSCRICAO: '' };
assert.doesNotThrow(() => validarRegistroFormulario_(registro('52998224725')), 'CPF válido deve ser aceito');
assert.equal(localizarPessoaFormulario_(registro('52998224725'), [porCpf], 'LOCAL-1'), porCpf, 'CPF válido pode associar');
const porCpfInvalido = { ID_PESSOA: 'P-NAO-UNIR', CPF: '12345678900', EMAIL: 'outro@exemplo.test', NUMEROS_INSCRICAO: '' };
assert.doesNotThrow(() => validarRegistroFormulario_(registro('12345678900')), 'CPF inválido não pode bloquear');
assert.equal(localizarPessoaFormulario_(registro('12345678900'), [porCpfInvalido], 'LOCAL-2'), null, 'CPF inválido não pode associar pessoa');
const porEmail = { ID_PESSOA: 'P-EMAIL', CPF: '12345678900', EMAIL: 'igual@exemplo.test', NUMEROS_INSCRICAO: '' };
const invalidoComEmail = { ...registro('12345678900'), email: 'igual@exemplo.test' };
assert.equal(localizarPessoaFormulario_(invalidoComEmail, [porEmail], 'LOCAL-3'), porEmail, 'e-mail único continua sendo alternativa de associação');

console.log('OK: CPF vazio e válido aceitos; CPF inválido aceito sem associação por CPF');
