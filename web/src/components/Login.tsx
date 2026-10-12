import { useMemo, useState, type FormEvent } from "react";
import { api, UnauthorizedError } from "../api";
import { Scene } from "../game/scene";
import type { Session } from "../storage";
import type { PetView } from "../types";
import { Lcd } from "./Lcd";

const DEMO: PetView = {
  name: "Hammi",
  stage: "baby",
  form: null,
  hatchesAt: null,
  ageDays: 0,
  fullness: 100,
  fun: 100,
  energy: 100,
  poops: 0,
  asleep: false,
  lightsOff: false,
  mood: "happy",
  serverTime: new Date().toISOString(),
  events: [],
};

export function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const scene = useMemo(() => {
    const s = new Scene();
    s.setPet(DEMO);
    return s;
  }, []);
  const [passcode, setPasscode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!passcode || !name.trim()) return setError("Fill in both fields.");
    setBusy(true);
    setError(null);
    try {
      const res = await api.login(passcode, name.trim());
      onLogin({ token: res.token, name: res.name });
    } catch (err) {
      setError(err instanceof UnauthorizedError ? "That's not the right passcode." : "Couldn't reach Hammi. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <div className="login-screen">
        <Lcd scene={scene} />
      </div>
      <h1>Hammi</h1>
      <p className="muted">A little hamster to look after together.</p>
      <form className="card" onSubmit={submit}>
        <div className="field">
          <label htmlFor="passcode">Household passcode</label>
          <input
            id="passcode"
            type="password"
            autoComplete="current-password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="your-name">Your name</label>
          <input
            id="your-name"
            autoComplete="given-name"
            maxLength={24}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn wide" disabled={busy}>
          {busy ? "Opening…" : "Say hi to Hammi"}
        </button>
      </form>
    </main>
  );
}
