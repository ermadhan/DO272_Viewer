import React, { useEffect, useState } from 'react';
import { AlertCircle, Download, Loader2, X } from 'lucide-react';
import { fetchOsmAerodrome, findOsmAirports, OsmAirportCandidate } from '../data/aerodromes';
import { OsmSnapshotInput } from '../types/do272';
import {
  activateCuratedSnapshot, CuratedSnapshot, CuratedSnapshotSummary, getCuratedSnapshot,
  getCuratedSnapshots, importCurated, restoreOriginalBaseline,
} from '../services/aerodromeApi';

interface DataIngestModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIcao: string;
  databaseEngine: 'sqlite' | 'postgres';
  databaseLocation: string | null;
  onOsmLoaded: (snapshot: OsmSnapshotInput) => Promise<void>;
  onCuratedActivated: (icao: string) => void;
}

export const DataIngestModal: React.FC<DataIngestModalProps> = ({
  isOpen, onClose, selectedIcao, databaseEngine, databaseLocation, onOsmLoaded, onCuratedActivated,
}) => {
  const [icao, setIcao] = useState(selectedIcao);
  const [tab, setTab] = useState<'osm' | 'curated'>('curated');
  const [provider, setProvider] = useState<'faa' | 'nats' | 'ourairports'>('faa');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CuratedSnapshot | null>(null);
  const [history, setHistory] = useState<CuratedSnapshotSummary[]>([]);
  const [candidates, setCandidates] = useState<OsmAirportCandidate[]>([]);
  const [candidateIndex, setCandidateIndex] = useState('');

  useEffect(() => {
    if (isOpen) {
      setIcao(selectedIcao);
      setPreview(null);
      setHistory([]);
      setError(null);
      setCandidates([]);
      setCandidateIndex('');
    }
  }, [isOpen, selectedIcao]);

  if (!isOpen) return null;
  const code = icao.trim().toUpperCase();
  const execute = async (action: () => Promise<void>) => {
    if (!/^[A-Z]{4}$/.test(code)) {
      setError('Enter a four-letter ICAO airport code.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await action();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Import failed.');
    } finally {
      setLoading(false);
    }
  };
  const loadHistory = async () => setHistory(await getCuratedSnapshots(code));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-auto text-slate-100">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold">Add airport / import data</h2>
            <p className="text-xs text-slate-400">Enter a new or existing airport ICAO code.</p>
          </div>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 text-xs">
          <p className="text-slate-400">Saving to {databaseEngine === 'sqlite' ? 'SQLite' : 'PostgreSQL'}: {databaseLocation || 'location unavailable'}</p>
          <p className="text-slate-400">Original airport data is in do272_aerodromes and do272_features. Imported curated and OSM data is saved in do272_source_snapshots and do272_snapshot_features. A reviewed selection is recorded in do272_active_curated_snapshots.</p>
          <label className="block text-slate-300">
            Airport ICAO
            <input value={icao} onChange={event => {
              setIcao(event.target.value.toUpperCase()); setPreview(null); setHistory([]); setError(null);
              setCandidates([]); setCandidateIndex('');
            }} maxLength={4} className="mt-1 block w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm" />
          </label>
          <div className="flex gap-2">
            <button onClick={() => setTab('curated')} className={`px-3 py-2 rounded ${tab === 'curated' ? 'bg-sky-700' : 'bg-slate-800'}`}>Curated feed</button>
            <button onClick={() => setTab('osm')} className={`px-3 py-2 rounded ${tab === 'osm' ? 'bg-sky-700' : 'bg-slate-800'}`}>OpenStreetMap</button>
          </div>
          {tab === 'curated' ? (
            <div className="space-y-3">
              <label className="block text-slate-300">Feed provider
                <select value={provider} onChange={event => {
                  setProvider(event.target.value as 'faa' | 'nats' | 'ourairports'); setPreview(null); setError(null);
                }} className="block w-full mt-1 p-2 bg-slate-950 border border-slate-700 rounded">
                  <option value="faa">United States — FAA NASR</option>
                  <option value="nats">United Kingdom — NATS UK AIP</option>
                  <option value="ourairports">Worldwide — OurAirports community</option>
                </select>
              </label>
              <p className="text-slate-300">These feeds provide partial data, not a complete AMDB. Official Germany, UAE and India feeds are not available here.</p>
              {provider === 'nats' && <p className="text-amber-300">NATS UK AIP: for aviation use only; not for resale. Runway lines connect published thresholds and may not span the physical runway. Verify the <a href="https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/digital-datasets/" target="_blank" rel="noreferrer" className="underline">dataset terms</a> before use.</p>}
              {provider === 'ourairports' && <p className="text-amber-300">OurAirports is community-maintained, not official AIP data. Coverage and currency are not verified; do not use for navigation or safety decisions.</p>}
              <div className="flex gap-2">
                <button disabled={loading} onClick={() => execute(async () => {
                  const snapshot = await importCurated(code, provider);
                  setPreview(snapshot);
                  await loadHistory();
                })} className="flex items-center gap-2 px-3 py-2 bg-sky-700 rounded disabled:opacity-50">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Import for review
                </button>
                <button disabled={loading} onClick={() => execute(loadHistory)} className="px-3 py-2 bg-slate-800 rounded disabled:opacity-50">Load saved imports</button>
              </div>
              {history.length > 0 && (
                <label className="block text-slate-300">Saved curated imports
                  <select value={preview?.id ?? ''} onChange={event => {
                    if (event.target.value) void execute(async () => setPreview(await getCuratedSnapshot(code, Number(event.target.value))));
                  }} className="block w-full mt-1 p-2 bg-slate-950 border border-slate-700 rounded">
                    <option value="">Select a snapshot to review</option>
                    {history.map(item => <option key={item.id} value={item.id}>{item.provider} — {item.effectiveDate || item.capturedAt || 'date unknown'} — {item.featureCount} features{item.active ? ' (active)' : ''}</option>)}
                  </select>
                </label>
              )}
              {preview && (
                <div className="p-3 bg-slate-950 border border-slate-700 rounded space-y-2">
                  <p className="text-white font-semibold">{preview.dataset.name} ({preview.dataset.icao})</p>
                  <p className="text-emerald-300">Saved in the database as snapshot #{preview.id}. Activation is separate.</p>
                  <p>{preview.provider || 'Legacy curated seed'} · effective {preview.effectiveDate || 'unknown'} · {preview.dataset.features.length} features</p>
                  <p>{preview.coverage || 'Original baseline provenance is unverified.'}</p>
                  {preview.attribution && <p>Attribution: {preview.attribution}</p>}
                  {preview.license && <p className="text-amber-300">{preview.license}</p>}
                  {preview.comparison && <div>
                    <p>{preview.comparison.baselineAvailable ? 'Baseline at import vs snapshot counts:' : 'No curated baseline at import; snapshot counts:'}</p>
                    {Array.from(new Set([...Object.keys(preview.comparison.baselineCounts), ...Object.keys(preview.comparison.importCounts)])).sort().map(name =>
                      <p key={name}>{name}: {preview.comparison?.baselineCounts[name] || 0} → {preview.comparison?.importCounts[name] || 0}</p>)}
                    {(preview.comparison.runways ?? []).map(runway => <p key={runway.designator}>
                      {runway.designator}: length {runway.baselineLength ?? 'unknown'} → {runway.importLength ?? 'unknown'} m;
                      width {runway.baselineWidth ?? 'unknown'} → {runway.importWidth ?? 'unknown'} m
                    </p>)}
                  </div>}
                  {preview.skippedRunways && preview.skippedRunways.length > 0 && <p className="text-amber-300">Unmapped runway records: {preview.skippedRunways.join(', ')}</p>}
                  {preview.sourceUrl && <a className="text-sky-400 underline" href={preview.sourceUrl} target="_blank" rel="noreferrer">Source archive</a>}
                  <p className="text-amber-300">Activation replaces the displayed baseline with this snapshot, including any missing classes. Existing data remains stored.</p>
                  <button disabled={loading} onClick={() => execute(async () => {
                    await activateCuratedSnapshot(code, preview.id);
                    onCuratedActivated(code);
                    onClose();
                  })} className="block px-3 py-2 bg-amber-700 rounded disabled:opacity-50">Activate reviewed snapshot</button>
                </div>
              )}
              <button disabled={loading} onClick={() => execute(async () => {
                await restoreOriginalBaseline(code);
                onCuratedActivated(code);
                onClose();
              })} className="text-slate-300 underline disabled:opacity-50">Restore original baseline</button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-slate-300">Find and confirm the mapped airport before importing a separate, display-only OSM snapshot. A mapped airport boundary is required.</p>
              <button disabled={loading} onClick={() => execute(async () => {
                const found = await findOsmAirports(code);
                setCandidates(found);
                setCandidateIndex('');
                if (!found.length) throw new Error(`No OSM aerodrome with ICAO ${code} was found.`);
              })} className="px-3 py-2 bg-slate-800 rounded disabled:opacity-50">Find airport</button>
              {candidates.length > 0 && (
                <label className="block">Confirm airport
                  <select value={candidateIndex} onChange={event => setCandidateIndex(event.target.value)} className="block w-full mt-1 p-2 bg-slate-950 border border-slate-700 rounded">
                    <option value="">Select a matching airport</option>
                    {candidates.map((candidate, index) => <option key={`${candidate.type}-${candidate.id}`} value={index}>{candidate.name} — {candidate.center.join(', ')} — {candidate.type}/{candidate.id}{candidate.type === 'node' ? ' (no boundary)' : ''}</option>)}
                  </select>
                </label>
              )}
              <button disabled={loading} onClick={() => execute(async () => {
                if (candidateIndex === '') throw new Error('Find and select an airport first.');
                const snapshot = await fetchOsmAerodrome(code, candidates[Number(candidateIndex)]);
                await onOsmLoaded(snapshot);
                onClose();
              })} className="px-3 py-2 bg-sky-700 rounded disabled:opacity-50">
                {loading ? 'Fetching…' : 'Fetch and save OSM'}
              </button>
            </div>
          )}
          {error && <div role="alert" className="flex gap-2 p-3 bg-rose-950 border border-rose-900 rounded text-rose-200"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
        </div>
      </div>
    </div>
  );
};
