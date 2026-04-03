'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Plus, Sparkles, Bell, X, Star } from 'lucide-react';
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { DashboardSidebar } from '@/components/lovart/DashboardSidebar';
import { ProjectCard } from '@/components/lovart/ProjectCard';
import { useSupabase } from '@/hooks/useSupabase';
import Link from 'next/link';
import { v4 as uuidv4 } from 'uuid';

interface Project {
    id: string;
    title: string;
    thumbnail: string | null;
    updated_at: string;
}

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
    const { user } = useUser();
    const supabase = useSupabase();
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [credits, setCredits] = useState<number | null>(null);
    const [placeholder, setPlaceholder] = useState('');
    const [placeholderIndex, setPlaceholderIndex] = useState(0);
    const [inputValue, setInputValue] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const notificationRef = useRef<HTMLDivElement>(null);

    // 点击外部关闭通知弹窗
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
            title: '🎉 OpenLovart 开源啦！',
            content: '欢迎访问我们的 GitHub 仓库，给我们一个 Star ⭐',
            link: 'https://github.com/xiaoju111a/OpenLovart',
            linkText: '访问 GitHub',
            time: '置顶',
            isNew: true,
            isPinned: true,
        },
        {
            id: '2',
            title: 'Sora 2 视频生成已上线',
            content: '现在可以使用 AI 生成高质量视频了',
            time: '1 小时前',
            isNew: true,
        },
        {
            id: '3',
            title: '系统更新',
            content: '优化了画布性能和用户体验',
            time: '昨天',
            isNew: false,
        },
    ];

    const placeholders = [
        '让 Lovart 为你自动生成内容或效果图吧',
        '设计一个现代简约的 Logo',
        '创建一张社交媒体海报',
        '生成一个产品展示图',
        '制作一个品牌宣传图',
    ];

    // Load user's projects and credits
    useEffect(() => {
        async function loadData() {
            if (!user || !supabase) {
                setIsLoading(false);
                return;
            }

            try {
                // 并行加载项目和积分，提升性能
                const [projectsResult, creditsResult] = await Promise.all([
                    supabase
                        .from('projects')
                        .select('*')
                        .order('updated_at', { ascending: false }),
                    (supabase as any)
                        .from('user_credits')
                        .select('credits')
                        .eq('user_id', user.id)
                        .single()
                ]);

                // 处理项目数据
                if (projectsResult.error) throw projectsResult.error;
                setProjects(projectsResult.data || []);

                // 处理积分数据
                if (creditsResult.error && creditsResult.error.code === 'PGRST116') {
                    // 用户积分记录不存在，创建新记录
                    const { data: newData } = await (supabase as any)
                        .from('user_credits')
                        .insert({ user_id: user.id, credits: 1000 })
                        .select()
                        .single();
                    setCredits(newData?.credits || 1000);
                } else if (!creditsResult.error) {
                    setCredits(creditsResult.data?.credits || 0);
                }
            } catch (error) {
                console.error('Failed to load data:', error);
            } finally {
                setIsLoading(false);
            }
        }

        loadData();
    }, [user, supabase]);

    // Typing effect for placeholder
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
    }, [placeholderIndex]);

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
            // 1. Create a new project
            const newProjectId = uuidv4();
            const projectTitle = inputValue.trim().slice(0, 50) || '未命名项目';
            
            console.log('Creating project:', { id: newProjectId, title: projectTitle });
            
            const { data: projectData, error: projectError } = await (supabase as any)
                .from('projects')
                .insert({
                    id: newProjectId,
                    title: projectTitle,
                })
                .select()
                .single();

            if (projectError) {
                console.error('Failed to create project:', projectError);
                throw new Error(`创建项目失败: ${projectError.message}`);
            }

            console.log('Project created successfully:', projectData);

            // 2. Redirect to canvas page with the new project and prompt
            // Don't wait for API call, let the canvas page handle it
            window.location.href = `/lovart/canvas?id=${newProjectId}&prompt=${encodeURIComponent(inputValue.trim())}`;
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
                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {/* Top Bar */}
                    <div className="flex items-center justify-between px-8 py-4">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-sm font-bold">L</div>
                            <span className="text-lg font-semibold text-gray-900">Lovart</span>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Notification Bell */}
                            <div className="relative" ref={notificationRef}>
                                <button 
                                    onClick={() => setShowNotifications(!showNotifications)}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative"
                                >
                                    <Bell size={18} className="text-gray-600" />
                                    <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                                </button>

                                {/* Notifications Dropdown */}
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
                                                                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                                                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                                                                    </svg>
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

                            {/* Credits Display */}
                            <SignedIn>
                                {credits !== null && (
                                    <div className="px-3 py-1.5 bg-black text-white rounded-full text-xs font-medium flex items-center gap-1.5">
                                        <span className="text-sm">⚡</span>
                                        <span>{credits.toLocaleString()}</span>
                                    </div>
                                )}
                            </SignedIn>

                            {/* User Button or Sign In */}
                            <SignedOut>
                                <SignInButton mode="modal">
                                    <button className="px-4 py-2 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-800 transition-colors">
                                        登录
                                    </button>
                                </SignInButton>
                            </SignedOut>
                            <SignedIn>
                                <UserButton />
                            </SignedIn>
                        </div>
                    </div>
                    <div className="px-8 py-12">
                        {/* Hero Section */}
                        <div className="max-w-3xl mx-auto text-center mb-16">
                            {/* Promo Badge */}
                            <a 
                                href="https://github.com/xiaoju111a/OpenLovart" 
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 hover:bg-orange-100 rounded-full text-sm text-gray-700 transition-colors mb-6"
                            >
                                <span className="px-2 py-0.5 bg-orange-400 text-white rounded text-xs font-medium">NEW</span>
                                <span>OpenLovart 已开源，欢迎 Star ⭐</span>
                                <span className="text-orange-600">→</span>
                            </a>

                            <div className="flex items-center justify-center gap-3 mb-4">
                                <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center text-white text-xl font-bold">L</div>
                                <h1 className="text-4xl font-bold text-gray-900">Lovart 让设计更简单</h1>
                            </div>
                            <p className="text-gray-500 mb-8">输入想法即可生成，帮你完成一切</p>

                            {/* Search Input */}
                            <div className="relative max-w-2xl mx-auto mb-6">
                                <input
                                    type="text"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    placeholder={placeholder}
                                    className="w-full px-6 py-4 pr-32 rounded-full bg-white shadow-sm focus:shadow-md outline-none transition-all text-base"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && inputValue.trim()) {
                                            handleGenerate();
                                        }
                                    }}
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                    <button 
                                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                                        onClick={() => setInputValue('')}
                                    >
                                        <Sparkles size={20} className="text-gray-400" />
                                    </button>
                                    <button 
                                        onClick={handleGenerate}
                                        disabled={!inputValue.trim() || isGenerating}
                                        className="px-4 py-2 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isGenerating ? '生成中...' : '生成'}
                                    </button>
                                </div>
                            </div>

                            {/* Quick Tags */}
                            <div className="flex items-center justify-center gap-3 flex-wrap">
                                <button className="px-4 py-2 rounded-full bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm">
                                    🎨 Design
                                </button>
                                <button className="px-4 py-2 rounded-full bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm">
                                    🏷️ Branding
                                </button>
                                <button className="px-4 py-2 rounded-full bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm">
                                    ✂️ Image Editing
                                </button>
                                <button className="px-4 py-2 rounded-full bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm">
                                    More
                                </button>
                            </div>
                        </div>

                        {/* Recent Projects */}
                        <div className="max-w-7xl mx-auto">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-semibold text-gray-900">
                                    最近项目
                                    {user && !isLoading && <span className="ml-2 text-sm font-normal text-gray-500">({projects.length})</span>}
                                </h2>
                                <Link href="/lovart/projects" className="text-sm text-gray-600 hover:text-gray-900">
                                    查看全部 →
                                </Link>
                            </div>

                            {isLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="text-gray-400">加载中...</div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    {/* New Project Card */}
                                    <Link href="/lovart/canvas" className="group flex flex-col items-center justify-center aspect-[4/3] bg-white rounded-2xl hover:bg-gray-50 transition-all cursor-pointer shadow-sm">
                                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3 group-hover:bg-gray-200 transition-colors">
                                            <Plus size={24} className="text-gray-600" />
                                        </div>
                                        <span className="font-medium text-gray-600">新建项目</span>
                                    </Link>

                                    {/* User's Projects */}
                                    {user && projects.slice(0, 3).map((project) => (
                                        <Link
                                            key={project.id}
                                            href={`/lovart/canvas?id=${project.id}`}
                                        >
                                            <ProjectCard
                                                title={project.title}
                                                date={formatDate(project.updated_at)}
                                                imageUrl={project.thumbnail || undefined}
                                            />
                                        </Link>
                                    ))}

                                    {/* Show sample projects if not signed in */}
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
                                    <p className="text-sm">点击 "新建项目" 开始创作！</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
