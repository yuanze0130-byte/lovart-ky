'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Coins,
  Calendar,
  User as UserIcon,
  Bell,
  LogOut,
  ArrowDownRight,
  Gift,
  Shield,
  Search,
  Save,
  KeyRound,
  Upload,
} from 'lucide-react';
import { LoginModal } from '@/components/auth/LoginModal';
import { useAuth } from '@/hooks/useAuth';
import { useUserCredits } from '@/hooks/useUserCredits';

type BatchSummary = {
  id: string;
  name: string;
  credit_amount: number;
  channel: string | null;
  status: string;
  expires_at: string | null;
  created_at: string;
  totalCodes: number;
  unusedCodes: number;
  redeemedCodes: number;
  disabledCodes: number;
  expiredCodes: number;
};

type BatchCodeDetail = {
  id: string;
  code_mask: string;
  status: string;
  redeemed_by: string | null;
  redeemed_at: string | null;
  created_at: string;
  note: string | null;
  redemption: {
    id: string;
    code_id: string;
    user_id: string;
    credit_amount: number;
    transaction_id: string | null;
    created_at: string;
  } | null;
};

type BatchDetailResponse = {
  success: boolean;
  batch: BatchSummary;
  codes: BatchCodeDetail[];
  counts: {
    totalCodes: number;
    unusedCodes: number;
    redeemedCodes: number;
    disabledCodes: number;
    expiredCodes: number;
  };
  filters: {
    q: string;
    status: string;
    limit: number;
  };
};

export default function UserPage() {
  const { user, session, signOut } = useAuth();
  const { credits, transactions, redemptions, isLoading, isRedeeming, redeemCode } = useUserCredits();

  const [showLoginModal, setShowLoginModal] = useState(false);

  const [redeemCodeInput, setRedeemCodeInput] = useState('');
  const [redeemResult, setRedeemResult] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const [adminIdentifier, setAdminIdentifier] = useState('');
  const [adminCredits, setAdminCredits] = useState('80');
  const [adminNote, setAdminNote] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminResult, setAdminResult] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);

  const [batchName, setBatchName] = useState('');
  const [batchCreditAmount, setBatchCreditAmount] = useState('100');
  const [batchChannel, setBatchChannel] = useState('manual');
  const [batchExpiresAt, setBatchExpiresAt] = useState('');
  const [batchCodesCsv, setBatchCodesCsv] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchListLoading, setBatchListLoading] = useState(false);
  const [batchResult, setBatchResult] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchSummaries, setBatchSummaries] = useState<BatchSummary[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchDetailLoading, setBatchDetailLoading] = useState(false);
  const [batchDetailError, setBatchDetailError] = useState<string | null>(null);
  const [batchDetail, setBatchDetail] = useState<BatchDetailResponse | null>(null);
  const [batchDetailKeyword, setBatchDetailKeyword] = useState('');
  const [batchDetailStatus, setBatchDetailStatus] = useState('all');

  const adminEmails = useMemo(
    () =>
      (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
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

  const formatDateTime = (dateString: string | undefined) => {
    if (!dateString) return '未知';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleRedeemCode = async () => {
    if (!redeemCodeInput.trim()) {
      setRedeemError('请输入卡密');
      return;
    }

    setRedeemError(null);
    setRedeemResult(null);

    try {
      const result = await redeemCode(redeemCodeInput.trim());
      setRedeemResult(`兑换成功：+${result.creditsAdded} 积分，当前余额 ${result.currentCredits}`);
      setRedeemCodeInput('');
    } catch (error) {
      setRedeemError(error instanceof Error ? error.message : '兑换失败');
    }
  };

  const parseBatchCodes = (raw: string) =>
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(1)
      .map((line) => {
        const [code, code_hash, code_mask] = line.split(',').map((item) => item.trim());
        return { code, code_hash, code_mask };
      })
      .filter((item) => item.code_hash && item.code_mask);

  const loadBatchSummaries = async () => {
    if (!session?.access_token || !isAdmin) return;

    setBatchListLoading(true);
    setBatchError(null);

    try {
      const response = await fetch('/api/admin/redeem-codes', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || '加载批次失败');
      }
      setBatchSummaries((result.batches || []) as BatchSummary[]);
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : '加载批次失败');
    } finally {
      setBatchListLoading(false);
    }
  };

  const handleCreateBatch = async () => {
    if (!session?.access_token) {
      setBatchError('当前登录态无效，请重新登录后再试');
      return;
    }

    setBatchLoading(true);
    setBatchError(null);
    setBatchResult(null);

    try {
      const codes = parseBatchCodes(batchCodesCsv);
      const response = await fetch('/api/admin/redeem-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: batchName,
          creditAmount: Number(batchCreditAmount),
          channel: batchChannel,
          expiresAt: batchExpiresAt || null,
          codes,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || '创建批次失败');
      }

      setBatchResult(`已创建批次 ${result.batch.name}，导入 ${result.importedCount} 条卡密`);
      setBatchName('');
      setBatchCodesCsv('');
      await loadBatchSummaries();
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : '创建批次失败');
    } finally {
      setBatchLoading(false);
    }
  };

  const loadBatchDetail = async (batchId: string, options?: { keyword?: string; status?: string }) => {
    if (!session?.access_token) return;

    const nextKeyword = options?.keyword ?? batchDetailKeyword;
    const nextStatus = options?.status ?? batchDetailStatus;

    setBatchDetailLoading(true);
    setBatchDetailError(null);

    try {
      const search = new URLSearchParams();
      if (nextKeyword.trim()) search.set('q', nextKeyword.trim());
      if (nextStatus && nextStatus !== 'all') search.set('status', nextStatus);
      search.set('limit', '200');

      const response = await fetch(`/api/admin/redeem-codes/${batchId}?${search.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || '加载批次详情失败');
      }

      setSelectedBatchId(batchId);
      setBatchDetail(result as BatchDetailResponse);
    } catch (error) {
      setBatchDetailError(error instanceof Error ? error.message : '加载批次详情失败');
    } finally {
      setBatchDetailLoading(false);
    }
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

  useEffect(() => {
    if (isAdmin && session?.access_token) {
      void loadBatchSummaries();
    }
  }, [isAdmin, session?.access_token]);

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
              <div className="mx-auto max-w-4xl space-y-6">
                <div className="rounded-2xl bg-white p-8 shadow-sm">
                  <div className="mb-8 flex items-center gap-6">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-black text-2xl font-bold text-white">
                      {(user.email?.[0] || 'U').toUpperCase()}
                    </div>
                    <div>
                      <h2 className="mb-1 text-2xl font-bold text-gray-900">{user.email?.split('@')[0] || '用户'}</h2>
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

                <div className="rounded-2xl bg-white p-8 shadow-sm">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white">
                      <KeyRound size={18} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">兑换卡密</h3>
                      <p className="text-sm text-gray-500">输入卡密后会立即给当前账号充值积分。</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 md:flex-row">
                    <input
                      value={redeemCodeInput}
                      onChange={(e) => setRedeemCodeInput(e.target.value)}
                      placeholder="例如 ABCD-EFGH-IJKL"
                      className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm uppercase outline-none focus:border-gray-400"
                    />
                    <button
                      onClick={() => void handleRedeemCode()}
                      disabled={isRedeeming || !redeemCodeInput.trim()}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <KeyRound size={16} />
                      {isRedeeming ? '兑换中...' : '立即兑换'}
                    </button>
                  </div>

                  {(redeemResult || redeemError) && (
                    <div className="mt-3 text-sm">
                      {redeemResult && <div className="text-green-600">{redeemResult}</div>}
                      {redeemError && <div className="text-red-600">{redeemError}</div>}
                    </div>
                  )}

                  <div className="mt-6">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-gray-900">最近兑换记录</h4>
                      <span className="text-xs text-gray-400">最近 10 条</span>
                    </div>
                    {redemptions.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
                        暂无兑换记录
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {redemptions.map((item) => (
                          <div key={item.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3">
                            <div>
                              <div className="text-sm font-medium text-gray-900">卡密充值 +{item.credit_amount}</div>
                              <div className="text-xs text-gray-400">{formatDateTime(item.created_at)}</div>
                            </div>
                            <div className="text-xs text-gray-500">批次 {item.batch_id.slice(0, 8)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {isAdmin && (
                  <>
                    <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
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

                    <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white">
                          <Upload size={18} />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">管理员卡密批次导入</h3>
                          <p className="text-sm text-gray-500">粘贴脚本生成的 CSV 内容，创建批次并导入哈希后的卡密。</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700">批次名称</label>
                          <input
                            value={batchName}
                            onChange={(e) => setBatchName(e.target.value)}
                            placeholder="例如 五一活动第一批"
                            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-400"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700">每张卡对应积分</label>
                          <input
                            value={batchCreditAmount}
                            onChange={(e) => setBatchCreditAmount(e.target.value)}
                            type="number"
                            min="1"
                            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-400"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700">渠道标记</label>
                          <input
                            value={batchChannel}
                            onChange={(e) => setBatchChannel(e.target.value)}
                            placeholder="manual / douyin / koc"
                            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-400"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700">过期时间（可选）</label>
                          <input
                            value={batchExpiresAt}
                            onChange={(e) => setBatchExpiresAt(e.target.value)}
                            type="datetime-local"
                            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-400"
                          />
                        </div>
                      </div>

                      <div className="mt-4">
                        <label className="mb-2 block text-sm font-medium text-gray-700">CSV 内容</label>
                        <textarea
                          value={batchCodesCsv}
                          onChange={(e) => setBatchCodesCsv(e.target.value)}
                          placeholder={'code,code_hash,code_mask\nABCD-EFGH-IJKL,hash...,ABCD-EFGH-IJKL'}
                          rows={8}
                          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-400"
                        />
                        <p className="mt-2 text-xs text-gray-400">只会导入 code_hash 和 code_mask，plaintext code 不会写入数据库。</p>
                      </div>

                      <div className="mt-4 flex items-center gap-3">
                        <button
                          onClick={() => void handleCreateBatch()}
                          disabled={batchLoading || !batchName.trim() || !batchCodesCsv.trim()}
                          className="inline-flex items-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Upload size={16} />
                          {batchLoading ? '导入中...' : '创建批次并导入'}
                        </button>
                        <button
                          onClick={() => void loadBatchSummaries()}
                          disabled={batchListLoading}
                          className="rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {batchListLoading ? '刷新中...' : '刷新批次'}
                        </button>
                      </div>

                      {(batchResult || batchError) && (
                        <div className="mt-3 text-sm">
                          {batchResult && <div className="text-green-600">{batchResult}</div>}
                          {batchError && <div className="text-red-600">{batchError}</div>}
                        </div>
                      )}

                      <div className="mt-6">
                        <div className="mb-3 flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-gray-900">最近批次</h4>
                          <span className="text-xs text-gray-400">最近 20 条</span>
                        </div>
                        {batchSummaries.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
                            {batchListLoading ? '加载中...' : '暂无批次'}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {batchSummaries.map((item) => (
                              <div key={item.id} className="rounded-xl border border-gray-100 px-4 py-4">
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                  <div>
                                    <div className="text-sm font-semibold text-gray-900">{item.name}</div>
                                    <div className="text-xs text-gray-400">
                                      {item.channel || '未标记渠道'} · {item.credit_amount} 积分/张 · 创建于 {formatDateTime(item.created_at)}
                                    </div>
                                    <div className="mt-1 text-xs text-gray-500">
                                      未用 {item.unusedCodes} / 已兑 {item.redeemedCodes} / 失效 {item.expiredCodes} / 禁用 {item.disabledCodes} / 总数 {item.totalCodes}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => void loadBatchDetail(item.id, { keyword: '', status: 'all' })}
                                    className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                  >
                                    {selectedBatchId === item.id ? '刷新详情' : '查看详情'}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {selectedBatchId && (
                        <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-5">
                          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <h4 className="text-base font-semibold text-gray-900">批次详情 / 单码状态</h4>
                              <p className="text-sm text-gray-500">
                                {batchDetail?.batch?.name || '正在加载批次详情'}
                              </p>
                            </div>
                            <div className="flex flex-col gap-2 md:flex-row">
                              <input
                                value={batchDetailKeyword}
                                onChange={(e) => setBatchDetailKeyword(e.target.value.toUpperCase())}
                                placeholder="搜索 code_mask"
                                className="rounded-xl border border-gray-200 px-4 py-2 text-sm outline-none focus:border-gray-400"
                              />
                              <select
                                value={batchDetailStatus}
                                onChange={(e) => setBatchDetailStatus(e.target.value)}
                                className="rounded-xl border border-gray-200 px-4 py-2 text-sm outline-none focus:border-gray-400"
                              >
                                <option value="all">全部状态</option>
                                <option value="unused">未使用</option>
                                <option value="redeemed">已兑换</option>
                                <option value="disabled">已禁用</option>
                                <option value="expired">已过期</option>
                              </select>
                              <button
                                onClick={() => selectedBatchId && void loadBatchDetail(selectedBatchId)}
                                className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
                              >
                                筛选
                              </button>
                            </div>
                          </div>

                          {batchDetailError && <div className="mb-3 text-sm text-red-600">{batchDetailError}</div>}

                          {batchDetail && (
                            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                              <div className="rounded-xl bg-white px-4 py-3 text-sm"><div className="text-gray-400">总数</div><div className="font-semibold text-gray-900">{batchDetail.counts.totalCodes}</div></div>
                              <div className="rounded-xl bg-white px-4 py-3 text-sm"><div className="text-gray-400">未使用</div><div className="font-semibold text-gray-900">{batchDetail.counts.unusedCodes}</div></div>
                              <div className="rounded-xl bg-white px-4 py-3 text-sm"><div className="text-gray-400">已兑换</div><div className="font-semibold text-gray-900">{batchDetail.counts.redeemedCodes}</div></div>
                              <div className="rounded-xl bg-white px-4 py-3 text-sm"><div className="text-gray-400">已禁用</div><div className="font-semibold text-gray-900">{batchDetail.counts.disabledCodes}</div></div>
                              <div className="rounded-xl bg-white px-4 py-3 text-sm"><div className="text-gray-400">已过期</div><div className="font-semibold text-gray-900">{batchDetail.counts.expiredCodes}</div></div>
                            </div>
                          )}

                          {batchDetailLoading ? (
                            <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-400">加载详情中...</div>
                          ) : batchDetail?.codes?.length ? (
                            <div className="space-y-2">
                              {batchDetail.codes.map((code) => (
                                <div key={code.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                    <div>
                                      <div className="text-sm font-semibold text-gray-900">{code.code_mask}</div>
                                      <div className="text-xs text-gray-400">
                                        状态 {code.status} · 创建于 {formatDateTime(code.created_at)}
                                        {code.redeemed_at ? ` · 兑换于 ${formatDateTime(code.redeemed_at)}` : ''}
                                      </div>
                                      {code.note && <div className="mt-1 text-xs text-gray-500">备注：{code.note}</div>}
                                    </div>
                                    <div className="text-xs text-gray-500 md:text-right">
                                      <div>redeemed_by: {code.redeemed_by || '-'}</div>
                                      <div>transaction: {code.redemption?.transaction_id?.slice(0, 8) || '-'}</div>
                                      <div>user: {code.redemption?.user_id || '-'}</div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-400">没有匹配到单码记录</div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div className="rounded-2xl bg-white p-8 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">最近积分流水</h3>
                    <div className="text-sm text-gray-400">最近 20 条</div>
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
                              {positive ? '+' : ''}
                              {item.amount}
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
