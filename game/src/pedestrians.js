// pedestrians.js — the sixty walkers of Solmar Bay and the shared
// low-poly person factory the player, the crew, police officers and rival
// thugs are all built from. Pedestrians stroll the sidewalks on grid
// waypoints, and scatter when gunfire or a speeding car comes close.

import { THREE } from './three.js';
import { WORLD, PED_COUNT } from './config.js';
import { Rng } from './rng.js';

const SHIRTS = [0xd95f43, 0x3e7cb1, 0xf2b21b, 0x6ab04c, 0xe8e3d8, 0x8855aa, 0x2a9d8f, 0xe76f51, 0x457b9d, 0xf4a261];
const SKINS = [0xf2c79b, 0xc68863, 0x8d5524, 0xffdbac, 0x6b4423];
const PANTS = [0x2b2d42, 0x4a4e69, 0x5c374c, 0x22223b, 0x606c38];

// One person: torso, head, two legs and two arms that swing as they walk.
// The returned group carries userData parts the animator moves.
export function makePersonMesh({ shirt = 0x3e7cb1, skin = 0xf2c79b, pants = 0x2b2d42, cap = null } = {}) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), shirtMat);
  torso.position.y = 1.12;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.34), skinMat);
  head.position.y = 1.72;
  head.castShadow = true;
  g.add(head);
  if (cap !== null) {
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: cap }));
    brim.position.y = 1.94;
    g.add(brim);
  }
  const limbs = {};
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), pantsMat);
    leg.geometry.translate(0, -0.36, 0);
    leg.position.set(side * 0.16, 0.74, 0);
    g.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.66, 0.18), shirtMat);
    arm.geometry = arm.geometry.clone();
    arm.geometry.translate(0, -0.3, 0);
    arm.position.set(side * 0.42, 1.44, 0);
    g.add(arm);
    limbs[side < 0 ? 'legL' : 'legR'] = leg;
    limbs[side < 0 ? 'armL' : 'armR'] = arm;
  }
  g.userData.limbs = limbs;
  g.userData.walkPhase = Math.random() * 6;
  return g;
}

// Swing the limbs for a walker covering ground at the given speed.
export function animatePerson(mesh, dt, speed) {
  const u = mesh.userData;
  u.walkPhase += dt * (4 + speed * 2.4);
  const swing = Math.min(1, speed / 2) * 0.65;
  const p = u.walkPhase;
  u.limbs.legL.rotation.x = Math.sin(p) * swing;
  u.limbs.legR.rotation.x = -Math.sin(p) * swing;
  u.limbs.armL.rotation.x = -Math.sin(p) * swing * 0.8;
  u.limbs.armR.rotation.x = Math.sin(p) * swing * 0.8;
}

export class Pedestrian {
  constructor(scene, rng) {
    this.mesh = makePersonMesh({
      shirt: SHIRTS[rng.int(0, SHIRTS.length - 1)],
      skin: SKINS[rng.int(0, SKINS.length - 1)],
      pants: PANTS[rng.int(0, PANTS.length - 1)],
      cap: rng.chance(0.3) ? SHIRTS[rng.int(0, SHIRTS.length - 1)] : null,
    });
    const avenue = WORLD.avenues[rng.int(0, WORLD.avenues.length - 1)];
    const street = WORLD.streets[rng.int(0, WORLD.streets.length - 1)];
    this.mesh.position.set(avenue + rng.range(-8, 8), 0, street + rng.range(-8, 8));
    this.heading = rng.range(0, Math.PI * 2);
    this.speed = 0;
    this.walkSpeed = rng.range(1.1, 1.9);
    this.fleeTime = 0;
    this.fleeFrom = new THREE.Vector3();
    this.target = null;
    this.rng = rng;
    scene.add(this.mesh);
    this.pickTarget();
  }

  get pos() { return this.mesh.position; }

  // Sidewalk waypoints: a point on a pavement edge somewhere on the grid.
  pickTarget() {
    const rng = this.rng;
    const alongAvenue = rng.chance(0.5);
    if (alongAvenue) {
      const a = WORLD.avenues[rng.int(0, WORLD.avenues.length - 1)];
      this.target = {
        x: a + (rng.chance(0.5) ? -1 : 1) * (WORLD.roadWidth / 2 + 3),
        z: rng.range(-560, 560),
      };
    } else {
      const s = WORLD.streets[rng.int(0, WORLD.streets.length - 1)];
      this.target = {
        x: rng.range(-560, 560),
        z: s + (rng.chance(0.5) ? -1 : 1) * (WORLD.roadWidth / 2 + 3),
      };
    }
  }

  scare(fromPos) {
    this.fleeTime = 2.6;
    this.fleeFrom.copy(fromPos);
  }

  update(dt, world) {
    let wantSpeed = this.walkSpeed;
    let tx, tz;
    if (this.fleeTime > 0) {
      this.fleeTime -= dt;
      wantSpeed = 4.6;
      tx = this.pos.x + (this.pos.x - this.fleeFrom.x);
      tz = this.pos.z + (this.pos.z - this.fleeFrom.z);
    } else {
      tx = this.target.x; tz = this.target.z;
      if (Math.hypot(tx - this.pos.x, tz - this.pos.z) < 2.5) this.pickTarget();
    }
    const want = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    let diff = want - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += THREE.MathUtils.clamp(diff, -3.4 * dt, 3.4 * dt);
    this.speed = THREE.MathUtils.lerp(this.speed, wantSpeed, 1 - Math.pow(0.001, dt));
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    world.collide(this.pos, 0.55);
    this.mesh.rotation.y = this.heading;
    animatePerson(this.mesh, dt, this.speed);
  }
}

export class Pedestrians {
  constructor(scene, seed) {
    this.rng = new Rng(seed ^ 0x9ed5);
    this.list = [];
    for (let i = 0; i < PED_COUNT; i++) this.list.push(new Pedestrian(scene, this.rng));
  }
  update(dt, world) {
    for (const p of this.list) p.update(dt, world);
  }
  scareAround(pos, radius) {
    for (const p of this.list) {
      if (p.pos.distanceTo(pos) < radius) p.scare(pos);
    }
  }
}
