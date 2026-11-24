// player.js — Ren Kadir on foot: third-person movement relative to the
// camera, sprinting, a small hop, health and the figure itself. Driving
// lives in vehicles.js; this file only owns the walker and his camera rig.

import { THREE } from './three.js';
import { makePersonMesh, animatePerson } from './pedestrians.js';
import { moveAxes } from './input.js';

export class Player {
  constructor(scene) {
    this.mesh = makePersonMesh({ shirt: 0x0fa3a3, skin: 0xc68863, pants: 0x22223b, cap: 0x14323e });
    this.mesh.position.set(6, 0, 492);      // the Strand boardwalk
    scene.add(this.mesh);
    this.heading = Math.PI;                  // facing the city
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.speed = 0;
    this.vy = 0;
    this.health = 100;
    this.inCar = null;                       // a Car while driving, else null
    this.inBoat = false;
    this.dead = false;
    this.hurtFlash = 0;
  }

  get pos() { return this.mesh.position; }

  hurt(amount) {
    if (this.dead) return;
    this.health -= amount;
    this.hurtFlash = 0.35;
    if (this.health <= 0) { this.health = 0; this.dead = true; }
  }

  heal(amount) { this.health = Math.min(100, this.health + amount); }

  update(dt, input, world) {
    if (this.inCar || this.inBoat) {
      // Ride along hidden inside the vehicle; the camera is the car's.
      this.mesh.visible = false;
      if (this.inCar) this.pos.copy(this.inCar.pos);
      return;
    }
    this.mesh.visible = true;
    // Camera orbit from the mouse; the character turns toward travel.
    this.camYaw -= input.mouseDX * 0.0032;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + input.mouseDY * 0.0026, -0.12, 1.05);

    const { forward, strafe } = moveAxes(input);
    const sprint = input.held('ShiftLeft', 'ShiftRight');
    const moving = forward !== 0 || strafe !== 0;
    const wantSpeed = moving ? (sprint ? 8.4 : 4.6) : 0;
    this.speed = THREE.MathUtils.lerp(this.speed, wantSpeed, 1 - Math.pow(0.000001, dt));
    if (moving) {
      const moveAng = this.camYaw - Math.atan2(strafe, forward);
      const targetHeading = moveAng;
      let diff = targetHeading - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += THREE.MathUtils.clamp(diff, -11 * dt, 11 * dt);
      this.pos.x += Math.sin(moveAng) * this.speed * dt;
      this.pos.z += Math.cos(moveAng) * this.speed * dt;
    }
    if (input.pressed('Space') && this.pos.y <= 0.01) this.vy = 4.6;
    this.vy -= 14 * dt;
    this.pos.y = Math.max(0, this.pos.y + this.vy * dt);
    world.collide(this.pos, 0.6);
    this.mesh.rotation.y = this.heading;
    animatePerson(this.mesh, dt, this.speed);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    if (this.health > 0 && this.health < 100) this.heal(dt * 1.6);   // slow recovery
  }

  // Place the camera for the current mode and return where it ended up.
  placeCamera(camera, focusPos, focusHeading, dt, smoothing = 7) {
    let dist = 8.5, height = 3.4;
    if (this.inCar) { dist = 11.5; height = 4.4; }
    const back = new THREE.Vector3(
      focusPos.x - Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist,
      focusPos.y + height + Math.sin(this.camPitch) * dist * 0.6,
      focusPos.z - Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist);
    const k = 1 - Math.pow(0.0001, dt * smoothing / 7);
    camera.position.lerp(back, this._camInit ? k : 1);
    this._camInit = true;
    camera.lookAt(focusPos.x, focusPos.y + 2.1, focusPos.z);
    return camera.position;
  }

  // When driving starts, swing the camera behind the car.
  syncCamToHeading() {
    this.camYaw = this.heading;
  }
}
