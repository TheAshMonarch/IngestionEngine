import React, { useState, useEffect } from 'react';
import { Code2, Copy, Check, FileCode, Folder, Download, Terminal, Sparkles } from 'lucide-react';
import { GoSourceFile } from '../types';

export const GoCodeExplorer: React.FC = () => {
  const [files, setFiles] = useState<GoSourceFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<GoSourceFile | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetch('/api/v1/go-code')
      .then((res) => res.json())
      .then((data) => {
        if (data.files && data.files.length > 0) {
          setFiles(data.files);
          const defaultFile = data.files.find((f: GoSourceFile) => f.path.includes('main.go')) || data.files[0];
          setSelectedFile(defaultFile);
        }
      })
      .catch((err) => console.error('Failed to load Go files:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = () => {
    if (!selectedFile) return;
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-800/80 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-bold font-mono text-slate-100 uppercase tracking-wide">
              Production Go Concurrency Engine Source Code
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              Go 1.22+ Standard Lib &amp; Drivers
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Complete idiomatic implementation of worker pools, bounded channels, token bucket limiter, and batch flusher.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            disabled={!selectedFile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono border border-slate-700 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied!' : 'Copy File'}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-slate-500 font-mono text-xs animate-pulse">
          Loading Go repository manifests...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* File Tree Sidebar */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 max-h-[500px] overflow-y-auto">
            <div className="text-[10px] font-mono uppercase text-slate-500 font-bold mb-2 flex items-center gap-1">
              <Folder className="w-3 h-3 text-cyan-400" />
              <span>Repository Tree</span>
            </div>
            <div className="space-y-1">
              {files.map((file) => {
                const isSelected = selectedFile?.path === file.path;
                return (
                  <button
                    key={file.path}
                    onClick={() => setSelectedFile(file)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors flex items-center gap-2 ${
                      isSelected
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{file.path}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
              <div className="font-mono text-[10px] uppercase font-bold text-slate-500 mb-1">
                Quick Run
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] text-cyan-300 select-all">
                go run cmd/server/main.go
              </div>
            </div>
          </div>

          {/* Code Viewer */}
          <div className="md:col-span-3 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex flex-col max-h-[500px]">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-slate-800 text-xs font-mono text-slate-400">
              <span className="text-slate-200 font-semibold">{selectedFile?.path}</span>
              <span>{selectedFile?.content.split('\n').length} lines</span>
            </div>
            <pre className="p-4 overflow-auto font-mono text-xs leading-relaxed text-slate-200 bg-slate-950/90 select-text flex-1">
              <code>{selectedFile?.content}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
