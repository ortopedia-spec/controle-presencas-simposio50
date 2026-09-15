# ============================================================
# SIMPOSIO 50 ANOS SORRI BAURU
# IMPORTACAO DA LISTA DE CREDENCIAMENTO
# ============================================================

param(
    [object]$Arquivo = $null,
    [switch]$NaoInterativo,
    [string]$ResultadoJson = ""
)

$ErrorActionPreference = "Stop"
$ArquivoSolicitado = if ($PSBoundParameters.ContainsKey('Arquivo')) { [string]$PSBoundParameters['Arquivo'] } else { '' }
$FalhaImportacao = $null

# ------------------------------------------------------------
# CONFIGURACOES
# ------------------------------------------------------------

$PastaInput = "C:\UNIMED_EXAMES_ABERTOS"

$WebAppUrl = "https://script.google.com/macros/s/AKfycbyr6Uu1NE2M6UE3i2X92qNQgih3Ky9OCAYpXqmo3L2fGry2GhIGVPn43mDOp_IFd1Cl/exec"

# COLE ABAIXO O TOKEN QUE ESTA NA ABA CONFIG DA PLANILHA
$Token = "COLE_AQUI_O_TOKEN_IMPORTACAO"


# ------------------------------------------------------------
# FUNCOES AUXILIARES
# ------------------------------------------------------------

function Texto-Seguro {
    param($Valor)

    if ($null -eq $Valor) {
        return ""
    }

    return ([string]$Valor).Trim()
}


function Normalizar-Cabecalho {
    param($Texto)

    if ($null -eq $Texto) {
        return ""
    }

    $Valor = ([string]$Texto).Trim()

    if ($Valor -eq "") {
        return ""
    }

    # Remove acentos
    $FormD = $Valor.Normalize(
        [System.Text.NormalizationForm]::FormD
    )

    $Builder = New-Object System.Text.StringBuilder

    foreach ($Char in $FormD.ToCharArray()) {

        $Categoria = [System.Globalization.CharUnicodeInfo]::GetUnicodeCategory(
            $Char
        )

        if (
            $Categoria -ne
            [System.Globalization.UnicodeCategory]::NonSpacingMark
        ) {
            [void]$Builder.Append($Char)
        }
    }

    $Valor = $Builder.ToString().Normalize(
        [System.Text.NormalizationForm]::FormC
    )

    # Normaliza espacos
    $Valor = $Valor -replace '\s+', ' '

    return $Valor.Trim().ToUpperInvariant()
}


function Converter-DataExcel {
    param($Valor)

    if ($null -eq $Valor) {
        return ""
    }

    if (
        $Valor -is [double] -or
        $Valor -is [float] -or
        $Valor -is [int] -or
        $Valor -is [long] -or
        $Valor -is [decimal]
    ) {
        try {
            return [DateTime]::FromOADate(
                [double]$Valor
            ).ToString("dd/MM/yyyy")
        }
        catch {
            return Texto-Seguro $Valor
        }
    }


    if ($Valor -is [DateTime]) {
        return $Valor.ToString("dd/MM/yyyy")
    }


    $Texto = Texto-Seguro $Valor

    if ($Texto -eq "") {
        return ""
    }


    $Cultura = [System.Globalization.CultureInfo]::GetCultureInfo(
        "pt-BR"
    )


    $Formatos = @(
        "dd/MM/yyyy",
        "d/M/yyyy",
        "dd/MM/yyyy HH:mm:ss",
        "d/M/yyyy H:mm:ss",
        "dd/MM/yyyy HH:mm",
        "d/M/yyyy H:mm",
        "yyyy-MM-dd",
        "yyyy-MM-dd HH:mm:ss"
    )


    foreach ($Formato in $Formatos) {

        try {
            $Data = [DateTime]::ParseExact(
                $Texto,
                $Formato,
                $Cultura
            )

            return $Data.ToString("dd/MM/yyyy")
        }
        catch {
            # Tenta o proximo formato
        }
    }


    try {
        $Data = [DateTime]::Parse(
            $Texto,
            $Cultura
        )

        return $Data.ToString("dd/MM/yyyy")
    }
    catch {
        return $Texto
    }
}


function Converter-HoraExcel {
    param($Valor)

    if ($null -eq $Valor) {
        return ""
    }


    if (
        $Valor -is [double] -or
        $Valor -is [float] -or
        $Valor -is [int] -or
        $Valor -is [long] -or
        $Valor -is [decimal]
    ) {
        try {
            return [DateTime]::FromOADate(
                [double]$Valor
            ).ToString("HH:mm:ss")
        }
        catch {
            return Texto-Seguro $Valor
        }
    }


    if ($Valor -is [DateTime]) {
        return $Valor.ToString("HH:mm:ss")
    }


    $Texto = Texto-Seguro $Valor

    if ($Texto -eq "") {
        return ""
    }


    $Cultura = [System.Globalization.CultureInfo]::GetCultureInfo(
        "pt-BR"
    )


    $Formatos = @(
        "HH:mm:ss",
        "H:mm:ss",
        "HH:mm",
        "H:mm"
    )


    foreach ($Formato in $Formatos) {

        try {
            $Hora = [DateTime]::ParseExact(
                $Texto,
                $Formato,
                $Cultura
            )

            return $Hora.ToString("HH:mm:ss")
        }
        catch {
            # Tenta o proximo formato
        }
    }


    try {
        $Hora = [DateTime]::Parse(
            $Texto,
            $Cultura
        )

        return $Hora.ToString("HH:mm:ss")
    }
    catch {
        return $Texto
    }
}


function Obter-ValorColuna {
    param(
        $Valores,
        [int]$Linha,
        $Colunas,
        [string]$NomeColuna
    )

    if (-not $Colunas.ContainsKey($NomeColuna)) {
        return ""
    }

    return Texto-Seguro `
        $Valores[$Linha, $Colunas[$NomeColuna]]
}


# ------------------------------------------------------------
# INICIO
# ------------------------------------------------------------

Write-Host ""
Write-Host "============================================="
Write-Host " SIMPOSIO 50 ANOS - ATUALIZACAO DA BASE"
Write-Host "============================================="
Write-Host ""


# ------------------------------------------------------------
# VALIDA CONFIGURACOES
# ------------------------------------------------------------

if (-not (Test-Path $PastaInput)) {
    throw "A pasta de entrada nao foi encontrada: $PastaInput"
}


if (
    [string]::IsNullOrWhiteSpace($Token) -or
    $Token -eq "COLE_AQUI_O_TOKEN_IMPORTACAO"
) {
    throw "O TOKEN_IMPORTACAO ainda nao foi configurado no script."
}


# ------------------------------------------------------------
# LOCALIZA OS ARQUIVOS DE CREDENCIAMENTO
# ------------------------------------------------------------

$ArquivosValidos = @()


Get-ChildItem `
    -Path $PastaInput `
    -File `
    -Filter "ListaCredenciamento_*.xlsx" |
ForEach-Object {

    if (
        $_.Name -match
        '^ListaCredenciamento_(\d{2})-(\d{2})-(\d{4})_(\d{2})-(\d{2})-(\d{2})\.xlsx$'
    ) {

        $Dia = [int]$Matches[1]
        $Mes = [int]$Matches[2]
        $Ano = [int]$Matches[3]

        $Hora = [int]$Matches[4]
        $Minuto = [int]$Matches[5]
        $Segundo = [int]$Matches[6]


        try {

            $DataHoraArquivo = Get-Date `
                -Year $Ano `
                -Month $Mes `
                -Day $Dia `
                -Hour $Hora `
                -Minute $Minuto `
                -Second $Segundo


            $ArquivosValidos += [PSCustomObject]@{
                Arquivo  = $_
                DataHora = $DataHoraArquivo
            }

        }
        catch {
            # Ignora arquivo com data/hora invalida.
        }
    }
}


if ($ArquivosValidos.Count -eq 0) {
    throw "Nenhum arquivo ListaCredenciamento valido foi encontrado."
}


# ------------------------------------------------------------
# SELECIONA O ARQUIVO MAIS RECENTE
# ------------------------------------------------------------

$Selecionado = $ArquivosValidos |
    Sort-Object DataHora -Descending |
    Select-Object -First 1


$Arquivo = $Selecionado.Arquivo
$DataHoraArquivo = $Selecionado.DataHora


if (-not [string]::IsNullOrWhiteSpace($ArquivoSolicitado)) {

    $ArquivoInformado = Get-Item `
        -LiteralPath $ArquivoSolicitado `
        -ErrorAction Stop

    if ($ArquivoInformado.Extension -ne ".xlsx") {
        throw "O arquivo informado nao e um .xlsx."
    }

    if ($ArquivoInformado.Name -notmatch '^ListaCredenciamento_(\d{2})-(\d{2})-(\d{4})_(\d{2})-(\d{2})-(\d{2})\.xlsx$') {
        throw "O arquivo informado nao segue o padrao ListaCredenciamento."
    }

    $PastaResolvida = [System.IO.Path]::GetFullPath($PastaInput).TrimEnd('\')
    $PastaDoArquivo = [System.IO.Path]::GetFullPath($ArquivoInformado.DirectoryName).TrimEnd('\')

    if (-not $PastaDoArquivo.Equals($PastaResolvida, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "O arquivo informado deve estar na pasta operacional aprovada."
    }

    $DataHoraArquivo = Get-Date `
        -Year ([int]$Matches[3]) `
        -Month ([int]$Matches[2]) `
        -Day ([int]$Matches[1]) `
        -Hour ([int]$Matches[4]) `
        -Minute ([int]$Matches[5]) `
        -Second ([int]$Matches[6])

    $Arquivo = $ArquivoInformado
}


Write-Host "Arquivo selecionado:"
Write-Host $Arquivo.Name
Write-Host ""

Write-Host "Data/hora do arquivo:"
Write-Host $DataHoraArquivo.ToString(
    "dd/MM/yyyy HH:mm:ss"
)
Write-Host ""


# ------------------------------------------------------------
# VARIAVEIS EXCEL
# ------------------------------------------------------------

$Excel = $null
$Workbook = $null
$Worksheet = $null
$UsedRange = $null

if ($null -eq $Arquivo -or [string]::IsNullOrWhiteSpace([string]$Arquivo)) {
    throw 'ARQUIVO_SELECIONADO_AUSENTE'
}
if ($Arquivo -isnot [System.IO.FileInfo]) {
    $Arquivo = Get-Item -LiteralPath ([string]$Arquivo) -ErrorAction Stop
}

$LeitorXlsx = Join-Path $PSScriptRoot 'LeitorXlsx_OpenXml.ps1'
if (-not (Test-Path -LiteralPath $LeitorXlsx -PathType Leaf)) {
    throw 'LEITOR_XLSX_AUSENTE'
}
. $LeitorXlsx


try {

    # --------------------------------------------------------
    # LE O XLSX DIRETAMENTE VIA OPEN XML (SEM EXCEL/COM)
    # --------------------------------------------------------

    $TabelaXlsx = Read-XlsxFirstWorksheet -Path $Arquivo.FullName
    $Valores = $TabelaXlsx.Values
    $TotalLinhas = $TabelaXlsx.TotalRows
    $TotalColunas = $TabelaXlsx.TotalColumns


    if ($TotalLinhas -lt 2) {
        throw "O arquivo nao possui registros para importar."
    }


    # --------------------------------------------------------
    # LE E NORMALIZA OS CABECALHOS
    # --------------------------------------------------------

    $Colunas = @{}


    for (
        $Coluna = 1;
        $Coluna -le $TotalColunas;
        $Coluna++
    ) {

        $Cabecalho = Normalizar-Cabecalho `
            $Valores[1, $Coluna]


        if ($Cabecalho -ne "") {
            $Colunas[$Cabecalho] = $Coluna
        }
    }


    # --------------------------------------------------------
    # VALIDA COLUNAS OBRIGATORIAS
    # --------------------------------------------------------

    $Obrigatorias = @(
        "ID",
        "NOME",
        "NUMERO DE INSCRICAO",
        "CATEGORIA"
    )


    foreach ($Obrigatoria in $Obrigatorias) {

        if (-not $Colunas.ContainsKey($Obrigatoria)) {

            Write-Host ""
            Write-Host "Cabecalhos encontrados:"
            Write-Host ""

            $Colunas.Keys |
                Sort-Object |
                ForEach-Object {
                    Write-Host " - $_"
                }

            Write-Host ""

            throw "Coluna obrigatoria nao encontrada: $Obrigatoria"
        }
    }


    Write-Host "Estrutura do arquivo validada."
    Write-Host ""


    # --------------------------------------------------------
    # MONTA OS REGISTROS
    # --------------------------------------------------------

    $Registros = New-Object `
        'System.Collections.Generic.List[object]'


    for (
        $Linha = 2;
        $Linha -le $TotalLinhas;
        $Linha++
    ) {

        $NumeroInscricao = Obter-ValorColuna `
            $Valores `
            $Linha `
            $Colunas `
            "NUMERO DE INSCRICAO"


        $Nome = Obter-ValorColuna `
            $Valores `
            $Linha `
            $Colunas `
            "NOME"


        # Ignora linhas que nao representam inscricoes validas
        if (
            [string]::IsNullOrWhiteSpace($NumeroInscricao) -or
            [string]::IsNullOrWhiteSpace($Nome)
        ) {
            continue
        }


        $IdOrigem = Obter-ValorColuna `
            $Valores `
            $Linha `
            $Colunas `
            "ID"


        $Categoria = Obter-ValorColuna `
            $Valores `
            $Linha `
            $Colunas `
            "CATEGORIA"


        $NomeCracha = Obter-ValorColuna `
            $Valores `
            $Linha `
            $Colunas `
            "NOME CRACHA"


        $Email = Obter-ValorColuna `
            $Valores `
            $Linha `
            $Colunas `
            "E-MAIL"


        $Cpf = Obter-ValorColuna `
            $Valores `
            $Linha `
            $Colunas `
            "DOCUMENTO"


        $Telefone = Obter-ValorColuna `
            $Valores `
            $Linha `
            $Colunas `
            "TELEFONE PRIMARIO"


        # ----------------------------------------------------
        # DATA DA INSCRICAO
        # ----------------------------------------------------

        $DataInscricao = ""

        if ($Colunas.ContainsKey("DATA INSCRICAO")) {

            $ValorData = $Valores[
                $Linha,
                $Colunas["DATA INSCRICAO"]
            ]

            $DataInscricao = Converter-DataExcel `
                $ValorData
        }


        # ----------------------------------------------------
        # HORA DA INSCRICAO
        # ----------------------------------------------------

        $HoraInscricao = ""

        if ($Colunas.ContainsKey("HORA INSCRICAO")) {

            $ValorHora = $Valores[
                $Linha,
                $Colunas["HORA INSCRICAO"]
            ]

            $HoraInscricao = Converter-HoraExcel `
                $ValorHora
        }


        # ----------------------------------------------------
        # OBJETO ENVIADO AO GOOGLE
        # ----------------------------------------------------

        $Registro = [PSCustomObject]@{

            numeroInscricao = $NumeroInscricao

            idOrigem = $IdOrigem

            nome = $Nome

            nomeCracha = $NomeCracha

            email = $Email

            cpf = $Cpf

            telefone = $Telefone

            categoria = $Categoria

            dataInscricao = $DataInscricao

            horaInscricao = $HoraInscricao
        }


        $Registros.Add($Registro)
    }


    Write-Host "Registros preparados:"
    Write-Host $Registros.Count
    Write-Host ""


    if ($Registros.Count -eq 0) {
        throw "Nenhum registro valido foi encontrado."
    }


    # --------------------------------------------------------
    # MONTA O PAYLOAD
    # --------------------------------------------------------

    $Payload = @{

        action = "importarCredenciamento"

        token = $Token

        arquivo = $Arquivo.Name

        arquivoDataHora = $DataHoraArquivo.ToString(
            "dd/MM/yyyy HH:mm:ss"
        )

        registros = $Registros
    }


    $Json = $Payload |
        ConvertTo-Json `
            -Depth 6 `
            -Compress


    # --------------------------------------------------------
    # ENVIA PARA O GOOGLE APPS SCRIPT
    # --------------------------------------------------------

    Write-Host "Enviando dados para o Google..."
    Write-Host ""


    $JsonBytes = [System.Text.Encoding]::UTF8.GetBytes(
        $Json
    )


    $Resposta = Invoke-RestMethod `
        -Uri $WebAppUrl `
        -Method Post `
        -ContentType "application/json; charset=utf-8" `
        -Body $JsonBytes


    # --------------------------------------------------------
    # VALIDA A RESPOSTA
    # --------------------------------------------------------

    if ($null -eq $Resposta) {
        throw "O servidor nao retornou uma resposta."
    }


    if (-not $Resposta.ok) {

        $MensagemErro = $Resposta.erro

        if (
            [string]::IsNullOrWhiteSpace(
                $MensagemErro
            )
        ) {
            $MensagemErro =
                "Erro desconhecido retornado pelo servidor."
        }

        throw $MensagemErro
    }


    # --------------------------------------------------------
    # RESULTADO
    # --------------------------------------------------------

    Write-Host ""
    Write-Host "============================================="
    Write-Host " ATUALIZACAO CONCLUIDA"
    Write-Host "============================================="
    Write-Host ""


    Write-Host "Arquivo:"
    Write-Host $Resposta.data.arquivo
    Write-Host ""


    Write-Host "Registros lidos:"
    Write-Host $Resposta.data.registrosLidos
    Write-Host ""


    Write-Host "Novas inscricoes:"
    Write-Host $Resposta.data.inscricoesNovas
    Write-Host ""


    Write-Host "Novas pessoas:"
    Write-Host $Resposta.data.pessoasNovas
    Write-Host ""


    Write-Host "Pessoas atualizadas:"
    Write-Host $Resposta.data.pessoasAtualizadas
    Write-Host ""

    if (-not [string]::IsNullOrWhiteSpace($ResultadoJson)) {

        $ResultadoSeguro = [ordered]@{
            arquivo = [string]$Resposta.data.arquivo
            registrosLidos = [int]$Resposta.data.registrosLidos
            inscricoesNovas = [int]$Resposta.data.inscricoesNovas
            pessoasNovas = [int]$Resposta.data.pessoasNovas
            pessoasAtualizadas = [int]$Resposta.data.pessoasAtualizadas
            baseVersion = [string]$Resposta.data.baseVersion
        }

        $ResultadoTexto = $ResultadoSeguro | ConvertTo-Json -Compress
        [System.IO.File]::WriteAllText(
            $ResultadoJson,
            $ResultadoTexto,
            (New-Object System.Text.UTF8Encoding($false))
        )
    }
}
catch {

    $FalhaImportacao = ('{0} | linha={1}' -f $_.Exception.Message, $_.InvocationInfo.ScriptLineNumber)

    Write-Host ""
    Write-Host "============================================="
    Write-Host " ERRO NA ATUALIZACAO"
    Write-Host "============================================="
    Write-Host ""

    Write-Host $FalhaImportacao
    Write-Host ""
}
finally {

    # --------------------------------------------------------
    # FECHA E LIBERA O EXCEL
    # --------------------------------------------------------

    if ($Workbook -ne $null) {

        try {
            $Workbook.Close($false)
        }
        catch {
        }
    }


    if ($Excel -ne $null) {

        try {
            $Excel.Quit()
        }
        catch {
        }
    }


    if ($UsedRange -ne $null) {

        try {
            [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject(
                $UsedRange
            )
        }
        catch {
        }
    }


    if ($Worksheet -ne $null) {

        try {
            [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject(
                $Worksheet
            )
        }
        catch {
        }
    }


    if ($Workbook -ne $null) {

        try {
            [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject(
                $Workbook
            )
        }
        catch {
        }
    }


    if ($Excel -ne $null) {

        try {
            [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject(
                $Excel
            )
        }
        catch {
        }
    }


    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}


if ($NaoInterativo) {

    if ($null -ne $FalhaImportacao) {
        Write-Error "Falha no importador Event3."
        return
    }

    return
}


Write-Host ""
Write-Host "Pressione ENTER para fechar."
Read-Host
