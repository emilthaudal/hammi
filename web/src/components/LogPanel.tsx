import { timeAgo } from "../time";
import type { PetEvent } from "../types";

type Props = { events: PetEvent[]; onClose: () => void; onTreasures: () => void };

export function LogPanel({ events, onClose, onTreasures }: Props) {
  return (
    <section className="card log" aria-label="Hammi's diary">
      <header>
        <h2>Diary</h2>
        <div className="header-actions">
          <button type="button" className="chip" onClick={onTreasures}>
            Treasure box
          </button>
          <button type="button" className="link" onClick={onClose}>
            Close
          </button>
        </div>
      </header>
      {events.length === 0 ? (
        <p className="muted">Nothing has happened yet.</p>
      ) : (
        <ul>
          {events.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <span>{e.text}</span>
              <time dateTime={e.at} className="muted">
                {timeAgo(e.at)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
