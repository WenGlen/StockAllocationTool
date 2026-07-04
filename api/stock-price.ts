/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * 台股每日收盤價（上市走 TWSE、上櫃走 TPEx）。
 * 邏輯內聯於此檔（不從 api/ 外部 import），以確保 Vercel serverless 打包可靠；
 * 本地開發的 server.ts 直接 import 此檔的 `fetchStockPrice`，維持單一來源。
 */

export interface StockQuote {
  symbol: string;
  price: number;
  date: string;
  market: 'TWSE' | 'TPEx';
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

/** 依股票代號抓取最新收盤價；找不到回傳 null。 */
export async function fetchStockPrice(symbolRaw: string): Promise<StockQuote | null> {
  const cleanSymbol = symbolRaw.trim();
  console.log(`[Quote] Fetching closing price for Taiwan stock: ${cleanSymbol}`);

  // 1) TWSE 上市
  const twseUrl = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&stockNo=${cleanSymbol}`;
  const twseRes = await fetch(twseUrl, { headers: { 'User-Agent': UA } });
  if (twseRes.ok) {
    const data: any = await twseRes.json();
    if (data.stat === 'OK' && data.data && data.data.length > 0) {
      const lastRow = data.data[data.data.length - 1];
      const date = lastRow[0];
      const closePrice = parseFloat(String(lastRow[6]).replace(/,/g, ''));
      if (!isNaN(closePrice)) {
        console.log(`[Quote] TWSE Match: ${cleanSymbol} = ${closePrice} (${date})`);
        return { symbol: cleanSymbol, price: closePrice, date, market: 'TWSE' };
      }
    }
  }

  // 2) TPEx 上櫃
  console.log(`[Quote] TWSE empty or failed. Trying TPEx for ${cleanSymbol}...`);
  const tpexUrl = `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/diary_json.php?stk_no=${cleanSymbol}`;
  const tpexRes = await fetch(tpexUrl, { headers: { 'User-Agent': UA } });
  if (tpexRes.ok) {
    const data: any = await tpexRes.json();
    if (data.aaData && data.aaData.length > 0) {
      const lastRow = data.aaData[data.aaData.length - 1];
      const date = lastRow[0];
      const closePrice = parseFloat(String(lastRow[6]).replace(/,/g, ''));
      if (!isNaN(closePrice)) {
        console.log(`[Quote] TPEx Match: ${cleanSymbol} = ${closePrice} (${date})`);
        return { symbol: cleanSymbol, price: closePrice, date, market: 'TPEx' };
      }
    }
  }

  return null;
}

/** GET /api/stock-price?symbol=2330 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
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
}
