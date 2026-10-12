import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, UnauthorizedError } from "../api";
import { Scene } from "../game/scene";
import { treasureName, withArticle } from "../game/treasures";
import type { Session } from "../storage";
import { timeAgo } from "../time";
import type { ActionType, GameId, PetView, TreasureId } from "../types";
import { Device, ICONS, type ButtonId } from "./Device";
import { GearIcon } from "./Icons";
import { LogPanel } from "./LogPanel";
import { Settings } from "./Settings";
import { TreasureBox } from "./TreasureBox";

const POLL_MS = 5000;
// The treasure appears on the LCD after the lid pops; the message follows it.
const GIFT_MESSAGE_DELAY_MS = 1400;
const GIFT_MESSAGE_MS = 12_000;

const KEYS: Record<string, ButtonId> = {
  ArrowLeft: "A",
  ArrowRight: "B",
  ArrowUp: "B",
  " ": "B",
  Enter: "B",
  Escape: "C",
};

type Props = { session: Session; onLogout: () => void };
type Panel = "log" | "treasures" | null;

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
  const [panel, setPanel] = useState<Panel>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [gift, setGift] = useState<{ item: TreasureId; isNew: boolean } | null>(null);
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

  useEffect(() => {
    if (!gift) return;
    const id = setTimeout(() => setGift(null), GIFT_MESSAGE_MS);
    return () => clearTimeout(id);
  }, [gift]);

  const act = useCallback(
    async (type: ActionType, play?: { won: number; game: GameId }) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const res = await api.action(session.token, type, play);
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

  const claimGift = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await api.gift(session.token);
      scene.applyGift(res.state, res.item, res.isNew);
      setPet(res.state);
      setToast(null);
      setTimeout(() => setGift({ item: res.item, isNew: res.isNew }), GIFT_MESSAGE_DELAY_MS);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) refresh();
      else fail(e);
    } finally {
      busy.current = false;
    }
  }, [scene, session.token, fail, refresh]);

  const activate = (i: number) => {
    setSelected(i);
    if (scene.mode === "game") return;
    const id = ICONS[i].id;
    if (id === "stats") return scene.setMode(scene.mode === "stats" ? "idle" : "stats");
    if (id === "log") return setPanel((p) => (p === "log" ? null : "log"));
    scene.setMode("idle");
    if (id === "play") {
      if (!pet) return;
      if (pet.stage === "egg") return scene.react("egg");
      if (pet.asleep) return scene.react("asleep");
      return scene.openPicker((won, game) => act("play", { won, game }));
    }
    act(id);
  };

  const press = (b: ButtonId, down: boolean) => {
    if (scene.mode === "picker" || scene.mode === "game") return scene.input(b, down);
    if (!down) return;
    if (b === "A") return setSelected((s) => (s + 1) % ICONS.length);
    if (b === "B") {
      if (scene.mode === "stats") return scene.setMode("idle");
      if (selected >= 0) activate(selected);
      return;
    }
    if (scene.mode === "stats") return scene.setMode("idle");
    if (panel) return setPanel(null);
    setSelected(-1);
  };

  const touchScreen = (fx: number, fy: number, down: boolean) => {
    if (scene.mode === "picker" || scene.mode === "game") return scene.touch(fx, fy, down);
    if (!down) return;
    if (scene.mode === "stats") return scene.setMode("idle");
    if (scene.hitsPresent(fx, fy)) return claimGift();
    if (pet) act("pet");
  };

  // Arrow keys, space and escape work as the buttons on a keyboard.
  const pressRef = useRef(press);
  pressRef.current = press;
  useEffect(() => {
    const handle = (down: boolean) => (e: KeyboardEvent) => {
      const button = KEYS[e.key];
      const target = e.target as HTMLElement | null;
      if (!button || showSettings || target?.closest("input, textarea, button")) return;
      if (down && e.repeat) return e.preventDefault();
      e.preventDefault();
      pressRef.current(button, down);
    };
    const onDown = handle(true);
    const onUp = handle(false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [showSettings]);

  const latest = pet?.events[0];
  const wished = pet?.wish && !pet.asleep ? ICONS.findIndex((i) => i.id === pet.wish) : -1;

  return (
    <main className="game">
      <button type="button" className="gear" aria-label="Settings" onClick={() => setShowSettings(true)}>
        <GearIcon />
      </button>
      {pet?.celebration && (
        <p className="banner" role="status">
          {pet.celebration.text}
        </p>
      )}
      <Device
        scene={scene}
        selected={selected}
        disabled={disabledFor(pet)}
        wished={wished}
        onIcon={activate}
        onButton={press}
        onLcdTouch={touchScreen}
      />
      <div className="below" aria-live="polite">
        {gift ? (
          <p className="gift-result">
            Hammi found you {withArticle(treasureName(gift.item))}!{gift.isNew && <span className="new">New!</span>}{" "}
            <button type="button" className="link inline" onClick={() => setPanel("treasures")}>
              See treasure box
            </button>
          </p>
        ) : (
          pet?.giftAvailable &&
          pet.stage !== "egg" && (
            <button type="button" className="gift-button" onClick={claimGift}>
              <span className="badge" aria-hidden="true" />
              A gift from Hammi! Open it
            </button>
          )
        )}
        <p className="caption">
          {toast ??
            (latest ? (
              <>
                {latest.text} <span className="muted">· {timeAgo(latest.at)}</span>
              </>
            ) : (
              " "
            ))}
        </p>
      </div>
      {panel === "log" && pet && (
        <LogPanel events={pet.events} onClose={() => setPanel(null)} onTreasures={() => setPanel("treasures")} />
      )}
      {panel === "treasures" && (
        <TreasureBox token={session.token} onClose={() => setPanel(null)} onUnauthorized={onLogout} />
      )}
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
