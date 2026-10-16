#!/bin/bash
if [ -f .server.pid ]; then
    PID=$(cat .server.pid)
    echo "Stopping everyRoute (PID: $PID)..."
    kill $PID 2>/dev/null || true
    rm .server.pid
    echo "Server stopped."
else
    echo "No running server found."
fi
