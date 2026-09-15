param([string]$Arquivo,[switch]$NaoInterativo,[string]$ResultadoJson)
[pscustomobject]@{arquivo=[IO.Path]::GetFileName($Arquivo);registrosLidos=1;inscricoesNovas=1;pessoasNovas=1;pessoasAtualizadas=0;baseVersion='fixture'} | ConvertTo-Json -Compress | Set-Content -LiteralPath $ResultadoJson -Encoding UTF8
exit 0
