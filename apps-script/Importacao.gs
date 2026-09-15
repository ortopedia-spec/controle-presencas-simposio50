function importarCredenciamento_(payload) {
  const tokenEsperado = obterTokenImportacao_();
  const tokenRecebido = texto_(payload.tokenImportacao || payload.TOKEN_IMPORTACAO || payload.token);
  if (!tokenEsperado || tokenRecebido !== tokenEsperado) throw criarErro_('NAO_AUTORIZADO', 'Token de importação inválido.');
  const registros = Array.isArray(payload.registros) ? payload.registros : Array.isArray(payload.inscricoes) ? payload.inscricoes : Array.isArray(payload.dados) ? payload.dados : [];
  if (!registros.length) throw criarErro_('IMPORTACAO_VAZIA', 'Nenhum registro foi enviado.');
  const lock = LockService.getScriptLock(); let resultado, aquecerCache=false;
  try {
    if (!lock.tryLock(30000)) throw criarErro_('SISTEMA_OCUPADO', 'Há uma importação ou presença em andamento.');
    const participantes = lerTabela_(CONFIG.SHEETS.PARTICIPANTES), inscricoes = lerTabela_(CONFIG.SHEETS.INSCRICOES);
    validarCabecalho_(participantes.headers, CONFIG.HEADERS.PARTICIPANTES, CONFIG.SHEETS.PARTICIPANTES);
    validarCabecalho_(inscricoes.headers, CONFIG.HEADERS.INSCRICOES, CONFIG.SHEETS.INSCRICOES);
    const pessoas = participantes.rows.map(function(p, i) { p.__linha = i + 2; return p; });
    const porInscricao = {}, porCpf = {}, porEmail = {}, porNome = {}, porCrachaData = {};
    inscricoes.rows.forEach(function(r) { const numero=normalizarNumeroInscricao_(r.NUMERO_INSCRICAO);if(numeroInscricaoEvent3Valido_(numero))porInscricao[numero]={idPessoa:texto_(r.ID_PESSOA)}; });
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
    let novasInscricoes = 0, pessoasNovas = 0, pessoasAtualizadas = 0, conflitosIdentidade = 0, conflitosNovos = 0, proximo = proximoIdPessoa_(pessoas);
    const linhasInscricao = [], alteradas = {};
    registros.forEach(function(registro) {
      const r = normalizarRegistroImportado_(registro, payload);
      if (!numeroInscricaoEvent3Valido_(r.numeroInscricao)) return;
      if (porInscricao[r.numeroInscricao]) {
        // Reimportação: pode enriquecer campos canônicos, mas não cria inscrição nem altera contadores.
        const pessoaExistente=pessoas.find(p => texto_(p.ID_PESSOA)===porInscricao[r.numeroInscricao].idPessoa);
        if (pessoaExistente && identidadeCompativelParaEnriquecimento_(pessoaExistente,r)) { if(completarPessoa_(pessoaExistente,r)) { pessoaExistente.ULTIMA_ATUALIZACAO=agoraTexto_();alteradas[pessoaExistente.ID_PESSOA]=pessoaExistente; } }
        else if(pessoaExistente){conflitosIdentidade++;if(registrarConflitoIdentidadeEvent3_(r.numeroInscricao,r.idOrigem))conflitosNovos++;console.warn('[IMPORTACAO_IDENTIDADE_DIVERGENTE] '+texto_(pessoaExistente.ID_PESSOA));const nomeNovo=normalizarComparacao_(r.nome),jaExiste=pessoas.find(function(p){return normalizarComparacao_(p.NOME)===nomeNovo;});if(!jaExiste&&r.nome){const shell={ID_PESSOA:'P'+String(proximo++).padStart(6,'0'),NOME:r.nome,NOME_NORMALIZADO:nomeNovo,NOME_CRACHA:'',EMAIL:'',CPF:'',TELEFONE:'',NUMEROS_INSCRICAO:'',QTD_INSCRICOES:0,PRIMEIRA_INSCRICAO_EM:r.dataInscricao+' '+r.horaInscricao,ULTIMA_ATUALIZACAO:agoraTexto_(),__linha:0};pessoas.push(shell);pessoasNovas++;porNome[nomeNovo]=porNome[nomeNovo]||[];porNome[nomeNovo].push(shell);}}
        return;
      }
      let pessoa = localizarPessoaConservadora_(r, porCpf, porEmail, porNome, porCrachaData);
      if (!pessoa) {
        pessoa = { ID_PESSOA: 'P' + String(proximo++).padStart(6, '0'), NOME: r.nome, NOME_NORMALIZADO: normalizarComparacao_(r.nome), NOME_CRACHA: r.nomeCracha, EMAIL: r.email, CPF: r.cpf, TELEFONE: r.telefone, NUMEROS_INSCRICAO: '', QTD_INSCRICOES: 0, PRIMEIRA_INSCRICAO_EM: r.dataInscricao + ' ' + r.horaInscricao, ULTIMA_ATUALIZACAO: '', __linha: 0 };
        pessoas.push(pessoa); pessoasNovas++;
        if (r.cpf) porCpf[r.cpf] = pessoa; if (r.email) porEmail[r.email] = pessoa;
        if (pessoa.NOME_NORMALIZADO) { porNome[pessoa.NOME_NORMALIZADO] = porNome[pessoa.NOME_NORMALIZADO] || []; porNome[pessoa.NOME_NORMALIZADO].push(pessoa); }
      } else if (completarPessoa_(pessoa, r)) { alteradas[pessoa.ID_PESSOA] = pessoa; }
      const numeros = numerosInscricaoUnicos_(texto_(pessoa.NUMEROS_INSCRICAO).split(/[|,;\s]+/).filter(Boolean).concat([r.numeroInscricao]));
      pessoa.NUMEROS_INSCRICAO = numeros.join('|'); pessoa.QTD_INSCRICOES = numeros.length; pessoa.ULTIMA_ATUALIZACAO = agoraTexto_();
      alteradas[pessoa.ID_PESSOA] = pessoa;
      linhasInscricao.push([r.numeroInscricao,pessoa.ID_PESSOA,r.idOrigem,r.nome,r.nomeCracha,r.email,r.cpf,r.categoria,r.dataInscricao,r.horaInscricao,r.arquivoOrigem,agoraTexto_(),'EVENT3']);
      porInscricao[r.numeroInscricao] = {idPessoa:pessoa.ID_PESSOA}; novasInscricoes++;
    });
    const novasPessoas = pessoas.filter(p => !p.__linha);
    if (novasPessoas.length) participantes.sheet.getRange(participantes.sheet.getLastRow()+1,1,novasPessoas.length,CONFIG.HEADERS.PARTICIPANTES.length).setValues(novasPessoas.map(linhaPessoa_));
    Object.keys(alteradas).forEach(function(id) { const p=alteradas[id]; if (p.__linha) participantes.sheet.getRange(p.__linha,1,1,CONFIG.HEADERS.PARTICIPANTES.length).setValues([linhaPessoa_(p)]); });
    if (linhasInscricao.length) inscricoes.sheet.getRange(inscricoes.sheet.getLastRow()+1,1,linhasInscricao.length,CONFIG.HEADERS.INSCRICOES.length).setValues(linhasInscricao);
    pessoasAtualizadas = Object.keys(alteradas).filter(id => alteradas[id].__linha).length;
    const houveAlteracao=novasInscricoes || pessoasNovas > 0 || Object.keys(alteradas).length || conflitosNovos > 0;
    const versao = houveAlteracao ? incrementarBaseVersion_() : obterBaseVersion_();
    registrarImportacao_(payload, registros.length, novasInscricoes, pessoasNovas, pessoasAtualizadas, 'SUCESSO', 'Importação concluída. Base ' + versao + '. Conflitos de identidade ignorados: '+conflitosIdentidade+'.');
    resultado={ arquivo: texto_(payload.arquivo), registrosLidos: registros.length, inscricoesNovas: novasInscricoes, pessoasNovas: pessoasNovas, pessoasAtualizadas: pessoasAtualizadas, baseVersion: versao };
    aquecerCache=Boolean(houveAlteracao);
  } catch (erro) {
    registrarImportacaoSeguro_(payload, registros.length, 0, 0, 0, 'ERRO', erro.message);
    throw erro;
  } finally { if (lock.hasLock()) lock.releaseLock(); }
  if(aquecerCache)aquecerCacheBaseSeguro_();
  return resultado;
}

function numeroInscricaoEvent3Valido_(valor) { const numero=normalizarNumeroInscricao_(valor);return !!numero&&!/^0+(?:[.,]0+)?$/.test(numero); }
function nomesClaramenteDiferentes_(a,b) { const pa=normalizarComparacao_(a).split(' ').filter(Boolean),pb=normalizarComparacao_(b).split(' ').filter(Boolean);return !!pa.length&&!!pb.length&&!pa.some(function(parte){return pb.indexOf(parte)!==-1;}); }
function identidadeCompativelParaEnriquecimento_(pessoa,registro) { const cpfPessoa=somenteDigitos_(pessoa.CPF),cpfRegistro=somenteDigitos_(registro.cpf),emailPessoa=normalizarEmail_(pessoa.EMAIL),emailRegistro=normalizarEmail_(registro.email);if(nomesClaramenteDiferentes_(pessoa.NOME,registro.nome))return false;if(cpfPessoa&&cpfRegistro&&cpfPessoa!==cpfRegistro)return false;if(emailPessoa&&emailRegistro&&emailPessoa!==emailRegistro)return false;return true; }
function normalizarRegistroImportado_(r,payload) { return { numeroInscricao: normalizarNumeroInscricao_(campo_(r,['numeroInscricao','NUMERO_INSCRICAO','inscricao'])), idOrigem: texto_(campo_(r,['idOrigem','ID_ORIGEM'])), nome: texto_(campo_(r,['nome','NOME_ORIGEM','NOME'])), nomeCracha: texto_(campo_(r,['nomeCracha','NOME_CRACHA_ORIGEM','NOME_CRACHA'])), email: normalizarEmail_(campo_(r,['email','EMAIL_ORIGEM','EMAIL'])), cpf: somenteDigitos_(campo_(r,['cpf','CPF_ORIGEM','CPF'])), telefone: texto_(campo_(r,['telefone','TELEFONE'])), categoria: texto_(campo_(r,['categoria','CATEGORIA'])), dataInscricao: texto_(campo_(r,['dataInscricao','DATA_INSCRICAO'])), horaInscricao: texto_(campo_(r,['horaInscricao','HORA_INSCRICAO'])), arquivoOrigem: texto_(campo_(r,['arquivoOrigem','ARQUIVO_ORIGEM','arquivo']) || payload.arquivo) }; }
function campo_(obj, nomes) { for (let i=0;i<nomes.length;i++) if (Object.prototype.hasOwnProperty.call(obj, nomes[i])) return obj[nomes[i]]; return ''; }
function localizarPessoaConservadora_(r, porCpf, porEmail, porNome, porCrachaData) { if (r.cpf && porCpf[r.cpf]) return porCpf[r.cpf]; if (r.email && porEmail[r.email]) return porEmail[r.email]; const chave=chaveCrachaData_(r.nomeCracha,r.dataInscricao,r.horaInscricao); if (chave && porCrachaData[chave]) return porCrachaData[chave]; const nomes=porNome[normalizarComparacao_(r.nome)] || []; return nomes.length === 1 ? nomes[0] : null; }
function completarPessoa_(p,r) { let mudou=false; [['NOME','nome'],['NOME_CRACHA','nomeCracha'],['EMAIL','email'],['CPF','cpf'],['TELEFONE','telefone']].forEach(function(par){if(!texto_(p[par[0]]) && r[par[1]]) {p[par[0]]=r[par[1]];mudou=true;}}); if (!texto_(p.NOME_NORMALIZADO) && texto_(p.NOME)) {p.NOME_NORMALIZADO=normalizarComparacao_(p.NOME);mudou=true;} return mudou; }
function linhaPessoa_(p) { return CONFIG.HEADERS.PARTICIPANTES.map(h => p[h] || ''); }
function proximoIdPessoa_(pessoas) { return pessoas.reduce((m,p) => Math.max(m, Number((texto_(p.ID_PESSOA).match(/\d+$/)||['0'])[0])),0)+1; }
function chaveCrachaData_(nome,data,hora) { const n=normalizarComparacao_(nome); return n && texto_(data) && texto_(hora) ? n+'|'+texto_(data)+'|'+texto_(hora) : ''; }
function somenteDigitos_(v) { return texto_(v).replace(/\D/g,''); }
function normalizarEmail_(v) { return texto_(v).toLowerCase(); }
function numerosInscricaoUnicos_(numeros) { const vistos={}; return numeros.map(normalizarNumeroInscricao_).filter(function(n){if(!n||vistos[n])return false;vistos[n]=true;return true;}); }
function agoraTexto_() { return Utilities.formatDate(new Date(),CONFIG.TIMEZONE,'yyyy-MM-dd HH:mm:ss'); }
function validarCabecalho_(atual, esperado, aba) { if (esperado.some((h,i) => atual[i] !== h)) throw criarErro_('CABECALHO_INVALIDO','Cabeçalho inválido na aba '+aba+'.'); }
function obterTokenImportacao_() { const script=PropertiesService.getScriptProperties().getProperty('TOKEN_IMPORTACAO');return script||tokenImportacaoDaPlanilha_(); }
function tokenImportacaoDaPlanilha_() { const valores=sheetObrigatoria_(CONFIG.SHEETS.CONFIG).getDataRange().getDisplayValues();for(let i=0;i<valores.length;i++)if(normalizarComparacao_(valores[i][0])==='TOKEN_IMPORTACAO')return texto_(valores[i].slice(1).find(texto_));return ''; }
function registrarImportacao_(payload,lidas,novas,pessoasNovas,pessoasAtualizadas,status,mensagem) { const t=lerTabela_(CONFIG.SHEETS.IMPORTACOES); validarCabecalho_(t.headers,CONFIG.HEADERS.IMPORTACOES,CONFIG.SHEETS.IMPORTACOES); t.sheet.getRange(t.sheet.getLastRow()+1,1,1,CONFIG.HEADERS.IMPORTACOES.length).setValues([['IM'+Utilities.getUuid(),texto_(payload.arquivo||payload.nomeArquivo),texto_(payload.arquivoDataHora||payload.dataHoraArquivo),agoraTexto_(),lidas,novas,pessoasNovas,pessoasAtualizadas,status,mensagem]]); }
function registrarImportacaoSeguro_() { try { registrarImportacao_.apply(null,arguments); } catch (_) {} }
