import sys
import csv
import io
import tempfile
import unittest
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import URL

BACKEND_DIRECTORY = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIRECTORY))

import database
import faa_nasr
import nats_aip
import ourairports
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

    def test_curated_import_requires_activation_and_preserves_original(self):
        baseline = self.client.get("/api/v1/aerodromes/KSFO").json()
        imported = {
            "dataset": {**baseline, "name": "FAA test", "source": "FAA NASR (partial)",
                        "elevationMeters": None, "transitionAltitudeFt": None,
                        "features": [{**baseline["features"][0], "lengthMeters": 1234}]},
            "provider": "FAA NASR", "effectiveDate": "2026/10/29",
            "coverage": "Partial", "skippedRunways": [],
        }
        with patch("main.fetch_airport", return_value=imported):
            response = self.client.post("/api/v1/aerodromes/KSFO/curated-import")
        self.assertEqual(response.status_code, 200, response.text)
        snapshot_id = response.json()["id"]
        self.assertEqual(self.client.get("/api/v1/aerodromes/KSFO").json(), baseline)
        self.assertEqual(response.json()["comparison"]["baselineCounts"]["RunwayElement"], 4)
        self.assertEqual(response.json()["comparison"]["runways"][0]["importLength"], 1234)
        self.assertEqual(self.client.post(
            f"/api/v1/aerodromes/KSFO/curated-snapshots/{snapshot_id}/activate"
        ).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/aerodromes/KSFO").json()["name"], "FAA test")
        self.assertEqual(self.client.delete("/api/v1/aerodromes/KSFO/active-curated-snapshot").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/aerodromes/KSFO").json(), baseline)
        self.assertEqual(self.client.post(
            f"/api/v1/aerodromes/EGLL/curated-snapshots/{snapshot_id}/activate"
        ).status_code, 404)

    def test_new_curated_airport_is_not_exposed_before_activation(self):
        dataset = {
            "icao": "KNEW", "name": "New", "iata": "", "city": "", "country": "US",
            "center": [10, 20], "elevationMeters": None, "magneticVariation": "",
            "transitionAltitudeFt": None, "source": "FAA NASR (partial)", "features": [],
        }
        with patch("main.fetch_airport", return_value={"dataset": dataset, "provider": "FAA NASR"}):
            response = self.client.post("/api/v1/aerodromes/KNEW/curated-import")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/v1/aerodromes/KNEW").status_code, 404)
        snapshot_id = response.json()["id"]
        self.assertEqual(self.client.post(
            f"/api/v1/aerodromes/KNEW/curated-snapshots/{snapshot_id}/activate"
        ).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/aerodromes/KNEW").json(), dataset)
        self.assertIn("KNEW", [row["icao"] for row in self.client.get("/api/v1/aerodromes").json()])

    def test_selected_nats_provider_saves_pending_snapshot(self):
        baseline = self.client.get("/api/v1/aerodromes/EGLL").json()
        dataset = {**baseline, "name": "NATS test", "source": "NATS UK AIP (partial)", "features": []}
        payload = {"dataset": dataset, "provider": "NATS UK AIP", "license": "Not for resale"}
        with patch("main.fetch_nats_airport", return_value=payload) as fetch, patch("main.fetch_airport") as faa:
            response = self.client.post("/api/v1/aerodromes/EGLL/curated-import?provider=nats")
        self.assertEqual(response.status_code, 200, response.text)
        fetch.assert_called_once_with("EGLL")
        faa.assert_not_called()
        self.assertEqual(self.client.get("/api/v1/aerodromes/EGLL").json(), baseline)
        snapshot_id = response.json()["id"]
        self.assertEqual(self.client.get(f"/api/v1/aerodromes/EGLL/curated-snapshots/{snapshot_id}").json()["license"], "Not for resale")
        self.assertEqual(self.client.post(f"/api/v1/aerodromes/EGLL/curated-snapshots/{snapshot_id}/activate").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/aerodromes/EGLL").json(), dataset)
        self.assertEqual(self.client.post("/api/v1/aerodromes/EGLL/curated-import?provider=dfs").status_code, 422)

    def test_new_nats_airport_requires_activation(self):
        dataset = {"icao": "EGZZ", "name": "New", "iata": "", "city": "", "country": "United Kingdom",
                   "center": [50, 1], "elevationMeters": None, "magneticVariation": "",
                   "transitionAltitudeFt": None, "source": "NATS UK AIP (partial)", "features": []}
        with patch("main.fetch_nats_airport", return_value={"dataset": dataset, "provider": "NATS UK AIP"}):
            response = self.client.post("/api/v1/aerodromes/EGZZ/curated-import?provider=nats")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.client.get("/api/v1/aerodromes/EGZZ").status_code, 404)
        snapshot_id = response.json()["id"]
        self.assertEqual(self.client.post(f"/api/v1/aerodromes/EGZZ/curated-snapshots/{snapshot_id}/activate").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/aerodromes/EGZZ").json(), dataset)

    def test_community_import_is_saved_separately_and_requires_activation(self):
        baseline = self.client.get("/api/v1/aerodromes/OMDB").json()
        dataset = {**baseline, "name": "Community test", "source": "OurAirports community (partial)",
                   "features": [baseline["features"][0]]}
        payload = {"dataset": dataset, "provider": "OurAirports community",
                   "raw": {"airport": {"id": "123"}, "runways": []}}
        with patch("main.fetch_ourairports_airport", return_value=payload) as fetch:
            response = self.client.post("/api/v1/aerodromes/OMDB/curated-import?provider=ourairports")
        self.assertEqual(response.status_code, 200, response.text)
        fetch.assert_called_once_with("OMDB")
        snapshot_id = response.json()["id"]
        self.assertEqual(self.client.get("/api/v1/aerodromes/OMDB").json(), baseline)
        saved = self.client.get(f"/api/v1/aerodromes/OMDB/curated-snapshots/{snapshot_id}").json()
        self.assertEqual(saved["raw"]["airport"]["id"], "123")
        session = database.create_session()
        try:
            row = session.query(database.SnapshotFeatureModel).filter_by(snapshot_id=snapshot_id).one()
            self.assertEqual(row.payload, dataset["features"][0])
        finally:
            session.close()
        self.assertEqual(self.client.post(f"/api/v1/aerodromes/OMDB/curated-snapshots/{snapshot_id}/activate").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/aerodromes/OMDB").json(), dataset)
        self.assertEqual(self.client.delete("/api/v1/aerodromes/OMDB/active-curated-snapshot").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/aerodromes/OMDB").json(), baseline)

    def test_pending_curated_does_not_replace_osm_only_airport(self):
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
        self.assertEqual(self.client.post("/api/v1/aerodromes/KNEW/osm-snapshots", json=osm).status_code, 200)
        dataset = {**osm["dataset"], "name": "Pending FAA", "source": "FAA NASR (partial)", "features": []}
        with patch("main.fetch_airport", return_value={"dataset": dataset, "provider": "FAA NASR"}):
            self.assertEqual(self.client.post("/api/v1/aerodromes/KNEW/curated-import").status_code, 200)
        visible = self.client.get("/api/v1/aerodromes/KNEW").json()
        self.assertEqual(visible["name"], "OSM airport")
        self.assertEqual(visible["features"], [])

    def test_relation_snapshot_members_are_stored_as_individual_features(self):
        snapshot = {
            "dataset": {
                "icao": "VOBL", "name": "Test", "center": [1, 2],
                "elevationMeters": None, "transitionAltitudeFt": None,
                "source": "OpenStreetMap Aeroway Ingest",
                "features": [{
                    "id": "OSM-relation-7", "osmType": "relation", "osmId": 7,
                    "version": 1, "timestamp": None, "aeroway": "apron", "designator": "",
                    "geometryType": "GeometryCollection", "coordinates": [[[1, 2], [1, 3]]],
                    "tags": {"aeroway": "apron"},
                    "members": [{"type": "way", "ref": 8, "role": "inner",
                                 "geometry": [{"lat": 1, "lon": 2}, {"lat": 1, "lon": 3}]}],
                }],
            }, "attribution": "OpenStreetMap contributors",
        }
        response = self.client.post("/api/v1/aerodromes/VOBL/osm-snapshots", json=snapshot)
        self.assertEqual(response.status_code, 200, response.text)
        session = database.create_session()
        try:
            row = session.query(database.SnapshotFeatureModel).filter_by(snapshot_id=response.json()["id"]).one()
            self.assertEqual(row.payload["members"][0]["role"], "inner")
            database.initialize_database()
            self.assertEqual(session.query(database.SnapshotFeatureModel).filter_by(snapshot_id=response.json()["id"]).count(), 1)
        finally:
            session.close()


class OurAirportsTests(unittest.TestCase):
    def setUp(self):
        self.airports = (b"id,icao_code,iata_code,name,municipality,iso_country,latitude_deg,longitude_deg,elevation_ft\n"
                         b"42,VOBL,ABC,Test Airport,Test City,IN,13,77,\n")
        self.runways = (
            b"id,airport_ref,le_ident,he_ident,le_latitude_deg,le_longitude_deg,he_latitude_deg,he_longitude_deg,closed,length_ft,width_ft\n"
            b"1,42,09,27,13,77,13.01,77.01,0,1000,\n"
            b"2,42,10,28,13,77,,,1,,\n"
            b"3,43,11,29,13,77,13.02,77.02,0,2000,50\n"
        )

    def test_maps_airport_and_runway_without_inventing_unknowns(self):
        payload = ourairports.parse_data(self.airports, self.runways, "VOBL")
        self.assertEqual(payload["dataset"]["center"], [13, 77])
        self.assertIsNone(payload["dataset"]["elevationMeters"])
        self.assertIsNone(payload["effectiveDate"])
        runway = payload["dataset"]["features"][0]
        self.assertEqual(runway["coordinates"], [[13, 77], [13.01, 77.01]])
        self.assertEqual(runway["lengthMeters"], 304.8)
        self.assertNotIn("widthMeters", runway)
        self.assertEqual(runway["status"], "Unknown")
        self.assertEqual(payload["skippedRunways"], ["10/28"])
        self.assertEqual(len(payload["raw"]["runways"]), 2)

    def test_invalid_or_missing_data_fails_explicitly(self):
        with self.assertRaises(ourairports.FeedError):
            ourairports.parse_data(self.airports, self.runways, "OMDB")
        with self.assertRaises(ourairports.FeedError):
            ourairports.parse_data(self.airports, b"id,airport_ref\n1,42\n", "VOBL")
        with self.assertRaises(ourairports.FeedError):
            ourairports.parse_data(self.airports.replace(b",13,77,", b",nan,77,"), self.runways, "VOBL")


class NatsAipTests(unittest.TestCase):
    def archive(self, second_role="DISTHR", second_crs=nats_aip.CRS):
        def feature(kind, ident, fields):
            return f"""<m:hasMember><a:{kind}><g:identifier>{ident}</g:identifier>
              <a:timeSlice><a:{kind}TimeSlice><g:validTime><g:TimePeriod>
                <g:beginPosition>2026-01-01T00:00:00Z</g:beginPosition><g:endPosition/>
              </g:TimePeriod></g:validTime><a:interpretation>BASELINE</a:interpretation>
              {fields}</a:{kind}TimeSlice></a:timeSlice></a:{kind}></m:hasMember>"""
        def point(direction, role, lat, crs):
            return feature("RunwayCentrelinePoint", direction + "-pt",
                f'<a:role>{role}</a:role><a:onRunway x:href="urn:uuid:{direction}"/>'
                f'<a:location><a:ElevatedPoint srsName="{crs}"><g:pos>{lat} 1</g:pos>'
                '</a:ElevatedPoint></a:location>')
        content = [
            feature("AirportHeliport", "airport", f'<a:locationIndicatorICAO>EGZZ</a:locationIndicatorICAO>'
                    f'<a:name>Test</a:name><a:ARP><a:ElevatedPoint srsName="{nats_aip.CRS}">'
                    '<g:pos>50 1</g:pos></a:ElevatedPoint></a:ARP>'),
            feature("Runway", "runway", '<a:designator>09/27</a:designator><a:type>RWY</a:type>'
                    '<a:nominalLength uom="FT">1000</a:nominalLength>'
                    '<a:associatedAirportHeliport x:href="urn:uuid:airport"/>'),
            feature("RunwayDirection", "one", '<a:designator>09</a:designator><a:usedRunway x:href="urn:uuid:runway"/>'),
            feature("RunwayDirection", "two", '<a:designator>27</a:designator><a:usedRunway x:href="urn:uuid:runway"/>'),
            point("one", "THR", "50", nats_aip.CRS), point("two", second_role, "50.01", second_crs),
        ]
        xml = ('<m:BasicMessage xmlns:m="http://www.aixm.aero/schema/5.1/message" '
               'xmlns:a="http://www.aixm.aero/schema/5.1" xmlns:g="http://www.opengis.net/gml/3.2" '
               'xmlns:x="http://www.w3.org/1999/xlink">' + "".join(content) + '</m:BasicMessage>')
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as archive:
            archive.writestr("EG_AIP_DS_FULL_20261029.xml", xml)
        return output.getvalue()

    def test_current_cycle_excludes_future_and_other_hosts(self):
        page = ('<a href="/ICAO_AIP/EG_AIP_DS_20261029_XML.zip"></a>'
                '<a href="/ICAO_AIP/EG_AIP_DS_20261126_XML.zip"></a>'
                '<a href="https://example.test/ICAO_AIP/EG_AIP_DS_20261101_XML.zip"></a>')
        _, effective = nats_aip.current_archive_url(page, datetime(2026, 11, 13, tzinfo=timezone.utc))
        self.assertEqual(effective, "2026-10-29")

    def test_maps_thresholds_and_preserves_unknowns(self):
        now = datetime(2026, 11, 13, tzinfo=timezone.utc)
        result = nats_aip.parse_archive(self.archive(), "EGZZ", "https://example.test", "2026-10-29", now)
        runway = result["dataset"]["features"][0]
        self.assertEqual(runway["coordinates"], [[50, 1], [50.01, 1]])
        self.assertEqual(runway["lengthMeters"], 304.8)
        self.assertNotIn("widthMeters", runway)
        self.assertEqual(runway["properties"]["geometry"], "threshold-to-threshold")
        self.assertEqual(len(result["raw"]["thresholds"]), 2)
        self.assertIsNone(result["dataset"]["transitionAltitudeFt"])
        self.assertIn("not for resale", result["license"])

    def test_unsupported_geometry_is_skipped_but_raw_retained(self):
        now = datetime(2026, 11, 13, tzinfo=timezone.utc)
        result = nats_aip.parse_archive(self.archive(second_crs="unknown"), "EGZZ", "https://example.test", "2026-10-29", now)
        self.assertEqual(result["dataset"]["features"], [])
        self.assertEqual(result["skippedRunways"], ["09/27"])
        self.assertEqual(len(result["raw"]["thresholds"]), 2)
        with self.assertRaises(nats_aip.FeedError):
            nats_aip.parse_archive(self.archive(), "EGNO", "https://example.test", "2026-10-29", now)


class FaaNasrTests(unittest.TestCase):
    def test_parses_runways_and_leaves_missing_values_unknown(self):
        def table(rows):
            output = io.StringIO(newline="")
            writer = csv.DictWriter(output, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
            return output.getvalue()
        airport = {"ICAO_ID": "KSFO", "SITE_NO": "123", "LAT_DECIMAL": "37", "LONG_DECIMAL": "-122",
                   "ARPT_NAME": "Test", "CITY": "Test", "COUNTRY_CODE": "US", "ELEV": "",
                   "EFF_DATE": "2026/10/29"}
        runway = {"SITE_NO": "123", "RWY_ID": "01/19", "RWY_LEN": "1000", "RWY_WIDTH": ""}
        ends = [{"SITE_NO": "123", "RWY_ID": "01/19", "LAT_DECIMAL": "37", "LONG_DECIMAL": "-122"},
                {"SITE_NO": "123", "RWY_ID": "01/19", "LAT_DECIMAL": "37.01", "LONG_DECIMAL": "-122"}]
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("APT_BASE.csv", table([airport]))
            archive.writestr("APT_RWY.csv", table([runway]))
            archive.writestr("APT_RWY_END.csv", table(ends))
        payload = faa_nasr.parse_archive(buffer.getvalue(), "KSFO", "https://example.test")
        feature = payload["dataset"]["features"][0]
        self.assertEqual(feature["geometryType"], "LineString")
        self.assertEqual(feature["lengthMeters"], 304.8)
        self.assertNotIn("widthMeters", feature)
        self.assertEqual(feature["status"], "Unknown")
        self.assertIsNone(payload["dataset"]["elevationMeters"])
        self.assertIsNone(payload["dataset"]["transitionAltitudeFt"])
        with self.assertRaises(faa_nasr.FeedError):
            faa_nasr.parse_archive(buffer.getvalue(), "EGLL", "https://example.test")


if __name__ == "__main__":
    unittest.main()
