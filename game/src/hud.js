// hud.js — everything drawn over the 3D view: the minimap and mission
// panel, the SBPD response panel that names its units, the crew panel,
// weapon slots, the rank/RP bar, dialogue and toasts, the BUSTED meter,
// and the pause dossier with its big street map, completion ring,
// checklist, medal shelf and save slots.

import { STORY_MISSIONS, WEAPONS } from './config.js';
import { drawStreetMap, gridRoute } from './world.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(game) {
    this.game = game;
    this.minimap = $('minimap');
    this.dialogueTimer = 0;
    this.toastTimer = 0;
    this.panelTimer = 0;
    this.buildCrewRows();
    this.buildWeaponSlots();
  }

  buildCrewRows() {
    $('crew-rows').innerHTML = this.game.crew.panelRows().map((r, i) => `
      <div class="crew-row" id="crew-row-${i}">
        <span class="crew-key">${r.keyLabel}</span>
        <span class="crew-name">${r.name.split(' ')[0]} · ${r.ability}</span>
        <span class="crew-cd"></span>
      </div>`).join('');
  }

  buildWeaponSlots() {
    $('weapon-slots').innerHTML = WEAPONS.map((w, i) => `
      <div class="weapon-slot" id="weapon-slot-${i}">
        <span class="weapon-key">${w.slot}</span>
        <span class="weapon-name">${w.name}</span>
      </div>`).join('');
  }

  toast(text, seconds = 3.4) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    this.toastTimer = seconds;
  }

  say(name, text) {
    $('dialogue-name').textContent = name;
    $('dialogue-text').textContent = text;
    $('dialogue').classList.add('show');
    this.dialogueTimer = 6;
  }

  // --- per-frame ----------------------------------------------------------------
  update(dt) {
    const g = this.game;
    this.dialogueTimer -= dt;
    if (this.dialogueTimer <= 0) $('dialogue').classList.remove('show');
    this.toastTimer -= dt;
    if (this.toastTimer <= 0) $('toast').classList.remove('show');

    this.drawMinimap();
    this.panelTimer -= dt;
    if (this.panelTimer <= 0) {
      this.panelTimer = 0.12;
      this.refreshPanels();
    }
    // Fast-moving bars every frame.
    $('busted-fill').style.width = `${Math.round(g.police.bust * 100)}%`;
    $('busted-wrap').classList.toggle('show', g.police.bust > 0.02 && g.police.stars > 0);
    $('health-fill').style.width = `${Math.round(g.player.health)}%`;
    $('hurt-vignette').style.opacity = g.player.hurtFlash > 0 ? String(Math.min(0.55, g.player.hurtFlash)) : '0';
    const speed = g.player.inCar ? Math.abs(g.player.inCar.speed) * 3.6 : 0;
    $('speedo').textContent = g.player.inCar ? `${Math.round(speed)} km/h` : '';
    $('crosshair').classList.toggle('show',
      !g.player.inCar && !g.player.inBoat && g.combat.weapon.id !== 'fists' && g.mode === 'play');
  }

  drawMinimap() {
    const g = this.game;
    const p = g.player;
    const focus = p.inCar ? p.inCar.pos : p.pos;
    const blips = [];
    const obj = g.missions.marker;
    if (obj) blips.push({ x: obj.x, z: obj.z, color: '#ffd23e', r: 5, ring: true });
    blips.push(...g.collectibles.blips(g.crew.eyesActive, focus));
    if (g.crew.eyesActive || g.police.stars > 0) {
      for (const row of g.police.units) {
        const pos = g.police.unitPos(row);
        blips.push({ x: pos.x, z: pos.z, color: '#4da3ff', r: 3.4 });
      }
    }
    if (!p.inCar) {
      for (const m of g.crew.members) {
        blips.push({ x: m.mesh.position.x, z: m.mesh.position.z, color: '#59d98c', r: 3 });
      }
    }
    drawStreetMap(this.minimap, {
      cx: focus.x, cz: focus.z, scale: 0.30,
      route: obj ? gridRoute({ x: focus.x, z: focus.z }, obj) : null,
      blips,
      player: { x: focus.x, z: focus.z, heading: p.inCar ? p.inCar.heading : p.heading },
    });
  }

  refreshPanels() {
    const g = this.game;
    const info = g.missions.objectiveInfo();
    if (info) {
      $('mission-panel').classList.add('show');
      $('mission-title').textContent = info.title;
      $('mission-objective').textContent = info.text + (info.extra || '');
      $('mission-dist').textContent = info.dist !== null ? `${info.dist} m` : '';
    } else {
      $('mission-panel').classList.remove('show');
    }

    const stars = g.police.stars;
    $('stars').textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    $('stars').classList.toggle('hot', stars > 0);
    const rows = g.police.panelRows(g.player.pos, g.crew.eyesActive);
    $('police-panel').classList.toggle('show', stars > 0);
    $('police-rows').innerHTML = rows.map((r) =>
      `<div class="police-row"><span class="police-call">${r.call}</span><span class="police-role">${r.role}</span><span class="police-dist">${r.dist} m</span></div>`).join('');

    const crewRows = g.crew.panelRows();
    crewRows.forEach((r, i) => {
      const el = $(`crew-row-${i}`);
      if (!el) return;
      el.classList.toggle('ready', r.cooldownLeft <= 0);
      el.classList.toggle('active', r.active);
      el.querySelector('.crew-cd').textContent =
        r.active ? 'ACTIVE' : r.cooldownLeft > 0 ? `${Math.ceil(r.cooldownLeft)}s` : 'READY';
    });

    WEAPONS.forEach((w, i) => {
      const el = $(`weapon-slot-${i}`);
      if (!el) return;
      el.classList.toggle('current', g.combat.current === i);
      el.classList.toggle('locked', !g.combat.owned.has(w.id));
    });

    const rank = g.stats.rank();
    $('rank-name').textContent = rank.name;
    $('rp-fill').style.width = `${Math.round(rank.frac * 100)}%`;
    $('cash').textContent = `$${g.stats.cash.toLocaleString('en-US')}`;
    $('prompt').textContent = g.promptText || '';
    $('prompt').classList.toggle('show', !!g.promptText);
  }

  // --- title screen ---------------------------------------------------------------
  showTitle() {
    $('title-screen').classList.add('show');
    this.renderTitleSlots();
  }
  hideTitle() { $('title-screen').classList.remove('show'); }

  renderTitleSlots() {
    const sums = this.game.saves.summaries();
    $('title-slots').innerHTML = sums.map((s) => s.empty
      ? `<div class="slot-card empty"><div class="slot-head">SLOT ${s.slot + 1}</div><div class="slot-body">Empty — a new story waits</div></div>`
      : `<div class="slot-card"><div class="slot-head">SLOT ${s.slot + 1} · ${s.act}</div>
         <div class="slot-body">${s.mission} · ${s.completion}% complete · $${s.cash.toLocaleString('en-US')}</div>
         <div class="slot-when">${s.when.toLocaleDateString('en-GB')} ${s.when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div></div>`
    ).join('');
  }

  // --- pause dossier ------------------------------------------------------------------
  showDossier() {
    $('dossier').classList.add('show');
    this.renderDossier();
  }
  hideDossier() { $('dossier').classList.remove('show'); }

  renderDossier() {
    const g = this.game;
    const p = g.player;
    const focus = p.inCar ? p.inCar.pos : p.pos;
    const obj = g.missions.marker;
    const blips = [];
    if (obj) blips.push({ x: obj.x, z: obj.z, color: '#ffd23e', r: 6, ring: true });
    blips.push(...g.collectibles.blips(true, focus));
    for (const row of g.police.units) {
      const pos = g.police.unitPos(row);
      blips.push({ x: pos.x, z: pos.z, color: '#4da3ff', r: 4 });
    }
    drawStreetMap($('dossier-map'), {
      cx: 40, cz: 0, scale: 0.30,
      route: obj ? gridRoute({ x: focus.x, z: focus.z }, obj) : null,
      blips,
      player: { x: focus.x, z: focus.z, heading: p.inCar ? p.inCar.heading : p.heading },
    });

    const pct = g.stats.completion();
    const ring = $('ring-canvas');
    const rg = ring.getContext('2d');
    const c = ring.width / 2, radius = c - 9;
    rg.clearRect(0, 0, ring.width, ring.height);
    rg.lineWidth = 11;
    rg.strokeStyle = 'rgba(255,255,255,0.14)';
    rg.beginPath(); rg.arc(c, c, radius, 0, Math.PI * 2); rg.stroke();
    rg.strokeStyle = '#ffd23e';
    rg.beginPath(); rg.arc(c, c, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct / 100); rg.stroke();
    rg.fillStyle = '#fff';
    rg.font = `700 ${Math.round(ring.width * 0.24)}px system-ui, sans-serif`;
    rg.textAlign = 'center';
    rg.fillText(`${pct}%`, c, c + ring.width * 0.085);

    $('checklist').innerHTML = g.stats.checklist().map((row) => `
      <div class="check-row">
        <span class="check-label">${row.label}</span>
        <span class="check-bar"><span class="check-fill" style="width:${Math.min(100, row.have / row.want * 100)}%"></span></span>
        <span class="check-count">${row.have}/${row.want}</span>
      </div>`).join('');

    const s = g.stats;
    const career = [
      ['Cash', `$${s.cash.toLocaleString('en-US')}`],
      ['Rank', `${s.rank().name} · ${s.rp} RP`],
      ['Distance driven', `${s.distanceKm.toFixed(1)} km`],
      ['Cars stolen', s.carsStolen],
      ['Takedowns', s.takedowns],
      ['Escapes', s.copsEscaped],
      ['Courier jobs', s.courierDone],
      ['Stunt jumps', `${s.stunts} · best ${s.longestLeap} m`],
      ['Crew assists', s.crewUses],
      ['Play time', `${Math.floor(s.playSeconds / 60)} min`],
    ];
    $('career-stats').innerHTML = career.map(([k, v]) =>
      `<div class="career-row"><span>${k}</span><strong>${v}</strong></div>`).join('');

    $('medals').innerHTML = STORY_MISSIONS.map((m) => {
      const medal = s.medals[m.id];
      const cls = medal || 'none';
      const label = medal ? medal.toUpperCase() : s.storyDone.includes(m.id) ? 'DONE' : '—';
      const time = s.missionTimes[m.id] ? ` · ${s.missionTimes[m.id]}s` : '';
      return `<div class="medal-row"><span class="medal-dot ${cls}"></span><span class="medal-name">${m.title}</span><span class="medal-label">${label}${time}</span></div>`;
    }).join('');

    const sums = g.saves.summaries();
    $('dossier-slots').innerHTML = sums.map((sm) => `
      <div class="slot-card ${sm.empty ? 'empty' : ''}">
        <div class="slot-head">SLOT ${sm.slot + 1}${sm.empty ? '' : ` · ${sm.act}`}</div>
        <div class="slot-body">${sm.empty ? 'Empty' : `${sm.mission} · ${sm.completion}% · $${sm.cash.toLocaleString('en-US')}`}</div>
        <div class="slot-actions">
          <button data-save="${sm.slot}">Save</button>
          <button data-load="${sm.slot}" ${sm.empty ? 'disabled' : ''}>Load</button>
        </div>
      </div>`).join('');
    $('dossier-slots').querySelectorAll('button[data-save]').forEach((b) =>
      b.addEventListener('click', () => this.game.saveToSlot(Number(b.dataset.save))));
    $('dossier-slots').querySelectorAll('button[data-load]').forEach((b) =>
      b.addEventListener('click', () => this.game.loadFromSlot(Number(b.dataset.load))));
  }

  setWasted(text) {
    const el = $('wasted');
    if (text) { el.textContent = text; el.classList.add('show'); }
    else el.classList.remove('show');
  }
}
