import { drawText } from "../font";
import { blit, W, type Frame } from "../frame";
import { bodySize, drawHammi, sparkles, GROUND, type Expr } from "../hammi";
import * as S from "../sprites";
import { drawEndScreen, END_SCREEN_MS, MAX_SCORE, type GameContext, type MiniGame } from "./common";

const REVEAL_MS = 1300;

/** Guess which way Hammi will turn, five rounds. */
export class LeftRight implements MiniGame {
  readonly id = "leftright" as const;
  private results: boolean[] = [];
  private phase: "ask" | "reveal" | "done" = "ask";
  private dir: -1 | 1 = 1;
  private start = 0;

  press(dir: -1 | 1, down: boolean, t: number) {
    if (!down || this.phase !== "ask") return;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.results.push(dir === this.dir);
    this.phase = "reveal";
    this.start = t;
  }

  tap(fx: number, down: boolean, t: number) {
    this.press(fx < 0.5 ? -1 : 1, down, t);
  }

  render(f: Frame, t: number, ctx: GameContext): number | null {
    const e = t - this.start;
    const won = this.results.filter(Boolean).length;
    if (this.phase === "reveal" && e > REVEAL_MS) {
      this.phase = this.results.length >= MAX_SCORE ? "done" : "ask";
      this.start = t;
    }
    if (this.phase === "done") {
      if (e > END_SCREEN_MS) return won;
      drawEndScreen(f, t, this.start, ctx, `${won} RIGHT`, won);
      return null;
    }

    for (let i = 0; i < MAX_SCORE; i++) {
      const mx = 12 + i * 5;
      const res = this.results[i];
      if (res === true) blit(f, S.heart, mx - 1, 1);
      else if (res === false) f.rect(mx, 2, 3, 1, 1);
      else f.rect(mx + 1, 2, 1, 1, 1);
    }

    const { w, h } = bodySize(ctx.body);
    const x = Math.floor((W - w) / 2);
    const top = GROUND - h;
    let expr: Expr = "normal";
    let flip = false;
    let look = 0;
    if (this.phase === "ask") {
      if (Math.floor(t / 450) % 2 === 0) {
        drawText(f, "<", 1, 14);
        drawText(f, ">", W - 4, 14);
      }
      drawText(f, "?", x + Math.floor(w / 2) - 1, top - 7);
    } else {
      const right = this.results[this.results.length - 1];
      flip = this.dir < 0;
      look = 1;
      expr = right ? "happy" : "nope";
      if (right) sparkles(f, t, x, top, w);
    }
    drawHammi(f, ctx.body, x, top, { frame: Math.floor(t / 600) % 2, expr, flip, look, hat: ctx.hat });
    return null;
  }
}
