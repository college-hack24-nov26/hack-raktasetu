import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { requireOrgPermission } from '../middleware/rbac';
import { RealtimeService } from '../services/realtime';

export const realtimeRouter = Router();

/**
 * GET /api/v1/organisations/:orgId/events
 * REST Replay / Event Log Sync for Reconnected or Offline Clients.
 * Returns authoritative historical outbox events scoped to the organization.
 */
realtimeRouter.get(
  '/organisations/:orgId/events',
  requireAuth,
  requireOrgPermission(['operational:read', 'org:view', 'inventory:view', 'handover:view', 'unit:view']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const since = req.query.since as string | undefined;
      const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 100);

      const where: any = {
        organisationId: orgId,
        status: 'DELIVERED',
      };

      if (since) {
        const sinceDate = new Date(since);
        if (!isNaN(sinceDate.getTime())) {
          where.createdAt = { gte: sinceDate };
        }
      }

      const events = await prisma.outboxEvent.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: limit,
      });

      res.status(200).json({
        success: true,
        data: events.map((evt) => ({
          eventId: evt.id,
          eventType: evt.eventType,
          schemaVersion: evt.schemaVersion,
          timestamp: evt.createdAt.toISOString(),
          organisationId: evt.organisationId,
          entityType: evt.entityType,
          entityId: evt.entityId,
          payload: evt.payload,
        })),
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { message: err.message || 'Failed to retrieve event history' },
      });
    }
  }
);

/**
 * GET /api/v1/realtime/metrics
 * Server operational metrics for real-time delivery
 */
realtimeRouter.get('/realtime/metrics', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      error: { message: 'Administrative access required to view real-time metrics' },
    });
  }

  const metrics = RealtimeService.getMetrics();
  res.status(200).json({
    success: true,
    data: metrics,
  });
});
