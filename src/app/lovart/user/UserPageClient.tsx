'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Coins, Calendar, User as UserIcon, Bell, LogOut, ArrowDownRight, Gift, Shield, Search, Save } from 'lucide-react';
import { LoginModal } from '@/components/auth/LoginModal';
import { useAuth } from '@/hooks/useAuth';
import { useSupabase } from '@/hooks/useSupabase';
import type { UserCreditsRow, CreditTransactionRow } from '@/lib/supabase';

export default function UserPage() {
    const { user, session, signOut } = useAuth();
    const supabase = useSupabase();
    const [credits, setCredits] = useState<number | null>(null);
    const [transactions, setTransactions] = useState<CreditTransactionRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
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

    useEffect(() => {
        async function loadUserCredits() {
            if (!user || !supabase) {
                setIsLoading(false);
                return;
            }

            try {
                const [{ data, error }, { data: txData, error: txError }] = await Promise.all([
                    supabase
                        .from('user_credits')
                        .select('*')
                        .eq('user_id', user.id)
                        .single(),
                    supabase
                        .from('credit_transactions')
                        .select('*')
                        .eq('user_id', user.id)
                        .order('created_at', { ascending: false })
                        .limit(10),
                ]);

                const creditRow = data as UserCreditsRow | null;
                const txRows = (txData || []) as CreditTransactionRow[];
                if (!txError) {
                    setTransactions(txRows);
                }

                if (error && error.code === 'PGRST116') {
                    const { data: newData, error: insertError } = await supabase
                        .from('user_credits')
                        .insert({
                            user_id: user.id,
                            credits: 80,
                        })
                        .select()
                        .single();

                    if (insertError) throw insertError;
                    const insertedCredits = newData as UserCreditsRow;
                    setCredits(insertedCredits.credits);
                } else if (error) {
                    throw error;
                } else {
                    setCredits(creditRow?.credits ?? 80);
                }
            } catch (error) {
                console.error('Failed to load user credits:', error);
                setCredits(80);
            } finally {
                setIsLoading(false);
            }
        }

        loadUserCredits();
    }, [user, supabase]);

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
                `已更新 ${result.targetEmail || result.targetUserId}：${result.beforeCredits} → ${result.credits}（变化 ${result.delta >= 0 ? '+' : ''}${result.delta}）`
            );
            setAdminNote('');
        } catch (error) {
            setAdminError(error instanceof Error ? error.message : '调整失败');
        } finally {
            setAdminLoading(false);
        }
    };

    return (
        <div className="h-screen bg-white text-gray-900 font-sans dark:bg-[#0b0f17] dark:text-gray-100">
            <main className="h-full flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto">
                    <div className="flex items-center justify-between px-8 py-4">
                        <Link href="/" className="flex items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800">
                            <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-sm font-bold">D</div>
                            <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Doodleverse</span>
                        </Link>

                        <div className="flex items-center gap-2">
                            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative">
                                <Bell size={18} className="text-gray-600" />
                                <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                            </button>

                            {user && credits !== null && (
                                <div className="px-3 py-1.5 bg-black text-white rounded-full text-xs font-medium flex items-center gap-1.5">
                                    <span className="text-sm">⚡</span>
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
                                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <UserIcon size={32} className="text-gray-400" />
                                </div>
                                <h2 className="text-2xl font-bold mb-4">欢迎来到 Doodleverse</h2>
                                <p className="text-gray-600 mb-6">登录以查看您的账户信息</p>
                                <button
                                    onClick={() => setShowLoginModal(true)}
                                    className="px-6 py-3 bg-black text-white rounded-full font-medium hover:bg-gray-800 transition-colors"
                                >
                                    立即登录
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-4xl mx-auto">
                            <div className="bg-white rounded-2xl shadow-sm p-8 mb-6">
                                <div className="flex items-center gap-6 mb-8">
                                    <div className="w-20 h-20 bg-black rounded-full flex items-center justify-center text-white text-2xl font-bold">
                                        {(user.email?.[0] || 'U').toUpperCase()}
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-900 mb-1">
                                            {user.email?.split('@')[0] || '用户'}
                                        </h2>
                                        <p className="text-gray-500">{user.email}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center">
                                                <Coins size={20} className="text-white" />
                                            </div>
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">我的积分</h3>
                                        </div>
                                        {isLoading ? (
                                            <p className="text-3xl font-bold text-gray-400">加载中...</p>
                                        ) : (
                                            <p className="text-4xl font-bold text-gray-900">{credits?.toLocaleString()}</p>
                                        )}
                                        <p className="text-sm text-gray-500 mt-2">可用于生成图片和使用 AI 功能</p>
                                    </div>

                                    <div className="bg-gray-50 rounded-xl p-6">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center">
                                                <Calendar size={20} className="text-white" />
                                            </div>
                                            <h3 className="text-lg font-semibold text-gray-900">加入时间</h3>
                                        </div>
                                        <p className="text-2xl font-bold text-gray-900">
                                            {formatDate(user.created_at)}
                                        </p>
                                        <p className="text-sm text-gray-500 mt-2">感谢您使用 Doodleverse</p>
                                    </div>
                                </div>
                            </div>

                            {isAdmin && (
                                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-8 mb-6 border border-gray-100 dark:border-gray-800">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">
                                            <Shield size={18} />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-900">管理员调积分</h3>
                                            <p className="text-sm text-gray-500">按邮箱或用户 ID 直接设置积分余额，并自动记录流水。</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">目标用户（邮箱或 user_id）</label>
                                            <div className="relative">
                                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                <input
                                                    value={adminIdentifier}
                                                    onChange={(e) => setAdminIdentifier(e.target.value)}
                                                    placeholder="例如 user@example.com 或 uuid"
                                                    className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-3 text-sm outline-none focus:border-gray-400"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">设置为多少积分</label>
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
                                        <label className="block text-sm font-medium text-gray-700 mb-2">备注（可选）</label>
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
                                            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Save size={16} />
                                            {adminLoading ? '保存中...' : '保存积分'}
                                        </button>

                                        {adminResult && <span className="text-sm text-green-600">{adminResult}</span>}
                                        {adminError && <span className="text-sm text-red-600">{adminError}</span>}
                                    </div>
                                </div>
                            )}

                            <div className="bg-white rounded-2xl shadow-sm p-8 mb-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">最近积分流水</h3>
                                {transactions.length === 0 ? (
                                    <p className="text-sm text-gray-500">暂无积分变动记录。执行 SQL 建表后，新的消费记录会显示在这里。</p>
                                ) : (
                                    <div className="space-y-3">
                                        {transactions.map((tx) => {
                                            const isIncome = tx.amount > 0;
                                            return (
                                                <div key={tx.id} className="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-gray-800">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isIncome ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                                            {isIncome ? <Gift size={18} /> : <ArrowDownRight size={18} />}
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{tx.description || tx.type}</div>
                                                            <div className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(tx.created_at)}</div>
                                                        </div>
                                                    </div>
                                                    <div className={`text-sm font-semibold ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                                                        {isIncome ? '+' : ''}{tx.amount}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="bg-gray-50 rounded-xl p-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-3">关于积分</h3>
                                <ul className="space-y-2 text-gray-600">
                                    <li className="flex items-start gap-2">
                                        <span className="text-gray-400 mt-1">•</span>
                                        <span>新用户注册即获得 <strong className="text-gray-900">80 积分</strong></span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-gray-400 mt-1">•</span>
                                        <span>图片生成默认消耗 <strong className="text-gray-900">5 积分</strong>（按 t8star 口径计费）</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-gray-400 mt-1">•</span>
                                        <span>视频生成默认消耗 <strong className="text-gray-900">30 积分</strong></span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-gray-400 mt-1">•</span>
                                        <span>去背景消耗 2 积分，超分消耗 5 积分</span>
                                    </li>
                                </ul>
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
