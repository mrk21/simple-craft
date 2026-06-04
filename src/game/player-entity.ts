import * as THREE from 'three';

// 高さ 1.8 を [脚 0~0.65][胴 0.65~1.3][頭 1.3~1.8] に配分
const SKIN_COLOR = 0xeebd9e;
const SHIRT_COLOR = 0x3b7eb3;
const PANTS_COLOR = 0x2a4670;

export const WALK_SWING_MAX = 0.6;
export const ARM_SWING_DURATION = 0.25;
export const ARM_SWING_MAX = 1.4;

export interface PlayerAnimationState {
  walkPhase: number;
  walkSwingAmount: number; // 0..1
  armSwingTime: number; // -1 = inactive
}

export interface PlayerEntity {
  group: THREE.Group;
  state: PlayerAnimationState;
  // limb 参照（pivot 付き Group）
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
}

function makeBox(
  w: number,
  h: number,
  d: number,
  color: number,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshLambertMaterial({ color });
  return new THREE.Mesh(geo, mat);
}

// 関節 (joint) を pivot に持つ手足
// メッシュ自体は -h/2 にオフセットして joint からぶら下がる
function makeLimb(
  w: number,
  h: number,
  d: number,
  color: number,
  pivotX: number,
  pivotY: number,
  pivotZ: number,
): THREE.Group {
  const group = new THREE.Group();
  const mesh = makeBox(w, h, d, color);
  mesh.position.y = -h / 2;
  group.add(mesh);
  group.position.set(pivotX, pivotY, pivotZ);
  return group;
}

export function createPlayerEntity(): PlayerEntity {
  const group = new THREE.Group();
  // 頭 (固定): 0.5x0.5x0.5、中心 y=1.55
  const head = makeBox(0.5, 0.5, 0.5, SKIN_COLOR);
  head.position.set(0, 1.55, 0);
  group.add(head);
  // 胴 (固定): 0.5x0.65x0.25、中心 y=0.975
  const body = makeBox(0.5, 0.65, 0.25, SHIRT_COLOR);
  body.position.set(0, 0.975, 0);
  group.add(body);
  // 腕: 肩 (y=1.3) を pivot に
  const leftArm = makeLimb(0.2, 0.65, 0.25, SKIN_COLOR, -0.35, 1.3, 0);
  const rightArm = makeLimb(0.2, 0.65, 0.25, SKIN_COLOR, 0.35, 1.3, 0);
  // 脚: 股関節 (y=0.65) を pivot に
  const leftLeg = makeLimb(0.2, 0.65, 0.25, PANTS_COLOR, -0.1, 0.65, 0);
  const rightLeg = makeLimb(0.2, 0.65, 0.25, PANTS_COLOR, 0.1, 0.65, 0);
  group.add(leftArm, rightArm, leftLeg, rightLeg);

  return {
    group,
    state: {
      walkPhase: 0,
      walkSwingAmount: 0,
      armSwingTime: -1,
    },
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
  };
}

export interface AnimationInput {
  isWalking: boolean;
  walkSpeed: number; // 移動の水平速度
}

// 純粋関数: アニメーション状態を進める（Three.js 非依存、テスト可能）
export function advanceAnimationState(
  state: PlayerAnimationState,
  dt: number,
  input: AnimationInput,
): void {
  if (input.isWalking) {
    state.walkSwingAmount = Math.min(1, state.walkSwingAmount + dt * 6);
    state.walkPhase += dt * input.walkSpeed * 1.8;
  } else {
    state.walkSwingAmount = Math.max(0, state.walkSwingAmount - dt * 6);
  }
  if (state.armSwingTime >= 0) {
    state.armSwingTime += dt;
    if (state.armSwingTime >= ARM_SWING_DURATION) {
      state.armSwingTime = -1;
    }
  }
}

// Three.js 副作用: 状態を limb の rotation に反映
function applyAnimationToLimbs(entity: PlayerEntity): void {
  const swing =
    Math.sin(entity.state.walkPhase) *
    WALK_SWING_MAX *
    entity.state.walkSwingAmount;
  entity.leftArm.rotation.x = swing;
  entity.rightLeg.rotation.x = swing;
  entity.rightArm.rotation.x = -swing;
  entity.leftLeg.rotation.x = -swing;
  // 腕振り中は右腕を上書き
  if (entity.state.armSwingTime >= 0) {
    const t = entity.state.armSwingTime / ARM_SWING_DURATION;
    const sw = Math.sin(t * Math.PI) * ARM_SWING_MAX;
    entity.rightArm.rotation.x = -sw;
  }
}

// 公開 API: 状態更新 + メッシュ反映
export function updatePlayerEntityAnimation(
  entity: PlayerEntity,
  dt: number,
  input: AnimationInput,
): void {
  advanceAnimationState(entity.state, dt, input);
  applyAnimationToLimbs(entity);
}

export function triggerArmSwing(entity: PlayerEntity): void {
  entity.state.armSwingTime = 0;
}

export function setPlayerEntityVisible(
  entity: PlayerEntity,
  visible: boolean,
): void {
  entity.group.visible = visible;
}

export function setPlayerEntityTransform(
  entity: PlayerEntity,
  x: number,
  y: number,
  z: number,
  yaw: number,
): void {
  entity.group.position.set(x, y, z);
  entity.group.rotation.y = yaw;
}
