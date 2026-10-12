import { drawText, textWidth } from "../font";
import { blit, W, type Frame } from "../frame";
import { bodySize, drawHammi, GROUND, type Expr } from "../hammi";
import * as S from "../sprites";
import { drawEndScreen, END_SCREEN_MS, MAX_SCORE, type GameContext, type MiniGame } from "./common";

const DURATION_MS = 20_000;
const SPEED = 30; // px per second while a direction is held
const NUDGE = 3; // px moved by a quick tap
const FALL = 13; // px per second
const SEED = S.seed[0];

type Seed = { x: number; y: number; caught: boolean; missedAt: number | null };

/** Seeds fall for 20 seconds; move Hammi underneath them. */
export class SeedCatch implements MiniGame {
  readonly id = "catch" as const;
  private start = -1;
  private last = 0;
  private x = -1;
  private held: -1 | 0 | 1 = 0;
  private dir: -1 | 1 = 1;
  private seeds: Seed[] = [];
  private nextSeed = 0;
  private caught = 0;
  private munchUntil = 0;
  private endAt: number | null = null;

  press(dir: -1 | 1, down: boolean) {
    if (this.endAt !== null) return;
    if (down) {
      this.held = dir;
      this.dir = dir;
      this.x += dir * NUDGE;
    } else if (this.held === dir) this.held = 0;
  }

  tap(fx: number, down: boolean) {
    if (down) this.press(fx < 0.5 ? -1 : 1, true);
    else this.held = 0;
  }

  render(f: Frame, t: number, ctx: GameContext): number | null {
    if (this.start < 0) {
      this.start = this.last = t;
      this.nextSeed = t + 600;
    }
    const score = Math.min(MAX_SCORE, Math.floor(this.caught / 3));
    if (this.endAt !== null) {
      if (t - this.endAt > END_SCREEN_MS) return score;
      drawEndScreen(f, t, this.endAt, ctx, `${this.caught} SEEDS`, score);
      return null;
    }

    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    const { w, h } = bodySize(ctx.body);
    const top = GROUND - h;
    if (this.x < 0) this.x = (W - w) / 2;
    this.x = Math.min(W - w, Math.max(0, this.x + this.held * SPEED * dt));

    const elapsed = t - this.start;
    if (elapsed >= DURATION_MS) {
      this.endAt = t;
      return null;
    }
    if (t >= this.nextSeed && elapsed < DURATION_MS - 2500) {
      this.seeds.push({ x: 1 + Math.floor(Math.random() * (W - 5)), y: -SEED.h, caught: false, missedAt: null });
      this.nextSeed = t + 600 + Math.random() * 350;
    }

    // Seeds land in Hammi's mouth when they reach its face and line up with its middle.
    const mouthY = top + ctx.body.face.mouthY;
    const left = this.x + w * 0.2;
    const right = this.x + w * 0.8;
    for (const s of this.seeds) {
      if (s.caught || s.missedAt !== null) continue;
      s.y += FALL * dt;
      const cx = s.x + 1;
      if (s.y + SEED.h >= mouthY && s.y + SEED.h <= mouthY + 4 && cx >= left && cx <= right) {
        s.caught = true;
        this.caught++;
        this.munchUntil = t + 350;
      } else if (s.y + SEED.h >= GROUND) {
        s.y = GROUND - SEED.h;
        s.missedAt = t;
      }
    }
    this.seeds = this.seeds.filter((s) => !s.caught && (s.missedAt === null || t - s.missedAt < 700));

    // Time left as a bar along the top, seeds caught in the corner.
    f.rect(0, 0, Math.round((W * (DURATION_MS - elapsed)) / DURATION_MS), 1, 1);
    const count = String(this.caught);
    drawText(f, count, W - textWidth(count) - 1, 2);

    for (const s of this.seeds)
      if (s.missedAt === null || Math.floor((t - s.missedAt) / 120) % 2 === 0) blit(f, SEED, s.x, Math.round(s.y));

    const munching = t < this.munchUntil;
    const expr: Expr = munching ? (Math.floor(t / 90) % 2 ? "eatOpen" : "happy") : "normal";
    drawHammi(f, ctx.body, Math.round(this.x), top, {
      frame: this.held ? Math.floor(t / 150) % 2 : 0,
      expr,
      flip: this.dir < 0,
      look: this.held ? 1 : 0,
      hat: ctx.hat,
    });
    return null;
  }
}
