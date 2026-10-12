import type { FoodId } from "../types";
import { bitmap, clone, put, type Bitmap } from "./frame";
import * as S from "./sprites";

export type Food = {
  id: FoodId;
  kind: "meal" | "snack";
  name: string;
  /** Short uppercase label for the LCD picker. */
  label: string;
  /** Full, half eaten, last bite. */
  bites: [Bitmap, Bitmap, Bitmap];
};

/** Hides the top rows of a sprite, so food looks eaten from the top. */
function bitten(b: Bitmap, rows: number): Bitmap {
  const c = clone(b);
  for (let y = 0; y < rows; y++) for (let x = 0; x < c.w; x++) put(c, x, y, -1);
  return c;
}

function bitesOf(b: Bitmap): [Bitmap, Bitmap, Bitmap] {
  return [b, bitten(b, Math.floor(b.h * 0.4)), bitten(b, Math.floor(b.h * 0.7))];
}

// A carrot lying diagonally, leaves up and to the right.
const carrot = bitmap([".....#.", "...#.#.", "....##.", "..###..", ".#++#..", "#++#...", "##....."]);
// A cob of corn with its husk folded open at the bottom.
const corn = bitmap(["..###..", ".#o+o#.", ".#+o+#.", ".#o+o#.", "#.#+#.#", "#+.#.+#", ".#...#."]);
const strawberry = bitmap(["#.#.#", ".###.", "#####", "#+o+#", "#o+o#", ".#+#.", "..#.."]);
// A peanut on its side: two lobes and a pinched waist.
const peanut = bitmap([".##..##.", "#oo##oo#", "#+o++o+#", "#oo##oo#", ".##..##."]);

export const FOODS: Food[] = [
  { id: "seeds", kind: "meal", name: "seed mix", label: "SEEDS", bites: [S.meal[0], S.meal[1], S.meal[2]] },
  { id: "carrot", kind: "meal", name: "carrot", label: "CARROT", bites: bitesOf(carrot) },
  { id: "corn", kind: "meal", name: "corn", label: "CORN", bites: bitesOf(corn) },
  { id: "sunflower", kind: "snack", name: "sunflower seed", label: "SEED", bites: [S.seed[0], S.seed[1], S.seed[2]] },
  { id: "strawberry", kind: "snack", name: "strawberry", label: "BERRY", bites: bitesOf(strawberry) },
  { id: "peanut", kind: "snack", name: "peanut", label: "PEANUT", bites: bitesOf(peanut) },
];

export function foodsOf(kind: "meal" | "snack"): Food[] {
  return FOODS.filter((f) => f.kind === kind);
}

export function foodById(id: FoodId): Food {
  return FOODS.find((f) => f.id === id)!;
}
