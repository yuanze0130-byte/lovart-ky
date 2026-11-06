'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, RefreshCw, LogOut } from 'lucide-react';
import { ProjectCard } from '@/components/lovart/ProjectCard';
import { LoginModal } from '@/components/auth/LoginModal';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { useSupabase } from '@/hooks/useSupabase';
import { useUserCredits } from '@/hooks/useUserCredits';
import type { ProjectRow } from '@/lib/supabase';
import { persistProjectThumbnail } from '@/lib/project-thumbnail';
import { refreshCanvasAssetUrls } from '@/lib/canvas-asset-upload';
import Link from 'next/link';
import { PROJECT_RECENCY_EVENT, readProjectRecency } from '@/lib/project-recency';

type Project = Pick<ProjectRow, 'id' | 'title' | 'thumbnail' | 'updated_at'>;

type CanvasElementThumbnailRow = {
    project_id: string;
    content: string;
    updated_at: string;
};

export default function ProjectsPage() {
    const { user, signOut, loading: authLoading } = useAuth();
    const supabase = useSupabase();
    const { credits } = useUserCredits();
    const [loadError, setLoadError] = useState('');
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [search, setSearch] = useState('');
    const [renameProject, setRenameProject] = useState<Project | null>(null);
    const [renameTitle, setRenameTitle] = useState('');
    const [renameError, setRenameError] = useState('');
    const [renaming, setRenaming] = useState(false);
    useEffect(() => { setRenameProject(null); setRenameError(''); }, [user?.id]);
    const [sort, setSort] = useState('opened');
    const [recency, setRecency] = useState<{ owner: string; times: Record<string, number> }>({ owner: '', times: {} });
    useEffect(() => {
        if (!user?.id) return;
        const owner = user.id;
        const refresh = () => setRecency({ owner, times: readProjectRecency(owner) });
        refresh();
        window.addEventListener('storage', refresh);
        window.addEventListener('focus', refresh);
        window.addEventListener(PROJECT_RECENCY_EVENT, refresh);
        return () => {
            window.removeEventListener('storage', refresh);
            window.removeEventListener('focus', refresh);
            window.removeEventListener(PROJECT_RECENCY_EVENT, refresh);
        };
    }, [user?.id]);
    const [reload, setReload] = useState(0);
    const [loadedOwner, setLoadedOwner] = useState<string | null>(null);
    const visibleProjects = useMemo(() => projects
        .filter(project => (project.title || '未命名项目').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
        .sort((a, b) => {
            if (sort === 'name') return (a.title || '').localeCompare(b.title || '', 'zh-CN');
            if (sort === 'opened' && recency.owner === user?.id) {
                const opened = (recency.times[b.id] || 0) - (recency.times[a.id] || 0);
                if (opened) return opened;
            }
            return Date.parse(b.updated_at) - Date.parse(a.updated_at);
        }), [projects, search, sort, recency, user?.id]);

    useEffect(() => {
        let cancelled = false;

        async function backfillThumbnails(rows: CanvasElementThumbnailRow[]) {
            if (!supabase) return;

            for (const row of rows) {
                if (cancelled) return;

                try {
                    const thumbnail = await persistProjectThumbnail(supabase, row.project_id, row.content);
                    if (!cancelled && thumbnail) {
                        setProjects((current) => current.map((project) =>
                            project.id === row.project_id ? { ...project, thumbnail } : project
                        ));
                    }
                } catch (error) {
                    console.warn('Failed to backfill project thumbnail:', error);
                }
            }
        }

        async function loadData() {
            if (authLoading) return;
            if (!user || !supabase) {
                setProjects([]);
                setLoadedOwner(null);
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            setLoadError('');
            try {
                const projectsResult = await supabase
                    .from('projects')
                    .select('id,title,thumbnail,updated_at')
                    .eq('user_id', user.id)
                    .order('updated_at', { ascending: false });

                if (projectsResult.error) throw projectsResult.error;
                const rawRows = (projectsResult.data || []) as Project[];
                const projectRows = await refreshCanvasAssetUrls(rawRows).catch(() => { if (!cancelled) setLoadError('缩略图暂时无法加载，项目内容仍可打开'); return rawRows.map(p => ({ ...p, thumbnail: null })); });
                if (cancelled) return;

                setProjects(projectRows);
                setLoadedOwner(user.id);
                setIsLoading(false);

                const missingThumbnailProjectIds = projectRows
                    .filter((project) => !project.thumbnail)
                    .map((project) => project.id);

                if (missingThumbnailProjectIds.length > 0) {
                    const { data: canvasRows, error: canvasError } = await supabase
                        .rpc('get_project_thumbnail_candidates', {
                            p_project_ids: missingThumbnailProjectIds,
                        });

                    if (canvasError) {
                        console.warn('Failed to load project thumbnail candidates:', canvasError);
                        return;
                    }

                    const rows = await refreshCanvasAssetUrls((canvasRows || []) as CanvasElementThumbnailRow[]).catch(() => []);
                    if (cancelled) return;

                    const derivedThumbnailMap = new Map(rows.map((row) => [row.project_id, row.content]));
                    setProjects((current) => current.map((project) => ({
                        ...project,
                        thumbnail: project.thumbnail || derivedThumbnailMap.get(project.id) || null,
                    })));
                    void backfillThumbnails(rows);
                }
            } catch (error) {
                console.error('Failed to load data:', error);
                if (!cancelled) { setLoadError('项目列表加载失败，请重试。'); setLoadedOwner(user.id); setProjects([]); }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        void loadData();
        return () => {
            cancelled = true;
        };
    }, [user, supabase, authLoading, reload]);

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
        if (!supabase || !user || renaming) return;

        const nextTitle = renameTitle.trim();
        if (!nextTitle) { setRenameError('请输入项目名称。'); return; }
        if (nextTitle === project.title) { setRenameProject(null); return; }

        setRenaming(true);
        setRenameError('');
        try {
        const { error } = await supabase
            .from('projects')
            .update({ title: nextTitle })
            .eq('id', project.id);

        if (error) {
            setRenameError('重命名失败，请检查网络后重试。原名称已保留。');
            return;
        }

        setProjects((prev) =>
            prev.map((item) =>
                item.id === project.id ? { ...item, title: nextTitle } : item
            )
        );
        setRenameProject(null);
        } catch {
            setRenameError('重命名结果暂未确认，请刷新列表核对后重试。');
        } finally { setRenaming(false); }
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

                            {user && credits !== null && (
                                <Link href="/user#recharge" aria-label={`当前 ${credits.toLocaleString()} 积分，前往充值`} className="px-3 py-1.5 bg-black text-white rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors hover:bg-gray-800">
                                    <Plus size={12} />
                                    <span className="text-sm">✨</span>
                                    <span>{credits.toLocaleString()}</span>
                                </Link>
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
                        {authLoading ? <p role="status" className="py-20 text-center text-gray-500">正在确认登录状态…</p> : !user ? (
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
                        ) : isLoading || loadedOwner !== user.id ? (
                            <div role="status" className="py-12">
                                <p className="mb-6 text-gray-500">正在读取项目库…</p>
                                <div aria-hidden="true" className="grid grid-cols-2 gap-6 lg:grid-cols-4">{Array.from({length: 8}, (_, index) => <div key={index} className="h-48 animate-pulse rounded-2xl bg-gray-100" />)}</div>
                            </div>
                        ) : (
                            <div>
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-lg font-semibold text-gray-800">
                                        项目库
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

                                <div className="mb-6 flex flex-wrap items-center gap-3">
                                    <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5"><Search size={17} className="text-gray-400" /><input type="search" aria-label="搜索项目" placeholder="搜索项目名称" value={search} onChange={event => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
                                    <select aria-label="项目排序" value={sort} onChange={event => setSort(event.target.value)} className="rounded-xl border border-gray-200 bg-transparent px-3 py-2.5 text-sm"><option value="opened">最近打开（本机）</option><option value="recent">最近编辑</option><option value="name">名称排序</option></select>
                                    <button type="button" aria-label="刷新项目列表" onClick={() => setReload(value => value + 1)} className="rounded-xl border border-gray-200 p-3 hover:bg-gray-50"><RefreshCw size={16} /></button>
                                </div>
                                {loadError && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-700">{loadError} <button onClick={() => setReload(value => value + 1)} className="underline">重试</button></p>}
                                {loadError && projects.length === 0 ? null : projects.length === 0 ? (
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
                                ) : visibleProjects.length === 0 ? (
                                    <div className="py-20 text-center"><h3 className="text-lg font-medium">没有匹配的项目</h3><p className="mt-2 text-sm text-gray-500">试试其他名称，或清除搜索查看全部项目。</p><button type="button" onClick={() => setSearch('')} className="mt-5 rounded-full border border-gray-200 px-5 py-2 text-sm">清除搜索</button></div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                        {visibleProjects.map((project) => (
                                            <Link key={project.id} href={`/canvas?id=${project.id}`}>
                                                <ProjectCard
                                                    title={project.title}
                                                    date={formatDate(project.updated_at)}
                                                    imageUrl={project.thumbnail || undefined}
                                                    onRename={() => { setRenameProject(project); setRenameTitle(project.title); setRenameError(''); }}
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
            {renameProject && user && <section aria-label="重命名项目" className="fixed bottom-6 left-1/2 z-50 w-[min(480px,calc(100vw-32px))] -translate-x-1/2 rounded-2xl border bg-white p-5 text-gray-900 shadow-xl">
                <form onSubmit={event => { event.preventDefault(); void handleRenameProject(renameProject); }}>
                    <label htmlFor="project-rename-title" className="mb-2 block text-sm font-medium">重命名项目</label>
                    <input id="project-rename-title" autoFocus maxLength={200} disabled={renaming} value={renameTitle} onChange={event => setRenameTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && !renaming) setRenameProject(null); }} className="w-full rounded-lg border p-2" />
                    {renameError && <p role="alert" className="mt-2 text-sm text-red-600">{renameError}</p>}
                    <div className="mt-3 flex justify-end gap-3"><button type="button" disabled={renaming} onClick={() => setRenameProject(null)}>取消</button><button type="submit" disabled={renaming || !renameTitle.trim()} className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-40">{renaming ? '正在保存…' : '保存名称'}</button></div>
                </form>
            </section>}
            <LoginModal open={showLoginModal} onClose={() => setShowLoginModal(false)} />
        </div>
    );
}
