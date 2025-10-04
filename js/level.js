/* level.js
   Generates simple platform layouts per floor and handles collision helpers.
*/
(function(){
  // Axis-aligned rectangle collision helper
  function aabb(ax, ay, aw, ah, bx, by, bw, bh){
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // Create a random set of platforms that "staircase" upward.
  function generateLevel(floor, width, height){
    const rng = (seed => () => (seed = (seed*9301+49297)%233280)/233280)(floor*1337);
    const platforms = [];

    const groundH = 24;
    // Start platform near bottom
    platforms.push({x: 40, y: height-64, w: 200, h: 16});

    // A handful of rising platforms
    const count = 8 + Math.min(10, Math.floor(floor/2));
    let y = height - 120;
    for(let i=0;i<count;i++){
      const w = 120 + Math.floor(rng()*180);
      const x = 80 + Math.floor(rng()*(width - w - 160));
      platforms.push({x, y, w, h: 14});
      y -= 40 + Math.floor(rng()*40);
    }

    // Exit door (reach it to finish floor)
    const exit = {x: width-100, y: Math.max(60, y - 40), w: 40, h: 60};

    // A few hazards (spikes)
    const hazards = [];
    const hazardCount = Math.min(6, Math.floor(floor/3)+2);
    for(let i=0;i<hazardCount;i++){
      const p = platforms[1 + Math.floor(rng()*(platforms.length-1))];
      hazards.push({x: p.x + 10 + Math.floor(rng()*(p.w-30)), y: p.y-10, w: 24, h: 10});
    }

    return { platforms, exit, hazards, groundH };
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
