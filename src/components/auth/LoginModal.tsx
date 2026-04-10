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
      setMessage('邮件已发送，请检查邮箱并在 60 秒内不要重复点击。若没看到，也请先查看垃圾箱。');
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : '发送登录邮件失败';
      if (rawMessage.toLowerCase().includes('rate limit')) {
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setError('发送过于频繁，请稍等 60 秒后再试，不要连续点击。');
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
      ? `请 ${cooldown}s 后重试`
      : '发送登录链接';

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <X size={18} />
        </button>

        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">登录 Doodleverse</h2>
          <p className="text-sm text-gray-500">输入邮箱，我们会发送一个免密码登录链接。</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm text-gray-700 mb-2 block">邮箱</span>
            <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-3 focus-within:border-black">
              <Mail size={16} className="text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full outline-none text-sm"
                required
              />
            </div>
          </label>

          {message && <p className="text-sm text-green-600">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading || cooldown > 0 || !email.trim()}
            className="w-full px-4 py-3 bg-black text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {buttonText}
          </button>
        </form>
      </div>
    </div>
  );
}
