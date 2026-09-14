# Implantação

1. Faça backup/versione o projeto Apps Script atual. Compare o payload real enviado pelo PowerShell com a função existente antes de editar `Importacao.gs`; preserve sua lógica de importação e somente integre a invalidação de cache ao final.
2. Copie os arquivos de `apps-script/`, inclusive `Painel.gs` e `InscricaoLocal.gs`. Revise os cabeçalhos da planilha — eles precisam ser exatamente os documentados.
   Inclua também `Migracao.gs`. Após validar uma cópia da planilha, execute manualmente uma única vez `reconciliarDadosCanonicosParticipantes()` para preencher apenas campos canônicos vazios; ela não é acionada automaticamente pelo deploy.
3. Em **Project Settings → Script properties**, confirme que `TOKEN_IMPORTACAO` já existe. Na transição, se essa propriedade ainda não foi criada, o código também lê a chave `TOKEN_IMPORTACAO` da aba `CONFIG`; migre-a para Script Properties depois da validação. Não crie arquivo de segredo no repositório.
4. Em **Deploy → Manage deployments**, edite/crie um Web app, publique uma nova versão e copie a URL que termina em `/exec`.
5. Atualize `API_URL` em `index.html`, publique o commit na `main` e habilite **Settings → Pages → Deploy from a branch → main / root**.
6. Abra a URL do Pages num celular em HTTPS, permita câmera, configure operador/dispositivo e execute os testes abaixo.

Para a inscrição presencial, após backup e testes em fixture, execute uma vez `prepararEstruturaInscricoesLocais()` e confira as contagens. Depois execute uma vez `criarFormularioInscricaoLocal()`; a função reutiliza o `FORM_ID` persistido, mantém um único trigger e não envia resposta de teste. O endpoint público só deve ser atualizado depois da estrutura estar validada.

Uma nova implantação do Apps Script é necessária sempre que seus arquivos `.gs` forem alterados: salvar não altera a versão já exposta em `/exec`.
