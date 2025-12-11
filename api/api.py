import finnhub
import os
import argparse
import json
from dotenv import load_dotenv
load_dotenv()
API_KEY = os.environ.get("FINNHUB_API_KEY") or "YOUR_API_KEY_HERE"
stock = "NVDA"

client = finnhub.Client(api_key=API_KEY)

def get_quote(symbol=stock):
    try:
        quote = client.quote(symbol)
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
        return {"symbol": symbol.upper(), "error": str(e)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch or stream Finnhub quotes.")
    parser.add_argument(
        "stock",
        nargs="?",
        default=os.environ.get("STOCK_SYMBOL", stock),
        help=f"Stock symbol to query (default env STOCK_SYMBOL or {stock})",
    )
    args = parser.parse_args()

    symbol = args.stock.upper()

    print(json.dumps(get_quote(symbol)))
