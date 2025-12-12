import os
import threading
import time
from datetime import datetime
from typing import Optional, List, Dict, Optional as Opt, Set

import base64
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS
from pydantic import BaseModel, Field, validator
from fastapi.responses import Response
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, when
from pyspark.sql.types import (
    StructField,
    StructType,
    StringType,
    IntegerType,
    DoubleType,
    TimestampType,
)

SPARK_MASTER_URL = os.environ.get("SPARK_MASTER_URL", "spark://spark-master:7077")
API_URL = os.environ.get("API_URL", "http://finnhub-client:8001/quote")
INFLUX_URL = os.environ.get("INFLUXDB_URL", "http://influxdb:8086")
INFLUX_TOKEN = os.environ.get("INFLUXDB_TOKEN") or os.environ.get(
    "INFLUXDB_ADMIN_TOKEN", "local-token"
)
INFLUX_ORG = os.environ.get("INFLUXDB_ORG", "trading")
INFLUX_BUCKET = os.environ.get("INFLUXDB_BUCKET", "user_data")
PRICE_SYMBOLS = os.environ.get("PRICE_SYMBOLS", "AAPL")
PRICE_POLL_INTERVAL = int(os.environ.get("PRICE_POLL_INTERVAL", "5"))
latest_prices: List[Dict] = []
last_price_write_error: Opt[str] = None
last_price_write_time: Opt[datetime] = None
START_BALANCE = float(os.environ.get("START_BALANCE", 3000))

spark = (
    SparkSession.builder
    .appName("StockCRUD")
    .master("spark://spark-master:7077")
    .config("spark.driver.bindAddress", "0.0.0.0")
    .config("spark.driver.host", "backend")
    .config("spark.driver.port", "35000")
    .config("spark.blockManager.port", "35001")
    .getOrCreate()
)


portfolio_schema = StructType(
    [
        StructField("symbol", StringType(), True),
        StructField("shares", DoubleType(), True),
        StructField("buy_price", DoubleType(), True),
        StructField("buy_time", TimestampType(), True),
        StructField("buy_value", DoubleType(), True),
    ]
)
portfolio = spark.createDataFrame([], schema=portfolio_schema)

app = FastAPI(title="Backend", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
price_cache: Dict[str, Optional[float]] = {}
symbol_set: Set[str] = set()
cache_lock = threading.Lock()
balance_lock = threading.Lock()
balance_amount: float = START_BALANCE
FAVICON_PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAADElEQVR42mP8/58BAwAI/AL+fS5mAAAAAElFTkSuQmCC")

influx_client = None
write_api = None
if INFLUX_TOKEN:
    try:
        influx_client = InfluxDBClient(
            url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG, timeout=5_000
        )
        write_api = influx_client.write_api(write_options=SYNCHRONOUS)
    except Exception:
        influx_client = None
        write_api = None

class TradeCreate(BaseModel):
    symbol: str = Field(..., min_length=1)
    shares: float = Field(..., gt=0)
    buy_price: float = Field(..., gt=0)

    @validator("symbol")
    def upper_symbol(cls, v):
        return v.upper()


class TradeUpdate(BaseModel):
    new_price: Optional[float] = Field(None, gt=0)
    delta_shares: Optional[float] = None
    current_price: Optional[float] = Field(None, gt=0)


class TradeSell(BaseModel):
    sale_price: float = Field(..., gt=0)


def fetch_quote(symbol: str) -> Optional[float]:
    payload = fetch_quote_payload(symbol)
    if not payload:
        return None
    return payload.get("current") or payload.get("price")


def fetch_quote_payload(symbol: str) -> Optional[Dict]:
    url = API_URL.rstrip("/")
    target = f"{url}/{symbol.upper()}" if symbol else url
    try:
        resp = requests.get(target, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        data["symbol"] = data.get("symbol") or symbol.upper()
        if "current" not in data and "price" in data:
            data["current"] = data["price"]
        return data
    except Exception:
        return None


def get_cached_price(symbol: str) -> Optional[float]:
    with cache_lock:
        return price_cache.get(symbol.upper())


def update_price_cache():
    """Background loop to refresh prices for current portfolio symbols without Spark jobs."""
    while True:
        try:
            with cache_lock:
                symbols = list(symbol_set)
            for sym in symbols:
                latest = fetch_quote(sym)
                with cache_lock:
                    price_cache[sym.upper()] = latest
            # prune cache entries for symbols no longer in portfolio
            with cache_lock:
                existing = set(price_cache.keys())
                keep = {s.upper() for s in symbols}
                for stale in existing - keep:
                    price_cache.pop(stale, None)
        except Exception:
            pass
        time.sleep(5)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"message": "Backend is running. Use /portfolio or /trades endpoints."}


def write_portfolio_to_influx():
    if not write_api:
        return
    rows = portfolio.collect()
    if not rows:
        return
    points = []
    for row in rows:
        points.append(
            Point("portfolio")
            .tag("symbol", row.symbol)
            .field("shares", int(row.shares))
            .field("buy_price", float(row.buy_price))
            .field("buy_value", float(row.buy_value))
            .time(row.buy_time or datetime.utcnow(), WritePrecision.NS)
        )
    try:
        write_api.write(bucket=INFLUX_BUCKET, org=INFLUX_ORG, record=points)
    except Exception:
        pass


def pull_prices():
    if not write_api:
        return
    symbols = []
    for raw in PRICE_SYMBOLS.split(","):
        cleaned = raw.strip().upper()
        if cleaned:
            symbols.append(cleaned)
    if not symbols:
        return
    while True:
        rows = []
        for sym in symbols:
            url = API_URL.rstrip("/")
            target = f"{url}/{sym}"
            try:
                resp = requests.get(target, timeout=10)
                resp.raise_for_status()
                data = resp.json()
                price = data.get("current") or data.get("c") or data.get("price")
                if price is None:
                    continue
                rows.append(
                    (
                        sym,
                        float(price),
                        float(data.get("change") or data.get("d") or 0),
                        float(data.get("percent_change") or data.get("dp") or 0),
                        float(data.get("high") or data.get("h") or 0),
                        float(data.get("low") or data.get("l") or 0),
                        float(data.get("open") or data.get("o") or 0),
                        float(data.get("prev_close") or data.get("pc") or 0),
                        datetime.utcnow(),
                    )
                )
            except Exception:
                continue

        if rows:
            price_schema = StructType(
                [
                    StructField("symbol", StringType(), False),
                    StructField("price", DoubleType(), False),
                    StructField("change", DoubleType(), True),
                    StructField("percent_change", DoubleType(), True),
                    StructField("high", DoubleType(), True),
                    StructField("low", DoubleType(), True),
                    StructField("open", DoubleType(), True),
                    StructField("prev_close", DoubleType(), True),
                    StructField("timestamp", TimestampType(), False),
                ]
            )
            df = spark.createDataFrame(rows, schema=price_schema)
            points = []
            collected = df.collect()
            global latest_prices, last_price_write_error, last_price_write_time
            latest_prices = [row.asDict() for row in collected]
            for row in collected:
                points.append(
                    Point("prices")
                    .tag("symbol", row.symbol)
                    .field("price", float(row.price))
                    .field("change", float(row.change))
                    .field("percent_change", float(row.percent_change))
                    .field("high", float(row.high))
                    .field("low", float(row.low))
                    .field("open", float(row.open))
                    .field("prev_close", float(row.prev_close))
                    .time(row.timestamp, WritePrecision.NS)
                )
            try:
                write_api.write(bucket=INFLUX_BUCKET, org=INFLUX_ORG, record=points)
                last_price_write_error = None
                last_price_write_time = datetime.utcnow()
            except Exception as exc:
                last_price_write_error = str(exc)

        time.sleep(max(5, PRICE_POLL_INTERVAL))


@app.get("/balance")
def read_balance():
    with balance_lock:
        return {"balance": balance_amount}

@app.get("/portfolio")
def read_portfolio():
    return [row.asDict() for row in portfolio.collect()]


@app.get("/cache")
def read_cache():
    with cache_lock:
        return dict(price_cache)


@app.get("/quote/{symbol}")
def read_quote(symbol: str):
    payload = fetch_quote_payload(symbol)
    if payload is None:
        raise HTTPException(status_code=502, detail="Quote lookup failed")
    return payload


@app.post("/trades")
def create_trade(trade: TradeCreate):
    global portfolio, balance_amount
    buy_time = datetime.utcnow()
    buy_value = trade.shares * trade.buy_price
    with balance_lock:
        if balance_amount < buy_value:
            raise HTTPException(status_code=400, detail="Insufficient balance")
        balance_amount -= buy_value

    new_row = [(trade.symbol, trade.shares, trade.buy_price, buy_time, buy_value)]
    new_df = spark.createDataFrame(new_row, portfolio.schema)
    portfolio = portfolio.union(new_df)
    # Writes to database
    write_portfolio_to_influx()
    return {"status": "created", "trade": trade.dict(), "timestamp": buy_time}


@app.put("/trades/{symbol}")
def update_trade(symbol: str, payload: TradeUpdate):
    global portfolio, balance_amount
    symbol = symbol.upper()
    if portfolio.filter(col("symbol") == symbol).count() == 0:
        raise HTTPException(status_code=404, detail="Symbol not found")

    rows = portfolio.filter(col("symbol") == symbol).collect()
    buy_row = rows[0]

    # Handle share delta adjustments if provided
    if payload.delta_shares is not None:
        if payload.current_price is None or payload.current_price <= 0:
            raise HTTPException(status_code=400, detail="current_price required for share update")
        delta = payload.delta_shares
        new_shares = buy_row.shares + delta
        if new_shares < 0:
            raise HTTPException(status_code=400, detail="Resulting shares cannot be negative")
        trade_value = delta * payload.current_price  # positive = buy (deduct), negative = sell (add)
        with balance_lock:
            if trade_value > 0 and balance_amount < trade_value:
                raise HTTPException(status_code=400, detail="Insufficient balance")
            balance_amount -= trade_value
            current_balance = balance_amount

        if new_shares == 0:
            portfolio = portfolio.filter(col("symbol") != symbol)
            with cache_lock:
                price_cache.pop(symbol, None)
                symbol_set.discard(symbol)
            return {
                "status": "updated",
                "symbol": symbol,
                "shares": 0,
                "portfolio": [row.asDict() for row in portfolio.collect()],
                "balance": current_balance,
            }

        new_buy_value = buy_row.buy_value + trade_value
        new_buy_price = new_buy_value / new_shares if new_shares else buy_row.buy_price

        portfolio = portfolio.withColumn(
            "shares", when(col("symbol") == symbol, new_shares).otherwise(col("shares"))
        ).withColumn(
            "buy_price",
            when(col("symbol") == symbol, new_buy_price).otherwise(col("buy_price")),
        ).withColumn(
            "buy_value",
            when(col("symbol") == symbol, new_buy_value).otherwise(col("buy_value")),
        )

        return {
            "status": "updated",
            "symbol": symbol,
            "shares": new_shares,
            "balance": current_balance,
            "portfolio": [row.asDict() for row in portfolio.collect()],
        }

    # Fallback to price-only update
    if payload.new_price is None:
        raise HTTPException(status_code=400, detail="No update parameters provided")

    portfolio = portfolio.withColumn(
        "buy_price",
        when(col("symbol") == symbol, payload.new_price).otherwise(col("buy_price")),
    ).withColumn(
        "buy_value",
        when(col("symbol") == symbol, col("shares") * payload.new_price).otherwise(
            col("buy_value")
        ),
    )

    # Writes to database
    write_portfolio_to_influx()
    return {
        "status": "updated",
        "symbol": symbol,
        "shares": buy_row.shares,
        "portfolio": [row.asDict() for row in portfolio.collect()],
    }


@app.delete("/trades/{symbol}")
def delete_trade(symbol: str, payload: Optional[TradeSell] = None):
    global portfolio, balance_amount
    symbol = symbol.upper()
    rows = portfolio.filter(col("symbol") == symbol).collect()
    if not rows:
        raise HTTPException(status_code=404, detail="Symbol not found")

    buy_row = rows[0]
    net_gain = None
    sale_price = None

    # prefer explicit sale_price from payload if provided
    if payload and payload.sale_price:
        sale_price = payload.sale_price
    else:
        with cache_lock:
            cached = price_cache.get(symbol.upper())
        if cached is not None:
            sale_price = cached

    if sale_price is not None:
        net_gain = (sale_price - buy_row.buy_price) * buy_row.shares
        proceeds = sale_price * buy_row.shares
        with balance_lock:
            balance_amount += proceeds
        current_balance = balance_amount


    # Remove the trade without blocking on quote lookups.
    portfolio = portfolio.filter(col("symbol") != symbol)
    with cache_lock:
        price_cache.pop(symbol, None)
        symbol_set.discard(symbol)

    # Writes to database
    write_portfolio_to_influx()
    return {
        "status": "deleted",
        "symbol": symbol,
        "shares": buy_row.shares,
        "buy_price": buy_row.buy_price,
        "sale_price": sale_price,
        "net_gain": net_gain,
        "balance": current_balance if sale_price is not None else balance_amount,
    }


# Starts pulling the api
@app.on_event("startup")
def start_price_polling():
    if write_api:
        thread = threading.Thread(target=pull_prices, daemon=True)
        thread.start()


@app.get("/prices")
def get_latest_prices():
    # For testing isn't being used anywhere for functionality
    return {
        "symbols": latest_prices,
        "last_write_time": last_price_write_time,
        "last_write_error": last_price_write_error,
    }
