import { GAMES } from "../game/games/common";
import { PixelIcon, type IconId } from "./Icons";

const ICON_HELP: [IconId, string, string][] = [
  ["meal", "Meal", "Pick a proper meal when Hammi's tummy rumbles."],
  ["snack", "Snack", "A little treat for fun. Hammi has a secret favourite!"],
  ["play", "Play", "Choose one of three mini-games."],
  ["clean", "Clean", "Tidy away the little droppings."],
  ["lights", "Lights", "Turn the lights off so a sleeping Hammi rests even better."],
  ["pet", "Cuddle", "Give Hammi a cuddle."],
  ["stats", "Stats", "See food, fun and rest as hearts, plus Hammi's age."],
  ["log", "Diary", "What everyone did with Hammi, and the treasure box."],
];

/** A short, friendly guide, folded into small sections so it reads well on a phone. */
export function HowToPlay() {
  return (
    <div className="field how-to">
      <label>How to play</label>

      <details>
        <summary>The buttons</summary>
        <p>Tap any icon around the screen to use it straight away.</p>
        <p>
          Or use the buttons like the real toy: <strong>A</strong> moves the highlight, <strong>B</strong> chooses,{" "}
          <strong>C</strong> goes back or cancels.
        </p>
        <p>Tap the screen itself to give Hammi a cuddle.</p>
        <p>
          If Hammi is asleep, a tap wakes it up for a sleepy snack or a game. Leave it be and it dozes off again: after
          10 minutes, or 5 with the lights off.
        </p>
      </details>

      <details>
        <summary>The icons</summary>
        <ul className="icon-help">
          {ICON_HELP.map(([id, label, text]) => (
            <li key={id}>
              <PixelIcon id={id} />
              <span>
                <strong>{label}</strong> {text}
              </span>
            </li>
          ))}
        </ul>
      </details>

      <details>
        <summary>Little signs from Hammi</summary>
        <p>
          Tiny badges in the corner of the screen blink when Hammi is <strong>hungry</strong> (a bowl),{" "}
          <strong>bored</strong> (a wheel) or <strong>tired</strong> (a low battery).
        </p>
        <p>A pink dot on Meal, Play or Clean shows what would help most. Droppings mean it's time to clean.</p>
        <p>Nothing bad happens if you're busy. Hammi just gets a bit sad until you're back.</p>
      </details>

      <details>
        <summary>Wishes and gifts</summary>
        <p>
          Sometimes Hammi daydreams about something in a <strong>thought bubble</strong>, and its icon glows. Grant the
          wish for an extra happy Hammi.
        </p>
        <p>
          Every day Hammi finds a <strong>little gift</strong> for each of you. Tap the present on the screen to open
          it, and collect them all in the treasure box.
        </p>
      </details>

      <details>
        <summary>The games</summary>
        <ul className="game-help">
          {GAMES.map((g) => (
            <li key={g.id}>
              <strong>{g.title}.</strong> {g.howTo}
            </li>
          ))}
        </ul>
        <p>Each game scores up to five hearts, and every game cheers Hammi up.</p>
      </details>
    </div>
  );
}
