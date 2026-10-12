import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, UnauthorizedError } from "../api";
import { Scene } from "../game/scene";
import type { Session } from "../storage";
import { timeAgo } from "../time";
import type { ActionType, PetView } from "../types";
import { Device, ICONS, type ButtonId } from "./Device";
import { GearIcon } from "./Icons";
import { LogPanel } from "./LogPanel";
import { Settings } from "./Settings";

const POLL_MS = 5000;

type Props = { session: Session; onLogout: () => void };

function disabledFor(pet: PetView | null): boolean[] {
  return ICONS.map(({ id }) => {
    if (!pet) return id !== "stats" && id !== "log";
    if (pet.stage === "egg") return !["pet", "stats", "log"].includes(id);
    if (pet.asleep) return ["meal", "snack", "play"].includes(id);
    return false;
  });
}

export function GameScreen({ session, onLogout }: Props) {
  const scene = useMemo(() => new Scene(), []);
  const [pet, setPet] = useState<PetView | null>(null);
  const [selected, setSelected] = useState(-1);
  const [showLog, setShowLog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const busy = useRef(false);

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof UnauthorizedError) onLogout();
      else setToast("Hammi can't reach home right now. Try again in a moment.");
    },
    [onLogout],
  );

  const update = useCallback(
    (state: PetView) => {
      scene.setPet(state);
      setPet(state);
    },
    [scene],
  );

  const refresh = useCallback(async () => {
    try {
      update(await api.state(session.token));
      setToast(null);
    } catch (e) {
      fail(e);
    }
  }, [session.token, update, fail]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const act = useCallback(
    async (type: ActionType, won?: number) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const res = await api.action(session.token, type, won);
        scene.applyAction(res.state, res.reaction, type);
        setPet(res.state);
        setToast(null);
      } catch (e) {
        fail(e);
      } finally {
        busy.current = false;
      }
    },
    [scene, session.token, fail],
  );

  const activate = (i: number) => {
    setSelected(i);
    if (scene.mode === "game") return;
    const id = ICONS[i].id;
    if (id === "stats") return scene.setMode(scene.mode === "stats" ? "idle" : "stats");
    if (id === "log") return setShowLog((v) => !v);
    scene.setMode("idle");
    if (id === "play") {
      if (!pet) return;
      if (pet.stage === "egg") return scene.react("egg");
      if (pet.asleep) return scene.react("asleep");
      return scene.startGame((won) => act("play", won));
    }
    act(id);
  };

  const press = (b: ButtonId) => {
    if (scene.mode === "game") {
      if (b === "A") scene.guess(-1);
      else if (b === "B") scene.guess(1);
      else scene.setMode("idle");
      return;
    }
    if (b === "A") return setSelected((s) => (s + 1) % ICONS.length);
    if (b === "B") {
      if (scene.mode === "stats") return scene.setMode("idle");
      if (selected >= 0) activate(selected);
      return;
    }
    if (scene.mode === "stats") return scene.setMode("idle");
    if (showLog) return setShowLog(false);
    setSelected(-1);
  };

  const tapScreen = (fx: number) => {
    if (scene.mode === "game") return scene.guess(fx < 0.5 ? -1 : 1);
    if (scene.mode === "stats") return scene.setMode("idle");
    if (pet) act("pet");
  };

  const latest = pet?.events[0];

  return (
    <main className="game">
      <button type="button" className="gear" aria-label="Settings" onClick={() => setShowSettings(true)}>
        <GearIcon />
      </button>
      <Device
        scene={scene}
        selected={selected}
        disabled={disabledFor(pet)}
        onIcon={activate}
        onButton={press}
        onLcdTap={tapScreen}
      />
      <p className="caption" aria-live="polite">
        {toast ??
          (latest ? (
            <>
              {latest.text} <span className="muted">· {timeAgo(latest.at)}</span>
            </>
          ) : (
            " "
          ))}
      </p>
      {showLog && pet && <LogPanel events={pet.events} onClose={() => setShowLog(false)} />}
      {showSettings && (
        <Settings
          session={session}
          petName={pet?.name ?? "Hammi"}
          onRenamed={update}
          onLogout={onLogout}
          onClose={() => setShowSettings(false)}
        />
      )}
    </main>
  );
}
