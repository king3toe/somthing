Write-Host "======================================"
Write-Host "    everyRoute - Auto Installer       "
Write-Host "======================================"

Write-Host "[1/4] Checking Node.js installation..."
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js could not be found. Please install Node.js v18 or higher from https://nodejs.org/" -ForegroundColor Red
    Return
}

Write-Host "[2/4] Installing dependencies..."
npm install

Write-Host "[3/4] Compiling TypeScript..."
npm run build

Write-Host "[4/4] Starting the server..."
Write-Host "everyRoute is now built! Run 'npm run start' to launch!" -ForegroundColor Green
