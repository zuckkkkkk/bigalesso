// quartiere/layout.js — the neighbourhood as DATA (no three.js meshes): zones, buildings, interiors, anchors.
// Everything here exists from frame 0 (colliders, zones, anchors for other modules); meshes are built lazily.
//
// World axes: +z = "north" (the garden fence is at z=20, the street beyond it), yaw 0 faces +z
// (explore.js fwdOf(y) = (sin y, 0, cos y)). The gulag set lives at x 30..42, z 0..12 (y=0): nothing goes there.
//
//   Via Teletubbylandia  x -36..40, z 20..33.6   (far side under porticoes z 29.4..33.6)
//   Piazzetta            x 40..50,  z 20..33.6   (edicola, benches, trees)
//   Via Petroni          x 40..48,  z 33.6..78   (porticoes both sides, nightlife, Bellazzi)
//   Millennium           x 36..52,  z 78..92     (club, door on the south wall)
//   Checkpoint           x -46..-36, z 20..33.6  ("zona demilitarizzata")
//   Teletubbylandia      x -96..-46, z 6..50     (meadow in a ring of hills)
//   Celtic / Sushi / Casa di Ashish (Discord): far side, doors under the portico
//   Casa di Seghino (zombata): near side west, door on the street (z=20)

export const GATE = { x0: 12.4, x1: 13.8, z: 20 }; // opening in the garden fence (world.js fenceRuns)

// world.js flattens the distant hills and skips distant trees inside these rects (x0, z0, x1, z1)
export const RESERVED = [[-142, -22, -30, 100], [-36, 4, 64, 100]];

// world.js treats these zones as outdoor (sun/sky lighting like the garden)
export const OUTDOOR_ZONES = new Set(['Via Teletubbylandia', 'Piazzetta', 'Via Petroni', 'Checkpoint', 'Teletubbylandia']);

export const ST = { x0: -36, x1: 40, zNear: 20, curbNear: 22.6, curbFar: 29.4, colZ: 29.4, zFar: 33.6, portH: 4.4, bay: 3.6 };
export const PET = { x0: 40, x1: 48, z0: 33.6, z1: 78, colW: 42.5, colE: 45.5, portH: 4.2 };
export const MEADOW = { x0: -96, z0: 6, x1: -46, z1: 50 };
export const CHECK = { x0: -46, z0: 20, x1: -36, z1: 33.6 };
export const PIAZZA = { x0: 40, z0: 20, x1: 50, z1: 33.6 };
// calcetto cage in Teletubbylandia (src/sport): play area x0..x1 (goal lines) × z0..z1 (side boards), goal mouths
// protrude goalD outward; gate = opening in the south boards [x from, x to]; flowers/rabbits keep out of rect+0.6
export const PITCH = { x0: -71, z0: 34, x1: -53, z1: 45, cx: -62, cz: 39.5, goalW: 3, goalH: 2, goalD: 1.2, gate: [-58.1, -56.5], board: 1.0, net: 3.4 };

// face: side of the building that faces the street: 'n' (+z), 's' (-z), 'e' (+x), 'w' (-x)
// portico: the ground floor is set back (upper floors overhang the sidewalk) — far row and Petroni
// door: position along the facade (x for n/s, z for e/w); house: friend id (knock / NPC home)
export const BUILDINGS = [
  // near side, west of the garden (facade z=20, facing +z / the street)
  { id: 'w1', rect: [-36, 6, -29, 20], h: 13, col: '#d9a05a', face: 'n', door: -32.5, house: 'parme' },
  { id: 'w2', rect: [-29, 6, -22, 20], h: 15, col: '#c4643c' , face: 'n', door: -25.5, shop: 'FERRAMENTA' },
  { id: 'w3', rect: [-22, 6, -16, 20], h: 12, col: '#e0a8a0', face: 'n', door: -19 },
  { id: 'w4', rect: [-16, 6, -8, 20], h: 11, col: '#e8c46a', face: 'n', door: -12, house: 'seghino', interior: 'seghino' },
  { id: 'w5', rect: [-8, 6, -4.6, 20], h: 10, col: '#b5523a', face: 'n', door: -6.3, brick: true },
  // near side, east of the garden (the gulag set x 30..42 z 0..12 stays clear: shallow blocks there)
  { id: 'e1', rect: [16.2, 6, 22, 20], h: 12, col: '#cf8a4e', face: 'n', door: 19.1, house: 'forla' },
  { id: 'e2', rect: [22, 6, 27.5, 20], h: 14, col: '#e6bf7a', face: 'n', door: 24.75, house: 'asche' },
  { id: 'e3', rect: [27.5, 14.5, 34, 20], h: 11, col: '#c9704a', face: 'n', door: 30.7, shop: 'PANIFICIO' },
  { id: 'e4', rect: [34, 14.5, 40, 20], h: 13, col: '#ddb36a', face: 'n', door: 37 },
  { id: 'e5', rect: [40, 14.5, 45, 20], h: 12, col: '#b95f43', face: 'n', door: 42.5, brick: true },
  { id: 'e6', rect: [45, 6, 50, 20], h: 15, col: '#e2a46b', face: 'n', door: 47.5 },
  // piazzetta, east side (facade x=50, facing -x)
  { id: 'p1', rect: [50, 6, 62, 33.6], h: 16, col: '#d49556', face: 'w', door: 27, shop: 'FARMACIA' },
  // far side of Via Teletubbylandia (portico z 29.4..33.6, ground floor facade at z=33.6, facing -z)
  { id: 'f1', rect: [-36, 29.4, -26, 46], h: 14, col: '#dba25e', face: 's', portico: true, door: -31 },
  { id: 'f2', rect: [-26, 29.4, -18, 46], h: 13, col: '#c86e48', face: 's', portico: true, door: -22, house: 'ashish', interior: 'ashish' },
  { id: 'f3', rect: [-18, 29.4, -8, 46], h: 15, col: '#e7c98a', face: 's', portico: true, door: -13, shop: 'TABACCHI' },
  { id: 'f4', rect: [-8, 29.4, -2, 46], h: 12, col: '#d88f6a', face: 's', portico: true, door: -5 },
  { id: 'f5', rect: [-2, 29.4, 8, 46], h: 14, col: '#c9884c', face: 's', portico: true, door: 3, interior: 'celtic' },
  { id: 'f6', rect: [8, 29.4, 18, 46], h: 13, col: '#e3b06e', face: 's', portico: true, door: 13, shop: 'ALIMENTARI' },
  { id: 'f7', rect: [18, 29.4, 28, 46], h: 15, col: '#d79a72', face: 's', portico: true, door: 23, interior: 'sushi' },
  { id: 'f8', rect: [28, 29.4, 34, 46], h: 12, col: '#be6a44', face: 's', portico: true, door: 31, house: 'lombu' },
  { id: 'f9', rect: [34, 29.4, 40, 46], h: 14, col: '#e0b77c', face: 's', portico: true, door: 37 },
  // Via Petroni, west side (facade x=40 facing +x, portico x 40..42.5) and east side (facade x=48 facing -x, portico x 45.5..48)
  { id: 'pw1', rect: [30, 46, 42.5, 56], h: 14, col: '#d3874e', face: 'e', portico: true, door: 51, shop: 'KEBAB' },
  { id: 'pw2', rect: [30, 56, 42.5, 66], h: 12, col: '#c25c3a', face: 'e', portico: true, door: 61, shop: 'BIRRA BELLAZZI', bar: true },
  { id: 'pw3', rect: [30, 66, 42.5, 78], h: 15, col: '#deb070', face: 'e', portico: true, door: 72, shop: 'BAR' },
  { id: 'pe1', rect: [45.5, 33.6, 62, 46], h: 13, col: '#e2b884', face: 'w', portico: true, door: 40, shop: 'PIZZA' },
  { id: 'pe2', rect: [45.5, 46, 62, 58], h: 15, col: '#c97a50', face: 'w', portico: true, door: 52, shop: 'PUB', bar: true },
  { id: 'pe3', rect: [45.5, 58, 62, 78], h: 12, col: '#dca56a', face: 'w', portico: true, door: 68, shop: 'COCKTAIL BAR', bar: true },
  // Millennium (club) closing Via Petroni
  { id: 'mil', rect: [36, 78, 52, 92], h: 9, col: '#1a1a22', face: 's', door: 44, interior: 'millennium', club: true },
];

// walkable interiors: rect (x0,z0,x1,z1), ceiling height, the building they live in, door gap on its front wall
export const INTERIORS = {
  celtic: { name: 'Celtic', rect: [-1.7, 33.9, 7.7, 43.7], ceil: 3.6, b: 'f5', door: [2.2, 3.8], zone: [-1.7, 33.6, 7.7, 43.7] },
  sushi: { name: 'Sushi', rect: [18.3, 33.9, 27.7, 43.7], ceil: 3.4, b: 'f7', door: [22.2, 23.8], zone: [18.3, 33.6, 27.7, 43.7] },
  ashish: { name: 'Casa di Ashish', rect: [-25.7, 33.9, -18.3, 41.7], ceil: 3.0, b: 'f2', door: [-22.6, -21.4], zone: [-25.7, 33.6, -18.3, 41.7] },
  seghino: { name: 'Casa di Seghino', rect: [-15.7, 6.3, -8.3, 19.7], ceil: 3.0, b: 'w4', door: [-12.6, -11.4], zone: [-15.7, 6.3, -8.3, 20] },
  millennium: { name: 'Millennium', rect: [36.3, 78.3, 51.7, 91.7], ceil: 6.5, b: 'mil', door: [42.4, 45.6], zone: [36.3, 78, 51.7, 91.7] },
};

export const ZONES = [
  ...Object.values(INTERIORS).map(i => ({ name: i.name, rect: i.zone, indoor: true })),
  { name: 'Via Teletubbylandia', rect: [ST.x0, ST.zNear, ST.x1, ST.zFar] },
  { name: 'Piazzetta', rect: [PIAZZA.x0, PIAZZA.z0, PIAZZA.x1, PIAZZA.z1] },
  { name: 'Via Petroni', rect: [PET.x0, PET.z0, PET.x1, PET.z1] },
  { name: 'Checkpoint', rect: [CHECK.x0, CHECK.z0, CHECK.x1, CHECK.z1] },
  { name: 'Teletubbylandia', rect: [MEADOW.x0, MEADOW.z0, MEADOW.x1, MEADOW.z1] },
];

export const BOUNDS = { x0: -96, x1: 62, z1: 92 }; // level.bounds grows to these (z0 stays 0)

// friends' houses: door anchors on the street side (stand here, facing the door)
const HOUSE_NAMES = { parme: 'Parme', seghino: 'Seghino', forla: 'Forla', asche: 'Asche', ashish: 'Ashish', lombu: 'Lombu' };
export const HOUSES = BUILDINGS.filter(b => b.house).map(b => ({ id: b.house, name: HOUSE_NAMES[b.house] || b.house, b: b.id, enterable: !!b.interior }));

// anchors: [x, z, yaw] — yaw is the facing of someone standing there (0 = +z)
const PI = Math.PI;
export const ANCHORS = {
  gate: [13.1, 19.3, 0], street: [13.1, 21.4, 0], piazzetta: [45, 27, 0], petroni: [44, 50, 0], edicola: [44.3, 22.9, PI],
  celtic: [3, 35.0, 0], celtic_bar: [3, 41.5, 0], celtic_darts: [-0.4, 38.2, -PI / 2], celtic_door: [3, 32.6, 0],
  sushi: [23, 35.0, 0], sushi_conveyor: [23, 37.15, 0], sushi_door: [23, 32.6, 0],
  discord: [-18.75, 38.2, PI / 2], ashish_room: [-22, 36.5, 0],
  zombata: [-13.6, 6.62, 0], seghino_room: [-12, 17.5, PI],
  millennium: [44, 79.6, 0], millennium_floor: [44, 84.2, 0], millennium_dj: [44, 90.5, PI], millennium_door: [44, 76.8, 0],
  bellazzi: [41.4, 61, -PI / 2],
  checkpoint: [-41, 26.5, -PI / 2], teletubby: [-71, 28, 0],
  zombie_spawn_1: [-90, 12, PI / 4], zombie_spawn_2: [-90, 44, 3 * PI / 4], zombie_spawn_3: [-52, 46, -3 * PI / 4], zombie_spawn_4: [-60, 10, -PI / 4],
  npc_street_1: [-28, 21.5, PI / 2], npc_street_2: [-8, 31.4, -PI / 2], npc_street_3: [6, 21.4, PI / 2], npc_street_4: [16, 31.6, PI / 2],
  npc_street_5: [30, 21.5, -PI / 2], npc_street_6: [-20, 31.6, PI / 2], npc_piazzetta_1: [47, 24.5, -PI / 2], npc_piazzetta_2: [42.5, 30.5, PI],
  npc_petroni_1: [41.4, 52, PI / 2], npc_petroni_2: [46.6, 58.5, -PI / 2], npc_petroni_3: [41.4, 64, PI / 2], npc_petroni_4: [46.7, 70, -PI / 2],
  npc_celtic_1: [5.6, 41.3, 0], npc_celtic_2: [0.8, 36.4, PI / 2], npc_sushi_1: [25, 37.15, 0], npc_millennium_1: [42.6, 85, 0.4], npc_millennium_2: [45.4, 83.4, -0.6],
  npc_teletubby_1: [-66, 24, PI], npc_teletubby_2: [-78, 34, PI / 2],
};
for (const b of BUILDINGS) if (b.house) {
  const [x0, z0, x1, z1] = b.rect;
  if (b.face === 'n') ANCHORS['house_' + b.house] = [b.door, z1 + 0.9, PI];
  else if (b.face === 's') ANCHORS['house_' + b.house] = [b.door, (b.portico ? ST.zFar : z0) - 0.9, 0];
}
