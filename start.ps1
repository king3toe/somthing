if (Test-Path .server.pid) {
    Write-Host "Server may already be running. Run stop.ps1 first." -ForegroundColor Yellow
} else {
    Write-Host "Starting everyRoute in the background..."
    $process = Start-Process -FilePath "npm" -ArgumentList "run start" -WindowStyle Hidden -PassThru -RedirectStandardOutput "server.log" -RedirectStandardError "server.log"
    $process.Id | Out-File .server.pid -Encoding ascii
    Write-Host "Started successfully. Logs are being written to server.log" -ForegroundColor Green
}
