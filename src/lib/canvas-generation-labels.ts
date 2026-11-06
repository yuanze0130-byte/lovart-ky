import type { GenerationMetadata } from '@/components/lovart/CanvasArea';
import { getImageModelDefinition } from '@/lib/image-models';

export function getProviderLabel(metadata?: GenerationMetadata) {
    if (!metadata) return undefined;
    const provider = metadata.provider === 'official'
        ? '官方'
        : metadata.provider === 'proxy'
            ? '中转'
            : undefined;
    const providerMode = metadata.providerMode === 'official'
        ? '官方路由'
        : metadata.providerMode === 'proxy'
            ? '中转路由'
            : metadata.providerMode === 'auto'
                ? '自动路由'
                : undefined;

    if (metadata.providerFallbackUsed) {
        const fromLabel = metadata.fallbackFrom === 'official'
            ? '官方'
            : metadata.fallbackFrom === 'proxy'
                ? '中转'
                : undefined;
        return fromLabel ? `${providerMode || provider || '自动路由'} · 从${fromLabel}回退` : `${providerMode || provider || '自动路由'} · 已回退`;
    }

    return providerMode || provider;
}

export function getModelLabel(metadata?: GenerationMetadata) {
    if (!metadata?.model) return undefined;
    return metadata.model;
}

export function getOfficialOptionChips(metadata?: GenerationMetadata) {
    if (!metadata?.modelVariant || getImageModelDefinition(metadata.modelVariant).transport !== 'official-image-task') {
        return [] as string[];
    }

    const chips: string[] = [];

    if (metadata.officialQuality) {
        const qualityLabel = metadata.officialQuality === 'high'
            ? '高质量'
            : metadata.officialQuality === 'medium'
                ? '中质量'
                : metadata.officialQuality === 'low'
                    ? '低质量'
                    : '自动质量';
        chips.push(qualityLabel);
    }

    if (metadata.officialBackground) {
        const backgroundLabel = metadata.officialBackground === 'transparent'
            ? '透明背景'
            : metadata.officialBackground === 'opaque'
                ? '实色背景'
                : '自动背景';
        chips.push(backgroundLabel);
    }

    if (metadata.officialOutputFormat) {
        const formatLabel = metadata.officialOutputFormat.toUpperCase();
        chips.push(formatLabel);
    }

    if (metadata.officialModeration) {
        chips.push(metadata.officialModeration === 'low' ? '低审查' : '自动审查');
    }

    return chips;
}

export function getTaskDebugChips(metadata?: GenerationMetadata) {
    if (!metadata?.taskId) return [] as string[];

    const chips: string[] = [];

    if (metadata.proxyTarget) {
        chips.push(metadata.proxyTarget === 'fallback' ? '备用通道' : '主通道');
    }

    if (typeof metadata.taskPollAttemptCount === 'number') {
        chips.push(`轮询 ${metadata.taskPollAttemptCount} 次`);
    }

    if (typeof metadata.taskDurationMs === 'number') {
        chips.push(`耗时 ${(metadata.taskDurationMs / 1000).toFixed(metadata.taskDurationMs >= 10000 ? 0 : 1)}s`);
    }

    return chips;
}

export function getTaskDebugSummary(metadata?: GenerationMetadata) {
    if (!metadata?.taskId) return undefined;

    const parts: string[] = [`Task ${metadata.taskId}`];

    if (metadata.taskStatus) {
        parts.push(`状态 ${metadata.taskStatus}`);
    }

    if (typeof metadata.taskPollIntervalMs === 'number') {
        parts.push(`间隔 ${metadata.taskPollIntervalMs}ms`);
    }

    if (typeof metadata.taskPollTimeoutMs === 'number') {
        parts.push(`超时 ${Math.round(metadata.taskPollTimeoutMs / 1000)}s`);
    }

    return parts.join(' · ');
}

