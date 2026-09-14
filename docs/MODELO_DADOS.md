# Modelo de dados

| Aba | Papel |
|---|---|
| PARTICIPANTES | Uma linha canônica por `ID_PESSOA`; nome exibido é `NOME_CRACHA` quando preenchido, senão `NOME`. |
| INSCRICOES | Uma linha por `NUMERO_INSCRICAO`; resolve QR para `ID_PESSOA` e registra `ORIGEM_INSCRICAO` (`EVENT3` ou `FORM_EVENTO`). |
| PRESENCAS | Histórico imutável. Chave lógica: `ID_PESSOA + DATA + PERIODO`. |
| IMPORTACOES | Auditoria de cada arquivo recebido. |
| CONFIG | Configurações operacionais existentes. |
| INSCRICOES_LOCAL_CONTROLE | Estado técnico de cada `responseId`, sem PII desnecessária. |

`PERIODO` é definido pela hora do servidor: antes de 12:00 = `MANHÃ`; a partir de 12:00 = `TARDE`. Categoria de inscrição não bloqueia presença.

`CAPACIDADE_EVENTO` fica centralizada em `CONFIG`. O valor inicial aprovado para este evento é 458.
