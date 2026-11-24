// vehicles.js — every car in Solmar Bay: the low-poly body factory, the
// arcade driving model the player and the traffic share, the traffic
// system that keeps 32 cars circulating the grid, the 38 parked cars
// waiting to be stolen, and the boat the Marina Job escapes on.

import { THREE } from './three.js';
import { WORLD, CAR_MODELS, TRAFFIC_COUNT, PARKED_COUNT } from './config.js';
import { Rng } from './rng.js';

const bodyGeoCache = new Map();

function bodyGeometry(model) {
  if (!bodyGeoCache.has(model.id)) {
    bodyGeoCache.set(model.id, {
      body: new THREE.BoxGeometry(model.width, model.height * 0.62, model.length),
      cabin: new THREE.BoxGeometry(model.width * 0.82, model.height * 0.55, model.length * 0.44),
      wheel: new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10),
    });
  }
  return bodyGeoCache.get(model.id);
}

const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2836 });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff6c9, emissive: 0xffedb5, emissiveIntensity: 0.7 });
const tailMat = new THREE.MeshLambertMaterial({ color: 0xb02020, emissive: 0x901010, emissiveIntensity: 0.6 });

// Build one car's meshes. Police livery and the taxi sign are options.
export function makeCarMesh(model, color, opts = {}) {
  const geo = bodyGeometry(model);
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(geo.body, paint);
  body.position.y = 0.42 + model.height * 0.31;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(geo.cabin, glassMat);
  cabin.position.set(0, 0.42 + model.height * 0.62 + model.height * 0.26, -model.length * 0.05);
  cabin.castShadow = true;
  group.add(cabin);
  if (opts.police) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(model.width + 0.04, model.height * 0.3, model.length * 0.5),
      new THREE.MeshLambertMaterial({ color: 0xf2f4f6 }));
    band.position.y = body.position.y;
    group.add(band);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x2244cc, emissive: 0x2244ff, emissiveIntensity: 1.4 }));
    bar.position.set(0, cabin.position.y + model.height * 0.36, 0);
    group.add(bar);
    group.userData.lightBar = bar;
  }
  if (opts.taxi) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.34),
      new THREE.MeshLambertMaterial({ color: 0xffd23e, emissive: 0xcc9900, emissiveIntensity: 0.5 }));
    sign.position.set(0, cabin.position.y + model.height * 0.36, 0);
    group.add(sign);
  }
  const wheels = [];
  const wheelPos = [
    [-model.width / 2, -model.length * 0.32], [model.width / 2, -model.length * 0.32],
    [-model.width / 2, model.length * 0.32], [model.width / 2, model.length * 0.32],
  ];
  for (const [wx, wz] of wheelPos) {
    const wheel = new THREE.Mesh(geo.wheel, tyreMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), lightMat);
    head.position.set(side * model.width * 0.32, 0.62, model.length / 2 + 0.01);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), tailMat);
    tail.position.set(side * model.width * 0.32, 0.66, -model.length / 2 - 0.01);
    group.add(tail);
  }
  group.userData.wheels = wheels;
  group.userData.paint = paint;
  return group;
}

// One car: mesh plus arcade physics state. The player, traffic, police and
// rivals all drive Cars; only the input source differs.
export class Car {
  constructor(scene, model, color, opts = {}) {
    this.model = model;
    this.mesh = makeCarMesh(model, color, opts);
    this.heading = opts.heading || 0;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.isPolice = !!opts.police;
    this.parked = !!opts.parked;
    this.dead = false;
    this.smokeAcc = 0;
    this.mesh.position.set(opts.x || 0, 0, opts.z || 0);
    this.mesh.rotation.y = this.heading;
    scene.add(this.mesh);
  }

  get pos() { return this.mesh.position; }
  forward() { return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  // throttle -1..1, steer -1..1 (left positive). Returns impact speed if
  // this step crashed into the world, else 0.
  drive(dt, throttle, steer, world, brake = false) {
    const m = this.model;
    const accel = throttle > 0 ? m.accel : m.accel * 0.7;
    this.speed += throttle * accel * dt;
    if (brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 34 * dt);
    this.speed -= this.speed * 0.55 * dt;                       // drag
    if (throttle === 0) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 6 * dt);
    this.speed = THREE.MathUtils.clamp(this.speed, -m.topSpeed * 0.36, m.topSpeed);
    this.steer = THREE.MathUtils.lerp(this.steer, steer, 1 - Math.pow(0.0001, dt));
    const turnRate = this.steer * 1.9 * Math.min(1, Math.abs(this.speed) / 9) * Math.sign(this.speed);
    if (Math.abs(this.speed) > 0.2) this.heading += turnRate * dt * (Math.abs(this.speed) > 22 ? 22 / Math.abs(this.speed) * 0.4 + 0.6 : 1);
    const f = this.forward();
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    let impact = 0;
    const before = Math.abs(this.speed);
    if (world && world.collide(this.pos, 2.1)) {
      impact = before;
      this.speed *= -0.25;
      this.health = Math.max(0, this.health - impact * 0.55);
    }
    this.mesh.position.y = 0;
    this.mesh.rotation.y = this.heading;
    const wheels = this.mesh.userData.wheels;
    for (let i = 0; i < wheels.length; i++) {
      wheels[i].rotation.x += this.speed * dt / 0.36;
      if (i >= 2) wheels[i].rotation.y = this.steer * 0.45;
    }
    return impact;
  }

  // Cheap circle separation against a list of other cars; returns impact.
  collideCars(others, dt) {
    let impact = 0;
    for (const o of others) {
      if (o === this || o.dead) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      const min = 3.4;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const nx = dx / d, nz = dz / d;
        this.pos.x += nx * push; this.pos.z += nz * push;
        o.pos.x -= nx * push; o.pos.z -= nz * push;
        const rel = Math.abs(this.speed - o.speed);
        if (rel > 4) {
          impact = Math.max(impact, rel);
          this.health = Math.max(0, this.health - rel * 0.5);
          o.health = Math.max(0, o.health - rel * 0.4);
          this.speed *= 0.55; o.speed *= 0.7;
        }
      }
    }
    return impact;
  }

  updateSmoke(dt, effects) {
    if (this.health < 40 && !this.dead) {
      this.smokeAcc += dt * (this.health < 18 ? 9 : 4);
      while (this.smokeAcc > 1) {
        this.smokeAcc -= 1;
        effects.smoke(this.pos.x, 1.3, this.pos.z);
      }
    }
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.dead = true;
  }
}

// -----------------------------------------------------------------------------
// Traffic: cars that circulate the grid forever, each following a chain of
// intersection waypoints on the correct side of the road.
// -----------------------------------------------------------------------------
export class Traffic {
  constructor(scene, world, seed) {
    this.scene = scene;
    this.world = world;
    this.rng = new Rng(seed ^ 0x7a11c);
    this.cars = [];
    for (let i = 0; i < TRAFFIC_COUNT; i++) this.cars.push(this.spawnCar());
  }

  spawnCar(atPos = null) {
    const rng = this.rng;
    const model = CAR_MODELS[rng.int(0, CAR_MODELS.length - 1)];
    const color = model.colors[rng.int(0, model.colors.length - 1)];
    const avenue = WORLD.avenues[rng.int(0, WORLD.avenues.length - 1)];
    const street = WORLD.streets[rng.int(0, WORLD.streets.length - 1)];
    const car = new Car(this.scene, model, color, {
      x: atPos ? atPos.x : avenue, z: atPos ? atPos.z : street,
      heading: rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]),
    });
    car.driver = { target: null, speedWanted: rng.range(0.55, 0.85) };
    this.nextTarget(car, true);
    return car;
  }

  // Choose the next intersection to aim for: straight on or a turn, never a
  // U-turn unless it is the only road left.
  nextTarget(car, first = false) {
    const rng = this.rng;
    const pos = car.pos;
    const options = [];
    for (const a of WORLD.avenues) for (const s of WORLD.streets) {
      const dx = a - pos.x, dz = s - pos.z;
      if (Math.abs(dx) < 4 && Math.abs(dz) > 30) options.push({ x: a, z: s });
      else if (Math.abs(dz) < 4 && Math.abs(dx) > 30) options.push({ x: a, z: s });
    }
    if (!options.length) { car.driver.target = { x: 0, z: 0 }; return; }
    const t = options[rng.int(0, options.length - 1)];
    // Lane offset: keep right. The offset is applied perpendicular to travel.
    const alongZ = Math.abs(t.x - pos.x) < 4;
    car.driver.target = {
      x: t.x + (alongZ ? (t.z > pos.z ? -4.4 : 4.4) : 0),
      z: t.z + (!alongZ ? (t.x > pos.x ? 4.4 : -4.4) : 0),
    };
    if (first) {
      // Start the car already in its lane on the road it spawns on.
      if (alongZ) car.pos.x = car.driver.target.x;
      else car.pos.z = car.driver.target.z;
    }
  }

  update(dt, world, effects, allCars) {
    for (const car of this.cars) {
      if (car.parked || car.dead) continue;
      const t = car.driver.target;
      const dx = t.x - car.pos.x, dz = t.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 9) { this.nextTarget(car); continue; }
      const want = Math.atan2(dx, dz);
      let diff = want - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = THREE.MathUtils.clamp(diff * 1.6, -1, 1);
      let throttle = Math.abs(diff) > 1.1 ? 0.15 : car.driver.speedWanted;
      // Slow for a car ahead in the same lane.
      for (const o of allCars) {
        if (o === car || o.dead) continue;
        const ox = o.pos.x - car.pos.x, oz = o.pos.z - car.pos.z;
        const ahead = ox * Math.sin(car.heading) + oz * Math.cos(car.heading);
        const side = Math.abs(ox * Math.cos(car.heading) - oz * Math.sin(car.heading));
        if (ahead > 0 && ahead < 11 && side < 2.4) throttle = Math.min(throttle, 0.05);
      }
      const impact = car.drive(dt, throttle, steer, world, throttle < 0.1 && car.speed > 6);
      if (impact > 9) effects.crashAt(car.pos, impact);
      car.updateSmoke(dt, effects);
    }
  }
}

// -----------------------------------------------------------------------------
// Parked cars: set dressing that doubles as the stealable fleet.
// -----------------------------------------------------------------------------
export function spawnParkedCars(scene, seed) {
  const rng = new Rng(seed ^ 0x9a4ed);
  const cars = [];
  const spots = [];
  for (const s of WORLD.streets) {
    for (let x = -560; x <= 560; x += 47) {
      spots.push({ x: x + rng.range(-8, 8), z: s - WORLD.roadWidth / 2 - 4.6, heading: Math.PI / 2 });
      spots.push({ x: x + rng.range(-8, 8), z: s + WORLD.roadWidth / 2 + 4.6, heading: -Math.PI / 2 });
    }
  }
  const chosen = rng.shuffled(spots).slice(0, PARKED_COUNT);
  // The hero coupe of mission one always waits in the same Strand spot.
  chosen[0] = { x: 26, z: 440 - WORLD.roadWidth / 2 - 4.6, heading: Math.PI / 2, hero: true };
  for (const spot of chosen) {
    const model = spot.hero ? CAR_MODELS[0] : CAR_MODELS[rng.int(0, CAR_MODELS.length - 1)];
    const color = spot.hero ? 0x0fa3a3 : model.colors[rng.int(0, model.colors.length - 1)];
    const car = new Car(scene, model, color, { x: spot.x, z: spot.z, heading: spot.heading, parked: true });
    car.isHeroCoupe = !!spot.hero;
    cars.push(car);
  }
  return cars;
}

// -----------------------------------------------------------------------------
// The escape boat: arcade handling on open water.
// -----------------------------------------------------------------------------
export class Boat {
  constructor(scene, mesh) {
    this.mesh = mesh;
    this.heading = -Math.PI / 2;   // bow points east, out to sea
    this.speed = 0;
    this.active = false;
  }
  get pos() { return this.mesh.position; }
  drive(dt, throttle, steer) {
    this.speed += throttle * 9 * dt;
    this.speed -= this.speed * 0.4 * dt;
    this.speed = THREE.MathUtils.clamp(this.speed, -4, 26);
    if (Math.abs(this.speed) > 0.4) this.heading += steer * 0.7 * dt * Math.sign(this.speed);
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    this.pos.x = Math.min(this.pos.x, 980);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -700, 900);
    this.mesh.rotation.y = this.heading;
  }
}
