import { useState, useEffect, useCallback, useRef } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
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
import { SupportScreen } from './screens/SupportScreen';

type Screen = 'dashboard' | 'chat' | 'settings' | 'approvals' | 'support';

function App() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [prevScreen, setPrevScreen] = useState<Screen>('dashboard');

  const navigateTo = useCallback((s: Screen) => {
    setPrevScreen(prev => prev !== s ? screen : prev);
    setScreen(s);
  }, [screen]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | undefined>();
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [agentConnected, setAgentConnected] = useState(false);

  // Approvals: accumulate all pending permission requests
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermission[]>([]);

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

  // Push notification delivery: handle tap when app was backgrounded
  // Must be AFTER addMessage declaration to avoid TS2448
  useEffect(() => {
    let tapListener: any;
    let fgListener: any;
    try {
      fgListener = PushNotifications.addListener('pushNotificationReceived', (notification) => {
        const data = notification.data as any;
        if (data?.type === 'agent_reply' && data?.text) {
          addMessage({ role: 'agent', text: data.text, ts: Date.now() } as any);
        }
      });
      tapListener = PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const data = action.notification.data as any;
        if (data?.type === 'agent_reply' && data?.text) {
          addMessage({ role: 'agent', text: data.text, ts: Date.now() } as any);
          setScreen('chat');
        }
      });
    } catch {
      // Not native — skip in web/dev mode
    }
    return () => { try { fgListener?.remove(); tapListener?.remove(); } catch {} };
  }, [addMessage]);

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
      // Silently add to pending — banner shows in chat, badge shows on dashboard.
      // Never force-navigate. The user decides when to act.
      setPendingPermissions(prev => {
        const alreadyExists = prev.some(p => p.permissionText === perm.permissionText);
        return alreadyExists ? prev : [...prev, perm];
      });
    },
    onPermissionResolved: (payload) => {
      // Clear all pending permissions for this conversation — updates both chat and pending page
      setPendingPermissions(prev =>
        payload.conversationId
          ? prev.filter(p => p.conversationId !== payload.conversationId)
          : [] // No convId = clear all
      );
    },
    onConversationSwitch: (conversationId) => {
      // Bridge switched IDE tab — update phone's active conversation so replies aren't filtered
      setActiveConversation(conversationId);
    },
  });

  const loadConversations = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.getConversations(token);
      const convs = res.conversations || [];
      setConversations(convs);
      // Auto-align with bridge's active conversation:
      // Bridge always pins lastActiveConvId to position 0 with status != 'idle'.
      // If phone hasn't selected a conversation yet, auto-select it so routing is correct.
      const bridgeActive = convs.find((c: any) => c.status && c.status !== 'idle') || convs[0];
      if (bridgeActive && !activeConversation) {
        setActiveConversation(bridgeActive.id);
        try { await api.triggerTabToggle(bridgeActive.id, bridgeActive.name); } catch {}
      }
    } catch { /* silent */ }
  }, [token, activeConversation]);

  // Load conversations on mount
  useEffect(() => {
    if (token) loadConversations();
  }, [token, loadConversations]);

  // ── Permission polling fallback (4s interval) ──────────────────────────────
  // Polls /monitor/status via HTTP — works regardless of WebSocket connectivity.
  // Uses refs to read live state so the interval never needs to reset.
  const pendingPermissionsRef = useRef<PendingPermission[]>([]);
  pendingPermissionsRef.current = pendingPermissions;
  const screenRef = useRef<Screen>('dashboard');
  screenRef.current = screen;

  useEffect(() => {
    if (!token) return;
    const poll = setInterval(async () => {
      try {
        const { status, permissionText, activeConvId } = await api.getMonitorStatus();
        if (status === 'waiting') {
          const text = permissionText || 'Antigravity is requesting approval to proceed.';
          const alreadyPending = pendingPermissionsRef.current.some(p => p.permissionText === text);
          if (!alreadyPending) {
            const perm: PendingPermission = {
              id: `poll-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              permissionText: text,
              conversationId: activeConvId || undefined,
              ts: Date.now(),
            };
            setPendingPermissions(prev => [...prev, perm]);
            // Never auto-navigate — badge on dashboard + banner in chat handles surfacing
          }
          // If already pending + not in approvals/chat, don't re-navigate — user may have dismissed it
        } else if (status === 'idle' && pendingPermissionsRef.current.length > 0) {
          // IDE finished — permission was acted on. Auto-clear the pending list.
          setPendingPermissions([]);
        }
      } catch { /* silent — bridge may be temporarily unreachable */ }
    }, 4000);
    return () => clearInterval(poll);
  }, [token, navigateTo]);


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
  };

  const handleDenyAll = async () => {
    await api.approvePermission('deny').catch(() => {});
    setPendingPermissions([]);
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

  if (screen === 'support') {
    return (
      <SupportScreen
        token={token}
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
        onBack={() => setScreen(prevScreen === 'approvals' ? 'dashboard' : prevScreen)}
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
        onRefresh={loadConversations}
        onSettings={() => setScreen('settings')}
        onApprovals={() => setScreen('approvals')}
      onSupport={() => setScreen('support')}
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
        onSettings={() => navigateTo('settings')}
        pendingApprovalsCount={pendingPermissions.length}
        onApprovals={() => navigateTo('approvals')}
        onRefresh={loadConversations}
      />
    </>
  );
}

export default App;
