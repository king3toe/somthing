#!/bin/bash
if [ -f .server.pid ]; then
    echo "Server may already be running with PID $(cat .server.pid). Run stop.sh first."
else
    echo "Starting everyRoute in the background..."
    npm run start > server.log 2>&1 &
    echo $! > .server.pid
    echo "Started successfully. Logs are being written to server.log"
fi
