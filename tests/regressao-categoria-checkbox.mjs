import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps-script/InscricaoLocal.gs', import.meta.url), 'utf8');
const opcoes = ['A', 'B', 'C', 'D'];
const context = {
  texto_: value => value == null ? '' : String(value).trim(),
  normalizarComparacao_: value => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(),
  somenteDigitos_: value => String(value ?? '').replace(/\D/g, ''),
  normalizarEmail_: value => String(value ?? '').trim().toLowerCase(),
  criarErro_: (code, message) => { const error = new Error(message); error.code = code; return error; },
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === 'FORM_ID' ? 'FORM-1' : '' }) },
  FormApp: { ItemType: { CHECKBOX: 'CHECKBOX' }, openById: () => ({ getItems: () => [{ getTitle: () => 'Categoria', getType: () => 'CHECKBOX', asCheckboxItem: () => ({ getChoices: () => opcoes.map(value => ({ getValue: () => value })) }) }] }) }
};
vm.createContext(context);
vm.runInContext(`${source}; globalThis.exports_={validarRegistroFormulario_,categoriasFormularioCanonicas_};`, context);
const { validarRegistroFormulario_, categoriasFormularioCanonicas_ } = context.exports_;
const registro = categoria => ({ responseId: 'R-REAL', nome: 'Participante', email: '', categoria });
const aceitar = (entrada, esperado) => { const item = registro(entrada); assert.doesNotThrow(() => validarRegistroFormulario_(item)); assert.equal(item.categoria, esperado); };
const rejeitar = entrada => assert.throws(() => validarRegistroFormulario_(registro(entrada)), error => error.code === 'CATEGORIA_INVALIDA');

aceitar(['A'], 'A');
aceitar(['C', 'A'], 'A | C');
aceitar(['D', 'B', 'A', 'C'], 'A | B | C | D');
rejeitar([]);
rejeitar(['A', 'INEXISTENTE']);
aceitar('B', 'B');
assert.deepEqual(JSON.parse(JSON.stringify(categoriasFormularioCanonicas_(['D', 'B']))), ['B', 'D']);
console.log('OK: checkbox Categoria aceita 1/2/4 opções e string legada; rejeita vazio/inexistente');
