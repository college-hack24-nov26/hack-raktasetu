import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { AuthStorage } from './authStorage';
import { ApiClient } from './apiClient';

export const LOCATION_BACKGROUND_TASK = 'RAKTASETU_DONOR_LOCATION_TASK';

export interface LocationUpdateStatus {
  lastUpdated: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  lastError: string | null;
}

// In-memory latest tracking status for active UI listener
let latestStatus: LocationUpdateStatus = {
  lastUpdated: null,
  latitude: null,
  longitude: null,
  accuracy: null,
  lastError: null,
};

let lastDispatchedTimestamp = 0;

export function recordLastDispatchedTimestamp(ts: number) {
  lastDispatchedTimestamp = Math.max(lastDispatchedTimestamp, ts);
}

type StatusListener = (status: LocationUpdateStatus) => void;
const listeners = new Set<StatusListener>();

export function subscribeLocationStatus(listener: StatusListener): () => void {
  listeners.add(listener);
  listener(latestStatus);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(update: Partial<LocationUpdateStatus>) {
  latestStatus = { ...latestStatus, ...update };
  for (const listener of listeners) {
    try {
      listener(latestStatus);
    } catch {}
  }
}

/**
 * Headless background location task defined strictly at module scope.
 * Executes when Android OS dispatches location updates to the foreground service.
 */
TaskManager.defineTask(LOCATION_BACKGROUND_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[LocationTask] Background location error:', error.message);
    notifyListeners({ lastError: error.message });
    return;
  }

  if (!data) {
    return;
  }

  const { locations } = data as { locations?: Location.LocationObject[] };
  if (!locations || locations.length === 0) {
    return;
  }

  // Take latest coordinate
  const latest = locations[locations.length - 1];
  const { coords, timestamp } = latest;

  const sessionId = await AuthStorage.getActiveSessionId();
  if (!sessionId) {
    console.log('[LocationTask] No active session ID found. Stopping location task.');
    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_BACKGROUND_TASK);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(LOCATION_BACKGROUND_TASK);
      }
    } catch (e) {
      console.warn('[LocationTask] Error stopping location updates:', e);
    }
    return;
  }

  // Upload coordinate to RaktaSetu backend
  // In browsers (Edge/Chrome) or stationary devices, OS location providers often return cached
  // timestamps. Ensure the timestamp is always current and strictly monotonically increasing.
  const now = Date.now();
  const rawTime = typeof timestamp === 'number' && timestamp > 0 ? timestamp : now;
  const effectiveTime = Math.max(rawTime, lastDispatchedTimestamp + 1000, now);
  lastDispatchedTimestamp = effectiveTime;

  const deviceTimestamp = new Date(effectiveTime).toISOString();

  try {
    const res = await ApiClient.updateLocation({
      sessionId,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: Math.round((coords.accuracy || 10) * 10) / 10,
      heading: coords.heading && coords.heading >= 0 ? Math.round(coords.heading) : undefined,
      speed: coords.speed && coords.speed >= 0 ? Math.round(coords.speed * 10) / 10 : undefined,
      deviceTimestamp,
    });

    if (res.success) {
      notifyListeners({
        lastUpdated: new Date().toLocaleTimeString(),
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy ?? null,
        lastError: null,
      });
    } else {
      // If the backend indicates an out-of-order update, the backend already has this or a newer fix.
      // This is not a client failure; do not mark the task in an error state.
      if (res.error?.code === 'OUT_OF_ORDER_UPDATE') {
        console.log('[LocationTask] Newer location already recorded on server; skipping out-of-order update.');
        notifyListeners({
          lastUpdated: new Date().toLocaleTimeString(),
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy ?? null,
          lastError: null,
        });
        return;
      }

      console.warn('[LocationTask] Location update rejected by API:', res.error);
      notifyListeners({ lastError: res.error?.message || 'Update failed' });

      // If backend reports no active session, terminate task
      if (res.error?.code === 'NO_ACTIVE_SESSION') {
        await AuthStorage.removeActiveSessionId();
        try {
          await Location.stopLocationUpdatesAsync(LOCATION_BACKGROUND_TASK);
        } catch {}
      }
    }
  } catch (err: any) {
    console.warn('[LocationTask] Network exception uploading location:', err.message);
    notifyListeners({ lastError: 'Network error uploading location' });
  }
});
