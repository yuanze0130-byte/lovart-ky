import type { ImageBatchRow } from './image-batch-queue';
import type { ImageModelId } from './image-models';
export interface ImageBatchRecord {
  key: string;
  generatorId: string;
  model: ImageModelId;
  resolution: '1K' | '2K' | '4K';
  priceVersion: string;
  rows: ImageBatchRow[];
  promptColumn?:number;
  outputColumn?:number;
  referenceColumn?:number;
  dependencyColumn?:number;
  tableColumns?:string[];
}
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('doodleverse-image-batches', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('batches', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readImageBatch(key: string): Promise<ImageBatchRecord | undefined> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction('batches').objectStore('batches').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
export async function saveImageBatch(record: ImageBatchRecord) {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('batches', 'readwrite');
    tx.objectStore('batches').put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || Error('批次保存中断'));
  }); } finally { db.close(); }
}
