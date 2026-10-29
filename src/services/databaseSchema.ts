/**
 * DO-272 Exact Replicated Database Schemas
 * Full DDL and dialect translations for PostgreSQL (PostGIS) and SQLite (SpatiaLite)
 */

export type DatabaseEngine = 'postgres' | 'sqlite';

export interface TableColumn {
  name: string;
  typePostgres: string;
  typeSqlite: string;
  description: string;
}

export interface ReplicatedTable {
  tableName: string;
  featureClass: string;
  columns: TableColumn[];
  postgresDDL: string;
  sqliteDDL: string;
}

export const REPLICATED_DO272_TABLES: ReplicatedTable[] = [
  {
    tableName: 'do272_aerodromes',
    featureClass: 'AerodromeReferencePoint',
    columns: [
      { name: 'icao', typePostgres: 'VARCHAR(10) PRIMARY KEY', typeSqlite: 'TEXT PRIMARY KEY', description: 'ICAO 4-letter location identifier' },
      { name: 'iata', typePostgres: 'VARCHAR(5)', typeSqlite: 'TEXT', description: 'IATA 3-letter airport code' },
      { name: 'name', typePostgres: 'VARCHAR(255) NOT NULL', typeSqlite: 'TEXT NOT NULL', description: 'Official aerodrome name' },
      { name: 'city', typePostgres: 'VARCHAR(100)', typeSqlite: 'TEXT', description: 'Municipality served' },
      { name: 'country', typePostgres: 'VARCHAR(100)', typeSqlite: 'TEXT', description: 'State / Sovereign territory' },
      { name: 'center_geom', typePostgres: 'GEOMETRY(Point, 4326)', typeSqlite: 'GEOMETRY', description: 'ARP Reference Point (WGS-84)' },
      { name: 'elevation_m', typePostgres: 'DOUBLE PRECISION NOT NULL', typeSqlite: 'REAL NOT NULL', description: 'Aerodrome official elevation AMSL' },
      { name: 'magnetic_variation', typePostgres: 'VARCHAR(20)', typeSqlite: 'TEXT', description: 'Magnetic variation angle and epoch' },
      { name: 'transition_alt_ft', typePostgres: 'INTEGER DEFAULT 18000', typeSqlite: 'INTEGER DEFAULT 18000', description: 'Transition altitude in feet' },
    ],
    postgresDDL: `CREATE TABLE IF NOT EXISTS do272_aerodromes (
  icao VARCHAR(10) PRIMARY KEY,
  iata VARCHAR(5),
  name VARCHAR(255) NOT NULL,
  city VARCHAR(100),
  country VARCHAR(100),
  center_geom GEOMETRY(Point, 4326) NOT NULL,
  elevation_m DOUBLE PRECISION NOT NULL,
  magnetic_variation VARCHAR(20),
  transition_alt_ft INTEGER DEFAULT 18000
);
CREATE INDEX IF NOT EXISTS idx_aerodromes_geom ON do272_aerodromes USING GIST (center_geom);`,
    sqliteDDL: `CREATE TABLE IF NOT EXISTS do272_aerodromes (
  icao TEXT PRIMARY KEY,
  iata TEXT,
  name TEXT NOT NULL,
  city TEXT,
  country TEXT,
  center_geom BLOB, -- SpatiaLite Point Geometry WKB or GeoJSON
  elevation_m REAL NOT NULL,
  magnetic_variation TEXT,
  transition_alt_ft INTEGER DEFAULT 18000
);
-- In SpatiaLite: SELECT RecoverGeometryColumn('do272_aerodromes', 'center_geom', 4326, 'POINT', 'XY');
-- In SQLite: CREATE INDEX IF NOT EXISTS idx_aerodromes_icao ON do272_aerodromes(icao);`,
  },

  {
    tableName: 'do272_runway_elements',
    featureClass: 'RunwayElement',
    columns: [
      { name: 'id', typePostgres: 'VARCHAR(100) PRIMARY KEY', typeSqlite: 'TEXT PRIMARY KEY', description: 'Unique DO-272 element identifier' },
      { name: 'aerodrome_id', typePostgres: 'VARCHAR(10) REFERENCES do272_aerodromes(icao)', typeSqlite: 'TEXT REFERENCES do272_aerodromes(icao)', description: 'Parent aerodrome' },
      { name: 'designator', typePostgres: 'VARCHAR(50) NOT NULL', typeSqlite: 'TEXT NOT NULL', description: 'Runway designator (e.g. 28L/10R)' },
      { name: 'geom', typePostgres: 'GEOMETRY(Polygon, 4326) NOT NULL', typeSqlite: 'BLOB NOT NULL', description: 'Full runway boundary polygon' },
      { name: 'length_m', typePostgres: 'DOUBLE PRECISION NOT NULL', typeSqlite: 'REAL NOT NULL', description: 'Physical pavement length in meters' },
      { name: 'width_m', typePostgres: 'DOUBLE PRECISION NOT NULL', typeSqlite: 'REAL NOT NULL', description: 'Pavement width in meters' },
      { name: 'true_heading', typePostgres: 'DOUBLE PRECISION', typeSqlite: 'REAL', description: 'True astronomical heading in degrees' },
      { name: 'surface', typePostgres: 'VARCHAR(50) DEFAULT \'Asphalt\'', typeSqlite: 'TEXT DEFAULT \'Asphalt\'', description: 'Surface material classification' },
      { name: 'pcn_rating', typePostgres: 'VARCHAR(50)', typeSqlite: 'TEXT', description: 'Standard 5-part ICAO PCN code' },
      { name: 'ils_cat', typePostgres: 'VARCHAR(50)', typeSqlite: 'TEXT', description: 'Instrument Landing System Category' },
    ],
    postgresDDL: `CREATE TABLE IF NOT EXISTS do272_runway_elements (
  id VARCHAR(100) PRIMARY KEY,
  aerodrome_id VARCHAR(10) REFERENCES do272_aerodromes(icao) ON DELETE CASCADE,
  designator VARCHAR(50) NOT NULL,
  geom GEOMETRY(Polygon, 4326) NOT NULL,
  length_m DOUBLE PRECISION NOT NULL,
  width_m DOUBLE PRECISION NOT NULL,
  true_heading DOUBLE PRECISION,
  surface VARCHAR(50) DEFAULT 'Asphalt',
  pcn_rating VARCHAR(50),
  ils_cat VARCHAR(50)
);
CREATE INDEX IF NOT EXISTS idx_runways_geom ON do272_runway_elements USING GIST (geom);`,
    sqliteDDL: `CREATE TABLE IF NOT EXISTS do272_runway_elements (
  id TEXT PRIMARY KEY,
  aerodrome_id TEXT REFERENCES do272_aerodromes(icao) ON DELETE CASCADE,
  designator TEXT NOT NULL,
  geom BLOB NOT NULL, -- SpatiaLite Polygon / GeoJSON Geometry
  length_m REAL NOT NULL,
  width_m REAL NOT NULL,
  true_heading REAL,
  surface TEXT DEFAULT 'Asphalt',
  pcn_rating TEXT,
  ils_cat TEXT
);
-- In SpatiaLite: SELECT RecoverGeometryColumn('do272_runway_elements', 'geom', 4326, 'POLYGON', 'XY');`,
  },

  {
    tableName: 'do272_taxiway_elements',
    featureClass: 'TaxiwayElement',
    columns: [
      { name: 'id', typePostgres: 'VARCHAR(100) PRIMARY KEY', typeSqlite: 'TEXT PRIMARY KEY', description: 'Unique taxiway element ID' },
      { name: 'aerodrome_id', typePostgres: 'VARCHAR(10) REFERENCES do272_aerodromes(icao)', typeSqlite: 'TEXT REFERENCES do272_aerodromes(icao)', description: 'Parent aerodrome' },
      { name: 'designator', typePostgres: 'VARCHAR(50) NOT NULL', typeSqlite: 'TEXT NOT NULL', description: 'Taxiway name (e.g. Alpha, Foxtrot)' },
      { name: 'geom', typePostgres: 'GEOMETRY(Polygon, 4326) NOT NULL', typeSqlite: 'BLOB NOT NULL', description: 'Taxiway pavement polygon boundary' },
      { name: 'surface', typePostgres: 'VARCHAR(50) DEFAULT \'Asphalt\'', typeSqlite: 'TEXT DEFAULT \'Asphalt\'', description: 'Pavement material' },
      { name: 'width_m', typePostgres: 'DOUBLE PRECISION', typeSqlite: 'REAL', description: 'Standard taxiway pavement width' },
      { name: 'max_wingspan_m', typePostgres: 'DOUBLE PRECISION', typeSqlite: 'REAL', description: 'Maximum cleared wingspan width' },
    ],
    postgresDDL: `CREATE TABLE IF NOT EXISTS do272_taxiway_elements (
  id VARCHAR(100) PRIMARY KEY,
  aerodrome_id VARCHAR(10) REFERENCES do272_aerodromes(icao) ON DELETE CASCADE,
  designator VARCHAR(50) NOT NULL,
  geom GEOMETRY(Polygon, 4326) NOT NULL,
  surface VARCHAR(50) DEFAULT 'Asphalt',
  width_m DOUBLE PRECISION,
  max_wingspan_m DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_taxiways_geom ON do272_taxiway_elements USING GIST (geom);`,
    sqliteDDL: `CREATE TABLE IF NOT EXISTS do272_taxiway_elements (
  id TEXT PRIMARY KEY,
  aerodrome_id TEXT REFERENCES do272_aerodromes(icao) ON DELETE CASCADE,
  designator TEXT NOT NULL,
  geom BLOB NOT NULL,
  surface TEXT DEFAULT 'Asphalt',
  width_m REAL,
  max_wingspan_m REAL
);`,
  },

  {
    tableName: 'do272_guidance_lines',
    featureClass: 'TaxiwayGuidanceLine',
    columns: [
      { name: 'id', typePostgres: 'VARCHAR(100) PRIMARY KEY', typeSqlite: 'TEXT PRIMARY KEY', description: 'Unique guidance line ID' },
      { name: 'aerodrome_id', typePostgres: 'VARCHAR(10) REFERENCES do272_aerodromes(icao)', typeSqlite: 'TEXT REFERENCES do272_aerodromes(icao)', description: 'Parent aerodrome' },
      { name: 'designator', typePostgres: 'VARCHAR(50) NOT NULL', typeSqlite: 'TEXT NOT NULL', description: 'Taxiway guidance centerline designation' },
      { name: 'geom', typePostgres: 'GEOMETRY(LineString, 4326) NOT NULL', typeSqlite: 'BLOB NOT NULL', description: 'Centerline routing linestring' },
      { name: 'is_reversible', typePostgres: 'BOOLEAN DEFAULT TRUE', typeSqlite: 'INTEGER DEFAULT 1', description: '1 for bidirectional, 0 for one-way' },
      { name: 'max_wingspan_m', typePostgres: 'DOUBLE PRECISION', typeSqlite: 'REAL', description: 'Aircraft wingspan envelope' },
    ],
    postgresDDL: `CREATE TABLE IF NOT EXISTS do272_guidance_lines (
  id VARCHAR(100) PRIMARY KEY,
  aerodrome_id VARCHAR(10) REFERENCES do272_aerodromes(icao) ON DELETE CASCADE,
  designator VARCHAR(50) NOT NULL,
  geom GEOMETRY(LineString, 4326) NOT NULL,
  is_reversible BOOLEAN DEFAULT TRUE,
  max_wingspan_m DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_guidance_geom ON do272_guidance_lines USING GIST (geom);`,
    sqliteDDL: `CREATE TABLE IF NOT EXISTS do272_guidance_lines (
  id TEXT PRIMARY KEY,
  aerodrome_id TEXT REFERENCES do272_aerodromes(icao) ON DELETE CASCADE,
  designator TEXT NOT NULL,
  geom BLOB NOT NULL,
  is_reversible INTEGER DEFAULT 1,
  max_wingspan_m REAL
);`,
  },

  {
    tableName: 'do272_parking_stands',
    featureClass: 'ParkingStandArea',
    columns: [
      { name: 'id', typePostgres: 'VARCHAR(100) PRIMARY KEY', typeSqlite: 'TEXT PRIMARY KEY', description: 'Unique parking stand ID' },
      { name: 'aerodrome_id', typePostgres: 'VARCHAR(10) REFERENCES do272_aerodromes(icao)', typeSqlite: 'TEXT REFERENCES do272_aerodromes(icao)', description: 'Parent aerodrome' },
      { name: 'designator', typePostgres: 'VARCHAR(50) NOT NULL', typeSqlite: 'TEXT NOT NULL', description: 'Gate / Stand designator (e.g. Gate A6)' },
      { name: 'stand_number', typePostgres: 'VARCHAR(20)', typeSqlite: 'TEXT', description: 'Stand number' },
      { name: 'terminal', typePostgres: 'VARCHAR(100)', typeSqlite: 'TEXT', description: 'Terminal / Concourse name' },
      { name: 'icao_code_letter', typePostgres: 'VARCHAR(5) DEFAULT \'E\'', typeSqlite: 'TEXT DEFAULT \'E\'', description: 'Maximum ICAO aircraft code letter' },
      { name: 'has_jet_bridge', typePostgres: 'BOOLEAN DEFAULT TRUE', typeSqlite: 'INTEGER DEFAULT 1', description: 'Boarding bridge equipped' },
      { name: 'geom', typePostgres: 'GEOMETRY(Polygon, 4326) NOT NULL', typeSqlite: 'BLOB NOT NULL', description: 'Parking stand envelope polygon' },
    ],
    postgresDDL: `CREATE TABLE IF NOT EXISTS do272_parking_stands (
  id VARCHAR(100) PRIMARY KEY,
  aerodrome_id VARCHAR(10) REFERENCES do272_aerodromes(icao) ON DELETE CASCADE,
  designator VARCHAR(50) NOT NULL,
  stand_number VARCHAR(20),
  terminal VARCHAR(100),
  icao_code_letter VARCHAR(5) DEFAULT 'E',
  has_jet_bridge BOOLEAN DEFAULT TRUE,
  geom GEOMETRY(Polygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stands_geom ON do272_parking_stands USING GIST (geom);`,
    sqliteDDL: `CREATE TABLE IF NOT EXISTS do272_parking_stands (
  id TEXT PRIMARY KEY,
  aerodrome_id TEXT REFERENCES do272_aerodromes(icao) ON DELETE CASCADE,
  designator TEXT NOT NULL,
  stand_number TEXT,
  terminal TEXT,
  icao_code_letter TEXT DEFAULT 'E',
  has_jet_bridge INTEGER DEFAULT 1,
  geom BLOB NOT NULL
);`,
  },

  {
    tableName: 'do272_vertical_structures',
    featureClass: 'VerticalStructure',
    columns: [
      { name: 'id', typePostgres: 'VARCHAR(100) PRIMARY KEY', typeSqlite: 'TEXT PRIMARY KEY', description: 'Obstacle / structure ID' },
      { name: 'aerodrome_id', typePostgres: 'VARCHAR(10) REFERENCES do272_aerodromes(icao)', typeSqlite: 'TEXT REFERENCES do272_aerodromes(icao)', description: 'Parent aerodrome' },
      { name: 'designator', typePostgres: 'VARCHAR(100) NOT NULL', typeSqlite: 'TEXT NOT NULL', description: 'Structure name' },
      { name: 'structure_type', typePostgres: 'VARCHAR(100) NOT NULL', typeSqlite: 'TEXT NOT NULL', description: 'Tower, Hangar, Terminal, Crane' },
      { name: 'height_agl_m', typePostgres: 'DOUBLE PRECISION NOT NULL', typeSqlite: 'REAL NOT NULL', description: 'Height above ground in meters' },
      { name: 'elevation_amsl_m', typePostgres: 'DOUBLE PRECISION NOT NULL', typeSqlite: 'REAL NOT NULL', description: 'Elevation above mean sea level' },
      { name: 'frangible', typePostgres: 'BOOLEAN DEFAULT FALSE', typeSqlite: 'INTEGER DEFAULT 0', description: 'Certified frangible structure' },
      { name: 'lighting_type', typePostgres: 'VARCHAR(50) DEFAULT \'High-Intensity White\'', typeSqlite: 'TEXT DEFAULT \'High-Intensity White\'', description: 'Aviation obstacle lighting' },
      { name: 'geom', typePostgres: 'GEOMETRY(Point, 4326) NOT NULL', typeSqlite: 'BLOB NOT NULL', description: 'Coordinate location' },
    ],
    postgresDDL: `CREATE TABLE IF NOT EXISTS do272_vertical_structures (
  id VARCHAR(100) PRIMARY KEY,
  aerodrome_id VARCHAR(10) REFERENCES do272_aerodromes(icao) ON DELETE CASCADE,
  designator VARCHAR(100) NOT NULL,
  structure_type VARCHAR(100) NOT NULL,
  height_agl_m DOUBLE PRECISION NOT NULL,
  elevation_amsl_m DOUBLE PRECISION NOT NULL,
  frangible BOOLEAN DEFAULT FALSE,
  lighting_type VARCHAR(50) DEFAULT 'High-Intensity White',
  geom GEOMETRY(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_structures_geom ON do272_vertical_structures USING GIST (geom);`,
    sqliteDDL: `CREATE TABLE IF NOT EXISTS do272_vertical_structures (
  id TEXT PRIMARY KEY,
  aerodrome_id TEXT REFERENCES do272_aerodromes(icao) ON DELETE CASCADE,
  designator TEXT NOT NULL,
  structure_type TEXT NOT NULL,
  height_agl_m REAL NOT NULL,
  elevation_amsl_m REAL NOT NULL,
  frangible INTEGER DEFAULT 0,
  lighting_type TEXT DEFAULT 'High-Intensity White',
  geom BLOB NOT NULL
);`,
  },

  {
    tableName: 'do272_hot_spots',
    featureClass: 'HotSpot',
    columns: [
      { name: 'id', typePostgres: 'VARCHAR(100) PRIMARY KEY', typeSqlite: 'TEXT PRIMARY KEY', description: 'Hotspot identifier (e.g. HS-1)' },
      { name: 'aerodrome_id', typePostgres: 'VARCHAR(10) REFERENCES do272_aerodromes(icao)', typeSqlite: 'TEXT REFERENCES do272_aerodromes(icao)', description: 'Parent aerodrome' },
      { name: 'designator', typePostgres: 'VARCHAR(50) NOT NULL', typeSqlite: 'TEXT NOT NULL', description: 'Hot spot label' },
      { name: 'severity', typePostgres: 'VARCHAR(20) DEFAULT \'High\'', typeSqlite: 'TEXT DEFAULT \'High\'', description: 'High, Medium, Low' },
      { name: 'associated_runway', typePostgres: 'VARCHAR(50)', typeSqlite: 'TEXT', description: 'Runway intersection affected' },
      { name: 'hazard_description', typePostgres: 'TEXT', typeSqlite: 'TEXT', description: 'Operational incursion notes' },
      { name: 'geom', typePostgres: 'GEOMETRY(Polygon, 4326) NOT NULL', typeSqlite: 'BLOB NOT NULL', description: 'Hazard zone polygon' },
    ],
    postgresDDL: `CREATE TABLE IF NOT EXISTS do272_hot_spots (
  id VARCHAR(100) PRIMARY KEY,
  aerodrome_id VARCHAR(10) REFERENCES do272_aerodromes(icao) ON DELETE CASCADE,
  designator VARCHAR(50) NOT NULL,
  severity VARCHAR(20) DEFAULT 'High',
  associated_runway VARCHAR(50),
  hazard_description TEXT,
  geom GEOMETRY(Polygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hotspots_geom ON do272_hot_spots USING GIST (geom);`,
    sqliteDDL: `CREATE TABLE IF NOT EXISTS do272_hot_spots (
  id TEXT PRIMARY KEY,
  aerodrome_id TEXT REFERENCES do272_aerodromes(icao) ON DELETE CASCADE,
  designator TEXT NOT NULL,
  severity TEXT DEFAULT 'High',
  associated_runway TEXT,
  hazard_description TEXT,
  geom BLOB NOT NULL
);`,
  },
];

/**
 * Generate complete DDL script for selected engine
 */
export function generateFullDdlScript(engine: DatabaseEngine): string {
  if (engine === 'postgres') {
    return `-- ====================================================================
-- RTCA DO-272 / EUROCAE ED-99 Spatial Schema for PostgreSQL + PostGIS
-- Database Dialect: PostgreSQL 16+ with PostGIS 3.4+ Extensions
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

${REPLICATED_DO272_TABLES.map((t) => t.postgresDDL).join('\n\n')}
`;
  } else {
    return `-- ====================================================================
-- RTCA DO-272 / EUROCAE ED-99 Spatial Schema for SQLite + SpatiaLite
-- Database Dialect: SQLite 3.40+ (Standalone or SpatiaLite)
-- ====================================================================

PRAGMA foreign_keys = ON;

${REPLICATED_DO272_TABLES.map((t) => t.sqliteDDL).join('\n\n')}
`;
  }
}
