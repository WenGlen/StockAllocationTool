/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

/** GET /api/health — 健康檢查（version 供部署確認用） */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.json({ status: 'ok', version: 'phase0-retry', time: new Date().toISOString() });
}
