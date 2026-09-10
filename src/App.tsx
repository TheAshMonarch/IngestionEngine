import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { MetricsCards } from './components/MetricsCards';
import { ArchitectureFlow } from './components/ArchitectureFlow';
import { LoadTestStudio } from './components/LoadTestStudio';
import { ConfigPanel } from './components/ConfigPanel';
import { StructuredLogViewer } from './components/StructuredLogViewer';
import { GoCodeExplorer } from './components/GoCodeExplorer';
import { EventSenderModal } from './components/EventSenderModal';
import { ShutdownSimulationBanner } from './components/ShutdownSimulationBanner';
import { EngineMetrics, StructuredLog, PersistedRecord, HistoricalDataPoint } from './types';

export default function App() {
  const [metrics, setMetrics] = useState<EngineMetrics | null>(null);
  const [logs, setLogs] = useState<StructuredLog[]>([]);
  const [persistedRecords, setPersistedRecords] = useState<PersistedRecord[]>([]);
  const [history, setHistory] = useState<HistoricalDataPoint[]>([]);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isSendModalOpen, setIsSendModalOpen] = useState<boolean>(false);
  const [shutdownSimulating, setShutdownSimulating] = useState<boolean>(false);
  const [shutdownReport, setShutdownReport] = useState<any | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/metrics');
      if (res.ok) {
        const data: EngineMetrics = await res.json();
        setMetrics(data);

        // Append to rolling historical trend
        setHistory((prev) => {
          const now = new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' });
          const newPoint: HistoricalDataPoint = {
            time: now,
            rps: data.current_rps,
            eps: data.current_eps,
            queuePct: data.queue_saturation_pct,
            p95Latency: data.latency_p95_ms,
            activeWorkers: data.active_workers,
          };
          const updated = [...prev, newPoint];
          if (updated.length > 25) updated.shift();
          return updated;
        });
      }
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setPersistedRecords(data.persisted_records || []);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  }, []);

  // Initial and periodic polling
  useEffect(() => {
    fetchMetrics();
    fetchLogs();

    const intervalId = setInterval(() => {
      fetchMetrics();
      fetchLogs();
    }, 1000);

    return () => clearInterval(intervalId);
  }, [fetchMetrics, fetchLogs]);

  // Load Test Controls
  const handleStartBenchmark = async (rps: number, scenario: string) => {
    try {
      await fetch('/api/v1/benchmark/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rps, scenario }),
      });
      fetchMetrics();
    } catch (err) {
      console.error('Error starting benchmark:', err);
    }
  };

  const handleStopBenchmark = async () => {
    try {
      await fetch('/api/v1/benchmark/stop', { method: 'POST' });
      fetchMetrics();
    } catch (err) {
      console.error('Error stopping benchmark:', err);
    }
  };

  const handleToggleBenchmark = () => {
    if (metrics?.load_test_active) {
      handleStopBenchmark();
    } else {
      handleStartBenchmark(3500, 'steady');
    }
  };

  // Graceful Shutdown Simulation
  const handleSimulateShutdown = async () => {
    setShutdownSimulating(true);
    try {
      const res = await fetch('/api/v1/simulate/shutdown', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setShutdownReport(data.report);
      }
      fetchMetrics();
      fetchLogs();
    } catch (err) {
      console.error('Error simulating shutdown:', err);
    } finally {
      setShutdownSimulating(false);
    }
  };

  // Concurrency Config Hot Reload
  const handleUpdateConfig = async (newConfig: any) => {
    await fetch('/api/v1/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig),
    });
    fetchMetrics();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/20 selection:text-cyan-300">
      {/* Sticky App Header */}
      <Header
        metrics={metrics}
        onSimulateShutdown={handleSimulateShutdown}
        onOpenSendModal={() => setIsSendModalOpen(true)}
        onToggleBenchmark={handleToggleBenchmark}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        shutdownSimulating={shutdownSimulating}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        {/* Graceful Shutdown Alert Banner */}
        <ShutdownSimulationBanner report={shutdownReport} onDismiss={() => setShutdownReport(null)} />

        {/* Global KPI Telemetry Cards */}
        <MetricsCards metrics={metrics} />

        {/* Tab Views */}
        {activeTab === 'dashboard' && (
          <div className="space-y-5 animate-fadeIn">
            {/* Interactive Architecture Flow & Concurrency Inspection */}
            <ArchitectureFlow metrics={metrics} />

            {/* Live Throughput Charts */}
            <LoadTestStudio
              metrics={metrics}
              history={history}
              onStartBenchmark={handleStartBenchmark}
              onStopBenchmark={handleStopBenchmark}
            />

            {/* Streaming Logs */}
            <StructuredLogViewer logs={logs} persistedRecords={persistedRecords} />
          </div>
        )}

        {activeTab === 'loadtest' && (
          <div className="animate-fadeIn">
            <LoadTestStudio
              metrics={metrics}
              history={history}
              onStartBenchmark={handleStartBenchmark}
              onStopBenchmark={handleStopBenchmark}
            />
          </div>
        )}

        {activeTab === 'config' && (
          <div className="animate-fadeIn">
            <ConfigPanel metrics={metrics} onUpdateConfig={handleUpdateConfig} />
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="animate-fadeIn">
            <StructuredLogViewer logs={logs} persistedRecords={persistedRecords} />
          </div>
        )}

        {activeTab === 'code' && (
          <div className="animate-fadeIn">
            <GoCodeExplorer />
          </div>
        )}
      </main>

      {/* Manual Ingestion Event Sender Modal */}
      <EventSenderModal
        isOpen={isSendModalOpen}
        onClose={() => setIsSendModalOpen(false)}
        onEventSent={() => {
          fetchMetrics();
          fetchLogs();
        }}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-mono text-slate-500">
          <div>
            Distributed High-Throughput Event Ingestion Engine &middot; Go 1.22 Concurrency Architecture
          </div>
          <div className="flex items-center gap-3">
            <span>chan TelemetryEvent</span>
            <span>&bull;</span>
            <span>sync.WaitGroup</span>
            <span>&bull;</span>
            <span>MongoDB BulkWrite</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
