import React, { useState, useMemo } from 'react';
import {
  AerodromeDataset,
  AnyDO272Feature,
  DO272FeatureClass,
} from '../types/do272';
import { DO272_43_FEATURE_CATALOGUE } from './DO272CatalogueModal';
import { DatabaseEngine } from '../services/databaseSchema';
import {
  Search,
  Filter,
  Layers,
  MapPin,
  Eye,
  Download,
  Database,
  CheckCircle2,
  AlertTriangle,
  Compass,
  ArrowRight,
  Code,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';

interface DO272FeatureExplorerProps {
  dataset: AerodromeDataset;
  databaseEngine: DatabaseEngine;
  onSelectFeature: (feature: AnyDO272Feature | null) => void;
  onNavigateToMap: (feature?: AnyDO272Feature) => void;
  selectedFeature: AnyDO272Feature | null;
}

type GeometryFilterType = 'ALL' | 'Polygon' | 'LineString' | 'Point';

type SubsystemType =
  | 'All'
  | 'Runway System'
  | 'Taxiway System'
  | 'Apron & Stand System'
  | 'Safety & Protection'
  | 'Vertical Structures'
  | 'Visual Aids & AGL'
  | 'NAVAIDs & Surveillance';

const SUBSYSTEM_LIST: SubsystemType[] = [
  'All',
  'Runway System',
  'Taxiway System',
  'Apron & Stand System',
  'Safety & Protection',
  'Vertical Structures',
  'Visual Aids & AGL',
  'NAVAIDs & Surveillance',
];

// Helper to determine subsystem of an existing feature
export function getFeatureSubsystem(featureClass: string): SubsystemType {
  const item = DO272_43_FEATURE_CATALOGUE.find((c) => c.featureClass === featureClass);
  if (item) return item.subsystem;

  if (featureClass.startsWith('Runway') || ['Stopway', 'Clearway'].includes(featureClass)) {
    return 'Runway System';
  }
  if (
    featureClass.startsWith('Taxiway') ||
    featureClass.includes('Holding') ||
    featureClass.includes('Enhanced')
  ) {
    return 'Taxiway System';
  }
  if (
    featureClass.startsWith('Apron') ||
    featureClass.startsWith('Parking') ||
    featureClass.startsWith('Stand') ||
    ['PassengerBoardingBridge', 'DeicingArea', 'ServiceRoad', 'PassengerWalkway'].includes(
      featureClass
    )
  ) {
    return 'Apron & Stand System';
  }
  if (
    ['HotSpot', 'RunwaySafetyArea', 'RunwayEndSafetyArea', 'ObjectFreeArea', 'ObstacleFreeZone'].includes(
      featureClass
    )
  ) {
    return 'Safety & Protection';
  }
  if (featureClass.startsWith('VerticalStructure')) {
    return 'Vertical Structures';
  }
  if (['VisualGlideSlopeIndicator', 'WindDirectionIndicator', 'AerodromeReferencePoint', 'AirportBeacon'].includes(featureClass)) {
    return 'Visual Aids & AGL';
  }
  return 'NAVAIDs & Surveillance';
}

// Helper to determine geometry type of an existing feature
export function getFeatureGeometryType(feat: AnyDO272Feature): 'Polygon' | 'LineString' | 'Point' {
  if (!Array.isArray(feat.coordinates)) return 'Point';
  if (typeof feat.coordinates[0] === 'number') return 'Point';
  if (Array.isArray(feat.coordinates[0])) {
    const coords = feat.coordinates as [number, number][];
    if (
      coords.length >= 3 &&
      coords[0][0] === coords[coords.length - 1][0] &&
      coords[0][1] === coords[coords.length - 1][1]
    ) {
      return 'Polygon';
    }
    // Check feature class conventions
    if (
      [
        'RunwayElement',
        'TaxiwayElement',
        'ParkingStandArea',
        'ApronElement',
        'DeicingArea',
        'HotSpot',
        'RunwaySafetyArea',
        'RunwayEndSafetyArea',
        'ObjectFreeArea',
        'ObstacleFreeZone',
        'VerticalStructurePolygon',
      ].includes(feat.featureClass)
    ) {
      return 'Polygon';
    }
    return 'LineString';
  }
  return 'Point';
}

export const DO272FeatureExplorer: React.FC<DO272FeatureExplorerProps> = ({
  dataset,
  databaseEngine,
  onSelectFeature,
  onNavigateToMap,
  selectedFeature,
}) => {
  // Filters
  const [selectedSubsystem, setSelectedSubsystem] = useState<SubsystemType>('All');
  const [selectedFeatureClass, setSelectedFeatureClass] = useState<string>('ALL');
  const [geometryFilter, setGeometryFilter] = useState<GeometryFilterType>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dataScope, setDataScope] = useState<'loaded' | 'catalogue'>('loaded');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Available classes in current dataset
  const availableClassesInDataset = useMemo(() => {
    const set = new Set<string>();
    dataset.features.forEach((f) => set.add(f.featureClass));
    return Array.from(set).sort();
  }, [dataset.features]);

  // Subsystem counts in current dataset
  const subsystemCounts = useMemo(() => {
    const counts: Record<string, number> = { All: dataset.features.length };
    SUBSYSTEM_LIST.forEach((s) => {
      if (s !== 'All') counts[s] = 0;
    });

    dataset.features.forEach((f) => {
      const sub = getFeatureSubsystem(f.featureClass);
      counts[sub] = (counts[sub] || 0) + 1;
    });
    return counts;
  }, [dataset.features]);

  // Filtered dataset features
  const filteredFeatures = useMemo(() => {
    return dataset.features.filter((feat) => {
      const sub = getFeatureSubsystem(feat.featureClass);
      const geom = getFeatureGeometryType(feat);

      if (selectedSubsystem !== 'All' && sub !== selectedSubsystem) return false;
      if (selectedFeatureClass !== 'ALL' && feat.featureClass !== selectedFeatureClass) return false;
      if (geometryFilter !== 'ALL' && geom !== geometryFilter) return false;
      if (statusFilter !== 'ALL' && feat.status !== statusFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesDesignator = feat.designator.toLowerCase().includes(q);
        const matchesId = feat.id.toLowerCase().includes(q);
        const matchesClass = feat.featureClass.toLowerCase().includes(q);
        const matchesProps = feat.properties
          ? JSON.stringify(feat.properties).toLowerCase().includes(q)
          : false;
        if (!matchesDesignator && !matchesId && !matchesClass && !matchesProps) return false;
      }
      return true;
    });
  }, [
    dataset.features,
    selectedSubsystem,
    selectedFeatureClass,
    geometryFilter,
    statusFilter,
    searchQuery,
  ]);

  // Filtered DO-272 43 Standard Catalog items
  const filteredCatalog = useMemo(() => {
    return DO272_43_FEATURE_CATALOGUE.filter((item) => {
      if (selectedSubsystem !== 'All' && item.subsystem !== selectedSubsystem) return false;
      if (selectedFeatureClass !== 'ALL' && item.featureClass !== selectedFeatureClass) return false;
      if (geometryFilter !== 'ALL' && item.geometryType !== geometryFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesClass = item.featureClass.toLowerCase().includes(q);
        const matchesDesc = item.description.toLowerCase().includes(q);
        const matchesIcao = item.icaoReference.toLowerCase().includes(q);
        if (!matchesClass && !matchesDesc && !matchesIcao) return false;
      }
      return true;
    });
  }, [selectedSubsystem, selectedFeatureClass, geometryFilter, searchQuery]);

  // Export current filtered features as GeoJSON
  const handleExportFilteredGeoJson = () => {
    const geojson = {
      type: 'FeatureCollection',
      aerodrome: dataset.icao,
      name: dataset.name,
      features: filteredFeatures.map((f) => ({
        type: 'Feature',
        id: f.id,
        geometry: {
          type:
            getFeatureGeometryType(f) === 'Polygon'
              ? 'Polygon'
              : getFeatureGeometryType(f) === 'LineString'
              ? 'LineString'
              : 'Point',
          coordinates:
            getFeatureGeometryType(f) === 'Point'
              ? [f.coordinates[1], f.coordinates[0]]
              : getFeatureGeometryType(f) === 'Polygon'
              ? [(f.coordinates as [number, number][]).map(([lat, lng]) => [lng, lat])]
              : (f.coordinates as [number, number][]).map(([lat, lng]) => [lng, lat]),
        },
        properties: {
          featureClass: f.featureClass,
          designator: f.designator,
          status: f.status,
          subsystem: getFeatureSubsystem(f.featureClass),
          ...f.properties,
        },
      })),
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dataset.icao}_DO272_${selectedSubsystem.replace(/\s+/g, '_')}_features.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-slate-100 overflow-hidden font-mono">
      {/* 1. Header Toolbar with Filter Metrics */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 shrink-0 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-950 border border-sky-800 flex items-center justify-center text-sky-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-tight">
                DO-272 Aeronautical Features Explorer
              </h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-950 text-sky-300 border border-sky-800">
                {dataset.icao} · {dataset.name}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Comprehensive multi-criteria filtering across all RTCA DO-272 / ED-99 aeronautical feature classes.
            </p>
          </div>
        </div>

        {/* Action Controls & Database Dialect Badge */}
        <div className="flex items-center gap-2.5">
          <div className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">Target Schema:</span>
            <span className={databaseEngine === 'postgres' ? 'text-emerald-400 font-bold' : 'text-sky-400 font-bold'}>
              {databaseEngine === 'postgres' ? 'PostgreSQL (PostGIS)' : 'SQLite (SpatiaLite)'}
            </span>
          </div>

          <button
            onClick={handleExportFilteredGeoJson}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg border border-slate-700 text-xs transition-colors cursor-pointer"
            title="Export currently filtered DO-272 features as GeoJSON"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Export GeoJSON ({filteredFeatures.length})</span>
          </button>
        </div>
      </div>

      {/* 2. Subsystem Navigation Tabs */}
      <div className="bg-slate-950 border-b border-slate-800 px-4 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0">
        <span className="text-[11px] text-slate-500 uppercase font-bold mr-2 tracking-wider">
          Subsystems:
        </span>
        {SUBSYSTEM_LIST.map((sub) => {
          const count = subsystemCounts[sub] || 0;
          const isSelected = selectedSubsystem === sub;
          return (
            <button
              key={sub}
              onClick={() => setSelectedSubsystem(sub)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap cursor-pointer ${
                isSelected
                  ? 'bg-sky-600 text-white font-bold shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <span>{sub}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold tabular-nums ${
                  isSelected ? 'bg-sky-900/80 text-sky-100' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {dataScope === 'loaded'
                  ? count
                  : sub === 'All'
                  ? 43
                  : DO272_43_FEATURE_CATALOGUE.filter((c) => c.subsystem === sub).length}
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. Multi-Criteria Filter Controls Ribbon */}
      <div className="bg-slate-900/70 border-b border-slate-800 p-3 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          {/* Data Scope Toggle */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setDataScope('loaded')}
              className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                dataScope === 'loaded'
                  ? 'bg-sky-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Active Hub ({dataset.features.length})
            </button>
            <button
              onClick={() => setDataScope('catalogue')}
              className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                dataScope === 'catalogue'
                  ? 'bg-sky-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              DO-272 Standard (43 Classes)
            </button>
          </div>

          {/* Feature Class Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1">
            <span className="text-slate-500 text-[11px] uppercase">Class:</span>
            <select
              value={selectedFeatureClass}
              onChange={(e) => setSelectedFeatureClass(e.target.value)}
              className="bg-transparent text-white text-xs focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-white">
                All Feature Classes
              </option>
              {dataScope === 'loaded'
                ? availableClassesInDataset.map((c) => (
                    <option key={c} value={c} className="bg-slate-900 text-white">
                      {c}
                    </option>
                  ))
                : DO272_43_FEATURE_CATALOGUE.map((c) => (
                    <option key={c.featureClass} value={c.featureClass} className="bg-slate-900 text-white">
                      {c.featureClass} ({c.geometryType})
                    </option>
                  ))}
            </select>
          </div>

          {/* Geometry Filter */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
            {(['ALL', 'Polygon', 'LineString', 'Point'] as GeometryFilterType[]).map((geom) => (
              <button
                key={geom}
                onClick={() => setGeometryFilter(geom)}
                className={`px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                  geometryFilter === geom
                    ? 'bg-slate-800 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {geom === 'ALL'
                  ? 'All Geometries'
                  : geom === 'Polygon'
                  ? '⬡ Polygon'
                  : geom === 'LineString'
                  ? '╱ Line'
                  : '• Point'}
              </button>
            ))}
          </div>

          {/* Status Filter (Only when in loaded mode) */}
          {dataScope === 'loaded' && (
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1">
              <span className="text-slate-500 text-[11px] uppercase">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-white text-xs focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-slate-900 text-white">All Statuses</option>
                <option value="Active" className="bg-slate-900 text-emerald-400">Active</option>
                <option value="Restricted" className="bg-slate-900 text-amber-400">Restricted</option>
                <option value="Under Maintenance" className="bg-slate-900 text-rose-400">Under Maintenance</option>
              </select>
            </div>
          )}

          {/* Clear Filters Reset */}
          {(selectedSubsystem !== 'All' ||
            selectedFeatureClass !== 'ALL' ||
            geometryFilter !== 'ALL' ||
            statusFilter !== 'ALL' ||
            searchQuery) && (
            <button
              onClick={() => {
                setSelectedSubsystem('All');
                setSelectedFeatureClass('ALL');
                setGeometryFilter('ALL');
                setStatusFilter('ALL');
                setSearchQuery('');
              }}
              className="text-xs text-rose-400 hover:text-rose-300 underline cursor-pointer ml-1"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Live Search Input */}
        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID, designator, runway, gate..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* 4. Main Body: Features Table or Standard Specification Matrix */}
      <div className="flex-1 overflow-y-auto p-4">
        {dataScope === 'loaded' ? (
          /* ACTIVE AERODROME FEATURES TABLE */
          <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/40">
            <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">
                  Showing {filteredFeatures.length} of {dataset.features.length} Features
                </span>
                <span>in {dataset.icao}</span>
              </div>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  <span>Polygon</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>LineString</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Point</span>
                </span>
              </div>
            </div>

            {filteredFeatures.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Filter className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                <p className="font-bold text-slate-300">No matching DO-272 features found</p>
                <p className="text-xs text-slate-500 mt-1">
                  Try broadening your search term or clearing the active filters.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs divide-y divide-slate-800/80">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[11px]">
                    <tr>
                      <th className="p-3">Status</th>
                      <th className="p-3">Designator</th>
                      <th className="p-3">DO-272 Feature Class</th>
                      <th className="p-3">Subsystem</th>
                      <th className="p-3">Geometry</th>
                      <th className="p-3">Key Attributes</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 bg-slate-900/20">
                    {filteredFeatures.map((feat) => {
                      const geom = getFeatureGeometryType(feat);
                      const sub = getFeatureSubsystem(feat.featureClass);
                      const isSelected = selectedFeature?.id === feat.id;

                      return (
                        <tr
                          key={feat.id}
                          className={`hover:bg-slate-800/50 transition-colors ${
                            isSelected ? 'bg-sky-950/40 border-l-2 border-sky-400' : ''
                          }`}
                        >
                          {/* Status */}
                          <td className="p-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold ${
                                feat.status === 'Active'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : feat.status === 'Restricted'
                                  ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                  : 'bg-rose-950 text-rose-400 border border-rose-800'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  feat.status === 'Active' ? 'bg-emerald-400' : 'bg-amber-400'
                                }`}
                              />
                              {feat.status}
                            </span>
                          </td>

                          {/* Designator & ID */}
                          <td className="p-3">
                            <div className="font-bold text-white text-xs">{feat.designator}</div>
                            <div className="text-[11px] text-slate-500">{feat.id}</div>
                          </td>

                          {/* DO-272 Feature Class */}
                          <td className="p-3 whitespace-nowrap">
                            <span className="text-sky-300 font-bold">{feat.featureClass}</span>
                          </td>

                          {/* Subsystem */}
                          <td className="p-3 whitespace-nowrap text-slate-400 text-[11px]">{sub}</td>

                          {/* Geometry Primitive */}
                          <td className="p-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                geom === 'Polygon'
                                  ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                  : geom === 'LineString'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              }`}
                            >
                              {geom}
                            </span>
                          </td>

                          {/* Key Attributes */}
                          <td className="p-3 text-[11px] text-slate-300 max-w-xs truncate">
                            {'surface' in feat && feat.surface && (
                              <span className="mr-2 text-slate-400">
                                Surface: <span className="text-slate-200">{feat.surface}</span>
                              </span>
                            )}
                            {'pcnRating' in feat && feat.pcnRating && (
                              <span className="mr-2 text-slate-400">
                                PCN: <span className="text-amber-300">{feat.pcnRating}</span>
                              </span>
                            )}
                            {'lengthMeters' in feat && feat.lengthMeters && (
                              <span className="mr-2 text-slate-400">
                                Length: <span className="text-slate-200">{feat.lengthMeters}m</span>
                              </span>
                            )}
                            {'terminal' in feat && feat.terminal && (
                              <span className="mr-2 text-slate-400">
                                Term: <span className="text-sky-300">{feat.terminal}</span>
                              </span>
                            )}
                            {'heightAglMeters' in feat && (
                              <span className="mr-2 text-slate-400">
                                Ht: <span className="text-purple-300">{feat.heightAglMeters}m AGL</span>
                              </span>
                            )}
                            {'hazardDescription' in feat && feat.hazardDescription && (
                              <span className="text-rose-300 truncate">{feat.hazardDescription}</span>
                            )}
                            {feat.elevationMeters !== undefined && (
                              <span className="text-slate-400">
                                Elev: {feat.elevationMeters}m
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="p-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  onSelectFeature(feat);
                                  onNavigateToMap(feat);
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 bg-sky-950 hover:bg-sky-900 text-sky-300 hover:text-white rounded border border-sky-800 text-[11px] transition-colors cursor-pointer"
                                title="Locate on Leaflet Map"
                              >
                                <Compass className="w-3 h-3" />
                                <span>Locate</span>
                              </button>

                              <button
                                onClick={() => onSelectFeature(feat)}
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-[11px] transition-colors cursor-pointer"
                                title="Inspect DO-272 Properties"
                              >
                                Inspect
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* DO-272 43 CORE AMDB STANDARD CATALOGUE MATRIX */
          <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/40">
            <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold text-white">
                RTCA DO-272 / EUROCAE ED-99 Standard Data Dictionary (Showing {filteredCatalog.length} of 43)
              </span>
              <span className="text-sky-400 text-[11px]">
                Full Database DDL & PostGIS / SpatiaLite Compatibility
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs divide-y divide-slate-800/80">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[11px]">
                  <tr>
                    <th className="p-3 w-12 text-center">#</th>
                    <th className="p-3">Feature Class</th>
                    <th className="p-3">Subsystem</th>
                    <th className="p-3">Geometry</th>
                    <th className="p-3">ICAO Annex 14 Ref</th>
                    <th className="p-3">Mandatory Attributes</th>
                    <th className="p-3">DO-272 Standard Definition</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 bg-slate-900/20">
                  {filteredCatalog.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-3 text-center text-slate-500 font-bold tabular-nums">
                        {item.id}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className="text-sky-300 font-bold">{item.featureClass}</span>
                      </td>
                      <td className="p-3 whitespace-nowrap text-slate-300 text-[11px]">
                        {item.subsystem}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.geometryType === 'Polygon'
                              ? 'bg-purple-950 text-purple-300 border border-purple-800'
                              : item.geometryType === 'LineString'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}
                        >
                          {item.geometryType}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap text-slate-400 text-[11px]">
                        {item.icaoReference}
                      </td>
                      <td className="p-3 text-[11px] text-slate-400">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {item.mandatoryAttributes.map((attr) => (
                            <span
                              key={attr}
                              className="px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded text-[10px]"
                            >
                              {attr}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-slate-300 text-[11px] leading-relaxed max-w-sm">
                        {item.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
