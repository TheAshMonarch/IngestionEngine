package batch

import (
	"context"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/telemetry/ingestion-engine/internal/event"
)

// Flusher defines the storage sink interface for executing bulk writes.
type Flusher interface {
	FlushBatch(ctx context.Context, events []event.TelemetryEvent) error
}

// Processor manages in-memory buffering and dual-trigger flushing (count threshold OR time window).
type Processor struct {
	threshold      int
	flushWindow    time.Duration
	flusher        Flusher
	buffer         []event.TelemetryEvent
	mu             sync.Mutex
	inCh           chan event.TelemetryEvent
	ctx            context.Context
	cancel         context.CancelFunc
	wg             sync.WaitGroup
	totalFlushed   uint64
	totalBatches   uint64
	flushErrors    uint64
	lastFlushTime  time.Time
}

// Config holds batch processor parameters.
type Config struct {
	Threshold   int           // Max events before immediate flush (e.g. 5000)
	FlushWindow time.Duration // Max duration before flush (e.g. 500ms)
	BufferSize  int           // Inbound channel capacity
}

// NewProcessor initializes a thread-safe batch processor.
func NewProcessor(cfg Config, flusher Flusher) *Processor {
	ctx, cancel := context.WithCancel(context.Background())
	return &Processor{
		threshold:     cfg.Threshold,
		flushWindow:   cfg.FlushWindow,
		flusher:       flusher,
		buffer:        make([]event.TelemetryEvent, 0, cfg.Threshold),
		inCh:          make(chan event.TelemetryEvent, cfg.BufferSize),
		ctx:           ctx,
		cancel:        cancel,
		lastFlushTime: time.Now(),
	}
}

// Start spawns the accumulator background loop.
func (p *Processor) Start() {
	p.wg.Add(1)
	go p.run()
}

// Submit enqueues an event for batching without blocking the caller unless inbound channel is full.
func (p *Processor) Submit(ev event.TelemetryEvent) bool {
	select {
	case p.inCh <- ev:
		return true
	default:
		// Queue full; backpressure/drop handler
		return false
	}
}

func (p *Processor) run() {
	defer p.wg.Done()
	ticker := time.NewTicker(p.flushWindow)
	defer ticker.Stop()

	for {
		select {
		case <-p.ctx.Done():
			// Context canceled; drain any remaining items in inCh then flush buffer
			p.drainAndFlush()
			return

		case ev, ok := <-p.inCh:
			if !ok {
				p.flushCurrent("channel_closed")
				return
			}
			p.mu.Lock()
			p.buffer = append(p.buffer, ev)
			if len(p.buffer) >= p.threshold {
				toFlush := p.buffer
				p.buffer = make([]event.TelemetryEvent, 0, p.threshold)
				p.mu.Unlock()
				p.doFlush(toFlush, "count_threshold")
			} else {
				p.mu.Unlock()
			}

		case <-ticker.C:
			p.mu.Lock()
			if len(p.buffer) > 0 {
				toFlush := p.buffer
				p.buffer = make([]event.TelemetryEvent, 0, p.threshold)
				p.mu.Unlock()
				p.doFlush(toFlush, "window_timeout")
			} else {
				p.mu.Unlock()
			}
		}
	}
}

func (p *Processor) doFlush(events []event.TelemetryEvent, reason string) {
	if len(events) == 0 {
		return
	}
	start := time.Now()
	err := p.flusher.FlushBatch(context.Background(), events)
	duration := time.Since(start)

	if err != nil {
		atomic.AddUint64(&p.flushErrors, 1)
		slog.Error("Batch flush failed",
			slog.Int("count", len(events)),
			slog.String("reason", reason),
			slog.Duration("duration", duration),
			slog.String("error", err.Error()),
		)
		return
	}

	atomic.AddUint64(&p.totalFlushed, uint64(len(events)))
	atomic.AddUint64(&p.totalBatches, 1)
	p.mu.Lock()
	p.lastFlushTime = time.Now()
	p.mu.Unlock()

	slog.Info("Batch flush committed",
		slog.Int("count", len(events)),
		slog.String("reason", reason),
		slog.Duration("duration", duration),
	)
}

func (p *Processor) drainAndFlush() {
	p.mu.Lock()
	defer p.mu.Unlock()

	for {
		select {
		case ev := <-p.inCh:
			p.buffer = append(p.buffer, ev)
		default:
			goto DRAINED
		}
	}
DRAINED:
	if len(p.buffer) > 0 {
		toFlush := p.buffer
		p.buffer = make([]event.TelemetryEvent, 0, p.threshold)
		p.doFlush(toFlush, "graceful_shutdown")
	}
}

// Stop initiates graceful shutdown, waiting for active buffers to flush.
func (p *Processor) Stop() {
	p.cancel()
	p.wg.Wait()
}

// Metrics returns snapshot of batch operations.
func (p *Processor) Metrics() (flushed uint64, batches uint64, errors uint64, pending int) {
	p.mu.Lock()
	pending = len(p.buffer)
	p.mu.Unlock()
	return atomic.LoadUint64(&p.totalFlushed),
		atomic.LoadUint64(&p.totalBatches),
		atomic.LoadUint64(&p.flushErrors),
		pending
}
