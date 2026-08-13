'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownRight, Bell, Calendar, Coins, ExternalLink, Gift, LogOut, Plus, Save, Search, Shield, ShoppingCart, TicketCheck, User as UserIcon } from 'lucide-react';
import { LoginModal } from '@/components/auth/LoginModal';
import { useAuth } from '@/hooks/useAuth';
import { useUserCredits } from '@/hooks/useUserCredits';
import { authedFetch } from '@/lib/authed-fetch';

export default function UserPage() {
  const { user, session, signOut } = useAuth();
  const { credits, transactions, isLoading, isRedeeming, redeemCode } = useUserCredits();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [redeemValue, setRedeemValue] = useState('');
  const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [adminIdentifier, setAdminIdentifier] = useState('');
  const [adminCredits, setAdminCredits] = useState('80');
  const [adminNote, setAdminNote] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminResult, setAdminResult] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user) {
      setIsAdmin(false);
      return () => { active = false; };
    }
    void authedFetch('/api/admin/credits').then((response) => {
      if (active) setIsAdmin(response.ok);
    }).catch(() => {
      if (active) setIsAdmin(false);
    });
    return () => { active = false; };
  }, [user]);

  const formatDate = (value?: string) => value
    ? new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
    : '未知';
  const formatDateTime = (value: string) => new Date(value).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  const handleAdminAdjustCredits = async () => {
    if (!session?.access_token) {
      setAdminError('当前登录状态无效，请重新登录后再试。');
      return;
    }
    setAdminLoading(true);
    setAdminError(null);
    setAdminResult(null);
    try {
      const response = await fetch('/api/admin/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ identifier: adminIdentifier, credits: Number(adminCredits), note: adminNote }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '调整失败');
      setAdminResult(`已更新 ${result.targetEmail || result.targetUserId}：${result.beforeCredits} → ${result.credits}`);
      setAdminNote('');
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : '调整失败');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleRedeemCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = redeemValue.trim();
    if (!code) {
      setRedeemError('请输入购买后获得的积分卡密。');
      return;
    }
    setRedeemSuccess(null);
    setRedeemError(null);
    try {
      const result = await redeemCode(code) as { creditsAdded?: number; currentCredits?: number };
      setRedeemValue('');
      setRedeemSuccess(`兑换成功，已到账 ${result.creditsAdded ?? 0} 积分，当前余额 ${result.currentCredits ?? 0} 积分。`);
    } catch (error) {
      setRedeemError(error instanceof Error ? error.message : '卡密兑换失败，请核对后重试。');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-[#0f1115] dark:text-gray-100">
      <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6 dark:border-white/10 dark:bg-black/30">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-black text-sm font-bold text-white">D</div>
          <span className="font-semibold">Doodleverse</span>
        </Link>
        <div className="flex items-center gap-2">
          <button type="button" className="relative grid h-9 w-9 place-items-center rounded-md hover:bg-gray-100 dark:hover:bg-white/10" title="通知">
            <Bell size={18} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-500" />
          </button>
          {user && credits !== null && <a href="#recharge" className="inline-flex items-center gap-1 rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white transition hover:bg-gray-800" aria-label={`当前 ${credits.toLocaleString()} 积分，前往充值`}><Plus size={12} />{credits.toLocaleString()} 积分</a>}
          {!user ? (
            <button type="button" onClick={() => setShowLoginModal(true)} className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white">登录</button>
          ) : (
            <button type="button" onClick={() => void signOut()} className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-white/10">
              {(user.email?.[0] || 'U').toUpperCase()}<LogOut size={14} />
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-6 md:p-8">
        {!user ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
            <div className="mb-4 grid h-20 w-20 place-items-center rounded-full bg-gray-200 dark:bg-white/10"><UserIcon size={32} /></div>
            <h1 className="text-2xl font-bold">账户中心</h1>
            <p className="mt-2 text-gray-500">登录后查看积分余额与使用记录。</p>
            <button type="button" onClick={() => setShowLoginModal(true)} className="mt-6 rounded-md bg-black px-6 py-3 font-medium text-white">立即登录</button>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
              <div className="mb-6 flex items-center gap-4">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-black text-xl font-bold text-white">{(user.email?.[0] || 'U').toUpperCase()}</div>
                <div><h1 className="text-xl font-bold">{user.email?.split('@')[0] || '用户'}</h1><p className="text-sm text-gray-500">{user.email}</p></div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg bg-gray-50 p-5 dark:bg-white/5">
                  <div className="flex items-center gap-2 text-sm font-medium"><Coins size={18} />我的积分</div>
                  <div className="mt-3 text-3xl font-bold">{isLoading ? '加载中...' : credits?.toLocaleString()}</div>
                  <p className="mt-1 text-sm text-gray-500">用于生成图片、视频和使用 AI 工具。</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-5 dark:bg-white/5">
                  <div className="flex items-center gap-2 text-sm font-medium"><Calendar size={18} />加入时间</div>
                  <div className="mt-3 text-xl font-bold">{formatDate(user.created_at)}</div>
                </div>
              </div>
            </section>

            <section id="recharge" className="scroll-mt-6 rounded-lg border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
              <div className="mb-5">
                <div className="flex items-center gap-2"><Coins size={20} /><h2 className="font-semibold">积分充值与兑换</h2></div>
                <p className="mt-1 text-sm text-gray-500">购买积分卡密后回到这里兑换，积分会立即加入当前账户。</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5 dark:border-violet-400/20 dark:from-violet-500/10 dark:to-transparent">
                  <div className="flex items-start justify-between gap-3">
                    <div><div className="text-sm font-medium text-violet-700 dark:text-violet-300">标准积分包</div><div className="mt-2 text-3xl font-bold">500 <span className="text-base font-medium">积分</span></div></div>
                    <div className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-violet-700 shadow-sm dark:bg-white/10 dark:text-violet-200">¥50</div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-gray-500">支付成功后自动发放卡密。建议在购买页填写有效邮箱，方便同时接收卡密。</p>
                  <a href="https://pay.ldxp.cn/item/v0rkqv" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200">
                    <ShoppingCart size={16} />购买 500 积分<ExternalLink size={14} />
                  </a>
                </div>
                <form onSubmit={handleRedeemCode} className="rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-center gap-2 text-sm font-semibold"><TicketCheck size={18} />输入卡密兑换</div>
                  <label htmlFor="redeem-code" className="mt-4 block text-xs font-medium text-gray-500">积分卡密</label>
                  <input id="redeem-code" value={redeemValue} onChange={(event) => setRedeemValue(event.target.value)} autoComplete="off" spellCheck={false} placeholder="粘贴购买后获得的卡密" className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-white/10 dark:bg-black/20 dark:focus:ring-violet-500/20" />
                  <button type="submit" disabled={isRedeeming || !redeemValue.trim()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-white/10 dark:hover:bg-white/15">
                    {isRedeeming ? '正在兑换...' : '立即兑换'}
                  </button>
                  {redeemSuccess && <p role="status" className="mt-3 text-sm text-green-600">{redeemSuccess}</p>}
                  {redeemError && <p role="alert" className="mt-3 text-sm text-red-600">{redeemError}</p>}
                </form>
              </div>
              <p className="mt-4 text-xs text-gray-400">购买页由第三方平台提供，仅用于购买卡密；积分需在 Doodleverse 当前账户中兑换到账。</p>
            </section>

            {isAdmin && (
              <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
                <div className="mb-4 flex items-center gap-3"><Shield size={20} /><div><h2 className="font-semibold">管理员调整积分</h2><p className="text-sm text-gray-500">按邮箱或用户 ID 设置积分余额。</p></div></div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm">目标用户<div className="relative mt-1"><Search size={15} className="absolute left-3 top-3 text-gray-400" /><input value={adminIdentifier} onChange={(event) => setAdminIdentifier(event.target.value)} className="w-full rounded-md border border-gray-200 py-2.5 pl-9 pr-3 dark:border-white/10 dark:bg-black/20" /></div></label>
                  <label className="text-sm">积分余额<input type="number" min="0" value={adminCredits} onChange={(event) => setAdminCredits(event.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2.5 dark:border-white/10 dark:bg-black/20" /></label>
                </div>
                <label className="mt-3 block text-sm">备注<input value={adminNote} onChange={(event) => setAdminNote(event.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2.5 dark:border-white/10 dark:bg-black/20" /></label>
                <div className="mt-4 flex items-center gap-3"><button type="button" onClick={() => void handleAdminAdjustCredits()} disabled={adminLoading || !adminIdentifier.trim()} className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Save size={15} />{adminLoading ? '保存中...' : '保存积分'}</button>{adminResult && <span className="text-sm text-green-600">{adminResult}</span>}{adminError && <span className="text-sm text-red-600">{adminError}</span>}</div>
              </section>
            )}

            <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
              <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">最近积分流水</h2><span className="text-sm text-gray-400">最近 10 条</span></div>
              {transactions.length === 0 ? <div className="rounded-md border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-gray-400 dark:border-white/10">暂无积分流水记录</div> : (
                <div className="space-y-2">{transactions.map((item) => { const positive = item.amount > 0; return <div key={item.id} className="flex items-center justify-between rounded-md border border-gray-100 px-4 py-3 dark:border-white/10"><div className="flex items-center gap-3"><div className={`grid h-9 w-9 place-items-center rounded-full ${positive ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-700'}`}>{positive ? <Gift size={17} /> : <ArrowDownRight size={17} />}</div><div><div className="text-sm font-medium">{item.description || item.type}</div><div className="text-xs text-gray-400">{formatDateTime(item.created_at)}</div></div></div><div className={`text-sm font-semibold ${positive ? 'text-green-600' : ''}`}>{positive ? '+' : ''}{item.amount}</div></div>; })}</div>
              )}
            </section>
          </div>
        )}
      </main>
      <LoginModal open={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </div>
  );
}
