// save.js — three localStorage save slots. A slot stores the career
// ledger, the taken star indices and a human summary (act, mission,
// completion, cash) that the title screen and the dossier print on the
// slot's card without loading the game behind it.

import { SAVE_KEY_PREFIX, SAVE_SLOTS, STORY_MISSIONS } from './config.js';
import { CareerStats } from './stats.js';

export class SaveSystem {
  constructor() {
    this.storageOk = true;
    try {
      const probe = SAVE_KEY_PREFIX + 'probe';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
    } catch (err) {
      this.storageOk = false;   // private mode etc: saves simply unavailable
    }
  }

  key(slot) { return SAVE_KEY_PREFIX + slot; }

  read(slot) {
    if (!this.storageOk) return null;
    try {
      const raw = window.localStorage.getItem(this.key(slot));
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  write(slot, stats, starsTaken) {
    if (!this.storageOk) return false;
    const data = {
      version: 1,
      savedAt: Date.now(),
      stats: stats.serialize(),
      starsTaken,
    };
    try {
      window.localStorage.setItem(this.key(slot), JSON.stringify(data));
      return true;
    } catch (err) {
      return false;
    }
  }

  erase(slot) {
    if (this.storageOk) window.localStorage.removeItem(this.key(slot));
  }

  // One summary per slot for the title screen and the dossier: the act the
  // player reached, the next mission's title, completion and cash. A
  // scratch ledger does the reading so the live career is never touched.
  summaries() {
    const out = [];
    const probe = new CareerStats();
    for (let i = 0; i < SAVE_SLOTS; i++) {
      const data = this.read(i);
      if (!data) { out.push({ slot: i, empty: true }); continue; }
      probe.deserialize(data.stats);
      const done = probe.storyCount;
      const next = STORY_MISSIONS[done];
      out.push({
        slot: i,
        empty: false,
        act: next ? next.act : 'Epilogue — Free Roam',
        mission: next ? next.title : 'Free roam',
        completion: probe.completion(),
        cash: probe.cash,
        when: new Date(data.savedAt),
      });
    }
    return out;
  }
}
