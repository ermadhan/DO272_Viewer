import React, { useState } from 'react';
import { X, Terminal, Copy, Check, ExternalLink, HardDrive, Cpu, ShieldCheck } from 'lucide-react';

interface WindowsSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WindowsSetupModal: React.FC<WindowsSetupModalProps> = ({ isOpen, onClose }) => {
  const [activeCodeTab, setActiveCodeTab] = useState<'batch' | 'docker' | 'mcp'>('batch');
  const [copied, setCopied] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const batchCode = `@echo off
echo ========================================================
echo  Starting DO-272 Spatial FastAPI Backend on Windows
echo ========================================================

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Python is not found in PATH. Please install Python 3.10+ from python.org.
    pause
    exit /b 1
)

if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)

call venv\\Scripts\\activate
pip install -r requirements.txt

set POSTGRES_URL=postgresql://postgres:postgrespassword@localhost:5432/do272_aerodromes
echo Starting FastAPI server at http://127.0.0.1:8000
python main.py
pause`;

  const dockerCode = `version: '3.8'

services:
  postgis:
    image: postgis/postgis:16-3.4
    container_name: do272_postgis
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgrespassword
      POSTGRES_DB: do272_aerodromes
    ports:
      - "5432:5432"
    volumes:
      - postgis_data:/var/lib/postgresql/data
    restart: always

volumes:
  postgis_data:`;

  const mcpConfigCode = `{
  "mcpServers": {
    "do272-aerodrome-gis": {
      "command": "python",
      "args": [
        "C:\\\\Users\\\\User\\\\do272-gis\\\\python_backend\\\\mcp_server.py"
      ],
      "env": {
        "POSTGRES_URL": "postgresql://postgres:postgrespassword@localhost:5432/do272_aerodromes"
      }
    }
  }
}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl text-slate-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-mono">
                Windows PC Deployment Guide
              </h2>
              <p className="text-xs text-slate-400">
                Run FastAPI, PostgreSQL/PostGIS, and the Model Context Protocol (MCP) server locally.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs font-mono">
          {/* 3 Step Deployment Instructions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-sky-400 font-bold">
                <HardDrive className="w-4 h-4" />
                <span>1. Prerequisites</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Install Python 3.10+ (check "Add Python to PATH") and Docker Desktop for Windows.
              </p>
            </div>

            <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>2. Start PostGIS</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Run <code className="text-emerald-400">docker compose up -d</code> in <code className="text-slate-300">/python_backend</code> or use local PostgreSQL.
              </p>
            </div>

            <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-indigo-400 font-bold">
                <Cpu className="w-4 h-4" />
                <span>3. Launch Servers</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Double-click <code className="text-indigo-400">start_backend.bat</code> for FastAPI and connect MCP to Claude Desktop.
              </p>
            </div>
          </div>

          {/* Code Viewer */}
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveCodeTab('batch')}
                  className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                    activeCodeTab === 'batch'
                      ? 'bg-slate-800 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  start_backend.bat
                </button>
                <button
                  onClick={() => setActiveCodeTab('docker')}
                  className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                    activeCodeTab === 'docker'
                      ? 'bg-slate-800 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  docker-compose.yml
                </button>
                <button
                  onClick={() => setActiveCodeTab('mcp')}
                  className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                    activeCodeTab === 'mcp'
                      ? 'bg-slate-800 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  claude_desktop_config.json
                </button>
              </div>

              <button
                onClick={() => {
                  const code =
                    activeCodeTab === 'batch'
                      ? batchCode
                      : activeCodeTab === 'docker'
                      ? dockerCode
                      : mcpConfigCode;
                  copyToClipboard(code, activeCodeTab);
                }}
                className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors border border-slate-700"
              >
                {copied === activeCodeTab ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy File</span>
                  </>
                )}
              </button>
            </div>

            <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-slate-300 text-xs overflow-x-auto leading-relaxed">
              {activeCodeTab === 'batch' && batchCode}
              {activeCodeTab === 'docker' && dockerCode}
              {activeCodeTab === 'mcp' && mcpConfigCode}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
