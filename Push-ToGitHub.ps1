# RamsesPort GitHub Push Script
# Token stored in Windows Credential Manager — no secrets in this file
# Run Setup-Token.ps1 once to configure, then this script works forever.

$repoUrl   = "https://github.com/ramsesport/ramsesport.git"
$localPath = "C:\Users\yikhi\OneDrive\Documents\Claude\Projects\My portfolio"

Set-Location $localPath

# Use Windows Credential Manager (never embed tokens in URLs)
git config credential.helper manager
git remote set-url origin $repoUrl

# Stage all changes, commit with timestamp, push
$date = Get-Date -Format "yyyy-MM-dd HH:mm"
git add .
git commit -m "RamsesPort dashboard update — $date"
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓  Pushed to github.com/ramsesport/ramsesport" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "✗  Push failed. Run Setup-Token.ps1 to refresh your credentials." -ForegroundColor Red
}
