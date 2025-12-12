# Trading Analysis Pipeline (Docker + Spark)

This repo contains a lightweight Spark cluster and a small set of services for experimenting with market data, including a Finnhub-backed FastAPI service and a demo backend/frontend.


## Finnhub FastAPI Service
`api/api.py` exposes a FastAPI app that fetches quotes from Finnhub.

Environment variables:
- `FINNHUB_API_KEY` (required) – your Finnhub key.
- `STOCK_SYMBOL` (optional) – default symbol when hitting `/quote`; defaults to `NVDA`.

Build and run:
- `FINNHUB_API_KEY=... docker compose up --build finnhub-client`

Endpoints (served on port `8001` by default):
- `GET /health` — simple health check.
- `GET /quote` — returns the default symbol’s quote (uses `STOCK_SYMBOL` or `NVDA`).
- `GET /quote/{symbol}` — returns the latest quote for the provided symbol (e.g., `/quote/AAPL`).

Example curl:
- `curl http://localhost:8001/quote/AAPL`

Output is a JSON payload with the latest quote fields returned by Finnhub.

## Backend Trading API (FastAPI)
`backend/app.py` exposes a Spark-backed FastAPI service for mock trades.

Build and run:
- `docker compose up --build backend` (backend listens on port `4000`)
- Swagger UI: `http://localhost:4000/docs`

Endpoints:
- `GET /health` — health check.
- `GET /portfolio` — list all trades (JSON array).
- `POST /trades` — create a trade. Body: `{"symbol":"AAPL","shares":10,"buy_price":150.5}`.
- `PUT /trades/{symbol}` — update buy price. Body: `{"new_price":155.0}` (404 if symbol not present).
- `DELETE /trades/{symbol}` — delete/sell a trade; returns net gain if quote available.

Examples:
- Create: `curl -X POST http://localhost:4000/trades -H "Content-Type: application/json" -d '{"symbol":"AAPL","shares":5,"buy_price":180}'`
- Update: `curl -X PUT http://localhost:4000/trades/AAPL -H "Content-Type: application/json" -d '{"new_price":185}'`
- Delete: `curl -X DELETE http://localhost:4000/trades/AAPL`
