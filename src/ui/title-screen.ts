import {
  createWorld,
  deleteWorld,
  listWorlds,
  touchWorld,
  type WorldRecord,
} from "../storage/worlds";

// ============================================================
// タイトル画面: ワールド名簿から選ぶ or 新しく作る
// 解決値: { worldId, seed, name }
// ============================================================

export interface TitleSelection {
  worldId: string;
  seed: number;
  name: string;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c] as string,
  );
}

// click のみ。touch-controls が canvas にしかリスナーを貼ってないので
// iOS でも click 合成が走る（document に passive:false があると壊れる現象は回避済み）
function attachTap(el: HTMLElement, action: () => void | Promise<void>): void {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void action();
  });
}

function formatRelative(ts: number): string {
  const sec = Math.max(0, (Date.now() - ts) / 1000);
  if (sec < 60) return "今";
  if (sec < 3600) return `${Math.floor(sec / 60)}分前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}時間前`;
  return `${Math.floor(sec / 86400)}日前`;
}

const ROOT_CSS =
  "position:fixed;inset:0;z-index:1000;background:linear-gradient(180deg,#1a2a3a 0%,#243648 100%);color:white;font-family:sans-serif;overflow:auto;display:flex;flex-direction:column;align-items:center;padding:24px 16px;box-sizing:border-box;-webkit-user-select:none;user-select:none;";

const CARD_CSS =
  "background:rgba(0,0,0,0.35);padding:16px;border-radius:8px;width:min(440px,calc(100vw - 32px));box-sizing:border-box;margin-bottom:16px;";

const INPUT_CSS =
  "width:100%;padding:8px 10px;box-sizing:border-box;font-size:16px;border:1px solid rgba(255,255,255,0.25);background:rgba(0,0,0,0.3);color:white;border-radius:4px;";

const BTN_PRIMARY_CSS =
  "width:100%;padding:14px;font-size:16px;background:#4a7a55;color:white;border:none;border-radius:4px;font-weight:bold;cursor:pointer;touch-action:manipulation;";

export function showTitleScreen(): Promise<TitleSelection> {
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.style.cssText = ROOT_CSS;
    document.body.appendChild(root);

    const title = document.createElement("h1");
    title.textContent = "Simple Craft";
    title.style.cssText = "font-size:40px;margin:16px 0 24px;letter-spacing:2px;";
    root.appendChild(title);


    // 新規作成カード
    const formCard = document.createElement("div");
    formCard.style.cssText = CARD_CSS;
    formCard.innerHTML = `
      <h2 style="margin:0 0 12px;font-size:16px;opacity:0.85;">新しいワールドを作る</h2>
      <label style="display:block;margin-bottom:10px;font-size:13px;">
        <div style="opacity:0.75;margin-bottom:4px;">名前</div>
        <input data-role="name" type="text" style="${INPUT_CSS}">
      </label>
      <label style="display:block;margin-bottom:14px;font-size:13px;">
        <div style="opacity:0.75;margin-bottom:4px;">シード（空欄でランダム）</div>
        <input data-role="seed" type="text" inputmode="numeric" placeholder="ランダム" style="${INPUT_CSS}">
      </label>
      <button data-role="create" style="${BTN_PRIMARY_CSS}">作って始める</button>
    `;
    root.appendChild(formCard);

    const nameInput = formCard.querySelector<HTMLInputElement>(
      'input[data-role="name"]',
    )!;
    const seedInput = formCard.querySelector<HTMLInputElement>(
      'input[data-role="seed"]',
    )!;
    const createBtn = formCard.querySelector<HTMLButtonElement>(
      'button[data-role="create"]',
    )!;

    // 一覧カード
    const listCard = document.createElement("div");
    listCard.style.cssText = CARD_CSS;
    root.appendChild(listCard);

    async function refresh(): Promise<void> {
      const worlds = await listWorlds();
      // フォームのデフォルト名は既存数+1
      if (nameInput.value === "") {
        nameInput.value = `World ${worlds.length + 1}`;
      }
      listCard.innerHTML = `<h2 style="margin:0 0 12px;font-size:16px;opacity:0.85;">ワールド一覧</h2>`;
      if (worlds.length === 0) {
        const empty = document.createElement("div");
        empty.textContent = "まだワールドがありません";
        empty.style.cssText = "opacity:0.55;font-size:14px;padding:8px 0;";
        listCard.appendChild(empty);
        return;
      }
      for (const w of worlds) {
        const row = document.createElement("div");
        row.style.cssText =
          "display:flex;align-items:center;gap:8px;padding:10px;background:rgba(0,0,0,0.3);border-radius:6px;margin-bottom:6px;";
        row.innerHTML = `
          <div style="flex:1;min-width:0;">
            <div style="font-weight:bold;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(w.name)}</div>
            <div style="font-size:11px;opacity:0.55;">seed: ${w.seed} · ${formatRelative(w.lastPlayedAt)}</div>
          </div>
        `;
        const play = document.createElement("button");
        play.textContent = "▶";
        play.style.cssText =
          "padding:10px 14px;background:#4a7a55;color:white;border:none;border-radius:4px;cursor:pointer;font-size:16px;touch-action:manipulation;";
        attachTap(play, () => choose(w));
        row.appendChild(play);
        const del = document.createElement("button");
        del.textContent = "🗑";
        del.style.cssText =
          "padding:10px 12px;background:#7a4444;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;touch-action:manipulation;";
        attachTap(del, () => {
          if (confirm(`「${w.name}」を削除しますか？`)) {
            void deleteWorld(w.id).then(() => refresh());
          }
        });
        row.appendChild(del);
        listCard.appendChild(row);
      }
    }

    async function choose(w: WorldRecord): Promise<void> {
      await touchWorld(w.id);
      root.remove();
      resolve({ worldId: w.id, seed: w.seed, name: w.name });
    }

    attachTap(createBtn, async () => {
      const name = nameInput.value.trim() || "World";
      let seed: number;
      const raw = seedInput.value.trim();
      if (raw === "") {
        seed = randomSeed();
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          alert("シードは 0 以上の整数で入力してください");
          return;
        }
        seed = Math.floor(n) >>> 0;
      }
      const w = await createWorld(name, seed);
      root.remove();
      resolve({ worldId: w.id, seed: w.seed, name: w.name });
    });

    void refresh();
  });
}
