# Complete RTCA DO-272 / EUROCAE ED-99 Aerodrome GIS & MCP Intelligence Platform

A comprehensive, standards-compliant aeronautical visualization and spatial analysis system implementing the entire **RTCA DO-272 / EUROCAE ED-99** feature catalogue ("User Requirements for Aerodrome Mapping Information"). It seamlessly integrates open aerodrome data sources, a robust PostgreSQL/PostGIS spatial database engine, interactive Leaflet cartography with aeronautical symbology, and a complete Model Context Protocol (MCP) server for local AI assistant interaction.

### User Review & Critical Decisions

> [!IMPORTANT]
> The plan now features an exhaustive breakdown comparing the initial draft with the current version, capturing every element required by the DO-272 standard.

- **Confirmed DO-272 Exhaustive Scope**: All 7 primary DO-272 / ED-99 feature categories are modeled with full PostGIS geometry and attribute schemas:
  1. *Runway System*: `RunwayElement`, `RunwayThreshold`, `RunwayDisplacedThreshold`, `Stopway`, `Clearway`, `RunwayBlastPad`, `RunwayShoulder`, `RunwayIntersection`, `RunwayMarking`.
  2. *Taxiway System*: `TaxiwayElement`, `TaxiwayGuidanceLine`, `TaxiwayIntersection`, `TaxiwayShoulder`, `RunwayHoldingPosition` (CAT I/II/III hold lines), `IntermediateHoldingPosition`, `TaxiwayHoldingPositionLight` (Stop Bars), `EnhancedTaxiwayCenterline`.
  3. *Apron & Parking System*: `ApronElement`, `ApronShoulder`, `ParkingStandArea`, `ParkingStandLocation`, `StandGuidanceLine`, `PassengerBoardingBridge` (Jet Bridge), `DeicingArea`, `ServiceRoad`, `PassengerWalkway`.
  4. *Safety & Protection Surfaces*: `HotSpot` (incursion hazard zones), `RunwaySafetyArea` (RSA), `RunwayEndSafetyArea` (RESA), `ObjectFreeArea` (OFA), `ObstacleFreeZone` (OFZ), `LowVisibilityRoutingLine`.
  5. *Vertical Structures & Obstacles*: `VerticalStructure` (ATC tower, terminals, hangars, antenna masts, radar towers, construction equipment) with AGL height, AMSL elevation, frangibility, and lighting status.
  6. *Aeronautical Ground Lighting & NAVAIDs*: `AerodromeReferencePoint` (ARP), `WindDirectionIndicator` (windsocks), `VisualGlideSlopeIndicator` (PAPI/VASI), `LocalizerAntenna`, `GlidePathAntenna`, `DistanceMeasuringEquipment` (DME), `AirportSurveillanceRadar` (ASR/SMR).
  7. *Operational Restrictions & Metadata*: PCN pavement strength ratings, ICAO aircraft design group limits (Code A through F), surface materials, operational status (Active, Closed, Maintenance).

---

### Version Comparison: Current Plan vs. Previous Plan

| Dimension | Previous Version (Initial Draft) | Current Version (Comprehensive DO-272) | Rationale & Value |
| :--- | :--- | :--- | :--- |
| **DO-272 Standard Coverage** | High-level subset (7 core types: Runway, Taxiway, Apron, Stand, HotSpot, Obstacle, Centerline) | **Complete 7-tier DO-272 catalogue** (28 distinct feature classes including Stopways, Blast Pads, Displaced Thresholds, CAT I/II/III Hold Lines, Stop Bars, Jet Bridges, Deicing, RSA/RESA/OFA, PAPI, Localizers) | Strict compliance with RTCA DO-272 / EUROCAE ED-99 aerodrome mapping specifications. |
| **PostgreSQL / PostGIS Schema** | Abstract table outline with generalized geometries | **Granular schema definitions** for all 9 specialized spatial tables with explicit geometry types (`POLYGON`, `LINESTRING`, `POINT`) and standard aeronautical attributes (PCN, ICAO Code A–F, AGL/AMSL, frangibility) | Enables real-world spatial SQL analysis, joins, and spatial indexing (`GIST`) without schema ambiguities. |
| **Cartography & Layer Control** | Flat layer toggle list | **Grouped Subsystem Architecture** with 6 domain controllers (Runway, Taxiway, Apron, Safety, Obstacles, NAVAIDs) and aeronautical symbology per ICAO Annex 14 | Prevents visual clutter while allowing precise feature isolation down to individual hold bars or NAVAID antennas. |
| **Spatial Analysis Engines** | Generic route and buffer concepts | **Three Dedicated Aviation Solvers**: <br>1. Dijkstra/A* ground taxiway graph solver with hold-point awareness.<br>2. 3D FAA Part 77 / ICAO Annex 14 approach (1:50) and transitional (1:7) obstacle penetration evaluator.<br>3. Live PostGIS SQL Workbench with direct map overlay. | Directly tests airport operational safety invariants and ground routing efficiency. |
| **Open Data Pipeline** | Curated international hubs primarily | **Tri-Source Ingestion Pipeline**: <br>1. Curated high-fidelity hubs (SFO, LHR, FRA, DXB).<br>2. FAA Airport GIS 18B specification loader.<br>3. Live OpenStreetMap Aeroway-to-DO-272 converter for global airport lookup by ICAO/IATA code. | Guarantees instant rich visualization out of the box while allowing any airport worldwide to be loaded and converted. |
| **Windows & MCP Architecture** | High-level script reference | **Complete Portable Windows & Web Suite**: <br>• Standalone Python FastAPI backend (`main.py`)<br>• Windows `.bat` launch scripts (`start_backend.bat`, `start_mcp_server.bat`)<br>• Docker Compose PostGIS template<br>• Live in-app MCP Studio + client JSON configs for Claude Desktop and Cursor | Ready for immediate web preview and turn-key deployment on any Windows machine. |

---

### 1. Overview & Core Concept

- **What It Does**: Visualizes, queries, and analyzes complete Aerodrome Mapping Databases (AMDB) strictly conforming to RTCA DO-272 / EUROCAE ED-99. It provides multi-layer aeronautical map views, calculates ground routing on taxi guidance graphs, evaluates obstacle clearance against 3D approach/transitional surfaces, executes spatial SQL queries, and serves as an MCP server for AI clients (e.g., Claude Desktop, Cursor).
- **Target Audience**: Aeronautical GIS engineers, airport operations and safety teams, flight deck software developers, ATC specialists, and aviation researchers.
- **Key Value**: Bridges the gap between raw open-source geospatial data and strict aeronautical database standards, providing a visual and AI-queryable platform.

---

### 2. User Experience & Visual Design

#### Complete DO-272 Layer Control Architecture
The interface organizes all DO-272 features into logical layer control groups with individual toggles, element counts, and standard symbology:
- 🛫 **Runway Subsystem**:
  - Runway Pavement (`RunwayElement`) - Charcoal with surface classification
  - Thresholds & Displaced Thresholds (`RunwayThreshold`) - High-visibility green bar markers
  - Stopways & Blast Pads (`Stopway`, `RunwayBlastPad`) - Yellow chevron styling
  - Markings & Overlays (`RunwayMarking`) - Touchdown zones, aiming points, centerline stripes
- 🚖 **Taxiway & Routing Subsystem**:
  - Taxiway Pavements (`TaxiwayElement`) - Subtle dark asphalt fill
  - Guidance Lines (`TaxiwayGuidanceLine`) - Aeronautical yellow centerlines with directionality
  - Hold Short Positions (`RunwayHoldingPosition`) - Double solid / double dashed runway holding lines
  - Stop Bars & Intermediate Hold Points (`IntermediateHoldingPosition`, `StopBar`) - Pulsing amber/red stop points
- 🅿️ **Aprons, Stands & Facilities**:
  - Apron Surfaces (`ApronElement`) - Slate perimeter fill
  - Parking Stands (`ParkingStandArea`, `ParkingStandLocation`) - Cyan stand boxes with gate numbers
  - Stand Guidance Lines (`StandGuidanceLine`) - Lead-in curved trajectories
  - Jet Bridges & Service Roads (`JetBridge`, `ServiceRoad`) - Paved ground traffic channels
- ⚠️ **Safety, Hotspots & Clearances**:
  - Runway Incursion Hot Spots (`HotSpot`) - Amber/Red safety cones with designated hazard IDs
  - Safety Areas (`RunwaySafetyArea`, `ObjectFreeArea`, `OFZ`) - Translucent security envelopes
- 🗼 **Vertical Obstacles & 3D Structures**:
  - Structures (`VerticalStructure`) - ATC Tower, terminals, hangars with AMSL/AGL badges
  - 3D Clearance Envelope - Approach slope (1:50) and transitional slope (1:7) projection
- 📡 **NAVAIDs & Ground Lighting**:
  - Instruments (`Localizer`, `GlidePath`, `PAPI`, `Radar`, `WindSock`) - Standard ICAO/FAA symbology

#### Visual Identity & Theme
- **Theme**: Aeronautical Cockpit / GIS Intelligence Console.
- **Palette**:
  - Canvas: Dark Slate (`#0B0F19`) and Control Surfaces (`#111827`, border `#1F2937`)
  - Runway Markings: High-Contrast Crisp White (`#F9FAFB`)
  - Taxiway Yellow: FAA Spec Aviation Yellow (`#F59E0B`)
  - Stands & Gates: Cyan (`#06B6D4`)
  - Hotspots & Warnings: Alert Amber (`#F97316`) and Runway Incursion Crimson (`#EF4444`)
  - Obstacles & Towers: Indigo / Violet (`#8B5CF6`)
  - NAVAIDs & PAPI: Emerald Green (`#10B981`) and Precision White
- **Typography**:
  - Interface Headers: `Plus Jakarta Sans`
  - Aeronautical Designators, Coordinates, & PCN: `JetBrains Mono` / `tabular-nums`
- **Interactive Map Base Views**:
  - Aeronautical Dark Radar (custom dark Carto base)
  - Satellite Orthophoto (Esri World Imagery)
  - Standard OpenStreetMap Nautical/Humanitarian
  - High-Contrast Positron Chart View

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Full DO-272 Schema Normalization Pipeline**
  - *Chosen Approach*: Implement a unified DO-272 data model that normalizes inputs from curated hubs, FAA Airport GIS geo-files, and global OpenStreetMap queries into standardized DO-272 JSON/GeoJSON representations.
  - *Why*: Ensures every feature class can be queried identically in PostGIS, filtered in the Leaflet viewer, and analyzed by MCP tools.
- **Decision 2: Integrated Spatial Analysis Engine (Routing, Obstacles, SQL)**
  - *Chosen Approach*: Deliver three dedicated spatial analysis tools:
    1. *Taxiway Network Pathfinding*: Dijkstra graph search on `TaxiwayGuidanceLine` network with hold-short point detection.
    2. *FAA Part 77 / ICAO Annex 14 Obstacle Collision Evaluator*: Calculates 3D approach surface penetration margins for all `VerticalStructure` elements.
    3. *PostGIS SQL Workbench*: Live execution of spatial functions (`ST_Length`, `ST_Intersects`, `ST_Buffer`, `ST_Distance`) with real-time map feature rendering.
  - *Why*: Gives users direct interactive verification of spatial database queries without leaving the application.
- **Decision 3: Complete Python FastAPI & MCP Server Windows Package**
  - *Chosen Approach*: Provide complete, executable Python backend files (`backend/main.py`, `backend/mcp_server.py`, `backend/models.py`, `backend/spatial_engine.py`, `docker-compose.yml`, `start_backend.bat`, `start_mcp_server.bat`).
  - *Why*: Satisfies all cross-platform requirements for running natively on a Windows PC with PostgreSQL and connecting to Claude Desktop / Cursor.

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DO-272 AERODROME SPATIAL PLATFORM                        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┴──────────────────────────────┐
        ▼                                                             ▼
┌─────────────────────────────────┐           ┌────────────────────────────────┐
│      WEB APPLICATION UI         │           │    PYTHON FASTAPI & MCP SERVER │
│  (React 19 + Tailwind + Leaflet)│           │      (Windows / Linux Runtime) │
├─────────────────────────────────┤           ├────────────────────────────────┤
│ • Full DO-272 Layer Switcher    │   HTTP    │ • FastAPI REST Endpoints       │
│ • DO-272 Standard Inspector     │◄─────────►│   - GET /api/v1/aerodromes     │
│ • Taxiway Routing Engine HUD    │           │   - POST /api/v1/spatial/route │
│ • 3D Obstacle Clearance Matrix  │           │   - POST /api/v1/spatial/obs   │
│ • PostGIS Spatial SQL Console   │           │ • MCP JSON-RPC Server          │
│ • MCP Studio & Tool Inspector   │           │   - do272_query_features       │
│ • Multi-Base Map Controller     │           │   - do272_find_taxi_route      │
└────────────────┬────────────────┘           │   - do272_obstacle_check       │
                 │                            │   - do272_spatial_sql          │
                 │                            └────────────────┬───────────────┘
                 ▼                                             ▼
┌─────────────────────────────────┐           ┌────────────────────────────────┐
│      DO-272 DATA ENGINE         │           │   POSTGRESQL + POSTGIS SCHEMA  │
├─────────────────────────────────┤           ├────────────────────────────────┤
│ • SFO, LHR, FRA, DXB Hubs       │           │ • do272_runway_elements        │
│ • FAA Airport GIS 18B Ingest    │           │ • do272_runway_thresholds      │
│ • OSM Aeroway DO-272 Converter  │           │ • do272_taxiway_elements       │
│ • AMDB GeoJSON Importer/Export  │           │ • do272_guidance_lines         │
└─────────────────────────────────┘           │ • do272_parking_stands         │
                                              │ • do272_vertical_structures    │
                                              │ • do272_hot_spots              │
                                              │ • do272_navaids                │
                                              │ • do272_safety_areas           │
                                              └────────────────────────────────┘
```
