/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeScreenshot } from '../lib/analyze-screenshot';

/** POST /api/analyze-screenshot { image } — AI 視覺解析對帳／網銀截圖 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image } = req.body || {};
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
}
