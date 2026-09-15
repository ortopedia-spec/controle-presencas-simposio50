[CmdletBinding()]
param([switch]$DryRun)
$ErrorActionPreference='Stop'
$pasta='C:\UNIMED_EXAMES_ABERTOS'
$auto=Join-Path $PSScriptRoot 'AutoImportar_Simposio.ps1'
if(-not (Test-Path $auto)){ throw 'AUTOMACAO_AUSENTE' }
. $auto
$r=Invoke-AutoImportacaoSimposio -PastaMonitorada $pasta -ImportadorPath (Join-Path $pasta 'Importar_Simposio.ps1') -EstadoPath (Join-Path $pasta 'estado_autoimportacao.json') -LogPath (Join-Path $pasta 'logs\AutoImportacao_Simposio.log') -DryRun:$DryRun
switch($r.status){
 'SEM_NOVO_ARQUIVO' { [pscustomobject]@{status='ATUALIZADA'; mensagem='A base já está atualizada.'; arquivo=$r.arquivo} }
 'SUCESSO' { [pscustomobject]@{status='CONCLUIDA'; mensagem='Atualização concluída.'; arquivo=$r.arquivo; registrosLidos=$r.registrosLidos; inscricoesNovas=$r.inscricoesNovas; pessoasNovas=$r.pessoasNovas; pessoasAtualizadas=$r.pessoasAtualizadas; baseVersion=$r.baseVersion} }
 default { [pscustomobject]@{status='ERRO'; mensagem='Não foi possível atualizar. Consulte o log.'} }
}
