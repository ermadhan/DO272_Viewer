"""DO-272 aerodrome API backed by SQLite or PostgreSQL."""

import math
import re
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Literal

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload
import uvicorn

from database import (
    AerodromeFeatureModel,
    AerodromeModel,
    ActiveCuratedSnapshotModel,
    SourceSnapshotModel,
    activate_engine,
    add_source_snapshot,
    create_session,
    get_active_engine_name,
    get_engine,
    initialize_database,
    latest_snapshot,
    serialize_dataset,
    snapshot_payload,
    upsert_dataset,
)
from faa_nasr import FeedError, fetch_airport
from nats_aip import fetch_airport as fetch_nats_airport
from ourairports import fetch_airport as fetch_ourairports_airport


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    initialize_database()
    yield


app = FastAPI(
    title="DO-272 Aerodrome Spatial GIS Engine",
    description="Aerodrome data API backed by a persistent SQLite or PostgreSQL database.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AerodromeDatasetPayload(BaseModel):
    icao: str
    iata: str = ""
    name: str
    city: str = ""
    country: str = ""
    center: tuple[float, float]
    elevationMeters: float | None = None
    magneticVariation: str = ""
    transitionAltitudeFt: int | None = 18000
    source: str
    features: list[dict[str, Any]]


class EngineToggleRequest(BaseModel):
    engine: str


class OsmMemberPayload(BaseModel):
    type: Literal["node", "way", "relation"]
    ref: int = Field(gt=0)
    role: str
    geometry: list[dict[str, float]] | None = None
    lat: float | None = None
    lon: float | None = None


class OsmFeaturePayload(BaseModel):
    id: str
    osmType: Literal["node", "way", "relation"]
    osmId: int = Field(gt=0)
    version: int | None
    timestamp: str | None
    aeroway: str
    designator: str
    geometryType: Literal["Point", "LineString", "Polygon", "GeometryCollection"]
    coordinates: tuple[float, float] | list[tuple[float, float]] | list[list[tuple[float, float]]]
    tags: dict[str, str]
    members: list[OsmMemberPayload] | None = None

    @model_validator(mode="after")
    def validate_geometry(self):
        if self.id != f"OSM-{self.osmType}-{self.osmId}":
            raise ValueError("OSM feature ID does not match object type and ID")
        if (self.osmType == "node") != (self.geometryType == "Point"):
            raise ValueError("OSM node and geometry types do not match")
        if (self.osmType == "relation") != (self.geometryType == "GeometryCollection"):
            raise ValueError("OSM relation and geometry types do not match")
        if self.geometryType == "Point":
            if not isinstance(self.coordinates, tuple):
                raise ValueError("Point geometry must have one coordinate")
            points = [self.coordinates]
        elif self.geometryType == "GeometryCollection":
            if self.members is None or not isinstance(self.coordinates, list):
                raise ValueError("Relation must contain its members and geometry collection")
            points = []
            for part in self.coordinates:
                if not isinstance(part, list) or not part:
                    raise ValueError("Relation geometry parts must contain coordinates")
                points.extend(part)
        else:
            if not isinstance(self.coordinates, list):
                raise ValueError("Line and polygon geometries must have coordinate lists")
            points = self.coordinates
            if any(not isinstance(point, tuple) for point in points):
                raise ValueError("Line and polygon coordinates must be points")
            minimum = 4 if self.geometryType == "Polygon" else 2
            if len(points) < minimum:
                raise ValueError("Geometry has too few coordinates")
            if self.geometryType == "Polygon" and points[0] != points[-1]:
                raise ValueError("Polygon geometry must be closed")
        if any(not math.isfinite(lat) or not math.isfinite(lon) or
               not -90 <= lat <= 90 or not -180 <= lon <= 180 for lat, lon in points):
            raise ValueError("Coordinates must be valid WGS-84 latitude and longitude")
        return self


class OsmSnapshotPayload(BaseModel):
    dataset: AerodromeDatasetPayload
    osmTimestamp: str | None = None
    attribution: str
    boundary: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_features(self):
        if not {"elevationMeters", "transitionAltitudeFt"}.issubset(self.dataset.model_fields_set):
            raise ValueError("OSM elevation and transition altitude must be supplied or explicitly null")
        identifiers = set()
        lat, lon = self.dataset.center
        if not math.isfinite(lat) or not math.isfinite(lon) or not -90 <= lat <= 90 or not -180 <= lon <= 180:
            raise ValueError("Airport center must be valid WGS-84 latitude and longitude")
        if not self.dataset.features:
            raise ValueError("OSM snapshot must contain features")
        for feature in self.dataset.features:
            parsed = OsmFeaturePayload.model_validate(feature)
            if parsed.id in identifiers:
                raise ValueError(f"Duplicate OSM feature {parsed.id}")
            identifiers.add(parsed.id)
        return self


class RouteRequest(BaseModel):
    aerodrome_icao: str
    origin_key: str
    destination_key: str


class ObstacleRequest(BaseModel):
    aerodrome_icao: str


def get_db():
    session = create_session()
    try:
        yield session
    finally:
        session.close()


def haversine(c1, c2):
    earth_radius_m = 6371000
    lat1, lon1 = c1
    lat2, lon2 = c2
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return 2 * earth_radius_m * math.asin(math.sqrt(a))


@app.get("/")
def read_root():
    return {
        "status": "online",
        "standard": "RTCA DO-272 / EUROCAE ED-99",
        "mcp_enabled": True,
        "database": get_active_engine_name(),
    }


@app.get("/api/v1/aerodromes")
def list_aerodromes(db: Session = Depends(get_db)):
    rows = (
        db.query(
            AerodromeModel.icao,
            AerodromeModel.iata,
            AerodromeModel.name,
            AerodromeModel.city,
            AerodromeModel.country,
            func.count(AerodromeFeatureModel.id).label("feature_count"),
        )
        .outerjoin(
            AerodromeFeatureModel,
            AerodromeFeatureModel.aerodrome_id == AerodromeModel.icao,
        )
        .group_by(AerodromeModel.icao)
        .order_by(AerodromeModel.icao)
        .all()
    )
    result = [
        {
            "icao": row.icao,
            "iata": row.iata,
            "name": row.name,
            "city": row.city,
            "country": row.country,
            "featureCount": row.feature_count,
        }
        for row in rows
    ]
    present = {row["icao"] for row in result}
    for row in result:
        aerodrome = db.get(AerodromeModel, row["icao"])
        if aerodrome.source == "OpenStreetMap Aeroway Ingest":
            curated = db.query(SourceSnapshotModel).filter_by(
                aerodrome_id=row["icao"], source_kind="curated"
            ).order_by(SourceSnapshotModel.id.desc()).all()
            curated = next((item for item in curated if not item.payload.get("provider")), None)
            if curated:
                dataset = curated.payload["dataset"]
                row.update({key: dataset.get(key, "") for key in ("iata", "name", "city", "country")})
                row["featureCount"] = len(dataset["features"])
            else:
                row["featureCount"] = 0
    snapshot_icaos = db.query(SourceSnapshotModel.aerodrome_id).filter_by(source_kind="osm").distinct().all()
    for (icao,) in snapshot_icaos:
        if icao not in present:
            snapshot = latest_snapshot(db, icao, "osm")
            dataset = snapshot.payload["dataset"]
            result.append({
                "icao": icao, "iata": dataset.get("iata") or "", "name": dataset["name"],
                "city": dataset.get("city") or "", "country": dataset.get("country") or "",
                "featureCount": 0,
            })
    for active in db.query(ActiveCuratedSnapshotModel).all():
        snapshot = db.get(SourceSnapshotModel, active.snapshot_id)
        dataset = snapshot.payload["dataset"]
        summary = {
            "icao": active.aerodrome_id, "iata": dataset.get("iata") or "",
            "name": dataset["name"], "city": dataset.get("city") or "",
            "country": dataset.get("country") or "", "featureCount": len(dataset["features"]),
        }
        result = [row for row in result if row["icao"] != active.aerodrome_id]
        result.append(summary)
    return sorted(result, key=lambda row: row["icao"])


@app.get("/api/v1/aerodromes/{icao}")
def get_aerodrome(icao: str, db: Session = Depends(get_db)):
    icao = icao.strip().upper()
    active = db.get(ActiveCuratedSnapshotModel, icao)
    if active:
        return db.get(SourceSnapshotModel, active.snapshot_id).payload["dataset"]
    aerodrome = (
        db.query(AerodromeModel)
        .options(selectinload(AerodromeModel.feature_rows))
        .filter(AerodromeModel.icao == icao)
        .one_or_none()
    )
    if aerodrome is not None and aerodrome.source != "OpenStreetMap Aeroway Ingest":
        return serialize_dataset(aerodrome)
    curated = db.query(SourceSnapshotModel).filter_by(
        aerodrome_id=icao, source_kind="curated"
    ).order_by(SourceSnapshotModel.id.desc()).all()
    curated = next((item for item in curated if not item.payload.get("provider")), None)
    if curated:
        return curated.payload["dataset"]
    osm = latest_snapshot(db, icao, "osm")
    if osm:
        return {**snapshot_payload(osm)["dataset"], "features": []}
    raise HTTPException(status_code=404, detail=f"Aerodrome {icao} was not found")


@app.post("/api/v1/aerodromes/{icao}/curated-import")
def import_curated(icao: str, provider: Literal["faa", "nats", "ourairports"] = "faa", db: Session = Depends(get_db)):
    icao = icao.strip().upper()
    if not re.fullmatch(r"[A-Z]{4}", icao):
        raise HTTPException(status_code=422, detail="Enter a four-letter ICAO airport code")
    try:
        providers = {"faa": fetch_airport, "nats": fetch_nats_airport, "ourairports": fetch_ourairports_airport}
        payload = providers[provider](icao)
    except FeedError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    try:
        baseline = get_aerodrome(icao, db)
    except HTTPException as error:
        if error.status_code != 404:
            raise
        baseline = None
    def class_counts(dataset):
        counts = {}
        for feature in dataset["features"]:
            feature_class = feature["featureClass"]
            counts[feature_class] = counts.get(feature_class, 0) + 1
        return counts
    def runway_key(feature):
        return "/".join(sorted(str(feature.get("designator", "")).upper().replace(" ", "").split("/")))
    runway_comparisons = []
    if baseline:
        for feature in payload["dataset"]["features"]:
            if feature.get("featureClass") != "RunwayElement":
                continue
            matches = [item for item in baseline["features"]
                       if item.get("featureClass") == "RunwayElement"
                       and runway_key(item) == runway_key(feature)]
            if len(matches) == 1:
                runway_comparisons.append({
                    "designator": feature["designator"],
                    "baselineLength": matches[0].get("lengthMeters"),
                    "importLength": feature.get("lengthMeters"),
                    "baselineWidth": matches[0].get("widthMeters"),
                    "importWidth": feature.get("widthMeters"),
                })
    payload["comparison"] = {
        "baselineCounts": class_counts(baseline) if baseline else {},
        "importCounts": class_counts(payload["dataset"]),
        "baselineAvailable": baseline is not None and baseline["source"] != "OpenStreetMap Aeroway Ingest",
        "runways": runway_comparisons,
    }
    captured_at = datetime.now(timezone.utc).isoformat()
    snapshot = add_source_snapshot(db, icao, "curated", payload, captured_at)
    db.commit()
    return {"id": snapshot.id, "capturedAt": captured_at, **payload}


@app.get("/api/v1/aerodromes/{icao}/curated-snapshots")
def list_curated_snapshots(icao: str, db: Session = Depends(get_db)):
    icao = icao.strip().upper()
    active = db.get(ActiveCuratedSnapshotModel, icao)
    snapshots = db.query(SourceSnapshotModel).filter_by(
        aerodrome_id=icao, source_kind="curated"
    ).order_by(SourceSnapshotModel.id.desc()).all()
    return [
        {"id": row.id, "capturedAt": row.captured_at,
         "provider": row.payload.get("provider", "Legacy curated seed"),
         "effectiveDate": row.payload.get("effectiveDate"),
         "featureCount": len(row.payload["dataset"]["features"]),
         "active": active is not None and active.snapshot_id == row.id}
        for row in snapshots
    ]


@app.get("/api/v1/aerodromes/{icao}/curated-snapshots/{snapshot_id}")
def get_curated_snapshot(icao: str, snapshot_id: int, db: Session = Depends(get_db)):
    snapshot = db.query(SourceSnapshotModel).filter_by(
        id=snapshot_id, aerodrome_id=icao.strip().upper(), source_kind="curated"
    ).one_or_none()
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Curated snapshot was not found")
    return {"id": snapshot.id, "capturedAt": snapshot.captured_at, **snapshot.payload}


@app.post("/api/v1/aerodromes/{icao}/curated-snapshots/{snapshot_id}/activate")
def activate_curated_snapshot(icao: str, snapshot_id: int, db: Session = Depends(get_db)):
    icao = icao.strip().upper()
    snapshot = db.query(SourceSnapshotModel).filter_by(
        id=snapshot_id, aerodrome_id=icao, source_kind="curated"
    ).one_or_none()
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Curated snapshot was not found")
    active = db.get(ActiveCuratedSnapshotModel, icao)
    if active is None:
        active = ActiveCuratedSnapshotModel(aerodrome_id=icao, snapshot_id=snapshot.id)
        db.add(active)
    else:
        active.snapshot_id = snapshot.id
    db.commit()
    return {"activeSnapshotId": snapshot.id}


@app.delete("/api/v1/aerodromes/{icao}/active-curated-snapshot")
def restore_baseline(icao: str, db: Session = Depends(get_db)):
    icao = icao.strip().upper()
    baseline = db.get(AerodromeModel, icao)
    if baseline is None or baseline.source == "OpenStreetMap Aeroway Ingest":
        raise HTTPException(status_code=409, detail="No original baseline exists for this airport")
    active = db.get(ActiveCuratedSnapshotModel, icao)
    if active is not None:
        db.delete(active)
        db.commit()
    return {"status": "original baseline restored"}


@app.get("/api/v1/aerodromes/{icao}/osm-snapshots")
def list_osm_snapshots(icao: str, db: Session = Depends(get_db)):
    rows = (db.query(SourceSnapshotModel)
            .filter_by(aerodrome_id=icao.strip().upper(), source_kind="osm")
            .order_by(SourceSnapshotModel.id.desc()).all())
    return [{
        "id": row.id, "capturedAt": row.captured_at,
        "osmTimestamp": row.payload.get("osmTimestamp"),
        "attribution": row.payload.get("attribution"),
        "legacy": row.payload.get("legacy", False),
        "featureCount": len(row.payload["dataset"]["features"]),
    } for row in rows]


@app.get("/api/v1/aerodromes/{icao}/osm-snapshots/{snapshot_id}")
def get_osm_snapshot(icao: str, snapshot_id: int, db: Session = Depends(get_db)):
    row = (db.query(SourceSnapshotModel)
           .filter_by(id=snapshot_id, aerodrome_id=icao.strip().upper(), source_kind="osm")
           .one_or_none())
    if row is None:
        raise HTTPException(status_code=404, detail="OSM snapshot was not found")
    return {"id": row.id, "capturedAt": row.captured_at, **snapshot_payload(row)}


@app.post("/api/v1/aerodromes/{icao}/osm-snapshots")
def save_osm_snapshot(icao: str, snapshot: OsmSnapshotPayload, db: Session = Depends(get_db)):
    icao = icao.strip().upper()
    if snapshot.dataset.icao.strip().upper() != icao:
        raise HTTPException(status_code=422, detail="ICAO code does not match the snapshot")
    if snapshot.dataset.source != "OpenStreetMap Aeroway Ingest":
        raise HTTPException(status_code=422, detail="Snapshot source must be OpenStreetMap")
    if not snapshot.attribution.strip():
        raise HTTPException(status_code=422, detail="OSM attribution is required")
    payload = snapshot.model_dump()
    captured_at = datetime.now(timezone.utc).isoformat()
    row = add_source_snapshot(db, icao, "osm", payload, captured_at)
    db.commit()
    return {"id": row.id, "capturedAt": row.captured_at, **row.payload}


@app.put("/api/v1/aerodromes/{icao}")
def save_aerodrome(
    icao: str,
    dataset: AerodromeDatasetPayload,
    db: Session = Depends(get_db),
):
    normalized_icao = icao.strip().upper()
    if dataset.icao.strip().upper() != normalized_icao:
        raise HTTPException(
            status_code=422,
            detail="The ICAO code in the URL must match the dataset",
        )

    if dataset.source == "OpenStreetMap Aeroway Ingest":
        raise HTTPException(status_code=422, detail="Use the OSM snapshot endpoint for OSM imports")
    if dataset.elevationMeters is None or dataset.transitionAltitudeFt is None:
        raise HTTPException(status_code=422, detail="Aerodrome elevation and transition altitude are required")
    upsert_dataset(db, dataset.model_dump())
    db.commit()
    saved_aerodrome = (
        db.query(AerodromeModel)
        .options(selectinload(AerodromeModel.feature_rows))
        .filter(AerodromeModel.icao == normalized_icao)
        .one()
    )
    return serialize_dataset(saved_aerodrome)


@app.post("/api/v1/spatial/route")
def solve_taxi_route(req: RouteRequest):
    """Return a temporary sample route; map features are loaded from the database."""
    mock_waypoints = [
        [37.6142, -122.382],
        [37.6177, -122.381],
        [37.6182, -122.375],
        [37.6197, -122.388],
        [37.6175, -122.3885],
    ]
    distance = sum(
        haversine(mock_waypoints[i], mock_waypoints[i + 1])
        for i in range(len(mock_waypoints) - 1)
    )
    origin = req.origin_key
    destination = req.destination_key
    return {
        "aerodrome": req.aerodrome_icao,
        "origin": origin,
        "destination": destination,
        "distance_meters": round(distance),
        "estimated_minutes": round(distance / 7.7 / 60, 1),
        "route_steps": [
            f"Depart {origin}",
            "Follow Taxiway F to hold short 28R",
            "Cross Runway 28R with ATC clearance",
            "Join Taxiway Alpha eastbound",
            f"Enter {destination}",
        ],
        "hold_positions": ["HOLD RWY 28R @ F"],
        "waypoints": mock_waypoints,
    }


@app.post("/api/v1/spatial/obstacles")
def evaluate_obstacles(req: ObstacleRequest):
    """Return sample obstacle results; map features are loaded from the database."""
    icao = req.aerodrome_icao
    return {
        "aerodrome": icao,
        "obstacles_evaluated": 3,
        "evaluations": [
            {
                "id": f"{icao}-ATCT",
                "name": "Air Traffic Control Tower",
                "height_agl": 67.4,
                "elevation_amsl": 71.4,
                "surface": "Inner Horizontal (45m)",
                "max_allowed_amsl": 49.0,
                "is_penetrating": True,
                "penetration_meters": 22.4,
            },
            {
                "id": f"{icao}-HANGAR",
                "name": "Maintenance Hangar",
                "height_agl": 35.0,
                "elevation_amsl": 39.0,
                "surface": "Transitional (1:7)",
                "max_allowed_amsl": 45.0,
                "is_penetrating": False,
                "penetration_meters": 0.0,
            },
        ],
    }


@app.get("/api/v1/database/engine")
def get_database_engine():
    engine = get_engine()
    return {
        "active_engine": get_active_engine_name(),
        "database_location": engine.url.database,
        "supported_engines": ["sqlite", "postgres"],
        "tables": ["do272_aerodromes", "do272_features", "do272_source_snapshots",
                   "do272_snapshot_features", "do272_active_curated_snapshots"],
    }


@app.post("/api/v1/database/engine")
def set_database_engine(req: EngineToggleRequest):
    try:
        active_engine = activate_engine(req.engine)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except SQLAlchemyError as error:
        raise HTTPException(
            status_code=503,
            detail=f"Could not connect to the {req.engine} database: {error}",
        ) from error

    return {
        "status": "switched",
        "active_engine": active_engine,
        "schema_status": "ready",
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
