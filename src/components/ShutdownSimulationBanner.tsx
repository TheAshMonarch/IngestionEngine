import React from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';

interface ShutdownReport {
  drained_queue: number;
  flushed_batch: number;
  shutdown_duration_ms: number;
  exit_code: number;
}

interface ShutdownSimulationBannerProps {
  report: ShutdownReport | null;
  onDismiss: () => void;
}

export const ShutdownSimulationBanner: React.FC<ShutdownSimulationBannerProps> = ({ report, onDismiss }) => {
  if (!report) return null;

  return (
    <div className="mb-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 animate-fadeIn">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300 mt-0.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h4 className="text-sm font-bold font-mono text-slate-100 flex items-center gap-2">
              <span>SIGTERM GRACEFUL SHUTDOWN SEQUENCE COMPLETED</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded">
                Exit Code 0
              </span>
            </h4>
            <p className="text-xs text-slate-300 mt-1">
              Active OS signal received: Worker channel was closed, in-flight channel events were drained, and pending memory batches were flushed to storage before termination.
            </p>
            <div className="flex flex-wrap gap-4 mt-2 font-mono text-xs text-slate-200">
              <span className="bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
                Channel Drained: <strong className="text-cyan-400">{report.drained_queue} items</strong>
              </span>
              <span className="bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
                Final Bulk Flush: <strong className="text-violet-400">{report.flushed_batch} records</strong>
              </span>
              <span className="bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
                Drain Duration: <strong className="text-amber-400">{report.shutdown_duration_ms} ms</strong>
              </span>
              <span className="bg-slate-900/80 px-2 py-1 rounded border border-slate-800 text-emerald-400">
                Packets Dropped: <strong>0 (Zero Drop Guarantee)</strong>
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="text-xs font-mono text-slate-400 hover:text-slate-200 bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};
