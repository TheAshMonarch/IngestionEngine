# Distributed High-Throughput Event Ingestion Engine (Go & Redis/MongoDB)

A concurrent, low-latency telemetry and log ingestion pipeline capable of absorbing tens of thousands of requests per second without dropping packets, built with Go's standard library and bounded channel concurrency.

## Architecture

```
HTTP Clients (k6 / Agents)
         │  POST /api/v1/events/single | batch
         ▼
[Token Bucket Rate Limiter] (Per-IP + Global)
         │  (202 Accepted / 429 Too Many Requests)
         ▼
[Bounded Channel Queue: chan TelemetryEvent (cap: 50,000)]
         │
         ├── Worker Goroutine 1 ──┐
         ├── Worker Goroutine 2 ──┼──> [Batch Processor Accumulator]
         └── Worker Goroutine N ──┘     (Threshold: 5,000 OR 500ms Timer)
                                                 │
                                                 ▼
                                  [MongoDB BulkWrite Unordered]
                                  (Compound Indexes: service + ts + level)
```

## Week 1 Deliverables Implemented

1. **Concurrency Model:** Thread-safe bounded worker pool (`internal/worker/pool.go`) using Go channels and graceful shutdown (`SIGINT`/`SIGTERM`) with WaitGroup coordination.
2. **Rate Limiting & Middleware:** High-performance Token Bucket rate limiter (`internal/ratelimit/token_bucket.go`) protecting against burst loops and DDoS vectors.
3. **Structured Logging & Metrics:** Zero-allocation structured logging using `log/slog` with JSON output, tracking queue saturation, throughput, and batch flush latency.
4. **Load Testing Suite:** Companion `k6` script (`benchmarks/k6_script.js`) and Go parallel benchmark suite (`benchmarks/loadtest_test.go`).
5. **Persistence Layer:** MongoDB native driver connection layer with compound indexing (`service: 1, timestamp: -1, level: 1`), connection pooling, and unordered bulk inserts.

## Quick Start

```bash
# 1. Start MongoDB and Redis containers
make up

# 2. Run Ingestion Engine
make run

# 3. In another terminal, run k6 load testing suite
make k6
```
