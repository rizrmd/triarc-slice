# Auto-push script for vg-server content updates
# Usage: .\auto-push-server.ps1
#
# SETUP: Pastikan SSH key sudah tersimpan di GitHub dan remote sudah SSH

# ============================================================================
# KONFIGURASI
# ============================================================================
$VG_SERVER_PATH = "D:\kerja\server\vg-server-master\vg-server-master"
$COMMIT_MESSAGE = "feat: sync content from editor"
# ============================================================================

Write-Host "Starting auto-push to vg-server..." -ForegroundColor Cyan

# Navigate to vg-server directory
Set-Location $VG_SERVER_PATH
Write-Host "Current directory: $(Get-Location)"

# Ensure remote is SSH
git remote set-url origin git@github.com:rizrmd/vg-server.git

# Add all changes
Write-Host "Adding changes..."
git add -A

# Check if there are changes to commit
$status = git status --porcelain
if ($status.Count -eq 0) {
    Write-Host "No changes to commit" -ForegroundColor Yellow
    exit 0
}

# Commit changes
Write-Host "Committing changes..."
git commit -m "$COMMIT_MESSAGE"

# Push to remote
Write-Host "Pushing to remote..."
git push origin master

if ($LASTEXITCODE -eq 0) {
    Write-Host "Successfully pushed to vg-server!" -ForegroundColor Green
} else {
    Write-Host "Push failed!" -ForegroundColor Red
    exit 1
}
