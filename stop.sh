#!/bin/bash

# Git Doc - Stop Script
# Stops both Next.js frontend and Rust backend

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${RED}🛑 Stopping Git Doc services...${NC}"

# Kill by saved PIDs
if [ -f .rust.pid ]; then
    kill -9 $(cat .rust.pid) 2>/dev/null && echo "   Stopped Rust service"
    rm .rust.pid
fi

if [ -f .next.pid ]; then
    kill -9 $(cat .next.pid) 2>/dev/null && echo "   Stopped Next.js"
    rm .next.pid
fi

# Kill by port (fallback)
lsof -ti:4000 | xargs kill -9 2>/dev/null || true
lsof -ti:8080 | xargs kill -9 2>/dev/null || true

# Kill by process name (fallback)
pkill -f "next dev" 2>/dev/null || true
pkill -f "git-doc-service" 2>/dev/null || true

echo -e "${GREEN}✅ All services stopped${NC}"
