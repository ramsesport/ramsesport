# RamsesPort GitHub Setup Script
# Run this ONCE as Administrator to connect your portfolio folder to GitHub

$token = "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"
$repoUrl = "https://${token}@github.com/ramsesport/ramsesport.git"
$folderPath = "C:\Users\yikhi\OneDrive\Documents\Claude\Projects\My portfolio"

Set-Location $folderPath

# Initialise git if not already done
if (-not (Test-Path ".git")) {
    git init
    Write-Host "Git initialised." -ForegroundColor Green
}

# Set identity
git config user.email "yikhin@gmail.com"
git config user.name "Ramses"

# Set remote
git remote remove origin 2>$null
git remote add origin $repoUrl
Write-Host "Remote set to github.com/ramsesport/ramsesport" -ForegroundColor Green

# Initial commit
git add .
git commit -m "Initial RamsesPort portfolio setup" 2>$null
git branch -M main
git push -u origin main --force

Write-Host ""
Write-Host "SUCCESS: Portfolio folder connected to GitHub." -ForegroundColor Green
Write-Host "From now on, run Push-ToGitHub.ps1 to push updates." -ForegroundColor Green
