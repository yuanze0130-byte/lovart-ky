'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Coins, Calendar, User as UserIcon, Bell, LogOut, ArrowDownRight, Gift, Shield, Search, Save, Wallet, ExternalLink, Loader2, CheckCircle2 } from 'lucide-react';
import { LoginModal } from '@/components/auth/LoginModal';
import { useAuth } from '@/hooks/useAuth';
import { useUserCredits } from '@/hooks/useUserCredits';
import { authedFetch } from '@/lib/authed-fetch';

type CreditPackage = {
    id: string;
    code: string;
    name: string;
    price: number;
    credits: number;
    bonus_credits: number;
    total_credits: number;
    description: string | null;
    is_recommended: boolean;
};

type CreditOrder = {
    id: string;
    order_no: string;
    amount: number;
    credits: number;
    bonus_credits: number;
    total_credits: number;
    status: string;
    created_at: string;
    paid_at: string | null;
    credits_granted_at: string | null;
};

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
    const [packages, setPackages] = useState<CreditPackage[]>([]);
    const [packagesLoading, setPackagesLoading] = useState(false);
    const [packagesError, setPackagesError] = useState<string | null>(null);
    const [selectedPackageCode, setSelectedPackageCode] = useState<string>('');
    const [createOrderLoading, setCreateOrderLoading] = useState(false);
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [activeOrderNo, setActiveOrderNo] = useState<string | null>(null);
    const [activeOrderStatus, setActiveOrderStatus] = useState<string | null>(null);
    const [activePayUrl, setActivePayUrl] = useState<string | null>(null);
    const [myOrders, setMyOrders] = useState<CreditOrder[]>([]);

    const adminEmails = useMemo(
        () => (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
            .split(',')
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean),
        []
    );

    const isAdmin = !!user?.email && adminEmails.includes(user.email.toLowerCase());

    useEffect(() => {
        let cancelled = false;

        const loadPackages = async () => {
            setPackagesLoading(true);
            setPackagesError(null);
            try {
                const response = await fetch('/api/credit-packages');
                const payload = await response.json() as { packages?: CreditPackage[]; error?: string };
                if (!response.ok) {
                    throw new Error(payload.error || '加载套餐失败');
                }
                if (cancelled) return;
                const nextPackages = payload.packages || [];
                setPackages(nextPackages);
                setSelectedPackageCode((current) => current || nextPackages[0]?.code || '');
            } catch (error) {
                if (cancelled) return;
                setPackagesError(error instanceof Error ? error.message : '加载套餐失败');
            } finally {
                if (!cancelled) setPackagesLoading(false);
            }
        };

        void loadPackages();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!user) {
            setMyOrders([]);
            return;
        }

        let cancelled = false;
        const loadOrders = async () => {
            try {
                const response = await authedFetch('/api/pay/my-orders?limit=10');
                const payload = await response.json() as { orders?: CreditOrder[]; error?: string };
                if (!response.ok) {
                    throw new Error(payload.error || '加载订单失败');
                }
                if (!cancelled) {
                    setMyOrders(payload.orders || []);
                }
            } catch {
                if (!cancelled) {
                    setMyOrders([]);
                }
            }
        };

        void loadOrders();

        return () => {
            cancelled = true;
        };
    }, [user]);

    useEffect(() => {
        if (!user || !activeOrderNo || !activeOrderStatus || activeOrderStatus === 'paid') {
            return;
        }

        const timer = window.setInterval(async () => {
            try {
                const response = await authedFetch(`/api/pay/order-status?orderNo=${encodeURIComponent(activeOrderNo)}`);
                const payload = await response.json() as { status?: string; creditsGranted?: boolean; error?: string };
                if (!response.ok) {
                    throw new Error(payload.error || '查询订单状态失败');
                }
                if (payload.status) {
                    setActiveOrderStatus(payload.status);
                }
                if (payload.creditsGranted || payload.status === 'paid') {
                    setActiveOrderStatus('paid');
                    await refresh();
                    const ordersResponse = await authedFetch('/api/pay/my-orders?limit=10');
                    const ordersPayload = await ordersResponse.json() as { orders?: CreditOrder[] };
                    if (ordersResponse.ok) {
                        setMyOrders(ordersPayload.orders || []);
                    }
                    window.clearInterval(timer);
                }
            } catch {
                // ignore transient polling errors
            }
        }, 3000);

        return () => window.clearInterval(timer);
    }, [user, activeOrderNo, activeOrderStatus, refresh]);

    const selectedPackage = packages.find((item) => item.code === selectedPackageCode) || null;

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

    const handleCreateRechargeOrder = async () => {
        if (!user) {
            setShowLoginModal(true);
            return;
        }
        if (!selectedPackageCode) {
            setPaymentError('请先选择一个充值套餐');
            return;
        }

        setCreateOrderLoading(true);
        setPaymentError(null);

        try {
            const response = await authedFetch('/api/pay/create-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ packageCode: selectedPackageCode }),
            });
            const payload = await response.json() as {
                error?: string;
                orderNo?: string;
                status?: string;
                payUrl?: string | null;
            };

            if (!response.ok) {
                throw new Error(payload.error || '创建支付订单失败');
            }

            setActiveOrderNo(payload.orderNo || null);
            setActiveOrderStatus(payload.status || 'pending');
            setActivePayUrl(payload.payUrl || null);

            if (payload.payUrl) {
                window.open(payload.payUrl, '_blank', 'noopener,noreferrer');
            }

            const ordersResponse = await authedFetch('/api/pay/my-orders?limit=10');
            const ordersPayload = await ordersResponse.json() as { orders?: CreditOrder[] };
            if (ordersResponse.ok) {
                setMyOrders(ordersPayload.orders || []);
            }
        } catch (error) {
            setPaymentError(error instanceof Error ? error.message : '创建支付订单失败');
        } finally {
            setCreateOrderLoading(false);
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

                                <div className="mb-6 rounded-2xl bg-white p-8 shadow-sm">
                                    <div className="mb-5 flex items-start justify-between gap-4">
                                        <div>
                                            <div className="mb-2 flex items-center gap-3">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white">
                                                    <Wallet size={18} />
                                                </div>
                                                <h3 className="text-lg font-semibold text-gray-900">购买积分</h3>
                                            </div>
                                            <p className="text-sm text-gray-500">当前仅支持支付宝支付，支付成功后积分通常会在几秒内到账。</p>
                                        </div>
                                        <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">支付宝</div>
                                    </div>

                                    {packagesLoading ? (
                                        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-gray-400">加载套餐中...</div>
                                    ) : packagesError ? (
                                        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{packagesError}</div>
                                    ) : (
                                        <>
                                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                                                {packages.map((pkg) => {
                                                    const selected = pkg.code === selectedPackageCode;
                                                    return (
                                                        <button
                                                            key={pkg.id}
                                                            type="button"
                                                            onClick={() => setSelectedPackageCode(pkg.code)}
                                                            className={`relative rounded-2xl border p-5 text-left transition-all ${selected ? 'border-black bg-black text-white shadow-lg' : 'border-gray-200 bg-white hover:border-gray-400'}`}
                                                        >
                                                            <div className="mb-3 flex items-center justify-between gap-3">
                                                                <div className={`text-sm font-medium ${selected ? 'text-gray-200' : 'text-gray-500'}`}>{pkg.name}</div>
                                                                {pkg.is_recommended && (
                                                                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${selected ? 'bg-white/15 text-white' : 'bg-black text-white'}`}>推荐</span>
                                                                )}
                                                            </div>
                                                            <div className="mb-1 text-3xl font-bold">¥{Number(pkg.price).toFixed(0)}</div>
                                                            <div className={`text-sm ${selected ? 'text-gray-200' : 'text-gray-600'}`}>
                                                                {pkg.total_credits.toLocaleString()} 积分
                                                            </div>
                                                            {pkg.bonus_credits > 0 && (
                                                                <div className={`mt-2 text-xs ${selected ? 'text-gray-300' : 'text-green-600'}`}>
                                                                    含赠送 {pkg.bonus_credits} 积分
                                                                </div>
                                                            )}
                                                            {pkg.description && (
                                                                <div className={`mt-3 text-xs ${selected ? 'text-gray-300' : 'text-gray-400'}`}>{pkg.description}</div>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-5 md:flex-row md:items-center md:justify-between">
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {selectedPackage ? `${selectedPackage.name} · ¥${Number(selectedPackage.price).toFixed(2)}` : '请选择套餐'}
                                                    </div>
                                                    <div className="mt-1 text-sm text-gray-500">
                                                        {selectedPackage ? `本次到账 ${selectedPackage.total_credits.toLocaleString()} 积分` : '选择套餐后可立即跳转支付'}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => void handleCreateRechargeOrder()}
                                                    disabled={createOrderLoading || !selectedPackageCode}
                                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    {createOrderLoading ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
                                                    {createOrderLoading ? '创建订单中...' : '支付宝支付'}
                                                </button>
                                            </div>

                                            {paymentError && (
                                                <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{paymentError}</div>
                                            )}

                                            {activeOrderNo && (
                                                <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-5">
                                                    <div className="mb-3 flex items-center justify-between gap-3">
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-900">当前支付订单</div>
                                                            <div className="mt-1 text-xs text-gray-400">订单号：{activeOrderNo}</div>
                                                        </div>
                                                        <div className={`rounded-full px-3 py-1 text-xs font-medium ${activeOrderStatus === 'paid' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                                                            {activeOrderStatus === 'paid' ? '已到账' : '待支付'}
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                                        <div className="text-sm text-gray-500">
                                                            {activeOrderStatus === 'paid' ? '积分已到账，你可以继续创作了。' : '如果没有自动打开支付宝，可以手动点击下方按钮继续支付。'}
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            {activeOrderStatus === 'paid' ? (
                                                                <span className="inline-flex items-center gap-2 rounded-xl bg-green-50 px-4 py-2 text-sm font-medium text-green-600">
                                                                    <CheckCircle2 size={16} /> 支付成功
                                                                </span>
                                                            ) : activePayUrl ? (
                                                                <a
                                                                    href={activePayUrl}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                                                >
                                                                    <ExternalLink size={16} /> 继续支付
                                                                </a>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
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

                                <div className="mb-6 rounded-2xl bg-white p-8 shadow-sm">
                                    <div className="mb-4 flex items-center justify-between">
                                        <h3 className="text-lg font-semibold text-gray-900">最近充值订单</h3>
                                        <div className="text-sm text-gray-400">最近 10 条</div>
                                    </div>

                                    {myOrders.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-gray-400">
                                            暂无充值订单记录
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {myOrders.map((order) => (
                                                <div key={order.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3">
                                                    <div>
                                                        <div className="text-sm font-medium text-gray-900">订单 {order.order_no}</div>
                                                        <div className="mt-1 text-xs text-gray-400">
                                                            {formatDateTime(order.created_at)} · ¥{Number(order.amount).toFixed(2)} · 到账 {order.total_credits}
                                                        </div>
                                                    </div>
                                                    <div className={`rounded-full px-3 py-1 text-xs font-medium ${order.status === 'paid' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                                                        {order.status === 'paid' ? '已支付' : '待支付'}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

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
