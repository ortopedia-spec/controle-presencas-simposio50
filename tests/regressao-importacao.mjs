import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps-script/Importacao.gs', import.meta.url), 'utf8');
const migracao = fs.readFileSync(new URL('../apps-script/Migracao.gs', import.meta.url), 'utf8');
const consulta = fs.readFileSync(new URL('../apps-script/Consulta.gs', import.meta.url), 'utf8');
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
vm.runInContext(`${source};${migracao}; globalThis.exports_={numerosInscricaoUnicos_,normalizarRegistroImportado_,obterTokenImportacao_,avaliarEnriquecimentoCanonico_,valorHumanoUnico_,completarPessoa_,numeroInscricaoEvent3Valido_,identidadeCompativelParaEnriquecimento_};`, context);
const api = context.exports_;

const oito = '75802661|75102633|75802664|75102635|75102634|75102636|75802662|75802663'.split('|');
const nove = api.numerosInscricaoUnicos_([...oito, '75102633', '99999999']);
assert.equal(nove.length, 9, '8 inscrições existentes + 1 nova devem resultar em 9');
assert.equal(nove.join('|'), `${oito.join('|')}|99999999`);

const payload = { arquivo: 'ListaCredenciamento_15-09-2026_08-00-00.xlsx' };
const registro = api.normalizarRegistroImportado_({ numeroInscricao: '75102633', idOrigem: '1', nome: 'Amanda', nomeCracha: 'Amanda Miranda', email: 'a@example.org', cpf: '123.456.789-00', telefone: '1', categoria: 'MANHA', dataInscricao: '15/09/2026', horaInscricao: '09:00:00' }, payload);
assert.equal(registro.arquivoOrigem, payload.arquivo, 'arquivo do payload deve preencher ARQUIVO_ORIGEM');
assert.equal(registro.numeroInscricao, '75102633');
assert.equal(api.numeroInscricaoEvent3Valido_(''), false, 'inscrição Event3 vazia é inválida');
assert.equal(api.numeroInscricaoEvent3Valido_('0'), false, 'inscrição Event3 zero é inválida');
assert.equal(api.numeroInscricaoEvent3Valido_('000,00'), false, 'representação equivalente a zero é inválida');
assert.equal(api.numeroInscricaoEvent3Valido_('75640337'), true, 'número Event3 válido deve ser preservado');
assert.equal(api.identidadeCompativelParaEnriquecimento_({ NOME: 'Melissa Alonso', CPF: '', EMAIL: '' }, { nome: 'Simone Anselmo', cpf: '', email: '' }), false, 'número repetido não pode enriquecer pessoa de nome claramente diferente');
assert.equal(api.identidadeCompativelParaEnriquecimento_({ NOME: 'Melissa Alonso', CPF: '123', EMAIL: 'melissa@example.org' }, { nome: 'Melissa A.', cpf: '123', email: 'melissa@example.org' }), true, 'variação compatível não deve bloquear enriquecimento seguro');
assert.equal(api.identidadeCompativelParaEnriquecimento_({ NOME: 'Melissa Alonso', CPF: '123', EMAIL: 'melissa@example.org' }, { nome: 'Melissa A.', cpf: '456', email: 'melissa@example.org' }), false, 'CPF divergente bloqueia enriquecimento');
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
assert.match(source, /numeroInscricaoEvent3Valido_\(r\.numeroInscricao\)/, 'zero não pode entrar no índice de inscrições Event3');
assert.match(source, /identidadeCompativelParaEnriquecimento_\(pessoaExistente,r\)/, 'reimportação exige compatibilidade antes de enriquecer pessoa existente');
assert.match(source, /agoraTexto_\(\),'EVENT3'\]/, 'novas importações devem registrar origem EVENT3');
assert.match(source, /aquecerCache=Boolean\(houveAlteracao\)/, 'somente importação com mudança efetiva deve aquecer o cache');
assert.match(source, /if\(aquecerCache\)aquecerCacheBaseSeguro_\(\)/, 'aquecimento deve ocorrer após liberar o lock da importação');

assert.match(source, /payload\.arquivoDataHora\|\|payload\.dataHoraArquivo/, 'arquivoDataHora deve ter prioridade no log');
assert.match(source, /arquivo: texto_\(payload\.arquivo\)/, 'resposta deve preservar arquivo para PowerShell');
const cache = fs.readFileSync(new URL('../apps-script/Cache.gs', import.meta.url), 'utf8');
assert.match(cache, /const CACHE_BUCKETS = 32/, 'cache deve usar buckets');
assert.match(cache, /const CACHE_SCHEMA_VERSION = '7'/, 'cache deve versionar o formato serializado');
assert.match(cache, /invalidarCacheDaVersao_\(anterior\)/, 'versão anterior deve ser invalidada');
assert.match(cache, /function aquecerCacheBaseSeguro_\(\).*garantirCacheBase_\(\)/, 'aquecimento deve reutilizar a reconstrução segmentada protegida por ScriptLock');
const auditoria = fs.readFileSync(new URL('../apps-script/AuditoriaImportacao.gs', import.meta.url), 'utf8');
assert.match(auditoria, /function auditarAtualizacoesImportacaoEvent3_\(\)/, 'auditoria deve ser somente leitura');
assert.match(auditoria, /function auditarAtualizacoesImportacaoEvent3\(\)/, 'auditoria deve ter wrapper público no editor Apps Script');
assert.match(auditoria, /function repararNomeCrachaMelissaAlonso\(\)/, 'reparo deve ter wrapper público no editor Apps Script');
assert.match(auditoria, /PESSOAS_NOVAS/, 'auditoria deve excluir pessoas novas da importação analisada');
assert.match(auditoria, /slice\(0,16\)/, 'auditoria deve tolerar segundos diferentes entre atualização e log');
assert.match(auditoria, /P000056/, 'reparo deve ser estritamente limitado ao ID confirmado');
assert.match(auditoria, /NOME_CRACHA/, 'reparo deve alterar somente o nome de crachá');
vm.runInContext(`${cache}; globalThis.cacheExports_={nomeCrachaParaCache_,chaveCache_,textoBuscaPessoa_,nomesBuscaPublicas_,cpfsBuscaPessoa_};`, context);
assert.equal(context.cacheExports_.nomeCrachaParaCache_('', ['Diego Bento']), 'Diego Bento', 'cache deve usar o único nome de crachá de origem');
assert.equal(context.cacheExports_.nomeCrachaParaCache_('Cadastro Institucional', ['Diego Bento']), 'Diego Bento', 'origem humana única deve ter prioridade apenas na representação em cache');
assert.equal(context.cacheExports_.nomeCrachaParaCache_('', ['Diego Bento', 'João Silva']), '', 'cache não deve escolher nome em conflito');
assert.equal(context.cacheExports_.chaveCache_('1', 'META', '0'), 'PRESENCAS_7_1_META_0', 'mudança de esquema deve isolar buckets legados');
assert.match(context.cacheExports_.textoBuscaPessoa_('Cadastro Institucional', '', 'Bento', ['Diego Bento']), /DIEGO BENTO/, 'aliases de crachá de origem devem compor a busca sem alterar o nome exibido');
assert.deepEqual(Array.from(context.cacheExports_.nomesBuscaPublicas_({ nome: 'Cadastro Institucional', nomeCracha: '', nomeExibicao: 'Cadastro Institucional', nomesCrachaOrigem: ['Diego Bento'] })), ['Cadastro Institucional', 'Diego Bento'], 'índice público deve incluir aliases de crachá sem dados sensíveis');
assert.deepEqual(Array.from(context.cacheExports_.cpfsBuscaPessoa_('123.456.789-09', ['12345678909', ''])), ['12345678909'], 'CPF deve permanecer apenas na estrutura interna de busca');
vm.runInContext(`${consulta}; globalThis.consultaExports_={nomeExibicaoPesquisa_};`, context);
assert.equal(context.consultaExports_.nomeExibicaoPesquisa_({ nomeExibicao: 'Cadastro Institucional', nomesCrachaOrigem: ['Diego Bento', 'Outro Crachá'] }, ['DIEGO', 'BENTO']), 'Diego Bento', 'consulta exata deve exibir o alias correspondente');
assert.equal(context.consultaExports_.nomeExibicaoPesquisa_({ nomeExibicao: 'Cadastro Institucional', nomesCrachaOrigem: ['Diego Bento', 'Outro Crachá'] }, ['DIEGO']), 'Diego Bento', 'consulta parcial com alias único deve exibir o alias humano');
context.CONFIG.MAX_SEARCH_RESULTS=20;
context.obterIndiceInterno_=()=>({baseVersion:'1',pessoas:{P1:{idPessoa:'P1',nome:'Cadastro Institucional',nomeCracha:'Diego Bento',nomeExibicao:'Diego Bento',nomesCrachaOrigem:['Diego Bento'],cpfsBusca:['12345678909'],busca:'CADASTRO INSTITUCIONAL DIEGO BENTO'}},inscricaoParaPessoa:{}});
const resultadoCpf=context.buscarParticipantes_('123.456.789-09');
assert.equal(resultadoCpf.participantes.length,1,'CPF completo deve localizar somente pelo backend');
assert.equal('cpfsBusca' in resultadoCpf.participantes[0],false,'resultado público de busca não pode expor CPF');
console.log('OK: regressões de importação e cache aprovadas');
