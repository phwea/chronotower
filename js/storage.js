/* storage.js
   Centralized localStorage helpers and default save schema for Chrono Shift.
*/
(function () {
  const KEY = "chrono_shift_save_v1";

  const DEFAULT_SAVE = {
    sector: 1,
    credits: 0,
    bestSector: 1,
    currentRun: null,
    upgrades: {
      engine: 0,   // movement speed & dash recharge
      focus: 0,    // maximum energy & regeneration
      arsenal: 0,  // weapon damage & fire rate
      chrono: 0,   // slow-time efficiency & shields
    },
    runs: [],
  };

  function cloneDefault() {
    return {
      ...DEFAULT_SAVE,
      upgrades: { ...DEFAULT_SAVE.upgrades },
      runs: [],
    };
  }

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return cloneDefault();
      const parsed = JSON.parse(raw);
      return {
        ...cloneDefault(),
        ...parsed,
        upgrades: { ...DEFAULT_SAVE.upgrades, ...(parsed.upgrades || {}) },
        runs: Array.isArray(parsed.runs) ? [...parsed.runs] : [],
      };
    } catch {
      return cloneDefault();
    }
  }

  function write(state) {
    const toSave = {
      ...cloneDefault(),
      ...state,
      upgrades: { ...DEFAULT_SAVE.upgrades, ...(state.upgrades || {}) },
      runs: Array.isArray(state.runs) ? state.runs.slice(0, 30) : [],
    };
    localStorage.setItem(KEY, JSON.stringify(toSave));
  }

  function reset() {
    write(cloneDefault());
  }

  function appendRun(entry) {
    const save = read();
    const runs = Array.isArray(save.runs) ? [...save.runs] : [];
    runs.push({
      sector: entry.sector || 1,
      seed: entry.seed || 0,
      time: typeof entry.time === "number" ? entry.time : 0,
      result: entry.result || "cleared",
      timestamp: entry.timestamp || Date.now(),
    });
    runs.sort((a, b) => {
      if (b.sector !== a.sector) return b.sector - a.sector;
      if (a.result !== b.result) {
        if (a.result === "cleared" && b.result !== "cleared") return -1;
        if (b.result === "cleared" && a.result !== "cleared") return 1;
      }
      return a.time - b.time;
    });
    save.runs = runs.slice(0, 20);
    write(save);
    return save;
  }

  window.Storage = {
    read,
    write,
    reset,
    appendRun,
    KEY,
  };
})();
