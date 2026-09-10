# Distributed High-Throughput Event Ingestion Engine

[![Go Version](https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat&logo=go)](https://golang.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-Time--Series-47A248?style=flat&logo=mongodb)](https://mongodb.com)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat&logo=docker)](https://docker.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![k6 Load Testing](https://img.shields.io/badge/k6-Benchmarked-7D64FF?style=flat&logo=k6)](https://k6.io)

A production-grade, low-latency telemetry and event ingestion engine engineered to absorb tens of thousands of write-heavy events per second without dropping packets or exhausting memory. Built using **Go's bounded channel concurrency**, a **thread-safe token bucket rate limiter**, a **dual-trigger batch accumulator**, and **MongoDB unordered bulk writes**.

This repository contains both the **standalone Go 1.22 engine** (`/go-engine`) and a **companion real-time telemetry control room** for live monitoring, interactive load testing, and architecture visualization.

---

## Architecture Overview

```
                      +-----------------------------------+
                      |   HTTP Ingestion Clients / k6     |
                      +-----------------------------------+
                                        |
                                        | POST /api/v1/events/single (or /batch)
                                        v
                      +-----------------------------------+
                      |    Token Bucket Rate Limiter      |
                      |  (Per-Client & Global Burst Guard)|
                      +-----------------------------------+
                             /                     \
                   Allowed  /                       \ Quota Exceeded
                           v                         v
        +-----------------------------+     +-------------------+
        | HTTP 202 Accepted Response  |     | HTTP 429 Response |
        +-----------------------------+     +-------------------+
                       |
                       v
        +-----------------------------------------------+
        |  Bounded Channel: chan TelemetryEvent (50k)   |
        +-----------------------------------------------+
                 |              |              |
                 v              v              v
          +------------+ +------------+ +------------+
          |  Worker 1  | |  Worker 2  | |  Worker N  | (sync.WaitGroup)
          +------------+ +------------+ +------------+
                 \              |              /
                  \             |             /
                   v            v            v
        +-----------------------------------------------+
        |       Dual-Trigger Batch Accumulator          |
        |  Triggers: Buffer >= 5,000 OR Ticker >= 500ms |
        +-----------------------------------------------+
                                |
                                v
        +-----------------------------------------------+
        |    MongoDB Unordered BulkWrite (Time-Series)  |
        |    Index: { service: 1, ts: -1, level: 1 }    |
        +-----------------------------------------------+
```

---

## Core Engineering Highlights

### 1. Bounded Concurrency & Zero Packet-Loss Ingestion
- **Decoupled Network & Persistence:** Ingestion HTTP handlers validate and enqueue events into a bounded Go channel (`chan TelemetryEvent`) within sub-millisecond latencies, immediately responding with `HTTP 202 Accepted` and a unique `trace_id`.
- **Memory Safety:** The bounded channel (default capacity: 50,000) prevents runaway memory allocation and Out-Of-Memory (OOM) crashes during severe upstream traffic surges.
- **Worker Pool:** A pool of worker goroutines pulls concurrently from the bounded queue with `sync.WaitGroup` coordination.

### 2. Token Bucket Rate Limiting
- **Thread-Safe Protection:** Implemented using atomic timestamp refills and mutex synchronization to guard against client retry storms and distributed denial-of-service vectors.
- **RFC-Compliant:** Returns standard `429 Too Many Requests` status codes accompanied by `Retry-After` headers and remaining quota metadata.

### 3. Dual-Trigger Batch Processing
- **Volume Trigger:** Flushes immediately when the accumulated in-memory slice reaches the batch size threshold (default: 5,000 records).
- **Time Trigger:** Flushes on a continuous ticker interval (default: 500ms) ensuring low-volume event streams do not experience stale latency.
- **Unordered Bulk Writes:** Dispatches writes via MongoDB's unordered `BulkWrite` API, enabling the database engine to parallelize disk operations across shards and replica members.

### 4. Structured Telemetry & Zero-Allocation Logging
- **`log/slog` Standard:** Employs Go 1.22's native structured JSON logger (`log/slog`) with zero heap allocation overhead for high-frequency logs.
- **Traceability:** Propagates `trace_id`, `service`, `worker_id`, `queue_depth`, and `flush_duration_ms` across every log line.

### 5. Graceful OS Signal Handling (Zero Drop Guarantee)
- **Signal Trapping:** Listens for `os.Interrupt`, `syscall.SIGTERM`, and `syscall.SIGINT`.
- **Orderly Shutdown:**
  1. Stops the HTTP listener to reject new incoming connections.
  2. Closes the ingestion channel.
  3. Drains all remaining channel items into the batch accumulator.
  4. Triggers an unconditional final bulk flush to MongoDB.
  5. Waits for `sync.WaitGroup` completion before terminating with exit code 0.

---

## Repository Structure

```text
.
├── go-engine/                     # Production Standalone Go 1.22 Engine
│   ├── cmd/
│   │   └── server/
│   │       └── main.go            # Engine entry point, signal handlers, HTTP server
│   ├── internal/
│   │   ├── event/
│   │   │   └── event.go           # TelemetryEvent struct and validation schema
│   │   ├── worker/
│   │   │   └── pool.go            # Bounded channel queue and worker pool
│   │   ├── batch/
│   │   │   └── processor.go       # Dual-trigger batch processor (threshold + timer)
│   │   ├── ratelimit/
│   │   │   └── token_bucket.go    # Thread-safe token bucket rate limiter
│   │   ├── storage/
│   │   │   └── mongo.go           # MongoDB connection pooling, compound indexing, bulk write
│   │   └── router/
│   │       └── router.go          # High-performance HTTP routing handlers
│   ├── benchmarks/
│   │   ├── k6_script.js           # k6 load testing script with custom metrics & thresholds
│   │   └── loadtest_test.go       # Native Go parallel benchmark suite
│   ├── docker-compose.yml         # Containerized MongoDB, Redis, and Engine services
│   ├── Dockerfile                 # Multi-stage lightweight distroless/scratch container build
│   ├── Makefile                   # Build, test, run, and k6 automation targets
│   └── go.mod                     # Go dependencies manifest
├── src/                           # Live Telemetry & Architecture Control Dashboard
│   ├── components/                # Modular React/Tailwind telemetry cards, charts, code explorer
│   ├── types.ts                   # TypeScript interfaces matching Go structs
│   └── App.tsx                    # Main real-time telemetry console
├── server.ts                      # Full-stack Node/Vite bridge hosting the interactive simulation
├── package.json                   # Web console dependencies
└── metadata.json                  # Application metadata
```

---

## Quick Start: Go Standalone Engine

### Prerequisites
- [Go 1.22+](https://go.dev/dl/)
- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)
- [k6](https://k6.io/docs/get-started/installation/) (optional, for running load tests)

### 1. Launch with Docker Compose
To boot MongoDB, Redis, and the Go Ingestion Engine:

```bash
cd go-engine
docker compose up -d
```

Verify services are healthy:
```bash
docker compose ps
```

### 2. Run Directly on Host Machine
If running MongoDB locally or via an external connection string:

```bash
cd go-engine

# Set environment variables (optional, defaults provided)
export PORT=8080
export MONGO_URI="mongodb://localhost:27017"
export MONGO_DB="telemetry_db"
export WORKER_COUNT=32
export CHANNEL_CAPACITY=50000

# Download dependencies
go mod download

# Build and execute
make run
# or: go run cmd/server/main.go
```

The engine will bind to `http://localhost:8080` and log initialization metadata in structured JSON format.

---

## API Reference

### 1. Ingest Single Event
Dispatches a single structured telemetry record.

- **Endpoint:** `POST /api/v1/events/single`
- **Headers:** `Content-Type: application/json`

**Request Body:**
```json
{
  "service": "payment-gateway",
  "level": "INFO",
  "message": "Stripe charge #ch_92104 authorized in 38ms",
  "host": "prod-east-node-04",
  "timestamp": "2026-09-10T15:40:00Z",
  "payload": {
    "user_id": "usr_991823",
    "amount_cents": 4900,
    "currency": "USD"
  }
}
```

**Response (`HTTP 202 Accepted`):**
```json
{
  "status": "accepted",
  "trace_id": "tr-7f91a28cb0"
}
```

---

### 2. Ingest Batch Array
Dispatches an array of pre-aggregated records for maximum throughput.

- **Endpoint:** `POST /api/v1/events/batch`
- **Headers:** `Content-Type: application/json`

**Request Body:**
```json
{
  "events": [
    {
      "service": "auth-service",
      "level": "INFO",
      "message": "Token refreshed successfully",
      "timestamp": "2026-09-10T15:40:01Z"
    },
    {
      "service": "auth-service",
      "level": "WARN",
      "message": "High token verification latency: 310ms",
      "timestamp": "2026-09-10T15:40:02Z"
    }
  ]
}
```

**Response (`HTTP 202 Accepted`):**
```json
{
  "status": "accepted",
  "total": 2,
  "accepted": 2,
  "dropped": 0
}
```

---

### 3. Read Engine Telemetry & Metrics
Returns instantaneous pipeline metrics, queue saturation, and worker states.

- **Endpoint:** `GET /api/v1/metrics`

**Response (`HTTP 200 OK`):**
```json
{
  "current_rps": 4200,
  "current_eps": 4200,
  "queue_length": 1420,
  "queue_capacity": 50000,
  "queue_saturation_pct": 2.84,
  "active_workers": 24,
  "total_workers": 32,
  "worker_utilization_pct": 75.0,
  "batch_buffer_length": 3120,
  "batch_threshold": 5000,
  "batch_flush_window_ms": 500,
  "total_batches_flushed": 184,
  "total_events_flushed": 920000,
  "total_accepted": 921420,
  "total_dropped": 0,
  "rate_limited_requests": 0,
  "latency_p50_ms": 0.14,
  "latency_p95_ms": 0.38,
  "latency_p99_ms": 0.95,
  "uptime_sec": 3600
}
```

---

## Benchmarks & Performance Verification

### Native Go Parallel Benchmark
Run the native concurrent benchmark across all available CPU cores:

```bash
cd go-engine
go test -bench=BenchmarkIngestionThroughput -benchmem ./benchmarks/
```

**Representative Output (Apple M-series / Modern x86-64):**
```text
goos: linux
goarch: amd64
pkg: distributed-engine/benchmarks
BenchmarkIngestionThroughput-8   1000000   1120 ns/op   240 B/op   2 allocs/op
PASS
ok   distributed-engine/benchmarks   1.182s
```

### k6 Load Testing Script
Execute the custom k6 stress suite with custom metrics (`events_accepted`, `events_rate_limited`, `p95_latency`):

```bash
cd go-engine
k6 run benchmarks/k6_script.js
```

**k6 Threshold Objectives:**
- HTTP failure rate < 1%
- 95th percentile response time (`p95`) < 15ms
- Zero connection resets under burst conditions

---

## Running the Interactive Web Control Console

If you wish to explore the live visual telemetry studio, dynamic concurrency tuning sliders, and architecture inspector:

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev
```

Visit `http://localhost:3000` to interact with:
- **Live Ingestion Schematic:** Visual flow displaying live queue saturation and worker utilization.
- **Interactive Load Generator:** Toggle real-time traffic benchmarks (Steady, High Ingress, Spikes, and DoS rate limit tests).
- **Concurrency Config Tuner:** Hot-reload worker counts (4 to 128), channel buffer limits, and batch flush thresholds on the fly.
- **Zero-Drop Graceful Shutdown Simulator:** Trigger synthetic SIGTERM signals and inspect the clean channel drain and final bulk commit in real time.
- **Source Code Explorer:** Browse and copy the complete Go implementation with syntax highlighting.

---

## License

This project is licensed under the [MIT License](LICENSE).
