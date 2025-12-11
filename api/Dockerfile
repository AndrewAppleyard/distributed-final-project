FROM python:3.11-slim

WORKDIR /app

COPY api.py /app/api.py

RUN pip install --no-cache-dir finnhub-python python-dotenv

ENTRYPOINT ["python", "/app/api.py"]
CMD ["NVDA"]
