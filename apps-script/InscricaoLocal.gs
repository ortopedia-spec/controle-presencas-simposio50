const FORM_LOCAL = Object.freeze({
  TITULO: 'Simpósio 50 Anos da Sorri Bauru — Inscrição no Evento',
  DESCRICAO: 'Formulário destinado à inscrição presencial de participantes que ainda não realizaram inscrição pelo sistema oficial do evento. Os dados informados serão utilizados exclusivamente para organização e credenciamento do evento.',
  CONFIRMACAO: 'Inscrição recebida. Procure a equipe de credenciamento para registrar sua presença.',
  HANDLER: 'onFormSubmitInscricaoLocal',
  PROPERTIES: Object.freeze({ ID: 'FORM_ID', URL: 'FORM_URL', EDIT_URL: 'FORM_EDIT_URL', ITEMS: 'FORM_ITEM_IDS_JSON', RESPONSE_SPREADSHEET_ID: 'FORM_RESPONSE_SPREADSHEET_ID' })
});

function prepararEstruturaInscricoesLocais() {
  const lock=LockService.getScriptLock();
  try {
    if(!lock.tryLock(30000))throw criarErro_('SISTEMA_OCUPADO','Há outra alteração estrutural em andamento.');
    const antes=resumoIntegridadeEstrutura_();
    const origem=garantirColunaOrigemInscricao_();
    const controle=garantirAbaControleInscricoesLocal_();
    const capacidade=garantirCapacidadeEvento_();
    const depois=resumoIntegridadeEstrutura_();
    if(antes.participantes.assinatura!==depois.participantes.assinatura||antes.inscricoes.assinatura!==depois.inscricoes.assinatura||antes.presencas.assinatura!==depois.presencas.assinatura)throw criarErro_('INTEGRIDADE_DIVERGENTE','A estrutura foi interrompida porque identificadores ou contagens divergiram.');
    return{colunaOrigemCriada:origem.criada,origensEvent3Preenchidas:origem.preenchidas,origensAmbiguas:origem.ambiguas,abaControleCriada:controle.criada,capacidade:capacidade.valor,capacidadeCriada:capacidade.criada,contagensAntes:{participantes:antes.participantes.total,inscricoes:antes.inscricoes.total,presencas:antes.presencas.total},contagensDepois:{participantes:depois.participantes.total,inscricoes:depois.inscricoes.total,presencas:depois.presencas.total},integridadePreservada:true};
  } finally {if(lock.hasLock())lock.releaseLock();}
}

function verificarIntegridadeEstruturaInscricoesLocais() {
  const observacoes=[],ss=spreadsheet_();
  const participantes=lerEstadoAbaSomenteLeitura_(ss,CONFIG.SHEETS.PARTICIPANTES);
  const inscricoes=lerEstadoAbaSomenteLeitura_(ss,CONFIG.SHEETS.INSCRICOES);
  const controle=lerEstadoAbaSomenteLeitura_(ss,CONFIG.SHEETS.INSCRICOES_LOCAL_CONTROLE);
  const cabecalhoLegado=CONFIG.HEADERS.INSCRICOES.slice(0,-1),posicaoEsperada=cabecalhoLegado.length;
  const cabecalhoParticipantesPreservado=participantes.existe&&cabecalhoExato_(participantes.headers,CONFIG.HEADERS.PARTICIPANTES);
  const cabecalhoBasePreservado=inscricoes.existe&&cabecalhoComecaCom_(inscricoes.headers,cabecalhoLegado);
  const posicoesOrigem=inscricoes.headers.reduce(function(posicoes,header,index){if(header==='ORIGEM_INSCRICAO')posicoes.push(index);return posicoes;},[]);
  const origemInscricaoPresente=cabecalhoBasePreservado&&posicoesOrigem.length===1&&posicoesOrigem[0]===posicaoEsperada;
  const cabecalhoInscricoesExato=origemInscricaoPresente&&cabecalhoExato_(inscricoes.headers,CONFIG.HEADERS.INSCRICOES);
  const estruturaControlePresente=controle.existe&&cabecalhoExato_(controle.headers,CONFIG.HEADERS.INSCRICOES_LOCAL_CONTROLE);
  let capacidadeValida=false;
  try{const capacidade=Number(obterConfiguracaoValor_('CAPACIDADE_EVENTO'));capacidadeValida=Number.isFinite(capacidade)&&capacidade>0;observacoes.push(capacidadeValida?'CAPACIDADE_EVENTO configurada com valor positivo.':'CAPACIDADE_EVENTO ausente ou inválida.');}
  catch(_){observacoes.push('A aba CONFIG não pôde ser lida.');}
  if(!participantes.existe)observacoes.push('Aba PARTICIPANTES ausente.');
  else if(!cabecalhoParticipantesPreservado)observacoes.push('Cabeçalho de PARTICIPANTES incompatível.');
  if(!inscricoes.existe)observacoes.push('Aba INSCRICOES ausente.');
  else{
    observacoes.push('Headers de INSCRICOES: '+inscricoes.headers.join(' | '));
    if(!cabecalhoBasePreservado)observacoes.push('Colunas canônicas anteriores de INSCRICOES ausentes ou deslocadas.');
    if(posicoesOrigem.length!==1)observacoes.push('ORIGEM_INSCRICAO deve existir exatamente uma vez.');
    else observacoes.push('ORIGEM_INSCRICAO na posição '+String(posicoesOrigem[0]+1)+'.');
    if(!cabecalhoInscricoesExato&&cabecalhoBasePreservado&&origemInscricaoPresente)observacoes.push('INSCRICOES possui colunas adicionais fora da estrutura canônica esperada.');
    if(origemInscricaoPresente){const indiceOrigem=posicoesOrigem[0],origens=inscricoes.rows.map(function(row){return normalizarComparacao_(row[indiceOrigem]);}),vazias=origens.filter(function(origem){return!origem;}).length,invalidas=origens.filter(function(origem){return origem&&origem!=='EVENT3'&&origem!=='FORM_EVENTO';}).length;observacoes.push('Origens vazias: '+String(vazias)+'; origens não reconhecidas: '+String(invalidas)+'.');}
  }
  if(!controle.existe)observacoes.push('Aba INSCRICOES_LOCAL_CONTROLE ausente.');
  else if(!estruturaControlePresente)observacoes.push('Cabeçalho de INSCRICOES_LOCAL_CONTROLE incompatível.');
  else observacoes.push('Estrutura de INSCRICOES_LOCAL_CONTROLE presente e compatível.');
  const resultado={integridadePreservada:cabecalhoParticipantesPreservado&&cabecalhoInscricoesExato&&estruturaControlePresente&&capacidadeValida,participantes:participantes.total,inscricoes:inscricoes.total,origemInscricaoPresente:origemInscricaoPresente,estruturaControlePresente:estruturaControlePresente,baseVersion:obterBaseVersion_(),observacoes:observacoes};
  console.log(JSON.stringify(resultado,null,2));
  return resultado;
}

// Auditoria administrativa estritamente somente leitura para a validação pré-deploy.
// Não cria planilhas, abas, formulários ou triggers e não retorna dados pessoais.
function auditarImplantacaoInscricoesLocais() {
  const propriedades=PropertiesService.getScriptProperties();
  const formId=texto_(propriedades.getProperty(FORM_LOCAL.PROPERTIES.ID));
  if(!formId)throw criarErro_('FORMULARIO_NAO_CONFIGURADO','FORM_ID não está configurado.');
  const form=FormApp.openById(formId),destino=obterDestinoFormularioSeguro_(form);
  const ss=spreadsheet_(),abasRaw=encontrarAbasRespostasFormulario_(ss);
  const triggers=ScriptApp.getProjectTriggers().filter(function(trigger){return trigger.getHandlerFunction()===FORM_LOCAL.HANDLER&&trigger.getEventType()===ScriptApp.EventType.ON_FORM_SUBMIT&&trigger.getTriggerSourceId()===formId;});
  const base=simularReconciliacaoEvent3Atual_();
  const resultado={
    somenteLeitura:true,
    formId:formId,
    formUrl:form.getPublishedUrl(),
    respostasRegistradas:form.getResponses().length,
    responseDestination:{existe:destino.existe,quantidade:destino.existe?1:0,tipo:destino.existe?String(destino.tipo):'',spreadsheetId:destino.id},
    responseDestinationCorreto:destino.existe&&destino.tipo===FormApp.DestinationType.SPREADSHEET&&destino.id===CONFIG.SPREADSHEET_ID,
    abasRaw:abasRaw,
    trigger:{quantidade:triggers.length,ids:triggers.map(function(trigger){return trigger.getUniqueId();})},
    base:base,
    integridadePreservada:destino.existe&&destino.id===CONFIG.SPREADSHEET_ID&&abasRaw.length===1&&triggers.length===1&&base.origensVazias===0&&base.origensInvalidas===0
  };
  console.log(JSON.stringify(resultado,null,2));
  return resultado;
}

function encontrarAbasRespostasFormulario_(ss) {
  const campos=['Nome completo','Nome para crachá','CPF','E-mail','Telefone','Categoria'];
  return ss.getSheets().filter(function(sheet){
    const colunas=sheet.getLastColumn();
    if(colunas<campos.length+1)return false;
    const headers=sheet.getRange(1,1,1,colunas).getDisplayValues()[0].map(texto_);
    return campos.every(function(campo){return headers.indexOf(campo)!==-1;});
  }).map(function(sheet){return{nome:sheet.getName(),respostas:Math.max(0,sheet.getLastRow()-1)};});
}

function simularReconciliacaoEvent3Atual_() {
  const participantes=lerTabela_(CONFIG.SHEETS.PARTICIPANTES),inscricoes=lerTabela_(CONFIG.SHEETS.INSCRICOES);
  validarCabecalho_(participantes.headers,CONFIG.HEADERS.PARTICIPANTES,CONFIG.SHEETS.PARTICIPANTES);
  validarCabecalho_(inscricoes.headers,CONFIG.HEADERS.INSCRICOES,CONFIG.SHEETS.INSCRICOES);
  const porPessoa={},origens={EVENT3:0,FORM_EVENTO:0,vazias:0,invalidas:0};
  inscricoes.rows.forEach(function(inscricao){
    const origem=normalizarComparacao_(inscricao.ORIGEM_INSCRICAO);
    if(origem==='EVENT3'||origem==='FORM_EVENTO')origens[origem]++;
    else if(!origem)origens.vazias++;
    else origens.invalidas++;
    if(origem!=='EVENT3')return;
    const id=texto_(inscricao.ID_PESSOA);if(!id)return;
    porPessoa[id]=porPessoa[id]||[];porPessoa[id].push(inscricao);
  });
  const preenchimentos={nomeCracha:0,email:0,cpf:0},conflitos={nomeCracha:0,email:0,cpf:0};
  let candidatosAtualizacao=0;
  participantes.rows.forEach(function(participante){
    const copia=Object.assign({},participante),avaliacao=avaliarEnriquecimentoCanonico_(copia,porPessoa[texto_(participante.ID_PESSOA)]||[]);
    if(avaliacao.alterado)candidatosAtualizacao++;
    if(avaliacao.preenchidos.NOME_CRACHA)preenchimentos.nomeCracha++;
    if(avaliacao.preenchidos.EMAIL)preenchimentos.email++;
    if(avaliacao.preenchidos.CPF)preenchimentos.cpf++;
    avaliacao.conflitos.forEach(function(conflito){if(conflito.campo==='NOME_CRACHA')conflitos.nomeCracha++;else if(conflito.campo==='EMAIL')conflitos.email++;else if(conflito.campo==='CPF')conflitos.cpf++;});
  });
  return{participantesUnicos:conjuntoIds_(participantes.rows.map(function(p){return p.ID_PESSOA;})).length,inscricoesTotal:inscricoes.rows.length,inscricoesEvent3:origens.EVENT3,inscricoesFormEvento:origens.FORM_EVENTO,origensVazias:origens.vazias,origensInvalidas:origens.invalidas,dryRun:{candidatosAtualizacao:candidatosAtualizacao,preenchimentos:preenchimentos,conflitos:conflitos,escritas:0},baseVersion:obterBaseVersion_()};
}

function lerEstadoAbaSomenteLeitura_(ss,nome) { const sh=ss.getSheetByName(nome);if(!sh)return{existe:false,headers:[],rows:[],total:0};const valores=sh.getDataRange().getDisplayValues(),headers=(valores[0]||[]).map(texto_),rows=valores.slice(1).filter(function(row){return row.some(function(valor){return texto_(valor);});});return{existe:true,headers:headers,rows:rows,total:rows.length}; }
function cabecalhoComecaCom_(atual,esperado) { return esperado.every(function(header,index){return atual[index]===header;}); }
function cabecalhoExato_(atual,esperado) { return atual.length===esperado.length&&cabecalhoComecaCom_(atual,esperado); }

function resumoIntegridadeEstrutura_() {
  const participantes=lerTabela_(CONFIG.SHEETS.PARTICIPANTES).rows,inscricoes=lerTabela_(CONFIG.SHEETS.INSCRICOES).rows,presencas=lerTabela_(CONFIG.SHEETS.PRESENCAS).rows;
  const resumo=function(rows,campo){const ids=rows.map(function(row){return texto_(row[campo]);});return{total:rows.length,assinatura:hashCurto_(ids.join('\n'),32)};};
  return{participantes:resumo(participantes,'ID_PESSOA'),inscricoes:resumo(inscricoes,'NUMERO_INSCRICAO'),presencas:resumo(presencas,'ID_PRESENCA')};
}

function criarFormularioInscricaoLocal() {
  const integridade=verificarIntegridadeEstruturaInscricoesLocais();
  if(!integridade.integridadePreservada)throw criarErro_('ESTRUTURA_INSCRICOES_LOCAL_INVALIDA','A estrutura de inscrições locais não está íntegra. Revise a auditoria antes de criar ou completar o formulário.');
  const propriedades=PropertiesService.getScriptProperties();
  const formId=texto_(propriedades.getProperty(FORM_LOCAL.PROPERTIES.ID));
  let form=null,criado=false;
  if(formId){try{form=FormApp.openById(formId);}catch(_){throw criarErro_('FORMULARIO_CONFIGURADO_INACESSIVEL','O FORM_ID configurado não pôde ser aberto. Nenhum novo formulário foi criado.');}}
  if(!form){
    form=FormApp.create(FORM_LOCAL.TITULO,true);
    propriedades.setProperty(FORM_LOCAL.PROPERTIES.ID,form.getId());
    criado=true;
  }
  const categorias=categoriasReaisFormulario_();
  if(!categorias.length)throw criarErro_('CATEGORIAS_AUSENTES','Nenhuma categoria real foi encontrada em INSCRICOES.');
  form.setTitle(FORM_LOCAL.TITULO).setDescription(FORM_LOCAL.DESCRICAO).setConfirmationMessage(FORM_LOCAL.CONFIRMACAO).setCollectEmail(false).setLimitOneResponsePerUser(false).setPublishingSummary(false).setShowLinkToRespondAgain(true).setShuffleQuestions(false);
  const itens=garantirCamposFormularioLocal_(form,categorias);
  const destinoPersistido=texto_(propriedades.getProperty(FORM_LOCAL.PROPERTIES.RESPONSE_SPREADSHEET_ID));
  const destinoPlanejado=destinoPersistido||CONFIG.SPREADSHEET_ID;
  if(destinoPlanejado!==CONFIG.SPREADSHEET_ID)throw criarErro_('DESTINO_FORMULARIO_CONFIGURADO_DIVERGENTE','O spreadsheet de respostas configurado diverge da arquitetura aprovada.');
  let destino=obterDestinoFormularioSeguro_(form);
  if(!destino.existe&&!destinoPersistido){propriedades.setProperty(FORM_LOCAL.PROPERTIES.RESPONSE_SPREADSHEET_ID,destinoPlanejado);form.setDestination(FormApp.DestinationType.SPREADSHEET,destinoPlanejado);}
  if(!destino.existe)destino=aguardarDestinoFormulario_(form);
  if(!destino.existe||destino.tipo!==FormApp.DestinationType.SPREADSHEET||destino.id!==destinoPlanejado)throw criarErro_('DESTINO_FORMULARIO_DIVERGENTE','O formulário não está vinculado ao spreadsheet de respostas aprovado.');
  if(!destinoPersistido)propriedades.setProperty(FORM_LOCAL.PROPERTIES.RESPONSE_SPREADSHEET_ID,destino.id);
  propriedades.setProperties((function(){const p={};p[FORM_LOCAL.PROPERTIES.URL]=form.getPublishedUrl();p[FORM_LOCAL.PROPERTIES.EDIT_URL]=form.getEditUrl();p[FORM_LOCAL.PROPERTIES.ITEMS]=JSON.stringify(itens);return p;})(),false);
  const trigger=garantirTriggerFormularioLocal_(form);
  const resultado={criado:criado,formId:form.getId(),formUrl:form.getPublishedUrl(),editUrl:form.getEditUrl(),triggerCriado:trigger.criado,triggerId:trigger.id,campos:form.getItems().map(function(item){return{titulo:item.getTitle(),obrigatorio:item.getType()===FormApp.ItemType.TEXT?item.asTextItem().isRequired():item.getType()===FormApp.ItemType.MULTIPLE_CHOICE?item.asMultipleChoiceItem().isRequired():false};})};
  console.log(JSON.stringify(resultado,null,2));
  return resultado;
}

function obterDestinoFormularioSeguro_(form) {
  let tipo=null;
  try{tipo=form.getDestinationType();}
  catch(erro){if(erroDestinoFormularioAusente_(erro))return{existe:false,tipo:null,id:''};throw erro;}
  if(!tipo)return{existe:false,tipo:null,id:''};
  return{existe:true,tipo:tipo,id:texto_(form.getDestinationId())};
}

function aguardarDestinoFormulario_(form) { let destino={existe:false,tipo:null,id:''};for(let tentativa=0;tentativa<5;tentativa++){destino=obterDestinoFormularioSeguro_(form);if(destino.existe)return destino;if(tentativa<4)Utilities.sleep(200);}return destino; }

function erroDestinoFormularioAusente_(erro) { const mensagem=normalizarComparacao_(erro&&erro.message||erro);return/NO RESPONSE DESTINATION|NAO (?:TEM|HA|EXISTE|POSSUI).*DESTINO|SEM DESTINO/.test(mensagem); }

function garantirCamposFormularioLocal_(form,categorias) {
  const existentes={};
  form.getItems().forEach(function(item){const titulo=texto_(item.getTitle());if(!titulo)return;if(existentes[titulo])throw criarErro_('CAMPO_FORMULARIO_DUPLICADO','O formulário contém mais de um campo com o título "'+titulo+'". Revise o formulário antes de continuar.');existentes[titulo]=item;});
  const garantirTexto=function(titulo,obrigatorio,ajuda){const item=existentes[titulo];let campo;if(item){if(item.getType()!==FormApp.ItemType.TEXT)throw criarErro_('CAMPO_FORMULARIO_INCOMPATIVEL','O campo "'+titulo+'" possui tipo incompatível.');campo=item.asTextItem();}else campo=form.addTextItem().setTitle(titulo);campo.setRequired(obrigatorio);if(ajuda)campo.setHelpText(ajuda);return campo.getId();};
  const itens={nome:garantirTexto('Nome completo',true,''),nomeCracha:garantirTexto('Nome para crachá',false,''),cpf:garantirTexto('CPF',false,'Informe somente os números.'),email:garantirTexto('E-mail',false,''),telefone:garantirTexto('Telefone',false,'Informe DDD e número.')};
  const itemCategoria=existentes.Categoria;let categoria;
  if(itemCategoria){if(itemCategoria.getType()!==FormApp.ItemType.MULTIPLE_CHOICE)throw criarErro_('CAMPO_FORMULARIO_INCOMPATIVEL','O campo "Categoria" possui tipo incompatível.');categoria=itemCategoria.asMultipleChoiceItem();}
  else categoria=form.addMultipleChoiceItem().setTitle('Categoria');
  categoria.setChoiceValues(categorias).setRequired(true);
  itens.categoria=categoria.getId();
  return itens;
}

function garantirTriggerFormularioLocal_(form) {
  const correspondentes=ScriptApp.getProjectTriggers().filter(function(trigger){return trigger.getHandlerFunction()===FORM_LOCAL.HANDLER&&trigger.getEventType()===ScriptApp.EventType.ON_FORM_SUBMIT&&trigger.getTriggerSourceId()===form.getId();});
  correspondentes.slice(1).forEach(function(trigger){ScriptApp.deleteTrigger(trigger);});
  if(correspondentes.length)return{criado:false,id:correspondentes[0].getUniqueId()};
  const criado=ScriptApp.newTrigger(FORM_LOCAL.HANDLER).forForm(form).onFormSubmit().create();
  return{criado:true,id:criado.getUniqueId()};
}

function onFormSubmitInscricaoLocal(e) {
  let registro=null;
  try {registro=extrairRegistroFormulario_(e&&e.response);return processarInscricaoLocal_(registro);}
  catch(erro){if(registro&&registro.responseId)registrarControleInscricaoLocalSeguro_(registro,'ERRO','','',erro.message);throw erro;}
}

function processarInscricaoLocal_(registro) {
  validarRegistroFormulario_(registro);
  const lock=LockService.getScriptLock();
  try {
    if(!lock.tryLock(30000))throw criarErro_('SISTEMA_OCUPADO','Há outro cadastro em andamento.');
    const participantes=lerTabela_(CONFIG.SHEETS.PARTICIPANTES),inscricoes=lerTabela_(CONFIG.SHEETS.INSCRICOES),controle=lerTabela_(CONFIG.SHEETS.INSCRICOES_LOCAL_CONTROLE);
    validarCabecalho_(participantes.headers,CONFIG.HEADERS.PARTICIPANTES,CONFIG.SHEETS.PARTICIPANTES);
    validarCabecalho_(inscricoes.headers,CONFIG.HEADERS.INSCRICOES,CONFIG.SHEETS.INSCRICOES);
    validarCabecalho_(controle.headers,CONFIG.HEADERS.INSCRICOES_LOCAL_CONTROLE,CONFIG.SHEETS.INSCRICOES_LOCAL_CONTROLE);
    const idOrigem='FORM:'+registro.responseId,numero=numeroInscricaoLocal_(registro.responseId);
    const controleExistente=controle.rows.find(function(r){return texto_(r.RESPONSE_ID)===registro.responseId&&['PROCESSADA','ASSOCIADA','DUPLICADA'].indexOf(normalizarComparacao_(r.STATUS))!==-1;});
    if(controleExistente)return{status:'DUPLICADA',idPessoa:texto_(controleExistente.ID_PESSOA),numeroInscricao:texto_(controleExistente.NUMERO_INSCRICAO),baseVersion:obterBaseVersion_()};
    const inscricaoExistente=inscricoes.rows.find(function(i){return texto_(i.ID_ORIGEM)===idOrigem||normalizarNumeroInscricao_(i.NUMERO_INSCRICAO)===numero;});
    if(inscricaoExistente){const versaoExistente=incrementarBaseVersion_(idOrigem);registrarControleInscricaoLocal_(controle,registro,'DUPLICADA',texto_(inscricaoExistente.ID_PESSOA),numero,'');return{status:'DUPLICADA',idPessoa:texto_(inscricaoExistente.ID_PESSOA),numeroInscricao:numero,baseVersion:versaoExistente};}
    const pessoas=participantes.rows.map(function(p,i){p.__linha=i+2;return p;});
    let pessoa=localizarPessoaFormulario_(registro,pessoas,numero),nova=false;
    if(!pessoa){pessoa={ID_PESSOA:'P'+String(proximoIdPessoa_(pessoas)).padStart(6,'0'),NOME:registro.nome,NOME_NORMALIZADO:normalizarComparacao_(registro.nome),NOME_CRACHA:registro.nomeCracha,EMAIL:registro.email,CPF:registro.cpf,TELEFONE:registro.telefone,NUMEROS_INSCRICAO:numero,QTD_INSCRICOES:1,PRIMEIRA_INSCRICAO_EM:registro.dataInscricao+' '+registro.horaInscricao,ULTIMA_ATUALIZACAO:agoraTexto_(),__linha:0};nova=true;}
    else{completarPessoa_(pessoa,registro);const numeros=numerosInscricaoUnicos_(texto_(pessoa.NUMEROS_INSCRICAO).split(/[|,;\s]+/).filter(Boolean).concat([numero]));pessoa.NUMEROS_INSCRICAO=numeros.join('|');pessoa.QTD_INSCRICOES=numeros.length;pessoa.ULTIMA_ATUALIZACAO=agoraTexto_();}
    if(nova)participantes.sheet.getRange(participantes.sheet.getLastRow()+1,1,1,CONFIG.HEADERS.PARTICIPANTES.length).setValues([linhaPessoa_(pessoa)]);
    else participantes.sheet.getRange(pessoa.__linha,1,1,CONFIG.HEADERS.PARTICIPANTES.length).setValues([linhaPessoa_(pessoa)]);
    const linha=[numero,pessoa.ID_PESSOA,idOrigem,registro.nome,registro.nomeCracha,registro.email,registro.cpf,registro.categoria,registro.dataInscricao,registro.horaInscricao,'GOOGLE_FORMS',agoraTexto_(),'FORM_EVENTO'];
    inscricoes.sheet.getRange(inscricoes.sheet.getLastRow()+1,1,1,CONFIG.HEADERS.INSCRICOES.length).setValues([linha]);
    const versao=incrementarBaseVersion_(idOrigem),status=nova?'PROCESSADA':'ASSOCIADA';
    registrarControleInscricaoLocal_(controle,registro,status,pessoa.ID_PESSOA,numero,'');
    return{status:status,idPessoa:pessoa.ID_PESSOA,numeroInscricao:numero,baseVersion:versao};
  } catch(erro){registrarControleInscricaoLocalSeguro_(registro,'ERRO','','',erro.message);throw erro;}
  finally{if(lock.hasLock())lock.releaseLock();}
}

function extrairRegistroFormulario_(response) {
  if(!response)throw criarErro_('FORM_RESPONSE_AUSENTE','Resposta do formulário ausente.');
  const responseId=texto_(response.getId());if(!responseId)throw criarErro_('FORM_RESPONSE_ID_AUSENTE','A resposta não possui identificador.');
  const ids=JSON.parse(PropertiesService.getScriptProperties().getProperty(FORM_LOCAL.PROPERTIES.ITEMS)||'{}'),respostas={};
  response.getItemResponses().forEach(function(itemResponse){respostas[String(itemResponse.getItem().getId())]=itemResponse.getResponse();});
  const timestamp=response.getTimestamp()||new Date();
  return{responseId:responseId,timestamp:Utilities.formatDate(timestamp,CONFIG.TIMEZONE,"yyyy-MM-dd'T'HH:mm:ssXXX"),nome:texto_(respostas[ids.nome]),nomeCracha:texto_(respostas[ids.nomeCracha]),cpf:somenteDigitos_(respostas[ids.cpf]),email:normalizarEmail_(respostas[ids.email]),telefone:somenteDigitos_(respostas[ids.telefone]),categoria:texto_(respostas[ids.categoria]),dataInscricao:Utilities.formatDate(timestamp,CONFIG.TIMEZONE,'dd/MM/yyyy'),horaInscricao:Utilities.formatDate(timestamp,CONFIG.TIMEZONE,'HH:mm:ss')};
}

function validarRegistroFormulario_(registro) { if(!registro||!texto_(registro.responseId))throw criarErro_('FORM_RESPONSE_ID_AUSENTE','A resposta não possui identificador.');if(!texto_(registro.nome))throw criarErro_('NOME_OBRIGATORIO','Informe o nome completo.');if(registro.cpf&&!cpfValido_(registro.cpf))throw criarErro_('CPF_INVALIDO','CPF inválido.');if(registro.email&&!emailValido_(registro.email))throw criarErro_('EMAIL_INVALIDO','E-mail inválido.');const categoria=categoriaRealCorrespondente_(registro.categoria);if(!categoria)throw criarErro_('CATEGORIA_INVALIDA','Categoria inválida.');registro.categoria=categoria; }
function localizarPessoaFormulario_(registro,pessoas,numero) { const porNumero=pessoas.filter(function(p){return numerosInscricaoUnicos_(texto_(p.NUMEROS_INSCRICAO).split(/[|,;\s]+/)).indexOf(numero)!==-1;});if(porNumero.length===1)return porNumero[0];const porCpf=registro.cpf?pessoas.filter(function(p){return somenteDigitos_(p.CPF)===registro.cpf;}):[];if(porCpf.length>1)throw criarErro_('CPF_AMBIGUO','CPF associado a mais de uma pessoa.');if(porCpf.length===1)return porCpf[0];const porEmail=registro.email?pessoas.filter(function(p){return normalizarEmail_(p.EMAIL)===registro.email;}):[];return porEmail.length===1?porEmail[0]:null; }
function numeroInscricaoLocal_(responseId) { return 'LOCAL-'+hashCurto_('FORM:'+responseId,20); }
function cpfValido_(valor) { const cpf=somenteDigitos_(valor);if(!/^\d{11}$/.test(cpf)||/^(\d)\1{10}$/.test(cpf))return false;const digito=function(tamanho,peso){let soma=0;for(let i=0;i<tamanho;i++)soma+=Number(cpf[i])*(peso-i);const resto=soma%11;return resto<2?0:11-resto;};return digito(9,10)===Number(cpf[9])&&digito(10,11)===Number(cpf[10]); }
function emailValido_(valor) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarEmail_(valor)); }
function categoriasReaisFormulario_() { const vistos={};return lerTabela_(CONFIG.SHEETS.INSCRICOES).rows.map(function(i){return texto_(i.CATEGORIA);}).filter(function(c){const chave=normalizarComparacao_(c);if(!chave||vistos[chave])return false;vistos[chave]=true;return true;}).sort(); }
function categoriaRealCorrespondente_(valor) { const alvo=normalizarComparacao_(valor);return categoriasReaisFormulario_().find(function(c){return normalizarComparacao_(c)===alvo;})||''; }

function registrarControleInscricaoLocal_(controle,registro,status,idPessoa,numero,erro) { const linha=[registro.responseId,registro.timestamp||'',status,idPessoa||'',numero||'',agoraTexto_(),texto_(erro).slice(0,500)],existente=controle.rows.findIndex(function(r){return texto_(r.RESPONSE_ID)===registro.responseId;});if(existente>=0)controle.sheet.getRange(existente+2,1,1,linha.length).setValues([linha]);else controle.sheet.getRange(controle.sheet.getLastRow()+1,1,1,linha.length).setValues([linha]); }
function registrarControleInscricaoLocalSeguro_(registro,status,idPessoa,numero,erro) { try{const controle=lerTabela_(CONFIG.SHEETS.INSCRICOES_LOCAL_CONTROLE);validarCabecalho_(controle.headers,CONFIG.HEADERS.INSCRICOES_LOCAL_CONTROLE,CONFIG.SHEETS.INSCRICOES_LOCAL_CONTROLE);registrarControleInscricaoLocal_(controle,registro,status,idPessoa,numero,erro);}catch(_){} }

function reprocessarInscricoesLocalPendentes() { const formId=texto_(PropertiesService.getScriptProperties().getProperty(FORM_LOCAL.PROPERTIES.ID));if(!formId)throw criarErro_('FORMULARIO_NAO_CONFIGURADO','Execute criarFormularioInscricaoLocal primeiro.');const controle=lerTabela_(CONFIG.SHEETS.INSCRICOES_LOCAL_CONTROLE),concluidos={};controle.rows.forEach(function(r){if(['PROCESSADA','ASSOCIADA','DUPLICADA'].indexOf(normalizarComparacao_(r.STATUS))!==-1)concluidos[texto_(r.RESPONSE_ID)]=true;});const resumo={analisadas:0,reprocessadas:0,erros:0};FormApp.openById(formId).getResponses().forEach(function(response){const id=texto_(response.getId());if(!id||concluidos[id])return;resumo.analisadas++;try{processarInscricaoLocal_(extrairRegistroFormulario_(response));resumo.reprocessadas++;}catch(_){resumo.erros++;}});return resumo; }

function garantirColunaOrigemInscricao_() { const sh=sheetObrigatoria_(CONFIG.SHEETS.INSCRICOES),values=sh.getDataRange().getDisplayValues(),headers=(values[0]||[]).map(texto_),legado=CONFIG.HEADERS.INSCRICOES.slice(0,-1);validarCabecalho_(headers,legado,CONFIG.SHEETS.INSCRICOES);let criada=false;if(headers.indexOf('ORIGEM_INSCRICAO')===-1){if(headers.length!==legado.length)throw criarErro_('CABECALHO_AMBIGUO','Há colunas extras em INSCRICOES; revise antes de adicionar ORIGEM_INSCRICAO.');sh.getRange(1,legado.length+1).setValue('ORIGEM_INSCRICAO');criada=true;}const tabela=lerTabela_(CONFIG.SHEETS.INSCRICOES),coluna=CONFIG.HEADERS.INSCRICOES.indexOf('ORIGEM_INSCRICAO')+1;let preenchidas=0,ambiguas=0;if(tabela.rows.length){const saida=tabela.rows.map(function(i){const atual=texto_(i.ORIGEM_INSCRICAO);if(atual)return[atual];const inferida=origemInscricao_(i)||(texto_(i.ID_ORIGEM)||texto_(i.ARQUIVO_ORIGEM)?'EVENT3':'');if(inferida){preenchidas++;return[inferida];}ambiguas++;return[''];});sh.getRange(2,coluna,saida.length,1).setValues(saida);}return{criada:criada,preenchidas:preenchidas,ambiguas:ambiguas}; }
function garantirAbaControleInscricoesLocal_() { const ss=spreadsheet_();let sh=ss.getSheetByName(CONFIG.SHEETS.INSCRICOES_LOCAL_CONTROLE),criada=false;if(!sh){sh=ss.insertSheet(CONFIG.SHEETS.INSCRICOES_LOCAL_CONTROLE);sh.getRange(1,1,1,CONFIG.HEADERS.INSCRICOES_LOCAL_CONTROLE.length).setValues([CONFIG.HEADERS.INSCRICOES_LOCAL_CONTROLE]);sh.getRange(1,1,1,CONFIG.HEADERS.INSCRICOES_LOCAL_CONTROLE.length).setFontWeight('bold');sh.setFrozenRows(1);criada=true;}else validarCabecalho_(lerTabela_(CONFIG.SHEETS.INSCRICOES_LOCAL_CONTROLE).headers,CONFIG.HEADERS.INSCRICOES_LOCAL_CONTROLE,CONFIG.SHEETS.INSCRICOES_LOCAL_CONTROLE);return{criada:criada}; }
function garantirCapacidadeEvento_() { const sh=sheetObrigatoria_(CONFIG.SHEETS.CONFIG),values=sh.getDataRange().getDisplayValues(),alvo='CAPACIDADE_EVENTO';for(let i=0;i<values.length;i++)if(normalizarComparacao_(values[i][0])===alvo){const valor=Number(texto_(values[i].slice(1).find(texto_)));if(!Number.isFinite(valor)||valor<=0)throw criarErro_('CAPACIDADE_INVALIDA','CAPACIDADE_EVENTO deve ser um número positivo.');return{criada:false,valor:valor};}sh.getRange(sh.getLastRow()+1,1,1,2).setValues([[alvo,CONFIG.CAPACIDADE_EVENTO_PADRAO]]);return{criada:true,valor:CONFIG.CAPACIDADE_EVENTO_PADRAO}; }
