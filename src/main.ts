import * as THREE from "three";
import { generateBlocks, generateHeightmap } from "./world/generator";
import {
  meshChunk,
  meshChunkWater,
  type ChunkMesh,
  type NeighborBlockAt,
} from "./render/mesher";
import {
  CHUNK_SIZE_X,
  CHUNK_SIZE_Y,
  CHUNK_SIZE_Z,
  idx,
  worldToChunkLocal,
} from "./world/chunk";
import { BLOCK, type BlockId, blockKind } from "./world/block";
import {
  GRAVITY,
  JUMP_VELOCITY,
  PLAYER_EYE_OFFSET,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
  TERMINAL_VELOCITY,
  WALK_SPEED,
  moveAndCollide,
  type IsSolidAt,
  type PlayerState,
} from "./game/physics";

const SEED = 12345;
const VIEW_RADIUS = 3; // プレイヤーから ±VIEW_RADIUS チャンク = (2R+1)^2 がロード対象
const INITIAL_RADIUS = 1; // 起動時に同期ロードする範囲

// ============================================================
// シーン
// ============================================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
// VIEW_RADIUS=3, CHUNK_SIZE=16 → 視野端まで ~50 ブロック。フォグを合わせて pop-in を隠す
scene.fog = new THREE.Fog(0x87ceeb, 30, 70);

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
let selectedBlock: BlockId = BLOCK.STONE;

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

function rebuildChunkMeshes(cx: number, cz: number) {
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

  const blocks = chunkBlocks.get(key);
  if (!blocks) return;

  const neighbor = makeNeighborLookup(cx, cz);
  const opaqueMesh = meshChunk(blocks, neighbor);
  const waterMesh = meshChunkWater(blocks, neighbor);
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

  // ロード対象を1つだけ（最も近い未ロード）処理
  let bestCx = 0;
  let bestCz = 0;
  let bestDist = Infinity;
  let found = false;
  for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
    for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
      const cx = pcx + dx;
      const cz = pcz + dz;
      if (chunkBlocks.has(chunkKey(cx, cz))) continue;
      const dist = dx * dx + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        bestCx = cx;
        bestCz = cz;
        found = true;
      }
    }
  }
  if (found) loadChunk(bestCx, bestCz);
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

// ============================================================
// 入力
// ============================================================

const keys = new Set<string>();
window.addEventListener("keydown", (e) => keys.add(e.code));
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear()); // フォーカス外れたら全部リセット

// マウス（pointer lock 中のみ累積）
let yaw = 0;
let pitch = 0;
const MOUSE_SENSITIVITY = 0.002;
let pendingDX = 0;
let pendingDY = 0;

document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  pendingDX += e.movementX;
  pendingDY += e.movementY;
});

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
const screenCenter = new THREE.Vector2(0, 0);

function pickHit(): THREE.Intersection | null {
  raycaster.setFromCamera(screenCenter, camera);
  const meshes: THREE.Mesh[] = [];
  for (const m of chunkMeshes.values()) {
    if (m.opaque) meshes.push(m.opaque);
  }
  const hits = raycaster.intersectObjects(meshes, false);
  return hits[0] ?? null;
}

function playerOverlapsBlock(bx: number, by: number, bz: number): boolean {
  const hw = PLAYER_HALF_WIDTH;
  const h = PLAYER_HEIGHT;
  return (
    player.x - hw < bx + 1 &&
    player.x + hw > bx &&
    player.y < by + 1 &&
    player.y + h > by &&
    player.z - hw < bz + 1 &&
    player.z + hw > bz
  );
}

function modifyBlock(hit: THREE.Intersection, place: boolean) {
  if (!hit.face) return;
  const normal = hit.face.normal;
  const point = hit.point;
  const eps = 0.001;
  const sign = place ? 1 : -1;
  const wx = Math.floor(point.x + normal.x * eps * sign);
  const wy = Math.floor(point.y + normal.y * eps * sign);
  const wz = Math.floor(point.z + normal.z * eps * sign);

  if (place && playerOverlapsBlock(wx, wy, wz)) return;

  const coords = worldToChunkLocal(wx, wy, wz);
  if (!coords) return;
  const blocks = chunkBlocks.get(chunkKey(coords.cx, coords.cz));
  if (!blocks) return;
  blocks[idx(coords.lx, coords.y, coords.lz)] = place
    ? selectedBlock
    : BLOCK.AIR;

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
  if (document.pointerLockElement !== renderer.domElement) return;
  const hit = pickHit();
  if (!hit) return;
  if (e.button === 0) modifyBlock(hit, false);
  if (e.button === 2) modifyBlock(hit, true);
});
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
};
const CODE_TO_BLOCK: Record<string, BlockId> = {
  Digit1: BLOCK.GRASS,
  Digit2: BLOCK.STONE,
  Digit3: BLOCK.SAND,
  Digit4: BLOCK.WATER,
};

const hud = document.createElement("div");
hud.style.cssText =
  "position:absolute;top:10px;left:10px;background:rgba(0,0,0,0.55);color:#fff;padding:10px 12px;font-family:sans-serif;font-size:13px;line-height:1.5;pointer-events:none;border-radius:4px;";
document.body.appendChild(hud);

const lockOverlay = document.createElement("div");
lockOverlay.style.cssText =
  "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);color:#fff;font-family:sans-serif;font-size:22px;pointer-events:none;";
lockOverlay.textContent = "Click to play";
document.body.appendChild(lockOverlay);

document.addEventListener("pointerlockchange", () => {
  lockOverlay.style.display =
    document.pointerLockElement === renderer.domElement ? "none" : "flex";
});

const crosshair = document.createElement("div");
crosshair.style.cssText =
  "position:absolute;top:50%;left:50%;width:16px;height:16px;margin:-8px 0 0 -8px;pointer-events:none;";
crosshair.innerHTML = `
  <div style="position:absolute;top:7px;left:0;right:0;height:2px;background:white;mix-blend-mode:difference;"></div>
  <div style="position:absolute;left:7px;top:0;bottom:0;width:2px;background:white;mix-blend-mode:difference;"></div>
`;
document.body.appendChild(crosshair);

function updateHud() {
  hud.innerHTML = `
    Selected: <b>${BLOCK_NAMES[selectedBlock]}</b><br>
    WASD = move, Space = jump<br>
    Left click = break / Right click = place<br>
    1: GRASS &nbsp; 2: STONE &nbsp; 3: SAND &nbsp; 4: WATER<br>
    ESC = release cursor
  `.trim();
}
updateHud();

document.addEventListener("keydown", (e) => {
  const block = CODE_TO_BLOCK[e.code];
  if (block !== undefined) {
    selectedBlock = block;
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

  // マウス → ヨー/ピッチ
  yaw -= pendingDX * MOUSE_SENSITIVITY;
  pitch -= pendingDY * MOUSE_SENSITIVITY;
  pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
  pendingDX = 0;
  pendingDY = 0;

  // WASD → 移動方向（ヨー基準）
  let forward = 0;
  let strafe = 0;
  if (keys.has("KeyW")) forward += 1;
  if (keys.has("KeyS")) forward -= 1;
  if (keys.has("KeyA")) strafe -= 1;
  if (keys.has("KeyD")) strafe += 1;
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

  // 重力
  player.vy += GRAVITY * dt;
  if (player.vy < TERMINAL_VELOCITY) player.vy = TERMINAL_VELOCITY;

  // ジャンプ
  if (keys.has("Space") && player.onGround) {
    player.vy = JUMP_VELOCITY;
  }

  moveAndCollide(player, isSolid, dt);
}

function render() {
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
  camera.position.set(player.x, player.y + PLAYER_EYE_OFFSET, player.z);
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
