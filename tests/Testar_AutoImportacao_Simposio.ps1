[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$AutoImportador = Join-Path (Split-Path -Parent $PSScriptRoot) 'automacao\AutoImportar_Simposio.ps1'
. $AutoImportador

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Assert-Equal {
    param($Atual, $Esperado, [string]$Mensagem)
    if ($Atual -ne $Esperado) { throw "$Mensagem Esperado=$Esperado Atual=$Atual" }
}

function New-TestXlsx {
    param([string]$Path, [string]$Marcador)
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    try {
        $zip = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create, $true)
        try {
            $conteudos = @{
                '[Content_Types].xml' = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>'
                'xl/workbook.xml' = '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets/></workbook>'
                'xl/worksheets/sheet1.xml' = ('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/><extLst><ext uri="{0}"/></extLst></worksheet>' -f $Marcador)
            }
            foreach ($nome in $conteudos.Keys) {
                $entrada = $zip.CreateEntry($nome)
                $writer = New-Object System.IO.StreamWriter($entrada.Open(), (New-Object System.Text.UTF8Encoding($false)))
                try { $writer.Write($conteudos[$nome]) } finally { $writer.Dispose() }
            }
        }
        finally { $zip.Dispose() }
    }
    finally { $stream.Dispose() }
}

function New-Scenario {
    param([string]$Root, [string]$Name)
    $dir = Join-Path $Root $Name
    New-Item -ItemType Directory -Path $dir | Out-Null
    return $dir
}

function Invoke-TestRun {
    param(
        [string]$Dir,
        [switch]$DryRun,
        [scriptblock]$Executor,
        [string]$MutexName,
        [datetime]$AgoraUtc = ([datetime]::UtcNow)
    )
    if (-not $MutexName) { $MutexName = 'Local\SORRI_AutoImportacao_Teste_' + [guid]::NewGuid().ToString('N') }
    return Invoke-AutoImportacaoSimposio -DryRun:$DryRun -PastaMonitorada $Dir -ImportadorPath (Join-Path $Dir 'Importar_Simposio.ps1') -EstadoPath (Join-Path $Dir 'estado_autoimportacao.json') -LogPath (Join-Path $Dir 'logs\AutoImportacao_Simposio.log') -IntervaloEstabilidadeSegundos 0 -MutexName $MutexName -ExecutorImportacao $Executor -AgoraUtc $AgoraUtc
}

$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$testRoot = Join-Path $tempRoot ('simposio50-auto-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null

try {
    $a = New-Scenario $testRoot 'a-sem-arquivo'
    $resultadoA = Invoke-TestRun -Dir $a -DryRun
    Assert-Equal $resultadoA.status 'SEM_NOVO_ARQUIVO' 'A: pasta vazia deve ficar ociosa.'
    Assert-Equal (Test-Path -LiteralPath (Join-Path $a 'estado_autoimportacao.json')) $false 'A: dry-run não pode criar estado.'

    $b = New-Scenario $testRoot 'b-novo-estavel'
    New-TestXlsx (Join-Path $b 'ListaCredenciamento_15-09-2026_07-00-00.xlsx') 'ANTIGO'
    New-TestXlsx (Join-Path $b 'ListaCredenciamento_15-09-2026_07-01-00.xlsx') 'NOVO'
    $resultadoB = Invoke-TestRun -Dir $b -DryRun
    Assert-Equal $resultadoB.status 'DRY_RUN_IMPORTARIA' 'B: arquivo estável deve ser detectado.'
    Assert-Equal $resultadoB.arquivo 'ListaCredenciamento_15-09-2026_07-01-00.xlsx' 'B: deve selecionar o timestamp mais novo.'

    $c = New-Scenario $testRoot 'c-arquivo-parcial'
    $arquivoC = Join-Path $c 'ListaCredenciamento_15-09-2026_07-02-00.xlsx'
    New-TestXlsx $arquivoC 'PARCIAL'
    $lockArquivo = [System.IO.File]::Open($arquivoC, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)
    try { $resultadoC = Invoke-TestRun -Dir $c -DryRun } finally { $lockArquivo.Dispose() }
    Assert-Equal $resultadoC.status 'AGUARDANDO_ESTABILIDADE' 'C: arquivo bloqueado deve aguardar.'

    $defj = New-Scenario $testRoot 'd-e-f-j-idempotencia'
    $arquivoD = Join-Path $defj 'ListaCredenciamento_15-09-2026_07-03-00.xlsx'
    New-TestXlsx $arquivoD 'CONTEUDO-A'
    $script:execucoesSucesso = 0
    $executorSucesso = {
        param($Arquivo)
        $script:execucoesSucesso++
        [PSCustomObject]@{ sucesso = $true; arquivo = [System.IO.Path]::GetFileName($Arquivo); registrosLidos = 10; inscricoesNovas = 2; pessoasNovas = 1; pessoasAtualizadas = 0; baseVersion = '7' }
    }
    $t0 = [datetime]'2026-09-15T10:00:00Z'
    $resultadoD1 = Invoke-TestRun -Dir $defj -Executor $executorSucesso -AgoraUtc $t0
    Assert-Equal $resultadoD1.status 'SUCESSO' 'D: primeira execução deve processar.'
    $resultadoD2 = Invoke-TestRun -Dir $defj -Executor $executorSucesso -AgoraUtc $t0.AddMinutes(1)
    Assert-Equal $resultadoD2.status 'SEM_NOVO_ARQUIVO' 'D: mesmo arquivo não pode repetir.'
    Assert-Equal $script:execucoesSucesso 1 'D: executor deve rodar uma vez.'

    Copy-Item -LiteralPath $arquivoD -Destination (Join-Path $defj 'ListaCredenciamento_15-09-2026_07-04-00.xlsx')
    $resultadoE = Invoke-TestRun -Dir $defj -Executor $executorSucesso -AgoraUtc $t0.AddMinutes(2)
    Assert-Equal $resultadoE.status 'SEM_NOVO_ARQUIVO' 'E: nome diferente com mesmo hash não pode repetir.'
    Assert-Equal $script:execucoesSucesso 1 'E: executor não deve rodar para hash repetido.'

    New-TestXlsx (Join-Path $defj 'ListaCredenciamento_15-09-2026_07-05-00.xlsx') 'CONTEUDO-B'
    $resultadoF = Invoke-TestRun -Dir $defj -Executor $executorSucesso -AgoraUtc $t0.AddMinutes(3)
    Assert-Equal $resultadoF.status 'SUCESSO' 'F: conteúdo novo deve processar.'
    Assert-Equal $script:execucoesSucesso 2 'F: segundo hash deve rodar uma vez.'
    $resultadoJ = Invoke-TestRun -Dir $defj -Executor $executorSucesso -AgoraUtc $t0.AddMinutes(4)
    Assert-Equal $resultadoJ.status 'SEM_NOVO_ARQUIVO' 'J: nova invocação deve reutilizar estado persistido.'
    Assert-Equal $script:execucoesSucesso 2 'J: reinício lógico não pode repetir hashes.'

    $g = New-Scenario $testRoot 'g-mutex'
    New-TestXlsx (Join-Path $g 'ListaCredenciamento_15-09-2026_07-06-00.xlsx') 'MUTEX'
    $mutexName = 'Local\SORRI_AutoImportacao_Teste_Mutex_' + [guid]::NewGuid().ToString('N')
    $mutexReady = Join-Path $g 'mutex.ready'
    $jobMutex = Start-Job -ScriptBlock {
        param($Nome, $Ready)
        $m = New-Object System.Threading.Mutex($false, $Nome)
        [void]$m.WaitOne(0)
        [System.IO.File]::WriteAllText($Ready, 'ready')
        try { Start-Sleep -Seconds 3 } finally { $m.ReleaseMutex(); $m.Dispose() }
    } -ArgumentList $mutexName, $mutexReady
    try {
        $limite = (Get-Date).AddSeconds(5)
        while (-not (Test-Path -LiteralPath $mutexReady) -and (Get-Date) -lt $limite) { Start-Sleep -Milliseconds 50 }
        if (-not (Test-Path -LiteralPath $mutexReady)) { throw 'G: processo auxiliar não adquiriu o mutex.' }
        $resultadoG = Invoke-TestRun -Dir $g -DryRun -MutexName $mutexName
    }
    finally {
        Wait-Job -Job $jobMutex -Timeout 5 | Out-Null
        Remove-Job -Job $jobMutex -Force
    }
    Assert-Equal $resultadoG.status 'EM_EXECUCAO' 'G: segunda instância deve encerrar sem processar.'

    $hi = New-Scenario $testRoot 'h-i-backoff'
    New-TestXlsx (Join-Path $hi 'ListaCredenciamento_15-09-2026_07-07-00.xlsx') 'FALHA'
    $script:execucoesFalha = 0
    $executorFalha = { param($Arquivo) $script:execucoesFalha++; [PSCustomObject]@{ sucesso = $false; erro = 'HTTP_TIMEOUT' } }
    $resultadoH1 = Invoke-TestRun -Dir $hi -Executor $executorFalha -AgoraUtc $t0
    $resultadoH2 = Invoke-TestRun -Dir $hi -Executor $executorFalha -AgoraUtc $t0.AddMinutes(2)
    $resultadoH3 = Invoke-TestRun -Dir $hi -Executor $executorFalha -AgoraUtc $t0.AddMinutes(8)
    $resultadoI = Invoke-TestRun -Dir $hi -Executor $executorFalha -AgoraUtc $t0.AddMinutes(20)
    Assert-Equal $resultadoH1.status 'ERRO_RETRY' 'H: primeira falha deve permitir retry.'
    Assert-Equal $resultadoH2.status 'ERRO_RETRY' 'H: segunda falha deve manter retry com backoff.'
    Assert-Equal $resultadoH3.status 'ERRO_REQUER_REVISAO' 'I: terceira falha deve bloquear automação.'
    Assert-Equal $resultadoI.status 'ERRO_REQUER_REVISAO' 'I: arquivo bloqueado não deve ser tentado novamente.'
    Assert-Equal $script:execucoesFalha 3 'I: limite deve impedir quarta chamada ao backend.'
    $estadoFalha = Read-AutoImportState (Join-Path $hi 'estado_autoimportacao.json')
    Assert-Equal @($estadoFalha.processados).Count 0 'H: falha não pode marcar hash como processado.'

    $k = New-Scenario $testRoot 'k-baseline'
    $baselineA = Join-Path $k 'ListaCredenciamento_15-09-2026_07-08-00.xlsx'
    New-TestXlsx $baselineA 'BASELINE-A'
    Copy-Item -LiteralPath $baselineA -Destination (Join-Path $k 'ListaCredenciamento_15-09-2026_07-09-00.xlsx')
    New-TestXlsx (Join-Path $k 'ListaCredenciamento_15-09-2026_07-10-00.xlsx') 'BASELINE-B'
    $baselineEstado = Join-Path $k 'estado_autoimportacao.json'
    $resultadoK1 = Initialize-AutoImportBaseline -PastaMonitorada $k -EstadoPath $baselineEstado -AgoraUtc $t0
    $resultadoK2 = Initialize-AutoImportBaseline -PastaMonitorada $k -EstadoPath $baselineEstado -AgoraUtc $t0.AddMinutes(1)
    Assert-Equal $resultadoK1.criado $true 'K: primeira instalação deve criar baseline.'
    Assert-Equal $resultadoK1.arquivos 2 'K: baseline deve deduplicar hashes iguais.'
    Assert-Equal $resultadoK2.criado $false 'K: reinstalação deve preservar estado existente.'
    Assert-Equal $resultadoK2.arquivos 2 'K: reinstalação deve manter hashes do baseline.'

    [PSCustomObject]@{
        nenhumArquivo = $resultadoA.status
        arquivoNovo = $resultadoB.status
        arquivoParcial = $resultadoC.status
        repetido = $resultadoD2.status
        mesmoHashNomeDiferente = $resultadoE.status
        novoConteudo = $resultadoF.status
        concorrencia = $resultadoG.status
        backendIndisponivel = $resultadoH1.status
        limiteFalhas = $resultadoH3.status
        reinicio = $resultadoJ.status
        baseline = if ($resultadoK1.criado -and -not $resultadoK2.criado) { 'PERSISTENTE' } else { 'FALHA' }
    } | ConvertTo-Json -Compress
}
finally {
    $resolvido = [System.IO.Path]::GetFullPath($testRoot)
    if ($resolvido.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and [System.IO.Path]::GetFileName($resolvido).StartsWith('simposio50-auto-')) {
        Remove-Item -LiteralPath $resolvido -Recurse -Force
    }
}
