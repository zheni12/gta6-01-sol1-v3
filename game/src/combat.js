// combat.js — gunplay and fists: the effects pool (tracers, muzzle flash,
// smoke, sparks), the rival thugs missions place in the world, and the
// player's three weapons. Hitscan throughout: a shot is a ray from the
// camera through the crosshair, a tracer line to whatever it met.

import { THREE } from './three.js';
import { WEAPONS } from './config.js';
import { makePersonMesh, animatePerson } from './pedestrians.js';

// -----------------------------------------------------------------------------
// Effects: short-lived visuals pooled so combat never allocates per frame.
// -----------------------------------------------------------------------------
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];          // {obj, life, maxLife, tick}
    this.holdTracers = false; // screenshot staging keeps tracers in frame
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    this.puffTex = new THREE.CanvasTexture(c);
    this.flashLight = new THREE.PointLight(0xffc266, 0, 26);
    scene.add(this.flashLight);
    this.onCrash = null;      // main.js wires the crash sound here
  }

  add(obj, life, tick) {
    this.scene.add(obj);
    this.items.push({ obj, life, maxLife: life, tick });
  }

  tracer(from, to, color = 0xffe9a3) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const line = new THREE.Line(geo, mat);
    this.add(line, this.holdTracers ? 9999 : 0.1, (it, k) => { it.obj.material.opacity = 0.95 * k; });
  }

  muzzle(at) {
    const mat = new THREE.SpriteMaterial({ map: this.puffTex, color: 0xffc266, transparent: true, opacity: 1 });
    const s = new THREE.Sprite(mat);
    s.position.copy(at);
    s.scale.setScalar(0.9);
    this.add(s, 0.06, (it, k) => { it.obj.material.opacity = k; });
    this.flashLight.position.copy(at);
    this.flashLight.intensity = 2.4;
  }

  smoke(x, y, z) {
    const mat = new THREE.SpriteMaterial({ map: this.puffTex, color: 0x555a60, transparent: true, opacity: 0.4, depthWrite: false });
    const s = new THREE.Sprite(mat);
    s.position.set(x + (Math.random() - 0.5) * 0.7, y, z + (Math.random() - 0.5) * 0.7);
    s.scale.setScalar(1.1);
    this.add(s, 1.4, (it, k, age) => {
      it.obj.position.y += 0.02 + age * 0.01;
      it.obj.scale.setScalar(1.1 + age * 1.5);
      it.obj.material.opacity = 0.4 * k;
    });
  }

  sparks(at, n = 7) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.puffTex, color: 0xffb84d, transparent: true, opacity: 1 });
      const s = new THREE.Sprite(mat);
      s.position.copy(at);
      s.scale.setScalar(0.32);
      const vx = (Math.random() - 0.5) * 6, vy = Math.random() * 4, vz = (Math.random() - 0.5) * 6;
      this.add(s, 0.4, (it, k, age) => {
        it.obj.position.x += vx * 0.016; it.obj.position.y += vy * 0.016 - age * 0.12; it.obj.position.z += vz * 0.016;
        it.obj.material.opacity = k;
      });
    }
  }

  crashAt(pos, intensity) {
    this.sparks(new THREE.Vector3(pos.x, 0.9, pos.z), Math.min(12, 4 + intensity));
    if (this.onCrash) this.onCrash(intensity);
  }

  update(dt) {
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 30);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      const age = it.maxLife - it.life;
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        if (it.obj.geometry) it.obj.geometry.dispose();
        if (it.obj.material) it.obj.material.dispose();
        this.items.splice(i, 1);
      } else if (it.tick) it.tick(it, it.life / it.maxLife, age);
    }
  }
}

// -----------------------------------------------------------------------------
// Rivals: hostile figures missions spawn. They close to firing range, shoot
// in bursts and fall where they drop.
// -----------------------------------------------------------------------------
export class Rival {
  constructor(scene, x, z, opts = {}) {
    this.mesh = makePersonMesh({ shirt: opts.shirt || 0x8e2434, skin: 0x8d5524, pants: 0x1d1d26, cap: 0x8e2434 });
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.health = opts.health || 60;
    this.alive = true;
    this.heading = Math.random() * Math.PI * 2;
    this.burst = 0;
    this.cooldown = Math.random() * 0.8;
    this.alerted = !!opts.alerted;
    this.deadTime = 0;
  }
  get pos() { return this.mesh.position; }
}

export class Combat {
  constructor(scene, effects, audio) {
    this.scene = scene;
    this.effects = effects;
    this.audio = audio;
    this.weapons = WEAPONS;
    this.owned = new Set(['fists']);
    this.current = 0;              // index into WEAPONS (fists)
    this.cooldown = 0;
    this.rivals = [];
    this.onCrime = null;           // (kind, pos) wired by main.js
    this.onKill = null;            // (rival) wired by main.js
    this.aimPoint = new THREE.Vector3();
  }

  get weapon() { return this.weapons[this.current]; }

  unlockGuns() { this.owned.add('kestrel'); this.owned.add('brute'); }

  spawnRival(x, z, opts) {
    const r = new Rival(this.scene, x, z, opts);
    this.rivals.push(r);
    return r;
  }

  clearRivals() {
    for (const r of this.rivals) this.scene.remove(r.mesh);
    this.rivals = [];
  }

  selectBySlot(slot) {
    const idx = this.weapons.findIndex((w) => w.slot === slot);
    if (idx >= 0 && this.owned.has(this.weapons[idx].id)) {
      this.current = idx;
      this.audio.blip(520, 0.05, 0.08, 'square');
    }
  }

  // The point the crosshair is over: from the camera, through screen centre.
  computeAim(camera, world) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const origin = camera.position.clone();
    let best = origin.clone().addScaledVector(dir, this.weapon.range);
    let bestDist = this.weapon.range;
    for (const r of this.rivals) {
      if (!r.alive) continue;
      const to = new THREE.Vector3().subVectors(new THREE.Vector3(r.pos.x, 1.2, r.pos.z), origin);
      const along = to.dot(dir);
      if (along < 0 || along > bestDist) continue;
      const closest = origin.clone().addScaledVector(dir, along);
      const off = closest.distanceTo(new THREE.Vector3(r.pos.x, 1.2, r.pos.z));
      if (off < 0.85) { bestDist = along; best = new THREE.Vector3(r.pos.x, 1.2, r.pos.z); best._rival = r; }
    }
    this.aimPoint.copy(best);
    return best;
  }

  tryAttack(dt, input, player, camera) {
    this.cooldown -= dt;
    if (player.inCar || player.inBoat) return;
    const w = this.weapon;
    const trigger = w.id === 'fists' ? input.attackFresh() : input.attackHeld();
    if (!trigger || this.cooldown > 0) return;
    this.cooldown = w.cooldown;
    const from = new THREE.Vector3(player.pos.x, 1.45, player.pos.z)
      .add(new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading)).multiplyScalar(0.5));
    if (w.id === 'fists') {
      this.audio.blip(180, 0.06, 0.1, 'sine');
      for (const r of this.rivals) {
        if (!r.alive) continue;
        if (r.pos.distanceTo(player.pos) < w.range) {
          this.damageRival(r, w.damage, player);
          r.alerted = true;
        }
      }
      return;
    }
    this.audio.shot(w.id);
    const hit = this.computeAim(camera, null);
    this.effects.muzzle(from);
    for (let p = 0; p < w.pellets; p++) {
      const end = hit.clone();
      if (w.pellets > 1 || w.spread > 0) {
        end.x += (Math.random() - 0.5) * w.spread * 60;
        end.y += (Math.random() - 0.5) * w.spread * 30;
        end.z += (Math.random() - 0.5) * w.spread * 60;
      }
      this.effects.tracer(from, end);
      if (hit._rival && p === 0) { this.damageRival(hit._rival, w.damage, player); hit._rival.alerted = true; }
    }
    if (this.onCrime) this.onCrime('gunshot', player.pos);
  }

  damageRival(r, amount, player) {
    if (!r.alive) return;
    r.health -= amount;
    this.effects.sparks(new THREE.Vector3(r.pos.x, 1.3, r.pos.z), 3);
    if (r.health <= 0) {
      r.alive = false;
      r.deadTime = 0;
      r.mesh.rotation.x = -Math.PI / 2;
      r.mesh.position.y = 0.25;
      if (this.onKill) this.onKill(r);
      if (this.onCrime) this.onCrime('down', r.pos);
    }
  }

  update(dt, player, world) {
    for (const r of this.rivals) {
      if (!r.alive) { r.deadTime += dt; continue; }
      const dist = r.pos.distanceTo(player.pos);
      if (dist < 55) r.alerted = true;
      if (!r.alerted) continue;
      const want = Math.atan2(player.pos.x - r.pos.x, player.pos.z - r.pos.z);
      let diff = want - r.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      r.heading += THREE.MathUtils.clamp(diff, -4 * dt, 4 * dt);
      r.mesh.rotation.y = r.heading;
      if (dist > 17) {
        r.pos.x += Math.sin(r.heading) * 3.4 * dt;
        r.pos.z += Math.cos(r.heading) * 3.4 * dt;
        world.collide(r.pos, 0.55);
        animatePerson(r.mesh, dt, 3.4);
      } else {
        // Fire in bursts at the player, wildly inaccurate at range.
        r.cooldown -= dt;
        if (r.cooldown <= 0) {
          r.burst++;
          r.cooldown = r.burst % 4 === 0 ? 1.1 + Math.random() * 0.5 : 0.24;
          const from = new THREE.Vector3(r.pos.x, 1.45, r.pos.z);
          const to = new THREE.Vector3(player.pos.x, 1.2, player.pos.z);
          to.x += (Math.random() - 0.5) * (dist * 0.14);
          to.z += (Math.random() - 0.5) * (dist * 0.14);
          this.effects.tracer(from, to, 0xff9a7a);
          this.audio.shot('kestrel');
          const hitChance = THREE.MathUtils.clamp(0.34 - dist * 0.006, 0.06, 0.3);
          if (Math.random() < hitChance && !player.inCar) player.hurt(6);
          else if (Math.random() < hitChance * 0.6 && player.inCar) player.hurt(2);
        }
      }
    }
    // Bodies fade after a while so the streets stay clean.
    for (let i = this.rivals.length - 1; i >= 0; i--) {
      const r = this.rivals[i];
      if (!r.alive && r.deadTime > 25) {
        this.scene.remove(r.mesh);
        this.rivals.splice(i, 1);
      }
    }
  }
}
