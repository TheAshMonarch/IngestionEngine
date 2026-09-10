import React, { useState } from 'react';
import { X, Send, Zap, CheckCircle2, AlertCircle, Copy, Layers } from 'lucide-react';

interface EventSenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEventSent: () => void;
}

export const EventSenderModal: React.FC<EventSenderModalProps> = ({ isOpen, onClose, onEventSent }) => {
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [service, setService] = useState<string>('payment-gateway');
  const [level, setLevel] = useState<string>('INFO');
  const [message, setMessage] = useState<string>('Payment intent authorized successfully via Stripe');
  const [batchCount, setBatchCount] = useState<number>(25);
  const [loading, setLoading] = useState<boolean>(false);
  const [responseResult, setResponseResult] = useState<any | null>(null);

  if (!isOpen) return null;

  const handleSend = async () => {
    setLoading(true);
    setResponseResult(null);

    try {
      if (mode === 'single') {
        const payload = {
          service,
          level,
          message,
          host: 'prod-api-01.us-east',
          timestamp: new Date().toISOString(),
          payload: {
            auth_duration_ms: Math.floor(Math.random() * 45) + 5,
            user_id: 'usr_8923f1',
          },
        };

        const res = await fetch('/api/v1/events/single', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        setResponseResult({ status: res.status, data });
      } else {
        const events = [];
        for (let i = 0; i < batchCount; i++) {
          events.push({
            service,
            level,
            message: `${message} [item #${i + 1}]`,
            host: `node-${(i % 8) + 1}.internal`,
            timestamp: new Date().toISOString(),
          });
        }

        const res = await fetch('/api/v1/events/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events }),
        });

        const data = await res.json();
        setResponseResult({ status: res.status, data });
      }

      onEventSent();
    } catch (err: any) {
      setResponseResult({ status: 500, error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold font-mono text-slate-100 uppercase">
              Manual Ingestion Event Dispatcher
            </h3>
            <p className="text-xs text-slate-400">
              Dispatches strict JSON telemetry payloads to the HTTP Ingestion Router
            </p>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 mb-4">
          <button
            onClick={() => setMode('single')}
            className={`flex-1 py-1.5 text-xs font-mono rounded-md font-medium transition-colors ${
              mode === 'single' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Single Event (POST /events/single)
          </button>
          <button
            onClick={() => setMode('batch')}
            className={`flex-1 py-1.5 text-xs font-mono rounded-md font-medium transition-colors ${
              mode === 'batch' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Batch Array (POST /events/batch)
          </button>
        </div>

        {/* Form Fields */}
        <div className="space-y-3 font-mono text-xs">
          <div>
            <label className="block text-slate-400 mb-1 text-[11px]">Service Name</label>
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="payment-gateway">payment-gateway</option>
              <option value="auth-service">auth-service</option>
              <option value="telemetry-agent">telemetry-agent</option>
              <option value="order-router">order-router</option>
              <option value="database-cluster">database-cluster</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 text-[11px]">Severity Level</label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="INFO">INFO</option>
              <option value="WARN">WARN</option>
              <option value="ERROR">ERROR</option>
              <option value="DEBUG">DEBUG</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 text-[11px]">Message Payload</label>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {mode === 'batch' && (
            <div>
              <label className="block text-slate-400 mb-1 text-[11px]">Batch Size ({batchCount} records)</label>
              <input
                type="range"
                min={5}
                max={500}
                step={5}
                value={batchCount}
                onChange={(e) => setBatchCount(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="mt-5">
          <button
            onClick={handleSend}
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs font-mono transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>{loading ? 'TRANSMITTING...' : 'INGEST EVENT (NON-BLOCKING)'}</span>
          </button>
        </div>

        {/* Response Feedback */}
        {responseResult && (
          <div className="mt-4 p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs">
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800">
              <span className="text-slate-400 text-[10px]">HTTP Response</span>
              <span
                className={`font-bold ${
                  responseResult.status === 202 || responseResult.status === 200
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                HTTP {responseResult.status}
              </span>
            </div>
            <pre className="text-slate-300 text-[11px] overflow-x-auto">
              {JSON.stringify(responseResult.data || responseResult.error, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
