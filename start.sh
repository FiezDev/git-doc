#!/bin/bash

# Git Doc - Start Script
# Starts both Next.js frontend and Rust backend

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Source Rust/Cargo environment if available
if [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}   Git Doc - Starting Services${NC}"
echo -e "${BLUE}======================================${NC}"

# Kill old processes
echo -e "\n${YELLOW}🔪 Killing old processes...${NC}"

# Kill Next.js (port 4000)
if lsof -ti:4000 > /dev/null 2>&1; then
    echo -e "   Killing process on port 4000 (Next.js)..."
    kill -9 $(lsof -ti:4000) 2>/dev/null || true
fi

# Kill Rust service (port 8080)
if lsof -ti:8080 > /dev/null 2>&1; then
    echo -e "   Killing process on port 8080 (Rust)..."
    kill -9 $(lsof -ti:8080) 2>/dev/null || true
fi

# Kill any existing node processes for this project
pkill -f "next dev" 2>/dev/null || true
pkill -f "git-doc-service" 2>/dev/null || true

sleep 1
echo -e "${GREEN}   ✓ Old processes killed${NC}"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "\n${YELLOW}📦 Installing Node dependencies...${NC}"
    bun install
fi

# Check if Prisma client is generated
echo -e "\n${YELLOW}🗄️  Generating Prisma client...${NC}"
bun db:generate

# Build Rust service if needed
RUST_BINARY="rust-service/target/release/git-doc-service"
if [ ! -f "$RUST_BINARY" ]; then
    echo -e "\n${YELLOW}🦀 Building Rust service (first time, may take a while)...${NC}"
    cd rust-service
    cargo build --release
    cd ..
else
    echo -e "\n${GREEN}🦀 Rust binary exists${NC}"
fi

# Create logs directory
mkdir -p logs

# Start Rust backend (output to separate file)
echo -e "\n${YELLOW}🚀 Starting Rust backend (port 8080)...${NC}"
./rust-service/target/release/git-doc-service >> logs/rust-app.log 2>&1 &
RUST_PID=$!
echo -e "${GREEN}   ✓ Rust backend started (PID: $RUST_PID)${NC}"

# Wait for Rust to be ready
echo -e "   Waiting for Rust service to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:8080/health > /dev/null 2>&1; then
        echo -e "${GREEN}   ✓ Rust service is ready${NC}"
        break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
        echo -e "${YELLOW}   ⚠ Rust service may still be starting...${NC}"
    fi
done

# Start Next.js frontend
echo -e "\n${YELLOW}🌐 Starting Next.js frontend (port 4000)...${NC}"
bun dev -p 4000 > logs/next.log 2>&1 &
NEXT_PID=$!
echo -e "${GREEN}   ✓ Next.js started (PID: $NEXT_PID)${NC}"

# Wait for Next.js to be ready
echo -e "   Waiting for Next.js to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:4000 > /dev/null 2>&1; then
        echo -e "${GREEN}   ✓ Next.js is ready${NC}"
        break
    fi
    sleep 1
done

# Save PIDs for stop script
echo "$RUST_PID" > .rust.pid
echo "$NEXT_PID" > .next.pid

echo -e "\n${GREEN}======================================${NC}"
echo -e "${GREEN}   ✅ All services started!${NC}"
echo -e "${GREEN}======================================${NC}"
echo -e "\n${BLUE}Frontend:${NC} http://localhost:4000"
echo -e "${BLUE}Backend:${NC}  http://localhost:8080"
echo -e "\n${YELLOW}Logs:${NC}"
echo -e "  - Next.js: tail -f logs/next.log"
echo -e "  - Rust:    tail -f logs/rust-app.log"
echo -e "\n${YELLOW}To stop:${NC} ./stop.sh or press Ctrl+C"
echo ""

# Keep script running and forward signals
trap "echo -e '\n${RED}Stopping services...${NC}'; kill $RUST_PID $NEXT_PID 2>/dev/null; exit 0" SIGINT SIGTERM

# Wait for both processes
wait
