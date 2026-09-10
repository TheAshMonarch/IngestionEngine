import React, { useState } from 'react';
import { Play, Square, Gauge, Flame, ShieldAlert, Cpu, CheckCircle2, AlertTriangle, Terminal, ArrowUpRight } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { EngineMetrics, HistoricalDataPoint } from '../types';

interface LoadTestStudioProps {
  metrics: EngineMetrics | null;
  history: HistoricalDataPoint[];
  onStartBenchmark: (rps: number, scenario: string) => void;
  onStopBenchmark: () => void;
}

export const LoadTestStudio: React.FC<LoadTestStudioProps> = ({
  metrics,
  history,
  onStartBenchmark,
  onStopBenchmark,
}) => {
  const [customRps, setCustomRps] = useState<number>(3500);
  const [selectedScenario, setSelectedScenario] = useState<string>('steady');

  const presets = [
    {
      id: 'steady',
      name: 'Steady Production Load',
      rps: 2500,
      badge: 'Normal Load',
      badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      description: '2,500 requests/sec with balanced 70% single events and 30% batches.',
    },
    {
      id: 'high',
      name: 'High-Velocity Telemetry',
      rps: 8000,
      badge: 'High Throughput',
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      description: '8,000 requests/sec testing bounded channel queuing and concurrent workers.',
    },
    {
      id: 'burst',
      name: 'Traffic Spike Burst',
      rps: 14000,
      badge: 'Spike Ingress',
      badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      description: 'Oscillating bursts up to 14,000 RPS testing channel absorption without packet drops.',
    },
    {
      id: 'dos_attack',
      name: 'Token Bucket Rate Limit Test',
      rps: 22000,
      badge: 'DDoS Simulation',
      badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      description: 'Deliberately exceeds 20,000 token limit to trigger HTTP 429 Too Many Requests.',
    },
  ];

  const handleLaunchPreset = (scenarioId: string, rps: number) => {
    setSelectedScenario(scenarioId);
    setCustomRps(rps);
    onStartBenchmark(rps, scenarioId);
  };

  return (
    <div className="space-y-4">
      {/* Benchmark Controls Header */}
      <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-rose-400" />
              <h2 className="text-sm font-bold font-mono text-slate-100 uppercase tracking-wide">
                Ingestion Load Testing & Benchmarking Suite
              </h2>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                k6 & Go Parallel Tested
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Simulate high-velocity telemetry traffic to evaluate channel queue absorption, token bucket rate limiting, and zero-drop batch flushes.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {metrics?.load_test_active ? (
              <button
                id="loadtest-stop-btn"
                onClick={onStopBenchmark}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-medium text-xs shadow-lg shadow-rose-950/40 transition-all font-mono"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>HALT BENCHMARK</span>
              </button>
            ) : (
              <button
                id="loadtest-start-custom-btn"
                onClick={() => onStartBenchmark(customRps, selectedScenario)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-950/40 transition-all font-mono"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>RUN BENCHMARK ({customRps.toLocaleString()} RPS)</span>
              </button>
            )}
          </div>
        </div>

        {/* Preset Scenarios */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {presets.map((preset) => {
            const isActive = metrics?.load_test_active && metrics?.load_test_scenario === preset.id;
            return (
              <div
                key={preset.id}
                id={`preset-${preset.id}`}
                onClick={() => handleLaunchPreset(preset.id, preset.rps)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  isActive
                    ? 'bg-slate-800 border-cyan-400 ring-1 ring-cyan-400 shadow-md'
                    : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${preset.badgeColor}`}>
                    {preset.badge}
                  </span>
                  <span className="text-xs font-mono font-bold text-cyan-300">
                    {preset.rps.toLocaleString()} RPS
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-200 font-mono mb-1">{preset.name}</div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{preset.description}</p>
              </div>
            );
          })}
        </div>

        {/* Custom RPS Slider */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="w-full sm:w-2/3">
            <div className="flex justify-between text-xs font-mono text-slate-400 mb-1.5">
              <span>Custom Throughput Dial:</span>
              <span className="text-cyan-400 font-bold">{customRps.toLocaleString()} requests/sec</span>
            </div>
            <input
              id="custom-rps-slider"
              type="range"
              min={500}
              max={25000}
              step={500}
              value={customRps}
              onChange={(e) => setCustomRps(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
              <span>500 RPS</span>
              <span>5,000 RPS</span>
              <span>15,000 RPS</span>
              <span>25,000 RPS (Extreme)</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span>Companion k6 script ready in /go-engine/benchmarks/k6_script.js</span>
          </div>
        </div>
      </div>

      {/* Live Charts (Throughput & Latency) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Real-time Throughput (RPS & EPS) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-bold font-mono text-slate-200">
                THROUGHPUT TREND (RPS vs EVENTS/SEC)
              </h3>
              <p className="text-[11px] text-slate-400">Real-time requests and batched event absorption</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="flex items-center gap-1 text-cyan-400">
                <span className="w-2 h-2 rounded-full bg-cyan-400" /> RPS
              </span>
              <span className="flex items-center gap-1 text-indigo-400">
                <span className="w-2 h-2 rounded-full bg-indigo-400" /> Events/sec
              </span>
            </div>
          </div>

          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="colorRps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorEps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                />
                <Area type="monotone" dataKey="rps" stroke="#06b6d4" fillOpacity={1} fill="url(#colorRps)" name="Requests/sec" />
                <Area type="monotone" dataKey="eps" stroke="#6366f1" fillOpacity={1} fill="url(#colorEps)" name="Events/sec" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Latency Percentiles & Channel Saturation */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-bold font-mono text-slate-200">
                LATENCY (P95 MS) & BUFFER SATURATION (%)
              </h3>
              <p className="text-[11px] text-slate-400">Evaluates zero packet drop threshold under load</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="flex items-center gap-1 text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400" /> p95 (ms)
              </span>
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Queue Saturation %
              </span>
            </div>
          </div>

          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorQueue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                />
                <Area type="monotone" dataKey="p95Latency" stroke="#f59e0b" fillOpacity={1} fill="url(#colorLatency)" name="p95 Latency (ms)" />
                <Area type="monotone" dataKey="queuePct" stroke="#10b981" fillOpacity={1} fill="url(#colorQueue)" name="Queue Saturation %" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* CLI Benchmarking Commands */}
      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-slate-400">
          <span className="font-bold text-slate-200">WEEK 1 LOAD TESTING SUITE EXECUTABLE COMMANDS</span>
          <span className="text-cyan-400">Go & k6 compatible</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-300">
          <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
            <span className="text-slate-500"># 1. Run Go Built-in Parallel Benchmarks:</span>
            <div className="text-cyan-300 font-semibold mt-1 select-all">
              go test -bench=BenchmarkIngestionThroughput -benchmem -benchtime=10s ./benchmarks/...
            </div>
          </div>
          <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
            <span className="text-slate-500"># 2. Run Companion k6 High-Throughput Script:</span>
            <div className="text-emerald-300 font-semibold mt-1 select-all">
              k6 run benchmarks/k6_script.js
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
