import { openDB, type DBSchema, type IDBPDatabase } from "idb";

// ============================================================
// ワールド名簿（IndexedDB）
// 今のところ保存するのは「名前 + シード + 作成日 + 最終プレイ日」だけ。
// 編集差分やプレイヤー状態は別ストアになる予定。
// ============================================================

export interface WorldRecord {
  id: string;
  name: string;
  seed: number;
  createdAt: number;
  lastPlayedAt: number;
}

interface SimpleCraftDB extends DBSchema {
  worlds: {
    key: string;
    value: WorldRecord;
    indexes: { "by-lastPlayed": number };
  };
}

const DB_NAME = "simple-craft";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SimpleCraftDB>> | null = null;

function db(): Promise<IDBPDatabase<SimpleCraftDB>> {
  if (dbPromise) return dbPromise;
  dbPromise = openDB<SimpleCraftDB>(DB_NAME, DB_VERSION, {
    upgrade(d) {
      const store = d.createObjectStore("worlds", { keyPath: "id" });
      store.createIndex("by-lastPlayed", "lastPlayedAt");
    },
  });
  return dbPromise;
}

export async function listWorlds(): Promise<WorldRecord[]> {
  const d = await db();
  const all = await d.getAll("worlds");
  return all.sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
}

// crypto.randomUUID は secure context（HTTPS or localhost）でしか使えない。
// 開発時に LAN IP 越し HTTP でアクセスすると undefined になるのでフォールバック
function randomId(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const r = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${r()}-${r()}`;
}

export async function createWorld(
  name: string,
  seed: number,
): Promise<WorldRecord> {
  const now = Date.now();
  const rec: WorldRecord = {
    id: randomId(),
    name,
    seed,
    createdAt: now,
    lastPlayedAt: now,
  };
  const d = await db();
  await d.put("worlds", rec);
  return rec;
}

export async function deleteWorld(id: string): Promise<void> {
  const d = await db();
  await d.delete("worlds", id);
}

export async function touchWorld(id: string): Promise<void> {
  const d = await db();
  const rec = await d.get("worlds", id);
  if (!rec) return;
  rec.lastPlayedAt = Date.now();
  await d.put("worlds", rec);
}
