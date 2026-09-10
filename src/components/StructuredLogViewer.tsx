import React, { useState } from 'react';
import { Terminal, Filter, Search, RefreshCw, HardDrive, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { StructuredLog, PersistedRecord } from '../types';

interface StructuredLogViewerProps {
  logs: StructuredLog[];
  persistedRecords: PersistedRecord[];
}

export const StructuredLogViewer: React.FC<StructuredLogViewerProps> = ({ logs, persistedRecords }) => {
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeView, setActiveView] = useState<'logs' | 'timeseries'>('logs');

  const filteredLogs = logs.filter((log) => {
    if (levelFilter !== 'ALL' && log.level !== levelFilter) return false;
    if (searchQuery.trim() === '') return true;
    const q = searchQuery.toLowerCase();
    return (
      log.msg.toLowerCase().includes(q) ||
      log.caller.toLowerCase().includes(q) ||
      JSON.stringify(log.fields).toLowerCase().includes(q)
    );
  });

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'ERROR':
        return (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
            <XCircle className="w-3 h-3" /> ERROR
          </span>
        );
      case 'WARN':
        return (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> WARN
          </span>
        );
      case 'DEBUG':
        return (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300 border border-slate-600 flex items-center gap-1">
            <Info className="w-3 h-3" /> DEBUG
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> INFO
          </span>
        );
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold font-mono text-slate-100 uppercase tracking-wide">
              Structured Telemetry Logs (log/slog JSON format)
            </h2>
            <p className="text-xs text-slate-400">
              Zero-allocation structured log stream tracking worker routines, queue saturation, and batch flushes.
            </p>
          </div>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveView('logs')}
            className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-colors ${
              activeView === 'logs'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                : 'text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800'
            }`}
          >
            slog Output ({logs.length})
          </button>
          <button
            onClick={() => setActiveView('timeseries')}
            className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-colors flex items-center gap-1.5 ${
              activeView === 'timeseries'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                : 'text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5 text-amber-400" />
            <span>MongoDB Time-Series ({persistedRecords.length})</span>
          </button>
        </div>
      </div>

      {activeView === 'logs' ? (
        <>
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 my-3">
            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
              {['ALL', 'INFO', 'WARN', 'ERROR'].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setLevelFilter(lvl)}
                  className={`px-2.5 py-1 text-[11px] font-mono rounded-md transition-colors ${
                    levelFilter === lvl
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search trace_id, caller, msg..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Logs Terminal Box */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 h-80 overflow-y-auto font-mono text-[11px] space-y-2 select-text">
            {filteredLogs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-600">
                No logs matching filter criteria
              </div>
            ) : (
              filteredLogs.map((log, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded bg-slate-900/50 border border-slate-800/60 hover:bg-slate-900 transition-colors flex flex-col gap-1"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {getLevelBadge(log.level)}
                      <span className="text-slate-400 text-[10px]">
                        {new Date(log.time).toLocaleTimeString()}.{new Date(log.time).getMilliseconds().toString().padStart(3, '0')}
                      </span>
                      <span className="text-cyan-400 font-bold">{log.caller}</span>
                    </div>
                    <span className="text-slate-200 font-medium">{log.msg}</span>
                  </div>

                  {Object.keys(log.fields).length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-800/40 text-[10px] text-slate-400">
                      {Object.entries(log.fields).map(([k, v]) => (
                        <span key={k} className="bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                          <span className="text-indigo-400">{k}:</span>{' '}
                          <span className="text-slate-200">
                            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        /* MongoDB Time-Series Inspection */
        <div className="mt-3">
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 mb-3 text-xs font-mono text-slate-400 flex items-center justify-between">
            <span>
              Compound Index: <span className="text-amber-400">&#123; service: 1, timestamp: -1, level: 1 &#125;</span>
            </span>
            <span className="text-emerald-400 font-semibold">Unordered BulkWrite Active</span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden font-mono text-xs max-h-80 overflow-y-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-900/90 text-slate-400 text-[10px] sticky top-0 border-b border-slate-800">
                <tr>
                  <th className="p-2.5">EVENT ID</th>
                  <th className="p-2.5">SERVICE</th>
                  <th className="p-2.5">LEVEL</th>
                  <th className="p-2.5">TRACE ID</th>
                  <th className="p-2.5">BATCH ID</th>
                  <th className="p-2.5">TIMESTAMP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-[11px] text-slate-300">
                {persistedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-600">
                      No bulk writes committed yet. Send events or start load test!
                    </td>
                  </tr>
                ) : (
                  persistedRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-900/40">
                      <td className="p-2.5 text-cyan-400">{rec.id}</td>
                      <td className="p-2.5 font-bold text-slate-200">{rec.service}</td>
                      <td className="p-2.5">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            rec.level === 'ERROR'
                              ? 'bg-rose-500/20 text-rose-300'
                              : rec.level === 'WARN'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {rec.level}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-400 text-[10px]">{rec.trace_id}</td>
                      <td className="p-2.5 text-violet-400">#{rec.batch_id}</td>
                      <td className="p-2.5 text-slate-500 text-[10px]">
                        {new Date(rec.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
