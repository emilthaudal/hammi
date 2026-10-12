import { useEffect, useState } from "react";
import { api, UnauthorizedError } from "../api";
import { TREASURES } from "../game/treasures";
import type { FoundTreasure, TreasureId } from "../types";
import { PixelArt } from "./Icons";

type Props = { token: string; onClose: () => void; onUnauthorized: () => void };

export function TreasureBox({ token, onClose, onUnauthorized }: Props) {
  const [found, setFound] = useState<Map<TreasureId, FoundTreasure> | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .treasures(token)
      .then((res) => setFound(new Map(res.items.map((t) => [t.item, t]))))
      .catch((e) => (e instanceof UnauthorizedError ? onUnauthorized() : setError(true)));
  }, [token, onUnauthorized]);

  return (
    <section className="card treasures" aria-label="Treasure box">
      <header>
        <h2>Treasure box</h2>
        <button type="button" className="link" onClick={onClose}>
          Close
        </button>
      </header>
      {error && <p className="muted">Couldn't open the treasure box. Try again in a moment.</p>}
      {!found && !error && <p className="muted">Opening…</p>}
      {found && (
        <>
          <p className="muted small">
            {found.size} of {TREASURES.length} found. Hammi brings everyone a little gift each day.
          </p>
          <ul className="treasure-grid">
            {TREASURES.map((t) => {
              const f = found.get(t.id);
              const classes = ["treasure", f ? "found" : "missing", t.id === "crown" && "crown"];
              return (
                <li key={t.id} className={classes.filter(Boolean).join(" ")}>
                  <PixelArt rows={t.rows} />
                  {f ? (
                    <>
                      <strong>
                        {t.name}
                        {f.count > 1 && <span className="count"> ×{f.count}</span>}
                      </strong>
                      <span className="muted">found by {f.firstFoundBy}</span>
                    </>
                  ) : (
                    <strong className="muted">???</strong>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
