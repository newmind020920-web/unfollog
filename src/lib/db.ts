import type { Snapshot, SnapshotMeta } from '../types'

/**
 * 스냅샷 저장소. IndexedDB 만 사용합니다 — 데이터는 이 브라우저를 떠나지 않습니다.
 * 목록 조회가 팔로워 배열 전체를 읽지 않도록 메타 스토어를 분리했습니다.
 *
 * 시크릿 창이나 저장이 막힌 환경에서는 IndexedDB 가 실패하므로,
 * 그때는 메모리에만 담아 두고 앱은 그대로 동작하게 합니다.
 */

const DB_NAME = 'instafloww'
const DB_VERSION = 1
const STORE_FULL = 'snapshots'
const STORE_META = 'meta'
const OPEN_TIMEOUT_MS = 4000

let dbPromise: Promise<IDBDatabase> | null = null

const memory = new Map<string, Snapshot>()
let memoryOnly = false

/** 스냅샷이 브라우저에 실제로 남는가 (false 면 창을 닫으면 사라짐) */
export function isPersistent() {
  return !memoryOnly
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    // 일부 환경에서는 open 요청이 성공도 실패도 하지 않고 멈춥니다.
    const timer = setTimeout(() => reject(new Error('IndexedDB 응답 없음')), OPEN_TIMEOUT_MS)
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (err) {
      clearTimeout(timer)
      reject(err)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_FULL)) db.createObjectStore(STORE_FULL, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: 'id' })
    }
    req.onsuccess = () => {
      clearTimeout(timer)
      resolve(req.result)
    }
    req.onerror = () => {
      clearTimeout(timer)
      reject(req.error ?? new Error('IndexedDB 를 열 수 없습니다.'))
    }
    req.onblocked = () => {
      clearTimeout(timer)
      reject(new Error('IndexedDB 가 다른 탭에 막혀 있습니다.'))
    }
  })
  return dbPromise
}

function run<T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  body: (stores: IDBObjectStore[]) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(storeNames, mode)
        const req = body(storeNames.map((n) => tx.objectStore(n)))
        let value: T | undefined
        if (req) req.onsuccess = () => { value = req.result }
        tx.oncomplete = () => resolve(value)
        tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('저장소 작업이 실패했습니다.'))
      }),
  )
}

/** IndexedDB 를 먼저 시도하고, 실패하면 그 뒤로는 메모리만 씁니다. */
async function withFallback<T>(idb: () => Promise<T>, mem: () => T): Promise<T> {
  if (memoryOnly) return mem()
  try {
    return await idb()
  } catch {
    memoryOnly = true
    return mem()
  }
}

export function toMeta(s: Snapshot): SnapshotMeta {
  return {
    id: s.id,
    createdAt: s.createdAt,
    label: s.label,
    followerCount: s.followers.length,
    followingCount: s.following.length,
    ...(s.sample ? { sample: true } : {}),
  }
}

export async function putSnapshot(snapshot: Snapshot): Promise<void> {
  await withFallback(
    async () => {
      await run([STORE_FULL, STORE_META], 'readwrite', ([full, meta]) => {
        full.put(snapshot)
        meta.put(toMeta(snapshot))
      })
    },
    () => {
      memory.set(snapshot.id, snapshot)
    },
  )
}

export async function getSnapshot(id: string): Promise<Snapshot | undefined> {
  return await withFallback(
    () => run<Snapshot>([STORE_FULL], 'readonly', ([full]) => full.get(id) as IDBRequest<Snapshot>),
    () => memory.get(id),
  )
}

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  const all = await withFallback(
    async () =>
      (await run<SnapshotMeta[]>(
        [STORE_META],
        'readonly',
        ([meta]) => meta.getAll() as IDBRequest<SnapshotMeta[]>,
      )) ?? [],
    () => Array.from(memory.values()).map(toMeta),
  )
  // 최신 순
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export async function deleteSnapshot(id: string): Promise<void> {
  await withFallback(
    async () => {
      await run([STORE_FULL, STORE_META], 'readwrite', ([full, meta]) => {
        full.delete(id)
        meta.delete(id)
      })
    },
    () => {
      memory.delete(id)
    },
  )
}

export async function clearAll(): Promise<void> {
  await withFallback(
    async () => {
      await run([STORE_FULL, STORE_META], 'readwrite', ([full, meta]) => {
        full.clear()
        meta.clear()
      })
    },
    () => {
      memory.clear()
    },
  )
}

export async function renameSnapshot(id: string, label: string): Promise<void> {
  const snapshot = await getSnapshot(id)
  if (!snapshot) return
  await putSnapshot({ ...snapshot, label })
}

/**
 * 저장된 스냅샷을 오래된 것부터 하나씩 넘겨줍니다.
 * 한 번에 하나만 메모리에 올라가므로 팔로워가 많아도 안전합니다.
 *
 * @param from 이 시각보다 먼저 만들어진 스냅샷은 건너뜁니다.
 * @param to 이 시각보다 나중에 만들어진 스냅샷은 건너뜁니다.
 * @param preloaded 이미 읽어 둔 스냅샷 — 같은 것을 두 번 읽지 않습니다.
 */
export async function eachSnapshotOldestFirst(
  fn: (snapshot: Snapshot) => void,
  { from, to, preloaded }: { from?: number; to?: number; preloaded?: Snapshot } = {},
): Promise<void> {
  const metas = (await listSnapshots()).slice().reverse()
  for (const meta of metas) {
    if (from !== undefined && meta.createdAt < from) continue
    if (to !== undefined && meta.createdAt > to) continue
    const snapshot = preloaded?.id === meta.id ? preloaded : await getSnapshot(meta.id)
    if (snapshot) fn(snapshot)
  }
}
