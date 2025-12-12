#!/usr/bin/env bash
set -euo pipefail

# sudo docker swarm init --advertise-addr <your-ip>
# sudo ./scripts/deploy_prod.sh to start the swarm from the project root directory
# Inspect swarm status: sudo docker info | grep -A3 "Swarm"
# List swarm nodes:     sudo docker node ls
# List stack services:  sudo docker stack services distributed
# Same command as above: sudo docker service ls
# See a specific service: sudo docker service ps <service_name>
# View services logs: sudo docker service logs -f <service_name>
# View services details: sudo docker service inspect <service_name> --pretty
# Next two if you want to nuke it
# Stop the stack:       sudo docker stack rm distributed
# Leave swarm (reset):  sudo docker swarm leave --force
# If you leave the swarm you have to docker swarm init with your ip again

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
  echo "Loaded env vars from .env"
else
  echo "Warning: .env not found; export required env vars before deploying." >&2
fi

required_vars=(FINNHUB_API_KEY INFLUXDB_TOKEN INFLUXDB_ORG INFLUXDB_BUCKET GRAFANA_USER GRAFANA_PASSWORD)
missing=()
for v in "${required_vars[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    missing+=("$v")
  fi
done
if (( ${#missing[@]} )); then
  echo "Missing required env vars: ${missing[*]}" >&2
  exit 1
fi

if ! sudo docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null | grep -qi "active"; then
  echo "Docker Swarm is not active on this node. Run: sudo docker swarm init --advertise-addr <your-ip>" >&2
  exit 1
fi

echo "Stopping any dev compose stack to free ports..."
sudo docker compose down || true

sudo -E docker build -t distributed-backend:latest ./backend
sudo -E docker build -t distributed-frontend:latest ./frontend
sudo -E docker build -t distributed-finnhub:latest ./api

# If container dies replica will take over and swarm will spin up another one to replace it.
# Keeps same port.
sudo --preserve-env=FINNHUB_API_KEY,INFLUXDB_TOKEN,INFLUXDB_ORG,INFLUXDB_BUCKET,GRAFANA_USER,GRAFANA_PASSWORD,PRICE_POLL_INTERVAL,PRICE_SYMBOL,INFLUXDB_URL,INFLUXDB_USERNAME,INFLUXDB_PASSWORD docker stack deploy -c docker-stack.prod.yaml distributed

echo "Stack deployed. Services:"
sudo docker stack services distributed