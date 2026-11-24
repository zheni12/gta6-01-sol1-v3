// crew.js — Mira, Theo and Kiki: the three specialists whose abilities
// ride the Q, R and C keys, and the figures who trail Ren around the city
// when he is on foot. Each ability is a timed effect other systems read:
// police.js honours Ghost Plates, vehicles read the Quick Fix repair,
// and the HUD minimap honours Eyes Out.

import { THREE } from './three.js';
import { CREW } from './config.js';
import { makePersonMesh, animatePerson } from './pedestrians.js';

const LOOKS = [
  { shirt: 0xe2563e, skin: 0x8d5524, pants: 0x2b2d42, cap: null },        // Mira
  { shirt: 0x707880, skin: 0xf2c79b, pants: 0x3a3f4a, cap: 0x333333 },    // Theo
  { shirt: 0xf2b21b, skin: 0x6b4423, pants: 0x22223b, cap: null },        // Kiki
];

export class Crew {
  constructor(scene, audio, police) {
    this.audio = audio;
    this.police = police;
    this.members = CREW.map((def, i) => ({
      def,
      mesh: makePersonMesh(LOOKS[i]),
      cooldownLeft: 0,
      activeLeft: 0,
      heading: 0,
    }));
    for (const [i, m] of this.members.entries()) {
      m.mesh.position.set(3 + i * 1.6, 0, 496 + (i % 2) * 1.6);
      scene.add(m.mesh);
    }
    this.repairCar = null;      // set while Quick Fix is working
    this.repairLeft = 0;
    this.onAbility = null;      // (member) for the HUD toast, wired by main
  }

  get eyesActive() {
    const kiki = this.members[2];
    return kiki.activeLeft > 0;
  }

  tryActivate(i, game) {
    const m = this.members[i];
    if (!m || m.cooldownLeft > 0) return false;
    m.cooldownLeft = m.def.cooldown;
    this.audio.blip(740 + i * 120, 0.09, 0.12, 'triangle');
    if (m.def.id === 'mira') {
      m.activeLeft = 10;
      this.police.ghostUntil = this.police.time + 10;
    } else if (m.def.id === 'theo') {
      if (game.player.inCar) {
        this.repairCar = game.player.inCar;
        this.repairLeft = 3;
        m.activeLeft = 3;
      } else {
        m.cooldownLeft = 2;     // nothing to fix on foot: short reset
        return false;
      }
    } else if (m.def.id === 'kiki') {
      m.activeLeft = 12;
    }
    if (this.onAbility) this.onAbility(m.def);
    return true;
  }

  update(dt, input, game) {
    if (input) {
      for (let i = 0; i < this.members.length; i++) {
        if (input.pressed(this.members[i].def.key)) this.tryActivate(i, game);
      }
    }
    for (const m of this.members) {
      m.cooldownLeft = Math.max(0, m.cooldownLeft - dt);
      m.activeLeft = Math.max(0, m.activeLeft - dt);
    }
    if (this.repairLeft > 0 && this.repairCar) {
      this.repairLeft -= dt;
      this.repairCar.health = Math.min(100, this.repairCar.health + dt * 34);
      if (this.repairLeft <= 0) this.repairCar = null;
    }
    // Figures: trail the player on foot, ride hidden while he drives.
    const player = game.player;
    for (const [i, m] of this.members.entries()) {
      m.mesh.visible = !player.inCar && !player.inBoat;
      if (!m.mesh.visible) continue;
      const back = new THREE.Vector3(
        player.pos.x - Math.sin(player.heading) * (2.2 + i * 0.7) + (i - 1) * 1.5,
        0,
        player.pos.z - Math.cos(player.heading) * (2.2 + i * 0.7));
      const d = m.mesh.position.distanceTo(back);
      if (d > 26) { m.mesh.position.copy(back); continue; }
      if (d > 1.1) {
        const want = Math.atan2(back.x - m.mesh.position.x, back.z - m.mesh.position.z);
        let diff = want - m.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        m.heading += THREE.MathUtils.clamp(diff, -6 * dt, 6 * dt);
        const speed = Math.min(7.5, d * 1.6);
        m.mesh.position.x += Math.sin(m.heading) * speed * dt;
        m.mesh.position.z += Math.cos(m.heading) * speed * dt;
        m.mesh.rotation.y = m.heading;
        animatePerson(m.mesh, dt, speed);
      }
    }
  }

  // Rows for the HUD crew panel.
  panelRows() {
    return this.members.map((m) => ({
      name: m.def.name, role: m.def.role, ability: m.def.ability, keyLabel: m.def.keyLabel,
      cooldownLeft: m.cooldownLeft, cooldown: m.def.cooldown, active: m.activeLeft > 0,
    }));
  }
}
