package benchmarks

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/telemetry/ingestion-engine/internal/batch"
	"github.com/telemetry/ingestion-engine/internal/event"
	"github.com/telemetry/ingestion-engine/internal/ratelimit"
	"github.com/telemetry/ingestion-engine/internal/router"
	"github.com/telemetry/ingestion-engine/internal/worker"
)

type MockBenchmarkFlusher struct {
	flushedCount uint64
}

func (m *MockBenchmarkFlusher) FlushBatch(ctx context.Context, events []event.TelemetryEvent) error {
	atomic.AddUint64(&m.flushedCount, uint64(len(events)))
	return nil
}

// BenchmarkIngestionThroughput measures requests/second of the complete pipeline under parallel load.
func BenchmarkIngestionThroughput(b *testing.B) {
	flusher := &MockBenchmarkFlusher{}
	batchProc := batch.NewProcessor(batch.Config{
		Threshold:   5000,
		FlushWindow: 200 * time.Millisecond,
		BufferSize:  100000,
	}, flusher)
	batchProc.Start()
	defer batchProc.Stop()

	workerPool := worker.NewPool(worker.Config{
		Workers:   64,
		QueueSize: 100000,
	}, batchProc)
	workerPool.Start()
	defer workerPool.Shutdown()

	limiter := ratelimit.NewKeyedRateLimiter(500000, 1000000, 500000, 1000000)
	srv := router.NewServer(workerPool, batchProc, limiter)
	handler := srv.Handler()

	payload, _ := json.Marshal(event.TelemetryEvent{
		TraceID: "bench-trace-12345",
		Service: "payment-gateway",
		Host:    "prod-worker-09",
		Level:   event.LevelInfo,
		Message: "Processed credit card authorization in 12ms",
	})

	b.ResetTimer()
	b.ReportAllocs()

	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			req := httptest.NewRequest(http.MethodPost, "/api/v1/events/single", bytes.NewReader(payload))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)

			if w.Code != http.StatusAccepted {
				b.Fatalf("expected 202 Accepted, got %d", w.Code)
			}
		}
	})
}

// TestWorkerPoolBackpressure ensures that when channel capacity is exceeded,
// backpressure triggers predictably rather than crashing with OOM.
func TestWorkerPoolBackpressure(t *testing.T) {
	flusher := &MockBenchmarkFlusher{}
	batchProc := batch.NewProcessor(batch.Config{
		Threshold:   100,
		FlushWindow: 5 * time.Second,
		BufferSize:  10,
	}, flusher)

	// Small queue of 5 to force saturation
	pool := worker.NewPool(worker.Config{
		Workers:   1,
		QueueSize: 5,
	}, batchProc)

	ev := event.TelemetryEvent{
		Service: "test-service",
		Message: "stress test entry",
	}

	var dropped int
	for i := 0; i < 20; i++ {
		if err := pool.Enqueue(ev); err != nil {
			dropped++
		}
	}

	if dropped == 0 {
		t.Errorf("Expected queue to drop events when saturated, but dropped 0")
	}
}

// TestTokenBucketLimiting verifies that rate spikes above threshold receive HTTP 429
func TestTokenBucketLimiting(t *testing.T) {
	// 10 requests per second, burst 10
	tb := ratelimit.NewTokenBucket(10, 10)

	var wg sync.WaitGroup
	var allowed uint64
	var blocked uint64

	for i := 0; i < 30; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if tb.Allow() {
				atomic.AddUint64(&allowed, 1)
			} else {
				atomic.AddUint64(&blocked, 1)
			}
		}()
	}

	wg.Wait()
	if allowed > 11 {
		t.Errorf("Expected at most burst capacity allowed (~10), got %d", allowed)
	}
	if blocked == 0 {
		t.Errorf("Expected some requests to be rate limited, got 0 blocked")
	}
}
