'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface BloodBankLocationPickerProps {
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  initialAddress?: string | null;
  districtName?: string;
  onLocationConfirmed: (location: { latitude: number; longitude: number; address: string }) => void | Promise<void>;
  onCancel?: () => void;
  confirmButtonLabel?: string;
  isSaving?: boolean;
}

interface GeocodingFeature {
  id: string;
  place_name: string;
  center: [number, number]; // [lng, lat]
}

export default function BloodBankLocationPicker({
  initialLatitude,
  initialLongitude,
  initialAddress = '',
  districtName = 'Pune',
  onLocationConfirmed,
  onCancel,
  confirmButtonLabel = 'Confirm Blood Bank Location',
  isSaving = false,
}: BloodBankLocationPickerProps) {
  // Default coordinates: Maharashtra / Pune fallback
  const defaultLat = initialLatitude || 18.5204;
  const defaultLng = initialLongitude || 73.8567;

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  const [currentLat, setCurrentLat] = useState<number>(defaultLat);
  const [currentLng, setCurrentLng] = useState<number>(defaultLng);
  const [addressInput, setAddressInput] = useState<string>(initialAddress || '');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<GeocodingFeature[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isExplicitlyConfirmed, setIsExplicitlyConfirmed] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showManualInputs, setShowManualInputs] = useState<boolean>(false);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

  // Update marker position and optionally pan map
  const updatePosition = useCallback((lng: number, lat: number, pan = false) => {
    // Validate bounds
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

    setCurrentLat(Number(lat.toFixed(6)));
    setCurrentLng(Number(lng.toFixed(6)));
    setIsExplicitlyConfirmed(false); // Reset confirmation if pin moves

    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    }

    if (pan && mapRef.current) {
      mapRef.current.flyTo({ center: [lng, lat], zoom: 15, essential: true });
    }
  }, []);

  // Initialize Mapbox map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapboxToken || mapboxToken.trim() === '' || mapboxToken.includes('your_mapbox')) {
      setMapError('Mapbox access token is not configured in NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN. Manual coordinate input is active.');
      setShowManualInputs(true);
      return;
    }

    try {
      mapboxgl.accessToken = mapboxToken;

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [defaultLng, defaultLat],
        zoom: initialLatitude && initialLongitude ? 15 : 12,
      });

      map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');
      map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

      // Create draggable custom marker
      const el = document.createElement('div');
      el.className = 'blood-bank-custom-marker';
      el.innerHTML = `
        <div style="cursor: grab; display: flex; flex-direction: column; align-items: center;">
          <div style="background: #dc2626; color: white; width: 36px; height: 36px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); border: 2px solid white;">
            <svg style="transform: rotate(45deg); width: 18px; height: 18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>
          <div style="background: rgba(15, 23, 42, 0.85); color: white; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-top: 4px; white-space: nowrap; pointer-events: none;">
            Facility Entrance
          </div>
        </div>
      `;

      const marker = new mapboxgl.Marker({
        element: el,
        draggable: true,
      })
        .setLngLat([defaultLng, defaultLat])
        .addTo(map);

      marker.on('dragend', () => {
        const lngLat = marker.getLngLat();
        updatePosition(lngLat.lng, lngLat.lat, false);
      });

      // Allow clicking map anywhere to place pin
      map.on('click', (e) => {
        updatePosition(e.lngLat.lng, e.lngLat.lat, false);
      });

      map.on('error', (e) => {
        console.warn('[Mapbox Error]', e.error?.message || e);
        setMapError('Unable to load Mapbox map tiles. Please verify your connection or use manual coordinates.');
      });

      mapRef.current = map;
      markerRef.current = marker;

      // Ensure canvas recalculates dimensions once modal container transition settles
      const resizeTimer = setTimeout(() => {
        try {
          map.resize();
        } catch {}
      }, 150);

      return () => {
        clearTimeout(resizeTimer);
        marker.remove();
        map.remove();
      };
    } catch (err: any) {
      console.warn('[Mapbox Init Error]', err);
      setMapError(err.message || 'WebGL is not supported or Mapbox failed to initialize.');
      setShowManualInputs(true);
    }
  }, [defaultLat, defaultLng, initialLatitude, initialLongitude, mapboxToken, updatePosition]);

  // Mapbox Geocoding Address Search
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    if (!mapboxToken || mapboxToken.trim() === '') {
      setMapError('Mapbox token not available for address geocoding.');
      return;
    }

    setIsSearching(true);
    setSearchResults([]);

    try {
      const proximity = `${currentLng},${currentLat}`;
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        searchQuery + (districtName ? ` ${districtName} Maharashtra` : '')
      )}.json?country=in&proximity=${proximity}&types=poi,address,neighborhood,locality&access_token=${encodeURIComponent(
        mapboxToken
      )}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
      const data = await res.json();

      if (data.features && data.features.length > 0) {
        setSearchResults(
          data.features.map((f: any) => ({
            id: f.id,
            place_name: f.place_name,
            center: f.center,
          }))
        );
      } else {
        setSearchResults([]);
      }
    } catch (err: any) {
      console.warn('[Geocoding Error]', err);
      setMapError('Address search request failed. You may position the map pin manually or type coordinates.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (feature: GeocodingFeature) => {
    const [lng, lat] = feature.center;
    updatePosition(lng, lat, true);
    setAddressInput(feature.place_name);
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleManualCoordChange = (latVal: string, lngVal: string) => {
    const lat = parseFloat(latVal);
    const lng = parseFloat(lngVal);
    if (!isNaN(lat) && !isNaN(lng)) {
      updatePosition(lng, lat, true);
    }
  };

  const handleConfirmSubmit = async () => {
    if (!isExplicitlyConfirmed) {
      alert('Please check the confirmation box acknowledging that this pin marks the facility entrance / donor reception.');
      return;
    }

    try {
      await onLocationConfirmed({
        latitude: currentLat,
        longitude: currentLng,
        address: addressInput.trim(),
      });
      setSuccessMessage('Location successfully verified and recorded.');
    } catch (err: any) {
      setMapError(err.message || 'Failed to persist Blood Bank location.');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Header & Purpose Banner */}
      <div className="p-5 border-b border-slate-100 bg-slate-50/70">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-red-100 text-red-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </span>
              <h3 className="font-bold text-slate-800 text-base">Blood Bank Exact Location Confirmation</h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Place the pin accurately at your <strong>facility entrance or donor reception desk</strong>. This is strictly required to calculate straight-line donor proximity and emergency driving travel routes.
            </p>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-600 text-sm font-medium p-1 rounded-lg hover:bg-slate-200/50 transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Notice Banner */}
        <div className="mt-3 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-2.5 flex items-start gap-2">
          <span className="font-bold text-amber-700">Notice:</span>
          <span>
            Do not use generic city centers. The pin must reflect where voluntary donors physically arrive. Your browser&apos;s personal GPS is not automatically assigned.
          </span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Search Bar */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Search Facility Address / Landmark</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(e)}
              placeholder="e.g. Gupta Life Blood Centre, FC Road, Shivajinagar"
              className="flex-1 px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
            <button
              type="button"
              onClick={() => handleSearch()}
              disabled={isSearching || !searchQuery.trim()}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
            >
              {isSearching ? 'Searching...' : 'Locate on Map'}
            </button>
          </div>

          {/* Autocomplete Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-lg mt-1 divide-y divide-slate-100 z-10">
              <div className="bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-500 uppercase">
                Matching Mapbox Results ({searchResults.length})
              </div>
              {searchResults.map((res) => (
                <button
                  key={res.id}
                  type="button"
                  onClick={() => handleSelectSearchResult(res)}
                  className="w-full text-left px-3.5 py-2 hover:bg-red-50/50 transition-colors flex items-start gap-2 text-xs"
                >
                  <span className="text-red-500 mt-0.5">📍</span>
                  <span className="text-slate-700">{res.place_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mapbox Canvas Container */}
        <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-slate-100 h-72">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Instructions Overlay */}
          <div className="absolute top-2 left-2 bg-white/95 backdrop-blur-sm border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm text-[11px] text-slate-600 font-medium pointer-events-none">
            💡 Drag marker or click map to reposition entrance pin
          </div>

          {/* Map Error Banner */}
          {mapError && (
            <div className="absolute bottom-2 left-2 right-2 bg-amber-500/95 text-white text-xs p-2.5 rounded-lg backdrop-blur-sm shadow flex items-center justify-between">
              <span>{mapError}</span>
              <button
                type="button"
                onClick={() => setShowManualInputs(true)}
                className="underline font-bold text-white text-[11px] ml-2"
              >
                Use Manual Input
              </button>
            </div>
          )}
        </div>

        {/* Manual Coordinates Toggle */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowManualInputs(!showManualInputs)}
            className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
          >
            {showManualInputs ? 'Hide Coordinate Controls' : 'Edit Exact Decimal Coordinates Manually'}
          </button>
          <span className="text-xs text-slate-400">WGS84 Standard (EPSG:4326)</span>
        </div>

        {/* Selected Coordinates Readout / Edit */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Latitude (Confirmed)
            </label>
            {showManualInputs ? (
              <input
                type="number"
                step="0.000001"
                min="-90"
                max="90"
                value={currentLat}
                onChange={(e) => handleManualCoordChange(e.target.value, String(currentLng))}
                className="w-full px-3 py-1.5 text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            ) : (
              <div className="text-sm font-mono font-bold text-slate-800">{currentLat.toFixed(6)}° N</div>
            )}
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Longitude (Confirmed)
            </label>
            {showManualInputs ? (
              <input
                type="number"
                step="0.000001"
                min="-180"
                max="180"
                value={currentLng}
                onChange={(e) => handleManualCoordChange(String(currentLat), e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            ) : (
              <div className="text-sm font-mono font-bold text-slate-800">{currentLng.toFixed(6)}° E</div>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Facility Entrance / Donor Reception Address
            </label>
            <input
              type="text"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              placeholder="e.g. Ground Floor, West Wing Reception, 14 Shivaji Road"
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>
        </div>

        {/* Explicit Confirmation Checkbox */}
        <label className="flex items-start gap-3 p-3 bg-red-50/50 rounded-xl border border-red-200/60 cursor-pointer">
          <input
            type="checkbox"
            checked={isExplicitlyConfirmed}
            onChange={(e) => setIsExplicitlyConfirmed(e.target.checked)}
            className="mt-1 h-4 w-4 text-red-600 focus:ring-red-500 border-slate-300 rounded"
          />
          <span className="text-xs text-slate-700 leading-relaxed">
            I verify that these geographic coordinates accurately pinpoint the <strong>Blood Bank facility entrance / donor reception desk</strong>. I understand that donor emergency matching and travel duration calculations rely on these coordinates.
          </span>
        </label>

        {/* Success Feedback */}
        {successMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium flex items-center gap-2">
            <span>✓</span>
            <span>{successMessage}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold transition-all"
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            onClick={handleConfirmSubmit}
            disabled={!isExplicitlyConfirmed || isSaving}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-red-600/20 transition-all flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Saving Location...</span>
              </>
            ) : (
              <span>{confirmButtonLabel}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

