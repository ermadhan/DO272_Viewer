/**
 * Model Context Protocol (MCP) Client Agent Service
 * Autonomous multi-turn AI reasoning engine, JSON-RPC 2.0 tool dispatcher,
 * and DO-272 aerodrome spatial analysis bridge.
 */

import {
  AerodromeDataset,
  AnyDO272Feature,
  ParkingStandFeature,
  DO272ValidationReport,
  ObstacleCheckResult,
  TaxiRouteResult,
} from '../types/do272';
import {
  validateDO272Compliance,
  calculateTaxiRoute,
  evaluateObstacleClearances,
  executeSpatialSql,
} from './spatialEngine';

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  };
}

export const REGISTERED_MCP_TOOLS: MCPToolDefinition[] = [
  {
    name: 'do272_validate_compliance',
    description:
      'Validate aerodrome spatial data against RTCA DO-272 / EUROCAE ED-99 requirements (polygon boundary closure, PCN rating syntax, CAT III hold-short setbacks, stand lead-in connectivity, and Part 77 safety margins).',
    inputSchema: {
      type: 'object',
      properties: {
        icao: {
          type: 'string',
          description: 'ICAO aerodrome code (e.g. KSFO, EGLL, EDDF, OMDB)',
        },
        validation_level: {
          type: 'string',
          enum: ['standard', 'strict', 'geometric_only'],
          description: 'Audit rigor level',
        },
      },
      required: ['icao'],
    },
  },
  {
    name: 'do272_find_taxi_route',
    description:
      'Compute optimal ground taxi routing between parking stands and runway holding positions along the DO-272 TaxiwayGuidanceLine graph topology, warning of crossing hot spots and hold lines.',
    inputSchema: {
      type: 'object',
      properties: {
        icao: { type: 'string', description: 'ICAO aerodrome code' },
        origin: { type: 'string', description: 'Origin stand or taxiway exit point' },
        destination: { type: 'string', description: 'Destination runway hold line or stand' },
      },
      required: ['icao', 'origin', 'destination'],
    },
  },
  {
    name: 'do272_obstacle_clearance_check',
    description:
      'Evaluate 3D vertical structures (control towers, hangars, cranes) against FAA Part 77 / ICAO Annex 14 approach (1:50) and transitional (1:7) clearance surfaces.',
    inputSchema: {
      type: 'object',
      properties: {
        icao: { type: 'string', description: 'ICAO aerodrome code' },
      },
      required: ['icao'],
    },
  },
  {
    name: 'do272_query_features',
    description:
      'Filter and inspect aerodrome features by DO-272 feature class (RunwayElement, TaxiwayGuidanceLine, ParkingStandArea, HotSpot, VerticalStructure, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        icao: { type: 'string', description: 'ICAO aerodrome code' },
        feature_class: {
          type: 'string',
          description: 'Feature class name or "all"',
        },
        limit: { type: 'number', description: 'Maximum features to return' },
      },
      required: ['icao'],
    },
  },
  {
    name: 'do272_spatial_sql',
    description:
      'Preview a SQL-like spatial query against the currently loaded aerodrome feature data fetched from the configured database.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SQL query string' },
      },
      required: ['sql'],
    },
  },
];

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: 'tools/call' | 'tools/list' | 'initialize';
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface AgentToolInvocation {
  toolName: string;
  arguments: Record<string, unknown>;
  jsonRpcPayload: JsonRpcRequest;
  latencyMs: number;
  status: 'success' | 'error';
  result: Record<string, unknown>;
}

export interface AgentMapSyncPayload {
  type: 'route' | 'features' | 'obstacle' | 'clear';
  taxiRoute?: TaxiRouteResult;
  highlightFeatureIds?: string[];
  focusedFeature?: AnyDO272Feature;
  description: string;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  thought?: string;
  toolInvocations?: AgentToolInvocation[];
  mapSyncPayload?: AgentMapSyncPayload;
}

/**
 * Executes a simulated or real JSON-RPC 2.0 tool call against the active dataset
 */
export function executeMCPTool(
  toolName: string,
  args: Record<string, unknown>,
  dataset: AerodromeDataset
): { latencyMs: number; response: JsonRpcResponse } {
  const start = performance.now();
  const reqId = `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  try {
    let resultData: Record<string, unknown> = {};

    switch (toolName) {
      case 'do272_validate_compliance': {
        const level = (args.validation_level as 'standard' | 'strict' | 'geometric_only') || 'standard';
        const report = validateDO272Compliance(dataset, level);
        resultData = {
          tool: 'do272_validate_compliance',
          status: 'success',
          aerodrome: dataset.icao,
          compliance_status: report.status,
          compliance_score: `${report.complianceScore}%`,
          total_features_audited: report.totalFeaturesAudited,
          summary: report.checksSummary,
          inconsistencies_count: report.inconsistencies.length,
          inconsistencies: report.inconsistencies,
          evaluated_do272_rules: report.evaluatedRules,
        };
        break;
      }

      case 'do272_find_taxi_route': {
        const originQuery = String(args.origin || '').trim();
        const destQuery = String(args.destination || '').trim();

        // Match origin feature or fallback to first stand/holding line
        const stands = dataset.features.filter((f) => f.featureClass === 'ParkingStandArea');
        const holds = dataset.features.filter((f) => f.featureClass === 'RunwayHoldingPosition');

        let originFeature = dataset.features.find(
          (f) =>
            f.id.toLowerCase() === originQuery.toLowerCase() ||
            f.designator.toLowerCase().includes(originQuery.toLowerCase())
        );
        let destFeature = dataset.features.find(
          (f) =>
            f.id.toLowerCase() === destQuery.toLowerCase() ||
            f.designator.toLowerCase().includes(destQuery.toLowerCase())
        );

        if (!originFeature && stands.length > 0) originFeature = stands[0];
        if (!destFeature && holds.length > 0) destFeature = holds[0];

        const originId = originFeature?.id || 'STAND-1';
        const destId = destFeature?.id || 'HOLD-1';

        const routeResult = calculateTaxiRoute(dataset, originId, destId);

        resultData = {
          tool: 'do272_find_taxi_route',
          status: 'success',
          aerodrome: dataset.icao,
          origin: routeResult.origin,
          destination: routeResult.destination,
          total_distance_meters: routeResult.totalDistanceMeters,
          estimated_taxi_minutes: routeResult.estimatedTaxiMinutes,
          route_instructions: routeResult.routeSteps,
          waypoints_count: routeResult.pathCoordinates.length,
          path_coordinates: routeResult.pathCoordinates,
          hot_spots_encountered: routeResult.hotSpotsEncountered,
          hold_positions_encountered: routeResult.holdPositionsEncountered,
        };
        break;
      }

      case 'do272_obstacle_clearance_check': {
        const obstacles = evaluateObstacleClearances(dataset);
        const breaches = obstacles.filter((o) => o.isPenetrating);

        resultData = {
          tool: 'do272_obstacle_clearance_check',
          status: 'success',
          aerodrome: dataset.icao,
          total_structures_evaluated: obstacles.length,
          penetrations_found: breaches.length,
          findings: obstacles.map((o) => ({
            structure: o.structureName,
            structure_id: o.structureId,
            height_agl_m: o.heightAgl,
            elevation_amsl_m: o.elevationAmsl,
            nearest_runway: o.nearestRunway,
            distance_to_runway_m: o.distanceToNearestRunwayMeters,
            applicable_surface: o.applicableSurface,
            allowed_max_elevation_m: o.allowedMaxElevationAmsl,
            is_penetrating: o.isPenetrating,
            penetration_m: o.penetrationMeters,
          })),
        };
        break;
      }

      case 'do272_query_features': {
        const featureClass = String(args.feature_class || 'all');
        const limit = typeof args.limit === 'number' ? args.limit : 25;

        const filtered =
          featureClass === 'all'
            ? dataset.features
            : dataset.features.filter(
                (f) => f.featureClass.toLowerCase() === featureClass.toLowerCase()
              );

        resultData = {
          tool: 'do272_query_features',
          status: 'success',
          aerodrome: dataset.icao,
          feature_class: featureClass,
          total_matching: filtered.length,
          features: filtered.slice(0, limit).map((f) => ({
            id: f.id,
            feature_class: f.featureClass,
            designator: f.designator,
            status: f.status,
            properties: f.properties || {},
          })),
        };
        break;
      }

      case 'do272_spatial_sql': {
        const sql = String(args.sql || 'SELECT designator, length_m FROM do272_runways WHERE length_m > 3000');
        const result = executeSpatialSql(dataset, sql, 'postgres');
        const formattedRows = result.rows.map((row) => {
          const obj: Record<string, unknown> = {};
          result.columns.forEach((col, idx) => {
            obj[col] = row[idx];
          });
          return obj;
        });

        resultData = {
          tool: 'do272_spatial_sql',
          status: 'success',
          query: sql,
          columns: result.columns,
          rows: formattedRows,
          rowCount: formattedRows.length,
          executionTimeMs: result.executionTimeMs,
        };
        break;
      }

      default:
        return {
          latencyMs: performance.now() - start,
          response: {
            jsonrpc: '2.0',
            id: reqId,
            error: {
              code: -32601,
              message: `Unknown MCP tool requested: ${toolName}`,
            },
          },
        };
    }

    const latencyMs = Math.round(performance.now() - start);
    return {
      latencyMs,
      response: {
        jsonrpc: '2.0',
        id: reqId,
        result: resultData,
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      latencyMs: Math.round(performance.now() - start),
      response: {
        jsonrpc: '2.0',
        id: reqId,
        error: {
          code: -32000,
          message: errorMsg,
        },
      },
    };
  }
}

/**
 * Autonomous AI Agent reasoning engine
 * Resolves natural language user inquiries into coordinated MCP tool executions and conversational answers
 */
export async function runMCPAgent(
  prompt: string,
  dataset: AerodromeDataset,
  conversationHistory: AgentMessage[] = []
): Promise<AgentMessage> {
  const p = prompt.toLowerCase();
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const msgId = `msg-${Date.now()}`;

  // Analyze intent to formulate thought reasoning, target tool, and arguments
  let thought = '';
  let toolToInvoke = '';
  let toolArgs: Record<string, unknown> = {};
  let mapSync: AgentMapSyncPayload | undefined = undefined;

  if (p.includes('audit') || p.includes('compliance') || p.includes('validate') || p.includes('rule') || p.includes('dqr') || p.includes('quality')) {
    thought = `User requested an aeronautical quality validation for ${dataset.icao}. I will invoke 'do272_validate_compliance' with standard rigor to inspect polygon boundary closure, PCN syntax, CAT III holding setback distances, and Part 77 safety envelopes.`;
    toolToInvoke = 'do272_validate_compliance';
    toolArgs = {
      icao: dataset.icao,
      validation_level: p.includes('strict') ? 'strict' : 'standard',
    };
  } else if (p.includes('taxi') || p.includes('route') || p.includes('path') || p.includes('routing') || p.includes('clearance') || p.includes('gate') || p.includes('stand')) {
    thought = `User is requesting ground taxiway routing at ${dataset.icao}. I need to identify the origin stand and target runway holding point, then invoke 'do272_find_taxi_route' over the DO-272 TaxiwayGuidanceLine graph topology.`;
    toolToInvoke = 'do272_find_taxi_route';

    // Auto-detect origin stand and destination hold point from text or use airport defaults
    const stands = dataset.features.filter((f): f is ParkingStandFeature => f.featureClass === 'ParkingStandArea');
    const holds = dataset.features.filter((f) => f.featureClass === 'RunwayHoldingPosition');

    let origin = stands[0]?.designator || 'Gate A1';
    let destination = holds[0]?.designator || 'HOLD RWY 28L';

    for (const s of stands) {
      if (p.includes(s.designator.toLowerCase()) || (s.standNumber && p.includes(s.standNumber.toLowerCase()))) {
        origin = s.designator;
        break;
      }
    }
    for (const h of holds) {
      if (p.includes(h.designator.toLowerCase())) {
        destination = h.designator;
        break;
      }
    }

    toolArgs = {
      icao: dataset.icao,
      origin,
      destination,
    };
  } else if (p.includes('obstacle') || p.includes('part 77') || p.includes('height') || p.includes('tower') || p.includes('penetrat') || p.includes('clearance')) {
    thought = `Inquiry pertains to vertical structure clearances. I will call 'do272_obstacle_clearance_check' to calculate 3D imaginary surface intercepts (1:50 approach and 1:7 transitional surfaces) against all surveyed vertical structures at ${dataset.icao}.`;
    toolToInvoke = 'do272_obstacle_clearance_check';
    toolArgs = { icao: dataset.icao };
  } else if (p.includes('select') || p.includes('sql') || p.includes('postgis') || p.includes('st_') || p.includes('database') || p.includes('table')) {
    thought = `Spatial query syntax detected. I will invoke 'do272_spatial_sql' to execute parameterized spatial SQL against the aerodrome database tables.`;
    toolToInvoke = 'do272_spatial_sql';
    toolArgs = {
      sql: p.includes('select') ? prompt : `SELECT designator, lengthMeters, pcnRating FROM runways WHERE lengthMeters > 3000`,
    };
  } else {
    // Default to querying features or general inspection
    thought = `General inquiry about ${dataset.icao}. I will query aerodrome features using 'do272_query_features' to inspect key spatial elements and feature counts.`;
    toolToInvoke = 'do272_query_features';
    let fClass = 'all';
    if (p.includes('runway')) fClass = 'RunwayElement';
    else if (p.includes('taxiway')) fClass = 'TaxiwayElement';
    else if (p.includes('guidance')) fClass = 'TaxiwayGuidanceLine';
    else if (p.includes('stand') || p.includes('gate')) fClass = 'ParkingStandArea';
    else if (p.includes('hold')) fClass = 'RunwayHoldingPosition';
    else if (p.includes('navaid')) fClass = 'LocalizerAntenna';

    toolArgs = {
      icao: dataset.icao,
      feature_class: fClass,
      limit: 10,
    };
  }

  // Execute tool call via MCP protocol
  const { latencyMs, response } = executeMCPTool(toolToInvoke, toolArgs, dataset);

  const toolInvocation: AgentToolInvocation = {
    toolName: toolToInvoke,
    arguments: toolArgs,
    jsonRpcPayload: {
      jsonrpc: '2.0',
      id: response.id,
      method: 'tools/call',
      params: {
        name: toolToInvoke,
        arguments: toolArgs,
      },
    },
    latencyMs,
    status: response.error ? 'error' : 'success',
    result: (response.result || { error: response.error }) as Record<string, unknown>,
  };

  // Synthesize conversational response and map synchronization payload based on results
  let finalContent = '';

  if (toolToInvoke === 'do272_validate_compliance') {
    const res = response.result as {
      compliance_status: string;
      compliance_score: string;
      total_features_audited: number;
      inconsistencies_count: number;
      inconsistencies: Array<{ ruleId: string; description: string; featureId: string; severity: string }>;
    };

    if (res.inconsistencies_count === 0) {
      finalContent = `I have completed a comprehensive RTCA DO-272 / EUROCAE ED-99 data quality audit for **${dataset.name} (${dataset.icao})**.

* **Compliance Score**: **${res.compliance_score} (COMPLIANT)**
* **Features Audited**: ${res.total_features_audited} features verified
* **Geometric Inconsistencies**: **0 identified**

All runways satisfy 5-part ICAO PCN notation, runway holding positions meet FAA/ICAO safety setback standards (40m–120m), parking stands link directly to the taxi guidance line graph, and all non-frangible vertical structures remain clear of active runway safety areas.`;
    } else {
      finalContent = `DO-272 audit completed for **${dataset.icao}** with a compliance score of **${res.compliance_score}** (${res.compliance_status}).

**Identified Inconsistencies (${res.inconsistencies_count}):**
${res.inconsistencies.map((inc) => `- [${inc.severity}] \`${inc.ruleId}\`: ${inc.description} (Feature: \`${inc.featureId}\`)`).join('\n')}

Click the **View Inconsistencies on Map** button below to highlight affected feature boundaries.`;

      mapSync = {
        type: 'features',
        highlightFeatureIds: res.inconsistencies.map((i) => i.featureId),
        description: `Highlighting ${res.inconsistencies_count} non-compliant feature(s) on the aerodrome map.`,
      };
    }
  } else if (toolToInvoke === 'do272_find_taxi_route') {
    const res = response.result as {
      origin: string;
      destination: string;
      total_distance_meters: number;
      estimated_taxi_minutes: number;
      route_instructions: string[];
      path_coordinates: [number, number][];
      hot_spots_encountered: string[];
      hold_positions_encountered: string[];
    };

    const stands = dataset.features.filter((f) => f.featureClass === 'ParkingStandArea');
    const holds = dataset.features.filter((f) => f.featureClass === 'RunwayHoldingPosition');
    const routeObj = calculateTaxiRoute(
      dataset,
      stands.find((s) => s.designator === res.origin)?.id || stands[0]?.id || '',
      holds.find((h) => h.designator === res.destination)?.id || holds[0]?.id || ''
    );

    finalContent = `Calculated optimal ground taxi trajectory between **${res.origin}** and **${res.destination}** at **${dataset.icao}**:

* **Total Taxi Distance**: ${res.total_distance_meters.toLocaleString()} meters
* **Estimated Taxi Duration**: ${res.estimated_taxi_minutes} minutes (@ 15 knots ground speed)
* **Waypoints Evaluated**: ${res.path_coordinates.length} guidance network nodes

**ATC Taxi Clearance:**
${res.route_instructions.map((step, idx) => `${idx + 1}. ${step}`).join('\n')}

${res.hot_spots_encountered.length > 0 ? `⚠️ **Caution**: Route crosses known hot spot(s): ${res.hot_spots_encountered.join(', ')}` : '✅ **Safety**: No active hot spot conflicts encountered along this trajectory.'}`;

    mapSync = {
      type: 'route',
      taxiRoute: routeObj,
      description: `Displaying ground taxi trajectory from ${res.origin} to ${res.destination}.`,
    };
  } else if (toolToInvoke === 'do272_obstacle_clearance_check') {
    const res = response.result as {
      total_structures_evaluated: number;
      penetrations_found: number;
      findings: Array<{
        structure: string;
        structure_id: string;
        applicable_surface: string;
        is_penetrating: boolean;
        penetration_m: number;
        distance_to_runway_m: number;
        nearest_runway: string;
      }>;
    };

    finalContent = `Evaluated **${res.total_structures_evaluated} vertical structures** against FAA Part 77 / ICAO Annex 14 imaginary surfaces at **${dataset.icao}**.

* **Surfaces Evaluated**: Approach Surface (1:50 slope) and Transitional Surface (1:7 slope)
* **Penetrations Detected**: **${res.penetrations_found}**

${res.findings
  .map(
    (f) =>
      `- **${f.structure}**: ${f.distance_to_runway_m}m from Runway ${f.nearest_runway} (${f.applicable_surface}). ${
        f.is_penetrating
          ? `⚠️ **BREACH DETECTED** (+${f.penetration_m.toFixed(1)}m penetration)`
          : `✅ **CLEAR** (within safety clearance plane)`
      }`
  )
  .join('\n')}`;

    const breach = res.findings.find((f) => f.is_penetrating);
    if (breach) {
      const obstacleFeature = dataset.features.find((feat) => feat.id === breach.structure_id);
      mapSync = {
        type: 'obstacle',
        focusedFeature: obstacleFeature,
        highlightFeatureIds: [breach.structure_id],
        description: `Highlighting breached structure ${breach.structure} on map.`,
      };
    }
  } else if (toolToInvoke === 'do272_spatial_sql') {
    const res = response.result as {
      query: string;
      rows: Array<Record<string, unknown>>;
      rowCount: number;
      executionTimeMs: number;
    };

    finalContent = `Executed spatial SQL query against DO-272 tables in **${res.executionTimeMs}ms**:

\`\`\`sql
${res.query}
\`\`\`

**Results (${res.rowCount} row${res.rowCount === 1 ? '' : 's'} returned):**
${res.rows.length === 0 ? '_No rows returned._' : res.rows.map((r, i) => `${i + 1}. ` + Object.entries(r).map(([k, v]) => `**${k}**: \`${v}\``).join(' | ')).join('\n')}`;
  } else {
    const res = response.result as {
      feature_class: string;
      total_matching: number;
      features: Array<{ id: string; feature_class: string; designator: string; status: string }>;
    };

    finalContent = `Retrieved **${res.total_matching}** feature(s) of class \`${res.feature_class}\` for **${dataset.icao}**:

${res.features.map((f) => `- \`${f.id}\`: **${f.designator}** (${f.feature_class}, ${f.status})`).join('\n')}`;
  }

  return {
    id: msgId,
    role: 'assistant',
    content: finalContent,
    timestamp: now,
    thought,
    toolInvocations: [toolInvocation],
    mapSyncPayload: mapSync,
  };
}
