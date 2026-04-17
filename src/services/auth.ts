interface Session {
  token: string | null;
  expires?: number;
  userId?: number;
}

export const auth = {
  save: (session: Session) => localStorage.setItem('zerog_session', JSON.stringify(session)),
  get: (): Session | null => {
    try {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const hashToken = hashParams.get('token');
      if (hashToken) {
        const session = { token: hashToken };
        localStorage.setItem('zerog_session', JSON.stringify(session));
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        return session;
      }
      return JSON.parse(localStorage.getItem('zerog_session') || 'null');
    } catch {
      return null;
    }
  },
  clear: () => localStorage.removeItem('zerog_session'),
}
