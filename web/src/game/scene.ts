import type { ActionType, FoodId, GameId, PetView, Reaction, TreasureId } from "../types";
import { foodById, foodsOf } from "./foods";
import { drawText, textWidth } from "./font";
import { blit, H, W, type Bitmap, type Frame } from "./frame";
import { GAMES, type MiniGame } from "./games/common";
import { LeftRight } from "./games/leftright";
import { SeedCatch } from "./games/catch";
import { WheelRun } from "./games/jump";
import { bodyFor, bodySize, drawHammi, floatHearts, GROUND, hatFor, HOP, sparkles, type Expr } from "./hammi";
import * as S from "./sprites";
import { TREASURE_BITMAPS } from "./treasures";
import { needsOf, type Needs } from "../needs";

export { bodyFor } from "./hammi";

export type Mode = "idle" | "stats" | "picker" | "game";
export type SceneReaction = Reaction | "grow" | "hatch" | "gift";
export type Button = "A" | "B" | "C";

type ActiveReaction = {
  kind: SceneReaction;
  action?: ActionType;
  /** What Hammi is eating, for meals and snacks. */
  food?: FoodId;
  start: number;
  dur: number;
  /** Poops on screen before the action, so a clean can sweep them away. */
  poops: number;
  item?: TreasureId;
  isNew?: boolean;
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
  yawn: 2200,
  egg: 1600,
  grow: 3000,
  hatch: 3200,
  delighted: 2800,
  favourite: 2600,
  gift: 4200,
};

/** How long a game's explanation stays up if nobody presses anything. */
const HINT_MS = 6000;

type PickerKind = "game" | "meal" | "snack";
type PickerRow = { label: string; icon: Bitmap; favourite?: boolean };

// Delight follows the action's own animation for food and cleaning.
const EAT_MS = 1950;
const SWEEP_MS = 1300;
const LID_POP_MS = 900;
const OPEN_MS = 1300;

const POOPS: [number, number][] = [
  [42, 26],
  [36, 26],
  [42, 20],
  [36, 20],
];
const PRESENT_X = 1;
const PRESENT_Y = GROUND - S.presentLid.h - S.presentBox.h;

const NEW_GAME: Record<GameId, () => MiniGame> = {
  leftright: () => new LeftRight(),
  catch: () => new SeedCatch(),
  jump: () => new WheelRun(),
};

export class Scene {
  pet: PetView | null = null;
  mode: Mode = "idle";
  /** True when the current frame should be painted with the lights-off palette. */
  dark = false;
  onModeChange?: (mode: Mode) => void;
  /** The game whose explanation should show under the device, or null. */
  onHint?: (game: GameId | null) => void;

  private reaction: ActiveReaction | null = null;
  private game: MiniGame | null = null;
  private gameStart = 0;
  private hint: GameId | null = null;
  private onPlayed: ((won: number, game: GameId) => void) | null = null;
  private onFood: ((food: FoodId) => void) | null = null;
  private pickerKind: PickerKind = "game";
  private pickerIndex = 0;
  private gameIndex = 0;
  private statsPage = 0;
  private x = 16;
  private dir: -1 | 1 = 1;
  private moving = false;
  private lastStep = 0;
  private pauseUntil = 0;
  private hopAt = -1e9;
  private nextHop = 4000;
  private blinkUntil = 0;
  private nextBlink = 2500;

  /** Mini-games animate every frame; the pet screen ticks like an LCD. */
  get frameMs(): number {
    return this.mode === "game" ? 0 : 80;
  }

  setPet(p: PetView) {
    const prev = this.pet;
    this.pet = p;
    if (prev && prev.stage !== p.stage) this.react(prev.stage === "egg" ? "hatch" : "grow");
  }

  /** Applies the state returned by an action and plays its reaction. */
  applyAction(state: PetView, reaction: Reaction, action: ActionType, food?: FoodId) {
    const poops = this.pet?.poops ?? 0;
    this.setPet(state);
    this.react(reaction, action, poops);
    if (this.reaction) this.reaction.food = food ?? (action === "snack" ? "sunflower" : "seeds");
  }

  applyGift(state: PetView, item: TreasureId, isNew: boolean) {
    this.setMode("idle");
    this.setPet(state);
    this.reaction = { kind: "gift", start: performance.now(), dur: DURATION.gift, poops: state.poops, item, isNew };
  }

  react(kind: SceneReaction, action?: ActionType, poops = this.pet?.poops ?? 0) {
    let dur = DURATION[kind];
    if (kind === "delighted" && (action === "meal" || action === "snack")) dur += EAT_MS;
    if (kind === "favourite") dur += EAT_MS;
    if (kind === "delighted" && action === "clean") dur += SWEEP_MS;
    this.reaction = { kind, action, start: performance.now(), dur, poops };
  }

  setMode(mode: Mode) {
    if (mode !== "game") this.game = null;
    if (mode !== "picker" && mode !== "game") this.setHint(null);
    if (mode === "stats") this.statsPage = 0;
    if (this.mode === mode) return;
    this.mode = mode;
    this.onModeChange?.(mode);
  }

  private setHint(hint: GameId | null) {
    if (hint === this.hint) return;
    this.hint = hint;
    this.onHint?.(hint);
  }

  /** Opens the game picker; `onPlayed` gets the score when a game finishes. */
  openPicker(onPlayed: (won: number, game: GameId) => void) {
    this.reaction = null;
    this.onPlayed = onPlayed;
    this.pickerKind = "game";
    this.pickerIndex = this.gameIndex;
    this.setMode("picker");
    this.setHint(GAMES[this.pickerIndex].id);
  }

  /** Opens the meal or snack picker; `onFood` gets the chosen food. */
  openFoodPicker(kind: "meal" | "snack", onFood: (food: FoodId) => void) {
    this.reaction = null;
    this.onFood = onFood;
    this.pickerKind = kind;
    this.pickerIndex = 0;
    this.setMode("picker");
    this.setHint(null);
  }

  private pickerRows(): PickerRow[] {
    if (this.pickerKind === "game") {
      const icons = [S.arrows, S.seed[0], S.WISH_ICONS.play];
      return GAMES.map((g, i) => ({ label: g.label, icon: icons[i] }));
    }
    return foodsOf(this.pickerKind).map((f) => ({
      label: f.label,
      icon: f.bites[0],
      favourite: this.pet?.favouriteFood === f.id,
    }));
  }

  private movePicker() {
    this.pickerIndex = (this.pickerIndex + 1) % this.pickerRows().length;
    if (this.pickerKind === "game") this.setHint(GAMES[this.pickerIndex].id);
  }

  private pick(row: number) {
    if (this.pickerKind === "game") {
      this.gameIndex = row;
      const id = GAMES[row].id;
      this.game = NEW_GAME[id]();
      this.gameStart = performance.now();
      this.setMode("game");
      this.setHint(id);
      return;
    }
    const food = foodsOf(this.pickerKind)[row].id;
    this.setMode("idle");
    this.onFood?.(food);
  }

  /** Buttons while a picker or a game is showing. */
  input(button: Button, down: boolean) {
    const t = performance.now();
    if (button === "C") {
      if (down) this.setMode("idle");
      return;
    }
    if (this.mode === "picker") {
      if (!down) return;
      if (button === "A") this.movePicker();
      else this.pick(this.pickerIndex);
      return;
    }
    if (down) this.setHint(null);
    this.game?.press(button === "A" ? -1 : 1, down, t);
  }

  /** Touches on the screen while a picker or a game is showing. */
  touch(fx: number, fy: number, down: boolean) {
    const t = performance.now();
    if (this.mode === "picker") {
      if (!down) return;
      const rows = this.pickerRows().length;
      const row = Math.min(rows - 1, Math.max(0, Math.floor(fy * rows)));
      this.pickerIndex = row;
      this.pick(row);
      return;
    }
    if (down) this.setHint(null);
    this.game?.tap(fx, down, t);
  }

  /** Turns to the next Stats page; false when there are no more pages. */
  nextStatsPage(wrap: boolean): boolean {
    const pages = this.pet?.favouriteFood ? 2 : 1;
    if (this.statsPage + 1 < pages) {
      this.statsPage++;
      return true;
    }
    if (wrap) this.statsPage = 0;
    return false;
  }

  /** Whether a tap at this screen position lands on today's present. */
  hitsPresent(fx: number, fy: number): boolean {
    const p = this.pet;
    if (!p?.giftAvailable || this.mode !== "idle" || p.stage === "egg" || p.lightsOff) return false;
    const x = fx * W;
    const y = fy * H;
    return x <= PRESENT_X + S.presentBox.w + 3 && y >= PRESENT_Y - 4;
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
    if (this.mode === "picker") return this.drawPicker(f, t);
    if (this.mode === "game" && this.game) {
      const body = p.stage === "egg" ? S.BODIES.baby : bodyFor(p);
      if (this.hint && t - this.gameStart > HINT_MS) this.setHint(null);
      const won = this.game.render(f, t, { pet: p, body, hat: hatFor(p) });
      if (won !== null) {
        const id = this.game.id;
        const done = this.onPlayed;
        this.setMode("idle");
        setTimeout(() => done?.(won, id), 0);
      }
      return;
    }

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

  private leftEdge(p: PetView, r: ActiveReaction | null): number {
    if (p.lightsOff) return 1;
    let edge = 1;
    if (p.giftAvailable || r?.kind === "gift") edge = PRESENT_X + S.presentBox.w + 2;
    if (p.celebration) edge += S.cake[0].w + 1;
    return edge;
  }

  private bounds(p: PetView, w: number, r: ActiveReaction | null): [number, number] {
    const right = p.poops > 0 && !p.lightsOff ? 35 : 47;
    const min = this.leftEdge(p, r);
    return [min, Math.max(min, right - w)];
  }

  private drawAwake(f: Frame, p: PetView, body: S.Body, t: number, r: ActiveReaction | null, e: number) {
    const { w, h } = bodySize(body);
    const [min, max] = this.bounds(p, w, r);
    const hat = hatFor(p);
    const delightedAfterEating = r?.kind === "delighted" && (r.action === "meal" || r.action === "snack");
    const delightedAfterSweep = r?.kind === "delighted" && r.action === "clean";
    const eating = r?.kind === "yum" || ((delightedAfterEating || r?.kind === "favourite") && e < EAT_MS);
    const sweeping = r?.kind === "clean" || (delightedAfterSweep && e < SWEEP_MS + 400);
    // The delight itself starts once eating or sweeping is done.
    const de = r?.kind === "delighted" ? e - (delightedAfterEating ? EAT_MS : delightedAfterSweep ? SWEEP_MS : 0) : -1;

    // Poops, swept away from the right during a clean.
    if (!p.lightsOff) {
      const count = sweeping ? r!.poops : p.poops;
      const sweep = sweeping ? W - Math.floor((e / 1200) * (W + 4)) : W + 10;
      for (let i = 0; i < Math.min(4, count); i++) {
        const [px, py] = POOPS[i];
        if (px + 5 >= sweep) continue;
        blit(f, S.poop, px, py);
        blit(f, S.stink[Math.floor(t / 500 + i) % 2], px + 1, py - 4);
      }
      if (sweeping && sweep > -2 && sweep < W) {
        f.rect(sweep, 0, 1, 32, 2);
        f.rect(sweep + 1, 0, 1, 32, 1);
      }
    }

    // Cake and present sit on the left.
    if (!p.lightsOff) {
      let lx = 1;
      if (p.giftAvailable && r?.kind !== "gift") {
        const wiggle = t % 3000 < 400 ? (Math.floor(t / 100) % 2 ? 1 : 0) : 0;
        blit(f, S.presentLid, PRESENT_X + wiggle, PRESENT_Y);
        blit(f, S.presentBox, PRESENT_X, PRESENT_Y + S.presentLid.h);
        if (Math.floor(t / 700) % 3 === 0) blit(f, S.sparkleSmall, PRESENT_X + 6, PRESENT_Y - 4);
      }
      if (r?.kind === "gift") this.drawUnwrap(f, t, r, e);
      if (p.giftAvailable || r?.kind === "gift") lx = PRESENT_X + S.presentBox.w + 2;
      if (p.celebration) blit(f, S.cake[Math.floor(t / 250) % 2], lx, GROUND - S.cake[0].h);
    }

    // Wandering, paused while a reaction plays.
    this.x = Math.min(Math.max(this.x, min), max);
    if (!r) this.wander(t, body.step * (p.groggy ? 2.2 : p.mood === "sad" ? 1.8 : 1), min, max);
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
    const frame = Math.floor(t / (this.moving ? body.step * 2 : 600)) % 2;

    if (!r && p.mood === "happy" && !p.groggy) {
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
    if (r) {
      look = 0;
      if (eating || r.kind === "full") {
        // Put the food on whichever side has room, and face it.
        const foodW = 7;
        const roomRight = this.x + w + 1 + foodW <= (p.poops > 0 ? 35 : 47);
        const foodX = roomRight ? this.x + w + 1 : this.x - 1 - foodW;
        flip = !roomRight;
        const items = foodById(r.food ?? (r.action === "snack" ? "sunflower" : "seeds")).bites;
        if (eating) {
          const bite = Math.min(3, Math.floor(e / 650));
          expr = bite < 3 ? (Math.floor(e / 160) % 2 ? "eatOpen" : "eat") : "happy";
          if (bite < 3) {
            const item = items[bite];
            blit(f, item, foodX + Math.floor((foodW - item.w) / 2), GROUND - item.h);
          } else if (r.kind === "yum") sparkles(f, t, this.x, top, w);
        } else {
          expr = "nope";
          flip = Math.floor(e / 220) % 2 === 0;
          blit(f, items[0], foodX + Math.floor((foodW - items[0].w) / 2), GROUND - items[0].h);
        }
      } else if (sweeping) {
        expr = e > SWEEP_MS ? "happy" : "normal";
        if (r.kind === "clean" && e > SWEEP_MS) sparkles(f, t, this.x, top, w);
      } else if (de >= 0) {
        // Delighted: a big hop with sparkles and hearts.
        expr = "love";
        dy = HOP[Math.floor(de / 45) % HOP.length] * 2;
        sparkles(f, t, this.x, top, w);
        sparkles(f, t + 100, this.x + 4, top + 6, w - 8);
        floatHearts(f, de, this.x, top, w);
      } else if (r.kind === "favourite") {
        // Favourite food: hearts, a happy hop and a big heart flourish on the screen.
        const fe = e - EAT_MS;
        expr = "love";
        dy = HOP[Math.floor(fe / 60) % HOP.length];
        floatHearts(f, fe, this.x, top, w);
        const beat = Math.floor(fe / 250) % 2 === 0;
        const big = beat ? S.heartFull : S.heartEmpty;
        const hx = this.x + w + 9 <= W ? this.x + w + 2 : this.x - 9;
        blit(f, big, hx, Math.max(0, top - 4));
        if (beat) blit(f, S.sparkleSmall, hx + 6, Math.max(0, top - 7));
      } else {
        switch (r.kind) {
          case "happy":
          case "grow":
            expr = "happy";
            dy = HOP[Math.floor(e / 60) % HOP.length];
            sparkles(f, t, this.x, top, w);
            break;
          case "hatch":
            expr = "happy";
            sparkles(f, t, this.x, top, w);
            break;
          case "nothing":
            drawText(f, "?", this.x + Math.floor(w / 2) - 1, top - 7);
            break;
          case "love":
            expr = "love";
            floatHearts(f, e, this.x, top, w);
            break;
          case "lights_on":
            expr = e < 400 ? "blink" : "normal";
            blit(f, S.bulb, 2, 2);
            break;
          case "yawn":
            // Just woken: a big stretchy yawn, then a sleepy smile.
            expr = e < 1400 ? "yawn" : "happy";
            if (e < 1400) dy = e < 700 ? -1 : 0;
            break;
          case "gift":
            // Watch the present, then hop with joy once it's open.
            flip = true;
            expr = e < OPEN_MS ? "normal" : "happy";
            if (e > OPEN_MS) dy = HOP[Math.floor(e / 60) % HOP.length];
            break;
          default:
            break;
        }
      }
    }

    // Gentle in-character hints: a tired Hammi's eyes droop now and then.
    const needs = needsOf(p);
    if (!r && needs.tired && expr !== "happy" && expr !== "blink" && t % 5200 < 1800) expr = "drowsy";

    // A woken-up Hammi is heavy-eyed and yawns every few seconds, with a little z drifting off.
    if (!r && p.groggy && expr !== "blink") {
      const c = t % 7000;
      expr = c < 1100 ? "yawn" : "drowsy";
      if (c < 1100) blit(f, S.zSmall, Math.min(W - 3, this.x + w), Math.max(0, top - 3 - Math.floor(c / 400)));
    }

    // A wish shows as a thought bubble; otherwise a sad Hammi has a little raincloud.
    let bubble: [number, number] | null = null;
    if (p.wish && !r && !p.lightsOff) bubble = this.drawWish(f, t, p.wish, top, w);
    else if (p.mood === "sad" && !r && !p.lightsOff) {
      const cx = this.x + Math.floor(w / 2) - 4;
      blit(f, S.cloud, cx, top - 8);
      blit(f, S.rain[Math.floor(t / 300) % 2], cx, top - 4);
    }

    drawHammi(f, body, this.x, top + dy, { frame, expr, look, flip, hat });

    if (!r && !p.lightsOff) {
      // A hungry tummy rumbles beside the belly every few seconds.
      if (needs.hungry && t % 6000 < 900) {
        const right = p.poops > 0 ? 35 : W;
        const rx = this.x + w + 5 <= right ? this.x + w + 1 : this.x - 5;
        blit(f, S.rumble[Math.floor(t / 150) % 2], rx, top + Math.floor(h * 0.6));
      }
      this.drawNeedBadges(f, t, needs, bubble);
    }
  }

  /** Small blinking badges in a top corner, on the side away from the wish bubble. */
  private drawNeedBadges(f: Frame, t: number, needs: Needs, bubble: [number, number] | null) {
    if (t % 2500 >= 2000) return;
    const badges = (["hungry", "bored", "tired"] as const).filter((k) => needs[k]).map((k) => S.NEED_BADGES[k]);
    if (!badges.length) return;
    const width = badges.reduce((sum, b) => sum + b.w + 1, -1);
    // The bubble sits in the top rows, so move to the left corner if it covers the right one.
    const rightX = W - width;
    const blocked = bubble !== null && bubble[0] + bubble[1] + 2 > rightX;
    let x = blocked ? 0 : rightX;
    for (const b of badges) {
      blit(f, b, x, 0);
      x += b.w + 1;
    }
  }

  /** Draws the thought bubble and returns its left edge and width. */
  private drawWish(f: Frame, t: number, wish: NonNullable<PetView["wish"]>, top: number, w: number): [number, number] {
    const bw = S.bubble.w;
    const onRight = this.x + w + bw - 4 <= W;
    const bx = onRight ? this.x + w - 4 : this.x - bw + 4;
    const by = Math.max(0, top - S.bubble.h - 3) + (Math.floor(t / 800) % 2);
    blit(f, S.bubble, bx, by);
    const icon = S.WISH_ICONS[wish];
    blit(f, icon, bx + Math.floor((bw - icon.w) / 2), by + 1 + Math.floor((7 - icon.h) / 2));
    // Thought dots trailing down to Hammi's head.
    const dx = onRight ? 1 : bw - 3;
    f.rect(bx + dx, by + S.bubble.h + 1, 2, 2, 2);
    f.set(bx + dx + (onRight ? -1 : 2), by + S.bubble.h + 4, 2);
    return [bx, bw];
  }

  private drawUnwrap(f: Frame, t: number, r: ActiveReaction, e: number) {
    const boxY = PRESENT_Y + S.presentLid.h;
    if (e < LID_POP_MS) {
      const shake = Math.floor(t / 70) % 2 ? 1 : -1;
      blit(f, S.presentLid, PRESENT_X + shake, PRESENT_Y);
      blit(f, S.presentBox, PRESENT_X + shake, boxY);
      return;
    }
    blit(f, S.presentBox, PRESENT_X, boxY);
    if (e < OPEN_MS) {
      const lift = Math.floor((e - LID_POP_MS) / 40);
      blit(f, S.presentLid, PRESENT_X - Math.floor(lift / 3), PRESENT_Y - lift);
      blit(f, S.sparkleBig, PRESENT_X + 1, PRESENT_Y - 2);
      return;
    }
    if (!r.item) return;
    const item = TREASURE_BITMAPS[r.item];
    const rise = Math.min(6, Math.floor((e - OPEN_MS) / 60));
    const iy = boxY - item.h - rise + 3 + (Math.floor(t / 500) % 2);
    blit(f, item, PRESENT_X - 1, Math.max(0, iy));
    sparkles(f, t, PRESENT_X + 4, Math.max(0, iy), 4);
    if (r.item === "crown") sparkles(f, t + 100, PRESENT_X + 10, Math.max(0, iy) + 4, 2);
    if (r.isNew && Math.floor(t / 300) % 4 !== 0) drawText(f, "NEW!", PRESENT_X + 10, 1);
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
    if (hatching) sparkles(f, t, x, y, S.egg.w);
  }

  private drawSleeping(f: Frame, p: PetView, body: S.Body, t: number, r: ActiveReaction | null) {
    const { w, h } = bodySize(body);
    const right = p.poops > 0 && !p.lightsOff ? 35 : 47;
    const x = Math.floor((right - w) / 2);
    const top = GROUND - h;

    if (!p.lightsOff)
      for (let i = 0; i < Math.min(4, p.poops); i++) blit(f, S.poop, POOPS[i][0], POOPS[i][1]);

    const breathe = Math.floor(t / 1400) % 2;
    drawHammi(f, body, x, top + breathe, { frame: 0, expr: "sleep", hat: hatFor(p) });

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
    if (r?.kind === "love") floatHearts(f, t - r.start, x, top, w);
    if (!p.lightsOff) blit(f, S.bulb, 2, 2);
  }

  private drawStats(f: Frame, p: PetView) {
    const pages = p.favouriteFood ? 2 : 1;
    if (pages > 1)
      for (let i = 0; i < pages; i++) f.rect(W / 2 - 3 + i * 4, H - 1, 2, 1, i === this.statsPage ? 2 : 1);
    if (this.statsPage === 1 && p.favouriteFood) return this.drawFavourite(f, p.favouriteFood);

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

  /** Stats page two: Hammi's favourite food, drawn at double size. */
  private drawFavourite(f: Frame, id: FoodId) {
    const food = foodById(id);
    drawText(f, "FAV", 1, 1);
    blit(f, S.heart, 14, 1);
    f.rect(0, 7, W, 1, 1);
    const icon = food.bites[0];
    const ox = Math.floor((W - icon.w * 2) / 2);
    const oy = 9 + Math.floor((14 - icon.h * 2) / 2);
    for (let y = 0; y < icon.h; y++)
      for (let x = 0; x < icon.w; x++) {
        const v = icon.data[y * icon.w + x];
        if (v >= 0) f.rect(ox + x * 2, oy + y * 2, 2, 2, v as 0 | 1 | 2);
      }
    drawText(f, food.label, Math.floor((W - textWidth(food.label)) / 2), 25);
  }

  private drawPicker(f: Frame, t: number) {
    this.pickerRows().forEach((row, i) => {
      const y = 2 + i * 11;
      const selected = i === this.pickerIndex;
      if (selected) {
        f.rect(0, y - 2, W, 10, 1);
        if (Math.floor(t / 400) % 2 === 0) drawText(f, ">", 2, y);
      }
      drawText(f, row.label, 7, y, 2);
      const icon = row.icon;
      const ix = W - 1 - icon.w;
      blit(f, icon, ix, y + 2 - Math.floor(icon.h / 2));
      if (row.favourite) blit(f, S.heart, ix - 6, y);
    });
  }
}
