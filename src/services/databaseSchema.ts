/**
 * Database schema used by the backend to persist aerodromes and their DO-272 features.
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
    featureClass: 'Aerodrome records',
    columns: [
      { name: 'icao', typePostgres: 'VARCHAR(10) PRIMARY KEY', typeSqlite: 'TEXT PRIMARY KEY', description: 'ICAO aerodrome identifier' },
      { name: 'iata', typePostgres: 'VARCHAR(5)', typeSqlite: 'TEXT', description: 'IATA airport code' },
      { name: 'name', typePostgres: 'VARCHAR(255) NOT NULL', typeSqlite: 'TEXT NOT NULL', description: 'Aerodrome name' },
      { name: 'city', typePostgres: 'VARCHAR(100)', typeSqlite: 'TEXT', description: 'City' },
      { name: 'country', typePostgres: 'VARCHAR(100)', typeSqlite: 'TEXT', description: 'Country' },
      { name: 'center_lat', typePostgres: 'DOUBLE PRECISION NOT NULL', typeSqlite: 'REAL NOT NULL', description: 'Center latitude' },
      { name: 'center_lng', typePostgres: 'DOUBLE PRECISION NOT NULL', typeSqlite: 'REAL NOT NULL', description: 'Center longitude' },
      { name: 'elevation_m', typePostgres: 'DOUBLE PRECISION NOT NULL', typeSqlite: 'REAL NOT NULL', description: 'Aerodrome elevation in meters' },
      { name: 'magnetic_variation', typePostgres: 'VARCHAR(20)', typeSqlite: 'TEXT', description: 'Magnetic variation' },
      { name: 'transition_altitude_ft', typePostgres: 'INTEGER NOT NULL', typeSqlite: 'INTEGER NOT NULL', description: 'Transition altitude in feet' },
      { name: 'source', typePostgres: 'VARCHAR(100) NOT NULL', typeSqlite: 'TEXT NOT NULL', description: 'Dataset source' },
    ],
    postgresDDL: `CREATE TABLE IF NOT EXISTS do272_aerodromes (
  icao VARCHAR(10) PRIMARY KEY,
  iata VARCHAR(5) NOT NULL DEFAULT '',
  name VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL DEFAULT '',
  country VARCHAR(100) NOT NULL DEFAULT '',
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  elevation_m DOUBLE PRECISION NOT NULL,
  magnetic_variation VARCHAR(20) NOT NULL DEFAULT '',
  transition_altitude_ft INTEGER NOT NULL DEFAULT 18000,
  source VARCHAR(100) NOT NULL
);`,
    sqliteDDL: `CREATE TABLE IF NOT EXISTS do272_aerodromes (
  icao TEXT PRIMARY KEY,
  iata TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  center_lat REAL NOT NULL,
  center_lng REAL NOT NULL,
  elevation_m REAL NOT NULL,
  magnetic_variation TEXT NOT NULL DEFAULT '',
  transition_altitude_ft INTEGER NOT NULL DEFAULT 18000,
  source TEXT NOT NULL
);`,
  },
  {
    tableName: 'do272_features',
    featureClass: 'All DO-272 feature classes',
    columns: [
      { name: 'aerodrome_id', typePostgres: 'VARCHAR(10) PRIMARY KEY, FOREIGN KEY', typeSqlite: 'TEXT PRIMARY KEY, FOREIGN KEY', description: 'Parent aerodrome ICAO code' },
      { name: 'id', typePostgres: 'VARCHAR(150) PRIMARY KEY', typeSqlite: 'TEXT PRIMARY KEY', description: 'Feature identifier, unique within its aerodrome' },
      { name: 'feature_index', typePostgres: 'INTEGER NOT NULL', typeSqlite: 'INTEGER NOT NULL', description: 'Original feature order in the dataset' },
      { name: 'feature_class', typePostgres: 'VARCHAR(100) NOT NULL', typeSqlite: 'TEXT NOT NULL', description: 'DO-272 feature class' },
      { name: 'designator', typePostgres: 'VARCHAR(150) NOT NULL', typeSqlite: 'TEXT NOT NULL', description: 'Feature designator' },
      { name: 'coordinates', typePostgres: 'JSON', typeSqlite: 'JSON', description: 'Coordinates in the dataset coordinate format' },
      { name: 'payload', typePostgres: 'JSON NOT NULL', typeSqlite: 'JSON NOT NULL', description: 'Complete feature record, including class-specific attributes' },
    ],
    postgresDDL: `CREATE TABLE IF NOT EXISTS do272_features (
  aerodrome_id VARCHAR(10) NOT NULL REFERENCES do272_aerodromes(icao) ON DELETE CASCADE,
  id VARCHAR(150) NOT NULL,
  feature_index INTEGER NOT NULL,
  feature_class VARCHAR(100) NOT NULL,
  designator VARCHAR(150) NOT NULL DEFAULT '',
  coordinates JSON,
  payload JSON NOT NULL,
  PRIMARY KEY (aerodrome_id, id)
);
CREATE INDEX IF NOT EXISTS idx_do272_features_class ON do272_features(feature_class);`,
    sqliteDDL: `PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS do272_features (
  aerodrome_id TEXT NOT NULL REFERENCES do272_aerodromes(icao) ON DELETE CASCADE,
  id TEXT NOT NULL,
  feature_index INTEGER NOT NULL,
  feature_class TEXT NOT NULL,
  designator TEXT NOT NULL DEFAULT '',
  coordinates JSON,
  payload JSON NOT NULL,
  PRIMARY KEY (aerodrome_id, id)
);
CREATE INDEX IF NOT EXISTS idx_do272_features_class ON do272_features(feature_class);`,
  },
  {
    tableName: 'do272_source_snapshots',
    featureClass: 'Dated source snapshots',
    columns: [
      { name: 'id', typePostgres: 'SERIAL PRIMARY KEY', typeSqlite: 'INTEGER PRIMARY KEY', description: 'Snapshot identifier' },
      { name: 'aerodrome_id', typePostgres: 'VARCHAR(10) NOT NULL', typeSqlite: 'TEXT NOT NULL', description: 'Airport identifier' },
      { name: 'source_kind', typePostgres: 'VARCHAR(20) NOT NULL', typeSqlite: 'TEXT NOT NULL', description: 'Source type' },
      { name: 'captured_at', typePostgres: 'VARCHAR(40)', typeSqlite: 'TEXT', description: 'Capture time; unknown for legacy data' },
      { name: 'payload', typePostgres: 'JSON NOT NULL', typeSqlite: 'JSON NOT NULL', description: 'Source dataset, provenance and attribution' },
    ],
    postgresDDL: `CREATE TABLE IF NOT EXISTS do272_source_snapshots (
  id SERIAL PRIMARY KEY,
  aerodrome_id VARCHAR(10) NOT NULL,
  source_kind VARCHAR(20) NOT NULL,
  captured_at VARCHAR(40),
  payload JSON NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_do272_source_snapshots_aerodrome_id ON do272_source_snapshots(aerodrome_id);`,
    sqliteDDL: `CREATE TABLE IF NOT EXISTS do272_source_snapshots (
  id INTEGER PRIMARY KEY,
  aerodrome_id TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  captured_at TEXT,
  payload JSON NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_do272_source_snapshots_aerodrome_id ON do272_source_snapshots(aerodrome_id);`,
  },
  {
    tableName: 'do272_snapshot_features',
    featureClass: 'Features in source snapshots',
    columns: [
      { name: 'snapshot_id', typePostgres: 'INTEGER NOT NULL', typeSqlite: 'INTEGER NOT NULL', description: 'Parent source snapshot' },
      { name: 'feature_index', typePostgres: 'INTEGER NOT NULL', typeSqlite: 'INTEGER NOT NULL', description: 'Feature order within snapshot' },
      { name: 'feature_id', typePostgres: 'VARCHAR(150) NOT NULL', typeSqlite: 'TEXT NOT NULL', description: 'Source feature identifier' },
      { name: 'feature_class', typePostgres: 'VARCHAR(100)', typeSqlite: 'TEXT', description: 'Feature class or OSM aeroway tag' },
      { name: 'payload', typePostgres: 'JSON NOT NULL', typeSqlite: 'JSON NOT NULL', description: 'Source feature including original attributes and geometry' },
    ],
    postgresDDL: `CREATE TABLE IF NOT EXISTS do272_snapshot_features (
  snapshot_id INTEGER NOT NULL REFERENCES do272_source_snapshots(id) ON DELETE CASCADE,
  feature_index INTEGER NOT NULL,
  feature_id VARCHAR(150) NOT NULL,
  feature_class VARCHAR(100),
  payload JSON NOT NULL,
  PRIMARY KEY (snapshot_id, feature_index)
);`,
    sqliteDDL: `CREATE TABLE IF NOT EXISTS do272_snapshot_features (
  snapshot_id INTEGER NOT NULL REFERENCES do272_source_snapshots(id) ON DELETE CASCADE,
  feature_index INTEGER NOT NULL,
  feature_id TEXT NOT NULL,
  feature_class TEXT,
  payload JSON NOT NULL,
  PRIMARY KEY (snapshot_id, feature_index)
);`,
  },
  {
    tableName: 'do272_active_curated_snapshots',
    featureClass: 'Active curated selection',
    columns: [
      { name: 'aerodrome_id', typePostgres: 'VARCHAR(10) PRIMARY KEY', typeSqlite: 'TEXT PRIMARY KEY', description: 'Airport identifier' },
      { name: 'snapshot_id', typePostgres: 'INTEGER NOT NULL', typeSqlite: 'INTEGER NOT NULL', description: 'Reviewed active snapshot' },
    ],
    postgresDDL: `CREATE TABLE IF NOT EXISTS do272_active_curated_snapshots (
  aerodrome_id VARCHAR(10) PRIMARY KEY,
  snapshot_id INTEGER NOT NULL REFERENCES do272_source_snapshots(id)
);`,
    sqliteDDL: `CREATE TABLE IF NOT EXISTS do272_active_curated_snapshots (
  aerodrome_id TEXT PRIMARY KEY,
  snapshot_id INTEGER NOT NULL REFERENCES do272_source_snapshots(id)
);`,
  },
];

export function generateFullDdlScript(engine: DatabaseEngine): string {
  const dialect = engine === 'postgres' ? 'PostgreSQL' : 'SQLite';
  return `-- DO-272 aerodrome persistence schema for ${dialect}

${REPLICATED_DO272_TABLES.map((table) =>
    engine === 'postgres' ? table.postgresDDL : table.sqliteDDL
  ).join('\n\n')}
`;
}
