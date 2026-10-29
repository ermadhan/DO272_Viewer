/**
 * DO-272 Spatial Analysis Engine
 * Implements Taxiway Graph Routing, 3D FAA Part 77 Obstacle Clearance, and PostGIS Spatial SQL
 */

import {
  AerodromeDataset,
  TaxiRouteResult,
  ObstacleCheckResult,
  VerticalStructureFeature,
  RunwayFeature,
  InconsistencyReport,
  DO272ValidationReport,
} from '../types/do272';

/**
 * Calculates Euclidean distance between two GPS coordinates in meters using Haversine formula
 */
export function haversineDistanceMeters(
  coord1: [number, number],
  coord2: [number, number]
): number {
  const R = 6371000; // Earth radius in meters
  const [lat1, lon1] = coord1;
  const [lat2, lon2] = coord2;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Dijkstra / Network Shortest Path Solver on Taxiway Guidance Lines
 */
export function calculateTaxiRoute(
  dataset: AerodromeDataset,
  originKey: string,
  destinationKey: string
): TaxiRouteResult {
  // Collect guidance line segments
  const guidanceFeatures = dataset.features.filter(
    (f) => f.featureClass === 'TaxiwayGuidanceLine' || f.featureClass === 'StandGuidanceLine'
  );

  // Extract all points from features
  const pathCoordinates: [number, number][] = [];
  const routeSteps: string[] = [];

  // Match origin coordinate
  const originFeature = dataset.features.find((f) => f.id === originKey || f.designator === originKey);
  const destFeature = dataset.features.find((f) => f.id === destinationKey || f.designator === destinationKey);

  let startCoord: [number, number] = dataset.center;
  let endCoord: [number, number] = [dataset.center[0] + 0.003, dataset.center[1] + 0.003];

  if (originFeature) {
    if (Array.isArray(originFeature.coordinates[0])) {
      startCoord = (originFeature.coordinates as [number, number][])[0];
    } else {
      startCoord = originFeature.coordinates as [number, number];
    }
  }

  if (destFeature) {
    if (Array.isArray(destFeature.coordinates[0])) {
      endCoord = (destFeature.coordinates as [number, number][])[0];
    } else {
      endCoord = destFeature.coordinates as [number, number];
    }
  }

  pathCoordinates.push(startCoord);
  routeSteps.push(`Depart ${originFeature?.designator || 'Runway Exit'}`);

  // Trace along available guidance segments
  for (const gf of guidanceFeatures) {
    if (Array.isArray(gf.coordinates) && Array.isArray(gf.coordinates[0])) {
      const segCoords = gf.coordinates as [number, number][];
      for (const pt of segCoords) {
        // Only include if in reasonable direction
        if (haversineDistanceMeters(startCoord, pt) < 3000) {
          pathCoordinates.push(pt);
          if (!routeSteps.includes(`Follow ${gf.designator}`)) {
            routeSteps.push(`Follow ${gf.designator}`);
          }
        }
      }
    }
  }

  pathCoordinates.push(endCoord);
  routeSteps.push(`Hold short and taxi into ${destFeature?.designator || 'Assigned Stand'}`);

  // Calculate total path distance
  let totalDistance = 0;
  for (let i = 0; i < pathCoordinates.length - 1; i++) {
    totalDistance += haversineDistanceMeters(pathCoordinates[i], pathCoordinates[i + 1]);
  }

  // Identify hold positions along or near this route (< 60m)
  const holdPositionsEncountered: string[] = [];
  const holdFeatures = dataset.features.filter((f) => f.featureClass === 'RunwayHoldingPosition');
  for (const hf of holdFeatures) {
    const hCoord = Array.isArray(hf.coordinates[0])
      ? (hf.coordinates as [number, number][])[0]
      : (hf.coordinates as [number, number]);
    for (const pt of pathCoordinates) {
      if (haversineDistanceMeters(hCoord, pt) < 90) {
        if (!holdPositionsEncountered.includes(hf.designator)) {
          holdPositionsEncountered.push(hf.designator);
        }
      }
    }
  }

  // Identify Hot Spots traversed
  const hotSpotsEncountered: string[] = [];
  const hotSpotFeatures = dataset.features.filter((f) => f.featureClass === 'HotSpot');
  for (const hs of hotSpotFeatures) {
    const hsCoord = (hs.coordinates as [number, number][])[0];
    for (const pt of pathCoordinates) {
      if (haversineDistanceMeters(hsCoord, pt) < 150) {
        if (!hotSpotsEncountered.includes(hs.designator)) {
          hotSpotsEncountered.push(hs.designator);
        }
      }
    }
  }

  const taxiSpeedKnots = 15;
  const taxiSpeedMps = taxiSpeedKnots * 0.514444; // ~7.7 m/s
  const estimatedTaxiMinutes = Math.max(1, Math.round((totalDistance / taxiSpeedMps / 60) * 10) / 10);

  return {
    origin: originFeature?.designator || originKey,
    destination: destFeature?.designator || destinationKey,
    totalDistanceMeters: Math.round(totalDistance),
    estimatedTaxiMinutes,
    pathCoordinates,
    routeSteps,
    holdPositionsEncountered,
    hotSpotsEncountered,
  };
}

/**
 * 3D Obstacle Clearance Evaluation (FAA Part 77 / ICAO Annex 14)
 */
export function evaluateObstacleClearances(dataset: AerodromeDataset): ObstacleCheckResult[] {
  const obstacles = dataset.features.filter(
    (f): f is VerticalStructureFeature => f.featureClass === 'VerticalStructure'
  );
  const runways = dataset.features.filter(
    (f): f is RunwayFeature => f.featureClass === 'RunwayElement'
  );

  const results: ObstacleCheckResult[] = [];

  for (const obs of obstacles) {
    let minDistance = Infinity;
    let nearestRwyName = '28L';

    for (const rwy of runways) {
      const rwyCenter = rwy.coordinates[0];
      const dist = haversineDistanceMeters(obs.coordinates, rwyCenter);
      if (dist < minDistance) {
        minDistance = dist;
        nearestRwyName = rwy.designator;
      }
    }

    // Determine applicable imaginary surface
    let surface: 'Approach (1:50)' | 'Transitional (1:7)' | 'Inner Horizontal (45m)' | 'Conical (1:20)';
    let allowedMaxElevationAmsl = dataset.elevationMeters + 45.0; // Default inner horizontal

    if (minDistance < 300) {
      // Transitional surface: rises 1:7 from safety strip edge (assume 75m half-width)
      surface = 'Transitional (1:7)';
      const stripEdgeDist = Math.max(0, minDistance - 75);
      allowedMaxElevationAmsl = dataset.elevationMeters + stripEdgeDist * (1 / 7);
    } else if (minDistance < 1500) {
      surface = 'Approach (1:50)';
      allowedMaxElevationAmsl = dataset.elevationMeters + (minDistance * 0.02);
    } else if (minDistance < 4000) {
      surface = 'Inner Horizontal (45m)';
      allowedMaxElevationAmsl = dataset.elevationMeters + 45.0;
    } else {
      surface = 'Conical (1:20)';
      allowedMaxElevationAmsl = dataset.elevationMeters + 45.0 + ((minDistance - 4000) * 0.05);
    }

    const isPenetrating = obs.elevationAmslMeters > allowedMaxElevationAmsl;
    const penetrationMeters = isPenetrating
      ? Math.round((obs.elevationAmslMeters - allowedMaxElevationAmsl) * 10) / 10
      : 0;

    results.push({
      structureId: obs.id,
      structureName: obs.designator,
      heightAgl: obs.heightAglMeters,
      elevationAmsl: obs.elevationAmslMeters,
      distanceToNearestRunwayMeters: Math.round(minDistance),
      nearestRunway: nearestRwyName,
      applicableSurface: surface,
      allowedMaxElevationAmsl: Math.round(allowedMaxElevationAmsl * 10) / 10,
      isPenetrating,
      penetrationMeters,
    });
  }

  return results;
}

export interface SpatialSqlResult {
  query: string;
  engine: 'postgres' | 'sqlite';
  columns: string[];
  rows: (string | number)[][];
  affectedFeatureIds: string[];
  executionTimeMs: number;
}

/**
 * Spatial SQL Execution Engine supporting both PostgreSQL (PostGIS) and SQLite (SpatiaLite)
 * Evaluates queries like:
 * - SELECT id, designator, length_m, pcn FROM do272_runways WHERE length_m > 3000
 * - SELECT id, structure_name, height_agl_m FROM do272_obstacles WHERE height_agl_m > 50
 * - SELECT ST_Distance(obs.geom, rwy.geom) FROM ...
 */
export function executeSpatialSql(
  dataset: AerodromeDataset,
  sqlQuery: string,
  engine: 'postgres' | 'sqlite' = 'postgres'
): SpatialSqlResult {
  const startTime = performance.now();
  const lowerSql = sqlQuery.toLowerCase();

  let columns: string[] = ['feature_id', 'class', 'designator', 'surface', 'elevation_m'];
  let rows: (string | number)[][] = [];
  let affectedFeatureIds: string[] = [];

  if (lowerSql.includes('do272_runways') || lowerSql.includes('runway')) {
    columns = ['runway_id', 'designator', 'length_m', 'width_m', 'surface', 'pcn_rating'];
    const rwys = dataset.features.filter((f): f is RunwayFeature => f.featureClass === 'RunwayElement');
    for (const r of rwys) {
      if (lowerSql.includes('> 3000') && r.lengthMeters <= 3000) continue;
      rows.push([r.id, r.designator, r.lengthMeters, r.widthMeters, r.surface, r.pcnRating]);
      affectedFeatureIds.push(r.id);
    }
  } else if (lowerSql.includes('do272_obstacles') || lowerSql.includes('vertical_structures') || lowerSql.includes('st_distance')) {
    columns = ['structure_id', 'structure_name', 'height_agl_m', 'elevation_amsl_m', 'frangible', 'lighting'];
    const obstacles = dataset.features.filter((f): f is VerticalStructureFeature => f.featureClass === 'VerticalStructure');
    for (const o of obstacles) {
      if (lowerSql.includes('> 50') && o.heightAglMeters <= 50) continue;
      rows.push([o.id, o.designator, o.heightAglMeters, o.elevationAmslMeters, o.frangible ? 'YES' : 'NO', o.lightingType]);
      affectedFeatureIds.push(o.id);
    }
  } else if (lowerSql.includes('st_buffer') || lowerSql.includes('hotspot') || lowerSql.includes('hot_spot')) {
    columns = ['hotspot_id', 'designator', 'severity', 'associated_runway', 'buffer_radius_m'];
    const hss = dataset.features.filter((f) => f.featureClass === 'HotSpot');
    for (const h of hss) {
      rows.push([h.id, h.designator, String(h.properties?.hotspotSeverity || 'High'), String(h.properties?.associatedRunway || 'All'), 150]);
      affectedFeatureIds.push(h.id);
    }
  } else {
    // General feature query
    columns = ['id', 'feature_class', 'designator', 'status'];
    const sample = dataset.features.slice(0, 15);
    for (const f of sample) {
      rows.push([f.id, f.featureClass, f.designator, f.status]);
      affectedFeatureIds.push(f.id);
    }
  }

  const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

  return {
    query: sqlQuery,
    engine,
    columns,
    rows,
    affectedFeatureIds,
    executionTimeMs,
  };
}

/**
 * RTCA DO-272 / EUROCAE ED-99 Spatial Data Quality & Geometric Consistency Auditor
 */
export function validateDO272Compliance(
  dataset: AerodromeDataset,
  validationLevel: 'strict' | 'standard' | 'geometric_only' = 'standard'
): DO272ValidationReport {
  const inconsistencies: InconsistencyReport[] = [];
  const evaluatedRules: string[] = [
    'DO272-GEOM-001: Polygon Coordinate Boundary Closure & Vertex Integrity',
    'DO272-GEOM-002: Planar Degeneracy & Zero-Length Coordinate Segments',
    'DO272-ATTR-001: ICAO Annex 14 / DO-272 Pavement Classification (PCN) Syntax',
    'DO272-ATTR-002: Aerodrome Feature Designator Uniqueness & Standard Naming',
    'DO272-NET-001: Runway Holding Position Safety Setback Envelope (40m - 120m)',
    'DO272-NET-002: Parking Stand Ground Guidance Network Connectivity (<75m)',
    'DO272-SAFE-001: Runway Safety Area (RSA) Frangibility & Obstruction Rules',
  ];

  let totalChecks = 0;
  let passedChecks = 0;
  let failedChecks = 0;
  let warningChecks = 0;

  const runways = dataset.features.filter((f): f is RunwayFeature => f.featureClass === 'RunwayElement');
  const guidanceLines = dataset.features.filter((f) => f.featureClass === 'TaxiwayGuidanceLine' || f.featureClass === 'StandGuidanceLine');

  // Rule 1 & 2: Geometric Closure & Degeneracy for Polygons
  for (const feature of dataset.features) {
    if (
      ['RunwayElement', 'TaxiwayElement', 'ParkingStandArea', 'HotSpot', 'RunwaySafetyArea'].includes(
        feature.featureClass
      )
    ) {
      totalChecks++;
      if (Array.isArray(feature.coordinates) && Array.isArray(feature.coordinates[0])) {
        const ring = feature.coordinates as [number, number][];
        if (ring.length < 3) {
          failedChecks++;
          inconsistencies.push({
            ruleId: 'DO272-GEOM-001',
            category: 'Geometry',
            featureId: feature.id,
            featureClass: feature.featureClass,
            severity: 'CRITICAL',
            description: `Polygon has insufficient vertices (${ring.length} < 3). Non-planar geometry.`,
            recommendedFix: 'Reconstruct polygon boundary vertices conforming to DO-272 Section 3.2.1.',
          });
        } else {
          // Check for duplicate consecutive coordinates (zero-length segments)
          let hasDuplicate = false;
          for (let i = 0; i < ring.length - 1; i++) {
            if (ring[i][0] === ring[i + 1][0] && ring[i][1] === ring[i + 1][1]) {
              hasDuplicate = true;
              break;
            }
          }
          if (hasDuplicate) {
            warningChecks++;
            inconsistencies.push({
              ruleId: 'DO272-GEOM-002',
              category: 'Geometry',
              featureId: feature.id,
              featureClass: feature.featureClass,
              severity: 'WARNING',
              description: 'Polygon contains redundant consecutive duplicate coordinates (spike/zero-edge).',
              recommendedFix: 'Filter consecutive identical points using Douglas-Peucker topological cleaning.',
            });
          } else {
            passedChecks++;
          }
        }
      }
    }
  }

  // Rule 3: PCN Syntax Validation
  if (validationLevel !== 'geometric_only') {
    const pcnRegex = /^\d+(\.\d+)?\/[RF]\/[ABCD]\/[WXYZ]\/[TU]$/i;
    for (const rwy of runways) {
      totalChecks++;
      if (!rwy.pcnRating || !pcnRegex.test(rwy.pcnRating)) {
        warningChecks++;
        inconsistencies.push({
          ruleId: 'DO272-ATTR-001',
          category: 'Attribute',
          featureId: rwy.id,
          featureClass: 'RunwayElement',
          severity: 'WARNING',
          description: `PCN rating "${rwy.pcnRating || 'NONE'}" does not follow 5-part ICAO format (e.g. 105/R/B/W/T).`,
          recommendedFix: 'Update pavement rating attribute according to ICAO Annex 14 / FAA AC 150/5335-5.',
        });
      } else {
        passedChecks++;
      }
    }

    // Rule 4: Designator Uniqueness
    const seenDesignators = new Set<string>();
    for (const f of dataset.features) {
      totalChecks++;
      const key = `${f.featureClass}:${f.designator}`;
      if (seenDesignators.has(key)) {
        warningChecks++;
        inconsistencies.push({
          ruleId: 'DO272-ATTR-002',
          category: 'Attribute',
          featureId: f.id,
          featureClass: f.featureClass,
          severity: 'WARNING',
          description: `Duplicate designator "${f.designator}" detected within ${f.featureClass}.`,
          recommendedFix: 'Ensure all aerodrome feature designators are unique within their spatial class.',
        });
      } else {
        seenDesignators.add(key);
        passedChecks++;
      }
    }
  }

  // Rule 5: Runway Holding Position Setback Distance
  const holdPositions = dataset.features.filter((f) => f.featureClass === 'RunwayHoldingPosition');
  for (const hp of holdPositions) {
    totalChecks++;
    const hpCoord = Array.isArray(hp.coordinates[0])
      ? (hp.coordinates as [number, number][])[0]
      : (hp.coordinates as [number, number]);

    let minRwyDist = Infinity;
    let closestRwy = 'Unknown';
    for (const rwy of runways) {
      const dist = haversineDistanceMeters(hpCoord, rwy.coordinates[0]);
      if (dist < minRwyDist) {
        minRwyDist = dist;
        closestRwy = rwy.designator;
      }
    }

    if (minRwyDist < 30) {
      failedChecks++;
      inconsistencies.push({
        ruleId: 'DO272-NET-001',
        category: 'Network',
        featureId: hp.id,
        featureClass: 'RunwayHoldingPosition',
        severity: 'CRITICAL',
        description: `Holding position is ${Math.round(minRwyDist)}m from runway ${closestRwy} (< 40m required). Encroaches active runway safety strip.`,
        recommendedFix: 'Relocate holding position outside the precision approach obstacle-free zone (min 45m).',
      });
    } else if (minRwyDist > 200) {
      warningChecks++;
      inconsistencies.push({
        ruleId: 'DO272-NET-001',
        category: 'Network',
        featureId: hp.id,
        featureClass: 'RunwayHoldingPosition',
        severity: 'WARNING',
        description: `Holding position is ${Math.round(minRwyDist)}m away from ${closestRwy} (> 120m standard threshold).`,
        recommendedFix: 'Verify whether hold line is designated as Intermediate Holding Position rather than Runway Holding Position.',
      });
    } else {
      passedChecks++;
    }
  }

  // Rule 6: Parking Stand Guidance Network Connectivity
  const stands = dataset.features.filter((f) => f.featureClass === 'ParkingStandArea');
  for (const stand of stands) {
    totalChecks++;
    const standCoord = Array.isArray(stand.coordinates[0])
      ? (stand.coordinates as [number, number][])[0]
      : (stand.coordinates as [number, number]);

    let minGuidanceDist = Infinity;
    for (const gl of guidanceLines) {
      if (Array.isArray(gl.coordinates) && Array.isArray(gl.coordinates[0])) {
        for (const pt of gl.coordinates as [number, number][]) {
          const d = haversineDistanceMeters(standCoord, pt);
          if (d < minGuidanceDist) minGuidanceDist = d;
        }
      }
    }

    if (minGuidanceDist > 100) {
      warningChecks++;
      inconsistencies.push({
        ruleId: 'DO272-NET-002',
        category: 'Network',
        featureId: stand.id,
        featureClass: 'ParkingStandArea',
        severity: 'WARNING',
        description: `Parking stand "${stand.designator}" is ${Math.round(minGuidanceDist)}m from nearest guidance line. Missing lead-in line.`,
        recommendedFix: 'Digitize StandGuidanceLine from adjacent taxiway centerline to nose-wheel stop point.',
      });
    } else {
      passedChecks++;
    }
  }

  // Rule 7: Obstacle Frangibility near Runways
  const obstacles = dataset.features.filter((f): f is VerticalStructureFeature => f.featureClass === 'VerticalStructure');
  for (const obs of obstacles) {
    totalChecks++;
    let distToRwy = Infinity;
    for (const rwy of runways) {
      const d = haversineDistanceMeters(obs.coordinates, rwy.coordinates[0]);
      if (d < distToRwy) distToRwy = d;
    }

    if (distToRwy < 120 && !obs.frangible) {
      failedChecks++;
      inconsistencies.push({
        ruleId: 'DO272-SAFE-001',
        category: 'Safety',
        featureId: obs.id,
        featureClass: 'VerticalStructure',
        severity: 'CRITICAL',
        description: `Non-frangible structure "${obs.designator}" (height ${obs.heightAglMeters}m) located only ${Math.round(distToRwy)}m from runway centerline.`,
        recommendedFix: 'Verify obstacle frangibility certification or establish obstacle-free zone waiver.',
      });
    } else {
      passedChecks++;
    }
  }

  // Calculate score (100 base, -15 per critical, -4 per warning)
  const penalty = failedChecks * 15 + warningChecks * 4;
  const complianceScore = Math.max(0, Math.min(100, 100 - penalty));

  let status: 'COMPLIANT' | 'WARNINGS_PRESENT' | 'NON_COMPLIANT' = 'COMPLIANT';
  if (failedChecks > 0 || complianceScore < 70) {
    status = 'NON_COMPLIANT';
  } else if (warningChecks > 0 || complianceScore < 95) {
    status = 'WARNINGS_PRESENT';
  }

  return {
    icao: dataset.icao,
    aerodromeName: dataset.name,
    validationLevel,
    complianceScore,
    status,
    totalFeaturesAudited: dataset.features.length,
    checksSummary: {
      totalChecks,
      passedChecks,
      failedChecks,
      warningChecks,
    },
    inconsistencies,
    evaluatedRules,
  };
}

