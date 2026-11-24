// stats.js — the career ledger: cash, RP, medals, distances and counts,
// the completion percentage the dossier's ring draws, and the checklist
// rows beside it. Everything the pause dossier shows comes from here, and
// everything a save slot stores is this object plus the star indices.

import { STORY_MISSIONS, RANKS, STAR_COUNT } from './config.js';

export class CareerStats {
  constructor() {
    this.reset();
  }

  reset() {
    this.cash = 120;
    this.rp = 0;
    this.storyDone = [];          // mission ids, in completion order
    this.medals = {};             // mission id -> 'gold' | 'silver' | 'bronze'
    this.missionTimes = {};       // mission id -> best seconds
    this.courierDone = 0;
    this.racesWon = 0;
    this.stunts = 0;
    this.longestLeap = 0;
    this.takedowns = 0;
    this.carsStolen = 0;
    this.copsEscaped = 0;
    this.crewUses = 0;
    this.abilitiesUsed = [];      // crew member ids
    this.districtsWorked = [];    // district ids with a completed job
    this.distanceKm = 0;
    this.starsFound = 0;
    this.playSeconds = 0;
  }

  get storyCount() { return this.storyDone.length; }
  get goldCount() { return Object.values(this.medals).filter((m) => m === 'gold').length; }

  rank() {
    let current = RANKS[0], next = null;
    for (let i = 0; i < RANKS.length; i++) {
      if (this.rp >= RANKS[i].rp) { current = RANKS[i]; next = RANKS[i + 1] || null; }
    }
    const span = next ? next.rp - current.rp : 1;
    const frac = next ? (this.rp - current.rp) / span : 1;
    return { name: current.name, next, frac };
  }

  medalFor(missionId, seconds) {
    const def = STORY_MISSIONS.find((m) => m.id === missionId);
    if (!def) return 'bronze';
    if (seconds <= def.goldTime) return 'gold';
    if (seconds <= def.goldTime * 1.45) return 'silver';
    return 'bronze';
  }

  completeStoryMission(def, seconds) {
    if (!this.storyDone.includes(def.id)) this.storyDone.push(def.id);
    const medal = this.medalFor(def.id, seconds);
    const order = { bronze: 0, silver: 1, gold: 2 };
    if (!this.medals[def.id] || order[medal] > order[this.medals[def.id]]) this.medals[def.id] = medal;
    if (!this.missionTimes[def.id] || seconds < this.missionTimes[def.id]) this.missionTimes[def.id] = Math.round(seconds);
    this.cash += def.cash;
    this.rp += def.rp;
    return medal;
  }

  workIn(districtId) {
    if (districtId && !this.districtsWorked.includes(districtId)) this.districtsWorked.push(districtId);
  }

  useAbility(memberId) {
    this.crewUses++;
    if (!this.abilitiesUsed.includes(memberId)) this.abilitiesUsed.push(memberId);
  }

  // The dossier checklist: label, have, want, and the share of the whole
  // game's completion this row carries.
  checklist() {
    return [
      { label: 'Story missions', have: this.storyCount, want: STORY_MISSIONS.length, weight: 40 },
      { label: 'Golden Solmar stars', have: this.starsFound, want: STAR_COUNT, weight: 15 },
      { label: 'Courier jobs', have: Math.min(this.courierDone, 10), want: 10, weight: 10 },
      { label: 'Races won', have: Math.min(this.racesWon, 4), want: 4, weight: 10 },
      { label: 'Stunt jumps', have: Math.min(this.stunts, 8), want: 8, weight: 8 },
      { label: 'Districts friendly', have: this.districtsWorked.length, want: 5, weight: 7 },
      { label: 'Crew abilities used', have: this.abilitiesUsed.length, want: 3, weight: 5 },
      { label: 'Gold ratings', have: this.goldCount, want: STORY_MISSIONS.length, weight: 5 },
    ];
  }

  completion() {
    let pct = 0;
    for (const row of this.checklist()) pct += row.weight * Math.min(1, row.have / row.want);
    return Math.round(pct);
  }

  serialize() {
    return {
      cash: this.cash, rp: this.rp, storyDone: this.storyDone, medals: this.medals,
      missionTimes: this.missionTimes, courierDone: this.courierDone, racesWon: this.racesWon,
      stunts: this.stunts, longestLeap: this.longestLeap, takedowns: this.takedowns,
      carsStolen: this.carsStolen, copsEscaped: this.copsEscaped, crewUses: this.crewUses,
      abilitiesUsed: this.abilitiesUsed, districtsWorked: this.districtsWorked,
      distanceKm: Math.round(this.distanceKm * 100) / 100, starsFound: this.starsFound,
      playSeconds: Math.round(this.playSeconds),
    };
  }

  deserialize(data) {
    this.reset();
    if (!data) return;
    for (const k of Object.keys(this.serialize())) {
      if (data[k] !== undefined) this[k] = data[k];
    }
  }
}
