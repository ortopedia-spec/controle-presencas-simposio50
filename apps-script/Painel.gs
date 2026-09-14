function obterPainel_(dataSelecionada, periodoSelecionado) {
  const agora = new Date();
  const data = normalizarDataPainel_(dataSelecionada, agora);
  const periodo = normalizarPeriodoPainel_(periodoSelecionado || periodoDoMomento_(agora));
  const chave = ['PAINEL','1',data.iso,normalizarComparacao_(periodo)].join('_');
  const cache = CacheService.getScriptCache();
  const armazenado = cache.get(chave);
  if (armazenado) { try { return JSON.parse(armazenado); } catch (_) {} }
  const participantes = lerTabela_(CONFIG.SHEETS.PARTICIPANTES);
  const inscricoes = lerTabela_(CONFIG.SHEETS.INSCRICOES);
  const presencas = lerTabela_(CONFIG.SHEETS.PRESENCAS);
  validarCabecalho_(participantes.headers, CONFIG.HEADERS.PARTICIPANTES, CONFIG.SHEETS.PARTICIPANTES);
  validarCabecalho_(inscricoes.headers, CONFIG.HEADERS.INSCRICOES, CONFIG.SHEETS.INSCRICOES);
  validarCabecalho_(presencas.headers, CONFIG.HEADERS.PRESENCAS, CONFIG.SHEETS.PRESENCAS);
  const capacidade = Number(obterConfiguracaoValor_('CAPACIDADE_EVENTO'));
  if (!Number.isFinite(capacidade) || capacidade <= 0) throw criarErro_('CAPACIDADE_NAO_CONFIGURADA', 'Configure CAPACIDADE_EVENTO com um número positivo.');
  const resposta = montarPainelAgregado_(participantes.rows, inscricoes.rows, presencas.rows, capacidade, data, periodo, Utilities.formatDate(agora,CONFIG.TIMEZONE,"yyyy-MM-dd'T'HH:mm:ssXXX"));
  cache.put(chave, JSON.stringify(resposta), CONFIG.PAINEL_CACHE_SECONDS);
  return resposta;
}

function montarPainelAgregado_(participantes, inscricoes, presencas, capacidade, data, periodo, atualizadoEm) {
  const idsParticipantes = conjuntoIds_(participantes.map(function(p){return p.ID_PESSOA;}));
  const inscricoesValidas = inscricoes.filter(function(i){return texto_(i.NUMERO_INSCRICAO)&&texto_(i.ID_PESSOA);});
  const idsEvent3 = {}, idsLocal = {};
  let inscricoesEvent3=0,inscricoesLocal=0,inscricoesOrigemIndefinida=0;
  inscricoesValidas.forEach(function(i){const origem=origemInscricao_(i);if(origem==='EVENT3'){inscricoesEvent3++;idsEvent3[texto_(i.ID_PESSOA)]=true;}else if(origem==='FORM_EVENTO'){inscricoesLocal++;idsLocal[texto_(i.ID_PESSOA)]=true;}else inscricoesOrigemIndefinida++;});
  const idsData={},idsPeriodo={},resumo={};
  presencas.forEach(function(p){const id=texto_(p.ID_PESSOA),dia=texto_(p.DATA),per=normalizarPeriodoPainelSeguro_(p.PERIODO);if(!id||!dia||!per)return;const chave=dia+'|'+per;resumo[chave]=resumo[chave]||{data:dia,periodo:per,ids:{}};resumo[chave].ids[id]=true;if(dia===data.display){idsData[id]=true;if(per===periodo)idsPeriodo[id]=true;}});
  const participantesUnicos=Object.keys(idsParticipantes).length,presencasHoje=Object.keys(idsData).length,presencasPeriodo=Object.keys(idsPeriodo).length;
  return {
    atualizadoEm: atualizadoEm,
    data: data.display,
    dataIso: data.iso,
    periodo: periodo,
    capacidade: capacidade,
    participantesUnicos: participantesUnicos,
    participantesEvent3: Object.keys(idsEvent3).length,
    participantesLocal: Object.keys(idsLocal).length,
    inscricoesTotal: inscricoesValidas.length,
    inscricoesEvent3: inscricoesEvent3,
    inscricoesLocal: inscricoesLocal,
    inscricoesOrigemIndefinida: inscricoesOrigemIndefinida,
    presencasHoje: presencasHoje,
    presencasPeriodo: presencasPeriodo,
    ocupacaoPercentual: percentualSeguro_(presencasPeriodo,capacidade),
    comparecimentoPercentual: percentualSeguro_(presencasPeriodo,participantesUnicos),
    inscricoesCapacidadePercentual: percentualSeguro_(participantesUnicos,capacidade),
    saldoCapacidade: Math.max(0,capacidade-presencasPeriodo),
    acimaCapacidade: Math.max(0,presencasPeriodo-capacidade),
    resumoPeriodos: Object.keys(resumo).map(function(chave){const r=resumo[chave],total=Object.keys(r.ids).length;return{data:r.data,periodo:r.periodo,presencas:total,capacidadePercentual:percentualSeguro_(total,capacidade)};}).sort(ordenarResumoPeriodos_)
  };
}

function conjuntoIds_(valores) { const conjunto={};(valores||[]).forEach(function(valor){const id=texto_(valor);if(id)conjunto[id]=true;});return conjunto; }
function percentualSeguro_(numerador,denominador) { const n=Number(numerador)||0,d=Number(denominador)||0;return d>0?n/d*100:0; }
function origemInscricao_(inscricao) { const origem=normalizarComparacao_(inscricao.ORIGEM_INSCRICAO);if(origem==='EVENT3')return'EVENT3';if(origem==='FORM_EVENTO')return'FORM_EVENTO';const id=normalizarComparacao_(inscricao.ID_ORIGEM),numero=normalizarComparacao_(inscricao.NUMERO_INSCRICAO);if(id.indexOf('FORM:')===0||numero.indexOf('LOCAL-')===0)return'FORM_EVENTO';return''; }
function normalizarPeriodoPainel_(valor) { const periodo=normalizarComparacao_(valor);if(periodo==='MANHA')return'MANHÃ';if(periodo==='TARDE')return'TARDE';throw criarErro_('PERIODO_INVALIDO','Período deve ser MANHÃ ou TARDE.'); }
function normalizarPeriodoPainelSeguro_(valor) { try{return normalizarPeriodoPainel_(valor);}catch(_){return'';} }
function normalizarDataPainel_(valor,agora) { const bruto=texto_(valor);if(!bruto){return{iso:Utilities.formatDate(agora,CONFIG.TIMEZONE,'yyyy-MM-dd'),display:Utilities.formatDate(agora,CONFIG.TIMEZONE,'dd/MM/yyyy')};}let ano,mes,dia,m=bruto.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(m){ano=Number(m[1]);mes=Number(m[2]);dia=Number(m[3]);}else{m=bruto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)throw criarErro_('DATA_INVALIDA','Data inválida.');dia=Number(m[1]);mes=Number(m[2]);ano=Number(m[3]);}const teste=new Date(Date.UTC(ano,mes-1,dia));if(teste.getUTCFullYear()!==ano||teste.getUTCMonth()!==mes-1||teste.getUTCDate()!==dia)throw criarErro_('DATA_INVALIDA','Data inválida.');return{iso:String(ano).padStart(4,'0')+'-'+String(mes).padStart(2,'0')+'-'+String(dia).padStart(2,'0'),display:String(dia).padStart(2,'0')+'/'+String(mes).padStart(2,'0')+'/'+String(ano).padStart(4,'0')}; }
function ordenarResumoPeriodos_(a,b) { const chave=function(r){const p=r.data.split('/');return p[2]+p[1]+p[0]+'|'+(r.periodo==='MANHÃ'?'0':'1');};return chave(a).localeCompare(chave(b)); }
