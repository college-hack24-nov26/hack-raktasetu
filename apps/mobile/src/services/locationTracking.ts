import * as Location from 'expo-location';
import { LOCATION_BACKGROUND_TASK, recordLastDispatchedTimestamp } from './locationTask';
import { ApiClient } from './apiClient';

export interface LocationPermissionsStatus {
  foregroundGranted: boolean;
  backgroundGranted: boolean;
  canAskAgain: boolean;
}

export class LocationTracking {
  /**
   * Progressively requests foreground and background location permissions.
   */
  static async requestPermissions(): Promise<LocationPermissionsStatus> {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (!fg.granted) {
      return {
        foregroundGranted: false,
        backgroundGranted: false,
        canAskAgain: fg.canAskAgain,
      };
    }

    const bg = await Location.requestBackgroundPermissionsAsync();
    return {
      foregroundGranted: true,
      backgroundGranted: bg.granted,
      canAskAgain: bg.canAskAgain,
    };
  }

  /**
   * Checks current permission status without prompting.
   */
  static async getPermissions(): Promise<LocationPermissionsStatus> {
    const fg = await Location.getForegroundPermissionsAsync();
    const bg = await Location.getBackgroundPermissionsAsync();
    return {
      foregroundGranted: fg.granted,
      backgroundGranted: bg.granted,
      canAskAgain: fg.canAskAgain && bg.canAskAgain,
    };
  }

  /**
   * Starts background location updates tied to active session.
   * Configures Android Foreground Service notification with sticky indicator.
   */
  static async startTracking(sessionId: string): Promise<boolean> {
    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_BACKGROUND_TASK);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(LOCATION_BACKGROUND_TASK);
      }

      await Location.startLocationUpdatesAsync(LOCATION_BACKGROUND_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 15000, // Battery-conscious 15 seconds
        distanceInterval: 10, // 10 meters
        deferredUpdatesInterval: 15000,
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        foregroundService: {
          notificationTitle: 'RaktaSetu Live Location Active',
          notificationBody: 'Sharing your live location for emergency blood coordination.',
          notificationColor: '#DC2626',
        },
      });

      // Capture and submit immediate initial location fix
      try {
        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (initial) {
          const initTime = Math.max(initial.timestamp || Date.now(), Date.now());
          recordLastDispatchedTimestamp(initTime);
          await ApiClient.updateLocation({
            sessionId,
            latitude: initial.coords.latitude,
            longitude: initial.coords.longitude,
            accuracy: Math.round((initial.coords.accuracy || 10) * 10) / 10,
            heading: initial.coords.heading && initial.coords.heading >= 0 ? Math.round(initial.coords.heading) : undefined,
            speed: initial.coords.speed && initial.coords.speed >= 0 ? Math.round(initial.coords.speed * 10) / 10 : undefined,
            deviceTimestamp: new Date(initTime).toISOString(),
          });
        }
      } catch (initErr) {
        console.log('[LocationTracking] Initial foreground fix non-fatal notice:', initErr);
      }

      return true;
    } catch (err: any) {
      console.error('[LocationTracking] Failed to start location updates:', err);
      return false;
    }
  }

  /**
   * Stops background location tracking and dismisses the foreground notification.
   */
  static async stopTracking(): Promise<void> {
    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_BACKGROUND_TASK);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(LOCATION_BACKGROUND_TASK);
      }
    } catch (err) {
      console.warn('[LocationTracking] Error stopping tracking:', err);
    }
  }

  /**
   * Checks whether the background location task is actively registered and running.
   */
  static async isTrackingActive(): Promise<boolean> {
    try {
      return await Location.hasStartedLocationUpdatesAsync(LOCATION_BACKGROUND_TASK);
    } catch {
      return false;
    }
  }
}
