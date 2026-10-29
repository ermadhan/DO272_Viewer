import React from 'react';
import { Database, Download, Terminal, Plane, Compass, ShieldAlert, Cpu, BookOpen, Layers } from 'lucide-react';
import { DatabaseEngine } from '../services/databaseSchema';

interface HeaderProps {
  activeTab: 'map' | 'features' | 'routing' | 'obstacles' | 'sql' | 'mcp' | 'windows';
  setActiveTab: (tab: 'map' | 'features' | 'routing' | 'obstacles' | 'sql' | 'mcp' | 'windows') => void;
  selectedIcao: string;
  onSelectIcao: (icao: string) => void;
  databaseEngine: DatabaseEngine;
  onToggleDatabaseEngine: (engine: DatabaseEngine) => void;
  onOpenIngest: () => void;
  onOpenWindowsGuide: () => void;
  onOpenCatalogue: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  selectedIcao,
  onSelectIcao,
  databaseEngine,
  onToggleDatabaseEngine,
  onOpenIngest,
  onOpenWindowsGuide,
  onOpenCatalogue,
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-slate-950 border-b border-slate-800 text-slate-100 select-none">
      {/* Zone 1: Single text wordmark with subtle aeronautical glyph & Engine Toggle */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-sky-950 border border-sky-800 flex items-center justify-center text-sky-400">
          <Plane className="w-4 h-4 transform -rotate-45" />
        </div>
        <div>
          <span className="text-base font-semibold tracking-tight text-white whitespace-nowrap">
            DO-272 Spatial GIS
          </span>
          <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 leading-none mt-0.5">
            <span>RTCA SC-217</span>
            <span>·</span>
            <span>ED-99</span>
            <span>·</span>
            <span className={databaseEngine === 'postgres' ? 'text-emerald-400 font-bold' : 'text-sky-400 font-bold'}>
              {databaseEngine === 'postgres' ? 'PostgreSQL (PostGIS)' : 'SQLite (SpatiaLite)'}
            </span>
          </div>
        </div>

        {/* Database Engine Switcher Toggle */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-[10px] font-mono ml-2">
          <button
            onClick={() => onToggleDatabaseEngine('postgres')}
            className={`px-2 py-1 rounded transition-colors cursor-pointer ${
              databaseEngine === 'postgres'
                ? 'bg-emerald-600 text-white font-bold shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Switch to PostgreSQL 16 + PostGIS 3.4 Spatial Dialect"
          >
            PostgreSQL
          </button>
          <button
            onClick={() => onToggleDatabaseEngine('sqlite')}
            className={`px-2 py-1 rounded transition-colors cursor-pointer ${
              databaseEngine === 'sqlite'
                ? 'bg-sky-600 text-white font-bold shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Switch to SQLite 3 + SpatiaLite Dialect"
          >
            SQLite
          </button>
        </div>
      </div>

      {/* Zone 2: Navigation Links / Segmented Tabs */}
      <nav className="hidden lg:flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800 text-sm font-medium">
        <button
          onClick={() => setActiveTab('map')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'map'
              ? 'bg-slate-800 text-white shadow-sm font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Compass className="w-3.5 h-3.5 text-sky-400" />
          Interactive Map
        </button>
        <button
          onClick={() => setActiveTab('features')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'features'
              ? 'bg-slate-800 text-white shadow-sm font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Browse, filter, and search all DO-272 features"
        >
          <Layers className="w-3.5 h-3.5 text-sky-400" />
          DO-272 Features
        </button>
        <button
          onClick={() => setActiveTab('routing')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap ${
            activeTab === 'routing'
              ? 'bg-slate-800 text-white shadow-sm font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Plane className="w-3.5 h-3.5 text-amber-400" />
          Taxiway Routing
        </button>
        <button
          onClick={() => setActiveTab('obstacles')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap ${
            activeTab === 'obstacles'
              ? 'bg-slate-800 text-white shadow-sm font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-violet-400" />
          3D Obstacles
        </button>
        <button
          onClick={() => setActiveTab('sql')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap ${
            activeTab === 'sql'
              ? 'bg-slate-800 text-white shadow-sm font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          PostGIS SQL
        </button>
        <button
          onClick={() => setActiveTab('mcp')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap ${
            activeTab === 'mcp'
              ? 'bg-slate-800 text-white shadow-sm font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          MCP Studio
        </button>
        <button
          onClick={onOpenCatalogue}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap text-slate-400 hover:text-white hover:bg-slate-800/80 cursor-pointer"
          title="View RTCA DO-272 / ED-99 standard 43 feature data dictionary"
        >
          <BookOpen className="w-3.5 h-3.5 text-sky-400" />
          DO-272 43 Features
        </button>
        <button
          onClick={() => onOpenWindowsGuide()}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap text-slate-400 hover:text-slate-200 cursor-pointer"
        >
          <Terminal className="w-3.5 h-3.5 text-indigo-400" />
          Windows Setup
        </button>
      </nav>

      {/* Zone 3: Aerodrome Switcher + Ingest Open Data */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs">
          <span className="text-slate-400 mr-2 text-[11px] font-mono uppercase">Hub:</span>
          <select
            value={selectedIcao}
            onChange={(e) => onSelectIcao(e.target.value)}
            className="bg-transparent text-white font-mono text-xs focus:outline-none cursor-pointer pr-1"
          >
            <option value="KSFO" className="bg-slate-900 text-white">KSFO (San Francisco)</option>
            <option value="EGLL" className="bg-slate-900 text-white">EGLL (London Heathrow)</option>
            <option value="EDDF" className="bg-slate-900 text-white">EDDF (Frankfurt)</option>
            <option value="OMDB" className="bg-slate-900 text-white">OMDB (Dubai)</option>
          </select>
        </div>

        <button
          onClick={onOpenIngest}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors whitespace-nowrap shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          Ingest Open Data
        </button>
      </div>
    </header>
  );
};
