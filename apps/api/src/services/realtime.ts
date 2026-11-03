import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { prisma } from '../lib/prisma';
import { validateSession } from './auth';
import { config } from '../config/env';
import {
  RealtimeEventEnvelope,
  RealtimeEventType,
  WebSocketClientMessage,
  WebSocketServerMessage,
} from '@raktasetu/shared';
import { Prisma } from '@prisma/client';

export interface PublishOutboxEventInput {
  eventType: RealtimeEventType;
  entityType: string;
  entityId: string;
  organisationId?: string;
  recipientUserId?: string;
  payload: Record<string, any>;
  schemaVersion?: string;
}

interface ConnectedClient {
  ws: WebSocket;
  isAlive: boolean;
  userId?: string;
  userRole?: string;
  userName?: string | null;
  authorizedOrgIds: Set<string>;
  channels: Set<string>;
  remoteAddress: string;
  authenticatedAt?: Date;
  authTimeoutTimer?: NodeJS.Timeout;
}

export class RealtimeService {
  private static wss: WebSocketServer | null = null;
  private static clients: Set<ConnectedClient> = new Set();
  private static heartbeatInterval: NodeJS.Timeout | null = null;
  private static outboxDispatcherInterval: NodeJS.Timeout | null = null;
  private static isProcessingOutbox = false;
  private static isShuttingDown = false;

  // Connection safety parameters
  private static readonly MAX_CONNECTIONS = 500;
  private static readonly MAX_CONNECTIONS_PER_IP = 20;
  private static readonly MAX_PAYLOAD_BYTES = 64 * 1024; // 64 KB
  private static readonly AUTH_TIMEOUT_MS = 10000; // 10 seconds to authenticate
  private static readonly HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
  private static readonly OUTBOX_DISPATCH_INTERVAL_MS = 500; // 500ms

  /**
   * Initializes the WebSocket Server attached to an existing HTTP Server
   */
  static init(server: http.Server): WebSocketServer {
    if (this.wss) {
      return this.wss;
    }

    this.isShuttingDown = false;

    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: this.MAX_PAYLOAD_BYTES,
    });

    // Handle HTTP Upgrade requests
    server.on('upgrade', (req, socket, head) => {
      // Path gate: Only handle /ws or /api/v1/ws
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname !== '/ws' && url.pathname !== '/api/v1/ws') {
        socket.destroy();
        return;
      }

      // Check max connection limit
      if (this.clients.size >= this.MAX_CONNECTIONS) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }

      // Origin safety check
      const origin = req.headers.origin;
      if (origin && !this.isAllowedOrigin(origin)) {
        console.warn(`[Realtime] WebSocket upgrade rejected due to untrusted origin: ${origin}`);
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      // Check IP connection density
      const ip = req.socket.remoteAddress || 'unknown';
      const ipCount = Array.from(this.clients).filter((c) => c.remoteAddress === ip).length;
      if (ipCount >= this.MAX_CONNECTIONS_PER_IP) {
        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
        socket.destroy();
        return;
      }

      // Check subprotocol for token: 'raktasetu-auth.<token>'
      const subprotocolHeader = req.headers['sec-websocket-protocol'];
      let selectedProtocol: string | undefined = undefined;
      let handshakeToken: string | undefined = undefined;

      if (subprotocolHeader) {
        const protocols = subprotocolHeader.split(',').map((p) => p.trim());
        const authProto = protocols.find((p) => p.startsWith('raktasetu-auth.'));
        if (authProto) {
          handshakeToken = authProto.replace('raktasetu-auth.', '').trim();
          selectedProtocol = authProto;
        }
      }

      // Also check cookie if present
      if (!handshakeToken && req.headers.cookie) {
        const cookieToken = this.extractCookieToken(req.headers.cookie);
        if (cookieToken) {
          handshakeToken = cookieToken;
        }
      }

      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        this.wss!.emit('connection', ws, req, handshakeToken, selectedProtocol);
      });
    });

    this.wss.on('connection', (ws: WebSocket, req: http.IncomingMessage, handshakeToken?: string) => {
      this.handleConnection(ws, req, handshakeToken);
    });

    // Start background heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.sweepHeartbeats();
    }, this.HEARTBEAT_INTERVAL_MS);

    // Start transactional outbox dispatcher loop
    this.outboxDispatcherInterval = setInterval(() => {
      this.processPendingOutbox().catch((err) => {
        console.error('[Realtime Outbox] Error processing outbox events:', err);
      });
    }, this.OUTBOX_DISPATCH_INTERVAL_MS);

    console.log('[Realtime] WebSocket server initialized on path /ws');
    return this.wss;
  }

  /**
   * Helper to validate browser origin against configured origins
   */
  public static isAllowedOrigin(origin: string): boolean {
    if (!origin) return true;
    try {
      const parsedOrigin = new URL(origin).origin;
      const configuredOrigin = new URL(config.webOrigin).origin;

      if (parsedOrigin === configuredOrigin) return true;

      // Allow localhost and 127.0.0.1 in non-production
      if (config.nodeEnv !== 'production') {
        const hostname = new URL(origin).hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          return true;
        }
      }
    } catch {
      return false;
    }
    return false;
  }

  /**
   * Extracts session token from cookie header
   */
  private static extractCookieToken(cookieHeader?: string): string | null {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/raktasetu_session=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  /**
   * Handles new connected WebSocket client
   */
  private static handleConnection(ws: WebSocket, req: http.IncomingMessage, initialToken?: string) {
    const client: ConnectedClient = {
      ws,
      isAlive: true,
      authorizedOrgIds: new Set(),
      channels: new Set(),
      remoteAddress: req.socket.remoteAddress || 'unknown',
    };

    this.clients.add(client);

    // Ping / Pong setup
    ws.on('pong', () => {
      client.isAlive = true;
    });

    ws.on('message', async (data: Buffer | string) => {
      try {
        const text = data.toString('utf-8');
        let msg: WebSocketClientMessage;
        try {
          msg = JSON.parse(text);
        } catch {
          this.sendClientError(client, 'INVALID_JSON', 'Malformed JSON payload received.');
          return;
        }

        await this.handleClientMessage(client, msg);
      } catch (err: any) {
        console.error('[Realtime] Error processing client message:', err);
        this.sendClientError(client, 'INTERNAL_ERROR', 'An error occurred while processing message.');
      }
    });

    ws.on('close', () => {
      if (client.authTimeoutTimer) {
        clearTimeout(client.authTimeoutTimer);
      }
      this.clients.delete(client);
    });

    ws.on('error', (err) => {
      console.warn('[Realtime] WebSocket client error:', err.message);
      if (client.authTimeoutTimer) {
        clearTimeout(client.authTimeoutTimer);
      }
      this.clients.delete(client);
    });

    // If initial token provided via handshake (subprotocol or cookie), authenticate immediately
    if (initialToken) {
      this.authenticateClient(client, initialToken).catch((err) => {
        console.warn('[Realtime] Handshake authentication failed:', err.message);
      });
    } else {
      // Set grace timeout for client to send `{ type: 'auth', token: '...' }`
      client.authTimeoutTimer = setTimeout(() => {
        if (!client.userId) {
          this.sendClientError(client, 'AUTH_TIMEOUT', 'Authentication timeout. Connection closed.');
          ws.close(4001, 'Unauthorized');
        }
      }, this.AUTH_TIMEOUT_MS);
    }
  }

  /**
   * Authenticates a connected client with session token
   */
  private static async authenticateClient(client: ConnectedClient, token: string) {
    if (!token || typeof token !== 'string') {
      this.sendClientError(client, 'INVALID_TOKEN', 'Token must be a non-empty string.');
      client.ws.close(4001, 'Unauthorized');
      return;
    }

    const session = await validateSession(token);
    if (!session || !session.user) {
      this.sendClientError(client, 'UNAUTHORIZED', 'Invalid or expired session token.');
      client.ws.close(4001, 'Unauthorized');
      return;
    }

    if (client.authTimeoutTimer) {
      clearTimeout(client.authTimeoutTimer);
      client.authTimeoutTimer = undefined;
    }

    client.userId = session.user.id;
    client.userRole = session.user.role;
    client.userName = session.user.name;
    client.authenticatedAt = new Date();

    // Query active organisation memberships for user
    const memberships = await prisma.organisationMembership.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
      },
      select: { organisationId: true },
    });

    // Also include organisations and camps where user is actively assigned as camp staff
    const campAssignments = await prisma.campStaffAssignment.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
      },
      select: { organisationId: true, campId: true },
    });

    const allOrgIds = [
      ...memberships.map((m) => m.organisationId),
      ...campAssignments.map((c) => c.organisationId),
    ];
    client.authorizedOrgIds = new Set(allOrgIds);

    // Auto-subscribe to all active camps where user is assigned
    for (const ca of campAssignments) {
      client.channels.add(`camp:${ca.campId}`);
    }

    // Auto-subscribe to user private channel
    client.channels.add(`user:${client.userId}`);

    const serverMsg: WebSocketServerMessage = {
      type: 'authenticated',
      user: {
        id: session.user.id,
        name: session.user.name,
      },
      authorizedOrgs: Array.from(client.authorizedOrgIds),
    };

    this.send(client, serverMsg);
  }

  /**
   * Dispatches inbound client messages with strict authorization
   */
  private static async handleClientMessage(client: ConnectedClient, msg: WebSocketClientMessage) {
    if (msg.type === 'ping') {
      this.send(client, { type: 'pong' });
      return;
    }

    if (msg.type === 'auth') {
      await this.authenticateClient(client, msg.token);
      return;
    }

    // All subsequent actions require authentication
    if (!client.userId) {
      this.sendClientError(
        client,
        'UNAUTHENTICATED',
        'You must authenticate before sending commands or subscriptions.'
      );
      return;
    }

    if (msg.type === 'subscribe') {
      const channel = msg.channel?.trim();
      if (!channel) {
        this.sendClientError(client, 'INVALID_CHANNEL', 'Channel name is required.');
        return;
      }

      // Authorisation evaluation for channel
      if (channel.startsWith('org:') || channel.startsWith('inventory:') || channel.startsWith('handover:')) {
        const parts = channel.split(':');
        const orgId = parts[1];
        if (!orgId || !client.authorizedOrgIds.has(orgId)) {
          this.sendClientError(
            client,
            'FORBIDDEN_SUBSCRIPTION',
            'Access denied: You do not have verified membership in this organisation.'
          );
          return;
        }
      } else if (channel.startsWith('user:')) {
        const parts = channel.split(':');
        const targetUserId = parts[1];
        if (targetUserId !== client.userId) {
          this.sendClientError(
            client,
            'FORBIDDEN_SUBSCRIPTION',
            'Access denied: You cannot subscribe to another user personal notifications.'
          );
          return;
        }
      } else if (channel.startsWith('camp:')) {
        const parts = channel.split(':');
        const campId = parts[1];
        if (!campId) {
          this.sendClientError(client, 'INVALID_CHANNEL', 'Camp ID is required.');
          return;
        }
        const isAuthorized = await this.canUserAccessCamp(client, campId);
        if (!isAuthorized) {
          this.sendClientError(
            client,
            'FORBIDDEN_SUBSCRIPTION',
            'Access denied: You do not have authorized access to this camp.'
          );
          return;
        }
      } else {
        this.sendClientError(client, 'UNKNOWN_CHANNEL', `Unsupported channel prefix: "${channel}"`);
        return;
      }

      client.channels.add(channel);
      this.send(client, { type: 'subscribed', channel });
      return;
    }

    if (msg.type === 'unsubscribe') {
      const channel = msg.channel?.trim();
      if (channel) {
        client.channels.delete(channel);
        this.send(client, { type: 'unsubscribed', channel });
      }
      return;
    }

    if (msg.type === 'replay') {
      // Replay missed events for authorized client organisations
      await this.handleReplayRequest(client, msg.sinceTimestamp, msg.lastEventId);
      return;
    }

    this.sendClientError(client, 'UNSUPPORTED_MESSAGE', `Message type not recognized.`);
  }

  /**
   * Helper to evaluate if client has authorized access to a specific camp
   */
  private static async canUserAccessCamp(client: ConnectedClient, campId: string): Promise<boolean> {
    if (client.userRole === 'ADMIN') return true;
    if (!client.userId) return false;

    const camp = await prisma.camp.findUnique({
      where: { id: campId },
      select: { organisationId: true, createdById: true },
    });
    if (!camp) return false;

    if (camp.createdById === client.userId) return true;
    if (camp.organisationId && client.authorizedOrgIds.has(camp.organisationId)) return true;

    const staff = await prisma.campStaffAssignment.findFirst({
      where: {
        campId,
        userId: client.userId,
        isActive: true,
      },
    });
    return Boolean(staff);
  }

  /**
   * Replays recent delivered events for client reconnect recovery
   */
  private static async handleReplayRequest(
    client: ConnectedClient,
    sinceTimestamp?: string,
    lastEventId?: string
  ) {
    if (client.authorizedOrgIds.size === 0 && !client.userId) {
      return;
    }

    const where: any = {
      status: 'DELIVERED',
      OR: [
        { organisationId: { in: Array.from(client.authorizedOrgIds) } },
        { recipientUserId: client.userId },
      ],
    };

    if (sinceTimestamp) {
      where.createdAt = { gte: new Date(sinceTimestamp) };
    }

    const events = await prisma.outboxEvent.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    for (const evt of events) {
      const envelope: RealtimeEventEnvelope = {
        eventId: evt.id,
        eventType: evt.eventType as RealtimeEventType,
        schemaVersion: '1.0',
        timestamp: evt.createdAt.toISOString(),
        organisationId: evt.organisationId || undefined,
        recipientUserId: evt.recipientUserId || undefined,
        entityType: evt.entityType,
        entityId: evt.entityId,
        payload: evt.payload as any,
      };

      this.send(client, { type: 'event', event: envelope });
    }
  }

  /**
   * Sends JSON message safely to WebSocket client with backpressure protection
   */
  private static send(client: ConnectedClient, msg: WebSocketServerMessage) {
    if (client.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Slow-consumer backpressure guard: 1MB maximum buffer before shedding connection
    if (client.ws.bufferedAmount > 1024 * 1024) {
      console.warn(
        `[Realtime] Slow consumer detected for user ${client.userId || 'anon'}. Buffer: ${client.ws.bufferedAmount} bytes. Terminating connection.`
      );
      client.ws.close(1008, 'Slow Consumer Policy Violated');
      this.clients.delete(client);
      return;
    }

    client.ws.send(JSON.stringify(msg));
  }

  /**
   * Sends error payload to client
   */
  private static sendClientError(client: ConnectedClient, code: string, message: string) {
    this.send(client, { type: 'error', code, message });
  }

  /**
   * Periodically checks client heartbeats and cleans stale connections
   */
  private static sweepHeartbeats() {
    for (const client of this.clients) {
      if (!client.isAlive) {
        client.ws.terminate();
        this.clients.delete(client);
        continue;
      }
      client.isAlive = false;
      client.ws.ping();
    }
  }

  // ====================================================
  // TRANSACTIONAL OUTBOX PUBLISHING & DISPATCH
  // ====================================================

  /**
   * Publishes an event to the Transactional Outbox.
   * MUST be executed inside the same database transaction as the business operation.
   * Guarantees zero phantom events on transaction rollback.
   */
  static async publishOutboxEvent(
    tx: Prisma.TransactionClient | typeof prisma,
    input: PublishOutboxEventInput
  ) {
    const outbox = await tx.outboxEvent.create({
      data: {
        eventType: input.eventType,
        schemaVersion: input.schemaVersion || '1.0',
        entityType: input.entityType,
        entityId: input.entityId,
        organisationId: input.organisationId || null,
        recipientUserId: input.recipientUserId || null,
        payload: input.payload,
        status: 'PENDING',
      },
    });

    // Schedule immediate asynchronous flush so events are delivered quickly
    setImmediate(() => {
      this.processPendingOutbox().catch((err) => {
        console.error('[Realtime] Immediate outbox dispatch error:', err);
      });
    });

    return outbox;
  }

  /**
   * Asynchronously polls and dispatches pending outbox events to connected clients
   */
  static async processPendingOutbox(batchSize = 50): Promise<number> {
    if (this.isProcessingOutbox || this.isShuttingDown) {
      return 0;
    }
    this.isProcessingOutbox = true;

    try {
      const pendingEvents = await prisma.outboxEvent.findMany({
        where: {
          status: 'PENDING',
          retryCount: { lt: 5 },
        },
        orderBy: { createdAt: 'asc' },
        take: batchSize,
      });

      if (pendingEvents.length === 0) {
        return 0;
      }

      for (const evt of pendingEvents) {
        try {
          const envelope: RealtimeEventEnvelope = {
            eventId: evt.id,
            eventType: evt.eventType as RealtimeEventType,
            schemaVersion: '1.0',
            timestamp: evt.createdAt.toISOString(),
            organisationId: evt.organisationId || undefined,
            recipientUserId: evt.recipientUserId || undefined,
            entityType: evt.entityType,
            entityId: evt.entityId,
            payload: evt.payload as any,
          };

          // Deliver to connected clients based on subscriptions & authorization
          this.broadcastEnvelope(envelope);

          // Mark outbox event as DELIVERED
          await prisma.outboxEvent.update({
            where: { id: evt.id },
            data: {
              status: 'DELIVERED',
              deliveredAt: new Date(),
            },
          });
        } catch (deliveryErr: any) {
          const nextRetry = evt.retryCount + 1;
          await prisma.outboxEvent.update({
            where: { id: evt.id },
            data: {
              retryCount: nextRetry,
              status: nextRetry >= 5 ? 'FAILED' : 'PENDING',
              errorMessage: deliveryErr.message || String(deliveryErr),
            },
          });
        }
      }
      return pendingEvents.length;
    } finally {
      this.isProcessingOutbox = false;
    }
  }

  /**
   * Broadcasts envelope to connected authorized clients matching the event scope
   */
  private static broadcastEnvelope(envelope: RealtimeEventEnvelope) {
    const orgChannel = envelope.organisationId ? `org:${envelope.organisationId}` : null;
    const invChannel = envelope.organisationId ? `inventory:${envelope.organisationId}` : null;
    const handChannel = envelope.organisationId ? `handover:${envelope.organisationId}` : null;
    const userChannel = envelope.recipientUserId ? `user:${envelope.recipientUserId}` : null;
    const campId = (envelope.payload as any)?.campId || (envelope.entityType === 'Camp' ? envelope.entityId : null);
    const campChannel = campId ? `camp:${campId}` : null;

    for (const client of this.clients) {
      if (!client.userId || client.ws.readyState !== WebSocket.OPEN) {
        continue;
      }

      let isInterested = false;

      // Check organization channels
      if (envelope.organisationId && client.authorizedOrgIds.has(envelope.organisationId)) {
        if (
          (orgChannel && client.channels.has(orgChannel)) ||
          (invChannel && client.channels.has(invChannel)) ||
          (handChannel && client.channels.has(handChannel))
        ) {
          isInterested = true;
        }
      }

      // Check camp channel
      if (campChannel && client.channels.has(campChannel)) {
        isInterested = true;
      }

      // Check user channel
      if (userChannel && client.channels.has(userChannel)) {
        isInterested = true;
      }

      if (isInterested) {
        this.send(client, { type: 'event', event: envelope });
      }
    }
  }

  /**
   * Retrieves active stats and connection count
   */
  static getMetrics() {
    return {
      connectedClients: this.clients.size,
      activeConnections: this.clients.size,
      authenticatedClients: Array.from(this.clients).filter((c) => Boolean(c.userId)).length,
      maxConnections: this.MAX_CONNECTIONS,
      isShuttingDown: this.isShuttingDown,
      eventsPublished: 0,
    };
  }

  /**
   * Graceful server shutdown: closes intervals and all open WebSocket connections
   */
  static async shutdown() {
    this.isShuttingDown = true;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.outboxDispatcherInterval) {
      clearInterval(this.outboxDispatcherInterval);
      this.outboxDispatcherInterval = null;
    }

    // Flush any pending outbox items before closing
    try {
      await this.processPendingOutbox(100);
    } catch {
      // Ignore
    }

    for (const client of this.clients) {
      try {
        client.ws.close(1001, 'Server Shutting Down');
      } catch {
        client.ws.terminate();
      }
    }
    this.clients.clear();

    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
      this.wss = null;
    }

    console.log('[Realtime] WebSocket server shut down cleanly.');
  }
}
