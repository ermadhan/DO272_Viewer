/**
 * DO-272 Aerodrome Spatial GIS & MCP Intelligence Platform
 * RTCA DO-272 / EUROCAE ED-99 Standards Compliance Engine
 */

import React, { useState, useMemo } from 'react';
import {
  AerodromeDataset,
  AnyDO272Feature,
  TaxiRouteResult,
} from './types/do272';
import { PRELOADED_AERODROMES, fetchOsmAerodrome } from './data/aerodromes';
import { Header } from './components/Header';
import { AerodromeMap } from './components/AerodromeMap';
import { LayerControls, LayerVisibilityState } from './components/LayerControls';
import { FeatureInspector } from './components/FeatureInspector';
import { SpatialAnalysisHUD } from './components/SpatialAnalysisHUD';
import { MCPStudio } from './components/MCPStudio';
import { WindowsSetupModal } from './components/WindowsSetupModal';
import { DataIngestModal } from './components/DataIngestModal';
import { DO272CatalogueModal } from './components/DO272CatalogueModal';
import { DO272FeatureExplorer } from './components/DO272FeatureExplorer';
import { DatabaseEngine } from './services/databaseSchema';
import { Loader2, RefreshCw } from 'lucide-react';

export default function App() {
  // Navigation & View State
  const [activeTab, setActiveTab] = useState<'map' | 'features' | 'routing' | 'obstacles' | 'sql' | 'mcp' | 'windows'>('map');
  const [databaseEngine, setDatabaseEngine] = useState<DatabaseEngine>('postgres');
  const [isFetchingLiveOsm, setIsFetchingLiveOsm] = useState<boolean>(false);
  const [selectedIcao, setSelectedIcao] = useState<string>('KSFO');
  const [customDatasets, setCustomDatasets] = useState<Record<string, AerodromeDataset>>({});

  // Active Aerodrome Dataset
  const currentDataset: AerodromeDataset = useMemo(() => {
    return customDatasets[selectedIcao] || PRELOADED_AERODROMES[selectedIcao] || PRELOADED_AERODROMES.KSFO;
  }, [selectedIcao, customDatasets]);

  // Layer Visibility State
  const [layers, setLayers] = useState<LayerVisibilityState>({
    runways: true,
    thresholds: true,
    blastPads: true,
    taxiways: true,
    guidanceLines: true,
    holdingPositions: true,
    parkingStands: true,
    jetBridges: true,
    standGuidance: true,
    hotspots: true,
    safetyAreas: true,
    obstacles: true,
    navaids: true,
  });

  // Spatial Analysis & Interactive State
  const [activeRoute, setActiveRoute] = useState<TaxiRouteResult | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<AnyDO272Feature | null>(null);
  const [highlightedFeatureIds, setHighlightedFeatureIds] = useState<string[]>([]);

  // Modals
  const [isIngestOpen, setIsIngestOpen] = useState(false);
  const [isWindowsGuideOpen, setIsWindowsGuideOpen] = useState(false);
  const [isCatalogueOpen, setIsCatalogueOpen] = useState(false);

  // Dynamic Feature Counts per Subsystem
  const featureCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of currentDataset.features) {
      if (f.featureClass === 'RunwayElement') counts.runways = (counts.runways || 0) + 1;
      else if (f.featureClass === 'RunwayThreshold' || f.featureClass === 'RunwayDisplacedThreshold')
        counts.thresholds = (counts.thresholds || 0) + 1;
      else if (f.featureClass === 'RunwayBlastPad' || f.featureClass === 'Stopway')
        counts.blastPads = (counts.blastPads || 0) + 1;
      else if (f.featureClass === 'TaxiwayElement') counts.taxiways = (counts.taxiways || 0) + 1;
      else if (f.featureClass === 'TaxiwayGuidanceLine')
        counts.guidanceLines = (counts.guidanceLines || 0) + 1;
      else if (f.featureClass === 'RunwayHoldingPosition' || f.featureClass === 'IntermediateHoldingPosition')
        counts.holdingPositions = (counts.holdingPositions || 0) + 1;
      else if (f.featureClass === 'ParkingStandArea' || f.featureClass === 'ParkingStandLocation')
        counts.parkingStands = (counts.parkingStands || 0) + 1;
      else if (f.featureClass === 'StandGuidanceLine')
        counts.standGuidance = (counts.standGuidance || 0) + 1;
      else if (f.featureClass === 'PassengerBoardingBridge')
        counts.jetBridges = (counts.jetBridges || 0) + 1;
      else if (f.featureClass === 'HotSpot') counts.hotspots = (counts.hotspots || 0) + 1;
      else if (f.featureClass === 'RunwaySafetyArea' || f.featureClass === 'ObjectFreeArea')
        counts.safetyAreas = (counts.safetyAreas || 0) + 1;
      else if (f.featureClass === 'VerticalStructure') counts.obstacles = (counts.obstacles || 0) + 1;
      else counts.navaids = (counts.navaids || 0) + 1;
    }
    return counts;
  }, [currentDataset]);

  const handleDatasetLoaded = (newDataset: AerodromeDataset) => {
    setCustomDatasets((prev) => ({ ...prev, [newDataset.icao]: newDataset }));
    setSelectedIcao(newDataset.icao);
    setActiveRoute(null);
    setSelectedFeature(null);
    setHighlightedFeatureIds([]);
  };

  const handleSyncLiveOsm = async () => {
    setIsFetchingLiveOsm(true);
    try {
      const liveDataset = await fetchOsmAerodrome(selectedIcao);
      handleDatasetLoaded(liveDataset);
    } catch (e) {
      console.error('Failed to sync live OSM data', e);
    } finally {
      setIsFetchingLiveOsm(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Bar Contract Navigation */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedIcao={selectedIcao}
        onSelectIcao={(icao) => {
          setSelectedIcao(icao);
          setActiveRoute(null);
          setSelectedFeature(null);
          setHighlightedFeatureIds([]);
        }}
        databaseEngine={databaseEngine}
        onToggleDatabaseEngine={setDatabaseEngine}
        onOpenIngest={() => setIsIngestOpen(true)}
        onOpenWindowsGuide={() => setIsWindowsGuideOpen(true)}
        onOpenCatalogue={() => setIsCatalogueOpen(true)}
      />

      {/* Aerodrome Overview Kicker Banner */}
      <div className="bg-slate-900/90 border-b border-slate-800/80 px-6 py-2 flex items-center justify-between text-xs font-mono text-slate-400 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-slate-200">
            <span className="text-white font-bold">{currentDataset.name}</span>
            <span className="text-sky-400">({currentDataset.icao} / {currentDataset.iata})</span>
          </div>
          <span>·</span>
          <span>{currentDataset.city}, {currentDataset.country}</span>
          <span>·</span>
          <span className="text-slate-300">Elev: {currentDataset.elevationMeters}m AMSL</span>
          <span>·</span>
          <span>Mag Var: {currentDataset.magneticVariation}</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncLiveOsm}
            disabled={isFetchingLiveOsm}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-sky-300 hover:text-white rounded border border-slate-700 text-[11px] transition-colors cursor-pointer"
            title="Fetch real-time high-resolution OpenStreetMap vector geometry"
          >
            {isFetchingLiveOsm ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-sky-400" />
                <span>Fetching Live OSM...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3 text-sky-400" />
                <span>Fetch Live OSM Vectors</span>
              </>
            )}
          </button>
          <span>·</span>
          <span className="text-[11px] text-slate-500">Source:</span>
          <span className="text-emerald-400 text-[11px]">{currentDataset.source}</span>
          <span>·</span>
          <span className="text-slate-300 tabular-nums">
            {currentDataset.features.length} DO-272 Entities
          </span>
        </div>
      </div>

      {/* Main Viewport Workspace */}
      <div className="relative flex-1 w-full h-full overflow-hidden flex">
        {activeTab === 'features' ? (
          <DO272FeatureExplorer
            dataset={currentDataset}
            databaseEngine={databaseEngine}
            selectedFeature={selectedFeature}
            onSelectFeature={(feat) => setSelectedFeature(feat)}
            onNavigateToMap={(feat) => {
              if (feat) setSelectedFeature(feat);
              setActiveTab('map');
            }}
          />
        ) : (
          <>
            {/* Primary Leaflet Map Container */}
            <div className="relative flex-1 h-full w-full">
              <AerodromeMap
                dataset={currentDataset}
                layers={layers}
                activeRoute={activeRoute}
                selectedFeature={selectedFeature}
                onSelectFeature={(feat) => setSelectedFeature(feat)}
                highlightedFeatureIds={highlightedFeatureIds}
              />

              {/* Floating Left: Subsystem Layer Controls (Only in map or routing view) */}
              {(activeTab === 'map' || activeTab === 'routing') && (
                <div className="absolute top-16 left-4 z-20">
                  <LayerControls
                    layers={layers}
                    setLayers={setLayers}
                    featureCounts={featureCounts}
                    onOpenExplorer={() => setActiveTab('features')}
                  />
                </div>
              )}

              {/* Floating Right: Feature Inspector */}
              {selectedFeature && (
                <div className="absolute top-4 right-4 z-20">
                  <FeatureInspector
                    feature={selectedFeature}
                    onClose={() => setSelectedFeature(null)}
                  />
                </div>
              )}
            </div>

            {/* Spatial Analysis & PostGIS Engine HUD Drawer */}
            {(activeTab === 'routing' || activeTab === 'obstacles' || activeTab === 'sql') && (
              <div className="w-[520px] h-full z-30 p-3 bg-slate-950/90 backdrop-blur-md border-l border-slate-800 shadow-2xl flex flex-col">
                <SpatialAnalysisHUD
                  dataset={currentDataset}
                  activeRoute={activeRoute}
                  setActiveRoute={setActiveRoute}
                  onHighlightFeatures={(ids) => setHighlightedFeatureIds(ids)}
                  databaseEngine={databaseEngine}
                  onToggleDatabaseEngine={setDatabaseEngine}
                />
              </div>
            )}

            {/* Model Context Protocol (MCP) Studio Drawer */}
            {activeTab === 'mcp' && (
              <div className="w-[640px] h-full z-30 p-3 bg-slate-950/90 backdrop-blur-md border-l border-slate-800 shadow-2xl flex flex-col">
                <MCPStudio dataset={currentDataset} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <WindowsSetupModal
        isOpen={isWindowsGuideOpen}
        onClose={() => setIsWindowsGuideOpen(false)}
      />

      <DataIngestModal
        isOpen={isIngestOpen}
        onClose={() => setIsIngestOpen(false)}
        onDatasetLoaded={handleDatasetLoaded}
      />

      <DO272CatalogueModal
        isOpen={isCatalogueOpen}
        onClose={() => setIsCatalogueOpen(false)}
      />
    </div>
  );
}
