// collectibles.js — the twenty golden Solmar stars scattered over the
// island and the four stunt ramps that score a car's leap. Stars spin and
// bob over their spots, vanish with a chime when Ren passes through one,
// and are remembered per save slot by index.

import { THREE } from './three.js';
import { STAR_COUNT } from './config.js';

function starGeometry() {
  // A five-point star from a flat shape, extruded a little for depth.
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1 : 0.45;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: false });
}

export class Collectibles {
  constructor(scene, world, audio) {
    this.audio = audio;
    this.group = new THREE.Group();
    scene.add(this.group);
    const geo = starGeometry();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffc21c, emissive: 0xcc8f00, emissiveIntensity: 0.75 });
    this.stars = world.starSpots.slice(0, STAR_COUNT).map((s, i) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(s.x, s.y, s.z);
      mesh.scale.setScalar(1.15);
      this.group.add(mesh);
      return { mesh, taken: false, phase: i * 0.7, x: s.x, z: s.z };
    });
    this.ramps = world.ramps;
    this.onStar = null;         // (count) wired by main.js
    this.onStunt = null;        // (metres) wired by main.js
    this.airborne = null;       // {startX, startZ, peak} while a car flies
    this.count = 0;
  }

  takenIndices() { return this.stars.map((s, i) => (s.taken ? i : -1)).filter((i) => i >= 0); }

  restoreTaken(indices) {
    for (const s of this.stars) { s.taken = false; s.mesh.visible = true; }
    this.count = 0;
    for (const i of indices || []) {
      if (this.stars[i]) { this.stars[i].taken = true; this.stars[i].mesh.visible = false; this.count++; }
    }
  }

  update(dt, player) {
    const t = performance.now() * 0.001;
    const focus = player.inCar ? player.inCar.pos : player.pos;
    for (const s of this.stars) {
      if (s.taken) continue;
      s.mesh.rotation.y = t * 1.6 + s.phase;
      s.mesh.position.y = 1.6 + Math.sin(t * 2 + s.phase) * 0.25;
      const d = Math.hypot(s.x - focus.x, s.z - focus.z);
      if (d < 2.6) {
        s.taken = true;
        s.mesh.visible = false;
        this.count++;
        this.audio.star();
        if (this.onStar) this.onStar(this.count);
      }
    }
    // Stunt scoring: a car that leaves a ramp's lip fast and airborne is
    // measured from lip to landing.
    const car = player.inCar;
    if (car) {
      if (!this.airborne) {
        for (const r of this.ramps) {
          const d = Math.hypot(r.x - car.pos.x, r.z - car.pos.z);
          if (d < 5 && Math.abs(car.speed) > 13) {
            this.airborne = { x: car.pos.x, z: car.pos.z, air: 0 };
          }
        }
      } else {
        this.airborne.air += dt;
        if (this.airborne.air > 0.55) {
          const leap = Math.hypot(car.pos.x - this.airborne.x, car.pos.z - this.airborne.z);
          if (leap > 9 && this.onStunt) this.onStunt(Math.round(leap));
          this.airborne = null;
        }
      }
    } else this.airborne = null;
  }

  // Blips for the maps: gold dots, all of them under Eyes Out, else only
  // the nearest few.
  blips(eyesActive, focus) {
    const open = this.stars.filter((s) => !s.taken);
    const sorted = open.slice().sort((a, b) =>
      Math.hypot(a.x - focus.x, a.z - focus.z) - Math.hypot(b.x - focus.x, b.z - focus.z));
    const shown = eyesActive ? sorted : sorted.slice(0, 3);
    return shown.map((s) => ({ x: s.x, z: s.z, color: '#ffd23e', r: 3.4 }));
  }
}
