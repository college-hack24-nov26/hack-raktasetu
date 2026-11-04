/**
 * Mobile Native Realtime WebSocket Service & Hook
 *
 * Provides real-time event streaming for the React Native mobile app.
 * Matches backend WebSocket protocol on /ws with authentication,
 * heartbeat management, auto-reconnection, and channel subscriptions.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { getApiBaseUrl } from '../config/api';
import { AuthStorage } from './authStorage';

export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface RealtimeEvent {
  eventId: string;
  eventType: string;
  schemaVersion: string;
  timestamp: string;
  organisationId?: string;
  recipientUserId?: string;
  entityType: string;
  entityId: string;
  payload: Record<string, any>;
}

export function getWebSocketUrl(): string {
  const base = getApiBaseUrl();
  return base.replace(/^http/, 'ws').replace(/\/api\/v1\/?$/, '') + '/ws';
}

type EventListener = (event: RealtimeEvent) => void;
type StatusListener = (status: RealtimeStatus) => void;

class MobileRealtimeService {
  private static instance: MobileRealtimeService | null = null;
  private ws: WebSocket | null = null;
  private status: RealtimeStatus = 'disconnected';
  private eventListeners: Set<EventListener> = new Set();
  private statusListeners: Set<StatusListener> = new Set();
  private reconnectTimer: any = null;
  private heartbeatTimer: any = null;
  private reconnectAttempts = 0;
  private activeChannels: Set<string> = new Set();
  private isConnecting = false;
  private currentUserId: string | null = null;

  static getInstance(): MobileRealtimeService {
    if (!this.instance) {
      this.instance = new MobileRealtimeService();
    }
    return this.instance;
  }

  getStatus(): RealtimeStatus {
    return this.status;
  }

  private setStatus(newStatus: RealtimeStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.statusListeners.forEach((listener) => {
        try {
          listener(newStatus);
        } catch (e) {
          console.warn('[RealtimeClient] Status listener error:', e);
        }
      });
    }
  }

  async connect(userId?: string) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (this.isConnecting) return;
    this.isConnecting = true;

    if (userId) this.currentUserId = userId;

    const token = await AuthStorage.getToken();
    if (!token) {
      this.isConnecting = false;
      this.setStatus('disconnected');
      return;
    }

    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      const wsUrl = getWebSocketUrl();
      // Connect with subprotocol auth token: raktasetu-auth.<token>
      this.ws = new WebSocket(wsUrl, [`raktasetu-auth.${token}`]);

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.setStatus('connected');

        // Start heartbeat ping
        this.startHeartbeat();

        // Subscribe to user personal channel if known
        if (this.currentUserId) {
          this.subscribe(`user:${this.currentUserId}`);
        }

        // Resubscribe active channels
        this.activeChannels.forEach((ch) => {
          this.send({ type: 'subscribe', channel: ch });
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'event' && msg.event) {
            this.eventListeners.forEach((listener) => {
              try {
                listener(msg.event);
              } catch (e) {
                console.warn('[RealtimeClient] Event listener error:', e);
              }
            });
          }
        } catch {
          // ignore malformed
        }
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.stopHeartbeat();
        this.scheduleReconnect();
      };

      this.ws.onerror = (err: any) => {
        console.warn('[RealtimeClient] WebSocket error:', err?.message || err);
        this.isConnecting = false;
        if (this.ws) {
          try {
            this.ws.close();
          } catch {}
        }
      };
    } catch (err) {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, 25000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    this.setStatus('reconnecting');
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 15000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.setStatus('disconnected');
    this.isConnecting = false;
  }

  subscribe(channel: string) {
    this.activeChannels.add(channel);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: 'subscribe', channel });
    }
  }

  unsubscribe(channel: string) {
    this.activeChannels.delete(channel);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: 'unsubscribe', channel });
    }
  }

  send(data: Record<string, any>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  addEventListener(listener: EventListener) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  addStatusListener(listener: StatusListener) {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }
}

export const realtimeClient = MobileRealtimeService.getInstance();

export interface UseMobileRealtimeOptions {
  userId?: string;
  channel?: string;
  enabled?: boolean;
  onEvent?: (event: RealtimeEvent) => void;
  onReconnect?: () => void;
}

export function useMobileRealtime({
  userId,
  channel,
  enabled = true,
  onEvent,
  onReconnect,
}: UseMobileRealtimeOptions = {}) {
  const [status, setStatus] = useState<RealtimeStatus>(realtimeClient.getStatus());
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const unsubStatus = realtimeClient.addStatusListener((newStatus) => {
      setStatus(newStatus);
      if (newStatus === 'connected') {
        onReconnectRef.current?.();
      }
    });

    const unsubEvent = realtimeClient.addEventListener((evt) => {
      onEventRef.current?.(evt);
    });

    realtimeClient.connect(userId);

    if (channel) {
      realtimeClient.subscribe(channel);
    }

    return () => {
      unsubStatus();
      unsubEvent();
      if (channel) {
        realtimeClient.unsubscribe(channel);
      }
    };
  }, [enabled, userId, channel]);

  return { status };
}

