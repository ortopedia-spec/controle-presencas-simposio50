[CmdletBinding()]
param(
    [switch]$DryRun,
    [string]$PastaMonitorada = '',
    [string]$ImportadorPath = '',
    [string]$EstadoPath = '',
    [string]$LogPath = '',
    [int]$IntervaloEstabilidadeSegundos = 4,
    [string]$MutexName = 'Local\SORRI_AutoImportacao_Simposio50',
    [scriptblock]$ExecutorImportacao,
    [datetime]$AgoraUtc = ([datetime]::UtcNow)
)

$ErrorActionPreference = 'Stop'
$RaizScript = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($RaizScript)) { $RaizScript = Split-Path -Parent $MyInvocation.MyCommand.Path }
if ([string]::IsNullOrWhiteSpace($PastaMonitorada)) { $PastaMonitorada = $RaizScript }
if ([string]::IsNullOrWhiteSpace($ImportadorPath)) { $ImportadorPath = Join-Path $RaizScript 'Importar_Simposio.ps1' }
if ([string]::IsNullOrWhiteSpace($EstadoPath)) { $EstadoPath = Join-Path $RaizScript 'estado_autoimportacao.json' }
if ([string]::IsNullOrWhiteSpace($LogPath)) { $LogPath = Join-Path $RaizScript 'logs\AutoImportacao_Simposio.log' }

function Write-AutoImportLog {
    param([string]$LogPath, [string]$Status, [string]$Mensagem)

    $diretorio = Split-Path -Parent $LogPath
    if (-not (Test-Path -LiteralPath $diretorio -PathType Container)) {
        New-Item -ItemType Directory -Path $diretorio -Force | Out-Null
    }

    if ((Test-Path -LiteralPath $LogPath -PathType Leaf) -and (Get-Item -LiteralPath $LogPath).Length -ge 2MB) {
        $rotacionado = $LogPath + '.1'
        if (Test-Path -LiteralPath $rotacionado -PathType Leaf) {
            [System.IO.File]::Delete($rotacionado)
        }
        Move-Item -LiteralPath $LogPath -Destination $rotacionado
    }

    $linha = '{0} | {1} | {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Status, ($Mensagem -replace '[\r\n]+', ' ')
    Add-Content -LiteralPath $LogPath -Value $linha -Encoding UTF8
}

function New-AutoImportState {
    [PSCustomObject]@{
        versao = 1
        ultimoProcessado = $null
        processados = @()
        falhas = @()
        atualizadoEmUtc = ''
    }
}

function Test-AutoImportProcessedStatus {
    param([string]$Status)
    return $Status -in @('BASELINE_CONFIRMADO_IMPORTADO', 'PROCESSADO_COM_SUCESSO', 'SUCESSO', 'SUPERADO_POR_PROCESSADO')
}

function Read-AutoImportState {
    param([string]$EstadoPath)

    if (-not (Test-Path -LiteralPath $EstadoPath -PathType Leaf)) {
        return New-AutoImportState
    }

    try {
        $estado = Get-Content -Raw -LiteralPath $EstadoPath | ConvertFrom-Json
    }
    catch {
        throw 'ESTADO_LOCAL_INVALIDO'
    }

    foreach ($propriedade in @('versao', 'ultimoProcessado', 'processados', 'falhas', 'atualizadoEmUtc')) {
        if (-not $estado.PSObject.Properties[$propriedade]) {
            $valor = if ($propriedade -in @('processados', 'falhas')) { @() } elseif ($propriedade -eq 'versao') { 1 } else { $null }
            $estado | Add-Member -NotePropertyName $propriedade -NotePropertyValue $valor
        }
    }

    $estado.processados = @($estado.processados)
    foreach ($item in $estado.processados) {
        if ([string]$item.status -eq 'BASELINE_EXISTENTE') { $item.status = 'BASELINE_CONFIRMADO_IMPORTADO' }
    }
    $estado.falhas = @($estado.falhas)
    return $estado
}

function Write-AutoImportState {
    param($Estado, [string]$EstadoPath, [datetime]$AgoraUtc)

    $diretorio = Split-Path -Parent $EstadoPath
    if (-not (Test-Path -LiteralPath $diretorio -PathType Container)) {
        New-Item -ItemType Directory -Path $diretorio -Force | Out-Null
    }

    $Estado.atualizadoEmUtc = $AgoraUtc.ToString('o')
    $temporario = $EstadoPath + '.tmp'
    $Estado | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temporario -Encoding UTF8
    Move-Item -LiteralPath $temporario -Destination $EstadoPath -Force
}

function Get-Event3Files {
    param([string]$PastaMonitorada)

    if (-not (Test-Path -LiteralPath $PastaMonitorada -PathType Container)) {
        throw 'PASTA_MONITORADA_AUSENTE'
    }

    $arquivos = @()
    foreach ($arquivo in Get-ChildItem -LiteralPath $PastaMonitorada -File -Filter 'ListaCredenciamento_*.xlsx') {
        if ($arquivo.Name.StartsWith('~$') -or ($arquivo.Attributes -band [System.IO.FileAttributes]::Hidden) -or ($arquivo.Attributes -band [System.IO.FileAttributes]::System)) {
            continue
        }
        if ($arquivo.Name -notmatch '^ListaCredenciamento_(\d{2}-\d{2}-\d{4}_\d{2}-\d{2}-\d{2})\.xlsx$') {
            continue
        }

        $dataHoraNome = [datetime]::MinValue
        if (-not [datetime]::TryParseExact($Matches[1], 'dd-MM-yyyy_HH-mm-ss', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$dataHoraNome)) {
            continue
        }

        $arquivos += [PSCustomObject]@{
            Arquivo = $arquivo
            DataHoraNome = $dataHoraNome
        }
    }

    return @($arquivos | Sort-Object @{Expression = 'DataHoraNome'; Descending = $true}, @{Expression = { $_.Arquivo.LastWriteTimeUtc }; Descending = $true})
}

function Test-Event3FileStable {
    param([System.IO.FileInfo]$Arquivo, [int]$IntervaloSegundos)

    try {
        $antes = Get-Item -LiteralPath $Arquivo.FullName
        if ($antes.Length -le 0) { return $false }
        $stream = [System.IO.File]::Open($antes.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)
        $stream.Dispose()
    }
    catch {
        return $false
    }

    if ($IntervaloSegundos -gt 0) {
        Start-Sleep -Seconds $IntervaloSegundos
    }

    try {
        $depois = Get-Item -LiteralPath $Arquivo.FullName
        if ($antes.Length -ne $depois.Length -or $antes.LastWriteTimeUtc -ne $depois.LastWriteTimeUtc) { return $false }
        $stream = [System.IO.File]::Open($depois.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)
        $stream.Dispose()
        return $true
    }
    catch {
        return $false
    }
}

function Test-Event3XlsxUsable {
    param([System.IO.FileInfo]$Arquivo)

    Add-Type -AssemblyName System.IO.Compression -ErrorAction SilentlyContinue
    Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
    $zip = $null
    try {
        $zip = [System.IO.Compression.ZipFile]::OpenRead($Arquivo.FullName)
        $nomes = @($zip.Entries | ForEach-Object { $_.FullName })
        return ($nomes -contains '[Content_Types].xml') -and ($nomes -contains 'xl/workbook.xml') -and ($nomes -contains 'xl/worksheets/sheet1.xml')
    }
    catch {
        return $false
    }
    finally {
        if ($null -ne $zip) { $zip.Dispose() }
    }
}

function Get-ImportErrorCode {
    param([string]$Texto)

    if ($Texto -match '(?i)timed?\s*out|tempo.*esgotado') { return 'HTTP_TIMEOUT' }
    if ($Texto -match '(?i)401|403|unauthorized|forbidden') { return 'AUTORIZACAO_NEGADA' }
    if ($Texto -match '(?i)404|not\s*found') { return 'ENDPOINT_NAO_ENCONTRADO' }
    if ($Texto -match '(?i)Excel|COMObject|Workbooks') { return 'EXCEL_INDISPONIVEL' }
    return 'IMPORTADOR_FALHOU'
}

function Invoke-ExistingEvent3Importer {
    param([string]$ImportadorPath, [string]$ArquivoPath)

    if (-not (Test-Path -LiteralPath $ImportadorPath -PathType Leaf)) {
        return [PSCustomObject]@{ sucesso = $false; erro = 'IMPORTADOR_AUSENTE' }
    }

    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $stdout = [System.IO.Path]::GetTempFileName()
    $stderr = [System.IO.Path]::GetTempFileName()
    $resultado = [System.IO.Path]::GetTempFileName()
    try {
        $argumentos = @(
            '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-File', ('"{0}"' -f $ImportadorPath),
            '-Arquivo', ('"{0}"' -f $ArquivoPath),
            '-NaoInterativo',
            '-ResultadoJson', ('"{0}"' -f $resultado)
        )
        $processo = Start-Process -FilePath $powershell -ArgumentList $argumentos -WorkingDirectory (Split-Path -Parent $ImportadorPath) -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr

        if ($processo.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $resultado) -or (Get-Item -LiteralPath $resultado).Length -eq 0) {
            $textoErro = (Get-Content -Raw -LiteralPath $stdout -ErrorAction SilentlyContinue) + ' ' + (Get-Content -Raw -LiteralPath $stderr -ErrorAction SilentlyContinue)
            return [PSCustomObject]@{ sucesso = $false; erro = (Get-ImportErrorCode $textoErro) }
        }

        $dados = Get-Content -Raw -LiteralPath $resultado | ConvertFrom-Json
        if ([System.IO.Path]::GetFileName($ArquivoPath) -ne [string]$dados.arquivo) {
            return [PSCustomObject]@{ sucesso = $false; erro = 'ARQUIVO_RETORNADO_DIVERGENTE' }
        }

        return [PSCustomObject]@{
            sucesso = $true
            arquivo = [string]$dados.arquivo
            registrosLidos = [int]$dados.registrosLidos
            inscricoesNovas = [int]$dados.inscricoesNovas
            pessoasNovas = [int]$dados.pessoasNovas
            pessoasAtualizadas = [int]$dados.pessoasAtualizadas
            baseVersion = [string]$dados.baseVersion
        }
    }
    catch {
        return [PSCustomObject]@{ sucesso = $false; erro = (Get-ImportErrorCode $_.Exception.Message) }
    }
    finally {
        foreach ($temporario in @($stdout, $stderr, $resultado)) {
            if (Test-Path -LiteralPath $temporario -PathType Leaf) { [System.IO.File]::Delete($temporario) }
        }
    }
}

function Register-AutoImportFailure {
    param($Estado, [string]$Hash, [System.IO.FileInfo]$Arquivo, [string]$Erro, [string]$EstadoPath, [datetime]$AgoraUtc)

    $anterior = @($Estado.falhas | Where-Object { $_.hash -eq $Hash } | Select-Object -First 1)
    $tentativas = if ($anterior.Count) { [int]$anterior[0].tentativas + 1 } else { 1 }
    $status = if ($tentativas -ge 3) { 'ERRO_REQUER_REVISAO' } else { 'ERRO_RETRY' }
    $proxima = if ($tentativas -eq 1) { $AgoraUtc.AddMinutes(1).ToString('o') } elseif ($tentativas -eq 2) { $AgoraUtc.AddMinutes(5).ToString('o') } else { '' }
    $registro = [PSCustomObject]@{
        hash = $Hash
        arquivo = $Arquivo.Name
        tentativas = $tentativas
        status = $status
        erro = $Erro
        ultimaFalhaEmUtc = $AgoraUtc.ToString('o')
        proximaTentativaEmUtc = $proxima
    }
    $Estado.falhas = @($Estado.falhas | Where-Object { $_.hash -ne $Hash }) + @($registro)
    Write-AutoImportState -Estado $Estado -EstadoPath $EstadoPath -AgoraUtc $AgoraUtc
    return $registro
}

function Initialize-AutoImportBaseline {
    param([string]$PastaMonitorada, [string]$EstadoPath, [datetime]$AgoraUtc = ([datetime]::UtcNow))

    if (Test-Path -LiteralPath $EstadoPath -PathType Leaf) {
        return [PSCustomObject]@{ criado = $false; arquivos = @(Read-AutoImportState $EstadoPath).processados.Count }
    }

    $estado = New-AutoImportState
    $itens = @()
    foreach ($candidato in Get-Event3Files $PastaMonitorada) {
        $arquivo = $candidato.Arquivo
        if (-not (Test-Event3FileStable -Arquivo $arquivo -IntervaloSegundos 0)) { throw 'ARQUIVO_BASELINE_EM_GRAVACAO' }
        if (-not (Test-Event3XlsxUsable -Arquivo $arquivo)) { throw 'ARQUIVO_BASELINE_XLSX_INVALIDO' }
        $hash = (Get-FileHash -LiteralPath $arquivo.FullName -Algorithm SHA256).Hash
        if (@($itens | Where-Object { $_.hash -eq $hash }).Count) { continue }
        $itens += [PSCustomObject]@{
            hash = $hash
            arquivo = $arquivo.Name
            caminho = $arquivo.FullName
            tamanho = [long]$arquivo.Length
            lastWriteTimeUtc = $arquivo.LastWriteTimeUtc.ToString('o')
            processadoEmUtc = $AgoraUtc.ToString('o')
            status = 'NAO_PROCESSADO'
            baseVersion = ''
        }
    }
    $estado.processados = @($itens)
    if ($itens.Count) { $estado.ultimoProcessado = $itens[0] }
    Write-AutoImportState -Estado $estado -EstadoPath $EstadoPath -AgoraUtc $AgoraUtc
    return [PSCustomObject]@{ criado = $true; arquivos = $itens.Count }
}

function Invoke-AutoImportacaoSimposio {
    [CmdletBinding()]
    param(
        [switch]$DryRun,
        [string]$PastaMonitorada,
        [string]$ImportadorPath,
        [string]$EstadoPath,
        [string]$LogPath,
        [int]$IntervaloEstabilidadeSegundos,
        [string]$MutexName,
        [scriptblock]$ExecutorImportacao,
        [datetime]$AgoraUtc
    )

    $mutex = New-Object System.Threading.Mutex($false, $MutexName)
    $adquirido = $false
    try {
        try { $adquirido = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $adquirido = $true }
        if (-not $adquirido) { return [PSCustomObject]@{ status = 'EM_EXECUCAO'; importou = $false } }

        $estado = Read-AutoImportState $EstadoPath
        $selecionado = $null
        $hashSelecionado = ''

        foreach ($candidato in Get-Event3Files $PastaMonitorada) {
            $arquivo = $candidato.Arquivo
            $metadadoConhecido = @($estado.processados | Where-Object {
                [string]$_.caminho -ieq $arquivo.FullName -and
                [long]$_.tamanho -eq [long]$arquivo.Length -and
                [string]$_.lastWriteTimeUtc -eq $arquivo.LastWriteTimeUtc.ToString('o')
            })
            if (@($metadadoConhecido | Where-Object { Test-AutoImportProcessedStatus ([string]$_.status) }).Count) { continue }

            if (-not (Test-Event3FileStable -Arquivo $arquivo -IntervaloSegundos $IntervaloEstabilidadeSegundos)) {
                Write-AutoImportLog $LogPath 'AGUARDANDO' ('arquivo={0} | motivo=ARQUIVO_EM_GRAVACAO' -f $arquivo.Name)
                return [PSCustomObject]@{ status = 'AGUARDANDO_ESTABILIDADE'; arquivo = $arquivo.Name; importou = $false }
            }

            $hash = (Get-FileHash -LiteralPath $arquivo.FullName -Algorithm SHA256).Hash
            if (@($estado.processados | Where-Object { $_.hash -eq $hash -and (Test-AutoImportProcessedStatus ([string]$_.status)) }).Count) { continue }

            $falha = @($estado.falhas | Where-Object { $_.hash -eq $hash } | Select-Object -First 1)
            if ($falha.Count -and $falha[0].status -eq 'ERRO_REQUER_REVISAO') {
                return [PSCustomObject]@{ status = 'ERRO_REQUER_REVISAO'; arquivo = $arquivo.Name; tentativas = [int]$falha[0].tentativas; importou = $false }
            }
            if ($falha.Count -and $falha[0].proximaTentativaEmUtc) {
                $proxima = [datetime]::Parse([string]$falha[0].proximaTentativaEmUtc).ToUniversalTime()
                if ($AgoraUtc.ToUniversalTime() -lt $proxima) {
                    return [PSCustomObject]@{ status = 'AGUARDANDO_RETRY'; arquivo = $arquivo.Name; tentativas = [int]$falha[0].tentativas; importou = $false }
                }
            }

            if (-not (Test-Event3XlsxUsable -Arquivo $arquivo)) {
                if ($DryRun) { return [PSCustomObject]@{ status = 'XLSX_INVALIDO'; arquivo = $arquivo.Name; importou = $false } }
                $registroFalha = Register-AutoImportFailure $estado $hash $arquivo 'XLSX_INVALIDO' $EstadoPath $AgoraUtc
                Write-AutoImportLog $LogPath 'ERRO' ('arquivo={0} | codigo=XLSX_INVALIDO | tentativa={1}' -f $arquivo.Name, $registroFalha.tentativas)
                return [PSCustomObject]@{ status = $registroFalha.status; arquivo = $arquivo.Name; tentativas = $registroFalha.tentativas; importou = $false }
            }

            $selecionado = $arquivo
            $hashSelecionado = $hash
            break
        }

        if ($null -eq $selecionado) { return [PSCustomObject]@{ status = 'SEM_NOVO_ARQUIVO'; importou = $false } }

        Write-AutoImportLog $LogPath 'DETECTADO' ('arquivo={0}' -f $selecionado.Name)
        if ($DryRun) {
            Write-AutoImportLog $LogPath 'DRY_RUN' ('arquivo={0} | acao=IMPORTARIA' -f $selecionado.Name)
            return [PSCustomObject]@{ status = 'DRY_RUN_IMPORTARIA'; arquivo = $selecionado.Name; hashNovo = $true; importou = $false }
        }

        Write-AutoImportLog $LogPath 'IMPORTANDO' ('arquivo={0}' -f $selecionado.Name)
        $cronometro = [Diagnostics.Stopwatch]::StartNew()
        try {
            if ($null -ne $ExecutorImportacao) {
                $resultado = & $ExecutorImportacao $selecionado.FullName
            }
            else {
                $resultado = Invoke-ExistingEvent3Importer -ImportadorPath $ImportadorPath -ArquivoPath $selecionado.FullName
            }
        }
        catch {
            $resultado = [PSCustomObject]@{ sucesso = $false; erro = (Get-ImportErrorCode $_.Exception.Message) }
        }
        $cronometro.Stop()

        if ($null -eq $resultado -or -not $resultado.sucesso) {
            $codigo = if ($null -ne $resultado -and $resultado.erro) { [string]$resultado.erro } else { 'IMPORTADOR_FALHOU' }
            $registroFalha = Register-AutoImportFailure $estado $hashSelecionado $selecionado $codigo $EstadoPath $AgoraUtc
            Write-AutoImportLog $LogPath 'ERRO' ('arquivo={0} | codigo={1} | tentativa={2}' -f $selecionado.Name, $codigo, $registroFalha.tentativas)
            return [PSCustomObject]@{ status = $registroFalha.status; arquivo = $selecionado.Name; tentativas = $registroFalha.tentativas; importou = $false }
        }

        $registroSucesso = [PSCustomObject]@{
            hash = $hashSelecionado
            arquivo = $selecionado.Name
            caminho = $selecionado.FullName
            tamanho = [long]$selecionado.Length
            lastWriteTimeUtc = $selecionado.LastWriteTimeUtc.ToString('o')
            processadoEmUtc = $AgoraUtc.ToString('o')
            status = 'PROCESSADO_COM_SUCESSO'
            baseVersion = [string]$resultado.baseVersion
            registrosLidos = [int]$resultado.registrosLidos
            inscricoesNovas = [int]$resultado.inscricoesNovas
            pessoasNovas = [int]$resultado.pessoasNovas
            pessoasAtualizadas = [int]$resultado.pessoasAtualizadas
            duracaoSegundos = [math]::Round($cronometro.Elapsed.TotalSeconds, 2)
        }
        $estado.processados = @($estado.processados) + @($registroSucesso)
        $estado.falhas = @($estado.falhas | Where-Object { $_.hash -ne $hashSelecionado })
        $estado.ultimoProcessado = $registroSucesso
        Write-AutoImportState -Estado $estado -EstadoPath $EstadoPath -AgoraUtc $AgoraUtc
        Write-AutoImportLog $LogPath 'SUCESSO' ('arquivo={0} | registrosLidos={1} | inscricoesNovas={2} | pessoasNovas={3} | pessoasAtualizadas={4} | baseVersion={5} | duracaoSegundos={6}' -f $selecionado.Name, $registroSucesso.registrosLidos, $registroSucesso.inscricoesNovas, $registroSucesso.pessoasNovas, $registroSucesso.pessoasAtualizadas, $registroSucesso.baseVersion, $registroSucesso.duracaoSegundos)
        return [PSCustomObject]@{ status = 'SUCESSO'; arquivo = $selecionado.Name; importou = $true; baseVersion = $registroSucesso.baseVersion; registrosLidos = $registroSucesso.registrosLidos; inscricoesNovas = $registroSucesso.inscricoesNovas; pessoasNovas = $registroSucesso.pessoasNovas; pessoasAtualizadas = $registroSucesso.pessoasAtualizadas }
    }
    finally {
        if ($adquirido) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    try {
        $parametros = @{
            DryRun = $DryRun
            PastaMonitorada = $PastaMonitorada
            ImportadorPath = $ImportadorPath
            EstadoPath = $EstadoPath
            LogPath = $LogPath
            IntervaloEstabilidadeSegundos = $IntervaloEstabilidadeSegundos
            MutexName = $MutexName
            ExecutorImportacao = $ExecutorImportacao
            AgoraUtc = $AgoraUtc
        }
        Invoke-AutoImportacaoSimposio @parametros | ConvertTo-Json -Depth 6 -Compress
    }
    catch {
        try { Write-AutoImportLog $LogPath 'ERRO' 'codigo=FALHA_INTERNA' } catch {}
        Write-Error 'A autoimportacao encontrou uma falha interna. Consulte o log operacional.'
        exit 1
    }
}
