
FROM python:3.11-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        default-jre-headless \
        curl \
        ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# On current Debian (trixie), default-jre-headless is OpenJDK 21.
# JAVA_HOME path may differ across releases; detect at build time:
# (works for current Debian; adjust if needed)
ENV JAVA_HOME=/usr/lib/jvm/default-java
ENV PATH="${JAVA_HOME}/bin:${PATH}"
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "app.py"]
