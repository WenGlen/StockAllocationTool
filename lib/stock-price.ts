/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 台股每日收盤價抓取邏輯（上市走 TWSE、上櫃走 TPEx）。
 * 與框架無關：本地 Express (server.ts) 與 Vercel Serverless Function (api/stock-price.ts) 共用同一份。
 */

export interface StockQuote {
  symbol: string;
  price: number;
  date: string;
  market: 'TWSE' | 'TPEx';
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

/**
 * 依股票代號抓取最新收盤價。找不到時回傳 null（呼叫端自行決定 404）。
 * @param symbolRaw 股票代號（可含前後空白）
 */
export async function fetchStockPrice(symbolRaw: string): Promise<StockQuote | null> {
  const cleanSymbol = symbolRaw.trim();
  console.log(`[Quote] Fetching closing price for Taiwan stock: ${cleanSymbol}`);

  // 1) 優先嘗試 TWSE 上市
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

  // 2) 再試 TPEx 上櫃
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
