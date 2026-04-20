import { useState, useEffect, useCallback, useRef } from 'react';
import { auth } from './services/auth';
import { api, setBridgeConnection, clearBridgeConnection, AG_BRIDGE_URL, AG_TOKEN } from './services/api';
import type { Message, Conversation } from './services/api';
import { useSSE } from './hooks/useSSE';
import { messageCache } from './utils/messageCache';
import { LoginScreen } from './screens/LoginScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { ChatScreen } from './screens/ChatScreen';
import { SettingsScreen } from './screens/SettingsScreen';

type Screen = 'dashboard' | 'chat' | 'settings';

function App() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>('dashboard');

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | undefined>();
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [agentConnected, setAgentConnected] = useState(false);
  const [pendingDialog, setPendingDialog] = useState<{ primaryText: string; primaryButton: string; dialogs: any[] } | null>(null);

  // Client-side dedup: Track recently seen message hashes to drop duplicates
  // that arrive from multiple WS connections within a 3s window.
  const recentMsgHashes = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    const session = auth.get();
    // AG_BRIDGE_URL and AG_TOKEN are already loaded from localStorage in api.ts module init.
    // If a session token exists but doesn't match, sync it.
    if (session?.token) {
      if (!AG_TOKEN) setBridgeConnection(AG_BRIDGE_URL || 'https://bridge.zerog-ai.com', session.token);
      setToken(session.token);
    }
    setLoading(false);
  }, []);

  const handleLogout = () => {
    auth.clear();
    clearBridgeConnection(); // clears tunnelUrl + token from localStorage
    messageCache.clearAll();
    setToken(null);
    setMessages([]);
    setConversations([]);
    setActiveConversation(undefined);
    setScreen('dashboard');
  };

  const addMessage = useCallback((msg: Message) => {
    // Dedup: normalize text and hash it — reject if seen within last 5s.
    // Must run OUTSIDE setMessages updater so it's synchronous and immediate.
    const normalized = msg.text.trim().replace(/\s+/g, ' ');
    const h = normalized.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
    const now = Date.now();
    for (const [k, t] of recentMsgHashes.current.entries()) {
      if (now - t > 5000) recentMsgHashes.current.delete(k);
    }
    if (recentMsgHashes.current.has(h)) return; // duplicate — drop silently
    recentMsgHashes.current.set(h, now);

    setMessages((prev) => {
      const next = [...prev, msg];
      setTimeout(() => messageCache.save(activeConversation, next), 0);
      return next;
    });
  }, [activeConversation]);

  const { sseStatus } = useSSE({
    token,
    onReply: (msg) => {
      const msgConvId = (msg as any).conversationId;
      if (!activeConversation) {
        // Active IDE Session: show ALL agent replies regardless of conversationId
        setIsTyping(false);
        addMessage(msg);
      } else if (!msgConvId || msgConvId === activeConversation) {
        // Specific conversation: show only matching convId or untagged messages
        setIsTyping(false);
        addMessage(msg);
      }
    },
    onStatusChange: (status) => setAgentConnected(status),
    onBridgeError: (err) => setBridgeError(err.message),
    onPermissionRequest: (dialog) => setPendingDialog(dialog),
  });

  const loadConversations = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.getConversations(token);
      setConversations(res.conversations || []);
    } catch { /* silent */ }
  }, [token]);

  // Load conversations on mount
  useEffect(() => {
    if (token) loadConversations();
  }, [token, loadConversations]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!token || !activeConversation) return;
    api.getHistory(token).then((res) => {
      setMessages(res.messages || []);
    }).catch(console.error);
  }, [token, activeConversation]);

  const handleSelectConversation = useCallback(async (conv: Conversation) => {
    if (conv.id) {
      setActiveConversation(conv.id);
      // Show cached messages immediately for instant load feel
      setMessages(messageCache.load(conv.id));
      try { await api.triggerTabToggle(conv.id, conv.name); } catch {}
    } else {
      setActiveConversation(undefined);
      setMessages(messageCache.load(undefined));
    }
    setScreen('chat');
  }, []);

  const handleOpenChat = useCallback(() => {
    setScreen('chat');
  }, []);

  const handleBackToDashboard = useCallback(() => {
    setScreen('dashboard');
    loadConversations();
  }, [loadConversations]);

  if (loading) return null;
  if (!token) return <LoginScreen onLogin={setToken} />;

  if (screen === 'settings') {
    return (
      <SettingsScreen
        token={token}
        sseStatus={sseStatus}
        agentConnected={agentConnected}
        conversations={conversations}
        activeConversation={activeConversation}
        onSelectConversation={handleSelectConversation}
        onLogout={handleLogout}
        onBack={() => setScreen('dashboard')}
      />
    );
  }

  if (screen === 'dashboard') {
    return (
      <DashboardScreen
        token={token}
        conversations={conversations}
        activeConversation={activeConversation}
        agentConnected={agentConnected}
        onOpenChat={handleOpenChat}
        onSelectConversation={handleSelectConversation}
        onSettings={() => setScreen('settings')}
      />
    );
  }

  return (
    <>
      <ChatScreen
        token={token}
        messages={messages}
        addMessage={addMessage}
        sseStatus={sseStatus}
        agentConnected={agentConnected}
        activeConversation={activeConversation}
        setActiveConversation={setActiveConversation}
        conversations={conversations}
        setConversations={setConversations}
        bridgeError={bridgeError}
        setBridgeError={setBridgeError}
        isTyping={isTyping}
        setIsTyping={setIsTyping}
        onLogout={handleLogout}
        onBack={handleBackToDashboard}
        onSettings={() => setScreen('settings')}
      />

      {/* ── Permission Approval Modal ── */}
      {pendingDialog && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          padding: '0 0 40px 0',
        }}>
          <div style={{
            width: '92%', maxWidth: 420,
            background: '#1e1e2e', borderRadius: 20,
            border: '1px solid rgba(99,102,241,0.3)',
            padding: '24px 20px',
            boxShadow: '0 -4px 40px rgba(0,0,0,0.6)',
          }}>
            <div style={{ fontSize: 13, color: '#a0a0c0', fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>
              ANTIGRAVITY REQUESTS APPROVAL
            </div>
            <div style={{ fontSize: 17, color: '#e0e0ff', fontWeight: 600, marginBottom: 16 }}>
              {pendingDialog.primaryText}
            </div>
            {pendingDialog.dialogs?.map((d: any, i: number) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.05)', borderRadius: 10,
                padding: '10px 14px', marginBottom: 8, fontSize: 14, color: '#c0c0e0',
              }}>
                {d.text || d.label || JSON.stringify(d)}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button onClick={async () => {
                await import('./services/api').then(m => m.api.approvePermission('deny')).catch(() => {});
                setPendingDialog(null);
              }} style={{
                flex: 1, padding: '13px 0', borderRadius: 12,
                background: 'rgba(255,255,255,0.08)', color: '#e0e0ff',
                border: '1px solid rgba(255,255,255,0.1)', fontSize: 15, fontWeight: 600,
              }}>
                Deny
              </button>
              <button onClick={async () => {
                await import('./services/api').then(m => m.api.approvePermission('allow')).catch(() => {});
                setPendingDialog(null);
              }} style={{
                flex: 2, padding: '13px 0', borderRadius: 12,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', border: 'none', fontSize: 15, fontWeight: 700,
              }}>
                {pendingDialog.primaryButton || 'Allow'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
