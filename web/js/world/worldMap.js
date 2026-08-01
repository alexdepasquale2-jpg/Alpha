// The world: one continuous overworld (farm, road, town) plus a small interior
// map per building. Everything the player can walk on, walk into, or interact
// with is registered here rather than being reachable through a menu.

import { T, TILE, isSolid, tileHash } from './tiles.js';
import { state } from '../core/state.js';

export const WORLD_W = 60;
export const WORLD_H = 100;

/** Top-left tile of the plot grid. It grows downward as you take land. */
export const FARM_ORIGIN = { x: 10, y: 62 };

export class TileMap {
  constructor(w, h, fill = T.VOID) {
    this.w = w;
    this.h = h;
    this.ground = new Uint8Array(w * h).fill(fill);
    this.blocked = new Uint8Array(w * h);   // objects that block without being tiles
    this.buildings = [];
    this.doors = [];
    this.objects = [];
    this.npcs = [];
    this.interior = false;
    this.id = 'overworld';
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x, y) {
    return this.inBounds(x, y) ? this.ground[y * this.w + x] : T.VOID;
  }

  set(x, y, tile) {
    if (this.inBounds(x, y)) this.ground[y * this.w + x] = tile;
  }

  fillRect(x, y, w, h, tile) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) this.set(i, j, tile);
    }
  }

  strokeRect(x, y, w, h, tile) {
    for (let i = x; i < x + w; i++) { this.set(i, y, tile); this.set(i, y + h - 1, tile); }
    for (let j = y; j < y + h; j++) { this.set(x, j, tile); this.set(x + w - 1, j, tile); }
  }

  block(x, y, w = 1, h = 1) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (this.inBounds(i, j)) this.blocked[j * this.w + i] = 1;
      }
    }
  }

  unblock(x, y, w = 1, h = 1) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (this.inBounds(i, j)) this.blocked[j * this.w + i] = 0;
      }
    }
  }

  solidAt(x, y) {
    if (!this.inBounds(x, y)) return true;
    if (this.blocked[y * this.w + x]) return true;
    return isSolid(this.ground[y * this.w + x]);
  }

  doorAt(x, y) {
    return this.doors.find((d) => d.x === x && d.y === y) ?? null;
  }

  objectAt(x, y) {
    return this.objects.find(
      (o) => x >= o.x && x < o.x + (o.w ?? 1) && y >= o.y && y < o.y + (o.h ?? 1),
    ) ?? null;
  }
}

/* ---- building helper ----------------------------------------------------- */

function addBuilding(map, def) {
  const { x, y, w, h } = def;
  map.fillRect(x, y, w, h, T.WALL);

  // The door is a walkable plank tile in the building's bottom row.
  const doorX = def.doorX ?? x + Math.floor(w / 2);
  const doorY = y + h - 1;
  map.set(doorX, doorY, T.PLANKS);

  const building = { ...def, doorX, doorY };
  map.buildings.push(building);

  if (def.interior) {
    map.doors.push({
      x: doorX, y: doorY,
      to: def.interior,
      label: def.name,
    });
  }
  return building;
}

/* ---- the overworld -------------------------------------------------------- */

export const TOWN_BUILDINGS = [
  { id: 'seed', name: 'Seed Stall', npc: 'bram', shop: 'seed',
    x: 7, y: 8, w: 7, h: 5, roof: '#5f7a3c', interior: 'seed' },
  { id: 'mech', name: 'Chassis Yard', npc: 'mora', shop: 'mech',
    x: 17, y: 8, w: 7, h: 5, roof: '#8a4a30', interior: 'mech' },
  { id: 'ranch', name: 'Ranch', npc: 'wren', shop: 'ranch',
    x: 34, y: 8, w: 7, h: 5, roof: '#a8873f', interior: 'ranch' },
  { id: 'forge', name: 'Forge', npc: 'ilse', shop: 'forge',
    x: 44, y: 8, w: 7, h: 5, roof: '#6a5240', interior: 'forge' },
  { id: 'salvage', name: 'Salvager', npc: 'sable', shop: 'salvage',
    x: 12, y: 21, w: 7, h: 5, roof: '#57606a', interior: 'salvage' },
  { id: 'board', name: 'Town Hall', npc: 'odell', shop: 'board',
    x: 34, y: 21, w: 7, h: 5, roof: '#4f6b86', interior: 'board' },
];

export function buildOverworld() {
  const map = new TileMap(WORLD_W, WORLD_H, T.MEADOW);
  map.id = 'overworld';

  // --- broad terrain bands ------------------------------------------------
  map.fillRect(4, 4, 52, 26, T.GRASS);           // town common
  map.fillRect(6, 48, 46, 46, T.GRASS);          // farm valley

  // Town square and the road south to the farm. Kept narrow so the common
  // still reads as grass with paths through it, not one paved slab.
  map.fillRect(5, 14, 47, 3, T.PATH);            // the high street
  map.fillRect(5, 27, 47, 2, T.PATH);            // the back lane
  map.fillRect(28, 14, 3, 38, T.PATH);           // the road south
  map.fillRect(10, 58, 30, 2, T.PATH);           // farm track past the house

  // --- treeline border ----------------------------------------------------
  // Unbroken: the road runs town-to-farm entirely inside the map, so there is
  // nothing the border needs to let through. A gap here would let the player
  // walk straight off the edge of the world.
  for (let x = 0; x < WORLD_W; x++) {
    for (let y = 0; y < WORLD_H; y++) {
      if (x < 3 || y < 3 || x >= WORLD_W - 3 || y >= WORLD_H - 3) map.set(x, y, T.TREE);
    }
  }
  // Wooded shoulders along the road, thinned by hash so it isn't a corridor.
  scatter(map, 4, 30, 22, 18, T.TREE, 0.22);
  scatter(map, 34, 30, 22, 18, T.TREE, 0.22);
  scatter(map, 4, 30, 22, 18, T.ROCK, 0.03);
  scatter(map, 5, 5, 50, 24, T.FLOWERS, 0.05);
  scatter(map, 6, 48, 44, 44, T.FLOWERS, 0.03);

  // --- town ---------------------------------------------------------------
  for (const def of TOWN_BUILDINGS) addBuilding(map, def);

  // A well in the middle of the square: pure scenery, but it anchors the town.
  map.fillRect(27, 18, 2, 2, T.STONE);
  map.block(27, 18, 2, 2);
  map.objects.push({
    id: 'well', kind: 'well', x: 27, y: 18, w: 2, h: 2,
    label: 'Old Well', action: null,
  });

  // Town sign at the road mouth.
  map.objects.push({
    id: 'townsign', kind: 'sign', x: 26, y: 31, w: 1, h: 1,
    label: 'Coldbrook', action: 'read',
    text: 'COLDBROOK\nPop. six, and a great many opinions.',
  });
  map.block(26, 31);

  // --- farm ---------------------------------------------------------------
  addBuilding(map, {
    id: 'home', name: 'Farmhouse', x: 10, y: 52, w: 8, h: 5,
    roof: '#7a4b32', interior: 'home',
  });

  // Pond — the watering-can refill point, with a shallow rim you can stand on.
  map.fillRect(26, 59, 7, 6, T.SHALLOW);
  map.fillRect(27, 60, 5, 4, T.WATER);

  // Fenced boundary around the working farm.
  fenceRect(map, 7, 50, 38, 42);

  // Shipping bin, beside the track.
  map.objects.push({
    id: 'bin', kind: 'bin', x: 21, y: 56, w: 2, h: 2,
    label: 'Shipping Bin', action: 'bin',
  });
  map.block(21, 56, 2, 2);

  // The mustering ground: where an assault is launched from.
  map.fillRect(35, 66, 8, 7, T.GRAVEL);
  map.objects.push({
    id: 'warcamp', kind: 'warcamp', x: 37, y: 68, w: 3, h: 3,
    label: 'Mustering Ground', action: 'march',
  });
  map.block(37, 68, 3, 3);

  refreshFarmTiles(map);
  refreshFarmBuildings(map);

  map.spawn = { x: 14, y: 59 };
  return map;
}

function scatter(map, x, y, w, h, tile, density) {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      if (!map.inBounds(i, j)) continue;
      const current = map.get(i, j);
      if (current !== T.GRASS && current !== T.MEADOW) continue;
      // tileHash rather than a hand-rolled xor: the naive version correlated
      // along x+y and laid the scatter out in visible diagonal stripes.
      if (tileHash(i, j, tile * 977) < density) map.set(i, j, tile);
    }
  }
}

function fenceRect(map, x, y, w, h) {
  for (let i = x; i < x + w; i++) {
    if (map.get(i, y) === T.GRASS || map.get(i, y) === T.MEADOW) map.set(i, y, T.FENCE);
    if (map.get(i, y + h - 1) === T.GRASS || map.get(i, y + h - 1) === T.MEADOW) {
      map.set(i, y + h - 1, T.FENCE);
    }
  }
  for (let j = y; j < y + h; j++) {
    if (map.get(x, j) === T.GRASS || map.get(x, j) === T.MEADOW) map.set(x, j, T.FENCE);
    if (map.get(x + w - 1, j) === T.GRASS || map.get(x + w - 1, j) === T.MEADOW) {
      map.set(x + w - 1, j, T.FENCE);
    }
  }
  // Gate onto the road.
  map.set(28, y, T.PATH);
  map.set(29, y, T.PATH);
}

/**
 * Stamp the plot grid into the terrain. Called on load and whenever the farm
 * grows, so won territory literally appears as new soil in the world.
 */
export function refreshFarmTiles(map) {
  const { width, height } = state.farm;
  // Clear a generous apron so shrinking never leaves orphaned soil.
  for (let j = 0; j < 30; j++) {
    for (let i = 0; i < 12; i++) {
      const tx = FARM_ORIGIN.x + i;
      const ty = FARM_ORIGIN.y + j;
      if (!map.inBounds(tx, ty)) continue;
      if (map.get(tx, ty) === T.SOIL || map.get(tx, ty) === T.SOIL_WET
       || map.get(tx, ty) === T.DIRT) {
        map.set(tx, ty, T.GRASS);
      }
    }
  }
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      map.set(FARM_ORIGIN.x + i, FARM_ORIGIN.y + j, T.DIRT);
    }
  }
}

/** Coop and barn only exist once you have bought them. */
export function refreshFarmBuildings(map) {
  map.buildings = map.buildings.filter((b) => b.id !== 'coop' && b.id !== 'barn');
  map.doors = map.doors.filter((d) => d.to !== 'coop' && d.to !== 'barn');

  if (state.farm.buildings.coop > 0) {
    addBuilding(map, {
      id: 'coop', name: 'Coop', x: 34, y: 52, w: 7, h: 5,
      roof: '#9a7a45', interior: 'coop',
    });
  }
  if (state.farm.buildings.barn > 0) {
    addBuilding(map, {
      id: 'barn', name: 'Barn', x: 34, y: 74, w: 8, h: 6,
      roof: '#8a4a30', interior: 'barn',
    });
  }
}

/** Is this tile part of the plot grid? Returns plot coords, or null. */
export function plotCoordsAt(tx, ty) {
  const px = tx - FARM_ORIGIN.x;
  const py = ty - FARM_ORIGIN.y;
  if (px < 0 || py < 0 || px >= state.farm.width || py >= state.farm.height) return null;
  return { x: px, y: py };
}

export function plotTile(plotX, plotY) {
  return { x: FARM_ORIGIN.x + plotX, y: FARM_ORIGIN.y + plotY };
}

/* ---- interiors ------------------------------------------------------------ */

// Rooms are deliberately tall and narrow. A phone screen is roughly 1:2, so a
// wide room would leave dead bands above and below; this shape fills it, and a
// long aisle up to the counter is a natural shop anyway.
export const INTERIORS = {
  seed: {
    name: 'Seed Stall', w: 10, h: 15, floor: T.WOOD, wall: 'plank',
    npc: 'bram', shop: 'seed', npcAt: { x: 5, y: 4 }, counter: { x: 2, y: 5, w: 6 },
    decor: [{ kind: 'crate', x: 1, y: 2 }, { kind: 'crate', x: 8, y: 2 },
            { kind: 'plant', x: 1, y: 9 }, { kind: 'plant', x: 8, y: 9 },
            { kind: 'crate', x: 1, y: 12 }],
  },
  mech: {
    name: 'Chassis Yard', w: 11, h: 16, floor: T.STONE, wall: 'stone',
    npc: 'mora', shop: 'mech', npcAt: { x: 5, y: 4 }, counter: { x: 2, y: 5, w: 7 },
    decor: [{ kind: 'mech', x: 1, y: 2 }, { kind: 'mech', x: 9, y: 2 },
            { kind: 'crate', x: 1, y: 9 }, { kind: 'anvil', x: 9, y: 9 },
            { kind: 'scrap', x: 1, y: 13 }, { kind: 'mech', x: 9, y: 13 }],
  },
  ranch: {
    name: 'Ranch', w: 10, h: 15, floor: T.HAY, wall: 'plank',
    npc: 'wren', shop: 'ranch', npcAt: { x: 5, y: 4 }, counter: { x: 2, y: 5, w: 6 },
    decor: [{ kind: 'hay', x: 1, y: 2 }, { kind: 'hay', x: 8, y: 2 },
            { kind: 'trough', x: 1, y: 9 }, { kind: 'hay', x: 8, y: 12 }],
  },
  forge: {
    name: 'Forge', w: 10, h: 15, floor: T.STONE, wall: 'stone',
    npc: 'ilse', shop: 'forge', npcAt: { x: 5, y: 4 }, counter: { x: 2, y: 5, w: 6 },
    decor: [{ kind: 'anvil', x: 1, y: 2 }, { kind: 'forge', x: 8, y: 2 },
            { kind: 'crate', x: 1, y: 9 }, { kind: 'anvil', x: 8, y: 12 }],
  },
  salvage: {
    name: 'Salvager', w: 11, h: 16, floor: T.STONE, wall: 'plank',
    npc: 'sable', shop: 'salvage', npcAt: { x: 5, y: 4 }, counter: { x: 2, y: 5, w: 7 },
    decor: [{ kind: 'scrap', x: 1, y: 2 }, { kind: 'scrap', x: 9, y: 2 },
            { kind: 'mech', x: 1, y: 9 }, { kind: 'crate', x: 9, y: 9 },
            { kind: 'scrap', x: 1, y: 13 }],
  },
  board: {
    name: 'Town Hall', w: 11, h: 16, floor: T.RUG, wall: 'stone',
    npc: 'odell', shop: 'board', npcAt: { x: 5, y: 4 }, counter: { x: 2, y: 5, w: 7 },
    decor: [{ kind: 'board', x: 1, y: 2 }, { kind: 'plant', x: 9, y: 2 },
            { kind: 'plant', x: 1, y: 9 }, { kind: 'board', x: 9, y: 9 }],
  },
  home: {
    name: 'Farmhouse', w: 10, h: 14, floor: T.WOOD, wall: 'plank',
    decor: [{ kind: 'plant', x: 8, y: 2 }, { kind: 'crate', x: 1, y: 8 },
            { kind: 'table', x: 5, y: 7 }, { kind: 'plant', x: 8, y: 11 }],
    objects: [
      { id: 'bed', kind: 'bed', x: 1, y: 2, w: 3, h: 3, label: 'Bed', action: 'sleep' },
    ],
  },
  coop: {
    name: 'Coop', w: 10, h: 13, floor: T.HAY, wall: 'plank',
    decor: [{ kind: 'hay', x: 1, y: 2 }, { kind: 'hay', x: 8, y: 2 }],
    livestock: 'coop',
    objects: [
      { id: 'feeder', kind: 'trough', x: 4, y: 2, w: 3, h: 1,
        label: 'Feeder', action: 'tend' },
    ],
  },
  barn: {
    name: 'Barn', w: 11, h: 15, floor: T.HAY, wall: 'plank',
    decor: [{ kind: 'hay', x: 1, y: 2 }, { kind: 'hay', x: 9, y: 10 }],
    livestock: 'barn',
    objects: [
      { id: 'feeder', kind: 'trough', x: 4, y: 2, w: 3, h: 1,
        label: 'Feeder', action: 'tend' },
    ],
  },
};

/** Build (or rebuild) an interior map from its definition. */
export function buildInterior(id) {
  const def = INTERIORS[id];
  if (!def) return null;

  const map = new TileMap(def.w, def.h, def.floor);
  map.id = id;
  map.interior = true;
  map.wallStyle = def.wall;
  map.name = def.name;

  // Walls all round; the bottom-centre tile is the way out.
  map.strokeRect(0, 0, def.w, def.h, T.WALL);
  const exitX = Math.floor(def.w / 2);
  const exitY = def.h - 1;
  map.set(exitX, exitY, T.PLANKS);
  map.doors.push({ x: exitX, y: exitY, to: 'overworld', label: 'Outside' });
  map.spawn = { x: exitX, y: exitY - 1 };

  if (def.counter) {
    map.fillRect(def.counter.x, def.counter.y, def.counter.w, 1, T.COUNTER);
    // A gap so the shopkeeper isn't walled in.
    map.set(def.counter.x + def.counter.w - 1, def.counter.y, def.floor);
  }

  for (const obj of def.objects ?? []) {
    map.objects.push({ ...obj });
    map.block(obj.x, obj.y, obj.w ?? 1, obj.h ?? 1);
  }

  map.decor = def.decor ?? [];
  for (const d of map.decor) map.block(d.x, d.y);

  if (def.npc) {
    map.npcs.push({ id: def.npc, x: def.npcAt.x, y: def.npcAt.y, shop: def.shop, static: true });
  }
  map.livestockPen = def.livestock ?? null;

  return map;
}

/** Where the player should appear when leaving an interior. */
export function exitPositionFor(overworld, interiorId) {
  const building = overworld.buildings.find((b) => b.interior === interiorId);
  if (!building) return overworld.spawn;
  return { x: building.doorX, y: building.doorY + 1 };
}

export { TILE };
