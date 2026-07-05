/**
 * IndexedDB storage for execution screenshots and videos.
 * localStorage has a 5-10MB limit — IndexedDB supports gigabytes.
 * Key format: `${appId}::${testTitle}`
 */

const DB_NAME = 'omnitest_screenshots';
const STORE = 'screenshots';
const VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveScreenshots(appId: string, testTitle: string, screenshots: any[], videoBase64?: string): Promise<void> {
  try {
    const db = await openDB();
    const key = `${appId}::${testTitle}`;
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ screenshots, videoBase64 }, key);
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  } catch (e) {
    console.warn('Screenshot save failed:', e);
  }
}

export async function loadScreenshots(appId: string, testTitle: string): Promise<{ screenshots: any[]; videoBase64?: string } | null> {
  try {
    const db = await openDB();
    const key = `${appId}::${testTitle}`;
    const tx = db.transaction(STORE, 'readonly');
    const result = await new Promise<any>((res, rej) => {
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return result || null;
  } catch {
    return null;
  }
}

export async function loadAllScreenshotsForApp(appId: string): Promise<Record<string, { screenshots: any[]; videoBase64?: string }>> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const keys: string[] = await new Promise((res, rej) => {
      const req = store.getAllKeys();
      req.onsuccess = () => res(req.result as string[]);
      req.onerror = () => rej(req.error);
    });
    const appKeys = keys.filter(k => k.startsWith(`${appId}::`));
    const result: Record<string, any> = {};
    for (const key of appKeys) {
      const title = key.replace(`${appId}::`, '');
      const data = await new Promise<any>((res, rej) => {
        const req = store.get(key);
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      if (data) result[title] = data;
    }
    db.close();
    return result;
  } catch {
    return {};
  }
}

export async function clearScreenshotsForApp(appId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const keys: string[] = await new Promise((res, rej) => {
      const req = store.getAllKeys();
      req.onsuccess = () => res(req.result as string[]);
      req.onerror = () => rej(req.error);
    });
    const appKeys = keys.filter(k => k.startsWith(`${appId}::`));
    for (const key of appKeys) store.delete(key);
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  } catch (e) {
    console.warn('Screenshot clear failed:', e);
  }
}