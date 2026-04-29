import React, { useState, useCallback } from 'react';
import {
    Paperclip, AtSign, Lightbulb, Zap, Globe, Box, ArrowUp,
    RefreshCw, MessageSquare, Clock, Share2, Layout, Maximize2, X, Bot, AlertTriangle, ShieldAlert, KeyRound, TimerReset
} from 'lucide-react';
import type { AgentMode, AgentPanelResponse } from '@/lib/agent/actions';

interface AiDesignerPanelProps {
    onGenerate: (prompt: string, options?: { mode?: AgentMode }) => Promise<AgentPanelResponse>;
    isGenerating: boolean;
    onClose?: () => void;
    initialPrompt?: string;
    initialMode?: AgentMode;
}

interface Message {
    role: 'user' | 'assistant';
    content: string;
    kind?: AgentPanelResponse['kind'];
    actionKind?: AgentPanelResponse['actionKind'];
    meta?: AgentPanelResponse['meta'];
    summary?: string;
    plan?: Record<string, unknown>;
    followUps?: string[];
    errorState?: {
        title: string;
        tone: 'warning' | 'critical';
        hint?: string;
        icon: 'warning' | 'auth' | 'config' | 'timeout';
    };
}

const actionTitleMap: Partial<Record<NonNullable<AgentPanelResponse['actionKind']>, string>> = {
    storyboard_created: '已创建分镜',
    storyboard_board_requested: '已生成制作板',
    images_generated: '已生成图片',
    storyboard_image_generation_requested: '已发起分镜出图',
    storyboard_video_generation_requested: '已发起分镜视频',
    video_started: '视频任务已启动',
    canvas_update_planned: '已更新画布',
    image_edited: '已完成图片编辑',
};

function getAgentErrorState(error: unknown): NonNullable<Message['errorState']> {
    const message = error instanceof Error ? error.message : '未知错误';
    const lower = message.toLowerCase();

    if (lower.includes('not authenticated') || lower.includes('401')) {
        return {
            title: '登录状态已失效',
            tone: 'warning',
            hint: '请先重新登录，再重试这条指令。',
            icon: 'auth',
        };
    }

    if (lower.includes('api_key') || lower.includes('not configured') || lower.includes('missing')) {
        return {
            title: 'Agent 配置不完整',
            tone: 'critical',
            hint: '后端缺少模型或密钥配置，先补齐环境变量再试。',
            icon: 'config',
        };
    }

    if (lower.includes('timeout') || lower.includes('timed out') || message.includes('超时')) {
        return {
            title: 'Agent 执行超时',
            tone: 'warning',
            hint: '通常是上游生成较慢或任务卡住，可以直接再试一次。',
            icon: 'timeout',
        };
    }

    return {
        title: 'Agent 响应失败',
        tone: 'warning',
        hint: '如果连续失败，优先检查网络、登录态和后端配置。',
        icon: 'warning',
    };
}

function renderErrorIcon(icon: NonNullable<Message['errorState']>['icon']) {
    switch (icon) {
        case 'auth':
            return <ShieldAlert size={14} />;
        case 'config':
            return <KeyRound size={14} />;
        case 'timeout':
            return <TimerReset size={14} />;
        default:
            return <AlertTriangle size={14} />;
    }
}

function getPlanMeta(plan?: Record<string, unknown>): Array<{ label: string; value: string }> {
    if (!plan) return [];

    const meta: Array<{ label: string; value: string }> = [];
    if (typeof plan.layout === 'string' && plan.layout.trim()) {
        meta.push({ label: '布局', value: plan.layout.trim() });
    }
    if (Array.isArray(plan.sections) && plan.sections.length > 0) {
        meta.push({ label: '内容块', value: `${plan.sections.length} 个` });
    }
    if (Array.isArray(plan.createTextNodes) && plan.createTextNodes.length > 0) {
        meta.push({ label: '文本节点', value: `${plan.createTextNodes.length} 个` });
    }
    if (plan.createImageGenerator === true) {
        meta.push({ label: '建议动作', value: '加入生图器' });
    }
    if (plan.createVideoGenerator === true) {
        meta.push({ label: '建议动作', value: '加入视频器' });
    }
    if (typeof plan.recommendedTitle === 'string' && plan.recommendedTitle.trim()) {
        meta.push({ label: '标题', value: plan.recommendedTitle.trim() });
    }

    return meta;
}

function stripRepeatedSummary(content: string, summary?: string): string {
    const normalizedContent = content.trim();
    const normalizedSummary = summary?.trim();
    if (!normalizedContent || !normalizedSummary) {
        return normalizedContent;
    }

    if (normalizedContent === normalizedSummary) {
        return '';
    }

    const escapedSummary = normalizedSummary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const summaryPrefixPattern = new RegExp(`^${escapedSummary}[：:：\-—\s\n]*`, 'i');
    const stripped = normalizedContent.replace(summaryPrefixPattern, '').trim();

    return stripped === normalizedContent ? normalizedContent : stripped;
}

function getGeneratingState(mode: AgentMode, prompt?: string) {
    const promptHint = prompt?.trim();

    switch (mode) {
        case 'branding':
            return {
                title: 'Agent 正在梳理品牌方向',
                hint: promptHint ? `正在提炼品牌气质与视觉语言：${promptHint.slice(0, 36)}${promptHint.length > 36 ? '…' : ''}` : '正在提炼品牌气质与视觉语言',
            };
        case 'image-editing':
            return {
                title: 'Agent 正在准备图像操作',
                hint: promptHint ? `正在分析你的改图目标：${promptHint.slice(0, 36)}${promptHint.length > 36 ? '…' : ''}` : '正在分析你的改图目标',
            };
        case 'research':
            return {
                title: 'Agent 正在整理参考线索',
                hint: promptHint ? `正在抽取风格关键词与参考方向：${promptHint.slice(0, 36)}${promptHint.length > 36 ? '…' : ''}` : '正在抽取风格关键词与参考方向',
            };
        default:
            return {
                title: 'Agent 正在构思并执行',
                hint: promptHint ? `正在拆解你的创意需求：${promptHint.slice(0, 36)}${promptHint.length > 36 ? '…' : ''}` : '正在拆解你的创意需求',
            };
    }
}

export function AiDesignerPanel({ onGenerate, isGenerating, onClose, initialPrompt, initialMode = 'design' }: AiDesignerPanelProps) {
    const [inputValue, setInputValue] = useState(initialPrompt || '');
    const [messages, setMessages] = useState<Message[]>([]);
    const [hasAutoSent, setHasAutoSent] = useState(false);
    const [agentMode, setAgentMode] = useState<AgentMode>(initialMode);

    const modeConfig: Record<AgentMode, { label: string; greeting: string; subtitle: string; placeholder: string }> = {
        design: {
            label: 'Design',
            greeting: 'Hi，我是你的创作 Agent',
            subtitle: '我可以跟你聊创意方向，也可以直接帮你生图、修图、做分镜和视频',
            placeholder: '比如：先给我想 3 个海报方向 / 生成 4 张封面 / 把这张图改成黄昏暖色',
        },
        branding: {
            label: 'Branding',
            greeting: 'Hi，我是你的品牌设计顾问',
            subtitle: '我会帮你梳理品牌气质、视觉语言和系统延展',
            placeholder: '描述你的品牌、受众、调性与使用场景',
        },
        'image-editing': {
            label: 'Image Editing',
            greeting: 'Hi，我是你的图像编辑助手',
            subtitle: '我会帮你拆解修图目标，也可以直接执行改图和生图动作',
            placeholder: '比如：把这张图改成更高级的展陈空间，保持主体不变',
        },
        research: {
            label: 'Research',
            greeting: 'Hi，我是你的创意研究员',
            subtitle: '我会帮你梳理参考方向、风格关键词与创意线索',
            placeholder: '描述你想研究的风格、竞品或参考方向',
        },
    };

    const suggestionsByMode: Record<AgentMode, Array<{ title: string; description: string; imageColor: string }>> = {
        design: [
            { title: '海报设计', description: '为新品发布会生成一张极简高级感海报，黑金配色，主标题突出。', imageColor: 'bg-blue-200' },
            { title: '产品 KV', description: '做一张护肤品主视觉，偏干净通透，带柔和高光和留白。', imageColor: 'bg-cyan-200' },
            { title: '故事板', description: '为 15 秒品牌短片生成三镜头故事板，强调节奏和转场。', imageColor: 'bg-purple-200' },
        ],
        branding: [
            { title: '咖啡品牌', description: '帮我定义一个精品咖啡品牌的视觉基调、Logo 方向和包装语言。', imageColor: 'bg-orange-200' },
            { title: '美妆品牌', description: '梳理一个年轻女性护肤品牌的品牌语气、主色和营销视觉。', imageColor: 'bg-pink-200' },
            { title: '科技品牌', description: '为 AI SaaS 产品构建一套理性、可信、现代的品牌视觉方向。', imageColor: 'bg-indigo-200' },
        ],
        'image-editing': [
            { title: '去杂物', description: '把产品图背景里的杂物清干净，保留自然光感和台面质感。', imageColor: 'bg-emerald-200' },
            { title: '改场景', description: '把这张鞋子图改到更高级的展陈空间里，保持主体不变。', imageColor: 'bg-lime-200' },
            { title: '统一风格', description: '把这组商品图统一成奶油白电商风，修正色温和阴影。', imageColor: 'bg-teal-200' },
        ],
        research: [
            { title: '竞品研究', description: '分析 3 个头部护肤品牌首页视觉的共同点与可借鉴策略。', imageColor: 'bg-violet-200' },
            { title: '风格关键词', description: '帮我整理“未来感科技发布会”的关键词、材质和镜头语言。', imageColor: 'bg-fuchsia-200' },
            { title: '参考拆解', description: '从时尚杂志封面里提炼可用于海报设计的版式套路。', imageColor: 'bg-slate-200' },
        ],
    };

    const suggestions = suggestionsByMode[agentMode];
    const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content;
    const generatingState = getGeneratingState(agentMode, latestUserMessage || inputValue || initialPrompt);

    const handleSend = useCallback(async () => {
        if (inputValue.trim() && !isGenerating) {
            const prompt = inputValue;
            setInputValue('');

            setMessages((prev) => [...prev, { role: 'user', content: prompt }]);

            try {
                const response = await onGenerate(prompt, { mode: agentMode });
                setMessages((prev) => [...prev, {
                    role: 'assistant',
                    content: response.reply,
                    kind: response.kind,
                    actionKind: response.actionKind,
                    meta: response.meta,
                    summary: response.summary,
                    plan: response.plan,
                    followUps: response.followUps,
                }]);
            } catch (error) {
                console.error('Failed to generate response:', error);
                const errorState = getAgentErrorState(error);
                setMessages((prev) => [...prev, {
                    role: 'assistant',
                    content: `抱歉，这个 Agent 没有成功响应：${error instanceof Error ? error.message : '未知错误'}`,
                    kind: 'chat',
                    errorState,
                }]);
            }
        }
    }, [agentMode, inputValue, isGenerating, onGenerate]);

    React.useEffect(() => {
        setAgentMode(initialMode);
    }, [initialMode]);

    React.useEffect(() => {
        setHasAutoSent(false);
        setMessages([]);
        if (typeof initialPrompt === 'string') {
            setInputValue(initialPrompt);
        } else {
            setInputValue('');
        }
    }, [initialMode, initialPrompt]);

    React.useEffect(() => {
        if (initialPrompt && !hasAutoSent && !isGenerating) {
            setHasAutoSent(true);
            void onGenerate(initialPrompt, { mode: initialMode }).then((response) => {
                setMessages([
                    { role: 'user', content: initialPrompt },
                    {
                        role: 'assistant',
                        content: response.reply,
                        kind: response.kind,
                        actionKind: response.actionKind,
                        meta: response.meta,
                        summary: response.summary,
                        plan: response.plan,
                        followUps: response.followUps,
                    },
                ]);
                setInputValue('');
            }).catch((error) => {
                console.error('Failed to auto-start agent:', error);
                const errorState = getAgentErrorState(error);
                setMessages([
                    { role: 'user', content: initialPrompt },
                    {
                        role: 'assistant',
                        content: `抱歉，这个 Agent 自动启动失败：${error instanceof Error ? error.message : '未知错误'}`,
                        kind: 'chat',
                        errorState,
                    },
                ]);
            });
        }
    }, [hasAutoSent, initialMode, initialPrompt, isGenerating, onGenerate]);

    return (
        <div className="flex flex-col h-full bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-end gap-4 p-4 text-gray-400">
                <button className="hover:text-gray-600 transition-colors"><MessageSquare size={18} /></button>
                <button className="hover:text-gray-600 transition-colors"><Clock size={18} /></button>
                <button className="hover:text-gray-600 transition-colors"><Share2 size={18} /></button>
                <button className="hover:text-gray-600 transition-colors"><Layout size={18} /></button>
                <button className="hover:text-gray-600 transition-colors"><Maximize2 size={18} /></button>
                {onClose && (
                    <button onClick={onClose} className="hover:text-gray-600 transition-colors ml-2">
                        <X size={18} />
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto px-8 pb-4">
                {messages.length === 0 ? (
                    <>
                        <div className="mb-8">
                            <div className="relative mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-black text-white text-xl font-bold">
                                <Bot size={22} />
                                <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white">
                                    <div className="h-2 w-2 rounded-full bg-green-500"></div>
                                </div>
                            </div>
                            <h1 className="text-3xl font-bold text-gray-900 mb-2">{modeConfig[agentMode].greeting}</h1>
                            <p className="text-lg text-gray-400 font-light">{modeConfig[agentMode].subtitle}</p>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                                你可以把我当成一个统一 Agent：既能聊创意/策略，也能直接执行生图、修图、分镜、视频动作。
                            </div>
                            {suggestions.map((item, index) => (
                                <div
                                    key={index}
                                    onClick={() => setInputValue(item.description)}
                                    className="group relative flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all cursor-pointer bg-gradient-to-r from-white to-gray-50"
                                >
                                    <div className="flex-1 pr-4">
                                        <h3 className="font-bold text-gray-900 mb-1">{item.title}</h3>
                                        <p className="text-sm text-gray-400 line-clamp-1">{item.description}</p>
                                    </div>
                                    <div className={`w-16 h-20 rounded-lg shadow-sm ${item.imageColor} transform group-hover:scale-105 transition-transform rotate-3`}></div>
                                    <div className={`absolute right-8 w-16 h-20 rounded-lg shadow-sm ${item.imageColor} opacity-50 transform rotate-12 -z-10`}></div>
                                </div>
                            ))}
                        </div>

                        <button className="flex items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors text-sm mb-4">
                            <RefreshCw size={14} />
                            <span>切换建议</span>
                        </button>
                    </>
                ) : (
                    <div className="space-y-6">
                        {messages.map((msg, index) => {
                            const isUser = msg.role === 'user';
                            const isAction = msg.role === 'assistant' && msg.kind === 'action';
                            const badgeLabel = msg.role === 'assistant' ? (isAction ? '已执行' : '建议') : null;
                            const actionTitle = isAction
                                ? actionTitleMap[msg.actionKind ?? 'images_generated'] ?? '执行完成'
                                : null;
                            const errorState = msg.role === 'assistant' ? msg.errorState : undefined;
                            const planMeta = !isAction ? getPlanMeta(msg.plan) : [];
                            const showSummary = !isAction && typeof msg.summary === 'string' && msg.summary.trim() && msg.summary.trim() !== msg.content.trim();
                            const detailContent = !isUser ? stripRepeatedSummary(msg.content, msg.summary) : msg.content;
                            const showDetailContent = Boolean(detailContent.trim());
                            const showFollowUps = !isUser && !errorState && Array.isArray(msg.followUps) && msg.followUps.length > 0;

                            return (
                                <div key={index} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                                    <div
                                        className={`max-w-[85%] p-4 rounded-2xl ${isUser
                                                ? 'bg-gray-100 text-gray-900 rounded-tr-sm'
                                                : isAction
                                                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-950 shadow-sm rounded-tl-sm'
                                                    : errorState?.tone === 'critical'
                                                        ? 'bg-amber-50 border border-amber-200 text-amber-950 shadow-sm rounded-tl-sm'
                                                        : 'bg-blue-50 border border-blue-100 text-slate-800 shadow-sm rounded-tl-sm'
                                            }`}
                                    >
                                        {badgeLabel && (
                                            <div className={`mb-2 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${isAction
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : errorState?.tone === 'critical'
                                                        ? 'bg-amber-100 text-amber-700'
                                                        : 'bg-blue-100 text-blue-700'
                                                }`}>
                                                {badgeLabel}
                                            </div>
                                        )}
                                        {isAction && actionTitle && (
                                            <div className="mb-3 rounded-xl border border-emerald-200 bg-white/80 px-3 py-2.5">
                                                <div className="flex items-center gap-2 text-emerald-900">
                                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100">
                                                        <Zap size={14} />
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-medium uppercase tracking-wide text-emerald-600">Execution Result</div>
                                                        <div className="text-sm font-semibold">{actionTitle}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {!isUser && !isAction && !errorState && (
                                            <div className="mb-3 rounded-xl border border-blue-200 bg-white/80 px-3 py-2.5">
                                                <div className="flex items-center gap-2 text-blue-900">
                                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100">
                                                        <Lightbulb size={14} />
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-medium uppercase tracking-wide text-blue-600">Creative Direction</div>
                                                        <div className="text-sm font-semibold">策略建议已整理</div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {errorState && (
                                            <div className={`mb-3 rounded-xl px-3 py-2.5 ${errorState.tone === 'critical'
                                                    ? 'border border-amber-200 bg-white/80 text-amber-900'
                                                    : 'border border-blue-200 bg-white/80 text-blue-900'
                                                }`}>
                                                <div className="flex items-start gap-2">
                                                    <div className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full ${errorState.tone === 'critical' ? 'bg-amber-100' : 'bg-blue-100'}`}>
                                                        {renderErrorIcon(errorState.icon)}
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-medium uppercase tracking-wide opacity-70">Agent Issue</div>
                                                        <div className="text-sm font-semibold">{errorState.title}</div>
                                                        {errorState.hint && (
                                                            <div className="mt-1 text-xs opacity-80">{errorState.hint}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {msg.meta && msg.meta.length > 0 && (
                                            <div className="mb-3 flex flex-wrap gap-2">
                                                {msg.meta.map((item, metaIndex) => (
                                                    <div
                                                        key={`${item.label}-${item.value}-${metaIndex}`}
                                                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] ${isAction
                                                                ? 'bg-white/80 text-emerald-800 border border-emerald-200'
                                                                : errorState?.tone === 'critical'
                                                                    ? 'bg-white/80 text-amber-800 border border-amber-200'
                                                                    : 'bg-white/80 text-blue-800 border border-blue-200'
                                                            }`}
                                                    >
                                                        <span className="opacity-70">{item.label}</span>
                                                        <span className="font-medium">{item.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {!isAction && planMeta.length > 0 && (
                                            <div className="mb-3 flex flex-wrap gap-2">
                                                {planMeta.map((item, metaIndex) => (
                                                    <div
                                                        key={`plan-${item.label}-${item.value}-${metaIndex}`}
                                                        className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white/80 px-2.5 py-1 text-[11px] text-blue-800"
                                                    >
                                                        <span className="opacity-70">{item.label}</span>
                                                        <span className="font-medium">{item.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {showSummary && (
                                            <div className="mb-3 rounded-xl border border-blue-100 bg-white/70 px-3 py-2.5">
                                                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-blue-600">Summary</div>
                                                <p className="text-sm leading-relaxed text-slate-700">{msg.summary}</p>
                                            </div>
                                        )}
                                        {showDetailContent && (
                                            <div>
                                                {!isUser && (showSummary || isAction) && (
                                                    <div className={`mb-1 text-xs font-medium uppercase tracking-wide ${isAction ? 'text-emerald-600' : 'text-blue-600'}`}>
                                                        {isAction ? 'Detail' : 'Expanded Notes'}
                                                    </div>
                                                )}
                                                <p className="whitespace-pre-wrap text-sm leading-relaxed">{detailContent}</p>
                                            </div>
                                        )}
                                        {showFollowUps && (
                                            <div className="mt-3">
                                                <div className={`mb-2 text-xs font-medium uppercase tracking-wide ${isAction ? 'text-emerald-600' : 'text-blue-600'}`}>
                                                    Next Step
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {msg.followUps!.map((followUp, followUpIndex) => (
                                                        <button
                                                            key={`${followUp}-${followUpIndex}`}
                                                            type="button"
                                                            onClick={() => setInputValue(followUp)}
                                                            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${isAction
                                                                    ? 'border-emerald-200 bg-white/80 text-emerald-800 hover:bg-emerald-100'
                                                                    : 'border-blue-200 bg-white/80 text-blue-800 hover:bg-blue-100'
                                                                }`}
                                                        >
                                                            {followUp}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {isGenerating && (
                            <div className="flex justify-start">
                                <div className="rounded-2xl rounded-tl-sm border border-blue-100 bg-white p-4 shadow-sm">
                                    <div className="mb-2 flex items-center gap-2 text-blue-900">
                                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100">
                                            <Bot size={14} />
                                        </div>
                                        <div>
                                            <div className="text-xs font-medium uppercase tracking-wide text-blue-600">Working</div>
                                            <div className="text-sm font-semibold">{generatingState.title}</div>
                                        </div>
                                    </div>
                                    <div className="mb-3 text-sm leading-relaxed text-slate-600">{generatingState.hint}</div>
                                    <div className="flex gap-1">
                                        <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                        <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                        <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="p-6 pt-2">
                <div className="relative border border-gray-200 rounded-2xl bg-white shadow-sm focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-300 transition-all">
                    <textarea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={modeConfig[agentMode].placeholder}
                        className="w-full h-24 p-4 resize-none outline-none text-gray-700 placeholder-gray-300 bg-transparent rounded-t-2xl"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                void handleSend();
                            }
                        }}
                    />

                    <div className="flex items-center justify-between px-3 py-2 border-t border-gray-50">
                        <div className="flex items-center gap-2">
                            <button className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors">
                                <Paperclip size={18} />
                            </button>
                            <button className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors">
                                <AtSign size={18} />
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="flex items-center bg-gray-50 rounded-full p-1 border border-gray-100">
                                {([
                                    { mode: 'design', icon: Lightbulb, title: '设计方向' },
                                    { mode: 'branding', icon: Zap, title: '品牌策略' },
                                    { mode: 'research', icon: Globe, title: '参考研究' },
                                    { mode: 'image-editing', icon: Box, title: '图像编辑' },
                                ] as const).map(({ mode, icon: Icon, title }) => (
                                    <button
                                        key={mode}
                                        onClick={() => setAgentMode(mode)}
                                        title={title}
                                        className={`p-1.5 rounded-full transition-all ${agentMode === mode ? 'text-blue-500 bg-white shadow-sm' : 'text-gray-400 hover:text-gray-600 hover:bg-white'}`}
                                    >
                                        <Icon size={16} />
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={() => void handleSend()}
                                disabled={!inputValue.trim() || isGenerating}
                                className={`p-2 rounded-full transition-all ${inputValue.trim() && !isGenerating
                                    ? 'bg-black text-white hover:bg-gray-800 shadow-md'
                                    : 'bg-gray-200 text-white cursor-not-allowed'
                                    }`}
                            >
                                <ArrowUp size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
