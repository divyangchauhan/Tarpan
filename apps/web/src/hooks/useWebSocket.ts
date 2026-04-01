import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { WsEvent } from '@afterlight/shared';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3001';

type EventHandler = (data: unknown) => void;

interface UseWebSocketOptions {
  caseId: string;
  events: Partial<Record<WsEvent, EventHandler>>;
  enabled?: boolean;
}

export function useWebSocket({ caseId, events, enabled = true }: UseWebSocketOptions): void {
  const socketRef = useRef<Socket | null>(null);
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect((): (() => void) | void => {
    if (!enabled) return;

    const token = localStorage.getItem('accessToken');
    const socket = io(WS_URL, {
      auth: { token },
      query: { caseId },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    // Join the case room once connected
    socket.on('connect', () => {
      console.log('[WebSocket] Connected:', socket.id);
      socket.emit('join-case', caseId);
    });

    // Handle connection errors
    socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error.message);
    });

    socket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason);
    });

    // Register event listeners
    const registeredEvents = Object.keys(eventsRef.current) as WsEvent[];
    registeredEvents.forEach((event) => {
      socket.on(event, (data: unknown) => {
        eventsRef.current[event]?.(data);
      });
    });

    return (): void => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [caseId, enabled]);
}
