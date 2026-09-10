import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

interface TelemetryEvent {
  id?: string;
  trace_id: string;
  span_id?: string;
  service: string;
  host: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  message: string;
  payload?: Record<string, any>;
  timestamp: string;
  latency_ns?: number;
}

interface StructuredLog {
  time: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  msg: string;
  caller: string;
  fields: Record<string, any>;
}

// Global Ingestion Engine State
class IngestionEngine {
  // Configuration
  workerCount: number = 32;
  channelCapacity: number = 50000;
  batchThreshold: number = 5000;
  batchFlushWindowMs: number = 500;
  rateLimitRps: number = 10000;
  rateLimitBurst: number = 20000;

  // Rate Limiter (Token Bucket)
  availableTokens: number = 20000;
  lastRefillTime: number = Date.now();
  rateLimitedRequests: number = 0;

  // Channel Queue & Worker Pool
  queue: TelemetryEvent[] = [];
  activeWorkers: number = 0;
  isShuttingDown: boolean = false;
  isPaused: boolean = false;

  // Batch Processor
  batchBuffer: TelemetryEvent[] = [];
  lastFlushTime: number = Date.now();
  totalBatchesFlushed: number = 0;
  totalEventsFlushed: number = 0;
  totalBatchErrors: number = 0;
  lastFlushDurationMs: number = 0;

  // Metrics
  totalAccepted: number = 0;
  totalDropped: number = 0;
  totalProcessed: number = 0;
  latencies: number[] = []; // Circular sample of latencies in ms
  rpsCounter: number = 0;
  epsCounter: number = 0;
  currentRPS: number = 0;
  currentEPS: number = 0;
  startTime: number = Date.now();

  // Structured Logs
  recentLogs: StructuredLog[] = [];
  maxLogs: number = 200;

  // Load Test Generator
  loadTestActive: boolean = false;
  loadTestTimer: NodeJS.Timeout | null = null;
  loadTestTargetRps: number = 2500;
  loadTestScenario: string = 'steady';

  // Persistence time-series collection simulation (MongoDB compound index)
  persistedTimeSeries: Array<{
    id: string;
    service: string;
    level: string;
    trace_id: string;
    timestamp: string;
    batch_id: number;
  }> = [];

  private flushIntervalId: NodeJS.Timeout | null = null;
  private metricsIntervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.startWorkers();
    this.startBatchTicker();
    this.startMetricsTicker();
    this.addLog('INFO', 'Telemetry Ingestion Engine initialized', 'engine.Init', {
      workers: this.workerCount,
      channel_capacity: this.channelCapacity,
      batch_threshold: this.batchThreshold,
      flush_window_ms: this.batchFlushWindowMs,
    });
  }

  addLog(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', msg: string, caller: string, fields: Record<string, any> = {}) {
    const logEntry: StructuredLog = {
      time: new Date().toISOString(),
      level,
      msg,
      caller,
      fields,
    };
    this.recentLogs.unshift(logEntry);
    if (this.recentLogs.length > this.maxLogs) {
      this.recentLogs.pop();
    }
  }

  // Refill Token Bucket
  private refillTokens() {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefillTime) / 1000;
    this.lastRefillTime = now;
    this.availableTokens = Math.min(this.rateLimitBurst, this.availableTokens + elapsedSec * this.rateLimitRps);
  }

  allowRateLimit(count: number = 1): boolean {
    this.refillTokens();
    if (this.availableTokens >= count) {
      this.availableTokens -= count;
      return true;
    }
    this.rateLimitedRequests++;
    return false;
  }

  // Worker Pool
  private startWorkers() {
    // Process queue items concurrently via bounded worker logic
    setInterval(() => {
      if (this.isShuttingDown || this.isPaused) return;

      const availableWorkers = this.workerCount - this.activeWorkers;
      if (availableWorkers <= 0 || this.queue.length === 0) return;

      // Drain chunk proportional to available workers
      const chunkSize = Math.min(availableWorkers * 25, this.queue.length);
      if (chunkSize > 0) {
        this.activeWorkers = Math.min(this.workerCount, Math.ceil(this.queue.length / 50) + 1);
        const items = this.queue.splice(0, chunkSize);
        
        // Put into batch accumulator
        for (const item of items) {
          this.batchBuffer.push(item);
          this.totalProcessed++;
        }

        // Check threshold flush
        if (this.batchBuffer.length >= this.batchThreshold) {
          this.triggerFlush('count_threshold');
        }

        // Release workers after microtask
        setTimeout(() => {
          this.activeWorkers = Math.max(0, Math.min(this.workerCount, Math.ceil(this.queue.length / 50)));
        }, 8);
      }
    }, 10);
  }

  private startBatchTicker() {
    if (this.flushIntervalId) clearInterval(this.flushIntervalId);
    this.flushIntervalId = setInterval(() => {
      if (this.batchBuffer.length > 0 && Date.now() - this.lastFlushTime >= this.batchFlushWindowMs) {
        this.triggerFlush('window_timeout');
      }
    }, 50);
  }

  private startMetricsTicker() {
    this.metricsIntervalId = setInterval(() => {
      this.currentRPS = this.rpsCounter;
      this.currentEPS = this.epsCounter;
      this.rpsCounter = 0;
      this.epsCounter = 0;
    }, 1000);
  }

  triggerFlush(reason: 'count_threshold' | 'window_timeout' | 'graceful_shutdown') {
    if (this.batchBuffer.length === 0) return;

    const toFlush = this.batchBuffer;
    this.batchBuffer = [];
    this.lastFlushTime = Date.now();

    const start = performance.now();
    const batchId = ++this.totalBatchesFlushed;
    const count = toFlush.length;

    // Simulate MongoDB BulkWrite with compound index updates
    for (let i = 0; i < Math.min(count, 50); i++) {
      const ev = toFlush[i];
      this.persistedTimeSeries.unshift({
        id: ev.id || `evt-${Math.random().toString(36).substring(2, 9)}`,
        service: ev.service,
        level: ev.level,
        trace_id: ev.trace_id,
        timestamp: ev.timestamp,
        batch_id: batchId,
      });
    }
    // Cap memory storage
    if (this.persistedTimeSeries.length > 300) {
      this.persistedTimeSeries.splice(300);
    }

    const duration = performance.now() - start;
    this.lastFlushDurationMs = parseFloat(duration.toFixed(2));
    this.totalEventsFlushed += count;

    if (Math.random() < 0.0001) {
      this.totalBatchErrors++;
      this.addLog('ERROR', 'MongoDB BulkWrite failure', 'storage.FlushBatch', {
        batch_id: batchId,
        count,
        reason,
        err: 'connection reset by peer',
      });
    } else {
      this.addLog('INFO', 'MongoDB BulkWrite committed', 'batch.doFlush', {
        batch_id: batchId,
        count,
        reason,
        duration_ms: this.lastFlushDurationMs,
        indexed_keys: ['service:1', 'timestamp:-1', 'level:1'],
      });
    }
  }

  // Ingest Single Event
  ingestSingle(event: TelemetryEvent, ip: string = '127.0.0.1'): { status: 'accepted' | 'rate_limited' | 'queue_saturated' | 'error'; trace_id?: string; error?: string } {
    this.rpsCounter++;
    this.epsCounter++;

    // 1. Rate Limiting (Token Bucket)
    if (!this.allowRateLimit(1)) {
      return { status: 'rate_limited', error: 'Token bucket capacity exceeded (HTTP 429)' };
    }

    // Validation
    if (!event.service || !event.message) {
      return { status: 'error', error: 'Missing required field: service or message' };
    }
    if (!event.timestamp) event.timestamp = new Date().toISOString();
    if (!event.level) event.level = 'INFO';
    if (!event.trace_id) event.trace_id = `tr-${Math.random().toString(36).substring(2, 12)}`;

    // 2. Queue into Bounded Channel
    if (this.queue.length >= this.channelCapacity) {
      this.totalDropped++;
      this.addLog('WARN', 'Channel buffer saturated; dropping event (backpressure engaged)', 'worker.Enqueue', {
        queue_len: this.queue.length,
        capacity: this.channelCapacity,
        service: event.service,
      });
      return { status: 'queue_saturated', error: 'Channel buffer capacity reached (HTTP 503)' };
    }

    const start = performance.now();
    this.queue.push(event);
    this.totalAccepted++;

    const latency = performance.now() - start;
    this.recordLatency(latency);

    return { status: 'accepted', trace_id: event.trace_id };
  }

  // Ingest Batch
  ingestBatch(events: TelemetryEvent[]): { total: number; accepted: number; dropped: number; rate_limited: boolean } {
    this.rpsCounter++;
    this.epsCounter += events.length;

    if (!this.allowRateLimit(Math.max(1, Math.ceil(events.length / 50)))) {
      this.rateLimitedRequests += events.length;
      return { total: events.length, accepted: 0, dropped: events.length, rate_limited: true };
    }

    let accepted = 0;
    let dropped = 0;

    for (const ev of events) {
      if (!ev.timestamp) ev.timestamp = new Date().toISOString();
      if (!ev.trace_id) ev.trace_id = `tr-${Math.random().toString(36).substring(2, 12)}`;
      if (!ev.level) ev.level = 'INFO';

      if (this.queue.length < this.channelCapacity) {
        this.queue.push(ev);
        accepted++;
        this.totalAccepted++;
      } else {
        dropped++;
        this.totalDropped++;
      }
    }

    this.recordLatency(Math.random() * 0.4 + 0.1);
    return { total: events.length, accepted, dropped, rate_limited: false };
  }

  recordLatency(ms: number) {
    this.latencies.push(ms);
    if (this.latencies.length > 500) {
      this.latencies.shift();
    }
  }

  getPercentiles() {
    if (this.latencies.length === 0) return { p50: 0.12, p95: 0.45, p99: 1.2 };
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    return {
      p50: parseFloat(p50.toFixed(3)),
      p95: parseFloat(p95.toFixed(3)),
      p99: parseFloat(p99.toFixed(3)),
    };
  }

  getMetrics() {
    this.refillTokens();
    const percentiles = this.getPercentiles();
    const queueSaturation = (this.queue.length / this.channelCapacity) * 100;
    const tokenSaturation = (this.availableTokens / this.rateLimitBurst) * 100;

    return {
      current_rps: this.currentRPS,
      current_eps: this.currentEPS,
      queue_length: this.queue.length,
      queue_capacity: this.channelCapacity,
      queue_saturation_pct: parseFloat(queueSaturation.toFixed(2)),
      active_workers: this.activeWorkers,
      total_workers: this.workerCount,
      worker_utilization_pct: parseFloat(((this.activeWorkers / this.workerCount) * 100).toFixed(1)),
      batch_buffer_length: this.batchBuffer.length,
      batch_threshold: this.batchThreshold,
      batch_flush_window_ms: this.batchFlushWindowMs,
      total_batches_flushed: this.totalBatchesFlushed,
      total_events_flushed: this.totalEventsFlushed,
      last_flush_duration_ms: this.lastFlushDurationMs,
      total_accepted: this.totalAccepted,
      total_dropped: this.totalDropped,
      total_processed: this.totalProcessed,
      rate_limited_requests: this.rateLimitedRequests,
      available_tokens: Math.round(this.availableTokens),
      rate_limit_burst: this.rateLimitBurst,
      rate_limit_rps: this.rateLimitRps,
      token_saturation_pct: parseFloat(tokenSaturation.toFixed(1)),
      latency_p50_ms: percentiles.p50,
      latency_p95_ms: percentiles.p95,
      latency_p99_ms: percentiles.p99,
      uptime_sec: Math.floor((Date.now() - this.startTime) / 1000),
      load_test_active: this.loadTestActive,
      load_test_target_rps: this.loadTestTargetRps,
      load_test_scenario: this.loadTestScenario,
      is_shutting_down: this.isShuttingDown,
    };
  }

  // Start Built-in High-Throughput Load Simulator
  startLoadTest(targetRps: number = 2500, scenario: string = 'steady') {
    this.stopLoadTest();
    this.loadTestActive = true;
    this.loadTestTargetRps = targetRps;
    this.loadTestScenario = scenario;

    this.addLog('INFO', 'Companion Load Test Generator started', 'benchmarks.Start', {
      target_rps: targetRps,
      scenario,
      client_count: 50,
    });

    const intervalMs = 25; // 40 ticks per second
    const eventsPerTick = Math.ceil(targetRps / 40);

    const services = ['payment-svc', 'auth-svc', 'telemetry-collector', 'order-orchestrator', 'inventory-db'];
    const levels: Array<'INFO' | 'WARN' | 'ERROR' | 'DEBUG'> = ['INFO', 'INFO', 'INFO', 'WARN', 'DEBUG', 'ERROR'];

    this.loadTestTimer = setInterval(() => {
      if (!this.loadTestActive) return;

      let tickBatchCount = eventsPerTick;
      // If spike burst scenario, oscillate
      if (this.loadTestScenario === 'burst') {
        const cycle = Math.sin(Date.now() / 1500);
        tickBatchCount = Math.max(10, Math.floor(eventsPerTick * (1 + cycle * 0.9)));
      } else if (this.loadTestScenario === 'dos_attack') {
        // Exceed token bucket capacity to trigger rate limiting
        tickBatchCount = eventsPerTick * 4;
      }

      // Generate batch payload
      const mockBatch: TelemetryEvent[] = [];
      for (let i = 0; i < tickBatchCount; i++) {
        mockBatch.push({
          trace_id: `tr-${Math.random().toString(36).substring(2, 10)}`,
          service: services[Math.floor(Math.random() * services.length)],
          host: `node-${Math.floor(Math.random() * 16) + 1}.prod`,
          level: levels[Math.floor(Math.random() * levels.length)],
          message: 'High-velocity telemetry event ingested via benchmark worker',
          timestamp: new Date().toISOString(),
          payload: {
            duration_ms: Math.floor(Math.random() * 120),
            cpu_pct: Math.random() * 85,
          },
        });
      }

      this.ingestBatch(mockBatch);
    }, intervalMs);
  }

  stopLoadTest() {
    this.loadTestActive = false;
    if (this.loadTestTimer) {
      clearInterval(this.loadTestTimer);
      this.loadTestTimer = null;
    }
    this.addLog('INFO', 'Companion Load Test Generator halted', 'benchmarks.Stop');
  }

  // Graceful Shutdown Simulation (SIGTERM / SIGINT)
  simulateGracefulShutdown(): {
    drained_queue: number;
    flushed_batch: number;
    shutdown_duration_ms: number;
    exit_code: number;
  } {
    this.isShuttingDown = true;
    this.stopLoadTest();
    const start = performance.now();

    this.addLog('WARN', 'Caught SIGTERM signal; beginning graceful channel draining', 'main.SignalHandler', {
      signal: 'SIGTERM',
      queue_items_pending: this.queue.length,
      buffer_items_pending: this.batchBuffer.length,
    });

    // Step A: Close ingestion channel, drain queue
    const queuedItems = this.queue.length;
    this.batchBuffer.push(...this.queue);
    this.queue = [];

    // Step B: Final flush
    const finalBufferCount = this.batchBuffer.length;
    this.triggerFlush('graceful_shutdown');

    const duration = performance.now() - start;
    this.addLog('INFO', 'All worker routines flushed and decoupled safely. Exit code 0', 'main.GracefulShutdown', {
      duration_ms: parseFloat(duration.toFixed(2)),
      packets_dropped: 0,
    });

    setTimeout(() => {
      this.isShuttingDown = false;
    }, 2000);

    return {
      drained_queue: queuedItems,
      flushed_batch: finalBufferCount,
      shutdown_duration_ms: parseFloat(duration.toFixed(2)),
      exit_code: 0,
    };
  }

  updateConfig(cfg: {
    workerCount?: number;
    channelCapacity?: number;
    batchThreshold?: number;
    batchFlushWindowMs?: number;
    rateLimitRps?: number;
    rateLimitBurst?: number;
  }) {
    if (cfg.workerCount) this.workerCount = Math.max(2, Math.min(256, cfg.workerCount));
    if (cfg.channelCapacity) this.channelCapacity = Math.max(500, Math.min(500000, cfg.channelCapacity));
    if (cfg.batchThreshold) this.batchThreshold = Math.max(100, Math.min(50000, cfg.batchThreshold));
    if (cfg.batchFlushWindowMs) {
      this.batchFlushWindowMs = Math.max(20, Math.min(5000, cfg.batchFlushWindowMs));
      this.startBatchTicker();
    }
    if (cfg.rateLimitRps) this.rateLimitRps = cfg.rateLimitRps;
    if (cfg.rateLimitBurst) {
      this.rateLimitBurst = cfg.rateLimitBurst;
      this.availableTokens = Math.min(this.availableTokens, this.rateLimitBurst);
    }

    this.addLog('INFO', 'Engine configuration dynamically reloaded', 'config.Update', cfg);
  }
}

const engine = new IngestionEngine();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '20mb' }));

  // ==================== REST API ROUTES ====================

  // 1. Single Event Ingestion
  app.post('/api/v1/events/single', (req, res) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const result = engine.ingestSingle(req.body, String(clientIp));

    if (result.status === 'rate_limited') {
      res.setHeader('Retry-After', '1');
      return res.status(429).json({
        error: 'rate_limit_exceeded',
        message: result.error,
      });
    }

    if (result.status === 'queue_saturated') {
      return res.status(503).json({
        error: 'queue_saturated',
        message: result.error,
      });
    }

    if (result.status === 'error') {
      return res.status(400).json({
        error: 'validation_failed',
        message: result.error,
      });
    }

    return res.status(202).json({
      status: 'accepted',
      trace_id: result.trace_id,
      worker_pool: 'bounded_channel',
    });
  });

  // 2. Batch Events Ingestion
  app.post('/api/v1/events/batch', (req, res) => {
    const events = req.body.events;
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: 'invalid_payload', message: 'events array required' });
    }

    const result = engine.ingestBatch(events);
    if (result.rate_limited) {
      res.setHeader('Retry-After', '1');
      return res.status(429).json({
        error: 'rate_limit_exceeded',
        message: 'Token bucket exhausted for batch submission',
      });
    }

    const statusCode = result.dropped > 0 && result.accepted === 0 ? 503 : 202;
    return res.status(statusCode).json({
      status: statusCode === 202 ? 'accepted' : 'partially_dropped',
      total: result.total,
      accepted: result.accepted,
      dropped: result.dropped,
    });
  });

  // 3. Engine Metrics & Health
  app.get('/api/v1/metrics', (req, res) => {
    res.json(engine.getMetrics());
  });

  app.get('/api/v1/healthz', (req, res) => {
    const m = engine.getMetrics();
    res.json({
      status: m.queue_saturation_pct > 95 ? 'degraded' : 'healthy',
      uptime_sec: m.uptime_sec,
      queue_saturation_pct: m.queue_saturation_pct,
    });
  });

  // 4. Live Structured Logs
  app.get('/api/v1/logs', (req, res) => {
    res.json({
      logs: engine.recentLogs,
      persisted_records: engine.persistedTimeSeries.slice(0, 50),
    });
  });

  // 5. Load Testing Controls
  app.post('/api/v1/benchmark/start', (req, res) => {
    const { rps = 2500, scenario = 'steady' } = req.body;
    engine.startLoadTest(Number(rps), String(scenario));
    res.json({ status: 'started', target_rps: rps, scenario });
  });

  app.post('/api/v1/benchmark/stop', (req, res) => {
    engine.stopLoadTest();
    res.json({ status: 'stopped' });
  });

  // 6. Dynamic Configuration
  app.post('/api/v1/config', (req, res) => {
    engine.updateConfig(req.body);
    res.json({ status: 'updated', config: req.body });
  });

  // 7. Graceful Shutdown Simulation
  app.post('/api/v1/simulate/shutdown', (req, res) => {
    const report = engine.simulateGracefulShutdown();
    res.json({ status: 'graceful_shutdown_complete', report });
  });

  // 8. Go Source Code & Manifest Deliverables
  app.get('/api/v1/go-code', (req, res) => {
    const baseDir = path.join(process.cwd(), 'go-engine');
    const filesList: Array<{ path: string; name: string; content: string; language: string }> = [];

    function scanDir(dir: string, rel: string = '') {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        const relPath = path.join(rel, entry.name);
        if (entry.isDirectory()) {
          scanDir(full, relPath);
        } else {
          const content = fs.readFileSync(full, 'utf-8');
          let lang = 'go';
          if (entry.name.endsWith('.js')) lang = 'javascript';
          if (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')) lang = 'yaml';
          if (entry.name.endsWith('.md')) lang = 'markdown';
          if (entry.name === 'Makefile') lang = 'makefile';
          if (entry.name === 'Dockerfile') lang = 'dockerfile';
          filesList.push({
            path: relPath,
            name: entry.name,
            content,
            language: lang,
          });
        }
      }
    }

    scanDir(baseDir);
    res.json({ files: filesList });
  });

  // ==================== VITE MIDDLEWARE / SPA FALLBACK ====================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Ingestion Engine] Running on port ${PORT}`);
  });
}

startServer();
