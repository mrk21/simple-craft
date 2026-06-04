// ============================================================
// 入力状態と DOM イベントハンドラ
// ============================================================

export interface InputState {
  // 現在押されているキー (e.code、layout 非依存)
  keys: Set<string>;
  // 直近 consume 以降のマウス移動量の累積
  mouseDX: number;
  mouseDY: number;
}

export function createInputState(): InputState {
  return { keys: new Set(), mouseDX: 0, mouseDY: 0 };
}

export interface InstallInputHandlersOptions {
  // マウス移動を蓄積する条件（例: pointer lock 中のみ）
  // 省略時は常に蓄積
  isMouseActive?: () => boolean;
}

// ブラウザのイベントを購読して input state を更新する
export function installInputHandlers(
  state: InputState,
  opts: InstallInputHandlersOptions = {},
): void {
  window.addEventListener("keydown", (e) => state.keys.add(e.code));
  window.addEventListener("keyup", (e) => state.keys.delete(e.code));
  // フォーカスが外れた時はキー状態を全部リセット (キーリピート暴走対策)
  window.addEventListener("blur", () => state.keys.clear());

  document.addEventListener("mousemove", (e) => {
    if (opts.isMouseActive && !opts.isMouseActive()) return;
    state.mouseDX += e.movementX;
    state.mouseDY += e.movementY;
  });
}

// 蓄積した delta を取り出して状態をクリア
export function consumeMouseDelta(state: InputState): [number, number] {
  const dx = state.mouseDX;
  const dy = state.mouseDY;
  state.mouseDX = 0;
  state.mouseDY = 0;
  return [dx, dy];
}

// マウス delta を捨てる（インベントリ開閉時など、適用したくない場合）
export function discardMouseDelta(state: InputState): void {
  state.mouseDX = 0;
  state.mouseDY = 0;
}
