import { H, W, type Frame } from "./frame";

export type Palette = { bg: string; ghost: string; mid: string; dark: string };

export const PALETTES: Record<"light" | "dark", Palette> = {
  light: { bg: "#c3cea0", ghost: "#b9c597", mid: "#7c8a63", dark: "#2b3424" },
  dark: { bg: "#2c3327", ghost: "#30382b", mid: "#4f5a44", dark: "#97a57e" },
};

/** Paints the frame at `scale` device pixels per LCD pixel, leaving a `gap` between cells. */
export function paint(ctx: CanvasRenderingContext2D, f: Frame, scale: number, gap: number, pal: Palette) {
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, W * scale, H * scale);
  const colours = [pal.ghost, pal.mid, pal.dark];
  const size = scale - gap;
  for (let v = 0; v < 3; v++) {
    ctx.fillStyle = colours[v];
    ctx.beginPath();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) if (f.px[y * W + x] === v) ctx.rect(x * scale, y * scale, size, size);
    ctx.fill();
  }
}
