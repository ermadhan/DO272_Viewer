import React, { useState } from 'react';
import { X, Search, BookOpen, Layers, CheckCircle2, Shield, Radio, Navigation, Plane } from 'lucide-react';

export interface DO272CatalogueItem {
  id: number;
  featureClass: string;
  subsystem:
    | 'Runway System'
    | 'Taxiway System'
    | 'Apron & Stand System'
    | 'Safety & Protection'
    | 'Vertical Structures'
    | 'Visual Aids & AGL'
    | 'NAVAIDs & Surveillance';
  geometryType: 'Polygon' | 'LineString' | 'Point' | 'MultiPolygon';
  icaoReference: string;
  description: string;
  mandatoryAttributes: string[];
}

export const DO272_43_FEATURE_CATALOGUE: DO272CatalogueItem[] = [
  // 1. RUNWAY SYSTEM (10)
  {
    id: 1,
    featureClass: 'RunwayElement',
    subsystem: 'Runway System',
    geometryType: 'Polygon',
    icaoReference: 'ICAO Annex 14 Vol I, 3.1',
    description: 'A defined rectangular area on a land aerodrome prepared for the landing and take-off of aircraft.',
    mandatoryAttributes: ['id', 'designator', 'lengthMeters', 'widthMeters', 'surface', 'pcnRating'],
  },
  {
    id: 2,
    featureClass: 'RunwayThreshold',
    subsystem: 'Runway System',
    geometryType: 'LineString',
    icaoReference: 'ICAO Annex 14 Vol I, 3.1.7',
    description: 'The beginning of that portion of the runway usable for landing.',
    mandatoryAttributes: ['id', 'designator', 'elevationAmsl', 'displacedMeters', 'lighting'],
  },
  {
    id: 3,
    featureClass: 'RunwayDisplacedThreshold',
    subsystem: 'Runway System',
    geometryType: 'LineString',
    icaoReference: 'ICAO Annex 14 Vol I, 3.1.8',
    description: 'A threshold not located at the physical extremity of a runway extremity.',
    mandatoryAttributes: ['id', 'designator', 'displacementDistanceMeters', 'coordinates'],
  },
  {
    id: 4,
    featureClass: 'Stopway',
    subsystem: 'Runway System',
    geometryType: 'Polygon',
    icaoReference: 'ICAO Annex 14 Vol I, 3.2',
    description: 'A defined rectangular area on the ground prepared as a suitable area in which an aircraft can be stopped in the case of an abandoned take-off.',
    mandatoryAttributes: ['id', 'designator', 'lengthMeters', 'widthMeters', 'pcnRating'],
  },
  {
    id: 5,
    featureClass: 'Clearway',
    subsystem: 'Runway System',
    geometryType: 'Polygon',
    icaoReference: 'ICAO Annex 14 Vol I, 3.3',
    description: 'A defined rectangular area on the ground or water selected or prepared as a suitable area over which an aircraft may make a portion of its initial climb.',
    mandatoryAttributes: ['id', 'designator', 'lengthMeters', 'widthMeters'],
  },
  {
    id: 6,
    featureClass: 'RunwayBlastPad',
    subsystem: 'Runway System',
    geometryType: 'Polygon',
    icaoReference: 'FAA AC 150/5300-13B',
    description: 'An engineered surface adjacent to runway ends to prevent soil erosion from high-velocity engine blast.',
    mandatoryAttributes: ['id', 'designator', 'surface', 'lengthMeters', 'widthMeters'],
  },
  {
    id: 7,
    featureClass: 'RunwayShoulder',
    subsystem: 'Runway System',
    geometryType: 'Polygon',
    icaoReference: 'ICAO Annex 14 Vol I, 3.1.9',
    description: 'An area bordering the runway edge prepared to provide a transition between pavement and ground.',
    mandatoryAttributes: ['id', 'surface', 'widthMeters', 'bearingCapacity'],
  },
  {
    id: 8,
    featureClass: 'RunwayIntersection',
    subsystem: 'Runway System',
    geometryType: 'Polygon',
    icaoReference: 'RTCA DO-272 Section 3.2',
    description: 'Physical overlapping surface geometry where two or more runways cross at grade.',
    mandatoryAttributes: ['id', 'intersectingRunways', 'coordinates'],
  },
  {
    id: 9,
    featureClass: 'RunwayMarking',
    subsystem: 'Runway System',
    geometryType: 'Polygon',
    icaoReference: 'ICAO Annex 14 Vol I, 5.2',
    description: 'Aiming points, touchdown zone markers, threshold bars, and centerline paint elements.',
    mandatoryAttributes: ['id', 'markingType', 'color', 'associatedRunway'],
  },
  {
    id: 10,
    featureClass: 'RunwayCenterlinePoint',
    subsystem: 'Runway System',
    geometryType: 'Point',
    icaoReference: 'DO-272 Section 3.2.1.1',
    description: 'High-precision surveyed point along the mathematical runway centerline axis.',
    mandatoryAttributes: ['id', 'elevationAmsl', 'chainageDistanceMeters'],
  },

  // 2. TAXIWAY SYSTEM (10)
  {
    id: 11,
    featureClass: 'TaxiwayElement',
    subsystem: 'Taxiway System',
    geometryType: 'Polygon',
    icaoReference: 'ICAO Annex 14 Vol I, 3.8',
    description: 'A defined path on a land aerodrome established for the taxiing of aircraft.',
    mandatoryAttributes: ['id', 'designator', 'surface', 'widthMeters', 'maxWingspanMeters'],
  },
  {
    id: 12,
    featureClass: 'TaxiwayGuidanceLine',
    subsystem: 'Taxiway System',
    geometryType: 'LineString',
    icaoReference: 'ICAO Annex 14 Vol I, 5.2.8',
    description: 'A centerline painted trajectory on a taxiway designed to provide ground guidance for aircraft.',
    mandatoryAttributes: ['id', 'designator', 'isReversible', 'maxWingspanMeters', 'centerlineLighting'],
  },
  {
    id: 13,
    featureClass: 'TaxiwayIntersection',
    subsystem: 'Taxiway System',
    geometryType: 'Polygon',
    icaoReference: 'ICAO Annex 14 Vol I, 3.8.14',
    description: 'Pavement junction polygon where two or more taxiway paths converge or intersect.',
    mandatoryAttributes: ['id', 'intersectingTaxiways', 'coordinates'],
  },
  {
    id: 14,
    featureClass: 'TaxiwayShoulder',
    subsystem: 'Taxiway System',
    geometryType: 'Polygon',
    icaoReference: 'ICAO Annex 14 Vol I, 3.8.10',
    description: 'Paved or stabilized lateral shoulder protecting against jet blast erosion and foreign object damage.',
    mandatoryAttributes: ['id', 'surface', 'widthMeters'],
  },
  {
    id: 15,
    featureClass: 'RunwayHoldingPosition',
    subsystem: 'Taxiway System',
    geometryType: 'LineString',
    icaoReference: 'ICAO Annex 14 Vol I, 3.12.1',
    description: 'Mandatory hold line intended to protect a runway, obstacle limitation surface, or ILS/MLS critical area.',
    mandatoryAttributes: ['id', 'designator', 'holdingCategory (CAT I/II/III)', 'stopBarPresent'],
  },
  {
    id: 16,
    featureClass: 'IntermediateHoldingPosition',
    subsystem: 'Taxiway System',
    geometryType: 'LineString',
    icaoReference: 'ICAO Annex 14 Vol I, 3.12.5',
    description: 'A holding position established on a taxiway other than a runway-holding position.',
    mandatoryAttributes: ['id', 'designator', 'coordinates'],
  },
  {
    id: 17,
    featureClass: 'TaxiwayHoldingPositionLight',
    subsystem: 'Taxiway System',
    geometryType: 'Point',
    icaoReference: 'ICAO Annex 14 Vol I, 5.3.19',
    description: 'Controllable stop bar red lights and yellow runway guard lights (wig-wags).',
    mandatoryAttributes: ['id', 'lightType', 'associatedHoldLine'],
  },
  {
    id: 18,
    featureClass: 'EnhancedTaxiwayCenterline',
    subsystem: 'Taxiway System',
    geometryType: 'LineString',
    icaoReference: 'FAA AC 150/5340-1M',
    description: 'Dashed yellow lines parallel to standard centerline warning pilots of an approaching runway.',
    mandatoryAttributes: ['id', 'associatedRunwayHold', 'lengthMeters'],
  },
  {
    id: 19,
    featureClass: 'TaxiwayMarking',
    subsystem: 'Taxiway System',
    geometryType: 'LineString',
    icaoReference: 'ICAO Annex 14 Vol I, 5.2',
    description: 'Surface markings including taxiway edge lines, intermediate hold lines, and surface painted signs.',
    mandatoryAttributes: ['id', 'markingType', 'color'],
  },
  {
    id: 20,
    featureClass: 'RapidExitTaxiwayIndicator',
    subsystem: 'Taxiway System',
    geometryType: 'Point',
    icaoReference: 'ICAO Annex 14 Vol I, 5.3.15',
    description: 'Runway exit indicator lights (RETIL) indicating distance remaining to rapid-exit taxiway turnoff.',
    mandatoryAttributes: ['id', 'exitDesignator', 'distanceToTurnoffMeters'],
  },

  // 3. APRON & STAND SYSTEM (9)
  {
    id: 21,
    featureClass: 'ApronElement',
    subsystem: 'Apron & Stand System',
    geometryType: 'Polygon',
    icaoReference: 'ICAO Annex 14 Vol I, 3.13',
    description: 'A defined area on a land aerodrome intended to accommodate aircraft for loading, refueling, and parking.',
    mandatoryAttributes: ['id', 'surface', 'pcnRating', 'apronType'],
  },
  {
    id: 22,
    featureClass: 'ApronShoulder',
    subsystem: 'Apron & Stand System',
    geometryType: 'Polygon',
    icaoReference: 'ICAO Annex 14 Vol I, 3.13.4',
    description: 'Perimeter non-load bearing pavement surrounding aircraft parking aprons.',
    mandatoryAttributes: ['id', 'surface', 'widthMeters'],
  },
  {
    id: 23,
    featureClass: 'ParkingStandArea',
    subsystem: 'Apron & Stand System',
    geometryType: 'Polygon',
    icaoReference: 'ICAO Annex 14 Vol I, 3.13.6',
    description: 'A designated area on an apron intended to be used for parking an aircraft.',
    mandatoryAttributes: ['id', 'standNumber', 'terminal', 'icaoCodeLetter', 'hasJetBridge'],
  },
  {
    id: 24,
    featureClass: 'ParkingStandLocation',
    subsystem: 'Apron & Stand System',
    geometryType: 'Point',
    icaoReference: 'DO-272 Section 3.4.2',
    description: 'The surveyed geographic stop coordinate for aircraft nose gear parking calibration.',
    mandatoryAttributes: ['id', 'standNumber', 'elevationAmsl', 'vdgsEquipped'],
  },
  {
    id: 25,
    featureClass: 'StandGuidanceLine',
    subsystem: 'Apron & Stand System',
    geometryType: 'LineString',
    icaoReference: 'ICAO Annex 14 Vol I, 5.2.14',
    description: 'Lead-in and lead-out centerline markings guiding aircraft from taxiway into parking stands.',
    mandatoryAttributes: ['id', 'associatedStand', 'maxWingspanMeters'],
  },
  {
    id: 26,
    featureClass: 'PassengerBoardingBridge',
    subsystem: 'Apron & Stand System',
    geometryType: 'LineString',
    icaoReference: 'DO-272 Section 3.4.4',
    description: 'Movable or fixed enclosed telescopic bridge connecting airport terminal gate to aircraft door.',
    mandatoryAttributes: ['id', 'bridgeType', 'associatedStand'],
  },
  {
    id: 27,
    featureClass: 'DeicingArea',
    subsystem: 'Apron & Stand System',
    geometryType: 'Polygon',
    icaoReference: 'ICAO Annex 14 Vol I, 3.15',
    description: 'A specialized facility comprising pads for aircraft de-icing and anti-icing fluid treatment.',
    mandatoryAttributes: ['id', 'padDesignator', 'containmentSystem', 'maxAircraftClass'],
  },
  {
    id: 28,
    featureClass: 'ServiceRoad',
    subsystem: 'Apron & Stand System',
    geometryType: 'LineString',
    icaoReference: 'ICAO Annex 14 Vol I, 3.14',
    description: 'Designated roadway on aerodromes reserved exclusively for ground support vehicles and tugs.',
    mandatoryAttributes: ['id', 'roadName', 'speedLimitKmh', 'widthMeters'],
  },
  {
    id: 29,
    featureClass: 'PassengerWalkway',
    subsystem: 'Apron & Stand System',
    geometryType: 'Polygon',
    icaoReference: 'ICAO Annex 14 Vol I, 5.2.15',
    description: 'Designated, demarcated ground walkway paths across aprons for open-ramp passenger boarding.',
    mandatoryAttributes: ['id', 'terminalAccess', 'safetyMarkings'],
  },

  // 4. SAFETY & PROTECTION SURFACES (5)
  {
    id: 30,
    featureClass: 'HotSpot',
    subsystem: 'Safety & Protection',
    geometryType: 'Polygon',
    icaoReference: 'ICAO Doc 9870 (Manual on Runway Incursion Prevention)',
    description: 'A location on an aerodrome movement area with a history or potential risk of collision or runway incursion.',
    mandatoryAttributes: ['id', 'hotspotId', 'severity', 'hazardDescription', 'associatedRunway'],
  },
  {
    id: 31,
    featureClass: 'RunwaySafetyArea',
    subsystem: 'Safety & Protection',
    geometryType: 'Polygon',
    icaoReference: 'FAA AC 150/5300-13B & ICAO 3.4',
    description: 'A defined surface surrounding the runway prepared to reduce risk of damage to airplanes in an undershoot or overrun.',
    mandatoryAttributes: ['id', 'associatedRunway', 'dimensions', 'emassEquipped'],
  },
  {
    id: 32,
    featureClass: 'RunwayEndSafetyArea',
    subsystem: 'Safety & Protection',
    geometryType: 'Polygon',
    icaoReference: 'ICAO Annex 14 Vol I, 3.5',
    description: 'An area symmetrical about the extended runway centerline intended to reduce risk of damage in undershoot/overrun.',
    mandatoryAttributes: ['id', 'associatedRunway', 'lengthMeters', 'widthMeters'],
  },
  {
    id: 33,
    featureClass: 'ObjectFreeArea',
    subsystem: 'Safety & Protection',
    geometryType: 'Polygon',
    icaoReference: 'FAA AC 150/5300-13B',
    description: 'A ground area centered on runway or taxiway centerline cleared of above-ground objects not frangible by function.',
    mandatoryAttributes: ['id', 'ofaType', 'bufferWidthMeters'],
  },
  {
    id: 34,
    featureClass: 'ObstacleFreeZone',
    subsystem: 'Safety & Protection',
    geometryType: 'Polygon',
    icaoReference: 'ICAO Annex 14 Vol I, 4.2.1',
    description: 'Airspace extending upwards and outwards from runway centerline clear of all obstacles except frangible NAVAIDs.',
    mandatoryAttributes: ['id', 'associatedRunway', 'clearanceAltitudeAmsl'],
  },

  // 5. VERTICAL STRUCTURES & OBSTACLES (3)
  {
    id: 35,
    featureClass: 'VerticalStructure',
    subsystem: 'Vertical Structures',
    geometryType: 'Point',
    icaoReference: 'ICAO Annex 14 Vol I, Chapter 6 & DO-272 Section 3.6',
    description: 'Man-made fixed or mobile object extending above ground (control towers, hangars, radomes, cranes).',
    mandatoryAttributes: ['id', 'designator', 'structureType', 'heightAgl', 'elevationAmsl', 'frangible', 'lightingType'],
  },
  {
    id: 36,
    featureClass: 'VerticalStructureLine',
    subsystem: 'Vertical Structures',
    geometryType: 'LineString',
    icaoReference: 'DO-272 Section 3.6.2',
    description: 'Linear vertical obstacles including aerodrome perimeter security fences, blast fences, and overhead catenary cables.',
    mandatoryAttributes: ['id', 'obstacleType', 'heightAgl', 'catenaryFlag'],
  },
  {
    id: 37,
    featureClass: 'VerticalStructurePolygon',
    subsystem: 'Vertical Structures',
    geometryType: 'Polygon',
    icaoReference: 'DO-272 Section 3.6.3',
    description: 'Planar footprints of major aerodrome vertical obstacles including main passenger terminals, cargo warehouses, and fuel tank farms.',
    mandatoryAttributes: ['id', 'buildingName', 'maxRoofHeightAgl', 'elevationAmsl'],
  },

  // 6. VISUAL AIDS & AERONAUTICAL GROUND LIGHTING (4)
  {
    id: 38,
    featureClass: 'VisualGlideSlopeIndicator',
    subsystem: 'Visual Aids & AGL',
    geometryType: 'Point',
    icaoReference: 'ICAO Annex 14 Vol I, 5.3.5',
    description: 'Precision Approach Path Indicator (PAPI) or VASI light units providing visual descent slope angle cues.',
    mandatoryAttributes: ['id', 'associatedRunway', 'glideSlopeAngleDeg', 'sideOfRunway'],
  },
  {
    id: 39,
    featureClass: 'WindDirectionIndicator',
    subsystem: 'Visual Aids & AGL',
    geometryType: 'Point',
    icaoReference: 'ICAO Annex 14 Vol I, 5.1.1',
    description: 'Illuminated wind cone (windsock) providing surface wind direction and velocity indications.',
    mandatoryAttributes: ['id', 'lightedFlag', 'elevationAmsl'],
  },
  {
    id: 40,
    featureClass: 'AerodromeReferencePoint',
    subsystem: 'Visual Aids & AGL',
    geometryType: 'Point',
    icaoReference: 'ICAO Annex 14 Vol I, 2.2',
    description: 'The designated official geographic location of an aerodrome near its initial geometric center.',
    mandatoryAttributes: ['id', 'icao', 'elevationMeters', 'datumWGS84'],
  },
  {
    id: 41,
    featureClass: 'AirportBeacon',
    subsystem: 'Visual Aids & AGL',
    geometryType: 'Point',
    icaoReference: 'ICAO Annex 14 Vol I, 5.3.3',
    description: 'High-intensity rotating visual identification aerodrome beacon indicating location from the air at night.',
    mandatoryAttributes: ['id', 'colorSequence', 'flashRatePerMin', 'elevationAmsl'],
  },

  // 7. RADIO NAVIGATION & SURVEILLANCE (2)
  {
    id: 42,
    featureClass: 'InstrumentLandingSystemComponent',
    subsystem: 'NAVAIDs & Surveillance',
    geometryType: 'Point',
    icaoReference: 'ICAO Annex 10 Vol I',
    description: 'Precision guidance ground antennas: Localizer (LOC), Glide Path (GP), Marker Beacons, and Collocated DME.',
    mandatoryAttributes: ['id', 'ilsComponentType', 'associatedRunway', 'frequencyMhz', 'channel'],
  },
  {
    id: 43,
    featureClass: 'RadarSurveillanceSensor',
    subsystem: 'NAVAIDs & Surveillance',
    geometryType: 'Point',
    icaoReference: 'ICAO Doc 9924 (Aeronautical Surveillance Manual)',
    description: 'Primary/secondary airport surveillance antennas: ASDE-X Surface Movement Radar (SMR) and Terminal Area Radar (ASR).',
    mandatoryAttributes: ['id', 'radarType', 'frequencyBand', 'antennaHeightAgl'],
  },
];

interface DO272CatalogueModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DO272CatalogueModal: React.FC<DO272CatalogueModalProps> = ({ isOpen, onClose }) => {
  const [selectedSubsystem, setSelectedSubsystem] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  if (!isOpen) return null;

  const subsystems = [
    'All',
    'Runway System',
    'Taxiway System',
    'Apron & Stand System',
    'Safety & Protection',
    'Vertical Structures',
    'Visual Aids & AGL',
    'NAVAIDs & Surveillance',
  ];

  const filteredFeatures = DO272_43_FEATURE_CATALOGUE.filter((f) => {
    const matchesSubsystem = selectedSubsystem === 'All' || f.subsystem === selectedSubsystem;
    const matchesSearch =
      f.featureClass.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.icaoReference.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSubsystem && matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-950 border border-sky-800 flex items-center justify-center text-sky-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white font-mono">
                  RTCA DO-272 / EUROCAE ED-99 Feature Catalogue
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-950 text-sky-300 border border-sky-800">
                  43 Core AMDB Features
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Complete data dictionary, geometry classifications, and ICAO Annex 14 mapping.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 font-mono text-xs shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            {subsystems.map((sub) => (
              <button
                key={sub}
                onClick={() => setSelectedSubsystem(sub)}
                className={`px-2.5 py-1 rounded text-xs transition-colors whitespace-nowrap cursor-pointer ${
                  selectedSubsystem === sub
                    ? 'bg-sky-600 text-white font-bold'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {sub}
              </button>
            ))}
          </div>

          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 43 features..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase text-[11px]">
                <tr>
                  <th className="p-2.5 w-12 text-center">#</th>
                  <th className="p-2.5">Feature Class</th>
                  <th className="p-2.5">Subsystem</th>
                  <th className="p-2.5">Geometry</th>
                  <th className="p-2.5">ICAO Annex 14 Ref</th>
                  <th className="p-2.5">DO-272 Standard Definition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                {filteredFeatures.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-2.5 text-center text-slate-500 font-bold tabular-nums">
                      {f.id}
                    </td>
                    <td className="p-2.5 font-bold text-white whitespace-nowrap">
                      <span className="text-sky-300">{f.featureClass}</span>
                    </td>
                    <td className="p-2.5 text-slate-300 text-[11px] whitespace-nowrap">
                      {f.subsystem}
                    </td>
                    <td className="p-2.5 whitespace-nowrap">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          f.geometryType === 'Polygon'
                            ? 'bg-purple-950 text-purple-300 border border-purple-800'
                            : f.geometryType === 'LineString'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        }`}
                      >
                        {f.geometryType}
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-400 text-[11px] whitespace-nowrap">
                      {f.icaoReference}
                    </td>
                    <td className="p-2.5 text-slate-300 text-[11px] leading-relaxed">
                      {f.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
