const RUNNINGHUB_API_HOST = process.env.RUNNINGHUB_API_HOST || 'https://www.runninghub.cn';

export type RunningHubTaskStatus = 'QUEUED' | 'RUNNING' | 'FAILED' | 'SUCCESS';

export interface RunningHubNodeInfo {
  nodeId: string;
  fieldName: string;
  fieldValue: string;
}

export interface RunningHubUploadData {
  fileName: string;
  fileType?: string;
  downloadUrl?: string;
  size?: string;
}

export interface RunningHubSubmitResult {
  taskId: string;
  taskStatus?: RunningHubTaskStatus | null;
}

export interface RunningHubTaskOutput {
  fileUrl: string;
  fileType?: string;
  downloadUrl?: string;
}

export interface RunningHubQueryResult {
  taskId: string;
  status: RunningHubTaskStatus;
  errorCode: string | null;
  errorMessage: string | null;
  results: RunningHubTaskOutput[];
}

interface RunningHubApiEnvelope<T = unknown> {
  code?: number;
  msg?: string;
  message?: string;
  data?: T;
}

interface RunningHubUploadApiData {
  fileName?: string;
  type?: string;
  download_url?: string;
  size?: string;
}

interface RunningHubSubmitApiData {
  taskId?: string | number;
  taskStatus?: string;
}

interface RunningHubQueryApiData {
  taskId?: string | number;
  status?: string;
  errorCode?: string | number | null;
  errorMessage?: string | null;
  results?: unknown[];
}

interface RunningHubRawTaskOutput {
  fileUrl?: string;
  url?: string;
  download_url?: string;
  fileType?: string;
  outputType?: string;
  type?: string;
}

function buildAuthHeaders(apiKey: string, extraHeaders: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${apiKey}`,
    ...extraHeaders,
  };
}

function normalizeTaskStatus(status: unknown): RunningHubTaskStatus {
  switch (String(status || '').toUpperCase()) {
    case 'SUCCESS':
      return 'SUCCESS';
    case 'FAILED':
      return 'FAILED';
    case 'RUNNING':
      return 'RUNNING';
    case 'QUEUED':
    case 'PENDING':
    default:
      return 'QUEUED';
  }
}

function normalizeTaskOutput(item: RunningHubRawTaskOutput): RunningHubTaskOutput {
  return {
    fileUrl: item.fileUrl || item.url || item.download_url || '',
    fileType: item.fileType || item.outputType || item.type || undefined,
    downloadUrl: item.download_url || item.fileUrl || item.url || undefined,
  };
}

function normalizeTaskOutputs(items: unknown[] | null | undefined): RunningHubTaskOutput[] {
  return Array.isArray(items)
    ? items
        .map((item) => normalizeTaskOutput((item || {}) as RunningHubRawTaskOutput))
        .filter((item) => item.fileUrl)
    : [];
}

async function handleJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export async function sourceToFile(source: string, filename = 'input.png'): Promise<File> {
  if (source.startsWith('data:')) {
    const match = source.match(/^data:(.*?);base64,(.*)$/);
    if (!match) throw new Error('Invalid data URL');
    const mimeType = match[1] || 'image/png';
    const base64 = match[2];
    const buffer = Buffer.from(base64, 'base64');
    return new File([buffer], filename, { type: mimeType });
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Failed to fetch source image: ${response.status}`);
  }

  const blob = await response.blob();
  const contentType = blob.type || 'image/png';
  const inferredExt = contentType.split('/')[1] || 'png';
  return new File([blob], filename.includes('.') ? filename : `${filename}.${inferredExt}`, {
    type: contentType,
  });
}

export async function uploadFileToRunningHub(apiKey: string, file: File): Promise<RunningHubUploadData> {
  const url = `${RUNNINGHUB_API_HOST}/openapi/v2/media/upload/binary`;
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(url, {
    method: 'POST',
    headers: buildAuthHeaders(apiKey),
    body: formData,
  });

  const json = await handleJsonResponse<RunningHubApiEnvelope<RunningHubUploadApiData>>(response);
  if (json.code !== 0) {
    throw new Error(json.message || json.msg || 'RunningHub upload failed');
  }

  return {
    fileName: json.data?.fileName || '',
    fileType: json.data?.type || file.type || undefined,
    downloadUrl: json.data?.download_url || undefined,
    size: json.data?.size || undefined,
  };
}

export async function submitRunningHubTask(
  apiKey: string,
  webappId: string,
  nodeInfoList: RunningHubNodeInfo[],
  instanceType?: 'default' | 'plus'
): Promise<RunningHubSubmitResult> {
  const url = `${RUNNINGHUB_API_HOST}/task/openapi/ai-app/run`;
  const payload = {
    webappId,
    apiKey,
    nodeInfoList,
    ...(instanceType ? { instanceType } : {}),
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(apiKey),
    },
    body: JSON.stringify(payload),
  });

  const json = await handleJsonResponse<RunningHubApiEnvelope<RunningHubSubmitApiData>>(response);
  if (json.code !== 0) {
    throw new Error(json.msg || json.message || 'RunningHub submission failed');
  }

  return {
    taskId: String(json.data?.taskId || ''),
    taskStatus: json.data?.taskStatus ? normalizeTaskStatus(json.data.taskStatus) : null,
  };
}

export async function queryRunningHubTask(apiKey: string, taskId: string): Promise<RunningHubQueryResult> {
  const url = `${RUNNINGHUB_API_HOST}/openapi/v2/query`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(apiKey),
    },
    body: JSON.stringify({ taskId }),
  });

  const json = await handleJsonResponse<RunningHubApiEnvelope<RunningHubQueryApiData> | RunningHubQueryApiData>(response);
  const body = ('data' in json ? json.data : json) as RunningHubQueryApiData | undefined;

  if (!body || !body.taskId) {
    throw new Error('Invalid RunningHub query response');
  }

  return {
    taskId: String(body.taskId),
    status: normalizeTaskStatus(body.status),
    errorCode: body.errorCode == null || body.errorCode === '' ? null : String(body.errorCode),
    errorMessage: body.errorMessage == null || body.errorMessage === '' ? null : String(body.errorMessage),
    results: normalizeTaskOutputs(body.results),
  };
}

export async function waitForRunningHubTask(
  apiKey: string,
  taskId: string,
  options?: { pollIntervalMs?: number; timeoutMs?: number }
): Promise<RunningHubQueryResult> {
  const pollIntervalMs = options?.pollIntervalMs ?? 3500;
  const timeoutMs = options?.timeoutMs ?? 180000;
  const startedAt = Date.now();

  while (true) {
    const result = await queryRunningHubTask(apiKey, taskId);

    if (result.status === 'SUCCESS') {
      return result;
    }

    if (result.status === 'FAILED') {
      throw new Error(result.errorMessage || result.errorCode || 'RunningHub task failed');
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('RunningHub task timed out');
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
