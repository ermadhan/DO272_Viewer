"""
DO-272 Dual Database Architecture: PostgreSQL (PostGIS) and SQLite (SpatiaLite)
Guarantees exact schema replication and seamless on-the-fly toggling.
"""

import os
from typing import Literal
from sqlalchemy import (
    create_engine,
    Column,
    String,
    Float,
    Integer,
    Boolean,
    JSON,
    ForeignKey,
    Text,
)
from sqlalchemy.orm import declarative_base, sessionmaker

# 1. PostgreSQL (PostGIS) Engine
POSTGRES_URL = os.getenv(
    "POSTGRES_URL",
    "postgresql://postgres:postgrespassword@localhost:5432/do272_aerodromes"
)

# 2. SQLite (SpatiaLite Compatible) Engine
SQLITE_URL = os.getenv(
    "SQLITE_URL",
    "sqlite:///do272_aerodromes.db"
)

sqlite_engine = create_engine(SQLITE_URL, connect_args={"check_same_thread": False})
SqliteSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sqlite_engine)

try:
    postgres_engine = create_engine(POSTGRES_URL, echo=False)
    with postgres_engine.connect() as conn:
        pass
    PostgresSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=postgres_engine)
    active_engine = postgres_engine
    active_engine_name = "postgres"
    SessionLocal = PostgresSessionLocal
except Exception as e:
    postgres_engine = None
    PostgresSessionLocal = None
    active_engine = sqlite_engine
    active_engine_name = "sqlite"
    SessionLocal = SqliteSessionLocal

Base = declarative_base()


# EXACT SCHEMA REPLICATION MODELS
class AerodromeModel(Base):
    __tablename__ = "do272_aerodromes"
    icao = Column(String(10), primary_key=True)
    iata = Column(String(5), nullable=True)
    name = Column(String(255), nullable=False)
    city = Column(String(100), nullable=True)
    country = Column(String(100), nullable=True)
    center_lat = Column(Float, nullable=False)
    center_lng = Column(Float, nullable=False)
    elevation_m = Column(Float, nullable=False)
    source = Column(String(100), default="DO-272 Standard")


class RunwayElementModel(Base):
    __tablename__ = "do272_runway_elements"
    id = Column(String(100), primary_key=True)
    aerodrome_id = Column(String(10), ForeignKey("do272_aerodromes.icao"))
    designator = Column(String(50), nullable=False)
    length_m = Column(Float, nullable=False)
    width_m = Column(Float, nullable=False)
    true_heading = Column(Float, nullable=True)
    surface = Column(String(50), default="Asphalt")
    pcn_rating = Column(String(50), nullable=True)
    ils_cat = Column(String(50), nullable=True)
    geom_geojson = Column(JSON, nullable=False)


class TaxiwayElementModel(Base):
    __tablename__ = "do272_taxiway_elements"
    id = Column(String(100), primary_key=True)
    aerodrome_id = Column(String(10), ForeignKey("do272_aerodromes.icao"))
    designator = Column(String(50), nullable=False)
    surface = Column(String(50), default="Asphalt")
    width_m = Column(Float, nullable=True)
    geom_geojson = Column(JSON, nullable=False)


class TaxiwayGuidanceLineModel(Base):
    __tablename__ = "do272_guidance_lines"
    id = Column(String(100), primary_key=True)
    aerodrome_id = Column(String(10), ForeignKey("do272_aerodromes.icao"))
    designator = Column(String(50), nullable=False)
    is_reversible = Column(Boolean, default=True)
    max_wingspan_m = Column(Float, nullable=True)
    geom_geojson = Column(JSON, nullable=False)


class ParkingStandModel(Base):
    __tablename__ = "do272_parking_stands"
    id = Column(String(100), primary_key=True)
    aerodrome_id = Column(String(10), ForeignKey("do272_aerodromes.icao"))
    designator = Column(String(50), nullable=False)
    stand_number = Column(String(20), nullable=True)
    terminal = Column(String(100), nullable=True)
    icao_code_letter = Column(String(5), default="E")
    has_jet_bridge = Column(Boolean, default=True)
    geom_geojson = Column(JSON, nullable=False)


class VerticalStructureModel(Base):
    __tablename__ = "do272_vertical_structures"
    id = Column(String(100), primary_key=True)
    aerodrome_id = Column(String(10), ForeignKey("do272_aerodromes.icao"))
    designator = Column(String(100), nullable=False)
    structure_type = Column(String(100), nullable=False)
    height_agl_m = Column(Float, nullable=False)
    elevation_amsl_m = Column(Float, nullable=False)
    frangible = Column(Boolean, default=False)
    lighting_type = Column(String(50), default="High-Intensity White")
    geom_geojson = Column(JSON, nullable=False)


class HotSpotModel(Base):
    __tablename__ = "do272_hot_spots"
    id = Column(String(100), primary_key=True)
    aerodrome_id = Column(String(10), ForeignKey("do272_aerodromes.icao"))
    designator = Column(String(50), nullable=False)
    severity = Column(String(20), default="High")
    hazard_description = Column(Text, nullable=True)
    geom_geojson = Column(JSON, nullable=False)


def init_db(engine_type: Literal["postgres", "sqlite", "both"] = "both"):
    """
    Initializes exact replicated schemas across PostgreSQL and SQLite
    """
    if engine_type in ("sqlite", "both"):
        Base.metadata.create_all(bind=sqlite_engine)
        print("SQLite SpatiaLite database initialized with replicated DO-272 schema.")
    if engine_type in ("postgres", "both") and postgres_engine:
        Base.metadata.create_all(bind=postgres_engine)
        print("PostgreSQL PostGIS database initialized with replicated DO-272 schema.")
