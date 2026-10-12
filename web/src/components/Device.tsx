import type { Scene } from "../game/scene";
import { PixelIcon, type IconId } from "./Icons";
import { Lcd } from "./Lcd";

export const ICONS: { id: IconId; label: string }[] = [
  { id: "meal", label: "Meal" },
  { id: "snack", label: "Snack" },
  { id: "play", label: "Play" },
  { id: "clean", label: "Clean" },
  { id: "lights", label: "Lights" },
  { id: "pet", label: "Cuddle" },
  { id: "stats", label: "Stats" },
  { id: "log", label: "Diary" },
];

export type ButtonId = "A" | "B" | "C";

type Props = {
  scene: Scene;
  selected: number;
  disabled: boolean[];
  /** Index of the icon Hammi is wishing for, gently highlighted. */
  wished: number;
  onIcon: (index: number) => void;
  /** Hardware buttons report presses and releases, so games can hold a direction. */
  onButton: (id: ButtonId, down: boolean) => void;
  onLcdTouch: (fx: number, fy: number, down: boolean) => void;
};

export function Device({ scene, selected, disabled, wished, onIcon, onButton, onLcdTouch }: Props) {
  const iconButton = (i: number) => {
    const icon = ICONS[i];
    const classes = ["icon", selected === i && "selected", disabled[i] && "disabled", wished === i && "wished"];
    return (
      <button
        key={icon.id}
        type="button"
        className={classes.filter(Boolean).join(" ")}
        aria-label={wished === i ? `${icon.label} (Hammi is wishing for this)` : icon.label}
        aria-pressed={selected === i}
        onClick={() => onIcon(i)}
      >
        <PixelIcon id={icon.id} />
        <span>{icon.label}</span>
      </button>
    );
  };

  return (
    <div className="device">
      <div className="device-ring" aria-hidden="true" />
      <div className="device-brand">Hammi</div>
      <div className="bezel">
        <div className="icon-row">{[0, 1, 2, 3].map(iconButton)}</div>
        <Lcd scene={scene} onTouch={onLcdTouch} />
        <div className="icon-row">{[4, 5, 6, 7].map(iconButton)}</div>
      </div>
      <div className="buttons">
        {(["A", "B", "C"] as const).map((id) => (
          <div key={id} className={`hw-button hw-${id}`}>
            <button
              type="button"
              aria-label={`Button ${id}`}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                onButton(id, true);
              }}
              onPointerUp={() => onButton(id, false)}
              onPointerCancel={() => onButton(id, false)}
              onClick={(e) => {
                // Keyboard activation has no pointer events.
                if (e.detail === 0) {
                  onButton(id, true);
                  onButton(id, false);
                }
              }}
            />
            <span>{id}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
