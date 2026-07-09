/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';

interface LoginScreenProps {
  clientId: string;
  /** 登入成功後呼叫（由父層重新確認登入狀態並載入資料） */
  onSuccess: () => void;
}

declare global {
  interface Window {
    google?: any;
  }
}

/**
 * 登入頁：載入 Google Identity Services，渲染「Sign in with Google」按鈕。
 * 使用者選帳號後拿到 ID token，POST 給 /api/auth 換取 httpOnly session cookie。
 */
export default function LoginScreen({ clientId, onSuccess }: LoginScreenProps) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleCredential = async (resp: any) => {
      setError(null);
      setLoading(true);
      try {
        const r = await fetch('/api/auth?action=login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: resp.credential }),
        });
        if (!r.ok) {
          const e = await r.json().catch(() => ({} as any));
          throw new Error(e.error || `登入失敗 (HTTP ${r.status})`);
        }
        onSuccess();
      } catch (e: any) {
        setError(e.message || '登入失敗');
        setLoading(false);
      }
    };

    const init = () => {
      if (!window.google?.accounts?.id || !btnRef.current) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: handleCredential });
      window.google.accounts.id.renderButton(btnRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        width: 260,
      });
    };

    if (document.getElementById('gsi-client')) {
      init();
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.id = 'gsi-client';
    s.onload = init;
    document.body.appendChild(s);
  }, [clientId]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm text-center">
        <div className="inline-flex p-3 bg-blue-600 rounded-2xl mb-4">
          <ArrowRightLeft className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-xl font-black text-gray-900 tracking-tight">YUN股票分帳</h1>
        <p className="text-sm text-gray-400 font-bold mt-1 mb-6">請用授權的 Google 帳號登入</p>
        <div className="flex justify-center" ref={btnRef} />
        {loading && <p className="text-xs text-gray-400 mt-4">登入中…</p>}
        {error && <p className="text-xs text-red-500 mt-4 font-bold">{error}</p>}
      </div>
    </div>
  );
}
