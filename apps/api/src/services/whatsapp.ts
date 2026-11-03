import crypto from 'crypto';
import { config } from '../config/env';
import { prisma } from '../lib/prisma';

export interface WhatsAppSendResult {
  success: boolean;
  status: 'SENT' | 'NOT_CONFIGURED' | 'FAILED' | 'DUPLICATE_SKIPPED' | 'INVALID_RECIPIENT';
  messageId?: string;
  error?: string;
}

// In-memory duplicate suppression cache (key: SHA256(recipient + eventId), value: timestamp)
const recentNotifications = new Map<string, number>();
const DUP_SUPPRESSION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Normalizes phone numbers to standard E.164 digits without '+' as required by WhatsApp Cloud API.
 * e.g. "+91 98765-43210" -> "919876543210"
 * e.g. "9876543210" (Indian 10-digit) -> "919876543210"
 */
export function normalizeWhatsAppNumber(rawPhone?: string | null): string | null {
  if (!rawPhone || typeof rawPhone !== 'string') return null;
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits || digits.length < 10) return null;

  // If 10-digit Indian number without country code, prepend 91
  if (digits.length === 10) {
    return `91${digits}`;
  }

  // If starts with 0 and has 11 digits (e.g. 09876543210), strip 0 and prepend 91
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`;
  }

  return digits;
}

/**
 * Masks phone numbers for secure logging without exposing full PII.
 * e.g. "919876543210" -> "+91******3210"
 */
export function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 6) return '******';
  const prefix = phone.slice(0, 3);
  const suffix = phone.slice(-4);
  return `+${prefix}****${suffix}`;
}

/**
 * Computes a SHA-256 hash of a recipient identifier for duplicate detection and audit logs.
 */
function hashIdentifier(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/**
 * Checks if a notification was recently dispatched to suppress duplicate alerts.
 */
export function isDuplicate(recipientKey: string, eventId: string): boolean {
  const compositeKey = `${hashIdentifier(recipientKey)}:${eventId}`;
  const now = Date.now();

  // Clean stale keys periodically
  if (recentNotifications.size > 1000) {
    for (const [key, ts] of recentNotifications.entries()) {
      if (now - ts > DUP_SUPPRESSION_WINDOW_MS) {
        recentNotifications.delete(key);
      }
    }
  }

  const lastSent = recentNotifications.get(compositeKey);
  if (lastSent && now - lastSent < DUP_SUPPRESSION_WINDOW_MS) {
    return true;
  }

  recentNotifications.set(compositeKey, now);
  return false;
}

/**
 * Low-level transport to send a WhatsApp Cloud API message.
 */
export async function sendWhatsAppMessage({
  to,
  type,
  text,
  template,
}: {
  to: string;
  type: 'text' | 'template';
  text?: string;
  template?: {
    name: string;
    language: { code: string };
    components?: any[];
  };
}): Promise<WhatsAppSendResult> {
  const { whatsapp } = config;

  if (!whatsapp.isConfigured || !whatsapp.accessToken || !whatsapp.phoneNumberId) {
    return {
      success: false,
      status: 'NOT_CONFIGURED',
      error: 'WhatsApp provider is not configured. Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID.',
    };
  }

  const normalizedPhone = normalizeWhatsAppNumber(to);
  if (!normalizedPhone) {
    return {
      success: false,
      status: 'INVALID_RECIPIENT',
      error: 'Invalid recipient phone number format.',
    };
  }

  const endpoint = `https://graph.facebook.com/v21.0/${whatsapp.phoneNumberId}/messages`;

  const payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizedPhone,
    type,
  };

  if (type === 'template' && template) {
    payload.template = template;
  } else if (type === 'text' && text) {
    payload.text = { preview_url: false, body: text };
  } else {
    return {
      success: false,
      status: 'FAILED',
      error: 'Missing text or template payload content.',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${whatsapp.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data: any = await response.json();

    if (!response.ok) {
      const apiErrorMessage = data?.error?.message || `WhatsApp API responded with status ${response.status}`;
      return {
        success: false,
        status: 'FAILED',
        error: apiErrorMessage,
      };
    }

    const messageId = data?.messages?.[0]?.id;
    return {
      success: true,
      status: 'SENT',
      messageId,
    };
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError';
    return {
      success: false,
      status: 'FAILED',
      error: isTimeout ? 'WhatsApp API request timed out after 8000ms.' : err?.message || 'Unknown network error.',
    };
  }
}

/**
 * Safe, non-blocking notification for newly matched voluntary donors when a blood request is created.
 */
export async function notifyDonorNewMatch({
  recipientPhone,
  donorUserId,
  donorName,
  bloodGroup,
  hospitalName,
  requestId,
}: {
  recipientPhone: string;
  donorUserId: string;
  donorName: string;
  bloodGroup: string;
  hospitalName: string;
  requestId: string;
}): Promise<WhatsAppSendResult> {
  if (isDuplicate(recipientPhone, `request:${requestId}:match`)) {
    return {
      success: false,
      status: 'DUPLICATE_SKIPPED',
      error: 'Duplicate notification suppressed within cooldown window.',
    };
  }

  const bodyText =
    `RaktaSetu Alert: An urgent request for ${bloodGroup} blood at ${hospitalName} ` +
    `has matched your voluntary donor profile. If you are eligible and available to help, ` +
    `please open RaktaSetu (${config.webOrigin}/donor-dashboard) to view details and coordinate privately.\n\n` +
    `Your decision is voluntary and independent. Never share OTPs or personal credentials.`;

  const result = await sendWhatsAppMessage({
    to: recipientPhone,
    type: 'text',
    text: bodyText,
  });

  // Record audit log asynchronously without blocking
  prisma.auditLog
    .create({
      data: {
        userId: donorUserId,
        action: 'WHATSAPP_DONOR_MATCH_NOTIFIED',
        resource: 'BloodRequest',
        resourceId: requestId,
        metadata: {
          status: result.status,
          success: result.success,
          maskedPhone: maskPhoneNumber(recipientPhone),
          messageId: result.messageId || null,
          error: result.error || null,
        },
      },
    })
    .catch(() => {});

  return result;
}

/**
 * Safe, non-blocking notification for the blood requester when a voluntary donor accepts coordination.
 */
export async function notifyRequesterDonorAccepted({
  recipientPhone,
  requesterUserId,
  bloodGroup,
  hospitalName,
  requestId,
}: {
  recipientPhone: string;
  requesterUserId: string;
  bloodGroup: string;
  hospitalName: string;
  requestId: string;
}): Promise<WhatsAppSendResult> {
  if (isDuplicate(recipientPhone, `request:${requestId}:accepted`)) {
    return {
      success: false,
      status: 'DUPLICATE_SKIPPED',
      error: 'Duplicate notification suppressed within cooldown window.',
    };
  }

  const bodyText =
    `RaktaSetu Update: A voluntary donor has accepted coordination for your ${bloodGroup} blood request ` +
    `at ${hospitalName}.\n\n` +
    `Log in to your account at ${config.webOrigin}/requests to view contact details.\n\n` +
    `Notice: Voluntary donors are compassionate community volunteers and are not medically pre-cleared. ` +
    `All standard hospital donation screening applies.`;

  const result = await sendWhatsAppMessage({
    to: recipientPhone,
    type: 'text',
    text: bodyText,
  });

  prisma.auditLog
    .create({
      data: {
        userId: requesterUserId,
        action: 'WHATSAPP_REQUESTER_ACCEPTED_NOTIFIED',
        resource: 'BloodRequest',
        resourceId: requestId,
        metadata: {
          status: result.status,
          success: result.success,
          maskedPhone: maskPhoneNumber(recipientPhone),
          messageId: result.messageId || null,
          error: result.error || null,
        },
      },
    })
    .catch(() => {});

  return result;
}

/**
 * Safe, non-blocking notification when a blood request is cancelled or closed.
 */
export async function notifyDonorRequestCancelled({
  recipientPhone,
  donorUserId,
  bloodGroup,
  hospitalName,
  requestId,
}: {
  recipientPhone: string;
  donorUserId: string;
  bloodGroup: string;
  hospitalName: string;
  requestId: string;
}): Promise<WhatsAppSendResult> {
  if (isDuplicate(recipientPhone, `request:${requestId}:cancelled`)) {
    return {
      success: false,
      status: 'DUPLICATE_SKIPPED',
    };
  }

  const bodyText =
    `RaktaSetu Notice: The blood request for ${bloodGroup} at ${hospitalName} has been cancelled or fulfilled. ` +
    `No further coordination is required. Thank you for your readiness to support patients.`;

  const result = await sendWhatsAppMessage({
    to: recipientPhone,
    type: 'text',
    text: bodyText,
  });

  prisma.auditLog
    .create({
      data: {
        userId: donorUserId,
        action: 'WHATSAPP_DONOR_CANCEL_NOTIFIED',
        resource: 'BloodRequest',
        resourceId: requestId,
        metadata: {
          status: result.status,
          success: result.success,
          maskedPhone: maskPhoneNumber(recipientPhone),
          messageId: result.messageId || null,
        },
      },
    })
    .catch(() => {});

  return result;
}
