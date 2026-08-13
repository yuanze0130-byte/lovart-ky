'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

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
}

export function TurnstileWidget({ siteKey, resetKey, onTokenChange }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const callbackRef = useRef(onTokenChange);
  const [scriptReady, setScriptReady] = useState(() => Boolean(globalThis.window?.turnstile));

  useEffect(() => {
    callbackRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    if (!scriptReady || !containerRef.current || !window.turnstile) return;

    callbackRef.current(null);
    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme: 'light',
      language: 'zh-cn',
      callback: (token) => callbackRef.current(token),
      'expired-callback': () => callbackRef.current(null),
      'error-callback': () => callbackRef.current(null),
    });

    return () => {
      window.turnstile?.remove(widgetId);
      callbackRef.current(null);
    };
  }, [resetKey, scriptReady, siteKey]);

  return (
    <>
      <Script
        id="cloudflare-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />
      <div ref={containerRef} className="min-h-[65px] overflow-hidden rounded-xl" aria-label="人机验证" />
    </>
  );
}
