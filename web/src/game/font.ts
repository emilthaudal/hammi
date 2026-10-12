import type { Frame, Shade } from "./frame";

// 3×5 pixel font, uppercase only. Each glyph is five rows separated by spaces.
const SOURCE: Record<string, string> = {
  A: ".#. #.# ### #.# #.#",
  B: "##. #.# ##. #.# ##.",
  C: ".## #.. #.. #.. .##",
  D: "##. #.# #.# #.# ##.",
  E: "### #.. ##. #.. ###",
  F: "### #.. ##. #.. #..",
  G: ".## #.. #.# #.# .##",
  H: "#.# #.# ### #.# #.#",
  I: "### .#. .#. .#. ###",
  J: "..# ..# ..# #.# .#.",
  K: "#.# #.# ##. #.# #.#",
  L: "#.. #.. #.. #.. ###",
  M: "#.# ### ### #.# #.#",
  N: "##. #.# #.# #.# #.#",
  O: ".#. #.# #.# #.# .#.",
  P: "##. #.# ##. #.. #..",
  Q: ".#. #.# #.# ##. .##",
  R: "##. #.# ##. #.# #.#",
  S: ".## #.. .#. ..# ##.",
  T: "### .#. .#. .#. .#.",
  U: "#.# #.# #.# #.# ###",
  V: "#.# #.# #.# #.# .#.",
  W: "#.# #.# ### ### #.#",
  X: "#.# #.# .#. #.# #.#",
  Y: "#.# #.# .#. .#. .#.",
  Z: "### ..# .#. #.. ###",
  "Ø": ".## #.# ### #.# ##.",
  "0": "### #.# #.# #.# ###",
  "1": ".#. ##. .#. .#. ###",
  "2": "##. ..# .#. #.. ###",
  "3": "##. ..# .#. ..# ##.",
  "4": "#.# #.# ### ..# ..#",
  "5": "### #.. ##. ..# ##.",
  "6": ".## #.. ### #.# ###",
  "7": "### ..# .#. .#. .#.",
  "8": "### #.# ### #.# ###",
  "9": "### #.# ### ..# ##.",
  " ": "... ... ... ... ...",
  ".": "... ... ... ... .#.",
  "!": ".#. .#. .#. ... .#.",
  "?": "##. ..# .#. ... .#.",
  "/": "..# ..# .#. #.. #..",
  "<": "..# .#. #.. .#. ..#",
  ">": "#.. .#. ..# .#. #..",
  "-": "... ... ### ... ...",
  ":": "... .#. ... .#. ...",
};

const GLYPHS: Record<string, string> = Object.fromEntries(
  Object.entries(SOURCE).map(([k, v]) => [k, v.replace(/ /g, "")]),
);

export function normalize(text: string): string {
  return text
    .toUpperCase()
    .replace(/Æ/g, "AE")
    .replace(/[ÅÄÁÀÂ]/g, "A")
    .replace(/[ÖÓÒÔ]/g, "Ø")
    .replace(/[ÉÈÊË]/g, "E")
    .replace(/[ÜÚÙ]/g, "U")
    .split("")
    .map((c) => (GLYPHS[c] ? c : "?"))
    .join("");
}

export function textWidth(text: string): number {
  return normalize(text).length * 4 - 1;
}

export function drawText(f: Frame, text: string, x: number, y: number, v: Shade = 2) {
  for (const ch of normalize(text)) {
    const g = GLYPHS[ch];
    for (let i = 0; i < 15; i++) if (g[i] === "#") f.set(x + (i % 3), y + Math.floor(i / 3), v);
    x += 4;
  }
}
