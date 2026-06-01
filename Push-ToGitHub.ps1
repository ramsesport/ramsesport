# RamsesPort GitHub Push Script
# Claude calls this automatically after updating the dashboard file

$token = "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"
$repoUrl = "https://${token}@github.com/ramsesport/ramsesport.git"
$folderPath = "C:\Users\yikhi\OneDrive\Documents\Claude\Projects\My portfolio"

Set-Location $folderPath

# Update remote with token (in case it expired)
git remote set-url origin $repoUrl

# Stage, commit and push
$date = Get-Date -Format "yyyy-MM-dd HH:mm"
git add .
git commit -m "RamsesPort dashboard update — $date"
git push origin main

Write-Host ""
Write-Host "Pushed to github.com/ramsesport/ramsesport successfully." -ForegroundColor Green
