/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TransactionType =
  | 'settlement'  // 起始基準結算
  | 'buy'         // 買進
  | 'sell'        // 賣出
  | 'dividend'    // 現金股利
  | 'cash_in'     // 存入現金
  | 'cash_out'    // 領出現金
  | 'adjustment'  // 強制修正
  | 'note';       // 純注記

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  type: TransactionType;
  
  // 股票資訊 (買、賣、股利、修正、結算時使用)
  symbol?: string; // 股票代號 (如 2330)
  name?: string;   // 股票名稱 (如 台積電)
  
  // 交易明細
  shares?: number; // 成交股數
  price?: number;  // 成交單價
  broPrice?: number; // 哥哥的成交單價 / 均價 (結算與修正時用)
  amount?: number; // 成交金額 / 總額 / 變動金額
  fee?: number;    // 手續費
  tax?: number;    // 證交稅 / 代扣稅額
  payout?: number; // 實付金額 (例如股利實收金額)

  // 分帳設定
  splitType?: 'ratio' | 'shares' | 'manual'; // 分帳模式：比例 / 指定股數 / 手動
  yunRatio?: number;   // Yun 的分潤比例 (0-100)
  broRatio?: number;   // 哥哥的分潤比例 (0-100)
  yunShares?: number;  // Yun 的成交股數 (指定股數時用)
  broShares?: number;  // 哥哥的成交股數 (指定股數時用)
  
  // 歸屬成員 (存提現金、特定修正、起始結算用)
  member?: 'yun' | 'bro' | 'both'; 
  
  // 媒體與備註
  image?: string; // 截圖資料 (Base64 或 DataURL)
  note?: string;  // 備註 / 修正原因
  createdAt: string; // 建立時間 (ISO)
}

export interface Settings {
  yunDefaultRatio: number;
  broDefaultRatio: number;
}

export interface StockAlias {
  symbol: string;
  name?: string;
  aliases: string[]; // 其他在截圖中可能出現的名詞
}

export interface MemberHolding {
  shares: number;
  avgPrice: number; // 移動加權平均成本
}

export interface StockHolding {
  symbol: string;
  name: string;
  yun: MemberHolding;
  bro: MemberHolding;
  totalShares: number;
  currentPrice?: number; // 當前收盤價
  priceDate?: string;    // 當前價格日期
  priceError?: boolean;  // 價格更新是否失敗
}

export interface CashBalance {
  yun: number;
  bro: number;
  total: number;
}

// 用於計算過程中的歷史狀態
export interface LedgerState {
  cash: CashBalance;
  holdings: Record<string, StockHolding>;
}

export interface DBState {
  transactions: Transaction[];
  settings: Settings;
  stockAliases: StockAlias[];
}
