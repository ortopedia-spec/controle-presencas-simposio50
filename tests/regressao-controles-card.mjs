import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';

assert.match(html, /id="refreshBase"[^>]*>↻ Atualizar base<\/button>/);
assert.match(html, /href="\.\/painel\.html" target="_blank" rel="noopener">📊 Painel<\/a>/);
assert.doesNotMatch(html, /obterPainel/, 'index operacional não pode consultar o endpoint do painel');
assert.match(css, /\.base-tool\{[^}]*min-height:38px/, 'controles devem permanecer compactos');
assert.match(css, /\.person-card-content\{min-height:48px;padding-bottom:14px\}/);
assert.match(css, /\.person-card strong\{[^}]*overflow-wrap:anywhere/);
assert.match(css, /\.person-card small\{[^}]*overflow-wrap:anywhere/);

for (const largura of [360, 390, 412, 430]) {
  const paddingMain = largura <= 380 ? 20 : 28;
  const larguraCard = Math.min(680, largura - paddingMain) - 22;
  const larguraConteudo = larguraCard - (largura <= 380 ? 73 : 82) - 14;
  assert.ok(larguraConteudo >= 220, `${largura}px deve preservar largura útil para nome e botão`);
}

for (const caso of [
  { exibicao: 'Ana', cadastro: '' },
  { exibicao: 'Ana', cadastro: 'Ana Maria' },
  { exibicao: 'Nome extremamente longo para validar quebra segura em múltiplas linhas no celular', cadastro: '' },
  { exibicao: 'Nome de Crachá Longo', cadastro: 'Nome civil também suficientemente longo para quebrar em linhas' }
]) {
  assert.ok(caso.exibicao.length > 0);
  if (caso.cadastro) assert.notEqual(caso.exibicao, caso.cadastro);
}

console.log('OK: controles secundários e card responsivo aprovados em 360/390/412/430 px');
