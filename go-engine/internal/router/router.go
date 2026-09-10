package router

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/telemetry/ingestion-engine/internal/batch"
	"github.com/telemetry/ingestion-engine/internal/event"
	"github.com/telemetry/ingestion-engine/internal/ratelimit"
	"github.com/telemetry/ingestion-engine/internal/worker"
)

// Server encapsulates the HTTP ingestion server, router, and middleware components.
type Server struct {
	pool        *worker.Pool
	batchProc   *batch.Processor
	limiter     *ratelimit.KeyedRateLimiter
	mux         *http.ServeMux
	startTime   time.Time
}

// NewServer initializes the HTTP ingestion router with rate limiting and worker pool.
func NewServer(pool *worker.Pool, batchProc *batch.Processor, limiter *ratelimit.KeyedRateLimiter) *Server {
	s := &Server{
		pool:      pool,
		batchProc: batchProc,
		limiter:   limiter,
		mux:       http.NewServeMux(),
		startTime: time.Now(),
	}
	s.registerRoutes()
	return s
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("POST /api/v1/events/single", s.rateLimitMiddleware(s.handleSingleEvent))
	s.mux.HandleFunc("POST /api/v1/events/batch", s.rateLimitMiddleware(s.handleBatchEvents))
	s.mux.HandleFunc("GET /api/v1/healthz", s.handleHealthz)
	s.mux.HandleFunc("GET /api/v1/metrics", s.handleMetrics)
}

// Handler returns the HTTP handler with global logging middleware
func (s *Server) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		s.mux.ServeHTTP(w, r)
		duration := time.Since(start)

		slog.Debug("HTTP Request",
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.String("remote_addr", r.RemoteAddr),
			slog.Duration("latency", duration),
		)
	})
}

// rateLimitMiddleware applies the TokenBucket rate limiter per client IP
func (s *Server) rateLimitMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clientIP := r.RemoteAddr
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			clientIP = xff
		}

		if !s.limiter.Allow(clientIP) {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "1")
			w.WriteHeader(http.StatusTooManyRequests)
			json.NewEncoder(w).Encode(map[string]string{
				"error":   "rate_limit_exceeded",
				"message": "Token bucket quota exhausted. Please back off.",
			})
			return
		}

		next(w, r)
	}
}

func (s *Server) handleSingleEvent(w http.ResponseWriter, r *http.Request) {
	// Restrict payload size to prevent memory exhaustion (max 256KB for single event)
	r.Body = http.MaxBytesReader(w, r.Body, 256*1024)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":"payload too large or unreadable"}`, http.StatusBadRequest)
		return
	}

	ev, err := event.ParseEvent(body)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "validation_failed", "details": err.Error()})
		return
	}

	// Enqueue into non-blocking bounded channel
	if err := s.pool.Enqueue(*ev); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "queue_saturated",
			"message": "Worker channel full. Ingestion backpressure engaged.",
		})
		return
	}

	// Non-blocking 202 Accepted: event decoupled and in-flight
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "accepted",
		"trace_id": ev.TraceID,
	})
}

func (s *Server) handleBatchEvents(w http.ResponseWriter, r *http.Request) {
	// Restrict batch payload size to max 10MB
	r.Body = http.MaxBytesReader(w, r.Body, 10*1024*1024)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":"batch payload too large"}`, http.StatusBadRequest)
		return
	}

	var req event.BatchRequest
	if err := json.Unmarshal(body, &req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid_batch_json"})
		return
	}

	accepted, dropped := s.pool.EnqueueBatch(req.Events)

	w.Header().Set("Content-Type", "application/json")
	if dropped > 0 && accepted == 0 {
		w.WriteHeader(http.StatusServiceUnavailable)
	} else {
		w.WriteHeader(http.StatusAccepted)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "processed",
		"total":    len(req.Events),
		"accepted": accepted,
		"dropped":  dropped,
	})
}

func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	qLen, qCap, _, _, _ := s.pool.QueueStats()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":     "healthy",
		"uptime_sec": time.Since(s.startTime).Seconds(),
		"queue_util": float64(qLen) / float64(qCap),
	})
}

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	qLen, qCap, accepted, dropped, processed := s.pool.QueueStats()
	flushed, batches, flushErrors, pending := s.batchProc.Metrics()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"queue_len":        qLen,
		"queue_capacity":   qCap,
		"queue_saturation": float64(qLen) / float64(qCap) * 100.0,
		"events_accepted":  accepted,
		"events_dropped":   dropped,
		"events_processed": processed,
		"batch_flushed":    flushed,
		"total_batches":    batches,
		"batch_errors":     flushErrors,
		"batch_pending":    pending,
		"uptime_sec":       time.Since(s.startTime).Seconds(),
	})
}
