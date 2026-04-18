'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Plus, Sparkles, Bell, X, Star, LogOut } from 'lucide-react';
import { DashboardSidebar } from '@/components/lovart/DashboardSidebar';
import { LoginModal } from '@/components/auth/LoginModal';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { ProjectCard } from '@/components/lovart/ProjectCard';
import { useSupabase } from '@/hooks/useSupabase';
import { useUserCredits } from '@/hooks/useUserCredits';
import type { ProjectRow } from '@/lib/supabase';
import Link from 'next/link';
import { v4 as uuidv4 } from 'uuid';

type AgentMode = 'design' | 'branding' | 'image-editing' | 'research';

type Project = Pick<ProjectRow, 'id' | 'title' | 'thumbnail' | 'updated_at'>;

type CanvasElementThumbnailRow = {
    project_id: string;
    type: string;
    content: string | null;
    updated_at?: string | null;
};

interface Notification {
    id: string;
    title: string;
    content: string;
    link?: string;
    linkText?: string;
    time: string;
    isNew: boolean;
    isPinned?: boolean;
}

export default function LovartDashboard() {
    const { user, signOut } = useAuth();
    const supabase = useSupabase();
    const { credits } = useUserCredits();
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [placeholder, setPlaceholder] = useState('');
    const [placeholderIndex, setPlaceholderIndex] = useState(0);
    const [inputValue, setInputValue] = useState('');
    const [agentMode, setAgentMode] = useState<AgentMode>('design');
    const [isGenerating, setIsGenerating] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const notificationRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
                setShowNotifications(false);
            }
        }

        if (showNotifications) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showNotifications]);

    const notifications: Notification[] = [
        {
            id: '1',
            title: '项目说明已更新',
            content: '认证方案已统一为 Supabase Auth，文档正在持续整理中。',
            time: '置顶',
            isNew: true,
            isPinned: true,
        },
        {
            id: '2',
            title: '视频生成功能可用',
            content: '现在可以通过外部视频接口发起视频生成任务。',
            time: '1 小时前',
            isNew: true,
        },
        {
            id: '3',
            title: '系统更新',
            content: '优化了画布性能和基础交互体验。',
            time: '昨天',
            isNew: false,
        },
    ];

    const placeholders = useMemo(() => [
        '让 Doodleverse 为你自动生成方案和效果图',
        '设计一个现代简约的 Logo',
        '创建一张社交媒体海报',
        '生成一个产品展示图',
        '制作一个品牌宣传图',
    ], []);

    useEffect(() => {
        async function loadData() {
            if (!user || !supabase) {
                setIsLoading(false);
                return;
            }

            try {
                const [projectsResult] = await Promise.all([
                    supabase
                        .from('projects')
                        .select('*')
                        .eq('user_id', user.id)
                        .order('updated_at', { ascending: false }),
                ]);

                if (projectsResult.error) throw projectsResult.error;
                const projectRows = (projectsResult.data || []) as ProjectRow[];

                const missingThumbnailProjectIds = projectRows
                    .filter((project) => !project.thumbnail)
                    .map((project) => project.id);

                const derivedThumbnailMap = new Map<string, string>();

                if (missingThumbnailProjectIds.length > 0) {
                    const { data: canvasRows, error: canvasError } = await supabase
                        .from('canvas_elements')
                        .select('project_id,type,content,updated_at')
                        .in('project_id', missingThumbnailProjectIds)
                        .in('type', ['image', 'video'])
                        .not('content', 'is', null)
                        .order('updated_at', { ascending: false });

                    if (!canvasError) {
                        for (const row of ((canvasRows || []) as unknown as CanvasElementThumbnailRow[])) {
                            if (!row.project_id || !row.content || derivedThumbnailMap.has(row.project_id)) continue;
                            derivedThumbnailMap.set(row.project_id, row.content);
                        }
                    }
                }

                setProjects(projectRows.map((project) => ({
                    id: project.id,
                    title: project.title,
                    thumbnail: project.thumbnail || derivedThumbnailMap.get(project.id) || null,
                    updated_at: project.updated_at,
                })));
            } catch (error) {
                console.error('Failed to load data:', error);
            } finally {
                setIsLoading(false);
            }
        }

        void loadData();
    }, [user, supabase]);

    useEffect(() => {
        const currentText = placeholders[placeholderIndex];
        let currentIndex = 0;
        let isDeleting = false;
        let timeout: NodeJS.Timeout;

        const type = () => {
            if (!isDeleting && currentIndex <= currentText.length) {
                setPlaceholder(currentText.slice(0, currentIndex));
                currentIndex++;
                timeout = setTimeout(type, 100);
            } else if (!isDeleting && currentIndex > currentText.length) {
                timeout = setTimeout(() => {
                    isDeleting = true;
                    type();
                }, 2000);
            } else if (isDeleting && currentIndex > 0) {
                currentIndex--;
                setPlaceholder(currentText.slice(0, currentIndex));
                timeout = setTimeout(type, 50);
            } else if (isDeleting && currentIndex === 0) {
                isDeleting = false;
                setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
            }
        };

        type();

        return () => clearTimeout(timeout);
    }, [placeholderIndex, placeholders]);

    const handleGenerate = async () => {
        if (!inputValue.trim() || isGenerating) return;

        if (!user) {
            alert('请先登录');
            return;
        }

        if (!supabase) {
            alert('系统初始化中，请稍后再试');
            return;
        }

        setIsGenerating(true);

        try {
            const newProjectId = uuidv4();
            const projectTitle = inputValue.trim().slice(0, 50) || '未命名项目';

            const { data: projectData, error: projectError } = await supabase
                .from('projects')
                .insert({
                    id: newProjectId,
                    user_id: user.id,
                    title: projectTitle,
                })
                .select()
                .single();

            if (projectError) {
                console.error('Failed to create project:', projectError);
                throw new Error(`创建项目失败: ${projectError.message}`);
            }

            console.log('Project created successfully:', projectData);
            window.location.href = `/canvas?id=${newProjectId}&prompt=${encodeURIComponent(inputValue.trim())}&mode=${encodeURIComponent(agentMode)}`;
        } catch (error) {
            console.error('Generation failed:', error);
            alert(error instanceof Error ? error.message : '生成失败，请重试');
            setIsGenerating(false);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffInMs = now.getTime() - date.getTime();
        const diffInMins = Math.floor(diffInMs / 60000);
        const diffInHours = Math.floor(diffInMs / 3600000);
        const diffInDays = Math.floor(diffInMs / 86400000);

        if (diffInMins < 1) return '刚刚编辑';
        if (diffInMins < 60) return `${diffInMins} 分钟前编辑`;
        if (diffInHours < 24) return `${diffInHours} 小时前编辑`;
        if (diffInDays < 7) return `${diffInDays} 天前编辑`;
        return date.toLocaleDateString('zh-CN');
    };

    return (
        <div className="h-screen bg-[#FAFAFA] text-gray-900 font-sans">
            <DashboardSidebar />

            <main className="h-full flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto">
                    <div className="flex items-center justify-between px-8 py-4">
                        <Link href="/" className="flex items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-gray-100">
                            <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-sm font-bold">D</div>
                            <span className="text-lg font-semibold text-gray-900">Doodleverse</span>
                        </Link>

                        <div className="flex items-center gap-2">
                            <ThemeToggle />
                            <div className="relative" ref={notificationRef}>
                                <button
                                    onClick={() => setShowNotifications(!showNotifications)}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative"
                                >
                                    <Bell size={18} className="text-gray-600" />
                                    <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                                </button>

                                {showNotifications && (
                                    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                                            <h3 className="font-semibold text-gray-900">通知</h3>
                                            <button
                                                onClick={() => setShowNotifications(false)}
                                                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                                            >
                                                <X size={16} className="text-gray-500" />
                                            </button>
                                        </div>
                                        <div className="max-h-80 overflow-y-auto">
                                            {notifications.map((notification) => (
                                                <div
                                                    key={notification.id}
                                                    className={`px-4 py-3 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors ${notification.isPinned ? 'bg-orange-50/50' : ''}`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <div className="shrink-0 pt-0.5">
                                                            {notification.isPinned ? (
                                                                <span className="inline-block px-1.5 py-0.5 bg-orange-400 text-white rounded text-xs font-medium">置顶</span>
                                                            ) : notification.isNew ? (
                                                                <span className="inline-block w-2 h-2 bg-red-500 rounded-full mt-1"></span>
                                                            ) : (
                                                                <span className="inline-block w-2 h-2 bg-gray-300 rounded-full mt-1"></span>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-gray-900 text-sm leading-tight">{notification.title}</p>
                                                            <p className="text-gray-500 text-xs mt-1 leading-relaxed">{notification.content}</p>
                                                            {notification.link && (
                                                                <a
                                                                    href={notification.link}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 transition-colors"
                                                                >
                                                                    {notification.linkText}
                                                                    <Star size={12} />
                                                                </a>
                                                            )}
                                                            {!notification.isPinned && (
                                                                <p className="text-gray-400 text-xs mt-2">{notification.time}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {user && credits !== null && (
                                <div className="px-3 py-1.5 bg-black text-white rounded-full text-xs font-medium flex items-center gap-1.5">
                                    <span className="text-sm">✨</span>
                                    <span>{credits.toLocaleString()}</span>
                                </div>
                            )}

                            {!user ? (
                                <button
                                    onClick={() => setShowLoginModal(true)}
                                    className="px-4 py-2 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-800 transition-colors"
                                >
                                    登录
                                </button>
                            ) : (
                                <button
                                    onClick={() => void signOut()}
                                    className="flex items-center gap-2 px-3 py-2 rounded-full border border-gray-200 hover:bg-gray-50 text-sm text-gray-700"
                                >
                                    <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-xs font-semibold">
                                        {(user.email?.[0] || 'U').toUpperCase()}
                                    </div>
                                    <span className="max-w-[140px] truncate">{user.email}</span>
                                    <LogOut size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="px-8 py-12">
                        <div className="max-w-3xl mx-auto text-center mb-16">
                            <div className="flex items-center justify-center gap-3 mb-4">
                                <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center text-white text-xl font-bold">D</div>
                                <h1 className="text-4xl font-bold text-gray-900">Doodleverse，让设计更简单</h1>
                            </div>
                            <p className="text-gray-500 mb-8">输入目标，Agent 会为你创建项目、进入画布并启动对应工作流。</p>

                            <div className="relative max-w-2xl mx-auto mb-6">
                                <input
                                    type="text"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    placeholder={placeholder}
                                    className="w-full px-6 py-4 pr-32 rounded-full bg-white shadow-sm focus:shadow-md outline-none transition-all text-base"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && inputValue.trim()) {
                                            void handleGenerate();
                                        }
                                    }}
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                    <button
                                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                                        onClick={() => setAgentMode('design')}
                                        title="切换到设计 Agent"
                                    >
                                        <Sparkles size={20} className={`${agentMode === 'design' ? 'text-black' : 'text-gray-400'}`} />
                                    </button>
                                    <button
                                        onClick={() => void handleGenerate()}
                                        disabled={!inputValue.trim() || isGenerating}
                                        className="px-4 py-2 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isGenerating ? '生成中...' : '生成'}
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-center gap-3 flex-wrap">
                                {[
                                    { key: 'design', label: '🎨 Design' },
                                    { key: 'branding', label: '🏷️ Branding' },
                                    { key: 'image-editing', label: '✂️ Image Editing' },
                                    { key: 'research', label: '🔎 Research' },
                                ].map((item) => (
                                    <button
                                        key={item.key}
                                        onClick={() => setAgentMode(item.key as AgentMode)}
                                        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors shadow-sm ${agentMode === item.key ? 'bg-black text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="max-w-7xl mx-auto">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-semibold text-gray-900">
                                    最近项目
                                    {user && !isLoading && <span className="ml-2 text-sm font-normal text-gray-500">({projects.length})</span>}
                                </h2>
                                <Link href="/projects" className="text-sm text-gray-600 hover:text-gray-900">
                                    查看全部 →
                                </Link>
                            </div>

                            {isLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="text-gray-400">加载中...</div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <Link href="/canvas" className="group flex flex-col items-center justify-center aspect-[4/3] bg-white rounded-2xl hover:bg-gray-50 transition-all cursor-pointer shadow-sm border border-gray-100">
                                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3 group-hover:bg-gray-200 transition-colors">
                                            <Plus size={24} className="text-gray-600" />
                                        </div>
                                        <span className="font-medium text-gray-600">新建项目</span>
                                    </Link>

                                    {user && projects.slice(0, 3).map((project) => (
                                        <Link
                                            key={project.id}
                                            href={`/canvas?id=${project.id}`}
                                        >
                                            <ProjectCard
                                                title={project.title}
                                                date={formatDate(project.updated_at)}
                                                imageUrl={project.thumbnail || undefined}
                                            />
                                        </Link>
                                    ))}

                                    {!user && (
                                        <>
                                            <ProjectCard title="示例项目" date="2 分钟前编辑" />
                                            <ProjectCard title="营销活动" date="1 小时前编辑" />
                                            <ProjectCard title="社交媒体素材" date="昨天编辑" />
                                        </>
                                    )}
                                </div>
                            )}

                            {user && projects.length === 0 && !isLoading && (
                                <div className="text-center py-12 text-gray-400">
                                    <p className="mb-2">还没有项目</p>
                                    <p className="text-sm">点击“新建项目”开始创作。</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
            <LoginModal open={showLoginModal} onClose={() => setShowLoginModal(false)} />
        </div>
    );
}
