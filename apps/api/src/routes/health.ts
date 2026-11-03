import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { config } from '../config/env';

export const healthRouter = Router();

const startTime = Date.now();

healthRouter.get('/health', async (req: Request, res: Response) => {
  let dbConnected = false;
  let dbError: string | null = null;

  try {
    // Perform light query to verify live Neon database connectivity
    await prisma.$queryRaw`SELECT 1`;
    dbConnected = true;
  } catch (error: any) {
    dbConnected = false;
    dbError = error.message;
  }

  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    service: 'RaktaSetu API',
    environment: config.nodeEnv,
    uptimeSeconds,
    timestamp: new Date().toISOString(),
    database: {
      connected: dbConnected,
      provider: 'Neon PostgreSQL',
      ...(dbError ? { error: dbError } : {}),
    },
    integrations: {
      whatsapp: {
        configured: config.whatsapp.isConfigured,
        webhookConfigured: Boolean(config.whatsapp.verifyToken && config.whatsapp.appSecret),
      },
    },
  });
});
