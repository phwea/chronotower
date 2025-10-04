/* engine.js
   Core runtime for Chrono Shift. Drives the render loop, sector state machine,
   enemies, hazards, projectiles, HUD updates, and persistence hooks.
*/
(function () {
  const canvas = document.getElementById('game');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const hudLevel = document.getElementById('hud-level');
  const hudCoins = document.getElementById('hud-coins');
  const hudEnergy = document.getElementById('hud-stamina');

  const pauseOverlay = document.getElementById('pauseOverlay');
  const resumeBtn = document.getElementById('btnResume');
  const endOverlay = document.getElementById('endOverlay');
  const endTitle = document.getElementById('endTitle');
  const endSummary = document.getElementById('endSummary');
  const nextBtn = document.getElementById('btnNextSector');

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distanceSq(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  class Projectile {
    constructor(data) {
      this.pos = { x: data.x, y: data.y };
      this.vel = { x: data.vx, y: data.vy };
      this.radius = 6;
      this.damage = data.damage || 1;
      this.friendly = !!data.friendly;
      this.life = 1.8;
    }

    update(dt, scene) {
      this.life -= dt;
      if (this.life <= 0) {
        this.dead = true;
        return;
      }
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      if (scene.isSolidCircle(this.pos.x, this.pos.y, this.radius * 0.6)) {
        this.dead = true;
        return;
      }
      if (this.friendly) {
        for (const enemy of scene.enemies) {
          if (enemy.dead) continue;
          const d = distanceSq(this.pos, enemy.pos);
          const r = (this.radius + enemy.radius) ** 2;
          if (d <= r) {
            enemy.hit(this.damage, scene);
            this.dead = true;
            break;
          }
        }
      } else {
        const player = scene.player;
        if (player && !player.dead) {
          const d = distanceSq(this.pos, player.pos);
          const r = (this.radius + player.radius) ** 2;
          if (d <= r) {
            if (player.takeDamage(1)) scene.game.onPlayerDeath();
            this.dead = true;
          }
        }
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.fillStyle = this.friendly ? '#6af1ff' : '#ff756a';
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class DashEcho {
    constructor(pos, vel) {
      this.pos = { x: pos.x, y: pos.y };
      this.vel = { x: vel.x * 0.004, y: vel.y * 0.004 };
      this.life = 0.3;
    }

    update(dt) {
      this.life -= dt;
      this.pos.x += this.vel.x;
      this.pos.y += this.vel.y;
      if (this.life <= 0) this.dead = true;
    }

    draw(ctx) {
      const alpha = clamp(this.life / 0.3, 0, 1) * 0.4;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#6aa9ff';
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class Pickup {
    constructor(data) {
      this.type = data.type;
      this.amount = data.amount || 0;
      this.pos = { x: data.x, y: data.y };
      this.radius = 14;
      this.pulse = Math.random() * Math.PI * 2;
    }

    update(dt) {
      this.pulse += dt * 4;
    }

    draw(ctx) {
      ctx.save();
      const alpha = 0.6 + Math.sin(this.pulse) * 0.2;
      if (this.type === 'heal') ctx.fillStyle = `rgba(255,150,120,${alpha})`;
      else ctx.fillStyle = `rgba(255,227,120,${alpha})`;
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class PulseHazard {
    constructor(data) {
      this.pos = { x: data.x, y: data.y };
      this.radius = data.radius;
      this.period = data.period;
      this.activeTime = data.active;
      this.timer = data.offset || 0;
      this.active = false;
    }

    update(dt, scene) {
      this.timer += dt;
      if (this.timer > this.period) this.timer -= this.period;
      this.active = this.timer <= this.activeTime;
      if (this.active) {
        const player = scene.player;
        if (player && !player.dead) {
          const d = distanceSq(this.pos, player.pos);
          if (d <= (this.radius + player.radius) ** 2) {
            if (player.takeDamage(1)) scene.game.onPlayerDeath();
          }
        }
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = this.active ? 'rgba(255,80,120,0.5)' : 'rgba(140,70,160,0.25)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.active ? '#ff5b89' : '#6246a1';
      ctx.stroke();
      ctx.restore();
    }
  }

  class BeamHazard {
    constructor(data, tileSize) {
      this.center = { x: data.x, y: data.y };
      this.direction = data.direction;
      this.length = data.length * tileSize;
      this.period = data.period;
      this.activeTime = data.active;
      this.timer = data.offset || 0;
      this.width = 20;
      this.active = false;
    }

    update(dt, scene) {
      this.timer += dt;
      if (this.timer > this.period) this.timer -= this.period;
      this.active = this.timer <= this.activeTime;
      if (!this.active) return;
      const player = scene.player;
      if (!player || player.dead) return;
      const half = this.length * 0.5;
      if (this.direction === 'horizontal') {
        const minX = this.center.x - half;
        const maxX = this.center.x + half;
        if (player.pos.x + player.radius > minX && player.pos.x - player.radius < maxX) {
          if (Math.abs(player.pos.y - this.center.y) <= this.width + player.radius) {
            if (player.takeDamage(1)) scene.game.onPlayerDeath();
          }
        }
      } else {
        const minY = this.center.y - half;
        const maxY = this.center.y + half;
        if (player.pos.y + player.radius > minY && player.pos.y - player.radius < maxY) {
          if (Math.abs(player.pos.x - this.center.x) <= this.width + player.radius) {
            if (player.takeDamage(1)) scene.game.onPlayerDeath();
          }
        }
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.fillStyle = this.active ? 'rgba(255,110,60,0.45)' : 'rgba(200,120,40,0.2)';
      ctx.strokeStyle = this.active ? '#ff8a45' : '#b07940';
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (this.direction === 'horizontal') {
        ctx.rect(this.center.x - this.length * 0.5, this.center.y - this.width, this.length, this.width * 2);
      } else {
        ctx.rect(this.center.x - this.width, this.center.y - this.length * 0.5, this.width * 2, this.length);
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  class Enemy {
    constructor(data, rng) {
      this.type = data.type;
      this.pos = { x: data.x, y: data.y };
      this.radius = 18;
      this.health = this.type === 'chaser' ? 3 : this.type === 'sentry' ? 4 : 5;
      this.speed = this.type === 'chaser' ? 110 : this.type === 'sentry' ? 60 : 90;
      this.fireCooldown = 0.5 + rng() * 0.8;
      this.timer = data.delay || 0;
      this.spawned = false;
      this.rng = rng;
    }

    update(dt, scene, player) {
      if (!this.spawned) {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.spawned = true;
          scene.effects.push(new DashEcho(this.pos, { x: 0, y: 0 }));
        }
        return;
      }

      if (this.fireCooldown > 0) this.fireCooldown -= dt;

      const dx = player.pos.x - this.pos.x;
      const dy = player.pos.y - this.pos.y;
      const dist = Math.hypot(dx, dy) || 1;
      const dirX = dx / dist;
      const dirY = dy / dist;

      if (this.type === 'chaser') {
        this.pos.x += dirX * this.speed * dt;
        this.pos.y += dirY * this.speed * dt;
      } else if (this.type === 'sentry') {
        if (this.fireCooldown <= 0 && dist < 320) {
          scene.spawnProjectile({
            x: this.pos.x + dirX * 20,
            y: this.pos.y + dirY * 20,
            vx: dirX * 240,
            vy: dirY * 240,
            friendly: false,
            damage: 1,
          });
          this.fireCooldown = 2.0;
        }
      } else if (this.type === 'ranger') {
        const desired = 280;
        if (dist < desired - 40) {
          this.pos.x -= dirX * this.speed * dt;
          this.pos.y -= dirY * this.speed * dt;
        } else if (dist > desired + 60) {
          this.pos.x += dirX * this.speed * dt;
          this.pos.y += dirY * this.speed * dt;
        }
        if (this.fireCooldown <= 0) {
          const jitter = (this.rng() - 0.5) * 0.25;
          const angle = Math.atan2(dy, dx) + jitter;
          scene.spawnProjectile({
            x: this.pos.x + Math.cos(angle) * 22,
            y: this.pos.y + Math.sin(angle) * 22,
            vx: Math.cos(angle) * 280,
            vy: Math.sin(angle) * 280,
            friendly: false,
            damage: 1,
          });
          this.fireCooldown = 1.3;
        }
      }

      if (scene.resolveEnemyCollisions(this)) {
        this.pos.x -= dirX * 12 * dt;
        this.pos.y -= dirY * 12 * dt;
      }

      if (distanceSq(this.pos, player.pos) <= (this.radius + player.radius) ** 2) {
        if (player.takeDamage(1)) scene.game.onPlayerDeath();
      }
    }

    hit(damage, scene) {
      this.health -= damage;
      if (this.health <= 0) {
        this.dead = true;
        scene.onEnemyKilled(this);
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.beginPath();
      if (this.type === 'chaser') ctx.fillStyle = '#ff5d73';
      else if (this.type === 'sentry') ctx.fillStyle = '#ffa64a';
      else ctx.fillStyle = '#7cf0a9';
      ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class Spawner {
    constructor(data, rng) {
      this.data = data;
      this.timer = data.delay || 0;
      this.spawned = false;
      this.rng = rng;
    }

    update(dt, scene) {
      if (this.spawned) return;
      this.timer -= dt;
      if (this.timer <= 0) {
        const enemy = new Enemy(this.data, this.rng);
        enemy.spawned = true;
        scene.enemies.push(enemy);
        this.spawned = true;
      }
    }
  }

  class SectorScene {
    constructor(game, run) {
      this.game = game;
      this.rng = (function seedRng(seed) {
        return function () {
          seed |= 0;
          seed = (seed + 0x6d2b79f5) | 0;
          let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      })(run.seed || Date.now());

      this.level = LevelGen.createSector(run.sector, run.seed, game.save);
      this.player = null;
      this.projectiles = [];
      this.effects = [];
      this.pickups = this.level.pickups.map((p) => new Pickup(p));
      this.hazards = this.level.hazards.map((h) =>
        h.type === 'beam' ? new BeamHazard(h, this.level.tileSize) : new PulseHazard(h)
      );
      this.enemies = [];
      this.spawners = this.level.spawns.map((s) => new Spawner(s, this.rng));
    }

    setPlayer(player) {
      this.player = player;
    }

    isSolidCircle(x, y, radius) {
      const ts = this.level.tileSize;
      const minX = Math.floor((x - radius) / ts);
      const maxX = Math.floor((x + radius) / ts);
      const minY = Math.floor((y - radius) / ts);
      const maxY = Math.floor((y + radius) / ts);
      for (let ty = minY; ty <= maxY; ty++) {
        for (let tx = minX; tx <= maxX; tx++) {
          if (this.isWall(tx, ty)) return true;
        }
      }
      return false;
    }

    isWall(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= this.level.width || ty >= this.level.height) return true;
      return this.level.tiles[ty * this.level.width + tx] === 1;
    }

    spawnProjectile(data) {
      const projectile = new Projectile(data);
      this.projectiles.push(projectile);
      return projectile;
    }

    spawnDashEcho(pos, vel) {
      this.effects.push(new DashEcho(pos, vel));
    }

    findTarget(player) {
      let best = null;
      let bestDist = Infinity;
      for (const enemy of this.enemies) {
        if (enemy.dead || !enemy.spawned) continue;
        const dist = distanceSq(player.pos, enemy.pos);
        if (dist < bestDist) {
          bestDist = dist;
          best = enemy;
        }
      }
      if (best) {
        return { x: best.pos.x - player.pos.x, y: best.pos.y - player.pos.y };
      }
      return { x: this.level.exit.x - player.pos.x, y: this.level.exit.y - player.pos.y };
    }

    resolveEnemyCollisions(enemy) {
      let collided = false;
      const ts = this.level.tileSize;
      const check = [
        { x: enemy.pos.x - enemy.radius, y: enemy.pos.y },
        { x: enemy.pos.x + enemy.radius, y: enemy.pos.y },
        { x: enemy.pos.x, y: enemy.pos.y - enemy.radius },
        { x: enemy.pos.x, y: enemy.pos.y + enemy.radius },
      ];
      for (const p of check) {
        const tx = Math.floor(p.x / ts);
        const ty = Math.floor(p.y / ts);
        if (this.isWall(tx, ty)) collided = true;
      }
      if (collided) {
        enemy.pos.x = clamp(enemy.pos.x, enemy.radius, canvas.width - enemy.radius);
        enemy.pos.y = clamp(enemy.pos.y, enemy.radius, canvas.height - enemy.radius);
      }
      return collided;
    }

    onEnemyKilled(enemy) {
      this.effects.push(new DashEcho(enemy.pos, { x: 0, y: 0 }));
      if (this.rng() < 0.35) {
        const bonus = 8 + Math.floor(this.rng() * 6);
        this.pickups.push(new Pickup({ type: 'core', amount: bonus, x: enemy.pos.x, y: enemy.pos.y }));
      }
      this.game.addReward(6);
    }

    update(dt) {
      for (const hazard of this.hazards) hazard.update(dt, this);
      for (const spawner of this.spawners) spawner.update(dt, this);
      for (const enemy of this.enemies) {
        if (!enemy.dead) enemy.update(dt, this, this.player);
      }
      this.enemies = this.enemies.filter((e) => !e.dead);

      for (const projectile of this.projectiles) {
        if (!projectile.dead) projectile.update(dt, this);
      }
      this.projectiles = this.projectiles.filter((p) => !p.dead);

      for (const pickup of this.pickups) pickup.update(dt);
      this.effects.forEach((fx) => fx.update(dt));
      this.effects = this.effects.filter((fx) => !fx.dead);

      this.checkPickups();
    }

    checkPickups() {
      const player = this.player;
      if (!player) return;
      this.pickups = this.pickups.filter((pickup) => {
        const d = distanceSq(player.pos, pickup.pos);
        if (d <= (player.radius + pickup.radius) ** 2) {
          if (pickup.type === 'heal') {
            player.health = Math.min(player.maxHealth, player.health + 1);
          } else {
            this.game.addReward(pickup.amount);
          }
          return false;
        }
        return true;
      });
    }

    draw(ctx) {
      ctx.save();
      ctx.fillStyle = '#090d1f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const ts = this.level.tileSize;
      for (let y = 0; y < this.level.height; y++) {
        for (let x = 0; x < this.level.width; x++) {
          const tile = this.level.tiles[y * this.level.width + x];
          const px = x * ts;
          const py = y * ts;
          if (tile === 1) {
            ctx.fillStyle = '#0f1731';
            ctx.fillRect(px, py, ts, ts);
          } else {
            ctx.fillStyle = '#141f3f';
            ctx.fillRect(px, py, ts, ts);
            ctx.fillStyle = 'rgba(80,120,200,0.12)';
            ctx.fillRect(px + 8, py + 8, ts - 16, ts - 16);
          }
        }
      }

      ctx.save();
      ctx.fillStyle = 'rgba(120,210,255,0.15)';
      ctx.beginPath();
      ctx.arc(this.level.exit.x, this.level.exit.y, this.level.exit.radius + 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      for (const pickup of this.pickups) pickup.draw(ctx);
      for (const hazard of this.hazards) hazard.draw(ctx);
      for (const enemy of this.enemies) enemy.draw(ctx);
      for (const projectile of this.projectiles) projectile.draw(ctx);
      for (const fx of this.effects) fx.draw(ctx);
      if (this.player && !this.player.dead) {
        this.drawPlayer(ctx, this.player);
      }
      ctx.restore();
    }

    drawPlayer(ctx, player) {
      ctx.save();
      ctx.beginPath();
      ctx.fillStyle = '#6af1ff';
      ctx.arc(player.pos.x, player.pos.y, player.radius, 0, Math.PI * 2);
      ctx.fill();
      if (player.shield > 0) {
        ctx.strokeStyle = 'rgba(110,190,255,0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(player.pos.x, player.pos.y, player.radius + 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  class ChronoGame {
    constructor() {
      this.save = Storage.read();
      this.state = 'running';
      this.elapsed = 0;
      this.rewardsThisRun = 0;
      this.currentRun = null;
      this.scene = null;
      this.player = null;
      this.lastTime = performance.now();

      this.bindEvents();
      this.startInitialRun();
      requestAnimationFrame((t) => this.loop(t));
    }

    bindEvents() {
      document.addEventListener('keydown', (e) => {
        if (e.code === 'Escape') {
          e.preventDefault();
          this.togglePause();
        }
      });
      resumeBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        this.setPaused(false);
      });
      nextBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!nextBtn.classList.contains('disabled')) {
          this.startNextSector();
        }
      });
    }

    startInitialRun() {
      const params = new URLSearchParams(window.location.search);
      const wantsLoad = params.has('load') || params.has('continue');
      if (wantsLoad && this.save.currentRun) {
        this.startRun({ ...this.save.currentRun, resume: true });
      } else {
        this.startRun(this.createFreshRun());
      }
    }

    createFreshRun(sector) {
      const targetSector = sector || this.save.sector || 1;
      const seed = (Math.random() * 0xffffffff) >>> 0;
      const run = { sector: targetSector, seed };
      this.save.currentRun = run;
      Storage.write(this.save);
      return { ...run };
    }

    startRun(run) {
      this.currentRun = { sector: run.sector, seed: run.seed };
      this.scene = new SectorScene(this, this.currentRun);
      this.player = new PlayerModule.Player(this.save);
      this.player.spawn(this.scene.level.start);
      this.scene.setPlayer(this.player);
      this.elapsed = 0;
      this.rewardsThisRun = 0;
      this.state = 'running';
      pauseOverlay.classList.add('hidden');
      endOverlay.classList.add('hidden');
      nextBtn?.classList.remove('disabled');
      this.updateHud();
      this.render();
    }

    startNextSector() {
      const next = (this.currentRun?.sector || this.save.sector || 1) + 1;
      this.startRun(this.createFreshRun(next));
    }

    loop(now) {
      const dt = clamp((now - this.lastTime) / 1000, 0, 0.1);
      this.lastTime = now;
      if (this.state === 'running') {
        this.step(dt);
      }
      this.render();
      requestAnimationFrame((t) => this.loop(t));
    }

    step(dt) {
      this.player.preUpdate(dt);
      const worldDt = dt * this.player.timeScale;
      this.scene.update(worldDt);
      this.player.update(this.scene, dt);
      this.elapsed += worldDt;
      this.checkExit();
      this.updateHud();
    }

    checkExit() {
      const exit = this.scene.level.exit;
      if (distanceSq(this.player.pos, exit) <= (exit.radius + this.player.radius) ** 2) {
        this.onRunComplete();
      }
    }

    updateHud() {
      if (hudLevel) hudLevel.textContent = `Sector: ${this.currentRun?.sector || 1}`;
      if (hudCoins) hudCoins.textContent = `Cores: ${this.save.credits + this.rewardsThisRun}`;
      if (hudEnergy) {
        const pct = Math.round((this.player.energy / this.player.maxEnergy) * 100);
        hudEnergy.textContent = `Energy: ${pct}%`;
      }
    }

    addReward(amount) {
      this.rewardsThisRun += amount;
    }

    onRunComplete() {
      if (this.state === 'ended') return;
      this.state = 'ended';
      const sector = this.currentRun.sector;
      const reward = Math.floor(30 + sector * 6 + this.rewardsThisRun);
      this.save.credits += reward;
      this.save.bestSector = Math.max(this.save.bestSector || 1, sector);
      this.save.sector = Math.max(this.save.sector || 1, sector + 1);
      this.save.currentRun = null;
      Storage.write(this.save);
      Storage.appendRun({ sector, seed: this.currentRun.seed, time: this.elapsed, result: 'cleared' });
      this.showEndOverlay(true, reward);
    }

    onPlayerDeath() {
      if (this.state === 'ended') return;
      this.state = 'ended';
      this.player.dead = true;
      this.save.currentRun = null;
      Storage.write(this.save);
      Storage.appendRun({ sector: this.currentRun.sector, seed: this.currentRun.seed, time: this.elapsed, result: 'defeated' });
      this.showEndOverlay(false, 0);
    }

    showEndOverlay(success, reward) {
      if (!endOverlay) return;
      endTitle.textContent = success ? 'Sector Stabilized' : 'Signal Lost';
      const timeStr = this.elapsed.toFixed(2);
      endSummary.innerHTML = success
        ? `You stabilized Sector ${this.currentRun.sector} in ${timeStr}s and recovered <strong>${reward}</strong> chrono cores.`
        : `Your run collapsed after ${timeStr}s in Sector ${this.currentRun.sector}. Recalibrate and dive again.`;
      if (success) {
        nextBtn.classList.remove('disabled');
      } else {
        nextBtn.classList.add('disabled');
      }
      endOverlay.classList.remove('hidden');
    }

    togglePause() {
      this.setPaused(this.state === 'running');
    }

    setPaused(paused) {
      if (paused) {
        if (this.state !== 'running') return;
        this.state = 'paused';
        pauseOverlay.classList.remove('hidden');
      } else {
        if (this.state !== 'paused') return;
        this.state = 'running';
        pauseOverlay.classList.add('hidden');
        this.lastTime = performance.now();
      }
    }

    render() {
      if (!this.scene) return;
      this.scene.draw(ctx);
    }
  }

  new ChronoGame();
})();
