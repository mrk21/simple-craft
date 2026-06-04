// ============================================================
// 視点モードとカメラ変換（純粋ロジック）
// ============================================================

export type ViewMode = "first" | "third-back" | "third-front";

export const VIEW_DISTANCE = 4; // 三人称時のカメラ距離 (ブロック)

export function nextViewMode(m: ViewMode): ViewMode {
  if (m === "first") return "third-back";
  if (m === "third-back") return "third-front";
  return "first";
}

export interface CameraTransform {
  posX: number;
  posY: number;
  posZ: number;
  rotY: number; // yaw
  rotX: number; // pitch
}

// プレイヤー位置 + yaw/pitch + viewMode から camera の transform を計算
// - first:       目の位置で yaw/pitch そのまま
// - third-back:  背後 viewDistance ブロック、同じ yaw/pitch
// - third-front: 前方 viewDistance ブロック、180度反転して player を見る
export function computeCameraTransform(
  playerX: number,
  playerY: number, // 足元
  playerZ: number,
  eyeOffset: number,
  yaw: number,
  pitch: number,
  viewMode: ViewMode,
  viewDistance: number = VIEW_DISTANCE,
): CameraTransform {
  const eyeY = playerY + eyeOffset;
  // forward ベクトル (yaw=0, pitch=0 → -Z)
  const fx = -Math.sin(yaw) * Math.cos(pitch);
  const fy = Math.sin(pitch);
  const fz = -Math.cos(yaw) * Math.cos(pitch);

  if (viewMode === "first") {
    return {
      posX: playerX,
      posY: eyeY,
      posZ: playerZ,
      rotY: yaw,
      rotX: pitch,
    };
  }
  if (viewMode === "third-back") {
    return {
      posX: playerX - fx * viewDistance,
      posY: eyeY - fy * viewDistance,
      posZ: playerZ - fz * viewDistance,
      rotY: yaw,
      rotX: pitch,
    };
  }
  // third-front
  return {
    posX: playerX + fx * viewDistance,
    posY: eyeY + fy * viewDistance,
    posZ: playerZ + fz * viewDistance,
    rotY: yaw + Math.PI,
    rotX: -pitch,
  };
}
