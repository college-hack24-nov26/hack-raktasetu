'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getDistrictCentroid, getCentreCoordinates, Coordinates } from '../config/geography';

interface BloodCentre {
  hospitalCode: string;
  hospitalName: string;
  address?: string | null;
  mobileNo?: string | null;
  hasValidContact: boolean;
  stateCode: number;
  districtCode: number;
}

interface AvailabilityData {
  status: 'available' | 'zero' | 'no_data' | 'unknown' | 'stale';
  rawStockString?: string | null;
  reportedQuantity: number | null;
  quantityUnit?: string | null;
  sourceEntryDate?: string | null;
  retrievedAt: string;
  isStale: boolean;
  source: string;
}

export interface SearchResultItem {
  bloodCentre: BloodCentre;
  availability: AvailabilityData;
}

interface MapboxBloodMapProps {
  districtCode: number;
  results: SearchResultItem[];
  selectedHospitalCode: string | null;
  onSelectCentre: (hospitalCode: string) => void;
  bloodGroup: string;
  component: string;
}

export default function MapboxBloodMap({
  districtCode,
  results,
  selectedHospitalCode,
  onSelectCentre,
  bloodGroup,
  component,
}: MapboxBloodMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<{ [hospitalCode: string]: { marker: mapboxgl.Marker; popup: mapboxgl.Popup } }>({});
  
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

  // Extract centres with valid verified coordinates, ensuring unique hospitalCodes
  const centresWithCoords: { item: SearchResultItem; coords: Coordinates }[] = (() => {
    const seenCodes = new Set<string>();
    const list: { item: SearchResultItem; coords: Coordinates }[] = [];
    for (const item of results) {
      const code = item.bloodCentre?.hospitalCode;
      if (!code || seenCodes.has(code)) continue;
      const coords = getCentreCoordinates(code);
      if (coords) {
        seenCodes.add(code);
        list.push({ item, coords });
      }
    }
    return list;
  })();

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapboxToken || mapboxToken.trim() === '' || mapboxToken.includes('your_mapbox')) {
      setMapError('Mapbox access token is not configured or is a placeholder.');
      return;
    }

    try {
      mapboxgl.accessToken = mapboxToken;

      const centroid = getDistrictCentroid(districtCode);

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [centroid.longitude, centroid.latitude],
        zoom: 11,
        attributionControl: true,
      });

      // Add navigation controls (zoom, pitch, compass)
      map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');

      map.on('load', () => {
        mapRef.current = map;
        setMapLoaded(true);
        setMapError(null);
      });

      map.on('error', (e) => {
        // Log map error gracefully without crashing application
        console.warn('[Mapbox Error]', e.error?.message || e);
        if (!mapLoaded) {
          setMapError('Unable to load Mapbox map tiles. Please check your internet connection or token permissions.');
        }
      });

      return () => {
        map.remove();
        mapRef.current = null;
        setMapLoaded(false);
      };
    } catch (err: any) {
      console.warn('[Mapbox Init Error]', err);
      setMapError(err.message || 'WebGL is not supported or Mapbox failed to initialize.');
    }
  }, [mapboxToken, districtCode]);

  // Update camera when district changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const centroid = getDistrictCentroid(districtCode);
    mapRef.current.flyTo({
      center: [centroid.longitude, centroid.latitude],
      zoom: 11,
      essential: true,
      duration: 1200,
    });
  }, [districtCode, mapLoaded]);

  // Render or Update Markers
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    // Clean up existing markers
    Object.values(markersRef.current).forEach(({ marker }) => marker.remove());
    markersRef.current = {};

    if (centresWithCoords.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();

    centresWithCoords.forEach(({ item, coords }) => {
      const { bloodCentre, availability } = item;
      const isSelected = selectedHospitalCode === bloodCentre.hospitalCode;

      // Create custom marker DOM element
      const el = document.createElement('div');
      el.className = 'group cursor-pointer transition-transform';
      el.style.width = '36px';
      el.style.height = '42px';

      const isStale = availability.isStale || availability.status === 'stale';
      const isAvailable = availability.status === 'available' && !isStale && (availability.reportedQuantity === null || availability.reportedQuantity > 0);
      const isZero = (availability.status === 'zero' || availability.reportedQuantity === 0) && !isStale;

      const statusBadgeText = isAvailable
        ? `${availability.reportedQuantity ?? ''} units reported`
        : isZero
        ? '0 units (Out of Stock)'
        : isStale
        ? 'Stale (>24h)'
        : 'Stock Unverified Online';

      const statusBadgeColor = isAvailable
        ? '#059669'
        : isZero
        ? '#e11d48'
        : isStale
        ? '#d97706'
        : '#64748b';

      el.innerHTML = `
        <div class="relative flex flex-col items-center">
          <div class="w-8 h-8 rounded-full bg-[#B91C32] text-white flex items-center justify-center shadow-lg border-2 border-white transition-all transform ${
            isSelected ? 'scale-125 ring-4 ring-red-300' : 'hover:scale-110'
          }">
            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
          </div>
          <div class="w-2 h-2 bg-[#B91C32] transform rotate-45 -mt-1 shadow-xs"></div>
        </div>
      `;

      // Create popup content
      const popupHtml = `
        <div style="font-family: inherit; padding: 4px 2px; min-width: 200px;">
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 2px;">
            Code #${bloodCentre.hospitalCode}
          </div>
          <div style="font-size: 14px; font-weight: 700; color: #0f172a; line-height: 1.25; margin-bottom: 4px;">
            ${bloodCentre.hospitalName}
          </div>
          <div style="font-size: 11px; color: #475569; margin-bottom: 8px;">
            ${bloodCentre.address || 'Address not listed'}
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; padding: 4px 8px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
            <span style="font-size: 11px; font-weight: 600; color: #334155;">${bloodGroup} ${component}</span>
            <span style="font-size: 11px; font-weight: 700; color: ${statusBadgeColor};">${statusBadgeText}</span>
          </div>
          <div style="font-size: 10px; color: #64748b; margin-bottom: 8px; font-style: italic;">
            * Reported online; not reserved. Call before travel.
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${
              bloodCentre.hasValidContact
                ? `<a href="tel:${bloodCentre.mobileNo}" style="display: block; text-align: center; font-size: 11px; font-weight: 600; padding: 5px 8px; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; border-radius: 6px; text-decoration: none;">
                    📞 Call: ${bloodCentre.mobileNo}
                   </a>`
                : ''
            }
            <a href="https://www.google.com/maps/dir/?api=1&destination=${coords.latitude},${coords.longitude}" target="_blank" rel="noopener noreferrer" style="display: block; text-align: center; font-size: 11px; font-weight: 600; padding: 5px 8px; background: #f1f5f9; color: #1e293b; border: 1px solid #cbd5e1; border-radius: 6px; text-decoration: none;">
              🗺️ Open in Google Maps
            </a>
            <a href="/requests/new?hospitalCode=${bloodCentre.hospitalCode}&hospitalName=${encodeURIComponent(bloodCentre.hospitalName)}&bloodGroup=${encodeURIComponent(bloodGroup)}&component=${encodeURIComponent(component)}" style="display: block; text-align: center; font-size: 11px; font-weight: 700; padding: 6px 8px; background: #B91C32; color: #ffffff; border-radius: 6px; text-decoration: none;">
              Request Blood at this Centre
            </a>
          </div>
        </div>
      `;

      const popup = new mapboxgl.Popup({ offset: 25, closeButton: true, maxWidth: '280px' }).setHTML(popupHtml);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([coords.longitude, coords.latitude])
        .setPopup(popup)
        .addTo(map);

      // Add click handler to select in list
      el.addEventListener('click', () => {
        onSelectCentre(bloodCentre.hospitalCode);
      });

      markersRef.current[bloodCentre.hospitalCode] = { marker, popup };
      bounds.extend([coords.longitude, coords.latitude]);
    });

    // If there are multiple centres with coordinates, fit camera comfortably
    if (centresWithCoords.length > 1) {
      map.fitBounds(bounds, { padding: 50, maxZoom: 13, duration: 800 });
    }
  }, [centresWithCoords, selectedHospitalCode, mapLoaded, bloodGroup, component]);

  // When selectedHospitalCode changes from list click, pan to marker & open popup
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !selectedHospitalCode) return;
    const entry = markersRef.current[selectedHospitalCode];
    if (entry) {
      const lngLat = entry.marker.getLngLat();
      mapRef.current.flyTo({
        center: [lngLat.lng, lngLat.lat],
        zoom: 14,
        essential: true,
        duration: 800,
      });
      entry.marker.togglePopup();
    }
  }, [selectedHospitalCode, mapLoaded]);

  // Graceful fallback when map token is missing or error occurred
  if (mapError) {
    return (
      <div className="h-[320px] lg:h-[580px] w-full rounded-2xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center p-6 text-center shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-red-50 text-[#B91C32] flex items-center justify-center mb-3">
          <svg className="w-6 h-6 fill-current" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
        </div>
        <h3 className="text-sm font-bold text-slate-900 mb-1">Interactive Map Offline</h3>
        <p className="text-xs text-slate-600 max-w-sm mb-4 leading-relaxed">
          {mapError}
        </p>
        <div className="text-[11px] text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
          All blood centres and inventory listings remain fully functional below.
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[360px] sm:h-[440px] lg:h-[620px] rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100">
      {/* Mapbox container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Floating map status chip */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none">
        <div className="bg-white/95 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs text-xs font-semibold text-slate-900 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#B91C32] animate-pulse"></span>
          <span>{centresWithCoords.length} Mapped {centresWithCoords.length === 1 ? 'Centre' : 'Centres'}</span>
        </div>
      </div>
    </div>
  );
}
