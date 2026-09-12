# Arquitetura

`GitHub Pages → POST text/plain com JSON → Apps Script doPost → Google Sheets`.

O `text/plain;charset=utf-8` evita preflight CORS na integração entre domínio do Pages e Web App. Não há `google.script.run` no frontend.

O Apps Script forma um índice sanitizado por `BASE_VERSION`: pessoas e `NUMERO_INSCRICAO → ID_PESSOA`. Para não exceder o limite por entrada do `CacheService`, os dois mapas são divididos em 32 buckets determinísticos. Uma leitura de QR carrega somente o bucket do QR e o bucket da pessoa correspondente; portanto não lê as tabelas inteiras com cache saudável. Após importação bem-sucedida, a versão anterior inteira é invalidada antes do incremento.

O browser guarda a mesma visão sanitizada em `localStorage`. Na carga, pede somente `obterBaseVersion`; se a versão coincidir, usa o índice local. Essa visão nunca decide a duplicidade: `registrarPresenca` sempre consulta e grava no servidor, dentro de `LockService`.

O importador PowerShell permanece externo e chama `importarCredenciamento` com `token`, `arquivo`, `arquivoDataHora` e `registros`. Durante a migração, o token é buscado primeiro em Script Properties e, se ausente, na chave `TOKEN_IMPORTACAO` da aba `CONFIG`; ele nunca é retornado ao browser. A importação deduplica por `NUMERO_INSCRICAO`, preserva `NUMEROS_INSCRICAO` canônico com `|`, completa dados vazios da pessoa canônica sem substituir informação boa por vazio e, ao terminar, chama `incrementarBaseVersion_()`.
