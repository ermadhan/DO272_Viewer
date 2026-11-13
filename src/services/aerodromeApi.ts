import type { AerodromeDataset, OsmSnapshot, OsmSnapshotInput } from '../types/do272';
import type { DatabaseEngine } from './databaseSchema';

export interface AerodromeSummary {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  featureCount: number;
}

interface DatabaseEngineResponse {
  active_engine: DatabaseEngine;
  database_location: string | null;
}

export interface OsmSnapshotSummary {
  id: number;
  capturedAt: string | null;
  osmTimestamp: string | null;
  attribution: string;
  legacy: boolean;
  featureCount: number;
}

export interface CuratedSnapshot {
  id: number;
  capturedAt: string | null;
  dataset: AerodromeDataset;
  provider?: string;
  sourceUrl?: string;
  effectiveDate?: string;
  coverage?: string;
  attribution?: string;
  license?: string;
  skippedRunways?: string[];
  comparison?: {
    baselineAvailable: boolean;
    baselineCounts: Record<string, number>;
    importCounts: Record<string, number>;
    runways?: {
      designator: string;
      baselineLength: number | null;
      importLength: number | null;
      baselineWidth: number | null;
      importWidth: number | null;
    }[];
  };
}

export interface CuratedSnapshotSummary {
  id: number;
  capturedAt: string | null;
  provider: string;
  effectiveDate: string | null;
  featureCount: number;
  active: boolean;
}

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
).replace(/\/$/, '');

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  if (!response.ok) {
    const errorBody = await response.json() as { detail?: unknown };
    const detail =
      typeof errorBody.detail === 'string' ? errorBody.detail : response.statusText;
    throw new Error(detail || `Backend request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function getAerodromes(): Promise<AerodromeSummary[]> {
  return requestJson('/api/v1/aerodromes');
}

export function getAerodromeDataset(icao: string): Promise<AerodromeDataset> {
  return requestJson(`/api/v1/aerodromes/${encodeURIComponent(icao)}`);
}

export function getDatabaseInfo(): Promise<DatabaseEngineResponse> {
  return requestJson('/api/v1/database/engine');
}

export async function setDatabaseEngine(engine: DatabaseEngine): Promise<DatabaseEngine> {
  const response = await requestJson<DatabaseEngineResponse>('/api/v1/database/engine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ engine }),
  });
  return response.active_engine;
}

export function saveAerodromeDataset(
  dataset: AerodromeDataset
): Promise<AerodromeDataset> {
  return requestJson(`/api/v1/aerodromes/${encodeURIComponent(dataset.icao)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dataset),
  });
}

export function getOsmSnapshots(icao: string): Promise<OsmSnapshotSummary[]> {
  return requestJson(`/api/v1/aerodromes/${encodeURIComponent(icao)}/osm-snapshots`);
}

export function getOsmSnapshot(icao: string, id: number): Promise<OsmSnapshot> {
  return requestJson(`/api/v1/aerodromes/${encodeURIComponent(icao)}/osm-snapshots/${id}`);
}

export function saveOsmSnapshot(snapshot: OsmSnapshotInput): Promise<OsmSnapshot> {
  return requestJson(`/api/v1/aerodromes/${encodeURIComponent(snapshot.dataset.icao)}/osm-snapshots`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
  });
}

export function importCurated(icao: string, provider: 'faa' | 'nats' | 'ourairports'): Promise<CuratedSnapshot> {
  return requestJson(`/api/v1/aerodromes/${encodeURIComponent(icao)}/curated-import?provider=${provider}`, { method: 'POST' });
}

export function getCuratedSnapshots(icao: string): Promise<CuratedSnapshotSummary[]> {
  return requestJson(`/api/v1/aerodromes/${encodeURIComponent(icao)}/curated-snapshots`);
}

export function getCuratedSnapshot(icao: string, id: number): Promise<CuratedSnapshot> {
  return requestJson(`/api/v1/aerodromes/${encodeURIComponent(icao)}/curated-snapshots/${id}`);
}

export function activateCuratedSnapshot(icao: string, id: number): Promise<{ activeSnapshotId: number }> {
  return requestJson(`/api/v1/aerodromes/${encodeURIComponent(icao)}/curated-snapshots/${id}/activate`, { method: 'POST' });
}

export function restoreOriginalBaseline(icao: string): Promise<{ status: string }> {
  return requestJson(`/api/v1/aerodromes/${encodeURIComponent(icao)}/active-curated-snapshot`, { method: 'DELETE' });
}
