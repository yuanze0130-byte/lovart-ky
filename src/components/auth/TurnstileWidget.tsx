'use client';

import Script from 'next/script';
import { AlertCircle, CheckCircle2, LoaderCircle, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TURNSTILE_TIMEOUT_MS = 10_000;

export type TurnstileStatus = 'loading' | 'verified' | 'expired' | 'error';

type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string;
    theme?: 'light' | 'dark' | 'auto';
    language?: string;
    callback: (token: string) => void;
    'expired-callback': () => void;
    'error-callback': () => void;
  }) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

interface TurnstileWidgetProps {
  siteKey: string;
  resetKey: number;
  onTokenChange: (token: string | null) => void;
  onStatusChange?: (status: TurnstileStatus) => void;
}

export function TurnstileWidget({ siteKey, resetKey, onTokenChange, onStatusChange }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const callbackRef = useRef(onTokenChange);
  const statusCallbackRef = useRef(onStatusChange);
  const [scriptReady, setScriptReady] = useState(() => Boolean(globalThis.window?.turnstile));
  const [scriptAttempt, setScriptAttempt] = useState(0);
  const [widgetAttempt, setWidgetAttempt] = useState(0);
  const [status, setStatus] = useState<TurnstileStatus>('loading');
  const [failureMessage, setFailureMessage] = useState<string | null>(null);

  useEffect(() => {
    callbackRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    statusCallbackRef.current = onStatusChange;
  }, [onStatusChange]);

  const reportStatus = useCallback((nextStatus: TurnstileStatus, message: string | null = null) => {
    setStatus(nextStatus);
    setFailureMessage(message);
    statusCallbackRef.current?.(nextStatus);
  }, []);

  useEffect(() => {
    if (status !== 'loading') return;

    const timeout = window.setTimeout(() => {
      callbackRef.current(null);
      reportStatus('error', '安全检测响应超时，请检查网络或浏览器拦截设置后重试。');
    }, TURNSTILE_TIMEOUT_MS);

    return () => window.clearTimeout(timeout);
  }, [reportStatus, resetKey, scriptAttempt, status, widgetAttempt]);

  useEffect(() => {
    if (!scriptReady || !containerRef.current || !window.turnstile) return;

    callbackRef.current(null);
    let widgetId: string | undefined;
    let initializationErrorTimer: number | undefined;

    try {
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'light',
        language: 'zh-cn',
        callback: (token) => {
          callbackRef.current(token);
          reportStatus('verified');
        },
        'expired-callback': () => {
          callbackRef.current(null);
          reportStatus('expired', '安全检测已过期，请重新验证。');
        },
        'error-callback': () => {
          callbackRef.current(null);
          reportStatus('error', '安全检测未能完成，请检查网络或浏览器拦截设置后重试。');
        },
      });
    } catch {
      callbackRef.current(null);
      initializationErrorTimer = window.setTimeout(() => {
        reportStatus('error', '安全检测初始化失败，请重新加载。');
      }, 0);
    }

    return () => {
      if (initializationErrorTimer !== undefined) window.clearTimeout(initializationErrorTimer);
      if (widgetId) window.turnstile?.remove(widgetId);
      callbackRef.current(null);
    };
  }, [reportStatus, resetKey, scriptReady, siteKey, widgetAttempt]);

  const retry = () => {
    callbackRef.current(null);
    reportStatus('loading');

    if (window.turnstile) {
      setWidgetAttempt((value) => value + 1);
      return;
    }

    setScriptReady(false);
    setScriptAttempt((value) => value + 1);
  };

  const scriptSrc = scriptAttempt === 0
    ? TURNSTILE_SCRIPT_SRC
    : `${TURNSTILE_SCRIPT_SRC}&retry=${scriptAttempt}`;

  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/70 p-3" aria-label="人机验证">
      <Script
        key={scriptSrc}
        id={`cloudflare-turnstile-${scriptAttempt}`}
        src={scriptSrc}
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => reportStatus('error', '安全检测脚本加载失败，请检查网络或浏览器拦截设置后重试。')}
      />
      <div ref={containerRef} className="min-h-[65px] overflow-hidden rounded-lg" />
      <div className="flex items-start justify-between gap-3 text-xs" role="status" aria-live="polite">
        <div className={`flex min-w-0 items-start gap-2 ${status === 'verified' ? 'text-emerald-600' : status === 'error' ? 'text-rose-600' : status === 'expired' ? 'text-amber-700' : 'text-sky-600'}`}>
          {status === 'verified' ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : status === 'error' || status === 'expired' ? <AlertCircle size={15} className="mt-0.5 shrink-0" /> : <LoaderCircle size={15} className="mt-0.5 shrink-0 animate-spin" />}
          <span>{status === 'verified' ? '安全检测已通过' : failureMessage || '安全检测加载中，请稍候…'}</span>
        </div>
        {(status === 'error' || status === 'expired') && (
          <button type="button" onClick={retry} className="inline-flex shrink-0 items-center gap-1 font-medium text-gray-600 hover:text-gray-900">
            <RotateCcw size={13} />重新加载
          </button>
        )}
      </div>
    </div>
  );
}
