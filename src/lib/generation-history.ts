import type { GenerationMetadata } from '@/components/lovart/CanvasArea';

const DB_NAME = 'lovart-generation-history';
const STORE_NAME = 'items';
const DB_VERSION = 1;

export interface GenerationHistoryItem {
  id: string;
  kind: 'image' | 'video';
  content: string;
  prompt?: string;
  model?: string;
  createdAt: string;
  width?: number;
  height?: number;
  favorite?: boolean;
  metadata?: GenerationMetadata;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function addGenerationHistoryItem(item: GenerationHistoryItem) {
  if (typeof indexedDB === 'undefined') return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(item);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  window.dispatchEvent(new CustomEvent('lovart-generation-history-changed'));
}

export async function listGenerationHistoryItems(limit = 200) {
  if (typeof indexedDB === 'undefined') return [] as GenerationHistoryItem[];
  const database = await openDatabase();
  const items = await new Promise<GenerationHistoryItem[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as GenerationHistoryItem[])
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit));
    request.onerror = () => reject(request.error);
  });
  database.close();
  return items;
}

export async function deleteGenerationHistoryItem(id: string) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  window.dispatchEvent(new CustomEvent('lovart-generation-history-changed'));
}

export async function setGenerationHistoryFavorite(id: string, favorite: boolean) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => {
      const item = request.result as GenerationHistoryItem | undefined;
      if (item) store.put({ ...item, favorite });
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  window.dispatchEvent(new CustomEvent('lovart-generation-history-changed'));
}
