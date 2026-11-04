
'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { authFetch } from '../../config/api';
import { useRealtime } from '../../hooks/useRealtime';
import { STATES_AND_DISTRICTS, getDistrictCentroid } from '../../config/geography';
import { IconMap, IconNavigation } from '../../components/ui/Icons';
import type { RealtimeEventEnvelope } from '@raktasetu/shared';

export interface AdminDonorLocationSnapshot {
  donorUserId: string;
  donorName: string | null;
  phoneNumber?: string;
  bloodGroup: string | null;
  stateCode: number | null;
  districtCode: number | null;
  cityOrLocality: string | null;
  sessionId: string;
  sessionStatus: 'ACTIVE' | 'STOPPED' | 'REVOKED' | 'EXPIRED';
  startedAt: string;
  endedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  batteryLevel: number | null;
  deviceTimestamp: string | null;
  serverReceivedAt: string | null;
  isStale: boolean;
  freshness: 'FRESH' | 'STALE' | 'UNAVAILABLE';
}

interface LiveDonorMapViewProps {
  isPlatformAdmin: boolean;
}

const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

export function getGeographyLabel(stateCode: number | null | undefined, districtCode: number | null | undefined): string {
  if (!stateCode) return 'Not Registered';
  const state = STATES_AND_DISTRICTS.find((s) => s.code === stateCode);
  if (!state) return `State ${stateCode}`;
  if (!districtCode) return state.name;
  const district = state.districts.find((d) => d.code === districtCode);
  return district ? `${district.name}, ${state.name}` : `${state.name} (${districtCode})`;
}

export function LiveDonorMapView({ isPlatformAdmin }: LiveDonorMapViewProps) {
  // Region & Filter State
  const [selectedStateCode, setSelectedStateCode] = useState<number | ''>(27); // Maharashtra by default
  const [selectedDistrictCode, setSelectedDistrictCode] = useState<number | ''>('');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'all'>('ACTIVE');

  // Data & Lifecycle State
  const [donors, setDonors] = useState<AdminDonorLocationSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [selectedDonorId, setSelectedDonorId] = useState<string | null>(null);

  // Mapbox references
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<{ [donorId: string]: { marker: mapboxgl.Marker; popup: mapboxgl.Popup } }>({});
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

  // Districts for selected state
  const availableDistricts = useMemo(() => {
    if (!selectedStateCode) return [];
    const stateObj = STATES_AND_DISTRICTS.find((s) => s.code === selectedStateCode);
    return stateObj ? stateObj.districts : [];
  }, [selectedStateCode]);

  // -------------------------------------------------------------
  // 1. Initial Authoritative Data Loading
  // -------------------------------------------------------------
  const loadLiveLocations = useCallback(async () => {
    if (!isPlatformAdmin) return;

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (selectedStateCode) params.set('stateCode', String(selectedStateCode));
      if (selectedDistrictCode) params.set('districtCode', String(selectedDistrictCode));

      const res = await authFetch(`/api/v1/admin/locations/live?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 403) {
          setError('Access Denied: Only Platform / System Administrators are authorized to view live donor locations.');
          return;
        }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP ${res.status}: Failed to load live donor locations.`);
      }

      const data = await res.json();
      const list: AdminDonorLocationSnapshot[] = data.data || [];
      setDonors(list);
      setLastSyncTime(new Date());
    } catch (err: any) {
      setError(err.message || 'Network error fetching live donor locations.');
    } finally {
      setLoading(false);
    }
  }, [isPlatformAdmin, statusFilter, selectedStateCode, selectedDistrictCode]);

  useEffect(() => {
    loadLiveLocations();
  }, [loadLiveLocations]);

  // -------------------------------------------------------------
  // 2. Realtime WebSocket Subscription
  // -------------------------------------------------------------
  const handleRealtimeEvent = useCallback((event: RealtimeEventEnvelope) => {
    if (!event.eventType.startsWith('donor_location.')) return;

    const payload = event.payload;
    if (!payload || !payload.donorUserId) return;

    setDonors((prev) => {
      const idx = prev.findIndex((d) => d.donorUserId === payload.donorUserId);

      if (event.eventType === 'donor_location.session_started') {
        // Fetch authoritative snapshot to merge complete profile (registered state, district, blood group, name)
        loadLiveLocations();
        return prev;
      }

      if (event.eventType === 'donor_location.updated') {
        if (idx < 0) {
          // If not in current list, load fresh snapshot to retain full donor profile
          loadLiveLocations();
          return prev;
        }

        const updated = [...prev];
        const target = updated[idx];

        // Smoothly update marker coordinates if map is ready
        if (payload.latitude && payload.longitude && markersRef.current[target.donorUserId]) {
          const { marker } = markersRef.current[target.donorUserId];
          marker.setLngLat([payload.longitude, payload.latitude]);
        }

        updated[idx] = {
          ...target,
          latitude: payload.latitude,
          longitude: payload.longitude,
          accuracy: payload.accuracy,
          heading: payload.heading ?? target.heading,
          speed: payload.speed ?? target.speed,
          batteryLevel: payload.batteryLevel ?? target.batteryLevel,
          deviceTimestamp: payload.deviceTimestamp,
          serverReceivedAt: payload.serverReceivedAt || new Date().toISOString(),
          isStale: false,
          freshness: 'FRESH',
        };
        return updated;
      }

      if (event.eventType === 'donor_location.session_ended') {
        // Remove marker from map
        if (markersRef.current[payload.donorUserId]) {
          markersRef.current[payload.donorUserId].marker.remove();
          delete markersRef.current[payload.donorUserId];
        }

        if (statusFilter === 'ACTIVE') {
          return prev.filter((d) => d.donorUserId !== payload.donorUserId);
        }

        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            sessionStatus: payload.status || 'STOPPED',
            endedAt: payload.endedAt,
            freshness: 'UNAVAILABLE',
          };
          return updated;
        }
      }

      return prev;
    });
  }, [loadLiveLocations, statusFilter]);

  // Hook into authenticated WebSocket channel admin:live-locations
  const { status: wsStatus } = useRealtime({
    channel: 'admin:live-locations',
    onEvent: handleRealtimeEvent,
    onReconnect: loadLiveLocations, // Authoritative catch-up on reconnect
    enabled: isPlatformAdmin,
  });

  // -------------------------------------------------------------
  // 3. Dynamic Freshness Recalculation Timer
  // -------------------------------------------------------------
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setDonors((prev) =>
        prev.map((d) => {
          if (!d.serverReceivedAt) return d;
          const age = now - new Date(d.serverReceivedAt).getTime();
          const isStale = age > STALE_THRESHOLD_MS;
          const freshness = isStale ? 'STALE' : 'FRESH';
          if (d.isStale !== isStale || d.freshness !== freshness) {
            return { ...d, isStale, freshness };
          }
          return d;
        })
      );
    }, 30000); // Check every 30 seconds

    return () => clearInterval(timer);
  }, []);

  // -------------------------------------------------------------
  // 4. Mapbox GL Initialization
  // -------------------------------------------------------------
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapboxToken || mapboxToken.trim() === '' || mapboxToken.includes('your_mapbox')) {
      setMapError('Mapbox access token is not configured in NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN.');
      return;
    }

    try {
      mapboxgl.accessToken = mapboxToken;

      const defaultCentroid = getDistrictCentroid(selectedDistrictCode || 521); // Default Pune / Maharashtra

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [defaultCentroid.longitude, defaultCentroid.latitude],
        zoom: 11,
        attributionControl: true,
      });

      map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');
      map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

      map.on('load', () => {
        mapRef.current = map;
        setMapLoaded(true);
        setMapError(null);
      });

      map.on('error', (e) => {
        console.warn('[Mapbox Live Map Error]', e.error?.message || e);
        if (!mapLoaded) {
          setMapError('Unable to load Mapbox vector tiles. Check token permissions or connectivity.');
        }
      });

      return () => {
        // Clean up markers
        Object.values(markersRef.current).forEach(({ marker }) => marker.remove());
        markersRef.current = {};
        map.remove();
        mapRef.current = null;
        setMapLoaded(false);
      };
    } catch (err: any) {
      console.warn('[Mapbox Init Error]', err);
      setMapError(err.message || 'WebGL is not supported or Mapbox failed to initialize.');
    }
  }, [mapboxToken]);

  // Center camera when state or district changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    if (selectedDistrictCode) {
      const centroid = getDistrictCentroid(Number(selectedDistrictCode));
      mapRef.current.flyTo({
        center: [centroid.longitude, centroid.latitude],
        zoom: 11.5,
        essential: true,
        duration: 1200,
      });
    } else if (selectedStateCode) {
      const stateObj = STATES_AND_DISTRICTS.find((s) => s.code === selectedStateCode);
      if (stateObj && stateObj.districts.length > 0) {
        const firstDist = stateObj.districts[0];
        const centroid = getDistrictCentroid(firstDist.code);
        mapRef.current.flyTo({
          center: [centroid.longitude, centroid.latitude],
          zoom: 9.5,
          essential: true,
          duration: 1200,
        });
      }
    }
  }, [selectedDistrictCode, selectedStateCode, mapLoaded]);

  // -------------------------------------------------------------
  // 5. Marker Lifecycle & Rendering
  // -------------------------------------------------------------
  const visibleDonorsWithCoords = useMemo(() => {
    return donors.filter((d) => {
      if (typeof d.latitude !== 'number' || typeof d.longitude !== 'number') return false;
      if (statusFilter === 'ACTIVE' && d.sessionStatus !== 'ACTIVE') return false;
      if (selectedStateCode !== '' && d.stateCode !== selectedStateCode) return false;
      if (selectedDistrictCode !== '' && d.districtCode !== selectedDistrictCode) return false;
      return true;
    });
  }, [donors, selectedStateCode, selectedDistrictCode, statusFilter]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;
    const currentMarkerIds = new Set(Object.keys(markersRef.current));
    const activeIds = new Set(visibleDonorsWithCoords.map((d) => d.donorUserId));

    // Remove obsolete markers
    currentMarkerIds.forEach((id) => {
      if (!activeIds.has(id)) {
        markersRef.current[id].marker.remove();
        delete markersRef.current[id];
      }
    });

    if (visibleDonorsWithCoords.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();

    visibleDonorsWithCoords.forEach((donor) => {
      const { donorUserId, latitude, longitude, donorName, bloodGroup, accuracy, freshness, serverReceivedAt, batteryLevel } = donor;
      if (latitude === null || longitude === null) return;

      bounds.extend([longitude, latitude]);

      const isStale = freshness === 'STALE';
      const displayName = donorName || (donorUserId ? `Registered Donor (${donorUserId.slice(0, 6)})` : 'Registered Donor');
      const timeStr = serverReceivedAt ? new Date(serverReceivedAt).toLocaleTimeString() : 'N/A';
      const accuracyStr = accuracy ? `±${Math.round(accuracy)}m` : 'GPS Standard';
      const geoLabel = getGeographyLabel(donor.stateCode, donor.districtCode);

      // HTML Popup markup (Strict privacy: NO phone numbers or home addresses)
      const popupHtml = `
        <div style="font-family: system-ui, sans-serif; padding: 4px; min-width: 230px;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 6px;">
            <span style="font-weight: 800; font-size: 13px; color: #0f172a;">${displayName}</span>
            <span style="background: ${isStale ? '#fef3c7' : '#dcfce7'}; color: ${isStale ? '#92400e' : '#166534'}; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 9999px;">
              ${isStale ? 'Stale (>15m)' : 'Live'}
            </span>
          </div>
          <div style="font-size: 11px; color: #475569; display: flex; flex-direction: column; gap: 4px;">
            <div style="display: flex; justify-content: space-between;">
              <span style="font-weight: 600;">Blood Group:</span>
              <span style="font-weight: 800; color: #dc2626;">${bloodGroup || 'Not Specified'}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="font-weight: 600;">Registered Region:</span>
              <span style="font-weight: 600; color: #1e293b;">${geoLabel}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="font-weight: 600;">GPS Accuracy:</span>
              <span>${accuracyStr}</span>
            </div>
            ${batteryLevel !== null ? `
            <div style="display: flex; justify-content: space-between;">
              <span style="font-weight: 600;">Device Battery:</span>
              <span>${Math.round(batteryLevel * 100)}%</span>
            </div>` : ''}
            <div style="display: flex; justify-content: space-between; border-top: 1px solid #f1f5f9; padding-top: 4px; margin-top: 2px;">
              <span style="font-size: 10px; color: #94a3b8;">Last Server Update:</span>
              <span style="font-size: 10px; font-family: monospace; color: #0f172a;">${timeStr}</span>
            </div>
          </div>
        </div>
      `;

      if (markersRef.current[donorUserId]) {
        // Update existing marker position & popup
        const { marker, popup } = markersRef.current[donorUserId];
        marker.setLngLat([longitude, latitude]);
        popup.setHTML(popupHtml);

        // Update visual pulse class
        const el = marker.getElement();
        if (isStale) {
          el.classList.remove('live-pulse');
          el.style.backgroundColor = '#d97706';
        } else {
          el.classList.add('live-pulse');
          el.style.backgroundColor = '#dc2626';
        }
      } else {
        // Create custom DOM Marker
        const el = document.createElement('div');
        el.className = `donor-mapbox-marker ${isStale ? 'marker-stale' : 'live-pulse'}`;
        el.style.width = '32px';
        el.style.height = '32px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = isStale ? '#d97706' : '#dc2626';
        el.style.border = '2.5px solid #ffffff';
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.color = '#ffffff';
        el.style.fontSize = '10px';
        el.style.fontWeight = '800';
        el.style.cursor = 'pointer';
        el.title = `${displayName} (${bloodGroup || 'Donor'})`;
        el.innerText = bloodGroup ? bloodGroup.replace('_POSITIVE', '+').replace('_NEGATIVE', '-') : '🩸';

        const popup = new mapboxgl.Popup({ offset: 18, closeButton: true, maxWidth: '280px' }).setHTML(popupHtml);

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([longitude, latitude])
          .setPopup(popup)
          .addTo(map);

        el.addEventListener('click', () => {
          setSelectedDonorId(donorUserId);
        });

        markersRef.current[donorUserId] = { marker, popup };
      }
    });

    // Auto fit bounds on initial load if markers exist
    if (!selectedDistrictCode && visibleDonorsWithCoords.length > 1) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 1000 });
    }
  }, [visibleDonorsWithCoords, mapLoaded, selectedDistrictCode]);

  // Center on donor from list
  const handleCenterOnDonor = (donor: AdminDonorLocationSnapshot) => {
    setSelectedDonorId(donor.donorUserId);
    if (!mapRef.current || !donor.latitude || !donor.longitude) return;

    mapRef.current.flyTo({
      center: [donor.longitude, donor.latitude],
      zoom: 14,
      essential: true,
      duration: 1000,
    });

    if (markersRef.current[donor.donorUserId]) {
      markersRef.current[donor.donorUserId].popup.addTo(mapRef.current);
    }
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSelectedStateCode(27);
    setSelectedDistrictCode('');
    setStatusFilter('ACTIVE');
  };

  // -------------------------------------------------------------
  // Access Guard for Non-Admin Users
  // -------------------------------------------------------------
  if (!isPlatformAdmin) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center max-w-xl mx-auto my-12 shadow-xs">
        <div className="w-12 h-12 bg-red-100 text-red-700 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
          ✕
        </div>
        <h2 className="text-lg font-bold text-red-900 mb-2">Access Restricted</h2>
        <p className="text-xs text-red-700 leading-relaxed">
          The Live Donor Map is authorized exclusively for Platform / System Administrators. Blood Bank staff, Collection teams, and Camp coordinators are strictly restricted from accessing live donor coordinates under CDSCO emergency privacy regulations.
        </p>
      </div>
    );
  }

  const freshCount = donors.filter((d) => d.freshness === 'FRESH' && d.sessionStatus === 'ACTIVE').length;
  const staleCount = donors.filter((d) => d.freshness === 'STALE' && d.sessionStatus === 'ACTIVE').length;

  return (
    <div className="space-y-4">
      {/* ======================================================== */}
      {/* 1. HEADER & CONTROL BAR                                  */}
      {/* ======================================================== */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-purple-100 text-purple-800">
                Platform Admin Only
              </span>
              <span className="text-xs font-semibold text-slate-500">
                CDSCO Emergency Donor Coordination
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                wsStatus === 'connected' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                {wsStatus === 'connected' ? 'WebSocket Live' : `Syncing (${wsStatus})`}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
              <IconMap className="text-[#C51F3A]" size={20} />
              <span>Live Donor Geospatial Map</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-time locations of donors currently transmitting with explicit consent. Exact coordinates are protected and zero route history is stored.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
              <div className="text-[10px] font-bold uppercase text-emerald-800 tracking-wider">Live Donors</div>
              <div className="text-base font-black text-emerald-950 mt-0.5">{freshCount}</div>
            </div>
            <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-center">
              <div className="text-[10px] font-bold uppercase text-amber-800 tracking-wider">Stale (&gt;15m)</div>
              <div className="text-base font-black text-amber-950 mt-0.5">{staleCount}</div>
            </div>
            <button
              onClick={loadLiveLocations}
              disabled={loading}
              title="Refresh live donor positions"
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span className={loading ? 'animate-spin inline-block' : ''}>↻</span>
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* State and District Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">State / UT</label>
            <select
              value={selectedStateCode}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : '';
                setSelectedStateCode(val);
                setSelectedDistrictCode('');
              }}
              className="w-full text-xs font-semibold p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden"
            >
              <option value="">All Registered States</option>
              {STATES_AND_DISTRICTS.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">District</label>
            <select
              value={selectedDistrictCode}
              disabled={!selectedStateCode}
              onChange={(e) => setSelectedDistrictCode(e.target.value ? Number(e.target.value) : '')}
              className="w-full text-xs font-semibold p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 disabled:opacity-50 focus:outline-hidden"
            >
              <option value="">All Districts</option>
              {availableDistricts.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Session Scope</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full text-xs font-semibold p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden"
            >
              <option value="ACTIVE">Actively Sharing Sessions</option>
              <option value="all">All Recent Sessions</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleResetFilters}
              className="w-full py-2 px-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-center justify-between font-semibold">
            <span>⚠ {error}</span>
            <button onClick={loadLiveLocations} className="underline text-red-900 font-bold ml-2">Retry</button>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 2. MAP & DONOR LIST PANEL                                */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
        {/* Mapbox Map Container (3 Columns on Large Screens) */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs relative">
          <div
            ref={mapContainerRef}
            className="w-full h-[520px] sm:h-[600px] bg-slate-100 relative"
          >
            {mapError && (
              <div className="absolute inset-0 z-10 bg-slate-50/90 flex items-center justify-center p-6 text-center">
                <div className="max-w-md bg-white p-6 rounded-2xl border border-slate-200 shadow-md">
                  <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto mb-3 font-bold text-lg">
                    🗺
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">Map Display Notice</h3>
                  <p className="text-xs text-slate-600 mb-4">{mapError}</p>
                  <p className="text-[11px] text-slate-400">
                    Live coordinates continue to be monitored via the list view below.
                  </p>
                </div>
              </div>
            )}

            {!mapLoaded && !mapError && (
              <div className="absolute inset-0 z-10 bg-slate-50 flex items-center justify-center">
                <div className="text-center space-y-2">
                  <div className="w-8 h-8 border-3 border-slate-200 border-t-[#C51F3A] rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-bold text-slate-500">Loading Mapbox Vector Canvas...</p>
                </div>
              </div>
            )}
          </div>

          {/* Map Legend Footer */}
          <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block shadow-xs" />
                Live Transmitting Donor
              </span>
              <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block shadow-xs" />
                Stale (&gt; 15 mins)
              </span>
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              {lastSyncTime ? `Last sync: ${lastSyncTime.toLocaleTimeString()}` : ''}
            </div>
          </div>
        </div>

        {/* Live Donors Sidebar (1 Column on Large Screens) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col h-[520px] sm:h-[650px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Active Donors ({visibleDonorsWithCoords.length})
              </h3>
              <p className="text-[10px] text-slate-400">Matching active region filters</p>
            </div>
          </div>

          {/* Donor Cards List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {loading && donors.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <div className="w-6 h-6 border-2 border-slate-200 border-t-[#C51F3A] rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-400">Querying live location sessions...</p>
              </div>
            ) : visibleDonorsWithCoords.length === 0 ? (
              <div className="py-12 text-center space-y-2 bg-slate-50 rounded-xl p-4 border border-dashed border-slate-200">
                <div className="text-2xl">📍</div>
                <p className="text-xs font-bold text-slate-700">No Donors Actively Transmitting</p>
                <p className="text-[11px] text-slate-500">
                  {selectedDistrictCode
                    ? 'No donors in the selected district have an active location session.'
                    : 'Donors who start location sharing via the mobile app will automatically appear here.'}
                </p>
              </div>
            ) : (
              visibleDonorsWithCoords.map((donor) => {
                const isSelected = selectedDonorId === donor.donorUserId;
                const isStale = donor.freshness === 'STALE';
                const displayName = donor.donorName || (donor.donorUserId ? `Donor (${donor.donorUserId.slice(0, 6)})` : 'Donor');
                const bloodGroupDisplay = donor.bloodGroup
                  ? donor.bloodGroup.replace('_POSITIVE', '+').replace('_NEGATIVE', '-')
                  : 'N/A';

                return (
                  <div
                    key={donor.donorUserId}
                    onClick={() => handleCenterOnDonor(donor)}
                    className={`p-3 rounded-xl border text-xs transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#C51F3A] bg-red-50/40 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-slate-900 truncate max-w-[130px]">
                        {displayName}
                      </span>
                      <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                        isStale ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {isStale ? 'Stale' : 'Live'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                      <span className="font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
                        {bloodGroupDisplay}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {donor.accuracy ? `±${Math.round(donor.accuracy)}m` : 'Standard GPS'}
                      </span>
                    </div>

                    <div className="text-[10px] text-slate-500 font-medium truncate mb-2">
                      📍 {getGeographyLabel(donor.stateCode, donor.districtCode)}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">
                      <span>{donor.serverReceivedAt ? new Date(donor.serverReceivedAt).toLocaleTimeString() : 'Recent'}</span>
                      <span className="text-slate-600 font-bold hover:text-[#C51F3A] flex items-center gap-0.5">
                        <IconNavigation size={10} />
                        Focus
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
