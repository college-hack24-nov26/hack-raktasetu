import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { config } from '../config/env';

// In-memory rate limiting tracker for OTP attempts
interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

const attemptTracker = new Map<string, AttemptRecord>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes lockout

/**
 * Normalizes phone numbers to standard E.164 format (+91XXXXXXXXXX)
 */
export function normalizePhoneNumber(raw: string): string {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Phone number must be a non-empty string');
  }

  // Strip spaces, dashes, parentheses
  const cleaned = raw.replace(/[\s\-\(\)\.]/g, '');

  // 10-digit standard Indian mobile
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }

  // E.164 starting with +91 followed by 10 digits
  if (/^\+91[6-9]\d{9}$/.test(cleaned)) {
    return cleaned;
  }

  // 12-digit format starting with 91 followed by 10 digits
  if (/^91[6-9]\d{9}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  throw new Error('Invalid mobile phone number format. Please provide a valid 10-digit Indian mobile number.');
}

/**
 * Checks rate limits on phone authentication attempts
 */
export function checkRateLimit(phone: string): void {
  const now = Date.now();
  const record = attemptTracker.get(phone);

  if (!record) return;

  if (record.lockedUntil && now < record.lockedUntil) {
    const minutesLeft = Math.ceil((record.lockedUntil - now) / 60000);
    throw new Error(`Too many incorrect attempts. Please try again after ${minutesLeft} minute(s).`);
  }

  // Reset window if expired
  if (now - record.firstAttemptAt > WINDOW_MS) {
    attemptTracker.delete(phone);
  }
}

/**
 * Records a failed verification attempt and triggers lockout if max attempts exceeded
 */
export function recordFailedAttempt(phone: string): void {
  const now = Date.now();
  const record = attemptTracker.get(phone) || { count: 0, firstAttemptAt: now };

  record.count += 1;

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
    attemptTracker.set(phone, record);
    throw new Error('Too many failed verification attempts. Account locked for 15 minutes.');
  }

  attemptTracker.set(phone, record);
}

/**
 * Clears rate limiting on successful authentication
 */
export function clearRateLimit(phone: string): void {
  attemptTracker.delete(phone);
}

/**
 * Demo OTP verification logic
 * CRITICAL: This is a hackathon demonstration verification shortcut.
 * Enabled only in development/demo environments. Never returns or logs the OTP.
 */
export function verifyDemoOtp(phone: string, submittedOtp: string): boolean {
  if (!config.allowDemoOtp) {
    throw new Error('Demo OTP verification is disabled in this environment.');
  }

  checkRateLimit(phone);

  if (!submittedOtp || typeof submittedOtp !== 'string') {
    recordFailedAttempt(phone);
    throw new Error('Invalid OTP format.');
  }

  const isMatch = submittedOtp.trim() === config.demoOtp;

  if (!isMatch) {
    recordFailedAttempt(phone);
    throw new Error('Incorrect OTP entered. Please check and try again.');
  }

  clearRateLimit(phone);
  return true;
}

/**
 * Creates an authenticated session for a user with cryptographically secure token
 */
export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const session = await prisma.session.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  return { session, token, expiresAt };
}

/**
 * Validates session token, returning user if active and not expired/revoked
 */
export async function validateSession(token: string) {
  if (!token) return null;

  const runQuery = async () => {
    return prisma.session.findUnique({
      where: { token },
      include: {
        user: {
          include: {
            donorProfile: true,
          },
        },
      },
    });
  };

  let session;
  try {
    session = await runQuery();
  } catch (err: any) {
    // If connection dropped due to Neon compute cold sleep, retry once after a short delay
    const isConnError =
      err?.message?.includes("Can't reach database server") ||
      err?.message?.includes('connection') ||
      err?.message?.includes('timeout');

    if (isConnError) {
      console.warn('[Auth] Database cold start or connection glitch, retrying validateSession in 1s...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      session = await runQuery();
    } else {
      throw err;
    }
  }

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < new Date()) return null;
  if (session.user.status !== 'ACTIVE') return null;

  return session;
}

/**
 * Revokes a single session (e.g. on logout)
 */
export async function revokeSession(token: string) {
  await prisma.session.updateMany({
    where: { token },
    data: { revokedAt: new Date() },
  });
}

/**
 * Revokes all sessions for a user (e.g. on account deactivation)
 */
export async function revokeAllUserSessions(userId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
