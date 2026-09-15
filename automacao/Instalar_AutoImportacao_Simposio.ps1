[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$PastaOperacional = 'C:\UNIMED_EXAMES_ABERTOS'
$NomeTarefa = 'SORRI - Autoimporta' + [char]0x00E7 + [char]0x00E3 + 'o Simp' + [char]0x00F3 + 'sio 50 Anos'
$AutoImportador = Join-Path $PastaOperacional 'AutoImportar_Simposio.ps1'
$Importador = Join-Path $PastaOperacional 'Importar_Simposio.ps1'
$Desinstalador = Join-Path $PastaOperacional 'Desinstalar_AutoImportacao_Simposio.ps1'
$Estado = Join-Path $PastaOperacional 'estado_autoimportacao.json'
$Logs = Join-Path $PastaOperacional 'logs'

if (-not (Test-Path -LiteralPath $PastaOperacional -PathType Container)) {
    throw "Pasta operacional ausente: $PastaOperacional"
}

foreach ($arquivo in @($AutoImportador, $Importador, $Desinstalador)) {
    if (-not (Test-Path -LiteralPath $arquivo -PathType Leaf)) {
        throw "Script obrigatório ausente: $arquivo"
    }
    $tokens = $null
    $erros = $null
    [void][Management.Automation.Language.Parser]::ParseFile($arquivo, [ref]$tokens, [ref]$erros)
    if (@($erros).Count) { throw "Script com erro de sintaxe: $arquivo" }
}

New-Item -ItemType Directory -Path $Logs -Force | Out-Null
. $AutoImportador
$baseline = Initialize-AutoImportBaseline -PastaMonitorada $PastaOperacional -EstadoPath $Estado

$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$argumentos = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $AutoImportador
$acao = New-ScheduledTaskAction -Execute $powershell -Argument $argumentos -WorkingDirectory $PastaOperacional
$agora = Get-Date
$gatilhoMinuto = New-ScheduledTaskTrigger -Once -At $agora.AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$gatilhoLogon = New-ScheduledTaskTrigger -AtLogOn -User ("{0}\{1}" -f $env:USERDOMAIN, $env:USERNAME)
$configuracoes = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden
$principal = New-ScheduledTaskPrincipal -UserId ("{0}\{1}" -f $env:USERDOMAIN, $env:USERNAME) -LogonType Interactive -RunLevel Limited
$tarefa = New-ScheduledTask -Action $acao -Trigger @($gatilhoLogon, $gatilhoMinuto) -Settings $configuracoes -Principal $principal -Description 'Verifica a cada minuto se ha uma nova lista Event3 estavel e ainda nao processada.'
Register-ScheduledTask -TaskName $NomeTarefa -InputObject $tarefa -Force | Out-Null

$registrada = Get-ScheduledTask -TaskName $NomeTarefa
[PSCustomObject]@{
    tarefa = $NomeTarefa
    estado = [string]$registrada.State
    frequenciaMinutos = 1
    pasta = $PastaOperacional
    baselineCriado = [bool]$baseline.criado
    arquivosBaseline = [int]$baseline.arquivos
} | ConvertTo-Json -Compress
