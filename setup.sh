#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "  ██████╗ ███████╗██████╗  █████╗  ██████╗████████╗"
echo "  ██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝╚══██╔══╝"
echo "  ██████╔╝█████╗  ██║  ██║███████║██║        ██║   "
echo "  ██╔══██╗██╔══╝  ██║  ██║██╔══██║██║        ██║   "
echo "  ██║  ██║███████╗██████╔╝██║  ██║╚██████╗   ██║   "
echo "  ╚═╝  ╚═╝╚══════╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝   ╚═╝   "
echo ""

# --- Prerequisites ---
command -v docker >/dev/null 2>&1 || error "Docker is not installed. See https://docs.docker.com/get-docker/"
command -v git >/dev/null 2>&1    || error "Git is not installed."

docker info >/dev/null 2>&1 || error "Docker daemon is not running. Start Docker and try again."

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif docker-compose version >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  error "Docker Compose is not installed."
fi

info "Prerequisites OK (docker, git, compose)"

# --- Port checks ---
PORTS=(80 3000 5432 6379 8000)
for port in "${PORTS[@]}"; do
  if lsof -i :"$port" -sTCP:LISTEN >/dev/null 2>&1 || ss -tlnp 2>/dev/null | grep -q ":$port "; then
    error "Port $port is already in use. Free it and try again."
  fi
done
info "Required ports available (${PORTS[*]})"

# --- .env ---
if [ ! -f .env ]; then
  cp .env.example .env
  SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n')
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/change-me-to-a-random-string/$SECRET/" .env
  else
    sed -i "s/change-me-to-a-random-string/$SECRET/" .env
  fi
  info "Created .env with generated SESSION_SECRET_KEY"
else
  info ".env already exists — skipping"
fi

# --- Build & start ---
warn "Building containers (first run may take a few minutes)..."
$COMPOSE up -d --build

# --- Wait for backend ---
echo -n "Waiting for backend "
for i in $(seq 1 60); do
  if curl -sf http://localhost:8000/health >/dev/null 2>&1; then
    echo ""
    info "Backend is healthy"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo ""
    warn "Backend didn't respond in 60s. Check logs: $COMPOSE logs backend"
  fi
  echo -n "."
  sleep 2
done

echo ""
info "Redact is running!"
echo ""
echo "  Dashboard:  http://localhost:3000"
echo "  API:        http://localhost:8000"
echo "  API docs:   http://localhost:8000/docs"
echo ""
echo "  Stop:       $COMPOSE down"
echo "  Logs:       $COMPOSE logs -f"
echo ""
