// Shared dimensions of the balagan (metres, local space: +X east, −Z north, origin = floor centre).
export const FX = 2.85, FZ = 2.35;      // post-frame half sizes (5.7 × 4.7 m frame)
export const H = 2.15;                  // top of the crossbeams
export const OUT = 0.75;                // wall feet stand this far outside the post line (≈70°)
export const GAP = 0.12;                // inner wall face sits this far outside the post line at the top
export const PL = 0.3;                  // log layer + plaster thickness to the plaster surface
// inner face of a wall at height y (distance from the centre along its normal)
export const inner = (F, y) => F + GAP + OUT * (1 - Math.min(Math.max(y, 0), H) / H);
export const ZD = 0.5;                  // door centre on the east wall (slightly south of centre)
export const DW = 0.86, DH = 1.55;      // clear door opening: low, so a grown person stoops (world.lows)
export const XD = 4.0;                  // vertical front face of the door bay
export const BAY = 0.66;                // half width of the door bay
export const ROOF = { hx: 3.78, hz: 3.25, under: 2.4, edge: 2.82, crown: 0.22 }; // earth roof
export const HEARTH = { x: 1.85, z: -1.45, s: 1.5, h: 0.28 }; // clay-filled base box
export const KH = { zc: -5.1, hz: 2.5, hx: 2.6, h: 1.85, top: 2.48 };            // khoton frame, narrower than the house so its side walls run into the house's north wall
// windows: [wall, lateral centre, sill y] — two south, one west (none over биллэрик / кэтэҕириин)
export const WINDOWS = [['S', 0.1, 0.98], ['S', 2.05, 0.98], ['W', 1.0, 0.98]];
export const WIN = 0.3;
// the door bay's front: vertical up past the lintel, then leaning back under the roof edge
export const bayX = (y) => (y < DH + 0.14 ? XD : XD + (ROOF.hx - 0.08 - XD) * Math.min(1, (y - DH - 0.14) / (ROOF.under - DH - 0.1)));
