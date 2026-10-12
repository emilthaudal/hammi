// The LCD is a 48×32 grid of pixels, each one of three shades.
export const W = 48;
export const H = 32;

/** 0 = unlit, 1 = mid grey, 2 = dark. */
export type Shade = 0 | 1 | 2;

export class Frame {
  readonly px = new Uint8Array(W * H);

  clear() {
    this.px.fill(0);
  }

  set(x: number, y: number, v: Shade) {
    if (x >= 0 && x < W && y >= 0 && y < H) this.px[y * W + x] = v;
  }

  rect(x: number, y: number, w: number, h: number, v: Shade) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, v);
  }
}

/** A small image; -1 marks a transparent pixel. */
export type Bitmap = { w: number; h: number; data: Int8Array };

const CHARS: Record<string, number> = { ".": -1, o: 0, "+": 1, "#": 2 };

/** Parses rows where `.` is transparent, `o` unlit (opaque), `+` mid and `#` dark. */
export function bitmap(rows: string[]): Bitmap {
  const w = rows[0].length;
  const data = new Int8Array(w * rows.length);
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`Sprite row ${y} is ${row.length} wide, expected ${w}: "${row}"`);
    for (let x = 0; x < w; x++) {
      const v = CHARS[row[x]];
      if (v === undefined) throw new Error(`Unknown sprite character "${row[x]}"`);
      data[y * w + x] = v;
    }
  });
  return { w, h: rows.length, data };
}

export function clone(b: Bitmap): Bitmap {
  return { w: b.w, h: b.h, data: b.data.slice() };
}

export function put(b: Bitmap, x: number, y: number, v: number) {
  if (x >= 0 && x < b.w && y >= 0 && y < b.h) b.data[y * b.w + x] = v;
}

/** Draws `over` onto `base` in place, skipping transparent pixels. */
export function stamp(base: Bitmap, over: Bitmap, ox: number, oy: number): Bitmap {
  for (let y = 0; y < over.h; y++)
    for (let x = 0; x < over.w; x++) {
      const v = over.data[y * over.w + x];
      if (v >= 0) put(base, ox + x, oy + y, v);
    }
  return base;
}

export function blit(f: Frame, b: Bitmap, x: number, y: number, flip = false, rows = b.h) {
  for (let j = b.h - rows; j < b.h; j++)
    for (let i = 0; i < b.w; i++) {
      const v = b.data[j * b.w + (flip ? b.w - 1 - i : i)];
      if (v >= 0) f.set(x + i, y + j, v as Shade);
    }
}
