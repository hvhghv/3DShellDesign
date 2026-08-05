import type { ProjectSnapshot, StepPreview } from "../domain/model";

const DATABASE_NAME = "3dshell-designer";
const DATABASE_VERSION = 1;
const STORE_NAME = "projects";
const CURRENT_PROJECT_ID = "current";

export interface CachedProjectRecord {
  id: typeof CURRENT_PROJECT_ID;
  snapshot: ProjectSnapshot;
  stepPreview: StepPreview | null;
  pcbPreviews?: Record<string, StepPreview>;
  customComponentPreviews?: Record<string, StepPreview>;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开项目缓存"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("项目缓存操作失败"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("项目缓存事务已中止"));
    transaction.onerror = () => reject(transaction.error ?? new Error("项目缓存事务失败"));
  });
}

export async function readProjectCache(): Promise<CachedProjectRecord | null> {
  const database = await openDatabase();
  if (!database) return null;
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const record = await requestResult(
      transaction.objectStore(STORE_NAME).get(CURRENT_PROJECT_ID),
    );
    return (record as CachedProjectRecord | undefined) ?? null;
  } finally {
    database.close();
  }
}

async function writeProjectCache(record: CachedProjectRecord): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completion = transactionComplete(transaction);
    const write = requestResult(transaction.objectStore(STORE_NAME).put(record));
    await Promise.all([write, completion]);
  } finally {
    database.close();
  }
}

let pendingRecord: CachedProjectRecord | null = null;
let pendingWaiters: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];
let draining = false;

async function drainProjectCache(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (pendingRecord) {
      const record = pendingRecord;
      const waiters = pendingWaiters;
      pendingRecord = null;
      pendingWaiters = [];
      try {
        await writeProjectCache(record);
        waiters.forEach(({ resolve }) => resolve());
      } catch (error) {
        waiters.forEach(({ reject }) => reject(error));
      }
    }
  } finally {
    draining = false;
    if (pendingRecord) void drainProjectCache();
  }
}

export function queueProjectCache(
  snapshot: ProjectSnapshot,
  stepPreview: StepPreview | null,
  pcbPreviews: Record<string, StepPreview> = {},
  customComponentPreviews: Record<string, StepPreview> = {},
): Promise<void> {
  pendingRecord = {
    id: CURRENT_PROJECT_ID,
    snapshot,
    stepPreview,
    pcbPreviews,
    customComponentPreviews,
  };
  const completion = new Promise<void>((resolve, reject) => {
    pendingWaiters.push({ resolve, reject });
  });
  void drainProjectCache();
  return completion;
}
