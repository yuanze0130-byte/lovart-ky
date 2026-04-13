import React, { useState, useCallback } from 'react';
import {
    Paperclip, AtSign, Lightbulb, Zap, Globe, Box, ArrowUp,
    RefreshCw, MessageSquare, Clock, Share2, Layout, Maximize2, X
} from 'lucide-react';

type AgentMode = 'design' | 'branding' | 'image-editing' | 'research';

interface AiDesignerPanelProps {
    onGenerate: (prompt: string, options?: { mode?: AgentMode }) => Promise<{ reply: string; summary?: string; plan?: Record<string, unknown> } | string>;
    isGenerating: boolean;
    onClose?: () => void;
    initialPrompt?: string;
    initialMode?: AgentMode;
}

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export function AiDesignerPanel({ onGenerate, isGenerating, onClose, initialPrompt, initialMode = 'design' }: AiDesignerPanelProps) {
    const [inputValue, setInputValue] = useState(initialPrompt || '');
    const [messages, setMessages] = useState<Message[]>([]);
    const [hasAutoSent, setHasAutoSent] = useState(false);
    const [agentMode, setAgentMode] = useState<AgentMode>(initialMode);

    const modeConfig: Record<AgentMode, { label: string; greeting: string; subtitle: string; placeholder: string }> = {
        design: {
            label: 'Design',
            greeting: 'Hi，我是你的AI设计师',
            subtitle: '我会帮你拆解需求、生成版式方向与视觉方案',
            placeholder: '描述你想做的设计内容、风格和用途',
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
            subtitle: '我会帮你拆解修图目标、修改方向与执行步骤',
            placeholder: '描述你想对图片做什么修改',
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

    const handleSend = useCallback(async () => {
        if (inputValue.trim() && !isGenerating) {
            const prompt = inputValue;
            setInputValue('');

            setMessages(prev => [...prev, { role: 'user', content: prompt }]);

            try {
                const response = await onGenerate(prompt, { mode: agentMode });
                const reply = typeof response === 'string' ? response : response.reply;
                setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
            } catch (error) {
                console.error('Failed to generate response:', error);
            }
        }
    }, [agentMode, inputValue, isGenerating, onGenerate]);

    // 自动发送 initialPrompt（如果提供）
    React.useEffect(() => {
        setAgentMode(initialMode);
    }, [initialMode]);

    React.useEffect(() => {
        if (typeof initialPrompt === 'string') {
            setInputValue(initialPrompt);
        }
    }, [initialPrompt]);

    React.useEffect(() => {
        if (initialPrompt && !hasAutoSent && !isGenerating) {
            setHasAutoSent(true);
            void onGenerate(initialPrompt, { mode: initialMode }).then((response) => {
                const reply = typeof response === 'string' ? response : response.reply;
                setMessages([
                    { role: 'user', content: initialPrompt },
                    { role: 'assistant', content: reply },
                ]);
                setInputValue('');
            }).catch((error) => {
                console.error('Failed to auto-start agent:', error);
            });
        }
    }, [hasAutoSent, initialMode, initialPrompt, isGenerating, onGenerate]);

    return (
        <div className="flex flex-col h-full bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            {/* Header Icons */}
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

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto px-8 pb-4">
                {messages.length === 0 ? (
                    <>
                        {/* Greeting */}
                        <div className="mb-8">
                            <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center text-white text-xl font-bold mb-6">
                                L
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center">
                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                </div>
                            </div>
                            <h1 className="text-3xl font-bold text-gray-900 mb-2">{modeConfig[agentMode].greeting}</h1>
                            <p className="text-lg text-gray-400 font-light">{modeConfig[agentMode].subtitle}</p>
                        </div>

                        {/* Suggestions Cards */}
                        <div className="space-y-4 mb-6">
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

                        {/* Switch Button */}
                        <button className="flex items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors text-sm mb-4">
                            <RefreshCw size={14} />
                            <span>切换</span>
                        </button>
                    </>
                ) : (
                    <div className="space-y-6">
                        {messages.map((msg, index) => (
                            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className={`max-w-[85%] p-4 rounded-2xl ${msg.role === 'user'
                                            ? 'bg-gray-100 text-gray-900 rounded-tr-sm'
                                            : 'bg-white border border-gray-100 text-gray-800 shadow-sm rounded-tl-sm'
                                        }`}
                                >
                                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                                </div>
                            </div>
                        ))}
                        {isGenerating && (
                            <div className="flex justify-start">
                                <div className="bg-white border border-gray-100 p-4 rounded-2xl rounded-tl-sm shadow-sm">
                                    <div className="flex gap-1">
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Input Area */}
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
                                handleSend();
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
                                onClick={handleSend}
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
