/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 本地開發伺服器（Express + Vite middleware）。
 * 生產環境部署在 Vercel，API 由 /api/*.ts serverless functions 提供；
 * 此檔僅供本地 `npm run dev`，路由邏輯與 Vercel 共用 lib/ 同一份實作。
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
// 與 Vercel serverless 共用同一份邏輯（內聯於 api/ 檔案，避免跨目錄 import 造成 Vercel 打包失敗）
import { fetchStockPrice } from './api/stock-price';
import { analyzeScreenshot } from './api/analyze-screenshot';

const app = express();
const PORT = Number(process.env.PORT) || 5174;

// 限制 payload 大小以支援 Base64 圖片上傳
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// API: 健康檢查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// API: 台股每日收盤價（上市走 TWSE、上櫃走 TPEx）
app.get('/api/stock-price', async (req, res) => {
  const { symbol } = req.query;
  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({ error: 'Missing stock symbol parameter' });
  }
  try {
    const quote = await fetchStockPrice(symbol);
    if (!quote) {
      return res.status(404).json({ error: 'Cannot find stock price from TWSE or TPEx', symbol: symbol.trim() });
    }
    return res.json(quote);
  } catch (error) {
    console.error('[Quote Error] Fetch failed:', error);
    return res.status(500).json({ error: 'Failed to fetch stock price from official exchanges', details: String(error) });
  }
});

// API: AI 視覺解析對帳單與網銀截圖
app.post('/api/analyze-screenshot', async (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: 'Missing image data in request body' });
  }
  try {
    const result = await analyzeScreenshot(image);
    return res.json(result);
  } catch (error) {
    console.error('[Screenshot Analysis Error] API Call failed:', error);
    const msg = error instanceof Error ? error.message : 'AI Screenshot analysis failed';
    return res.status(500).json({ error: msg, details: String(error) });
  }
});

async function startServer() {
  // Vite 整合配置 (本地開發)
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Server] Running in DEVELOPMENT mode, mounting Vite...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('[Server] Running in PRODUCTION mode, serving static files...');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 [Server] Stock ledger dev server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
