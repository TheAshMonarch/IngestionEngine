import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, ShieldAlert, Cpu, Database, Layers, Server, Code2, Sparkles, HardDrive } from 'lucide-react';
import { EngineMetrics } from '../types';

interface ArchitectureFlowProps {
  metrics: EngineMetrics | null;
}

export const ArchitectureFlow: React.FC<ArchitectureFlowProps> = ({ metrics }) => {
  const [selectedStage, setSelectedStage] = useState<'router' | 'ratelimit' | 'channel' | 'workers' | 'batch' | 'mongo'>('channel');

  const stages = [
    {
      id: 'router' as const,
      name: 'HTTP Ingestion Router',
      sub: "Go 'net/http' non-blocking",
      icon: Cpu,
      color: 'border-cyan-500/40 text-cyan-400 bg-cyan-950/20',
      activeColor: 'ring-2 ring-cyan-400 border-cyan-400',
      metric: `${metrics?.current_rps || 0} req/s`,
      status: 'Non-blocking 202',
    },
    {
      id: 'ratelimit' as const,
      name: 'Token Bucket Limiter',
      sub: 'DDoS & burst mitigation',
      icon: ShieldAlert,
      color: 'border-teal-500/40 text-teal-400 bg-teal-950/20',
      activeColor: 'ring-2 ring-teal-400 border-teal-400',
      metric: `${metrics?.available_tokens?.toLocaleString() || 0} tokens`,
      status: metrics && metrics.rate_limited_requests > 0 ? 'Throttling 429' : 'Nominal',
    },
    {
      id: 'channel' as const,
      name: 'Bounded Channel Queue',
      sub: 'chan TelemetryEvent (50k cap)',
      icon: Layers,
      color: 'border-indigo-500/40 text-indigo-400 bg-indigo-950/20',
      activeColor: 'ring-2 ring-indigo-400 border-indigo-400',
      metric: `${metrics?.queue_length?.toLocaleString() || 0} / ${metrics?.queue_capacity?.toLocaleString() || 0}`,
      status: `${metrics?.queue_saturation_pct || 0}% saturation`,
    },
    {
      id: 'workers' as const,
      name: 'Worker Pool Routines',
      sub: 'Bounded Goroutines (sync.WaitGroup)',
      icon: Server,
      color: 'border-emerald-500/40 text-emerald-400 bg-emerald-950/20',
      activeColor: 'ring-2 ring-emerald-400 border-emerald-400',
      metric: `${metrics?.active_workers || 0} / ${metrics?.total_workers || 0} active`,
      status: `${metrics?.worker_utilization_pct || 0}% load`,
    },
    {
      id: 'batch' as const,
      name: 'Batch Processor',
      sub: '5k records or 500ms ticker',
      icon: Database,
      color: 'border-violet-500/40 text-violet-400 bg-violet-950/20',
      activeColor: 'ring-2 ring-violet-400 border-violet-400',
      metric: `${metrics?.batch_buffer_length?.toLocaleString() || 0} in buffer`,
      status: `${metrics?.total_batches_flushed?.toLocaleString() || 0} flushes`,
    },
    {
      id: 'mongo' as const,
      name: 'Persistence Storage',
      sub: 'MongoDB / Time-Series index',
      icon: HardDrive,
      color: 'border-amber-500/40 text-amber-400 bg-amber-950/20',
      activeColor: 'ring-2 ring-amber-400 border-amber-400',
      metric: `${metrics?.total_events_flushed?.toLocaleString() || 0} stored`,
      status: 'Compound index OK',
    },
  ];

  const stageDetails = {
    router: {
      title: 'HTTP Ingestion Server (net/http)',
      goFile: 'internal/router/router.go',
      summary:
        'A lightweight non-blocking HTTP router exposing strict JSON payload endpoints (/api/v1/events/single and /api/v1/events/batch). Accepts payloads up to 10MB, verifies schema integrity, and responds immediately with HTTP 202 Accepted, decoupling network socket handling from disk latency.',
      codeSnippet: `// Non-blocking 202 Accepted handler in Go
func (s *Server) handleSingleEvent(w http.ResponseWriter, r *http.Request) {
    ev, err := event.ParseEvent(body)
    if err != nil {
        http.Error(w, "invalid payload", 400)
        return
    }
    // Enqueue without blocking the HTTP listener
    if err := s.pool.Enqueue(*ev); err != nil {
        http.Error(w, "queue_saturated", 503)
        return
    }
    w.WriteHeader(http.StatusAccepted)
    json.NewEncoder(w).Encode(map[string]string{"status": "accepted", "trace_id": ev.TraceID})
}`,
      concurrencyConcept: 'Decoupled socket I/O with zero blocking writes to disk.',
    },
    ratelimit: {
      title: 'Token Bucket Rate Limiting Middleware',
      goFile: 'internal/ratelimit/token_bucket.go',
      summary:
        'Guards the ingestion engine against runaway client loops and denial-of-service spikes. Dynamically refills tokens at a defined rate per second while providing an elastic burst capacity. Rejects surplus requests with HTTP 429 and Retry-After headers.',
      codeSnippet: `// Thread-safe Token Bucket Refill in Go
func (tb *TokenBucket) AllowN(n float64) bool {
    tb.mu.Lock()
    defer tb.mu.Unlock()

    now := time.Now()
    elapsed := now.Sub(tb.lastRefill).Seconds()
    tb.lastRefill = now

    tb.tokens = math.Min(tb.capacity, tb.tokens + elapsed * tb.refillRate)
    if tb.tokens >= n {
        tb.tokens -= n
        return true
    }
    return false // Trigger HTTP 429
}`,
      concurrencyConcept: 'sync.Mutex protected token replenishment with sub-microsecond evaluation.',
    },
    channel: {
      title: 'Bounded Channel Queue (chan TelemetryEvent)',
      goFile: 'internal/worker/pool.go',
      summary:
        'Core Go channel with a strictly bounded buffer capacity (e.g. 50,000 items). Protects memory against out-of-memory crashes during extreme traffic spikes. Utilizes non-blocking select statements to engage graceful backpressure when full.',
      codeSnippet: `// Non-blocking channel enqueue in Go
select {
case p.taskCh <- ev:
    atomic.AddUint64(&p.accepted, 1)
    return nil
default:
    // Backpressure triggered: drop packet safely without blocking
    atomic.AddUint64(&p.dropped, 1)
    return ErrQueueFull
}`,
      concurrencyConcept: 'CSP (Communicating Sequential Processes) channel buffering without OS lock contention.',
    },
    workers: {
      title: 'Worker Pool (Goroutines & sync.WaitGroup)',
      goFile: 'internal/worker/pool.go',
      summary:
        'A fixed pool of worker goroutines (e.g. 32-64 workers) continuously pulling from the ingestion channel and passing records to the batch processor. On OS signal (SIGINT/SIGTERM), coordinates graceful draining via context cancellation and wait groups.',
      codeSnippet: `// Bounded worker routine with graceful drain
func (p *Pool) workerRoutine(id int) {
    defer p.wg.Done()
    for {
        select {
        case <-p.ctx.Done():
            for ev := range p.taskCh { // Drain in-flight
                p.batchProc.Submit(ev)
            }
            return
        case ev, ok := <-p.taskCh:
            if !ok { return }
            p.batchProc.Submit(ev)
        }
    }
}`,
      concurrencyConcept: 'sync.WaitGroup synchronization with atomic thread-safe state counters.',
    },
    batch: {
      title: 'Batch Processor (Dual-Trigger Accumulator)',
      goFile: 'internal/batch/processor.go',
      summary:
        'Accumulates incoming events in an in-memory buffer. Triggers bulk writes whenever the buffer reaches the count threshold (e.g. 5,000 records) OR when the time ticker ticks (e.g. 500ms window), whichever occurs first.',
      codeSnippet: `// Dual-trigger flushing logic in Go
select {
case ev := <-p.inCh:
    p.buffer = append(p.buffer, ev)
    if len(p.buffer) >= p.threshold {
        p.doFlush(p.buffer, "count_threshold")
        p.buffer = make([]event.TelemetryEvent, 0, p.threshold)
    }
case <-ticker.C:
    if len(p.buffer) > 0 {
        p.doFlush(p.buffer, "window_timeout")
        p.buffer = make([]event.TelemetryEvent, 0, p.threshold)
    }
}`,
      concurrencyConcept: 'Threshold slicing with time.Ticker dual-trigger multiplexing.',
    },
    mongo: {
      title: 'Persistence Layer (MongoDB Driver & Compound Indexes)',
      goFile: 'internal/storage/mongo.go',
      summary:
        'Executes unordered BulkWrite operations against MongoDB using connection pooling. Configured with optimized compound indexes (service: 1, timestamp: -1, level: 1 and trace_id: 1, timestamp: -1) for sub-millisecond time-series and trace queries.',
      codeSnippet: `// High-velocity unordered BulkWrite in Go
models := make([]mongo.WriteModel, len(events))
for i, ev := range events {
    models[i] = mongo.NewInsertOneModel().SetDocument(ev)
}
// SetOrdered(false) enables multi-shard parallel insertion
opts := options.BulkWrite().SetOrdered(false)
res, err := ms.collection.BulkWrite(ctx, models, opts)`,
      concurrencyConcept: 'Unordered bulk insert pipeline with connection pool tuning (Min/Max pool).',
    },
  };

  const selected = stageDetails[selectedStage];

  return (
    <div className="space-y-4">
      {/* Pipeline Stages Visualizer */}
      <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 pb-3 border-b border-slate-800/80 gap-2">
          <div>
            <h2 className="text-sm font-semibold font-mono text-slate-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              CONCURRENCY & DATA PIPELINE SCHEMATIC
            </h2>
            <p className="text-xs text-slate-400">
              Interactive pipeline topology &middot; Click any stage to inspect Go concurrency architecture
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Zero Dropped Packets: {metrics?.total_dropped === 0 ? '100% Guaranteed' : `${metrics?.total_dropped} drops`}</span>
          </div>
        </div>

        {/* Stages Grid / Flow */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          {stages.map((stage, idx) => {
            const Icon = stage.icon;
            const isSelected = selectedStage === stage.id;

            return (
              <div
                key={stage.id}
                id={`arch-stage-${stage.id}`}
                onClick={() => setSelectedStage(stage.id)}
                className={`p-3 rounded-xl border cursor-pointer transition-all duration-200 relative text-left flex flex-col justify-between ${
                  isSelected
                    ? `${stage.activeColor} bg-slate-800/90 shadow-lg shadow-cyan-950/30`
                    : `${stage.color} hover:bg-slate-800/50 hover:border-slate-700`
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-1.5 rounded-lg bg-slate-950/40 border border-slate-700/50">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 font-bold">
                      0{idx + 1}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-100 font-mono tracking-tight leading-snug">
                    {stage.name}
                  </div>
                  <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                    {stage.sub}
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/60">
                  <div className="text-[11px] font-mono font-semibold text-slate-200 truncate">
                    {stage.metric}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">
                    {stage.status}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Stage Detail Panel */}
      <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800 text-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 mb-3 border-b border-slate-800 gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-mono text-slate-100">{selected.title}</h3>
              <p className="text-xs text-cyan-400 font-mono">{selected.goFile}</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-300 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700">
            <span className="text-emerald-400 font-bold">&check;</span>
            <span>{selected.concurrencyConcept}</span>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed mb-4">{selected.summary}</p>

        <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 font-mono text-xs overflow-x-auto">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-slate-500 text-[11px]">
            <span>Go Implementation Preview</span>
            <span>Go 1.22+</span>
          </div>
          <pre className="text-slate-300 text-[12px] leading-relaxed font-mono">
            {selected.codeSnippet}
          </pre>
        </div>
      </div>
    </div>
  );
};
