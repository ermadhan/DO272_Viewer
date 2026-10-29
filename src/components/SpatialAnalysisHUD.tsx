import React, { useState } from 'react';
import {
  AerodromeDataset,
  TaxiRouteResult,
  ObstacleCheckResult,
} from '../types/do272';
import {
  calculateTaxiRoute,
  evaluateObstacleClearances,
  executeSpatialSql,
  SpatialSqlResult,
} from '../services/spatialEngine';
import {
  DatabaseEngine,
  REPLICATED_DO272_TABLES,
  generateFullDdlScript,
} from '../services/databaseSchema';
import {
  Plane,
  ShieldAlert,
  Database,
  ArrowRight,
  Play,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Navigation,
  FileCode,
  Copy,
  Check,
  Layers,
} from 'lucide-react';

interface SpatialAnalysisHUDProps {
  dataset: AerodromeDataset;
  activeRoute: TaxiRouteResult | null;
  setActiveRoute: (route: TaxiRouteResult | null) => void;
  onHighlightFeatures: (ids: string[]) => void;
  databaseEngine: DatabaseEngine;
  onToggleDatabaseEngine: (engine: DatabaseEngine) => void;
}

export const SpatialAnalysisHUD: React.FC<SpatialAnalysisHUDProps> = ({
  dataset,
  activeRoute,
  setActiveRoute,
  onHighlightFeatures,
  databaseEngine,
  onToggleDatabaseEngine,
}) => {
  const [activeTab, setActiveTab] = useState<'routing' | 'obstacles' | 'sql' | 'schema'>('routing');

  // Ground Routing State
  const [originKey, setOriginKey] = useState<string>('SFO-TGL-EXIT-28L-F');
  const [destinationKey, setDestinationKey] = useState<string>('SFO-STAND-A6');

  // Obstacle Clearance State
  const [obstacleResults, setObstacleResults] = useState<ObstacleCheckResult[]>([]);
  const [hasEvaluatedObstacles, setHasEvaluatedObstacles] = useState(false);

  // SQL State
  const [sqlQuery, setSqlQuery] = useState<string>(
    'SELECT runway_id, designator, length_m, pcn_rating FROM do272_runways WHERE length_m > 3000'
  );
  const [sqlResult, setSqlResult] = useState<SpatialSqlResult | null>(null);

  // Schema state
  const [copiedDdl, setCopiedDdl] = useState<boolean>(false);
  const [selectedSchemaTable, setSelectedSchemaTable] = useState<string>('do272_runway_elements');

  // Find routing origins (exits/guidance lines) and destinations (parking stands)
  const originOptions = dataset.features.filter(
    (f) =>
      f.featureClass === 'TaxiwayGuidanceLine' ||
      f.featureClass === 'RunwayThreshold' ||
      f.featureClass === 'RunwayHoldingPosition'
  );

  const destinationOptions = dataset.features.filter(
    (f) => f.featureClass === 'ParkingStandArea'
  );

  const handleSolveRoute = () => {
    const route = calculateTaxiRoute(dataset, originKey, destinationKey);
    setActiveRoute(route);
  };

  const handleClearRoute = () => {
    setActiveRoute(null);
  };

  const handleRunObstacleEvaluation = () => {
    const results = evaluateObstacleClearances(dataset);
    setObstacleResults(results);
    setHasEvaluatedObstacles(true);
    const breachingIds = results.filter((r) => r.isPenetrating).map((r) => r.structureId);
    onHighlightFeatures(breachingIds);
  };

  const handleExecuteSql = () => {
    const res = executeSpatialSql(dataset, sqlQuery, databaseEngine);
    setSqlResult(res);
    onHighlightFeatures(res.affectedFeatureIds);
  };

  const handleCopyDdl = () => {
    const script = generateFullDdlScript(databaseEngine);
    navigator.clipboard.writeText(script);
    setCopiedDdl(true);
    setTimeout(() => setCopiedDdl(false), 2000);
  };

  const currentTableSchema = REPLICATED_DO272_TABLES.find(
    (t) => t.tableName === selectedSchemaTable
  ) || REPLICATED_DO272_TABLES[1];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl text-slate-100 p-5 flex flex-col h-full max-h-[85vh] overflow-hidden">
      {/* HUD Header & Segmented Tabs */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
        <div>
          <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest block">
            Spatial Analysis Engine · {databaseEngine === 'postgres' ? 'PostgreSQL (PostGIS)' : 'SQLite (SpatiaLite)'}
          </span>
          <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
            <span>{dataset.icao} Aeronautical Analytics</span>
          </h2>
        </div>

        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
          <button
            onClick={() => setActiveTab('routing')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'routing'
                ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plane className="w-3.5 h-3.5 text-amber-400" />
            Taxi Routing
          </button>
          <button
            onClick={() => {
              setActiveTab('obstacles');
              if (!hasEvaluatedObstacles) handleRunObstacleEvaluation();
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'obstacles'
                ? 'bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
            3D Obstacles
          </button>
          <button
            onClick={() => setActiveTab('sql')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'sql'
                ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            SQL Terminal
          </button>
          <button
            onClick={() => setActiveTab('schema')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'schema'
                ? 'bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5 text-sky-400" />
            Replicated Schema
          </button>
        </div>
      </div>

      {/* Main HUD Body */}
      <div className="flex-1 overflow-y-auto pt-4 text-xs space-y-4">
        {/* 1. GROUND TAXIWAY ROUTING */}
        {activeTab === 'routing' && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-3 font-mono">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1">
                    Origin (Runway Exit / Point)
                  </label>
                  <select
                    value={originKey}
                    onChange={(e) => setOriginKey(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                  >
                    {originOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.designator} ({opt.featureClass})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1">
                    Destination (Gate / Parking Stand)
                  </label>
                  <select
                    value={destinationKey}
                    onChange={(e) => setDestinationKey(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                  >
                    {destinationOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.designator} ({opt.properties?.terminal || 'Apron'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSolveRoute}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg transition-colors text-xs shadow-md cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Solve Optimal Taxi Route
                </button>
                {activeRoute && (
                  <button
                    onClick={handleClearRoute}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors text-xs border border-slate-700 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Clear Path
                  </button>
                )}
              </div>
            </div>

            {/* Active Route Telemetry */}
            {activeRoute ? (
              <div className="p-4 bg-slate-950/80 rounded-xl border border-amber-900/50 space-y-3 font-mono">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2 text-amber-400 font-bold">
                    <Navigation className="w-4 h-4" />
                    <span>Active Route: {activeRoute.origin} → {activeRoute.destination}</span>
                  </div>
                  <div className="flex items-center gap-4 text-slate-300 tabular-nums">
                    <span>Dist: <strong className="text-white">{activeRoute.totalDistanceMeters}m</strong></span>
                    <span>Est Time: <strong className="text-white">{activeRoute.estimatedTaxiMinutes} min</strong> @ 15kt</span>
                  </div>
                </div>

                {/* Hold positions & Hot Spots Alerts */}
                {activeRoute.holdPositionsEncountered.length > 0 && (
                  <div className="flex items-start gap-2 p-2 bg-rose-950/40 border border-rose-900/80 rounded text-rose-200">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-rose-300">Mandatory Runway Hold Short Required:</strong>
                      <span className="text-[11px]">
                        {activeRoute.holdPositionsEncountered.join(', ')}
                      </span>
                    </div>
                  </div>
                )}

                {activeRoute.hotSpotsEncountered.length > 0 && (
                  <div className="flex items-start gap-2 p-2 bg-amber-950/40 border border-amber-900/80 rounded text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-amber-300">Runway Incursion Hazard Zone:</strong>
                      <span className="text-[11px]">Route traverses {activeRoute.hotSpotsEncountered.join(', ')}. Extreme situational awareness advised.</span>
                    </div>
                  </div>
                )}

                {/* Turn-by-Turn Steps */}
                <div>
                  <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1.5">
                    Ground Dispatch Sequence
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-300 text-xs">
                    {activeRoute.routeSteps.map((step, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ) : (
              <div className="p-8 border border-dashed border-slate-800 rounded-xl text-center text-slate-500 font-mono">
                Select an origin runway exit and destination stand, then click "Solve Optimal Taxi Route" to visualize network routing on the map.
              </div>
            )}
          </div>
        )}

        {/* 2. 3D OBSTACLE CLEARANCE EVALUATOR */}
        {activeTab === 'obstacles' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono">
              <div>
                <span className="text-slate-300 font-bold block">
                  FAA Part 77 / ICAO Annex 14 Imaginary Surfaces
                </span>
                <span className="text-[11px] text-slate-400">
                  Transitional Surface (1:7) · Approach Surface (1:50) · Inner Horizontal (45m)
                </span>
              </div>
              <button
                onClick={handleRunObstacleEvaluation}
                className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition-colors text-xs cursor-pointer"
              >
                Re-evaluate 3D Envelopes
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left font-mono text-[11px]">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase">
                  <tr>
                    <th className="p-2.5">Structure</th>
                    <th className="p-2.5">Height (AGL)</th>
                    <th className="p-2.5">Elev (AMSL)</th>
                    <th className="p-2.5">Applicable Surface</th>
                    <th className="p-2.5">Max Allowed</th>
                    <th className="p-2.5">Clearance Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
                  {obstacleResults.map((obs) => (
                    <tr
                      key={obs.structureId}
                      className={obs.isPenetrating ? 'bg-rose-950/20' : 'hover:bg-slate-800/40'}
                    >
                      <td className="p-2.5 font-bold text-white">{obs.structureName}</td>
                      <td className="p-2.5 tabular-nums text-slate-300">{obs.heightAgl} m</td>
                      <td className="p-2.5 tabular-nums text-slate-300">{obs.elevationAmsl} m</td>
                      <td className="p-2.5 text-purple-300">{obs.applicableSurface}</td>
                      <td className="p-2.5 tabular-nums text-slate-300">{obs.allowedMaxElevationAmsl} m</td>
                      <td className="p-2.5">
                        {obs.isPenetrating ? (
                          <span className="inline-flex items-center gap-1 text-rose-400 font-bold">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Breach (+{obs.penetrationMeters}m)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Nominal
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. POSTGIS / SQLITE SQL TERMINAL */}
        {activeTab === 'sql' && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-3 font-mono">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider">
                    Spatial SQL Engine:
                  </span>
                  <div className="flex items-center bg-slate-900 border border-slate-700 rounded p-0.5 text-[10px]">
                    <button
                      onClick={() => onToggleDatabaseEngine('postgres')}
                      className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                        databaseEngine === 'postgres'
                          ? 'bg-emerald-600 text-white font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      PostgreSQL + PostGIS
                    </button>
                    <button
                      onClick={() => onToggleDatabaseEngine('sqlite')}
                      className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                        databaseEngine === 'sqlite'
                          ? 'bg-sky-600 text-white font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      SQLite + SpatiaLite
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setSqlQuery(
                        'SELECT runway_id, designator, length_m, pcn_rating FROM do272_runways WHERE length_m > 3000'
                      )
                    }
                    className="text-[10px] text-sky-400 hover:underline"
                  >
                    Runways &gt; 3000m
                  </button>
                  <span className="text-slate-600">·</span>
                  <button
                    onClick={() =>
                      setSqlQuery(
                        'SELECT structure_id, structure_name, height_agl_m FROM do272_obstacles WHERE height_agl_m > 50'
                      )
                    }
                    className="text-[10px] text-sky-400 hover:underline"
                  >
                    Obstacles &gt; 50m
                  </button>
                  <span className="text-slate-600">·</span>
                  <button
                    onClick={() =>
                      setSqlQuery(
                        databaseEngine === 'postgres'
                          ? 'SELECT hotspot_id, designator, ST_Buffer(geom, 150) FROM do272_hotspots'
                          : 'SELECT hotspot_id, designator, ST_Buffer(geom, 150) FROM do272_hot_spots'
                      )
                    }
                    className="text-[10px] text-sky-400 hover:underline"
                  >
                    Hotspot Buffers
                  </button>
                </div>
              </div>

              <textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                rows={3}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-emerald-400 font-mono focus:outline-none focus:border-emerald-500"
                placeholder="Enter spatial SQL..."
              />

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500">
                  Target Dialect: <strong className="text-slate-300">{databaseEngine.toUpperCase()}</strong>
                </span>

                <button
                  onClick={handleExecuteSql}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors text-xs shadow-md cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Execute Spatial Query ({databaseEngine === 'postgres' ? 'PostgreSQL' : 'SQLite'})
                </button>
              </div>
            </div>

            {/* SQL Results Grid */}
            {sqlResult && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>
                    Engine: <strong className="text-emerald-400 uppercase">{sqlResult.engine}</strong> · Rows: <strong className="text-white">{sqlResult.rows.length}</strong>
                  </span>
                  <span>Execution time: {sqlResult.executionTimeMs} ms</span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left font-mono text-[11px]">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase">
                      <tr>
                        {sqlResult.columns.map((col, idx) => (
                          <th key={idx} className="p-2.5">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
                      {sqlResult.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-800/40">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="p-2.5 text-slate-200">
                              {String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. REPLICATED SCHEMA DDL INSPECTOR */}
        {activeTab === 'schema' && (
          <div className="space-y-4 font-mono">
            {/* Engine Selector & Export DDL */}
            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-slate-400 uppercase">Replication Target:</span>
                <div className="flex items-center bg-slate-900 border border-slate-700 rounded p-0.5 text-xs">
                  <button
                    onClick={() => onToggleDatabaseEngine('postgres')}
                    className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                      databaseEngine === 'postgres'
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    PostgreSQL 16 (PostGIS)
                  </button>
                  <button
                    onClick={() => onToggleDatabaseEngine('sqlite')}
                    className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                      databaseEngine === 'sqlite'
                        ? 'bg-sky-600 text-white font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    SQLite 3 (SpatiaLite)
                  </button>
                </div>
              </div>

              <button
                onClick={handleCopyDdl}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs transition-colors border border-slate-700 cursor-pointer"
              >
                {copiedDdl ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied Full .sql Dump</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Export {databaseEngine.toUpperCase()} DDL</span>
                  </>
                )}
              </button>
            </div>

            {/* Table Selector Tabs */}
            <div className="flex flex-wrap gap-1.5 pb-1">
              {REPLICATED_DO272_TABLES.map((t) => (
                <button
                  key={t.tableName}
                  onClick={() => setSelectedSchemaTable(t.tableName)}
                  className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                    selectedSchemaTable === t.tableName
                      ? 'bg-sky-600 text-white font-bold shadow-xs'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {t.tableName}
                </button>
              ))}
            </div>

            {/* Side-by-side or active table DDL comparison */}
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div>
                  <span className="text-[10px] text-sky-400 uppercase tracking-widest block">
                    DO-272 Replicated Table: {currentTableSchema.featureClass}
                  </span>
                  <h4 className="text-sm font-bold text-white font-mono">
                    {currentTableSchema.tableName}
                  </h4>
                </div>
                <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded text-slate-400 border border-slate-800">
                  {currentTableSchema.columns.length} Columns
                </span>
              </div>

              {/* DDL Code Viewer */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-slate-500 uppercase">
                  {databaseEngine === 'postgres' ? 'PostgreSQL PostGIS DDL' : 'SQLite SpatiaLite DDL'}:
                </span>
                <pre className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-emerald-400 text-[11px] overflow-x-auto leading-relaxed">
                  {databaseEngine === 'postgres' ? currentTableSchema.postgresDDL : currentTableSchema.sqliteDDL}
                </pre>
              </div>

              {/* Exact Column Replication Mapping */}
              <div className="space-y-1.5 pt-2">
                <span className="text-[10px] text-slate-500 uppercase">Exact Column Type Mapping:</span>
                <div className="overflow-x-auto rounded border border-slate-800">
                  <table className="w-full text-left text-[10px]">
                    <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase">
                      <tr>
                        <th className="p-1.5">Column</th>
                        <th className="p-1.5 text-emerald-400">PostgreSQL Type</th>
                        <th className="p-1.5 text-sky-400">SQLite Type</th>
                        <th className="p-1.5">DO-272 Meaning</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/60">
                      {currentTableSchema.columns.map((c) => (
                        <tr key={c.name} className="hover:bg-slate-900/40">
                          <td className="p-1.5 font-bold text-white">{c.name}</td>
                          <td className="p-1.5 text-emerald-300 font-mono">{c.typePostgres}</td>
                          <td className="p-1.5 text-sky-300 font-mono">{c.typeSqlite}</td>
                          <td className="p-1.5 text-slate-400">{c.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
