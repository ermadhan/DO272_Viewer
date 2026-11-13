import { AerodromeDataset, AnyDO272Feature } from '../types/do272';

/**
 * Fetches OpenStreetMap aeroway geometry and converts it to the DO-272 dataset shape.
 */
export async function fetchOsmAerodrome(icaoCode: string): Promise<AerodromeDataset> {
  const upperCode = icaoCode.toUpperCase().trim();
  const hubCoords: Record<string, [number, number]> = {
    KSFO: [37.619, -122.375],
    EGLL: [51.470, -0.454],
    EDDF: [50.038, 8.562],
    OMDB: [25.253, 55.366],
    KJFK: [40.6413, -73.7781],
    KLAX: [33.9416, -118.4085],
    LFPG: [49.0097, 2.5479],
    EHAM: [52.3105, 4.7683],
    RJTT: [35.5494, 139.7798],
    WSSS: [1.3644, 103.9915],
  };

  let centerLat = hubCoords[upperCode]?.[0] ?? 0;
  let centerLng = hubCoords[upperCode]?.[1] ?? 0;
  let airportName = `${upperCode} International Airport`;

  if (!centerLat) {
    const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${upperCode} airport`)}&format=json&limit=1`;
    const geoResponse = await fetch(geoUrl, {
      headers: { 'User-Agent': 'DO272-Spatial-GIS/1.0' },
    });
    if (!geoResponse.ok) {
      throw new Error(`Failed to geolocate airport with code: ${upperCode}`);
    }

    const geoData = await geoResponse.json();
    if (!geoData || geoData.length === 0) {
      throw new Error(`Airport code "${upperCode}" not found in OpenStreetMap.`);
    }

    centerLat = parseFloat(geoData[0].lat);
    centerLng = parseFloat(geoData[0].lon);
    airportName = geoData[0].display_name.split(',')[0];
  }

  const bboxDelta = 0.045;
  const south = (centerLat - bboxDelta).toFixed(4);
  const west = (centerLng - bboxDelta).toFixed(4);
  const north = (centerLat + bboxDelta).toFixed(4);
  const east = (centerLng + bboxDelta).toFixed(4);
  const overpassQuery = `[out:json][timeout:25];
(
  way["aeroway"="runway"](${south},${west},${north},${east});
  way["aeroway"="taxiway"](${south},${west},${north},${east});
  way["aeroway"="apron"](${south},${west},${north},${east});
  node["aeroway"="parking_position"](${south},${west},${north},${east});
  node["aeroway"="holding_position"](${south},${west},${north},${east});
  node["aeroway"="control_tower"](${south},${west},${north},${east});
  node["aeroway"="windsock"](${south},${west},${north},${east});
);
out body geom;`;

  const overpassResponse = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: `data=${encodeURIComponent(overpassQuery)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!overpassResponse.ok) {
    throw new Error(`Overpass API query failed for ${upperCode}.`);
  }

  const osmResult = await overpassResponse.json();
  const convertedFeatures: AnyDO272Feature[] = [];

  for (const element of osmResult.elements || []) {
    const tags = element.tags || {};
    const aeroway = tags.aeroway;

    if (aeroway === 'runway' && element.geometry) {
      const coordinates: [number, number][] = element.geometry.map(
        (point: { lat: number; lon: number }) => [point.lat, point.lon]
      );
      convertedFeatures.push({
        id: `OSM-RWY-${element.id}`,
        aerodromeId: upperCode,
        featureClass: 'RunwayElement',
        designator: tags.ref || tags.name || 'Runway',
        status: 'Active',
        lengthMeters: Math.round(parseFloat(tags.length) || 3000),
        widthMeters: Math.round(parseFloat(tags.width) || 45),
        trueHeading: 0,
        surface: tags.surface === 'concrete' ? 'Concrete' : 'Asphalt',
        pcnRating: tags.pcn || '100/F/A/W/T',
        coordinates,
        properties: { osmTags: tags },
      });
    } else if (aeroway === 'taxiway' && element.geometry) {
      const coordinates: [number, number][] = element.geometry.map(
        (point: { lat: number; lon: number }) => [point.lat, point.lon]
      );
      convertedFeatures.push({
        id: `OSM-TWY-${element.id}`,
        aerodromeId: upperCode,
        featureClass: 'TaxiwayGuidanceLine',
        designator: tags.ref || 'TWY',
        status: 'Active',
        isReversible: true,
        coordinates,
        properties: { osmTags: tags },
      });
    } else if (aeroway === 'parking_position' && element.lat && element.lon) {
      convertedFeatures.push({
        id: `OSM-STAND-${element.id}`,
        aerodromeId: upperCode,
        featureClass: 'ParkingStandArea',
        designator: tags.ref || `Stand ${element.id}`,
        standNumber: tags.ref || `${element.id}`,
        status: 'Active',
        icaoCodeLetter: 'D',
        hasJetBridge: tags.jet_bridge === 'yes',
        coordinates: [element.lat, element.lon],
        properties: { osmTags: tags },
      });
    } else if (aeroway === 'control_tower' && element.lat && element.lon) {
      convertedFeatures.push({
        id: `OSM-VS-${element.id}`,
        aerodromeId: upperCode,
        featureClass: 'VerticalStructure',
        designator: tags.name || 'Air Traffic Control Tower',
        structureType: 'Control Tower',
        status: 'Active',
        heightAglMeters: parseFloat(tags.height) || 60,
        elevationAmslMeters: parseFloat(tags.ele) || 80,
        frangible: false,
        lightingType: 'High-Intensity White',
        coordinates: [element.lat, element.lon],
        properties: { osmTags: tags },
      });
    }
  }

  if (convertedFeatures.length === 0) {
    throw new Error(`No aeroway features were found for ${upperCode} in OpenStreetMap.`);
  }

  return {
    icao: upperCode,
    iata: upperCode.length === 3 ? upperCode : upperCode.slice(1),
    name: airportName,
    city: 'High-Resolution Aerodrome',
    country: 'International',
    center: [centerLat, centerLng],
    elevationMeters: 20,
    magneticVariation: '0.0°',
    transitionAltitudeFt: 10000,
    source: 'OpenStreetMap Aeroway Ingest',
    features: convertedFeatures,
  };
}
