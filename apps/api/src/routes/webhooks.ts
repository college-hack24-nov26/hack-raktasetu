import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../config/env';
import { prisma } from '../lib/prisma';
import { maskPhoneNumber } from '../services/whatsapp';

export const webhooksRouter = Router();

/**
 * Verifies HMAC-SHA256 signature from Meta Graph Webhook
 * Header: X-Hub-Signature-256 = sha256=<hex_digest>
 */
export function verifyMetaSignature(
  rawBody: Buffer | string | undefined,
  signatureHeader: string | undefined,
  appSecret: string | undefined
): boolean {
  if (!appSecret) {
    // If no app secret is configured, reject webhook POST events for safety
    return false;
  }

  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  if (!rawBody) {
    return false;
  }

  const expectedSignature = signatureHeader.slice(7);
  const hmac = crypto.createHmac('sha256', appSecret);
  const digest = hmac.update(rawBody).digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const digestBuf = Buffer.from(digest, 'utf8');

  if (expectedBuf.length !== digestBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, digestBuf);
}

/**
 * GET /api/v1/webhooks/whatsapp
 * Meta WhatsApp Webhook Verification Handshake
 */
webhooksRouter.get('/webhooks/whatsapp', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const configuredToken = config.whatsapp.verifyToken;

  if (mode === 'subscribe' && configuredToken && token === configuredToken) {
    // Webhook handshake confirmed
    return res.status(200).send(challenge);
  }

  return res.status(403).json({
    success: false,
    error: {
      message: 'Webhook verification token mismatch or subscription mode invalid.',
      code: 'VERIFICATION_FAILED',
    },
  });
});

/**
 * POST /api/v1/webhooks/whatsapp
 * Meta WhatsApp Message and Status Delivery Notifications
 */
webhooksRouter.post('/webhooks/whatsapp', async (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const rawBody = (req as any).rawBody;

  // Enforce signature verification when WHATSAPP_APP_SECRET is configured
  if (config.whatsapp.appSecret) {
    const isValid = verifyMetaSignature(rawBody, signature, config.whatsapp.appSecret);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid webhook HMAC signature.',
          code: 'INVALID_SIGNATURE',
        },
      });
    }
  }

  const payload = req.body;

  // Process status updates safely (delivered, read, failed)
  try {
    const entry = payload?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;

    if (changes?.statuses && Array.isArray(changes.statuses)) {
      for (const statusObj of changes.statuses) {
        const messageId = statusObj.id;
        const status = statusObj.status; // sent, delivered, read, failed
        const recipientId = statusObj.recipient_id;

        // Audit the delivery status without exposing raw phone numbers
        await prisma.auditLog
          .create({
            data: {
              action: `WHATSAPP_STATUS_${status.toUpperCase()}`,
              resource: 'WhatsAppMessage',
              resourceId: messageId,
              metadata: {
                status,
                maskedRecipient: maskPhoneNumber(recipientId),
                timestamp: statusObj.timestamp,
              },
            },
          })
          .catch(() => {});
      }
    }

    // Strict security rule:
    // Incoming messages MUST NOT mutate blood requests or donor responses directly
    // unless an authenticated, authorized interactive workflow is specifically approved.
  } catch (err) {
    // Gracefully handle malformed payloads without crashing
  }

  // Acknowledge receipt to Meta
  return res.status(200).json({ success: true, message: 'EVENT_RECEIVED' });
});
