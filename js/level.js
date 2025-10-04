/* level.js
   Generates multi-variant platform layouts per floor, handles dynamic pieces, and collision helpers.
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

  function randRange(rng, min, max){
    return min + rng() * (max - min);
  }

  function makePlatform(x, y, w, opts){
    const platform = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: 14, motionDx: 0, motionDy: 0 };
    if(opts && opts.moving){
      const moving = opts.moving;
      platform.moving = {
        axis: moving.axis,
        range: moving.range,
        speed: moving.speed,
        time: moving.time || 0,
        originX: platform.x,
        originY: platform.y,
        easing: moving.easing || 'sine'
      };
    }
    return platform;
  }

  function placeSpike(rng, platform){
    if(platform.w < 80) return null;
    const width = 28 + Math.floor(rng()*24);
    const safeMargin = 32;
    if(platform.w - safeMargin*2 < width) return null;
    const hx = Math.round(platform.x + safeMargin + rng() * (platform.w - width - safeMargin*2));
    return { type: 'spike', x: hx, y: platform.y - 12, w: width, h: 12 };
  }

  function placeSaw(rng, x, y, axis, difficulty){
    const radius = 14 + Math.floor(rng()*6);
    const range = 48 + rng()*60 + difficulty * 40;
    const speed = 0.8 + rng()*0.8 + difficulty * 0.4;
    return {
      type: 'saw',
      x: Math.round(x),
      y: Math.round(y),
      radius,
      axis,
      range,
      speed,
      originX: Math.round(x),
      originY: Math.round(y),
      time: rng()*Math.PI*2
    };
  }

  function placeFlame(rng, x, y, height, difficulty){
    const w = 26;
    const onDuration = 1.0 + rng()*0.8 + difficulty * 0.5;
    const offDuration = 1.2 + rng()*1.4;
    return {
      type: 'flame',
      x: Math.round(x),
      y: Math.round(y - height),
      w,
      h: Math.round(height),
      onDuration,
      offDuration,
      timer: rng() * (onDuration + offDuration),
      active: rng() > 0.5
    };
  }

  function buildStairsSegment(state){
    const { rng, width, floorY, difficulty, anchor } = state;
    const platforms = [];
    const hazards = [];
    let previous = anchor;
    const steps = 2 + Math.floor(rng()*3);
    for(let i=0;i<steps;i++){
      const w = 120 + Math.floor(rng()*110);
      const rise = 48 + rng()*(60 + difficulty*40);
      const horiz = 60 + rng()*120;
      const direction = rng() < 0.25 ? -1 : 1;
      let x = previous.x + previous.w/2 + direction * horiz;
      x = clamp(x, 32, width - w - 32);
      const y = clamp(previous.y - rise, 70, floorY - 120);
      const platform = makePlatform(x, y, w);
      platforms.push(platform);
      previous = platform;
      if(rng() < 0.5 + difficulty*0.3){
        const spike = placeSpike(rng, platform);
        if(spike) hazards.push(spike);
      }
    }
    return { platforms, hazards, anchor: previous };
  }

  function buildSwitchbackSegment(state){
    const { rng, width, floorY, difficulty, anchor } = state;
    const platforms = [];
    const hazards = [];
    let previous = anchor;
    let dir = rng() < 0.5 ? -1 : 1;
    const steps = 3 + Math.floor(rng()*2);
    for(let i=0;i<steps;i++){
      const w = 110 + Math.floor(rng()*90);
      const rise = 44 + rng()*(50 + difficulty*30);
      const horizontal = 90 + rng()*140;
      let x = previous.x + dir * horizontal;
      x = clamp(x, 32, width - w - 32);
      const y = clamp(previous.y - rise, 60, floorY - 140);
      const platform = makePlatform(x, y, w);
      platforms.push(platform);
      if(rng() < 0.35 + difficulty*0.35){
        const spike = placeSpike(rng, platform);
        if(spike) hazards.push(spike);
      }
      dir *= -1;
      previous = platform;
    }
    if(rng() < 0.6){
      const middle = platforms[Math.floor(platforms.length/2)];
      const saw = placeSaw(rng, middle.x + middle.w/2, middle.y - 40, 'x', difficulty);
      hazards.push(saw);
    }
    return { platforms, hazards, anchor: previous };
  }

  function buildMovingBridgeSegment(state){
    const { rng, width, floorY, difficulty, anchor } = state;
    const platforms = [];
    const hazards = [];
    const gap = 180 + rng()*140;
    const destinationW = 140 + Math.floor(rng()*140);
    let destX = anchor.x + anchor.w + gap;
    destX = clamp(destX, 60, width - destinationW - 40);
    const destY = clamp(anchor.y - (36 + rng()*60), 70, floorY - 140);
    const destPlatform = makePlatform(destX, destY, destinationW);

    const moverWidth = 120;
    const leftBound = clamp(anchor.x + anchor.w - moverWidth + 6, 32, width - moverWidth - 32);
    const rightBound = clamp(destPlatform.x + 12, leftBound + 40, width - moverWidth - 32);
    const originX = (leftBound + rightBound) * 0.5;
    const range = Math.max(60, (rightBound - leftBound) * 0.5);
    const moverYBottom = anchor.y - 34;
    const moverYTop = clamp(destPlatform.y - 12, 60, moverYBottom - 12);
    const moverOriginY = (moverYBottom + moverYTop) * 0.5;
    const mover = makePlatform(originX, moverOriginY, moverWidth, {
      moving: {
        axis: 'x',
        range: range,
        speed: 0.9 + difficulty * 0.6 + rng()*0.4,
        time: rng()*Math.PI*2
      }
    });
    if(mover.moving){
      mover.moving.originX = Math.round(originX);
      mover.moving.originY = Math.round(moverOriginY);
      mover.y = Math.round(moverOriginY);
    }

    platforms.push(mover, destPlatform);

    const saw = placeSaw(rng, mover.x + mover.w/2, mover.y - 36, 'y', difficulty);
    hazards.push(saw);

    if(rng() < 0.5 && destPlatform.w > 60){
      const flameX = destPlatform.x + 20 + rng()*(destPlatform.w - 60);
      const flame = placeFlame(rng, flameX, destPlatform.y, 70 + difficulty*40, difficulty);
      if(flame) hazards.push(flame);
    }

    return { platforms, hazards, anchor: destPlatform };
  }

  function buildVerticalLiftSegment(state){
    const { rng, width, floorY, difficulty, anchor } = state;
    const platforms = [];
    const hazards = [];
    const landingW = 120 + Math.floor(rng()*120);
    const landingX = clamp(anchor.x + anchor.w/2 + (rng() - 0.5) * 120, 32, width - landingW - 32);
    const landingY = clamp(anchor.y - (120 + rng()*60), 60, floorY - 160);
    const landing = makePlatform(landingX, landingY, landingW);

    const elevatorWidth = 120;
    const bottomY = anchor.y - 34;
    const topY = landing.y + 6;
    const originY = (bottomY + topY) * 0.5;
    const rangeY = Math.max(50, (bottomY - topY) * 0.5);
    const elevatorX = clamp(anchor.x + anchor.w/2 - elevatorWidth/2, 32, width - elevatorWidth - 32);
    const elevator = makePlatform(elevatorX, originY, elevatorWidth, {
      moving: {
        axis: 'y',
        range: rangeY,
        speed: 0.8 + difficulty * 0.5 + rng()*0.4,
        time: rng()*Math.PI
      }
    });
    if(elevator.moving){
      elevator.moving.originX = elevator.x;
      elevator.moving.originY = Math.round(originY);
    }

    platforms.push(elevator, landing);

    if(rng() < 0.45){
      const saw = placeSaw(rng, landing.x + landing.w/2, landing.y - 42, 'x', difficulty);
      hazards.push(saw);
    }

    if(rng() < 0.55){
      const flameX = elevator.x + 16 + rng()*(elevator.w - 32);
      const flame = placeFlame(rng, flameX, anchor.y - 6, 60 + difficulty*30, difficulty);
      if(flame) hazards.push(flame);
    }

    return { platforms, hazards, anchor: landing };
  }

  function buildScatterSegment(state){
    const { rng, width, floorY, difficulty, anchor } = state;
    const platforms = [];
    const hazards = [];
    let previous = anchor;
    const steps = 3 + Math.floor(rng()*2);
    for(let i=0;i<steps;i++){
      const w = 90 + Math.floor(rng()*70);
      const rise = 36 + rng()*44;
      let x = previous.x + (rng() - 0.5) * 220;
      x = clamp(x, 32, width - w - 32);
      const y = clamp(previous.y - rise, 60, floorY - 160);
      const platform = makePlatform(x, y, w);
      platforms.push(platform);
      previous = platform;
      if(rng() < 0.4){
        const spike = placeSpike(rng, platform);
        if(spike) hazards.push(spike);
      }
    }
    if(rng() < 0.5){
      const last = platforms[platforms.length - 1];
      hazards.push(placeSaw(rng, last.x + last.w/2, last.y - 36, 'y', difficulty));
    }
    return { platforms, hazards, anchor: previous };
  }

  const SEGMENTS = [buildStairsSegment, buildSwitchbackSegment, buildMovingBridgeSegment, buildVerticalLiftSegment, buildScatterSegment];

  // Create a random set of platforms with varied patterns that always rise towards the exit.
  function generateLevel(floor, width, height, seed){
    const baseSeed = typeof seed === 'number' ? Math.floor(seed) : Math.floor(Math.random()*0xffffffff);
    const rng = createRng(baseSeed ^ (floor * 0x9e3779b1));

    const groundH = 24;
    const floorY = height - groundH;
    const difficulty = Math.min(1.15, floor / 14);

    const level = {
      platforms: [],
      hazards: [],
      exit: null,
      groundH,
      seed: baseSeed,
      elapsed: 0
    };

    // Start platform near bottom providing safe landing
    const startPlatform = makePlatform(40, floorY - 40, 220);
    level.platforms.push(startPlatform);

    let anchor = startPlatform;
    const segmentCount = 4 + Math.min(5, Math.floor(floor / 2));

    for(let i=0;i<segmentCount;i++){
      const builder = SEGMENTS[Math.floor(rng()*SEGMENTS.length)];
      const result = builder({ rng, width, floorY, difficulty, anchor });
      for(const p of result.platforms){
        level.platforms.push(p);
      }
      for(const h of result.hazards){
        if(h) level.hazards.push(h);
      }
      anchor = result.anchor;
    }

    // Ensure anchor climbs high enough; if not, add a final staircase
    while(anchor.y > height * 0.4){
      const result = buildStairsSegment({ rng, width, floorY, difficulty, anchor });
      for(const p of result.platforms) level.platforms.push(p);
      for(const h of result.hazards) if(h) level.hazards.push(h);
      anchor = result.anchor;
    }

    // Final bridge near the exit to guarantee completion
    const finalW = 180 + Math.floor(rng()*120);
    const finalY = clamp(anchor.y - (40 + rng()*40), 60, floorY - 180);
    const finalX = clamp(width - finalW - 60, 40, width - finalW - 40);
    const finalPlatform = makePlatform(finalX, finalY, finalW);
    level.platforms.push(finalPlatform);

    if(rng() < 0.5){
      const spike = placeSpike(rng, finalPlatform);
      if(spike) level.hazards.push(spike);
    }

    anchor = finalPlatform;

    level.exit = {
      x: Math.round(clamp(anchor.x + anchor.w - 50, anchor.x + 30, width - 60)),
      y: Math.round(anchor.y - 64),
      w: 44,
      h: 64
    };

    return level;
  }

  function updateLevel(level, dt){
    level.elapsed += dt;
    for(const p of level.platforms){
      if(p.moving){
        const prevX = p.x;
        const prevY = p.y;
        p.moving.time += dt * p.moving.speed;
        const wave = p.moving.easing === 'sine' ? Math.sin(p.moving.time) : Math.sin(p.moving.time);
        const offset = wave * p.moving.range;
        if(p.moving.axis === 'x'){
          p.x = p.moving.originX + offset;
          p.y = p.moving.originY;
        }else{
          p.x = p.moving.originX;
          p.y = p.moving.originY + offset;
        }
        p.motionDx = p.x - prevX;
        p.motionDy = p.y - prevY;
      }else{
        p.motionDx = 0;
        p.motionDy = 0;
      }
    }

    for(const h of level.hazards){
      if(h?.type === 'saw'){
        const prevX = h.x;
        const prevY = h.y;
        h.time += dt * h.speed;
        const offset = Math.sin(h.time) * h.range;
        if(h.axis === 'x'){
          h.x = h.originX + offset;
          h.y = h.originY;
        }else{
          h.x = h.originX;
          h.y = h.originY + offset;
        }
        h.motionDx = h.x - prevX;
        h.motionDy = h.y - prevY;
      }else if(h?.type === 'flame'){
        h.timer += dt;
        if(h.active){
          if(h.timer > h.onDuration){
            h.timer = 0;
            h.active = false;
          }
        }else{
          if(h.timer > h.offDuration){
            h.timer = 0;
            h.active = true;
          }
        }
      }
    }
  }

  // Resolve vertical collision with platforms and keep track of moving surfaces
  function resolvePlatformCollision(player, level){
    const rect = {x: player.pos.x, y: player.pos.y, w: player.size.w, h: player.size.h};
    let onGround = false;
    let surface = null;

    for(const p of level.platforms){
      if(aabb(rect.x, rect.y, rect.w, rect.h, p.x, p.y, p.w, p.h)){
        // Coming from above: place player on top
        if(player.vel.y > 0 && rect.y + rect.h - p.y < 18){
          rect.y = p.y - rect.h;
          player.vel.y = 0;
          onGround = true;
          surface = p;
        }
      }
    }

    // Floor
    const floorY = (level.height || 540) - level.groundH;
    if(rect.y + rect.h > floorY){
      rect.y = floorY - rect.h;
      player.vel.y = 0;
      onGround = true;
      surface = null;
    }

    // Apply corrected position
    player.pos.y = rect.y;
    return { onGround, surface };
  }

  window.LevelGen = { generateLevel, updateLevel, resolvePlatformCollision };
})();
