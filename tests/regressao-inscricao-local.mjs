import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

let sheetWriteCount=0;

class FakeRange{
  constructor(sheet,row,col,numRows=1,numCols=1){Object.assign(this,{sheet,row,col,numRows,numCols});}
  setValues(values){sheetWriteCount++;if(this.sheet.failNextAppend&&this.row>this.sheet.getLastRow()){this.sheet.failNextAppend=false;throw new Error('falha de escrita simulada');}for(let r=0;r<this.numRows;r++){const target=this.row-1+r;while(this.sheet.data.length<=target)this.sheet.data.push([]);for(let c=0;c<this.numCols;c++)this.sheet.data[target][this.col-1+c]=values[r][c];}return this;}
  setValue(value){return this.setValues([[value]]);}
  getDisplayValues(){return Array.from({length:this.numRows},(_,r)=>Array.from({length:this.numCols},(_,c)=>String(this.sheet.data[this.row-1+r]?.[this.col-1+c]??'')));}
  setFontWeight(){return this;}
}
class FakeSheet{
  constructor(name,data=[]){this.name=name;this.data=data.map(row=>row.slice());this.failNextAppend=false;}
  getDataRange(){return{getDisplayValues:()=>this.data.map(row=>row.map(value=>value==null?'':String(value)))};}
  getRange(row,col,numRows=1,numCols=1){return new FakeRange(this,row,col,numRows,numCols);}
  getLastRow(){return this.data.length;}
  getLastColumn(){return Math.max(0,...this.data.map(row=>row.length));}
  getName(){return this.name;}
  setFrozenRows(){return this;}
}
class FakeSpreadsheet{
  constructor(sheets){this.sheets=sheets;this.formUrl='';}
  getSheetByName(name){return this.sheets[name]||null;}
  getSheets(){return Object.values(this.sheets);}
  insertSheet(name){const sheet=new FakeSheet(name);this.sheets[name]=sheet;return sheet;}
}
class FakeTypedItem{
  constructor(type,id){this.type=type;this.id=id;this.title='';this.required=false;this.choices=[];}
  setTitle(value){this.title=value;return this;} getTitle(){return this.title;} getType(){return this.type;} getId(){return this.id;}
  setRequired(value){this.required=value;return this;} isRequired(){return this.required;} setHelpText(){return this;}
}
class FakeTextItem extends FakeTypedItem{constructor(id){super('TEXT',id);}}
class FakeMultipleChoiceItem extends FakeTypedItem{constructor(id){super('MULTIPLE_CHOICE',id);}setChoiceValues(values){this.choices=values.slice();return this;}}
class FakeCheckboxItem extends FakeTypedItem{constructor(id){super('CHECKBOX',id);}setChoiceValues(values){this.choices=values.slice();return this;}getChoices(){return this.choices.map(value=>({getValue:()=>value}));}}
class FakeGenericItem{
  constructor(typed){this.typed=typed;} getTitle(){return this.typed.getTitle();} getType(){return this.typed.getType();} getId(){return this.typed.getId();}
  asTextItem(){if(this.getType()!=='TEXT')throw new TypeError('não é TextItem');return this.typed;}
  asMultipleChoiceItem(){if(this.getType()!=='MULTIPLE_CHOICE')throw new TypeError('não é MultipleChoiceItem');return this.typed;}
  asCheckboxItem(){if(this.getType()!=='CHECKBOX')throw new TypeError('não é CheckboxItem');return this.typed;}
}
class FakeForm{
  constructor(id,title){this.id=id;this.title=title;this.items=[];this.destination='';this.destinationType=null;this.destinationIdReadsWithoutDestination=0;this.destinationVisibilityDelay=0;this.setDestinationCalls=0;this.failNextAddTextItem=false;this.failAfterSetDestination=false;}
  getId(){return this.id;} setTitle(value){this.title=value;return this;} setDescription(){return this;} setConfirmationMessage(){return this;} setCollectEmail(){return this;} setLimitOneResponsePerUser(){return this;} setPublishingSummary(){return this;} setShowLinkToRespondAgain(){return this;} setShuffleQuestions(){return this;}
  addTextItem(){if(this.failNextAddTextItem){this.failNextAddTextItem=false;throw new Error('interrupção simulada após criar o Forms');}const item=new FakeTextItem(this.items.length+1);this.items.push(item);return item;} addMultipleChoiceItem(){const item=new FakeMultipleChoiceItem(this.items.length+1);this.items.push(item);return item;} addCheckboxItem(){const item=new FakeCheckboxItem(this.items.length+1);this.items.push(item);return item;} getItems(){return this.items.map(item=>new FakeGenericItem(item));}
  getDestinationType(){if(this.failAfterSetDestination&&this.destination){this.failAfterSetDestination=false;throw new Error('falha simulada após setDestination');}if(!this.destination||this.destinationVisibilityDelay>0){if(this.destinationVisibilityDelay>0)this.destinationVisibilityDelay--;throw new Error('The form currently has no response destination.');}return this.destinationType;}
  getDestinationId(){if(!this.destination){this.destinationIdReadsWithoutDestination++;throw new Error('The form currently has no response destination.');}return this.destination;}
  setDestination(type,id){this.setDestinationCalls++;this.destinationType=type;this.destination=id;return this;} getPublishedUrl(){return 'https://docs.google.com/forms/d/e/'+this.id+'/viewform';} getEditUrl(){return 'https://docs.google.com/forms/d/'+this.id+'/edit';}
  getResponses(){return [];}
}

const headers={
  participantes:['ID_PESSOA','NOME','NOME_NORMALIZADO','NOME_CRACHA','EMAIL','CPF','TELEFONE','NUMEROS_INSCRICAO','QTD_INSCRICOES','PRIMEIRA_INSCRICAO_EM','ULTIMA_ATUALIZACAO'],
  inscricoes:['NUMERO_INSCRICAO','ID_PESSOA','ID_ORIGEM','NOME_ORIGEM','NOME_CRACHA_ORIGEM','EMAIL_ORIGEM','CPF_ORIGEM','CATEGORIA','DATA_INSCRICAO','HORA_INSCRICAO','ARQUIVO_ORIGEM','IMPORTADO_EM'],
  presencas:['ID_PRESENCA','ID_PESSOA','NUMERO_INSCRICAO_LIDO','NOME','DATA_HORA','DATA','HORA','PERIODO','OPERADOR','DISPOSITIVO','ORIGEM_REGISTRO','OBSERVACAO'],
  importacoes:['ID_IMPORTACAO','ARQUIVO','DATA_HORA_ARQUIVO','IMPORTADO_EM','REGISTROS_LIDOS','INSCRICOES_NOVAS','PESSOAS_NOVAS','PESSOAS_ATUALIZADAS','STATUS','MENSAGEM']
};
const participante=(id,nome,email,cpf,numero)=>[id,nome,nome.toUpperCase(),'CRACHÁ '+nome,email,cpf,'',numero,1,'2026-09-01 10:00:00','2026-09-01 10:00:00'];
const inscricao=(numero,id,nome,email,cpf,categoria='Profissional')=>[numero,id,'EVT:'+numero,nome,'CRACHÁ '+nome,email,cpf,categoria,'01/09/2026','10:00:00','event3.xlsx','2026-09-01 10:00:00'];
const sheets={
  PARTICIPANTES:new FakeSheet('PARTICIPANTES',[headers.participantes,
    participante('P000001','Alice','alice@example.org','52998224725','1001'),
    participante('P000002','Bruno','comum@example.org','','1002'),
    participante('P000003','Carla','comum@example.org','','1003'),
    participante('P000004','Nome Igual','','','1004'),
    participante('P000005','Nome Igual','','','1005')]),
  INSCRICOES:new FakeSheet('INSCRICOES',[headers.inscricoes,
    inscricao('1001','P000001','Alice','alice@example.org','52998224725'),
    inscricao('1002','P000002','Bruno','comum@example.org',''),
    inscricao('1003','P000003','Carla','comum@example.org',''),
    inscricao('1004','P000004','Nome Igual','','','Estudante'),
    inscricao('1005','P000005','Nome Igual','','','Estudante')]),
  PRESENCAS:new FakeSheet('PRESENCAS',[headers.presencas]),
  IMPORTACOES:new FakeSheet('IMPORTACOES',[headers.importacoes]),
  CONFIG:new FakeSheet('CONFIG',[['CHAVE','VALOR'],['TOKEN_IMPORTACAO','segredo-na-fixture']])
};
const spreadsheet=new FakeSpreadsheet(sheets),properties=new Map([['BASE_VERSION','1']]),cache=new Map();
const scriptProperties={getProperty:key=>properties.get(key)||'',setProperty:(key,value)=>{properties.set(key,String(value));},setProperties:values=>{Object.entries(values).forEach(([key,value])=>properties.set(key,String(value)));}};
const lock={held:false,tryLock(){this.held=true;return true;},waitLock(){this.held=true;},hasLock(){return this.held;},releaseLock(){this.held=false;}};
const forms=new Map(),triggers=[];let formSequence=0;
const logs=[];
const formApp={ItemType:{TEXT:'TEXT',MULTIPLE_CHOICE:'MULTIPLE_CHOICE',CHECKBOX:'CHECKBOX'},DestinationType:{SPREADSHEET:'SPREADSHEET'},create:title=>{const form=new FakeForm('FORM-'+(++formSequence),title);forms.set(form.id,form);return form;},openById:id=>{if(!forms.has(id))throw new Error('form ausente');return forms.get(id);}};
const scriptApp={EventType:{ON_FORM_SUBMIT:'ON_FORM_SUBMIT'},getProjectTriggers:()=>triggers.slice(),deleteTrigger:trigger=>triggers.splice(triggers.indexOf(trigger),1),newTrigger:handler=>({forForm:form=>({onFormSubmit:()=>({create:()=>{const trigger={getHandlerFunction:()=>handler,getEventType:()=>scriptApp.EventType.ON_FORM_SUBMIT,getTriggerSourceId:()=>form.id,getUniqueId:()=>`TRIGGER-${triggers.length+1}`};triggers.push(trigger);return trigger;}})})})};
const context={
  SpreadsheetApp:{openById:()=>spreadsheet},
  PropertiesService:{getScriptProperties:()=>scriptProperties},
  CacheService:{getScriptCache:()=>({get:key=>cache.get(key)||null,put:(key,value)=>cache.set(key,String(value)),removeAll:keys=>keys.forEach(key=>cache.delete(key))})},
  LockService:{getScriptLock:()=>lock},
  Utilities:{
    DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},
    computeDigest:(_algorithm,value)=>Array.from(crypto.createHash('sha256').update(String(value)).digest()).map(byte=>byte>127?byte-256:byte),
    formatDate:(_date,_timezone,format)=>({'yyyy-MM-dd HH:mm:ss':'2026-09-13 10:30:00','dd/MM/yyyy':'13/09/2026','HH:mm:ss':'10:30:00',"yyyy-MM-dd'T'HH:mm:ssXXX":'2026-09-13T10:30:00-03:00'}[format]||'2026-09-13'),
    getUuid:()=>crypto.randomUUID(),sleep:()=>{}
  },
  FormApp:formApp,
  ScriptApp:scriptApp,
  ContentService:{createTextOutput:()=>({setMimeType(){return this;}}),MimeType:{JSON:'JSON'}},
  console:{log:value=>logs.push(String(value))}
};
vm.createContext(context);
const files=['Config.gs','Code.gs','Migracao.gs','Cache.gs','Consulta.gs','Importacao.gs','Painel.gs','InscricaoLocal.gs'];
const source=files.map(file=>fs.readFileSync(new URL('../apps-script/'+file,import.meta.url),'utf8')).join('\n');
vm.runInContext(`${source}\nglobalThis.localExports_={prepararEstruturaInscricoesLocais,verificarIntegridadeEstruturaInscricoesLocais,auditarImplantacaoInscricoesLocais,criarFormularioInscricaoLocal,processarInscricaoLocal_,numeroInscricaoLocal_,buscarPorInscricao_,obterIndiceParticipantes_};`,context);
const api=context.localExports_;

const before={participantes:sheets.PARTICIPANTES.data.length-1,inscricoes:sheets.INSCRICOES.data.length-1,presencas:sheets.PRESENCAS.data.length-1};
const migration=api.prepararEstruturaInscricoesLocais();
assert.equal(migration.colunaOrigemCriada,true);
assert.equal(migration.origensEvent3Preenchidas,5);
assert.equal(migration.origensAmbiguas,0);
assert.equal(migration.abaControleCriada,true);
assert.equal(migration.capacidade,458);
assert.deepEqual(JSON.parse(JSON.stringify(migration.contagensAntes)),before);
assert.deepEqual(JSON.parse(JSON.stringify(migration.contagensDepois)),before);
assert.equal(migration.integridadePreservada,true);
assert.deepEqual({participantes:sheets.PARTICIPANTES.data.length-1,inscricoes:sheets.INSCRICOES.data.length-1,presencas:sheets.PRESENCAS.data.length-1},before,'migração estrutural não pode alterar contagens');
assert.ok(sheets.INSCRICOES.data.slice(1).every(row=>row[12]==='EVENT3'));

const snapshotLeitura=JSON.stringify({sheets:Object.fromEntries(Object.entries(sheets).map(([nome,sheet])=>[nome,sheet.data])),properties:[...properties],forms:[...forms.keys()],triggers:triggers.length,cache:[...cache]});
const auditoria=api.verificarIntegridadeEstruturaInscricoesLocais();
assert.equal(auditoria.integridadePreservada,true);
assert.equal(auditoria.participantes,5);
assert.equal(auditoria.inscricoes,5);
assert.equal(auditoria.origemInscricaoPresente,true);
assert.equal(auditoria.estruturaControlePresente,true);
assert.equal(auditoria.baseVersion,'1');
assert.deepEqual(JSON.parse(logs.at(-1)),JSON.parse(JSON.stringify(auditoria)),'resultado deve ser registrado explicitamente em JSON');
assert.equal(JSON.stringify({sheets:Object.fromEntries(Object.entries(sheets).map(([nome,sheet])=>[nome,sheet.data])),properties:[...properties],forms:[...forms.keys()],triggers:triggers.length,cache:[...cache]}),snapshotLeitura,'auditoria não pode alterar planilha, propriedades, Forms, triggers, versão ou cache');

const headerValido=sheets.INSCRICOES.data[0].slice();
[sheets.INSCRICOES.data[0][0],sheets.INSCRICOES.data[0][1]]=[sheets.INSCRICOES.data[0][1],sheets.INSCRICOES.data[0][0]];
assert.equal(api.verificarIntegridadeEstruturaInscricoesLocais().integridadePreservada,false,'deslocamento de coluna deve ser detectado');
sheets.INSCRICOES.data[0]=headerValido.slice();
sheets.INSCRICOES.data[0].push('COLUNA_INESPERADA');
assert.equal(api.verificarIntegridadeEstruturaInscricoesLocais().integridadePreservada,false,'coluna inesperada deve impedir aprovação estrutural');
sheets.INSCRICOES.data[0]=headerValido.slice();
const controleValido=sheets.INSCRICOES_LOCAL_CONTROLE;
delete sheets.INSCRICOES_LOCAL_CONTROLE;
assert.equal(api.verificarIntegridadeEstruturaInscricoesLocais().estruturaControlePresente,false,'aba de controle ausente deve ser detectada');
sheets.INSCRICOES_LOCAL_CONTROLE=controleValido;

const limparFormularios=()=>{forms.clear();triggers.length=0;['FORM_ID','FORM_URL','FORM_EDIT_URL','FORM_ITEM_IDS_JSON','FORM_RESPONSE_SPREADSHEET_ID'].forEach(key=>properties.delete(key));};

// A/D/E/F: criação do zero e repetição após conclusão.
limparFormularios();
const escritasAntesFormulario=sheetWriteCount;
const formularioCriado=api.criarFormularioInscricaoLocal();
const formularioRepetido=api.criarFormularioInscricaoLocal();
assert.equal(formularioCriado.criado,true);
assert.equal(formularioRepetido.criado,false);
assert.equal(formularioCriado.formId,formularioRepetido.formId);
assert.equal(forms.size,1,'execução repetida não pode criar outro formulário');
assert.equal(triggers.length,1,'execução repetida não pode criar outro trigger');
assert.deepEqual(forms.get(formularioCriado.formId).items.map(item=>item.title),['Nome completo','Nome para crachá','CPF','E-mail','Telefone','Categoria']);
assert.deepEqual(forms.get(formularioCriado.formId).items.at(-1).choices,['Estudante','Profissional'],'categorias devem vir da base real');
assert.equal(forms.get(formularioCriado.formId).destination,'1brxCfiCcLS6vCcC9jEftiyTTE6CxSoYAayEEqGgNaKE');
assert.equal(properties.get('FORM_RESPONSE_SPREADSHEET_ID'),'1brxCfiCcLS6vCcC9jEftiyTTE6CxSoYAayEEqGgNaKE');
assert.equal(forms.get(formularioCriado.formId).setDestinationCalls,1,'retry não pode configurar outro destino');
assert.equal(forms.get(formularioCriado.formId).destinationIdReadsWithoutDestination,0,'getDestinationId não pode ser chamado antes de existir destino');
assert.equal(sheetWriteCount,escritasAntesFormulario,'criação do Forms não pode repetir a preparação nem escrever na planilha');

// Auditoria pré-deploy: destino único, aba RAW única, trigger único e dry-run sem escrita.
sheets['Respostas ao formulário 1']=new FakeSheet('Respostas ao formulário 1',[['Carimbo de data/hora','Nome completo','Nome para crachá','CPF','E-mail','Telefone','Categoria']]);
const snapshotAuditoriaImplantacao=JSON.stringify({sheets:Object.fromEntries(Object.entries(sheets).map(([nome,sheet])=>[nome,sheet.data])),properties:[...properties],forms:[...forms.keys()],triggers:triggers.length,cache:[...cache]});
const auditoriaImplantacao=api.auditarImplantacaoInscricoesLocais();
assert.equal(auditoriaImplantacao.responseDestination.quantidade,1);
assert.equal(auditoriaImplantacao.responseDestination.spreadsheetId,'1brxCfiCcLS6vCcC9jEftiyTTE6CxSoYAayEEqGgNaKE');
assert.equal(auditoriaImplantacao.abasRaw.length,1);
assert.equal(auditoriaImplantacao.abasRaw[0].respostas,0);
assert.equal(auditoriaImplantacao.trigger.quantidade,1);
assert.equal(auditoriaImplantacao.base.inscricoesEvent3,5);
assert.equal(auditoriaImplantacao.base.inscricoesFormEvento,0);
assert.equal(auditoriaImplantacao.base.origensVazias,0);
assert.equal(auditoriaImplantacao.base.origensInvalidas,0);
assert.equal(auditoriaImplantacao.base.dryRun.escritas,0);
assert.equal(auditoriaImplantacao.integridadePreservada,true);
assert.equal(JSON.stringify({sheets:Object.fromEntries(Object.entries(sheets).map(([nome,sheet])=>[nome,sheet.data])),properties:[...properties],forms:[...forms.keys()],triggers:triggers.length,cache:[...cache]}),snapshotAuditoriaImplantacao,'auditoria pré-deploy não pode alterar recursos');
delete sheets['Respostas ao formulário 1'];

// B/C: interrupção real após criar o Forms e recuperação automática pelo FORM_ID salvo.
limparFormularios();
const createOriginal=formApp.create;
formApp.create=title=>{const form=createOriginal(title);form.failNextAddTextItem=true;return form;};
assert.throws(()=>api.criarFormularioInscricaoLocal(),/interrupção simulada após criar o Forms/);
formApp.create=createOriginal;
const idInterrompido=properties.get('FORM_ID');
assert.ok(idInterrompido,'FORM_ID deve sobreviver à interrupção posterior à criação');
assert.equal(forms.size,1,'interrupção não pode perder a referência do Forms criado');
assert.equal(triggers.length,0,'interrupção antes da configuração não pode criar trigger');
const recuperadoInterrompido=api.criarFormularioInscricaoLocal();
assert.equal(recuperadoInterrompido.formId,idInterrompido);
assert.equal(recuperadoInterrompido.criado,false);
assert.equal(forms.size,1,'retry deve reabrir o mesmo Forms em vez de criar outro');
assert.equal(triggers.length,1,'retry deve criar exatamente um trigger');

// Recuperação de um Forms parcial vazio já conhecido.
limparFormularios();
const parcialVazio=formApp.create('Parcial vazio');
parcialVazio.destinationVisibilityDelay=2;
properties.set('FORM_ID',parcialVazio.getId());
const recuperadoVazio=api.criarFormularioInscricaoLocal();
assert.equal(recuperadoVazio.criado,false);
assert.equal(recuperadoVazio.formId,parcialVazio.getId());
assert.equal(forms.size,1);
assert.equal(forms.get(parcialVazio.getId()).items.length,6);
assert.equal(triggers.length,1);
assert.equal(parcialVazio.setDestinationCalls,1);
assert.equal(parcialVazio.destinationIdReadsWithoutDestination,0);

// Falha posterior a setDestination deve conservar e reutilizar o mesmo destino no retry.
limparFormularios();
const parcialComDestinoInterrompido=formApp.create('Parcial com destino interrompido');
properties.set('FORM_ID',parcialComDestinoInterrompido.getId());
parcialComDestinoInterrompido.failAfterSetDestination=true;
assert.throws(()=>api.criarFormularioInscricaoLocal(),/falha simulada após setDestination/);
assert.equal(parcialComDestinoInterrompido.destination,'1brxCfiCcLS6vCcC9jEftiyTTE6CxSoYAayEEqGgNaKE');
assert.equal(properties.get('FORM_RESPONSE_SPREADSHEET_ID'),'1brxCfiCcLS6vCcC9jEftiyTTE6CxSoYAayEEqGgNaKE');
assert.equal(parcialComDestinoInterrompido.setDestinationCalls,1);
assert.equal(triggers.length,0);
const recuperadoComDestino=api.criarFormularioInscricaoLocal();
const repetidoComDestino=api.criarFormularioInscricaoLocal();
assert.equal(recuperadoComDestino.formId,parcialComDestinoInterrompido.getId());
assert.equal(repetidoComDestino.formId,parcialComDestinoInterrompido.getId());
assert.equal(parcialComDestinoInterrompido.setDestinationCalls,1,'retry não pode recriar nem substituir o destino já vinculado');
assert.equal(parcialComDestinoInterrompido.destinationIdReadsWithoutDestination,0);
assert.equal(forms.size,1);
assert.equal(triggers.length,1);
assert.equal(new Set(parcialComDestinoInterrompido.items.map(item=>item.title)).size,6);

// Destino persistido sem confirmação não pode provocar novo setDestination nem nova aba RAW.
limparFormularios();
const destinoPendente=formApp.create('Destino pendente');
properties.set('FORM_ID',destinoPendente.getId());
properties.set('FORM_RESPONSE_SPREADSHEET_ID','1brxCfiCcLS6vCcC9jEftiyTTE6CxSoYAayEEqGgNaKE');
assert.throws(()=>api.criarFormularioInscricaoLocal(),/não está vinculado ao spreadsheet de respostas aprovado/);
assert.equal(destinoPendente.setDestinationCalls,0,'destino previamente persistido deve bloquear uma segunda vinculação potencialmente duplicada');
assert.equal(triggers.length,0);

// Reprodução da falha real: o primeiro TextItem existe, mas a execução não concluiu.
limparFormularios();
const parcialComCampo=formApp.create('Parcial com campo');
parcialComCampo.addTextItem().setTitle('Nome completo');
properties.set('FORM_ID',parcialComCampo.getId());
const recuperadoComCampo=api.criarFormularioInscricaoLocal();
const repetidoAposRecuperacao=api.criarFormularioInscricaoLocal();
assert.equal(recuperadoComCampo.formId,parcialComCampo.getId());
assert.equal(repetidoAposRecuperacao.formId,parcialComCampo.getId());
assert.equal(forms.size,1,'formulário parcial recuperável não pode provocar novo Forms');
assert.deepEqual(parcialComCampo.items.map(item=>item.title),['Nome completo','Nome para crachá','CPF','E-mail','Telefone','Categoria']);
assert.equal(new Set(parcialComCampo.items.map(item=>item.title)).size,6,'nenhum campo pode ser duplicado');
assert.equal(triggers.length,1,'recuperação e repetição devem manter um único trigger');

// Duplicidade preexistente deve bloquear a conclusão, nunca ser ampliada silenciosamente.
limparFormularios();
const parcialDuplicado=formApp.create('Parcial duplicado');
parcialDuplicado.addTextItem().setTitle('Nome completo');
parcialDuplicado.addTextItem().setTitle('Nome completo');
properties.set('FORM_ID',parcialDuplicado.getId());
assert.throws(()=>api.criarFormularioInscricaoLocal(),/mais de um campo com o título/);
assert.equal(forms.size,1);
assert.equal(parcialDuplicado.items.length,2,'verificação não pode criar outros campos ao detectar duplicidade');
assert.equal(triggers.length,0);

// As operações seguintes usam novamente um formulário íntegro com Categoria em Checkbox.
limparFormularios();
api.criarFormularioInscricaoLocal();

const registro=(responseId,overrides={})=>({responseId,timestamp:'2026-09-13T10:00:00-03:00',nome:'Nova Pessoa',nomeCracha:'Nova',cpf:'11144477735',email:'nova@example.org',telefone:'14999999999',categoria:'Profissional',dataInscricao:'13/09/2026',horaInscricao:'10:00:00',...overrides});
const nova=api.processarInscricaoLocal_(registro('R-NOVA'));
assert.equal(nova.status,'PROCESSADA');
assert.match(nova.numeroInscricao,/^LOCAL-[A-F0-9]{20}$/);
assert.equal(properties.get('BASE_VERSION'),'2');
assert.equal(sheets.INSCRICOES.data.at(-1)[12],'FORM_EVENTO');
const participantesDepoisNova=sheets.PARTICIPANTES.data.length;
const inscricoesDepoisNova=sheets.INSCRICOES.data.length;

const repetida=api.processarInscricaoLocal_(registro('R-NOVA'));
assert.equal(repetida.status,'DUPLICADA');
assert.equal(sheets.PARTICIPANTES.data.length,participantesDepoisNova);
assert.equal(sheets.INSCRICOES.data.length,inscricoesDepoisNova);
assert.equal(properties.get('BASE_VERSION'),'2','responseId repetido não pode incrementar baseVersion');

const associada=api.processarInscricaoLocal_(registro('R-EVENT3',{nome:'Alice Atualizada',nomeCracha:'',cpf:'52998224725',email:'outro@example.org'}));
assert.equal(associada.status,'ASSOCIADA');
assert.equal(associada.idPessoa,'P000001');
assert.equal(sheets.PARTICIPANTES.data[1][1],'Alice','campo canônico preenchido não pode ser sobrescrito');
assert.equal(properties.get('BASE_VERSION'),'3');

const emailAmbiguo=api.processarInscricaoLocal_(registro('R-EMAIL',{nome:'Pessoa sem vínculo',cpf:'',email:'comum@example.org'}));
assert.equal(emailAmbiguo.status,'PROCESSADA','e-mail presente em duas pessoas não deve unir automaticamente');
assert.notEqual(emailAmbiguo.idPessoa,'P000002');
assert.notEqual(emailAmbiguo.idPessoa,'P000003');

const nomeAmbiguo=api.processarInscricaoLocal_(registro('R-NOME',{nome:'Nome Igual',cpf:'',email:''}));
assert.equal(nomeAmbiguo.status,'PROCESSADA');
assert.notEqual(nomeAmbiguo.idPessoa,'P000004');
assert.notEqual(nomeAmbiguo.idPessoa,'P000005');

const countsBeforeInvalid={p:sheets.PARTICIPANTES.data.length,i:sheets.INSCRICOES.data.length,v:properties.get('BASE_VERSION')};
const cpfInvalidoAceito=api.processarInscricaoLocal_(registro('R-CPF-INVALIDO',{cpf:'12345678900',email:''}));
assert.equal(cpfInvalidoAceito.status,'PROCESSADA','CPF inválido deve ser aceito sem ser usado para associação');
assert.deepEqual({p:sheets.PARTICIPANTES.data.length,i:sheets.INSCRICOES.data.length,v:Number(properties.get('BASE_VERSION'))},{p:countsBeforeInvalid.p+1,i:countsBeforeInvalid.i+1,v:Number(countsBeforeInvalid.v)+1});

const concorrenteA=api.processarInscricaoLocal_(registro('R-CONC-A',{nome:'Concorrente',cpf:'39053344705',email:'concorrente@example.org'}));
const participantesAntesB=sheets.PARTICIPANTES.data.length;
const concorrenteB=api.processarInscricaoLocal_(registro('R-CONC-B',{nome:'Concorrente',cpf:'39053344705',email:'concorrente@example.org'}));
assert.equal(concorrenteB.status,'ASSOCIADA');
assert.equal(concorrenteB.idPessoa,concorrenteA.idPessoa);
assert.equal(sheets.PARTICIPANTES.data.length,participantesAntesB,'duas submissões concorrentes da mesma pessoa não podem duplicá-la');

const versaoAntesFalha=properties.get('BASE_VERSION');
sheets.INSCRICOES.failNextAppend=true;
assert.throws(()=>api.processarInscricaoLocal_(registro('R-RETRY',{nome:'Falha Recuperável',cpf:'16899535009',email:'retry@example.org'})),/falha de escrita simulada/);
assert.equal(properties.get('BASE_VERSION'),versaoAntesFalha,'falha anterior à inscrição não pode incrementar baseVersion');
const pessoasAposFalha=sheets.PARTICIPANTES.data.length;
const retry=api.processarInscricaoLocal_(registro('R-RETRY',{nome:'Falha Recuperável',cpf:'16899535009',email:'retry@example.org'}));
assert.equal(retry.status,'ASSOCIADA');
assert.equal(sheets.PARTICIPANTES.data.length,pessoasAposFalha,'retry deve reutilizar a pessoa parcialmente gravada');
assert.equal(Number(properties.get('BASE_VERSION')),Number(versaoAntesFalha)+1);

const encontrada=api.buscarPorInscricao_(nova.numeroInscricao);
assert.equal(encontrada.idPessoa,nova.idPessoa,'fallback do backend deve encontrar a nova inscrição imediatamente');
const indice=api.obterIndiceParticipantes_();
assert.equal(indice.inscricaoParaPessoa[nova.numeroInscricao].idPessoa,nova.idPessoa);
assert.ok(indice.pessoas.some(pessoa=>pessoa.idPessoa===nova.idPessoa),'próximo índice deve conter a nova pessoa');
const controle=sheets.INSCRICOES_LOCAL_CONTROLE.data;
assert.equal(controle.filter(row=>row[0]==='R-NOVA').length,1,'controle deve manter uma linha por responseId');
assert.equal(controle.find(row=>row[0]==='R-RETRY')[2],'ASSOCIADA','retry deve substituir ERRO pelo estado final');

const localSource=fs.readFileSync(new URL('../apps-script/InscricaoLocal.gs',import.meta.url),'utf8');
const auditoriaSource=localSource.match(/function verificarIntegridadeEstruturaInscricoesLocais\(\)[\s\S]*?\n}\n\n\/\/ Auditoria administrativa/)[0];
assert.doesNotMatch(auditoriaSource,/setValue|setValues|insertSheet|deleteSheet|setProperty|setProperties|incrementarBaseVersion_|FormApp|ScriptApp|LockService/,'auditoria administrativa deve permanecer estritamente somente leitura');
assert.match(auditoriaSource,/console\.log\(JSON\.stringify\(resultado,null,2\)\)/);
const auditoriaImplantacaoSource=localSource.match(/function auditarImplantacaoInscricoesLocais\(\)[\s\S]*?\n}\n\nfunction encontrarAbasRespostasFormulario_/)[0];
assert.doesNotMatch(auditoriaImplantacaoSource,/setValue|setValues|insertSheet|deleteSheet|setProperty|setProperties|incrementarBaseVersion_|newTrigger|deleteTrigger/,'auditoria pré-deploy deve permanecer estritamente somente leitura');
assert.match(localSource,/PropertiesService\.getScriptProperties\(\)/);
assert.match(localSource,/setProperty\(FORM_LOCAL\.PROPERTIES\.ID,form\.getId\(\)\)/,'FORM_ID deve ser persistido imediatamente após a criação');
const criarFormularioSource=localSource.match(/function criarFormularioInscricaoLocal\(\)[\s\S]*?\n}\n\nfunction obterDestinoFormularioSeguro_/)[0];
assert.doesNotMatch(criarFormularioSource,/prepararEstruturaInscricoesLocais\(/,'criação do Forms não pode repetir a preparação aprovada');
assert.match(criarFormularioSource,/verificarIntegridadeEstruturaInscricoesLocais\(\)/,'criação do Forms deve validar a estrutura somente por leitura');
assert.match(localSource,/getDestinationId\(\)/);
assert.match(localSource,/getDestinationType\(\)/);
assert.match(localSource,/FORM_RESPONSE_SPREADSHEET_ID/);
assert.match(localSource,/if\(!destino\.existe&&!destinoPersistido\)\{[^}]*form\.setDestination/);
assert.match(localSource,/aguardarDestinoFormulario_\(form\)/);
assert.match(localSource,/ScriptApp\.newTrigger\(FORM_LOCAL\.HANDLER\)\.forForm\(form\)\.onFormSubmit\(\)\.create\(\)/);
const localizarSource=localSource.match(/function localizarPessoaFormulario_\([^\n]+/)[0];
assert.doesNotMatch(localizarSource,/registro\.nome|normalizarComparacao_/,'deduplicação do Forms não pode unir somente por nome');

console.log('OK: inscrição local, migração, deduplicação, idempotência, retry e cache aprovados');
