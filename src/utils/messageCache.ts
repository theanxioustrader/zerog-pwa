import type { Message } from '../services/api';

const MAX_MESSAGES = 18;
const KEY_PREFIX = 'zerog_msgs_';

function cacheKey(conversationId: string | undefined): string {
  return KEY_PREFIX + (conversationId ?? 'active');
}

export const messageCache = {
  load(conversationId: string | undefined): Message[] {
    try {
      const raw = localStorage.getItem(cacheKey(conversationId));
      if (!raw) return [];
      return JSON.parse(raw) as Message[];
    } catch {
      return [];
    }
  },

  save(conversationId: string | undefined, messages: Message[]): void {
    try {
      const trimmed = messages.slice(-MAX_MESSAGES);
      localStorage.setItem(cacheKey(conversationId), JSON.stringify(trimmed));
    } catch {
      // Storage full or unavailable — fail silently
    }
  },

  clear(conversationId: string | undefined): void {
    try {
      localStorage.removeItem(cacheKey(conversationId));
    } catch {}
  },

  clearAll(): void {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(KEY_PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    } catch {}
  },
};
