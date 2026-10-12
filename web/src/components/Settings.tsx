import { useEffect, useState, type FormEvent } from "react";
import { api, UnauthorizedError } from "../api";
import { disablePush, enablePush, isIos, pushStatus, type PushStatus } from "../push";
import type { Session } from "../storage";
import type { PetView } from "../types";
import { HowToPlay } from "./HowToPlay";

type Props = {
  session: Session;
  petName: string;
  onRenamed: (pet: PetView) => void;
  onLogout: () => void;
  onClose: () => void;
};

export function Settings({ session, petName, onRenamed, onLogout, onClose }: Props) {
  const [name, setName] = useState(petName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [push, setPush] = useState<PushStatus | "loading">("loading");
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    pushStatus()
      .then(setPush)
      .catch(() => setPush("unsupported"));
  }, []);

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 16) return setMessage("Pick a name of 1 to 16 characters.");
    setSaving(true);
    try {
      onRenamed(await api.rename(session.token, trimmed));
      setMessage("Saved!");
    } catch (err) {
      if (err instanceof UnauthorizedError) return onLogout();
      setMessage("Couldn't save the name. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const togglePush = async () => {
    setPushError(null);
    try {
      setPush(push === "on" ? await disablePush(session.token) : await enablePush(session.token));
    } catch (err) {
      if (err instanceof UnauthorizedError) return onLogout();
      setPushError(err instanceof Error ? err.message : "Couldn't change notifications.");
    }
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={onClose}>
      <section className="card settings" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 id="settings-title">Settings</h2>
          <button type="button" className="link" onClick={onClose}>
            Done
          </button>
        </header>

        <form onSubmit={rename} className="field">
          <label htmlFor="pet-name">Hamster's name</label>
          <div className="row">
            <input
              id="pet-name"
              value={name}
              maxLength={16}
              autoComplete="off"
              onChange={(e) => {
                setName(e.target.value);
                setMessage(null);
              }}
            />
            <button type="submit" className="btn" disabled={saving || name.trim() === petName}>
              Save
            </button>
          </div>
          {message && <p className="muted small">{message}</p>}
        </form>

        {push !== "unconfigured" && (
          <div className="field">
            <label>Notifications</label>
            {push === "loading" && <p className="muted small">Checking…</p>}
            {push === "needs-install" && (
              <p className="muted small">
                To get notifications on {isIos() ? "iPhone" : "this device"}, tap <strong>Share</strong> then{" "}
                <strong>Add to Home Screen</strong>, and open Hammi from there.
              </p>
            )}
            {push === "unsupported" && <p className="muted small">This browser can't show notifications.</p>}
            {push === "denied" && (
              <p className="muted small">Notifications are blocked. Allow them for Hammi in your device settings.</p>
            )}
            {(push === "on" || push === "off") && (
              <button type="button" className="btn" onClick={togglePush}>
                {push === "on" ? "Turn off notifications" : "Turn on notifications"}
              </button>
            )}
            {push === "on" && <p className="muted small">Hammi will send a gentle nudge now and then.</p>}
            {pushError && <p className="muted small">{pushError}</p>}
          </div>
        )}

        <HowToPlay />

        <div className="field">
          <label>Signed in as {session.name}</label>
          <button type="button" className="btn secondary" onClick={onLogout}>
            Log out
          </button>
        </div>
      </section>
    </div>
  );
}
