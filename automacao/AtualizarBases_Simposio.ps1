[CmdletBinding()]
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
$pasta = 'C:\UNIMED_EXAMES_ABERTOS'
$log = Join-Path $pasta 'logs\AutoImportacao_Simposio.log'
$auto = Join-Path $PSScriptRoot 'AutoImportar_Simposio.ps1'

try {
    if (-not (Test-Path -LiteralPath $auto -PathType Leaf)) { throw 'AUTOMACAO_AUSENTE' }
    . $auto
    $r = Invoke-AutoImportacaoSimposio -PastaMonitorada $pasta -ImportadorPath (Join-Path $pasta 'Importar_Simposio.ps1') -EstadoPath (Join-Path $pasta 'estado_autoimportacao.json') -LogPath $log -DryRun:$DryRun
    switch ([string]$r.status) {
        'SEM_NOVO_ARQUIVO' { [pscustomobject]@{ status='ATUALIZADA'; codigo='SEM_NOVO_ARQUIVO'; mensagem='A base já está atualizada.'; arquivo=$r.arquivo } }
        'SUCESSO' { [pscustomobject]@{ status='CONCLUIDA'; codigo='SUCESSO'; mensagem='Atualização concluída.'; arquivo=$r.arquivo; registrosLidos=$r.registrosLidos; inscricoesNovas=$r.inscricoesNovas; pessoasNovas=$r.pessoasNovas; pessoasAtualizadas=$r.pessoasAtualizadas; baseVersion=$r.baseVersion } }
        'EM_EXECUCAO' { [pscustomobject]@{ status='ERRO'; codigo='MUTEX_OCUPADO'; mensagem='Já existe uma atualização em andamento.' } }
        default { [pscustomobject]@{ status='ERRO'; codigo=([string]$r.status); mensagem='Não foi possível atualizar. Consulte o log.' } }
    }
}
catch {
    $codigo = if ($_.Exception.Message -eq 'AUTOMACAO_AUSENTE') { 'AUTOMACAO_AUSENTE' } else { 'ORQUESTRADOR_ERRO' }
    $tipo = $_.Exception.GetType().Name
    $linha = $_.InvocationInfo.ScriptLineNumber
    try { Add-Content -LiteralPath $log -Encoding UTF8 -Value ('{0} | ERRO | codigo={1} | tipo={2} | linha={3}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $codigo, $tipo, $linha) } catch {}
    [pscustomobject]@{ status='ERRO'; codigo=$codigo; mensagem='Não foi possível atualizar. Consulte o log.' }
}
