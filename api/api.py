import os
import finnhub
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException

load_dotenv()

API_KEY = os.environ.get("FINNHUB_API_KEY") or "YOUR_API_KEY_HERE"
DEFAULT_STOCK = os.environ.get("STOCK_SYMBOL", "NVDA")

client = finnhub.Client(api_key=API_KEY)

app = FastAPI(title="Trading Analytics API", version="0.1.0")


def get_quote(symbol: str):
    try:
        quote = client.quote(symbol)
        if not quote or quote.get("c") is None:
            raise ValueError("No quote data returned")

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
