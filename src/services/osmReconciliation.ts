import { AerodromeDataset, AnyDO272Feature, OsmFeature } from '../types/do272';

type Coord = [number, number];
export interface OsmConflict {
  field: string;
  curated: string | number;
  osm: string | number;
}
export interface OsmGroup {
  features: OsmFeature[];
  status: 'matched' | 'unmatched' | 'ambiguous';
  curated?: AnyDO272Feature;
  conflicts: OsmConflict[];
}

function normalizedName(name: string, runway: boolean): string {
  const cleaned = name.toUpperCase().replace(/\s+/g, '').replace(/^RWY/, '');
  if (!runway) return cleaned;
  const parts = cleaned.split('/');
  return parts.length === 2 ? parts.sort().join('/') : cleaned;
}

function coords(value: AnyDO272Feature['coordinates']): Coord[] {
  return typeof value[0] === 'number' ? [value as Coord] : value as Coord[];
}

function xy(point: Coord, latitude: number): Coord {
  return [point[1] * 111320 * Math.cos(latitude * Math.PI / 180), point[0] * 111320];
}

function distance(a: Coord, b: Coord): number {
  const p = xy(a, (a[0] + b[0]) / 2);
  const q = xy(b, (a[0] + b[0]) / 2);
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
}

function connectedAlongLine(a: Coord[], b: Coord[]): boolean {
  const ends = (line: Coord[]) => [[line[0], line[1]], [line[line.length - 1], line[line.length - 2]]];
  return ends(a).some(([p, nextP]) => ends(b).some(([q, nextQ]) => {
    if (distance(p, q) > 3) return false;
    const latitude = (p[0] + q[0]) / 2;
    const [px, py] = xy(p, latitude), [nx, ny] = xy(nextP, latitude);
    const [qx, qy] = xy(q, latitude), [mx, my] = xy(nextQ, latitude);
    const ax = nx - px, ay = ny - py, bx = mx - qx, by = my - qy;
    const magnitude = Math.hypot(ax, ay) * Math.hypot(bx, by);
    return magnitude > 0 && (ax * bx + ay * by) / magnitude <= -0.866;
  }));
}

function pointSegment(p: Coord, a: Coord, b: Coord): number {
  const latitude = p[0];
  const [px, py] = xy(p, latitude);
  const [ax, ay] = xy(a, latitude);
  const [bx, by] = xy(b, latitude);
  const dx = bx - ax, dy = by - ay;
  const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function pointInPolygon(p: Coord, polygon: Coord[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i], [yj, xj] = polygon[j];
    if ((yi > p[0]) !== (yj > p[0]) &&
        p[1] < (xj - xi) * (p[0] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToFeature(point: Coord, feature: AnyDO272Feature): number {
  const points = coords(feature.coordinates);
  if (!points.length) return Infinity;
  if (points.length === 1) return distance(point, points[0]);
  const polygon = feature.geometryType !== 'LineString' &&
    ['RunwayElement', 'TaxiwayElement', 'ApronElement', 'ParkingStandArea'].includes(feature.featureClass);
  if (polygon && points.length >= 3 && pointInPolygon(point, points)) return 0;
  let minimum = Infinity;
  for (let i = 1; i < points.length; i++) minimum = Math.min(minimum, pointSegment(point, points[i - 1], points[i]));
  if (polygon && points.length >= 3) minimum = Math.min(minimum, pointSegment(point, points[points.length - 1], points[0]));
  return minimum;
}

function samples(feature: OsmFeature): Coord[] {
  if (feature.geometryType === 'GeometryCollection') {
    return (feature.coordinates as Coord[][]).flat();
  }
  const points = coords(feature.coordinates as Coord | Coord[]);
  const result: Coord[] = [...points];
  for (let i = 1; i < points.length; i++) {
    result.push([(points[i - 1][0] + points[i][0]) / 2, (points[i - 1][1] + points[i][1]) / 2]);
  }
  return result;
}

export function osmCandidateClass(feature: OsmFeature): string | undefined {
  if (feature.geometryType === 'GeometryCollection') return undefined;
  switch (feature.aeroway) {
    case 'runway': return 'RunwayElement';
    case 'taxiway': return feature.geometryType === 'LineString' ? 'TaxiwayGuidanceLine' : undefined;
    case 'apron': return feature.geometryType === 'Polygon' ? 'ApronElement' : undefined;
    case 'parking_position': return 'ParkingStandLocation';
    case 'control_tower': return 'VerticalStructure';
    case 'windsock': return 'WindDirectionIndicator';
    case 'holding_position':
      if (feature.tags.holding_position === 'runway') return 'RunwayHoldingPosition';
      if (feature.tags.holding_position === 'intermediate') return 'IntermediateHoldingPosition';
      return undefined;
    default: return undefined;
  }
}

function metric(value: string | undefined): number | undefined {
  if (!value || !/^\s*\d+(?:\.\d+)?\s*(?:m)?\s*$/i.test(value)) return undefined;
  return Number.parseFloat(value);
}

function conflictsFor(group: OsmFeature[], curated: AnyDO272Feature): OsmConflict[] {
  const conflicts: OsmConflict[] = [];
  for (const [field, tag] of [['lengthMeters', 'length'], ['widthMeters', 'width']] as const) {
    const curatedValue = field === 'lengthMeters'
      ? ('lengthMeters' in curated ? curated.lengthMeters : undefined)
      : ('widthMeters' in curated ? curated.widthMeters : undefined);
    const values = [...new Set(group.map(f => metric(f.tags[tag])).filter((v): v is number => v !== undefined))];
    if (typeof curatedValue === 'number') {
      for (const value of values) if (value !== curatedValue) conflicts.push({ field, curated: curatedValue, osm: value });
    }
  }
  if ('pcnRating' in curated && curated.pcnRating) {
    const values = [...new Set(group.map(f => f.tags.pcn).filter(Boolean))];
    for (const value of values) {
      if (value.toUpperCase() !== curated.pcnRating.toUpperCase()) conflicts.push({ field: 'pcnRating', curated: curated.pcnRating, osm: value });
    }
    if ('surface' in curated && curated.surface && ['asphalt', 'concrete'].includes(curated.surface.toLowerCase())) {
      const values = [...new Set(group.map(f => f.tags.surface?.toLowerCase()).filter(v => v === 'asphalt' || v === 'concrete'))];
      for (const value of values) {
        if (value !== curated.surface.toLowerCase()) conflicts.push({ field: 'surface', curated: curated.surface, osm: value });
      }
    }
  }
  return conflicts;
}

export function reconcileOsm(dataset: AerodromeDataset, features: OsmFeature[]): OsmGroup[] {
  const pending = new Set(features.map((_, index) => index));
  const groups: OsmGroup[] = [];
  while (pending.size) {
    const first = pending.values().next().value as number;
    pending.delete(first);
    const group = [features[first]];
    const seed = features[first];
    const name = normalizedName(seed.tags.ref || '', seed.aeroway === 'runway');
    if (name && ['runway', 'taxiway'].includes(seed.aeroway) && seed.geometryType === 'LineString') {
      let grew = true;
      while (grew) {
        grew = false;
        for (const index of pending) {
          const item = features[index];
          if (item.aeroway !== seed.aeroway || item.geometryType !== 'LineString' ||
              normalizedName(item.tags.ref || '', seed.aeroway === 'runway') !== name) continue;
          if (group.some(existing => connectedAlongLine(coords(item.coordinates as Coord[]), coords(existing.coordinates as Coord[])))) {
            group.push(item);
            pending.delete(index);
            grew = true;
          }
        }
      }
    }
    const groupSamples = group.flatMap(samples);
    const candidateClass = osmCandidateClass(seed);
    const compatible = candidateClass === 'ParkingStandLocation'
      ? ['ParkingStandLocation', 'ParkingStandArea'] : candidateClass ? [candidateClass] : [];
    const namedCandidates = name ? dataset.features.filter(curated =>
      compatible.includes(curated.featureClass) &&
      normalizedName(curated.designator, seed.aeroway === 'runway') === name) : [];
    const candidates = namedCandidates.filter(curated => {
      return groupSamples.length > 0 &&
        groupSamples.filter(point => distanceToFeature(point, curated) <= 20).length / groupSamples.length >= 0.95;
    });
    const curated = candidates.length === 1 ? candidates[0] :
      candidates.length === 0 && namedCandidates.length === 1 ? namedCandidates[0] : undefined;
    const geometryConflict = curated && candidates.length === 0
      ? [{ field: 'geometry', curated: 'baseline geometry', osm: 'outside matching tolerance' }]
      : [];
    groups.push({
      features: group,
      status: candidates.length === 1 ? 'matched' :
        namedCandidates.length > 0 ? 'ambiguous' : 'unmatched',
      curated, conflicts: curated ? [...geometryConflict, ...conflictsFor(group, curated)] : [],
    });
  }
  return groups;
}
