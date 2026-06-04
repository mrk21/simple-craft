import * as THREE from "three";
import { generateBlocks, generateHeightmap } from "./world/generator";
import {
  meshChunk,
  meshChunkWater,
  type ChunkMesh,
  type NeighborBlockAt,
} from "./render/mesher";
import type {
  ChunkWorkerRequest,
  ChunkWorkerResponse,
  NeighborChunks,
} from "./workers/chunk.worker";
import {
  CHUNK_SIZE_X,
  CHUNK_SIZE_Y,
  CHUNK_SIZE_Z,
  idx,
  worldToChunkLocal,
} from "./world/chunk";
import {
  BLOCK,
  type BlockId,
  blockKind,
  isWaterBlock,
} from "./world/block";
import {
  GRAVITY,
  JUMP_VELOCITY,
  PLAYER_EYE_OFFSET,
  PLAYER_HEIGHT,
  SWIM_UP_VELOCITY,
  TERMINAL_VELOCITY,
  WALK_SPEED,
  WATER_GRAVITY,
  WATER_TERMINAL_VELOCITY,
  isInWater,
  moveAndCollide,
  type IsSolidAt,
  type IsWaterAt,
  type PlayerState,
} from "./game/physics";
import {
  HOTBAR_SLOTS,
  addItemToInventory,
  applyDroppedItemPhysics,
  consumeSelected,
  createInventoryState,
  disposeDroppedItem,
  isExpired,
  isInPickupRange,
  returnHeldToInventory,
  spawnDroppedItem,
  swapOrMergeSlot,
  syncDroppedItemMesh,
  type DroppedItem,
} from "./game/item";
import {
  createPlayerEntity,
  setPlayerEntityTransform,
  setPlayerEntityVisible,
  triggerArmSwing,
  updatePlayerEntityAnimation,
} from "./game/player-entity";
import {
  WATER_TICK_INTERVAL,
  computeWaterState,
  createWaterFlowState,
  markPendingWithNeighbors as wfMarkPendingWithNeighbors,
  parseWkey,
} from "./game/water-flow";
import {
  computeTargetCell,
  playerOverlapsBlock as ovOverlapsBlock,
  raycastFromCamera,
} from "./game/interaction";
import {
  consumeMouseDelta,
  createInputState,
  discardMouseDelta,
  installInputHandlers,
} from "./core/input";
import {
  computeCameraTransform,
  nextViewMode,
  type ViewMode,
} from "./core/camera";
import {
  createCrosshair,
  createHudTextOverlay,
  createLockOverlay,
} from "./ui/hud";
import { createInventoryUi } from "./ui/inventory-ui";

const SEED = 12345;
const VIEW_RADIUS = 3; // プレイヤーから ±VIEW_RADIUS チャンク = (2R+1)^2 がロード対象
const INITIAL_RADIUS = 1; // 起動時に同期ロードする範囲

// ============================================================
// シーン
// ============================================================

const SKY_COLOR = 0x87ceeb;
const UNDERWATER_COLOR = 0x0a3a5c; // 濃い藍色
const SKY_FOG_NEAR = 30;
const SKY_FOG_FAR = 70;
const UNDERWATER_FOG_NEAR = 0.5;
const UNDERWATER_FOG_FAR = 18;

const scene = new THREE.Scene();
const skyBackground = new THREE.Color(SKY_COLOR);
scene.background = skyBackground;
// VIEW_RADIUS=3, CHUNK_SIZE=16 → 視野端まで ~50 ブロック。フォグを合わせて pop-in を隠す
const sceneFog = new THREE.Fog(SKY_COLOR, SKY_FOG_NEAR, SKY_FOG_FAR);
scene.fog = sceneFog;

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.rotation.order = "YXZ";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const opaqueMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
const waterMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.6,
  depthWrite: false,
});

const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(20, 50, 30);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.4));

// ============================================================
// ワールド管理
// ============================================================

interface ChunkMeshes {
  opaque?: THREE.Mesh;
  water?: THREE.Mesh;
}
const chunkBlocks = new Map<string, Uint8Array>();
const chunkMeshes = new Map<string, ChunkMeshes>();
// インベントリ + ドロップアイテムは ./game/item に分離
const inv = createInventoryState();
const droppedItems: DroppedItem[] = [];
let inventoryOpen = false;

function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

function buildGeometry(mesh: ChunkMesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  g.setAttribute("color", new THREE.BufferAttribute(mesh.colors, 3, true));
  g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  return g;
}

function makeNeighborLookup(cx: number, cz: number): NeighborBlockAt {
  return (x, y, z) => {
    if (y < 0 || y >= CHUNK_SIZE_Y) return BLOCK.AIR;
    let nx = cx;
    let nz = cz;
    let lx = x;
    let lz = z;
    if (x < 0) {
      nx -= 1;
      lx = CHUNK_SIZE_X - 1;
    }
    if (x >= CHUNK_SIZE_X) {
      nx += 1;
      lx = 0;
    }
    if (z < 0) {
      nz -= 1;
      lz = CHUNK_SIZE_Z - 1;
    }
    if (z >= CHUNK_SIZE_Z) {
      nz += 1;
      lz = 0;
    }
    const blocks = chunkBlocks.get(chunkKey(nx, nz));
    if (!blocks) return BLOCK.AIR;
    return blocks[idx(lx, y, lz)] as BlockId;
  };
}

// 事前に作られたメッシュデータをシーンへ反映（worker と main thread から共通利用）
function applyChunkMeshes(
  cx: number,
  cz: number,
  opaqueMesh: ChunkMesh,
  waterMesh: ChunkMesh,
) {
  const key = chunkKey(cx, cz);
  const old = chunkMeshes.get(key);
  if (old) {
    if (old.opaque) {
      scene.remove(old.opaque);
      old.opaque.geometry.dispose();
    }
    if (old.water) {
      scene.remove(old.water);
      old.water.geometry.dispose();
    }
  }
  const next: ChunkMeshes = {};
  if (opaqueMesh.indices.length > 0) {
    const m = new THREE.Mesh(buildGeometry(opaqueMesh), opaqueMaterial);
    m.position.set(cx * CHUNK_SIZE_X, 0, cz * CHUNK_SIZE_Z);
    scene.add(m);
    next.opaque = m;
  }
  if (waterMesh.indices.length > 0) {
    const m = new THREE.Mesh(buildGeometry(waterMesh), waterMaterial);
    m.position.set(cx * CHUNK_SIZE_X, 0, cz * CHUNK_SIZE_Z);
    scene.add(m);
    next.water = m;
  }
  chunkMeshes.set(key, next);
}

// メインスレッドで同期 mesh（初期ロード・編集時に使用）
function rebuildChunkMeshes(cx: number, cz: number) {
  const blocks = chunkBlocks.get(chunkKey(cx, cz));
  if (!blocks) return;
  const neighbor = makeNeighborLookup(cx, cz);
  applyChunkMeshes(
    cx,
    cz,
    meshChunk(blocks, neighbor),
    meshChunkWater(blocks, neighbor),
  );
}

// チャンクのロード: ブロック生成 + メッシュ構築 + 隣接メッシュ再構築
function loadChunk(cx: number, cz: number) {
  const key = chunkKey(cx, cz);
  if (chunkBlocks.has(key)) return;

  const heightmap = generateHeightmap(cx, cz, SEED);
  chunkBlocks.set(key, generateBlocks(heightmap));
  rebuildChunkMeshes(cx, cz);

  // 隣接チャンクは境界面の culling が変わるので再 mesh
  const neighbors = [
    [cx + 1, cz],
    [cx - 1, cz],
    [cx, cz + 1],
    [cx, cz - 1],
  ] as const;
  for (const [ncx, ncz] of neighbors) {
    if (chunkBlocks.has(chunkKey(ncx, ncz))) {
      rebuildChunkMeshes(ncx, ncz);
    }
  }
}

// チャンクのアンロード: メッシュ・データ破棄 + 隣接メッシュ再構築（壁面復活）
function unloadChunk(cx: number, cz: number) {
  const key = chunkKey(cx, cz);
  const meshes = chunkMeshes.get(key);
  if (meshes) {
    if (meshes.opaque) {
      scene.remove(meshes.opaque);
      meshes.opaque.geometry.dispose();
    }
    if (meshes.water) {
      scene.remove(meshes.water);
      meshes.water.geometry.dispose();
    }
  }
  chunkMeshes.delete(key);
  chunkBlocks.delete(key);

  const neighbors = [
    [cx + 1, cz],
    [cx - 1, cz],
    [cx, cz + 1],
    [cx, cz - 1],
  ] as const;
  for (const [ncx, ncz] of neighbors) {
    if (chunkBlocks.has(chunkKey(ncx, ncz))) {
      rebuildChunkMeshes(ncx, ncz);
    }
  }
}

// ============================================================
// Worker: チャンク生成 + meshing を逃がす
// ============================================================

const chunkWorker = new Worker(
  new URL('./workers/chunk.worker.ts', import.meta.url),
  { type: 'module' },
);

type RequestKind = 'load' | 'remesh';
interface PendingRequest {
  cx: number;
  cz: number;
  kind: RequestKind;
}
const pendingRequests = new Map<number, PendingRequest>();
let nextRequestId = 0;
const MAX_IN_FLIGHT = 8;

function isInFlight(cx: number, cz: number): boolean {
  for (const r of pendingRequests.values()) {
    if (r.cx === cx && r.cz === cz) return true;
  }
  return false;
}

function collectNeighborClones(cx: number, cz: number): NeighborChunks {
  const result: NeighborChunks = {};
  const nx = chunkBlocks.get(chunkKey(cx - 1, cz));
  if (nx) result.nx = nx.slice();
  const px = chunkBlocks.get(chunkKey(cx + 1, cz));
  if (px) result.px = px.slice();
  const nz = chunkBlocks.get(chunkKey(cx, cz - 1));
  if (nz) result.nz = nz.slice();
  const pz = chunkBlocks.get(chunkKey(cx, cz + 1));
  if (pz) result.pz = pz.slice();
  return result;
}

function enqueueWorker(cx: number, cz: number, kind: RequestKind) {
  if (kind === 'load' && chunkBlocks.has(chunkKey(cx, cz))) return;
  if (kind === 'remesh' && !chunkBlocks.has(chunkKey(cx, cz))) return;
  if (isInFlight(cx, cz)) return;

  const id = nextRequestId++;
  pendingRequests.set(id, { cx, cz, kind });

  const neighbors = collectNeighborClones(cx, cz);
  const transfers: Transferable[] = [];
  if (neighbors.nx) transfers.push(neighbors.nx.buffer);
  if (neighbors.px) transfers.push(neighbors.px.buffer);
  if (neighbors.nz) transfers.push(neighbors.nz.buffer);
  if (neighbors.pz) transfers.push(neighbors.pz.buffer);

  const req: ChunkWorkerRequest = {
    id,
    chunkX: cx,
    chunkZ: cz,
    seed: SEED,
    neighbors,
  };
  if (kind === 'remesh') {
    const clone = chunkBlocks.get(chunkKey(cx, cz))!.slice();
    req.blocks = clone;
    transfers.push(clone.buffer);
  }
  chunkWorker.postMessage(req, transfers);
}

chunkWorker.onmessage = (e: MessageEvent<ChunkWorkerResponse>) => {
  const { id, blocks, opaque, water } = e.data;
  const ctx = pendingRequests.get(id);
  if (!ctx) return;
  pendingRequests.delete(id);

  if (ctx.kind === 'load') {
    chunkBlocks.set(chunkKey(ctx.cx, ctx.cz), blocks);
  }
  applyChunkMeshes(ctx.cx, ctx.cz, opaque, water);

  if (ctx.kind === 'load') {
    // ロード後、隣接チャンクの境界 culling を更新（async で）
    const neighbors = [
      [ctx.cx + 1, ctx.cz],
      [ctx.cx - 1, ctx.cz],
      [ctx.cx, ctx.cz + 1],
      [ctx.cx, ctx.cz - 1],
    ] as const;
    for (const [ncx, ncz] of neighbors) {
      if (chunkBlocks.has(chunkKey(ncx, ncz))) {
        enqueueWorker(ncx, ncz, 'remesh');
      }
    }
  }
};

// 起動時: スポーン周辺だけ同期ロード（重力着地用の地面確保）
for (let cz = -INITIAL_RADIUS; cz <= INITIAL_RADIUS; cz++) {
  for (let cx = -INITIAL_RADIUS; cx <= INITIAL_RADIUS; cx++) {
    loadChunk(cx, cz);
  }
}

// 毎フレーム: プレイヤー位置に基づきロード/アンロードを進める
let lastPlayerChunkX = Number.NaN;
let lastPlayerChunkZ = Number.NaN;

function updateWorld() {
  const pcx = Math.floor(player.x / CHUNK_SIZE_X);
  const pcz = Math.floor(player.z / CHUNK_SIZE_Z);
  const chunkChanged =
    pcx !== lastPlayerChunkX || pcz !== lastPlayerChunkZ;
  lastPlayerChunkX = pcx;
  lastPlayerChunkZ = pcz;

  // アンロードはプレイヤーチャンクが変化した瞬間のみ
  if (chunkChanged) {
    const toUnload: [number, number][] = [];
    for (const key of chunkBlocks.keys()) {
      const [cx, cz] = key.split(",").map(Number);
      if (
        Math.abs(cx - pcx) > VIEW_RADIUS ||
        Math.abs(cz - pcz) > VIEW_RADIUS
      ) {
        toUnload.push([cx, cz]);
      }
    }
    for (const [cx, cz] of toUnload) unloadChunk(cx, cz);
  }

  // Worker で並行ロード（上限まで詰める。最も近い未ロード優先）
  if (pendingRequests.size >= MAX_IN_FLIGHT) return;
  let bestCx = 0;
  let bestCz = 0;
  let bestDist = Infinity;
  let found = false;
  for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
    for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
      const cx = pcx + dx;
      const cz = pcz + dz;
      if (chunkBlocks.has(chunkKey(cx, cz))) continue;
      if (isInFlight(cx, cz)) continue;
      const dist = dx * dx + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        bestCx = cx;
        bestCz = cz;
        found = true;
      }
    }
  }
  if (found) enqueueWorker(bestCx, bestCz, 'load');
}

// ============================================================
// プレイヤー
// ============================================================

const player: PlayerState = {
  x: 0.5,
  y: 100, // 上空にスポーン、重力で着地する
  z: 0.5,
  vx: 0,
  vy: 0,
  vz: 0,
  onGround: false,
};

const isSolid: IsSolidAt = (wx, wy, wz) => {
  if (wy < 0 || wy >= CHUNK_SIZE_Y) return false;
  const c = worldToChunkLocal(wx, wy, wz);
  if (!c) return false;
  const blocks = chunkBlocks.get(chunkKey(c.cx, c.cz));
  if (!blocks) return false;
  return blockKind(blocks[idx(c.lx, c.y, c.lz)] as BlockId) === "opaque";
};

// プレイヤーエンティティは ./game/player-entity に分離
const playerEntity = createPlayerEntity();
scene.add(playerEntity.group);
setPlayerEntityVisible(playerEntity, false); // 一人称ではデフォルト非表示

function playerAnimationInput() {
  const horizSpeed = Math.hypot(player.vx, player.vz);
  return {
    isWalking: horizSpeed > 0.1 && player.onGround,
    walkSpeed: horizSpeed,
  };
}

// 視点モード
let viewMode: ViewMode = "first";

const isWater: IsWaterAt = (wx, wy, wz) => {
  if (wy < 0 || wy >= CHUNK_SIZE_Y) return false;
  const c = worldToChunkLocal(wx, wy, wz);
  if (!c) return false;
  const blocks = chunkBlocks.get(chunkKey(c.cx, c.cz));
  if (!blocks) return false;
  return isWaterBlock(blocks[idx(c.lx, c.y, c.lz)] as BlockId);
};

// ============================================================
// 水の流体シミュレーション（5Hz ティック、ソース/フロー方式）
// ============================================================

const waterFlow = createWaterFlowState();

function markPendingWithNeighbors(wx: number, wy: number, wz: number) {
  wfMarkPendingWithNeighbors(waterFlow, wx, wy, wz);
}

function getBlockAt(wx: number, wy: number, wz: number): BlockId {
  if (wy < 0 || wy >= CHUNK_SIZE_Y) return BLOCK.AIR;
  const c = worldToChunkLocal(wx, wy, wz);
  if (!c) return BLOCK.AIR;
  const blocks = chunkBlocks.get(chunkKey(c.cx, c.cz));
  if (!blocks) return BLOCK.AIR;
  return blocks[idx(c.lx, c.y, c.lz)] as BlockId;
}

function setBlockAt(wx: number, wy: number, wz: number, id: BlockId): boolean {
  if (wy < 0 || wy >= CHUNK_SIZE_Y) return false;
  const c = worldToChunkLocal(wx, wy, wz);
  if (!c) return false;
  const blocks = chunkBlocks.get(chunkKey(c.cx, c.cz));
  if (!blocks) return false;
  blocks[idx(c.lx, c.y, c.lz)] = id;
  return true;
}

function waterTick() {
  if (waterFlow.pending.size === 0) return;

  const toProcess = [...waterFlow.pending];
  waterFlow.pending.clear();

  const changes: [number, number, number, BlockId][] = [];
  for (const k of toProcess) {
    const [wx, wy, wz] = parseWkey(k);
    const current = getBlockAt(wx, wy, wz);
    const next = computeWaterState(wx, wy, wz, current, getBlockAt);
    if (next !== current) changes.push([wx, wy, wz, next]);
  }

  const dirtyChunks = new Set<string>();
  for (const [wx, wy, wz, next] of changes) {
    if (!setBlockAt(wx, wy, wz, next)) continue;
    markPendingWithNeighbors(wx, wy, wz);
    const c = worldToChunkLocal(wx, wy, wz);
    if (c) {
      dirtyChunks.add(chunkKey(c.cx, c.cz));
      if (c.lx === 0) dirtyChunks.add(chunkKey(c.cx - 1, c.cz));
      if (c.lx === CHUNK_SIZE_X - 1)
        dirtyChunks.add(chunkKey(c.cx + 1, c.cz));
      if (c.lz === 0) dirtyChunks.add(chunkKey(c.cx, c.cz - 1));
      if (c.lz === CHUNK_SIZE_Z - 1)
        dirtyChunks.add(chunkKey(c.cx, c.cz + 1));
    }
  }

  for (const key of dirtyChunks) {
    if (chunkBlocks.has(key)) {
      const [cx, cz] = key.split(",").map(Number);
      rebuildChunkMeshes(cx, cz);
    }
  }
}

// ============================================================
// 入力
// ============================================================

const input = createInputState();
installInputHandlers(input, {
  isMouseActive: () => document.pointerLockElement === renderer.domElement,
});

let yaw = 0;
let pitch = 0;
const MOUSE_SENSITIVITY = 0.002;

// クリックで pointer lock 取得
renderer.domElement.addEventListener("click", () => {
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  }
});

// ============================================================
// ブロック設置/破壊（中央レイキャスト）
// ============================================================

const raycaster = new THREE.Raycaster();

function pickHit(): THREE.Intersection | null {
  const meshes: THREE.Mesh[] = [];
  for (const m of chunkMeshes.values()) {
    if (m.opaque) meshes.push(m.opaque);
  }
  return raycastFromCamera(raycaster, camera, meshes);
}

function playerOverlapsBlock(bx: number, by: number, bz: number): boolean {
  return ovOverlapsBlock(player.x, player.y, player.z, bx, by, bz);
}

// ドロップアイテム処理のループ（モジュール関数を組み合わせて使う）
function updateItems(dt: number) {
  if (droppedItems.length === 0) return;
  const px = player.x;
  const py = player.y + PLAYER_HEIGHT * 0.5;
  const pz = player.z;
  for (let i = droppedItems.length - 1; i >= 0; i--) {
    const item = droppedItems[i];
    applyDroppedItemPhysics(item, dt, isSolid);
    if (isExpired(item)) {
      disposeDroppedItem(item, scene);
      droppedItems.splice(i, 1);
      continue;
    }
    if (isInPickupRange(item, px, py, pz)) {
      if (addItemToInventory(inv, item.block)) {
        disposeDroppedItem(item, scene);
        droppedItems.splice(i, 1);
        renderSlots();
        continue;
      }
    }
    syncDroppedItemMesh(item);
  }
}

function modifyBlock(hit: THREE.Intersection, place: boolean) {
  if (!hit.face) return;
  const target = computeTargetCell(
    hit.point.x,
    hit.point.y,
    hit.point.z,
    hit.face.normal.x,
    hit.face.normal.y,
    hit.face.normal.z,
    place,
  );
  const wx = target.x;
  const wy = target.y;
  const wz = target.z;

  if (place && playerOverlapsBlock(wx, wy, wz)) return;

  const coords = worldToChunkLocal(wx, wy, wz);
  if (!coords) return;
  const blocks = chunkBlocks.get(chunkKey(coords.cx, coords.cz));
  if (!blocks) return;
  const selected = inv.slots[inv.selectedHotbarIndex];
  if (place && (selected === null || selected.count === 0)) return; // 空スロット選択時は設置できない
  const cellIdx = idx(coords.lx, coords.y, coords.lz);
  const previousBlock = blocks[cellIdx] as BlockId;

  if (place) {
    const consumed = consumeSelected(inv);
    if (consumed === null) return;
    blocks[cellIdx] = consumed;
    renderSlots();
  } else {
    blocks[cellIdx] = BLOCK.AIR;
    if (previousBlock !== BLOCK.AIR && !isWaterBlock(previousBlock)) {
      // 破壊時はそのブロックに対応するアイテムをドロップ（水は除外）
      droppedItems.push(
        spawnDroppedItem(previousBlock, wx + 0.5, wy + 0.5, wz + 0.5, scene),
      );
    }
  }

  // 水流の再評価候補に追加
  markPendingWithNeighbors(wx, wy, wz);

  const toUpdate = new Set<string>([chunkKey(coords.cx, coords.cz)]);
  if (coords.lx === 0) toUpdate.add(chunkKey(coords.cx - 1, coords.cz));
  if (coords.lx === CHUNK_SIZE_X - 1)
    toUpdate.add(chunkKey(coords.cx + 1, coords.cz));
  if (coords.lz === 0) toUpdate.add(chunkKey(coords.cx, coords.cz - 1));
  if (coords.lz === CHUNK_SIZE_Z - 1)
    toUpdate.add(chunkKey(coords.cx, coords.cz + 1));
  for (const k of toUpdate) {
    if (!chunkBlocks.has(k)) continue;
    const [ncx, ncz] = k.split(",").map(Number);
    rebuildChunkMeshes(ncx, ncz);
  }
}

window.addEventListener("mousedown", (e) => {
  if (inventoryOpen) return; // インベントリ操作はスロットの click ハンドラ側
  if (document.pointerLockElement !== renderer.domElement) return;
  const hit = pickHit();
  if (!hit) return;
  if (e.button === 0 || e.button === 2) {
    triggerArmSwing(playerEntity); // 腕振りトリガー（クリック時点で必ず）
  }
  if (e.button === 0) modifyBlock(hit, false);
  if (e.button === 2) modifyBlock(hit, true);
});

// ホイールでホットバーのスロット移動（MC 同様）
window.addEventListener(
  "wheel",
  (e) => {
    if (inventoryOpen) return;
    if (document.pointerLockElement !== renderer.domElement) return;
    if (e.deltaY === 0) return;
    e.preventDefault();
    const n = HOTBAR_SLOTS;
    inv.selectedHotbarIndex =
      e.deltaY > 0
        ? (inv.selectedHotbarIndex + 1) % n
        : (inv.selectedHotbarIndex - 1 + n) % n;
    renderSlots();
  },
  { passive: false },
);
window.addEventListener("contextmenu", (e) => e.preventDefault());

// ============================================================
// HUD
// ============================================================

const BLOCK_NAMES: Record<BlockId, string> = {
  [BLOCK.AIR]: "AIR",
  [BLOCK.GRASS]: "GRASS",
  [BLOCK.STONE]: "STONE",
  [BLOCK.SAND]: "SAND",
  [BLOCK.WATER]: "WATER",
  [BLOCK.WATER_F1]: "WATER (flowing 1)",
  [BLOCK.WATER_F2]: "WATER (flowing 2)",
  [BLOCK.WATER_F3]: "WATER (flowing 3)",
};

const hudOverlay = createHudTextOverlay();
const lockOverlay = createLockOverlay("Click to play");
createCrosshair();

const inventoryUi = createInventoryUi({
  blockNames: BLOCK_NAMES,
  onSlotClick: (index) => {
    if (!inventoryOpen) return;
    swapOrMergeSlot(inv, index);
    inventoryUi.renderSlots(inv);
    inventoryUi.renderHeld(inv.heldItem);
  },
});

function renderSlots() {
  inventoryUi.renderSlots(inv);
}
function renderHeldItem() {
  inventoryUi.renderHeld(inv.heldItem);
}

function updateLockOverlay() {
  const locked = document.pointerLockElement === renderer.domElement;
  lockOverlay.setVisible(!locked && !inventoryOpen);
}

document.addEventListener("pointerlockchange", updateLockOverlay);

function setInventoryOpen(open: boolean) {
  if (inventoryOpen === open) return;
  inventoryOpen = open;
  inventoryUi.setInventoryOpen(open);
  inventoryUi.setInteractive(open);

  if (open) {
    if (document.pointerLockElement === renderer.domElement) {
      document.exitPointerLock();
    }
  } else {
    // 持ち物を戻す（同種スタックに合流 or 空スロットへ）
    if (inv.heldItem !== null) {
      returnHeldToInventory(inv);
      renderHeldItem();
      renderSlots();
    }
    discardMouseDelta(input);
    // E キー（user gesture）で閉じている前提で pointer lock を再取得
    renderer.domElement.requestPointerLock();
  }
  updateLockOverlay();
}

document.addEventListener("mousemove", (e) => {
  if (inv.heldItem !== null) {
    inventoryUi.setHeldPosition(e.clientX, e.clientY);
  }
});

renderSlots();
renderHeldItem();

function updateHud() {
  const viewLabel =
    viewMode === "first"
      ? "first-person"
      : viewMode === "third-back"
        ? "third-person (back)"
        : "third-person (front)";
  hudOverlay.setHTML(`
    View: <b>${viewLabel}</b> (F5)<br>
    WASD = move, Space = jump<br>
    Left click = break / Right click = place<br>
    1-9 = select slot, wheel = cycle<br>
    E = open inventory / ESC = release cursor
  `.trim());
}
updateHud();

document.addEventListener("keydown", (e) => {
  // 1〜9 でホットバー選択
  if (/^Digit[1-9]$/.test(e.code)) {
    inv.selectedHotbarIndex = Number(e.code.slice(5)) - 1;
    renderSlots();
    return;
  }
  if (e.code === "KeyE") {
    e.preventDefault();
    setInventoryOpen(!inventoryOpen);
    return;
  }
  if (e.code === "Escape" && inventoryOpen) {
    setInventoryOpen(false);
    return;
  }
  if (e.code === "F5") {
    e.preventDefault();
    viewMode = nextViewMode(viewMode);
    setPlayerEntityVisible(playerEntity, viewMode !== "first");
    updateHud();
  }
});

// ============================================================
// 固定タイムステップ・ゲームループ
// ============================================================

const FIXED_DT = 1 / 60;
const MAX_FRAME_DT = 0.25;
let lastTime = performance.now();
let accumulator = 0;

function update(dt: number) {
  // チャンクの動的ロード/アンロード
  updateWorld();

  // 安全策: プレイヤーのチャンクが未ロードなら即時同期ロード（すり抜け防止）
  const pcx = Math.floor(player.x / CHUNK_SIZE_X);
  const pcz = Math.floor(player.z / CHUNK_SIZE_Z);
  if (!chunkBlocks.has(chunkKey(pcx, pcz))) {
    loadChunk(pcx, pcz);
  }

  // インベントリ開いてる時は入力をスキップ（マウス累積はクリア）
  if (inventoryOpen) {
    discardMouseDelta(input);
    player.vx = 0;
    player.vz = 0;
    player.vy += GRAVITY * dt;
    if (player.vy < TERMINAL_VELOCITY) player.vy = TERMINAL_VELOCITY;
    moveAndCollide(player, isSolid, dt);
    updatePlayerEntityAnimation(playerEntity, dt, playerAnimationInput());
    updateItems(dt);
    waterFlow.tickAcc += dt;
    while (waterFlow.tickAcc >= WATER_TICK_INTERVAL) {
      waterTick();
      waterFlow.tickAcc -= WATER_TICK_INTERVAL;
    }
    return;
  }

  // マウス → ヨー/ピッチ
  const [dx, dy] = consumeMouseDelta(input);
  yaw -= dx * MOUSE_SENSITIVITY;
  pitch -= dy * MOUSE_SENSITIVITY;
  pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));

  // WASD → 移動方向（ヨー基準）
  let forward = 0;
  let strafe = 0;
  if (input.keys.has("KeyW")) forward += 1;
  if (input.keys.has("KeyS")) forward -= 1;
  if (input.keys.has("KeyA")) strafe -= 1;
  if (input.keys.has("KeyD")) strafe += 1;
  const len = Math.hypot(forward, strafe);
  if (len > 0) {
    forward /= len;
    strafe /= len;
  }
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  player.vx = (fx * forward + rx * strafe) * WALK_SPEED;
  player.vz = (fz * forward + rz * strafe) * WALK_SPEED;

  // 水中判定で重力と終端速度を切り替え
  const inWater = isInWater(player, isWater);
  const gravity = inWater ? WATER_GRAVITY : GRAVITY;
  const terminal = inWater ? WATER_TERMINAL_VELOCITY : TERMINAL_VELOCITY;
  player.vy += gravity * dt;
  if (player.vy < terminal) player.vy = terminal;

  // ジャンプ / 泳ぎ
  if (input.keys.has("Space")) {
    if (inWater) {
      // 水中: onGround 関係なく上昇（Space 押下中は浮力で上がり続ける）
      player.vy = SWIM_UP_VELOCITY;
    } else if (player.onGround) {
      // 地上: 通常ジャンプ
      player.vy = JUMP_VELOCITY;
    }
  }

  moveAndCollide(player, isSolid, dt);

  // プレイヤーアニメ
  updatePlayerEntityAnimation(playerEntity, dt, playerAnimationInput());

  // ドロップアイテム（物理 + 拾得判定）
  updateItems(dt);

  // 水流ティック（5Hz）
  waterFlow.tickAcc += dt;
  while (waterFlow.tickAcc >= WATER_TICK_INTERVAL) {
    waterTick();
    waterFlow.tickAcc -= WATER_TICK_INTERVAL;
  }
}

function render() {
  const t = computeCameraTransform(
    player.x,
    player.y,
    player.z,
    PLAYER_EYE_OFFSET,
    yaw,
    pitch,
    viewMode,
  );
  camera.position.set(t.posX, t.posY, t.posZ);
  camera.rotation.y = t.rotY;
  camera.rotation.x = t.rotX;

  // プレイヤーモデルの位置・向き（yaw に合わせて体が回る）
  setPlayerEntityTransform(playerEntity, player.x, player.y, player.z, yaw);

  // 視点（目の位置）が水中なら濃い藍色のフォグ + 背景に切替
  const eyeInWater = isWater(
    Math.floor(player.x),
    Math.floor(player.y + PLAYER_EYE_OFFSET),
    Math.floor(player.z),
  );
  if (eyeInWater) {
    sceneFog.color.setHex(UNDERWATER_COLOR);
    sceneFog.near = UNDERWATER_FOG_NEAR;
    sceneFog.far = UNDERWATER_FOG_FAR;
    skyBackground.setHex(UNDERWATER_COLOR);
  } else {
    sceneFog.color.setHex(SKY_COLOR);
    sceneFog.near = SKY_FOG_NEAR;
    sceneFog.far = SKY_FOG_FAR;
    skyBackground.setHex(SKY_COLOR);
  }

  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop((nowMs) => {
  let dt = (nowMs - lastTime) / 1000;
  lastTime = nowMs;
  dt = Math.min(dt, MAX_FRAME_DT);

  accumulator += dt;
  while (accumulator >= FIXED_DT) {
    update(FIXED_DT);
    accumulator -= FIXED_DT;
  }
  render();
});
