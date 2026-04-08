import {
  sourceToFile,
  submitRunningHubTask,
  uploadFileToRunningHub,
  waitForRunningHubTask,
} from '@/lib/runninghub';

export interface UpscaleResult {
  imageData: string;
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

async function upscaleWithRunningHub(source: string, scale: number): Promise<UpscaleResult> {
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

  const result = await waitForRunningHubTask(apiKey, submitResult.taskId);
  const output = result.results[0];

  if (!output?.fileUrl) {
    throw new Error('RunningHub task completed but no output image was returned');
  }

  return {
    imageData: output.fileUrl,
  };
}

export async function upscaleImage(source: string, scale: number): Promise<UpscaleResult> {
  const provider = process.env.UPSCALE_PROVIDER || 'stub';

  if (provider === 'stub') {
    const imageData = source.startsWith('data:') ? source : await fetchAsDataUrl(source);
    return { imageData };
  }

  if (provider === 'runninghub') {
    return upscaleWithRunningHub(source, scale);
  }

  throw new Error(`UPSCALE_PROVIDER \"${provider}\" is not implemented yet`);
}
