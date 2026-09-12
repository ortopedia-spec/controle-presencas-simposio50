# Arquitetura

`GitHub Pages → POST text/plain com JSON → Apps Script doPost → Google Sheets`.

O `text/plain;charset=utf-8` evita preflight CORS na integração entre domínio do Pages e Web App. Não há `google.script.run` no frontend.

O Apps Script forma um índice sanitizado por `BASE_VERSION`: pessoas e `NUMERO_INSCRICAO → ID_PESSOA`. `CacheService` reduz leituras repetidas; se o objeto exceder o limite do serviço, o sistema continua montando o índice pela planilha. Após importação bem-sucedida, incremente `BASE_VERSION` e invalide o índice.

O browser guarda a mesma visão sanitizada em `localStorage`. Na carga, pede somente `obterBaseVersion`; se a versão coincidir, usa o índice local. Essa visão nunca decide a duplicidade: `registrarPresenca` sempre consulta e grava no servidor, dentro de `LockService`.

O importador PowerShell permanece externo e chama `importarCredenciamento`. O token fica somente em Script Properties. A importação deve deduplicar por `NUMERO_INSCRICAO`, completar dados vazios da pessoa canônica sem substituir informação boa por vazio e, ao terminar, chamar `incrementarBaseVersion_()`.
