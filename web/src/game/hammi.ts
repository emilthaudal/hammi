import type { PetView } from "../types";
import { blit, put, type Bitmap, type Frame } from "./frame";
import * as S from "./sprites";

// Drawing Hammi: faces, hats and the little effects shared by the scene and the mini-games.

export type Expr = "normal" | "blink" | "happy" | "sad" | "eat" | "eatOpen" | "nope" | "love" | "sleep";

export const GROUND = 31; // sprites stand with their last row on y = 30
export const HOP = [0, -1, -2, -3, -3, -2, -1, 0];

export function bodyFor(p: PetView): S.Body {
  if (p.stage === "kid") return S.BODIES.kid;
  if (p.stage === "adult") return S.ADULTS[p.form ?? "snuggly"];
  return S.BODIES.baby;
}

/** Celebration hat first, then seasonal hats from the device's local date. */
export function hatFor(p: PetView, now = new Date()): S.HatKind | null {
  if (p.celebration) return "party";
  const m = now.getMonth() + 1;
  const d = now.getDate();
  if (m === 10 && d >= 24) return "pumpkin";
  if (m === 12 && d <= 26) return "santa";
  if ((m === 12 && d === 31) || (m === 1 && d === 1)) return "party";
  if (m === 2 && d === 14) return "heart";
  return null;
}

/** Draws one expression into a copy of a body frame. `look` shifts the eyes sideways. */
export function composeHammi(body: S.Body, frame: number, expr: Expr, look = 0): Bitmap {
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

export type HammiPose = {
  frame: number;
  expr: Expr;
  look?: number;
  flip?: boolean;
  hat?: S.HatKind | null;
};

/** Blits Hammi with its top-left at (x, top), plus a hat if it is wearing one. */
export function drawHammi(f: Frame, body: S.Body, x: number, top: number, pose: HammiPose) {
  const b = composeHammi(body, pose.frame, pose.expr, pose.look ?? 0);
  blit(f, b, x, top, pose.flip ?? false);
  if (pose.hat) {
    const hat = S.HATS[pose.hat];
    const cx = pose.flip ? b.w - 1 - body.face.cx : body.face.cx;
    // Hats are drawn facing right; mirror them with the body.
    const hx = pose.flip ? x + cx - (hat.bmp.w - 1 - hat.x) : x + cx - hat.x;
    blit(f, hat.bmp, hx, top + 3 - hat.bmp.h - (hat.lift ?? 0), pose.flip ?? false);
  }
}

export function bodySize(body: S.Body): { w: number; h: number } {
  return { w: body.frames[0].w, h: body.frames[0].h };
}

export function sparkles(f: Frame, t: number, x: number, top: number, w: number) {
  const on = Math.floor(t / 200) % 2 === 0;
  blit(f, on ? S.sparkleBig : S.sparkleSmall, x - 6, top + 1);
  blit(f, on ? S.sparkleSmall : S.sparkleBig, x + w + 1, top - 2);
  blit(f, on ? S.sparkleSmall : S.sparkleBig, x - 3, top - 6);
}

export function floatHearts(f: Frame, e: number, x: number, top: number, w: number) {
  const starts = [x - 4, x + Math.floor(w / 2) - 2, x + w - 1];
  starts.forEach((hx, i) => {
    const age = e - i * 350;
    if (age < 0) return;
    const y = top - 2 - Math.floor(age / 120);
    if (y > -4) blit(f, S.heart, hx + (Math.floor(age / 300) % 2), y);
  });
}
