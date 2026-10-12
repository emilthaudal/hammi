export type Session = { token: string; name: string };

const TOKEN_KEY = "hammi.token";
const NAME_KEY = "hammi.name";

export function loadSession(): Session | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const name = localStorage.getItem(NAME_KEY);
    return token && name ? { token, name } : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  try {
    localStorage.setItem(TOKEN_KEY, session.token);
    localStorage.setItem(NAME_KEY, session.name);
  } catch {
    // Private mode or blocked storage: the session lasts until the tab closes.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(NAME_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}
