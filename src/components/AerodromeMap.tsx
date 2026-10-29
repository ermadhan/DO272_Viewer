import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  AerodromeDataset,
  AnyDO272Feature,
  TaxiRouteResult,
} from '../types/do272';
import { LayerVisibilityState } from './LayerControls';
import { Layers, MapPin, ZoomIn, ZoomOut, Compass } from 'lucide-react';

interface AerodromeMapProps {
  dataset: AerodromeDataset;
  layers: LayerVisibilityState;
  activeRoute: TaxiRouteResult | null;
  selectedFeature: AnyDO272Feature | null;
  onSelectFeature: (feature: AnyDO272Feature | null) => void;
  highlightedFeatureIds: string[];
}

type BaseMapType = 'dark' | 'satellite' | 'osm' | 'positron';

const BASE_MAPS: Record<BaseMapType, { name: string; url: string; attribution: string }> = {
  dark: {
    name: 'Radar Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CartoDB &copy; OpenStreetMap contributors',
  },
  satellite: {
    name: 'Satellite Ortho',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye',
  },
  osm: {
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  positron: {
    name: 'Positron Chart',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CartoDB &copy; OpenStreetMap contributors',
  },
};

export const AerodromeMap: React.FC<AerodromeMapProps> = ({
  dataset,
  layers,
  activeRoute,
  selectedFeature,
  onSelectFeature,
  highlightedFeatureIds,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const featureLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const [baseMap, setBaseMap] = useState<BaseMapType>('dark');
  const [currentZoom, setCurrentZoom] = useState<number>(14);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: dataset.center,
        zoom: 14,
        zoomControl: false,
        attributionControl: false,
      });

      // Add Base Map Tile Layer
      const tileLayer = L.tileLayer(BASE_MAPS[baseMap].url, {
        maxZoom: 19,
        attribution: BASE_MAPS[baseMap].attribution,
      }).addTo(map);

      tileLayerRef.current = tileLayer;

      // Add Layer Groups
      const featureGroup = L.layerGroup().addTo(map);
      featureLayerGroupRef.current = featureGroup;

      const routeGroup = L.layerGroup().addTo(map);
      routeLayerGroupRef.current = routeGroup;

      map.on('zoomend', () => {
        setCurrentZoom(map.getZoom());
      });

      mapInstanceRef.current = map;
    }

    return () => {
      // Map cleanup on unmount
    };
  }, []);

  // Update Base Map
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    tileLayerRef.current.setUrl(BASE_MAPS[baseMap].url);
  }, [baseMap]);

  // Center Map on Aerodrome Change
  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(dataset.center, 14, { animate: true });
    }
  }, [dataset.icao, dataset.center]);

  // Render DO-272 Features on Map
  useEffect(() => {
    if (!featureLayerGroupRef.current) return;
    featureLayerGroupRef.current.clearLayers();

    dataset.features.forEach((feat) => {
      const isHighlighted = highlightedFeatureIds.includes(feat.id);
      const isSelected = selectedFeature?.id === feat.id;

      // 1. RUNWAY SUBSYSTEM
      if (feat.featureClass === 'RunwayElement' && layers.runways) {
        if (Array.isArray(feat.coordinates) && Array.isArray(feat.coordinates[0])) {
          const latLngs = (feat.coordinates as [number, number][]).map(([lat, lng]) => L.latLng(lat, lng));
          const polygon = L.polygon(latLngs, {
            color: isSelected ? '#38BDF8' : isHighlighted ? '#F43F5E' : '#FFFFFF',
            weight: isSelected || isHighlighted ? 3 : 1.5,
            fillColor: '#1F2937',
            fillOpacity: 0.9,
          });

          polygon.bindTooltip(
            `<div class="font-mono text-xs font-bold text-white bg-slate-900 px-2 py-1 rounded border border-slate-700">
              RWY ${feat.designator} · ${feat.properties?.pcnRating || 'PCN 100'}
            </div>`,
            { permanent: false, direction: 'top', className: 'aero-tooltip' }
          );

          polygon.on('click', () => onSelectFeature(feat));
          polygon.addTo(featureLayerGroupRef.current!);
        }
      }

      // Runway Thresholds
      if (feat.featureClass === 'RunwayThreshold' && layers.thresholds) {
        if (Array.isArray(feat.coordinates) && Array.isArray(feat.coordinates[0])) {
          const latLngs = (feat.coordinates as [number, number][]).map(([lat, lng]) => L.latLng(lat, lng));
          const line = L.polyline(latLngs, {
            color: '#10B981',
            weight: 5,
            opacity: 0.95,
          });
          line.bindTooltip(`THR ${feat.designator}`, { permanent: false });
          line.on('click', () => onSelectFeature(feat));
          line.addTo(featureLayerGroupRef.current!);
        }
      }

      // Blast Pads
      if (feat.featureClass === 'RunwayBlastPad' && layers.blastPads) {
        if (Array.isArray(feat.coordinates) && Array.isArray(feat.coordinates[0])) {
          const latLngs = (feat.coordinates as [number, number][]).map(([lat, lng]) => L.latLng(lat, lng));
          const poly = L.polygon(latLngs, {
            color: '#D97706',
            weight: 2,
            dashArray: '4, 4',
            fillColor: '#78350F',
            fillOpacity: 0.5,
          });
          poly.on('click', () => onSelectFeature(feat));
          poly.addTo(featureLayerGroupRef.current!);
        }
      }

      // 2. TAXIWAY SUBSYSTEM
      if (feat.featureClass === 'TaxiwayElement' && layers.taxiways) {
        if (Array.isArray(feat.coordinates) && Array.isArray(feat.coordinates[0])) {
          const latLngs = (feat.coordinates as [number, number][]).map(([lat, lng]) => L.latLng(lat, lng));
          const poly = L.polygon(latLngs, {
            color: '#4B5563',
            weight: 1,
            fillColor: '#374151',
            fillOpacity: 0.65,
          });
          poly.on('click', () => onSelectFeature(feat));
          poly.addTo(featureLayerGroupRef.current!);
        }
      }

      // Guidance Lines (TGL)
      if (
        (feat.featureClass === 'TaxiwayGuidanceLine' || feat.featureClass === 'StandGuidanceLine') &&
        layers.guidanceLines
      ) {
        if (Array.isArray(feat.coordinates) && Array.isArray(feat.coordinates[0])) {
          const latLngs = (feat.coordinates as [number, number][]).map(([lat, lng]) => L.latLng(lat, lng));
          const line = L.polyline(latLngs, {
            color: isSelected ? '#38BDF8' : '#F59E0B',
            weight: isSelected ? 3.5 : 2,
            opacity: 0.9,
          });
          line.bindTooltip(`${feat.designator}`, { permanent: false });
          line.on('click', () => onSelectFeature(feat));
          line.addTo(featureLayerGroupRef.current!);
        }
      }

      // Hold Short Lines
      if (feat.featureClass === 'RunwayHoldingPosition' && layers.holdingPositions) {
        const coord = Array.isArray(feat.coordinates[0])
          ? (feat.coordinates as [number, number][])[0]
          : (feat.coordinates as [number, number]);

        const marker = L.circleMarker([coord[0], coord[1]], {
          radius: 6,
          color: '#EF4444',
          fillColor: '#B91C1C',
          fillOpacity: 0.9,
          weight: 2,
        });
        marker.bindTooltip(`STOP: ${feat.designator}`, { permanent: false });
        marker.on('click', () => onSelectFeature(feat));
        marker.addTo(featureLayerGroupRef.current!);
      }

      // 3. APRONS & PARKING STANDS
      if (feat.featureClass === 'ParkingStandArea' && layers.parkingStands) {
        if (Array.isArray(feat.coordinates) && Array.isArray(feat.coordinates[0])) {
          const latLngs = (feat.coordinates as [number, number][]).map(([lat, lng]) => L.latLng(lat, lng));
          const poly = L.polygon(latLngs, {
            color: isSelected ? '#38BDF8' : '#06B6D4',
            weight: 1.5,
            fillColor: '#0891B2',
            fillOpacity: 0.35,
          });
          poly.bindTooltip(`Stand ${feat.designator}`, { permanent: false });
          poly.on('click', () => onSelectFeature(feat));
          poly.addTo(featureLayerGroupRef.current!);
        } else if (Array.isArray(feat.coordinates) && typeof feat.coordinates[0] === 'number') {
          const coord = feat.coordinates as [number, number];
          const marker = L.circleMarker([coord[0], coord[1]], {
            radius: 5,
            color: '#06B6D4',
            fillColor: '#0891B2',
            fillOpacity: 0.8,
            weight: 1.5,
          });
          marker.bindTooltip(`Stand ${feat.designator}`, { permanent: false });
          marker.on('click', () => onSelectFeature(feat));
          marker.addTo(featureLayerGroupRef.current!);
        }
      }

      // 4. SAFETY HOT SPOTS
      if (feat.featureClass === 'HotSpot' && layers.hotspots) {
        if (Array.isArray(feat.coordinates) && Array.isArray(feat.coordinates[0])) {
          const latLngs = (feat.coordinates as [number, number][]).map(([lat, lng]) => L.latLng(lat, lng));
          const poly = L.polygon(latLngs, {
            color: '#EF4444',
            weight: 2,
            dashArray: '6, 4',
            fillColor: '#DC2626',
            fillOpacity: 0.35,
          });
          poly.bindTooltip(
            `<div class="bg-rose-950 text-rose-200 border border-rose-800 p-2 text-xs font-mono rounded">
              <strong class="text-rose-400">HOT SPOT: ${feat.designator}</strong>
              <div class="mt-1">${feat.properties?.hazardDescription || 'Incursion Risk'}</div>
            </div>`,
            { permanent: false }
          );
          poly.on('click', () => onSelectFeature(feat));
          poly.addTo(featureLayerGroupRef.current!);
        }
      }

      // Runway Safety Area
      if (feat.featureClass === 'RunwaySafetyArea' && layers.safetyAreas) {
        if (Array.isArray(feat.coordinates) && Array.isArray(feat.coordinates[0])) {
          const latLngs = (feat.coordinates as [number, number][]).map(([lat, lng]) => L.latLng(lat, lng));
          const poly = L.polygon(latLngs, {
            color: '#F97316',
            weight: 1,
            dashArray: '4, 4',
            fillColor: '#EA580C',
            fillOpacity: 0.15,
          });
          poly.on('click', () => onSelectFeature(feat));
          poly.addTo(featureLayerGroupRef.current!);
        }
      }

      // 5. VERTICAL STRUCTURES & OBSTACLES
      if (feat.featureClass === 'VerticalStructure' && layers.obstacles) {
        const coord = feat.coordinates as [number, number];
        const height = feat.properties?.heightAglMeters || 50;

        const iconHtml = `
          <div class="flex items-center justify-center w-6 h-6 rounded-full bg-purple-600/90 border-2 border-purple-200 shadow-md text-[9px] font-mono text-white font-bold cursor-pointer">
            ▲
          </div>`;

        const customIcon = L.divIcon({
          html: iconHtml,
          className: 'custom-obstacle-icon',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const marker = L.marker([coord[0], coord[1]], { icon: customIcon });
        marker.bindTooltip(
          `<div class="bg-slate-900 text-slate-100 border border-purple-800 p-2 text-xs font-mono rounded">
            <span class="text-purple-400 font-bold">${feat.designator}</span>
            <div class="text-[11px] text-slate-300">Height: ${height}m AGL</div>
          </div>`,
          { permanent: false }
        );
        marker.on('click', () => onSelectFeature(feat));
        marker.addTo(featureLayerGroupRef.current!);
      }

      // 6. NAVAIDS
      if (
        [
          'AerodromeReferencePoint',
          'WindDirectionIndicator',
          'VisualGlideSlopeIndicator',
          'LocalizerAntenna',
          'GlidePathAntenna',
          'AirportSurveillanceRadar',
        ].includes(feat.featureClass) &&
        layers.navaids
      ) {
        const coord = feat.coordinates as [number, number];
        const marker = L.circleMarker([coord[0], coord[1]], {
          radius: 5,
          color: '#10B981',
          fillColor: '#059669',
          fillOpacity: 0.9,
          weight: 1.5,
        });
        marker.bindTooltip(`${feat.featureClass}: ${feat.designator}`, { permanent: false });
        marker.on('click', () => onSelectFeature(feat));
        marker.addTo(featureLayerGroupRef.current!);
      }
    });
  }, [dataset, layers, highlightedFeatureIds, selectedFeature]);

  // Render Active Taxiway Route
  useEffect(() => {
    if (!routeLayerGroupRef.current) return;
    routeLayerGroupRef.current.clearLayers();

    if (activeRoute && activeRoute.pathCoordinates.length > 1) {
      const latLngs = activeRoute.pathCoordinates.map(([lat, lng]) => L.latLng(lat, lng));

      // Glow backdrop
      L.polyline(latLngs, {
        color: '#06B6D4',
        weight: 8,
        opacity: 0.4,
      }).addTo(routeLayerGroupRef.current);

      // Main active taxi route
      const routeLine = L.polyline(latLngs, {
        color: '#10B981',
        weight: 4,
        opacity: 0.95,
      }).addTo(routeLayerGroupRef.current);

      // Start and end markers
      L.circleMarker(latLngs[0], {
        radius: 7,
        color: '#F59E0B',
        fillColor: '#D97706',
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip(`Origin: ${activeRoute.origin}`)
        .addTo(routeLayerGroupRef.current);

      L.circleMarker(latLngs[latLngs.length - 1], {
        radius: 7,
        color: '#10B981',
        fillColor: '#059669',
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip(`Destination: ${activeRoute.destination}`)
        .addTo(routeLayerGroupRef.current);

      if (mapInstanceRef.current) {
        mapInstanceRef.current.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
      }
    }
  }, [activeRoute]);

  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();
  const handleResetView = () => mapInstanceRef.current?.setView(dataset.center, 14);

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden">
      {/* Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating HUD Base Map Selector */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1 rounded-lg border border-slate-800 shadow-lg text-xs font-mono">
        <span className="text-slate-400 px-2 flex items-center gap-1.5 text-[11px]">
          <Layers className="w-3.5 h-3.5 text-sky-400" />
          Base:
        </span>
        {(Object.keys(BASE_MAPS) as BaseMapType[]).map((type) => (
          <button
            key={type}
            onClick={() => setBaseMap(type)}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              baseMap === type
                ? 'bg-sky-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {BASE_MAPS[type].name}
          </button>
        ))}
      </div>

      {/* Floating Map Controls & Telemetry */}
      <div className="absolute bottom-6 right-6 z-10 flex flex-col gap-2">
        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-lg p-1.5 shadow-lg flex flex-col gap-1">
          <button
            onClick={handleZoomIn}
            className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetView}
            className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Reset to Aerodrome Center"
          >
            <Compass className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 px-2.5 py-1.5 rounded-lg shadow-lg text-[10px] font-mono text-slate-400 flex items-center gap-2">
          <span>ZOOM: {currentZoom}</span>
          <span>·</span>
          <span>WGS-84</span>
        </div>
      </div>
    </div>
  );
};
