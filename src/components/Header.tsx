import React from 'react';
import { Activity, ShieldCheck, Zap, AlertTriangle, Play, Square, Terminal, Cpu } from 'lucide-react';
import { EngineMetrics } from '../types';

interface HeaderProps {
  metrics: EngineMetrics | null;
  onSimulateShutdown: () => void;
  onOpenSendModal: () => void;
  onToggleBenchmark: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  shutdownSimulating: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  metrics,
  onSimulateShutdown,
  onOpenSendModal,
  onToggleBenchmark,
  activeTab,
  setActiveTab,
  shutdownSimulating,
}) => {
  const isHealthy = metrics ? metrics.queue_saturation_pct < 85 : true;

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Identity */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-mono font-bold text-lg shadow-inner">
              <Cpu className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-100 tracking-tight text-base font-mono">
                  GO INGESTION ENGINE
                </span>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Week 1 MVP
                </span>
                {metrics?.is_shutting_down ? (
                  <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                    SIGTERM DRAINING
                  </span>
                ) : (
                  <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                    LIVE
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Distributed High-Throughput Telemetry Pipeline (Go &middot; Redis &middot; MongoDB)
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              id="header-loadtest-toggle-btn"
              onClick={onToggleBenchmark}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                metrics?.load_test_active
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 animate-pulse'
                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30'
              }`}
            >
              {metrics?.load_test_active ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop Load Test ({metrics.current_rps} RPS)</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Start Load Test</span>
                </>
              )}
            </button>

            <button
              id="header-manual-send-btn"
              onClick={onOpenSendModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">Send Test Event</span>
              <span className="md:hidden">Send</span>
            </button>

            <button
              id="header-sigterm-btn"
              onClick={onSimulateShutdown}
              disabled={shutdownSimulating}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors disabled:opacity-50"
              title="Simulate SIGTERM to verify graceful worker draining and channel flush"
            >
              <Terminal className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden lg:inline">Simulate SIGTERM</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 sm:space-x-4 border-t border-slate-800/80 overflow-x-auto py-1 scrollbar-none">
          {[
            { id: 'dashboard', label: 'Telemetry Pipeline' },
            { id: 'loadtest', label: 'Load Testing Suite (k6/Go)' },
            { id: 'config', label: 'Concurrency Tuning' },
            { id: 'logs', label: 'Structured Logs (slog)' },
            { id: 'code', label: 'Go Source Code (.go)' },
          ].map((tab) => (
            <button
              key={tab.id}
              id={`nav-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};
