import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import URL

BACKEND_DIRECTORY = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIRECTORY))

import database
from main import app


class DatabaseApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_directory = tempfile.TemporaryDirectory()
        self.test_engine = create_engine(
            URL.create(
                "sqlite",
                database=str(Path(self.temp_directory.name) / "test.db"),
            ),
            connect_args={"check_same_thread": False},
        )
        self.previous_engine = database._engines.get("sqlite")
        self.previous_session_factory = database._session_factories.pop("sqlite", None)
        database._engines["sqlite"] = self.test_engine
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.test_engine.dispose()
        if self.previous_engine is None:
            database._engines.pop("sqlite", None)
        else:
            database._engines["sqlite"] = self.previous_engine
        if self.previous_session_factory is not None:
            database._session_factories["sqlite"] = self.previous_session_factory
        self.temp_directory.cleanup()

    def test_seeded_airports_are_loaded_from_database(self):
        response = self.client.get("/api/v1/aerodromes")
        self.assertEqual(response.status_code, 200)
        aerodromes = {row["icao"]: row for row in response.json()}
        self.assertEqual(set(aerodromes), {"KSFO", "EGLL", "EDDF", "OMDB"})
        self.assertEqual(aerodromes["KSFO"]["featureCount"], 62)

        dataset_response = self.client.get("/api/v1/aerodromes/KSFO")
        self.assertEqual(dataset_response.status_code, 200)
        dataset = dataset_response.json()
        self.assertEqual(dataset["icao"], "KSFO")
        self.assertEqual(len(dataset["features"]), 62)
        self.assertEqual(dataset["features"][0]["aerodromeId"], "KSFO")

    def test_saved_dataset_survives_database_reload(self):
        dataset = {
            "icao": "ZZZZ",
            "iata": "ZZZ",
            "name": "Test Aerodrome",
            "city": "Test City",
            "country": "Test Country",
            "center": [10.5, 20.5],
            "elevationMeters": 12,
            "magneticVariation": "1.0E",
            "transitionAltitudeFt": 18000,
            "source": "US FAA Airport GIS 18B",
            "features": [
                {
                    "id": "ZZZZ-RWY-1",
                    "aerodromeId": "ZZZZ",
                    "featureClass": "RunwayElement",
                    "designator": "09/27",
                    "status": "Active",
                    "lengthMeters": 1000,
                    "coordinates": [[10.5, 20.4], [10.5, 20.6]],
                    "properties": {"customAttribute": True},
                }
            ],
        }

        save_response = self.client.put("/api/v1/aerodromes/ZZZZ", json=dataset)
        self.assertEqual(save_response.status_code, 200, save_response.text)
        self.assertEqual(save_response.json(), dataset)

        reload_response = self.client.get("/api/v1/aerodromes/ZZZZ")
        self.assertEqual(reload_response.status_code, 200)
        self.assertEqual(reload_response.json(), dataset)

        updated_dataset = {
            **dataset,
            "name": "Updated Test Aerodrome",
            "features": [
                {**dataset["features"][0], "designator": "Updated runway"},
            ],
        }
        update_response = self.client.put(
            "/api/v1/aerodromes/ZZZZ",
            json=updated_dataset,
        )
        self.assertEqual(update_response.status_code, 200, update_response.text)
        self.assertEqual(update_response.json(), updated_dataset)
        self.assertEqual(
            len(self.client.get("/api/v1/aerodromes/ZZZZ").json()["features"]),
            1,
        )

    def test_osm_snapshots_preserve_curated_and_history(self):
        baseline = self.client.get("/api/v1/aerodromes/KSFO").json()
        snapshot = {
            "dataset": {
                "icao": "KSFO", "name": "KSFO", "center": [37.619, -122.375],
                "elevationMeters": None, "transitionAltitudeFt": None,
                "source": "OpenStreetMap Aeroway Ingest",
                "features": [{
                    "id": "OSM-way-123", "osmType": "way", "osmId": 123,
                    "version": 4, "timestamp": "2024-01-01T00:00:00Z",
                    "aeroway": "runway", "designator": "10R/28L",
                    "geometryType": "LineString",
                    "coordinates": [[37.61, -122.38], [37.62, -122.37]],
                    "tags": {"aeroway": "runway", "ref": "10R/28L"},
                }],
            },
            "osmTimestamp": "2024-01-01T00:00:00Z",
            "attribution": "OpenStreetMap contributors",
        }
        url = "/api/v1/aerodromes/KSFO/osm-snapshots"
        first = self.client.post(url, json=snapshot)
        self.assertEqual(first.status_code, 200, first.text)
        second = self.client.post(url, json=snapshot)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(self.client.get("/api/v1/aerodromes/KSFO").json(), baseline)
        history = self.client.get(url).json()
        self.assertEqual(len(history), 2)
        self.assertNotEqual(history[0]["id"], history[1]["id"])
        loaded = self.client.get(f"{url}/{first.json()['id']}").json()
        self.assertEqual(loaded["dataset"]["features"][0]["tags"], snapshot["dataset"]["features"][0]["tags"])
        self.assertIsNone(loaded["dataset"]["elevationMeters"])
        self.assertIsNone(loaded["dataset"]["transitionAltitudeFt"])

        invalid = {**snapshot, "dataset": {**snapshot["dataset"], "features": [
            {**snapshot["dataset"]["features"][0], "coordinates": [[999, 0], [1, 2]]}
        ]}}
        self.assertEqual(self.client.post(url, json=invalid).status_code, 422)
        self.assertEqual(len(self.client.get(url).json()), 2)
        self.assertEqual(self.client.put("/api/v1/aerodromes/KSFO", json=snapshot["dataset"]).status_code, 422)

        new_airport = {**snapshot, "dataset": {**snapshot["dataset"], "icao": "VOBL", "name": "VOBL"}}
        new_response = self.client.post("/api/v1/aerodromes/VOBL/osm-snapshots", json=new_airport)
        self.assertEqual(new_response.status_code, 200, new_response.text)
        self.assertIn("VOBL", [row["icao"] for row in self.client.get("/api/v1/aerodromes").json()])
        osm_only = self.client.get("/api/v1/aerodromes/VOBL").json()
        self.assertEqual(osm_only["features"], [])
        self.assertIsNone(osm_only["elevationMeters"])

    def test_migrates_legacy_osm_without_losing_seed_or_unknowns(self):
        legacy = {
            "icao": "KSFO", "iata": "SFO", "name": "Legacy", "city": "Imported",
            "country": "International", "center": [37.619, -122.375],
            "elevationMeters": 20, "magneticVariation": "0.0", "transitionAltitudeFt": 10000,
            "source": "OpenStreetMap Aeroway Ingest",
            "features": [{
                "id": "OSM-RWY-123", "featureClass": "RunwayElement",
                "coordinates": [[37.61, -122.38], [37.62, -122.37]],
                "lengthMeters": 3000, "pcnRating": "100/F/A/W/T",
                "properties": {"osmTags": {"aeroway": "runway", "ref": "10R/28L"}},
            }],
        }
        session = database.create_session()
        try:
            database.upsert_dataset(session, legacy)
            session.commit()
        finally:
            session.close()
        database.initialize_database()
        database.initialize_database()
        self.assertEqual(len(self.client.get("/api/v1/aerodromes/KSFO").json()["features"]), 62)
        url = "/api/v1/aerodromes/KSFO/osm-snapshots"
        history = self.client.get(url).json()
        self.assertEqual(len(history), 1)
        self.assertIsNone(history[0]["capturedAt"])
        data = self.client.get(f"{url}/{history[0]['id']}").json()["dataset"]
        self.assertIsNone(data["elevationMeters"])
        self.assertEqual(data["features"][0]["geometryType"], "LineString")
        self.assertNotIn("lengthMeters", data["features"][0])
        self.assertEqual(data["features"][0]["tags"]["ref"], "10R/28L")
        session = database.create_session()
        try:
            old_snapshot = database.add_source_snapshot(session, "KSFO", "osm", {
                "dataset": legacy, "legacy": True, "attribution": "OpenStreetMap contributors",
                "osmTimestamp": None,
            })
            old_id = old_snapshot.id
            session.commit()
        finally:
            session.close()
        normalized = self.client.get(f"{url}/{old_id}").json()["dataset"]["features"][0]
        self.assertEqual(normalized["osmId"], 123)
        self.assertNotIn("lengthMeters", normalized)
        session = database.create_session()
        try:
            stored = session.get(database.SourceSnapshotModel, old_id)
            self.assertIn("featureClass", stored.payload["dataset"]["features"][0])
        finally:
            session.close()


if __name__ == "__main__":
    unittest.main()
