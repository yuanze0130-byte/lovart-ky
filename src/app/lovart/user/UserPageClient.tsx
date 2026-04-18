'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Coins, Calendar, User as UserIcon, Bell, LogOut, ArrowDownRight, Gift, Shield, Search, Save } from 'lucide-react';
import { LoginModal } from '@/components/auth/LoginModal';
import { useAuth } from '@/hooks/useAuth';
import { useUserCredits } from '@/hooks/useUserCredits';
import type { CreditTransactionRow } from '@/lib/supabase';

export default function UserPage() {
    const { user, session, signOut } = useAuth();
    const { credits, transactions, isLoading, refresh } = useUserCredits();
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [adminIdentifier, setAdminIdentifier] = useState('');
    const [adminCredits, setAdminCredits] = useState('80');
    const [adminNote, setAdminNote] = useState('');
    const [adminLoading, setAdminLoading] = useState(false);
    const [adminResult, setAdminResult] = useState<string | null>(null);
    const [adminError, setAdminError] = useState<string | null>(null);

    const adminEmails = useMemo(
        () => (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
            .split(',')
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean),
        []
    );

    const isAdmin = !!user?.email && adminEmails.includes(user.email.toLowerCase());

    const formatDate = (dateString: string | undefined) => {
        if (!dateString) return '未知';
        const date = new Date(dateString);
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    const formatDateTime = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const handleAdminAdjustCredits = async () => {
        if (!session?.access_token) {
            setAdminError('当前登录态无效，请重新登录后再试');
            return;
        }

        setAdminLoading(true);
        setAdminError(null);
        setAdminResult(null);

        try {
            const response = await fetch('/api/admin/credits', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    identifier: adminIdentifier,
                    credits: Number(adminCredits),
                    note: adminNote,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || '调整失败');
            }

            setAdminResult(
                `已更新 ${result.targetEmail || result.targetUserId}：${result.beforeCredits} → ${result.credits}（变动 ${result.delta >= 0 ? '+' : ''}${result.delta}）`
            );
            setAdminNote('');
        } catch (error) {
            setAdminError(error instanceof Error ? error.message : '调整失败');
        } finally {
            setAdminLoading(false);
        }
    };

    return (
        <div className="h-screen bg-white font-sans text-gray-900">
            <main className="flex h-full flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto">
                    <div className="flex items-center justify-between px-8 py-4">
                        <Link href="/" className="flex items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-gray-100">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-sm font-bold text-white">D</div>
                            <span className="text-lg font-semibold text-gray-900">Doodleverse</span>
                        </Link>

                        <div className="flex items-center gap-2">
                            <button className="relative rounded-lg p-2 transition-colors hover:bg-gray-100">
                                <Bell size={18} className="text-gray-600" />
                                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-500"></span>
                            </button>

                            {user && credits !== null && (
                                <div className="flex items-center gap-1.5 rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white">
                                    <span className="text-sm">✨</span>
                                    <span>{credits.toLocaleString()}</span>
                                </div>
                            )}

                            {!user ? (
                                <button
                                    onClick={() => setShowLoginModal(true)}
                                    className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
                                >
                                    登录
                                </button>
                            ) : (
                                <button
                                    onClick={() => void signOut()}
                                    className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-black text-xs font-semibold text-white">
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
                            <div className="flex h-full flex-col items-center justify-center">
                                <div className="max-w-md text-center">
                                    <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
                                        <UserIcon size={32} className="text-gray-400" />
                                    </div>
                                    <h2 className="mb-4 text-2xl font-bold">欢迎来到 Doodleverse</h2>
                                    <p className="mb-6 text-gray-600">登录以查看你的账户信息与积分记录。</p>
                                    <button
                                        onClick={() => setShowLoginModal(true)}
                                        className="rounded-full bg-black px-6 py-3 font-medium text-white transition-colors hover:bg-gray-800"
                                    >
                                        立即登录
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="mx-auto max-w-4xl">
                                <div className="mb-6 rounded-2xl bg-white p-8 shadow-sm">
                                    <div className="mb-8 flex items-center gap-6">
                                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-black text-2xl font-bold text-white">
                                            {(user.email?.[0] || 'U').toUpperCase()}
                                        </div>
                                        <div>
                                            <h2 className="mb-1 text-2xl font-bold text-gray-900">
                                                {user.email?.split('@')[0] || '用户'}
                                            </h2>
                                            <p className="text-gray-500">{user.email}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                        <div className="rounded-xl bg-gray-50 p-6">
                                            <div className="mb-3 flex items-center gap-3">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black">
                                                    <Coins size={20} className="text-white" />
                                                </div>
                                                <h3 className="text-lg font-semibold text-gray-900">我的积分</h3>
                                            </div>
                                            {isLoading ? (
                                                <p className="text-3xl font-bold text-gray-400">加载中...</p>
                                            ) : (
                                                <p className="text-4xl font-bold text-gray-900">{credits?.toLocaleString()}</p>
                                            )}
                                            <p className="mt-2 text-sm text-gray-500">可用于生成图片和使用 AI 功能。</p>
                                        </div>

                                        <div className="rounded-xl bg-gray-50 p-6">
                                            <div className="mb-3 flex items-center gap-3">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-800">
                                                    <Calendar size={20} className="text-white" />
                                                </div>
                                                <h3 className="text-lg font-semibold text-gray-900">加入时间</h3>
                                            </div>
                                            <p className="text-2xl font-bold text-gray-900">{formatDate(user.created_at)}</p>
                                            <p className="mt-2 text-sm text-gray-500">感谢你使用 Doodleverse。</p>
                                        </div>
                                    </div>
                                </div>

                                {isAdmin && (
                                    <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
                                        <div className="mb-4 flex items-center gap-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white">
                                                <Shield size={18} />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-semibold text-gray-900">管理员调积分</h3>
                                                <p className="text-sm text-gray-500">按邮箱或用户 ID 直接设置积分余额，并自动记录流水。</p>
                                            </div>
                                        </div>

                                        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-gray-700">目标用户（邮箱或 user_id）</label>
                                                <div className="relative">
                                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                    <input
                                                        value={adminIdentifier}
                                                        onChange={(e) => setAdminIdentifier(e.target.value)}
                                                        placeholder="例如 user@example.com 或 uuid"
                                                        className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-4 text-sm outline-none focus:border-gray-400"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-gray-700">设置为多少积分</label>
                                                <input
                                                    value={adminCredits}
                                                    onChange={(e) => setAdminCredits(e.target.value)}
                                                    type="number"
                                                    min="0"
                                                    placeholder="例如 200"
                                                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-400"
                                                />
                                            </div>
                                        </div>

                                        <div className="mb-4">
                                            <label className="mb-2 block text-sm font-medium text-gray-700">备注（可选）</label>
                                            <input
                                                value={adminNote}
                                                onChange={(e) => setAdminNote(e.target.value)}
                                                placeholder="例如：补偿测试积分 / 活动赠送"
                                                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-400"
                                            />
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => void handleAdminAdjustCredits()}
                                                disabled={adminLoading || !adminIdentifier.trim() || adminCredits === ''}
                                                className="inline-flex items-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                <Save size={16} />
                                                {adminLoading ? '保存中...' : '保存积分'}
                                            </button>

                                            {adminResult && <span className="text-sm text-green-600">{adminResult}</span>}
                                            {adminError && <span className="text-sm text-red-600">{adminError}</span>}
                                        </div>
                                    </div>
                                )}

                                <div className="rounded-2xl bg-white p-8 shadow-sm">
                                    <div className="mb-4 flex items-center justify-between">
                                        <h3 className="text-lg font-semibold text-gray-900">最近积分流水</h3>
                                        <div className="text-sm text-gray-400">最近 10 条</div>
                                    </div>

                                    {transactions.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-gray-400">
                                            暂无积分流水记录
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {transactions.map((item) => {
                                                const positive = item.amount > 0;
                                                return (
                                                    <div key={item.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${positive ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-700'}`}>
                                                                {positive ? <Gift size={18} /> : <ArrowDownRight size={18} />}
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-medium text-gray-900">{item.description || item.type}</div>
                                                                <div className="text-xs text-gray-400">{formatDateTime(item.created_at)}</div>
                                                            </div>
                                                        </div>
                                                        <div className={`text-sm font-semibold ${positive ? 'text-green-600' : 'text-gray-700'}`}>
                                                            {positive ? '+' : ''}{item.amount}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
            <LoginModal open={showLoginModal} onClose={() => setShowLoginModal(false)} />
        </div>
    );
}
