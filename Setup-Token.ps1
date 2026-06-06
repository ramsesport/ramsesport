# Run this ONCE to store your GitHub PAT in Windows Credential Manager.
# After this, Push-ToGitHub.ps1 works without ever asking for a token again.
# When your token expires, just run this script again with the new token.

Write-Host "Ramsesport — GitHub Token Setup" -ForegroundColor Cyan
Write-Host "Generate a token at: github.com/settings/tokens (repo scope only)"
Write-Host ""

$secure = Read-Host "Paste your GitHub Personal Access Token" -AsSecureString
$token  = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
              [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

# Feed the credential directly into Git Credential Manager
"protocol=https`nhost=github.com`nusername=ramsesport`npassword=$token`n" |
    git credential approve

# Also set the helper globally so all git operations use it
git config --global credential.helper manager

Write-Host ""
Write-Host "✓  Token saved to Windows Credential Manager." -ForegroundColor Green
Write-Host "    Push-ToGitHub.ps1 will now work without any token input." -ForegroundColor Green
Write-Host ""
Write-Host "    Tip: delete the token from your clipboard now." -ForegroundColor Yellow
