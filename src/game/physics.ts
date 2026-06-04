export const PLAYER_HALF_WIDTH = 0.3;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_OFFSET = 1.62;
export const GRAVITY = -28;
export const JUMP_VELOCITY = 8;
export const WALK_SPEED = 4.3;
export const TERMINAL_VELOCITY = -50;

// 水中物理
export const WATER_GRAVITY = -8;
export const WATER_TERMINAL_VELOCITY = -3;
export const SWIM_UP_VELOCITY = 4;

export interface PlayerState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
}

export type IsSolidAt = (x: number, y: number, z: number) => boolean;
export type IsWaterAt = (x: number, y: number, z: number) => boolean;

interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

// プレイヤー AABB のいずれかのセルが水なら true
export function isInWater(
  player: PlayerState,
  isWater: IsWaterAt,
): boolean {
  const b = playerAabb(player);
  for (let y = b.minY; y <= b.maxY; y++) {
    for (let z = b.minZ; z <= b.maxZ; z++) {
      for (let x = b.minX; x <= b.maxX; x++) {
        if (isWater(x, y, z)) return true;
      }
    }
  }
  return false;
}

function playerAabb(player: PlayerState): AABB {
  const hw = PLAYER_HALF_WIDTH;
  const h = PLAYER_HEIGHT;
  return {
    minX: Math.floor(player.x - hw),
    maxX: Math.ceil(player.x + hw) - 1,
    minY: Math.floor(player.y),
    maxY: Math.ceil(player.y + h) - 1,
    minZ: Math.floor(player.z - hw),
    maxZ: Math.ceil(player.z + hw) - 1,
  };
}

// プレイヤー AABB 内で軸方向にスキャンし、最初に見つかった solid ブロックの座標を返す
// ascending=true: 軸の小→大方向にスキャン
function scanSolid(
  isSolid: IsSolidAt,
  b: AABB,
  axis: 'x' | 'y' | 'z',
  ascending: boolean,
): number | null {
  const [from, to] =
    axis === 'x' ? [b.minX, b.maxX]
    : axis === 'y' ? [b.minY, b.maxY]
    : [b.minZ, b.maxZ];
  const start = ascending ? from : to;
  const stop = ascending ? to : from;
  const step = ascending ? 1 : -1;
  for (let a = start; ascending ? a <= stop : a >= stop; a += step) {
    for (let y = b.minY; y <= b.maxY; y++) {
      for (let z = b.minZ; z <= b.maxZ; z++) {
        for (let x = b.minX; x <= b.maxX; x++) {
          const X = axis === 'x' ? a : x;
          const Y = axis === 'y' ? a : y;
          const Z = axis === 'z' ? a : z;
          if (isSolid(X, Y, Z)) return a;
        }
      }
    }
  }
  return null;
}

export function moveAndCollide(
  player: PlayerState,
  isSolid: IsSolidAt,
  dt: number,
): void {
  const hw = PLAYER_HALF_WIDTH;
  const h = PLAYER_HEIGHT;

  // X 軸
  player.x += player.vx * dt;
  if (player.vx !== 0) {
    const bx = scanSolid(isSolid, playerAabb(player), 'x', player.vx > 0);
    if (bx !== null) {
      player.x = player.vx > 0 ? bx - hw : bx + 1 + hw;
      player.vx = 0;
    }
  }

  // Y 軸
  player.y += player.vy * dt;
  player.onGround = false;
  if (player.vy !== 0) {
    const by = scanSolid(isSolid, playerAabb(player), 'y', player.vy > 0);
    if (by !== null) {
      if (player.vy > 0) {
        player.y = by - h;
      } else {
        player.y = by + 1;
        player.onGround = true;
      }
      player.vy = 0;
    }
  }

  // Z 軸
  player.z += player.vz * dt;
  if (player.vz !== 0) {
    const bz = scanSolid(isSolid, playerAabb(player), 'z', player.vz > 0);
    if (bz !== null) {
      player.z = player.vz > 0 ? bz - hw : bz + 1 + hw;
      player.vz = 0;
    }
  }
}
