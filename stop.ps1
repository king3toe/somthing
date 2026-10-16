if (Test-Path .server.pid) {
    $pidToKill = Get-Content .server.pid
    Write-Host "Stopping everyRoute (PID: $pidToKill)..."
    Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
    Remove-Item .server.pid
    Write-Host "Server stopped." -ForegroundColor Green
} else {
    Write-Host "No running server found." -ForegroundColor Yellow
}
