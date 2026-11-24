// missions.js — the story of SOLMAR HEAT and the work that follows it.
// A MissionDirector runs one job at a time: the seven chained story
// missions for Madame Okafor, then an endless rotation of courier and
// sprint jobs in free roam. Each job is a list of stages; a stage carries
// an objective line, a world marker and a check that advances the story.
//
// The director talks to the rest of the game through the `game` object
// main.js hands it (player, police, combat, stats, world, audio, and the
// say/toast hooks into the HUD), so this file holds story logic only.

import { THREE } from './three.js';
import { STORY_MISSIONS, WORLD, districtAt } from './config.js';
import { Car } from './vehicles.js';
import { CAR_MODELS } from './config.js';

const DROP_POINT = { x: 96, z: -104 };            // Okafor's downtown garage
const SAFEHOUSE = { x: -64, z: 452 };             // a Strand beach house
const OVERLOOK = { x: -436, z: -548 };            // the Heights viewpoint

export class MissionDirector {
  constructor(game) {
    this.game = game;
    this.current = null;          // {def, stageIdx, elapsed, data}
    this.marker = null;           // {x, z, label} for HUD + pillar
    this.freeTimer = 3;           // pause between free-roam jobs
    this.wasHot = 0;              // for cops-escaped counting
    this.buildMarkerMesh();
  }

  buildMarkerMesh() {
    const g = this.game;
    const geo = new THREE.CylinderGeometry(2.6, 2.6, 60, 18, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd23e, transparent: true, opacity: 0.3,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.pillar = new THREE.Mesh(geo, mat);
    this.pillar.position.y = 30;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.6),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    this.gem = gem;
    this.pillar.visible = this.gem.visible = false;
    g.world.scene.add(this.pillar);
    g.world.scene.add(this.gem);
  }

  // --- lifecycle ---------------------------------------------------------------
  startNext() {
    const stats = this.game.stats;
    const def = STORY_MISSIONS[stats.storyCount];
    if (def) this.startStory(def);
    else this.startCourier();
  }

  startStory(def) {
    this.current = { def, stageIdx: 0, elapsed: 0, data: {}, story: true };
    const build = STORY_BUILDERS[def.id];
    this.current.stages = build(this);
    this.enterStage(0);
    this.game.toast(`New mission: ${def.title}`);
  }

  startCourier() {
    const g = this.game;
    const rng = g.rng;
    const roadside = () => {
      const a = WORLD.avenues[rng.int(0, WORLD.avenues.length - 1)];
      const s = WORLD.streets[rng.int(0, WORLD.streets.length - 1)];
      return rng.chance(0.5) ? { x: a + 16, z: s + rng.range(-40, 40) } : { x: a + rng.range(-40, 40), z: s + 16 };
    };
    const sprint = rng.chance(0.22);
    const from = roadside();
    const to = roadside();
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    const def = { id: 'courier', title: sprint ? 'Sprint Job' : 'Courier Job', cash: Math.round(120 + dist * 0.55), rp: 25 };
    this.current = { def, stageIdx: 0, elapsed: 0, data: { sprint }, story: false };
    const stages = [
      {
        objective: sprint ? 'Reach the start point' : 'Pick up the package',
        marker: () => from,
        check: () => this.near(from, 10),
      },
      {
        objective: sprint ? `Beat the clock: ${Math.round(dist / 9)} seconds` : 'Deliver the package',
        marker: () => to,
        setup: () => { if (sprint) this.current.data.timeLeft = dist / 9 + 25; },
        check: () => this.near(to, 11),
        tick: (dt) => {
          if (!sprint) return false;
          this.current.data.timeLeft -= dt;
          return this.current.data.timeLeft <= 0;   // true = failed
        },
      },
    ];
    this.current.stages = stages;
    this.enterStage(0);
    this.game.toast(sprint ? 'Sprint job on the map' : 'Courier job on the map');
  }

  enterStage(idx) {
    const cur = this.current;
    cur.stageIdx = idx;
    const stage = cur.stages[idx];
    if (stage.setup) stage.setup();
    this.refreshMarker();
  }

  refreshMarker() {
    const cur = this.current;
    if (!cur) { this.marker = null; return; }
    const stage = cur.stages[cur.stageIdx];
    const m = stage.marker ? stage.marker() : null;
    this.marker = m ? { x: m.x, z: m.z, label: stage.objective } : null;
  }

  near(p, r) {
    const player = this.game.player;
    const focus = player.inCar ? player.inCar.pos : player.pos;
    return Math.hypot(focus.x - p.x, focus.z - p.z) < r;
  }

  failMission(reason) {
    const g = this.game;
    g.audio.fail();
    g.toast(reason);
    g.police.clearHeatFloor();
    if (this.current.story) {
      const def = this.current.def;
      this.startStory(def);
    } else {
      this.current = null;
      this.freeTimer = 4;
    }
  }

  completeCurrent() {
    const g = this.game;
    const cur = this.current;
    g.audio.success();
    g.audio.cash();
    if (cur.story) {
      const medal = g.stats.completeStoryMission(cur.def, cur.elapsed);
      g.toast(`${cur.def.title} complete — $${cur.def.cash} · ${medal.toUpperCase()} rating`);
      g.say('Madame Okafor', 'Good work, Ren. The bay is starting to know your name.');
      const d = districtAt(g.player.pos.x, g.player.pos.z);
      g.stats.workIn(d.id);
    } else {
      g.stats.cash += cur.def.cash;
      g.stats.rp += cur.def.rp;
      if (cur.data.sprint) { g.stats.racesWon++; g.toast(`Sprint won — $${cur.def.cash}`); }
      else { g.stats.courierDone++; g.toast(`Delivered — $${cur.def.cash}`); }
      const d = districtAt(g.player.pos.x, g.player.pos.z);
      g.stats.workIn(d.id);
    }
    g.police.clearHeatFloor();
    this.current = null;
    this.freeTimer = 5;
    this.marker = null;
    this.pillar.visible = this.gem.visible = false;
  }

  // --- per-frame -------------------------------------------------------------------
  update(dt) {
    const g = this.game;
    // Cops-escaped bookkeeping: heat that was real and is now gone.
    const stars = g.police.stars;
    if (stars >= 2) this.wasHot = stars;
    if (this.wasHot >= 2 && stars === 0 && !g.police.heatFloor) {
      g.stats.copsEscaped++;
      this.wasHot = 0;
      g.toast('You lost the SBPD');
    }
    if (!this.current) {
      this.freeTimer -= dt;
      if (this.freeTimer <= 0 && !g.player.dead) this.startNext();
      return;
    }
    const cur = this.current;
    cur.elapsed += dt;
    const stage = cur.stages[cur.stageIdx];
    if (stage.tick && stage.tick(dt)) { this.failMission('Out of time — the job resets'); return; }
    this.refreshMarker();
    if (this.marker) {
      this.pillar.visible = this.gem.visible = true;
      this.pillar.position.set(this.marker.x, 30, this.marker.z);
      this.gem.position.set(this.marker.x, 4.5 + Math.sin(performance.now() * 0.003) * 0.5, this.marker.z);
      this.gem.rotation.y += dt * 2;
    } else {
      this.pillar.visible = this.gem.visible = false;
    }
    if (stage.check && stage.check()) {
      if (cur.stageIdx + 1 >= cur.stages.length) this.completeCurrent();
      else this.enterStage(cur.stageIdx + 1);
    }
  }

  // HUD text: the current objective and its distance.
  objectiveInfo() {
    if (!this.current) return null;
    const stage = this.current.stages[this.current.stageIdx];
    let dist = null;
    if (this.marker) {
      const p = this.game.player;
      const focus = p.inCar ? p.inCar.pos : p.pos;
      dist = Math.round(Math.hypot(focus.x - this.marker.x, focus.z - this.marker.z));
    }
    let extra = '';
    if (this.current.data.sprint && this.current.stageIdx === 1) {
      extra = ` · ${Math.max(0, Math.ceil(this.current.data.timeLeft || 0))}s`;
    }
    if (this.current.data.showClock) extra = ` · ${this.current.data.showClock}s`;
    return { title: this.current.def.title, text: stage.objective, dist, extra };
  }

  // The Marina Job asks main.js to board the boat at the right moment.
  wantsBoat() {
    return !!(this.current && this.current.def.id === 'marina-job' && this.current.data.boatStage);
  }
}

// -----------------------------------------------------------------------------
// The seven story scripts. Each builder returns its stage list; closures
// keep per-mission state on `cur.data`.
// -----------------------------------------------------------------------------
const STORY_BUILDERS = {
  'first-wheels': (dir) => {
    const g = dir.game;
    const hero = () => g.parkedCars.find((c) => c.isHeroCoupe);
    return [
      {
        objective: 'Steal the teal Solmar Coupe on the Strand',
        setup: () => g.say('Madame Okafor', 'Ren. A teal Solmar Coupe sits on the Strand with my name on it. Take it. — Okafor'),
        marker: () => hero() ? { x: hero().pos.x, z: hero().pos.z } : null,
        check: () => g.player.inCar && g.player.inCar.isHeroCoupe,
      },
      {
        objective: 'Bring the coupe to Okafor’s garage, Downtown',
        setup: () => g.say('Madame Okafor', 'Good. Now bring her home — the garage off Meridian and Third.'),
        marker: () => DROP_POINT,
        check: () => g.player.inCar && dir.near(DROP_POINT, 13),
      },
    ];
  },

  'parcel-run': (dir) => {
    const g = dir.game;
    const legs = [
      { at: { x: -330, z: 62 }, text: 'Pick up the parcel at the Old Market stall' },
      { at: { x: 226, z: 226 }, text: 'Drop it at the Downtown courier office' },
      { at: { x: -116, z: -436 }, text: 'Collect the second parcel in the Heights' },
      { at: { x: 446, z: -116 }, text: 'Drop it at the Marina chandlery' },
      { at: { x: -436, z: 116 }, text: 'Collect the last parcel in the Old Market' },
      { at: DROP_POINT, text: 'Return to Okafor’s garage' },
    ];
    return legs.map((leg, i) => ({
      objective: leg.text,
      setup: i === 0 ? () => g.say('Madame Okafor', 'Three parcels, three corners of my bay. Wheels up, Ren.') : null,
      marker: () => leg.at,
      check: () => dir.near(leg.at, 11),
    }));
  },

  'vanish': (dir) => {
    const g = dir.game;
    return [
      {
        objective: 'Draw the SBPD out: reach 3 stars',
        setup: () => {
          g.say('Madame Okafor', 'I need the SBPD looking at you, not at my docks. Make some noise, then disappear.');
          g.police.setHeatFloor(1.4);
          g.police.addHeat(1.2, g.player.pos);
        },
        marker: () => null,
        check: () => g.police.stars >= 3,
      },
      {
        objective: 'Lose the heat (Mira’s Ghost Plates help — Q)',
        setup: () => { g.police.clearHeatFloor(); g.police.heat = Math.max(g.police.heat, 3.3); },
        marker: () => null,
        tick: () => { if (g.police.stars >= 3) dir.current.data.wasChased = true; return false; },
        check: () => dir.current.data.wasChased && g.police.stars <= 1,
      },
      {
        objective: 'Lay low at the Strand safehouse',
        setup: () => g.police.clearHeatFloor(),
        marker: () => SAFEHOUSE,
        check: () => dir.near(SAFEHOUSE, 12) && g.police.stars === 0,
      },
    ];
  },

  'rival-wreck': (dir) => {
    const g = dir.game;
    const rivalSpot = { x: -446, z: 116 };
    return [
      {
        objective: 'Take the Kestrel-9 and Brute from the market stall',
        setup: () => g.say('Madame Okafor', 'The Vantablack crew is muscling my market. My stall-keeper has something for you.'),
        marker: () => ({ x: -330, z: 62 }),
        check: () => dir.near({ x: -330, z: 62 }, 7) && !g.player.inCar,
      },
      {
        objective: 'Wreck the rival coupe and scatter its crew',
        setup: () => {
          g.combat.unlockGuns();
          g.audio.pickup();
          g.say('Stall-keeper', 'Kestrel-9, Brute — keys 2 and 3. Their coupe is west of the market. Make it scrap.');
          const car = new Car(g.world.scene, CAR_MODELS[0], 0x23232a, { x: rivalSpot.x, z: rivalSpot.z, heading: Math.PI / 2, parked: true });
          dir.current.data.rivalCar = car;
          g.extraCars.push(car);
          for (let i = 0; i < 3; i++) {
            g.combat.spawnRival(rivalSpot.x + 4 + i * 2.5, rivalSpot.z + 5 - i * 3, { alerted: false });
          }
        },
        marker: () => rivalSpot,
        tick: (dt) => {
          const car = dir.current.data.rivalCar;
          if (car && !car.dead && car.health < 65 && !dir.current.data.fled) {
            dir.current.data.fled = true;
            car.parked = false;
            car.driver = { target: { x: -100, z: 116 }, speedWanted: 0.7 };
            g.say('Rival driver', 'He’s shooting! Move, MOVE!');
          }
          if (car && car.driver && !car.dead) {
            const dx = car.driver.target.x - car.pos.x, dz = car.driver.target.z - car.pos.z;
            if (Math.hypot(dx, dz) < 12) car.driver.target = { x: 300, z: 116 };
            const want = Math.atan2(dx, dz);
            let diff = want - car.heading;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            car.drive(dt, 0.8, THREE.MathUtils.clamp(diff * 1.6, -1, 1), g.world);
          }
          return false;
        },
        check: () => {
          const car = dir.current.data.rivalCar;
          return car && car.health <= 22;
        },
      },
    ];
  },

  'harbor-sprint': (dir) => {
    const g = dir.game;
    const gates = [
      { x: 226, z: 446 }, { x: 446, z: 226 }, { x: 446, z: -16 },
      { x: 446, z: -226 }, { x: 226, z: -446 }, { x: -16, z: -446 },
    ];
    return gates.map((gate, i) => ({
      objective: `Harbor Sprint: gate ${i + 1} of ${gates.length}`,
      setup: i === 0 ? () => {
        g.say('Madame Okafor', 'The Sprint, Ren. Six gates around the harbour. Beat the clock and the bay bets on you.');
        dir.current.data.sprintStart = dir.current.elapsed;
      } : null,
      marker: () => gate,
      check: () => g.player.inCar && dir.near(gate, 12),
    })).concat([{
      objective: 'Finish at Okafor’s garage',
      marker: () => DROP_POINT,
      check: () => {
        if (g.player.inCar && dir.near(DROP_POINT, 13)) {
          g.stats.racesWon++;
          return true;
        }
        return false;
      },
    }]);
  },

  'night-run': (dir) => {
    const g = dir.game;
    return [
      {
        objective: 'Reach the Heights overlook before the clock dies',
        setup: () => {
          g.setHour(21.4);
          g.say('Madame Okafor', 'A package for the Heights, and the SBPD is restless tonight. Four minutes, Ren.');
          g.police.setHeatFloor(2);
          dir.current.data.timeLeft = 250;
        },
        marker: () => OVERLOOK,
        tick: (dt) => {
          dir.current.data.timeLeft -= dt;
          dir.current.data.showClock = Math.ceil(dir.current.data.timeLeft);
          return dir.current.data.timeLeft <= 0;
        },
        check: () => dir.near(OVERLOOK, 13),
      },
    ];
  },

  'marina-job': (dir) => {
    const g = dir.game;
    const pier = { x: WORLD.marinaX + 60, z: 140 };
    return [
      {
        objective: 'Drive to the Marina pier',
        setup: () => g.say('Madame Okafor', 'Last job, Ren. My boat at the Marina is loaded and hot. Get her out of the bay.'),
        marker: () => pier,
        check: () => dir.near(pier, 16),
      },
      {
        objective: 'Clear the pier — drop Okafor’s “dockhands”',
        setup: () => {
          for (let i = 0; i < 4; i++) {
            g.combat.spawnRival(pier.x + 14 + i * 7, pier.z - 8 + (i % 2) * 14, { alerted: true, shirt: 0x24344d });
          }
          g.police.setHeatFloor(2.2);
        },
        marker: () => pier,
        check: () => g.combat.rivals.every((r) => !r.alive),
      },
      {
        objective: 'Board the teal boat at the pier’s end (E)',
        setup: () => { dir.current.data.boatStage = true; g.police.setHeatFloor(4); },
        marker: () => ({ x: g.world.escapeBoat.position.x, z: g.world.escapeBoat.position.z }),
        check: () => !!g.player.inBoat,
      },
      {
        objective: 'Run for the finish buoy, south-east in the bay',
        setup: () => g.say('Madame Okafor', 'Past the buoy and you are a ghost. Go!'),
        marker: () => ({ x: g.world.finishBuoy.position.x, z: g.world.finishBuoy.position.z }),
        check: () => {
          const b = g.world.escapeBoat.position;
          const f = g.world.finishBuoy.position;
          return Math.hypot(b.x - f.x, b.z - f.z) < 30;
        },
      },
    ];
  },
};
