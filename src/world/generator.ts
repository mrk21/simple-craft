import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import {
  CHUNK_SIZE_X,
  CHUNK_SIZE_Y,
  CHUNK_SIZE_Z,
  CHUNK_VOLUME,
  idx,
} from './chunk';
import { BLOCK } from './block';
import { createPrng } from './prng';

// ============================================================
// 地形パラメータ
// ============================================================
//
// 2 つのノイズチャネルを合成して地形を作る:
//   continental: 低周波の「大陸度」。広いスケールで海/陸の高度差を決める
//   base:        中周波の多オクターブ FBM。基本となる小起伏（丘）
//
// 高さ = SEA_LEVEL + continental*CONT_AMP + fbm*BASE_AMP
//   continental≈-1: 深い海
//   continental≈ 0: 海岸線付近
//   continental≈+1: 内陸の丘

export const SEA_LEVEL = 62;

const BASE_HEIGHT = SEA_LEVEL;     // 高さの中心を海面に合わせる
const CONTINENT_AMPLITUDE = 25;    // 海底〜内陸までの最大高度差
const BASE_AMPLITUDE = 8;          // 局所的な起伏（小さい丘）
const CONTINENT_FREQ = 0.003;      // 非常に低周波（大スケール）
const BASE_FREQ = 0.015;
const BASE_OCTAVES = 4;

// チャネル別シード派生用の大きな奇定数。XOR で独立な PRNG を作る
const CHANNEL_SALT_BASE = 0x9e3779b1;

interface NoiseSet {
  continental: NoiseFunction2D;
  base: NoiseFunction2D;
}

// ノイズ関数は内部で 256 エントリの順列表を毎回構築するので、
// シード毎にキャッシュして毎チャンク再生成しないようにする
const noiseCache = new Map<number, NoiseSet>();

function getNoiseSet(seed: number): NoiseSet {
  const cached = noiseCache.get(seed);
  if (cached) return cached;
  const set: NoiseSet = {
    continental: createNoise2D(createPrng(seed)),
    base: createNoise2D(createPrng((seed ^ CHANNEL_SALT_BASE) >>> 0)),
  };
  noiseCache.set(seed, set);
  return set;
}

// 多オクターブ FBM。1/振幅で正規化するので戻り値は概ね [-1, 1]
function fbm(
  noise: NoiseFunction2D,
  x: number,
  y: number,
  octaves: number,
): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

export function generateHeightmap(
  chunkX: number,
  chunkZ: number,
  seed: number,
): Uint8Array {
  const n = getNoiseSet(seed);
  const heights = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Z);
  for (let z = 0; z < CHUNK_SIZE_Z; z++) {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      const wx = chunkX * CHUNK_SIZE_X + x;
      const wz = chunkZ * CHUNK_SIZE_Z + z;

      // 大陸度（低周波）: 海/陸の高度差をまるごと作る
      const cont = n.continental(wx * CONTINENT_FREQ, wz * CONTINENT_FREQ);
      // 局所起伏（多オクターブ FBM）: 丘・凹凸
      const baseH = fbm(n.base, wx * BASE_FREQ, wz * BASE_FREQ, BASE_OCTAVES);

      const h = BASE_HEIGHT + cont * CONTINENT_AMPLITUDE + baseH * BASE_AMPLITUDE;
      heights[x + z * CHUNK_SIZE_X] = Math.max(
        0,
        Math.min(CHUNK_SIZE_Y - 1, Math.floor(h)),
      );
    }
  }
  return heights;
}

export function generateBlocks(heightmap: Uint8Array): Uint8Array {
  const blocks = new Uint8Array(CHUNK_VOLUME);
  for (let z = 0; z < CHUNK_SIZE_Z; z++) {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      const h = heightmap[x + z * CHUNK_SIZE_X];
      const top = h > SEA_LEVEL ? BLOCK.GRASS : BLOCK.SAND;
      for (let y = 0; y < CHUNK_SIZE_Y; y++) {
        if (y < h) {
          blocks[idx(x, y, z)] = BLOCK.STONE;
        } else if (y === h) {
          blocks[idx(x, y, z)] = top;
        } else if (y <= SEA_LEVEL) {
          blocks[idx(x, y, z)] = BLOCK.WATER;
        }
        // y > SEA_LEVEL: AIR (= 0, default)
      }
    }
  }
  return blocks;
}
