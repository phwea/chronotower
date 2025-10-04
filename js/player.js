/* player.js
   Player physics and time powers (slow + rewind).
*/
(function(){
  function createPlayer(save){
    return {
      pos: {x: 80, y: 420},
      vel: {x: 0, y: 0},
      size: {w: 22, h: 32},
      onGround: false,

      // Base stats (affected by upgrades)
      baseSpeed: 160 * (1 + 0.1 * (save.upgrades.speed||0)),
      baseJump: 330 * (1 + 0.1 * (save.upgrades.jump||0)),

      // Time power (stamina)
      staminaMax: 100 * (1 + 0.2 * (save.upgrades.stamina||0)),
      stamina: 100 * (1 + 0.2 * (save.upgrades.stamina||0)),
      staminaRegen: 12 * (1 + 0.2 * (save.upgrades.regen||0)),

      // Rewind buffer: store last N positions @ fixed interval
      rewindBuffer: [],
      rewindTimer: 0,   // timer to sample positions
      rewinding: false,
      slow: false,
    };
  }

  function handleInput(p, dt){
    const LEFT = Input.isDown('KeyA') || Input.isDown('ArrowLeft');
    const RIGHT = Input.isDown('KeyD') || Input.isDown('ArrowRight');

    const accel = p.baseSpeed;
    if(LEFT)  p.vel.x = -accel;
    else if(RIGHT) p.vel.x = accel;
    else p.vel.x = 0;

    const JUMP = Input.isDown('KeyW') || Input.isDown('Space');
    if(JUMP && p.onGround){
      p.vel.y = -p.baseJump;
      p.onGround = false;
    }

    // Time powers toggle/hold
    p.slow = Input.isDown('KeyE');
    p.rewinding = Input.isDown('KeyQ');
  }

  function updatePlayer(p, level, dt){
    // Gravity
    p.vel.y += 900 * dt;

    // Move
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;

    // Keep inside canvas horizontally
    p.pos.x = Math.max(0, Math.min((level.width||960) - p.size.w, p.pos.x));

    // Collisions with platforms -> sets onGround
    const surfaceInfo = LevelGen.resolvePlatformCollision(p, level);
    p.onGround = surfaceInfo.onGround;
    if(surfaceInfo.surface){
      p.pos.x += surfaceInfo.surface.motionDx || 0;
      p.pos.y += surfaceInfo.surface.motionDy || 0;
    }
    // Re-clamp inside canvas after platform motion
    p.pos.x = Math.max(0, Math.min((level.width||960) - p.size.w, p.pos.x));

    // Rewind sampling: store past positions each 60ms
    p.rewindTimer += dt;
    if(!p.rewinding && p.rewindTimer > 0.06){
      p.rewindTimer = 0;
      p.rewindBuffer.push({x:p.pos.x, y:p.pos.y, vy:p.vel.y});
      if(p.rewindBuffer.length > 60) p.rewindBuffer.shift(); // ~3.6s buffer
    }
  }

  function applyTimePowers(p, dt){
    // Slow Time: costs stamina over time
    if(p.slow && !p.rewinding){
      const cost = 20 * dt; // per second
      if(p.stamina > 0){
        p.stamina = Math.max(0, p.stamina - cost);
        return 0.5; // time scale
      }else{
        return 1.0;
      }
    }

    // Rewind: drain stamina rapidly and pop positions
    if(p.rewinding){
      const cost = 45 * dt;
      if(p.stamina > 0 && p.rewindBuffer.length){
        p.stamina = Math.max(0, p.stamina - cost);
        // Pop multiple to rewind faster
        for(let i=0;i<3;i++){
          const prev = p.rewindBuffer.pop();
          if(prev){
            p.pos.x = prev.x;
            p.pos.y = prev.y;
            p.vel.y = prev.vy;
          }
        }
      }
      return 0.2; // heavy slow while rewinding
    }

    // Passive regen if not using powers
    p.stamina = Math.min(p.staminaMax, p.stamina + p.staminaRegen * dt);
    return 1.0;
  }

  window.Player = { createPlayer, handleInput, updatePlayer, applyTimePowers };
})();
