import { RouteDirectionsDTO } from '@raktasetu/shared';

interface CachedRoute {
  result: RouteDirectionsDTO;
  expiresAt: number;
}

export class DirectionsService {
  private static cache = new Map<string, CachedRoute>();
  private static readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL
  private static readonly REQUEST_TIMEOUT_MS = 5000; // 5 seconds timeout

  /**
   * Validate geographical coordinate bounds
   */
  static isValidCoordinate(lat: number, lng: number): boolean {
    return (
      typeof lat === 'number' &&
      !isNaN(lat) &&
      lat >= -90 &&
      lat <= 90 &&
      typeof lng === 'number' &&
      !isNaN(lng) &&
      lng >= -180 &&
      lng <= 180
    );
  }

  /**
   * Retrieves driving route distance and duration using Mapbox Directions API v5.
   * Format: https://api.mapbox.com/directions/v5/mapbox/{profile}/{coordinates}
   * Coordinate order: strictly longitude,latitude;longitude,latitude
   */
  static async getDirections(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    profile: 'driving' | 'walking' | 'cycling' = 'driving'
  ): Promise<RouteDirectionsDTO | null> {
    if (!this.isValidCoordinate(origin.lat, origin.lng)) {
      console.warn('[DirectionsService] Invalid origin coordinate:', { lat: origin.lat, lng: origin.lng });
      return null;
    }
    if (!this.isValidCoordinate(destination.lat, destination.lng)) {
      console.warn('[DirectionsService] Invalid destination coordinate:', { lat: destination.lat, lng: destination.lng });
      return null;
    }

    const token = process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token || token.trim() === '' || token.includes('your_mapbox')) {
      console.warn('[DirectionsService] Mapbox access token is not configured or is a placeholder.');
      return null;
    }

    // Round coordinates to 5 decimal places for stable cache keys (~1.1 meter precision)
    const oLng = origin.lng.toFixed(5);
    const oLat = origin.lat.toFixed(5);
    const dLng = destination.lng.toFixed(5);
    const dLat = destination.lat.toFixed(5);

    const cacheKey = `${profile}:${oLng},${oLat};${dLng},${dLat}`;
    const cached = this.cache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return { ...cached.result, cached: true };
    }

    // Mapbox Directions v5 coordinates string: strictly {longitude},{latitude};{longitude},{latitude}
    const coordsStr = `${oLng},${oLat};${dLng},${dLat}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordsStr}?access_token=${encodeURIComponent(token)}&geometries=geojson&overview=simplified`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.warn(`[DirectionsService] Mapbox API responded with status ${response.status}:`, errorText.slice(0, 150));
        return null;
      }

      const data = await response.json();
      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        console.warn(`[DirectionsService] No route found or error returned by Mapbox: code=${data.code}`);
        return null;
      }

      const primaryRoute = data.routes[0];
      const rawDistanceMeters = typeof primaryRoute.distance === 'number' ? primaryRoute.distance : 0;
      const rawDurationSeconds = typeof primaryRoute.duration === 'number' ? primaryRoute.duration : 0;

      // Convert distance meters -> km (rounded to 1 decimal place)
      const distanceKm = Math.round((rawDistanceMeters / 1000) * 10) / 10;
      // Convert duration seconds -> minutes (rounded to integer)
      const durationMinutes = Math.max(1, Math.round(rawDurationSeconds / 60));

      const result: RouteDirectionsDTO = {
        distanceKm,
        durationMinutes,
        profile,
        source: 'mapbox_directions',
        cached: false,
      };

      this.cache.set(cacheKey, {
        result,
        expiresAt: now + this.CACHE_TTL_MS,
      });

      return result;
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        console.warn('[DirectionsService] Mapbox Directions API request timed out after 5000ms.');
      } else {
        console.warn('[DirectionsService] Network error requesting directions:', err.message || err);
      }
      return null;
    }
  }

  /**
   * Helper method for test environments to inject a mock route or clear cache
   */
  static clearCache() {
    this.cache.clear();
  }

  static setMockCache(key: string, result: RouteDirectionsDTO) {
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });
  }
}

