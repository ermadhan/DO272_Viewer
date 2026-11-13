# RTCA DO-272 / EUROCAE ED-99 Aerodrome Spatial GIS & Model Context Protocol (MCP) Platform

A standards-compliant aeronautical GIS visualization, spatial engineering, and Model Context Protocol (MCP) intelligence platform conforming to **RTCA DO-272 / EUROCAE ED-99** (Aeronautical Information Conceptual Model - AMDB) and **FAA AC 150/5300-18B / ICAO Annex 14** specifications.

---

## Table of Contents
1. [Overview & Key Capabilities](#overview--key-capabilities)
2. [Supported Aerodromes](#supported-aerodromes)
3. [Architecture & Technology Stack](#architecture--technology-stack)
4. [DO-272 Features & Spatial Analysis Modules](#do-272-features--spatial-analysis-modules)
5. [Model Context Protocol (MCP) Architecture](#model-context-protocol-mcp-architecture)
6. [Windows Laptop Step-by-Step Setup Guide](#windows-laptop-step-by-step-setup-guide)
7. [Running the Automated Test Suites](#running-the-automated-test-suites)
8. [Connecting External AI Clients (Claude Desktop / Cursor)](#connecting-external-ai-clients-claude-desktop--cursor)

---

## Overview & Key Capabilities

* **Database-backed Interactive Aeronautical Map**: Loads airport metadata and DO-272 features from the Python API; SQLite is the default database.
* **Autonomous In-App MCP AI Agent Client**: Conversational AI assistant with strategy/thought traces, JSON-RPC 2.0 tool execution inspection, and one-click "Sync & View on Map" actions.
* **Python stdio MCP Server**: Standard Model Context Protocol server (`python_backend/mcp_server.py`) exposing DO-272 spatial analysis capabilities to Claude Desktop, Cursor, or external LLM workflows.
* **Automated DO-272 Data Quality Requirement (DQR) Audits**: Geometry closure checks, duplicate vertex filtering, 5-part ICAO PCN syntax validation, hold-line setback verification, and stand connectivity scoring.
* **Dijkstra Ground Taxiway Routing**: Graph pathfinding over connected `TaxiwayGuidanceLine` networks with turn-by-turn ATC taxi clearances and hot spot crossing alerts.
* **3D FAA Part 77 Obstacle Clearance Evaluation**: Evaluates vertical structures against 1:50 approach and 1:7 transitional clearance surfaces with exact margin or penetration metrics.
* **Persistent Airport Data**: Airport metadata and complete feature records are stored in `do272_aerodromes` and `do272_features`. PostgreSQL is optional.
* **Worldwide Open Data Ingestion**: Live Overpass API ingestion querying and classifying real-world aerodromes from OpenStreetMap worldwide (e.g. KJFK, KLAX, EHAM, LFPG, RJTT, WSSS) or custom FAA 18B GeoJSON.

---

## Supported Aerodromes

| Aerodrome | ICAO / IATA | Geometry & Standard | Features Highlights |
| :--- | :---: | :---: | :--- |
| **San Francisco International** | `KSFO` / `SFO` | FAA NASR / DO-272 Curated | Intersecting 28L/10R & 01L/19R pairs, CAT III hold lines on TWY A/B, Concourses A/G stands, Safedock T1-24 lead-in lines, Control Tower (67.4m). |
| **London Heathrow** | `EGLL` / `LHR` | Eurocontrol AMDB / ED-99 | Dual parallel 09L/27R & 09R/27L, PCN 120/R/B/W/T, Terminal 5 / Stand 501 lead-in system, Central Tower (87m). |
| **Frankfurt Main** | `EDDF` / `FRA` | Eurocontrol AMDB / ED-99 | Dual parallel + Runway 18 West, dual-spine TWY November & Papa with mid/east connectors, Terminal 1 & 2 stands. |
| **Dubai International** | `OMDB` / `DXB` | Curated DO-272 Hub | Dual parallel Code F A380 runways (12L/30R), Concourse A gates, Apron N to TWY Mike guidance spine, ASDE radar. |
| **Worldwide Live Hubs** | *Any ICAO* | OpenStreetMap Overpass Ingest | Live Overpass API extraction around 4.5km bounding radius for any airport worldwide (KJFK, KLAX, EHAM, LFPG, etc.). |

---

## Architecture & Technology Stack

```
+---------------------------------------------------------------------------------+
|                       Vite React 19 Frontend (SPA)                              |
|  - Fetches airport datasets from FastAPI before rendering the map               |
|  - Saves imported OpenStreetMap / FAA datasets through the API                  |
|  - AI Agent Client, MCP Studio, Spatial Analysis HUD, Feature Explorer          |
+---------------------------------------------------------------------------------+
                                       | HTTP/JSON
                                       v
+---------------------------------------------------------------------------------+
|                    FastAPI Backend (python_backend/main.py)                     |
|           Lists, loads, and upserts airport datasets in the selected DB         |
+---------------------------------------------------------------------------------+
                                       | SQLAlchemy
                                       v
+---------------------------------------------------------------------------------+
|    Database Storage: SQLite (default) / PostgreSQL (optional)                   |
|    do272_aerodromes + do272_features (JSON coordinates and feature payloads)     |
+---------------------------------------------------------------------------------+
```

The standalone stdio MCP server is a separate process from this web data path.

---

## DO-272 Features & Spatial Analysis Modules

### 1. RTCA DO-272 43-Feature Data Dictionary
The platform supports all 43 spatial aerodrome features across 6 functional subsystems:
* **Runway Features**: `RunwayElement`, `RunwayThreshold`, `RunwayDisplacedThreshold`, `RunwayBlastPad`, `Stopway`, `Clearway`, `RunwayIntersection`.
* **Taxiway Features**: `TaxiwayElement`, `TaxiwayGuidanceLine`, `RunwayHoldingPosition`, `IntermediateHoldingPosition`, `TaxiwayIntersection`, `DeicingPadArea`.
* **Apron & Parking Features**: `ApronElement`, `ParkingStandArea`, `StandGuidanceLine`, `PassengerBoardingBridge`, `ServiceRoad`, `Helipad`.
* **Safety & Protection Zones**: `RunwaySafetyArea`, `ObjectFreeArea`, `ObstacleFreeZone`, `RunwayProtectionZone`, `HotSpot`.
* **Vertical Structures & Obstacles**: `VerticalStructure` (Towers, Hangars, Cranes, Blast Deflectors) with frangibility and elevation attributes.
* **NAVAIDs & Sensor Equipment**: `LocalizerAntenna`, `GlideSlopeAntenna`, `PAPI`, `VORStation`, `AirportBeacon`, `RadarSurveillanceSensor`.

### 2. Autonomous DO-272 Compliance Validation
Validates datasets against 7 safety-critical compliance rules:
* **DO272-GEOM-001**: Polygon boundary planar closure (first coordinate equals last coordinate).
* **DO272-GEOM-002**: Topological cleanliness (no redundant zero-length consecutive duplicate edges).
* **DO272-ATTR-001**: 5-part ICAO Annex 14 / FAA AC 150/5335-5 PCN rating syntax verification (`[0-9]+/([RF])/([ABCD])/([WXYZ])/([TU])`).
* **DO272-ATTR-002**: Feature designator uniqueness within spatial class.
* **DO272-NET-001**: Runway holding position physical setback from active runway polygons (must be between 40m and 120m; flags runway strip encroachment).
* **DO272-NET-002**: Parking stand lead-in connectivity (stand must be within 100m of a guidance line; flags missing `StandGuidanceLine`).
* **DO272-SAFE-001**: Obstacle frangibility within 120m of active runway centerlines.

---

## Model Context Protocol (MCP) Architecture

The platform provides a dual-surface MCP environment:

1. **In-App AI Agent Client (`src/components/MCPAgentChat.tsx`)**:
   * A full conversational chat client directly in the browser.
   * Dispatches queries to DO-272 tools with real-time JSON-RPC 2.0 telemetry.
   * Features collapsible **Strategy & Reasoning Traces**, payload inspectors, and **"Sync & View on Map"** buttons.

2. **Standalone Python MCP Server (`python_backend/mcp_server.py`)**:
   * Standard stdio transport compliant with the Model Context Protocol specification.
   * Can be added directly to Claude Desktop, Cursor, or any MCP-compatible client.

---

## Command-Line Open Data Batch Ingestion (Top 50 Airports & Custom Lists)

You can batch-ingest aerodrome datasets from the command line using either **Node.js (`npm run ingest`)** or **Python (`ingest_open_data.py`)**.

### Included Reference Datasets
* `data/top50_airports.csv`: Contains the **Top 50 Busiest Airports Worldwide** (from Wikipedia passenger traffic rankings) including Airport Name, City, Country, IATA, ICAO, and surveyed ARP coordinates.
* `data/top50_airports.txt`: Plain text file containing the 50 ICAO codes (one per line).

### Command-Line Usage (Node.js / npm)

```cmd
# Ingest all Top 50 airports from the CSV file:
npm run ingest -- --csv data/top50_airports.csv

# Ingest top 10 airports and generate SQL insert scripts:
npm run ingest -- --csv data/top50_airports.csv --limit 10 --sql

# Ingest from plain text file containing ICAO codes:
npm run ingest -- --file data/top50_airports.txt

# Ingest specific ICAO codes on demand:
npm run ingest -- --icao KATL,KDFW,KORD,RJTT,VIDP,LTFM

# Custom output directory:
npm run ingest -- --csv data/top50_airports.csv --output my_datasets/
```

### Command-Line Usage (Python)

On Windows or Linux systems with Python 3.10+:
```cmd
# Ingest top 50 airports from CSV:
python python_backend/ingest_open_data.py --csv data/top50_airports.csv

# Ingest from text file:
python python_backend/ingest_open_data.py --file data/top50_airports.txt --limit 5

# Ingest specific airports:
python python_backend/ingest_open_data.py --icao KATL,KDFW,OMDB
```

### CLI Flags & Arguments Reference

| Flag | Argument | Description | Default |
| :--- | :--- | :--- | :--- |
| `--csv` | `<path>` | Path to CSV file containing `icao` column | `data/top50_airports.csv` |
| `--file` | `<path>` | Path to plain text file with one ICAO code per line | None |
| `--icao` | `<codes>` | Comma-separated ICAO codes (e.g. `KATL,KORD`) | None |
| `--limit` | `<num>` | Maximum number of airports to process from list | Process all |
| `--output` | `<dir>` | Target output directory for datasets | `data/ingested_airports` |
| `--delay` | `<ms>` | Delay between queries in milliseconds | `500` ms |
| `--sql` | *flag* | Export database insert scripts for the current schema (`*.sql`) | Disabled |
| `--no-validate` | *flag* | Skip post-ingestion DO-272 compliance audit | Validate enabled |

### Output Artifacts
Each run populates the output folder with:
* `<ICAO>.json`: Full RTCA DO-272 compliant JSON dataset with all classified features.
* `<ICAO>.sql` (when `--sql` is passed): SQL insert script for the aerodrome and feature tables.
* `manifest.json`: Catalog index summarizing feature counts, runways, taxiways, stands, and audit compliance scores.

---

## Windows Laptop Step-by-Step Setup Guide

Follow these steps to run the complete stack on a Windows 10/11 laptop.

### Prerequisites
1. **Node.js 18+ (LTS)**: Download and install from [nodejs.org](https://nodejs.org/).
2. **Python 3.10+**: Download from [python.org](https://www.python.org/).  
   *(Make sure to check the box: **"Add python.exe to PATH"** during installation!)*
3. **Git for Windows**: Download from [git-scm.com](https://git-scm.com/).
4. *(Optional)* **Docker Desktop for Windows** or native PostgreSQL, if you want to use PostgreSQL instead of the default SQLite database.

---

### Step 1: Clone the Repository
Open PowerShell or Command Prompt:
```cmd
git clone <repository-url>
cd do272-aerodrome-gis
```

---

### Step 2: Set Up and Run the Python Backend
The frontend reads airport data from this API. Starting the backend creates the SQLite schema and inserts any missing curated datasets from `python_backend/seed_data/airports.json`.

```cmd
cd python_backend
start_backend.bat
```

By default the backend uses `python_backend/do272_aerodromes.db`. Set `SQLITE_URL` to override its location. PostgreSQL can be selected in the UI when its configured server is available.

### Step 3: Set Up and Run the Frontend
Install Node.js dependencies and start the Vite development server:
```cmd
npm install
npm run dev
```
The application will be accessible at:  
👉 **`http://localhost:3000`**

---

### Step 4: Run the Standalone MCP Server (Optional)
Open a second Command Prompt or PowerShell window in the project folder:
```cmd
cd python_backend
```

The batch file from the previous step creates the virtual environment and installs the backend dependencies. Start the stdio MCP server with:
```cmd
call venv\Scripts\activate
python mcp_server.py
```

### Step 5: (Optional) Run Local PostgreSQL via Docker
To run a local PostgreSQL database on port 5432:
```cmd
cd python_backend
docker compose up -d
```
Default connection string:
```
postgresql://postgres:postgrespassword@localhost:5432/do272_aerodromes
```

---

## Running the Automated Test Suites

The project includes backend database/API and MCP client tests, plus a TypeScript in-app MCP test suite.

### 1. Database API Persistence Tests
Run from the repository root after installing the backend requirements:
```cmd
python -m unittest python_backend.test_database_api
```
These tests verify that seeded airports are served from the database and that imported features persist across reads.

### 2. Python stdio MCP Client Test Suite
Tests tool discovery (`tools/list`), execution of all 5 tools (`tools/call`), and JSON-RPC 2.0 error handling (`-32601`):
```cmd
python python_backend/test_mcp_client.py
```
*Expected Output*:
```
======================================================================
  DO-272 MODEL CONTEXT PROTOCOL (MCP) CLIENT TEST HARNESS
  Testing stdio JSON-RPC 2.0 interface on mcp_server.py
======================================================================
✅ [PASS] 1. tools/list - Tool Discovery & Registration (86.5ms)
✅ [PASS] 2. do272_validate_compliance - Quality & DQR Audit (0.5ms)
✅ [PASS] 3. do272_find_taxi_route - Dijkstra Graph Routing (0.3ms)
✅ [PASS] 4. do272_obstacle_clearance_check - 3D Part 77 Clearance (0.3ms)
✅ [PASS] 5. do272_query_features - Spatial Query (0.3ms)
✅ [PASS] 6. do272_spatial_sql - PostGIS SQL Execution (0.3ms)
✅ [PASS] 7. Unknown Tool Handling - Error Code -32601 (0.2ms)
----------------------------------------------------------------------
Test Suite Summary: 7/7 Passed (100.0%)
======================================================================
ALL DO-272 MCP CLIENT TESTS PASSED SUCCESSFULLY! 🚀
```

### 3. TypeScript In-App MCP Client & Agent E2E Suite
Validates the in-app autonomous agent reasoning loop, tool parameter generation, and map sync formatting across all 4 hub aerodromes:
```cmd
npx tsx tests/mcp-client-e2e.ts
```
*Expected Output*:
```
======================================================================
  DO-272 IN-APP MCP CLIENT AGENT E2E TEST SUITE
======================================================================
✅ [PASS] Tool Registration Count
✅ [PASS] All 5 Standard DO-272 MCP Tools Registered
✅ [PASS] Low-level Audit on KSFO (100% COMPLIANT)
✅ [PASS] Low-level Part 77 Obstacle Check on KSFO
✅ [PASS] Low-level Taxiway Graph Routing on KSFO
✅ [PASS] Low-level Audit on EGLL (100% COMPLIANT)
✅ [PASS] Low-level Part 77 Obstacle Check on EGLL
✅ [PASS] Low-level Taxiway Graph Routing on EGLL
✅ [PASS] Low-level Audit on EDDF (100% COMPLIANT)
✅ [PASS] Low-level Part 77 Obstacle Check on EDDF
✅ [PASS] Low-level Taxiway Graph Routing on EDDF
✅ [PASS] Low-level Audit on OMDB (100% COMPLIANT)
✅ [PASS] Low-level Part 77 Obstacle Check on OMDB
✅ [PASS] Low-level Taxiway Graph Routing on OMDB
✅ [PASS] Agent Intent Dispatch: Audit Prompt selects do272_validate_compliance
✅ [PASS] Agent Thought Process Generated for Audit
✅ [PASS] Agent Intent Dispatch: Taxi Prompt selects do272_find_taxi_route
✅ [PASS] Agent Map Sync Payload correctly attached for Taxi Path
✅ [PASS] Agent Intent Dispatch: Obstacle Prompt selects do272_obstacle_clearance_check
✅ [PASS] Agent Intent Dispatch: SQL Prompt selects do272_spatial_sql
✅ [PASS] MCP Error Handling: Returns JSON-RPC 2.0 error code -32601 for unknown tool
----------------------------------------------------------------------
TypeScript Test Suite Summary: 21/21 Passed (100.0%)
======================================================================
ALL IN-APP MCP CLIENT TESTS PASSED! 🚀
```

---

## Connecting External AI Clients (Claude Desktop / Cursor)

You can connect the Python MCP server to desktop LLM tools like Claude Desktop on Windows.

1. Open your Claude Desktop configuration file:
   ```cmd
   notepad %APPDATA%\Claude\claude_desktop_config.json
   ```
2. Paste the following configuration (replace `C:\\Users\\User\\...` with your actual project directory path):
   ```json
   {
     "mcpServers": {
       "do272-aerodrome-gis": {
         "command": "python",
         "args": [
           "C:\\path\\to\\do272-aerodrome-gis\\python_backend\\mcp_server.py"
         ],
         "env": {
           "POSTGRES_URL": "postgresql://postgres:postgrespassword@localhost:5432/do272_aerodromes"
         }
       }
     }
   }
   ```
3. Restart Claude Desktop. The hammer icon will appear with access to:
   * `do272_validate_compliance`
   * `do272_find_taxi_route`
   * `do272_obstacle_clearance_check`
   * `do272_query_features`
   * `do272_spatial_sql`

---

## License & Standards Citation
* **RTCA DO-272 / EUROCAE ED-99**: User Requirements for Aerodrome Mapping Information.
* **FAA Advisory Circular AC 150/5300-18B**: General Guidance and Specifications for Aeronautical Surveys.
* **ICAO Annex 14**: Aerodromes — Aerodrome Design and Operations.
