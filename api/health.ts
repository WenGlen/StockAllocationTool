/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

/** GET /api/health — 健康檢查 */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.json({ status: 'ok', time: new Date().toISOString() });
}
