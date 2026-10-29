import React, { useState } from 'react';
import { X, Copy, Check, Info, Shield, Layers, Compass } from 'lucide-react';
import { AnyDO272Feature } from '../types/do272';

interface FeatureInspectorProps {
  feature: AnyDO272Feature | null;
  onClose: () => void;
}

export const FeatureInspector: React.FC<FeatureInspectorProps> = ({ feature, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!feature) return null;

  const handleCopyGeoJson = () => {
    navigator.clipboard.writeText(JSON.stringify(feature, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-4 shadow-2xl text-slate-100 w-80 max-h-[calc(100vh-140px)] overflow-y-auto">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <span className="text-[10px] font-mono text-sky-400 uppercase tracking-widest block">
            DO-272 Feature Spec
          </span>
          <h3 className="text-sm font-bold text-white font-mono truncate max-w-[200px]">
            {feature.designator}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3 pt-3 text-xs">
        {/* Core DO-272 Metadata */}
        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 space-y-1.5 font-mono">
          <div className="flex justify-between">
            <span className="text-slate-400">Class:</span>
            <span className="text-sky-300 font-semibold">{feature.featureClass}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Feature ID:</span>
            <span className="text-slate-300 truncate max-w-[150px]">{feature.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Aerodrome:</span>
            <span className="text-emerald-400">{feature.aerodromeId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Operational Status:</span>
            <span className="text-slate-200">{feature.status}</span>
          </div>
        </div>

        {/* Feature-Specific Attributes */}
        <div className="space-y-2">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
            Aeronautical Attributes
          </div>

          {'surface' in feature && feature.surface && (
            <div className="flex justify-between py-1 border-b border-slate-800/60">
              <span className="text-slate-400">Surface Pavement:</span>
              <span className="text-white font-medium">{feature.surface}</span>
            </div>
          )}

          {'pcnRating' in feature && feature.pcnRating && (
            <div className="flex justify-between py-1 border-b border-slate-800/60 font-mono">
              <span className="text-slate-400">PCN Rating:</span>
              <span className="text-amber-400">{feature.pcnRating}</span>
            </div>
          )}

          {'lengthMeters' in feature && feature.lengthMeters && (
            <div className="flex justify-between py-1 border-b border-slate-800/60 font-mono">
              <span className="text-slate-400">Physical Length:</span>
              <span className="text-slate-200 tabular-nums">
                {feature.lengthMeters} m ({Math.round(feature.lengthMeters * 3.28084)} ft)
              </span>
            </div>
          )}

          {'widthMeters' in feature && feature.widthMeters && (
            <div className="flex justify-between py-1 border-b border-slate-800/60 font-mono">
              <span className="text-slate-400">Width:</span>
              <span className="text-slate-200 tabular-nums">{feature.widthMeters} m</span>
            </div>
          )}

          {'heightAglMeters' in feature && feature.heightAglMeters !== undefined && (
            <div className="flex justify-between py-1 border-b border-slate-800/60 font-mono">
              <span className="text-slate-400">Height (AGL):</span>
              <span className="text-purple-300 font-semibold tabular-nums">
                {feature.heightAglMeters} m ({Math.round(feature.heightAglMeters * 3.28084)} ft)
              </span>
            </div>
          )}

          {'elevationAmslMeters' in feature && feature.elevationAmslMeters !== undefined && (
            <div className="flex justify-between py-1 border-b border-slate-800/60 font-mono">
              <span className="text-slate-400">Elevation (AMSL):</span>
              <span className="text-purple-300 tabular-nums">{feature.elevationAmslMeters} m</span>
            </div>
          )}

          {'icaoCodeLetter' in feature && (
            <div className="flex justify-between py-1 border-b border-slate-800/60">
              <span className="text-slate-400">ICAO Aircraft Code:</span>
              <span className="text-cyan-400 font-bold font-mono">Code {feature.icaoCodeLetter}</span>
            </div>
          )}

          {'holdingCategory' in feature && feature.holdingCategory && (
            <div className="flex justify-between py-1 border-b border-slate-800/60">
              <span className="text-slate-400">Hold Category:</span>
              <span className="text-rose-400 font-bold font-mono">{feature.holdingCategory}</span>
            </div>
          )}

          {'ilsCat' in feature && feature.ilsCat && (
            <div className="flex justify-between py-1 border-b border-slate-800/60 font-mono">
              <span className="text-slate-400">ILS Category:</span>
              <span className="text-emerald-400">{feature.ilsCat}</span>
            </div>
          )}

          {'hazardDescription' in feature && feature.hazardDescription && (
            <div className="p-2 bg-rose-950/40 border border-rose-900/60 rounded text-rose-200 leading-relaxed text-[11px]">
              <span className="font-bold block mb-1">Hazard Advisory:</span>
              {feature.hazardDescription}
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="pt-2">
          <button
            onClick={handleCopyGeoJson}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded-lg transition-colors border border-slate-700"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied DO-272 GeoJSON</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Export Feature JSON</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
