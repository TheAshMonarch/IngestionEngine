package worker

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"sync/atomic"

	"github.com/telemetry/ingestion-engine/internal/batch"
	"github.com/telemetry/ingestion-engine/internal/event"
)

var (
	ErrQueueFull = errors.New("worker queue saturated: backpressure triggered")
	ErrPoolShut  = errors.New("worker pool has been stopped")
)

// Pool coordinates a bounded set of worker goroutines fed by a buffered channel.
type Pool struct {
	numWorkers   int
	queueCap     int
	taskCh       chan event.TelemetryEvent
	batchProc    *batch.Processor
	ctx          context.Context
	cancel       context.CancelFunc
	wg           sync.WaitGroup
	accepted     uint64
	dropped      uint64
	processed    uint64
	isShuttingDown uint32
}

// Config specifies pool parameters.
type Config struct {
	Workers   int
	QueueSize int
}

// NewPool constructs a bounded worker pool.
func NewPool(cfg Config, batchProc *batch.Processor) *Pool {
	ctx, cancel := context.WithCancel(context.Background())
	return &Pool{
		numWorkers: cfg.Workers,
		queueCap:   cfg.QueueSize,
		taskCh:     make(chan event.TelemetryEvent, cfg.QueueSize),
		batchProc:  batchProc,
		ctx:        ctx,
		cancel:     cancel,
	}
}

// Start launches worker goroutines.
func (p *Pool) Start() {
	slog.Info("Starting worker pool",
		slog.Int("workers", p.numWorkers),
		slog.Int("queue_capacity", p.queueCap),
	)

	for i := 0; i < p.numWorkers; i++ {
		p.wg.Add(1)
		go p.workerRoutine(i)
	}
}

// workerRoutine continuously pulls events from taskCh and forwards to batch processor.
func (p *Pool) workerRoutine(id int) {
	defer p.wg.Done()

	for {
		select {
		case <-p.ctx.Done():
			// Drain remaining tasks on shutdown
			for ev := range p.taskCh {
				p.batchProc.Submit(ev)
				atomic.AddUint64(&p.processed, 1)
			}
			return

		case ev, ok := <-p.taskCh:
			if !ok {
				return
			}
			// Forward event to batch accumulator
			if ok := p.batchProc.Submit(ev); ok {
				atomic.AddUint64(&p.processed, 1)
			} else {
				atomic.AddUint64(&p.dropped, 1)
			}
		}
	}
}

// Enqueue submits an event to the buffered channel.
// If the buffer is full, it rejects immediately to protect server memory (non-blocking).
func (p *Pool) Enqueue(ev event.TelemetryEvent) error {
	if atomic.LoadUint32(&p.isShuttingDown) == 1 {
		return ErrPoolShut
	}

	select {
	case p.taskCh <- ev:
		atomic.AddUint64(&p.accepted, 1)
		return nil
	default:
		atomic.AddUint64(&p.dropped, 1)
		return ErrQueueFull
	}
}

// EnqueueBatch pushes multiple events into the bounded queue.
func (p *Pool) EnqueueBatch(events []event.TelemetryEvent) (int, int) {
	acceptedCount := 0
	droppedCount := 0

	for _, ev := range events {
		if err := p.Enqueue(ev); err == nil {
			acceptedCount++
		} else {
			droppedCount++
		}
	}
	return acceptedCount, droppedCount
}

// QueueStats provides atomic snapshots of queue metrics.
func (p *Pool) QueueStats() (length int, capacity int, accepted uint64, dropped uint64, processed uint64) {
	return len(p.taskCh), p.queueCap,
		atomic.LoadUint64(&p.accepted),
		atomic.LoadUint64(&p.dropped),
		atomic.LoadUint64(&p.processed)
}

// Shutdown initiates graceful shutdown: closes ingestion channel and waits for workers to drain.
func (p *Pool) Shutdown() {
	if !atomic.CompareAndSwapUint32(&p.isShuttingDown, 0, 1) {
		return
	}

	slog.Info("Draining worker pool and channels for graceful shutdown...")
	close(p.taskCh)
	p.cancel()
	p.wg.Wait()
	slog.Info("All worker pool routines completed.")
}
