import { drawText, textWidth } from "../font";
import { blit, W, type Frame } from "../frame";
import { bodySize, drawHammi, GROUND, type Expr } from "../hammi";
import * as S from "../sprites";
import { drawEndScreen, END_SCREEN_MS, MAX_SCORE, type GameContext, type MiniGame } from "./common";

const PEBBLES = 20;
const GRAVITY = 90; // px/s²
const JUMP = 36; // px/s upwards
const HIT_PAUSE_MS = 900;
const FLOOR = GROUND - 2; // the wheel's rungs take the bottom two rows

type Pebble = { x: number; cleared: boolean };

/** Hammi runs in its wheel; jump the pebbles. Ends at the first bump or after 20 pebbles. */
export class WheelRun implements MiniGame {
  readonly id = "jump" as const;
  private start = -1;
  private last = 0;
  private y = 0; // height above the floor
  private vy = 0;
  private pebbles: Pebble[] = [];
  private spawned = 0;
  private nextPebble = 0;
  private cleared = 0;
  private scroll = 0;
  private hitAt: number | null = null;
  private endAt: number | null = null;

  press(_dir: -1 | 1, down: boolean) {
    if (down) this.jump();
  }

  tap(_fx: number, down: boolean) {
    if (down) this.jump();
  }

  private jump() {
    if (this.hitAt === null && this.endAt === null && this.y === 0) this.vy = JUMP;
  }

  private speed(): number {
    return 20 + this.cleared * 0.8;
  }

  render(f: Frame, t: number, ctx: GameContext): number | null {
    if (this.start < 0) {
      this.start = this.last = t;
      this.nextPebble = t + 1400;
    }
    const score = Math.min(MAX_SCORE, Math.floor(this.cleared / 4));
    if (this.endAt !== null) {
      if (t - this.endAt > END_SCREEN_MS) return score;
      drawEndScreen(f, t, this.endAt, ctx, `${this.cleared} HOPS`, score);
      return null;
    }

    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    const { w, h } = bodySize(ctx.body);
    const hx = 3;
    const running = this.hitAt === null;

    if (running) {
      this.scroll += this.speed() * dt;
      if (this.y > 0 || this.vy > 0) {
        this.vy -= GRAVITY * dt;
        this.y = Math.max(0, this.y + this.vy * dt);
        if (this.y === 0) this.vy = 0;
      }
      for (const p of this.pebbles) p.x -= this.speed() * dt;
      if (t >= this.nextPebble && this.spawned < PEBBLES) {
        this.pebbles.push({ x: W, cleared: false });
        this.spawned++;
        this.nextPebble = t + 1300 + Math.random() * 900 - Math.min(400, this.cleared * 20);
      }
      // Forgiving hitbox: the middle of Hammi's body, near the floor.
      const left = hx + w * 0.3;
      const right = hx + w * 0.7;
      for (const p of this.pebbles) {
        if (p.cleared) continue;
        if (p.x + S.pebble.w < left) {
          p.cleared = true;
          this.cleared++;
        } else if (p.x < right && this.y < S.pebble.h - 0.5) {
          this.hitAt = t;
        }
      }
      this.pebbles = this.pebbles.filter((p) => p.x > -S.pebble.w);
      if (this.cleared >= PEBBLES) this.endAt = t;
    } else if (t - (this.hitAt ?? t) > HIT_PAUSE_MS) {
      this.endAt = t;
    }

    // The wheel: rungs scrolling past underneath, and its rim as a dotted arc across the top.
    const offset = Math.floor(this.scroll) % 4;
    for (let x = -offset; x < W; x += 4) {
      f.rect(x, GROUND - 2, 2, 1, 2);
      f.rect(x + 2, GROUND - 1, 2, 1, 1);
    }
    for (let x = 0; x < W; x += 3) {
      const arc = Math.round(5 - 5 * Math.sin((Math.PI * x) / (W - 1)));
      f.set((x + (Math.floor(this.scroll / 2) % 3)) % W, arc, 1);
    }

    for (const p of this.pebbles) blit(f, S.pebble, Math.round(p.x), FLOOR - S.pebble.h);
    const count = String(this.cleared);
    drawText(f, count, W - textWidth(count) - 1, 7);

    const hit = this.hitAt !== null;
    const expr: Expr = hit ? "nope" : this.y > 0 ? "happy" : "normal";
    drawHammi(f, ctx.body, hx, FLOOR - h - Math.round(this.y), {
      frame: running && this.y === 0 ? Math.floor(t / 110) % 2 : 0,
      expr,
      look: running ? 1 : 0,
      hat: ctx.hat,
    });
    return null;
  }
}
