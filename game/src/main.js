// main.js — SOLMAR HEAT's conductor. It builds the renderer and every
// system, owns the mode machine (title / play / dossier), the per-frame
// update order, entering and leaving cars and the boat, crime detection,
// busted and wasted sequences, saving and loading, and the deterministic
// ?shot= staging the screenshots are taken from.

import { THREE } from './three.js';
import { WORLD, START_HOUR, DAY_LENGTH_SECONDS } from './config.js';
import { Rng, queryParams } from './rng.js';
import { Input } from './input.js';
import { GameAudio } from './audio.js';
import { World } from './world.js';
import { Traffic, spawnParkedCars, Boat } from './vehicles.js';
import { Pedestrians } from './pedestrians.js';
import { Player } from './player.js';
import { Effects, Combat } from './combat.js';
import { Police } from './police.js';
import { Crew } from './crew.js';
import { Collectibles } from './collectibles.js';
import { CareerStats } from './stats.js';
import { SaveSystem } from './save.js';
import { MissionDirector } from './missions.js';
import { Hud } from './hud.js';
import { stageShot } from './shots.js';

window.__PAGE_ERRORS = [];
window.addEventListener('error', (e) => window.__PAGE_ERRORS.push(String(e.message || e.error)));

class Game {
  constructor() {
    const { seed, shot } = queryParams();
    this.seed = seed;
    this.shotName = shot;
    this.rng = new Rng(seed ^ 0x6a17);
    this.mode = 'title';
    this.promptText = '';
    this.shotPrompt = '';
    this.shotCamera = null;
    this.hour = START_HOUR;
    this.crimeCooldown = 0;
    this.respawnTimer = 0;
    this.extraCars = [];

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('outputEncoding' in this.renderer) this.renderer.outputEncoding = THREE.sRGBEncoding;
    document.getElementById('game-root').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2600);
    this.camera.position.set(30, 60, 700);

    this.input = new Input(this.renderer.domElement);
    this.audio = new GameAudio();
    this.world = new World(this.scene, seed);
    this.effects = new Effects(this.scene);
    this.effects.onCrash = (i) => this.audio.crash(i / 10);
    this.traffic = new Traffic(this.scene, this.world, seed);
    this.parkedCars = spawnParkedCars(this.scene, seed);
    this.pedestrians = new Pedestrians(this.scene, seed);
    this.player = new Player(this.scene);
    this.combat = new Combat(this.scene, this.effects, this.audio);
    this.police = new Police(this.scene, this.world, this.effects, this.audio);
    this.crew = new Crew(this.scene, this.audio, this.police);
    this.collectibles = new Collectibles(this.scene, this.world, this.audio);
    this.stats = new CareerStats();
    this.saves = new SaveSystem();
    this.missions = new MissionDirector(this);
    this.hud = new Hud(this);
    this.boat = new Boat(this.scene, this.world.escapeBoat);
    this.world.scene = this.scene;

    this.wireEvents();
    this.setHour(this.hour);
    document.body.dataset.mode = this.mode;

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    if (this.shotName) this.prepareShot();
    else {
      this.hud.showTitle();
      this.lastTime = performance.now();
      requestAnimationFrame((t) => this.frame(t));
    }
  }

  // --- hooks the subsystems call -------------------------------------------------
  say(name, text) { this.hud.say(name, text); }
  toast(text) { this.hud.toast(text); }

  setHour(h) {
    this.hour = ((h % 24) + 24) % 24;
    this.world.setHour(this.hour);
  }

  wireEvents() {
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });

    this.combat.onCrime = (kind, pos) => {
      if (kind === 'gunshot') {
        this.police.addHeat(0.45, pos);
        this.pedestrians.scareAround(pos, 20);
      } else if (kind === 'down') {
        this.police.addHeat(0.35, pos);
      }
    };
    this.combat.onKill = () => {
      this.stats.takedowns++;
      this.stats.rp += 6;
    };
    this.collectibles.onStar = (count) => {
      this.stats.starsFound = count;
      this.stats.rp += 10;
      if (count === 20) this.toast('Every golden star in Solmar Bay — found');
      else this.toast(`Golden star ${count} of 20`);
    };
    this.collectibles.onStunt = (metres) => {
      this.stats.stunts++;
      this.stats.longestLeap = Math.max(this.stats.longestLeap, metres);
      this.stats.cash += 40;
      this.toast(`Stunt jump: ${metres} m (+$40)`);
      this.audio.cash();
    };
    this.crew.onAbility = (def) => {
      this.stats.useAbility(def.id);
      this.toast(`${def.name.split(' ')[0]}: ${def.ability}!`);
    };
    this.police.onBusted = () => this.busted();

    document.getElementById('btn-continue').addEventListener('click', () => {
      this.audio.unlock();
      const sums = this.saves.summaries();
      let best = -1, bestTime = 0;
      sums.forEach((s, i) => { if (!s.empty && s.when.getTime() > bestTime) { bestTime = s.when.getTime(); best = i; } });
      if (best >= 0) this.loadFromSlot(best, true);
      this.startPlay();
    });
    document.getElementById('btn-new').addEventListener('click', () => {
      this.audio.unlock();
      this.resetCareer();
      this.startPlay();
    });
    document.getElementById('btn-resume').addEventListener('click', () => this.toggleDossier(false));
    document.getElementById('btn-quit-title').addEventListener('click', () => {
      this.toggleDossier(false);
      this.mode = 'title';
      document.body.dataset.mode = 'title';
      this.hud.showTitle();
    });
    document.getElementById('title-slots').addEventListener('click', (e) => {
      const card = e.target.closest('.slot-card');
      if (!card) return;
      const i = [...card.parentNode.children].indexOf(card);
      const data = this.saves.read(i);
      if (data) { this.loadFromSlot(i, true); this.startPlay(); }
    });
  }

  resetCareer() {
    this.stats.reset();
    this.collectibles.restoreTaken([]);
    this.police.clearHeat();
    this.combat.clearRivals();
    this.missions.current = null;
    this.missions.freeTimer = 2;
    this.player.pos.set(6, 0, 492);
    this.player.health = 100;
    this.player.dead = false;
  }

  startPlay() {
    this.mode = 'play';
    document.body.dataset.mode = 'play';
    this.hud.hideTitle();
    if (this.missions.freeTimer > 4) this.missions.freeTimer = 2;
  }

  toggleDossier(open) {
    if (open) {
      this.mode = 'dossier';
      this.hud.showDossier();
    } else {
      this.mode = 'play';
      this.hud.hideDossier();
    }
    document.body.dataset.mode = this.mode;
    this.audio.blip(open ? 440 : 660, 0.06, 0.08, 'square');
  }

  saveToSlot(slot) {
    if (this.saves.write(slot, this.stats, this.collectibles.takenIndices())) {
      this.toast(`Saved to slot ${slot + 1}`);
      this.audio.success();
      this.hud.renderDossier();
    } else {
      this.toast('Saving is unavailable in this browser');
    }
  }

  loadFromSlot(slot, silent = false) {
    const data = this.saves.read(slot);
    if (!data) return;
    this.stats.deserialize(data.stats);
    this.collectibles.restoreTaken(data.starsTaken);
    this.police.clearHeat();
    this.combat.clearRivals();
    this.exitVehicle(true);
    this.player.pos.set(6, 0, 492);
    this.player.health = 100;
    this.player.dead = false;
    this.missions.current = null;
    this.missions.freeTimer = 1.5;
    if (!silent) { this.toast(`Loaded slot ${slot + 1}`); this.hud.renderDossier(); }
  }

  // --- vehicles ---------------------------------------------------------------------
  allCars() {
    const police = this.police.units.filter((u) => u.kind === 'car').map((u) => u.car);
    const blocks = this.police.units.filter((u) => u.kind === 'block').flatMap((u) => u.cars);
    return [...this.traffic.cars, ...this.parkedCars, ...this.extraCars, ...police, ...blocks];
  }

  nearestCar(maxDist) {
    let best = null, bestD = maxDist;
    for (const car of this.allCars()) {
      if (car.dead || car.isPolice) continue;
      const d = car.pos.distanceTo(this.player.pos);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  enterCar(car) {
    const wasParked = car.parked;
    car.parked = false;
    const ti = this.traffic.cars.indexOf(car);
    if (ti >= 0) { this.traffic.cars.splice(ti, 1); this.extraCars.push(car); }
    this.player.inCar = car;
    this.player.heading = car.heading;
    this.player.camYaw = car.heading;
    // A theft seen by anyone nearby is a crime.
    const witnessed = this.pedestrians.list.some((p) => p.pos.distanceTo(car.pos) < 26) ||
      this.police.units.some((u) => {
        const p = this.police.unitPos(u);
        return Math.hypot(p.x - car.pos.x, p.z - car.pos.z) < 45;
      });
    if (wasParked || ti >= 0) {
      this.stats.carsStolen++;
      if (witnessed) this.police.addHeat(0.7, car.pos);
    }
    this.audio.blip(300, 0.07, 0.1, 'square');
  }

  exitVehicle(silent = false) {
    const car = this.player.inCar;
    if (car) {
      car.parked = true;
      car.speed = 0;
      const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
      this.player.pos.copy(car.pos).addScaledVector(side, 2.6);
      this.player.pos.y = 0;
      this.player.inCar = null;
      if (!silent) this.audio.blip(240, 0.06, 0.08, 'square');
    }
    if (this.player.inBoat) {
      this.player.inBoat = false;
      this.boat.active = false;
      this.player.pos.set(WORLD.marinaX + 128, 0, 140);
    }
  }

  boardBoat() {
    this.player.inBoat = true;
    this.boat.active = true;
    this.boat.heading = Math.PI / 2;
    this.toast('Boat started — run south-east for the buoy');
    this.audio.blip(340, 0.08, 0.1, 'square');
  }

  busted() {
    if (this.respawnTimer > 0) return;
    this.respawnTimer = 2.4;
    this.respawnKind = 'BUSTED';
    const fine = Math.round(this.stats.cash * 0.08);
    this.stats.cash -= fine;
    this.hud.setWasted(`BUSTED — $${fine} fine`);
    this.audio.fail();
    this.police.clearHeat();
  }

  wasted() {
    if (this.respawnTimer > 0) return;
    this.respawnTimer = 2.4;
    this.respawnKind = 'WASTED';
    const fee = Math.min(200, this.stats.cash);
    this.stats.cash -= fee;
    this.hud.setWasted('WASTED');
    this.audio.fail();
    if (this.missions.current && this.missions.current.story) {
      this.missions.failMission('You were wasted — the job resets');
    }
  }

  finishRespawn() {
    this.hud.setWasted(null);
    this.exitVehicle(true);
    this.player.dead = false;
    this.player.health = 100;
    this.player.pos.set(this.respawnKind === 'BUSTED' ? -64 : 12, 0, this.respawnKind === 'BUSTED' ? 452 : -24);
    this.player.camYaw = Math.PI;
  }

  // --- shot staging ---------------------------------------------------------------------
  prepareShot() {
    this.mode = 'play';
    document.body.dataset.mode = 'play';
    this.input.enabled = false;
    // Eight seconds of city life so traffic and crowds are mid-routine.
    for (let i = 0; i < 240; i++) this.step(1 / 30, true);
    stageShot(this, this.shotName);
    document.body.dataset.mode = this.mode;
    this.step(1 / 30, true);
    this.render();
    window.__SHOT_READY = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  // --- the frame -------------------------------------------------------------------------
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, (now - this.lastTime) / 1000 || 0.016);
    this.lastTime = now;
    if (this.mode === 'play') this.step(dt, false);
    else {
      // Title and dossier still show a living city behind their panels.
      this.world.update(dt, this.player.pos);
      this.traffic.update(dt, this.world, this.effects, this.allCars());
      this.pedestrians.update(dt, this.world);
      this.effects.update(dt);
      if (this.mode === 'title' && !this.shotCamera) {
        const t = now * 0.00004;
        this.camera.position.set(Math.sin(t) * 700, 260, Math.cos(t) * 700);
        this.camera.lookAt(0, 0, 0);
      }
    }
    this.render();
    this.input.endFrame();
  }

  render() {
    if (this.shotCamera) {
      this.camera.position.copy(this.shotCamera.pos);
      this.camera.lookAt(this.shotCamera.look);
    }
    this.renderer.render(this.scene, this.camera);
  }

  step(dt, staging) {
    const { player, input } = this;
    this.crimeCooldown = Math.max(0, this.crimeCooldown - dt);
    this.stats.playSeconds += dt;

    // Day cycle.
    this.setHour(this.hour + dt * 24 / DAY_LENGTH_SECONDS);

    // Pause / dossier toggle.
    if (!staging && input.pressed('Tab', 'KeyP', 'Escape')) {
      this.toggleDossier(this.mode === 'play');
      return;
    }

    // Respawn sequences run the clock but not the controls.
    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.finishRespawn();
    }
    const frozen = this.respawnTimer > 0;

    // --- the player and his vehicles -------------------------------------
    if (!frozen) {
      if (player.inBoat) {
        const { forward, strafe } = { forward: (input.held('KeyW') ? 1 : 0) - (input.held('KeyS') ? 1 : 0), strafe: (input.held('KeyD') ? 1 : 0) - (input.held('KeyA') ? 1 : 0) };
        this.boat.drive(dt, forward, -strafe);
        player.pos.copy(this.boat.pos);
        player.mesh.visible = false;
        this.audio.setEngine(true, Math.abs(this.boat.speed) / 26, Math.abs(this.boat.speed) / 26);
      } else if (player.inCar) {
        const car = player.inCar;
        const throttle = (input.held('KeyW', 'ArrowUp') ? 1 : 0) - (input.held('KeyS', 'ArrowDown') ? 1 : 0);
        const steer = (input.held('KeyA', 'ArrowLeft') ? 1 : 0) - (input.held('KeyD', 'ArrowRight') ? 1 : 0);
        const impact = car.drive(dt, throttle, steer, this.world, input.held('Space'));
        player.heading = car.heading;
        // The camera swings behind the car as it gathers speed.
        let diff = car.heading - player.camYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        player.camYaw += diff * Math.min(1, dt * (Math.abs(car.speed) > 4 ? 2.6 : 0.8));
        player.camPitch = THREE.MathUtils.lerp(player.camPitch, 0.3, dt * 2);
        const carImpact = car.collideCars(this.allCars(), dt);
        const hit = Math.max(impact, carImpact);
        if (hit > 9 && this.crimeCooldown <= 0) {
          this.police.addHeat(0.3, car.pos);
          this.crimeCooldown = 1.6;
        }
        this.stats.distanceKm += Math.abs(car.speed) * dt / 1000;
        this.audio.setEngine(true, Math.abs(throttle) * 0.7 + Math.abs(car.speed) / car.model.topSpeed * 0.5, Math.abs(car.speed) / car.model.topSpeed);
        car.updateSmoke(dt, this.effects);
        // Running a pedestrian down is the city's worst everyday crime.
        for (const p of this.pedestrians.list) {
          if (Math.abs(car.speed) > 6 && p.pos.distanceTo(car.pos) < 2.4 && !p.knocked) {
            p.knocked = true;
            p.mesh.rotation.x = -Math.PI / 2;
            p.mesh.position.y = 0.2;
            this.police.addHeat(1.1, car.pos);
            this.audio.crash(0.5);
          } else if (Math.abs(car.speed) > 8 && p.pos.distanceTo(car.pos) < 9) p.scare(car.pos);
        }
      } else {
        player.update(dt, input, this.world);
        this.audio.setEngine(false, 0, 0);
      }
    }

    // --- interaction prompts and the E key --------------------------------
    this.promptText = this.shotPrompt || '';
    if (!frozen && !staging) {
      if (player.inBoat) {
        const pierDist = Math.hypot(player.pos.x - (WORLD.marinaX + 128), player.pos.z - 140);
        if (pierDist < 16) this.promptText = 'E — Step back onto the pier';
        if (input.pressed('KeyE') && pierDist < 16) this.exitVehicle();
      } else if (player.inCar) {
        this.promptText = 'E — Step out · Space — brake · T — radio';
        if (input.pressed('KeyE', 'KeyF')) this.exitVehicle();
        if (input.pressed('KeyT')) {
          const name = this.audio.setStation((this.audio.station + 1) % 4);
          this.toast(name);
        }
      } else {
        const car = this.nearestCar(3.6);
        const boatNear = this.missions.wantsBoat() &&
          player.pos.distanceTo(this.world.escapeBoat.position) < 7;
        if (boatNear) this.promptText = 'E — Board the escape boat';
        else if (car) this.promptText = `E — Drive the ${car.model.name}`;
        if (input.pressed('KeyE', 'KeyF')) {
          if (boatNear) this.boardBoat();
          else if (car) this.enterCar(car);
        }
      }
    }

    // --- combat --------------------------------------------------------------
    if (!frozen) {
      if (!staging && input.pressed('Digit1')) this.combat.selectBySlot('1');
      if (!staging && input.pressed('Digit2')) this.combat.selectBySlot('2');
      if (!staging && input.pressed('Digit3')) this.combat.selectBySlot('3');
      this.combat.tryAttack(dt, staging ? this.silentInput() : input, player, this.camera);
      this.combat.update(dt, player, this.world);
    }

    // --- the living city ---------------------------------------------------------
    this.traffic.update(dt, this.world, this.effects, this.allCars());
    this.pedestrians.update(dt, this.world);
    this.police.update(dt, player, this.effects);
    this.crew.update(dt, staging ? null : input, this);
    this.collectibles.update(dt, player);
    this.missions.update(dt);
    this.world.update(dt, player.inCar ? player.inCar.pos : player.pos);
    this.effects.update(dt);

    // --- camera ----------------------------------------------------------------------
    if (!this.shotCamera) {
      const focus = player.inBoat ? this.boat.pos : player.inCar ? player.inCar.pos : player.pos;
      const heading = player.inBoat ? this.boat.heading : player.inCar ? player.inCar.heading : player.heading;
      if (player.inBoat) {
        player.camYaw = this.boat.heading;
        const back = new THREE.Vector3(
          focus.x - Math.sin(player.camYaw) * 13, focus.y + 5.5, focus.z - Math.cos(player.camYaw) * 13);
        this.camera.position.lerp(back, 1 - Math.pow(0.001, dt));
        this.camera.lookAt(focus.x, focus.y + 2, focus.z);
      } else {
        player.placeCamera(this.camera, focus, heading, dt);
      }
    }

    // --- HUD ----------------------------------------------------------------------------
    if (this.mode === 'play') this.hud.update(dt);

    // Death check.
    if (player.dead && this.respawnTimer <= 0) this.wasted();
  }

  silentInput() {
    return {
      held: () => false, pressed: () => false,
      attackHeld: () => false, attackFresh: () => false,
      mouseDX: 0, mouseDY: 0,
    };
  }
}

window.addEventListener('DOMContentLoaded', () => new Game());
