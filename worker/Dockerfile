FROM python:3.12-slim AS builder
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM alpine:3.20 AS trufflehog
ARG TRUFFLEHOG_VERSION=3.82.0
RUN wget -qO- "https://github.com/trufflesecurity/trufflehog/releases/download/v${TRUFFLEHOG_VERSION}/trufflehog_${TRUFFLEHOG_VERSION}_linux_amd64.tar.gz" \
    | tar xz -C /usr/local/bin trufflehog

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
RUN useradd -r -s /bin/false redact
WORKDIR /app
COPY --from=builder /install /usr/local
COPY --from=trufflehog /usr/local/bin/trufflehog /usr/local/bin/trufflehog
COPY backend/ .
USER redact
CMD ["celery", "-A", "app.worker", "worker", "--loglevel=info", "--concurrency=3"]
