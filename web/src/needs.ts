import type { PetView } from "./types";

/** Same threshold the server uses for its "hungry" and "bored" pushes. */
export const LOW = 25;

export type Needs = { hungry: boolean; bored: boolean; tired: boolean };

/** Which needs are running low. Only an awake, hatched Hammi has needs worth showing. */
export function needsOf(p: PetView | null): Needs {
  if (!p || p.stage === "egg" || p.asleep) return { hungry: false, bored: false, tired: false };
  return { hungry: p.fullness < LOW, bored: p.fun < LOW, tired: p.energy < LOW };
}
