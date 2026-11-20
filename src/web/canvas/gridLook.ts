// What each grid shape looks like, decided here and nowhere else: the board's grid, the picker in Settings and the cursor
// preview behind "Your cursor" all read it, so they cannot disagree about which shape is drawn or whether any is.
export const GRID_SHAPES = ['none', 'dot', 'cross', 'square', 'cloudberry', 'berry', 'leaf'] as const;
export type GridShape = (typeof GRID_SHAPES)[number];
export const isGridShape = (v: unknown): v is GridShape => GRID_SHAPES.some(s => s === v);

// each shape's name, and its SVG drawn in a 26 × 26 tile
const DRAWN: Record<GridShape, [name: string, svg: string]> = {
  none: [
    'None',
    '<circle cx="13" cy="13" r="3.7" fill="none" stroke="#000" stroke-width="1.4"/><path d="M10.4 10.4L15.6 15.6" stroke="#000" stroke-width="1.4" stroke-linecap="round"/>',
  ],
  dot: ['Dots', '<circle cx="13" cy="13" r="1.6"/>'],
  cross: [
    'Crosses',
    '<rect x="9.6" y="12.25" width="6.8" height="1.5" rx=".75"/><rect x="12.25" y="9.6" width="1.5" height="6.8" rx=".75"/>',
  ],
  square: ['Squares', '<rect x="10.9" y="10.9" width="4.2" height="4.2" rx=".9"/>'],
  cloudberry: [
    'Cloudberries',
    '<path d="M11.48 11.45A1.61 1.61 0 0 1 14.52 11.45A1.61 1.61 0 0 1 16.41 13.82A1.61 1.61 0 0 1 15.73 16.78A1.61 1.61 0 0 1 13 18.1A1.61 1.61 0 0 1 10.27 16.78A1.61 1.61 0 0 1 9.59 13.82A1.61 1.61 0 0 1 11.48 11.45Z"/><path d="M13 10.63C11.88 10.7 10.77 10.14 10.52 8.9C11.88 8.84 12.94 9.39 13 10.63ZM13 10.63C14.12 10.7 15.23 10.14 15.48 8.9C14.12 8.84 13.06 9.39 13 10.63Z"/>',
  ],
  berry: [
    'Berries',
    '<path d="M11.53 9.95A1.56 1.56 0 0 1 14.47 9.95A1.56 1.56 0 0 1 16.3 12.25A1.56 1.56 0 0 1 15.65 15.11A1.56 1.56 0 0 1 13 16.38A1.56 1.56 0 0 1 10.35 15.11A1.56 1.56 0 0 1 9.7 12.25A1.56 1.56 0 0 1 11.53 9.95Z"/>',
  ],
  leaf: [
    'Leaves',
    '<path d="M9.2 15.2C12.8 15.4 16.4 13.6 17.2 9.6C12.8 9.4 9.4 11.2 9.2 15.2Z" transform="rotate(55 13 13)"/>',
  ],
};

export const gridName = (shape: GridShape) => DRAWN[shape][0];

const tile = (shape: GridShape) => {
  const drawing = DRAWN[shape][1],
    svg = encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26" fill="#000">${drawing}</svg>`,
    );
  return `url("data:image/svg+xml,${svg}")`;
};

// visible: whether the grid is drawn at all. mask: the CSS mask that draws the shape, null for the plain dots that a gradient draws
export const gridLook = (shape: GridShape): { visible: boolean; mask: string | null } => ({
  visible: shape !== 'none',
  mask: shape === 'none' || shape === 'dot' ? null : tile(shape),
});

// the picker draws every choice, so plain dots and None get a glyph of their own where the board has no mask
export const gridGlyph = (shape: GridShape) => gridLook(shape).mask ?? tile(shape);
