/* storage.js
   Centralized localStorage helpers and default save schema.
   Everything attaches to window.Storage for simplicity (no modules).
*/
(function () {
  const KEY = "chrono_tower_save_v1";

  const DEFAULT_SAVE = {
    level: 1,
    coins: 0,           // "time shards"
    bestLevel: 1,
    currentSeed: null,
    upgrades: {         // basic permanent shop upgrades
      speed: 0,
      jump: 0,
      stamina: 0,
      regen: 0,
    }
  };

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULT_SAVE };
      const parsed = JSON.parse(raw);
      // Merge with defaults to be forward-compatible
      return { ...DEFAULT_SAVE, ...parsed, upgrades: { ...DEFAULT_SAVE.upgrades, ...(parsed.upgrades||{}) } };
    } catch {
      return { ...DEFAULT_SAVE };
    }
  }

  function write(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function reset() {
    write({ ...DEFAULT_SAVE });
  }

  // Simple helpers you can call anywhere
  window.Storage = {
    read, write, reset, KEY
  };
})();
