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
import { ApprovalsScreen } from './screens/ApprovalsScreen';
import type { PendingPermission } from './screens/ApprovalsScreen';

type Screen = 'dashboard' | 'chat' | 'settings' | 'approvals';

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

  // Approvals: accumulate all pending permission requests
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermission[]>([]);
  // Pop-up modal for the most recent one (shown in-chat)
  const [modalPermission, setModalPermission] = useState<PendingPermission | null>(null);

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
    setPendingPermissions([]);
    setModalPermission(null);
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
    onPermissionRequest: (dialog) => {
      const perm: PendingPermission = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        permissionText: dialog.permissionText,
        conversationId: dialog.conversationId,
        ts: dialog.ts || Date.now(),
      };
      // Add to persistent list
      setPendingPermissions(prev => [...prev, perm]);
      // Show immediate pop-up modal
      setModalPermission(perm);
    },
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

  // Approval helpers
  const removePermission = (id: string) =>
    setPendingPermissions(prev => prev.filter(p => p.id !== id));

  const handleApproveAll = async () => {
    await api.approvePermission('allow').catch(() => {});
    setPendingPermissions([]);
    setModalPermission(null);
  };

  const handleDenyAll = async () => {
    await api.approvePermission('deny').catch(() => {});
    setPendingPermissions([]);
    setModalPermission(null);
  };

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

  if (screen === 'approvals') {
    return (
      <ApprovalsScreen
        permissions={pendingPermissions}
        onApprove={(id) => removePermission(id)}
        onDeny={(id) => removePermission(id)}
        onApproveAll={handleApproveAll}
        onDenyAll={handleDenyAll}
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
        pendingApprovalsCount={pendingPermissions.length}
        onOpenChat={handleOpenChat}
        onSelectConversation={handleSelectConversation}
        onSettings={() => setScreen('settings')}
        onApprovals={() => setScreen('approvals')}
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

      {/* ── Real-time Permission Modal (most recent request) ── */}
      {modalPermission && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          padding: `0 0 max(env(safe-area-inset-bottom, 20px), 20px) 0`,
        }}>
          <div style={{
            width: '92%', maxWidth: 420,
            background: '#1e1e2e', borderRadius: 20,
            border: '1px solid rgba(99,102,241,0.3)',
            padding: '24px 20px',
            boxShadow: '0 -4px 40px rgba(0,0,0,0.6)',
          }}>
            <div style={{ fontSize: 13, color: '#a0a0c0', fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>
              🔐 ANTIGRAVITY REQUESTS APPROVAL
            </div>
            <div style={{ fontSize: 16, color: '#e0e0ff', fontWeight: 600, marginBottom: 4, lineHeight: 1.5 }}>
              {modalPermission.permissionText || 'Antigravity is requesting approval to proceed.'}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
              {pendingPermissions.length > 1 ? `+${pendingPermissions.length - 1} more pending — view all in Approvals` : ''}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={async () => {
                await api.approvePermission('deny').catch(() => {});
                removePermission(modalPermission.id);
                setModalPermission(null);
              }} style={{
                flex: 1, padding: '13px 0', borderRadius: 12,
                background: 'rgba(255,255,255,0.08)', color: '#e0e0ff',
                border: '1px solid rgba(255,255,255,0.1)', fontSize: 15, fontWeight: 600,
              }}>
                Deny
              </button>
              <button onClick={async () => {
                await api.approvePermission('allow').catch(() => {});
                removePermission(modalPermission.id);
                setModalPermission(null);
              }} style={{
                flex: 2, padding: '13px 0', borderRadius: 12,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', border: 'none', fontSize: 15, fontWeight: 700,
              }}>
                Allow
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
