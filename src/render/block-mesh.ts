import * as THREE from "three";
import { CHUNK_VOLUME, idx } from "../world/chunk";
import type { BlockId } from "../world/block";
import { meshChunk } from "./mesher";

// 単体ブロック用の BufferGeometry（中心が原点、辺長 = size）
// 中身は通常の meshChunk と同じ UV・法線で、ドロップアイテムの 3D メッシュに使う
export function buildBlockGeometry(
  block: BlockId,
  size: number,
): THREE.BufferGeometry {
  const blocks = new Uint8Array(CHUNK_VOLUME);
  blocks[idx(0, 0, 0)] = block;
  const mesh = meshChunk(blocks);

  // meshChunk の位置は 0..1（ブロック座標）。中心を原点へ寄せて size 倍する
  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < mesh.positions.length; i++) {
    positions[i] = (mesh.positions[i] - 0.5) * size;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(mesh.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  return g;
}
