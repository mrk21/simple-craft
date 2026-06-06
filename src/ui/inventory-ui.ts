// ============================================================
// インベントリ UI（ホットバー、3×9 インベントリグリッド、持ち物カーソル）
// ============================================================

import {
  HOTBAR_SLOTS,
  TOTAL_SLOTS,
  type InventoryState,
  type ItemStack,
} from "../game/item";
import type { BlockId } from "../world/block";
import { getBlockIconUrl } from "./block-icon";

// 狭い画面（スマホ）でも 9 スロット並ぶようにレスポンシブ。
// 余白とスロット間 gap=6 を考慮: 1スロットの上限は (viewport - 24) / 9 - 6 と 60 の min
const SLOT_SIZE_CSS = "min(60px, calc((100vw - 24px) / 9 - 6px))";
const SLOT_CSS_BASE =
  `width:${SLOT_SIZE_CSS};height:${SLOT_SIZE_CSS};display:flex;flex-direction:column;justify-content:space-between;padding:4px;box-sizing:border-box;color:white;font-family:sans-serif;font-size:11px;text-shadow:1px 1px 0 black;border-radius:4px;cursor:default;image-rendering:pixelated;`;

export interface InventoryUi {
  hotbarEl: HTMLDivElement;
  inventoryEl: HTMLDivElement;
  heldItemEl: HTMLDivElement;
  setInventoryOpen(open: boolean): void;
  setInteractive(enabled: boolean): void;
  renderSlots(inv: InventoryState): void;
  renderHeld(stack: ItemStack | null): void;
  setHeldPosition(x: number, y: number): void;
}

export interface CreateInventoryUiOptions {
  blockNames: Record<BlockId, string>;
  atlasCanvas: HTMLCanvasElement;
  onSlotClick: (index: number) => void;
  // ホットバーをタップした時の選択コールバック（タッチ操作で 1〜9 キーの代わり）
  onHotbarSelect?: (index: number) => void;
}

const SLOT_ICON_SIZE = 48;
const HELD_ICON_SIZE = 44;

export function createInventoryUi(opts: CreateInventoryUiOptions): InventoryUi {
  const { blockNames, atlasCanvas, onSlotClick, onHotbarSelect } = opts;

  // ホットバー（画面下中央）。タッチでスロット選択できるよう常時 pointer-events:auto
  // safe-area-inset-bottom で iPhone ホームインジケータと衝突しないように
  const hotbarEl = document.createElement("div");
  hotbarEl.style.cssText =
    "position:absolute;bottom:calc(20px + env(safe-area-inset-bottom, 0px));left:50%;transform:translateX(-50%);display:flex;gap:6px;pointer-events:auto;z-index:10;";
  document.body.appendChild(hotbarEl);

  // インベントリ（3×9 グリッド、初期は非表示）
  const inventoryEl = document.createElement("div");
  inventoryEl.style.cssText =
    `position:absolute;bottom:calc(100px + env(safe-area-inset-bottom, 0px));left:50%;transform:translateX(-50%);display:none;grid-template-columns:repeat(9,${SLOT_SIZE_CSS});gap:6px;pointer-events:none;background:rgba(0,0,0,0.5);padding:10px;border-radius:8px;z-index:11;`;
  document.body.appendChild(inventoryEl);

  // カーソル追従の持ち物
  const heldItemEl = document.createElement("div");
  heldItemEl.style.cssText =
    "position:absolute;width:44px;height:44px;border-radius:4px;display:none;pointer-events:none;z-index:1000;transform:translate(-50%,-50%);box-shadow:0 2px 6px rgba(0,0,0,0.6);";
  document.body.appendChild(heldItemEl);

  // スロット要素生成
  // インベントリ閉じてる時は、ホットバーのスロットタップで選択変更（=数字キーと同等）
  // タッチイベントは touch-controls の document リスナーまで伝播させない
  let currentlyOpen = false;
  const slotEls: HTMLDivElement[] = [];
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const el = document.createElement("div");
    el.style.cssText = SLOT_CSS_BASE;
    el.addEventListener("click", () => {
      if (currentlyOpen) {
        onSlotClick(i);
      } else if (i < HOTBAR_SLOTS && onHotbarSelect) {
        onHotbarSelect(i);
      }
    });
    el.addEventListener(
      "touchstart",
      (e) => {
        // 視点ドラッグ・タップ=設置と混ざらないように
        e.stopPropagation();
      },
      { passive: true },
    );
    slotEls.push(el);
    if (i < HOTBAR_SLOTS) hotbarEl.appendChild(el);
    else inventoryEl.appendChild(el);
  }

  function renderSlots(inv: InventoryState) {
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const el = slotEls[i];
      const stack = inv.slots[i];
      const slotLabel = i < HOTBAR_SLOTS ? i + 1 : "";
      if (stack !== null) {
        const iconUrl = getBlockIconUrl(atlasCanvas, stack.block, SLOT_ICON_SIZE);
        // 背景: 半透明の枠 + 中央にブロックアイコン
        el.style.background = `rgba(0,0,0,0.35) url(${iconUrl}) center/${SLOT_ICON_SIZE}px ${SLOT_ICON_SIZE}px no-repeat`;
        el.title = blockNames[stack.block];
        const countText =
          stack.count > 1
            ? `<div style="text-align:right;font-weight:bold;font-size:13px;">${stack.count}</div>`
            : `<div></div>`;
        el.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;font-weight:bold;font-size:11px;">
            <span>${slotLabel}</span>
          </div>
          <div></div>
          ${countText}
        `;
      } else {
        el.style.background = "rgba(0,0,0,0.3)";
        el.title = "";
        el.innerHTML = `<div style="font-weight:bold;color:rgba(255,255,255,0.35);">${slotLabel}</div>`;
      }
      if (i < HOTBAR_SLOTS) {
        const sel = i === inv.selectedHotbarIndex;
        el.style.border = sel
          ? "3px solid white"
          : "3px solid rgba(0,0,0,0.6)";
        el.style.transform = sel ? "translateY(-4px)" : "none";
      } else {
        el.style.border = "3px solid rgba(0,0,0,0.6)";
        el.style.transform = "none";
      }
    }
  }

  function renderHeld(stack: ItemStack | null) {
    if (stack !== null) {
      const iconUrl = getBlockIconUrl(atlasCanvas, stack.block, HELD_ICON_SIZE);
      heldItemEl.style.background = `url(${iconUrl}) center/${HELD_ICON_SIZE}px ${HELD_ICON_SIZE}px no-repeat`;
      heldItemEl.innerHTML =
        stack.count > 1
          ? `<div style="position:absolute;bottom:2px;right:4px;color:white;text-shadow:1px 1px 0 black;font-weight:bold;font-family:sans-serif;font-size:13px;">${stack.count}</div>`
          : "";
      heldItemEl.style.display = "block";
    } else {
      heldItemEl.style.display = "none";
    }
  }

  function setInventoryOpen(open: boolean) {
    currentlyOpen = open;
    inventoryEl.style.display = open ? "grid" : "none";
  }

  function setInteractive(enabled: boolean) {
    // ホットバーは常時タップ可（タッチ操作の選択用）。
    // インベントリ部分だけ開いてる時のみ操作を受け付ける
    inventoryEl.style.pointerEvents = enabled ? "auto" : "none";
  }

  function setHeldPosition(x: number, y: number) {
    heldItemEl.style.left = `${x}px`;
    heldItemEl.style.top = `${y}px`;
  }

  return {
    hotbarEl,
    inventoryEl,
    heldItemEl,
    setInventoryOpen,
    setInteractive,
    renderSlots,
    renderHeld,
    setHeldPosition,
  };
}
