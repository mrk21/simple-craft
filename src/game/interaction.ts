import * as THREE from 'three';
import { PLAYER_HALF_WIDTH, PLAYER_HEIGHT } from './physics';

const SCREEN_CENTER = new THREE.Vector2(0, 0);

// 画面中央からカメラ視線で chunk メッシュ群にレイキャストし、最も近いヒットを返す
export function raycastFromCamera(
  raycaster: THREE.Raycaster,
  camera: THREE.Camera,
  meshes: THREE.Mesh[],
): THREE.Intersection | null {
  raycaster.setFromCamera(SCREEN_CENTER, camera);
  const hits = raycaster.intersectObjects(meshes, false);
  return hits[0] ?? null;
}

// AABB 重なり判定: プレイヤー占有空間と単位ブロック (bx, by, bz)〜(bx+1, by+1, bz+1) が重なるか
// 純粋関数、テスト容易
export function playerOverlapsBlock(
  px: number,
  py: number,
  pz: number,
  bx: number,
  by: number,
  bz: number,
): boolean {
  const hw = PLAYER_HALF_WIDTH;
  const h = PLAYER_HEIGHT;
  return (
    px - hw < bx + 1 &&
    px + hw > bx &&
    py < by + 1 &&
    py + h > by &&
    pz - hw < bz + 1 &&
    pz + hw > bz
  );
}

// レイキャストのヒット位置と面法線から「編集対象のブロック世界座標」を計算
// place=true: 面の外側のセル（設置先）
// place=false: ヒットしたブロック自体（破壊対象）
// 純粋関数、テスト容易
export function computeTargetCell(
  hitX: number,
  hitY: number,
  hitZ: number,
  normalX: number,
  normalY: number,
  normalZ: number,
  place: boolean,
): { x: number; y: number; z: number } {
  const sign = place ? 1 : -1;
  const eps = 0.001;
  return {
    x: Math.floor(hitX + normalX * eps * sign),
    y: Math.floor(hitY + normalY * eps * sign),
    z: Math.floor(hitZ + normalZ * eps * sign),
  };
}
