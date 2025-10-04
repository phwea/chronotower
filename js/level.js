/* level.js
   Generates simple platform layouts per floor and handles collision helpers.
*/
(function(){
  // Axis-aligned rectangle collision helper
  function aabb(ax, ay, aw, ah, bx, by, bw, bh){
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function createRng(seed){
    let a = seed >>> 0;
    if(a === 0) a = 0x9e3779b1;
    return function(){
      a += 0x6d2b79f5;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function clamp(v, min, max){
    return Math.max(min, Math.min(max, v));
  }

  // Create a random set of platforms that "staircase" upward.
  function generateLevel(floor, width, height, seed){
    const baseSeed = typeof seed === 'number' ? Math.floor(seed) : Math.floor(Math.random()*0xffffffff);
    const rng = createRng(baseSeed ^ (floor * 0x9e3779b1));
    const platforms = [];

    const groundH = 24;
    const floorY = height - groundH;

    // Start platform near bottom providing safe landing
    const startPlatform = {x: 40, y: floorY - 40, w: 220, h: 16};
    platforms.push(startPlatform);

    let previous = startPlatform;
    let y = previous.y;
    const climbCount = 6 + Math.min(6, Math.floor(floor/2));

    for(let i=0;i<climbCount;i++){
      const w = 140 + Math.floor(rng()*140);
      const riseMin = 42;
      const riseMax = 76 + Math.min(30, floor*3);
      y = Math.max(90, y - (riseMin + rng()*(riseMax - riseMin)));

      const progress = climbCount <= 1 ? 1 : i / (climbCount - 1);
      const drift = (rng() - 0.25) * 160;
      let desired = previous.x + previous.w * 0.6 + drift + progress * 150;
      const minX = clamp(previous.x - 120 + progress * 60, 20, width - w - 20);
      const maxX = clamp(previous.x + previous.w - 40 + 160 + progress * 160, 20, width - w - 20);
      const x = clamp(desired, minX, maxX);

      const platform = {x: Math.round(x), y: Math.round(y), w, h: 14};
      platform.x = clamp(platform.x, 20, width - platform.w - 20);
      platforms.push(platform);
      previous = platform;
    }

    // Ensure we have a landing close to the exit on the right side
    if(previous.x + previous.w < width - 140){
      const bridge = {
        x: Math.round(clamp(previous.x + previous.w - 80, 40, width - 240)),
        y: Math.round(Math.max(80, previous.y - (30 + rng()*30))),
        w: 240,
        h: 14
      };
      platforms.push(bridge);
      previous = bridge;
    }

    // Exit door aligns with the final platform
    const exit = {
      x: Math.round(clamp(previous.x + previous.w - 50, previous.x + 20, width - 60)),
      y: Math.round(previous.y - 60),
      w: 40,
      h: 60
    };

    // A few hazards (spikes) placed only on intermediate platforms
    const hazards = [];
    const hazardPool = platforms.slice(1, -1).filter(p => p.w > 80);
    const hazardCount = Math.min(hazardPool.length, 2 + Math.floor((floor + 1)/3));
    for(let i=0;i<hazardCount;i++){
      const p = hazardPool[Math.floor(rng()*hazardPool.length)];
      const span = p.w - 56;
      const hx = span > 0 ? p.x + 16 + Math.floor(rng()*span) : p.x + p.w/2 - 14;
      hazards.push({x: Math.round(hx), y: p.y - 10, w: 28, h: 10});
    }

    return { platforms, exit, hazards, groundH, seed: baseSeed };
  }

  // Resolve vertical collision with platforms (very simple)
  function resolvePlatformCollision(player, level){
    const rect = {x: player.pos.x, y: player.pos.y, w: player.size.w, h: player.size.h};
    let onGround = false;

    for(const p of level.platforms){
      if(aabb(rect.x, rect.y, rect.w, rect.h, p.x, p.y, p.w, p.h)){
        // Coming from above: place player on top
        if(player.vel.y > 0 && rect.y + rect.h - p.y < 16){
          rect.y = p.y - rect.h;
          player.vel.y = 0;
          onGround = true;
        }
      }
    }

    // Floor
    const floorY = (level.height || 540) - level.groundH;
    if(rect.y + rect.h > floorY){
      rect.y = floorY - rect.h;
      player.vel.y = 0;
      onGround = true;
    }

    // Apply corrected position
    player.pos.y = rect.y;
    return onGround;
  }

  window.LevelGen = { generateLevel, resolvePlatformCollision };
})();
