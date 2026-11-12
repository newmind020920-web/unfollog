import type { Snapshot, SnapshotMeta } from '../types'

/**
 * 스냅샷 저장소. IndexedDB 만 사용합니다 — 데이터는 이 브라우저를 떠나지 않습니다.
 * 목록 조회가 팔로워 배열 전체를 읽지 않도록 메타 스토어를 분리했습니다.
 */

const DB_NAME = 'instafloww'
const DB_VERSION = 1
const STORE_FULL = 'snapshots'
const STORE_META = 'meta'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_FULL)) db.createObjectStore(STORE_FULL, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 를 열 수 없습니다.'))
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

export function toMeta(s: Snapshot): SnapshotMeta {
  return {
    id: s.id,
    createdAt: s.createdAt,
    label: s.label,
    followerCount: s.followers.length,
    followingCount: s.following.length,
  }
}

export async function putSnapshot(snapshot: Snapshot): Promise<void> {
  await run([STORE_FULL, STORE_META], 'readwrite', ([full, meta]) => {
    full.put(snapshot)
    meta.put(toMeta(snapshot))
  })
}

export async function getSnapshot(id: string): Promise<Snapshot | undefined> {
  return await run<Snapshot>([STORE_FULL], 'readonly', ([full]) => full.get(id) as IDBRequest<Snapshot>)
}

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  const all = await run<SnapshotMeta[]>(
    [STORE_META],
    'readonly',
    ([meta]) => meta.getAll() as IDBRequest<SnapshotMeta[]>,
  )
  // 최신 순
  return (all ?? []).sort((a, b) => b.createdAt - a.createdAt)
}

export async function deleteSnapshot(id: string): Promise<void> {
  await run([STORE_FULL, STORE_META], 'readwrite', ([full, meta]) => {
    full.delete(id)
    meta.delete(id)
  })
}

export async function clearAll(): Promise<void> {
  await run([STORE_FULL, STORE_META], 'readwrite', ([full, meta]) => {
    full.clear()
    meta.clear()
  })
}

export async function renameSnapshot(id: string, label: string): Promise<void> {
  const snapshot = await getSnapshot(id)
  if (!snapshot) return
  await putSnapshot({ ...snapshot, label })
}
