// Pixel icons printed around the screen, like the original toy.
const ICON_ROWS = {
  meal: [
    "#.#.#..#.",
    "#.#.#.##.",
    "#.#.#.##.",
    "#####.##.",
    ".###..##.",
    "..#...##.",
    "..#....#.",
    "..#....#.",
    "..#....#.",
  ],
  snack: [
    "....#....",
    "...###...",
    "..##.##..",
    "..#.#.#..",
    "..##.##..",
    "..#.#.#..",
    "..##.##..",
    "...###...",
    "....#....",
  ],
  play: [
    "..#####..",
    ".#..#..#.",
    "#...#...#",
    "#...#...#",
    "#########",
    "#...#...#",
    "#...#...#",
    ".#..#..#.",
    "..#####..",
  ],
  clean: [
    ".......##",
    "......##.",
    ".....##..",
    "....##...",
    "...##....",
    ".#####...",
    "#######..",
    "#.#.#.#..",
    "#.#.#....",
  ],
  lights: [
    "...###...",
    "..#...#..",
    ".#.....#.",
    ".#..#..#.",
    ".#..#..#.",
    "..#...#..",
    "...###...",
    "...###...",
    "....#....",
  ],
  pet: [
    ".........",
    ".##...##.",
    "#..#.#..#",
    "#...#...#",
    "#.......#",
    ".#.....#.",
    "..#...#..",
    "...#.#...",
    "....#....",
  ],
  stats: [
    ".........",
    ".......#.",
    ".......#.",
    "....#..#.",
    "....#..#.",
    ".#..#..#.",
    ".#..#..#.",
    ".#..#..#.",
    "#########",
  ],
  log: [
    ".#######.",
    ".#.....#.",
    ".#.###.#.",
    ".#.....#.",
    ".#.###.#.",
    ".#.....#.",
    ".#.###.#.",
    ".#.....#.",
    ".#######.",
  ],
};

export type IconId = keyof typeof ICON_ROWS;

export function PixelIcon({ id }: { id: IconId }) {
  const rows = ICON_ROWS[id];
  return (
    <svg viewBox="0 0 9 9" aria-hidden="true" shapeRendering="crispEdges">
      {rows.flatMap((row, y) =>
        [...row].map((c, x) => (c === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : null)),
      )}
    </svg>
  );
}

const SHADES: Record<string, string> = { "#": "px-dark", "+": "px-mid", o: "px-light" };

/** Renders sprite rows (`.` `o` `+` `#`) as crisp SVG, coloured by CSS. */
export function PixelArt({ rows, className }: { rows: string[]; className?: string }) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${rows[0].length} ${rows.length}`}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {rows.flatMap((row, y) =>
        [...row].map((c, x) =>
          SHADES[c] ? <rect key={`${x}-${y}`} className={SHADES[c]} x={x} y={y} width={1} height={1} /> : null,
        ),
      )}
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
