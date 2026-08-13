'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, Mail, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { TurnstileWidget } from '@/components/auth/TurnstileWidget';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

const RESEND_COOLDOWN_SECONDS = 60;

function getLoginErrorMessage(err: unknown) {
  const rawMessage = err instanceof Error ? err.message : '发送登录邮件失败';
  const lowerMessage = rawMessage.toLowerCase();

  if (lowerMessage.includes('rate limit')) {
    return { message: '发送过于频繁，请在 60 秒后再试，不要连续点击。', shouldCooldown: true };
  }

  if (lowerMessage.includes('captcha')) {
    return { message: '人机验证已失效，请重新完成验证后再试。', shouldCooldown: false };
  }

  if (lowerMessage.includes('token') || lowerMessage.includes('expired')) {
    return { message: '验证码无效或已过期，请检查后重试。', shouldCooldown: false };
  }

  if (lowerMessage.includes('failed to fetch')) {
    return {
      message: '无法连接 Supabase Auth。请检查 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 是否配置正确，以及 Supabase Auth 的 Site URL / Redirect URLs 是否允许当前域名。',
      shouldCooldown: false,
    };
  }

  return { message: rawMessage, shouldCooldown: false };
}

export function LoginModal({ open, onClose }: LoginModalProps) {
  const { sendEmailLogin, verifyEmailOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || '';
  const captchaRequired = Boolean(turnstileSiteKey);
  const emailOtpEnabled = process.env.NEXT_PUBLIC_AUTH_EMAIL_MODE === 'otp';

  const handleCaptchaTokenChange = useCallback((token: string | null) => {
    setCaptchaToken(token);
  }, []);

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
      setOtp('');
      setStep('email');
      setCaptchaToken(null);
    }
  }, [open]);

  if (!open) return null;

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || cooldown > 0) return;

    if (captchaRequired && !captchaToken) {
      setError('请先完成人机验证。');
      return;
    }

    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      await sendEmailLogin(email.trim(), captchaToken || undefined, emailOtpEnabled);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      if (emailOtpEnabled) {
        setStep('otp');
        setMessage('6 位验证码已发送，请检查收件箱和垃圾邮件。');
      } else {
        setMessage('登录邮件已发送，请检查收件箱和垃圾邮件。');
      }
      setCaptchaToken(null);
      setCaptchaResetKey((value) => value + 1);
    } catch (err) {
      const { message: loginError, shouldCooldown } = getLoginErrorMessage(err);
      if (shouldCooldown) {
        setCooldown(RESEND_COOLDOWN_SECONDS);
      }
      setError(loginError);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const normalizedOtp = otp.replace(/\D/g, '');
    if (normalizedOtp.length !== 6) {
      setError('请输入邮件中的 6 位验证码。');
      return;
    }

    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      await verifyEmailOtp(email.trim(), normalizedOtp);
      onClose();
    } catch (err) {
      setError(getLoginErrorMessage(err).message);
    } finally {
      setLoading(false);
    }
  };

  const buttonText = loading
    ? '发送中...'
    : cooldown > 0
      ? `${cooldown}s 后重试`
      : emailOtpEnabled ? '发送验证码' : '发送登录链接';

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
          <p className="text-sm text-gray-500">{step === 'email' ? (emailOtpEnabled ? '输入邮箱，获取 6 位免密码验证码。' : '输入邮箱，获取免密码登录链接。') : `验证码已发送至 ${email}`}</p>
        </div>

        {step === 'email' ? <form onSubmit={handleSendCode} className="space-y-4">
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

          {captchaRequired ? (
            <TurnstileWidget
              siteKey={turnstileSiteKey}
              resetKey={captchaResetKey}
              onTokenChange={handleCaptchaTokenChange}
            />
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <ShieldCheck size={15} />公测保护尚未配置，请管理员设置 Turnstile。
            </div>
          )}

          {message && <p className="text-sm text-green-600">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading || cooldown > 0 || !email.trim() || (captchaRequired && !captchaToken)}
            className="w-full rounded-xl bg-black px-4 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {buttonText}
          </button>
        </form> : (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm text-gray-700">邮箱验证码</span>
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-3 focus-within:border-black">
                <KeyRound size={16} className="text-gray-400" />
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full bg-transparent text-center text-xl tracking-[0.45em] text-gray-900 outline-none placeholder:text-gray-300"
                  required
                  autoFocus
                />
              </div>
            </label>

            {message && <p className="text-sm text-green-600">{message}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}

            <button type="submit" disabled={loading || otp.length !== 6} className="w-full rounded-xl bg-black px-4 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? '验证中...' : '验证并登录'}
            </button>
            <div className="flex items-center justify-between text-xs">
              <button type="button" onClick={() => { setStep('email'); setOtp(''); setMessage(null); setError(null); }} className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-900"><ArrowLeft size={13} />修改邮箱</button>
              <button type="button" disabled={cooldown > 0} onClick={() => { setStep('email'); setMessage(null); setError(null); }} className="text-gray-500 hover:text-gray-900 disabled:opacity-50">{cooldown > 0 ? `${cooldown}s 后可重发` : '重新发送'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
