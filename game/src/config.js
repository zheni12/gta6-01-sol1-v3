// config.js — every shared constant for SOLMAR HEAT: the island, its districts,
// its people and its rules. Other modules import from here and nowhere else
// for tuning values, so the whole game can be rebalanced from this one file.

// ---------------------------------------------------------------------------
// World geometry. The island is a square landmass centred on the origin.
// Avenues run north-south (constant x), streets run east-west (constant z).
// ---------------------------------------------------------------------------
export const WORLD = {
  islandHalf: 620,          // land reaches from -620 to +620 on both axes
  seaLevel: -1.6,           // y of the water surface
  groundY: 0,               // y of the city ground plane
  roadWidth: 26,            // asphalt width of every avenue and street
  sidewalkWidth: 5,         // pavement border around each block
  avenues: [-440, -220, 0, 220, 440],   // x positions of north-south roads
  streets: [-440, -220, 0, 220, 440],   // z positions of east-west roads
  roadReach: 596,           // roads run from -596 to +596
  beachZ: 470,              // the Strand: sand from here to the south shore
  shoreZ: 612,              // sand meets water here on the south edge
  marinaX: 470,             // the Marina: piers from here to the east shore
};

// The five districts, as rectangles on the map with a tint for the minimap,
// a skyline profile for the world builder and a friendliness flag that the
// career checklist reads once the player has worked in the district.
export const DISTRICTS = [
  { id: 'strand',   name: 'The Strand',  rect: [-620, 330, 620, 620],   tint: '#e8c877', minH: 6,  maxH: 14, palms: true  },
  { id: 'market',   name: 'Old Market',  rect: [-620, -330, -160, 330], tint: '#d98d5f', minH: 8,  maxH: 20, palms: false },
  { id: 'downtown', name: 'Downtown',    rect: [-160, -330, 300, 330],  tint: '#7f9fc4', minH: 22, maxH: 52, palms: false },
  { id: 'marina',   name: 'Marina',      rect: [300, -330, 620, 330],   tint: '#6fb7a5', minH: 6,  maxH: 16, palms: true  },
  { id: 'heights',  name: 'The Heights', rect: [-620, -620, 620, -330], tint: '#9a86c8', minH: 14, maxH: 34, palms: false },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    const [x0, z0, x1, z1] = d.rect;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return d;
  }
  return DISTRICTS[2];
}

// ---------------------------------------------------------------------------
// People. The player, the fixer who employs him and the three-person crew
// whose abilities ride on the Q, R and C keys.
// ---------------------------------------------------------------------------
export const PLAYER_NAME = 'Ren Kadir';
export const FIXER_NAME = 'Madame Okafor';

export const CREW = [
  { id: 'mira', name: 'Mira Solano',     role: 'Driver',   key: 'KeyQ', keyLabel: 'Q',
    ability: 'Ghost Plates', cooldown: 45,
    blurb: 'Swaps the plates and breaks police lock-on: wanted stars stop rising and the heat fades twice as fast while it lasts.' },
  { id: 'theo', name: 'Theo Lindqvist', role: 'Mechanic', key: 'KeyR', keyLabel: 'R',
    ability: 'Quick Fix', cooldown: 40,
    blurb: 'Patches the current car back to full health in three seconds, even rolling.' },
  { id: 'kiki', name: 'Kiki Amara',      role: 'Lookout',  key: 'KeyC', keyLabel: 'C',
    ability: 'Eyes Out', cooldown: 35,
    blurb: 'Calls out every golden star and every police unit on the minimap for twelve seconds.' },
];

// ---------------------------------------------------------------------------
// Vehicles. One entry per body style the traffic system can spawn; the hero
// coupe the first mission steals is the 'solmar' in its signature teal.
// ---------------------------------------------------------------------------
export const CAR_MODELS = [
  { id: 'solmar',  name: 'Solmar Coupe',  length: 4.4, width: 1.9, height: 1.15, topSpeed: 46, accel: 22, colors: [0x0fa3a3, 0xc23b2e, 0x2e5fc2, 0xe0a51c] },
  { id: 'hatch',   name: 'Pico Hatch',    length: 3.7, width: 1.7, height: 1.35, topSpeed: 36, accel: 17, colors: [0xb8bcc2, 0x707880, 0x8fb573, 0xd9d3c3] },
  { id: 'sedan',   name: 'Meridian Sedan', length: 4.8, width: 1.9, height: 1.3, topSpeed: 40, accel: 19, colors: [0x30343c, 0x5a2e35, 0x274156, 0xcfd4d8] },
  { id: 'van',     name: 'Cargo Van',     length: 5.2, width: 2.0, height: 2.0, topSpeed: 33, accel: 14, colors: [0xe8e8e6, 0x9db3c4, 0xc9a86a] },
  { id: 'pickup',  name: 'Dune Pickup',   length: 5.0, width: 2.0, height: 1.6, topSpeed: 38, accel: 18, colors: [0x7a4a21, 0x4a6741, 0x884444] },
  { id: 'taxi',    name: 'Solmar Cab',    length: 4.7, width: 1.9, height: 1.35, topSpeed: 39, accel: 18, colors: [0xf2b21b] },
];

export const TRAFFIC_COUNT = 32;
export const PARKED_COUNT = 38;
export const PED_COUNT = 60;
export const STAR_COUNT = 20;

// Police unit roster. The response panel names these; roles are what the
// unit actually does in police.js.
export const POLICE_UNITS = [
  { call: 'KESTREL-1', role: 'Pursuit lead' },
  { call: 'OTTER-2',   role: 'Flanker' },
  { call: 'VIPER-4',   role: 'Interceptor' },
  { call: 'PALMA-3',   role: 'Flanker' },
  { call: 'CONDOR-EYE', role: 'Helicopter' },
  { call: 'BLOCKADE',  role: 'Roadblock' },
  { call: 'FOOT-1',    role: 'Foot officer' },
  { call: 'FOOT-2',    role: 'Foot officer' },
];

// Weapons. Fists are always carried; the two firearms are picked up in the
// Old Market during mission four and kept afterwards.
export const WEAPONS = [
  { id: 'fists',   name: 'Fists',      slot: '1', damage: 34, range: 2.2,  cooldown: 0.34, spread: 0,    pellets: 1, tracer: false },
  { id: 'kestrel', name: 'Kestrel-9',  slot: '2', damage: 26, range: 90,  cooldown: 0.22, spread: 0.012, pellets: 1, tracer: true },
  { id: 'brute',   name: 'Brute SG',   slot: '3', damage: 13, range: 42,  cooldown: 0.85, spread: 0.06,  pellets: 6, tracer: true },
];

// Rank ladder by lifetime RP. The HUD bar fills toward the next rung.
export const RANKS = [
  { rp: 0,    name: 'Errand Runner' },
  { rp: 150,  name: 'Courier' },
  { rp: 400,  name: 'Wheelman' },
  { rp: 800,  name: 'Smuggler' },
  { rp: 1400, name: 'Fixer’s Hand' },
  { rp: 2300, name: 'Bay Operator' },
  { rp: 3600, name: 'Solmar Heat' },
];

// The seven story missions, in chain order. Dialogue and staging live in
// missions.js; this table is the shared spine (ids, titles, rewards, medals).
export const STORY_MISSIONS = [
  { id: 'first-wheels', title: 'First Wheels',   act: 'Act I — First Wheels',   cash: 400,  rp: 60,  goldTime: 150 },
  { id: 'parcel-run',   title: 'Parcel Run',     act: 'Act I — First Wheels',   cash: 650,  rp: 90,  goldTime: 240 },
  { id: 'vanish',       title: 'Vanish',         act: 'Act II — Heat',          cash: 800,  rp: 120, goldTime: 200 },
  { id: 'rival-wreck',  title: 'Rival Wreck',    act: 'Act II — Heat',          cash: 950,  rp: 140, goldTime: 240 },
  { id: 'harbor-sprint', title: 'Harbor Sprint', act: 'Act III — The Sprint',   cash: 1200, rp: 170, goldTime: 170 },
  { id: 'night-run',    title: 'Night Run',      act: 'Act III — The Sprint',   cash: 1400, rp: 200, goldTime: 210 },
  { id: 'marina-job',   title: 'The Marina Job', act: 'Act IV — Open Water',    cash: 2500, rp: 320, goldTime: 300 },
];

// Save slots and storage keys.
export const SAVE_KEY_PREFIX = 'solmar-heat-save-';
export const SAVE_SLOTS = 3;

// Day cycle: one full day is ten minutes of play; dawn 6:00, dusk 19:00.
export const DAY_LENGTH_SECONDS = 600;
export const START_HOUR = 9.5;

// Wanted tuning.
export const WANTED = {
  decayPerSecond: 0.011,       // stars fade when unseen
  decayGhostPerSecond: 0.024,  // faster while Ghost Plates is active
  bustFillRate: 0.30,          // BUSTED meter per second at point blank
  bustDrainRate: 0.45,
  bustRange: 16,
};
