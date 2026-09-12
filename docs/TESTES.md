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
