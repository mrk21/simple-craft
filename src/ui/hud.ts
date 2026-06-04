// ============================================================
// 画面上のオーバーレイ要素（HUD テキスト、lock overlay、クロスヘア）
// ============================================================

export interface HudTextOverlay {
  element: HTMLDivElement;
  setHTML(html: string): void;
}

export function createHudTextOverlay(): HudTextOverlay {
  const el = document.createElement("div");
  el.style.cssText =
    "position:absolute;top:10px;left:10px;background:rgba(0,0,0,0.55);color:#fff;padding:10px 12px;font-family:sans-serif;font-size:13px;line-height:1.5;pointer-events:none;border-radius:4px;";
  document.body.appendChild(el);
  return {
    element: el,
    setHTML(html) {
      el.innerHTML = html;
    },
  };
}

export interface LockOverlay {
  element: HTMLDivElement;
  setVisible(visible: boolean): void;
}

export function createLockOverlay(text: string = "Click to play"): LockOverlay {
  const el = document.createElement("div");
  el.style.cssText =
    "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);color:#fff;font-family:sans-serif;font-size:22px;pointer-events:none;";
  el.textContent = text;
  document.body.appendChild(el);
  return {
    element: el,
    setVisible(visible) {
      el.style.display = visible ? "flex" : "none";
    },
  };
}

export function createCrosshair(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText =
    "position:absolute;top:50%;left:50%;width:16px;height:16px;margin:-8px 0 0 -8px;pointer-events:none;";
  el.innerHTML = `
    <div style="position:absolute;top:7px;left:0;right:0;height:2px;background:white;mix-blend-mode:difference;"></div>
    <div style="position:absolute;left:7px;top:0;bottom:0;width:2px;background:white;mix-blend-mode:difference;"></div>
  `;
  document.body.appendChild(el);
  return el;
}
