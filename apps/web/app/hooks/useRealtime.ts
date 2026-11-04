'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { RealtimeEventEnvelope, WebSocketServerMessage } from '@raktasetu/shared';

export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'fallback_polling';

export interface UseRealtimeOptions {
  organisationId?: string;
  userId?: string;
  campId?: string;
  channel?: string;
  token?: string; // Optional if session cookie is present
  onEvent?: (event: RealtimeEventEnvelope) => void;
  onReconnect?: () => void;
  enabled?: boolean;
}

export function useRealtime({
  organisationId,
  userId,
  campId,
  channel,
  token,
  onEvent,
  onReconnect,
  enabled = true,
}: UseRealtimeOptions) {
  const [status, setStatus] = useState<RealtimeStatus>('disconnected');
  const [lastEvent, setLastEvent] = useState<RealtimeEventEnvelope | null>(null);
  const [lastReplayTime, setLastReplayTime] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackPollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const lastEventTimestampRef = useRef<string>('');
  const onEventRef = useRef(onEvent);
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  useEffect(() => {
    if (!lastEventTimestampRef.current) {
      lastEventTimestampRef.current = new Date().toISOString();
    }
  }, []);

  onEventRef.current = onEvent;

  // Track max 200 event IDs to prevent duplicate event execution
  const registerEventId = useCallback((id: string): boolean => {
    if (seenEventIdsRef.current.has(id)) {
      return false; // Duplicate
    }
    seenEventIdsRef.current.add(id);
    if (seenEventIdsRef.current.size > 200) {
      const first = seenEventIdsRef.current.values().next().value;
      if (first) seenEventIdsRef.current.delete(first);
    }
    return true;
  }, []);

  // Authoritative REST catch-up sync for reconnected / polling clients
  const syncMissedEvents = useCallback(async (orgId: string, since: string) => {
    try {
      const res = await fetch(`/api/v1/organisations/${encodeURIComponent(orgId)}/events?since=${encodeURIComponent(since)}&limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        for (const evt of data.data) {
          if (registerEventId(evt.eventId)) {
            lastEventTimestampRef.current = evt.timestamp;
            setLastEvent(evt);
            onEventRef.current?.(evt);
          }
        }
        setLastReplayTime(new Date().toISOString());
      }
    } catch {
      // Non-blocking sync failure; REST views retain authoritative read integrity
    }
  }, [registerEventId]);

  const currentCampIdRef = useRef<string | undefined>(campId);
  currentCampIdRef.current = campId;
  const currentChannelRef = useRef<string | undefined>(channel);
  currentChannelRef.current = channel;

  // Dynamic camp channel subscription without tearing down the existing WebSocket
  useEffect(() => {
    if (campId && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', channel: `camp:${campId}` }));
    }
  }, [campId]);

  // Dynamic custom channel subscription without tearing down the existing WebSocket
  useEffect(() => {
    if (channel && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', channel }));
    }
  }, [channel]);

  useEffect(() => {
    if (!enabled || (!organisationId && !userId && !currentCampIdRef.current && !currentChannelRef.current)) {
      setStatus('disconnected');
      return;
    }

    let isMounted = true;

    function cleanupSocket() {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      if (wsRef.current) {
        const sock = wsRef.current;
        wsRef.current = null;
        sock.onclose = null;
        sock.onerror = null;
        sock.onmessage = null;

        if (sock.readyState === WebSocket.CONNECTING) {
          sock.onopen = () => {
            try {
              sock.close(1000, 'Component unmounted during handshake');
            } catch {}
          };
        } else if (sock.readyState === WebSocket.OPEN) {
          try {
            sock.close(1000, 'Component unmounted or subscription change');
          } catch {}
        }
      }
    }

    function startFallbackPolling() {
      setStatus('fallback_polling');
      if (fallbackPollTimerRef.current) clearInterval(fallbackPollTimerRef.current);

      fallbackPollTimerRef.current = setInterval(() => {
        if (!isMounted || !organisationId) return;
        syncMissedEvents(organisationId, lastEventTimestampRef.current);
      }, 15000); // Poll every 15 seconds in fallback mode
    }

    function connect() {
      if (!isMounted) return;
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        return;
      }
      cleanupSocket();

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // In local development API runs on port 4000 or same origin
      const apiHost = process.env.NEXT_PUBLIC_API_URL 
        ? process.env.NEXT_PUBLIC_API_URL.replace(/^http(s?):\/\//, '').replace(/\/api\/v1\/?$/, '')
        : 'localhost:4000';
      const wsUrl = `${protocol}//${apiHost}/ws`;

      setStatus(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');

      try {
        const resolvedToken = token || (typeof window !== 'undefined' ? localStorage.getItem('raktasetu_token') || undefined : undefined);
        const protocols = resolvedToken ? [`raktasetu-auth.${resolvedToken}`] : undefined;
        const socket = new WebSocket(wsUrl, protocols);
        wsRef.current = socket;

        socket.onopen = () => {
          if (!isMounted) return;
          setStatus('connected');
          const wasReconnecting = reconnectAttemptRef.current > 0;
          reconnectAttemptRef.current = 0;

          // Clear fallback polling once WS is successfully connected
          if (fallbackPollTimerRef.current) {
            clearInterval(fallbackPollTimerRef.current);
            fallbackPollTimerRef.current = null;
          }

          // If token was not in subprotocol, send auth message as fallback
          if (resolvedToken) {
            socket.send(JSON.stringify({ type: 'auth', token: resolvedToken }));
          }

          // Subscribe to channels
          if (organisationId) {
            socket.send(JSON.stringify({ type: 'subscribe', channel: `org:${organisationId}` }));
          }
          if (userId) {
            socket.send(JSON.stringify({ type: 'subscribe', channel: `user:${userId}` }));
          }
          if (currentCampIdRef.current) {
            socket.send(JSON.stringify({ type: 'subscribe', channel: `camp:${currentCampIdRef.current}` }));
          }
          if (currentChannelRef.current) {
            socket.send(JSON.stringify({ type: 'subscribe', channel: currentChannelRef.current }));
          }

          // If reconnecting, notify listener and perform catch-up sync
          if (wasReconnecting) {
            onReconnectRef.current?.();
            if (organisationId) {
              syncMissedEvents(organisationId, lastEventTimestampRef.current);
            }
          }

          // Setup ping heartbeat every 25 seconds
          heartbeatTimerRef.current = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'ping' }));
            }
          }, 25000);
        };

        socket.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data: WebSocketServerMessage = JSON.parse(event.data);
            if (data.type === 'event' && data.event) {
              const evt = data.event;
              if (registerEventId(evt.eventId)) {
                lastEventTimestampRef.current = evt.timestamp;
                setLastEvent(evt);
                onEventRef.current?.(evt);
              }
            } else if (data.type === 'error') {
              // Internal error handling without exposing stack traces
              if (data.code === 'UNAUTHORIZED' || data.code === 'FORBIDDEN_SUBSCRIPTION') {
                cleanupSocket();
                startFallbackPolling();
              }
            }
          } catch {
            // Malformed messages silently dropped
          }
        };

        socket.onclose = (event) => {
          if (!isMounted) return;
          cleanupSocket();

          // If closed cleanly by server due to forbidden auth, do not aggressively reconnect WS
          if (event.code === 4001 || event.code === 4003) {
            startFallbackPolling();
            return;
          }

          // Bounded exponential backoff with jitter
          reconnectAttemptRef.current += 1;
          if (reconnectAttemptRef.current > 5) {
            // After 5 attempts, degrade to fallback REST polling
            startFallbackPolling();
            // Try reconnecting WS once every 60 seconds
            reconnectTimerRef.current = setTimeout(() => {
              if (isMounted) {
                reconnectAttemptRef.current = 1;
                connect();
              }
            }, 60000);
          } else {
            const jitter = Math.random() * 1000;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current) + jitter, 15000);
            setStatus('reconnecting');
            reconnectTimerRef.current = setTimeout(connect, delay);
          }
        };

        socket.onerror = () => {
          // Native browser onerror contains no descriptive event data for security reasons
          if (socket.readyState === WebSocket.OPEN) {
            socket.close();
          }
        };
      } catch {
        startFallbackPolling();
      }
    }

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (fallbackPollTimerRef.current) clearInterval(fallbackPollTimerRef.current);
      cleanupSocket();
    };
  }, [organisationId, userId, token, enabled, syncMissedEvents, registerEventId]);

  return {
    status,
    lastEvent,
    lastReplayTime,
    isLive: status === 'connected',
    isPollingFallback: status === 'fallback_polling',
  };
}
