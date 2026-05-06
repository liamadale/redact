#!/bin/sh
set -e

# Wait for backend (host network — hit localhost directly)
echo "Waiting for services to start..."
for i in $(seq 1 60); do
  if wget -qO- http://localhost:8000/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

# Detect host IP (first non-loopback IPv4 address)
HOST_IP=$(ip -4 addr show scope global | awk '/inet / {split($2,a,"/"); print a[1]; exit}')

cat <<EOF

  ██████╗ ███████╗██████╗  █████╗  ██████╗████████╗
  ██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝╚══██╔══╝
  ██████╔╝█████╗  ██║  ██║███████║██║        ██║
  ██╔══██╗██╔══╝  ██║  ██║██╔══██║██║        ██║
  ██║  ██║███████╗██████╔╝██║  ██║╚██████╗   ██║
  ╚═╝  ╚═╝╚══════╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝   ╚═╝

  Git Secrets Auditor — All services running ✓

  ┌─────────────────────────────────────────────────┐
  │  Dashboard:   http://localhost:3000              │
  │              http://${HOST_IP}:3000              │
  │                                                 │
  │  API:         http://localhost:8000              │
  │              http://${HOST_IP}:8000              │
  │                                                 │
  │  API Docs:    http://localhost:8000/docs         │
  │              http://${HOST_IP}:8000/docs         │
  │                                                 │
  │  Nginx:       http://localhost:80                │
  │              http://${HOST_IP}:80                │
  └─────────────────────────────────────────────────┘

  Stop:   docker compose down
  Logs:   docker compose logs -f

EOF

# Keep container alive briefly so the message is visible in logs
sleep infinity
