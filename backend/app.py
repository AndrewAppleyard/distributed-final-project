from flask import Flask, request, jsonify, render_template_string
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, when
from datetime import datetime
import requests, time, threading

app = Flask(__name__)

spark = (
    SparkSession.builder
    .appName("StockCRUD")
    .master("spark://spark-master:7077")
    .getOrCreate()
)

# Add timestamp + buy_value
portfolio = spark.createDataFrame(
    [],
    """
    symbol STRING,
    shares INT,
    buy_price DOUBLE,
    buy_time TIMESTAMP,
    buy_value DOUBLE
    """
)

# Background fetcher (optional)
def fetch_and_store():
    url = "finnhub-client:8001/quote"
    while True:
        try:
            data = requests.get(url).json()
            print("Fetched:", data)
        except Exception as e:
            print("Error:", e)
        time.sleep(5)

threading.Thread(target=fetch_and_store, daemon=True).start()

# --- CREATE ---
@app.route("/create", methods=["GET", "POST"])
def create_buy():
    global portfolio
    if request.method == "POST":
        symbol = request.form["symbol"].upper()
        shares = int(request.form["shares"])
        buy_price = float(request.form["buy_price"])

        buy_time = datetime.utcnow()
        buy_value = shares * buy_price

        new_row = [(symbol, shares, buy_price, buy_time, buy_value)]
        new_df = spark.createDataFrame(new_row, portfolio.schema)

        portfolio = portfolio.union(new_df)

        return render_template_string("""
            <h2>Buy Created!</h2>
            <p>Symbol: {{symbol}}</p>
            <p>Shares: {{shares}}</p>
            <p>Buy Price: {{buy_price}}</p>
            <p>Timestamp: {{buy_time}}</p>
            <a href="/create">Back to form</a>
        """, symbol=symbol, shares=shares, buy_price=buy_price, buy_time=buy_time)

    return render_template_string("""
        <h2>Create a Buy</h2>
        <form method="post">
            Symbol: <input type="text" name="symbol"><br>
            Shares: <input type="number" name="shares"><br>
            Buy Price: <input type="text" name="buy_price"><br>
            <input type="submit" value="Submit">
        </form>
    """)

@app.route("/")
def index():
    return "Backend is running! Try /read or /create"

# --- READ ---
@app.route("/read", methods=["GET"])
def read_portfolio():
    return jsonify([row.asDict() for row in portfolio.collect()])

# --- UPDATE ---
@app.route("/update", methods=["PUT"])
def update_buy():
    global portfolio
    payload = request.json

    portfolio = portfolio.withColumn(
        "buy_price",
        when(col("symbol") == payload["symbol"], payload["new_price"]).otherwise(col("buy_price"))
    )

    return jsonify({
        "status": "buy updated",
        "portfolio": [row.asDict() for row in portfolio.collect()]
    })

# --- DELETE (SELL) ---
@app.route("/delete", methods=["GET"])
def delete_form():
    return render_template_string("""
        <h2>Sell/Delete a Stock</h2>
        <form method="post" action="/delete">
            Symbol: <input type="text" name="symbol"><br>
            <input type="submit" value="Delete">
        </form>
    """)
@app.route("/delete", methods=["POST"])
def delete_buy_form():
    global portfolio
    symbol = request.form["symbol"]

    # Perform your delete logic here
    rows = portfolio.filter(col("symbol") == symbol).collect()
    if not rows:
        return f"<h3>Symbol {symbol} not found</h3>"

    buy_row = rows[0]
    quote = requests.get(f"http://172.17.0.1:8001/quote?symbol={symbol}").json()
    current_price = quote["price"]
    net_gain = (current_price - buy_row.buy_price) * buy_row.shares

    portfolio = portfolio.filter(col("symbol") != symbol)

    return render_template_string(f"""
        <h2>Stock Sold</h2>
        <p>Symbol: {symbol}</p>
        <p>Shares: {buy_row.shares}</p>
        <p>Buy Price: {buy_row.buy_price}</p>
        <p>Current Price: {current_price}</p>
        <p><b>Net Gain: {net_gain}</b></p>
        <a href="/delete">Back</a>
    """)
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=4000)
