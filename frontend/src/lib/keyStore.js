// Stores this device's private key in IndexedDB. CryptoKey objects are saved as-is,
// so a non-extractable key stays non-extractable even for scripts on this page.
const DB_NAME = "smartway-e2ee";
const STORE = "keys";

const openDb = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const run = async (mode, operation) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = operation(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(request?.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

export const loadDeviceKeys = (userId) => run("readonly", (store) => store.get(String(userId)));

export const saveDeviceKeys = (userId, { privateKey, publicKey }) =>
  run("readwrite", (store) => store.put({ privateKey, publicKey }, String(userId)));

export const deleteDeviceKeys = (userId) => run("readwrite", (store) => store.delete(String(userId)));
