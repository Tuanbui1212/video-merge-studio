# Chạy frontend local (không Docker) — từ thư mục gốc repo
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root "frontend"
$Port = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { "3004" }

$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
    Write-Host "Frontend da chay tren port $Port (PID $($conn.OwningProcess))" -ForegroundColor Yellow
    Write-Host "Mo: http://localhost:$Port" -ForegroundColor Green
    exit 0
}

$envLocal = Join-Path $Frontend ".env.local"
if (-not (Test-Path $envLocal)) {
    $example = Join-Path $Frontend "env.local.example"
    if (Test-Path $example) {
        Copy-Item $example $envLocal
        Write-Host "Da tao frontend/.env.local tu env.local.example" -ForegroundColor Cyan
    }
}

Write-Host "Khoi dong Next.js tai http://localhost:$Port ..." -ForegroundColor Cyan
Write-Host "Backend can chay tai NEXT_PUBLIC_API_URL trong frontend/.env.local (mac dinh :8003)" -ForegroundColor Gray
Write-Host "Huong dan day du: README.md (muc Dev local)" -ForegroundColor Gray
Set-Location $Frontend
npm run dev -- --port $Port
