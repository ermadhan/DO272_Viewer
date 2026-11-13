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
            "source": "OpenStreetMap Aeroway Ingest",
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


if __name__ == "__main__":
    unittest.main()
