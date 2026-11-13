import { OsmFeature, OsmSnapshotInput } from '../types/do272';

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  version?: number;
  timestamp?: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  members?: NonNullable<OsmFeature['members']>;
  tags?: Record<string, string>;
}

export interface OsmAirportCandidate {
  type: OsmElement['type'];
  id: number;
  name: string;
  center: [number, number];
}

function validCode(icao: string): string {
  const code = icao.toUpperCase().trim();
  if (!/^[A-Z]{4}$/.test(code)) throw new Error('Enter a four-letter ICAO airport code.');
  return code;
}

async function overpass(query: string): Promise<{ elements: OsmElement[]; timestamp: string | null }> {
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!response.ok) throw new Error(`Overpass API request failed (${response.status}).`);
  const result: { elements?: OsmElement[]; osm3s?: { timestamp_osm_base?: string }; remark?: string } = await response.json();
  if (result.remark) throw new Error(`Overpass returned an incomplete result: ${result.remark}`);
  if (!Array.isArray(result.elements)) throw new Error('Overpass response is missing its elements.');
  return { elements: result.elements, timestamp: result.osm3s?.timestamp_osm_base ?? null };
}

export async function findOsmAirports(icao: string): Promise<OsmAirportCandidate[]> {
  const code = validCode(icao);
  const result = await overpass(`[out:json][timeout:25];nwr["aeroway"="aerodrome"]["icao"="${code}"];out center tags;`);
  return result.elements.map(element => {
    const lat = element.center?.lat ?? element.lat;
    const lon = element.center?.lon ?? element.lon;
    if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon) ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      throw new Error(`OSM airport ${element.type}/${element.id} has no valid location.`);
    }
    return { type: element.type, id: element.id, name: element.tags?.name || code, center: [lat, lon] };
  });
}

export async function fetchOsmAerodrome(icaoCode: string, selected?: OsmAirportCandidate): Promise<OsmSnapshotInput> {
  const code = validCode(icaoCode);
  const candidates = selected ? [selected] : await findOsmAirports(code);
  if (candidates.length !== 1) {
    throw new Error(candidates.length ? `Multiple OSM airports match ${code}; use Add airport to select one.` : `No OSM aerodrome with ICAO ${code} was found.`);
  }
  const airport = candidates[0];
  if (airport.type === 'node') throw new Error('This OSM airport has no mapped boundary. Import requires a mapped aerodrome way or relation.');
  if (!Number.isSafeInteger(airport.id) || airport.id <= 0) throw new Error('Invalid OSM airport identifier.');
  const query = `[out:json][timeout:60];${airport.type}(${airport.id})->.airport;.airport map_to_area->.boundary;(nwr["aeroway"](area.boundary););out meta geom;`;
  const result = await overpass(query);
  const features: OsmFeature[] = result.elements.map(element => {
    const tags = element.tags ?? {};
    let coordinates: OsmFeature['coordinates'];
    let geometryType: OsmFeature['geometryType'];
    if (element.type === 'node' && element.lat !== undefined && element.lon !== undefined) {
      coordinates = [element.lat, element.lon];
      geometryType = 'Point';
    } else if (element.type === 'relation') {
      if (!element.members) throw new Error(`Missing members for OSM relation/${element.id}.`);
      coordinates = element.members.flatMap(member => {
        if (member.geometry?.length) return [member.geometry.map(point => [point.lat, point.lon] as [number, number])];
        if (member.lat !== undefined && member.lon !== undefined) return [[[member.lat, member.lon] as [number, number]]];
        return [];
      });
      geometryType = 'GeometryCollection';
    } else if (element.type === 'way' && element.geometry && element.geometry.length >= 2) {
      const points: [number, number][] = element.geometry.map(point => [point.lat, point.lon]);
      coordinates = points;
      const first = points[0], last = points[points.length - 1];
      const closed = points.length >= 4 && first[0] === last[0] && first[1] === last[1];
      geometryType = closed && (tags.area === 'yes' || (tags.aeroway === 'apron' && tags.area !== 'no')) ? 'Polygon' : 'LineString';
    } else {
      throw new Error(`Missing geometry for OSM ${element.type}/${element.id}.`);
    }
    return {
      id: `OSM-${element.type}-${element.id}`, osmType: element.type, osmId: element.id,
      version: element.version ?? null, timestamp: element.timestamp ?? null,
      aeroway: tags.aeroway ?? '', designator: tags.ref || tags.name || '',
      geometryType, coordinates, tags, ...(element.members ? { members: element.members } : {}),
    };
  });
  if (!features.length) throw new Error(`No aeroway features were found within the mapped boundary for ${code}.`);
  return {
    dataset: {
      icao: code, iata: '', name: airport.name, city: '', country: '', center: airport.center,
      elevationMeters: null, magneticVariation: '', transitionAltitudeFt: null,
      source: 'OpenStreetMap Aeroway Ingest', features,
    },
    osmTimestamp: result.timestamp, attribution: '© OpenStreetMap contributors',
    boundary: { osmType: airport.type, osmId: airport.id },
  };
}
