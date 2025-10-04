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

  const MAX_GAP = 220;
  const MIN_RISE = 28;
  const MAX_RISE = 140;

  function ensureReachableX(previous, width, platformWidth, desiredX){
    const prevCenter = previous.x + previous.w * 0.5;
    const half = platformWidth * 0.5;
    const minCenter = Math.max(half + 32, prevCenter - MAX_GAP);
    const maxCenter = Math.min(width - half - 32, prevCenter + MAX_GAP);
    let center = clamp(desiredX + half, minCenter, maxCenter);
    if(minCenter > maxCenter){
      center = clamp(prevCenter, half + 32, width - half - 32);
    }
    return Math.round(center - half);
  }

  function ensureReachableY(previous, floorY, desiredY){
    const minY = Math.max(60, previous.y - MAX_RISE);
    const maxY = Math.min(previous.y - MIN_RISE, floorY - 120);
    if(minY > maxY){
      return Math.round(Math.max(60, previous.y - MIN_RISE));
    }
    return Math.round(clamp(desiredY, minY, maxY));
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

  function placeCrusher(rng, x, y, height, difficulty){
    const w = 44 + Math.floor(rng()*16);
    const h = 28 + Math.floor(rng()*10);
    const travel = Math.min(height, 70 + rng()*60 + difficulty * 40);
    const range = Math.max(36, travel * 0.5);
    const originY = Math.round(y);
    const time = rng() * Math.PI * 2;
    const crusher = {
      type: 'crusher',
      x: Math.round(x - w/2),
      y: Math.round(originY + Math.sin(time) * range),
      w: Math.round(w),
      h: Math.round(h),
      range,
      speed: 0.9 + rng()*0.7 + difficulty * 0.4,
      originX: Math.round(x - w/2),
      originY,
      axis: 'y',
      time,
      motionDx: 0,
      motionDy: 0
    };
    return crusher;
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
      x = ensureReachableX(previous, width, w, x);
      const desiredY = previous.y - rise;
      const y = ensureReachableY(previous, floorY, desiredY);
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
      x = ensureReachableX(previous, width, w, x);
      const desiredY = previous.y - rise;
      const y = ensureReachableY(previous, floorY, desiredY);
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
    destX = ensureReachableX(anchor, width, destinationW, destX);
    const destY = ensureReachableY(anchor, floorY, anchor.y - (36 + rng()*60));
    const destPlatform = makePlatform(destX, destY, destinationW);

    const moverWidth = 120;
    const leftBound = clamp(anchor.x + anchor.w - moverWidth + 16, 32, width - moverWidth - 32);
    const rightTarget = destPlatform.x - 12;
    const rightBound = clamp(Math.max(rightTarget, leftBound + 60), leftBound + 40, width - moverWidth - 32);
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
    const landingX = ensureReachableX(anchor, width, landingW, anchor.x + anchor.w/2 + (rng() - 0.5) * 120);
    const landingY = ensureReachableY(anchor, floorY, anchor.y - (120 + rng()*60));
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
      x = ensureReachableX(previous, width, w, x);
      const desiredY = previous.y - rise;
      const y = ensureReachableY(previous, floorY, desiredY);
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

  function buildGauntletSegment(state){
    const { rng, width, floorY, difficulty, anchor } = state;
    const platforms = [];
    const hazards = [];
    let previous = anchor;
    const steps = 3 + Math.floor(rng()*2);
    let direction = rng() < 0.5 ? -1 : 1;
    for(let i=0;i<steps;i++){
      const w = 110 + Math.floor(rng()*90);
      const horizontal = 80 + rng()*110;
      let x = previous.x + direction * horizontal;
      x = ensureReachableX(previous, width, w, x);
      const desiredY = previous.y - (44 + rng()*50);
      const y = ensureReachableY(previous, floorY, desiredY);
      const moving = rng() < 0.4;
      const platform = makePlatform(x, y, w, moving ? {
        moving: {
          axis: 'x',
          range: 30 + rng()*30,
          speed: 0.8 + rng()*0.6 + difficulty * 0.3,
          time: rng()*Math.PI*2
        }
      } : undefined);
      if(platform.moving){
        platform.moving.originX = platform.x;
        platform.moving.originY = platform.y;
      }
      platforms.push(platform);
      if(rng() < 0.4 + difficulty*0.25){
        const sawAxis = rng() < 0.5 ? 'x' : 'y';
        const saw = placeSaw(rng, platform.x + platform.w/2, platform.y - 40, sawAxis, difficulty);
        hazards.push(saw);
      }
      previous = platform;
      direction *= -1;
    }

    if(platforms.length){
      const target = platforms[Math.floor(platforms.length/2)];
      if(target && rng() < 0.65){
        const crusher = placeCrusher(rng, target.x + target.w/2, target.y - 20, 80 + difficulty*30, difficulty);
        hazards.push(crusher);
      }
    }

    return { platforms, hazards, anchor: previous };
  }

  const SEGMENTS = [
    buildStairsSegment,
    buildSwitchbackSegment,
    buildMovingBridgeSegment,
    buildVerticalLiftSegment,
    buildScatterSegment,
    buildGauntletSegment
  ];

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
      elapsed: 0,
      width,
      height
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
    const finalY = ensureReachableY(anchor, floorY, anchor.y - (40 + rng()*40));
    const finalX = ensureReachableX(anchor, width, finalW, width - finalW - 80);
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
      }else if(h?.type === 'crusher'){
        const prevY = h.y;
        h.time += dt * h.speed;
        const offset = Math.sin(h.time) * h.range;
        h.y = h.originY + offset;
        h.motionDx = 0;
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
