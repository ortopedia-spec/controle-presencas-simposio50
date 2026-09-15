[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form=New-Object Windows.Forms.Form; $form.Text='ATUALIZAR BASES - Simpósio 50 Anos'; $form.Size=New-Object Drawing.Size(430,230); $form.StartPosition='CenterScreen'; $form.FormBorderStyle='FixedDialog'; $form.MaximizeBox=$false
$label=New-Object Windows.Forms.Label; $label.Text='Verificando arquivo Event3...'; $label.AutoSize=$false; $label.Dock='Top'; $label.Height=95; $label.TextAlign='MiddleCenter'; $label.Font=New-Object Drawing.Font('Segoe UI',14); $form.Controls.Add($label)
$close=New-Object Windows.Forms.Button; $close.Text='FECHAR'; $close.Width=100; $close.Height=35; $close.Left=155; $close.Top=125; $close.Enabled=$false; $close.Add_Click({$form.Close()}); $form.Controls.Add($close)
$timer=New-Object Windows.Forms.Timer; $timer.Interval=200
$job=Start-Job -ScriptBlock { & 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File 'C:\UNIMED_EXAMES_ABERTOS\AtualizarBases_Simposio.ps1' | ConvertFrom-Json }
$timer.Add_Tick({ if($job.State -in @('Completed','Failed','Stopped')){ $timer.Stop(); $o=Receive-Job $job -ErrorAction SilentlyContinue | Select-Object -Last 1; if($o.status -eq 'CONCLUIDA'){ $label.Text='ATUALIZAÇÃO CONCLUÍDA'+[Environment]::NewLine+'Base: versão '+$o.baseVersion } elseif($o.status -eq 'ATUALIZADA'){ $label.Text='BASE JÁ ATUALIZADA'+[Environment]::NewLine+'Nenhum novo arquivo Event3 foi encontrado.' } else { $label.Text='NÃO FOI POSSÍVEL ATUALIZAR'+[Environment]::NewLine+'A base atual foi preservada.' }; $close.Enabled=$true; Remove-Job $job -Force } })
$form.Add_Shown({$timer.Start()}); [void]$form.ShowDialog()
