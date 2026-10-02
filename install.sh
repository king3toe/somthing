#!/bin/bash
echo "======================================"
echo "    everyRoute - Auto Installer       "
echo "======================================"

echo "[1/4] Checking Node.js installation..."
if ! command -v node &> /dev/null
then
    echo "Node.js could not be found. Please install Node.js v18 or higher."
    return 1 2>/dev/null
fi

echo "[2/4] Installing dependencies..."
npm install

echo "[3/4] Compiling TypeScript..."
npm run build

echo "[4/4] Starting the server..."
echo "everyRoute is now built! Run 'npm run start' to launch!"
