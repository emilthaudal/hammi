// Writes the PWA icons to public/icons: the baby hamster on a little LCD on the shell colour.
// Uses only Node built-ins. Run with `npm run icons` after changing the baby sprite.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

// Mirrors the first baby frame in src/game/sprites.ts, with its normal face drawn in.
const HAMMI = [
  ".##......##.",
  "#++######++#",
  "#+oooooooo+#",
  "#oo#oooo#oo#",
  "#oo#oooo#oo#",
  "#+oo#oo#oo+#",
  "#oooo##oooo#",
  ".#oooooooo#.",
  "..########..",
  "..##....##..",
];

const SHELL = [0xf9, 0xb8, 0xb8];
const LCD = [0xc3, 0xce, 0xa0];
const MID = [0x7c, 0x8a, 0x63];
const DARK = [0x2b, 0x34, 0x24];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** `content` is the fraction of the icon the LCD square takes up. */
function icon(size, content) {
  const lcd = Math.round(size * content);
  const lcdX = Math.round((size - lcd) / 2);
  const radius = lcd * 0.18;
  const cell = Math.floor((lcd * 0.72) / HAMMI[0].length);
  const spriteW = cell * HAMMI[0].length;
  const spriteH = cell * HAMMI.length;
  const sx = Math.round((size - spriteW) / 2);
  const sy = Math.round((size - spriteH) / 2);

  return png(size, (x, y) => {
    const lx = x - lcdX;
    const ly = y - lcdX;
    if (lx < 0 || ly < 0 || lx >= lcd || ly >= lcd) return SHELL;
    const cx = Math.min(Math.max(lx, radius), lcd - radius);
    const cy = Math.min(Math.max(ly, radius), lcd - radius);
    if ((lx - cx) ** 2 + (ly - cy) ** 2 > radius ** 2) return SHELL;

    const px = Math.floor((x - sx) / cell);
    const py = Math.floor((y - sy) / cell);
    const ch = HAMMI[py]?.[px];
    if (ch === "#") return DARK;
    if (ch === "+") return MID;
    return LCD;
  });
}

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "icon-192.png"), icon(192, 0.82));
writeFileSync(join(out, "icon-512.png"), icon(512, 0.82));
writeFileSync(join(out, "icon-maskable-512.png"), icon(512, 0.62));
writeFileSync(join(out, "apple-touch-icon.png"), icon(180, 0.78));
console.log(`Wrote icons to ${out}`);
