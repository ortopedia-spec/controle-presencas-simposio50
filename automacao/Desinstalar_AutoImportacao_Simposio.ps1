[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$NomeTarefa = 'SORRI - Autoimporta' + [char]0x00E7 + [char]0x00E3 + 'o Simp' + [char]0x00F3 + 'sio 50 Anos'
$tarefa = Get-ScheduledTask -TaskName $NomeTarefa -ErrorAction SilentlyContinue

if ($null -ne $tarefa) {
    Unregister-ScheduledTask -TaskName $NomeTarefa -Confirm:$false
    [PSCustomObject]@{ tarefa = $NomeTarefa; removida = $true; arquivosPreservados = $true } | ConvertTo-Json -Compress
}
else {
    [PSCustomObject]@{ tarefa = $NomeTarefa; removida = $false; arquivosPreservados = $true } | ConvertTo-Json -Compress
}
