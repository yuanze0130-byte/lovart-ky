import type { ExpectedGenerationPrice } from '@/lib/generation-contract';
import type { ImageModelId, ImageModelResolution } from '@/lib/image-models';
export type AgentImageReference = { id: string; url: string; label: string; ordinal: number; source: 'selection' | 'result' };
export type AgentImagePlan = { prompt: string; modelId: ImageModelId; resolution: ImageModelResolution; aspectRatio: StoryboardAspectRatio; count: number; onlyStep?: number };
export type AgentPage = 'home' | 'canvas' | 'projects' | 'user';

export type StoryboardAspectRatio = '9:16' | '16:9' | '4:5' | '1:1' | '4:3' | '3:4' | '21:9' | '3:2' | '2:3';
export type StoryboardVideoSize = '720x1280' | '1280x720' | '1024x1280' | '1024x1024' | '1024x1792' | '1792x1024' | '1024x768' | '768x1024' | '1536x640' | '1152x768' | '768x1152';

export type AgentMode = 'design' | 'branding' | 'image-editing' | 'research';

export type AgentChatTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type AgentContext = {
  imageReferences?: AgentImageReference[];
  referenceId?: string;
  imagePlan?: AgentImagePlan;
  executionRunId?: string;
  expectedImagePrice?: ExpectedGenerationPrice;
  expectedVideoPrice?: ExpectedGenerationPrice;
  page: AgentPage;
  projectId?: string | null;
  canvasId?: string | null;
  selectedElementId?: string | null;
  scope?: 'selection' | 'project';
  selectedElements?: Array<{ id: string; type: string; label: string }>;
  selectedStoryboardItemId?: string | null;
  storyboardCount?: number;
  storyboardItems?: Array<{
    id: string;
    order: number;
    title: string;
    sourcePrompt?: string;
    aspectRatio?: StoryboardAspectRatio;
    outputSize?: StoryboardVideoSize;
    thumbnailUrl?: string;
  }>;
  assetIds?: string[];
  selectedImage?: string | null;
  selectedObject?: {
    id?: string;
    label?: string;
    score?: number;
    bbox: { x: number; y: number; width: number; height: number };
    polygon?: { x: number; y: number }[];
    maskUrl?: string;
  } | null;
};

export type CreateStoryboardAction = {
  type: 'create_storyboard';
  prompt: string;
  shots?: number;
  aspectRatio?: StoryboardAspectRatio;
};

export type CreateStoryboardBoardAction = {
  type: 'create_storyboard_board';
};

export type GenerateImagesAction = {
  type: 'generate_images';
  prompt: string;
  count?: number;
  aspectRatio?: StoryboardAspectRatio;
  addToProject?: boolean;
};

export type CreateGridAction = {
  type: 'create_grid';
  prompt: string;
  count?: 4 | 9 | 25;
  aspectRatio?: StoryboardAspectRatio;
};

export type CreateCharacterThreeViewAction = {
  type: 'create_character_three_view';
  prompt: string;
  aspectRatio?: StoryboardAspectRatio;
};

export type GenerateStoryboardImageAction = {
  type: 'generate_storyboard_image';
  prompt?: string;
  storyboardItemId?: string;
  storyboardOrder?: number;
  aspectRatio?: StoryboardAspectRatio;
};

export type GenerateStoryboardVideoAction = {
  type: 'generate_storyboard_video';
  prompt?: string;
  storyboardItemId?: string;
  storyboardOrder?: number;
  size?: StoryboardVideoSize;
  durationSeconds?: number;
  mode?: 'standard' | 'fast';
};

export type GenerateVideoAction = {
  type: 'generate_video';
  prompt: string;
  durationSeconds?: number;
  size?: StoryboardVideoSize;
  mode?: 'standard' | 'fast';
};

export type AddToCanvasAction = {
  type: 'add_to_canvas';
  assetIds?: string[];
  target?: 'project' | 'storyboard_item' | 'canvas';
};

export type EditSelectedImageAction = {
  type: 'edit_selected_image';
  prompt: string;
  selectedElementId?: string;
  aspectRatio?: StoryboardAspectRatio;
};

export type AgentAction =
  | CreateStoryboardAction
  | CreateStoryboardBoardAction
  | GenerateImagesAction
  | CreateGridAction
  | CreateCharacterThreeViewAction
  | GenerateStoryboardImageAction
  | GenerateStoryboardVideoAction
  | GenerateVideoAction
  | AddToCanvasAction
  | EditSelectedImageAction;

export type DraftStoryboardItem = {
  id: string;
  title: string;
  sourcePrompt: string;
  order: number;
  durationSec: number;
  aspectRatio: StoryboardAspectRatio;
  outputSize: StoryboardVideoSize;
  renderProfile: 'standard' | 'high';
  createdAt: string;
};

export type DraftCanvasElement = {
  modelId?:ImageModelId;
  resolution?:ImageModelResolution;
  workflowStepId?:string;
  agentBatchId?: string;
  agentStep?: number;
  sourceImageId?: string;
  recoveryRequestId?: string;
  id: string;
  type: 'image' | 'video';
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  prompt?: string;
  title?: string;
  groupId?: string;
  layoutRole?: 'grid-item' | 'character-view';
  layoutLabel?: string;
};

export type AgentImageLayout = {
  kind: 'grid' | 'character_three_view';
  columns: number;
  rows: number;
  gap?: number;
  title?: string;
  labels?: string[];
};

export type AgentActionResult =
  | {
      kind: 'storyboard_created';
      storyboardId: string;
      count: number;
      items: DraftStoryboardItem[];
      message: string;
    }
  | {
      kind: 'storyboard_board_requested';
      count: number;
      message: string;
    }
  | {
      kind: 'images_generated';
      assetIds: string[];
      images: Array<{ assetId: string; imageData: string; prompt: string; recoveryRequestId?: string; agentStep?: number;modelId?:ImageModelId;resolution?:ImageModelResolution }>;
      incomplete?: boolean;
      count: number;
      message: string;
      layout?: AgentImageLayout;
    }
  | {
      kind: 'storyboard_image_generation_requested';
      imageData?: string;
      recoveryRequestId?: string;
      storyboardItemId: string;
      storyboardOrder: number;
      title: string;
      prompt: string;
      aspectRatio: StoryboardAspectRatio;
      resolution: '1K' | '2K' | '3K' | '4K';
      modelVariant: import('@/lib/image-models').ImageModelId;
      message: string;
    }
  | {
      kind: 'storyboard_video_generation_requested';
      taskId?: string;
      requestId?: string;
      storyboardItemId: string;
      storyboardOrder: number;
      title: string;
      prompt: string;
      size: StoryboardVideoSize;
      durationSeconds: number;
      mode: 'standard' | 'fast';
      message: string;
    }
  | {
      kind: 'video_started';
      requestId?: string;
      taskId: string;
      status?: string;
      message: string;
    }
  | {
      kind: 'canvas_update_planned';
      assetIds: string[];
      target: 'project' | 'storyboard_item' | 'canvas';
      elementDrafts: DraftCanvasElement[];
      message: string;
    }
  | {
      kind: 'image_edited';
      modelId?:ImageModelId;
      resolution?:ImageModelResolution;
      prompt?: string;
      recoveryRequestId?: string;
      assetId: string;
      imageData: string;
      message: string;
    };

export type AgentRunRequest = {
  workflowStep?: 'analyze' | 'prompt' | 'generate' | 'edit';
  imagePlan?: AgentImagePlan;
  runId?: string;
  phase?: 'preview' | 'execute';
  planDigest?: string;
  message: string;
  context: AgentContext;
  mode?: AgentMode;
  history?: AgentChatTurn[];
};

export type AgentChatResult = {
  inspectedImages?: number;
  kind: 'chat';
  reply: string;
  summary?: string;
  plan?: Record<string, unknown>;
};

export type AgentPanelResponse = {
  incomplete?: boolean;
  kind: 'chat' | 'action';
  reply: string;
  summary?: string;
  plan?: Record<string, unknown>;
  actionKind?: AgentActionResult['kind'];
  meta?: Array<{ label: string; value: string }>;
  followUps?: string[];
};

export type AgentRunResponse = {
  preview?: { steps: string[]; estimatedCredits: number; scope: string; digest: string; imagePrice?: ExpectedGenerationPrice; videoPrice?: ExpectedGenerationPrice; imagePlan?: AgentImagePlan; reference?: AgentImageReference; imageInputCount?: number; stepNumbers?: number[] };
  ok: boolean;
  action?: AgentAction;
  result?: AgentActionResult;
  chat?: AgentChatResult;
  billing?: { requestId: string; chargedCredits: number };
  error?: string;
};
