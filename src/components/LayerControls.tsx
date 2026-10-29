import React, { useState } from 'react';
import {
  Layers,
  Search,
  Filter,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react';

export interface LayerVisibilityState {
  // Runway subsystem
  runways: boolean;
  thresholds: boolean;
  blastPads: boolean;
  // Taxiway subsystem
  taxiways: boolean;
  guidanceLines: boolean;
  holdingPositions: boolean;
  // Apron & Parking
  parkingStands: boolean;
  jetBridges: boolean;
  standGuidance: boolean;
  // Safety & Protection
  hotspots: boolean;
  safetyAreas: boolean;
  // Vertical structures
  obstacles: boolean;
  // NAVAIDs
  navaids: boolean;
}

interface LayerControlsProps {
  layers: LayerVisibilityState;
  setLayers: React.Dispatch<React.SetStateAction<LayerVisibilityState>>;
  featureCounts: Record<string, number>;
  onOpenExplorer?: () => void;
}

interface SubsystemGroup {
  id: string;
  name: string;
  layers: {
    key: keyof LayerVisibilityState;
    label: string;
    countKey: string;
    color: string;
    geom: 'Polygon' | 'LineString' | 'Point';
  }[];
}

const SUBSYSTEM_GROUPS: SubsystemGroup[] = [
  {
    id: 'runways',
    name: '1. Runway System',
    layers: [
      { key: 'runways', label: 'Runway Elements (Pavement)', countKey: 'runways', color: 'bg-slate-300', geom: 'Polygon' },
      { key: 'thresholds', label: 'Thresholds & Displacements', countKey: 'thresholds', color: 'bg-emerald-500', geom: 'LineString' },
      { key: 'blastPads', label: 'Blast Pads & Stopways', countKey: 'blastPads', color: 'bg-amber-600', geom: 'Polygon' },
    ],
  },
  {
    id: 'taxiways',
    name: '2. Taxiway System',
    layers: [
      { key: 'taxiways', label: 'Taxiway Pavement Elements', countKey: 'taxiways', color: 'bg-slate-600', geom: 'Polygon' },
      { key: 'guidanceLines', label: 'Guidance Lines (TGL Centerlines)', countKey: 'guidanceLines', color: 'bg-amber-400', geom: 'LineString' },
      { key: 'holdingPositions', label: 'Runway Holding Positions (CAT I-III)', countKey: 'holdingPositions', color: 'bg-rose-500', geom: 'Point' },
    ],
  },
  {
    id: 'aprons',
    name: '3. Apron & Stand System',
    layers: [
      { key: 'parkingStands', label: 'Parking Stands & Gates', countKey: 'parkingStands', color: 'bg-sky-500', geom: 'Polygon' },
      { key: 'standGuidance', label: 'Stand Lead-In Guidance Lines', countKey: 'standGuidance', color: 'bg-cyan-400', geom: 'LineString' },
      { key: 'jetBridges', label: 'Passenger Boarding Bridges (PBB)', countKey: 'jetBridges', color: 'bg-indigo-500', geom: 'LineString' },
    ],
  },
  {
    id: 'safety',
    name: '4. Safety & Protection',
    layers: [
      { key: 'hotspots', label: 'Runway Hot Spots (Incursion)', countKey: 'hotspots', color: 'bg-rose-600', geom: 'Polygon' },
      { key: 'safetyAreas', label: 'Safety Areas (RSA / RESA / OFA)', countKey: 'safetyAreas', color: 'bg-orange-500', geom: 'Polygon' },
    ],
  },
  {
    id: 'obstacles',
    name: '5. Vertical Obstacles',
    layers: [
      { key: 'obstacles', label: 'Vertical Structures (Towers/Hangars)', countKey: 'obstacles', color: 'bg-purple-500', geom: 'Point' },
    ],
  },
  {
    id: 'navaids',
    name: '6. Visual Aids & NAVAIDs',
    layers: [
      { key: 'navaids', label: 'NAVAIDs & Ground Lighting (LOC/PAPI/Radar)', countKey: 'navaids', color: 'bg-emerald-400', geom: 'Point' },
    ],
  },
];

export const LayerControls: React.FC<LayerControlsProps> = ({
  layers,
  setLayers,
  featureCounts,
  onOpenExplorer,
}) => {
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [collapsedSubsystems, setCollapsedSubsystems] = useState<Record<string, boolean>>({});

  const toggleSubsystemCollapse = (id: string) => {
    setCollapsedSubsystems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleLayer = (key: keyof LayerVisibilityState) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setAll = (val: boolean) => {
    setLayers({
      runways: val,
      thresholds: val,
      blastPads: val,
      taxiways: val,
      guidanceLines: val,
      holdingPositions: val,
      parkingStands: val,
      jetBridges: val,
      standGuidance: val,
      hotspots: val,
      safetyAreas: val,
      obstacles: val,
      navaids: val,
    });
  };

  // Filter layers by geometry
  const filterByGeometry = (targetGeom: 'Polygon' | 'LineString' | 'Point') => {
    const next: Partial<LayerVisibilityState> = { ...layers };
    SUBSYSTEM_GROUPS.forEach((group) => {
      group.layers.forEach((l) => {
        next[l.key] = l.geom === targetGeom;
      });
    });
    setLayers(next as LayerVisibilityState);
  };

  // Filter groups according to search input
  const filteredGroups = SUBSYSTEM_GROUPS.map((group) => ({
    ...group,
    layers: group.layers.filter((l) =>
      searchFilter
        ? l.label.toLowerCase().includes(searchFilter.toLowerCase()) ||
          group.name.toLowerCase().includes(searchFilter.toLowerCase())
        : true
    ),
  })).filter((group) => group.layers.length > 0);

  const totalVisibleCount = Object.keys(layers).reduce((acc, k) => {
    const key = k as keyof LayerVisibilityState;
    return layers[key] ? acc + (featureCounts[key] || 0) : acc;
  }, 0);

  return (
    <div className="bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl p-3.5 shadow-2xl text-slate-200 w-80 max-h-[calc(100vh-140px)] overflow-y-auto font-mono text-xs select-none">
      {/* 1. Header with Global Selectors */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-sky-400" />
          <span className="font-bold uppercase tracking-wider text-white text-xs">
            DO-272 Map Layers
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <button
            onClick={() => setAll(true)}
            className="text-sky-400 hover:text-sky-300 hover:underline px-1 py-0.5 cursor-pointer font-bold"
            title="Enable all DO-272 layers"
          >
            All
          </button>
          <span className="text-slate-600">|</span>
          <button
            onClick={() => setAll(false)}
            className="text-slate-400 hover:text-slate-200 hover:underline px-1 py-0.5 cursor-pointer"
            title="Hide all layers"
          >
            None
          </button>
        </div>
      </div>

      {/* 2. Search & Quick Geometry Filters */}
      <div className="pt-2.5 pb-2 space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-slate-500" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Filter map layers..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-7 pr-2 py-1 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>

        {/* Quick geometry pills */}
        <div className="flex items-center gap-1 text-[10px]">
          <span className="text-slate-500 text-[9px] uppercase">Geom:</span>
          <button
            onClick={() => filterByGeometry('Polygon')}
            className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-purple-300 rounded border border-purple-900/60 transition-colors cursor-pointer"
            title="Show only Polygons"
          >
            ⬡ Polygons
          </button>
          <button
            onClick={() => filterByGeometry('LineString')}
            className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded border border-amber-900/60 transition-colors cursor-pointer"
            title="Show only Lines"
          >
            ╱ Lines
          </button>
          <button
            onClick={() => filterByGeometry('Point')}
            className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded border border-emerald-900/60 transition-colors cursor-pointer"
            title="Show only Points"
          >
            • Points
          </button>
        </div>
      </div>

      {/* 3. Subsystem Groups & Feature Layer Toggles */}
      <div className="space-y-3 pt-1">
        {filteredGroups.map((group) => {
          const isCollapsed = collapsedSubsystems[group.id];
          const allGroupActive = group.layers.every((l) => layers[l.key]);
          const someGroupActive = group.layers.some((l) => layers[l.key]);

          const toggleGroupAll = (e: React.MouseEvent) => {
            e.stopPropagation();
            const nextVal = !allGroupActive;
            setLayers((prev) => {
              const updated = { ...prev };
              group.layers.forEach((l) => {
                updated[l.key] = nextVal;
              });
              return updated;
            });
          };

          return (
            <div key={group.id} className="border border-slate-800/80 rounded-lg overflow-hidden bg-slate-950/40">
              {/* Subsystem Header */}
              <div
                onClick={() => toggleSubsystemCollapse(group.id)}
                className="flex items-center justify-between p-2 bg-slate-950 hover:bg-slate-900/80 cursor-pointer border-b border-slate-800/60 transition-colors"
              >
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  <span>{group.name}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleGroupAll}
                    className="text-[10px] text-sky-400 hover:text-sky-300 px-1 py-0.5 rounded cursor-pointer"
                    title={`Toggle all layers in ${group.name}`}
                  >
                    {allGroupActive ? 'None' : 'All'}
                  </button>
                </div>
              </div>

              {/* Subsystem Layers */}
              {!isCollapsed && (
                <div className="p-1.5 space-y-0.5">
                  {group.layers.map((l) => {
                    const isChecked = layers[l.key];
                    const count = featureCounts[l.countKey] || 0;

                    return (
                      <label
                        key={l.key}
                        className={`flex items-center justify-between p-1.5 rounded transition-colors cursor-pointer ${
                          isChecked ? 'hover:bg-slate-800/60' : 'opacity-60 hover:opacity-100 hover:bg-slate-900'
                        }`}
                      >
                        <span className="flex items-center gap-2 max-w-[200px] truncate">
                          <span className={`w-2 h-2 rounded-xs shrink-0 ${l.color}`} />
                          <span className="text-[11px] truncate text-slate-200">{l.label}</span>
                        </span>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-slate-500 tabular-nums">
                            {count}
                          </span>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleLayer(l.key)}
                            className="rounded border-slate-700 text-sky-500 focus:ring-0 bg-slate-800 cursor-pointer w-3.5 h-3.5"
                          />
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 4. Footer Summary & Link to Full Explorer */}
      <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
        <span className="tabular-nums">
          <strong className="text-white">{totalVisibleCount}</strong> features active
        </span>

        {onOpenExplorer && (
          <button
            onClick={onOpenExplorer}
            className="flex items-center gap-1 text-sky-400 hover:text-sky-300 font-bold hover:underline cursor-pointer"
          >
            <span>Full Explorer</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};
