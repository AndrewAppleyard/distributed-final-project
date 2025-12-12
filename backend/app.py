import os
import threading
import time
from datetime import datetime
from typing import Optional, List, Dict, Optional as Opt

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS
from pydantic import BaseModel, Field, validator
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

spark = (
    SparkSession.builder.appName("StockCRUD").master(SPARK_MASTER_URL).getOrCreate()
)

portfolio_schema = StructType(
    [
        StructField("symbol", StringType(), True),
        StructField("shares", IntegerType(), True),
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
    shares: int = Field(..., gt=0)
    buy_price: float = Field(..., gt=0)

    @validator("symbol")
    def upper_symbol(cls, v):
        return v.upper()


class TradeUpdate(BaseModel):
    new_price: float = Field(..., gt=0)


def fetch_quote(symbol: str) -> Optional[float]:
    url = API_URL.rstrip("/")
    target = f"{url}/{symbol.upper()}" if symbol else url
    try:
        resp = requests.get(target, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return data.get("current") or data.get("price")
    except Exception:
        return None


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


@app.get("/portfolio")
def read_portfolio():
    return [row.asDict() for row in portfolio.collect()]


@app.post("/trades")
def create_trade(trade: TradeCreate):
    global portfolio
    buy_time = datetime.utcnow()
    buy_value = trade.shares * trade.buy_price
    new_row = [(trade.symbol, trade.shares, trade.buy_price, buy_time, buy_value)]
    new_df = spark.createDataFrame(new_row, portfolio.schema)
    portfolio = portfolio.union(new_df)
    # Writes to database
    write_portfolio_to_influx()
    return {"status": "created", "trade": trade.dict(), "timestamp": buy_time}


@app.put("/trades/{symbol}")
def update_trade(symbol: str, payload: TradeUpdate):
    global portfolio
    symbol = symbol.upper()
    if portfolio.filter(col("symbol") == symbol).count() == 0:
        raise HTTPException(status_code=404, detail="Symbol not found")

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
        "portfolio": [row.asDict() for row in portfolio.collect()],
    }


@app.delete("/trades/{symbol}")
def delete_trade(symbol: str):
    global portfolio
    symbol = symbol.upper()
    rows = portfolio.filter(col("symbol") == symbol).collect()
    if not rows:
        raise HTTPException(status_code=404, detail="Symbol not found")

    buy_row = rows[0]
    current_price = fetch_quote(symbol)
    net_gain = None
    if current_price is not None:
        net_gain = (current_price - buy_row.buy_price) * buy_row.shares

    portfolio = portfolio.filter(col("symbol") != symbol)

    # Writes to database
    write_portfolio_to_influx()
    return {
        "status": "deleted",
        "symbol": symbol,
        "shares": buy_row.shares,
        "buy_price": buy_row.buy_price,
        "current_price": current_price,
        "net_gain": net_gain,
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