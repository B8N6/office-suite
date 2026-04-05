#!/bin/bash
# B8N6 Mail v2 — Production build script
# Builds React then embeds into Go binary

export PATH="/c/Users/mayuk/node:$PATH"

YLW='\033[1;33m'
GRN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YLW}Building B8N6 MAIL v2...${NC}"

# Build React
echo -e "${YLW}[1/2] Building React frontend...${NC}"
cd frontend
npm run build
if [ $? -ne 0 ]; then
  echo -e "${RED}Frontend build failed${NC}"; exit 1
fi
cd ..
echo -e "${GRN}Frontend built → frontend/dist/${NC}"

# Build Go binary
echo -e "${YLW}[2/2] Compiling Go backend...${NC}"
cd backend
go build -o ../b8n6mail-v2 .
if [ $? -ne 0 ]; then
  echo -e "${RED}Backend build failed${NC}"; exit 1
fi
cd ..
echo -e "${GRN}Backend compiled → b8n6mail-v2${NC}"

echo ""
echo -e "${GRN}Build complete!${NC}"
echo -e "Run: ${YLW}./b8n6mail-v2${NC}"
echo -e "Then open: ${YLW}http://localhost:8080${NC}"
