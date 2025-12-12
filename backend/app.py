import os
import threading
import time
from datetime import datetime
from typing import Optional, Dict, Set

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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

spark = (
    SparkSession.builder.appName("StockCRUD")
    .master(SPARK_MASTER_URL)
    .config("spark.driver.bindAddress", "0.0.0.0")
    .config("spark.driver.host", "backend")
    .getOrCreate()
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
price_cache: Dict[str, Optional[float]] = {}
symbol_set: Set[str] = set()
cache_lock = threading.Lock()


class TradeCreate(BaseModel):
    symbol: str = Field(..., min_length=1)
    shares: int = Field(..., gt=0)
    buy_price: float = Field(..., gt=0)

    @validator("symbol")
    def upper_symbol(cls, v):
        return v.upper()


class TradeUpdate(BaseModel):
    new_price: float = Field(..., gt=0)


class TradeSell(BaseModel):
    sale_price: float = Field(..., gt=0)


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


@app.get("/portfolio")
def read_portfolio():
    return [row.asDict() for row in portfolio.collect()]


@app.get("/cache")
def read_cache():
    with cache_lock:
        return dict(price_cache)


@app.post("/trades")
def create_trade(trade: TradeCreate):
    global portfolio
    buy_time = datetime.utcnow()
    buy_value = trade.shares * trade.buy_price
    new_row = [(trade.symbol, trade.shares, trade.buy_price, buy_time, buy_value)]
    new_df = spark.createDataFrame(new_row, portfolio.schema)
    portfolio = portfolio.union(new_df)
    with cache_lock:
        price_cache.pop(trade.symbol, None)
        symbol_set.add(trade.symbol)
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

    with cache_lock:
        price_cache.pop(symbol, None)
        symbol_set.add(symbol)

    return {
        "status": "updated",
        "symbol": symbol,
        "portfolio": [row.asDict() for row in portfolio.collect()],
    }


@app.delete("/trades/{symbol}")
def delete_trade(symbol: str, payload: Optional[TradeSell] = None):
    global portfolio
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


    # Remove the trade without blocking on quote lookups.
    portfolio = portfolio.filter(col("symbol") != symbol)
    with cache_lock:
        price_cache.pop(symbol, None)
        symbol_set.discard(symbol)

    return {
        "status": "deleted",
        "symbol": symbol,
        "shares": buy_row.shares,
        "buy_price": buy_row.buy_price,
        "sale_price": sale_price,
        "net_gain": net_gain,
    }


# start background price cache refresher
threading.Thread(target=update_price_cache, daemon=True).start()
