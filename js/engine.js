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

  function clamp(v, min, max){
    return Math.max(min, Math.min(max, v));
  }

  // Simple hazard collision check
  function hitHazard(){
    const rect = { x: player.pos.x, y: player.pos.y, w: player.size.w, h: player.size.h };
    for(const h of level.hazards){
      if(h.type === 'spike'){
        if(rectOverlapRect(rect, h)) return true;
      }else if(h.type === 'saw'){
        if(circleRectOverlap(h, rect)) return true;
      }else if(h.type === 'flame'){
        if(h.active && rectOverlapRect(rect, h)) return true;
      }else if(h.type === 'crusher'){
        if(rectOverlapRect(rect, h)) return true;
      }
    }
    return false;
  }

  function rectOverlapRect(a, b){
    return a.x < b.x + b.w &&
           a.x + a.w > b.x &&
           a.y < b.y + b.h &&
           a.y + a.h > b.y;
  }

  function circleRectOverlap(circle, rect){
    const nearestX = clamp(circle.x, rect.x, rect.x + rect.w);
    const nearestY = clamp(circle.y, rect.y, rect.y + rect.h);
    const dx = circle.x - nearestX;
    const dy = circle.y - nearestY;
    return dx*dx + dy*dy <= circle.radius * circle.radius;
  }

  // Check reaching exit
  function reachedExit(){
    const rect = { x: player.pos.x, y: player.pos.y, w: player.size.w, h: player.size.h };
    return rectOverlapRect(rect, level.exit);
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
    for(const p of level.platforms){
      ctx.fillStyle = p.moving ? '#5f97ff' : '#6aa9ff';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      if(p.moving){
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(p.x, p.y, p.w, 4);
      }
    }

    // Hazards (spikes)
    for(const h of level.hazards){
      if(h.type === 'spike'){
        ctx.fillStyle = '#ff6a6a';
        ctx.beginPath();
        ctx.moveTo(h.x, h.y + h.h);
        ctx.lineTo(h.x + h.w/2, h.y);
        ctx.lineTo(h.x + h.w, h.y + h.h);
        ctx.closePath();
        ctx.fill();
      }else if(h.type === 'saw'){
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(0, 0, h.radius, 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(h.radius, 0);
        ctx.stroke();
        ctx.restore();
      }else if(h.type === 'flame'){
        ctx.save();
        ctx.translate(h.x + h.w/2, h.y + h.h);
        ctx.scale(1, h.active ? 1 : 0.25);
        const gradient = ctx.createLinearGradient(0, -h.h, 0, 0);
        gradient.addColorStop(0, '#ffeab3');
        gradient.addColorStop(1, '#ff7a33');
        ctx.fillStyle = h.active ? gradient : 'rgba(120,120,160,0.3)';
        ctx.beginPath();
        ctx.moveTo(-h.w/2, 0);
        ctx.quadraticCurveTo(0, -h.h, h.w/2, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#8c4a16';
        ctx.fillRect(h.x, h.y + h.h, h.w, 10);
      }else if(h.type === 'crusher'){
        ctx.fillStyle = '#d85f5f';
        ctx.fillRect(h.x, h.y, h.w, h.h);
        ctx.strokeStyle = '#2b1b1b';
        ctx.lineWidth = 2;
        ctx.strokeRect(h.x, h.y, h.w, h.h);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(h.x, h.y, h.w, 6);
      }
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

    LevelGen.updateLevel(level, dt);

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
