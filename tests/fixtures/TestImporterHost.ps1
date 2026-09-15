param([string]$Importador,[string]$Arquivo,[string]$ResultadoJson)
function Invoke-RestMethod {
    param($Uri,$Method,$ContentType,$Body)
    [pscustomobject]@{ok=$true;data=[pscustomobject]@{arquivo=[IO.Path]::GetFileName($Arquivo);registrosLidos=1;inscricoesNovas=1;pessoasNovas=1;pessoasAtualizadas=0;baseVersion='fixture'}}
}
. $Importador -Arquivo $Arquivo -NaoInterativo -ResultadoJson $ResultadoJson
