$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$orquestrador = Join-Path $repo 'automacao\AtualizarBases_Simposio.ps1'
$launcher = Join-Path $repo 'automacao\AtualizarBases_Launcher.ps1'
$auto = Join-Path $repo 'automacao\AutoImportar_Simposio.ps1'
$temp = Join-Path ([IO.Path]::GetTempPath()) ('simposio-ui-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
    Copy-Item $orquestrador (Join-Path $temp 'AtualizarBases_Simposio.ps1')
    function Test-Caso($retorno, $esperado) {
        $fake = 'function Invoke-AutoImportacaoSimposio { [pscustomobject]@' + $retorno + ' }'
        Set-Content -LiteralPath (Join-Path $temp 'AutoImportar_Simposio.ps1') -Value $fake -Encoding UTF8
        $r = & (Join-Path $temp 'AtualizarBases_Simposio.ps1')
        if ($r.status -ne $esperado) { throw "Caso $esperado falhou" }
    }
    Test-Caso "{status='SUCESSO';arquivo='fixture.xlsx';baseVersion='7';registrosLidos=1;inscricoesNovas=1;pessoasNovas=1;pessoasAtualizadas=0}" 'CONCLUIDA'
    Test-Caso "{status='SEM_NOVO_ARQUIVO'}" 'ATUALIZADA'
    Test-Caso "{status='BACKEND_HTTP_ERROR'}" 'ERRO'
    $texto = Get-Content -Raw $launcher
    if ($texto -match 'ConvertFrom-Json' -or $texto -match "powershell.exe.*AtualizarBases_Simposio") { throw 'Contrato antigo ainda presente' }
    foreach ($frase in @('NÃO FOI POSSÍVEL ATUALIZAR','ATUALIZAÇÃO CONCLUÍDA','BASE JÁ ATUALIZADA')) { if ($texto -notmatch [regex]::Escape($frase)) { throw "Acento ausente: $frase" } }
    . $auto
    if (-not (Test-AutoImportProcessedStatus 'BASELINE_CONFIRMADO_IMPORTADO')) { throw 'Baseline confirmado não protegido' }
    if (Test-AutoImportProcessedStatus 'NAO_PROCESSADO') { throw 'Arquivo não processado foi protegido incorretamente' }
    [pscustomobject]@{objeto='OK';sucesso='OK';semAtualizacao='OK';erro='OK';contrato='OK';acentos='OK';baselineNaoProcessado='OK';baselineConfirmado='OK'} | ConvertTo-Json -Compress
}
finally {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
