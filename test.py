import finnhub
import os
import time

# --------------------------------------------
# CONFIGURATION
# --------------------------------------------
API_KEY = os.environ.get("FINNHUB_API_KEY") or "YOUR_API_KEY_HERE"
stock = "NVDA"

# Create Finnhub client
client = finnhub.Client(api_key=API_KEY)

# --------------------------------------------
# Test a real-time quote
# --------------------------------------------
def get_quote(symbol=stock):
    try:
        quote = client.quote(symbol)
        print(f"\n=== Real-Time Quote for {symbol} ===")
        print(f"Current Price:    {quote['c']}")
        print(f"High Today:       {quote['h']}")
        print(f"Low Today:        {quote['l']}")
        print(f"Open Price:       {quote['o']}")
        print(f"Previous Close:   {quote['pc']}")
        print(f"Time (epoch):     {quote['t']}")
    except Exception as e:
        print("Error:", e)


# --------------------------------------------
# Optional: Stream quotes every few seconds
# --------------------------------------------
def stream_quotes(symbol=stock, interval=5):
    print(f"\nStreaming quotes for {symbol} every {interval} seconds...")
    while True:
        get_quote(symbol)
        time.sleep(interval)


if __name__ == "__main__":
    stream_quotes(stock)  # One-time call
    # stream_quotes("AAPL", interval=3)  # Uncomment for live stream
