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