/* level.js
   Procedural sector generator for Chrono Shift. Produces tile-based arenas with
   guaranteed traversable paths, hazard placements, and enemy spawn schedules.
*/
(function () {
  const TILE_SIZE = 48;
  const GRID_WIDTH = 20;
  const GRID_HEIGHT = 11;

  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function carveFloor(tiles, x, y) {
    if (x < 0 || y < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT) return;
    tiles[y * GRID_WIDTH + x] = 0;
  }

  function isPathTile(pathSet, x, y) {
    return pathSet.has(y * GRID_WIDTH + x);
  }

  function carvePath(tiles, rng) {
    const pathSet = new Set();
    let cx = 3;
    let cy = GRID_HEIGHT - 3;
    carveFloor(tiles, cx, cy);
    pathSet.add(cy * GRID_WIDTH + cx);

    while (cx < GRID_WIDTH - 4 || cy > 3) {
      const moveHorizontal =
        cx < GRID_WIDTH - 4 && (cy <= 3 || rng() < 0.6);
      if (moveHorizontal) {
        cx += 1;
      } else {
        cy -= 1;
      }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (Math.abs(dx) + Math.abs(dy) <= 1) {
            carveFloor(tiles, cx + dx, cy + dy);
            pathSet.add((cy + dy) * GRID_WIDTH + (cx + dx));
          }
        }
      }
    }

    return { cx, cy, pathSet };
  }

  function addRooms(tiles, rng, depth, pathSet) {
    const rooms = [];
    const roomCount = 3 + Math.min(6, Math.floor(depth / 2));
    let attempts = 0;
    while (rooms.length < roomCount && attempts < roomCount * 10) {
      attempts++;
      const rw = 3 + Math.floor(rng() * 4); // 3-6 tiles
      const rh = 3 + Math.floor(rng() * 3); // 3-5 tiles
      const rx = 1 + Math.floor(rng() * (GRID_WIDTH - rw - 2));
      const ry = 1 + Math.floor(rng() * (GRID_HEIGHT - rh - 2));

      let overlapsPath = false;
      for (let y = ry; y < ry + rh && !overlapsPath; y++) {
        for (let x = rx; x < rx + rw; x++) {
          if (isPathTile(pathSet, x, y)) {
            overlapsPath = true;
            break;
          }
        }
      }
      if (overlapsPath) continue;

      for (let y = ry - 1; y < ry + rh + 1; y++) {
        for (let x = rx - 1; x < rx + rw + 1; x++) {
          carveFloor(tiles, x, y);
        }
      }
      rooms.push({ rx, ry, rw, rh });
    }
    return rooms;
  }

  function createHazards(rng, depth, tiles, pathSet) {
    const hazards = [];
    const hazardBudget = 2 + Math.floor(depth * 0.6);
    let attempts = 0;
    while (hazards.length < hazardBudget && attempts < hazardBudget * 12) {
      attempts++;
      const hx = 2 + Math.floor(rng() * (GRID_WIDTH - 4));
      const hy = 2 + Math.floor(rng() * (GRID_HEIGHT - 4));
      if (isPathTile(pathSet, hx, hy)) continue;
      if (tiles[hy * GRID_WIDTH + hx] !== 0) continue;

      if (rng() < 0.55) {
        hazards.push({
          type: "pulse",
          x: (hx + 0.5) * TILE_SIZE,
          y: (hy + 0.5) * TILE_SIZE,
          radius: 24 + rng() * 18,
          period: 2.6 + rng() * 1.5,
          active: 1.2 + rng() * 0.8,
          offset: rng() * Math.PI * 2,
        });
      } else {
        const dir = rng() < 0.5 ? "horizontal" : "vertical";
        const length = dir === "horizontal"
          ? 2 + Math.floor(rng() * 5)
          : 2 + Math.floor(rng() * 4);
        hazards.push({
          type: "beam",
          direction: dir,
          x: (hx + 0.5) * TILE_SIZE,
          y: (hy + 0.5) * TILE_SIZE,
          length,
          period: 3.4 + rng() * 1.3,
          active: 1.7 + rng() * 0.7,
          offset: rng() * Math.PI * 2,
        });
      }
    }
    return hazards;
  }

  function createPickups(rng, depth, tiles) {
    const pickups = [];
    const base = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < base; i++) {
      const px = 1 + Math.floor(rng() * (GRID_WIDTH - 2));
      const py = 1 + Math.floor(rng() * (GRID_HEIGHT - 2));
      if (tiles[py * GRID_WIDTH + px] !== 0) continue;
      pickups.push({
        type: rng() < 0.35 ? "heal" : "core",
        amount:
          rng() < 0.35
            ? 1
            : 6 + Math.floor(depth * 2 + rng() * 6),
        x: (px + 0.5) * TILE_SIZE,
        y: (py + 0.5) * TILE_SIZE,
      });
    }
    return pickups;
  }

  function createSpawns(rng, depth, tiles, pathSet) {
    const spawns = [];
    const budget = 4 + Math.floor(depth * 1.4);
    let attempts = 0;
    while (spawns.length < budget && attempts < budget * 12) {
      attempts++;
      const sx = 1 + Math.floor(rng() * (GRID_WIDTH - 2));
      const sy = 1 + Math.floor(rng() * (GRID_HEIGHT - 2));
      if (isPathTile(pathSet, sx, sy)) continue;
      if (tiles[sy * GRID_WIDTH + sx] !== 0) continue;
      const roll = rng();
      let type = "chaser";
      if (roll > 0.7) type = "ranger";
      else if (roll > 0.45) type = "sentry";
      spawns.push({
        type,
        x: (sx + 0.5) * TILE_SIZE,
        y: (sy + 0.5) * TILE_SIZE,
        delay: 0.8 + spawns.length * 0.4 + rng() * 0.7,
      });
    }
    return spawns;
  }

  function createSector(depth, seed, save) {
    const tiles = new Array(GRID_WIDTH * GRID_HEIGHT).fill(1);
    const rng = mulberry32(seed >>> 0);

    // Carve start area (bottom-left)
    for (let x = 1; x <= 3; x++) {
      for (let y = GRID_HEIGHT - 3; y < GRID_HEIGHT - 1; y++) {
        carveFloor(tiles, x, y);
      }
    }
    const start = {
      x: (2.5) * TILE_SIZE,
      y: (GRID_HEIGHT - 2 + 0.5) * TILE_SIZE,
    };

    // Carve exit area (top-right)
    for (let x = GRID_WIDTH - 4; x < GRID_WIDTH - 1; x++) {
      for (let y = 1; y <= 3; y++) {
        carveFloor(tiles, x, y);
      }
    }
    const exit = {
      x: (GRID_WIDTH - 2.5) * TILE_SIZE,
      y: (2.5) * TILE_SIZE,
      radius: 32,
    };

    const { pathSet } = carvePath(tiles, rng);
    const rooms = addRooms(tiles, rng, depth, pathSet);
    const hazards = createHazards(rng, depth, tiles, pathSet);
    const pickups = createPickups(rng, depth, tiles);
    const spawns = createSpawns(rng, depth, tiles, pathSet);

    return {
      tileSize: TILE_SIZE,
      width: GRID_WIDTH,
      height: GRID_HEIGHT,
      tiles,
      start,
      exit,
      rooms,
      hazards,
      pickups,
      spawns,
      seed,
      sector: depth,
      pathTiles: Array.from(pathSet),
    };
  }

  window.LevelGen = {
    TILE_SIZE,
    createSector,
  };
})();
