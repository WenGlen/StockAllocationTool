/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Transaction, LedgerState, Settings, StockHolding, CashBalance } from '../types';

/**
 * 排序交易紀錄
 * 1. 依日期 (date) 由舊到新 (遞增)
 * 2. 同一天時：
 *    - 'settlement' (起始/基準結算) 最優先處理
 *    - 'adjustment' (強制修正) 其次
 *    - 依建立時間 (createdAt) 由舊到新
 */
export function sortTransactions(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    
    // 同一天，種類優先權
    const getPriority = (type: string) => {
      if (type === 'settlement') return 0;
      if (type === 'adjustment') return 1;
      return 2;
    };
    
    const priorityA = getPriority(a.type);
    const priorityB = getPriority(b.type);
    
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/**
 * 核心計算引擎：依序重算所有交易，得出最終現況
 */
export function recalculateLedger(
  transactions: Transaction[],
  settings: Settings
): LedgerState {
  const sorted = sortTransactions(transactions);
  
  const cash: CashBalance = { yun: 0, bro: 0, total: 0 };
  const holdings: Record<string, StockHolding> = {};
  
  for (const tx of sorted) {
    const symbol = tx.symbol || '';
    const name = tx.name || '';
    
    // 確保股票持股結構存在
    const initStock = (sym: string, nm: string) => {
      if (!holdings[sym]) {
        holdings[sym] = {
          symbol: sym,
          name: nm,
          yun: { shares: 0, avgPrice: 0 },
          bro: { shares: 0, avgPrice: 0 },
          totalShares: 0,
        };
      }
    };

    switch (tx.type) {
      case 'settlement': {
        // 基準結算：覆蓋該時間點的餘額/持股
        if (tx.symbol) {
          // 股票持股基準結算
          initStock(symbol, name);
          holdings[symbol].yun = {
            shares: tx.yunShares ?? 0,
            avgPrice: tx.price ?? 0,
          };
          holdings[symbol].bro = {
            shares: tx.broShares ?? 0,
            avgPrice: tx.broPrice ?? tx.price ?? 0,
          };
          holdings[symbol].totalShares = (tx.yunShares ?? 0) + (tx.broShares ?? 0);
        } else {
          // 現金餘額基準結算
          if (tx.member === 'yun') {
            cash.yun = tx.amount ?? 0;
          } else if (tx.member === 'bro') {
            cash.bro = tx.amount ?? 0;
          } else {
            // member === 'both'
            cash.yun = tx.yunShares ?? tx.amount ?? 0; // 用 yunShares 欄位借存 Yun 的現金
            cash.bro = tx.broShares ?? 0; // 用 broShares 欄位借存 哥哥的現金
          }
        }
        break;
      }
      
      case 'adjustment': {
        // 強制修正：覆蓋/調整
        if (tx.symbol) {
          initStock(symbol, name);
          if (tx.yunShares !== undefined) {
            holdings[symbol].yun.shares = tx.yunShares;
          }
          if (tx.price !== undefined) {
            holdings[symbol].yun.avgPrice = tx.price;
          }
          if (tx.broShares !== undefined) {
            holdings[symbol].bro.shares = tx.broShares;
          }
          if (tx.broPrice !== undefined) {
            holdings[symbol].bro.avgPrice = tx.broPrice;
          } else if (tx.price !== undefined && tx.broShares !== undefined) {
            // 如果沒有指定哥哥的價格但指定了股數，可沿用 price
            holdings[symbol].bro.avgPrice = tx.price;
          }
          holdings[symbol].totalShares = holdings[symbol].yun.shares + holdings[symbol].bro.shares;
        } else {
          // 現金調整
          if (tx.member === 'yun') {
            cash.yun = tx.amount ?? 0;
          } else if (tx.member === 'bro') {
            cash.bro = tx.amount ?? 0;
          } else {
            cash.yun = tx.yunShares ?? cash.yun;
            cash.bro = tx.broShares ?? cash.bro;
          }
        }
        break;
      }
      
      case 'buy': {
        initStock(symbol, name);
        const totalShares = tx.shares ?? 0;
        if (totalShares <= 0) break;
        
        let yunBuyShares = 0;
        let broBuyShares = 0;
        
        if (tx.splitType === 'shares') {
          yunBuyShares = tx.yunShares ?? 0;
          broBuyShares = tx.broShares ?? 0;
        } else {
          // 'ratio' 或預設
          const yRatio = tx.yunRatio ?? settings.yunDefaultRatio;
          yunBuyShares = Math.round(totalShares * (yRatio / 100));
          broBuyShares = totalShares - yunBuyShares; // 確保總和一致，尾差歸哥哥
        }
        
        const totalAmount = tx.amount ?? (totalShares * (tx.price ?? 0));
        const totalFee = tx.fee ?? 0;
        
        // 依股數比例分攤金額與費用
        const yunAmt = totalShares > 0 ? Math.round(totalAmount * (yunBuyShares / totalShares)) : 0;
        const broAmt = totalAmount - yunAmt;
        
        const yunFee = totalShares > 0 ? Math.round(totalFee * (yunBuyShares / totalShares)) : 0;
        const broFee = totalFee - yunFee;
        
        // 扣除現金
        cash.yun -= (yunAmt + yunFee);
        cash.bro -= (broAmt + broFee);
        
        // 更新持股及移動平均成本
        const oldYun = holdings[symbol].yun;
        const newYunShares = oldYun.shares + yunBuyShares;
        const newYunAvg = newYunShares > 0 
          ? (oldYun.shares * oldYun.avgPrice + yunAmt + yunFee) / newYunShares 
          : 0;
        holdings[symbol].yun = { shares: newYunShares, avgPrice: newYunAvg };
        
        const oldBro = holdings[symbol].bro;
        const newBroShares = oldBro.shares + broBuyShares;
        const newBroAvg = newBroShares > 0 
          ? (oldBro.shares * oldBro.avgPrice + broAmt + broFee) / newBroShares 
          : 0;
        holdings[symbol].bro = { shares: newBroShares, avgPrice: newBroAvg };
        
        holdings[symbol].totalShares = newYunShares + newBroShares;
        break;
      }
      
      case 'sell': {
        initStock(symbol, name);
        const totalShares = tx.shares ?? 0;
        if (totalShares <= 0) break;
        
        let yunSellShares = 0;
        let broSellShares = 0;
        
        if (tx.splitType === 'shares') {
          yunSellShares = Math.min(holdings[symbol].yun.shares, tx.yunShares ?? 0);
          broSellShares = Math.min(holdings[symbol].bro.shares, tx.broShares ?? 0);
        } else {
          const yRatio = tx.yunRatio ?? settings.yunDefaultRatio;
          yunSellShares = Math.min(holdings[symbol].yun.shares, Math.round(totalShares * (yRatio / 100)));
          broSellShares = Math.min(holdings[symbol].bro.shares, totalShares - yunSellShares);
        }
        
        const totalAmount = tx.amount ?? (totalShares * (tx.price ?? 0));
        const totalFee = tx.fee ?? 0;
        const totalTax = tx.tax ?? 0;
        
        // 分攤賣出金額、手續費、證交稅
        const yunAmt = totalShares > 0 ? Math.round(totalAmount * (yunSellShares / totalShares)) : 0;
        const broAmt = totalAmount - yunAmt;
        
        const yunFee = totalShares > 0 ? Math.round(totalFee * (yunSellShares / totalShares)) : 0;
        const broFee = totalFee - yunFee;
        
        const yunTax = totalShares > 0 ? Math.round(totalTax * (yunSellShares / totalShares)) : 0;
        const broTax = totalTax - yunTax;
        
        // 現金入帳 (扣手續費與證交稅)
        cash.yun += (yunAmt - yunFee - yunTax);
        cash.bro += (broAmt - broFee - broTax);
        
        // 扣減持股 (均價保持不變)
        holdings[symbol].yun.shares = Math.max(0, holdings[symbol].yun.shares - yunSellShares);
        holdings[symbol].bro.shares = Math.max(0, holdings[symbol].bro.shares - broSellShares);
        holdings[symbol].totalShares = holdings[symbol].yun.shares + holdings[symbol].bro.shares;
        break;
      }
      
      case 'dividend': {
        // 現金股利：依發放日/基準時間點的持股比例分配
        const totalPayout = tx.payout ?? tx.amount ?? 0;
        if (totalPayout <= 0) break;
        
        let yunDivRatio = 50;
        let broDivRatio = 50;
        
        if (tx.splitType === 'manual' && tx.yunRatio !== undefined) {
          yunDivRatio = tx.yunRatio;
          broDivRatio = tx.broRatio ?? (100 - yunDivRatio);
        } else {
          // 查詢該股利發放日期 (tx.date) 之前的持股比例
          const ratio = getHoldingsRatioAtDate(sorted, symbol, tx.date, tx.id);
          yunDivRatio = ratio.yun * 100;
          broDivRatio = ratio.bro * 100;
        }
        
        const yunPayout = Math.round(totalPayout * (yunDivRatio / 100));
        const broPayout = totalPayout - yunPayout;
        
        cash.yun += yunPayout;
        cash.bro += broPayout;
        break;
      }
      
      case 'cash_in': {
        const amt = tx.amount ?? 0;
        if (tx.member === 'yun') {
          cash.yun += amt;
        } else if (tx.member === 'bro') {
          cash.bro += amt;
        } else {
          // both
          const yRatio = tx.yunRatio ?? settings.yunDefaultRatio;
          const yunAmt = Math.round(amt * (yRatio / 100));
          const broAmt = amt - yunAmt;
          cash.yun += yunAmt;
          cash.bro += broAmt;
        }
        break;
      }
      
      case 'cash_out': {
        const amt = tx.amount ?? 0;
        if (tx.member === 'yun') {
          cash.yun -= amt;
        } else if (tx.member === 'bro') {
          cash.bro -= amt;
        } else {
          // both
          const yRatio = tx.yunRatio ?? settings.yunDefaultRatio;
          const yunAmt = Math.round(amt * (yRatio / 100));
          const broAmt = amt - yunAmt;
          cash.yun -= yunAmt;
          cash.bro -= broAmt;
        }
        break;
      }
      
      case 'note':
      default:
        // 純備忘，不改變帳務
        break;
    }
  }
  
  cash.total = cash.yun + cash.bro;
  return { cash, holdings };
}

/**
 * 取得特定日期、特定股票在該時間點之前的兩人持股比例
 */
export function getHoldingsRatioAtDate(
  allTransactions: Transaction[],
  symbol: string,
  date: string,
  excludeTxId?: string
): { yun: number; bro: number } {
  // 過濾出在此日期之前的交易
  const preTransactions = allTransactions.filter(t => {
    if (t.id === excludeTxId) return false;
    if (t.date !== date) {
      return t.date.localeCompare(date) < 0;
    }
    // 同一天，只取比目前排除的交易更早建立的交易
    if (excludeTxId) {
      const currentTx = allTransactions.find(x => x.id === excludeTxId);
      if (currentTx) {
        // 如果是同一天，根據 sort 順序：
        // 基準結算 (0) -> 強制修正 (1) -> 其他 (2)
        const getPriority = (type: string) => {
          if (type === 'settlement') return 0;
          if (type === 'adjustment') return 1;
          return 2;
        };
        const pT = getPriority(t.type);
        const pC = getPriority(currentTx.type);
        if (pT !== pC) {
          return pT < pC;
        }
        return t.createdAt.localeCompare(currentTx.createdAt) < 0;
      }
    }
    return false;
  });
  
  // 以預設 settings 跑一次模擬
  const defaultSettings: Settings = { yunDefaultRatio: 50, broDefaultRatio: 50 };
  const state = recalculateLedger(preTransactions, defaultSettings);
  
  const holding = state.holdings[symbol];
  if (holding && holding.totalShares > 0) {
    return {
      yun: holding.yun.shares / holding.totalShares,
      bro: holding.bro.shares / holding.totalShares,
    };
  }
  
  // 查無持股或為零，回傳預設 50/50
  return { yun: 0.5, bro: 0.5 };
}

export interface CalculatedStep {
  tx: Transaction;
  runningCashYun: number;
  runningCashBro: number;
  runningSharesYun: number;
  runningSharesBro: number;
  yunAllocatedAmt: number;
  broAllocatedAmt: number;
}

/**
 * 重算交易歷程的每一步驟，計算出每一筆交易發生後的「異動後餘額」
 */
export function calculateLedgerSteps(
  transactions: Transaction[],
  settings: Settings
): CalculatedStep[] {
  const sorted = sortTransactions(transactions);
  const steps: CalculatedStep[] = [];
  
  const cash = { yun: 0, bro: 0 };
  const holdings: Record<string, number> = {}; // symbol -> total shares
  const holdingsYun: Record<string, number> = {}; // symbol -> Yun shares
  const holdingsBro: Record<string, number> = {}; // symbol -> Bro shares
  
  for (const tx of sorted) {
    const symbol = tx.symbol || '';
    const name = tx.name || '';
    
    let yunAllocatedAmt = 0;
    let broAllocatedAmt = 0;
    
    // Initialize stock symbols
    if (symbol) {
      if (holdingsYun[symbol] === undefined) holdingsYun[symbol] = 0;
      if (holdingsBro[symbol] === undefined) holdingsBro[symbol] = 0;
      if (holdings[symbol] === undefined) holdings[symbol] = 0;
    }

    switch (tx.type) {
      case 'settlement': {
        if (symbol) {
          holdingsYun[symbol] = tx.yunShares ?? 0;
          holdingsBro[symbol] = tx.broShares ?? 0;
          holdings[symbol] = (tx.yunShares ?? 0) + (tx.broShares ?? 0);
        } else {
          if (tx.member === 'yun') {
            yunAllocatedAmt = (tx.amount ?? 0) - cash.yun;
            cash.yun = tx.amount ?? 0;
          } else if (tx.member === 'bro') {
            broAllocatedAmt = (tx.amount ?? 0) - cash.bro;
            cash.bro = tx.amount ?? 0;
          } else {
            const newYun = tx.yunShares ?? tx.amount ?? 0;
            const newBro = tx.broShares ?? 0;
            yunAllocatedAmt = newYun - cash.yun;
            broAllocatedAmt = newBro - cash.bro;
            cash.yun = newYun;
            cash.bro = newBro;
          }
        }
        break;
      }
      
      case 'adjustment': {
        if (symbol) {
          if (tx.yunShares !== undefined) holdingsYun[symbol] = tx.yunShares;
          if (tx.broShares !== undefined) holdingsBro[symbol] = tx.broShares;
          holdings[symbol] = holdingsYun[symbol] + holdingsBro[symbol];
        } else {
          if (tx.member === 'yun') {
            yunAllocatedAmt = (tx.amount ?? 0) - cash.yun;
            cash.yun = tx.amount ?? 0;
          } else if (tx.member === 'bro') {
            broAllocatedAmt = (tx.amount ?? 0) - cash.bro;
            cash.bro = tx.amount ?? 0;
          } else {
            const newYun = tx.yunShares ?? cash.yun;
            const newBro = tx.broShares ?? cash.bro;
            yunAllocatedAmt = newYun - cash.yun;
            broAllocatedAmt = newBro - cash.bro;
            cash.yun = newYun;
            cash.bro = newBro;
          }
        }
        break;
      }
      
      case 'buy': {
        const totalShares = tx.shares ?? 0;
        let yunBuyShares = 0;
        let broBuyShares = 0;
        
        if (tx.splitType === 'shares') {
          yunBuyShares = tx.yunShares ?? 0;
          broBuyShares = tx.broShares ?? 0;
        } else {
          const yRatio = tx.yunRatio ?? settings.yunDefaultRatio;
          yunBuyShares = Math.round(totalShares * (yRatio / 100));
          broBuyShares = totalShares - yunBuyShares;
        }
        
        const totalAmount = tx.amount ?? (totalShares * (tx.price ?? 0));
        const totalFee = tx.fee ?? 0;
        
        const yunAmt = totalShares > 0 ? Math.round(totalAmount * (yunBuyShares / totalShares)) : 0;
        const broAmt = totalAmount - yunAmt;
        const yunFee = totalShares > 0 ? Math.round(totalFee * (yunBuyShares / totalShares)) : 0;
        const broFee = totalFee - yunFee;
        
        yunAllocatedAmt = -(yunAmt + yunFee);
        broAllocatedAmt = -(broAmt + broFee);
        
        cash.yun += yunAllocatedAmt;
        cash.bro += broAllocatedAmt;
        
        holdingsYun[symbol] += yunBuyShares;
        holdingsBro[symbol] += broBuyShares;
        holdings[symbol] = holdingsYun[symbol] + holdingsBro[symbol];
        break;
      }
      
      case 'sell': {
        const totalShares = tx.shares ?? 0;
        let yunSellShares = 0;
        let broSellShares = 0;
        
        if (tx.splitType === 'shares') {
          yunSellShares = Math.min(holdingsYun[symbol], tx.yunShares ?? 0);
          broSellShares = Math.min(holdingsBro[symbol], tx.broShares ?? 0);
        } else {
          const yRatio = tx.yunRatio ?? settings.yunDefaultRatio;
          yunSellShares = Math.min(holdingsYun[symbol], Math.round(totalShares * (yRatio / 100)));
          broSellShares = Math.min(holdingsBro[symbol], totalShares - yunSellShares);
        }
        
        const totalAmount = tx.amount ?? (totalShares * (tx.price ?? 0));
        const totalFee = tx.fee ?? 0;
        const totalTax = tx.tax ?? 0;
        
        const yunAmt = totalShares > 0 ? Math.round(totalAmount * (yunSellShares / totalShares)) : 0;
        const broAmt = totalAmount - yunAmt;
        const yunFee = totalShares > 0 ? Math.round(totalFee * (yunSellShares / totalShares)) : 0;
        const broFee = totalFee - yunFee;
        const yunTax = totalShares > 0 ? Math.round(totalTax * (yunSellShares / totalShares)) : 0;
        const broTax = totalTax - yunTax;
        
        yunAllocatedAmt = (yunAmt - yunFee - yunTax);
        broAllocatedAmt = (broAmt - broFee - broTax);
        
        cash.yun += yunAllocatedAmt;
        cash.bro += broAllocatedAmt;
        
        holdingsYun[symbol] = Math.max(0, holdingsYun[symbol] - yunSellShares);
        holdingsBro[symbol] = Math.max(0, holdingsBro[symbol] - broSellShares);
        holdings[symbol] = holdingsYun[symbol] + holdingsBro[symbol];
        break;
      }
      
      case 'dividend': {
        const totalPayout = tx.payout ?? tx.amount ?? 0;
        let yunDivRatio = 50;
        
        if (tx.splitType === 'manual' && tx.yunRatio !== undefined) {
          yunDivRatio = tx.yunRatio;
        } else {
          // Calculate historical ratio
          const ratio = getHoldingsRatioAtDate(sorted, symbol, tx.date, tx.id);
          yunDivRatio = ratio.yun * 100;
        }
        
        yunAllocatedAmt = Math.round(totalPayout * (yunDivRatio / 100));
        broAllocatedAmt = totalPayout - yunAllocatedAmt;
        
        cash.yun += yunAllocatedAmt;
        cash.bro += broAllocatedAmt;
        break;
      }
      
      case 'cash_in': {
        const amt = tx.amount ?? 0;
        if (tx.member === 'yun') {
          yunAllocatedAmt = amt;
        } else if (tx.member === 'bro') {
          broAllocatedAmt = amt;
        } else {
          const yRatio = tx.yunRatio ?? settings.yunDefaultRatio;
          yunAllocatedAmt = Math.round(amt * (yRatio / 100));
          broAllocatedAmt = amt - yunAllocatedAmt;
        }
        cash.yun += yunAllocatedAmt;
        cash.bro += broAllocatedAmt;
        break;
      }
      
      case 'cash_out': {
        const amt = tx.amount ?? 0;
        if (tx.member === 'yun') {
          yunAllocatedAmt = -amt;
        } else if (tx.member === 'bro') {
          broAllocatedAmt = -amt;
        } else {
          const yRatio = tx.yunRatio ?? settings.yunDefaultRatio;
          const yunAmt = Math.round(amt * (yRatio / 100));
          yunAllocatedAmt = -yunAmt;
          broAllocatedAmt = -(amt - yunAmt);
        }
        cash.yun += yunAllocatedAmt;
        cash.bro += broAllocatedAmt;
        break;
      }
      
      case 'note':
      default:
        break;
    }
    
    steps.push({
      tx,
      runningCashYun: cash.yun,
      runningCashBro: cash.bro,
      runningSharesYun: symbol ? holdingsYun[symbol] : 0,
      runningSharesBro: symbol ? holdingsBro[symbol] : 0,
      yunAllocatedAmt,
      broAllocatedAmt
    });
  }
  
  return steps;
}

