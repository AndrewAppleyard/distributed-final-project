# Trading Analysis Pipeline (Docker + Spark)

This repo contains a lightweight Spark cluster and a small set of services for experimenting with market data, including a Finnhub-backed quote fetcher and a demo backend/frontend.


## Finnhub Client
`api/api.py` exposes a small CLI via argparse.

Environment variables:
- `FINNHUB_API_KEY` (required) – your Finnhub key.
- `STOCK_SYMBOL` (optional) – default symbol if you don’t pass one; defaults to `NVDA`.

Run examples:
- One-off quote with an explicit symbol:  
  `docker compose run --rm finnhub-client TSLA`

Output is a single JSON line with the quote fields returned by Finnhub.