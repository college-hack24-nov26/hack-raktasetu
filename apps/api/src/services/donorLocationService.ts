import { prisma } from '../lib/prisma';
import { RealtimeService } from './realtime';
import {
  LocationSessionDTO,
  DonorLatestLocationDTO,
  AdminDonorLocationSnapshotDTO,
  StartLocationSessionInput,
  StopLocationSessionInput,
  UpdateLocationInput,
  DonorLocationFreshness,
} from '@raktasetu/shared';

export const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
export const MIN_UPDATE_INTERVAL_MS = 2000; // 2 seconds minimum cooldown between updates

// In-memory per-donor update cooldown tracker for bounded rate limiting
const updateCooldownTracker = new Map<string, number>();

export class DonorLocationService {
  /**
   * Start a revocable, consented donor live-location sharing session.
   * Explicit consent is required. Enforces strictly one active session per donor.
   */
  static async startSession(
    caller: { id: string },
    input: StartLocationSessionInput
  ): Promise<LocationSessionDTO> {
    if (input.consentGranted !== true) {
      const error: any = new Error('Explicit consent is required to start location sharing.');
      error.code = 'CONSENT_REQUIRED';
      error.statusCode = 400;
      throw error;
    }

    if (!input.consentVersion || typeof input.consentVersion !== 'string' || !input.consentVersion.trim()) {
      const error: any = new Error('A valid consentVersion string is required.');
      error.code = 'INVALID_CONSENT_VERSION';
      error.statusCode = 400;
      throw error;
    }

    const consentVersion = input.consentVersion.trim();
    const now = new Date();

    return await prisma.$transaction(async (tx) => {
      // Safely supersede any existing active session for this donor to avoid duplicate active sessions
      const existingActive = await tx.donorLocationSession.findFirst({
        where: {
          donorUserId: caller.id,
          status: 'ACTIVE',
        },
      });

      if (existingActive) {
        await tx.donorLocationSession.update({
          where: { id: existingActive.id },
          data: {
            status: 'STOPPED' as any,
            endedAt: now,
            endedReason: 'SUPERSEDED',
          },
        });
      }

      // Create new active session
      const session = await tx.donorLocationSession.create({
        data: {
          donorUserId: caller.id,
          status: 'ACTIVE',
          consentGranted: true,
          consentVersion,
          consentGrantedAt: now,
          startedAt: now,
        },
      });

      // Dispatch event to transactional outbox (restricted to admin:live-locations)
      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'donor_location.session_started',
        entityType: 'DonorLocationSession',
        entityId: session.id,
        payload: {
          donorUserId: caller.id,
          sessionId: session.id,
          status: session.status,
          startedAt: session.startedAt.toISOString(),
          consentVersion: session.consentVersion,
        },
      });

      return {
        id: session.id,
        donorUserId: session.donorUserId,
        status: session.status as any,
        consentGranted: session.consentGranted,
        consentVersion: session.consentVersion,
        consentGrantedAt: session.consentGrantedAt.toISOString(),
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt ? session.endedAt.toISOString() : null,
        endedReason: session.endedReason,
      };
    }, { maxWait: 10000, timeout: 20000 });
  }

  /**
   * Submit an authenticated location update for the donor's active session.
   * Validates coordinates, bounds, sequencing, and rate limits.
   */
  static async updateLocation(
    caller: { id: string },
    input: UpdateLocationInput
  ): Promise<DonorLatestLocationDTO> {
    // 1. Coordinate range validation
    if (
      typeof input.latitude !== 'number' ||
      !Number.isFinite(input.latitude) ||
      input.latitude < -90 ||
      input.latitude > 90
    ) {
      const error: any = new Error('Latitude must be a valid number between -90 and 90 degrees.');
      error.code = 'INVALID_COORDINATES';
      error.statusCode = 400;
      throw error;
    }

    if (
      typeof input.longitude !== 'number' ||
      !Number.isFinite(input.longitude) ||
      input.longitude < -180 ||
      input.longitude > 180
    ) {
      const error: any = new Error('Longitude must be a valid number between -180 and 180 degrees.');
      error.code = 'INVALID_COORDINATES';
      error.statusCode = 400;
      throw error;
    }

    if (
      typeof input.accuracy !== 'number' ||
      !Number.isFinite(input.accuracy) ||
      input.accuracy <= 0 ||
      input.accuracy > 50000
    ) {
      const error: any = new Error('Accuracy must be a positive number up to 50000 meters.');
      error.code = 'INVALID_ACCURACY';
      error.statusCode = 400;
      throw error;
    }

    // 2. Timestamp validation
    if (!input.deviceTimestamp) {
      const error: any = new Error('Device timestamp is required.');
      error.code = 'MISSING_TIMESTAMP';
      error.statusCode = 400;
      throw error;
    }

    const deviceTime = new Date(input.deviceTimestamp);
    if (isNaN(deviceTime.getTime())) {
      const error: any = new Error('Device timestamp must be a valid ISO-8601 date string.');
      error.code = 'INVALID_TIMESTAMP';
      error.statusCode = 400;
      throw error;
    }

    const now = Date.now();
    // Allow up to 60s future clock skew
    if (deviceTime.getTime() > now + 60000) {
      const error: any = new Error('Device timestamp cannot be in the future.');
      error.code = 'FUTURE_TIMESTAMP';
      error.statusCode = 400;
      throw error;
    }

    // Reject updates older than 24 hours
    if (deviceTime.getTime() < now - 24 * 3600 * 1000) {
      const error: any = new Error('Device timestamp is too old (exceeds 24 hours).');
      error.code = 'EXPIRED_TIMESTAMP';
      error.statusCode = 400;
      throw error;
    }

    // 3. Per-session bounded rate limiting
    const lastUpdate = updateCooldownTracker.get(caller.id);
    if (lastUpdate && now - lastUpdate < MIN_UPDATE_INTERVAL_MS) {
      const error: any = new Error('Location updates are rate-limited to once every 2 seconds.');
      error.code = 'UPDATE_RATE_LIMITED';
      error.statusCode = 429;
      throw error;
    }

    // 4. Session status verification
    const activeSession = await prisma.donorLocationSession.findFirst({
      where: {
        donorUserId: caller.id,
        status: 'ACTIVE',
      },
    });

    if (!activeSession) {
      const error: any = new Error(
        'Location updates can only be submitted during an active location-sharing session.'
      );
      error.code = 'NO_ACTIVE_SESSION';
      error.statusCode = 409;
      throw error;
    }

    if (input.sessionId && input.sessionId !== activeSession.id) {
      const error: any = new Error('Session ID does not match the active location-sharing session.');
      error.code = 'SESSION_MISMATCH';
      error.statusCode = 400;
      throw error;
    }

    // 5. Sequencing: Handle idempotent duplicate updates and reject strictly older updates
    const existingLatest = await prisma.donorLatestLocation.findUnique({
      where: { donorUserId: caller.id },
    });

    if (existingLatest) {
      const existingTime = existingLatest.deviceTimestamp.getTime();
      const inputTime = deviceTime.getTime();

      if (inputTime < existingTime) {
        const error: any = new Error(
          'Location update rejected: device timestamp is older than current latest location.'
        );
        error.code = 'OUT_OF_ORDER_UPDATE';
        error.statusCode = 409;
        throw error;
      }

      if (inputTime === existingTime) {
        // Idempotent duplicate: refresh serverReceivedAt and return existing latest state
        const updated = await prisma.donorLatestLocation.update({
          where: { id: existingLatest.id },
          data: {
            serverReceivedAt: new Date(),
            isStale: false,
            ...(typeof input.batteryLevel === 'number' ? { batteryLevel: input.batteryLevel } : {}),
            ...(typeof input.heading === 'number' ? { heading: input.heading } : {}),
            ...(typeof input.speed === 'number' ? { speed: input.speed } : {}),
          },
        });

        return {
          id: updated.id,
          donorUserId: updated.donorUserId,
          sessionId: updated.sessionId,
          latitude: Number(updated.latitude),
          longitude: Number(updated.longitude),
          accuracy: Number(updated.accuracy),
          heading: updated.heading !== null ? Number(updated.heading) : null,
          speed: updated.speed !== null ? Number(updated.speed) : null,
          batteryLevel: updated.batteryLevel !== null ? Number(updated.batteryLevel) : null,
          deviceTimestamp: updated.deviceTimestamp.toISOString(),
          serverReceivedAt: updated.serverReceivedAt.toISOString(),
          isStale: updated.isStale,
        };
      }
    }

    // Record rate limit timestamp
    updateCooldownTracker.set(caller.id, now);

    // 6. Persist latest location and dispatch outbox event atomically
    const serverReceivedAt = new Date();

    return await prisma.$transaction(async (tx) => {
      const record = await tx.donorLatestLocation.upsert({
        where: { donorUserId: caller.id },
        create: {
          donorUserId: caller.id,
          sessionId: activeSession.id,
          latitude: input.latitude,
          longitude: input.longitude,
          accuracy: input.accuracy,
          heading: typeof input.heading === 'number' ? input.heading : null,
          speed: typeof input.speed === 'number' ? input.speed : null,
          batteryLevel: typeof input.batteryLevel === 'number' ? input.batteryLevel : null,
          deviceTimestamp: deviceTime,
          serverReceivedAt,
          isStale: false,
        },
        update: {
          sessionId: activeSession.id,
          latitude: input.latitude,
          longitude: input.longitude,
          accuracy: input.accuracy,
          heading: typeof input.heading === 'number' ? input.heading : null,
          speed: typeof input.speed === 'number' ? input.speed : null,
          batteryLevel: typeof input.batteryLevel === 'number' ? input.batteryLevel : null,
          deviceTimestamp: deviceTime,
          serverReceivedAt,
          isStale: false,
        },
      });

      // Dispatch to transactional outbox for realtime admin consumption
      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'donor_location.updated',
        entityType: 'DonorLatestLocation',
        entityId: record.id,
        payload: {
          donorUserId: caller.id,
          sessionId: activeSession.id,
          latitude: record.latitude,
          longitude: record.longitude,
          accuracy: record.accuracy,
          heading: record.heading,
          speed: record.speed,
          batteryLevel: record.batteryLevel,
          deviceTimestamp: record.deviceTimestamp.toISOString(),
          serverReceivedAt: record.serverReceivedAt.toISOString(),
          isStale: false,
          freshness: 'FRESH',
        },
      });

      return {
        id: record.id,
        donorUserId: record.donorUserId,
        sessionId: record.sessionId,
        latitude: record.latitude,
        longitude: record.longitude,
        accuracy: record.accuracy,
        heading: record.heading,
        speed: record.speed,
        batteryLevel: record.batteryLevel,
        deviceTimestamp: record.deviceTimestamp.toISOString(),
        serverReceivedAt: record.serverReceivedAt.toISOString(),
        isStale: record.isStale,
      };
    }, { maxWait: 10000, timeout: 20000 });
  }

  /**
   * Stop or revoke a donor location sharing session.
   * Safe and idempotent for repeated calls.
   */
  static async stopSession(
    caller: { id: string },
    input?: StopLocationSessionInput
  ): Promise<LocationSessionDTO | null> {
    const activeSession = await prisma.donorLocationSession.findFirst({
      where: {
        donorUserId: caller.id,
        status: 'ACTIVE',
      },
    });

    if (!activeSession) {
      return null;
    }

    const reason = input?.reason === 'DONOR_REVOKED' ? 'DONOR_REVOKED' : 'DONOR_STOPPED';
    const finalStatus = input?.reason === 'DONOR_REVOKED' ? 'REVOKED' : 'STOPPED';
    const now = new Date();

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.donorLocationSession.update({
        where: { id: activeSession.id },
        data: {
          status: finalStatus as any,
          endedAt: now,
          endedReason: reason,
        },
      });

      // Dispatch event to transactional outbox
      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'donor_location.session_ended',
        entityType: 'DonorLocationSession',
        entityId: updated.id,
        payload: {
          donorUserId: caller.id,
          sessionId: updated.id,
          status: updated.status,
          endedAt: updated.endedAt?.toISOString() || null,
          endedReason: updated.endedReason,
        },
      });

      return {
        id: updated.id,
        donorUserId: updated.donorUserId,
        status: updated.status as any,
        consentGranted: updated.consentGranted,
        consentVersion: updated.consentVersion,
        consentGrantedAt: updated.consentGrantedAt.toISOString(),
        startedAt: updated.startedAt.toISOString(),
        endedAt: updated.endedAt ? updated.endedAt.toISOString() : null,
        endedReason: updated.endedReason,
      };
    }, { maxWait: 10000, timeout: 20000 });
  }

  /**
   * Retrieve live donor locations for Platform / System Administrators.
   * Calculates staleness dynamically (stale > 15m server-received timestamp).
   * Stale status alone does NOT terminate the session.
   */
  static async getLiveLocationsForAdmin(filter?: {
    stateCode?: number;
    districtCode?: number;
    status?: string;
  }): Promise<AdminDonorLocationSnapshotDTO[]> {
    const targetStatus = filter?.status || 'ACTIVE';

    // Retrieve sessions matching filter with donor details and latest coordinates
    const sessions = await prisma.donorLocationSession.findMany({
      where: {
        ...(targetStatus !== 'all' ? { status: targetStatus as any } : {}),
      },
      include: {
        donorUser: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            donorProfile: {
              select: {
                fullName: true,
                bloodGroup: true,
                stateCode: true,
                districtCode: true,
                cityOrLocality: true,
              },
            },
          },
        },
        latestLocation: true,
      },
      orderBy: { startedAt: 'desc' },
    });

    const now = Date.now();

    const results: AdminDonorLocationSnapshotDTO[] = [];

    for (const s of sessions) {
      const profile = s.donorUser.donorProfile;

      // Filter by state/district if requested
      if (filter?.stateCode && profile?.stateCode && profile.stateCode !== filter.stateCode) {
        continue;
      }
      if (filter?.districtCode && profile?.districtCode && profile.districtCode !== filter.districtCode) {
        continue;
      }

      const loc = s.latestLocation;
      let isStale = false;
      let freshness: DonorLocationFreshness = 'UNAVAILABLE';

      if (loc && loc.serverReceivedAt) {
        const ageMs = now - loc.serverReceivedAt.getTime();
        isStale = ageMs > STALE_THRESHOLD_MS;
        freshness = isStale ? 'STALE' : 'FRESH';
      }

      results.push({
        donorUserId: s.donorUserId,
        donorName: profile?.fullName || s.donorUser.name,
        phoneNumber: s.donorUser.phoneNumber,
        bloodGroup: profile?.bloodGroup || null,
        stateCode: profile?.stateCode ?? null,
        districtCode: profile?.districtCode ?? null,
        cityOrLocality: profile?.cityOrLocality ?? null,
        sessionId: s.id,
        sessionStatus: s.status as any,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt ? s.endedAt.toISOString() : null,
        latitude: loc ? loc.latitude : null,
        longitude: loc ? loc.longitude : null,
        accuracy: loc ? loc.accuracy : null,
        heading: loc?.heading ?? null,
        speed: loc?.speed ?? null,
        batteryLevel: loc?.batteryLevel ?? null,
        deviceTimestamp: loc ? loc.deviceTimestamp.toISOString() : null,
        serverReceivedAt: loc ? loc.serverReceivedAt.toISOString() : null,
        isStale,
        freshness,
      });
    }

    return results;
  }
}
