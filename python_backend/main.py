"""DO-272 aerodrome API backed by SQLite or PostgreSQL."""

import math
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload
import uvicorn

from database import (
    AerodromeFeatureModel,
    AerodromeModel,
    activate_engine,
    create_session,
    get_active_engine_name,
    initialize_database,
    serialize_dataset,
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
    elevationMeters: float
    magneticVariation: str = ""
    transitionAltitudeFt: int = 18000
    source: str
    features: list[dict[str, Any]]


class EngineToggleRequest(BaseModel):
    engine: str


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
    return [
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


@app.get("/api/v1/aerodromes/{icao}")
def get_aerodrome(icao: str, db: Session = Depends(get_db)):
    aerodrome = (
        db.query(AerodromeModel)
        .options(selectinload(AerodromeModel.feature_rows))
        .filter(AerodromeModel.icao == icao.strip().upper())
        .one_or_none()
    )
    if aerodrome is None:
        raise HTTPException(status_code=404, detail=f"Aerodrome {icao.upper()} was not found")
    return serialize_dataset(aerodrome)


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
        "tables": ["do272_aerodromes", "do272_features"],
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
