/**
 * RTCA DO-272 / EUROCAE ED-99 Standards Specification Types
 * User Requirements for Aerodrome Mapping Information (AMDB)
 */

export type DO272FeatureClass =
  // 1. Runway System (10)
  | 'RunwayElement'
  | 'RunwayThreshold'
  | 'RunwayDisplacedThreshold'
  | 'Stopway'
  | 'Clearway'
  | 'RunwayBlastPad'
  | 'RunwayShoulder'
  | 'RunwayIntersection'
  | 'RunwayMarking'
  | 'RunwayCenterlinePoint'
  // 2. Taxiway System (10)
  | 'TaxiwayElement'
  | 'TaxiwayGuidanceLine'
  | 'TaxiwayIntersection'
  | 'TaxiwayShoulder'
  | 'RunwayHoldingPosition'
  | 'IntermediateHoldingPosition'
  | 'TaxiwayHoldingPositionLight'
  | 'EnhancedTaxiwayCenterline'
  | 'TaxiwayMarking'
  | 'RapidExitTaxiwayIndicator'
  // 3. Apron & Parking System (9)
  | 'ApronElement'
  | 'ApronShoulder'
  | 'ParkingStandArea'
  | 'ParkingStandLocation'
  | 'StandGuidanceLine'
  | 'PassengerBoardingBridge'
  | 'DeicingArea'
  | 'ServiceRoad'
  | 'PassengerWalkway'
  // 4. Safety & Protection Surfaces (5)
  | 'HotSpot'
  | 'RunwaySafetyArea'
  | 'RunwayEndSafetyArea'
  | 'ObjectFreeArea'
  | 'ObstacleFreeZone'
  | 'LowVisibilityRoutingLine'
  // 5. Vertical Structures & Obstacles (3)
  | 'VerticalStructure'
  | 'VerticalStructureLine'
  | 'VerticalStructurePolygon'
  // 6. Aeronautical Ground Lighting & Visual Aids (4)
  | 'VisualGlideSlopeIndicator'
  | 'WindDirectionIndicator'
  | 'AerodromeReferencePoint'
  | 'AirportBeacon'
  // 7. Radio NAVAIDs & Radar Surveillance (2)
  | 'InstrumentLandingSystemComponent'
  | 'RadarSurveillanceSensor'
  // Legacy / Concrete Sensor Aliases
  | 'LocalizerAntenna'
  | 'GlidePathAntenna'
  | 'DistanceMeasuringEquipment'
  | 'AirportSurveillanceRadar';

export type SurfaceMaterial =
  | 'Asphalt'
  | 'Grooved Asphalt'
  | 'Concrete'
  | 'Bituminous'
  | 'Composite'
  | 'Paved'
  | 'Gravel'
  | 'Grass';

export type ICAOCodeLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export type OperationalStatus = 'Active' | 'Closed' | 'Under Maintenance' | 'Restricted';

export type HoldingCategory = 'CAT I' | 'CAT II' | 'CAT III' | 'Pattern' | 'Tactical';

export interface BaseDO272Feature {
  id: string;
  aerodromeId: string; // e.g. "KSFO"
  featureClass: DO272FeatureClass;
  designator: string; // e.g. "28R", "Alpha", "Gate A1", "HS-1"
  status: OperationalStatus;
  elevationMeters?: number;
  properties?: Record<string, string | number | boolean | undefined>;
}

export interface RunwayFeature extends BaseDO272Feature {
  featureClass:
    | 'RunwayElement'
    | 'RunwayThreshold'
    | 'RunwayDisplacedThreshold'
    | 'Stopway'
    | 'Clearway'
    | 'RunwayBlastPad'
    | 'RunwayShoulder'
    | 'RunwayIntersection'
    | 'RunwayMarking'
    | 'RunwayCenterlinePoint';
  lengthMeters?: number;
  widthMeters?: number;
  trueHeading?: number;
  surface?: SurfaceMaterial;
  pcnRating?: string; // e.g., "112/R/B/W/T"
  ilsCat?: string; // e.g., "CAT IIIb"
  coordinates: [number, number][] | [number, number]; // GeoJSON polygon, line, or point
}

export interface TaxiwayFeature extends BaseDO272Feature {
  featureClass:
    | 'TaxiwayElement'
    | 'TaxiwayGuidanceLine'
    | 'TaxiwayIntersection'
    | 'TaxiwayShoulder'
    | 'RunwayHoldingPosition'
    | 'IntermediateHoldingPosition'
    | 'TaxiwayHoldingPositionLight'
    | 'EnhancedTaxiwayCenterline'
    | 'TaxiwayMarking'
    | 'RapidExitTaxiwayIndicator';
  widthMeters?: number;
  surface?: SurfaceMaterial;
  maxWingspanMeters?: number;
  holdingCategory?: HoldingCategory;
  isReversible?: boolean;
  coordinates: [number, number][] | [number, number]; // LineString or Polygon or Point
}

export interface ParkingStandFeature extends BaseDO272Feature {
  featureClass:
    | 'ApronElement'
    | 'ApronShoulder'
    | 'ParkingStandArea'
    | 'ParkingStandLocation'
    | 'StandGuidanceLine'
    | 'PassengerBoardingBridge'
    | 'DeicingArea'
    | 'ServiceRoad'
    | 'PassengerWalkway';
  standNumber?: string;
  terminal?: string;
  surface?: SurfaceMaterial;
  pcnRating?: string;
  icaoCodeLetter?: ICAOCodeLetter; // Max aircraft size
  hasJetBridge?: boolean;
  coordinates: [number, number][] | [number, number];
}

export interface SafetyAreaFeature extends BaseDO272Feature {
  featureClass:
    | 'HotSpot'
    | 'RunwaySafetyArea'
    | 'RunwayEndSafetyArea'
    | 'ObjectFreeArea'
    | 'ObstacleFreeZone'
    | 'LowVisibilityRoutingLine';
  lengthMeters?: number;
  widthMeters?: number;
  hotspotSeverity?: 'High' | 'Medium' | 'Low';
  hazardDescription?: string;
  associatedRunway?: string;
  coordinates: [number, number][] | [number, number];
}

export interface VerticalStructureFeature extends BaseDO272Feature {
  featureClass: 'VerticalStructure' | 'VerticalStructureLine' | 'VerticalStructurePolygon';
  structureType?:
    | 'Control Tower'
    | 'Passenger Terminal'
    | 'Hangar'
    | 'Radar Dome'
    | 'Antenna Mast'
    | 'Light Pole'
    | 'NAVAID Shelter'
    | 'Construction Crane'
    | 'Perimeter Fence'
    | 'Blast Fence'
    | 'Terminal Building';
  heightAglMeters?: number; // Height Above Ground Level
  elevationAmslMeters?: number; // Elevation Above Mean Sea Level
  frangible?: boolean;
  lightingType?: 'High-Intensity White' | 'Medium Red Strobe' | 'Steady Red' | 'Floodlit' | 'Unlit';
  penetratesPart77?: boolean; // Evaluated dynamically
  clearanceMarginMeters?: number;
  coordinates: [number, number] | [number, number][]; // Point, LineString, or Polygon
}

export interface NAVAIDFeature extends BaseDO272Feature {
  featureClass:
    | 'AerodromeReferencePoint'
    | 'WindDirectionIndicator'
    | 'VisualGlideSlopeIndicator'
    | 'AirportBeacon'
    | 'InstrumentLandingSystemComponent'
    | 'RadarSurveillanceSensor'
    | 'LocalizerAntenna'
    | 'GlidePathAntenna'
    | 'DistanceMeasuringEquipment'
    | 'AirportSurveillanceRadar';
  frequency?: string;
  channel?: string;
  channelSlopeDeg?: number; // e.g. 3.0° for PAPI
  coordinates: [number, number]; // [lat, lng]
}

export type AnyDO272Feature =
  | RunwayFeature
  | TaxiwayFeature
  | ParkingStandFeature
  | SafetyAreaFeature
  | VerticalStructureFeature
  | NAVAIDFeature;

export interface AerodromeDataset {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  center: [number, number]; // [lat, lng]
  elevationMeters: number;
  magneticVariation: string;
  transitionAltitudeFt: number;
  source: 'Curated Hub (DO-272/ED-99)' | 'US FAA Airport GIS 18B' | 'OpenStreetMap Aeroway Ingest';
  features: AnyDO272Feature[];
}

export interface TaxiRouteResult {
  origin: string;
  destination: string;
  totalDistanceMeters: number;
  estimatedTaxiMinutes: number;
  pathCoordinates: [number, number][];
  routeSteps: string[];
  holdPositionsEncountered: string[];
  hotSpotsEncountered: string[];
}

export interface ObstacleCheckResult {
  structureId: string;
  structureName: string;
  heightAgl: number;
  elevationAmsl: number;
  distanceToNearestRunwayMeters: number;
  nearestRunway: string;
  applicableSurface: 'Approach (1:50)' | 'Transitional (1:7)' | 'Inner Horizontal (45m)' | 'Conical (1:20)';
  allowedMaxElevationAmsl: number;
  isPenetrating: boolean;
  penetrationMeters: number;
}

export interface InconsistencyReport {
  ruleId: string;
  category: 'Geometry' | 'Attribute' | 'Network' | 'Safety';
  featureId: string;
  featureClass: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  description: string;
  recommendedFix: string;
}

export interface DO272ValidationReport {
  icao: string;
  aerodromeName: string;
  validationLevel: 'strict' | 'standard' | 'geometric_only';
  complianceScore: number; // 0 to 100
  status: 'COMPLIANT' | 'WARNINGS_PRESENT' | 'NON_COMPLIANT';
  totalFeaturesAudited: number;
  checksSummary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    warningChecks: number;
  };
  inconsistencies: InconsistencyReport[];
  evaluatedRules: string[];
}

