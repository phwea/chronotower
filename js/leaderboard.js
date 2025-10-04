/* leaderboard.js
   Renders the run archive using locally stored completion history.
*/
(function () {
  const list = document.getElementById('board');
  if (!list) return;

  const save = Storage.read();
  const runs = Array.isArray(save.runs) ? [...save.runs] : [];
  if (runs.length === 0) {
    list.innerHTML = '<li>No recorded expeditions yet. Stabilize a sector to log your run.</li>';
    return;
  }

  runs.sort((a, b) => {
    if (b.sector !== a.sector) return b.sector - a.sector;
    if (a.result !== b.result) {
      if (a.result === 'cleared' && b.result !== 'cleared') return -1;
      if (b.result === 'cleared' && a.result !== 'cleared') return 1;
    }
    return a.time - b.time;
  });

  const rows = runs.slice(0, 15).map((run, index) => {
    const time = (run.time || 0).toFixed(2);
    const status = run.result === 'cleared' ? 'Cleared' : 'Defeated';
    const date = new Date(run.timestamp || Date.now());
    return `<li>#${index + 1} — Sector ${run.sector} • ${status} • ${time}s • Seed ${run.seed} • ${date.toLocaleString()}</li>`;
  });

  list.innerHTML = rows.join('');
})();
