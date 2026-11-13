/**
 * DO-272 In-App MCP Client & Agent Service End-to-End Test Suite
 * Validates autonomous agent reasoning, tool dispatching, JSON-RPC 2.0 serialization,
 * and Leaflet map synchronization across all 4 hub airports.
 */

import { readFileSync } from 'node:fs';
import { AerodromeDataset } from '../src/types/do272';
import {
  REGISTERED_MCP_TOOLS,
  executeMCPTool,
  runMCPAgent,
  JsonRpcResponse,
} from '../src/services/mcpAgentService';

const PRELOADED_AERODROMES = JSON.parse(
  readFileSync(new URL('../python_backend/seed_data/airports.json', import.meta.url), 'utf8')
) as Record<string, AerodromeDataset>;

let passed = 0;
let total = 0;

function assert(condition: boolean, testName: string, detail: string = '') {
  total++;
  if (condition) {
    passed++;
    console.log(`✅ [PASS] ${testName}`);
  } else {
    console.error(`❌ [FAIL] ${testName} ${detail ? '- ' + detail : ''}`);
  }
}

async function runTestSuite() {
  console.log('='.repeat(70));
  console.log('  DO-272 IN-APP MCP CLIENT AGENT E2E TEST SUITE');
  console.log('='.repeat(70));

  // Test 1: Registered Tools Schema Integrity
  assert(
    REGISTERED_MCP_TOOLS.length >= 5,
    'Tool Registration Count',
    `Found ${REGISTERED_MCP_TOOLS.length} tools`
  );

  const toolNames = REGISTERED_MCP_TOOLS.map((t) => t.name);
  assert(
    toolNames.includes('do272_validate_compliance') &&
      toolNames.includes('do272_find_taxi_route') &&
      toolNames.includes('do272_obstacle_clearance_check') &&
      toolNames.includes('do272_query_features') &&
      toolNames.includes('do272_spatial_sql'),
    'All 5 Standard DO-272 MCP Tools Registered',
    `Registered: ${toolNames.join(', ')}`
  );

  // Test 2: Low-Level executeMCPTool on all 4 Hub Airports
  for (const icao of ['KSFO', 'EGLL', 'EDDF', 'OMDB']) {
    const aero = PRELOADED_AERODROMES[icao];

    // Audit tool execution
    const auditRes = executeMCPTool('do272_validate_compliance', { icao }, aero);
    assert(
      !auditRes.response.error &&
        (auditRes.response.result as any)?.compliance_status === 'COMPLIANT',
      `Low-level Audit on ${icao} (100% COMPLIANT)`,
      JSON.stringify(auditRes.response)
    );

    // Obstacle tool execution
    const obsRes = executeMCPTool('do272_obstacle_clearance_check', { icao }, aero);
    assert(
      !obsRes.response.error &&
        typeof (obsRes.response.result as any)?.total_structures_evaluated === 'number',
      `Low-level Part 77 Obstacle Check on ${icao}`,
      JSON.stringify(obsRes.response)
    );

    // Taxi routing execution
    const routeRes = executeMCPTool(
      'do272_find_taxi_route',
      { icao, origin: 'Stand', destination: 'Hold' },
      aero
    );
    assert(
      !routeRes.response.error &&
        Array.isArray((routeRes.response.result as any)?.route_instructions),
      `Low-level Taxiway Graph Routing on ${icao}`,
      JSON.stringify(routeRes.response)
    );
  }

  // Test 3: Autonomous Agent Multi-Turn Intent Parsing
  const ksfo = PRELOADED_AERODROMES['KSFO'];

  // 3a. Audit prompt
  const auditAgentMsg = await runMCPAgent('Perform DO-272 compliance audit on KSFO', ksfo);
  assert(
    auditAgentMsg.toolInvocations?.[0]?.toolName === 'do272_validate_compliance',
    'Agent Intent Dispatch: Audit Prompt selects do272_validate_compliance',
    `Selected: ${auditAgentMsg.toolInvocations?.[0]?.toolName}`
  );
  assert(
    auditAgentMsg.thought !== undefined && auditAgentMsg.thought.length > 0,
    'Agent Thought Process Generated for Audit',
    auditAgentMsg.thought || ''
  );

  // 3b. Taxi routing prompt
  const taxiAgentMsg = await runMCPAgent(
    'Calculate ground taxi path from Gate A1 to Runway 28L',
    ksfo
  );
  assert(
    taxiAgentMsg.toolInvocations?.[0]?.toolName === 'do272_find_taxi_route',
    'Agent Intent Dispatch: Taxi Prompt selects do272_find_taxi_route',
    `Selected: ${taxiAgentMsg.toolInvocations?.[0]?.toolName}`
  );
  assert(
    taxiAgentMsg.mapSyncPayload?.type === 'route' &&
      taxiAgentMsg.mapSyncPayload.taxiRoute !== undefined,
    'Agent Map Sync Payload correctly attached for Taxi Path',
    JSON.stringify(taxiAgentMsg.mapSyncPayload)
  );

  // 3c. Obstacle clearance prompt
  const obsAgentMsg = await runMCPAgent('Check vertical obstacles against Part 77 surfaces', ksfo);
  assert(
    obsAgentMsg.toolInvocations?.[0]?.toolName === 'do272_obstacle_clearance_check',
    'Agent Intent Dispatch: Obstacle Prompt selects do272_obstacle_clearance_check',
    `Selected: ${obsAgentMsg.toolInvocations?.[0]?.toolName}`
  );

  // 3d. Spatial SQL prompt
  const sqlAgentMsg = await runMCPAgent(
    'SELECT designator, lengthMeters FROM runways WHERE lengthMeters > 3000',
    ksfo
  );
  assert(
    sqlAgentMsg.toolInvocations?.[0]?.toolName === 'do272_spatial_sql',
    'Agent Intent Dispatch: SQL Prompt selects do272_spatial_sql',
    `Selected: ${sqlAgentMsg.toolInvocations?.[0]?.toolName}`
  );

  // Test 4: Error Handling & Resilience
  const unknownRes = executeMCPTool('non_existent_tool', {}, ksfo);
  assert(
    unknownRes.response.error?.code === -32601,
    'MCP Error Handling: Returns JSON-RPC 2.0 error code -32601 for unknown tool',
    JSON.stringify(unknownRes.response)
  );

  console.log('-'.repeat(70));
  console.log(`TypeScript Test Suite Summary: ${passed}/${total} Passed (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('='.repeat(70));

  if (passed === total) {
    console.log('ALL IN-APP MCP CLIENT TESTS PASSED! 🚀\n');
    process.exit(0);
  } else {
    console.error('SOME IN-APP MCP CLIENT TESTS FAILED!\n');
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
