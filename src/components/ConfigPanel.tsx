import React, { useState, useEffect } from 'react';
import { Sliders, Save, RefreshCw, Cpu, Layers, Database, Shield, CheckCircle2 } from 'lucide-react';
import { EngineMetrics } from '../types';

interface ConfigPanelProps {
  metrics: EngineMetrics | null;
  onUpdateConfig: (config: any) => Promise<void>;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ metrics, onUpdateConfig }) => {
  const [workerCount, setWorkerCount] = useState<number>(32);
  const [channelCapacity, setChannelCapacity] = useState<number>(50000);
  const [batchThreshold, setBatchThreshold] = useState<number>(5000);
  const [batchFlushWindowMs, setBatchFlushWindowMs] = useState<number>(500);
  const [rateLimitRps, setRateLimitRps] = useState<number>(10000);
  const [rateLimitBurst, setRateLimitBurst] = useState<number>(20000);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (metrics) {
      setWorkerCount(metrics.total_workers);
      setChannelCapacity(metrics.queue_capacity);
      setBatchThreshold(metrics.batch_threshold);
      setBatchFlushWindowMs(metrics.batch_flush_window_ms);
      setRateLimitRps(metrics.rate_limit_rps);
      setRateLimitBurst(metrics.rate_limit_burst);
    }
  }, [metrics?.total_workers, metrics?.queue_capacity, metrics?.batch_threshold]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onUpdateConfig({
        workerCount,
        channelCapacity,
        batchThreshold,
        batchFlushWindowMs,
        rateLimitRps,
        rateLimitBurst,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 rounded-2xl bg-slate-900/80 border border-slate-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-6 border-b border-slate-800/80 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-bold font-mono text-slate-100 uppercase tracking-wide">
              Runtime Concurrency & Buffer Capacity Tuning
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Dynamically reconfigure Go goroutine worker pools, channel queue boundaries, and batch flush triggers.
          </p>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
            <CheckCircle2 className="w-4 h-4" />
            <span>Config Hot-Reloaded</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* 1. Worker Pool Size */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-emerald-400" />
                Worker Pool Size
              </span>
              <span className="text-xs font-mono text-emerald-400 font-bold">{workerCount} goroutines</span>
            </div>
            <input
              type="range"
              min={4}
              max={128}
              step={4}
              value={workerCount}
              onChange={(e) => setWorkerCount(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
              <span>4 routines</span>
              <span>32 routines</span>
              <span>128 routines</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Number of concurrent Go worker routines pulling from the bounded task channel simultaneously.
            </p>
          </div>

          {/* 2. Channel Buffer Capacity */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-400" />
                Channel Buffer Capacity
              </span>
              <span className="text-xs font-mono text-indigo-400 font-bold">
                {channelCapacity.toLocaleString()} items
              </span>
            </div>
            <input
              type="range"
              min={1000}
              max={100000}
              step={1000}
              value={channelCapacity}
              onChange={(e) => setChannelCapacity(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-400"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
              <span>1k</span>
              <span>50k (Production)</span>
              <span>100k</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Length of bounded Go channel (`chan TelemetryEvent`) to absorb traffic surges without dropping.
            </p>
          </div>

          {/* 3. Batch Flush Threshold */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-violet-400" />
                Batch Count Threshold
              </span>
              <span className="text-xs font-mono text-violet-400 font-bold">
                {batchThreshold.toLocaleString()} records
              </span>
            </div>
            <input
              type="range"
              min={500}
              max={15000}
              step={500}
              value={batchThreshold}
              onChange={(e) => setBatchThreshold(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-400"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
              <span>500</span>
              <span>5,000 (Target)</span>
              <span>15,000</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Immediate MongoDB bulk write trigger once in-memory event accumulator reaches this size.
            </p>
          </div>

          {/* 4. Batch Flush Time Window */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 text-amber-400" />
                Batch Flush Window (ms)
              </span>
              <span className="text-xs font-mono text-amber-400 font-bold">{batchFlushWindowMs} ms</span>
            </div>
            <input
              type="range"
              min={50}
              max={2000}
              step={50}
              value={batchFlushWindowMs}
              onChange={(e) => setBatchFlushWindowMs(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
              <span>50 ms</span>
              <span>500 ms (Target)</span>
              <span>2,000 ms</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Maximum dwell time in memory before flushing, preventing stale data under sparse ingestion.
            </p>
          </div>

          {/* 5. Token Bucket Refill Rate */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-teal-400" />
                Token Refill Rate
              </span>
              <span className="text-xs font-mono text-teal-400 font-bold">
                {rateLimitRps.toLocaleString()} tokens/s
              </span>
            </div>
            <input
              type="range"
              min={1000}
              max={50000}
              step={1000}
              value={rateLimitRps}
              onChange={(e) => setRateLimitRps(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
              <span>1,000</span>
              <span>10,000</span>
              <span>50,000</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Tokens replenished per second into the rate limiter to throttle abusive IPs or clients.
            </p>
          </div>

          {/* 6. Token Bucket Burst Capacity */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-cyan-400" />
                Burst Capacity
              </span>
              <span className="text-xs font-mono text-cyan-400 font-bold">
                {rateLimitBurst.toLocaleString()} burst tokens
              </span>
            </div>
            <input
              type="range"
              min={2000}
              max={100000}
              step={2000}
              value={rateLimitBurst}
              onChange={(e) => setRateLimitBurst(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
              <span>2,000</span>
              <span>20,000</span>
              <span>100,000</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Maximum instantaneous burst tokens permitted before generating HTTP 429 Too Many Requests.
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            id="save-config-btn"
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md transition-all font-mono disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'APPLYING HOT RELOAD...' : 'APPLY ENGINE CONFIG'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
