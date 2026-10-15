// IndexedDB persistence: one save slot plus a photo store. Every call tolerates
// unavailable storage (private windows, previews) and resolves to a safe default.
const DB_NAME = 'longwayround';
const VERSION = 1;

let dbp: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('save')) db.createObjectStore('save');
        if (!db.objectStoreNames.contains('photos')) {
          const st = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
          st.createIndex('seed', 'seed');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const t = db.transaction(store, mode);
          const s = t.objectStore(store);
          const r = fn(s);
          t.oncomplete = () => resolve(r ? (r.result as T) : null);
          t.onerror = () => resolve(null);
          t.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export const db = {
  get<T>(store: string, key: IDBValidKey) {
    return tx<T>(store, 'readonly', (s) => s.get(key));
  },
  put(store: string, value: unknown, key?: IDBValidKey) {
    return tx<IDBValidKey>(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key)));
  },
  del(store: string, key: IDBValidKey) {
    return tx<undefined>(store, 'readwrite', (s) => s.delete(key));
  },
  all<T>(store: string) {
    return tx<T[]>(store, 'readonly', (s) => s.getAll());
  },
  clear(store: string) {
    return tx<undefined>(store, 'readwrite', (s) => s.clear());
  },
};
