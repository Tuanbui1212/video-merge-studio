# Kiểm tra luồng Backend từ đầu
$ErrorActionPreference = "Stop"
$Base = "http://localhost:8003"
$V6 = Join-Path $PSScriptRoot "..\video\test6.mp4"
$V7 = Join-Path $PSScriptRoot "..\video\test7.mp4"
$MergeJson = Join-Path $env:TEMP "merge-body.json"
$mergeTimeout = 1800

function Step($n, $title) { Write-Host "`n=== [BE-$n] $title ===" -ForegroundColor Cyan }
function Invoke-CurlJson($curlArgs) {
  $out = & curl.exe -s -m 120 @curlArgs 2>&1
  if ($LASTEXITCODE -ne 0) { throw "curl failed: $out" }
  return $out
}

Step 1 "GET /health"
for ($try = 1; $try -le 12; $try++) {
  try {
    $h = Invoke-CurlJson @("-m", "5", "$Base/health")
    Write-Host $h
    if ($h -match 'ok') { break }
  } catch {
    if ($try -eq 12) { throw }
    Write-Host "  waiting backend/db... ($try/12)" -ForegroundColor Yellow
    Start-Sleep -Seconds 5
  }
}

Step 2 "GET /tasks (empty)"
Write-Host (Invoke-CurlJson @("$Base/tasks"))

Step 3 "POST /upload test6.mp4"
$up6 = Invoke-CurlJson @("-X", "POST", "$Base/upload", "-F", "file=@$V6") | ConvertFrom-Json
Write-Host ($up6 | ConvertTo-Json -Compress)
$id6 = $up6.id

Step 4 "POST /upload test7.mp4"
$up7 = Invoke-CurlJson @("-X", "POST", "$Base/upload", "-F", "file=@$V7") | ConvertFrom-Json
Write-Host ($up7 | ConvertTo-Json -Compress)
$id7 = $up7.id

Step 5 "POST /tasks"
'{"video_ids":[' + $id6 + ',' + $id7 + ']}' | Set-Content -Path $MergeJson -Encoding ascii -NoNewline
$task = Invoke-CurlJson @("-X", "POST", "$Base/tasks", "-H", "Content-Type: application/json", "--data-binary", "@$MergeJson") | ConvertFrom-Json
Write-Host ($task | ConvertTo-Json -Compress)
$taskId = $task.id

Step 6 "POST /tasks/{id}/merge"
Write-Host (Invoke-CurlJson @("-m", "30", "-X", "POST", "$Base/tasks/$taskId/merge"))

Step 6 "Poll task + outputs (FFmpeg có thể block API tạm thời)"
$root = Split-Path (Split-Path $PSScriptRoot)
$outDir = Join-Path $root "outputs"
for ($i = 1; $i -le 180; $i++) {
  $files = @(Get-ChildItem $outDir -File -EA SilentlyContinue)
  if ($files.Count -gt 0) {
    Write-Host "  [$i] Output file: $($files[0].Name) ($([math]::Round($files[0].Length/1MB,1)) MB)" -ForegroundColor Green
    break
  }
  try {
    $task = Invoke-CurlJson @("-m", "5", "$Base/tasks/$taskId") | ConvertFrom-Json
    $pct = if ($task.progress) { [math]::Round($task.progress.percent, 1) } else { 0 }
    Write-Host "  [$i] status=$($task.status) percent=$pct"
    if ($task.status -eq "completed") { break }
    if ($task.status -eq "failed") { throw "Merge failed: $($task.error_message)" }
  } catch {
    Write-Host "  [$i] API timeout (FFmpeg đang chạy)..." -ForegroundColor Yellow
  }
  Start-Sleep -Seconds 5
}

Step 7 "GET /tasks final"
Start-Sleep 2
Write-Host (Invoke-CurlJson @("-m", "30", "$Base/tasks"))

Step 8 "GET /videos/{id}/stream (range)"
$code = & curl.exe -s -o NUL -w "%{http_code}" -m 15 -H "Range: bytes=0-1023" "$Base/videos/$id6/stream"
Write-Host "stream test6: HTTP $code"
$finalTask = Invoke-CurlJson @("-m", "30", "$Base/tasks/$taskId") | ConvertFrom-Json
if ($finalTask.output_filename) {
  $code2 = & curl.exe -s -o NUL -w "%{http_code}" -m 15 "$Base/download/$($finalTask.output_filename)?inline=true"
  Write-Host "download merged: HTTP $code2 - $($finalTask.output_filename)"
} else {
  Write-Host "download merged: skipped (no output_filename yet)" -ForegroundColor Yellow
}

Write-Host "`n=== BE TEST DONE ===" -ForegroundColor Green
