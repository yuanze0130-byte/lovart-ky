import type { CanvasElement } from '@/components/lovart/CanvasArea';

export interface RhaiWorkflowRecord {
  id: string;
  title: string;
  elements: CanvasElement[];
  createdAt: string;
}

export const RHAI_WORKFLOW_STORAGE_KEY = 'doodleverse.rhai-workflows.v1';
const DB_NAME = 'doodleverse-canvas-tools';
const STORE_NAME = 'rhai-workflows';

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开 RHAI 工作流存储'));
  });
}

function readRecord(database: IDBDatabase, key: string) {
  return new Promise<RhaiWorkflowRecord[] | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as RhaiWorkflowRecord[] : null);
    request.onerror = () => reject(request.error || new Error('读取 RHAI 工作流失败'));
  });
}

function deleteRecord(database: IDBDatabase, key: string) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('清理旧 RHAI 工作流失败'));
    transaction.onabort = () => reject(transaction.error || new Error('清理旧 RHAI 工作流已取消'));
  });
}

function writeRecord(database: IDBDatabase, key: string, workflows: RhaiWorkflowRecord[]) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(workflows, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('保存 RHAI 工作流失败'));
    transaction.onabort = () => reject(transaction.error || new Error('保存 RHAI 工作流已取消'));
  });
}

function getStorageIdentity(userId?: string | null) {
  return userId?.trim() || 'guest';
}

export function getRhaiWorkflowStorageKey(userId?: string | null) {
  return `${RHAI_WORKFLOW_STORAGE_KEY}.${getStorageIdentity(userId)}`;
}

function loadLegacyWorkflows(targetKey: string) {
  const merged: RhaiWorkflowRecord[] = [];
  const seen = new Set<string>();
  const migratedKeys: string[] = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith('doodleverse.rhai-workflows.') || key === targetKey) continue;
      const parsed = JSON.parse(window.localStorage.getItem(key) || '[]');
      if (!Array.isArray(parsed)) continue;
      migratedKeys.push(key);
      parsed.forEach((workflow) => {
        if (!workflow?.id || seen.has(workflow.id) || !Array.isArray(workflow.elements)) return;
        seen.add(workflow.id);
        merged.push(workflow as RhaiWorkflowRecord);
      });
    }
  } catch {
    return { workflows: [] as RhaiWorkflowRecord[], migratedKeys: [] as string[] };
  }
  return { workflows: merged, migratedKeys };
}

export async function loadRhaiWorkflows(userId?: string | null) {
  if (typeof window === 'undefined' || !window.indexedDB) return [];
  const storageKey = getRhaiWorkflowStorageKey(userId);
  const database = await openDatabase();
  try {
    const stored = await readRecord(database, storageKey);
    if (stored !== null) return stored;

    // 旧版工作流没有用户隔离，只允许迁移到访客空间，避免账号之间互相看到数据。
    if (getStorageIdentity(userId) !== 'guest') {
      await writeRecord(database, storageKey, []);
      return [];
    }

    const indexedDbLegacy = await readRecord(database, RHAI_WORKFLOW_STORAGE_KEY);
    const localStorageLegacy = loadLegacyWorkflows(storageKey);
    const legacyById = new Map<string, RhaiWorkflowRecord>();
    [...(indexedDbLegacy || []), ...localStorageLegacy.workflows].forEach((workflow) => {
      if (workflow?.id && !legacyById.has(workflow.id)) legacyById.set(workflow.id, workflow);
    });
    const legacy = [...legacyById.values()];
    await writeRecord(database, storageKey, legacy);
    if (indexedDbLegacy !== null) await deleteRecord(database, RHAI_WORKFLOW_STORAGE_KEY);
    localStorageLegacy.migratedKeys.forEach((key) => window.localStorage.removeItem(key));
    return legacy;
  } finally {
    database.close();
  }
}

export async function saveRhaiWorkflows(userId: string | null | undefined, workflows: RhaiWorkflowRecord[]) {
  if (typeof window === 'undefined' || !window.indexedDB) throw new Error('当前浏览器不支持 IndexedDB');
  const database = await openDatabase();
  try {
    await writeRecord(database, getRhaiWorkflowStorageKey(userId), workflows);
  } finally {
    database.close();
  }
}

function removeInlineAsset(value: string | undefined) {
  return value && /^(?:data:|blob:)/i.test(value) ? undefined : value;
}

export function prepareRhaiWorkflowElements(elements: CanvasElement[]) {
  const nodes = elements.filter((element) => element.type !== 'connector');
  if (nodes.length === 0) return [];
  const left = Math.min(...nodes.map((node) => node.x));
  const top = Math.min(...nodes.map((node) => node.y));
  return elements.map((element): CanvasElement => ({
    ...element,
    x: element.type === 'connector' ? 0 : element.x - left,
    y: element.type === 'connector' ? 0 : element.y - top,
    content: removeInlineAsset(element.content),
    previousContent: removeInlineAsset(element.previousContent),
    inpaintMask: removeInlineAsset(element.inpaintMask),
    annotationMaskUrl: removeInlineAsset(element.annotationMaskUrl),
    recoveredDesktop: undefined,
  }));
}
