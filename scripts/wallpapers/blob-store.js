/**
 * WallpaperBlobStore — persistent storage for user-uploaded wallpaper files.
 *
 * Uploaded videos are handed to the video element as object URLs, which die
 * when the page is closed. This store keeps the raw Blob bytes in IndexedDB
 * keyed by the wallpaper id so uploads survive restarts.
 *
 * API: saveVideo(id, blob) -> Promise<void>
 *      loadVideo(id)      -> Promise<Blob | null>
 *      deleteVideo(id)    -> Promise<void>
 */

const DB_NAME = 'glass-wallpapers';
const DB_VERSION = 1;
const STORE = 'files';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

/**
 * Run a single request inside a transaction and resolve with its result.
 * Resolves on the request's own success so writes don't wait on the tx close.
 */
async function runRequest(mode, buildRequest) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(STORE, mode);
    } catch (error) {
      reject(error);
      return;
    }
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    const request = buildRequest(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveVideo(id, blob) {
  if (typeof indexedDB === 'undefined') return;
  await runRequest('readwrite', (store) => store.put(blob, id));
}

export async function loadVideo(id) {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const result = await runRequest('readonly', (store) => store.get(id));
    return result ?? null;
  } catch {
    return null;
  }
}

export async function deleteVideo(id) {
  if (typeof indexedDB === 'undefined') return;
  try {
    await runRequest('readwrite', (store) => store.delete(id));
  } catch {
    /* best-effort cleanup */
  }
}
