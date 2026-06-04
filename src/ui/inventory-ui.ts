// ============================================================
// インベントリ UI（ホットバー、3×9 インベントリグリッド、持ち物カーソル）
// ============================================================

import {
  HOTBAR_SLOTS,
  TOTAL_SLOTS,
  type InventoryState,
  type ItemStack,
} from "../game/item";
import { type BlockId, blockColor } from "../world/block";

const SLOT_CSS_BASE =
  "width:60px;height:60px;display:flex;flex-direction:column;justify-content:space-between;padding:4px;box-sizing:border-box;color:white;font-family:sans-serif;font-size:11px;text-shadow:1px 1px 0 black;border-radius:4px;cursor:default;";

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
  onSlotClick: (index: number) => void;
}

export function createInventoryUi(opts: CreateInventoryUiOptions): InventoryUi {
  const { blockNames, onSlotClick } = opts;

  // ホットバー（画面下中央）
  const hotbarEl = document.createElement("div");
  hotbarEl.style.cssText =
    "position:absolute;bottom:20px;left:50%;transform:translateX(-50%);display:flex;gap:6px;pointer-events:none;";
  document.body.appendChild(hotbarEl);

  // インベントリ（3×9 グリッド、初期は非表示）
  const inventoryEl = document.createElement("div");
  inventoryEl.style.cssText =
    "position:absolute;bottom:100px;left:50%;transform:translateX(-50%);display:none;grid-template-columns:repeat(9,60px);gap:6px;pointer-events:none;background:rgba(0,0,0,0.5);padding:10px;border-radius:8px;";
  document.body.appendChild(inventoryEl);

  // カーソル追従の持ち物
  const heldItemEl = document.createElement("div");
  heldItemEl.style.cssText =
    "position:absolute;width:44px;height:44px;border-radius:4px;display:none;pointer-events:none;z-index:1000;transform:translate(-50%,-50%);box-shadow:0 2px 6px rgba(0,0,0,0.6);";
  document.body.appendChild(heldItemEl);

  // スロット要素生成
  const slotEls: HTMLDivElement[] = [];
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const el = document.createElement("div");
    el.style.cssText = SLOT_CSS_BASE;
    el.addEventListener("click", () => onSlotClick(i));
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
        const [r, g, b] = blockColor(stack.block);
        el.style.background = `rgb(${r},${g},${b})`;
        const countText =
          stack.count > 1
            ? `<div style="text-align:right;font-weight:bold;font-size:13px;">${stack.count}</div>`
            : `<div></div>`;
        el.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;font-weight:bold;font-size:11px;">
            <span>${slotLabel}</span>
          </div>
          <div style="text-align:center;font-size:9px;line-height:1.1;">${blockNames[stack.block]}</div>
          ${countText}
        `;
      } else {
        el.style.background = "rgba(0,0,0,0.3)";
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
      const [r, g, b] = blockColor(stack.block);
      heldItemEl.style.background = `rgb(${r},${g},${b})`;
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
    inventoryEl.style.display = open ? "grid" : "none";
  }

  function setInteractive(enabled: boolean) {
    const ev = enabled ? "auto" : "none";
    hotbarEl.style.pointerEvents = ev;
    inventoryEl.style.pointerEvents = ev;
  }

  function setHeldPosition(x: number, y: number) {
    heldItemEl.style.left = x + "px";
    heldItemEl.style.top = y + "px";
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
