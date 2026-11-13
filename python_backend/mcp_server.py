"""DO-272 stdio MCP server backed by the aerodrome API."""

import asyncio
import json
import os
import re
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


DO272_TOOLS = [
    {
        "name": "do272_query_features",
        "description": (
            "Read baseline features from the backend's active database and reviewed "
            "curated snapshot. OSM supplemental features are excluded. Data is not "
            "verified for operational use."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "icao": {"type": "string", "description": "Four-letter ICAO airport code"},
                "feature_class": {
                    "type": "string",
                    "description": "Exact DO-272 feature class name, or 'all' (default)",
                },
            },
            "required": ["icao"],
        },
    },
    {
        "name": "do272_find_taxi_route",
        "description": "Unavailable: real backend taxi routing is not implemented.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "icao": {"type": "string"},
                "origin": {"type": "string"},
                "destination": {"type": "string"},
            },
            "required": ["icao", "origin", "destination"],
        },
    },
    {
        "name": "do272_obstacle_clearance_check",
        "description": "Unavailable: real backend obstacle clearance analysis is not implemented.",
        "inputSchema": {
            "type": "object",
            "properties": {"icao": {"type": "string"}},
            "required": ["icao"],
        },
    },
    {
        "name": "do272_validate_compliance",
        "description": "Unavailable: real backend compliance validation is not implemented.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "icao": {"type": "string"},
                "validation_level": {"type": "string", "enum": ["standard", "strict", "geometric_only"]},
            },
            "required": ["icao"],
        },
    },
    {
        "name": "do272_spatial_sql",
        "description": "Unavailable: SQL execution is not implemented.",
        "inputSchema": {
            "type": "object",
            "properties": {"sql": {"type": "string"}},
            "required": ["sql"],
        },
    },
]


class ToolError(Exception):
    """An error that can be reported to an MCP client."""


def handle_tool_call(tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    if tool_name != "do272_query_features":
        raise ToolError(f"{tool_name} is unavailable: a real backend implementation is not available.")

    icao = arguments.get("icao")
    if not isinstance(icao, str) or not re.fullmatch(r"[A-Z]{4}", icao.strip().upper()):
        raise ToolError("Enter a four-letter ICAO airport code.")
    icao = icao.strip().upper()
    feature_class = arguments.get("feature_class", "all")
    if not isinstance(feature_class, str) or not feature_class.strip():
        raise ToolError("feature_class must be a non-empty string.")
    feature_class = feature_class.strip()

    base_url = os.environ.get("DO272_API_URL", "http://127.0.0.1:8000").rstrip("/")
    try:
        with urlopen(f"{base_url}/api/v1/aerodromes/{icao}", timeout=10) as response:
            dataset = json.load(response)
    except HTTPError as error:
        if error.code == 404:
            raise ToolError(f"Aerodrome {icao} was not found in the active database.") from error
        raise ToolError(f"Backend API returned HTTP {error.code} for {icao}.") from error
    except (URLError, TimeoutError, OSError, ValueError) as error:
        raise ToolError(f"Could not read aerodrome {icao} from the backend API: {error}") from error

    if (
        not isinstance(dataset, dict)
        or dataset.get("icao") != icao
        or not isinstance(dataset.get("source"), str)
        or not isinstance(dataset.get("features"), list)
        or any(not isinstance(feature, dict) for feature in dataset["features"])
    ):
        raise ToolError(f"Backend API returned an invalid dataset for {icao}.")

    baseline_available = dataset["source"] != "OpenStreetMap Aeroway Ingest"
    features = dataset["features"] if baseline_available else []
    if feature_class != "all":
        features = [feature for feature in features if feature.get("featureClass") == feature_class]
    return {
        "status": "success",
        "icao": icao,
        "feature_class": feature_class,
        "source": dataset["source"],
        "baseline_available": baseline_available,
        "count": len(features),
        "features": features,
    }


async def run_stdio_mcp():
    sys.stderr.write("DO-272 MCP server started; feature queries require the backend API.\n")
    sys.stderr.flush()
    tool_names = {tool["name"] for tool in DO272_TOOLS}

    while True:
        line = await asyncio.get_event_loop().run_in_executor(None, sys.stdin.readline)
        if not line:
            break
        msg_id = None
        try:
            req = json.loads(line)
            if not isinstance(req, dict):
                raise ValueError("Request must be an object")
            msg_id = req.get("id")
            method = req.get("method")
            if "id" not in req:
                continue
            if method == "tools/list":
                resp = {"jsonrpc": "2.0", "id": msg_id, "result": {"tools": DO272_TOOLS}}
            elif method == "tools/call":
                params = req.get("params", {})
                if not isinstance(params, dict) or not isinstance(params.get("name"), str):
                    raise ValueError("Tool name is required")
                name = params["name"]
                args = params.get("arguments", {})
                if not isinstance(args, dict):
                    raise ValueError("Tool arguments must be an object")
                if name not in tool_names:
                    resp = {"jsonrpc": "2.0", "id": msg_id,
                            "error": {"code": -32601, "message": f"Unknown tool: {name}"}}
                else:
                    try:
                        result = handle_tool_call(name, args)
                        content = json.dumps(result, indent=2)
                        resp = {"jsonrpc": "2.0", "id": msg_id,
                                "result": {"content": [{"type": "text", "text": content}]}}
                    except ToolError as error:
                        resp = {"jsonrpc": "2.0", "id": msg_id,
                                "result": {"isError": True,
                                           "content": [{"type": "text", "text": str(error)}]}}
            elif method == "initialize":
                resp = {
                    "jsonrpc": "2.0", "id": msg_id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {"tools": {}},
                        "serverInfo": {"name": "do272-spatial-mcp-server", "version": "1.0.0"},
                    },
                }
            else:
                resp = {"jsonrpc": "2.0", "id": msg_id,
                        "error": {"code": -32601, "message": f"Unknown method: {method}"}}
        except json.JSONDecodeError:
            resp = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}}
        except ValueError as error:
            resp = {"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32602, "message": str(error)}}
        except Exception as error:
            sys.stderr.write(f"Error handling MCP message: {error}\n")
            sys.stderr.flush()
            resp = {"jsonrpc": "2.0", "id": msg_id,
                    "error": {"code": -32603, "message": "Internal server error"}}

        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    asyncio.run(run_stdio_mcp())
