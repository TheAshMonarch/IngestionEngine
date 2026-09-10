import React from 'react';
import { Activity, Database, Server, Clock, AlertCircle, ShieldAlert, Layers } from 'lucide-react';
import { EngineMetrics } from '../types';

interface MetricsCardsProps {
  metrics: EngineMetrics | null;
}

export const MetricsCards: React.FC<MetricsCardsProps> = ({ metrics }) => {
  if (!metrics) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 animate-pulse">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-24 bg-slate-900/60 rounded-xl border border-slate-800" />
        ))}
      </div>
    );
  }

  const queueColor =
    metrics.queue_saturation_pct > 80
      ? 'text-rose-400'
      : metrics.queue_saturation_pct > 40
      ? 'text-amber-400'
      : 'text-emerald-400';

  const queueBarColor =
    metrics.queue_saturation_pct > 80
      ? 'bg-rose-500'
      : metrics.queue_saturation_pct > 40
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {/* 1. Throughput */}
      <div id="metric-throughput-card" className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80 relative overflow-hidden">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-mono">Throughput</span>
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
        </div>
        <div className="text-xl font-bold font-mono text-slate-100 tracking-tight">
          {metrics.current_rps.toLocaleString()} <span className="text-xs text-cyan-400 font-sans font-normal">RPS</span>
        </div>
        <div className="text-[11px] text-slate-400 font-mono mt-1">
          {metrics.current_eps.toLocaleString()} events/sec
        </div>
      </div>

      {/* 2. Channel Queue Saturation */}
      <div id="metric-queue-card" className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80 relative overflow-hidden">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-mono">Queue Buffer</span>
          <Layers className="w-3.5 h-3.5 text-indigo-400" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className={`text-xl font-bold font-mono tracking-tight ${queueColor}`}>
            {metrics.queue_saturation_pct}%
          </span>
          <span className="text-xs text-slate-500 font-mono">
            ({metrics.queue_length.toLocaleString()})
          </span>
        </div>
        <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
          <div
            className={`h-full ${queueBarColor} transition-all duration-300`}
            style={{ width: `${Math.min(100, Math.max(2, metrics.queue_saturation_pct))}%` }}
          />
        </div>
      </div>

      {/* 3. Worker Pool Utilization */}
      <div id="metric-workers-card" className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80 relative overflow-hidden">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-mono">Worker Pool</span>
          <Server className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <div className="text-xl font-bold font-mono text-slate-100 tracking-tight">
          {metrics.active_workers} <span className="text-xs text-slate-500 font-sans font-normal">/ {metrics.total_workers}</span>
        </div>
        <div className="text-[11px] text-emerald-400 font-mono mt-1">
          {metrics.worker_utilization_pct}% goroutines active
        </div>
      </div>

      {/* 4. Ingestion Latency Percentiles */}
      <div id="metric-latency-card" className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80 relative overflow-hidden">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-mono">Latency (p95)</span>
          <Clock className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <div className="text-xl font-bold font-mono text-slate-100 tracking-tight">
          {metrics.latency_p95_ms} <span className="text-xs text-slate-400 font-sans font-normal">ms</span>
        </div>
        <div className="text-[11px] text-slate-400 font-mono mt-1">
          p50: {metrics.latency_p50_ms}ms &middot; p99: {metrics.latency_p99_ms}ms
        </div>
      </div>

      {/* 5. Batch Processor */}
      <div id="metric-batch-card" className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80 relative overflow-hidden">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-mono">Batch Flush</span>
          <Database className="w-3.5 h-3.5 text-violet-400" />
        </div>
        <div className="text-xl font-bold font-mono text-slate-100 tracking-tight">
          {metrics.batch_buffer_length.toLocaleString()} <span className="text-xs text-slate-500 font-sans font-normal">/ {metrics.batch_threshold.toLocaleString()}</span>
        </div>
        <div className="text-[11px] text-violet-400 font-mono mt-1">
          {metrics.total_batches_flushed.toLocaleString()} flushed ({metrics.batch_flush_window_ms}ms window)
        </div>
      </div>

      {/* 6. Rate Limiter (Token Bucket) */}
      <div id="metric-ratelimit-card" className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80 relative overflow-hidden">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-mono">Token Bucket</span>
          <ShieldAlert className="w-3.5 h-3.5 text-teal-400" />
        </div>
        <div className="text-xl font-bold font-mono text-slate-100 tracking-tight">
          {metrics.available_tokens.toLocaleString()} <span className="text-xs text-slate-500 font-sans font-normal">tkns</span>
        </div>
        <div className="text-[11px] text-slate-400 font-mono mt-1">
          {metrics.rate_limited_requests > 0 ? (
            <span className="text-rose-400 font-semibold">{metrics.rate_limited_requests.toLocaleString()} throttled (429)</span>
          ) : (
            <span className="text-emerald-400">0 throttled requests</span>
          )}
        </div>
      </div>
    </div>
  );
};
