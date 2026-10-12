import type { Form } from "../types";
import { bitmap, clone, stamp, type Bitmap } from "./frame";

// `.` transparent, `o` unlit fill, `+` mid shade, `#` dark.
// Bodies are drawn without eyes or mouth; faces are added at runtime so every
// form can show every expression. Widths are odd so faces have a centre column.
// Bodies face right, which only matters for zoomy's headband tail.

export type Face = {
  /** Centre column of the face. */
  cx: number;
  eyeY: number;
  /** Left column of the left eye; the right eye mirrors it around `cx`. */
  eyeL: number;
  eyeW: 1 | 2;
  eyeH: 2 | 3;
  mouthY: number;
  /** Content closed eyes as the resting face. */
  sleepy?: boolean;
  lashes?: boolean;
};

export type Body = {
  frames: Bitmap[];
  face: Face;
  /** Milliseconds per wander step. */
  step: number;
};

const baby: Body = {
  frames: [
    bitmap([
      ".##.......##.",
      "#++#.###.#++#",
      "#+##+++++##+#",
      ".#+++++++++#.",
      "#+ooooooooo+#",
      "#ooooooooooo#",
      "#ooooooooooo#",
      "#++ooooooo++#",
      ".#ooooooooo#.",
      "..#########..",
      "..##.....##..",
    ]),
    bitmap([
      ".##.......##.",
      "#++#.###.#++#",
      "#+##+++++##+#",
      ".#+++++++++#.",
      "#+ooooooooo+#",
      "#ooooooooooo#",
      "#ooooooooooo#",
      "#++ooooooo++#",
      ".#ooooooooo#.",
      "..#########..",
      "...##...##...",
    ]),
  ],
  face: { cx: 6, eyeY: 5, eyeL: 3, eyeW: 1, eyeH: 2, mouthY: 7 },
  step: 380,
};

const kidRows = (feet: string) => [
  ".##.........##.",
  "#++#.#####.#++#",
  "#+##+++++++##+#",
  ".#+++++++++++#.",
  "#++ooooooooo++#",
  "#ooooooooooooo#",
  "#ooooooooooooo#",
  "#ooooooooooooo#",
  "#++ooooooooo++#",
  ".#ooooooooooo#.",
  "#ooo##ooo##ooo#",
  ".#ooooooooooo#.",
  "..###########..",
  feet,
];

const kid: Body = {
  frames: [bitmap(kidRows("..##.......##..")), bitmap(kidRows("...##.....##..."))],
  face: { cx: 7, eyeY: 5, eyeL: 3, eyeW: 2, eyeH: 2, mouthY: 7 },
  step: 320,
};

const chonkyRows = (feet: string) => [
  "...##.........##...",
  "..#++#.#####.#++#..",
  "..#+##+++++++##+#..",
  "..#+++++++++++++#..",
  ".#+++ooooooooo+++#.",
  ".#+ooooooooooooo+#.",
  "#+ooooooooooooooo+#",
  "#ooooooooooooooooo#",
  "#++ooooooooooooo++#",
  "#+++ooooooooooo+++#",
  "#++ooooooooooooo++#",
  "#ooooooooooooooooo#",
  "#ooooooo+++ooooooo#",
  ".#ooooo+ooo+ooooo#.",
  "..#ooooo+++ooooo#..",
  "...#############...",
  feet,
];

const chonky: Body = {
  frames: [bitmap(chonkyRows("...##.........##...")), bitmap(chonkyRows("....##.......##...."))],
  face: { cx: 9, eyeY: 6, eyeL: 5, eyeW: 2, eyeH: 3, mouthY: 9 },
  step: 520,
};

// The headband's tail trails on the left, behind a right-facing hamster.
const zoomyRows = (tail: [string, string], legs: [string, string]) =>
  [
    ".##.........##.",
    "#++#.#####.#++#",
    "#+##+++++++##+#",
    "###############",
    "#+ooooooooooo+#",
    "#ooooooooooooo#",
    "#ooooooooooooo#",
    "#++ooooooooo++#",
    ".#ooooooooooo#.",
    "#o#ooooooooo#o#",
    ".##ooooooooo##.",
    "..#ooooooooo#..",
    "..#ooooooooo#..",
    "..###########..",
    legs[0],
    legs[1],
  ].map((row, y) => (y === 3 ? tail[0] : y === 4 ? tail[1] : "...") + row);

const zoomy: Body = {
  frames: [
    bitmap(zoomyRows([".##", "#.."], ["..#o#.....#o#..", ".##.......##..."])),
    bitmap(zoomyRows(["###", "..."], ["...#o#...#o#...", "...##.....##..."])),
  ],
  face: { cx: 10, eyeY: 5, eyeL: 7, eyeW: 2, eyeH: 3, mouthY: 8 },
  step: 170,
};

// Solid outline with tufts of fur poking out at the sides and a fringe at the bottom.
const fluffyRows = (fringe: string) => [
  "...##.........##...",
  "..#++#.#####.#++#..",
  "..#+##+++++++##+#..",
  ".#+++++++++++++++#.",
  "##+++ooooooooo+++##",
  ".#+ooooooooooooo+#.",
  ".#ooooooooooooooo#.",
  "##ooooooooooooooo##",
  ".#+ooooooooooooo+#.",
  ".#++ooooooooooo++#.",
  "##+ooooooooooooo+##",
  ".#ooooooooooooooo#.",
  ".#ooooooooooooooo#.",
  "##ooooooooooooooo##",
  "..###############..",
  fringe,
];

const bow = bitmap(["##.#.##", "#+###+#", "##.#.##"]);

const fluffy: Body = {
  frames: [
    stamp(bitmap(fluffyRows("..#.#.#.#.#.#.#.#..")), bow, 6, 0),
    stamp(bitmap(fluffyRows("...#.#.#...#.#.#...")), bow, 6, 0),
  ],
  face: { cx: 9, eyeY: 6, eyeL: 5, eyeW: 2, eyeH: 3, mouthY: 9 },
  step: 400,
};

const snugglyRows = [
  "..##.........##..",
  ".#++#.#####.#++#.",
  ".#+##+++++++##+#.",
  ".#+++++++++++++#.",
  "#++++ooooooo++++#",
  "#+ooooooooooooo+#",
  "#ooooooooooooooo#",
  "#++ooooooooooo++#",
  "#ooooooooooooooo#",
  ".#ooooooooooooo#.",
  "#ooooooooooooooo#",
  "#ooooooooooooooo#",
  ".#ooooooooooooo#.",
  "..#ooooooooooo#..",
  "...###########...",
  "...##.......##...",
];

const bigHeart = bitmap([".##.##.", "#o+#++#", "#+++++#", ".#+++#.", "..#+#..", "...#..."]);
const smallHeart = bitmap([".......", "..#.#..", ".#o#+#.", ".#+++#.", "..#+#..", "...#..."]);
const paws = bitmap(["#o#.....#o#", ".#.......#."]);

const snuggly: Body = {
  frames: [
    stamp(stamp(bitmap(snugglyRows), bigHeart, 5, 9), paws, 3, 10),
    stamp(stamp(bitmap(snugglyRows), smallHeart, 5, 9), paws, 3, 10),
  ],
  face: { cx: 8, eyeY: 5, eyeL: 4, eyeW: 2, eyeH: 2, mouthY: 7, sleepy: true },
  step: 600,
};

export const BODIES = { baby, kid } as const;
export const ADULTS: Record<Form, Body> = { chonky, zoomy, fluffy, snuggly };

export const egg = bitmap([
  "...####...",
  "..#oooo#..",
  ".#oo++oo#.",
  ".#o++++o#.",
  "#oo++++oo#",
  "#ooo++ooo#",
  "#oooooooo#",
  "#+oo++oo+#",
  "#++o++o++#",
  ".#oooooo#.",
  "..######..",
]);

export const eggCrack = bitmap([
  "..........",
  "..........",
  "..........",
  "..........",
  "..........",
  "...#......",
  "..#.#..#..",
  ".....##.#.",
  "..........",
  "..........",
  "..........",
]);

export const poop = bitmap([
  "..#..",
  ".#+#.",
  ".###.",
  "#+#+#",
  "#####",
]);

export const stink = [bitmap(["#.", ".#", "#."]), bitmap([".#", "#.", ".#"])];

export const zSmall = bitmap(["###", ".#.", "###"]);
export const zBig = bitmap(["####", "..#.", ".#..", "####"]);

export const heart = bitmap([".#.#.", "#####", ".###.", "..#.."]);

export const heartFull = bitmap([
  ".##.##.",
  "#######",
  "#######",
  ".#####.",
  "..###..",
  "...#...",
]);

export const heartEmpty = bitmap([
  ".##.##.",
  "#oo#oo#",
  "#ooooo#",
  ".#ooo#.",
  "..#o#..",
  "...#...",
]);

export const sparkleBig = bitmap(["..#..", "..#..", "##.##", "..#..", "..#.."]);
export const sparkleSmall = bitmap(["#.#", ".#.", "#.#"]);

export const cloud = bitmap([
  ".###.##.",
  "#ooo#oo#",
  "#oooooo#",
  ".######.",
]);
export const rain = [bitmap(["#...#...", "..#...#."]), bitmap(["..#...#.", "#...#..."])];

export const bulb = bitmap([".###.", "#ooo#", "#ooo#", ".#o#.", ".###.", "..#.."]);

export const meal = [
  bitmap([".+o+o+.", "+o+o+o+", "#######", "#+++++#", ".#####."]),
  bitmap([".......", "..+o+..", "#######", "#+++++#", ".#####."]),
  bitmap([".......", ".......", "#.....#", "#+++++#", ".#####."]),
];

export const seed = [
  bitmap([".#.", "#+#", "#o#", "#+#", "#o#", ".#."]),
  bitmap(["...", "...", "#o#", "#+#", "#o#", ".#."]),
  bitmap(["...", "...", "...", "...", "#o#", ".#."]),
];

export const heartOutline = bitmap([".#.#.", "#o#o#", ".#o#.", "..#.."]);

// --- Hats. Each sits with its bottom row on the hamster's head; `x` is the column over the face centre.

export type HatKind = "party" | "pumpkin" | "santa" | "heart";
export const HATS: Record<HatKind, { bmp: Bitmap; x: number; lift?: number }> = {
  party: {
    bmp: bitmap([".#.#.", "..#..", "..#..", ".###.", ".#o#.", "#####", "#o#o#", "#####"]),
    x: 2,
  },
  pumpkin: {
    bmp: bitmap(["....#..", "...##..", ".#####.", "#+#+#+#", "#+#+#+#", "#+#+#+#", ".#####."]),
    x: 3,
    lift: 2,
  },
  santa: {
    bmp: bitmap([
      "........##.",
      "......##oo#",
      "....##++##.",
      "...#+++#...",
      "..#+++++#..",
      ".#ooooooo#.",
      ".#########.",
    ]),
    x: 5,
  },
  heart: { bmp: bitmap([".##.##.", "#o#####", "#######", ".#####.", "..###..", "...#...", "...#..."]), x: 3 },
};

// --- Surprises.

const cakeRows = (flame: string) => [
  flame,
  "...#+#...",
  "....#....",
  "....#....",
  ".#######.",
  "#o#o#o#o#",
  "#+++++++#",
  "#+o+o+o+#",
  "#########",
];
export const cake = [bitmap(cakeRows("....#....")), bitmap(cakeRows("...#....."))];

export const presentLid = bitmap([".##...##.", "#oo#.#oo#", ".##o#o##.", "#########", "#ooo#ooo#", "#########"]);
export const presentBox = bitmap(["#+++#+++#", "#+++#+++#", "#+++#+++#", "#########"]);

export const bubble = bitmap([
  ".###########.",
  "#ooooooooooo#",
  "#ooooooooooo#",
  "#ooooooooooo#",
  "#ooooooooooo#",
  "#ooooooooooo#",
  "#ooooooooooo#",
  "#ooooooooooo#",
  ".###########.",
]);

/** Icons that fit inside the thought bubble (at most 11×7). */
export const WISH_ICONS: Record<"meal" | "snack" | "play" | "clean" | "pet", Bitmap> = {
  meal: bitmap(["...#.#...", "..#.#....", "..+o+o+..", ".+o+o+o+.", "#########", ".#+++++#.", "..#####.."]),
  snack: bitmap([".#.", "#+#", "#o#", "#+#", "#o#", "#+#", ".#."]),
  play: bitmap(["..###..", ".#.#.#.", "#..#..#", "#######", "#..#..#", ".#.#.#.", "..###.."]),
  clean: bitmap(["......#", ".....#.", "....#..", "..###..", ".####..", "#####..", "#.#.#.."]),
  pet: bitmap([".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."]),
};

// --- Mini-games.

export const pebble = bitmap([".###.", "#o++#", "#####"]);
export const arrows = bitmap(["..#...#..", ".#.....#.", "#.......#", ".#.....#.", "..#...#.."]);

/** A plain copy of a body frame to draw a face into. */
export function bodyFrame(body: Body, i: number): Bitmap {
  return clone(body.frames[i % body.frames.length]);
}
