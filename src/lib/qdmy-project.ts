import type { CanvasElement } from '@/components/lovart/CanvasArea';
import type { Json } from '@/lib/supabase';
import { getNodeDefaultState, getNodeTypeForQdmyImport, getQdmyExportType } from '@/lib/node-definitions';

type UnknownRecord = Record<string, unknown>;

export interface QdmyProjectView {
  zoom: number;
  centerX: number;
  centerY: number;
}

export interface QdmyImportResult {
  title: string;
  elements: CanvasElement[];
  view: QdmyProjectView;
  warnings: string[];
  stats: {
    nodes: number;
    connections: number;
    groups: number;
    skipped: number;
  };
}

export interface QdmyExportInput {
  title: string;
  elements: CanvasElement[];
  view?: Partial<QdmyProjectView>;
}

export interface QdmyMergeResult {
  elements: CanvasElement[];
  importedIds: string[];
}

const DEFAULT_VIEW: QdmyProjectView = { zoom: 1, centerX: 0, centerY: 0 };

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
}

function firstNumber(...values: unknown[]): number | undefined {
  return values.find((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function resolveRoot(input: unknown): UnknownRecord {
  const root = asRecord(input);
  for (const key of ['project', 'data', 'canvas', 'payload']) {
    const nested = root[key];
    if (isRecord(nested) && (Array.isArray(nested.nodes) || Array.isArray(nested.connections))) return nested;
  }
  return root;
}

function resolveNodePosition(node: UnknownRecord) {
  const position = asRecord(node.position);
  const style = asRecord(node.style);
  return {
    x: firstNumber(node.x, position.x, style.left) ?? 0,
    y: firstNumber(node.y, position.y, style.top) ?? 0,
    width: firstNumber(node.width, style.width),
    height: firstNumber(node.height, style.height),
  };
}

function normalizeRatio(value: unknown): CanvasElement['requestedAspectRatio'] {
  const ratio = firstString(value);
  const supported = ['auto', '4:3', '8:1', '1:1', '3:2', '1:8', '9:16', '2:3', '4:1', '16:9', '4:5', '1:4', '3:4', '5:4', '21:9'];
  return supported.includes(ratio || '') ? ratio as CanvasElement['requestedAspectRatio'] : undefined;
}

function normalizeResolution(value: unknown): CanvasElement['requestedResolution'] {
  const resolution = firstString(value)?.toUpperCase();
  return resolution === '1K' || resolution === '2K' || resolution === '4K' ? resolution : undefined;
}

function connectionEndpoints(connection: UnknownRecord) {
  return {
    from: firstString(connection.from, connection.source, connection.fromNode, connection.fromNodeId, connection.sourceNodeId),
    to: firstString(connection.to, connection.target, connection.toNode, connection.toNodeId, connection.targetNodeId),
  };
}

function groupMembership(groups: unknown[]) {
  const memberships = new Map<string, string>();
  for (const rawGroup of groups) {
    const group = asRecord(rawGroup);
    const groupId = firstString(group.id, group.groupId);
    if (!groupId) continue;
    for (const nodeId of asArray(group.nodeIds ?? group.nodes ?? group.children)) {
      if (typeof nodeId === 'string') memberships.set(nodeId, groupId);
      else if (isRecord(nodeId)) {
        const id = firstString(nodeId.id, nodeId.nodeId);
        if (id) memberships.set(id, groupId);
      }
    }
  }
  return memberships;
}

function nodeToElement(rawNode: unknown, groupId?: string): CanvasElement | null {
  const node = asRecord(rawNode);
  const id = firstString(node.id, node.nodeId);
  const desktopType = firstString(node.type, node.nodeType) || '';
  const type = getNodeTypeForQdmyImport(desktopType);
  if (!id || !type || type === 'connector') return null;
  const defaultState = getNodeDefaultState(type);

  const settings = asRecord(node.settings);
  const data = asRecord(node.data);
  const position = resolveNodePosition(node);
  const prompt = firstString(node.prompt, settings.prompt, data.prompt, node.nodePrompt);
  const content = firstString(node.content, node.url, node.filePath, node.path, data.content, data.url, settings.url);
  const nodeName = firstString(node.nodeName, node.name, node.title, data.label);
  const model = firstString(node.model, settings.model, data.model);
  const imageModelId = firstString(node.imageModelId, settings.imageModelId, model);
  const imageOutputCount = Number(node.imageOutputCount ?? settings.imageOutputCount);
  const imageExecutionMode = firstString(node.imageExecutionMode, settings.imageExecutionMode);
  const videoModelId = firstString(node.videoModelId, settings.videoModelId, type === 'video-generator' ? model : undefined);
  const videoAspectRatio = firstString(node.videoAspectRatio, settings.videoAspectRatio, settings.ratio);
  const videoDuration = firstNumber(node.videoDuration, settings.videoDuration, settings.duration);
  const videoResolution = firstString(node.videoResolution, settings.videoResolution, settings.resolution);
  const ratio = normalizeRatio(node.ratio ?? settings.ratio ?? settings.aspectRatio ?? data.ratio);
  const resolution = normalizeResolution(node.resolution ?? settings.resolution ?? data.resolution);
  const platformGroup = firstString(node.platformGroup, settings.platformGroup, data.platformGroup);
  const imageCompareSplit = firstNumber(node.imageCompareSplit, settings.imageCompareSplit);
  const imageCompareSwapped = node.imageCompareSwapped ?? settings.imageCompareSwapped;
  const inpaintBrushSize = firstNumber(node.inpaintBrushSize, settings.inpaintBrushSize);
  const inpaintFeather = firstNumber(node.inpaintFeather, settings.inpaintFeather);
  const inpaintMask = firstString(node.inpaintMask, settings.inpaintMask);
  const globalViewZoom = firstNumber(node.globalViewZoom, settings.globalViewZoom);
  const globalViewOffsetX = firstNumber(node.globalViewOffsetX, settings.globalViewOffsetX);
  const globalViewOffsetY = firstNumber(node.globalViewOffsetY, settings.globalViewOffsetY);
  const globalViewRotation = firstNumber(node.globalViewRotation, settings.globalViewRotation);
  const motionModel = firstString(node.motionModel, settings.motionModel, model);
  const motionMode = firstString(node.motionMode, settings.motionMode);
  const motionOrientation = firstString(node.motionOrientation, settings.motionOrientation);
  const tableColumns = asArray(node.tableColumns ?? settings.tableColumns).filter((value): value is string => typeof value === 'string');
  const tableRows = asArray(node.tableRows ?? settings.tableRows).map((row) => asArray(row).map((value) => String(value ?? '')));
  const videoBreakdownRows = asArray(node.videoBreakdownRows ?? settings.videoBreakdownRows).map((row) => {
    const item = asRecord(row);
    return {
      timestamp: firstString(item.timestamp) || '',
      shot: firstString(item.shot) || '',
      visual: firstString(item.visual) || '',
      camera: firstString(item.camera) || '',
      narration: firstString(item.narration) || '',
    };
  });
  const scriptScenes = asArray(node.scriptScenes ?? settings.scriptScenes).map((scene) => {
    const item = asRecord(scene);
    return {
      scene: firstString(item.scene) || '',
      location: firstString(item.location) || '',
      time: firstString(item.time) || '',
      visual: firstString(item.visual) || '',
      action: firstString(item.action) || '',
      dialogue: firstString(item.dialogue) || '',
      shot: firstString(item.shot) || '',
    };
  });

  const element: CanvasElement = {
    id,
    type,
    x: position.x,
    y: position.y,
    width: position.width ?? defaultState.width,
    height: position.height ?? defaultState.height,
    groupId: firstString(node.groupId, groupId),
    prompt,
    initialPrompt: type === 'image-generator' || type === 'video-generator' ? prompt : undefined,
    content: type === 'text'
      ? firstString(content, prompt, nodeName, desktopType === 'custom-agent' ? 'Agent 节点' : desktopType === 'gen-music' ? '音乐生成节点' : desktopType === 'gen-speech' ? '语音生成节点' : desktopType === 'storyboard-menu' ? '分镜表节点' : '文本')
      : content,
    requestedAspectRatio: ratio,
    requestedResolution: resolution,
    imageModelId: type === 'image-generator' && imageModelId ? imageModelId as CanvasElement['imageModelId'] : undefined,
    imageOutputCount: type === 'image-generator' && [1, 2, 4, 8].includes(imageOutputCount) ? imageOutputCount : undefined,
    imageExecutionMode: type === 'image-generator' && (imageExecutionMode === 'parallel' || imageExecutionMode === 'sequential')
      ? imageExecutionMode
      : undefined,
    videoModelId: type === 'video-generator' ? videoModelId : undefined,
    videoAspectRatio: type === 'video-generator' && ['auto', '4:3', '4:5', '1:1', '3:2', '9:16', '2:3', '16:9', '3:4', '21:9'].includes(videoAspectRatio || '')
      ? videoAspectRatio as CanvasElement['videoAspectRatio']
      : undefined,
    videoDuration: type === 'video-generator' ? videoDuration : undefined,
    videoResolution: type === 'video-generator' ? videoResolution : undefined,
    videoHd: type === 'video-generator' && typeof (node.videoHd ?? settings.videoHd) === 'boolean' ? Boolean(node.videoHd ?? settings.videoHd) : undefined,
    videoUseStartEndFrames: type === 'video-generator' && typeof (node.videoUseStartEndFrames ?? settings.videoUseStartEndFrames) === 'boolean' ? Boolean(node.videoUseStartEndFrames ?? settings.videoUseStartEndFrames) : undefined,
    videoAudioMode: type === 'video-generator' && ['none', 'auto', 'custom'].includes(firstString(node.videoAudioMode, settings.videoAudioMode) || '') ? firstString(node.videoAudioMode, settings.videoAudioMode) as CanvasElement['videoAudioMode'] : undefined,
    videoGenerateAudio: type === 'video-generator' && typeof (node.videoGenerateAudio ?? settings.videoGenerateAudio) === 'boolean' ? Boolean(node.videoGenerateAudio ?? settings.videoGenerateAudio) : undefined,
    videoMultiShot: type === 'video-generator' && typeof (node.videoMultiShot ?? settings.videoMultiShot) === 'boolean' ? Boolean(node.videoMultiShot ?? settings.videoMultiShot) : undefined,
    videoCameraFixed: type === 'video-generator' && typeof (node.videoCameraFixed ?? settings.videoCameraFixed) === 'boolean' ? Boolean(node.videoCameraFixed ?? settings.videoCameraFixed) : undefined,
    imageCompareSplit: type === 'image-compare' ? imageCompareSplit : undefined,
    imageCompareSwapped: type === 'image-compare' && typeof imageCompareSwapped === 'boolean' ? imageCompareSwapped : undefined,
    inpaintBrushSize: type === 'inpaint' ? inpaintBrushSize : undefined,
    inpaintFeather: type === 'inpaint' ? inpaintFeather : undefined,
    inpaintMask: type === 'inpaint' ? inpaintMask : undefined,
    globalViewZoom: type === 'global-view' ? globalViewZoom : undefined,
    globalViewOffsetX: type === 'global-view' ? globalViewOffsetX : undefined,
    globalViewOffsetY: type === 'global-view' ? globalViewOffsetY : undefined,
    globalViewRotation: type === 'global-view' ? globalViewRotation : undefined,
    motionModel: type === 'motion-transfer' && (motionModel === 'kling-2.6' || motionModel === 'kling-3.0') ? motionModel : undefined,
    motionMode: type === 'motion-transfer' && (motionMode === 'std' || motionMode === 'pro' || motionMode === '4k') ? motionMode : undefined,
    motionKeepAudio: type === 'motion-transfer' && typeof (node.motionKeepAudio ?? settings.motionKeepAudio) === 'boolean'
      ? Boolean(node.motionKeepAudio ?? settings.motionKeepAudio)
      : undefined,
    motionOrientation: type === 'motion-transfer' && (motionOrientation === 'image' || motionOrientation === 'video') ? motionOrientation : undefined,
    motionWatermark: type === 'motion-transfer' && typeof (node.motionWatermark ?? settings.motionWatermark) === 'boolean'
      ? Boolean(node.motionWatermark ?? settings.motionWatermark)
      : undefined,
    tableColumns: type === 'table-editor' && tableColumns.length > 0 ? tableColumns : undefined,
    tableRows: type === 'table-editor' ? tableRows : undefined,
    tableView: type === 'table-editor' && firstString(node.tableView, settings.tableView) === 'markdown' ? 'markdown' : undefined,
    tableAutoHeight: type === 'table-editor' && typeof (node.tableAutoHeight ?? settings.tableAutoHeight) === 'boolean' ? Boolean(node.tableAutoHeight ?? settings.tableAutoHeight) : undefined,
    tableMarkdown: type === 'table-editor' ? firstString(node.tableMarkdown, settings.tableMarkdown) : undefined,
    videoFrameCount: type === 'video-frames' ? firstNumber(node.videoFrameCount, settings.videoFrameCount) : undefined,
    videoBreakdownRows: type === 'video-breakdown' ? videoBreakdownRows : undefined,
    videoBreakdownSummary: type === 'video-breakdown' ? firstString(node.videoBreakdownSummary, settings.videoBreakdownSummary) : undefined,
    scriptGenre: type === 'script-writer' ? firstString(node.scriptGenre, settings.scriptGenre) : undefined,
    scriptDurationMinutes: type === 'script-writer' ? firstNumber(node.scriptDurationMinutes, settings.scriptDurationMinutes) : undefined,
    scriptCharacters: type === 'script-writer' ? firstString(node.scriptCharacters, settings.scriptCharacters) : undefined,
    scriptTitle: type === 'script-writer' ? firstString(node.scriptTitle, settings.scriptTitle) : undefined,
    scriptLogline: type === 'script-writer' ? firstString(node.scriptLogline, settings.scriptLogline) : undefined,
    scriptScenes: type === 'script-writer' ? scriptScenes : undefined,
    generationMetadata: model || platformGroup ? {
      model,
      desktopPlatformGroup: platformGroup,
    } : undefined,
    recoveredDesktop: asJson(node),
  };

  if (desktopType === 'group') {
    element.shapeType = 'square';
    element.color = firstString(node.color, settings.color) || '#E2E8F0';
  }
  if (desktopType === 'custom-agent') {
    element.fontSize = 16;
    element.color = '#4F46E5';
  }
  if (desktopType === 'gen-music' || desktopType === 'gen-speech') {
    element.fontSize = 15;
    element.color = '#0F766E';
  }
  return element;
}

export function importQdmyProject(input: unknown): QdmyImportResult {
  const root = resolveRoot(input);
  const nodes = asArray(root.nodes);
  const connections = asArray(root.connections);
  const groups = asArray(root.groups);
  const memberships = groupMembership(groups);
  const warnings: string[] = [];
  const elements: CanvasElement[] = [];
  let skipped = 0;

  for (const node of nodes) {
    const record = asRecord(node);
    const id = firstString(record.id, record.nodeId);
    const element = nodeToElement(node, id ? memberships.get(id) : undefined);
    if (element) elements.push(element);
    else {
      skipped += 1;
      const type = firstString(record.type, record.nodeType) || 'unknown';
      warnings.push(`未显示节点类型 ${type}，原始数据仍保留在导入文件中。`);
    }
  }

  const knownIds = new Set(elements.map((element) => element.id));
  for (const rawConnection of connections) {
    const connection = asRecord(rawConnection);
    const { from, to } = connectionEndpoints(connection);
    if (!from || !to || !knownIds.has(from) || !knownIds.has(to)) {
      warnings.push('有一条连线引用了缺失节点，已跳过。');
      continue;
    }
    elements.push({
      id: firstString(connection.id, connection.connectionId) || `connection-${from}-${to}`,
      type: 'connector',
      x: 0,
      y: 0,
      connectorFrom: from,
      connectorTo: to,
      connectorSourcePort: firstString(connection.sourcePort, connection.sourcePortId),
      connectorTargetPort: firstString(connection.targetPort, connection.targetPortId),
      connectorDataKind: firstString(connection.dataKind) as CanvasElement['connectorDataKind'],
      connectorKind: firstString(connection.kind) as CanvasElement['connectorKind'],
      connectorOrder: firstNumber(connection.order),
      connectorStyle: connection.style === 'dashed' ? 'dashed' : 'solid',
      recoveredDesktop: asJson(connection),
    });
  }

  const view = asRecord(root.view);
  return {
    title: firstString(root.title, root.name, asRecord(root.meta).title, '桥豆麻衣酱项目') || '桥豆麻衣酱项目',
    elements,
    view: {
      zoom: firstNumber(view.zoom, root.zoom) ?? DEFAULT_VIEW.zoom,
      centerX: firstNumber(view.centerX, view.x, root.centerX) ?? DEFAULT_VIEW.centerX,
      centerY: firstNumber(view.centerY, view.y, root.centerY) ?? DEFAULT_VIEW.centerY,
    },
    warnings: [...new Set(warnings)],
    stats: { nodes: nodes.length, connections: connections.length, groups: groups.length, skipped },
  };
}

export function exportQdmyProject(input: QdmyExportInput) {
  const connectors = input.elements.filter((element) => element.type === 'connector');
  const nodes = input.elements.filter((element) => element.type !== 'connector').map((element) => {
    const recovered = asRecord(element.recoveredDesktop);
    const settings = asRecord(recovered.settings);
    return {
      ...recovered,
      id: element.id,
      type: firstString(recovered.type, recovered.nodeType, getQdmyExportType(element.type)),
      nodeName: firstString(recovered.nodeName, element.storyboardTitle, element.annotationLabel),
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      content: element.content,
      prompt: firstString(element.prompt, element.initialPrompt),
      groupId: element.groupId,
      settings: {
        ...settings,
        prompt: firstString(element.prompt, element.initialPrompt),
        model: firstString(element.imageModelId, element.videoModelId, element.generationMetadata?.model, settings.model),
        imageModelId: element.imageModelId,
        imageOutputCount: element.imageOutputCount,
        imageExecutionMode: element.imageExecutionMode,
        videoModelId: element.videoModelId,
        videoAspectRatio: element.videoAspectRatio,
        videoDuration: element.videoDuration,
        videoResolution: element.videoResolution,
        videoHd: element.videoHd,
        videoUseStartEndFrames: element.videoUseStartEndFrames,
        videoAudioMode: element.videoAudioMode,
        videoGenerateAudio: element.videoGenerateAudio,
        videoMultiShot: element.videoMultiShot,
        videoCameraFixed: element.videoCameraFixed,
        imageCompareSplit: element.imageCompareSplit,
        imageCompareSwapped: element.imageCompareSwapped,
        inpaintBrushSize: element.inpaintBrushSize,
        inpaintFeather: element.inpaintFeather,
        inpaintMask: element.inpaintMask,
        globalViewZoom: element.globalViewZoom,
        globalViewOffsetX: element.globalViewOffsetX,
        globalViewOffsetY: element.globalViewOffsetY,
        globalViewRotation: element.globalViewRotation,
        motionModel: element.motionModel,
        motionMode: element.motionMode,
        motionKeepAudio: element.motionKeepAudio,
        motionOrientation: element.motionOrientation,
        motionWatermark: element.motionWatermark,
        tableColumns: element.tableColumns,
        tableRows: element.tableRows,
        tableView: element.tableView,
        tableAutoHeight: element.tableAutoHeight,
        tableMarkdown: element.tableMarkdown,
        videoFrameCount: element.videoFrameCount,
        videoBreakdownRows: element.videoBreakdownRows,
        videoBreakdownSummary: element.videoBreakdownSummary,
        scriptGenre: element.scriptGenre,
        scriptDurationMinutes: element.scriptDurationMinutes,
        scriptCharacters: element.scriptCharacters,
        scriptTitle: element.scriptTitle,
        scriptLogline: element.scriptLogline,
        scriptScenes: element.scriptScenes,
        platformGroup: firstString(element.generationMetadata?.desktopPlatformGroup, settings.platformGroup),
        ratio: element.requestedAspectRatio,
        resolution: element.requestedResolution,
      },
    };
  });

  const connections = connectors.flatMap((element) => {
    if (!element.connectorFrom || !element.connectorTo) return [];
    return [{
      ...asRecord(element.recoveredDesktop),
      id: element.id,
      from: element.connectorFrom,
      to: element.connectorTo,
      fromNodeId: element.connectorFrom,
      toNodeId: element.connectorTo,
      sourcePortId: element.connectorSourcePort,
      targetPortId: element.connectorTargetPort,
      dataKind: element.connectorDataKind,
      kind: element.connectorKind,
      order: element.connectorOrder,
      style: element.connectorStyle || 'solid',
    }];
  });

  const grouped = new Map<string, string[]>();
  for (const element of input.elements) {
    if (!element.groupId || element.type === 'connector') continue;
    grouped.set(element.groupId, [...(grouped.get(element.groupId) || []), element.id]);
  }

  return {
    version: '3.4.4-compatible',
    appName: 'tuai',
    title: input.title,
    view: { ...DEFAULT_VIEW, ...input.view },
    nodes,
    connections,
    groups: [...grouped].map(([id, nodeIds]) => ({ id, nodeIds })),
    selectedNodeId: null,
    selectedNodeIds: [],
    visibleModels: Array.from(new Set(input.elements
      .map((element) => element.imageModelId)
      .filter((model): model is NonNullable<CanvasElement['imageModelId']> => Boolean(model)))),
    availableWorkflows: [],
    exportedBy: 'lovart-ky',
    exportedAt: new Date().toISOString(),
  };
}

export function mergeQdmyElements(
  existing: CanvasElement[],
  incoming: CanvasElement[],
  offset = { x: 80, y: 80 },
): QdmyMergeResult {
  const usedIds = new Set(existing.map((element) => element.id));
  const idMap = new Map<string, string>();
  const groupMap = new Map<string, string>();

  const allocateId = (requested: string) => {
    if (!usedIds.has(requested)) {
      usedIds.add(requested);
      return requested;
    }
    let suffix = 2;
    let candidate = `${requested}-imported-${suffix}`;
    while (usedIds.has(candidate)) candidate = `${requested}-imported-${++suffix}`;
    usedIds.add(candidate);
    return candidate;
  };

  for (const element of incoming) idMap.set(element.id, allocateId(element.id));
  for (const element of incoming) {
    if (element.groupId && !groupMap.has(element.groupId)) {
      groupMap.set(element.groupId, allocateId(`group-${element.groupId}`));
    }
  }

  const imported = incoming.map((element) => ({
    ...element,
    id: idMap.get(element.id)!,
    x: element.type === 'connector' ? element.x : element.x + offset.x,
    y: element.type === 'connector' ? element.y : element.y + offset.y,
    groupId: element.groupId ? groupMap.get(element.groupId) : undefined,
    referenceImageId: element.referenceImageId ? idMap.get(element.referenceImageId) || element.referenceImageId : undefined,
    connectorFrom: element.connectorFrom ? idMap.get(element.connectorFrom) || element.connectorFrom : undefined,
    connectorTo: element.connectorTo ? idMap.get(element.connectorTo) || element.connectorTo : undefined,
    linkedElements: element.linkedElements?.map((id) => idMap.get(id) || id),
  }));

  return {
    elements: [...existing, ...imported],
    importedIds: imported.filter((element) => element.type !== 'connector').map((element) => element.id),
  };
}

export function downloadQdmyProject(input: QdmyExportInput) {
  const project = exportQdmyProject(input);
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeTitle = (input.title || 'project').replace(/[\\/:*?"<>|]+/g, '_');
  anchor.href = url;
  anchor.download = `${safeTitle}.qdmy.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
