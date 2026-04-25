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

async function fetchAsDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch source image: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'image/png';
  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return `data:${contentType};base64,${base64}`;
}

async function submitUpscaleTaskWithRunningHub(source: string, scale: number): Promise<UpscaleTaskSubmissionResult> {
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

  const file = await sourceToFile(source, 'upscale-input.png');
  const uploaded = await uploadFileToRunningHub(apiKey, file);

  if (!uploaded.fileName) {
    throw new Error('RunningHub upload did not return fileName');
  }

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
    instanceType
  );

  if (!submitResult.taskId) {
    throw new Error('RunningHub did not return taskId');
  }

  return {
    taskId: submitResult.taskId,
    taskStatus: submitResult.taskStatus ?? null,
  };
}

export async function queryUpscaleTask(taskId: string): Promise<UpscaleResult & { status: string }> {
  const provider = process.env.UPSCALE_PROVIDER || 'stub';

  if (provider !== 'runninghub') {
    throw new Error(`UPSCALE_PROVIDER \"${provider}\" does not support async task polling`);
  }

  const apiKey = process.env.RUNNINGHUB_API_KEY;
  if (!apiKey) throw new Error('RUNNINGHUB_API_KEY is not configured');

  const result: RunningHubQueryResult = await queryRunningHubTask(apiKey, taskId);

  if (result.status === 'FAILED') {
    throw new Error(result.errorMessage || result.errorCode || 'RunningHub task failed');
  }

  if (result.status !== 'SUCCESS') {
    return {
      status: result.status,
      imageData: '',
    };
  }

  const output = result.results[0];
  if (!output?.fileUrl) {
    throw new Error('RunningHub task completed but no output image was returned');
  }

  return {
    status: result.status,
    imageData: output.fileUrl,
  };
}

export async function submitUpscaleTask(source: string, scale: number): Promise<UpscaleTaskSubmissionResult | UpscaleResult> {
  const provider = process.env.UPSCALE_PROVIDER || 'stub';

  if (provider === 'stub') {
    const imageData = source.startsWith('data:') ? source : await fetchAsDataUrl(source);
    return { imageData };
  }

  if (provider === 'runninghub') {
    return submitUpscaleTaskWithRunningHub(source, scale);
  }

  throw new Error(`UPSCALE_PROVIDER \"${provider}\" is not implemented yet`);
}
