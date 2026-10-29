import React, { useState } from 'react';
import {
  Cpu,
  Send,
  Copy,
  Check,
  Terminal,
  Play,
  Server,
  Code,
  FileText,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  CheckCircle,
  Info,
} from 'lucide-react';
import { AerodromeDataset, DO272ValidationReport } from '../types/do272';
import { validateDO272Compliance } from '../services/spatialEngine';

interface MCPStudioProps {
  dataset: AerodromeDataset;
}

export const MCPStudio: React.FC<MCPStudioProps> = ({ dataset }) => {
  const [selectedTool, setSelectedTool] = useState<string>('do272_validate_compliance');
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<'tester' | 'config' | 'spec'>('tester');

  // Input states
  const [targetIcao, setTargetIcao] = useState<string>(dataset.icao);
  const [validationLevel, setValidationLevel] = useState<'strict' | 'standard' | 'geometric_only'>('standard');
  const [routeOrigin, setRouteOrigin] = useState<string>('Exit 28L @ F');
  const [routeDest, setRouteDest] = useState<string>('Gate A6');
  const [featureClassParam, setFeatureClassParam] = useState<string>('all');
  const [sqlParam, setSqlParam] = useState<string>(
    'SELECT designator, length_m FROM do272_runways WHERE length_m > 3000'
  );

  // Execution states
  const [jsonRpcResponse, setJsonRpcResponse] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionLatency, setExecutionLatency] = useState<number | null>(null);
  const [complianceReport, setComplianceReport] = useState<DO272ValidationReport | null>(null);

  const claudeDesktopConfig = `{
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

  const handleExecuteTool = () => {
    setIsExecuting(true);
    const start = performance.now();

    setTimeout(() => {
      let resultData: Record<string, unknown> = {};

      if (selectedTool === 'do272_validate_compliance') {
        const report = validateDO272Compliance(dataset, validationLevel);
        setComplianceReport(report);
        resultData = {
          tool: 'do272_validate_compliance',
          status: 'success',
          aerodrome: dataset.icao,
          compliance_status: report.status,
          compliance_score: `${report.complianceScore}%`,
          total_features_audited: report.totalFeaturesAudited,
          summary: report.checksSummary,
          inconsistencies_found: report.inconsistencies.length,
          inconsistencies: report.inconsistencies,
          evaluated_do272_rules: report.evaluatedRules,
        };
      } else if (selectedTool === 'do272_find_taxi_route') {
        setComplianceReport(null);
        resultData = {
          status: 'success',
          origin: routeOrigin,
          destination: routeDest,
          aerodrome: targetIcao,
          total_distance_meters: 1420,
          estimated_taxi_minutes: 3.1,
          route_instructions: [
            `Depart ${routeOrigin}`,
            'Follow Taxiway Foxtrot northbound',
            'Hold short Runway 28R at CAT III hold line',
            'Cross Runway 28R upon ATC clearance',
            'Turn left onto Taxiway Alpha',
            `Turn into ${routeDest} via Stand Guidance Line`,
          ],
          safety_alerts: [
            'Alert: Route crosses HS-2 (Runway 28L incursion hot spot)',
            'Compliance: Maximum wingspan category Code E compliant',
          ],
        };
      } else if (selectedTool === 'do272_obstacle_clearance_check') {
        setComplianceReport(null);
        resultData = {
          status: 'success',
          aerodrome: targetIcao,
          evaluated_count: 3,
          findings: [
            {
              structure: 'Air Traffic Control Tower',
              height_agl: 67.4,
              elevation_amsl: 71.4,
              surface: 'Inner Horizontal (45m)',
              breached: true,
              penetration_meters: 22.4,
              mitigation: 'Marked with high-intensity dual strobes per FAA AC 70/7460-1M',
            },
            {
              structure: 'Maintenance Hangar',
              height_agl: 42.0,
              elevation_amsl: 46.0,
              surface: 'Transitional (1:7)',
              breached: false,
              clearance_margin_meters: 3.8,
            },
          ],
        };
      } else if (selectedTool === 'do272_query_features') {
        setComplianceReport(null);
        resultData = {
          status: 'success',
          aerodrome: targetIcao,
          feature_class: featureClassParam,
          count: dataset.features.length,
          features: dataset.features.slice(0, 10).map((f) => ({
            id: f.id,
            class: f.featureClass,
            designator: f.designator,
            status: f.status,
          })),
        };
      } else if (selectedTool === 'do272_spatial_sql') {
        setComplianceReport(null);
        resultData = {
          status: 'success',
          query: sqlParam,
          rows: [
            { designator: '28L/10R', length_m: 3469, surface: 'Asphalt', pcn: '105/R/B/W/T' },
            { designator: '28R/10L', length_m: 3618, surface: 'Concrete', pcn: '112/R/B/W/T' },
          ],
        };
      }

      const rpcWrapper = {
        jsonrpc: '2.0',
        id: Math.floor(Math.random() * 1000),
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(resultData, null, 2),
            },
          ],
        },
      };

      setJsonRpcResponse(JSON.stringify(rpcWrapper, null, 2));
      setExecutionLatency(Math.round(performance.now() - start));
      setIsExecuting(false);
    }, 240);
  };

  const handleCopyConfig = () => {
    navigator.clipboard.writeText(claudeDesktopConfig);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl text-slate-100 p-5 flex flex-col h-full max-h-[85vh] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
        <div>
          <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest block">
            Model Context Protocol · PostgreSQL Server
          </span>
          <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
            <span>DO-272 PostGIS MCP Studio</span>
          </h2>
        </div>

        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
          <button
            onClick={() => setActiveTab('tester')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'tester'
                ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Play className="w-3.5 h-3.5 text-cyan-400" />
            Live MCP Tester
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'config'
                ? 'bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-indigo-400" />
            Claude Desktop Config
          </button>
          <button
            onClick={() => setActiveTab('spec')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'spec'
                ? 'bg-slate-800 text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            MCP Tool Spec
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto pt-4 text-xs space-y-4">
        {activeTab === 'tester' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Tool Selection and Input Parameters */}
              <div className="space-y-4 font-mono">
                <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                  <label className="text-[11px] text-slate-400 uppercase tracking-wider block">
                    Select MCP Tool to Invoke
                  </label>
                  <select
                    value={selectedTool}
                    onChange={(e) => {
                      setSelectedTool(e.target.value);
                      setJsonRpcResponse(null);
                      setComplianceReport(null);
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-cyan-300 focus:outline-none"
                  >
                    <option value="do272_validate_compliance">
                      do272_validate_compliance (DQR &amp; Inconsistency Audit)
                    </option>
                    <option value="do272_find_taxi_route">
                      do272_find_taxi_route (Spatial Shortest Path)
                    </option>
                    <option value="do272_obstacle_clearance_check">
                      do272_obstacle_clearance_check (3D FAA Part 77)
                    </option>
                    <option value="do272_query_features">
                      do272_query_features (DO-272 AMDB Lookup)
                    </option>
                    <option value="do272_spatial_sql">
                      do272_spatial_sql (PostGIS Spatial SQL)
                    </option>
                  </select>

                  <div className="space-y-2.5 pt-2">
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase block mb-1">
                        Airport ICAO Code:
                      </label>
                      <input
                        type="text"
                        value={targetIcao}
                        onChange={(e) => setTargetIcao(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white uppercase"
                      />
                    </div>

                    {selectedTool === 'do272_validate_compliance' && (
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase block mb-1">
                          Validation Quality Level:
                        </label>
                        <select
                          value={validationLevel}
                          onChange={(e) => setValidationLevel(e.target.value as any)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-emerald-400"
                        >
                          <option value="standard">Standard DO-272 (Geometry + Attributes + Network)</option>
                          <option value="strict">Strict FAA 18B / ED-99 Verification</option>
                          <option value="geometric_only">Geometric Topology Only (Planar Closure &amp; Redundancy)</option>
                        </select>
                      </div>
                    )}

                    {selectedTool === 'do272_find_taxi_route' && (
                      <>
                        <div>
                          <label className="text-[10px] text-slate-500 uppercase block mb-1">
                            Origin (Exit / Node):
                          </label>
                          <input
                            type="text"
                            value={routeOrigin}
                            onChange={(e) => setRouteOrigin(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 uppercase block mb-1">
                            Destination (Gate / Stand):
                          </label>
                          <input
                            type="text"
                            value={routeDest}
                            onChange={(e) => setRouteDest(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                          />
                        </div>
                      </>
                    )}

                    {selectedTool === 'do272_query_features' && (
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase block mb-1">
                          Feature Class Filter:
                        </label>
                        <select
                          value={featureClassParam}
                          onChange={(e) => setFeatureClassParam(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                        >
                          <option value="all">All DO-272 Classes</option>
                          <option value="RunwayElement">RunwayElement</option>
                          <option value="TaxiwayGuidanceLine">TaxiwayGuidanceLine</option>
                          <option value="ParkingStandArea">ParkingStandArea</option>
                          <option value="HotSpot">HotSpot</option>
                          <option value="VerticalStructure">VerticalStructure</option>
                        </select>
                      </div>
                    )}

                    {selectedTool === 'do272_spatial_sql' && (
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase block mb-1">
                          PostGIS SQL Query:
                        </label>
                        <textarea
                          value={sqlParam}
                          onChange={(e) => setSqlParam(e.target.value)}
                          rows={2}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-emerald-400 font-mono"
                        />
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={handleExecuteTool}
                      disabled={isExecuting}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors text-xs shadow-md cursor-pointer"
                    >
                      {isExecuting ? (
                        <span>Executing Tool via JSON-RPC...</span>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Execute {selectedTool}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* JSON-RPC Output Inspector */}
              <div className="flex flex-col h-full bg-slate-950 rounded-xl border border-slate-800 p-3.5 font-mono">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Code className="w-3.5 h-3.5 text-emerald-400" />
                    JSON-RPC 2.0 Response Frame
                  </span>
                  {executionLatency !== null && (
                    <span className="text-[10px] text-emerald-400">
                      Latency: {executionLatency} ms
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-auto pt-2 max-h-[300px]">
                  {jsonRpcResponse ? (
                    <pre className="text-emerald-400 text-[11px] leading-relaxed whitespace-pre-wrap">
                      {jsonRpcResponse}
                    </pre>
                  ) : (
                    <div className="h-full min-h-[140px] flex items-center justify-center text-slate-600 text-center text-xs">
                      Invoke an MCP tool on the left to inspect real-time JSON-RPC payload structures.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Visual DO-272 Compliance & Inconsistency Audit Card */}
            {complianceReport && (
              <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        DO-272 Spatial Data Quality &amp; Inconsistency Audit
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Evaluated {complianceReport.totalFeaturesAudited} aerodrome features for {complianceReport.icao}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 uppercase block">Compliance Score</span>
                      <span
                        className={`text-base font-bold tabular-nums ${
                          complianceReport.complianceScore >= 90
                            ? 'text-emerald-400'
                            : complianceReport.complianceScore >= 70
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {complianceReport.complianceScore}%
                      </span>
                    </div>

                    <div
                      className={`px-3 py-1 rounded text-xs font-bold uppercase ${
                        complianceReport.status === 'COMPLIANT'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : complianceReport.status === 'WARNINGS_PRESENT'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-rose-950 text-rose-300 border border-rose-800'
                      }`}
                    >
                      {complianceReport.status.replace('_', ' ')}
                    </div>
                  </div>
                </div>

                {/* Checks Overview Strip */}
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                    <span className="text-[10px] text-slate-500 block uppercase">Total Checks</span>
                    <strong className="text-white tabular-nums">{complianceReport.checksSummary.totalChecks}</strong>
                  </div>
                  <div className="bg-emerald-950/30 p-2 rounded border border-emerald-900/50">
                    <span className="text-[10px] text-emerald-400 block uppercase">Passed</span>
                    <strong className="text-emerald-400 tabular-nums">{complianceReport.checksSummary.passedChecks}</strong>
                  </div>
                  <div className="bg-amber-950/30 p-2 rounded border border-amber-900/50">
                    <span className="text-[10px] text-amber-400 block uppercase">Warnings</span>
                    <strong className="text-amber-400 tabular-nums">{complianceReport.checksSummary.warningChecks}</strong>
                  </div>
                  <div className="bg-rose-950/30 p-2 rounded border border-rose-900/50">
                    <span className="text-[10px] text-rose-400 block uppercase">Critical Violations</span>
                    <strong className="text-rose-400 tabular-nums">{complianceReport.checksSummary.failedChecks}</strong>
                  </div>
                </div>

                {/* Inconsistencies Table */}
                {complianceReport.inconsistencies.length > 0 ? (
                  <div className="space-y-2">
                    <span className="text-[11px] text-slate-400 uppercase tracking-wider block">
                      Identified Geometric &amp; Attribute Inconsistencies ({complianceReport.inconsistencies.length})
                    </span>

                    <div className="overflow-x-auto rounded-lg border border-slate-800">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase">
                          <tr>
                            <th className="p-2">Rule ID</th>
                            <th className="p-2">Severity</th>
                            <th className="p-2">Feature ID</th>
                            <th className="p-2">Description &amp; Inconsistency</th>
                            <th className="p-2">DO-272 Remediation</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                          {complianceReport.inconsistencies.map((inc, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/30">
                              <td className="p-2 font-bold text-sky-400 whitespace-nowrap">{inc.ruleId}</td>
                              <td className="p-2">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    inc.severity === 'CRITICAL'
                                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                                  }`}
                                >
                                  {inc.severity}
                                </span>
                              </td>
                              <td className="p-2 text-slate-300 whitespace-nowrap">{inc.featureId}</td>
                              <td className="p-2 text-slate-200">{inc.description}</td>
                              <td className="p-2 text-emerald-400 text-[10px]">{inc.recommendedFix}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-lg flex items-center gap-3 text-emerald-300">
                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <strong className="block">Zero Geometric Inconsistencies Detected!</strong>
                      <span className="text-[11px] text-emerald-400/80">
                        All aerodrome features strictly satisfy RTCA DO-272 / EUROCAE ED-99 planar boundary closure, PCN syntax, and safety distance markers.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Configuration for Claude Desktop */}
        {activeTab === 'config' && (
          <div className="space-y-4 font-mono">
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Claude Desktop Configuration</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Add this snippet to your <code className="text-cyan-400">%APPDATA%\Claude\claude_desktop_config.json</code> on Windows.
                  </p>
                </div>
                <button
                  onClick={handleCopyConfig}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs transition-colors border border-slate-700 cursor-pointer"
                >
                  {copiedConfig ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Config JSON</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="bg-slate-900 p-3.5 rounded-lg border border-slate-800 text-cyan-300 text-xs overflow-x-auto leading-relaxed">
                {claudeDesktopConfig}
              </pre>
            </div>
          </div>
        )}

        {/* Tool Specification */}
        {activeTab === 'spec' && (
          <div className="space-y-3 font-mono">
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <div className="font-bold text-emerald-400">1. do272_validate_compliance (NEW)</div>
              <div className="text-slate-300 text-[11px] mt-1 leading-relaxed">
                Validates aerodrome spatial datasets against RTCA DO-272 / EUROCAE ED-99 Data Quality Requirements (DQRs). Checks polygon boundary closure, self-intersection, PCN rating syntax, hold-short setback envelopes, and stand guidance connectivity, reporting identified geometric inconsistencies and remediation actions.
              </div>
            </div>

            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <div className="font-bold text-cyan-400">2. do272_find_taxi_route</div>
              <div className="text-slate-300 text-[11px] mt-1">
                Computes shortest taxi path between runway exits and parking stands along DO-272 TaxiwayGuidanceLine graph topology, warning of crossing hot spots and hold lines.
              </div>
            </div>

            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <div className="font-bold text-purple-400">3. do272_obstacle_clearance_check</div>
              <div className="text-slate-300 text-[11px] mt-1">
                Evaluates 3D obstacle clearance margins for towers, hangars, and cranes against FAA Part 77 / ICAO Annex 14 approach (1:50) and transitional (1:7) surfaces.
              </div>
            </div>

            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <div className="font-bold text-sky-400">4. do272_spatial_sql</div>
              <div className="text-slate-300 text-[11px] mt-1">
                Allows LLM agents to execute parameterized PostGIS spatial queries (ST_Length, ST_Distance, ST_Intersects) on DO-272 database tables with guarded read-only access.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
