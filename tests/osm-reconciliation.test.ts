import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fetchOsmAerodrome } from '../src/data/aerodromes';
import { osmCandidateClass, reconcileOsm } from '../src/services/osmReconciliation';
import type { AerodromeDataset, OsmFeature } from '../src/types/do272';

const runway = {
  id: 'curated', aerodromeId: 'TEST', featureClass: 'RunwayElement' as const,
  designator: '28L/10R', status: 'Active' as const, lengthMeters: 1000, widthMeters: 50,
  coordinates: [[0, 0], [0, 0.001], [0.0002, 0.001], [0.0002, 0]] as [number, number][],
};
const dataset: AerodromeDataset = {
  icao: 'TEST', iata: '', name: 'Test', city: '', country: '', center: [0, 0],
  elevationMeters: 0, magneticVariation: '', transitionAltitudeFt: 10000,
  source: 'Curated Hub (DO-272/ED-99)', features: [runway],
};
function way(id: number, coordinates: [number, number][], ref = '10R/28L'): OsmFeature {
  return {
    id: `OSM-way-${id}`, osmType: 'way', osmId: id, version: 1, timestamp: null,
    aeroway: 'runway', designator: ref, geometryType: 'LineString', coordinates,
    tags: { aeroway: 'runway', ref, length: '1100' },
  };
}

test('joins connected runway ways and flags a source disagreement without changing the baseline', () => {
  const first = way(1, [[0.0001, 0], [0.0001, 0.0005]]);
  const second = way(2, [[0.0001, 0.0005], [0.0001, 0.001]]);
  const groups = reconcileOsm(dataset, [first, second]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].status, 'matched');
  assert.equal(groups[0].features.length, 2);
  assert.deepEqual(groups[0].conflicts, [{ field: 'lengthMeters', curated: 1000, osm: 1100 }]);
  assert.equal(runway.lengthMeters, 1000);
});

test('keeps distant, unidentified and ambiguous objects for review', () => {
  const distant = way(3, [[1, 1], [1, 1.001]]);
  const unnamed = way(4, [[0.0001, 0], [0.0001, 0.001]], '');
  const nearby = way(5, [[0.0001, 0], [0.0001, 0.001]]);
  const duplicate = { ...runway, id: 'second' };
  const groups = reconcileOsm({ ...dataset, features: [runway, duplicate] }, [distant, unnamed, nearby]);
  assert.deepEqual(groups.map(group => group.status), ['ambiguous', 'unmatched', 'ambiguous']);
});

test('does not group perpendicular ways that meet at a junction', () => {
  const horizontal = way(10, [[0.0001, 0], [0.0001, 0.0005]]);
  const perpendicular = way(11, [[0.0001, 0.0005], [0.0004, 0.0005]]);
  assert.equal(reconcileOsm(dataset, [horizontal, perpendicular]).length, 2);
});

test('ingest retains geometry, object metadata and missing attributes without defaults', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const query = decodeURIComponent(String(init?.body));
    if (query.includes('out center tags')) return new Response(JSON.stringify({
      elements: [{ type: 'way', id: 100, center: { lat: 0, lon: 0 }, tags: { name: 'Test airport', icao: 'KSFO' } }],
    }));
    assert.ok(query.includes('nwr["aeroway"](area.boundary)'));
    return new Response(JSON.stringify({
    osm3s: { timestamp_osm_base: '2024-01-01T00:00:00Z' },
    elements: [
      { type: 'way', id: 1, version: 2, timestamp: '2024-01-01T00:00:00Z',
        tags: { aeroway: 'runway', ref: '10/28' },
        geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }] },
      { type: 'way', id: 2, tags: { aeroway: 'apron' },
        geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 1, lon: 1 }, { lat: 0, lon: 0 }] },
      { type: 'node', id: 3, lat: 0, lon: 0, tags: { aeroway: 'holding_position' } },
      { type: 'node', id: 4, lat: 1, lon: 1, tags: { aeroway: 'windsock' } },
      { type: 'relation', id: 5, tags: { aeroway: 'apron' }, members: [
        { type: 'way', ref: 9, role: 'outer', geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }] },
        { type: 'way', ref: 10, role: 'inner', geometry: [{ lat: 0.1, lon: 0.1 }, { lat: 0.1, lon: 0.2 }] },
      ] },
    ],
    }), { status: 200 });
  };
  try {
    const snapshot = await fetchOsmAerodrome('KSFO');
    assert.deepEqual(snapshot.dataset.features.map(feature => feature.geometryType), ['LineString', 'Polygon', 'Point', 'Point', 'GeometryCollection']);
    assert.deepEqual(snapshot.dataset.features.map(osmCandidateClass), ['RunwayElement', 'ApronElement', undefined, 'WindDirectionIndicator', undefined]);
    const holding = snapshot.dataset.features[2];
    assert.equal(osmCandidateClass({ ...holding, tags: { ...holding.tags, holding_position: 'runway' } }), 'RunwayHoldingPosition');
    assert.equal(snapshot.dataset.features[0].version, 2);
    assert.equal(snapshot.dataset.features[0].tags.length, undefined);
    assert.equal(snapshot.dataset.elevationMeters, null);
    assert.equal(snapshot.dataset.iata, '');
    assert.equal(snapshot.osmTimestamp, '2024-01-01T00:00:00Z');
    assert.equal(snapshot.dataset.features[4].members?.[1].role, 'inner');
    assert.deepEqual(snapshot.boundary, { osmType: 'way', osmId: 100 });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('requires a choice for ambiguous airports and refuses a node-only boundary', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ elements: [
    { type: 'node', id: 1, lat: 1, lon: 2, tags: { name: 'Airport' } },
    { type: 'way', id: 2, center: { lat: 1, lon: 2 }, tags: { name: 'Airport' } },
  ] }));
  try {
    await assert.rejects(() => fetchOsmAerodrome('TEST'), /Multiple OSM airports/);
    await assert.rejects(() => fetchOsmAerodrome('TEST', {
      type: 'node', id: 1, name: 'Airport', center: [1, 2],
    }), /no mapped boundary/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
