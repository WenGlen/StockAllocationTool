/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Google Sheet 資料庫 CRUD（交易 / 設定 / 股票別名）。
 * 邏輯內聯於此檔（不從 api/ 外部 import），以確保 Vercel serverless 打包可靠；
 * 本地開發的 server.ts 直接 import 此檔的 default handler 共用同一份實作。
 *
 * Sheet 分頁：Transactions / Settings / StockAliases（第 1 列為標題）。
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';

// Transactions 分頁欄位順序（必須與試算表第 1 列標題一致）
const TX_COLUMNS = [
  'id', 'date', 'type', 'symbol', 'name', 'shares', 'price', 'amount', 'fee', 'tax',
  'payout', 'splitType', 'yunRatio', 'broRatio', 'yunShares', 'broShares', 'member', 'note', 'createdAt',
] as const;

// 需轉成數字的欄位
const NUMERIC = new Set(['shares', 'price', 'amount', 'fee', 'tax', 'payout', 'yunRatio', 'broRatio', 'yunShares', 'broShares']);

const TX_TAB = 'Transactions';
const LAST_COL = colLetter(TX_COLUMNS.length); // 19 欄 -> 'S'

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key || !process.env.GOOGLE_SHEET_ID) {
    throw new Error('Google Sheet 尚未設定（GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY / GOOGLE_SHEET_ID）');
  }
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

const SHEET_ID = () => process.env.GOOGLE_SHEET_ID as string;

/** 一列陣列 -> 交易物件（只放有值的欄位） */
function rowToTx(row: any[]): Record<string, any> | null {
  const tx: Record<string, any> = {};
  TX_COLUMNS.forEach((col, i) => {
    const raw = row[i];
    if (raw === undefined || raw === null || raw === '') return;
    if (NUMERIC.has(col)) {
      const num = Number(String(raw).replace(/,/g, ''));
      if (!isNaN(num)) tx[col] = num;
    } else {
      tx[col] = String(raw);
    }
  });
  return tx.id ? tx : null; // 沒有 id 的空列略過
}

/** 交易物件 -> 一列陣列（依 TX_COLUMNS 順序） */
function txToRow(tx: Record<string, any>): any[] {
  return TX_COLUMNS.map((col) => {
    const v = tx[col];
    return v === undefined || v === null ? '' : v;
  });
}

/** 讀取整個資料庫：transactions / settings / stockAliases */
async function readDb() {
  const sheets = getSheetsClient();
  const spreadsheetId = SHEET_ID();
  const resp = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: [`${TX_TAB}!A2:${LAST_COL}`, 'Settings!A2:B', 'StockAliases!A2:B'],
  });
  const [txRange, setRange, aliasRange] = resp.data.valueRanges || [];

  const transactions = (txRange?.values || [])
    .map(rowToTx)
    .filter((t): t is Record<string, any> => !!t);

  const settings: Record<string, number> = { yunDefaultRatio: 50, broDefaultRatio: 50 };
  (setRange?.values || []).forEach((r) => {
    const [k, v] = r;
    if (k && v !== undefined && v !== '') {
      const num = Number(v);
      if (!isNaN(num)) settings[String(k).trim()] = num;
    }
  });

  const stockAliases = (aliasRange?.values || [])
    .filter((r) => r[0])
    .map((r) => ({
      symbol: String(r[0]).trim(),
      aliases: String(r[1] || '').split(',').map((a) => a.trim()).filter(Boolean),
    }));

  return { transactions, settings, stockAliases };
}

/** 新增交易（可單筆或多筆） */
async function appendTransactions(txs: Record<string, any>[]) {
  if (!txs.length) return;
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID(),
    range: `${TX_TAB}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: txs.map(txToRow) },
  });
}

/** 找出某 id 所在的試算表列號（1-based sheet row）；找不到回 -1 */
async function findRowNumberById(sheets: ReturnType<typeof getSheetsClient>, id: string): Promise<number> {
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID(),
    range: `${TX_TAB}!A2:A`,
  });
  const ids = (resp.data.values || []).map((r) => r[0]);
  const idx = ids.findIndex((v) => v === id);
  return idx === -1 ? -1 : idx + 2; // 資料從第 2 列起
}

/** 依 id 覆寫整列（傳入完整交易物件） */
async function updateTransaction(tx: Record<string, any>) {
  if (!tx.id) throw new Error('缺少交易 id');
  const sheets = getSheetsClient();
  const rowNumber = await findRowNumberById(sheets, tx.id);
  if (rowNumber === -1) throw new Error(`找不到交易 id: ${tx.id}`);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID(),
    range: `${TX_TAB}!A${rowNumber}:${LAST_COL}${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [txToRow(tx)] },
  });
}

/** 取得某分頁的數字 sheetId（gid），刪列時需要 */
async function getTabGid(sheets: ReturnType<typeof getSheetsClient>, title: string): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID(), fields: 'sheets.properties' });
  const tab = (meta.data.sheets || []).find((s) => s.properties?.title === title);
  if (!tab || tab.properties?.sheetId == null) throw new Error(`找不到分頁: ${title}`);
  return tab.properties.sheetId;
}

/** 依 id 刪除整列 */
async function deleteTransaction(id: string) {
  const sheets = getSheetsClient();
  const rowNumber = await findRowNumberById(sheets, id);
  if (rowNumber === -1) return; // 已不存在，視為成功
  const gid = await getTabGid(sheets, TX_TAB);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID(),
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: { sheetId: gid, dimension: 'ROWS', startIndex: rowNumber - 1, endIndex: rowNumber },
          },
        },
      ],
    },
  });
}

/** /api/transactions — GET 讀全部；POST 新增；PATCH 依 id 覆寫；DELETE 依 id 刪除 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    switch (req.method) {
      case 'GET': {
        const db = await readDb();
        return res.json(db);
      }
      case 'POST': {
        const body = req.body || {};
        const txs: Record<string, any>[] = Array.isArray(body)
          ? body
          : Array.isArray(body.transactions)
          ? body.transactions
          : body.id || body.type
          ? [body]
          : [];
        if (!txs.length) return res.status(400).json({ error: '沒有可新增的交易' });
        await appendTransactions(txs);
        return res.json({ ok: true, added: txs.length });
      }
      case 'PATCH': {
        const tx = req.body || {};
        if (!tx.id) return res.status(400).json({ error: '缺少交易 id' });
        await updateTransaction(tx);
        return res.json({ ok: true });
      }
      case 'DELETE': {
        const id = (req.query.id as string) || (req.body && req.body.id);
        if (!id) return res.status(400).json({ error: '缺少交易 id' });
        await deleteTransaction(id);
        return res.json({ ok: true });
      }
      default:
        res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('[Transactions API] failed:', error);
    const msg = error instanceof Error ? error.message : 'Google Sheet 操作失敗';
    return res.status(500).json({ error: msg, details: String(error) });
  }
}
