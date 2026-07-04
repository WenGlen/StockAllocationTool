/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchStockPrice } from '../lib/stock-price';

/** GET /api/stock-price?symbol=2330 — 台股每日收盤價 proxy */
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
