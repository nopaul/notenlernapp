// Speichern im Browser: IndexedDB (Zustand + Antwortprotokoll), Rückfall auf localStorage.
const DB_NAME = 'notenlernapp';
const DB_VERSION = 1;
let dbPromise = null;
let useLocal = false;
const LS_STATE = 'notenlernapp.state';
const LS_LOG = 'notenlernapp.log';

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('kein IndexedDB'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('log')) db.createObjectStore('log', { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const st = t.objectStore(store);
        let result;
        Promise.resolve(fn(st)).then((r) => (result = r));
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

const reqP = (r) => new Promise((res, rej) => ((r.onsuccess = () => res(r.result)), (r.onerror = () => rej(r.error))));

function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Speicher voll oder gesperrt */
  }
}

export async function init() {
  try {
    await openDB();
  } catch {
    useLocal = true;
  }
  return !useLocal;
}

export async function loadState() {
  if (useLocal) return lsGet(LS_STATE, null);
  return tx('kv', 'readonly', (st) => reqP(st.get('state')));
}

export async function saveState(state) {
  const plain = JSON.parse(JSON.stringify(state));
  if (useLocal) return lsSet(LS_STATE, plain);
  return tx('kv', 'readwrite', (st) => st.put(plain, 'state'));
}

export async function addLog(entry) {
  if (useLocal) {
    const l = lsGet(LS_LOG, []);
    l.push(entry);
    return lsSet(LS_LOG, l);
  }
  return tx('log', 'readwrite', (st) => st.add(entry));
}

export async function allLogs() {
  if (useLocal) return lsGet(LS_LOG, []);
  return tx('log', 'readonly', (st) => reqP(st.getAll()));
}

export async function replaceAll(state, logs) {
  if (useLocal) {
    lsSet(LS_STATE, state);
    lsSet(LS_LOG, logs);
    return;
  }
  await tx('kv', 'readwrite', (st) => st.put(state, 'state'));
  await tx('log', 'readwrite', (st) => {
    st.clear();
    logs.forEach((l) => st.add(l));
  });
}

export async function clearAll() {
  if (useLocal) {
    localStorage.removeItem(LS_STATE);
    localStorage.removeItem(LS_LOG);
    return;
  }
  await tx('kv', 'readwrite', (st) => st.clear());
  await tx('log', 'readwrite', (st) => st.clear());
}

export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* nicht unterstützt */
  }
  return false;
}
