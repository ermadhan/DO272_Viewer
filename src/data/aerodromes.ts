import { OsmFeature, OsmSnapshotInput } from '../types/do272';

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  version?: number;
  timestamp?: string;
  lat?: number;
  lon?: number;
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

export async function fetchOsmAerodrome(icaoCode: string): Promise<OsmSnapshotInput> {
  const upperCode = icaoCode.toUpperCase().trim();
  if (!/^[A-Z]{4}$/.test(upperCode)) throw new Error('Enter a four-letter ICAO airport code.');
  const hubCoords: Record<string, [number, number]> = {
    KSFO: [37.619, -122.375], EGLL: [51.470, -0.454], EDDF: [50.038, 8.562],
    OMDB: [25.253, 55.366], KJFK: [40.6413, -73.7781], KLAX: [33.9416, -118.4085],
    LFPG: [49.0097, 2.5479], EHAM: [52.3105, 4.7683], RJTT: [35.5494, 139.7798],
    WSSS: [1.3644, 103.9915],
  };
  let center = hubCoords[upperCode];
  let airportName = upperCode;
  if (!center) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${upperCode} airport`)}&format=json&extratags=1&limit=1`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to locate ${upperCode} in OpenStreetMap.`);
    const results: { lat: string; lon: string; display_name: string; extratags?: { icao?: string } }[] = await response.json();
    if (!results.length) throw new Error(`Airport code "${upperCode}" not found in OpenStreetMap.`);
    if (results[0].extratags?.icao && results[0].extratags.icao.toUpperCase() !== upperCode) {
      throw new Error(`OpenStreetMap returned a different ICAO code for ${upperCode}.`);
    }
    center = [Number(results[0].lat), Number(results[0].lon)];
    if (!center.every(Number.isFinite)) throw new Error(`Invalid OpenStreetMap location for ${upperCode}.`);
    airportName = results[0].display_name.split(',')[0];
  }
  const [lat, lon] = center;
  const box = [lat - 0.045, lon - 0.045, lat + 0.045, lon + 0.045]
    .map(value => value.toFixed(4)).join(',');
  const query = `[out:json][timeout:25];
(
  way["aeroway"="runway"](${box});
  way["aeroway"="taxiway"](${box});
  way["aeroway"="apron"](${box});
  node["aeroway"="parking_position"](${box});
  node["aeroway"="holding_position"](${box});
  node["aeroway"="control_tower"](${box});
  node["aeroway"="windsock"](${box});
);
out meta geom;`;
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!response.ok) throw new Error(`Overpass API query failed for ${upperCode} (${response.status}).`);
  const result: { elements?: OsmElement[]; osm3s?: { timestamp_osm_base?: string }; remark?: string } = await response.json();
  if (result.remark) throw new Error(`Overpass returned an incomplete result: ${result.remark}`);
  if (!Array.isArray(result.elements)) throw new Error('Overpass response is missing its elements.');
  const features: OsmFeature[] = result.elements.map(element => {
    const tags = element.tags ?? {};
    let coordinates: [number, number] | [number, number][];
    let geometryType: OsmFeature['geometryType'];
    if (element.type === 'node' && element.lat !== undefined && element.lon !== undefined) {
      coordinates = [element.lat, element.lon];
      geometryType = 'Point';
    } else if (element.geometry && element.geometry.length >= 2) {
      coordinates = element.geometry.map(point => [point.lat, point.lon]);
      const first = coordinates[0];
      const last = coordinates[coordinates.length - 1];
      const closed = coordinates.length >= 4 && first[0] === last[0] && first[1] === last[1];
      geometryType = closed && (tags.area === 'yes' || (tags.aeroway === 'apron' && tags.area !== 'no')) ? 'Polygon' : 'LineString';
    } else {
      throw new Error(`Missing geometry for OSM ${element.type}/${element.id}.`);
    }
    return {
      id: `OSM-${element.type}-${element.id}`,
      osmType: element.type, osmId: element.id,
      version: element.version ?? null, timestamp: element.timestamp ?? null,
      aeroway: tags.aeroway ?? '', designator: tags.ref || tags.name || '',
      geometryType, coordinates, tags,
    };
  });
  if (!features.length) throw new Error(`No aeroway features were found for ${upperCode} in OpenStreetMap.`);
  return {
    dataset: {
      icao: upperCode, iata: '', name: airportName, city: '', country: '', center,
      elevationMeters: null, magneticVariation: '', transitionAltitudeFt: null,
      source: 'OpenStreetMap Aeroway Ingest', features,
    },
    osmTimestamp: result.osm3s?.timestamp_osm_base ?? null,
    attribution: '© OpenStreetMap contributors',
  };
}
