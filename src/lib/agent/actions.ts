export type AgentPage = 'home' | 'canvas' | 'projects' | 'user';

export type StoryboardAspectRatio = '9:16' | '16:9' | '4:5' | '1:1' | '4:3' | '3:4' | '21:9' | '3:2' | '2:3';
export type StoryboardVideoSize = '720x1280' | '1280x720' | '1024x1280' | '1024x1024' | '1024x1792' | '1792x1024' | '1024x768' | '768x1024' | '1536x640' | '1152x768' | '768x1152';

export type AgentContext = {
  page: AgentPage;
  projectId?: string | null;
  canvasId?: string | null;
  selectedElementId?: string | null;
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
  id: string;
  type: 'image' | 'video';
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  prompt?: string;
  title?: string;
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
      images: Array<{ assetId: string; imageData: string; prompt: string }>;
      count: number;
      message: string;
    }
  | {
      kind: 'storyboard_image_generation_requested';
      storyboardItemId: string;
      storyboardOrder: number;
      title: string;
      prompt: string;
      aspectRatio: StoryboardAspectRatio;
      resolution: '1K' | '2K' | '4K';
      modelVariant: 'standard' | 'pro' | 'gpt-image-2';
      message: string;
    }
  | {
      kind: 'storyboard_video_generation_requested';
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
      assetId: string;
      imageData: string;
      message: string;
    };

export type AgentRunRequest = {
  message: string;
  context: AgentContext;
};

export type AgentRunResponse = {
  ok: boolean;
  action?: AgentAction;
  result?: AgentActionResult;
  error?: string;
};
