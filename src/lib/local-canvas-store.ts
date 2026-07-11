import type { CanvasElement } from '@/components/lovart/CanvasArea';

const DATABASE_NAME = 'lovart-local-canvas';
const DATABASE_VERSION = 1;
const STORE_NAME = 'drafts';
export const DEFAULT_LOCAL_DRAFT_ID = 'default';

export interface LocalCanvasDraft {
  id: string;
  title: string;
  elements: CanvasElement[];
  updatedAt: string;
  source: 'lovart-ky' | 'qdmy-import';
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开本地画布数据库'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = action(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('本地画布操作失败'));
      transaction.onerror = () => reject(transaction.error || new Error('本地画布事务失败'));
    });
  } finally {
    database.close();
  }
}

export async function loadLocalCanvasDraft(id = DEFAULT_LOCAL_DRAFT_ID): Promise<LocalCanvasDraft | null> {
  if (typeof indexedDB === 'undefined') return null;
  return (await withStore('readonly', (store) => store.get(id))) || null;
}

export async function saveLocalCanvasDraft(
  input: Pick<LocalCanvasDraft, 'title' | 'elements'> & Partial<Pick<LocalCanvasDraft, 'id' | 'source'>>
): Promise<LocalCanvasDraft> {
  if (typeof indexedDB === 'undefined') throw new Error('当前浏览器不支持本地画布存储');
  const draft: LocalCanvasDraft = {
    id: input.id || DEFAULT_LOCAL_DRAFT_ID,
    title: input.title,
    elements: input.elements,
    updatedAt: new Date().toISOString(),
    source: input.source || 'lovart-ky',
  };
  await withStore('readwrite', (store) => store.put(draft));
  return draft;
}

export async function removeLocalCanvasDraft(id = DEFAULT_LOCAL_DRAFT_ID): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await withStore('readwrite', (store) => store.delete(id));
}
