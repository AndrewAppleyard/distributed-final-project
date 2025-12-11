FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt /app/requirements.txt
COPY api.py /app/api.py

RUN pip install --no-cache-dir -r /app/requirements.txt

EXPOSE 8001

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8001"]
