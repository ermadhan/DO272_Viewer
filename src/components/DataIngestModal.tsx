import React, { useState } from 'react';
import { X, Download, Globe, FileCode, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { AerodromeDataset } from '../types/do272';
import { fetchOsmAerodrome } from '../data/aerodromes';

interface DataIngestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDatasetLoaded: (dataset: AerodromeDataset) => void;
}

export const DataIngestModal: React.FC<DataIngestModalProps> = ({
  isOpen,
  onClose,
  onDatasetLoaded,
}) => {
  const [activeIngestTab, setActiveIngestTab] = useState<'osm' | 'faa'>('osm');
  const [searchIcao, setSearchIcao] = useState<string>('KJFK');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState<boolean>(false);

  // FAA GeoJSON state
  const [faaJsonInput, setFaaJsonInput] = useState<string>('');

  if (!isOpen) return null;

  const handleFetchOsm = async () => {
    if (!searchIcao.trim()) return;
    setIsLoading(true);
    setStatusMessage(`Connecting to OpenStreetMap Overpass API for ${searchIcao.toUpperCase()}...`);
    setIsError(false);

    try {
      const dataset = await fetchOsmAerodrome(searchIcao);
      setStatusMessage(
        `Successfully classified ${dataset.features.length} DO-272 features for ${dataset.name}!`
      );
      setTimeout(() => {
        onDatasetLoaded(dataset);
        onClose();
      }, 900);
    } catch (err: unknown) {
      setIsError(true);
      const msg = err instanceof Error ? err.message : 'Unknown error during open data ingestion';
      setStatusMessage(`Ingest Failed: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportFaaJson = () => {
    try {
      const parsed = JSON.parse(faaJsonInput);
      const features = parsed.features || [];
      const newDataset: AerodromeDataset = {
        icao: 'FAA-IMP',
        iata: 'IMP',
        name: parsed.name || 'FAA Airport GIS Imported',
        city: 'Imported',
        country: 'United States',
        center: [37.6188, -122.375],
        elevationMeters: 10,
        magneticVariation: '0.0°',
        transitionAltitudeFt: 18000,
        source: 'US FAA Airport GIS 18B',
        features: features.map((f: Record<string, unknown>, idx: number) => ({
          id: `FAA-${idx}`,
          aerodromeId: 'FAA-IMP',
          featureClass: 'RunwayElement',
          designator: `RWY-${idx}`,
          status: 'Active',
          lengthMeters: 3000,
          widthMeters: 45,
          trueHeading: 0,
          surface: 'Asphalt',
          pcnRating: '100/F/A/W/T',
          coordinates: [
            [37.61, -122.38],
            [37.62, -122.37],
          ],
          properties: f.properties || {},
        })),
      };

      onDatasetLoaded(newDataset);
      onClose();
    } catch {
      setIsError(true);
      setStatusMessage('Invalid JSON format. Please ensure standard FAA GeoJSON.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden flex flex-col shadow-2xl text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-950 border border-sky-800 flex items-center justify-center text-sky-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-mono">
                Open Data Ingestion Pipeline
              </h2>
              <p className="text-xs text-slate-400">
                Convert live OpenStreetMap Aeroways or FAA Airport GIS datasets into DO-272 standards.
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

        {/* Tab Selection */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-5 pt-3 gap-4 text-xs font-mono">
          <button
            onClick={() => setActiveIngestTab('osm')}
            className={`pb-2.5 transition-colors border-b-2 flex items-center gap-2 ${
              activeIngestTab === 'osm'
                ? 'border-sky-500 text-sky-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-4 h-4" />
            Global OpenStreetMap Aeroway Ingest
          </button>
          <button
            onClick={() => setActiveIngestTab('faa')}
            className={`pb-2.5 transition-colors border-b-2 flex items-center gap-2 ${
              activeIngestTab === 'faa'
                ? 'border-sky-500 text-sky-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-4 h-4" />
            FAA Airport GIS 18B Importer
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs font-mono">
          {activeIngestTab === 'osm' ? (
            <div className="space-y-4">
              <div>
                <label className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1.5">
                  Enter Airport ICAO or IATA Code (Worldwide)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchIcao}
                    onChange={(e) => setSearchIcao(e.target.value.toUpperCase())}
                    placeholder="e.g. KJFK, LFPG, RJTT, WSSS, YSSY..."
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500 font-mono uppercase"
                  />
                  <button
                    onClick={handleFetchOsm}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors text-xs shadow-md"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Querying...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>Fetch &amp; Convert</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Sample Suggestions */}
              <div>
                <span className="text-[10px] text-slate-500 uppercase block mb-1.5">
                  Suggested Global Airports:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {['KJFK', 'KLAX', 'LFPG', 'EHAM', 'RJTT', 'WSSS'].map((code) => (
                    <button
                      key={code}
                      onClick={() => setSearchIcao(code)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors border border-slate-700"
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="text-[11px] text-slate-400 uppercase tracking-wider block">
                Paste FAA AC 150/5300-18B GeoJSON Payload
              </label>
              <textarea
                value={faaJsonInput}
                onChange={(e) => setFaaJsonInput(e.target.value)}
                placeholder='{ "type": "FeatureCollection", "features": [...] }'
                rows={5}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none"
              />
              <button
                onClick={handleImportFaaJson}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg transition-colors text-xs"
              >
                Parse and Normalize to DO-272
              </button>
            </div>
          )}

          {/* Status Alert */}
          {statusMessage && (
            <div
              className={`p-3 rounded-lg border flex items-center gap-2 text-xs ${
                isError
                  ? 'bg-rose-950/40 border-rose-900 text-rose-300'
                  : 'bg-sky-950/40 border-sky-900 text-sky-300'
              }`}
            >
              {isError ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span>{statusMessage}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
