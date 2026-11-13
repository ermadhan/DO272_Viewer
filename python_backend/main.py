"""DO-272 aerodrome API backed by SQLite or PostgreSQL."""

import math
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
    SourceSnapshotModel,
    activate_engine,
    add_source_snapshot,
    create_session,
    get_active_engine_name,
    initialize_database,
    latest_snapshot,
    serialize_dataset,
    snapshot_payload,
    upsert_dataset,
)


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


class OsmFeaturePayload(BaseModel):
    id: str
    osmType: Literal["node", "way", "relation"]
    osmId: int = Field(gt=0)
    version: int | None
    timestamp: str | None
    aeroway: str
    designator: str
    geometryType: Literal["Point", "LineString", "Polygon"]
    coordinates: tuple[float, float] | list[tuple[float, float]]
    tags: dict[str, str]

    @model_validator(mode="after")
    def validate_geometry(self):
        if self.id != f"OSM-{self.osmType}-{self.osmId}":
            raise ValueError("OSM feature ID does not match object type and ID")
        if (self.osmType == "node") != (self.geometryType == "Point"):
            raise ValueError("OSM node and geometry types do not match")
        if self.geometryType == "Point":
            if not isinstance(self.coordinates, tuple):
                raise ValueError("Point geometry must have one coordinate")
            points = [self.coordinates]
        else:
            if not isinstance(self.coordinates, list):
                raise ValueError("Line and polygon geometries must have coordinate lists")
            points = self.coordinates
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
            curated = latest_snapshot(db, row["icao"], "curated")
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
    return sorted(result, key=lambda row: row["icao"])


@app.get("/api/v1/aerodromes/{icao}")
def get_aerodrome(icao: str, db: Session = Depends(get_db)):
    icao = icao.strip().upper()
    aerodrome = (
        db.query(AerodromeModel)
        .options(selectinload(AerodromeModel.feature_rows))
        .filter(AerodromeModel.icao == icao)
        .one_or_none()
    )
    if aerodrome is not None and aerodrome.source != "OpenStreetMap Aeroway Ingest":
        return serialize_dataset(aerodrome)
    curated = latest_snapshot(db, icao, "curated")
    if curated:
        return curated.payload["dataset"]
    osm = latest_snapshot(db, icao, "osm")
    if osm:
        return {**snapshot_payload(osm)["dataset"], "features": []}
    raise HTTPException(status_code=404, detail=f"Aerodrome {icao} was not found")


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
    return {
        "active_engine": get_active_engine_name(),
        "supported_engines": ["sqlite", "postgres"],
        "tables": ["do272_aerodromes", "do272_features", "do272_source_snapshots"],
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
