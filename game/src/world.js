// world.js — Solmar Bay itself: the island, the sea, the road grid, five
// districts of procedural buildings with lit-window facades, the Strand
// boardwalk, the Old Market stalls, the Marina piers, palms, lamps, stunt
// ramps and the street map both the minimap and the dossier draw from.
//
// Everything is generated from the run's seed, and everything solid exports
// an AABB into world.colliders so the player, cars and peds share one
// collision story. Buildings use a handful of shared canvas textures, so
// the whole city is a few hundred draw calls of cheap Lambert materials.

import { THREE } from './three.js';
import { WORLD, DISTRICTS, districtAt } from './config.js';
import { Rng } from './rng.js';

const SKY_KEYS = [ // [hour, sky, fog, sunColor, sunIntensity, hemiIntensity]
  [0.0,  0x0b1026, 0x0b1026, 0x8fa3cc, 0.12, 0.18],
  [5.5,  0x1a2340, 0x1a2340, 0x8fa3cc, 0.14, 0.2],
  [7.0,  0xf2a65e, 0xe8b07e, 0xffb066, 0.75, 0.45],
  [10.0, 0x87c5e8, 0xbfe0ee, 0xfff2d8, 1.15, 0.7],
  [16.5, 0x7fb8dd, 0xc4dde8, 0xffe9c4, 1.05, 0.65],
  [18.6, 0xf7934c, 0xeda06a, 0xff9440, 0.8, 0.45],
  [20.0, 0x2a2a55, 0x35355e, 0xcc8855, 0.25, 0.25],
  [22.0, 0x0b1026, 0x0b1026, 0x8fa3cc, 0.12, 0.18],
  [24.0, 0x0b1026, 0x0b1026, 0x8fa3cc, 0.12, 0.18],
];

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(ca, cb, t) {
  const a = new THREE.Color(ca), b = new THREE.Color(cb);
  return a.lerp(b, t);
}

// One facade texture: a wall tone with a grid of windows, some of them lit.
// The same canvas doubles as the emissive map, so at night the lit windows
// glow while the wall stays dark.
function facadeTexture(rng, wallTone, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = wallTone; g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 244, 128, 12);
  const cols = 5, rows = 11;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng.chance(litRatio);
      g.fillStyle = lit ? '#ffd98a' : '#2c3542';
      g.fillRect(10 + x * 23, 12 + y * 21, 14, 13);
      if (lit) { g.fillStyle = 'rgba(255,190,90,0.35)'; g.fillRect(9 + x * 23, 11 + y * 21, 16, 15); }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 2;
  return tex;
}

function stripedTexture(rng, a, b) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * 8, 0, 8, 64); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export class World {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = new Rng(seed ^ 0x5017);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];        // {x0, x1, z0, z1} solid footprints
    this.buildings = [];        // {x, z, h} for skyline queries
    this.lampHeads = [];        // materials to brighten at night
    this.boats = [];
    this.escapeBoat = null;
    this.hour = 9.5;

    this.buildLights();
    this.buildGroundAndSea();
    this.buildRoads();
    this.buildBlocks();
    this.buildStrand();
    this.buildMarket();
    this.buildMarina();
    this.buildVegetation();
    this.buildRamps();
    this.pickStarSpots();
    this.setHour(this.hour);
  }

  // --- lights ---------------------------------------------------------------
  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x77684a, 0.7);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -190; this.sun.shadow.camera.right = 190;
    this.sun.shadow.camera.top = 190; this.sun.shadow.camera.bottom = -190;
    this.sun.shadow.camera.far = 900;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.fog = new THREE.Fog(0xbfe0ee, 260, 1500);
  }

  setHour(hour) {
    this.hour = ((hour % 24) + 24) % 24;
    let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
    for (let i = 0; i < SKY_KEYS.length - 1; i++) {
      if (this.hour >= SKY_KEYS[i][0] && this.hour <= SKY_KEYS[i + 1][0]) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
    }
    const t = (this.hour - a[0]) / Math.max(0.0001, b[0] - a[0]);
    const sky = lerpColor(a[1], b[1], t);
    this.scene.background = sky;
    this.scene.fog.color.copy(lerpColor(a[2], b[2], t));
    this.sun.color.copy(lerpColor(a[3], b[3], t));
    this.sun.intensity = lerp(a[4], b[4], t);
    this.hemi.intensity = lerp(a[5], b[5], t);
    const dayAmount = THREE.MathUtils.clamp(Math.sin((this.hour - 6) / 12 * Math.PI), 0, 1);
    const ang = (this.hour - 6) / 12 * Math.PI;
    this.sunDir = new THREE.Vector3(Math.cos(ang) * 0.8, Math.max(0.12, Math.sin(ang)), 0.45).normalize();
    const night = 1 - dayAmount;
    for (const m of this.facadeMats) m.emissiveIntensity = night * 0.85;
    for (const m of this.lampHeads) m.emissiveIntensity = 0.25 + night * 1.6;
    if (this.seaMat) this.seaMat.color.copy(lerpColor(0x0d3550, 0x1b7f8c, dayAmount));
  }

  // The shadow camera follows the action so shadows stay crisp where the
  // player actually is.
  update(dt, focus) {
    if (focus) {
      this.sun.position.copy(focus).addScaledVector(this.sunDir, 260);
      this.sun.target.position.copy(focus);
    }
    const t = performance.now() * 0.001;
    for (const b of this.boats) {
      b.position.y = WORLD.seaLevel + 0.55 + Math.sin(t * 0.9 + b.userData.phase) * 0.14;
      b.rotation.z = Math.sin(t * 0.7 + b.userData.phase) * 0.03;
    }
  }

  // --- terrain ----------------------------------------------------------------
  buildGroundAndSea() {
    const H = WORLD.islandHalf;
    this.seaMat = new THREE.MeshLambertMaterial({ color: 0x1b7f8c });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200), this.seaMat);
    sea.rotation.x = -Math.PI / 2; sea.position.y = WORLD.seaLevel;
    this.group.add(sea);

    const sand = new THREE.Mesh(
      new THREE.BoxGeometry(H * 2, 2, H * 2),
      new THREE.MeshLambertMaterial({ color: 0xe3cd96 }));
    sand.position.y = -1;
    sand.receiveShadow = true;
    this.group.add(sand);

    // City slab: warm concrete over everything north of the beach.
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(H * 2 - 16, 0.3, WORLD.beachZ + H - 30),
      new THREE.MeshLambertMaterial({ color: 0x9aa0a2 }));
    slab.position.set(0, 0.02, (-H + WORLD.beachZ) / 2 - 8);
    slab.receiveShadow = true;
    this.group.add(slab);
  }

  buildRoads() {
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x33373d });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2d060 });
    const kerbMat = new THREE.MeshBasicMaterial({ color: 0xddd6c2 });
    const walkMat = new THREE.MeshLambertMaterial({ color: 0xb9bcba });
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e2 });
    const R = WORLD.roadReach, W = WORLD.roadWidth;

    const plane = (w, d, mat, x, z, y) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    // A continuous pale kerb strip hugging both edges of a road, so the
    // asphalt reads as a finished, marked street from any camera height.
    const kerbLines = (cx, cz, vertical) => {
      const off = W / 2 + 0.85;
      if (vertical) {
        plane(1.3, R * 2, kerbMat, cx - off, cz, 0.1);
        plane(1.3, R * 2, kerbMat, cx + off, cz, 0.1);
      } else {
        plane(R * 2, 1.3, kerbMat, cx, cz - off, 0.1);
        plane(R * 2, 1.3, kerbMat, cx, cz + off, 0.1);
      }
    };
    for (const x of WORLD.avenues) {
      plane(W + WORLD.sidewalkWidth * 2, R * 2, walkMat, x, 0, 0.06);
      plane(W, R * 2, roadMat, x, 0, 0.09);
      kerbLines(x, 0, true);
      for (let z = -R + 20; z < R; z += 22) plane(1.0, 11, lineMat, x, z, 0.11);
    }
    for (const z of WORLD.streets) {
      plane(R * 2, W + WORLD.sidewalkWidth * 2, walkMat, 0, z, 0.06);
      plane(R * 2, W, roadMat, 0, z, 0.09);
      kerbLines(0, z, false);
      for (let x = -R + 20; x < R; x += 22) plane(11, 1.0, lineMat, x, z, 0.11);
    }
    // Crosswalks at every intersection.
    for (const x of WORLD.avenues) for (const z of WORLD.streets) {
      for (let i = -2; i <= 2; i++) {
        plane(2.2, 10, crossMat, x + i * 4.6, z - W / 2 - 3, 0.1);
        plane(2.2, 10, crossMat, x + i * 4.6, z + W / 2 + 3, 0.1);
        plane(10, 2.2, crossMat, x - W / 2 - 3, z + i * 4.6, 0.1);
        plane(10, 2.2, crossMat, x + W / 2 + 3, z + i * 4.6, 0.1);
      }
    }
  }

  // --- buildings ---------------------------------------------------------------
  buildBlocks() {
    const rng = this.rng;
    const tones = ['#c9b8a3', '#b7c3cc', '#d9c6ae', '#a8b39a', '#c4a29a', '#9fb2c8', '#e0d3b8', '#b09cc0'];
    this.facadeMats = [];
    const facades = [];
    for (let i = 0; i < 7; i++) {
      const tex = facadeTexture(rng, tones[i], 0.42);
      const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffc37a, emissiveMap: tex, emissiveIntensity: 0 });
      this.facadeMats.push(mat);
      facades.push(mat);
    }
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x4c4c52 });
    const signMats = [0xd64541, 0x1abc9c, 0xf39c12, 0x9b59b6, 0x3498db].map(
      (c) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.25 }));

    const edges = [-596, ...WORLD.avenues, 596];
    const spans = [];
    for (let i = 0; i < edges.length - 1; i++) spans.push([edges[i], edges[i + 1]]);
    for (const [x0, x1] of spans) for (const [z0, z1] of spans) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (cz > WORLD.beachZ - 60) continue;              // keep the beach clear
      const district = districtAt(cx, cz);
      const inner = Math.min(x1 - x0, z1 - z0) - WORLD.roadWidth - WORLD.sidewalkWidth * 2 - 14;
      if (inner < 40) continue;
      const n = district.id === 'downtown' ? 4 : district.id === 'market' ? 6 : 4;
      const cell = inner / Math.sqrt(n);
      let placed = 0;
      for (let gx = 0; gx < Math.sqrt(n) && placed < n; gx++) {
        for (let gz = 0; gz < Math.sqrt(n) && placed < n; gz++) {
          if (rng.chance(0.14)) continue;               // the odd empty lot
          const w = cell * rng.range(0.62, 0.8), d = cell * rng.range(0.62, 0.8);
          const h = rng.range(district.minH, district.maxH) * (district.id === 'downtown' && rng.chance(0.2) ? 1.5 : 1);
          const bx = cx - inner / 2 + cell * (gx + 0.5) + rng.range(-3, 3);
          const bz = cz - inner / 2 + cell * (gz + 0.5) + rng.range(-3, 3);
          const mat = facades[rng.int(0, facades.length - 1)];
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          b.position.set(bx, h / 2, bz);
          b.castShadow = true; b.receiveShadow = true;
          this.group.add(b);
          const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.7, d + 0.6), roofMat);
          roof.position.set(bx, h + 0.35, bz);
          this.group.add(roof);
          if (rng.chance(0.3)) {
            const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 1.6, 0.4), signMats[rng.int(0, signMats.length - 1)]);
            sign.position.set(bx, h * rng.range(0.5, 0.8), bz - d / 2 - 0.3);
            this.group.add(sign);
          }
          this.colliders.push({ x0: bx - w / 2, x1: bx + w / 2, z0: bz - d / 2, z1: bz + d / 2 });
          this.buildings.push({ x: bx, z: bz, h });
          placed++;
        }
      }
    }
  }

  // --- the Strand: boardwalk, stalls, umbrellas ---------------------------------
  buildStrand() {
    const rng = this.rng;
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x9a6b42 });
    const walk = new THREE.Mesh(new THREE.BoxGeometry(1140, 0.5, 16), woodMat);
    walk.position.set(0, 0.25, WORLD.beachZ + 26);
    walk.receiveShadow = true;
    this.group.add(walk);
    const stripe = stripedTexture(rng, '#e74c3c', '#f5f0e6');
    for (let x = -540; x <= 540; x += 60) {
      if (rng.chance(0.3)) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.2, 6),
        new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
      pole.position.set(x, 1.6, WORLD.beachZ + 52);
      this.group.add(pole);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.1, 8),
        new THREE.MeshLambertMaterial({ map: stripe }));
      shade.position.set(x, 3.4, WORLD.beachZ + 52);
      shade.castShadow = true;
      this.group.add(shade);
    }
  }

  // --- Old Market stalls ----------------------------------------------------------
  buildMarket() {
    const rng = this.rng;
    const awnings = [stripedTexture(rng, '#16a085', '#f5f0e6'), stripedTexture(rng, '#e67e22', '#f5f0e6'), stripedTexture(rng, '#8e44ad', '#f5f0e6')];
    const crateMat = new THREE.MeshLambertMaterial({ color: 0xa9743f });
    this.marketStalls = [];
    for (let i = 0; i < 14; i++) {
      const x = rng.range(-560, -260), z = rng.range(-300, 300);
      if (this.nearRoad(x, z, 20)) continue;
      const stall = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 3), crateMat);
      base.position.y = 1.1; base.castShadow = true;
      stall.add(base);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(6, 0.18, 4.2),
        new THREE.MeshLambertMaterial({ map: awnings[i % awnings.length] }));
      roof.position.y = 3.1; roof.rotation.z = 0.08;
      stall.add(roof);
      stall.position.set(x, 0, z);
      stall.rotation.y = rng.range(0, Math.PI);
      this.group.add(stall);
      this.colliders.push({ x0: x - 2.6, x1: x + 2.6, z0: z - 2, z1: z + 2 });
      this.marketStalls.push({ x, z });
    }
  }

  // --- Marina piers and boats -------------------------------------------------------
  buildMarina() {
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x8a5f36 });
    const hullMats = [0xf2f2f2, 0x2e6da4, 0xc23b2e, 0x2e8b74].map(
      (c) => new THREE.MeshLambertMaterial({ color: c }));
    this.piers = [];
    for (const pz of [-180, -20, 140]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(120, 1, 8), woodMat);
      pier.position.set(WORLD.marinaX + 92, 0.4, pz);
      pier.receiveShadow = true;
      this.group.add(pier);
      this.piers.push({ x: WORLD.marinaX + 40, z: pz, endX: WORLD.marinaX + 148 });
      for (let i = 0; i < 4; i++) {
        const boat = this.makeBoat(hullMats[i % hullMats.length]);
        boat.position.set(WORLD.marinaX + 70 + i * 26, WORLD.seaLevel + 0.55, pz + (i % 2 ? 10 : -10));
        boat.rotation.y = i % 2 ? 0.2 : Math.PI - 0.15;
        boat.userData.phase = i * 1.7 + pz;
        this.group.add(boat);
        this.boats.push(boat);
      }
    }
    // The escape boat the Marina Job ends on: faster lines, teal hull.
    const escape = this.makeBoat(new THREE.MeshLambertMaterial({ color: 0x0fa3a3 }));
    escape.scale.setScalar(1.25);
    escape.position.set(WORLD.marinaX + 138, WORLD.seaLevel + 0.55, 140);
    escape.userData.phase = 4;
    this.group.add(escape);
    this.boats.push(escape);
    this.escapeBoat = escape;
    // A finish buoy out in the bay, south-east.
    const buoy = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 3.4, 10),
      new THREE.MeshLambertMaterial({ color: 0xff5533, emissive: 0xff3300, emissiveIntensity: 0.4 }));
    buoy.position.set(430, WORLD.seaLevel + 1.4, 760);
    this.group.add(buoy);
    this.finishBuoy = buoy;
  }

  makeBoat(hullMat) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(9, 1.6, 3.2), hullMat);
    hull.position.y = 0.4; hull.castShadow = true;
    boat.add(hull);
    const bow = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.6, 3, 1), hullMat);
    bow.rotation.z = Math.PI / 2; bow.rotation.y = Math.PI / 2;
    bow.position.set(5.2, 0.4, 0); bow.scale.set(1, 1, 1.9);
    boat.add(bow);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.5, 2.4),
      new THREE.MeshLambertMaterial({ color: 0xf5f5f2 }));
    cabin.position.set(-0.8, 1.8, 0);
    boat.add(cabin);
    return boat;
  }

  // --- vegetation and lamps ---------------------------------------------------------
  buildVegetation() {
    const rng = this.rng;
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
    const frondMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57, side: THREE.DoubleSide });
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6.5, 6);
    const frondGeo = new THREE.ConeGeometry(3.4, 1.6, 7);
    const addPalm = (x, z) => {
      const palm = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 3.25; trunk.rotation.z = rng.range(-0.09, 0.09);
      trunk.castShadow = true;
      palm.add(trunk);
      const crown = new THREE.Mesh(frondGeo, frondMat);
      crown.position.y = 6.9; crown.rotation.x = Math.PI;
      palm.add(crown);
      palm.position.set(x, 0, z);
      const s = rng.range(0.85, 1.3);
      palm.scale.setScalar(s);
      this.group.add(palm);
      this.colliders.push({ x0: x - 0.5, x1: x + 0.5, z0: z - 0.5, z1: z + 0.5 });
    };
    for (let x = -580; x <= 580; x += 34) { addPalm(x + rng.range(-5, 5), WORLD.beachZ + 8); addPalm(x + rng.range(-5, 5), WORLD.beachZ + 44); }
    for (let z = -420; z <= 300; z += 52) addPalm(WORLD.marinaX - 26, z + rng.range(-6, 6));
    for (let i = 0; i < 40; i++) {
      const x = rng.range(-580, 580), z = rng.range(-580, 420);
      if (!this.nearRoad(x, z, 12) && districtAt(x, z).palms) addPalm(x, z);
    }

    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c4148 });
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6.4, 6);
    const headGeo = new THREE.SphereGeometry(0.42, 8, 6);
    for (const x of WORLD.avenues) for (let z = -560; z <= 560; z += 80) {
      for (const side of [-1, 1]) {
        const mat = new THREE.MeshLambertMaterial({ color: 0xffca7a, emissive: 0xffb84d, emissiveIntensity: 0.3 });
        this.lampHeads.push(mat);
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x + side * (WORLD.roadWidth / 2 + 2.5), 3.2, z);
        this.group.add(pole);
        const head = new THREE.Mesh(headGeo, mat);
        head.position.set(x + side * (WORLD.roadWidth / 2 + 2.5), 6.5, z);
        this.group.add(head);
      }
    }
  }

  // --- stunt ramps ---------------------------------------------------------------------
  buildRamps() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xd8642c });
    const stripe = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.ramps = [];
    const spots = [
      { x: 0, z: 300, dir: [0, -1] }, { x: -330, z: -110, dir: [1, 0] },
      { x: 330, z: -330, dir: [0, 1] }, { x: -110, z: -560, dir: [0, 1] },
    ];
    for (const s of spots) {
      const ramp = new THREE.Group();
      const wedge = new THREE.Mesh(new THREE.BoxGeometry(7, 2.4, 9), mat);
      wedge.position.y = 0.4; wedge.rotation.x = s.dir[1] !== 0 ? (s.dir[1] < 0 ? -0.42 : 0.42) : 0;
      wedge.rotation.z = s.dir[0] !== 0 ? (s.dir[0] > 0 ? -0.42 : 0.42) : 0;
      wedge.castShadow = true;
      ramp.add(wedge);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.3, 0.8), stripe);
      lip.position.set(s.dir[0] * 3.4, 1.9, s.dir[1] * 3.4);
      ramp.add(lip);
      ramp.position.set(s.x, 0, s.z);
      this.group.add(ramp);
      this.ramps.push({ x: s.x, z: s.z, dir: s.dir });
    }
  }

  pickStarSpots() {
    const rng = this.rng;
    const fixed = [
      [0, WORLD.beachZ + 26], [-540, WORLD.beachZ + 26], [540, WORLD.beachZ + 26],
      [WORLD.marinaX + 148, -180], [WORLD.marinaX + 148, -20], [WORLD.marinaX + 148, 140],
      [0, 0], [-330, 110], [110, -110], [-110, -330], [330, 110], [0, -560],
    ];
    const spots = fixed.map(([x, z]) => ({ x, z, y: 1.6 }));
    while (spots.length < 20) {
      const x = rng.range(-560, 560), z = rng.range(-560, 430);
      if (this.nearRoad(x, z, 6)) continue;
      spots.push({ x, z, y: 1.6 });
    }
    this.starSpots = spots;
  }

  // --- queries ---------------------------------------------------------------------------
  nearRoad(x, z, pad) {
    for (const a of WORLD.avenues) if (Math.abs(x - a) < WORLD.roadWidth / 2 + pad) return true;
    for (const s of WORLD.streets) if (Math.abs(z - s) < WORLD.roadWidth / 2 + pad) return true;
    return false;
  }

  collide(pos, radius) {
    for (const c of this.colliders) {
      if (pos.x > c.x0 - radius && pos.x < c.x1 + radius && pos.z > c.z0 - radius && pos.z < c.z1 + radius) {
        const dxl = pos.x - (c.x0 - radius), dxr = (c.x1 + radius) - pos.x;
        const dzl = pos.z - (c.z0 - radius), dzr = (c.z1 + radius) - pos.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) pos.x = c.x0 - radius;
        else if (m === dxr) pos.x = c.x1 + radius;
        else if (m === dzl) pos.z = c.z0 - radius;
        else pos.z = c.z1 + radius;
        return true;
      }
    }
    const H = WORLD.islandHalf - 6;
    pos.x = THREE.MathUtils.clamp(pos.x, -H, H + 120);
    pos.z = THREE.MathUtils.clamp(pos.z, -H, H);
    return false;
  }
}

// -----------------------------------------------------------------------------
// The street map. One drawing routine serves the HUD minimap and the pause
// dossier's big map: water, land, district tints, the beach, the road grid,
// an optional route polyline along the grid and a set of blips.
// view = { cx, cz, scale, route: [{x,z}...], blips: [{x,z,color,ring}] ,
//          player: {x,z,heading} }
// -----------------------------------------------------------------------------
export function drawStreetMap(canvas, view) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const toPx = (x, z) => [W / 2 + (x - view.cx) * view.scale, H / 2 + (z - view.cz) * view.scale];
  g.fillStyle = '#14586e';
  g.fillRect(0, 0, W, H);
  const [lx0, ly0] = toPx(-WORLD.islandHalf, -WORLD.islandHalf);
  const [lx1, ly1] = toPx(WORLD.islandHalf, WORLD.islandHalf);
  g.fillStyle = '#3d4a42';
  g.fillRect(lx0, ly0, lx1 - lx0, ly1 - ly0);
  for (const d of DISTRICTS) {
    const [ax, ay] = toPx(d.rect[0], d.rect[1]);
    const [bx, by] = toPx(d.rect[2], d.rect[3]);
    g.fillStyle = d.tint;
    g.globalAlpha = 0.55;
    g.fillRect(ax, ay, bx - ax, by - ay);
    g.globalAlpha = 1;
    if (view.scale > 0.35) {
      g.fillStyle = 'rgba(20,24,28,0.75)';
      g.font = `600 ${Math.max(9, view.scale * 26)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.fillText(d.name.toUpperCase(), (ax + bx) / 2, (ay + by) / 2);
    }
  }
  const [bx0, by0] = toPx(-WORLD.islandHalf, WORLD.beachZ);
  const [bx1, by1] = toPx(WORLD.islandHalf, WORLD.islandHalf);
  g.fillStyle = '#e8c877';
  g.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
  g.strokeStyle = '#22262b';
  g.lineWidth = Math.max(2, WORLD.roadWidth * view.scale * 0.9);
  g.lineCap = 'round';
  for (const x of WORLD.avenues) {
    const [ax, ay] = toPx(x, -WORLD.roadReach); const [bx, by] = toPx(x, WORLD.roadReach);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
  }
  for (const z of WORLD.streets) {
    const [ax, ay] = toPx(-WORLD.roadReach, z); const [bx, by] = toPx(WORLD.roadReach, z);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
  }
  if (view.route && view.route.length > 1) {
    g.strokeStyle = '#ffd23e';
    g.lineWidth = Math.max(2.5, view.scale * 5);
    g.setLineDash([8, 5]);
    g.beginPath();
    view.route.forEach((p, i) => { const [px, py] = toPx(p.x, p.z); i ? g.lineTo(px, py) : g.moveTo(px, py); });
    g.stroke();
    g.setLineDash([]);
  }
  for (const b of view.blips || []) {
    const [px, py] = toPx(b.x, b.z);
    if (px < -8 || py < -8 || px > W + 8 || py > H + 8) continue;
    g.fillStyle = b.color;
    g.beginPath(); g.arc(px, py, b.r || 4, 0, Math.PI * 2); g.fill();
    if (b.ring) { g.strokeStyle = b.color; g.lineWidth = 1.6; g.beginPath(); g.arc(px, py, (b.r || 4) + 3.5, 0, Math.PI * 2); g.stroke(); }
  }
  if (view.player) {
    const [px, py] = toPx(view.player.x, view.player.z);
    g.save();
    g.translate(px, py);
    g.rotate(Math.PI - view.player.heading);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#14181d';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(0, -8); g.lineTo(5.5, 6); g.lineTo(0, 3); g.lineTo(-5.5, 6); g.closePath();
    g.fill(); g.stroke();
    g.restore();
  }
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.font = `700 ${Math.max(10, H * 0.045)}px system-ui, sans-serif`;
  g.textAlign = 'right';
  g.fillText('N', W - 8, 18);
}

// A Manhattan route along the road grid from one point to another, used for
// the dashed gold line on both maps.
export function gridRoute(from, to) {
  const nearest = (v, arr) => arr.reduce((best, a) => (Math.abs(a - v) < Math.abs(best - v) ? a : best), arr[0]);
  const ax = nearest(from.x, WORLD.avenues), az = nearest(from.z, WORLD.streets);
  const bx = nearest(to.x, WORLD.avenues), bz = nearest(to.z, WORLD.streets);
  const pts = [{ x: from.x, z: from.z }];
  pts.push({ x: ax, z: from.z });
  pts.push({ x: ax, z: bz });
  pts.push({ x: bx, z: bz });
  pts.push({ x: to.x, z: to.z });
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.z !== pts[i - 1].z);
}
