import { useEffect, useRef, useCallback, useState } from 'react';
import { getEventsUrl, isConnected } from '../services/api';
import type { Message } from '../services/api';

// Synchronous check — window.Capacitor is injected by the native bridge before JS runs
const isNativeCapacitor = typeof window !== 'undefined' && !!(window as any).Capacitor;

// Capacitor App plugin for native lifecycle events
// Falls back gracefully when running as a plain web page
let CapacitorApp: typeof import('@capacitor/app').App | null = null;
try {
  // Dynamic import so the web build doesn't break if Capacitor isn't available
  import('@capacitor/app').then(m => { CapacitorApp = m.App; }).catch(() => {});
} catch {}

export type SSEStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseSSEOptions {
  token: string | null;
  onReply?: (msg: Message) => void;
  onStatusChange?: (connected: boolean) => void;
  onPermissionRequest?: (dialog: { primaryText: string; primaryButton: string; dialogs: any[] }) => void;
  onBridgeError?: (err: { message: string; recoverable: boolean; errorCount: number }) => void;
}

export function useSSE({ token, onReply, onStatusChange, onPermissionRequest, onBridgeError }: UseSSEOptions) {
  const [sseStatus, setSSEStatus] = useState<SSEStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const mountedRef = useRef(true);
  const intentionalDisconnect = useRef(false);
  const lastSeq = useRef<number>(-1);

  // Stable references for callbacks to prevent reconnect loops
  const callbacksRef = useRef({ onReply, onStatusChange, onPermissionRequest, onBridgeError });
  useEffect(() => {
    callbacksRef.current = { onReply, onStatusChange, onPermissionRequest, onBridgeError };
  }, [onReply, onStatusChange, onPermissionRequest, onBridgeError]);

  const pingWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetPingWatchdog = useCallback(() => {
    if (pingWatchdogRef.current) clearTimeout(pingWatchdogRef.current);
    pingWatchdogRef.current = setTimeout(() => {
      console.warn('[SSE] Ping watchdog expired (40s) — forcing reconnect');
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
    }, 40_000);
  }, []);

  const clearPingWatchdog = useCallback(() => {
    if (pingWatchdogRef.current) {
      clearTimeout(pingWatchdogRef.current);
      pingWatchdogRef.current = null;
    }
  }, []);

  function scheduleRetry() {
    if (!mountedRef.current || intentionalDisconnect.current) return;
    const base = Math.min(1000 * Math.pow(2, retryCount.current), 30_000);
    const jitter = Math.random() * 1000;
    const delay = base + jitter;

    if (retryCount.current === 5) {
      callbacksRef.current.onBridgeError?.({ message: 'ZeroG is having trouble reaching your PC. Background reconnect is running.', recoverable: true, errorCount: 5 });
    }

    retryCount.current = Math.min(retryCount.current + 1, 8);
    if (retryRef.current) clearTimeout(retryRef.current);
    retryRef.current = setTimeout(() => {
      if (mountedRef.current && !intentionalDisconnect.current) connect();
    }, delay);
  }

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (intentionalDisconnect.current) return;

    // If already open or connecting, don't create a second connection
    if (wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
         wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (!isConnected()) {
      setSSEStatus('disconnected');
      callbacksRef.current.onStatusChange?.(false);
      return;
    }

    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }

    clearPingWatchdog();
    setSSEStatus('connecting');
    const url = getEventsUrl();

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        retryCount.current = 0;
        setSSEStatus('connected');
        callbacksRef.current.onStatusChange?.(true);
        resetPingWatchdog();
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(event.data);

          if (data.event === 'ping') {
            resetPingWatchdog();
            try { ws.send(JSON.stringify({ event: 'pong' })); } catch {}
            return;
          }
          if (data.event === 'pong') {
            resetPingWatchdog();
            return;
          }

          if (typeof data.seq === 'number') {
            if (lastSeq.current >= 0 && data.seq !== lastSeq.current + 1) {
              console.warn(`[SSE] Seq gap: expected ${lastSeq.current + 1}, got ${data.seq}`);
            }
            lastSeq.current = data.seq;
          }

          if (data.event === 'hello') {
            setSSEStatus('connected');
            callbacksRef.current.onStatusChange?.(true);
            if (typeof data.seq === 'number') lastSeq.current = data.seq;
            resetPingWatchdog();
          } else if (data.event === 'message_new' && data.payload?.from === 'agent') {
            const msg: Message = {
              role: 'agent',
              text: data.payload.text || '',
              ts: data.payload.createdAt ? new Date(data.payload.createdAt).getTime() : Date.now(),
              ...((data.payload.conversationId) ? { conversationId: data.payload.conversationId } : {}),
            } as any;
            callbacksRef.current.onReply?.(msg);
          } else if (data.event === 'permission_request' && data.payload) {
            callbacksRef.current.onPermissionRequest?.(data.payload);
          } else if (data.event === 'bridge_error' && data.payload) {
            callbacksRef.current.onBridgeError?.(data.payload);
          } else if (data.event === 'agent_status') {
            callbacksRef.current.onStatusChange?.(data.payload?.state === 'working' || data.payload?.state === 'idle');
          }
        } catch {
        }
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        clearPingWatchdog();
        wsRef.current = null;
        setSSEStatus('error');
        callbacksRef.current.onStatusChange?.(false);
        scheduleRetry();
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        clearPingWatchdog();
        wsRef.current = null;
        if (!intentionalDisconnect.current) {
          setSSEStatus('error');
          callbacksRef.current.onStatusChange?.(false);
          scheduleRetry();
        }
      };
    } catch {
      setSSEStatus('error');
      scheduleRetry();
    }
  }, [token, resetPingWatchdog, clearPingWatchdog]);

  useEffect(() => {
    mountedRef.current = true;
    intentionalDisconnect.current = false;
    if (token || isConnected()) connect();

    // ── Capacitor native lifecycle (iOS/Android) ───────────────────────────────
    // This fires 100% reliably when app re-enters foreground — replaces visibilitychange
    let nativeAppStateListener: { remove: () => void } | null = null;
    if (CapacitorApp) {
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive && mountedRef.current && !intentionalDisconnect.current) {
          console.log('[SSE] Native appStateChange: foregrounded — forcing reconnect');
          connect();
        }
      }).then(listener => {
        nativeAppStateListener = listener;
      }).catch(() => {});
    }

    // ── Web fallback: visibilitychange (less reliable on iOS PWA, but fine on desktop) ──
    // IMPORTANT: skip this on native Capacitor — appStateChange already handles it.
    // Running both causes two simultaneous WS connections and duplicate messages.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mountedRef.current && !intentionalDisconnect.current) {
        console.log('[SSE] visibilitychange: visible — reconnect check');
        connect();
      }
    };
    if (!isNativeCapacitor) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // ── Client-side keepalive ping every 25s ──────────────────────────────────
    // Prevents iOS from silently killing the socket while the app is in foreground
    const keepaliveInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try { wsRef.current.send(JSON.stringify({ event: 'ping' })); } catch {}
      }
    }, 25_000);

    return () => {
      mountedRef.current = false;
      intentionalDisconnect.current = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      nativeAppStateListener?.remove();
      clearInterval(keepaliveInterval);
      if (retryRef.current) clearTimeout(retryRef.current);
      clearPingWatchdog();
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
    };
  }, [token, clearPingWatchdog]);

  const disconnect = useCallback(() => {
    intentionalDisconnect.current = true;
    if (retryRef.current) clearTimeout(retryRef.current);
    clearPingWatchdog();
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    setSSEStatus('disconnected');
  }, [clearPingWatchdog]);

  const reconnect = useCallback(() => {
    intentionalDisconnect.current = false;
    retryCount.current = 0;
    connect();
  }, [connect]);

  return { sseStatus, disconnect, reconnect };
}
