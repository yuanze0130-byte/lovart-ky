'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Bell, LogOut } from 'lucide-react';
import { ProjectCard } from '@/components/lovart/ProjectCard';
import { LoginModal } from '@/components/auth/LoginModal';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { useSupabase } from '@/hooks/useSupabase';
import { useUserCredits } from '@/hooks/useUserCredits';
import type { ProjectRow } from '@/lib/supabase';
import Link from 'next/link';

type Project = Pick<ProjectRow, 'id' | 'title' | 'thumbnail' | 'updated_at'>;

type CanvasElementThumbnailRow = {
    project_id: string;
    type: string;
    content: string | null;
    updated_at?: string | null;
};

export default function ProjectsPage() {
    const { user, signOut } = useAuth();
    const supabase = useSupabase();
    const { credits } = useUserCredits();
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showLoginModal, setShowLoginModal] = useState(false);

    useEffect(() => {
        async function loadData() {
            if (!user || !supabase) {
                setIsLoading(false);
                return;
            }

            try {
                const [projectsResult] = await Promise.all([
                    supabase.from('projects').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
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

                setProjects(
                    projectRows.map((project) => ({
                        id: project.id,
                        title: project.title,
                        thumbnail: project.thumbnail || derivedThumbnailMap.get(project.id) || null,
                        updated_at: project.updated_at,
                    }))
                );
            } catch (error) {
                console.error('Failed to load data:', error);
            } finally {
                setIsLoading(false);
            }
        }

        void loadData();
    }, [user, supabase]);

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

    const handleRenameProject = async (project: Project) => {
        if (!supabase || !user) return;

        const nextTitle = window.prompt('输入新的项目名称', project.title)?.trim();
        if (!nextTitle || nextTitle === project.title) return;

        const { error } = await supabase
            .from('projects')
            .update({ title: nextTitle })
            .eq('id', project.id);

        if (error) {
            alert(`重命名失败：${error.message}`);
            return;
        }

        setProjects((prev) =>
            prev.map((item) =>
                item.id === project.id ? { ...item, title: nextTitle } : item
            )
        );
    };

    const handleDeleteProject = async (project: Project) => {
        if (!supabase || !user) return;

        const confirmed = window.confirm(`确定删除项目“${project.title}”吗？删除后无法恢复。`);
        if (!confirmed) return;

        const { error: canvasError } = await supabase
            .from('canvas_elements')
            .delete()
            .eq('project_id', project.id);

        if (canvasError) {
            alert(`删除项目内容失败：${canvasError.message}`);
            return;
        }

        const { error: projectError } = await supabase
            .from('projects')
            .delete()
            .eq('id', project.id)
            .eq('user_id', user.id);

        if (projectError) {
            alert(`删除项目失败：${projectError.message}`);
            return;
        }

        setProjects((prev) => prev.filter((item) => item.id !== project.id));
    };

    return (
        <div className="h-screen bg-white text-gray-900 font-sans">
            <main className="h-full flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto">
                    <div className="flex items-center justify-between px-8 py-4">
                        <Link href="/" className="flex items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-gray-100">
                            <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-sm font-bold">D</div>
                            <span className="text-lg font-semibold text-gray-900">Doodleverse</span>
                        </Link>

                        <div className="flex items-center gap-2">
                            <ThemeToggle />
                            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative">
                                <Bell size={18} className="text-gray-600" />
                                <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                            </button>

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

                    <div className="px-8 pb-8">
                        {!user ? (
                            <div className="flex flex-col items-center justify-center h-full">
                                <div className="text-center max-w-md">
                                    <h2 className="text-2xl font-bold mb-4">欢迎来到 Doodleverse</h2>
                                    <p className="text-gray-600 mb-6">登录以查看和管理你的项目</p>
                                    <button
                                        onClick={() => setShowLoginModal(true)}
                                        className="px-6 py-3 bg-black text-white rounded-full font-medium hover:bg-gray-800 transition-colors"
                                    >
                                        立即登录
                                    </button>
                                </div>
                            </div>
                        ) : isLoading ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-gray-400">加载中...</div>
                            </div>
                        ) : (
                            <div>
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-lg font-semibold text-gray-800">
                                        所有项目
                                        <span className="ml-2 text-sm font-normal text-gray-500">({projects.length})</span>
                                    </h2>
                                    <Link
                                        href="/canvas"
                                        className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-800 transition-colors"
                                    >
                                        <Plus size={18} />
                                        新建项目
                                    </Link>
                                </div>

                                {projects.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20">
                                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                            <Plus size={32} className="text-gray-400" />
                                        </div>
                                        <h3 className="text-lg font-medium text-gray-900 mb-2">还没有项目</h3>
                                        <p className="text-gray-500 mb-6">创建你的第一个项目开始设计吧。</p>
                                        <Link
                                            href="/canvas"
                                            className="px-6 py-3 bg-black text-white rounded-full font-medium hover:bg-gray-800 transition-colors"
                                        >
                                            创建项目
                                        </Link>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                        {projects.map((project) => (
                                            <Link key={project.id} href={`/canvas?id=${project.id}`}>
                                                <ProjectCard
                                                    title={project.title}
                                                    date={formatDate(project.updated_at)}
                                                    imageUrl={project.thumbnail || undefined}
                                                    onRename={() => void handleRenameProject(project)}
                                                    onDelete={() => void handleDeleteProject(project)}
                                                />
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </main>
            <LoginModal open={showLoginModal} onClose={() => setShowLoginModal(false)} />
        </div>
    );
}
