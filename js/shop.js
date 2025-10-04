/* shop.js
   Handles buying upgrades and displaying current stats.
*/
(function(){
  const save = Storage.read();

  const $stats = document.getElementById('shopStats');
  function renderStats(){
    $stats.innerHTML = `
      <strong>Floor:</strong> ${save.level} &nbsp;•&nbsp;
      <strong>Shards:</strong> ${save.coins} &nbsp;•&nbsp;
      <strong>Best:</strong> ${save.bestLevel}<br/>
      Upgrades — Speed: ${save.upgrades.speed} • Jump: ${save.upgrades.jump} • Max Power: ${save.upgrades.stamina} • Regen: ${save.upgrades.regen}
    `;
  }

  function buy(upgrade){
    const costs = { speed:30, jump:30, stamina:40, regen:40 };
    const cost = costs[upgrade] || 999;
    if(save.coins < cost) { alert("Not enough shards."); return; }
    save.coins -= cost;
    save.upgrades[upgrade] = (save.upgrades[upgrade]||0) + 1;
    Storage.write(save);
    renderStats();
  }

  document.querySelectorAll('.card[data-upgrade]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      buy(btn.dataset.upgrade);
    });
  });

  renderStats();
})();
