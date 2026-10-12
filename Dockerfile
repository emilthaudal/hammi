FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
RUN npm run build

FROM rust:1-bookworm AS server
WORKDIR /server
COPY server/ .
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=server /server/target/release/hammi-server /usr/local/bin/hammi-server
COPY --from=web /web/dist /app/web
ENV STATIC_DIR=/app/web \
    DATABASE_PATH=/data/hammi.db \
    PORT=8080
EXPOSE 8080
CMD ["hammi-server"]
