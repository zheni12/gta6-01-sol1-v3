// police.js — the SBPD: the wanted meter, the units that answer it and
// the BUSTED pressure when they corner the player. Cars pursue with the
// shared driving model, officers on foot close in and shoot, a helicopter
// joins at four stars and roadblocks seal a road at five.
//
// The response panel is fed from here: every live unit reports its roster
// call-sign, its role and its distance to the player.

import { THREE } from './three.js';
import { WORLD, POLICE_UNITS, WANTED } from './config.js';
import { Car } from './vehicles.js';
import { CAR_MODELS } from './config.js';
import { makePersonMesh, animatePerson } from './pedestrians.js';

const CARS_BY_STARS = [0, 1, 2, 3, 4, 5];
const FOOT_BY_STARS = [0, 0, 2, 2, 3, 4];

export class Police {
  constructor(scene, world, effects, audio) {
    this.scene = scene;
    this.world = world;
    this.effects = effects;
    this.audio = audio;
    this.heat = 0;               // 0..5.x; stars are its ceiling
    this.heatFloor = 0;          // missions can hold the heat up
    this.seen = false;
    this.seenTimer = 0;
    this.ghostUntil = 0;         // Ghost Plates expiry, in game seconds
    this.time = 0;
    this.units = [];             // {kind:'car'|'foot'|'heli'|'block', call, role, car?, mesh?, ...}
    this.bust = 0;               // 0..1 BUSTED meter
    this.spawnCooldown = 0;
    this.onBusted = null;
    this.rosterIdx = 0;
  }

  get stars() { return this.heat <= 0.05 ? 0 : Math.min(5, Math.ceil(this.heat)); }
  get ghostActive() { return this.time < this.ghostUntil; }

  addHeat(amount, pos) {
    if (this.ghostActive) return;
    this.heat = Math.min(5.6, this.heat + amount);
    if (pos) this.lastCrimePos = pos;
  }

  setHeatFloor(n) { this.heatFloor = n; this.heat = Math.max(this.heat, n); }
  clearHeatFloor() { this.heatFloor = 0; }
  clearHeat() { this.heat = 0; this.heatFloor = 0; this.bust = 0; }

  nextCall(kind) {
    const pool = POLICE_UNITS.filter((u) =>
      kind === 'heli' ? u.role === 'Helicopter' :
      kind === 'block' ? u.role === 'Roadblock' :
      kind === 'foot' ? u.role.startsWith('Foot') || u.role === 'Foot officer' :
      !['Helicopter', 'Roadblock'].includes(u.role) && !u.call.startsWith('FOOT'));
    const u = pool[this.rosterIdx++ % pool.length] || POLICE_UNITS[0];
    return u;
  }

  spawnPos(near) {
    // A road point 95–135 units from the player, out of immediate view.
    for (let tries = 0; tries < 12; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 95 + Math.random() * 40;
      const x = THREE.MathUtils.clamp(near.x + Math.sin(ang) * dist, -560, 560);
      const z = THREE.MathUtils.clamp(near.z + Math.cos(ang) * dist, -560, 430);
      const avenue = WORLD.avenues.reduce((b, a) => (Math.abs(a - x) < Math.abs(b - x) ? a : b), WORLD.avenues[0]);
      const street = WORLD.streets.reduce((b, s) => (Math.abs(s - z) < Math.abs(b - z) ? s : b), WORLD.streets[0]);
      if (Math.abs(avenue - x) < Math.abs(street - z)) return { x: avenue, z };
      return { x, z: street };
    }
    return { x: 0, z: 0 };
  }

  spawnCarUnit(player) {
    const call = this.nextCall('car');
    const p = this.spawnPos(player.pos);
    const car = new Car(this.scene, CAR_MODELS[2], 0x1a2436, { x: p.x, z: p.z, police: true });
    car.mesh.userData.paint.color.set(0x1a2436);
    this.units.push({ kind: 'car', call: call.call, role: call.role, car, shootCd: 0 });
  }

  spawnFootUnit(player) {
    const call = this.nextCall('foot');
    const p = this.spawnPos(player.pos);
    const mesh = makePersonMesh({ shirt: 0x1c2f4a, skin: 0xf2c79b, pants: 0x141c28, cap: 0x1c2f4a });
    mesh.position.set(p.x, 0, p.z);
    this.scene.add(mesh);
    this.units.push({ kind: 'foot', call: call.call, role: 'Foot officer', mesh, heading: 0, shootCd: Math.random() });
  }

  spawnHeli(player) {
    const call = this.nextCall('heli');
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2, 7.5),
      new THREE.MeshLambertMaterial({ color: 0x22262e }));
    group.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 6),
      new THREE.MeshLambertMaterial({ color: 0x22262e }));
    tail.position.set(0, 0.3, -6);
    group.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.7),
      new THREE.MeshBasicMaterial({ color: 0x111111 }));
    rotor.position.y = 1.4;
    group.add(rotor);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(9, 34, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }));
    cone.position.y = -18;
    group.add(cone);
    group.position.set(player.pos.x + 60, 42, player.pos.z + 60);
    this.scene.add(group);
    this.units.push({ kind: 'heli', call: call.call, role: call.role, mesh: group, rotor, phase: Math.random() * 9 });
  }

  spawnBlockade(player) {
    const call = this.nextCall('block');
    // Across the road the player is heading down, 70 units ahead.
    const f = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
    const bx = THREE.MathUtils.clamp(player.pos.x + f.x * 70, -560, 560);
    const bz = THREE.MathUtils.clamp(player.pos.z + f.z * 70, -560, 430);
    const avenue = WORLD.avenues.reduce((b, a) => (Math.abs(a - bx) < Math.abs(b - bx) ? a : b), WORLD.avenues[0]);
    const cars = [];
    for (const off of [-6.5, 6.5]) {
      const car = new Car(this.scene, CAR_MODELS[2], 0x1a2436, {
        x: avenue + off, z: bz, heading: Math.PI / 2, police: true, parked: true,
      });
      cars.push(car);
    }
    this.units.push({ kind: 'block', call: call.call, role: call.role, cars, x: avenue, z: bz });
  }

  removeUnit(u) {
    if (u.kind === 'car') u.car.dispose(this.scene);
    else if (u.kind === 'block') for (const c of u.cars) c.dispose(this.scene);
    else this.scene.remove(u.mesh);
  }

  unitPos(u) {
    if (u.kind === 'car') return u.car.pos;
    if (u.kind === 'block') return { x: u.x, z: u.z };
    return u.mesh.position;
  }

  update(dt, player, effects) {
    this.time += dt;
    const stars = this.stars;
    const target = player.inBoat ? this.world.escapeBoat.position : player.pos;

    // Perception: any unit close enough sees the player.
    let anySeen = false;
    for (const u of this.units) {
      const p = this.unitPos(u);
      const d = Math.hypot(p.x - target.x, (p.z ?? p.y) - target.z);
      if (d < 60) anySeen = true;
    }
    if (anySeen) { this.seen = true; this.seenTimer = 4; }
    else { this.seenTimer -= dt; if (this.seenTimer <= 0) this.seen = false; }

    // Heat decay while unseen; the floor holds scripted heat.
    if (!this.seen && stars > 0) {
      const rate = this.ghostActive ? WANTED.decayGhostPerSecond : WANTED.decayPerSecond;
      this.heat = Math.max(this.heatFloor, this.heat - rate * dt * 5);
    }

    // Spawn and cull to the wanted level's roster.
    this.spawnCooldown -= dt;
    const wantCars = CARS_BY_STARS[stars];
    const wantFoot = player.inCar ? 0 : FOOT_BY_STARS[stars];
    const cars = this.units.filter((u) => u.kind === 'car');
    const foots = this.units.filter((u) => u.kind === 'foot');
    const hasHeli = this.units.some((u) => u.kind === 'heli');
    const hasBlock = this.units.some((u) => u.kind === 'block');
    if (this.spawnCooldown <= 0) {
      if (cars.length < wantCars) { this.spawnCarUnit(player); this.spawnCooldown = 1.2; }
      else if (foots.length < wantFoot) { this.spawnFootUnit(player); this.spawnCooldown = 1.2; }
      else if (stars >= 4 && !hasHeli) { this.spawnHeli(player); this.spawnCooldown = 1.2; }
      else if (stars >= 5 && !hasBlock) { this.spawnBlockade(player); this.spawnCooldown = 1.2; }
    }
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      const p = this.unitPos(u);
      const d = Math.hypot(p.x - target.x, p.z - target.z);
      const excess = (u.kind === 'car' && cars.length > wantCars) ||
        (u.kind === 'foot' && foots.length > wantFoot) ||
        (u.kind === 'heli' && stars < 4) || (u.kind === 'block' && stars < 5);
      if ((d > 300 && stars === 0) || (d > 340) || (excess && d > 150)) {
        this.removeUnit(u);
        this.units.splice(i, 1);
      }
    }
    if (stars === 0 && this.units.length === 0) this.bust = 0;

    // Siren loudness follows the nearest car unit.
    let nearest = 999;
    for (const u of this.units) {
      if (u.kind !== 'car') continue;
      nearest = Math.min(nearest, u.car.pos.distanceTo(target));
    }
    this.audio.setSiren(THREE.MathUtils.clamp(1.1 - nearest / 130, 0, 1) * (stars > 0 ? 1 : 0));

    // --- drive and walk the units -------------------------------------------
    let bustPressure = 0;
    for (const u of this.units) {
      if (u.kind === 'car') {
        const car = u.car;
        const dx = target.x - car.pos.x, dz = target.z - car.pos.z;
        const dist = Math.hypot(dx, dz);
        const want = Math.atan2(dx, dz);
        let diff = want - car.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const steer = THREE.MathUtils.clamp(diff * 1.7, -1, 1);
        const throttle = dist > 7 ? 0.95 : 0.1;
        car.drive(dt, throttle, steer, this.world, dist <= 7 && car.speed > 3);
        if (car.mesh.userData.lightBar) {
          car.mesh.userData.lightBar.material.emissive.setHex(Math.sin(this.time * 9) > 0 ? 0xff2222 : 0x2244ff);
        }
        if (dist < WANTED.bustRange && !player.inCar) bustPressure = Math.max(bustPressure, 1 - dist / WANTED.bustRange);
        if (dist < WANTED.bustRange && player.inCar && Math.abs(player.inCar.speed) < 2.5) bustPressure = Math.max(bustPressure, 0.8);
      } else if (u.kind === 'foot') {
        const m = u.mesh;
        const dx = target.x - m.position.x, dz = target.z - m.position.z;
        const dist = Math.hypot(dx, dz);
        const want = Math.atan2(dx, dz);
        let diff = want - u.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        u.heading += THREE.MathUtils.clamp(diff, -4 * dt, 4 * dt);
        m.rotation.y = u.heading;
        if (dist > 13 && !player.inCar) {
          m.position.x += Math.sin(u.heading) * 4.4 * dt;
          m.position.z += Math.cos(u.heading) * 4.4 * dt;
          this.world.collide(m.position, 0.55);
          animatePerson(m, dt, 4.4);
        } else if (!player.inCar && stars >= 3) {
          u.shootCd -= dt;
          if (u.shootCd <= 0) {
            u.shootCd = 0.9 + Math.random() * 0.7;
            const from = new THREE.Vector3(m.position.x, 1.45, m.position.z);
            const to = new THREE.Vector3(target.x, 1.1, target.z);
            to.x += (Math.random() - 0.5) * dist * 0.16;
            to.z += (Math.random() - 0.5) * dist * 0.16;
            effects.tracer(from, to, 0x9fc2ff);
            this.audio.shot('kestrel');
            if (Math.random() < 0.16) player.hurt(5);
          }
        }
        if (dist < WANTED.bustRange && !player.inCar) bustPressure = Math.max(bustPressure, 1 - dist / WANTED.bustRange);
      } else if (u.kind === 'heli') {
        u.phase += dt;
        u.rotor.rotation.y += dt * 28;
        const tx = target.x + Math.sin(u.phase * 0.5) * 16;
        const tz = target.z + Math.cos(u.phase * 0.4) * 16;
        u.mesh.position.x = THREE.MathUtils.lerp(u.mesh.position.x, tx, 1 - Math.pow(0.01, dt));
        u.mesh.position.z = THREE.MathUtils.lerp(u.mesh.position.z, tz, 1 - Math.pow(0.01, dt));
        u.mesh.position.y = 42 + Math.sin(u.phase * 0.8) * 2;
        u.mesh.rotation.y = Math.atan2(target.x - u.mesh.position.x, target.z - u.mesh.position.z);
      }
    }

    // BUSTED meter: pressure while cornered, drains while free.
    if (stars > 0 && bustPressure > 0 && !player.inBoat) {
      this.bust = Math.min(1, this.bust + bustPressure * WANTED.bustFillRate * dt * 3);
    } else {
      this.bust = Math.max(0, this.bust - WANTED.bustDrainRate * dt);
    }
    if (this.bust >= 1 && this.onBusted) {
      this.bust = 0;
      this.onBusted();
    }
  }

  // Rows for the HUD response panel, nearest first.
  panelRows(playerPos, eyesActive) {
    const rows = [];
    for (const u of this.units) {
      const p = this.unitPos(u);
      const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      rows.push({ call: u.call, role: u.role, dist: Math.round(d) });
    }
    rows.sort((a, b) => a.dist - b.dist);
    return rows.slice(0, 6);
  }
}
