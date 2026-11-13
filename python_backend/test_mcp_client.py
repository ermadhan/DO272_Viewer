#!/usr/bin/env python3
"""Exercise the stdio MCP server against an isolated backend database."""

import json
import os
import socket
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from contextlib import closing
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

import uvicorn
from sqlalchemy import create_engine
from sqlalchemy.engine import URL

BACKEND_DIR = Path(__file__).resolve().parent
SERVER_SCRIPT = BACKEND_DIR / "mcp_server.py"
sys.path.insert(0, str(BACKEND_DIR))

import database
from main import app


class McpClientTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_directory = tempfile.TemporaryDirectory()
        cls.db_path = Path(cls.temp_directory.name) / "mcp-test.db"
        cls.engine = create_engine(URL.create("sqlite", database=str(cls.db_path)),
                                   connect_args={"check_same_thread": False})
        cls.previous_engine = database._engines.get("sqlite")
        cls.previous_factory = database._session_factories.pop("sqlite", None)
        cls.previous_active = database._active_engine_name
        database._engines["sqlite"] = cls.engine
        database._active_engine_name = "sqlite"
        cls.socket = socket.socket()
        cls.socket.bind(("127.0.0.1", 0))
        cls.socket.listen(128)
        port = cls.socket.getsockname()[1]
        cls.api_url = f"http://127.0.0.1:{port}"
        cls.backend = uvicorn.Server(uvicorn.Config(app, log_level="error"))
        cls.thread = threading.Thread(target=cls.backend.run, kwargs={"sockets": [cls.socket]})
        cls.thread.start()
        try:
            for _ in range(100):
                if not cls.thread.is_alive():
                    raise RuntimeError("Test backend exited before startup")
                try:
                    with urlopen(cls.api_url + "/", timeout=1):
                        break
                except (URLError, TimeoutError):
                    time.sleep(0.1)
            else:
                raise RuntimeError("Test backend did not become ready")
        except Exception:
            cls.tearDownClass()
            raise

    @classmethod
    def tearDownClass(cls):
        cls.backend.should_exit = True
        cls.thread.join(timeout=10)
        if cls.thread.is_alive():
            raise RuntimeError("Test backend failed to stop")
        cls.socket.close()
        cls.engine.dispose()
        database._session_factories.pop("sqlite", None)
        if cls.previous_engine is None:
            database._engines.pop("sqlite", None)
        else:
            database._engines["sqlite"] = cls.previous_engine
        if cls.previous_factory is not None:
            database._session_factories["sqlite"] = cls.previous_factory
        database._active_engine_name = cls.previous_active
        cls.temp_directory.cleanup()

    @classmethod
    def api(cls, path, method="GET", data=None):
        body = json.dumps(data).encode() if data is not None else None
        request = Request(cls.api_url + path, data=body, method=method,
                          headers={"Content-Type": "application/json"})
        with urlopen(request, timeout=5) as response:
            return json.load(response)

    def requests(self, requests, api_url=None):
        env = os.environ.copy()
        env["DO272_API_URL"] = api_url or self.api_url
        result = subprocess.run(
            [sys.executable, str(SERVER_SCRIPT)],
            input="".join(json.dumps(request) + "\n" for request in requests),
            capture_output=True, text=True, env=env, timeout=20, check=True,
        )
        return [json.loads(line) for line in result.stdout.splitlines()]

    def call(self, name, arguments, api_url=None):
        request = {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                   "params": {"name": name, "arguments": arguments}}
        return self.requests([request], api_url)[0]

    def query(self, icao, feature_class="all"):
        response = self.call("do272_query_features", {"icao": icao, "feature_class": feature_class})
        self.assertNotIn("isError", response["result"], response)
        return json.loads(response["result"]["content"][0]["text"])

    def test_baseline_and_class_filter(self):
        baseline = self.api("/api/v1/aerodromes/KSFO")
        result = self.query(" ksfo ", "RunwayElement")
        expected = [feature for feature in baseline["features"] if feature["featureClass"] == "RunwayElement"]
        self.assertEqual(result["features"], expected)
        self.assertEqual(result["count"], len(expected))
        self.assertTrue(result["baseline_available"])
        self.assertEqual(result["source"], baseline["source"])
        self.assertEqual(self.query("KSFO", "ApronElement")["features"],
                         [f for f in baseline["features"] if f["featureClass"] == "ApronElement"])

    def test_pending_activation_and_restart(self):
        baseline = self.api("/api/v1/aerodromes/EGLL")
        feature = {"id": "test-runway", "featureClass": "RunwayElement",
                   "coordinates": [[1, 2], [3, 4]], "lengthMeters": None}
        dataset = {**baseline, "source": "Test partial curated", "features": [feature]}
        with closing(sqlite3.connect(self.db_path)) as db, db:
            cursor = db.execute(
                "INSERT INTO do272_source_snapshots (aerodrome_id, source_kind, payload) VALUES (?, ?, ?)",
                ("EGLL", "curated", json.dumps({"dataset": dataset, "provider": "test"})),
            )
            snapshot_id = cursor.lastrowid
        env = os.environ.copy()
        env["DO272_API_URL"] = self.api_url
        proc = subprocess.Popen([sys.executable, str(SERVER_SCRIPT)], stdin=subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
        try:
            request = {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                       "params": {"name": "do272_query_features", "arguments": {"icao": "EGLL"}}}
            def read_features():
                proc.stdin.write(json.dumps(request) + "\n")
                proc.stdin.flush()
                response = json.loads(proc.stdout.readline())
                return json.loads(response["result"]["content"][0]["text"])["features"]

            self.assertEqual(read_features(), baseline["features"])
            self.api(f"/api/v1/aerodromes/EGLL/curated-snapshots/{snapshot_id}/activate", "POST")
            self.assertEqual(read_features(), [feature])
        finally:
            proc.communicate(timeout=10)
        self.assertEqual(self.query("EGLL")["features"], [feature])
        self.api("/api/v1/aerodromes/EGLL/active-curated-snapshot", "DELETE")
        self.assertEqual(self.query("EGLL")["features"], baseline["features"])

    def test_osm_only_and_missing_airport(self):
        osm = {
            "dataset": {"icao": "KNEW", "name": "OSM airport", "center": [10, 20],
                        "elevationMeters": None, "transitionAltitudeFt": None,
                        "source": "OpenStreetMap Aeroway Ingest", "features": [{
                            "id": "OSM-node-1", "osmType": "node", "osmId": 1,
                            "version": None, "timestamp": None, "aeroway": "windsock",
                            "designator": "", "geometryType": "Point", "coordinates": [10, 20],
                            "tags": {"aeroway": "windsock"},
                        }]},
            "attribution": "OpenStreetMap contributors",
        }
        self.api("/api/v1/aerodromes/KNEW/osm-snapshots", "POST", osm)
        result = self.query("KNEW")
        self.assertFalse(result["baseline_available"])
        self.assertEqual(result["features"], [])
        error = self.call("do272_query_features", {"icao": "ZZZZ"})["result"]
        self.assertTrue(error["isError"])
        self.assertIn("not found", error["content"][0]["text"])

    def test_new_airport_requires_activation(self):
        dataset = {"icao": "KZZZ", "name": "New airport", "source": "Test partial curated",
                   "features": [{"id": "new-runway", "featureClass": "RunwayElement",
                                 "lengthMeters": None}]}
        with closing(sqlite3.connect(self.db_path)) as db, db:
            cursor = db.execute(
                "INSERT INTO do272_source_snapshots (aerodrome_id, source_kind, payload) VALUES (?, ?, ?)",
                ("KZZZ", "curated", json.dumps({"dataset": dataset, "provider": "test"})),
            )
            snapshot_id = cursor.lastrowid
        self.assertTrue(self.call("do272_query_features", {"icao": "KZZZ"})["result"]["isError"])
        self.api(f"/api/v1/aerodromes/KZZZ/curated-snapshots/{snapshot_id}/activate", "POST")
        self.assertEqual(self.query("KZZZ")["features"], dataset["features"])

    def test_errors_and_tool_discovery(self):
        listing = self.requests([{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}])[0]
        names = {tool["name"] for tool in listing["result"]["tools"]}
        self.assertEqual(len(names), 5)
        for name in names - {"do272_query_features"}:
            result = self.call(name, {})["result"]
            self.assertTrue(result["isError"])
            self.assertIn("unavailable", result["content"][0]["text"])
        for args in ({}, {"icao": "../KSFO"}, {"icao": "KSFO", "feature_class": 123}):
            self.assertTrue(self.call("do272_query_features", args)["result"]["isError"])
        self.assertEqual(self.call("unknown", {})["error"]["code"], -32601)
        self.assertTrue(self.call("do272_query_features", {"icao": "KSFO"},
                                  "http://127.0.0.1:0")["result"]["isError"])


if __name__ == "__main__":
    unittest.main()
