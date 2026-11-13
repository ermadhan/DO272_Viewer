"""Database models and persistence helpers for DO-272 aerodrome datasets."""

import json
import os
from copy import deepcopy
from pathlib import Path
from typing import Any, Literal

from sqlalchemy import (
    Column,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    create_engine,
    event,
    inspect,
    text,
)
from sqlalchemy.engine import Engine, URL
from sqlalchemy.orm import declarative_base, relationship, sessionmaker


DatabaseEngine = Literal["postgres", "sqlite"]
DATABASE_DIRECTORY = Path(__file__).resolve().parent
SEED_DATA_PATH = DATABASE_DIRECTORY / "seed_data" / "airports.json"
POSTGRES_URL = os.getenv(
    "POSTGRES_URL",
    "postgresql://postgres:postgrespassword@localhost:5432/do272_aerodromes",
)

Base = declarative_base()


class AerodromeModel(Base):
    __tablename__ = "do272_aerodromes"

    icao = Column(String(10), primary_key=True)
    iata = Column(String(5), nullable=False, default="", server_default=text("''"))
    name = Column(String(255), nullable=False)
    city = Column(String(100), nullable=False, default="", server_default=text("''"))
    country = Column(String(100), nullable=False, default="", server_default=text("''"))
    center_lat = Column(Float, nullable=False)
    center_lng = Column(Float, nullable=False)
    elevation_m = Column(Float, nullable=False)
    magnetic_variation = Column(
        String(20),
        nullable=False,
        default="",
        server_default=text("''"),
    )
    transition_altitude_ft = Column(
        Integer,
        nullable=False,
        default=18000,
        server_default=text("18000"),
    )
    source = Column(String(100), nullable=False)

    feature_rows = relationship(
        "AerodromeFeatureModel",
        back_populates="aerodrome",
        cascade="all, delete-orphan",
        order_by="AerodromeFeatureModel.feature_index",
    )


class AerodromeFeatureModel(Base):
    __tablename__ = "do272_features"

    aerodrome_id = Column(
        String(10),
        ForeignKey("do272_aerodromes.icao", ondelete="CASCADE"),
        primary_key=True,
    )
    id = Column(String(150), primary_key=True)
    feature_index = Column(Integer, nullable=False)
    feature_class = Column(String(100), nullable=False, index=True)
    designator = Column(String(150), nullable=False, default="", server_default=text("''"))
    coordinates = Column(JSON, nullable=True)
    payload = Column(JSON, nullable=False)

    aerodrome = relationship("AerodromeModel", back_populates="feature_rows")


class SourceSnapshotModel(Base):
    __tablename__ = "do272_source_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    aerodrome_id = Column(String(10), nullable=False, index=True)
    source_kind = Column(String(20), nullable=False)
    captured_at = Column(String(40), nullable=True)
    payload = Column(JSON, nullable=False)


def sanitize_legacy_osm(dataset: dict[str, Any]) -> dict[str, Any]:
    """Keep legacy OSM data while removing attributes invented by the old importer."""
    result = deepcopy(dataset)
    result["iata"] = ""
    result["city"] = ""
    result["country"] = ""
    result["elevationMeters"] = None
    result["magneticVariation"] = ""
    result["transitionAltitudeFt"] = None
    features = []
    for feature in result["features"]:
        tags = feature.get("properties", {}).get("osmTags", {})
        coordinates = feature.get("coordinates")
        if not coordinates:
            raise ValueError(f"Legacy OSM feature {feature.get('id')} has no geometry")
        is_point = isinstance(coordinates[0], (float, int))
        osm_type = "node" if is_point else "way"
        feature_id = str(feature.get("id", ""))
        osm_id = feature_id.rsplit("-", 1)[-1]
        if not osm_id.isdigit():
            raise ValueError(f"Legacy OSM feature {feature_id} has no OSM identifier")
        features.append({
            "id": f"OSM-{osm_type}-{osm_id}", "osmType": osm_type, "osmId": int(osm_id),
            "version": None, "timestamp": None, "aeroway": tags.get("aeroway", ""),
            "designator": tags.get("ref") or tags.get("name") or "",
            "geometryType": "Point" if is_point else "LineString",
            "coordinates": coordinates, "tags": tags,
        })
    result["features"] = features
    return result


def add_source_snapshot(session, icao: str, kind: str, payload: dict[str, Any],
                        captured_at: str | None = None) -> SourceSnapshotModel:
    snapshot = SourceSnapshotModel(
        aerodrome_id=icao, source_kind=kind, captured_at=captured_at, payload=payload
    )
    session.add(snapshot)
    session.flush()
    return snapshot


def snapshot_payload(snapshot: SourceSnapshotModel) -> dict[str, Any]:
    payload = snapshot.payload
    dataset = payload["dataset"]
    if snapshot.source_kind == "osm" and payload.get("legacy") and any(
        "osmType" not in feature for feature in dataset.get("features", [])
    ):
        return {**payload, "dataset": sanitize_legacy_osm(dataset)}
    return payload


def latest_snapshot(session, icao: str, kind: str) -> SourceSnapshotModel | None:
    return (
        session.query(SourceSnapshotModel)
        .filter_by(aerodrome_id=icao, source_kind=kind)
        .order_by(SourceSnapshotModel.id.desc())
        .first()
    )


_engines: dict[str, Engine] = {}
_session_factories: dict[str, sessionmaker] = {}
_requested_engine = os.getenv("DATABASE_ENGINE", "sqlite").strip().lower()
if _requested_engine not in ("sqlite", "postgres"):
    raise ValueError("DATABASE_ENGINE must be 'sqlite' or 'postgres'")
_active_engine_name: DatabaseEngine = (
    "postgres" if _requested_engine == "postgres" else "sqlite"
)


def _create_engine(engine_name: DatabaseEngine) -> Engine:
    if engine_name == "sqlite":
        sqlite_url = os.getenv("SQLITE_URL")
        url = sqlite_url or URL.create(
            "sqlite",
            database=str(DATABASE_DIRECTORY / "do272_aerodromes.db"),
        )
        engine = create_engine(url, connect_args={"check_same_thread": False})

        @event.listens_for(engine, "connect")
        def enable_foreign_keys(connection, _):
            cursor = connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        return engine

    return create_engine(POSTGRES_URL, pool_pre_ping=True)


def get_engine(engine_name: DatabaseEngine | None = None) -> Engine:
    name = engine_name or _active_engine_name
    if name not in _engines:
        _engines[name] = _create_engine(name)
    return _engines[name]


def get_active_engine_name() -> DatabaseEngine:
    return _active_engine_name


def _get_session_factory(engine_name: DatabaseEngine) -> sessionmaker:
    if engine_name not in _session_factories:
        _session_factories[engine_name] = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=get_engine(engine_name),
        )
    return _session_factories[engine_name]


def create_session():
    return _get_session_factory(get_active_engine_name())()


def _migrate_aerodrome_columns(engine: Engine) -> None:
    existing_columns = {
        column["name"] for column in inspect(engine).get_columns("do272_aerodromes")
    }
    migrations = {
        "magnetic_variation": "VARCHAR(20) NOT NULL DEFAULT ''",
        "transition_altitude_ft": "INTEGER NOT NULL DEFAULT 18000",
    }
    with engine.begin() as connection:
        for column_name, column_definition in migrations.items():
            if column_name not in existing_columns:
                connection.execute(
                    text(
                        f"ALTER TABLE do272_aerodromes "
                        f"ADD COLUMN {column_name} {column_definition}"
                    )
                )

    feature_columns = {
        column["name"] for column in inspect(engine).get_columns("do272_features")
    }
    if "feature_index" not in feature_columns:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "ALTER TABLE do272_features "
                    "ADD COLUMN feature_index INTEGER NOT NULL DEFAULT 0"
                )
            )


def upsert_dataset(session, dataset: dict[str, Any]) -> None:
    icao = str(dataset["icao"]).strip().upper()
    center = dataset["center"]
    aerodrome = session.get(AerodromeModel, icao)
    if aerodrome is None:
        aerodrome = AerodromeModel(icao=icao)
        session.add(aerodrome)

    aerodrome.iata = dataset.get("iata") or ""
    aerodrome.name = dataset["name"]
    aerodrome.city = dataset.get("city") or ""
    aerodrome.country = dataset.get("country") or ""
    aerodrome.center_lat = float(center[0])
    aerodrome.center_lng = float(center[1])
    aerodrome.elevation_m = float(dataset["elevationMeters"])
    aerodrome.magnetic_variation = dataset.get("magneticVariation") or ""
    aerodrome.transition_altitude_ft = int(dataset.get("transitionAltitudeFt", 18000))
    aerodrome.source = dataset["source"]
    aerodrome.feature_rows.clear()
    session.flush()
    aerodrome.feature_rows = [
        AerodromeFeatureModel(
            aerodrome_id=icao,
            id=str(feature["id"]),
            feature_index=index,
            feature_class=str(feature["featureClass"]),
            designator=str(feature.get("designator") or ""),
            coordinates=feature.get("coordinates"),
            payload=feature,
        )
        for index, feature in enumerate(dataset.get("features", []))
    ]


def serialize_dataset(aerodrome: AerodromeModel) -> dict[str, Any]:
    return {
        "icao": aerodrome.icao,
        "iata": aerodrome.iata,
        "name": aerodrome.name,
        "city": aerodrome.city,
        "country": aerodrome.country,
        "center": [aerodrome.center_lat, aerodrome.center_lng],
        "elevationMeters": aerodrome.elevation_m,
        "magneticVariation": aerodrome.magnetic_variation,
        "transitionAltitudeFt": aerodrome.transition_altitude_ft,
        "source": aerodrome.source,
        "features": [feature.payload for feature in aerodrome.feature_rows],
    }


def initialize_database(engine_name: DatabaseEngine | None = None) -> None:
    name = engine_name or get_active_engine_name()
    engine = get_engine(name)
    Base.metadata.create_all(bind=engine)
    _migrate_aerodrome_columns(engine)

    if not SEED_DATA_PATH.exists():
        raise FileNotFoundError(f"Required airport seed data was not found: {SEED_DATA_PATH}")

    with SEED_DATA_PATH.open(encoding="utf-8") as seed_file:
        seed_datasets = json.load(seed_file)

    session = _get_session_factory(name)()
    try:
        for dataset in seed_datasets.values():
            icao = str(dataset["icao"]).strip().upper()
            if session.get(AerodromeModel, icao) is None:
                upsert_dataset(session, dataset)
        session.flush()
        for aerodrome in session.query(AerodromeModel).all():
            icao = str(aerodrome.icao)
            if aerodrome.source == "OpenStreetMap Aeroway Ingest":
                if latest_snapshot(session, icao, "osm") is None:
                    add_source_snapshot(
                        session, icao, "osm",
                        {"dataset": sanitize_legacy_osm(serialize_dataset(aerodrome)),
                         "attribution": "OpenStreetMap contributors",
                         "osmTimestamp": None, "legacy": True},
                    )
                if icao in seed_datasets and latest_snapshot(session, icao, "curated") is None:
                    add_source_snapshot(session, icao, "curated", {"dataset": seed_datasets[icao]})
        session.commit()
    finally:
        session.close()


def activate_engine(engine_name: str) -> DatabaseEngine:
    global _active_engine_name
    normalized_name = engine_name.strip().lower()
    if normalized_name not in ("sqlite", "postgres"):
        raise ValueError("Engine must be 'postgres' or 'sqlite'")

    initialize_database(normalized_name)
    _active_engine_name = normalized_name
    return get_active_engine_name()
