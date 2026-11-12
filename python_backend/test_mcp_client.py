#!/usr/bin/env python3
"""
DO-272 Model Context Protocol (MCP) End-to-End Client Test Suite
Validates mcp_server.py stdio JSON-RPC 2.0 protocol compliance,
tool registration, execution latency, and error reporting.
"""

import sys
import json
import time
import subprocess
from pathlib import Path

SERVER_SCRIPT = Path(__file__).parent / "mcp_server.py"

def run_test_suite():
    print("=" * 70)
    print("  DO-272 MODEL CONTEXT PROTOCOL (MCP) CLIENT TEST HARNESS")
    print("  Testing stdio JSON-RPC 2.0 interface on mcp_server.py")
    print("=" * 70)

    # Launch mcp_server.py as a subprocess with piped stdio
    proc = subprocess.Popen(
        [sys.executable, str(SERVER_SCRIPT)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )

    tests = [
        {
            "name": "1. tools/list - Tool Discovery & Registration",
            "request": {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/list",
                "params": {}
            },
            "validator": lambda res: "tools" in res.get("result", {}) and len(res["result"]["tools"]) >= 5
        },
        {
            "name": "2. do272_validate_compliance - Quality & DQR Audit",
            "request": {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {
                    "name": "do272_validate_compliance",
                    "arguments": {
                        "icao": "KSFO",
                        "validation_level": "standard"
                    }
                }
            },
            "validator": lambda res: (
                res.get("result", {}).get("content", [{}])[0].get("type") == "text" and
                "compliance" in res["result"]["content"][0]["text"].lower()
            )
        },
        {
            "name": "3. do272_find_taxi_route - Dijkstra Graph Routing",
            "request": {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {
                    "name": "do272_find_taxi_route",
                    "arguments": {
                        "icao": "KSFO",
                        "origin": "Gate A1",
                        "destination": "HOLD RWY 28L @ A"
                    }
                }
            },
            "validator": lambda res: "route" in res.get("result", {}).get("content", [{}])[0].get("text", "").lower()
        },
        {
            "name": "4. do272_obstacle_clearance_check - 3D Part 77 Clearance",
            "request": {
                "jsonrpc": "2.0",
                "id": 4,
                "method": "tools/call",
                "params": {
                    "name": "do272_obstacle_clearance_check",
                    "arguments": {
                        "icao": "KSFO"
                    }
                }
            },
            "validator": lambda res: "obstacle" in res.get("result", {}).get("content", [{}])[0].get("text", "").lower() or "finding" in res.get("result", {}).get("content", [{}])[0].get("text", "").lower()
        },
        {
            "name": "5. do272_query_features - Spatial Query",
            "request": {
                "jsonrpc": "2.0",
                "id": 5,
                "method": "tools/call",
                "params": {
                    "name": "do272_query_features",
                    "arguments": {
                        "icao": "KSFO",
                        "feature_class": "RunwayElement"
                    }
                }
            },
            "validator": lambda res: "features" in res.get("result", {}).get("content", [{}])[0].get("text", "").lower()
        },
        {
            "name": "6. do272_spatial_sql - PostGIS SQL Execution",
            "request": {
                "jsonrpc": "2.0",
                "id": 6,
                "method": "tools/call",
                "params": {
                    "name": "do272_spatial_sql",
                    "arguments": {
                        "sql": "SELECT designator, length_m FROM do272_runways WHERE length_m > 3000"
                    }
                }
            },
            "validator": lambda res: "rows" in res.get("result", {}).get("content", [{}])[0].get("text", "").lower() or "status" in res.get("result", {}).get("content", [{}])[0].get("text", "").lower()
        },
        {
            "name": "7. Unknown Tool Handling - Error Code -32601",
            "request": {
                "jsonrpc": "2.0",
                "id": 7,
                "method": "tools/call",
                "params": {
                    "name": "non_existent_tool_123",
                    "arguments": {}
                }
            },
            "validator": lambda res: "error" in res and res["error"].get("code") == -32601
        }
    ]

    passed = 0
    total = len(tests)

    try:
        for t in tests:
            req_str = json.dumps(t["request"]) + "\n"
            t0 = time.perf_counter()
            proc.stdin.write(req_str)
            proc.stdin.flush()

            # Read response line
            raw_res = proc.stdout.readline()
            latency = (time.perf_counter() - t0) * 1000

            if not raw_res:
                print(f"❌ [FAIL] {t['name']} - No response received from server")
                continue

            try:
                parsed = json.loads(raw_res.strip())
            except json.JSONDecodeError as e:
                print(f"❌ [FAIL] {t['name']} - Invalid JSON output: {raw_res[:80]}")
                continue

            if t["validator"](parsed):
                passed += 1
                print(f"✅ [PASS] {t['name']} ({latency:.1f}ms)")
            else:
                print(f"❌ [FAIL] {t['name']} - Validation failed: {parsed}")

    finally:
        proc.stdin.close()
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()

    print("-" * 70)
    print(f"Test Suite Summary: {passed}/{total} Passed ({(passed/total)*100:.1f}%)")
    print("=" * 70)

    if passed == total:
        print("ALL DO-272 MCP CLIENT TESTS PASSED SUCCESSFULLY! 🚀")
        return 0
    else:
        print("SOME TESTS FAILED! Check server output.")
        return 1

if __name__ == "__main__":
    sys.exit(run_test_suite())
