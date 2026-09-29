FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install -r requirements.txt \
    && python -m playwright install --with-deps chromium

COPY app ./app
COPY scripts ./scripts
COPY README.md ATTRIBUTION.md .env.example ./

RUN useradd --create-home --shell /usr/sbin/nologin appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Shell form so $HOST/$PORT (set via docker-compose `environment:` or `.env`) are honored
# instead of being silently ignored in favor of a hardcoded port.
CMD uvicorn app.main:app --host ${HOST:-0.0.0.0} --port ${PORT:-8000}
