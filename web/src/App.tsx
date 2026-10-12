import { useCallback, useState } from "react";
import { GameScreen } from "./components/GameScreen";
import { Login } from "./components/Login";
import { clearSession, loadSession, saveSession, type Session } from "./storage";

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);

  const login = useCallback((s: Session) => {
    saveSession(s);
    setSession(s);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  return session ? <GameScreen key={session.token} session={session} onLogout={logout} /> : <Login onLogin={login} />;
}
