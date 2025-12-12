import os
import time
from typing import Dict, Any

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException

load_dotenv()

API_KEY = os.environ.get("FINNHUB_API_KEY") or "YOUR_API_KEY_HERE"
DEFAULT_STOCK = os.environ.get("STOCK_SYMBOL", "AAPL")
FINNHUB_BASE_URL = os.environ.get("FINNHUB_BASE_URL", "https://finnhub.io/api/v1")
REQUEST_TIMEOUT = int(os.environ.get("FINNHUB_TIMEOUT", "15"))
REQUEST_RETRIES = int(os.environ.get("FINNHUB_RETRIES", "2"))

app = FastAPI(title="Trading Analytics API", version="0.1.0")


def fetch_quote_from_finnhub(symbol):
    params = {"symbol": symbol, "token": API_KEY}
    last_error: Exception | None = None
    for attempt in range(REQUEST_RETRIES + 1):
        try:
            resp = requests.get(f"{FINNHUB_BASE_URL}/quote", params=params, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            if not data or data.get("c") is None:
                raise ValueError("No quote data returned")
            return data
        except Exception as exc:
            last_error = exc
            if attempt < REQUEST_RETRIES:
                time.sleep(1)
            else:
                raise
    raise last_error if last_error else RuntimeError("Unknown Finnhub error")


def get_quote(symbol):
    try:
        quote = fetch_quote_from_finnhub(symbol)
        return {
            "symbol": symbol.upper(),
            "current": quote.get("c"),
            "change": quote.get("d"),
            "percent_change": quote.get("dp"),
            "high": quote.get("h"),
            "low": quote.get("l"),
            "open": quote.get("o"),
            "prev_close": quote.get("pc"),
            "timestamp": quote.get("t"),
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Finnhub error: {e}")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/quote/{symbol}")
def quote(symbol: str):
    """
    Get the latest quote for a given symbol.
    Example: GET /quote/NVDA
    """
    return get_quote(symbol)


@app.get("/quote")
def quote_default():
    """
    Get the quote for the default symbol (env STOCK_SYMBOL or NVDA).
    Example: GET /quote
    """
    return get_quote(DEFAULT_STOCK)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api:app", host="0.0.0.0", port=8001, reload=True)
