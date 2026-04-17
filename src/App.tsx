import { useState, useEffect, useCallback } from 'react';
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
    setMessages((prev) => {
      const next = [...prev, msg];
      // Persist after state update — schedule microtask so activeConversation is stable
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
    onPermissionRequest: () => {},
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
  );
}

export default App;
