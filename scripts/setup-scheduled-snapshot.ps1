$taskName = "SIRH-Snapshot-Completo"
$scriptPath = "C:\SIRH-NODE\backendSIRH\scripts\backup\snapshot_completo.js"
$nodePath = (Get-Command node).Source
$workDir = "C:\SIRH-NODE\backendSIRH"

# Delete existing task if present
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Output "Tarea existente eliminada: $taskName"
}

# Create the scheduled task action
$action = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$scriptPath`"" -WorkingDirectory $workDir

# Trigger: daily at 22:00 (10 PM)
$trigger = New-ScheduledTaskTrigger -Daily -At "22:00"

# Run as current user with highest privileges
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

# Settings
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)

# Register
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Snapshot completo SIRH Backend (MongoDB+MySQL+codigo) cifrado a E:\backup\"

Write-Output ""
Write-Output "============================================"
Write-Output "  Tarea PROGRAMADA CREADA: $taskName"
Write-Output "  Horario: Diario a las 22:00"
Write-Output "  Destino: E:\backup\"
Write-Output "  Contraseña: SiRh2o26!"
Write-Output "============================================"
Write-Output ""
Write-Output "Para ejecutar manualmente:"
Write-Output "  npm run snapshot"
Write-Output "  Start-ScheduledTask -TaskName '$taskName'"

# Ejecutar una vez ahora para verificar
Write-Output ""
Write-Output "Ejecutando tarea una vez para verificar..."
try {
  Start-ScheduledTask -TaskName $taskName
  Write-Output "Tarea iniciada correctamente."
} catch {
  Write-Output "No se pudo iniciar automaticamente. Ejecutar manualmente: npm run snapshot"
}
