import type { AerodromeDataset } from '../types/do272';
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

export async function getDatabaseEngine(): Promise<DatabaseEngine> {
  const response = await requestJson<DatabaseEngineResponse>('/api/v1/database/engine');
  return response.active_engine;
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
