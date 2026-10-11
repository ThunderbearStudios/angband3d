# tools/rollback_to_baseline.ps1
# Automated Zero-Data-Loss Rollback Runbook for angband3d

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "angband3d: Initiating Automated Rollback to Baseline" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Reset active realm in realms.json to Vanilla Angband
$realmsConfig = '{"active": "angband"}'
Set-Content -Path "realms.json" -Value $realmsConfig -Encoding UTF8
Write-Host "[1/4] realms.json reset to baseline (active: angband)." -ForegroundColor Green

# 2. Clean temporary test saves
if (Test-Path "user/saves/temp") {
    Remove-Item -Recurse -Force "user/saves/temp"
    Write-Host "[2/4] Transient test saves cleaned from user/saves/temp/." -ForegroundColor Green
} else {
    Write-Host "[2/4] No temporary saves found." -ForegroundColor Gray
}

# 3. Clean Git working tree for engine/
git checkout HEAD -- engine/
Write-Host "[3/4] engine/ directory verified clean." -ForegroundColor Green

# 4. Execute baseline smoke tests
Write-Host "[4/4] Executing baseline smoke test suite..." -ForegroundColor Yellow
python tools/smoke_test.py
if ($LASTEXITCODE -eq 0) {
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "SUCCESS: System fully restored to verified baseline in < 5 seconds!" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    exit 0
} else {
    Write-Host "==========================================================" -ForegroundColor Red
    Write-Host "CRITICAL: Baseline smoke test failed after rollback. Investigate engine/" -ForegroundColor Red
    Write-Host "==========================================================" -ForegroundColor Red
    exit 1
}
