// Downloads the CC0 textures the game uses into public/assets/tex/<id>/ (diff, nor, arm).
// Poly Haven (CC0, self-hosted copies need no credit). Skips files already present.
// Usage: node tools/fetch-assets.mjs [id ...] && node tools/webp.mjs
import { mkdir, writeFile, access } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// id → resolution. Add a line here when a model needs a new material.
export const TEXTURES = {
  sparse_grass: '2k', leafy_grass: '1k', withered_grass: '1k', grass_path_2: '1k',
  forest_leaves_04: '1k', forest_ground_04: '1k',
  brown_mud_dry: '2k', clay_block_wall: '1k', mud_forest: '1k',
  pine_bark: '1k', bark_brown_02: '1k',
  weathered_planks: '1k', wood_planks_grey: '1k', old_planks_02: '1k', raw_plank_wall: '1k', rough_pine_door: '1k',
  coast_sand_04: '1k', damp_sand: '1k', rock_ground: '1k',
  burned_ground_01: '1k', rusty_metal_02: '1k', bark_willow_02: '1k', wood_chips: '1k', muddy_tracks: '1k', // yardlife, lakeside
  // balagan
  clay_plaster: '2k', mud_cracked_dry_03: '1k', clay_floor_001: '1k', dirt_floor: '1k',
  fabric_leather_02: '1k', caban: '1k', velour_velvet: '1k', excavated_soil_wall: '1k',
  rough_wood: '2k', // yard: weathered round larch (serge, ampaar, kuruo, sele)
};

export const MAPS = { diff: 'diff', nor: 'nor_gl', arm: 'arm' };
const root = new URL('../public/assets/tex/', import.meta.url);
if (import.meta.url === pathToFileURL(process.argv[1]).href) { // run, not imported (tex-sizes.mjs)
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TEXTURES);

for (const id of ids) {
  const res = TEXTURES[id] || '1k';
  const dir = new URL(`${id}/`, root);
  await mkdir(dir, { recursive: true });
  for (const [name, ph] of Object.entries(MAPS)) {
    const out = new URL(`${name}.jpg`, dir);
    try { await access(new URL(`${name}.webp`, dir)); continue; } catch {} // already converted
    const url = `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/${res}/${id}/${id}_${ph}_${res}.jpg`;
    const r = await fetch(url);
    if (!r.ok) { console.error(`✗ ${id} ${name} ${r.status}`); continue; }
    await writeFile(out, Buffer.from(await r.arrayBuffer()));
    console.log(`✓ ${id}/${name}.jpg (${res})`);
  }
}
}
