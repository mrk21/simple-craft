import type { InputState } from "./input";

// ============================================================
// タッチ操作: 左下に相対式ジョイスティック、右側で look ドラッグ
// + ジャンプ / インベントリ / 視点切替ボタン
// look 領域内では タップ=設置、ロングプレス=破壊
// ============================================================

export interface TouchActionHandlers {
  onTapPlace: () => void;
  onLongPressBreak: () => void;
  onInventoryToggle: () => void;
  onViewToggle: () => void;
  onPause: () => void;
}

export interface TouchControls {
  rootEl: HTMLDivElement;
  dispose: () => void;
}

// ジョイスティック半径（px）。これより外には膝が出ない
const JOY_RADIUS = 64;
// look ドラッグの判定: これ以下の移動量はタップ/ロングプレスとみなす
const MOVE_THRESHOLD_PX = 12;
// タップとみなす最大時間（ms）
const TAP_MAX_MS = 250;
// ロングプレス判定（ms）
const LONG_PRESS_MS = 380;

// 画面の左半分（look ではなくジョイスティック領域）の幅割合
const JOY_ZONE_WIDTH_RATIO = 0.45;

const BTN_CSS_BASE =
  "position:absolute;border-radius:50%;background:rgba(0,0,0,0.4);border:2px solid rgba(255,255,255,0.55);color:white;font-family:sans-serif;font-weight:bold;display:flex;align-items:center;justify-content:center;pointer-events:auto;-webkit-user-select:none;user-select:none;touch-action:none;cursor:pointer;";

function makeButton(label: string, size: number, extraCss: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText =
    BTN_CSS_BASE +
    `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;` +
    extraCss;
  el.textContent = label;
  return el;
}

function attachButtonAction(
  el: HTMLElement,
  action: () => void,
): void {
  // touchstart で即発火、デフォルトを止めて look 検出と混じらないように
  el.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      action();
    },
    { passive: false },
  );
  // デスクトップ動作確認用にクリックも
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    action();
  });
}

function attachHeldButton(
  el: HTMLElement,
  onDown: () => void,
  onUp: () => void,
): void {
  el.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      onDown();
    },
    { passive: false },
  );
  const release = (e: Event) => {
    e.preventDefault();
    onUp();
  };
  el.addEventListener("touchend", release);
  el.addEventListener("touchcancel", release);
}

export function createTouchControls(
  canvasEl: HTMLElement,
  input: InputState,
  handlers: TouchActionHandlers,
): TouchControls {
  // ルートのオーバーレイ。pointer-events:none で子の auto 要素だけが反応する
  const root = document.createElement("div");
  root.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:50;";
  document.body.appendChild(root);

  // ジョイスティック視覚要素（相対式: タッチ位置を中心にする）
  const joyBase = document.createElement("div");
  joyBase.style.cssText =
    `position:absolute;width:${JOY_RADIUS * 2}px;height:${JOY_RADIUS * 2}px;border-radius:50%;background:rgba(255,255,255,0.18);border:2px solid rgba(255,255,255,0.45);display:none;pointer-events:none;transform:translate(-50%,-50%);`;
  root.appendChild(joyBase);
  const joyKnob = document.createElement("div");
  joyKnob.style.cssText =
    `position:absolute;width:${JOY_RADIUS * 0.95}px;height:${JOY_RADIUS * 0.95}px;border-radius:50%;background:rgba(255,255,255,0.55);display:none;pointer-events:none;transform:translate(-50%,-50%);`;
  root.appendChild(joyKnob);

  // ボタン: ジャンプ（右下大）・視点切替・インベントリ（右上小）
  const jumpBtn = makeButton(
    "⤒",
    88,
    "right:max(24px, env(safe-area-inset-right, 0px));bottom:max(120px, env(safe-area-inset-bottom, 0px));",
  );
  const invBtn = makeButton(
    "≡",
    52,
    "top:max(20px, env(safe-area-inset-top, 0px));right:max(20px, env(safe-area-inset-right, 0px));",
  );
  const viewBtn = makeButton(
    "◐",
    52,
    "top:max(20px, env(safe-area-inset-top, 0px));right:calc(max(20px, env(safe-area-inset-right, 0px)) + 64px);",
  );
  const pauseBtn = makeButton(
    "❚❚",
    52,
    "top:max(20px, env(safe-area-inset-top, 0px));right:calc(max(20px, env(safe-area-inset-right, 0px)) + 128px);",
  );
  root.appendChild(jumpBtn);
  root.appendChild(invBtn);
  root.appendChild(viewBtn);
  root.appendChild(pauseBtn);

  attachHeldButton(
    jumpBtn,
    () => input.keys.add("Space"),
    () => input.keys.delete("Space"),
  );
  attachButtonAction(invBtn, handlers.onInventoryToggle);
  attachButtonAction(viewBtn, handlers.onViewToggle);
  attachButtonAction(pauseBtn, handlers.onPause);

  // --------------------------------------------------
  // タッチトラッキング: ジョイスティック / look を別 ID で
  // --------------------------------------------------

  let joyTouchId: number | null = null;
  let joyCenterX = 0;
  let joyCenterY = 0;

  interface LookState {
    id: number;
    lastX: number;
    lastY: number;
    startX: number;
    startY: number;
    startT: number;
    moved: boolean;
    longPressFired: boolean;
    longPressTimer: ReturnType<typeof setTimeout> | null;
  }
  let look: LookState | null = null;

  function isInJoyZone(clientX: number, clientY: number): boolean {
    // 画面左 JOY_ZONE_WIDTH_RATIO 内、かつ下半分（ボタンを避ける）
    return (
      clientX < window.innerWidth * JOY_ZONE_WIDTH_RATIO &&
      clientY > window.innerHeight * 0.35
    );
  }

  function updateJoyVisual(centerX: number, centerY: number, nx: number, ny: number): void {
    joyBase.style.display = "block";
    joyBase.style.left = `${centerX}px`;
    joyBase.style.top = `${centerY}px`;
    joyKnob.style.display = "block";
    joyKnob.style.left = `${centerX + nx * JOY_RADIUS}px`;
    joyKnob.style.top = `${centerY + ny * JOY_RADIUS}px`;
  }

  function hideJoyVisual(): void {
    joyBase.style.display = "none";
    joyKnob.style.display = "none";
  }

  function onTouchStart(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      // 操作対象はキャンバス上のタッチのみ。
      // ボタン・ホットバー等の UI 要素タッチは個別ハンドラに任せる
      if (t.target !== canvasEl) continue;

      if (joyTouchId === null && isInJoyZone(t.clientX, t.clientY)) {
        joyTouchId = t.identifier;
        joyCenterX = t.clientX;
        joyCenterY = t.clientY;
        updateJoyVisual(joyCenterX, joyCenterY, 0, 0);
        e.preventDefault();
        continue;
      }

      if (look === null) {
        look = {
          id: t.identifier,
          lastX: t.clientX,
          lastY: t.clientY,
          startX: t.clientX,
          startY: t.clientY,
          startT: performance.now(),
          moved: false,
          longPressFired: false,
          longPressTimer: null,
        };
        const ref = look;
        ref.longPressTimer = setTimeout(() => {
          ref.longPressTimer = null;
          if (look === ref && !ref.moved) {
            ref.longPressFired = true;
            handlers.onLongPressBreak();
          }
        }, LONG_PRESS_MS);
        e.preventDefault();
      }
    }
  }

  function onTouchMove(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === joyTouchId) {
        const dx = t.clientX - joyCenterX;
        const dy = t.clientY - joyCenterY;
        const len = Math.hypot(dx, dy);
        const factor = len > JOY_RADIUS ? JOY_RADIUS / len : 1;
        const nx = (dx * factor) / JOY_RADIUS;
        const ny = (dy * factor) / JOY_RADIUS;
        input.joystickX = nx;
        input.joystickY = ny;
        updateJoyVisual(joyCenterX, joyCenterY, nx, ny);
        e.preventDefault();
      } else if (look !== null && t.identifier === look.id) {
        const dx = t.clientX - look.lastX;
        const dy = t.clientY - look.lastY;
        // look-drag をマウスデルタに合算（既存ロジックがそのまま使える）
        input.mouseDX += dx;
        input.mouseDY += dy;
        look.lastX = t.clientX;
        look.lastY = t.clientY;
        if (!look.moved) {
          const total = Math.hypot(t.clientX - look.startX, t.clientY - look.startY);
          if (total > MOVE_THRESHOLD_PX) {
            look.moved = true;
            if (look.longPressTimer !== null) {
              clearTimeout(look.longPressTimer);
              look.longPressTimer = null;
            }
          }
        }
        e.preventDefault();
      }
    }
  }

  function endTouch(t: Touch): void {
    if (t.identifier === joyTouchId) {
      joyTouchId = null;
      input.joystickX = 0;
      input.joystickY = 0;
      hideJoyVisual();
      return;
    }
    if (look !== null && t.identifier === look.id) {
      if (look.longPressTimer !== null) {
        clearTimeout(look.longPressTimer);
      }
      const dt = performance.now() - look.startT;
      const wasTap =
        !look.moved && !look.longPressFired && dt < TAP_MAX_MS;
      look = null;
      if (wasTap) handlers.onTapPlace();
    }
  }

  function onTouchEnd(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) endTouch(t);
  }

  // ⚠️ document/window に passive:false の touchstart を貼ると iOS WebKit が
  // 配下要素（タイトル画面の <button> 等）の click 合成を抑制してしまうので、
  // 必ず canvas 上だけに貼る
  canvasEl.addEventListener("touchstart", onTouchStart, { passive: false });
  canvasEl.addEventListener("touchmove", onTouchMove, { passive: false });
  canvasEl.addEventListener("touchend", onTouchEnd, { passive: false });
  canvasEl.addEventListener("touchcancel", onTouchEnd, { passive: false });

  return {
    rootEl: root,
    dispose: () => {
      canvasEl.removeEventListener("touchstart", onTouchStart);
      canvasEl.removeEventListener("touchmove", onTouchMove);
      canvasEl.removeEventListener("touchend", onTouchEnd);
      canvasEl.removeEventListener("touchcancel", onTouchEnd);
      root.remove();
    },
  };
}

export function isTouchDevice(): boolean {
  return (
    typeof window !== "undefined" &&
    ("ontouchstart" in window || (navigator?.maxTouchPoints ?? 0) > 0)
  );
}
