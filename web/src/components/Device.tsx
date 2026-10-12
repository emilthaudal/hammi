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
  onIcon: (index: number) => void;
  onButton: (id: ButtonId) => void;
  onLcdTap: (fx: number) => void;
};

export function Device({ scene, selected, disabled, onIcon, onButton, onLcdTap }: Props) {
  const iconButton = (i: number) => {
    const icon = ICONS[i];
    return (
      <button
        key={icon.id}
        type="button"
        className={`icon${selected === i ? " selected" : ""}${disabled[i] ? " disabled" : ""}`}
        aria-label={icon.label}
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
        <Lcd scene={scene} onTap={(fx) => onLcdTap(fx)} />
        <div className="icon-row">{[4, 5, 6, 7].map(iconButton)}</div>
      </div>
      <div className="buttons">
        {(["A", "B", "C"] as const).map((id) => (
          <div key={id} className={`hw-button hw-${id}`}>
            <button type="button" aria-label={`Button ${id}`} onClick={() => onButton(id)} />
            <span>{id}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
