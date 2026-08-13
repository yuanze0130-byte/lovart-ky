import {
  sourceToFile,
  submitRunningHubTask,
  uploadFileToRunningHub,
  queryRunningHubTask,
  type RunningHubQueryResult,
} from '@/lib/runninghub';

export interface UpscaleResult {
  imageData: string;
}

export interface UpscaleTaskSubmissionResult {
  taskId: string;
  taskStatus?: string | null;
}

export class UpscaleUpstreamResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpscaleUpstreamResponseError';
  }
}

async function fetchAsDataUrl(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new UpscaleUpstreamResponseError(`Failed to fetch source image: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'image/png';
  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return `data:${contentType};base64,${base64}`;
}

async function submitUpscaleTaskWithRunningHub(
  source: string,
  scale: number,
  signal?: AbortSignal,
  onSubmissionStart?: () => void,
): Promise<UpscaleTaskSubmissionResult> {
  const apiKey = process.env.RUNNINGHUB_API_KEY;
  const webappId = process.env.RUNNINGHUB_UPSCALE_WEBAPP_ID;
  const inputNodeId = process.env.RUNNINGHUB_UPSCALE_INPUT_NODE_ID;
  const inputFieldName = process.env.RUNNINGHUB_UPSCALE_INPUT_FIELD_NAME || 'image';
  const scaleNodeId = process.env.RUNNINGHUB_UPSCALE_SCALE_NODE_ID;
  const scaleFieldName = process.env.RUNNINGHUB_UPSCALE_SCALE_FIELD_NAME || 'value';
  const instanceType = (process.env.RUNNINGHUB_UPSCALE_INSTANCE_TYPE as 'default' | 'plus' | undefined) || 'default';

  if (!apiKey) throw new Error('RUNNINGHUB_API_KEY is not configured');
  if (!webappId) throw new Error('RUNNINGHUB_UPSCALE_WEBAPP_ID is not configured');
  if (!inputNodeId) throw new Error('RUNNINGHUB_UPSCALE_INPUT_NODE_ID is not configured');
  if (!scaleNodeId) throw new Error('RUNNINGHUB_UPSCALE_SCALE_NODE_ID is not configured');

  const file = await sourceToFile(source, 'upscale-input.png', signal);
  const uploaded = await uploadFileToRunningHub(apiKey, file, signal);

  if (!uploaded.fileName) {
    throw new UpscaleUpstreamResponseError('RunningHub upload did not return fileName');
  }

  signal?.throwIfAborted();
  onSubmissionStart?.();
  const submitResult = await submitRunningHubTask(
    apiKey,
    webappId,
    [
      {
        nodeId: inputNodeId,
        fieldName: inputFieldName,
        fieldValue: uploaded.fileName,
      },
      {
        nodeId: scaleNodeId,
        fieldName: scaleFieldName,
        fieldValue: String(scale),
      },
    ],
    instanceType,
    signal,
  );

  if (!submitResult.taskId) {
    throw new UpscaleUpstreamResponseError('RunningHub did not return taskId');
  }

  return {
    taskId: submitResult.taskId,
    taskStatus: submitResult.taskStatus ?? null,
  };
}

export async function queryUpscaleTask(taskId: string, signal?: AbortSignal): Promise<UpscaleResult & { status: string; error?: string }> {
  const provider = process.env.UPSCALE_PROVIDER || 'stub';

  if (provider !== 'runninghub') {
    throw new Error(`UPSCALE_PROVIDER \"${provider}\" does not support async task polling`);
  }

  const apiKey = process.env.RUNNINGHUB_API_KEY;
  if (!apiKey) throw new Error('RUNNINGHUB_API_KEY is not configured');

  const result: RunningHubQueryResult = await queryRunningHubTask(apiKey, taskId, signal);

  if (result.status === 'FAILED') {
    return {
      status: result.status,
      imageData: '',
      error: result.errorMessage || result.errorCode || 'RunningHub task failed',
    };
  }

  if (result.status !== 'SUCCESS') {
    return {
      status: result.status,
      imageData: '',
    };
  }

  const output = result.results[0];
  if (!output?.fileUrl) {
    return {
      status: 'FAILED',
      imageData: '',
      error: 'RunningHub task completed but no output image was returned',
    };
  }

  return {
    status: result.status,
    imageData: output.fileUrl,
  };
}

export async function submitUpscaleTask(
  source: string,
  scale: number,
  signal?: AbortSignal,
  onSubmissionStart?: () => void,
): Promise<UpscaleTaskSubmissionResult | UpscaleResult> {
  const provider = process.env.UPSCALE_PROVIDER || 'stub';

  if (provider === 'stub') {
    const imageData = source.startsWith('data:') ? source : await fetchAsDataUrl(source, signal);
    return { imageData };
  }

  if (provider === 'runninghub') {
    return submitUpscaleTaskWithRunningHub(source, scale, signal, onSubmissionStart);
  }

  throw new Error(`UPSCALE_PROVIDER \"${provider}\" is not implemented yet`);
}
