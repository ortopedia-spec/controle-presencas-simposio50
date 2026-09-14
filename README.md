# Simpósio 50 Anos SORRI Bauru — Controle de Presenças

Aplicação mobile-first para credenciamento rápido em **15 e 16 de setembro de 2026**. O QR contém `NUMERO_INSCRICAO`; o backend localiza a pessoa canônica e registra uma única presença por `ID_PESSOA + DATA + PERIODO`.

## Componentes

- **GitHub Pages:** interface estática, scanner contínuo com `html5-qrcode`, busca manual, cache sanitizado no navegador e atualização por `version.json`.
- **Painel:** `painel.html` consulta somente agregados, atualiza a cada 10 segundos e usa cache de servidor de 5 segundos.
- **Inscrição local:** Google Forms mantém a resposta bruta e um trigger instalável integra a inscrição à mesma base canônica.
- **Google Apps Script:** API HTTP (`doPost`) e decisão final de presença.
- **Google Sheets:** base operacional existente.

O navegador recebe apenas ID, nomes, quantidade de inscrições e o mapa QR→ID. CPF, email e telefone não são enviados.

## Fluxo operacional

1. No primeiro uso, informe operador e dispositivo; ambos ficam em `localStorage`.
2. Inicie a câmera traseira e apresente o QR. A leitura é contínua, mas cada leitura fica bloqueada enquanto a API responde.
3. O backend define a data/hora/período em `America/Sao_Paulo`, trava a operação com `LockService` e revalida duplicidade.
4. A tela mostra sucesso ou duplicidade e rearma automaticamente em cerca de dois segundos.

Para a busca manual, digite parte do nome e selecione **REGISTRAR PRESENÇA**.

## Configuração

1. Copie os arquivos de `apps-script/` para o projeto Apps Script associado à planilha.
2. Em `Config.gs`, mantenha o ID da planilha já configurado. Não coloque `TOKEN_IMPORTACAO` em código: ele é lido de Script Properties.
3. Publique uma nova versão do Web App e mantenha a execução como conta proprietária e o acesso compatível com a equipe operacional.
4. Confirme a URL `/exec` em `API_URL`, no início de `index.html`.
5. Publique a branch `main` no GitHub Pages.

Veja [DEPLOY.md](docs/DEPLOY.md) antes de substituir código em produção. `Importacao.gs` aceita `registros`, `inscricoes` ou `dados`, com os nomes de campos documentados no código; compare esse contrato com o JSON real do PowerShell antes do primeiro deploy para preservar qualquer alias específico já usado.

## Atualizações

Altere `APP_VERSION` em `index.html` e `version.json` juntos. Na abertura, a página consulta o JSON sem cache e recarrega uma vez com `?v=` ao detectar uma versão publicada diferente.

O painel possui versionamento independente no próprio `painel.html`; a tela operacional estável permanece congelada em `2026.09.12.11`.

## Testes

Os cenários obrigatórios estão em [TESTES.md](docs/TESTES.md). Teste primeiro em uma cópia da planilha, inclusive concorrência com dois aparelhos.

## Segurança

- Nunca committe `TOKEN_IMPORTACAO`, `.clasp.json` ou chaves.
- A autoridade para duplicidade é sempre o Apps Script; o cache de browser somente acelera consulta e busca.
- O histórico em `PRESENCAS` é somente acrescentado; duplicidades retornam a presença anterior sem gravar nova linha.
