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

export interface PauseOverlay {
  element: HTMLDivElement;
  setVisible(visible: boolean): void;
}

export interface PauseOverlayOptions {
  onResume: () => void;
  onReturnToTitle: () => void;
  resumeLabel?: string;
}

export function createPauseOverlay(opts: PauseOverlayOptions): PauseOverlay {
  const el = document.createElement("div");
  el.style.cssText =
    "position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(0,0,0,0.55);color:#fff;font-family:sans-serif;pointer-events:auto;z-index:60;-webkit-user-select:none;user-select:none;";

  const title = document.createElement("div");
  title.textContent = "ポーズ";
  title.style.cssText = "font-size:28px;font-weight:bold;letter-spacing:1px;margin-bottom:4px;";
  el.appendChild(title);

  const btnCss =
    "min-width:240px;padding:14px 24px;font-size:16px;font-weight:bold;color:white;border:none;border-radius:6px;cursor:pointer;font-family:inherit;";
  const resumeBtn = document.createElement("button");
  resumeBtn.textContent = opts.resumeLabel ?? "ゲームに戻る";
  resumeBtn.style.cssText = `${btnCss}background:#4a7a55;`;
  resumeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    opts.onResume();
  });
  // タッチ: touchstart で即発火（look 検出と衝突しないように stopPropagation）
  resumeBtn.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      opts.onResume();
    },
    { passive: false },
  );
  el.appendChild(resumeBtn);

  const titleBtn = document.createElement("button");
  titleBtn.textContent = "タイトルへ戻る";
  titleBtn.style.cssText = `${btnCss}background:#555;`;
  titleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    opts.onReturnToTitle();
  });
  titleBtn.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      opts.onReturnToTitle();
    },
    { passive: false },
  );
  el.appendChild(titleBtn);

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
