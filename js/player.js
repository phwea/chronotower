/* player.js
   Defines the Chrono Shift runner: handles input, mobility, attacks, and energy
   systems while exposing hooks for the engine to query current time scale.
*/
(function () {
  class Player {
    constructor(save) {
      const upgrades = save.upgrades || {};
      const engine = upgrades.engine || 0;
      const focus = upgrades.focus || 0;
      const arsenal = upgrades.arsenal || 0;
      const chrono = upgrades.chrono || 0;

      this.pos = { x: 0, y: 0 };
      this.vel = { x: 0, y: 0 };
      this.radius = 16;

      this.maxHealth = 4 + Math.floor(chrono * 0.5);
      this.health = this.maxHealth;
      this.shield = 0;

      this.baseSpeed = 220 + engine * 16;
      this.dashStrength = 340 + engine * 20;
      this.dashCooldown = Math.max(0.8 - engine * 0.08, 0.35);
      this.dashTimer = 0;

      this.maxEnergy = 110 + focus * 18;
      this.energy = this.maxEnergy;
      this.energyRegen = 18 + focus * 4;
      this.slowDrain = Math.max(22 - chrono * 2.5, 10);
      this.slowScale = 0.55 - Math.min(chrono * 0.03, 0.2);

      this.fireDelay = Math.max(0.32 - arsenal * 0.025, 0.12);
      this.fireCooldown = 0;
      this.projectileSpeed = 420 + arsenal * 22;
      this.projectileDamage = 1 + arsenal * 0.4;

      this.timeScale = 1;
      this.invulnTimer = 0;
      this.lastFireDir = { x: 1, y: 0 };
      this.slowAccum = 0;
    }

    spawn(position) {
      this.pos.x = position.x;
      this.pos.y = position.y;
      this.vel.x = 0;
      this.vel.y = 0;
      this.health = this.maxHealth;
      this.shield = 0;
      this.energy = this.maxEnergy;
      this.timeScale = 1;
      this.dashTimer = 0;
      this.fireCooldown = 0;
      this.slowAccum = 0;
    }

    preUpdate(dt) {
      if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
      if (this.dashTimer > 0) this.dashTimer = Math.max(0, this.dashTimer - dt);
      if (this.fireCooldown > 0) this.fireCooldown = Math.max(0, this.fireCooldown - dt);

      const slowing = Input.isDown('KeyE');
      if (slowing && this.energy > 0) {
        this.energy = Math.max(0, this.energy - this.slowDrain * dt);
        this.timeScale = this.slowScale;
        this.slowAccum += dt;
        if (this.slowAccum >= 1.2) {
          this.grantShield(1);
          this.slowAccum = 0;
        }
      } else {
        this.timeScale = 1;
        this.energy = Math.min(this.maxEnergy, this.energy + this.energyRegen * dt);
        this.slowAccum = Math.max(0, this.slowAccum - dt * 0.6);
      }
    }

    update(scene, dt) {
      const scaledDt = dt;
      const moveX = (Input.isDown('KeyD') || Input.isDown('ArrowRight') ? 1 : 0) -
        (Input.isDown('KeyA') || Input.isDown('ArrowLeft') ? 1 : 0);
      const moveY = (Input.isDown('KeyS') || Input.isDown('ArrowDown') ? 1 : 0) -
        (Input.isDown('KeyW') || Input.isDown('ArrowUp') ? 1 : 0);

      let dashVector = null;
      const wantsDash = Input.isDown('ShiftLeft') || Input.isDown('ShiftRight');
      if (wantsDash && this.dashTimer <= 0 && this.energy >= 15) {
        this.energy -= 15;
        this.dashTimer = this.dashCooldown;
        const dashDirX = moveX !== 0 || moveY !== 0 ? moveX : this.lastFireDir.x;
        const dashDirY = moveX !== 0 || moveY !== 0 ? moveY : this.lastFireDir.y;
        const mag = Math.hypot(dashDirX, dashDirY) || 1;
        dashVector = { x: (dashDirX / mag) * this.dashStrength, y: (dashDirY / mag) * this.dashStrength };
        scene.spawnDashEcho(this.pos, dashVector);
      }

      const magnitude = Math.hypot(moveX, moveY);
      let targetVelX = 0;
      let targetVelY = 0;
      if (magnitude > 0) {
        targetVelX = (moveX / magnitude) * this.baseSpeed;
        targetVelY = (moveY / magnitude) * this.baseSpeed;
        this.lastFireDir = { x: moveX / magnitude, y: moveY / magnitude };
      }

      const lerp = 1 - Math.exp(-10 * scaledDt);
      this.vel.x = this.vel.x + (targetVelX - this.vel.x) * lerp;
      this.vel.y = this.vel.y + (targetVelY - this.vel.y) * lerp;

      if (dashVector) {
        this.vel.x += dashVector.x;
        this.vel.y += dashVector.y;
      }

      const nextX = this.pos.x + this.vel.x * scaledDt;
      const nextY = this.pos.y + this.vel.y * scaledDt;

      if (!scene.isSolidCircle(nextX, this.pos.y, this.radius)) {
        this.pos.x = nextX;
      } else {
        this.vel.x = 0;
      }
      if (!scene.isSolidCircle(this.pos.x, nextY, this.radius)) {
        this.pos.y = nextY;
      } else {
        this.vel.y = 0;
      }

      this.fire(scene);
    }

    fire(scene) {
      if (this.fireCooldown > 0) return;
      if (!Input.isDown('Space')) return;
      const target = scene.findTarget(this);
      const dirX = target.x;
      const dirY = target.y;
      const mag = Math.hypot(dirX, dirY) || 1;
      const normX = dirX / mag;
      const normY = dirY / mag;
      this.lastFireDir = { x: normX, y: normY };
      scene.spawnProjectile({
        x: this.pos.x + normX * (this.radius + 4),
        y: this.pos.y + normY * (this.radius + 4),
        vx: normX * this.projectileSpeed,
        vy: normY * this.projectileSpeed,
        friendly: true,
        damage: this.projectileDamage,
      });
      this.fireCooldown = this.fireDelay;
    }

    takeDamage(amount) {
      if (this.invulnTimer > 0) return false;
      let remaining = amount;
      if (this.shield > 0) {
        const absorbed = Math.min(this.shield, remaining);
        this.shield -= absorbed;
        remaining -= absorbed;
      }
      if (remaining <= 0) {
        this.invulnTimer = 0.4;
        return false;
      }
      this.health -= remaining;
      this.invulnTimer = 0.7;
      return this.health <= 0;
    }

    grantShield(amount) {
      this.shield = Math.min(this.shield + amount, 2 + amount);
    }
  }

  window.PlayerModule = {
    Player,
  };
})();
