import type { ActionType, PetView, Reaction } from "../types";
import { drawText, textWidth } from "./font";
import { blit, put, W, type Bitmap, type Frame } from "./frame";
import * as S from "./sprites";

export type Mode = "idle" | "stats" | "game";
export type SceneReaction = Reaction | "grow" | "hatch";

type Expr = "normal" | "blink" | "happy" | "sad" | "eat" | "eatOpen" | "nope" | "love" | "sleep";

type ActiveReaction = {
  kind: SceneReaction;
  food?: "meal" | "snack";
  start: number;
  dur: number;
  /** Poops on screen before the action, so `clean` can sweep them away. */
  poops: number;
};

type Game = {
  results: boolean[];
  phase: "ask" | "reveal" | "done";
  dir: -1 | 1;
  start: number;
  onDone: (won: number) => void;
};

const DURATION: Record<SceneReaction, number> = {
  yum: 2600,
  full: 1800,
  happy: 2000,
  clean: 2000,
  nothing: 1600,
  love: 2200,
  lights_on: 900,
  lights_off: 600,
  asleep: 2000,
  egg: 1600,
  grow: 3000,
  hatch: 3200,
};

const GROUND = 31; // sprites stand with their last row on y = 30
const POOPS: [number, number][] = [
  [42, 26],
  [36, 26],
  [42, 20],
  [36, 20],
];
const ROUNDS = 5;
const HOP = [0, -1, -2, -3, -3, -2, -1, 0];

export function bodyFor(p: PetView): S.Body {
  if (p.stage === "kid") return S.BODIES.kid;
  if (p.stage === "adult") return S.ADULTS[p.form ?? "snuggly"];
  return S.BODIES.baby;
}

/** Draws one expression into a copy of a body frame. `look` shifts the eyes sideways. */
function composeHammi(body: S.Body, frame: number, expr: Expr, look = 0): Bitmap {
  const b = S.bodyFrame(body, frame);
  const f = body.face;
  const w = f.eyeW;
  const top = f.eyeY;
  const bottom = f.eyeY + f.eyeH - 1;
  const eyes = [f.eyeL + look, 2 * f.cx - f.eyeL - (w - 1) + look];

  const shape = f.sleepy && expr === "normal" ? "content" : expr;
  eyes.forEach((x, side) => {
    const outer = side === 0 ? x - 1 : x + w;
    const inner = side === 0 ? x + w : x - 1;
    const row = (y: number) => {
      for (let i = 0; i < w; i++) put(b, x + i, y, 2);
    };
    switch (shape) {
      case "blink":
      case "sleep":
      case "nope":
        row(bottom);
        put(b, outer, bottom, 2);
        break;
      case "happy":
      case "love":
        row(bottom - 1);
        put(b, x - 1, bottom, 2);
        put(b, x + w, bottom, 2);
        break;
      case "content":
        row(bottom);
        put(b, x - 1, bottom - 1, 2);
        put(b, x + w, bottom - 1, 2);
        break;
      default:
        for (let y = top; y <= bottom; y++) row(y);
        if (expr === "sad") put(b, inner, top - 1, 2);
        else if (f.lashes) put(b, outer, top, 2);
    }
  });

  const cx = f.cx + look;
  const my = f.mouthY;
  const mouth = (pixels: [number, number][]) => pixels.forEach(([x, y]) => put(b, cx + x, my + y, 2));
  switch (expr) {
    case "happy":
    case "love":
      mouth([[-2, 0], [-1, 1], [0, 1], [1, 1], [2, 0]]);
      break;
    case "sad":
    case "nope":
      mouth([[-1, 1], [0, 0], [1, 1]]);
      break;
    case "eatOpen":
      mouth([[-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]);
      break;
    case "sleep":
      mouth([[0, 1]]);
      break;
    default:
      mouth([[-1, 0], [0, 1], [1, 0]]);
  }
  return b;
}

export class Scene {
  pet: PetView | null = null;
  mode: Mode = "idle";
  /** True when the current frame should be painted with the lights-off palette. */
  dark = false;
  onModeChange?: (mode: Mode) => void;

  private reaction: ActiveReaction | null = null;
  private game: Game | null = null;
  private x = 16;
  private dir: -1 | 1 = 1;
  private moving = false;
  private lastStep = 0;
  private pauseUntil = 0;
  private hopAt = -1e9;
  private nextHop = 4000;
  private blinkUntil = 0;
  private nextBlink = 2500;

  setPet(p: PetView) {
    const prev = this.pet;
    this.pet = p;
    if (prev && prev.stage !== p.stage) this.react(prev.stage === "egg" ? "hatch" : "grow");
  }

  /** Applies the state returned by an action and plays its reaction. */
  applyAction(state: PetView, reaction: Reaction, action: ActionType) {
    const poops = this.pet?.poops ?? 0;
    this.setPet(state);
    this.react(reaction, action === "snack" ? "snack" : "meal", poops);
  }

  react(kind: SceneReaction, food: "meal" | "snack" = "meal", poops = this.pet?.poops ?? 0) {
    this.reaction = { kind, food, start: performance.now(), dur: DURATION[kind], poops };
  }

  setMode(mode: Mode) {
    if (mode !== "game") this.game = null;
    if (this.mode === mode) return;
    this.mode = mode;
    this.onModeChange?.(mode);
  }

  startGame(onDone: (won: number) => void) {
    this.reaction = null;
    this.game = { results: [], phase: "ask", dir: 1, start: performance.now(), onDone };
    this.setMode("game");
  }

  guess(side: -1 | 1) {
    const g = this.game;
    if (!g || g.phase !== "ask") return;
    g.dir = Math.random() < 0.5 ? -1 : 1;
    g.results.push(side === g.dir);
    g.phase = "reveal";
    g.start = performance.now();
  }

  render(f: Frame, t: number) {
    f.clear();
    this.dark = false;
    const p = this.pet;
    if (!p) {
      const dots = Math.floor(t / 400) % 4;
      for (let i = 0; i < dots; i++) f.rect(18 + i * 4, 15, 2, 2, 2);
      return;
    }
    if (this.mode === "stats") return this.drawStats(f, p);
    if (this.mode === "game" && this.game) return this.drawGame(f, p, this.game, t);

    let r = this.reaction;
    if (r && t - r.start > r.dur) r = this.reaction = null;
    const e = r ? t - r.start : 0;

    if (p.stage === "egg") return this.drawEgg(f, p, t, r?.kind === "egg");
    if (r?.kind === "hatch" && e < 1600) return this.drawEgg(f, p, t, true, true);

    this.dark = p.lightsOff;
    if (r?.kind === "grow" && e < 1200) this.dark = Math.floor(e / 150) % 2 === 0;

    const body = bodyFor(p);
    if (p.asleep) return this.drawSleeping(f, p, body, t, r);
    this.drawAwake(f, p, body, t, r, e);
  }

  private bounds(p: PetView, w: number): [number, number] {
    const right = p.poops > 0 && !p.lightsOff ? 35 : 47;
    return [1, Math.max(1, right - w)];
  }

  private drawAwake(f: Frame, p: PetView, body: S.Body, t: number, r: ActiveReaction | null, e: number) {
    const w = body.frames[0].w;
    const h = body.frames[0].h;
    const [min, max] = this.bounds(p, w);

    // Poops, swept away from the right during a clean.
    if (!p.lightsOff) {
      const count = r?.kind === "clean" ? r.poops : p.poops;
      const sweep = r?.kind === "clean" ? W - Math.floor((e / 1200) * (W + 4)) : W + 10;
      for (let i = 0; i < Math.min(4, count); i++) {
        const [px, py] = POOPS[i];
        if (px + 5 >= sweep) continue;
        blit(f, S.poop, px, py);
        blit(f, S.stink[Math.floor(t / 500 + i) % 2], px + 1, py - 4);
      }
      if (r?.kind === "clean" && sweep > -2 && sweep < W) {
        f.rect(sweep, 0, 1, 32, 2);
        f.rect(sweep + 1, 0, 1, 32, 1);
      }
    }

    // Wandering, paused while a reaction plays.
    this.x = Math.min(Math.max(this.x, min), max);
    if (!r) this.wander(t, body.step * (p.mood === "sad" ? 1.8 : 1), min, max);
    else this.moving = false;

    let expr: Expr = p.mood === "sad" ? "sad" : "normal";
    if (t > this.nextBlink) {
      this.blinkUntil = t + 160;
      this.nextBlink = t + 2500 + Math.random() * 3000;
    }
    if (t < this.blinkUntil) expr = "blink";
    let flip = this.dir < 0;
    let look = this.moving ? 1 : 0;
    let dy = 0;
    let frame = Math.floor(t / (this.moving ? body.step * 2 : 600)) % 2;

    if (!r && p.mood === "happy") {
      if (t > this.nextHop) {
        this.hopAt = t;
        this.nextHop = t + 4000 + Math.random() * 5000;
      }
      const i = Math.floor((t - this.hopAt) / 70);
      if (i < HOP.length) {
        dy = HOP[i];
        expr = "happy";
      }
    }

    const top = GROUND - h;
    let foodX = 0;
    if (r) {
      look = 0;
      switch (r.kind) {
        case "yum":
        case "full": {
          // Put the food on whichever side has room, and face it.
          const foodW = 7;
          const roomRight = this.x + w + 1 + foodW <= (p.poops > 0 ? 35 : 47);
          foodX = roomRight ? this.x + w + 1 : this.x - 1 - foodW;
          flip = !roomRight;
          if (r.kind === "yum") {
            const bite = Math.min(3, Math.floor(e / 650));
            expr = bite < 3 ? (Math.floor(e / 160) % 2 ? "eatOpen" : "eat") : "happy";
            const items = r.food === "snack" ? S.seed : S.meal;
            if (bite < 3) {
              const item = items[bite];
              blit(f, item, foodX + Math.floor((foodW - item.w) / 2), GROUND - item.h);
            }
            if (bite === 3) this.sparkles(f, t, this.x, top, w);
          } else {
            expr = "nope";
            flip = Math.floor(e / 220) % 2 === 0;
            const item = r.food === "snack" ? S.seed[0] : S.meal[0];
            blit(f, item, foodX + Math.floor((foodW - item.w) / 2), GROUND - item.h);
          }
          break;
        }
        case "happy":
        case "grow":
          expr = "happy";
          dy = HOP[Math.floor(e / 60) % HOP.length];
          this.sparkles(f, t, this.x, top, w);
          break;
        case "hatch":
          expr = "happy";
          this.sparkles(f, t, this.x, top, w);
          break;
        case "clean":
          expr = e > 1300 ? "happy" : "normal";
          if (e > 1300) this.sparkles(f, t, this.x, top, w);
          break;
        case "nothing":
          drawText(f, "?", this.x + Math.floor(w / 2) - 1, top - 7);
          break;
        case "love":
          expr = "love";
          this.floatHearts(f, e, this.x, top, w);
          break;
        case "lights_on":
          expr = e < 400 ? "blink" : "normal";
          blit(f, S.bulb, 2, 2);
          break;
        default:
          break;
      }
    }

    if (p.mood === "sad" && !r && !p.lightsOff) {
      const cx = this.x + Math.floor(w / 2) - 4;
      blit(f, S.cloud, cx, top - 8);
      blit(f, S.rain[Math.floor(t / 300) % 2], cx, top - 4);
    }

    blit(f, composeHammi(body, frame, expr, look), this.x, top + dy, flip);
  }

  private wander(t: number, step: number, min: number, max: number) {
    if (t < this.pauseUntil) {
      this.moving = false;
      return;
    }
    if (t - this.lastStep < step) return;
    this.lastStep = t;
    this.moving = true;
    if (Math.random() < 0.04) {
      this.pauseUntil = t + 1200 + Math.random() * 2500;
      this.moving = false;
      return;
    }
    if (Math.random() < 0.03) this.dir = this.dir === 1 ? -1 : 1;
    const next = this.x + this.dir;
    if (next < min || next > max) this.dir = this.dir === 1 ? -1 : 1;
    else this.x = next;
  }

  private sparkles(f: Frame, t: number, x: number, top: number, w: number) {
    const on = Math.floor(t / 200) % 2 === 0;
    blit(f, on ? S.sparkleBig : S.sparkleSmall, x - 6, top + 1);
    blit(f, on ? S.sparkleSmall : S.sparkleBig, x + w + 1, top - 2);
    blit(f, on ? S.sparkleSmall : S.sparkleBig, x - 3, top - 6);
  }

  private floatHearts(f: Frame, e: number, x: number, top: number, w: number) {
    const starts = [x - 4, x + Math.floor(w / 2) - 2, x + w - 1];
    starts.forEach((hx, i) => {
      const age = e - i * 350;
      if (age < 0) return;
      const y = top - 2 - Math.floor(age / 120);
      if (y > -4) blit(f, S.heart, hx + (Math.floor(age / 300) % 2), y);
    });
  }

  private drawEgg(f: Frame, p: PetView, t: number, excited: boolean, hatching = false) {
    const x = 19;
    const y = GROUND - S.egg.h;
    const period = excited ? 300 : 2400;
    const phase = t % period;
    const wobbling = excited || phase < 500;
    const shift = wobbling ? (Math.floor(t / 120) % 2 ? 1 : -1) : 0;
    // Wobble by shearing the top half of the egg.
    for (let j = 0; j < S.egg.h; j++)
      for (let i = 0; i < S.egg.w; i++) {
        const v = S.egg.data[j * S.egg.w + i];
        if (v >= 0) f.set(x + i + (j < 5 ? shift : 0), y + j, v as 0 | 1 | 2);
      }
    const soon = p.hatchesAt ? Date.parse(p.hatchesAt) - Date.now() < 60_000 : false;
    if (hatching || soon) blit(f, S.eggCrack, x, y);
    if (hatching) this.sparkles(f, t, x, y, S.egg.w);
  }

  private drawSleeping(f: Frame, p: PetView, body: S.Body, t: number, r: ActiveReaction | null) {
    const w = body.frames[0].w;
    const h = body.frames[0].h;
    const right = p.poops > 0 && !p.lightsOff ? 35 : 47;
    const x = Math.floor((right - w) / 2);
    const top = GROUND - h;

    if (!p.lightsOff)
      for (let i = 0; i < Math.min(4, p.poops); i++) blit(f, S.poop, POOPS[i][0], POOPS[i][1]);

    const breathe = Math.floor(t / 1400) % 2;
    blit(f, composeHammi(body, 0, "sleep"), x, top + breathe);

    // A quilted blanket over the lower half.
    const by = top + Math.floor(h * 0.55);
    const bx = x - 2;
    const bw = w + 4;
    const last = GROUND - 1;
    for (let j = by; j <= last; j++)
      for (let i = bx; i < bx + bw; i++) {
        const side = i === bx || i === bx + bw - 1;
        if (side && (j === by || j === last)) continue; // rounded corners
        const edge = side || j === by || j === last;
        const dot = (j - by) % 3 === 2 && (i - bx + (j - by)) % 4 === 0;
        f.set(i, j, edge ? 2 : dot ? 1 : 0);
      }
    f.rect(bx + 1, by + 1, bw - 2, 1, 1);

    // Z's drift up and to the right, one at a time.
    const cycle = r?.kind === "asleep" ? 1200 : 2400;
    for (let k = 0; k < 2; k++) {
      const a = ((t + (k * cycle) / 2) % cycle) / cycle;
      const zx = Math.min(W - 5, x + w - 1 + Math.floor(a * 5));
      const zy = top - 1 - Math.floor(a * 9);
      blit(f, a < 0.5 ? S.zSmall : S.zBig, zx, zy);
    }
    if (r?.kind === "love") this.floatHearts(f, t - r.start, x, top, w);
    if (!p.lightsOff) blit(f, S.bulb, 2, 2);
  }

  private drawStats(f: Frame, p: PetView) {
    const age = p.stage === "egg" ? "EGG" : `${Math.floor(p.ageDays)}D`;
    const ageW = textWidth(age);
    const maxChars = Math.floor((W - ageW - 3) / 4);
    drawText(f, p.name.slice(0, maxChars), 1, 1);
    drawText(f, age, W - ageW - 1, 1);
    f.rect(0, 7, W, 1, 1);
    const rows: [string, number][] = [
      ["FOOD", p.fullness],
      ["FUN", p.fun],
      ["REST", p.energy],
    ];
    rows.forEach(([label, value], i) => {
      const y = 9 + i * 8;
      drawText(f, label, 1, y + 1);
      const hearts = Math.ceil(Math.max(0, Math.min(100, value)) / 25);
      for (let k = 0; k < 4; k++) blit(f, k < hearts ? S.heartFull : S.heartEmpty, 17 + k * 8, y);
    });
  }

  private drawGame(f: Frame, p: PetView, g: Game, t: number) {
    const e = t - g.start;
    if (g.phase === "reveal" && e > 1300) {
      g.phase = g.results.length >= ROUNDS ? "done" : "ask";
      g.start = t;
    } else if (g.phase === "done" && e > 2000) {
      const won = g.results.filter(Boolean).length;
      this.setMode("idle");
      setTimeout(() => g.onDone(won), 0);
      return;
    }

    if (g.phase !== "done")
      for (let i = 0; i < ROUNDS; i++) {
        const mx = 12 + i * 5;
        const res = g.results[i];
        if (res === true) blit(f, S.heart, mx - 1, 1);
        else if (res === false) f.rect(mx, 2, 3, 1, 1);
        else f.rect(mx + 1, 2, 1, 1, 1);
      }

    const body = p.stage === "egg" ? S.BODIES.baby : bodyFor(p);
    const w = body.frames[0].w;
    const h = body.frames[0].h;
    const x = Math.floor((W - w) / 2);
    const top = GROUND - h;
    let expr: Expr = "normal";
    let flip = false;
    let look = 0;
    let dy = 0;

    if (g.phase === "ask") {
      const blink = Math.floor(t / 450) % 2 === 0;
      if (blink) {
        drawText(f, "<", 1, 14);
        drawText(f, ">", W - 4, 14);
      }
      drawText(f, "?", x + Math.floor(w / 2) - 1, top - 7);
    } else if (g.phase === "reveal") {
      const won = g.results[g.results.length - 1];
      flip = g.dir < 0;
      look = 1;
      expr = won ? "happy" : "nope";
      if (won) this.sparkles(f, t, x, top, w);
    } else {
      const won = g.results.filter(Boolean).length;
      const text = `${won}/${ROUNDS}`;
      drawText(f, text, Math.floor((W - textWidth(text)) / 2), 1);
      this.sparkles(f, t, x, top, w);
      expr = "happy";
      dy = HOP[Math.floor(e / 60) % HOP.length];
    }
    blit(f, composeHammi(body, Math.floor(t / 600) % 2, expr, look), x, top + dy, flip);
  }
}
