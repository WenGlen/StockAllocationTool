/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Google 登入 + Email 允許清單。自包含（不從 api/ 外部 import）。
 * - GET  /api/auth            → 目前登入狀態（未登入時附 clientId 供前端渲染登入鈕）
 * - POST /api/auth?action=login  { credential }  → 驗證 Google ID token → 簽 httpOnly cookie
 * - POST /api/auth?action=logout → 清除 cookie
 * Cookie 用 Node crypto 的 HMAC 簽章（不加額外套件）。
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';

const COOKIE_NAME = 'sat_session';
const SESSION_TTL_SEC = 60 * 60 * 24 * 14; // 14 天

function sign(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

function createToken(email: string, secret: string): string {
  const payload = { email, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

function verifyToken(token: string | undefined, secret: string): { email: string } | null {
  if (!token) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { email: String(payload.email) };
  } catch {
    return null;
  }
}

function parseCookies(req: VercelRequest): Record<string, string> {
  const out: Record<string, string> = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** 從 request 取出目前登入 email（無效或不在允許清單則回 null） */
function getSessionEmail(req: VercelRequest): string | null {
  const secret = process.env.AUTH_SECRET || '';
  if (!secret) return null;
  const session = verifyToken(parseCookies(req)[COOKIE_NAME], secret);
  if (!session) return null;
  if (!allowedEmails().includes(session.email.toLowerCase())) return null;
  return session.email;
}

function isHttps(req: VercelRequest): boolean {
  const proto = (req.headers['x-forwarded-proto'] as string) || '';
  const host = (req.headers.host as string) || '';
  return proto === 'https' || (!host.includes('localhost') && !host.startsWith('127.'));
}

function setSessionCookie(req: VercelRequest, res: VercelResponse, token: string) {
  const secure = isHttps(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_SEC}; SameSite=Lax${secure}`);
}

function clearSessionCookie(req: VercelRequest, res: VercelResponse) {
  const secure = isHttps(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = (req.query.action as string) || (req.method === 'GET' ? 'me' : '');
  try {
    // 目前登入狀態
    if (action === 'me') {
      const email = getSessionEmail(req);
      return res.json({
        authenticated: !!email,
        email: email || null,
        clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || null,
      });
    }

    // 登入：驗證 Google ID token
    if (req.method === 'POST' && action === 'login') {
      const credential = req.body?.credential;
      if (!credential) return res.status(400).json({ error: 'Missing credential' });

      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const secret = process.env.AUTH_SECRET;
      if (!clientId || !secret) return res.status(500).json({ error: '伺服器登入設定不完整' });

      const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
      if (!r.ok) return res.status(401).json({ error: 'Google 驗證失敗，請重試' });
      const info: any = await r.json();

      if (info.aud !== clientId) return res.status(401).json({ error: 'Token 對象不符' });
      if (info.email_verified !== 'true' && info.email_verified !== true) {
        return res.status(401).json({ error: 'Email 未經 Google 驗證' });
      }
      const email = String(info.email || '').toLowerCase();
      if (!allowedEmails().includes(email)) {
        return res.status(403).json({ error: '此 Google 帳號沒有存取權限' });
      }

      setSessionCookie(req, res, createToken(email, secret));
      return res.json({ authenticated: true, email });
    }

    // 登出
    if (req.method === 'POST' && action === 'logout') {
      clearSessionCookie(req, res);
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('[Auth API] failed:', error);
    return res.status(500).json({ error: 'Auth failed', details: String(error) });
  }
}
