'use client';

import React, { useEffect, useState } from 'react';
import { X, Mail } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

const RESEND_COOLDOWN_SECONDS = 60;

export function LoginModal({ open, onClose }: LoginModalProps) {
  const { signInWithOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = window.setTimeout(() => {
      setCooldown((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!open) {
      setLoading(false);
      setMessage(null);
      setError(null);
      setCooldown(0);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || cooldown > 0) return;

    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      await signInWithOtp(email.trim());
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setMessage('登录邮件已发送，请检查邮箱。60 秒内请勿重复点击；若未看到，也请先检查垃圾邮箱。');
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : '发送登录邮件失败';
      if (rawMessage.toLowerCase().includes('rate limit')) {
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setError('发送过于频繁，请在 60 秒后再试，不要连续点击。');
      } else {
        setError(rawMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const buttonText = loading
    ? '发送中...'
    : cooldown > 0
      ? `${cooldown}s 后重试`
      : '发送登录链接';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-2 text-gray-500 hover:bg-gray-100"
        >
          <X size={18} />
        </button>

        <div className="mb-6">
          <h2 className="mb-2 text-xl font-semibold text-gray-900">登录 Doodleverse</h2>
          <p className="text-sm text-gray-500">输入邮箱，我们会发送一个免密码登录链接。</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm text-gray-700">邮箱</span>
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-3 focus-within:border-black">
              <Mail size={16} className="text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
                required
              />
            </div>
          </label>

          {message && <p className="text-sm text-green-600">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading || cooldown > 0 || !email.trim()}
            className="w-full rounded-xl bg-black px-4 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {buttonText}
          </button>
        </form>
      </div>
    </div>
  );
}
