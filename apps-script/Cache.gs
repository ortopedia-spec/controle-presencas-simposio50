function obterBaseVersion_() { return PropertiesService.getScriptProperties().getProperty('BASE_VERSION') || '1'; }
function incrementarBaseVersion_() { const proximo = String(Number(obterBaseVersion_()) + 1); PropertiesService.getScriptProperties().setProperty('BASE_VERSION', proximo); CacheService.getScriptCache().remove('INDICE_SANITIZADO_' + obterBaseVersion_()); return proximo; }

function obterIndiceInterno_() {
  const versao = obterBaseVersion_(), chave = 'INDICE_SANITIZADO_' + versao, cache = CacheService.getScriptCache();
  const salvo = cache.get(chave); if (salvo) return JSON.parse(salvo);
  const participantes = lerTabela_(CONFIG.SHEETS.PARTICIPANTES).rows;
  const inscricoes = lerTabela_(CONFIG.SHEETS.INSCRICOES).rows;
  const pessoas = {}, inscricaoParaPessoa = {};
  participantes.forEach(function(p) {
    const id = texto_(p.ID_PESSOA); if (!id) return;
    const nome = texto_(p.NOME), nomeCracha = texto_(p.NOME_CRACHA);
    pessoas[id] = { idPessoa: id, nome: nome, nomeCracha: nomeCracha, nomeExibicao: nomeCracha || nome, qtdInscricoes: Number(p.QTD_INSCRICOES) || 0, busca: normalizarComparacao_([nome, p.NOME_NORMALIZADO, nomeCracha].join(' ')) };
  });
  inscricoes.forEach(function(i) { const n = normalizarNumeroInscricao_(i.NUMERO_INSCRICAO); const id = texto_(i.ID_PESSOA); if (n && pessoas[id]) inscricaoParaPessoa[n] = { idPessoa: id, categoria: texto_(i.CATEGORIA) }; });
  const indice = { baseVersion: versao, pessoas: pessoas, inscricaoParaPessoa: inscricaoParaPessoa };
  try { cache.put(chave, JSON.stringify(indice), CONFIG.CACHE_SECONDS); } catch (_) {} // CacheService has a size limit; Sheets remains the safe fallback.
  return indice;
}
function invalidarIndice_() { CacheService.getScriptCache().remove('INDICE_SANITIZADO_' + obterBaseVersion_()); }
function obterIndiceParticipantes_() { const i = obterIndiceInterno_(); return { baseVersion: i.baseVersion, pessoas: Object.keys(i.pessoas).map(function(id) { const p=i.pessoas[id]; return {idPessoa:p.idPessoa,nome:p.nome,nomeCracha:p.nomeCracha,nomeExibicao:p.nomeExibicao,qtdInscricoes:p.qtdInscricoes}; }), inscricaoParaPessoa: i.inscricaoParaPessoa }; }
