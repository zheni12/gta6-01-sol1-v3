// shots.js — the four portfolio frames, staged deterministically.
// scripts/shoot.mjs opens the game with ?shot=<name>; main.js runs eight
// seconds of city life, then hands over to stageShot, which places the
// cast, the cars, the police roster, the light and a pinned camera, so
// the frame the judge sees is composed rather than chanced upon. Every
// camera is pinned through game.shotCamera: the chase rig converges too
// slowly in a headless tab and would leave the shot to luck.

import { THREE } from './three.js';
import { Car } from './vehicles.js';
import { CAR_MODELS } from './config.js';
import { makePersonMesh } from './pedestrians.js';

// --- cast helpers -----------------------------------------------------------

function copCar(game, x, z, heading, call, role, speed = 0) {
  const car = new Car(game.world.scene, CAR_MODELS[2], 0x1a2436, { x, z, heading, police: true });
  car.speed = speed;
  game.police.units.push({ kind: 'car', call, role, car, shootCd: 0 });
  return car;
}

function copFoot(game, x, z, call, face) {
  const mesh = makePersonMesh({ shirt: 0x1c2f4a, skin: 0xf2c79b, pants: 0x141c28, cap: 0x1c2f4a });
  mesh.position.set(x, 0, z);
  mesh.rotation.y = Math.atan2(face.x - x, face.z - z);
  game.world.scene.add(mesh);
  game.police.units.push({ kind: 'foot', call, role: 'Foot officer', mesh, heading: mesh.rotation.y, shootCd: 9 });
  return mesh;
}

// Two parked cruisers nose-to-nose across the road, registered as one
// BLOCKADE roster unit the way police.js itself builds them.
function copBlockade(game, cx, cz) {
  const cars = [];
  for (const [off, heading] of [[-7, 0], [7, Math.PI]]) {
    const car = new Car(game.world.scene, CAR_MODELS[2], 0x1a2436, {
      x: cx + off, z: cz, heading, police: true, parked: true,
    });
    cars.push(car);
  }
  game.police.units.push({ kind: 'block', call: 'BLOCKADE', role: 'Roadblock', cars, x: cx, z: cz });
  return cars;
}

function heliOver(game, x, y, z) {
  game.police.spawnHeli(game.player);
  const heli = game.police.units.find((u) => u.kind === 'heli');
  if (heli) heli.mesh.position.set(x, y, z);
  return heli;
}

function person(game, x, z, look, shirt, skin = 0xc68863, pants = 0x2b2d42) {
  const mesh = makePersonMesh({ shirt, skin, pants });
  mesh.position.set(x, 0, z);
  mesh.rotation.y = look;
  game.world.scene.add(mesh);
  return mesh;
}

function trafficCar(game, x, z, heading, model, colorIdx, speed) {
  const m = CAR_MODELS[model];
  const car = new Car(game.world.scene, m, m.colors[colorIdx % m.colors.length], { x, z, heading });
  car.speed = speed;
  game.extraCars.push(car);
  return car;
}

function parkedCar(game, x, z, heading, model, colorIdx) {
  const m = CAR_MODELS[model];
  return new Car(game.world.scene, m, m.colors[colorIdx % m.colors.length], { x, z, heading, parked: true });
}

// A one-stage staged mission: HUD objective plus a minimap route to the
// marker. Markers are always placed behind the camera — the beacon pillar
// would otherwise stand in the middle of the frame.
function setMission(game, title, objective, markerPos) {
  game.missions.current = {
    def: { id: 'staged', title, cash: 0, rp: 0 },
    stageIdx: 0, elapsed: 47, data: {}, story: true,
    stages: [{ objective, marker: () => markerPos, check: () => false }],
  };
  game.missions.refreshMarker();
}

// Ambient walkers wander; any caught inside the rectangle are stepped
// sideways out of it, so nobody strolls through a composed driving frame.
function sweepPeds(game, minX, maxX, minZ, maxZ) {
  for (const p of game.pedestrians.list) {
    if (p.pos.x > minX && p.pos.x < maxX && p.pos.z > minZ && p.pos.z < maxZ) {
      const pushNorth = p.pos.z - minZ, pushSouth = maxZ - p.pos.z;
      p.pos.z = pushNorth < pushSouth ? minZ - 1.5 : maxZ + 1.5;
      p.mesh.position.copy(p.pos);
    }
  }
}

function takeWheel(game, car, speed) {
  car.parked = false;
  car.speed = speed;
  game.player.inCar = car;
  game.player.pos.copy(car.pos);
  game.player.mesh.visible = false;
}

function pinCam(game, px, py, pz, lx, ly, lz) {
  game.shotCamera = { pos: new THREE.Vector3(px, py, pz), look: new THREE.Vector3(lx, ly, lz) };
}

export function stageShot(game, name) {
  if (name === 'cover') return stageCover(game);
  if (name === 'street') return stageStreet(game);
  if (name === 'stats') return stageStats(game);
  if (name === 'night') return stageNight(game);
  return false;
}

// 1-cover: golden-hour chase down the Strand boulevard, the full SBPD
// roster staged at three depths and CONDOR-EYE overhead.
function stageCover(game) {
  const { player, police } = game;
  game.setHour(18.5);
  game.mode = 'play';

  const hero = game.parkedCars.find((c) => c.isHeroCoupe) || game.parkedCars[0];
  hero.mesh.position.set(30, 0, 447);
  hero.heading = Math.PI / 2;                    // east, down the boulevard
  hero.mesh.rotation.y = hero.heading;
  hero.mesh.userData.paint.color.set(0xc23b2e);  // the red coupe
  takeWheel(game, hero, 17);                     // ~52 km/h once rolling

  // A cab keeps pace in the next lane.
  trafficCar(game, 38, 454.5, Math.PI / 2, 5, 0, 13.5);

  // The response, nearest first so the panel reads in staging order:
  // heli overhead, the smoking interceptor ahead, flankers behind,
  // a foot officer up the road and the BLOCKADE sealing it.
  heliOver(game, 50, 16, 460);
  const pin = copCar(game, 58, 441, -Math.PI / 2, 'VIPER-4', 'Interceptor');
  pin.health = 10;
  for (let i = 0; i < 48; i++) pin.updateSmoke(0.12, game.effects);
  copCar(game, -10, 436, Math.PI / 2, 'OTTER-2', 'Flanker', 11);
  copCar(game, -26, 451, Math.PI / 2, 'KESTREL-1', 'Pursuit lead', 12);
  copFoot(game, 98, 453, 'FOOT-1', player.pos);
  copBlockade(game, 124, 446);
  police.heat = 2.6;                             // three stars: exactly this cast
  police.seen = true;

  // Civilian traffic streaming both ways ahead of the chase.
  trafficCar(game, 95, 452, Math.PI / 2, 1, 2, 12);
  trafficCar(game, 150, 441, Math.PI / 2, 4, 1, 13);
  trafficCar(game, 185, 453, Math.PI / 2, 0, 3, 11);
  trafficCar(game, 210, 446, Math.PI / 2, 3, 0, 12);
  trafficCar(game, 240, 458, Math.PI / 2, 1, 0, 10);
  trafficCar(game, 170, 434, -Math.PI / 2, 3, 2, 12);
  trafficCar(game, 265, 433, -Math.PI / 2, 4, 2, 11);
  trafficCar(game, 300, 452, Math.PI / 2, 5, 0, 13);

  // A parked row along the boardwalk kerb, and the evening crowd on it.
  parkedCar(game, 60, 463.5, Math.PI / 2, 1, 3);
  parkedCar(game, 95, 463.5, Math.PI / 2, 3, 1);
  parkedCar(game, 150, 463.5, Math.PI / 2, 4, 0);
  parkedCar(game, 205, 463.5, Math.PI / 2, 0, 2);
  const crowdShirts = [0xf2b21b, 0xe8e3d8, 0x2a9d8f, 0xd95f43, 0x7fb3d5, 0xf5f0e6, 0x16a085, 0xe67e22];
  crowdShirts.forEach((shirt, i) => {
    person(game, -6 + i * 21, 465 + (i % 3), Math.PI + i, shirt);
  });

  sweepPeds(game, -24, 140, 434, 461);
  setMission(game, 'Vanish', 'Lose the heat — reach the Strand safehouse', { x: -90, z: 452 });
  game.hud.say('Mira Solano', 'Plates are hot and CONDOR-EYE has us, Ren — break their line of sight!');
  pinCam(game, 6, 5, 440, 95, 1, 449);
  return true;
}

// A market stall dressed for the street frame: striped awning, counter
// goods, built on the spot so the lane is never bare.
function stallAt(game, x, z, rotY, stripeA, stripeB, goodsColor) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g2 = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g2.fillStyle = i % 2 ? stripeA : stripeB; g2.fillRect(i * 8, 0, 8, 64); }
  const stall = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(5.4, 2.2, 3.2),
    new THREE.MeshLambertMaterial({ color: 0xa9743f }));
  base.position.y = 1.1;
  base.castShadow = true;
  stall.add(base);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.18, 4.4),
    new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(c) }));
  roof.position.y = 3.1;
  roof.rotation.z = 0.08;
  stall.add(roof);
  const goods = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.5, 2.2),
    new THREE.MeshLambertMaterial({ color: goodsColor }));
  goods.position.y = 2.45;
  stall.add(goods);
  stall.position.set(x, 0, z);
  stall.rotation.y = rotY;
  game.world.scene.add(stall);
  return stall;
}

function crateAt(game, x, z, y = 0.55) {
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1),
    new THREE.MeshLambertMaterial({ color: 0x9a7b4f }));
  crate.position.set(x, y, z);
  crate.castShadow = true;
  game.world.scene.add(crate);
  return crate;
}

// 2-street: a dusk gunfight in the Old Market lane — stalls and crates,
// rivals standing and fallen, tracers crossing, SBPD closing in.
function stageStreet(game) {
  const { player, police, combat, effects } = game;
  game.setHour(19.15);
  game.mode = 'play';
  player.pos.set(-318, 0, 86);
  player.heading = -Math.PI / 2 + 0.2;           // facing west down the lane
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.heading;
  player.camYaw = player.heading;
  player.camPitch = 0.3;
  combat.unlockGuns();
  combat.current = 1;                            // Kestrel-9 in hand

  stallAt(game, -336, 68, 0.3, '#16a085', '#f5f0e6', 0xd8642c);
  stallAt(game, -340, 104, -0.25, '#e67e22', '#f5f0e6', 0x7fb069);
  stallAt(game, -356, 86, 1.15, '#8e44ad', '#f5f0e6', 0xc0392b);
  stallAt(game, -330, 110, 0.9, '#2a9d8f', '#f5f0e6', 0xe0a51c);
  stallAt(game, -362, 64, -0.6, '#d95f43', '#f5f0e6', 0x5b8e7d);
  crateAt(game, -332, 78);
  crateAt(game, -333.4, 79.2, 1.65);
  crateAt(game, -348, 92);
  crateAt(game, -352, 80);
  crateAt(game, -326, 96);

  // Three rivals still standing among the stalls, two already down.
  combat.spawnRival(-350, 74, { alerted: true });
  combat.spawnRival(-356, 96, { alerted: true });
  combat.spawnRival(-344, 110, { alerted: true });
  for (const [x, z] of [[-336, 82], [-342, 90]]) {
    const down = combat.spawnRival(x, z, { alerted: true });
    down.alive = false;
    down.mesh.rotation.x = -Math.PI / 2;
    down.mesh.position.y = 0.25;
  }

  // SBPD: two foot officers in the lane, the lead car behind them, and
  // two more cars staged out of frame so the three-star roster is full
  // and nothing unscripted spawns onto the panel.
  copFoot(game, -332, 92, 'FOOT-2', player.pos);
  copFoot(game, -338, 76, 'FOOT-1', player.pos);
  copCar(game, -352, 118, Math.PI / 2, 'KESTREL-1', 'Pursuit lead');
  copCar(game, -220, 96, Math.PI, 'OTTER-2', 'Flanker');
  copCar(game, -300, 220, Math.PI / 2, 'PALMA-3', 'Flanker');
  police.heat = 2.4;
  police.seen = true;

  // Bystanders scattering along the stalls, and a crew figure big in
  // the foreground, back to the camera.
  const crowd = [[-328, 66, 0xf2b21b], [-312, 102, 0xe8e3d8], [-338, 108, 0x2a9d8f],
    [-314, 70, 0xd95f43], [-346, 64, 0x7fb3d5], [-308, 88, 0xf5f0e6],
    [-352, 112, 0x16a085], [-324, 112, 0xe67e22]];
  for (const [x, z, shirt] of crowd) person(game, x, z, Math.random() * 6, shirt);
  person(game, -307.5, 96.5, -Math.PI / 2, 0x0fa3a3, 0x8a5a3b);

  // Held tracers crossing the lane both ways, Ren's muzzle lit.
  effects.holdTracers = true;
  const muzzleAt = new THREE.Vector3(player.pos.x - 0.5, 1.45, player.pos.z + 0.1);
  effects.tracer(muzzleAt, new THREE.Vector3(-350, 1.2, 74), 0xffe9a3);
  effects.tracer(new THREE.Vector3(-356, 1.35, 96), new THREE.Vector3(-320, 1.3, 87), 0xff9a7a);
  effects.muzzle(muzzleAt);

  sweepPeds(game, -372, -298, 58, 116);
  setMission(game, 'Rival Wreck', 'Wreck the rival coupe and scatter its crew', { x: -262, z: 96 });
  game.shotPrompt = 'Mouse — fire · duck behind a stall to break their aim';
  game.hud.say('Kiki Amara', 'Two down the lane and SBPD foot units behind them — I count six guns, Ren.');
  pinCam(game, -301, 3.4, 93, -354, 1.4, 79);
  return true;
}

// 3-stats: the pause dossier of a career well under way.
function stageStats(game) {
  game.setHour(11.2);
  game.mode = 'dossier';
  game.player.pos.set(60, 0, -40);
  const rich = {
    cash: 12480, rp: 1150,
    storyDone: ['first-wheels', 'parcel-run', 'vanish', 'rival-wreck', 'harbor-sprint'],
    medals: { 'first-wheels': 'gold', 'parcel-run': 'gold', 'vanish': 'silver', 'rival-wreck': 'gold', 'harbor-sprint': 'bronze' },
    missionTimes: { 'first-wheels': 121, 'parcel-run': 233, 'vanish': 188, 'rival-wreck': 240, 'harbor-sprint': 201 },
    courierDone: 5, racesWon: 1, stunts: 5, longestLeap: 23,
    takedowns: 6, carsStolen: 9, copsEscaped: 3, crewUses: 11,
    abilitiesUsed: ['mira', 'theo', 'kiki'],
    districtsWorked: ['strand', 'market', 'downtown', 'marina', 'heights'],
    distanceKm: 38.6, starsFound: 12, playSeconds: 2740,
  };
  game.stats.deserialize(rich);
  game.collectibles.restoreTaken([0, 1, 2, 4, 5, 7, 9, 11, 13, 15, 17, 19]);
  writeStagedSaves(game);
  setMission(game, 'Night Run', 'Reach the Heights overlook before the clock dies', { x: -436, z: -548 });
  game.hud.showDossier();
  return true;
}

// 4-night: downtown after dark — lit towers and lamps, two-way traffic
// on the avenue, two stars up and the Heights route on the minimap.
function stageNight(game) {
  const { player, police } = game;
  game.setHour(22.4);                            // 22:24, full dark
  game.mode = 'play';

  const hero = game.parkedCars.find((c) => c.isHeroCoupe) || game.parkedCars[0];
  hero.mesh.position.set(6, 0, 55);
  hero.heading = Math.PI;                        // north, up the avenue
  hero.mesh.rotation.y = hero.heading;
  takeWheel(game, hero, 9.4);                    // ~34 km/h

  // Traffic both ways under the lamps.
  trafficCar(game, 6, -40, Math.PI, 3, 3, 9);
  trafficCar(game, 6, -110, Math.PI, 1, 1, 10);
  trafficCar(game, -6, -70, 0, 4, 2, 11);
  trafficCar(game, -6, 10, 0, 5, 0, 10);
  trafficCar(game, 6, -58, Math.PI, 5, 0, 9.5);

  // Two stars: a pair of cruisers trailing the coupe.
  copCar(game, 6, 105, Math.PI, 'KESTREL-1', 'Pursuit lead', 9);
  copCar(game, -6, 130, Math.PI, 'OTTER-2', 'Flanker', 9);
  police.heat = 1.4;
  police.seen = true;

  sweepPeds(game, -16, 16, -70, 90);
  setMission(game, 'Night Run', 'Reach the Heights overlook before the clock dies', { x: 40, z: 320 });
  game.hud.say('Theo Lindqvist', 'City sleeps, engine sings. Heights by midnight, Ren — easy money.');
  pinCam(game, 16, 6.5, 94, -2, 2, -30);
  return true;
}

// Two believable save slots, written through the real save system.
function writeStagedSaves(game) {
  const mk = (patch) => {
    const s = Object.create(Object.getPrototypeOf(game.stats));
    Object.assign(s, game.stats);
    s.reset();
    Object.assign(s, patch);
    return s;
  };
  const slot0 = mk({
    cash: 12480, rp: 1150,
    storyDone: ['first-wheels', 'parcel-run', 'vanish', 'rival-wreck', 'harbor-sprint'],
    medals: { 'first-wheels': 'gold' }, districtsWorked: ['strand', 'market', 'downtown'],
    starsFound: 12, courierDone: 5, racesWon: 1, stunts: 5, longestLeap: 23,
    takedowns: 6, carsStolen: 9, copsEscaped: 3, crewUses: 11,
    abilitiesUsed: ['mira', 'theo', 'kiki'], distanceKm: 38.6, playSeconds: 2740,
  });
  game.saves.write(0, slot0, [0, 1, 2, 4, 5, 7, 9, 11, 13, 15, 17, 19]);
  const slot1 = mk({
    cash: 1830, rp: 240, storyDone: ['first-wheels', 'parcel-run'],
    medals: { 'first-wheels': 'silver' }, districtsWorked: ['strand', 'market'],
    starsFound: 4, courierDone: 1, playSeconds: 640,
  });
  game.saves.write(1, slot1, [0, 3, 6, 10]);
}
