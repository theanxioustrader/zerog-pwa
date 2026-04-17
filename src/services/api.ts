/**
 * ZeroG API Service — AG Bridge Protocol
 * Connects directly to the cdp-bridge via Cloudflare Tunnel.
 * On first launch, discovers tunnel URL from the ZeroG Registry via PIN.
 */

const REGISTRY_URL = 'https://registry.zerog-ai.com';
const STORAGE_KEY_TUNNEL = 'zerog_tunnel_url';
const STORAGE_KEY_TOKEN  = 'zerog_tunnel_token';

// Resolved after PIN claim — stored in localStorage for subsequent launches
export let AG_BRIDGE_URL: string = localStorage.getItem(STORAGE_KEY_TUNNEL) || '';
export let AG_TOKEN: string      = localStorage.getItem(STORAGE_KEY_TOKEN)  || '';

export function setBridgeConnection(url: string, token: string) {
  AG_BRIDGE_URL = url;
  AG_TOKEN = token;
  localStorage.setItem(STORAGE_KEY_TUNNEL, url);
  localStorage.setItem(STORAGE_KEY_TOKEN, token);
}

export function clearBridgeConnection() {
  AG_BRIDGE_URL = '';
  AG_TOKEN = '';
  localStorage.removeItem(STORAGE_KEY_TUNNEL);
  localStorage.removeItem(STORAGE_KEY_TOKEN);
}

export function getBridgeUrl() { return AG_BRIDGE_URL; }
export function getBridgeToken() { return AG_TOKEN; }
export function isConnected() { return !!(AG_BRIDGE_URL && AG_TOKEN); }

// Fix 6: Track active conversation ID resolved after tab switch via /open-sync
let activeConversationId: string | null = null;
export function getActiveConversationId() { return activeConversationId; }
export function setActiveConversationId(id: string | null) { activeConversationId = id; }

export interface Message {
  role: 'user' | 'agent';
  text: string;
  ts: number;
}

export interface HistoryResponse {
  messages: Message[];
}

export interface AuthResponse {
  token: string;
  expires: number;
  userId: number;
}

export interface StatusResponse {
  connected: boolean;
  userId: number;
  timestamp: string;
}

// Pair with the AG Bridge using a 6-digit PIN via the ZeroG Registry
export async function pairWithBridge(_bridgeUrl: string, code: string): Promise<string> {
  // Step 1: Claim PIN from registry → get { tunnelUrl, token }
  const res = await fetch(`${REGISTRY_URL}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: code.trim() }),
  });
  const data = await res.json();
  if (!res.ok || !data.tunnelUrl || !data.token) {
    throw new Error(data.error || 'PIN not found. Is ZeroG Desktop running?');
  }
  // Step 2: Store the live tunnel URL + token
  setBridgeConnection(data.tunnelUrl, data.token);
  return data.token;
}

// Check if the bridge is healthy
export async function checkHealth(bridgeUrl: string): Promise<boolean> {
  try {
    const url = bridgeUrl.replace(/\/$/, '');
    const res = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(5000),
      headers: {
        // Required to bypass localtunnel's browser challenge page
        'bypass-tunnel-reminder': '1',
      },
    });
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

// Max raw attachment size: 5MB (base64 string will be ~6.9MB encoded at 1.37x overhead)
const MAX_ATTACHMENT_BASE64_LENGTH = 6_900_000;

export async function sendMessage(text: string, attachment?: { name: string; base64: string }, conversationId?: string): Promise<{ ok: boolean }> {
  // Guard: reject oversized attachments before hitting the network
  if (attachment?.base64 && attachment.base64.length > MAX_ATTACHMENT_BASE64_LENGTH) {
    throw new Error('Attachment too large (max 5 MB). Please compress the image and try again.');
  }

  // Fix 6: Prefer stored activeConversationId from last open-sync tab switch over 'active' sentinel
  const resolvedConvId = (!conversationId || conversationId === 'active')
    ? (activeConversationId ?? conversationId)
    : conversationId;
  const res = await fetch(`${AG_BRIDGE_URL}/messages/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ag-token': AG_TOKEN,
    },
    body: JSON.stringify({ to: 'agent', from: 'user', text, attachment, conversationId: resolvedConvId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Send failed');
  return data;
}

// Get message inbox (agent replies)
export async function getInbox(): Promise<Message[]> {
  const res = await fetch(
    `${AG_BRIDGE_URL}/messages/inbox?to=user&limit=50`,
    { headers: { 'x-ag-token': AG_TOKEN } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Inbox failed');

  // Map AG bridge format to our internal Message format
  return (data.messages || []).map((m: any) => ({
    role: m.from === 'user' ? 'user' : 'agent',
    text: m.text || '',
    ts: new Date(m.createdAt).getTime(),
  }));
}

// WebSocket events URL
export function getEventsUrl(): string {
  return `${AG_BRIDGE_URL.replace('http', 'ws')}/events?token=${AG_TOKEN}`;
}

// Legacy API shim for compatibility with existing screens (cloud Railway)
export const API_URL = 'https://zerog-ai-production.up.railway.app';

export interface Conversation {
  id: string;
  name: string;
  updatedAt: string;
}

export const api = {
  auth: async (secret: string) => {
    const trimmed = secret.trim();
    if (/^\d{4,8}$/.test(trimmed)) {
      // It's a PIN — claim from registry to get tunnelUrl + token
      const token = await pairWithBridge('', trimmed);
      return { token, expires: 0, userId: 0 };
    }
    // It's a direct token paste — assume tunnel URL is already stored
    setBridgeConnection(AG_BRIDGE_URL || 'https://bridge.zerog-ai.com', trimmed);
    return { token: trimmed, expires: 0, userId: 0 };
  },
  getStatus: (_token?: string) => Promise.resolve({ connected: isConnected(), userId: 0, timestamp: new Date().toISOString() }),
  sendMessage: async (_token: string, message: string, conversationId?: string, attachment?: { name: string; base64: string }) => {
    // 100% of PWA payloads explicitly proxy through the desktop bridge.
    // The cdp-bridge.ts layer natively handles JWT tunneling & auth validation for background headless agents!
    return await sendMessage(message, attachment, conversationId);
  },
  getHistory: async (_token?: string) => {
    // Only return local offline history
    try {
      const p2pMsgs = await getInbox().catch(() => []);
      return { messages: p2pMsgs.sort((a: any, b: any) => a.ts - b.ts) };
    } catch {
      return { messages: [] };
    }
  },
  getConversations: async (_token: string): Promise<{conversations: Conversation[]}> => {
     try {
       const localRes = await fetch(`${AG_BRIDGE_URL}/conversations`, { headers: { 'x-ag-token': AG_TOKEN } }).catch(() => null);
       
       let localConvos: any[] = [];
       if (localRes && localRes.ok) localConvos = (await localRes.json()).conversations || [];
       
       return { conversations: localConvos };
     } catch {
       return { conversations: [] };
     }
  },
  getStreamUrl: (_token?: string) => getEventsUrl(),
  registerPushToken: async (pushToken: string) => {
     if (!AG_BRIDGE_URL || !AG_TOKEN) return;
     try {
       await fetch(`${AG_BRIDGE_URL.replace(/\/$/, '')}/notifications/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-ag-token': AG_TOKEN },
          body: JSON.stringify({ pushToken })
       });
     } catch {}
  },
  triggerTabToggle: async (conversationId: string, name?: string) => {
     if (!AG_BRIDGE_URL || !AG_TOKEN) return;
     try {
       const res = await fetch(`${AG_BRIDGE_URL.replace(/\/$/, '')}/open-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-ag-token': AG_TOKEN },
          body: JSON.stringify({ conversationId, name })
       });
       // Fix 6: Store the resolved UUID so next message send routes to the correct conversation
       const data = await res.json().catch(() => ({}));
       if (data.activeConversationId) {
         activeConversationId = data.activeConversationId;
         console.log('[ZeroG] Active conversation resolved:', activeConversationId);
       }
       return data;
     } catch {}
     return null;
   },
   approvePermission: async (action: string) => {
      if (!AG_BRIDGE_URL || !AG_TOKEN) return;
      try {
        await fetch(`${AG_BRIDGE_URL.replace(/\/$/, '')}/permission-action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-ag-token': AG_TOKEN },
          body: JSON.stringify({ action }),
        });
      } catch {}
   },
};
