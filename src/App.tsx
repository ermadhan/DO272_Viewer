/**
 * DO-272 Aerodrome Spatial GIS & MCP Intelligence Platform
 * RTCA DO-272 / EUROCAE ED-99 Standards Compliance Engine
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  AerodromeDataset,
  AnyDO272Feature,
  OsmFeature,
  OsmSnapshot,
  OsmSnapshotInput,
  TaxiRouteResult,
} from './types/do272';
import { fetchOsmAerodrome } from './data/aerodromes';
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
import { MCPAgentChat } from './components/MCPAgentChat';
import { AgentMapSyncPayload } from './services/mcpAgentService';
import { DatabaseEngine } from './services/databaseSchema';
import {
  AerodromeSummary,
  getAerodromeDataset,
  getAerodromes,
  getDatabaseEngine,
  getOsmSnapshot,
  getOsmSnapshots,
  OsmSnapshotSummary,
  saveAerodromeDataset,
  saveOsmSnapshot,
  setDatabaseEngine as switchDatabaseEngine,
} from './services/aerodromeApi';
import { osmCandidateClass, reconcileOsm } from './services/osmReconciliation';
import { Loader2, RefreshCw } from 'lucide-react';

export default function App() {
  // Navigation & View State
  const [activeTab, setActiveTab] = useState<'map' | 'features' | 'routing' | 'obstacles' | 'sql' | 'mcp' | 'agent' | 'windows'>('map');
  const [databaseEngine, setDatabaseEngine] = useState<DatabaseEngine>('sqlite');
  const [isFetchingLiveOsm, setIsFetchingLiveOsm] = useState<boolean>(false);
  const [selectedIcao, setSelectedIcao] = useState<string>('KSFO');
  const [aerodromes, setAerodromes] = useState<AerodromeSummary[]>([]);
  const [currentDataset, setCurrentDataset] = useState<AerodromeDataset | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoadingDataset, setIsLoadingDataset] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [osmSnapshots, setOsmSnapshots] = useState<OsmSnapshotSummary[]>([]);
  const [osmSnapshotId, setOsmSnapshotId] = useState<number | null>(null);
  const [osmSnapshot, setOsmSnapshot] = useState<OsmSnapshot | null>(null);
  const [showOsm, setShowOsm] = useState(true);
  const [selectedOsm, setSelectedOsm] = useState<OsmFeature | null>(null);
  const [showReview, setShowReview] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingDataset(true);
    Promise.all([getAerodromes(), getDatabaseEngine()])
      .then(([loadedAerodromes, activeEngine]) => {
        if (cancelled) return;
        setAerodromes(loadedAerodromes);
        setDatabaseEngine(activeEngine);
        setSelectedIcao((currentIcao) =>
          loadedAerodromes.some((aerodrome) => aerodrome.icao === currentIcao)
            ? currentIcao
            : loadedAerodromes[0]?.icao || ''
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setApiError(error instanceof Error ? error.message : 'Failed to load aerodromes from the database.');
        setIsLoadingDataset(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedIcao) {
      setCurrentDataset(null);
      setIsLoadingDataset(false);
      return;
    }

    let cancelled = false;
    setCurrentDataset(null);
    setIsLoadingDataset(true);
    setApiError(null);
    setOsmSnapshot(null);
    setOsmSnapshotId(null);
    setOsmSnapshots([]);
    setSelectedOsm(null);
    Promise.all([getAerodromeDataset(selectedIcao), getOsmSnapshots(selectedIcao)])
      .then(([dataset, snapshots]) => {
        if (cancelled) return;
        setCurrentDataset(dataset);
        setOsmSnapshots(snapshots);
        setOsmSnapshotId(snapshots[0]?.id ?? null);
        setIsLoadingDataset(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setApiError(error instanceof Error ? error.message : `Failed to load ${selectedIcao} from the database.`);
        setIsLoadingDataset(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedIcao, databaseEngine, refreshKey]);

  useEffect(() => {
    if (!selectedIcao || osmSnapshotId === null) return;
    let cancelled = false;
    setOsmSnapshot(null);
    getOsmSnapshot(selectedIcao, osmSnapshotId)
      .then(snapshot => { if (!cancelled) setOsmSnapshot(snapshot); })
      .catch((error: unknown) => {
        if (!cancelled) setApiError(error instanceof Error ? error.message : 'Failed to load the OSM snapshot.');
      });
    return () => { cancelled = true; };
  }, [selectedIcao, osmSnapshotId, databaseEngine]);

  const osmGroups = useMemo(() =>
    currentDataset && osmSnapshot ? reconcileOsm(currentDataset, osmSnapshot.dataset.features) : [],
    [currentDataset, osmSnapshot]);
  const supplementalFeatures = useMemo(() => showOsm
    ? osmGroups.filter(group => group.status !== 'matched').flatMap(group => group.features)
    : [], [showOsm, osmGroups]);
  const osmReviewGroups = useMemo(() =>
    osmGroups.filter(group => group.status === 'ambiguous' || group.conflicts.length > 0), [osmGroups]);

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
    if (!currentDataset) return counts;
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

  const handleDatasetLoaded = async (newDataset: AerodromeDataset) => {
    const savedDataset = await saveAerodromeDataset(newDataset);
    setAerodromes((previous) => {
      const summary: AerodromeSummary = {
        icao: savedDataset.icao,
        iata: savedDataset.iata,
        name: savedDataset.name,
        city: savedDataset.city,
        country: savedDataset.country,
        featureCount: savedDataset.features.length,
      };
      return [
        ...previous.filter((aerodrome) => aerodrome.icao !== savedDataset.icao),
        summary,
      ].sort((a, b) => a.icao.localeCompare(b.icao));
    });
    setCurrentDataset(savedDataset);
    setSelectedIcao(savedDataset.icao);
    setApiError(null);
    setActiveRoute(null);
    setSelectedFeature(null);
    setHighlightedFeatureIds([]);
  };

  const handleSyncLiveOsm = async () => {
    setIsFetchingLiveOsm(true);
    try {
      const snapshot = await fetchOsmAerodrome(selectedIcao);
      await handleOsmLoaded(snapshot);
    } catch (error: unknown) {
      setApiError(error instanceof Error ? error.message : 'Failed to save live OSM data to the database.');
    } finally {
      setIsFetchingLiveOsm(false);
    }
  };

  const handleOsmLoaded = async (snapshot: OsmSnapshotInput) => {
    await saveOsmSnapshot(snapshot);
    setSelectedIcao(snapshot.dataset.icao);
    setRefreshKey(key => key + 1);
    setApiError(null);
    setActiveRoute(null);
    setSelectedFeature(null);
    setSelectedOsm(null);
  };

  const handleSelectIcao = (icao: string) => {
    setSelectedIcao(icao);
    setActiveRoute(null);
    setSelectedFeature(null);
    setHighlightedFeatureIds([]);
  };

  const handleToggleDatabaseEngine = async (engine: DatabaseEngine) => {
    if (engine === databaseEngine) return;
    setApiError(null);
    try {
      const activeEngine = await switchDatabaseEngine(engine);
      setDatabaseEngine(activeEngine);
      const loadedAerodromes = await getAerodromes();
      setAerodromes(loadedAerodromes);
      setSelectedIcao((currentIcao) =>
        loadedAerodromes.some((aerodrome) => aerodrome.icao === currentIcao)
          ? currentIcao
          : loadedAerodromes[0]?.icao || ''
      );
    } catch (error: unknown) {
      setApiError(error instanceof Error ? error.message : `Failed to switch to ${engine}.`);
    }
  };

  const handleRetryDatabaseLoad = () => {
    setApiError(null);
    setRefreshKey((key) => key + 1);
  };

  const handleApplyAgentGeometry = (payload: AgentMapSyncPayload) => {
    if (payload.type === 'route' && payload.taxiRoute) {
      setActiveRoute(payload.taxiRoute);
      setHighlightedFeatureIds([]);
    } else if (payload.type === 'features' && payload.highlightFeatureIds) {
      setHighlightedFeatureIds(payload.highlightFeatureIds);
    } else if (payload.type === 'obstacle') {
      if (payload.focusedFeature) {
        setSelectedFeature(payload.focusedFeature);
      }
      if (payload.highlightFeatureIds) {
        setHighlightedFeatureIds(payload.highlightFeatureIds);
      }
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Bar Contract Navigation */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedIcao={selectedIcao}
        aerodromes={aerodromes}
        onSelectIcao={handleSelectIcao}
        databaseEngine={databaseEngine}
        onToggleDatabaseEngine={handleToggleDatabaseEngine}
        onOpenIngest={() => setIsIngestOpen(true)}
        onOpenWindowsGuide={() => setIsWindowsGuideOpen(true)}
        onOpenCatalogue={() => setIsCatalogueOpen(true)}
      />

      {currentDataset && apiError && (
        <div className="px-6 py-2 bg-rose-950/70 border-b border-rose-900 text-rose-200 text-xs">
          Database request failed: {apiError}
        </div>
      )}

      {currentDataset ? (
        <>
          <div className="bg-slate-900/90 border-b border-slate-800/80 px-6 py-2 flex items-center justify-between text-xs font-mono text-slate-400 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-slate-200">
                <span className="text-white font-bold">{currentDataset.name}</span>
                <span className="text-sky-400">({currentDataset.icao}{currentDataset.iata ? ` / ${currentDataset.iata}` : ''})</span>
              </div>
              <span>·</span>
              <span>{[currentDataset.city, currentDataset.country].filter(Boolean).join(', ') || 'Location unknown'}</span>
              <span>·</span>
              <span className="text-slate-300">Elev: {currentDataset.elevationMeters === null ? 'Unknown' : `${currentDataset.elevationMeters}m AMSL`}</span>
              <span>·</span>
              <span>Mag Var: {currentDataset.magneticVariation || 'Unknown'}</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSyncLiveOsm}
                disabled={isFetchingLiveOsm}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-sky-300 hover:text-white rounded border border-slate-700 text-[11px] transition-colors cursor-pointer"
                title="Fetch real-time high-resolution OpenStreetMap vector geometry and save it to the database"
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
                {currentDataset.features.length} baseline entities
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 border-b border-slate-800 bg-slate-900 px-6 py-2 text-xs">
            <label className="flex items-center gap-2 text-pink-300">
              <input type="checkbox" checked={showOsm} onChange={event => setShowOsm(event.target.checked)} />
              Show supplemental OSM ({showOsm ? supplementalFeatures.length : 'hidden'})
            </label>
            {osmSnapshots.length > 0 && (
              <>
                <label className="text-slate-300">
                  Snapshot:{' '}
                  <select className="bg-slate-800 text-white" value={osmSnapshotId ?? ''}
                    onChange={event => { setSelectedOsm(null); setOsmSnapshotId(Number(event.target.value)); }}>
                    {osmSnapshots.map(snapshot => (
                      <option key={snapshot.id} value={snapshot.id}>
                        {snapshot.capturedAt || 'Legacy — time unknown'} ({snapshot.featureCount})
                      </option>
                    ))}
                  </select>
                </label>
                <button className="text-amber-300 underline" onClick={() => setShowReview(value => !value)}>
                  Review {osmReviewGroups.length} flagged groups
                </button>
                <span className="text-slate-400">{osmGroups.filter(group => group.status === 'ambiguous').length} ambiguous groups</span>
                <a className="text-slate-400 underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
              </>
            )}
            {currentDataset.source === 'OpenStreetMap Aeroway Ingest' && (
              <span className="text-amber-300">No curated baseline. OSM is display-only.</span>
            )}
          </div>
          {showReview && osmSnapshot && (
            <div className="max-h-40 overflow-auto border-b border-amber-900 bg-slate-950 px-6 py-2 text-xs">
              <p className="mb-1 text-slate-400">Heuristic matches or name-only candidates; verify differences against authoritative data. OSM features come from a bounding box and may include other airports.</p>
              {osmReviewGroups.length === 0 && <p className="text-slate-400">No conflicts or ambiguous matches found.</p>}
              {osmReviewGroups.map(group => (
                <div key={group.features[0].id} className="text-amber-200">
                  <button className="underline" onClick={() => {
                    setSelectedFeature(null);
                    setSelectedOsm(group.features[0]);
                    setActiveTab('map');
                  }}>{group.curated?.designator || group.features[0].designator || 'Unnamed'}</button>
                  {' '}({group.features.map(f => `${f.osmType}/${f.osmId}`).join(', ')}):{' '}
                  {group.status === 'ambiguous' && 'Ambiguous match. '}
                  {group.conflicts.map(c => `${c.field}: curated ${c.curated}, OSM ${c.osm}`).join('; ')}
                </div>
              ))}
            </div>
          )}

          <div className="relative flex-1 w-full h-full overflow-hidden flex">
            {activeTab === 'features' ? (
              <DO272FeatureExplorer
                dataset={currentDataset}
                databaseEngine={databaseEngine}
                selectedFeature={selectedFeature}
                onSelectFeature={(feat) => { setSelectedOsm(null); setSelectedFeature(feat); }}
                onNavigateToMap={(feat) => {
                  if (feat) setSelectedFeature(feat);
                  setActiveTab('map');
                }}
              />
            ) : (
              <>
                <div className="relative flex-1 h-full w-full">
                  <AerodromeMap
                    dataset={currentDataset}
                    layers={layers}
                    activeRoute={activeRoute}
                    selectedFeature={selectedFeature}
                    onSelectFeature={(feat) => setSelectedFeature(feat)}
                    highlightedFeatureIds={highlightedFeatureIds}
                    supplementalFeatures={supplementalFeatures}
                    onSelectOsmFeature={feature => { setSelectedFeature(null); setSelectedOsm(feature); }}
                  />

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

                  {selectedFeature && (
                    <div className="absolute top-4 right-4 z-20">
                      <FeatureInspector
                        feature={selectedFeature}
                        onClose={() => setSelectedFeature(null)}
                      />
                    </div>
                  )}
                  {selectedOsm && (
                    <div className="absolute top-4 right-4 z-20 max-h-[70vh] w-80 overflow-auto rounded-xl border border-pink-900 bg-slate-900 p-4 text-xs">
                      <button className="float-right text-slate-300" onClick={() => setSelectedOsm(null)}>Close</button>
                      <h3 className="font-bold text-pink-300">Supplemental OSM {selectedOsm.aeroway}</h3>
                      <p>{selectedOsm.designator || 'Designator unknown'}</p>
                      <p>Object: {selectedOsm.osmType}/{selectedOsm.osmId}</p>
                      <p>Version: {selectedOsm.version ?? 'Unknown'} · Updated: {selectedOsm.timestamp ?? 'Unknown'}</p>
                      <p>OSM database timestamp: {osmSnapshot?.osmTimestamp ?? 'Unknown'}</p>
                      <p>Geometry: {selectedOsm.geometryType}</p>
                      <p>Candidate class: {osmCandidateClass(selectedOsm) || 'Unclassified'}</p>
                      <pre className="mt-2 whitespace-pre-wrap break-all text-slate-300">{JSON.stringify(selectedOsm.tags, null, 2)}</pre>
                    </div>
                  )}
                </div>

                {currentDataset.source === 'OpenStreetMap Aeroway Ingest' && activeTab !== 'map' && (
                  <div className="w-[400px] p-6 text-amber-300">No curated baseline is available. Supplemental OSM is excluded from analysis and MCP tools.</div>
                )}
                {currentDataset.source !== 'OpenStreetMap Aeroway Ingest' && (activeTab === 'routing' || activeTab === 'obstacles' || activeTab === 'sql') && (
                  <div className="w-[520px] h-full z-30 p-3 bg-slate-950/90 backdrop-blur-md border-l border-slate-800 shadow-2xl flex flex-col">
                    <SpatialAnalysisHUD
                      dataset={currentDataset}
                      activeRoute={activeRoute}
                      setActiveRoute={setActiveRoute}
                      onHighlightFeatures={(ids) => setHighlightedFeatureIds(ids)}
                      databaseEngine={databaseEngine}
                      onToggleDatabaseEngine={handleToggleDatabaseEngine}
                    />
                  </div>
                )}

                {currentDataset.source !== 'OpenStreetMap Aeroway Ingest' && activeTab === 'mcp' && (
                  <div className="w-[640px] h-full z-30 p-3 bg-slate-950/90 backdrop-blur-md border-l border-slate-800 shadow-2xl flex flex-col">
                    <MCPStudio dataset={currentDataset} onSwitchToAgent={() => setActiveTab('agent')} />
                  </div>
                )}

                {currentDataset.source !== 'OpenStreetMap Aeroway Ingest' && activeTab === 'agent' && (
                  <div className="w-[660px] h-full z-30 p-3 bg-slate-950/95 backdrop-blur-md border-l border-slate-800 shadow-2xl flex flex-col">
                    <MCPAgentChat
                      dataset={currentDataset}
                      onApplyMapGeometry={handleApplyAgentGeometry}
                      onNavigateToMap={() => {}}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          {apiError ? (
            <>
              <h2 className="text-lg font-semibold text-rose-300">Unable to load airport data</h2>
              <p className="max-w-xl text-sm text-slate-400">{apiError}</p>
              <button
                onClick={handleRetryDatabaseLoad}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
              >
                Retry database connection
              </button>
            </>
          ) : aerodromes.length === 0 ? (
            <p className="text-sm text-slate-400">
              {isLoadingDataset ? 'Connecting to the database...' : 'No airport records are available in the database.'}
            </p>
          ) : (
            <p className="text-sm text-slate-400">Loading {selectedIcao} from the database...</p>
          )}
        </main>
      )}

      {/* Modals */}
      <WindowsSetupModal
        isOpen={isWindowsGuideOpen}
        onClose={() => setIsWindowsGuideOpen(false)}
      />

      <DataIngestModal
        isOpen={isIngestOpen}
        onClose={() => setIsIngestOpen(false)}
        onDatasetLoaded={handleDatasetLoaded}
        onOsmLoaded={handleOsmLoaded}
      />

      <DO272CatalogueModal
        isOpen={isCatalogueOpen}
        onClose={() => setIsCatalogueOpen(false)}
      />
    </div>
  );
}
