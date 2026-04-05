#!/bin/bash
# B8N6 Mail v2 — Development runner
# Runs Go backend + React frontend concurrently

export PATH="/c/Users/mayuk/node:$PATH"

# Colors
GRN='\033[0;32m'
YLW='\033[1;33m'
NC='\033[0m'

echo -e "${YLW}B8N6 MAIL v2 — Dev Mode${NC}"
echo -e "${YLW}========================${NC}"

# Start Go backend
if command -v go &>/dev/null; then
  echo -e "${GRN}Starting Go backend on :8080...${NC}"
  cd backend && go run . &
  BACKEND_PID=$!
  cd ..
else
  echo -e "\033[0;31mGo not found. Backend will not start.${NC}"
  echo -e "\033[0;31mInstall Go: https://go.dev/dl/ then rerun this script.${NC}"
  BACKEND_PID=""
fi

# Start React frontend
echo -e "${GRN}Starting React frontend on :5173...${NC}"
cd frontend && npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo -e "${YLW}App:   http://localhost:5173${NC}"
echo -e "${YLW}API:   http://localhost:8080${NC}"
echo -e "${YLW}Admin: http://localhost:5173/admin${NC}"
echo ""
echo "Press Ctrl+C to stop all services"

# Cleanup on exit
trap "echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
