function importarCredenciamento_(payload) {
  const tokenEsperado = PropertiesService.getScriptProperties().getProperty('TOKEN_IMPORTACAO');
  const tokenRecebido = texto_(payload.tokenImportacao || payload.TOKEN_IMPORTACAO || payload.token);
  if (!tokenEsperado || tokenRecebido !== tokenEsperado) throw criarErro_('NAO_AUTORIZADO', 'Token de importação inválido.');
  const registros = Array.isArray(payload.registros) ? payload.registros : Array.isArray(payload.inscricoes) ? payload.inscricoes : Array.isArray(payload.dados) ? payload.dados : [];
  if (!registros.length) throw criarErro_('IMPORTACAO_VAZIA', 'Nenhum registro foi enviado.');
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(30000)) throw criarErro_('SISTEMA_OCUPADO', 'Há uma importação ou presença em andamento.');
    const participantes = lerTabela_(CONFIG.SHEETS.PARTICIPANTES), inscricoes = lerTabela_(CONFIG.SHEETS.INSCRICOES);
    validarCabecalho_(participantes.headers, CONFIG.HEADERS.PARTICIPANTES, CONFIG.SHEETS.PARTICIPANTES);
    validarCabecalho_(inscricoes.headers, CONFIG.HEADERS.INSCRICOES, CONFIG.SHEETS.INSCRICOES);
    const pessoas = participantes.rows.map(function(p, i) { p.__linha = i + 2; return p; });
    const porInscricao = {}, porCpf = {}, porEmail = {}, porNome = {}, porCrachaData = {};
    inscricoes.rows.forEach(function(r) { porInscricao[normalizarNumeroInscricao_(r.NUMERO_INSCRICAO)] = true; });
    pessoas.forEach(function(p) {
      const cpf = somenteDigitos_(p.CPF), email = normalizarEmail_(p.EMAIL), nome = normalizarComparacao_(p.NOME);
      if (cpf) porCpf[cpf] = p;
      if (email) porEmail[email] = p;
      if (nome) { porNome[nome] = porNome[nome] || []; porNome[nome].push(p); }
    });
    inscricoes.rows.forEach(function(i) {
      const chave = chaveCrachaData_(i.NOME_CRACHA_ORIGEM, i.DATA_INSCRICAO, i.HORA_INSCRICAO);
      if (chave && pessoas.find(p => texto_(p.ID_PESSOA) === texto_(i.ID_PESSOA))) porCrachaData[chave] = pessoas.find(p => texto_(p.ID_PESSOA) === texto_(i.ID_PESSOA));
    });
    let novasInscricoes = 0, pessoasNovas = 0, pessoasAtualizadas = 0, proximo = proximoIdPessoa_(pessoas);
    const linhasInscricao = [], alteradas = {};
    registros.forEach(function(registro) {
      const r = normalizarRegistroImportado_(registro);
      if (!r.numeroInscricao || porInscricao[r.numeroInscricao]) return; // unit of import deduplication
      let pessoa = localizarPessoaConservadora_(r, porCpf, porEmail, porNome, porCrachaData);
      if (!pessoa) {
        pessoa = { ID_PESSOA: 'P' + String(proximo++).padStart(6, '0'), NOME: r.nome, NOME_NORMALIZADO: normalizarComparacao_(r.nome), NOME_CRACHA: r.nomeCracha, EMAIL: r.email, CPF: r.cpf, TELEFONE: r.telefone, NUMEROS_INSCRICAO: '', QTD_INSCRICOES: 0, PRIMEIRA_INSCRICAO_EM: r.dataInscricao + ' ' + r.horaInscricao, ULTIMA_ATUALIZACAO: '', __linha: 0 };
        pessoas.push(pessoa); pessoasNovas++;
        if (r.cpf) porCpf[r.cpf] = pessoa; if (r.email) porEmail[r.email] = pessoa;
        if (pessoa.NOME_NORMALIZADO) { porNome[pessoa.NOME_NORMALIZADO] = porNome[pessoa.NOME_NORMALIZADO] || []; porNome[pessoa.NOME_NORMALIZADO].push(pessoa); }
      } else if (completarPessoa_(pessoa, r)) { alteradas[pessoa.ID_PESSOA] = pessoa; }
      const numeros = texto_(pessoa.NUMEROS_INSCRICAO).split(/[;,\s]+/).filter(Boolean);
      numeros.push(r.numeroInscricao); pessoa.NUMEROS_INSCRICAO = numeros.join(', '); pessoa.QTD_INSCRICOES = numeros.length; pessoa.ULTIMA_ATUALIZACAO = agoraTexto_();
      alteradas[pessoa.ID_PESSOA] = pessoa;
      linhasInscricao.push([r.numeroInscricao,pessoa.ID_PESSOA,r.idOrigem,r.nome,r.nomeCracha,r.email,r.cpf,r.categoria,r.dataInscricao,r.horaInscricao,r.arquivoOrigem,agoraTexto_()]);
      porInscricao[r.numeroInscricao] = true; novasInscricoes++;
    });
    const novasPessoas = pessoas.filter(p => !p.__linha);
    if (novasPessoas.length) participantes.sheet.getRange(participantes.sheet.getLastRow()+1,1,novasPessoas.length,CONFIG.HEADERS.PARTICIPANTES.length).setValues(novasPessoas.map(linhaPessoa_));
    Object.keys(alteradas).forEach(function(id) { const p=alteradas[id]; if (p.__linha) participantes.sheet.getRange(p.__linha,1,1,CONFIG.HEADERS.PARTICIPANTES.length).setValues([linhaPessoa_(p)]); });
    if (linhasInscricao.length) inscricoes.sheet.getRange(inscricoes.sheet.getLastRow()+1,1,linhasInscricao.length,CONFIG.HEADERS.INSCRICOES.length).setValues(linhasInscricao);
    pessoasAtualizadas = Object.keys(alteradas).filter(id => alteradas[id].__linha).length;
    const versao = novasInscricoes ? incrementarBaseVersion_() : obterBaseVersion_();
    registrarImportacao_(payload, registros.length, novasInscricoes, pessoasNovas, pessoasAtualizadas, 'SUCESSO', 'Importação concluída. Base ' + versao + '.');
    return { registrosLidos: registros.length, inscricoesNovas: novasInscricoes, pessoasNovas: pessoasNovas, pessoasAtualizadas: pessoasAtualizadas, baseVersion: versao };
  } catch (erro) {
    registrarImportacaoSeguro_(payload, registros.length, 0, 0, 0, 'ERRO', erro.message);
    throw erro;
  } finally { if (lock.hasLock()) lock.releaseLock(); }
}

function normalizarRegistroImportado_(r) { return { numeroInscricao: normalizarNumeroInscricao_(campo_(r,['NUMERO_INSCRICAO','numeroInscricao','inscricao'])), idOrigem: texto_(campo_(r,['ID_ORIGEM','idOrigem'])), nome: texto_(campo_(r,['NOME_ORIGEM','NOME','nome'])), nomeCracha: texto_(campo_(r,['NOME_CRACHA_ORIGEM','NOME_CRACHA','nomeCracha'])), email: normalizarEmail_(campo_(r,['EMAIL_ORIGEM','EMAIL','email'])), cpf: somenteDigitos_(campo_(r,['CPF_ORIGEM','CPF','cpf'])), telefone: texto_(campo_(r,['TELEFONE','telefone'])), categoria: texto_(campo_(r,['CATEGORIA','categoria'])), dataInscricao: texto_(campo_(r,['DATA_INSCRICAO','dataInscricao'])), horaInscricao: texto_(campo_(r,['HORA_INSCRICAO','horaInscricao'])), arquivoOrigem: texto_(campo_(r,['ARQUIVO_ORIGEM','arquivoOrigem','arquivo'])) }; }
function campo_(obj, nomes) { for (let i=0;i<nomes.length;i++) if (Object.prototype.hasOwnProperty.call(obj, nomes[i])) return obj[nomes[i]]; return ''; }
function localizarPessoaConservadora_(r, porCpf, porEmail, porNome, porCrachaData) { if (r.cpf && porCpf[r.cpf]) return porCpf[r.cpf]; if (r.email && porEmail[r.email]) return porEmail[r.email]; const chave=chaveCrachaData_(r.nomeCracha,r.dataInscricao,r.horaInscricao); if (chave && porCrachaData[chave]) return porCrachaData[chave]; const nomes=porNome[normalizarComparacao_(r.nome)] || []; return nomes.length === 1 ? nomes[0] : null; }
function completarPessoa_(p,r) { let mudou=false; [['NOME','nome'],['NOME_CRACHA','nomeCracha'],['EMAIL','email'],['CPF','cpf'],['TELEFONE','telefone']].forEach(function(par){if(!texto_(p[par[0]]) && r[par[1]]) {p[par[0]]=r[par[1]];mudou=true;}}); if (!texto_(p.NOME_NORMALIZADO) && texto_(p.NOME)) {p.NOME_NORMALIZADO=normalizarComparacao_(p.NOME);mudou=true;} return mudou; }
function linhaPessoa_(p) { return CONFIG.HEADERS.PARTICIPANTES.map(h => p[h] || ''); }
function proximoIdPessoa_(pessoas) { return pessoas.reduce((m,p) => Math.max(m, Number((texto_(p.ID_PESSOA).match(/\d+$/)||['0'])[0])),0)+1; }
function chaveCrachaData_(nome,data,hora) { const n=normalizarComparacao_(nome); return n && texto_(data) && texto_(hora) ? n+'|'+texto_(data)+'|'+texto_(hora) : ''; }
function somenteDigitos_(v) { return texto_(v).replace(/\D/g,''); }
function normalizarEmail_(v) { return texto_(v).toLowerCase(); }
function agoraTexto_() { return Utilities.formatDate(new Date(),CONFIG.TIMEZONE,'yyyy-MM-dd HH:mm:ss'); }
function validarCabecalho_(atual, esperado, aba) { if (esperado.some((h,i) => atual[i] !== h)) throw criarErro_('CABECALHO_INVALIDO','Cabeçalho inválido na aba '+aba+'.'); }
function registrarImportacao_(payload,lidas,novas,pessoasNovas,pessoasAtualizadas,status,mensagem) { const t=lerTabela_(CONFIG.SHEETS.IMPORTACOES); validarCabecalho_(t.headers,CONFIG.HEADERS.IMPORTACOES,CONFIG.SHEETS.IMPORTACOES); t.sheet.getRange(t.sheet.getLastRow()+1,1,1,CONFIG.HEADERS.IMPORTACOES.length).setValues([['IM'+Utilities.getUuid(),texto_(payload.arquivo||payload.nomeArquivo),texto_(payload.dataHoraArquivo),agoraTexto_(),lidas,novas,pessoasNovas,pessoasAtualizadas,status,mensagem]]); }
function registrarImportacaoSeguro_() { try { registrarImportacao_.apply(null,arguments); } catch (_) {} }
