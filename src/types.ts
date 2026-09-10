export interface EngineMetrics {
  current_rps: number;
  current_eps: number;
  queue_length: number;
  queue_capacity: number;
  queue_saturation_pct: number;
  active_workers: number;
  total_workers: number;
  worker_utilization_pct: number;
  batch_buffer_length: number;
  batch_threshold: number;
  batch_flush_window_ms: number;
  total_batches_flushed: number;
  total_events_flushed: number;
  last_flush_duration_ms: number;
  total_accepted: number;
  total_dropped: number;
  total_processed: number;
  rate_limited_requests: number;
  available_tokens: number;
  rate_limit_burst: number;
  rate_limit_rps: number;
  token_saturation_pct: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  latency_p99_ms: number;
  uptime_sec: number;
  load_test_active: boolean;
  load_test_target_rps: number;
  load_test_scenario: string;
  is_shutting_down: boolean;
}

export interface StructuredLog {
  time: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  msg: string;
  caller: string;
  fields: Record<string, any>;
}

export interface PersistedRecord {
  id: string;
  service: string;
  level: string;
  trace_id: string;
  timestamp: string;
  batch_id: number;
}

export interface GoSourceFile {
  path: string;
  name: string;
  content: string;
  language: string;
}

export interface HistoricalDataPoint {
  time: string;
  rps: number;
  eps: number;
  queuePct: number;
  p95Latency: number;
  activeWorkers: number;
}
