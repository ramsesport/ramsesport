# RamsesPort Wake Timer Setup
# Run this once as Administrator to wake your PC at 6:50am daily for the morning brief.

$taskName = "WakeForRamsesPortBrief"

# Remove existing task if present
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# Action: just a harmless echo (the wake itself is what matters)
$action = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c echo RamsesPort wake triggered"

# Trigger: daily at 6:50am
$trigger = New-ScheduledTaskTrigger -Daily -At "06:50AM"

# Settings: wake the computer to run this task
$settings = New-ScheduledTaskSettingsSet `
    -WakeToRun `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 2) `
    -StartWhenAvailable

# Run as SYSTEM so it works even if you're not logged in
$principal = New-ScheduledTaskPrincipal `
    -UserId "SYSTEM" `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Wakes PC at 6:50am SGT daily so the RamsesPort 7am morning brief can run" `
    -Force

Write-Host ""
Write-Host "SUCCESS: Wake timer '$taskName' created." -ForegroundColor Green
Write-Host "Your PC will wake at 6:50am every day for the morning brief." -ForegroundColor Green
Write-Host ""
Write-Host "NOTE: Also make sure 'Allow wake timers' is enabled in Windows Power Options:" -ForegroundColor Yellow
Write-Host "  Control Panel > Power Options > Change plan settings > Change advanced power settings" -ForegroundColor Yellow
Write-Host "  > Sleep > Allow wake timers > Set to 'Enable'" -ForegroundColor Yellow
