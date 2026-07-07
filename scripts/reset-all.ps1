# Reset Video Studio Pro về trạng thái mới tinh
# - Xóa database (tasks, video đã upload trong DB)
# - Xóa file trong uploads/ và outputs/
# - Khởi động lại containers

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "=== Video Studio Pro - Reset toan bo du lieu ===" -ForegroundColor Cyan
Write-Host "Thu muc: $Root"
Write-Host ""

# 1. Dung containers + xoa volume PostgreSQL
Write-Host "[1/5] Dung Docker va xoa database (volume postgres_data)..." -ForegroundColor Yellow
docker compose --env-file .env down -v
if ($LASTEXITCODE -ne 0) { throw "docker compose down failed" }

# 2. Xoa file upload
Write-Host "[2/5] Xoa file trong uploads/..." -ForegroundColor Yellow
$uploads = Join-Path $Root "uploads"
if (-not (Test-Path $uploads)) { New-Item -ItemType Directory -Path $uploads | Out-Null }
Get-ChildItem $uploads -File -ErrorAction SilentlyContinue | Remove-Item -Force

# 3. Xoa file output
Write-Host "[3/5] Xoa file trong outputs/..." -ForegroundColor Yellow
$outputs = Join-Path $Root "outputs"
if (-not (Test-Path $outputs)) { New-Item -ItemType Directory -Path $outputs | Out-Null }
Get-ChildItem $outputs -File -ErrorAction SilentlyContinue | Remove-Item -Force

# 4. Xoa file preview
Write-Host "[4/5] Xoa file trong previews/..." -ForegroundColor Yellow
$previews = Join-Path $Root "previews"
if (-not (Test-Path $previews)) { New-Item -ItemType Directory -Path $previews | Out-Null }
Get-ChildItem $previews -File -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force

# 5. Khoi dong lai
Write-Host "[5/5] Khoi dong lai services..." -ForegroundColor Yellow
docker compose --env-file .env up -d --build

Write-Host ""
Write-Host "=== Xong! ===" -ForegroundColor Green
Write-Host "- Database: trong - tasks va ban ghi video"
Write-Host "- uploads/: trong"
Write-Host "- outputs/: trong"
Write-Host "- previews/: trong"
Write-Host ""
Write-Host "Trinh duyet: F12 -> Application -> Local Storage -> Clear, roi Ctrl+Shift+R" -ForegroundColor Gray
Write-Host "Huong dan day du: README.md" -ForegroundColor Gray
