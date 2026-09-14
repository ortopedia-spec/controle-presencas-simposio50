# Roteiro de testes

- [ ] Pessoa com um QR: uma linha em `PRESENCAS`.
- [ ] Pessoa com vários QRs: o primeiro cria linha; o segundo no mesmo período retorna `DUPLICADA`.
- [ ] Mesma pessoa, manhã e tarde: duas linhas válidas.
- [ ] Dois celulares lendo ao mesmo tempo: exatamente uma linha, graças a `LockService`.
- [ ] Busca por `Amanda Miranda` encontra `Amanda De Pinho Miranda`.
- [ ] `NOME_CRACHA` prevalece visualmente; quando vazio, `NOME` é usado.
- [ ] QR inexistente retorna erro sem gravar linha.
- [ ] Importe nova base, incremente `BASE_VERSION`, recarregue o browser e confirme atualização do índice.
- [ ] Desconecte a rede após uma carga: busca local ainda funciona; registro exibe falha clara e não finge sucesso.
- [ ] Abra em dois dispositivos diferentes e confira operador/dispositivo registrados.
- [ ] `painel.html` atualiza em 10 segundos sem chamadas sobrepostas e sem retornar PII.
- [ ] Totais do painel distinguem pessoas únicas de inscrições e separam `EVENT3` de `FORM_EVENTO`.
- [ ] O mesmo `responseId` do Forms processado duas vezes cria zero duplicidades.
- [ ] Pessoa Event3 com CPF confiável é associada; nomes iguais isoladamente não são unidos.
- [ ] Após inscrição local, o fallback encontra imediatamente e os sete caches passam a encontrar após `BASE_VERSION` mudar.
