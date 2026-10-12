import type { GameId, PetView } from "../../types";
import { drawText, textWidth } from "../font";
import { blit, W, type Frame } from "../frame";
import { bodySize, drawHammi, sparkles, GROUND } from "../hammi";
import * as S from "../sprites";

export type GameContext = { pet: PetView; body: S.Body; hat: S.HatKind | null };

export interface MiniGame {
  readonly id: GameId;
  /** A (-1) or B (+1) pressed or released. */
  press(dir: -1 | 1, down: boolean, t: number): void;
  /** The screen was touched (`down`) or released, `fx` across its width. */
  tap(fx: number, down: boolean, t: number): void;
  /** Draws a frame. Returns the score (0–5) once the end screen has been shown. */
  render(f: Frame, t: number, ctx: GameContext): number | null;
}

export const MAX_SCORE = 5;
export const END_SCREEN_MS = 2600;

export const GAMES: { id: GameId; label: string; title: string; howTo: string }[] = [
  {
    id: "leftright",
    label: "L OR R",
    title: "Left or Right",
    howTo: "Guess which way Hammi will turn: A or the left of the screen for left, B or the right for right.",
  },
  {
    id: "catch",
    label: "CATCH",
    title: "Seed Catch",
    howTo: "Catch the falling seeds! Hold A or B (or the left or right of the screen) to scoot Hammi.",
  },
  {
    id: "jump",
    label: "WHEEL",
    title: "Wheel Run",
    howTo: "Tap B or the screen to hop over the pebbles.",
  },
];

/** Shared end screen: a line of text, the score as hearts, and a happy Hammi. */
export function drawEndScreen(f: Frame, t: number, start: number, ctx: GameContext, text: string, score: number) {
  drawText(f, text, Math.floor((W - textWidth(text)) / 2), 1);
  for (let i = 0; i < MAX_SCORE; i++) blit(f, i < score ? S.heart : S.heartOutline, 9 + i * 6, 8);
  const { w, h } = bodySize(ctx.body);
  const x = Math.floor((W - w) / 2);
  const top = Math.max(14, GROUND - h);
  const e = t - start;
  drawHammi(f, ctx.body, x, top, {
    frame: Math.floor(t / 300) % 2,
    expr: score > 0 ? "happy" : "love",
    hat: ctx.hat,
  });
  if (score >= 3 && e > 200) sparkles(f, t, x, top, w);
}
