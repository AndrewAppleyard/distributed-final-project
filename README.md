# Trading Analysis Pipeline (Docker + Spark)

This project runs a small Spark cluster plus three app services:
- **backend** – FastAPI CRUD + quote caching, talks to Spark and InfluxDB, port `4000`.
- **finnhub-client** – Lightweight FastAPI proxy to Finnhub quotes, port `8001`.
- **frontend** – Serves a single page that embeds the Grafana dashboard, port `8800`.
- **Observability** – InfluxDB (`8086`) for time-series storage and Grafana (`3000`) with pre-provisioned datasource + dashboard.
- **Spark** – master (`7077`, UI `8080`) and two workers (UIs `8081`, `8082`) sharing volumes.

## Prerequisites
- Docker + Docker Compose installed.
- Create a root `.env` with at least:
  - `FINNHUB_API_KEY`
  - `INFLUXDB_TOKEN`, `INFLUXDB_USERNAME`, `INFLUXDB_PASSWORD`, `INFLUXDB_ORG`, `INFLUXDB_BUCKET`
  - Optional: `GRAFANA_USER`, `GRAFANA_PASSWORD` (defaults to admin/admin), `GRAFANA_URL` for the embed, `PRICE_SYMBOLS`, `PRICE_POLL_INTERVAL`.
- Free ports: 3000, 4000, 7077, 8001, 8080, 8081, 8082, 8086, 8800, 35000, 35001.

## How to Run (Compose)
- Start everything: `docker compose up --build`
- Stop: `docker compose down`
- Rebuild one service (example backend): `docker compose build backend`
- Backend Swagger UI: `http://localhost:4000/docs`
- Frontend (Grafana embed): `http://localhost:8800`
- Grafana UI: `http://localhost:3000` (defaults admin/admin unless overridden).

## Optional: Docker Swarm
- Init: `sudo docker swarm init --advertise-addr <your-ip>`
- Deploy: `sudo --preserve-env docker stack deploy -c docker-stack.prod.yaml distributed`
- Inspect: `sudo docker stack services distributed` (or `sudo docker service ls`)
- Logs: `sudo docker service logs -f <service_name>`
- Remove: `sudo docker stack rm distributed`; leave swarm: `sudo docker swarm leave --force`
- Helper script loads `.env` then deploys: `sudo ./scripts/deploy_prod.sh`

## Backend API (FastAPI on :4000)
- `GET /health` – liveness
- `GET /portfolio` – list all trades
- `GET /balance` – current simulated cash
- `POST /trades` – create (body e.g. `{"symbol":"AAPL","shares":5,"buy_price":180}`)
- `PUT /trades/{symbol}` – adjust price/shares (e.g. `{"new_price":185,"delta_shares":1,"current_price":190}`)
- `DELETE /trades/{symbol}` – delete/sell; optional `{"sale_price":190}` to credit balance and compute net gain
- `GET /quote/{symbol}` – fetch latest quote via finnhub-client; returns 502 if upstream fails
- `GET /cache` – view in-memory price cache (refreshed every 5s for tracked symbols; re-populates after trades are created/updated)
- Price polling: when `PRICE_SYMBOLS` and `INFLUXDB_TOKEN` are set, the backend polls those symbols every `PRICE_POLL_INTERVAL` seconds and writes to InfluxDB (`prices` measurement).

## Finnhub Client (FastAPI on :8001)
- `GET /health` – service health
- `GET /quote` – default symbol from `STOCK_SYMBOL` (defaults to NVDA)
- `GET /quote/{symbol}` – quote for specific symbol
- Requires `FINNHUB_API_KEY`.

## Frontend
- Serves a minimal page that embeds Grafana. Configure `GRAFANA_URL` (defaults to `http://localhost:3000/d/af6vza09jsbggd`) to point to your Grafana dashboard URL.

## Grafana & InfluxDB
- Datasource is provisioned at startup with UID `af6w3lxl7pnuoa`, pointing to InfluxDB at `http://influxdb:8086`, using env `INFLUXDB_ORG`, `INFLUXDB_BUCKET`, and `INFLUXDB_TOKEN`.
- Dashboard JSON `grafana/dashboards/stock_candles.json` is preloaded with UID `af6vza09jsbggd`. If you change UIDs, update both the datasource file and dashboard JSON.
- InfluxDB admin is initialized from `.env` values; ensure the token meets InfluxDB length rules (8–72 chars).

## Spark Notes
- Master URL: `spark://spark-master:7077`
- Workers (compose) are capped at `SPARK_WORKER_CORES=2`, `SPARK_WORKER_MEMORY=2g`.
- Backend submits Spark jobs using `SparkSession.builder.master("spark://spark-master:7077")` with driver ports 35000/35001 exposed in compose/stack.
