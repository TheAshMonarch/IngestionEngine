package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/telemetry/ingestion-engine/internal/batch"
	"github.com/telemetry/ingestion-engine/internal/event"
	"github.com/telemetry/ingestion-engine/internal/ratelimit"
	"github.com/telemetry/ingestion-engine/internal/router"
	"github.com/telemetry/ingestion-engine/internal/storage"
	"github.com/telemetry/ingestion-engine/internal/worker"
)

// DevMemoryFlusher provides local storage simulation when MongoDB URI is absent
type DevMemoryFlusher struct{}

func (d *DevMemoryFlusher) FlushBatch(ctx context.Context, events []event.TelemetryEvent) error {
	slog.Info("DevStorage: Bulk wrote time-series batch",
		slog.Int("count", len(events)),
		slog.String("sample_service", events[0].Service),
	)
	return nil
}

func main() {
	// 1. Initialize High-Performance Structured Logging (slog)
	logHandler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})
	logger := slog.New(logHandler)
	slog.SetDefault(logger)

	slog.Info("Initializing Distributed High-Throughput Telemetry Ingestion Engine")

	// 2. Read Configuration from Environment
	port := getEnv("PORT", "8080")
	workerCount := getEnvInt("WORKER_POOL_SIZE", 32)
	queueCap := getEnvInt("CHANNEL_BUFFER_CAP", 50000)
	batchThreshold := getEnvInt("BATCH_THRESHOLD", 5000)
	flushWindowMs := getEnvInt("BATCH_FLUSH_WINDOW_MS", 500)
	rateLimitRps := getEnvFloat("RATE_LIMIT_RPS", 10000)
	rateLimitCap := getEnvFloat("RATE_LIMIT_BURST", 20000)
	mongoURI := os.Getenv("MONGO_URI")

	// 3. Setup Persistence Layer (MongoDB or Dev Memory Flusher)
	var flusher batch.Flusher
	if mongoURI != "" {
		mongoStorage, err := storage.NewMongoStorage(context.Background(), storage.MongoConfig{
			URI:         mongoURI,
			Database:    getEnv("MONGO_DB", "telemetry_db"),
			Collection:  getEnv("MONGO_COLLECTION", "events_timeseries"),
			MaxPoolSize: 100,
		})
		if err != nil {
			slog.Error("Failed to connect to MongoDB, falling back to memory flusher", slog.String("err", err.Error()))
			flusher = &DevMemoryFlusher{}
		} else {
			flusher = mongoStorage
		}
	} else {
		slog.Info("No MONGO_URI specified; operating with in-memory time-series flusher")
		flusher = &DevMemoryFlusher{}
	}

	// 4. Instantiate Batch Processor (5,000 threshold or 500ms time window)
	batchProc := batch.NewProcessor(batch.Config{
		Threshold:   batchThreshold,
		FlushWindow: time.Duration(flushWindowMs) * time.Millisecond,
		BufferSize:  queueCap / 2,
	}, flusher)
	batchProc.Start()

	// 5. Instantiate Bounded Worker Pool
	workerPool := worker.NewPool(worker.Config{
		Workers:   workerCount,
		QueueSize: queueCap,
	}, batchProc)
	workerPool.Start()

	// 6. Token Bucket Rate Limiter
	rateLimiter := ratelimit.NewKeyedRateLimiter(rateLimitRps, rateLimitCap, rateLimitRps*2, rateLimitCap*2)

	// 7. Non-blocking Ingestion Server
	engineServer := router.NewServer(workerPool, batchProc, rateLimiter)
	httpServer := &http.Server{
		Addr:         ":" + port,
		Handler:      engineServer.Handler(),
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// 8. Start HTTP Server in background goroutine
	go func() {
		slog.Info("HTTP Ingestion Router listening", slog.String("port", port))
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("HTTP Server fatal error", slog.String("error", err.Error()))
			os.Exit(1)
		}
	}()

	// 9. Concurrency Model: Graceful Shutdown with SIGINT / SIGTERM
	stopCh := make(chan os.Signal, 1)
	signal.Notify(stopCh, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)

	sig := <-stopCh
	slog.Info("Caught shutdown signal, initiating graceful drain...", slog.String("signal", sig.String()))

	// Step A: Stop accepting incoming HTTP traffic
	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancelShutdown()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		slog.Error("HTTP server shutdown error", slog.String("error", err.Error()))
	} else {
		slog.Info("HTTP ingestion endpoints closed.")
	}

	// Step B: Drain and stop worker pool
	workerPool.Shutdown()

	// Step C: Flush remaining batch accumulator items
	batchProc.Stop()

	slog.Info("Telemetry Engine gracefully terminated without packet loss.")
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

func getEnvFloat(key string, fallback float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return fallback
}
