#!/usr/bin/env bash
set -euo pipefail

# sudo docker swarm init --advertise-addr <your-ip>
# Inspect swarm status: sudo docker info | grep -A3 "Swarm"
# List swarm nodes:     sudo docker node ls
# List stack services:  sudo docker stack services distributed
# Stop the stack:       sudo docker stack rm distributed
# Leave swarm (reset):  sudo docker swarm leave --force
# If you leave the swarm you have to docker swarm init with your ip again

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! sudo docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null | grep -qi "active"; then
  echo "Docker Swarm is not active on this node. Run: sudo docker swarm init --advertise-addr <your-ip>" >&2
  exit 1
fi

sudo docker compose -f docker-compose.yaml build backend frontend

# If container dies replica will take over and swarm will spin up another one to replace it.
# Keeps same port.
sudo docker stack deploy -c docker-stack.prod.yaml distributed

echo "Stack deployed. Services:"
sudo docker stack services distributed