/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';

/**
 * AI 視覺解析對帳單／網銀截圖（Gemini）。
 * 邏輯內聯於此檔（不從 api/ 外部 import），以確保 Vercel serverless 打包可靠；
 * 本地開發的 server.ts 直接 import 此檔的 `analyzeScreenshot`，維持單一來源。
 * 為配合 Vercel Hobby 的 10 秒上限：單一快速模型 + 8.5 秒逾時保護。
 */

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) console.warn('⚠️ Warning: GEMINI_API_KEY environment variable is not defined!');
  return new GoogleGenAI({
    apiKey: apiKey || '',
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
};

const PROMPT_TEXT = `
你是一位專業的台股記帳與理財分析助理，請仔細分析這張上傳的截圖。它可能來自：
1. 「元大證券 App」或其它台股證券對帳單（成交明細、成交紀錄表、歷史交易明細，內含多筆買進/賣出交易列於表格中）。
2. 「元大網銀/行動銀行」或其它行動銀行入帳明細（股利發放紀錄、存款息、基金配息等列表）。

請仔細辨識截圖中的「每一列（Row）/ 每一筆」紀錄，並將它們全部提取到最外層的 \`transactions\` 陣列中！

重要股票對齊對照表（請優先比對並填入股票代碼 symbol 與標準股票名稱 name）：
- 大華優利, 大華優利高股息, 大華優利高填息, 大華優利高填息30, 00918 -> symbol: "00918", name: "大華優利"
- 國泰永續, 國泰永續高股息, 00878 -> symbol: "00878", name: "國泰永續"
- 友達 -> symbol: "2409", name: "友達"
- 群創 -> symbol: "3481", name: "群創"
- 東浦 -> symbol: "3290", name: "東浦"
- 彩晶, 瀚宇彩晶 -> symbol: "6116", name: "彩晶"
- 康舒 -> symbol: "6282", name: "康舒"
- 聯電, 聯華電子 -> symbol: "2303", name: "聯電"
- 群光 -> symbol: "2385", name: "群光"
- 星宇, 星宇航空 -> symbol: "2646", name: "星宇航空"
- 瀧澤科, 台灣瀧澤 -> symbol: "6609", name: "瀧澤科"
- 台積電, 台積 -> symbol: "2330", name: "台積電"
- 台灣50, 0050, 元大台灣50 -> symbol: "0050", name: "元大台灣50"

特殊處理與解析規則：
1. 日期格式：一律轉換為西元 \`YYYY-MM-DD\`。
   - 若只有月份和日期（如 "06/17"、"06 / 17" 等），請自動結合目前年度（如 2026），填寫 \`2026-06-17\`。
   - 截圖中日期若折行（例如第一列上面是 "2026/" 下面是 "06/17"），請正確合併為 \`2026-06-17\`。
2. 交易類別 type 判斷：
   - 含有「買進」、「現股買進」、「普通買進」、「買入」-> type 設為 "buy"
   - 含有「賣出」、「現股賣出」、「普通賣出」、「賣出」-> type 設為 "sell"
   - 「大華優利」、「國泰永續」、「基金配息」、「配息」等入帳，或含有股利/配息字眼 -> type 設為 "dividend"
   - 「存款息」或銀行存款利息（如「存款息」2 元）-> type 設為 "cash_in"，不需 symbol，備註寫「銀行存款利息」，member 設為 "both"
3. 證券 App 特殊排版與欄位解析：
   - 股票明細通常有多個欄位：「日期」、「名稱/類別」、「價格/股數」、「應收付/損益」。
   - 【價格/股數】欄位通常有上下兩個數值：上方是「成交單價」（例如 33.27），下方是「成交股數」（例如 2,000）。請分開填入 \`price\` 與 \`shares\`。
   - 【應收付/損益】欄位通常有上下兩個數值：上方是淨額「應收付金額」（例如 66,418），下方是「損益」（例如 23,021，此損益僅作參考，不用填入 amount。應收付金額一律填入 \`payout\` 欄位）。
   - 下方展開的詳細欄位中：
     - 「價金」指的就是成交總金額，請填入 \`amount\`（例如 66,540）。
     - 「手續費」請填入 \`fee\`（例如 56）。
     - 「交易稅」請填入 \`tax\`（例如 66）。
     - 若為買進交易，沒有交易稅（或為 0），手續費依實際填寫。
4. 數值解析：請過濾掉逗號「,」與金錢符號「$」，精確轉換為純數字。例如 421,717 轉為 421717，32.50 轉為 32.5，手續費 361 轉為 361，交易稅 422 轉為 422。
`;

/** 建構回傳 JSON schema（在函式內呼叫，避免模組載入期就相依 Type） */
function buildResponseSchema() {
  return {
    type: Type.OBJECT,
    properties: {
      isBatch: { type: Type.BOOLEAN, description: 'Whether multiple transactions or bank entries are detected in the screenshot' },
      transactions: {
        type: Type.ARRAY,
        description: 'Array of detected transactions. Extract EVERY row/item detected in the screenshot table or list.',
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, description: "Transaction type: 'buy', 'sell', 'dividend', 'cash_in', 'cash_out', 'note'" },
            symbol: { type: Type.STRING, description: "Stock symbol, e.g. '00918', '00878', '2409', '3481' (if applicable)" },
            name: { type: Type.STRING, description: "Stock standard name, e.g. '大華優利', '國泰永續', '聯電' (if applicable)" },
            date: { type: Type.STRING, description: 'Transaction date in YYYY-MM-DD format' },
            shares: { type: Type.INTEGER, description: 'Total stock shares (成交股數) if applicable' },
            price: { type: Type.NUMBER, description: 'Unit price (成交單價/成交均價) if applicable' },
            amount: { type: Type.INTEGER, description: 'Gross transaction amount (成交價金/成交金額/總金額/存取款金額) if applicable' },
            fee: { type: Type.INTEGER, description: 'Broker fee (手續費)' },
            tax: { type: Type.INTEGER, description: 'Stock transaction tax or withholding tax (交易稅 / 證交稅 / 代扣稅額)' },
            payout: { type: Type.INTEGER, description: 'Net dividend amount (實收金額/入帳金額) for dividends' },
            note: { type: Type.STRING, description: 'A short memo or detail extracted from the screenshot' },
            member: { type: Type.STRING, description: "Belonging member: 'both', 'yun', 'bro'" },
          },
          required: ['type', 'date'],
        },
      },
    },
    required: ['isBatch', 'transactions'],
  };
}

/** 呼叫 Gemini：單一快速模型 + 8.5 秒逾時（配合 Vercel 10 秒上限，逾時給可讀錯誤） */
async function callGemini(ai: any, contents: any, config: any) {
  const MODEL = 'gemini-2.5-flash';
  const TIMEOUT_MS = 8500;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('AI 判讀逾時（超過伺服器時間上限），請讓截圖範圍小一點或稍後再試')), TIMEOUT_MS);
  });
  try {
    const response: any = await Promise.race([ai.models.generateContent({ model: MODEL, contents, config }), timeout]);
    if (!response || !response.text) throw new Error('Empty response from Gemini AI');
    return response;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 解析一張對帳／網銀截圖，回傳結構化交易 JSON。 */
export async function analyzeScreenshot(imageDataUrl: string): Promise<any> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  const ai = getGeminiClient();

  const base64Data = imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : imageDataUrl;
  const mimeType = imageDataUrl.match(/^data:([^;]+);base64,/)?.[1] || 'image/png';
  const imagePart = { inlineData: { data: base64Data, mimeType } };

  const response = await callGemini(ai, [imagePart, PROMPT_TEXT], {
    responseMimeType: 'application/json',
    responseSchema: buildResponseSchema(),
  });

  let cleanText = String(response.text).trim();
  if (cleanText.startsWith('```')) {
    cleanText = cleanText.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim();
  }
  return JSON.parse(cleanText);
}

/** POST /api/analyze-screenshot { image } */
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
