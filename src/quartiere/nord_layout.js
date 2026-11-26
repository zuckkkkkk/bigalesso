// quartiere/nord_layout.js — the northern districts as DATA (no meshes): Via Zamboni, Piazza Verdi (Teatro Comunale,
// università), Via Rizzoli, Piazza Maggiore (Nettuno, San Petronio, Palazzo d'Accursio, Palazzo del Podestà).
// Reached from Via Teletubbylandia through the "Voltone" (ground floor of building f4 opened as a vaulted passage).
// Like layout.js: colliders, zones, anchors exist from frame 0; meshes are built by nord.js (an `areas` entry of
// quartiere.js, preloaded hidden during the loading screen like Teletubbylandia).
//
//   Voltone          x -7.6..-2.4, z 33.6..46   (covered passage under f4)
//   Via Zamboni      x -36..30,    z 46..55     (portico on the north side: columns z 51.6, ground facades z 55)
//   Piazza Verdi     x -14..8,     z 55..74     (Teatro Comunale east side, università west side)
//   Via Rizzoli      x -36..30,    z 74..80
//   Piazza Maggiore  x -30..-4,    z 80..104    (Nettuno, Crescentone, San Petronio north, Accursio west, Podestà east)
const PI = Math.PI;

export const NORD = { x0: -36, x1: 30, z0: 46, z1: 106 };
export const ZAM = { z0: 46, walkS: 47.5, roadN: 51.2, colZ: 51.6, z1: 55, portH: 3.9 };
export const PORT_DEEP_H = 4.1; // the deep monumental arcades (Teatro, Podestà): a little taller than the others
export const VERDI = { x0: -14, x1: 8, z0: 55, z1: 74 };
export const RIZ = { z0: 74, z1: 80 };
export const MAGG = { x0: -30, x1: -4, z0: 80, z1: 104 };
export const VOLT = { x0: -7.6, x1: -2.4, z0: 33.6, z1: 46, h: 3.7 }; // = ST.portH of f4
export const NETTUNO = { x: -11, z: 85, r: 2.6 };            // the Gigante, NE corner of the piazza (steps r+1.1)
export const CRESC = { x0: -24, z0: 89, x1: -10, z1: 99, h: 0.08 }; // the Crescentone (raised slab, walkable)

// faces: sides with a street facade ('n' +z, 's' -z, 'e' +x, 'w' -x); portico: { side, depth } = open ground-floor
// arcade on that side (the upper floors overhang it); kind: special builders in nord.js
export const NB = [
  // north row of Via Zamboni (ground facade z 55, arcade z 51.6..55), backs on Via Rizzoli (z 74)
  { id: 'z1', rect: [-36, 51.6, -26, 74], h: 16, col: '#d9a05a', faces: ['s', 'n'], portico: { side: 's', depth: 3.4 }, shop: 'OSTERIA' },
  { id: 'z2', rect: [-26, 51.6, -14, 74], h: 15, col: '#c97a4a', faces: ['s', 'e', 'n'], portico: { side: 's', depth: 3.4 }, plaque: 'UNIVERSITÀ', kind: 'uni' },
  { id: 'tea', rect: [8, 51.6, 22, 74], h: 17, col: '#e6cfa8', faces: ['s', 'w', 'n'], portico: { side: 'w', depth: 3.6 }, kind: 'teatro' },
  { id: 'z4', rect: [22, 51.6, 30, 74], h: 13, col: '#c86e48', faces: ['s', 'n'], portico: { side: 's', depth: 3.4 }, shop: 'LIBRERIA' },
  // north of Via Rizzoli
  { id: 'acc', rect: [-36, 80, -30, 104], h: 18, col: '#b4553a', faces: ['e', 's'], kind: 'accursio', brick: true },
  { id: 'pet', rect: [-30, 104, -6, 122], h: 27, col: '#c06a46', faces: ['s'], kind: 'petronio', brick: true },
  { id: 'pod', rect: [-4, 80, 8, 104], h: 17, col: '#a84a32', faces: ['w', 's'], portico: { side: 'w', depth: 3.6 }, kind: 'podesta', brick: true },
  { id: 'r1', rect: [8, 80, 19, 98], h: 15, col: '#e0b77c', faces: ['s'], portico: { side: 's', depth: 3.4 }, shop: 'GELATERIA' },
  { id: 'r2', rect: [19, 80, 30, 98], h: 14, col: '#d3874e', faces: ['s', 'w'], portico: { side: 's', depth: 3.4 }, shop: 'CANTINA', bar: true },
  // corner pieces closing the districts (no facades worth a portico)
  { id: 'gap', rect: [-6, 104, 8, 114], h: 16, col: '#c9884c', faces: [] }, // closes the Podestà arcade's north end
];

export const NORD_ZONES = [
  { name: 'Voltone', rect: [VOLT.x0, VOLT.z0, VOLT.x1, VOLT.z1] },
  { name: 'Via Zamboni', rect: [NORD.x0, ZAM.z0, NORD.x1, ZAM.z1] },
  { name: 'Piazza Verdi', rect: [VERDI.x0, VERDI.z0, 11.6, VERDI.z1] },          // + the teatro's arcade (x 8..11.6)
  { name: 'Piazza Maggiore', rect: [MAGG.x0, MAGG.z0, -0.4, MAGG.z1] },          // + the Podestà's arcade (x -4..-0.4)
  { name: 'Via Rizzoli', rect: [NORD.x0, RIZ.z0, NORD.x1, 83.4] },               // + the r1/r2 arcade (z 80..83.4)
];
export const NORD_OUTDOOR = NORD_ZONES.map(z => z.name);

// street furniture shared by nord.js (meshes) and nordColliders() (collisions)
export const NORD_PROPS = {
  // street lamps [x, z, yaw of the arm]: Via Zamboni (south sidewalk), Via Rizzoli (in front of the blocks' backs),
  // Piazza Verdi (università side), Piazza Maggiore (Accursio side, Podestà corner)
  lamps: [[-32, 47.0, 0], [-21, 47.0, 0], [-10, 47.0, 0], [1, 47.0, 0], [12, 47.0, 0], [23, 47.0, 0],
    [-32, 74.5, 0], [-20, 74.5, 0], [14, 74.5, 0], [26, 74.5, 0], [-13.5, 58, PI / 2], [-13.5, 70, PI / 2],
    [-29.6, 86, PI / 2], [-29.6, 98, PI / 2], [-6.5, 103.2, PI]],
  // café tables [x, z]: Cantina + Gelateria under the arcade edge, three in Piazza Verdi
  tables: [[20.6, 79.2], [23.2, 79.2], [26.0, 79.2], [10.2, 79.2], [12.8, 79.2], [-1.0, 60.5], [1.6, 62.8], [-2.2, 65.4]],
  // bike rows [x0, x1, z] along the arcade edge of Via Zamboni (gaps at the columns)
  bikes: [[-25.4, -14.6, 51.75], [23.0, 29.6, 51.75]],
  // the Teatro's steps against the arcade wall [x0, z0, x1, z1]
  steps: [10.7, 60, 11.6, 65.6],
};

// ground-floor openings of every street face: { x, z, yaw (outward), kind: 'door' | 'shop', b }
export function groundSlots(b) {
  const out = [];
  if (b.kind === 'petronio') return out;
  const g = groundRectN(b);
  for (const f of b.faces) {
    const [x0, z0, x1, z1] = g; // ground-floor facade (an adjacent arcade's opening stays open)
    const u0 = f === 'n' || f === 's' ? x0 : z0, u1 = f === 'n' || f === 's' ? x1 : z1, fl = u1 - u0;
    const n = Math.max(1, Math.floor(fl / 4.2));
    for (let i = 0; i < n; i++) {
      const u = u0 + fl * (i + 0.5) / n;
      const kind = (b.shop || b.kind) && i % 2 === 0 ? 'shop' : 'door';
      const p = f === 'n' ? [u, z1, 0] : f === 's' ? [u, z0, PI] : f === 'e' ? [x1, u, PI / 2] : [x0, u, -PI / 2];
      out.push({ x: p[0], z: p[1], yaw: p[2], kind, b: b.id, face: f });
    }
  }
  return out;
}

// anchors [x, z, yaw] for other modules (yaw = facing of someone standing there, 0 = +z)
export const NORD_ANCHORS = {
  voltone: [-5, 40, 0], zamboni: [-5, 49.5, PI / 2], zamboni_w: [-30, 49.5, PI / 2], zamboni_e: [24, 49.5, -PI / 2],
  piazza_verdi: [-3, 64, 0], teatro: [6.4, 63, PI / 2], teatro_steps: [10.2, 63, -PI / 2], universita: [-12.5, 62, -PI / 2],
  rizzoli: [0, 77, -PI / 2], rizzoli_w: [-30, 77, PI / 2], rizzoli_e: [26, 77, -PI / 2],
  piazza_maggiore: [-17, 86, 0], nettuno: [-15.4, 83.6, PI / 2 + 0.5], crescentone: [-17, 94, 0], san_petronio: [-18, 101.6, 0],
  accursio: [-28.4, 92, -PI / 2], podesta: [-2.2, 92, PI / 2],
  gelateria: [15.2, 81.6, 0], cantina: [24.5, 79, 0], osteria: [-31, 53.6, 0], libreria: [26, 53.6, 0],
  npc_zamboni_1: [-20, 53.6, PI / 2], npc_zamboni_2: [12, 49.2, -PI / 2], npc_verdi_1: [-6, 60, 0.6], npc_verdi_2: [3.5, 69, -2.3], npc_verdi_3: [-10, 70, 2.2],
  npc_maggiore_1: [-20, 86, 0.4], npc_maggiore_2: [-14, 96, -2.6], npc_rizzoli_1: [14, 77.5, -PI / 2],
};

// hooks for the other agents (data only): a drivable loop for MOTORI, doors for RP deliveries, a BR circle
export const NORD_HOOKS = {
  // closed loop (y = 0), checked against nordColliders() with a 0.9 m vehicle radius: Piazza Verdi -> Via Rizzoli
  // (east half) -> Piazza Maggiore (Podestà side, San Petronio, Accursio side) -> Via Rizzoli (west half) -> Piazza Verdi.
  // The two Rizzoli legs use disjoint x ranges, so the loop never crosses itself.
  raceLoop: [[-11.5, 58], [4, 58], [5, 71], [0, 76.8], [-6.2, 78.8], [-5.8, 82], [-5.8, 96], [-8, 101.4], [-26, 101.4], [-28, 98], [-28, 84], [-26, 77], [-12, 76.6], [-11, 70]],
  // doors (x, z, yaw of the courier facing the door; the courier stands 0.9 m in front)
  doors: [],
  brZone: { cx: -6, cz: 76, r: 34 },
};
for (const b of NB) for (const s of groundSlots(b)) if (s.kind === 'door') NORD_HOOKS.doors.push([+(s.x + Math.sin(s.yaw) * 0.9).toFixed(2), +(s.z + Math.cos(s.yaw) * 0.9).toFixed(2), +Math.atan2(Math.sin(s.yaw + PI), Math.cos(s.yaw + PI)).toFixed(3)]);

// static colliders (2D boxes/circles in level.colliders format) — buildings' ground floors, arcade columns,
// the Nettuno, the street furniture and the district edges; camera blockers for the buildings (x0,y0,z0,x1,y1,z1)
export function nordColliders() {
  const C = [], BL = [];
  const box = (x0, z0, x1, z1) => C.push({ type: 'box', min: [x0, z0], max: [x1, z1] });
  const blk = (x0, y0, z0, x1, y1, z1) => BL.push({ min: [x0, y0, z0], max: [x1, y1, z1] });
  for (const b of NB) {
    const g = groundRectN(b);
    if (b.kind === 'petronio') { box(g[0] - 1.2, g[1] - 1.0, g[2] + 1.2, g[3]); blk(g[0], 0, g[1] - 1.0, g[2], b.h + 8, g[3]); continue; } // pilasters + buttresses
    box(g[0], g[1], g[2], g[3]); blk(g[0], 0, g[1], g[2], b.h + 3, g[3]);
    if (b.portico) { // overhang above the arcade (camera stays below it) + columns
      const [x0, z0, x1, z1] = b.rect, p = b.portico, H = p.depth > 3.5 ? PORT_DEEP_H : ZAM.portH;
      if (p.side === 's') blk(x0, H, z0, x1, b.h + 3, z0 + p.depth); if (p.side === 'w') blk(x0, H, z0, x0 + p.depth, b.h + 3, z1);
      for (const c of columnsOf(b)) C.push({ type: 'circle', c: [c.x, c.z], r: 0.32 });
    }
  }
  // closing blocks at the ends of Via Zamboni / Via Rizzoli (outside the walkable area, solid for the camera)
  for (const [x0, z0, x1, z1, h] of END_BLOCKS) blk(x0, 0, z0, x1, h, z1);
  // Nettuno basin + the furniture
  C.push({ type: 'circle', c: [NETTUNO.x, NETTUNO.z], r: NETTUNO.r + 0.3 });
  for (const [x, z] of NORD_PROPS.lamps) C.push({ type: 'circle', c: [x, z], r: 0.2 });
  for (const [x, z] of NORD_PROPS.tables) C.push({ type: 'circle', c: [x, z], r: 0.85 });
  for (const [x0, x1, z] of NORD_PROPS.bikes) box(x0, z - 0.5, x1, z + 0.5);
  { const s = NORD_PROPS.steps; box(s[0], s[1], s[2], s[3]); }
  // district edges: west end of Via Zamboni / Via Rizzoli, east end of both
  box(NORD.x0 - 0.5, ZAM.z0, NORD.x0, ZAM.z1); box(NORD.x0 - 0.5, RIZ.z0, NORD.x0, RIZ.z1 + 3.4);
  box(NORD.x1, RIZ.z0, NORD.x1 + 0.5, RIZ.z1 + 3.4); box(NORD.x1, ZAM.z0, NORD.x1 + 0.5, ZAM.z1);
  return { C, BL };
}
// blocks closing the street ends [x0, z0, x1, z1, h, colour] (meshes in nord.js)
export const END_BLOCKS = [[-44, 44, -36, 56, 13, '#d79a72'], [-44, 72, -36, 82, 14, '#e0b77c'], [30, 78, 36, 86, 12, '#c9704a']];

export function groundRectN(b) {
  const [x0, z0, x1, z1] = b.rect; const p = b.portico; if (!p) return [x0, z0, x1, z1];
  if (p.side === 's') return [x0, z0 + p.depth, x1, z1];
  if (p.side === 'w') return [x0 + p.depth, z0, x1, z1];
  if (p.side === 'n') return [x0, z0, x1, z1 - p.depth];
  return [x0, z0, x1 - p.depth, z1];
}
// arcade columns of a portico building (world positions, every bay)
export function columnsOf(b) {
  const p = b.portico; if (!p) return [];
  const [x0, z0, x1, z1] = b.rect, out = [];
  if (p.side === 's') { const n = Math.max(1, Math.round((x1 - x0) / 3.6)), bay = (x1 - x0) / n; for (let i = 0; i <= n; i++) out.push({ x: x0 + i * bay, z: z0 + 0.3, bay, n, i }); }
  else if (p.side === 'w') { const n = Math.max(1, Math.round((z1 - z0) / 3.6)), bay = (z1 - z0) / n; for (let i = 0; i <= n; i++) out.push({ x: x0 + 0.3, z: z0 + i * bay, bay, n, i }); }
  return out;
}

// sanity check of the race loop against the colliders (dev: node -e "import('./src/quartiere/nord_layout.js').then(m=>console.log(m.checkLoop()))")
export function checkLoop(r = 0.9) {
  const { C } = nordColliders(); const L = NORD_HOOKS.raceLoop; const bad = [];
  for (let i = 0; i < L.length; i++) {
    const a = L[i], b = L[(i + 1) % L.length];
    for (let t = 0; t <= 1; t += 0.02) {
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      for (const c of C) {
        const hit = c.type === 'circle' ? Math.hypot(x - c.c[0], z - c.c[1]) < c.r + r
          : x > c.min[0] - r && x < c.max[0] + r && z > c.min[1] - r && z < c.max[1] + r;
        if (hit) { bad.push([i, +x.toFixed(1), +z.toFixed(1), c.type === 'circle' ? c.c : [c.min, c.max]]); break; }
      }
    }
  }
  return bad;
}
