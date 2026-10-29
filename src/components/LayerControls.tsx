import React from 'react';
import { Eye, EyeOff, Layers, CheckSquare, Square } from 'lucide-react';

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
}

export const LayerControls: React.FC<LayerControlsProps> = ({
  layers,
  setLayers,
  featureCounts,
}) => {
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

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-4 shadow-xl text-slate-200 w-72 max-h-[calc(100vh-140px)] overflow-y-auto">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
            DO-272 Subsystems
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-mono">
          <button
            onClick={() => setAll(true)}
            className="text-sky-400 hover:text-sky-300 hover:underline px-1 py-0.5"
          >
            All
          </button>
          <span className="text-slate-600">|</span>
          <button
            onClick={() => setAll(false)}
            className="text-slate-400 hover:text-slate-200 hover:underline px-1 py-0.5"
          >
            None
          </button>
        </div>
      </div>

      <div className="space-y-4 pt-3 text-xs">
        {/* 1. RUNWAY SUBSYSTEM */}
        <div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-mono">
            Runway System
          </div>
          <div className="space-y-1">
            <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/60 cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-400 border border-slate-300" />
                <span>Runway Elements</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                  {featureCounts.runways || 0}
                </span>
                <input
                  type="checkbox"
                  checked={layers.runways}
                  onChange={() => toggleLayer('runways')}
                  className="rounded border-slate-700 text-sky-500 focus:ring-0 bg-slate-800 cursor-pointer"
                />
              </div>
            </label>

            <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/60 cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                <span>Thresholds & Wings</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                  {featureCounts.thresholds || 0}
                </span>
                <input
                  type="checkbox"
                  checked={layers.thresholds}
                  onChange={() => toggleLayer('thresholds')}
                  className="rounded border-slate-700 text-sky-500 focus:ring-0 bg-slate-800 cursor-pointer"
                />
              </div>
            </label>

            <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/60 cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-600" />
                <span>Blast Pads & Stopways</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                  {featureCounts.blastPads || 0}
                </span>
                <input
                  type="checkbox"
                  checked={layers.blastPads}
                  onChange={() => toggleLayer('blastPads')}
                  className="rounded border-slate-700 text-sky-500 focus:ring-0 bg-slate-800 cursor-pointer"
                />
              </div>
            </label>
          </div>
        </div>

        {/* 2. TAXIWAY SUBSYSTEM */}
        <div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-mono">
            Taxiway & Routing
          </div>
          <div className="space-y-1">
            <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/60 cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-600" />
                <span>Taxiway Pavement</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                  {featureCounts.taxiways || 0}
                </span>
                <input
                  type="checkbox"
                  checked={layers.taxiways}
                  onChange={() => toggleLayer('taxiways')}
                  className="rounded border-slate-700 text-sky-500 focus:ring-0 bg-slate-800 cursor-pointer"
                />
              </div>
            </label>

            <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/60 cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-1 bg-amber-400 rounded-full" />
                <span>Guidance Lines (TGL)</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                  {featureCounts.guidanceLines || 0}
                </span>
                <input
                  type="checkbox"
                  checked={layers.guidanceLines}
                  onChange={() => toggleLayer('guidanceLines')}
                  className="rounded border-slate-700 text-sky-500 focus:ring-0 bg-slate-800 cursor-pointer"
                />
              </div>
            </label>

            <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/60 cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 border border-white" />
                <span>Hold Short Lines (CAT I/II/III)</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                  {featureCounts.holdingPositions || 0}
                </span>
                <input
                  type="checkbox"
                  checked={layers.holdingPositions}
                  onChange={() => toggleLayer('holdingPositions')}
                  className="rounded border-slate-700 text-sky-500 focus:ring-0 bg-slate-800 cursor-pointer"
                />
              </div>
            </label>
          </div>
        </div>

        {/* 3. APRONS & PARKING */}
        <div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-mono">
            Aprons & Stands
          </div>
          <div className="space-y-1">
            <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/60 cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" />
                <span>Parking Stand Areas</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                  {featureCounts.parkingStands || 0}
                </span>
                <input
                  type="checkbox"
                  checked={layers.parkingStands}
                  onChange={() => toggleLayer('parkingStands')}
                  className="rounded border-slate-700 text-sky-500 focus:ring-0 bg-slate-800 cursor-pointer"
                />
              </div>
            </label>

            <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/60 cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-1 bg-cyan-400 rounded-full" />
                <span>Stand Guidance Lines</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                  {featureCounts.standGuidance || 0}
                </span>
                <input
                  type="checkbox"
                  checked={layers.standGuidance}
                  onChange={() => toggleLayer('standGuidance')}
                  className="rounded border-slate-700 text-sky-500 focus:ring-0 bg-slate-800 cursor-pointer"
                />
              </div>
            </label>

            <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/60 cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />
                <span>Jet Bridges (PBB)</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                  {featureCounts.jetBridges || 0}
                </span>
                <input
                  type="checkbox"
                  checked={layers.jetBridges}
                  onChange={() => toggleLayer('jetBridges')}
                  className="rounded border-slate-700 text-sky-500 focus:ring-0 bg-slate-800 cursor-pointer"
                />
              </div>
            </label>
          </div>
        </div>

        {/* 4. SAFETY & HOT SPOTS */}
        <div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-mono">
            Safety & Protection
          </div>
          <div className="space-y-1">
            <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/60 cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />
                <span>Runway Hot Spots</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                  {featureCounts.hotspots || 0}
                </span>
                <input
                  type="checkbox"
                  checked={layers.hotspots}
                  onChange={() => toggleLayer('hotspots')}
                  className="rounded border-slate-700 text-sky-500 focus:ring-0 bg-slate-800 cursor-pointer"
                />
              </div>
            </label>

            <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/60 cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-orange-500/50 border border-orange-400" />
                <span>Safety Areas (RSA/OFA)</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                  {featureCounts.safetyAreas || 0}
                </span>
                <input
                  type="checkbox"
                  checked={layers.safetyAreas}
                  onChange={() => toggleLayer('safetyAreas')}
                  className="rounded border-slate-700 text-sky-500 focus:ring-0 bg-slate-800 cursor-pointer"
                />
              </div>
            </label>
          </div>
        </div>

        {/* 5. VERTICAL STRUCTURES & NAVAIDS */}
        <div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-mono">
            Obstacles & NAVAIDs
          </div>
          <div className="space-y-1">
            <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/60 cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <span>Vertical Obstacles (Tower/Hangars)</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                  {featureCounts.obstacles || 0}
                </span>
                <input
                  type="checkbox"
                  checked={layers.obstacles}
                  onChange={() => toggleLayer('obstacles')}
                  className="rounded border-slate-700 text-sky-500 focus:ring-0 bg-slate-800 cursor-pointer"
                />
              </div>
            </label>

            <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/60 cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
                <span>NAVAIDs (LOC / PAPI / Radar)</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                  {featureCounts.navaids || 0}
                </span>
                <input
                  type="checkbox"
                  checked={layers.navaids}
                  onChange={() => toggleLayer('navaids')}
                  className="rounded border-slate-700 text-sky-500 focus:ring-0 bg-slate-800 cursor-pointer"
                />
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
