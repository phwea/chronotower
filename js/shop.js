/* shop.js
   Handles buying upgrades and displaying current stats for Chrono Shift.
*/
(function () {
  const save = Storage.read();

  const $stats = document.getElementById("shopStats");
  function renderStats() {
    const upgrades = save.upgrades;
    $stats.innerHTML = `
      <strong>Next Sector:</strong> ${save.sector} &nbsp;•&nbsp;
      <strong>Chrono Cores:</strong> ${save.credits} &nbsp;•&nbsp;
      <strong>Best Sector:</strong> ${save.bestSector}<br/>
      Upgrades — Engine: ${upgrades.engine} • Focus: ${upgrades.focus} • Arsenal: ${upgrades.arsenal} • Chrono: ${upgrades.chrono}
    `;
  }

  const costs = { engine: 45, focus: 45, arsenal: 55, chrono: 60 };

  function buy(upgrade) {
    const cost = costs[upgrade];
    if (!cost) return;
    if (save.credits < cost) {
      alert("You need more chrono cores.");
      return;
    }
    save.credits -= cost;
    save.upgrades[upgrade] = (save.upgrades[upgrade] || 0) + 1;
    Storage.write(save);
    renderStats();
  }

  document.querySelectorAll('.card[data-upgrade]').forEach((btn) => {
    btn.addEventListener('click', () => buy(btn.dataset.upgrade));
  });

  renderStats();
})();
