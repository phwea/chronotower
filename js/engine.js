/* engine.js
   Bootstraps the run, handles render loop, level transitions, HUD, pause, and basic hazards/exit.
*/
(function(){
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const W = canvas.width, H = canvas.height;

  // Load/prepare save
  const save = Storage.read();

  // URL params: ?load=1 to continue exact level, ?continue=1 to keep level
  const params = new URLSearchParams(location.search);
  let currentLevel = params.has('load') || params.has('continue') ? save.level : 1;

  function freshSeed(){
    return Math.floor(Math.random() * 0xffffffff);
  }

  let levelSeed;
  if(params.has('load') || params.has('continue')){
    levelSeed = typeof save.currentSeed === 'number' ? save.currentSeed : freshSeed();
    if(save.currentSeed !== levelSeed){
      save.currentSeed = levelSeed;
      Storage.write(save);
    }
  }else{
    levelSeed = freshSeed();
    save.level = currentLevel;
    save.currentSeed = levelSeed;
    Storage.write(save);
  }

  // Create level layout
  let level = LevelGen.generateLevel(currentLevel, W, H, levelSeed);
  level.width = W; level.height = H;

  // Player
  let player = Player.createPlayer(save);

  // Coins earned per level
  let coinsThisLevel = 0;

  // Pause system
  let paused = false;
  const overlay = document.getElementById('pauseOverlay');
  document.getElementById('btnResume')?.addEventListener('click', (e)=>{ e.preventDefault(); togglePause(false); });
  function togglePause(on){
    paused = on;
    overlay.classList.toggle('hidden', !on);
  }

  window.addEventListener('keydown', (e)=>{
    if(e.code === 'Escape') togglePause(!paused);
  });

  // HUD refs
  const hudLevel = document.getElementById('hud-level');
  const hudCoins = document.getElementById('hud-coins');
  const hudStam  = document.getElementById('hud-stamina');

  function updateHUD(){
    hudLevel.textContent = `Floor: ${currentLevel}`;
    hudCoins.textContent = `Shards: ${save.coins}`;
    const pct = Math.round((player.stamina / player.staminaMax) * 100);
    hudStam.textContent = `Time Power: ${pct}%`;
  }

  // Simple hazard collision check
  function hitHazard(){
    for(const h of level.hazards){
      if(rectOverlap(player, h)) return true;
    }
    return false;
  }

  function rectOverlap(p, r){
    return p.pos.x < r.x + r.w &&
           p.pos.x + p.size.w > r.x &&
           p.pos.y < r.y + r.h &&
           p.pos.y + p.size.h > r.y;
  }

  // Check reaching exit
  function reachedExit(){
    return rectOverlap(player, level.exit);
  }

  // Reward and advance floors; every 5th floor: redirect to shop
  function nextFloor(){
    const reward = 10 + Math.floor(currentLevel/2);
    save.coins += reward;
    currentLevel += 1;
    save.level = currentLevel;
    save.bestLevel = Math.max(save.bestLevel, currentLevel);
    levelSeed = freshSeed();
    save.currentSeed = levelSeed;
    Storage.write(save);

    // Every 5 floors go to shop
    if(currentLevel % 5 === 0){
      location.href = "shop.html";
      return;
    }
    // Otherwise regenerate level and reset player
    level = LevelGen.generateLevel(currentLevel, W, H, levelSeed);
    level.width = W; level.height = H;
    player.pos.x = 80; player.pos.y = H - 120;
    player.vel.x = 0; player.vel.y = 0;
    player.rewindBuffer.length = 0;
  }

  // Kill -> reset to last checkpoint floor (start of current 5-floor block)
  function dieAndReset(){
    // Put you back to the first floor of the current block
    const blockStart = Math.max(1, currentLevel - ((currentLevel-1)%5));
    currentLevel = blockStart;
    save.level = currentLevel;
    levelSeed = freshSeed();
    save.currentSeed = levelSeed;
    Storage.write(save);
    level = LevelGen.generateLevel(currentLevel, W, H, levelSeed);
    level.width = W; level.height = H;
    player.pos.x = 80; player.pos.y = H - 120;
    player.vel.x = 0; player.vel.y = 0;
    player.rewindBuffer.length = 0;
  }

  // Render helpers
  function draw(){
    // Background gradient already via CSS; add subtle parallax “gears”
    ctx.clearRect(0,0,W,H);

    // Parallax clock rings
    ctx.globalAlpha = 0.08;
    for(let i=0;i<6;i++){
      ctx.beginPath();
      ctx.arc(W*0.5, H*0.6, 60 + i*40, 0, Math.PI*2);
      ctx.strokeStyle = i % 2 ? '#ffffff' : '#ffd166';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // Platforms
    ctx.fillStyle = '#6aa9ff';
    for(const p of level.platforms){
      ctx.fillRect(p.x, p.y, p.w, p.h);
    }

    // Hazards (spikes)
    ctx.fillStyle = '#ff6a6a';
    for(const h of level.hazards){
      ctx.beginPath();
      // little triangle spikes
      ctx.moveTo(h.x, h.y + h.h);
      ctx.lineTo(h.x + h.w/2, h.y);
      ctx.lineTo(h.x + h.w, h.y + h.h);
      ctx.closePath();
      ctx.fill();
    }

    // Exit door
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(level.exit.x, level.exit.y, level.exit.w, level.exit.h);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(level.exit.x + 10, level.exit.y + 12, 20, 36);

    // Player
    ctx.fillStyle = '#e7e9ff';
    ctx.fillRect(player.pos.x, player.pos.y, player.size.w, player.size.h);

    // Time power visual: vignette when slow/rewind
    if(player.slow || player.rewinding){
      ctx.fillStyle = 'rgba(10,10,10,0.35)';
      ctx.fillRect(0,0,W,H);
    }
  }

  // Main loop
  let last = performance.now();
  function loop(now){
    requestAnimationFrame(loop);
    if(paused) return;

    let dt = Math.min(0.033, (now - last)/1000); // clamp dt
    last = now;

    // Input → velocity
    Player.handleInput(player, dt);

    // Apply time powers (returns timeScale)
    const timeScale = Player.applyTimePowers(player, dt);
    dt *= timeScale;

    // Physics & collisions
    Player.updatePlayer(player, level, dt);

    // If fell off-screen → die
    if(player.pos.y > H + 200) dieAndReset();

    // Hazard check
    if(hitHazard()) dieAndReset();

    // Exit check
    if(reachedExit()) nextFloor();

    // Draw
    draw();

    // HUD
    updateHUD();
  }

  // Start
  requestAnimationFrame(loop);
})();
