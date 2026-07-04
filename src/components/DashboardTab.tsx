/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Coins, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  Minus, 
  RefreshCw, 
  AlertCircle, 
  DollarSign, 
  HelpCircle,
  Wrench,
  Play
} from 'lucide-react';
import { Transaction, LedgerState, Settings, StockHolding, TransactionType } from '../types';

interface DashboardTabProps {
  ledgerState: LedgerState;
  settings: Settings;
  onAddTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  onRefreshPrices: () => Promise<void>;
  loadingPrices: boolean;
  priceUpdateStatus: string;
}

export default function DashboardTab({
  ledgerState,
  settings,
  onAddTransaction,
  onRefreshPrices,
  loadingPrices,
  priceUpdateStatus,
}: DashboardTabProps) {
  const { cash, holdings } = ledgerState;

  // Modals state
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showInitialModal, setShowInitialModal] = useState(false);
  const [viewMemberTab, setViewMemberTab] = useState<'all' | 'yun' | 'bro'>('all');
  
  // Form state for Adjust
  const [adjustType, setAdjustType] = useState<'cash' | 'stock'>('cash');
  const [adjustMember, setAdjustMember] = useState<'yun' | 'bro' | 'both'>('both');
  const [adjustCashYun, setAdjustCashYun] = useState(cash.yun);
  const [adjustCashBro, setAdjustCashBro] = useState(cash.bro);
  
  const [adjustSymbol, setAdjustSymbol] = useState('');
  const [adjustName, setAdjustName] = useState('');
  const [adjustSharesYun, setAdjustSharesYun] = useState(0);
  const [adjustPriceYun, setAdjustPriceYun] = useState(0);
  const [adjustSharesBro, setAdjustSharesBro] = useState(0);
  const [adjustPriceBro, setAdjustPriceBro] = useState(0);
  const [adjustNote, setAdjustNote] = useState('');

  // Calculate market values
  let totalStockValueYun = 0;
  let totalStockCostYun = 0;
  let totalStockValueBro = 0;
  let totalStockCostBro = 0;

  const holdingsList = Object.values(holdings).filter(h => h.totalShares > 0);

  holdingsList.forEach(h => {
    const currentPrice = h.currentPrice || h.yun.avgPrice; // default to avg cost if no market price
    
    totalStockValueYun += h.yun.shares * currentPrice;
    totalStockCostYun += h.yun.shares * h.yun.avgPrice;
    
    const currentPriceBro = h.currentPrice || h.bro.avgPrice;
    totalStockValueBro += h.bro.shares * currentPriceBro;
    totalStockCostBro += h.bro.shares * h.bro.avgPrice;
  });

  const totalAssetYun = cash.yun + totalStockValueYun;
  const totalAssetBro = cash.bro + totalStockValueBro;
  const totalCombinedAsset = totalAssetYun + totalAssetBro;

  const unRealizedPnLYun = totalStockValueYun - totalStockCostYun;
  const roiYun = totalStockCostYun > 0 ? (unRealizedPnLYun / totalStockCostYun) * 100 : 0;

  const unRealizedPnLBro = totalStockValueBro - totalStockCostBro;
  const roiBro = totalStockCostBro > 0 ? (unRealizedPnLBro / totalStockCostBro) * 100 : 0;

  const combinedStockValue = totalStockValueYun + totalStockValueBro;
  const combinedStockCost = totalStockCostYun + totalStockCostBro;
  const combinedPnL = combinedStockValue - combinedStockCost;
  const combinedRoi = combinedStockCost > 0 ? (combinedPnL / combinedStockCost) * 100 : 0;

  const pctYunCash = totalCombinedAsset > 0 ? (cash.yun / totalCombinedAsset) * 100 : 0;
  const pctYunStock = totalCombinedAsset > 0 ? (totalStockValueYun / totalCombinedAsset) * 100 : 0;
  const pctBroCash = totalCombinedAsset > 0 ? (cash.bro / totalCombinedAsset) * 100 : 0;
  const pctBroStock = totalCombinedAsset > 0 ? (totalStockValueBro / totalCombinedAsset) * 100 : 0;

  // For the split two-bar view: normalize so the larger person's bar fills full width,
  // the other scales proportionally (no wasted whitespace).
  const pctYunTotal = pctYunCash + pctYunStock;
  const pctBroTotal = pctBroCash + pctBroStock;
  const maxMemberPct = Math.max(pctYunTotal, pctBroTotal) || 1;

  // Format currency
  const fmt = (num: number) => {
    return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 }).format(Math.round(num));
  };

  const openAdjustModal = (type: 'cash' | 'stock') => {
    setAdjustType(type);
    setAdjustCashYun(cash.yun);
    setAdjustCashBro(cash.bro);
    setAdjustSymbol('');
    setAdjustName('');
    setAdjustSharesYun(0);
    setAdjustPriceYun(0);
    setAdjustSharesBro(0);
    setAdjustPriceBro(0);
    setAdjustNote('');
    setShowAdjustModal(true);
  };

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (adjustType === 'cash') {
      onAddTransaction({
        date: new Date().toISOString().split('T')[0],
        type: 'adjustment',
        member: adjustMember,
        yunShares: adjustMember === 'yun' || adjustMember === 'both' ? adjustCashYun : undefined,
        broShares: adjustMember === 'bro' || adjustMember === 'both' ? adjustCashBro : undefined,
        note: adjustNote || '手動強制修正現金餘額',
      });
    } else {
      if (!adjustSymbol.trim()) return alert('請輸入股票代號');
      onAddTransaction({
        date: new Date().toISOString().split('T')[0],
        type: 'adjustment',
        symbol: adjustSymbol.trim(),
        name: adjustName.trim() || adjustSymbol.trim(),
        yunShares: adjustSharesYun,
        price: adjustPriceYun,
        broShares: adjustSharesBro,
        broPrice: adjustPriceBro,
        note: adjustNote || '手動強制修正持股股數與均價',
      });
    }
    setShowAdjustModal(false);
  };

  const handleInitialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Establish starting balance
    onAddTransaction({
      date: new Date().toISOString().split('T')[0],
      type: 'settlement',
      member: 'both',
      yunShares: adjustCashYun, // Yun starting cash
      broShares: adjustCashBro, // Brother starting cash
      note: '建立起始現金基準',
    });
    setShowInitialModal(false);
  };

  return (
    <div className="space-y-6" id="dashboard_tab">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="overview_stats_grid">
        {/* Combined Totals Card: Stock value + Cash balance stacked (totals only) */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-4" id="card_totals">
          <div className="flex items-center space-x-3">
            <div className="p-2 sm:p-3 bg-blue-50 rounded-xl text-blue-600">
              <Coins className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <p className="text-xs sm:text-sm text-gray-400 font-extrabold">股票市值 (總計)</p>
              <h3 className="text-3xl sm:text-4xl font-black font-sans text-gray-900 tracking-tight">{fmt(combinedStockValue)}</h3>
            </div>
          </div>
          <div className="flex items-center space-x-3 border-t border-gray-100 pt-4">
            <div className="p-2 sm:p-3 bg-emerald-50 rounded-xl text-emerald-600">
              <DollarSign className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <p className="text-xs sm:text-sm text-gray-400 font-extrabold">現金餘額 (總計)</p>
              <h3 className="text-3xl sm:text-4xl font-black font-sans text-gray-900 tracking-tight">{fmt(cash.total)}</h3>
            </div>
          </div>
        </div>

        {/* Unrealized PnL Card */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs relative overflow-hidden" id="card_unrealized_pnl">
          <div className="flex items-center justify-between mb-3 relative z-10">
            <div className="flex items-center space-x-3">
              <div className={`p-2 sm:p-3 rounded-xl ${combinedPnL >= 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                {combinedPnL >= 0 ? <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" /> : <TrendingDown className="w-5 h-5 sm:w-6 sm:h-6" />}
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-400 font-extrabold">未實現損益</p>
                <div className="flex items-baseline space-x-1.5">
                  <h3 className={`text-3xl sm:text-4xl font-black font-sans tracking-tight ${combinedPnL >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {combinedPnL >= 0 ? '+' : ''}{fmt(combinedPnL)}
                  </h3>
                  <span className={`text-[11px] sm:text-xs font-bold ${combinedPnL >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                    ({combinedRoi.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>
            <button 
              onClick={onRefreshPrices}
              disabled={loadingPrices}
              className="text-[11px] sm:text-xs flex items-center space-x-1 text-violet-600 hover:bg-violet-50 disabled:bg-gray-50 disabled:text-gray-400 px-2 py-1.5 rounded-lg border border-violet-100 font-extrabold transition cursor-pointer relative z-20"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingPrices ? 'animate-spin' : ''}`} />
              <span>更新報價</span>
            </button>
          </div>
          <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs sm:text-sm text-gray-400 block font-bold">Yun 損益</span>
              <span className={`text-base sm:text-lg font-extrabold ${unRealizedPnLYun >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {unRealizedPnLYun >= 0 ? '+' : ''}{fmt(unRealizedPnLYun)} <span className="text-xs sm:text-sm font-bold">({roiYun.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="border-l border-gray-100 pl-4">
              <span className="text-xs sm:text-sm text-gray-400 block font-bold">哥哥 損益</span>
              <span className={`text-base sm:text-lg font-extrabold ${unRealizedPnLBro >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {unRealizedPnLBro >= 0 ? '+' : ''}{fmt(unRealizedPnLBro)} <span className="text-xs sm:text-sm font-bold">({roiBro.toFixed(1)}%)</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {priceUpdateStatus && (
        <div className="bg-blue-50 text-blue-700 text-xs px-4 py-2.5 rounded-xl border border-blue-100 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 animate-pulse" />
          <span className="font-medium">{priceUpdateStatus}</span>
        </div>
      )}

      {/* Asset Split Visualization */}
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs" id="asset_split_panel">
        <h3 className="text-sm sm:text-base font-black text-gray-800 mb-4 flex flex-wrap items-center gap-2">
          <span>雙人資產配置比例</span>
          <span className="text-xs text-gray-400 font-bold">(現金與股票合併分配狀況)</span>
        </h3>

        {/* Wide layout: amount-primary columns + single ratio bar (percentages shown on bar) */}
        <div className="hidden md:block space-y-4 max-w-4xl mx-auto">
          <div className="grid grid-cols-4 divide-x divide-gray-100 text-center py-2">
            <div className="px-2">
              <span className="text-xs sm:text-sm text-blue-600 font-extrabold flex items-center justify-center mb-1 whitespace-nowrap">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block mr-1.5 flex-shrink-0" />
                Yun 現金
              </span>
              <span className="text-xl sm:text-2xl font-black text-gray-900 block">{fmt(cash.yun)}</span>
            </div>
            <div className="px-2">
              <span className="text-xs sm:text-sm text-cyan-600 font-extrabold flex items-center justify-center mb-1 whitespace-nowrap">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block mr-1.5 flex-shrink-0" />
                Yun 股票
              </span>
              <span className="text-xl sm:text-2xl font-black text-gray-900 block">{fmt(totalStockValueYun)}</span>
            </div>
            <div className="px-2">
              <span className="text-xs sm:text-sm text-amber-600 font-extrabold flex items-center justify-center mb-1 whitespace-nowrap">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block mr-1.5 flex-shrink-0" />
                哥哥 現金
              </span>
              <span className="text-xl sm:text-2xl font-black text-gray-900 block">{fmt(cash.bro)}</span>
            </div>
            <div className="px-2">
              <span className="text-xs sm:text-sm text-orange-600 font-extrabold flex items-center justify-center mb-1 whitespace-nowrap">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block mr-1.5 flex-shrink-0" />
                哥哥 股票
              </span>
              <span className="text-xl sm:text-2xl font-black text-gray-900 block">{fmt(totalStockValueBro)}</span>
            </div>
          </div>

          <div className="w-full h-9 bg-gray-100 rounded-full overflow-hidden flex shadow-inner border border-gray-200">
            {pctYunCash > 0 && (
              <div className="bg-blue-600 transition-all duration-500 h-full flex items-center justify-center text-[10px] text-white font-bold font-sans overflow-hidden whitespace-nowrap" style={{ width: `${pctYunCash}%` }} title={`Yun 現金: ${pctYunCash.toFixed(1)}%`}>{pctYunCash >= 7 ? `${pctYunCash.toFixed(0)}%` : ''}</div>
            )}
            {pctYunStock > 0 && (
              <div className="bg-cyan-400 transition-all duration-500 h-full flex items-center justify-center text-[10px] text-white font-bold font-sans overflow-hidden whitespace-nowrap" style={{ width: `${pctYunStock}%` }} title={`Yun 股票: ${pctYunStock.toFixed(1)}%`}>{pctYunStock >= 7 ? `${pctYunStock.toFixed(0)}%` : ''}</div>
            )}
            {pctBroCash > 0 && (
              <div className="bg-amber-500 transition-all duration-500 h-full flex items-center justify-center text-[10px] text-white font-bold font-sans overflow-hidden whitespace-nowrap" style={{ width: `${pctBroCash}%` }} title={`哥哥 現金: ${pctBroCash.toFixed(1)}%`}>{pctBroCash >= 7 ? `${pctBroCash.toFixed(0)}%` : ''}</div>
            )}
            {pctBroStock > 0 && (
              <div className="bg-orange-400 transition-all duration-500 h-full flex items-center justify-center text-[10px] text-white font-bold font-sans overflow-hidden whitespace-nowrap" style={{ width: `${pctBroStock}%` }} title={`哥哥 股票: ${pctBroStock.toFixed(1)}%`}>{pctBroStock >= 7 ? `${pctBroStock.toFixed(0)}%` : ''}</div>
            )}
          </div>
        </div>

        {/* Narrow layout: Yun amounts → two proportional bars (Yun top / 哥哥 bottom) → 哥哥 amounts */}
        <div className="block md:hidden space-y-3">
          <div className="grid grid-cols-2 divide-x divide-gray-100 text-center">
            <div className="px-2">
              <span className="text-xs text-blue-600 font-extrabold flex items-center justify-center mb-1">
                <span className="w-2 h-2 rounded-full bg-blue-600 inline-block mr-1.5" />Yun 現金
              </span>
              <span className="text-2xl font-black text-gray-900 block">{fmt(cash.yun)}</span>
            </div>
            <div className="px-2">
              <span className="text-xs text-cyan-600 font-extrabold flex items-center justify-center mb-1">
                <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block mr-1.5" />Yun 股票
              </span>
              <span className="text-2xl font-black text-gray-900 block">{fmt(totalStockValueYun)}</span>
            </div>
          </div>

          <div className="space-y-2 py-1">
            {/* Yun bar — length ∝ Yun's share of the larger member; centered, no empty track */}
            <div>
              <div className="flex justify-between items-center mb-1 px-0.5">
                <span className="text-[11px] font-black text-blue-700">Yun 合計</span>
                <span className="text-[11px] font-bold text-gray-400">{pctYunTotal.toFixed(1)}%</span>
              </div>
              <div className="w-full flex justify-center">
                <div className="h-6 rounded-full overflow-hidden flex shadow-inner border border-gray-200" style={{ width: `${(pctYunTotal / maxMemberPct) * 100}%` }}>
                  {pctYunCash > 0 && <div className="bg-blue-600 h-full flex items-center justify-center text-[9px] text-white font-bold" style={{ width: `${(pctYunCash / pctYunTotal) * 100}%` }} title={`Yun 現金: ${pctYunCash.toFixed(1)}%`}>{pctYunCash >= 10 ? `${pctYunCash.toFixed(0)}%` : ''}</div>}
                  {pctYunStock > 0 && <div className="bg-cyan-400 h-full flex items-center justify-center text-[9px] text-white font-bold" style={{ width: `${(pctYunStock / pctYunTotal) * 100}%` }} title={`Yun 股票: ${pctYunStock.toFixed(1)}%`}>{pctYunStock >= 10 ? `${pctYunStock.toFixed(0)}%` : ''}</div>}
                </div>
              </div>
            </div>
            {/* 哥哥 bar — same scale (larger fills full width) */}
            <div>
              <div className="flex justify-between items-center mb-1 px-0.5">
                <span className="text-[11px] font-black text-amber-700">哥哥 合計</span>
                <span className="text-[11px] font-bold text-gray-400">{pctBroTotal.toFixed(1)}%</span>
              </div>
              <div className="w-full flex justify-center">
                <div className="h-6 rounded-full overflow-hidden flex shadow-inner border border-gray-200" style={{ width: `${(pctBroTotal / maxMemberPct) * 100}%` }}>
                  {pctBroCash > 0 && <div className="bg-amber-500 h-full flex items-center justify-center text-[9px] text-white font-bold" style={{ width: `${(pctBroCash / pctBroTotal) * 100}%` }} title={`哥哥 現金: ${pctBroCash.toFixed(1)}%`}>{pctBroCash >= 10 ? `${pctBroCash.toFixed(0)}%` : ''}</div>}
                  {pctBroStock > 0 && <div className="bg-orange-400 h-full flex items-center justify-center text-[9px] text-white font-bold" style={{ width: `${(pctBroStock / pctBroTotal) * 100}%` }} title={`哥哥 股票: ${pctBroStock.toFixed(1)}%`}>{pctBroStock >= 10 ? `${pctBroStock.toFixed(0)}%` : ''}</div>}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 divide-x divide-gray-100 text-center">
            <div className="px-2">
              <span className="text-xs text-amber-600 font-extrabold flex items-center justify-center mb-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block mr-1.5" />哥哥 現金
              </span>
              <span className="text-2xl font-black text-gray-900 block">{fmt(cash.bro)}</span>
            </div>
            <div className="px-2">
              <span className="text-xs text-orange-600 font-extrabold flex items-center justify-center mb-1">
                <span className="w-2 h-2 rounded-full bg-orange-400 inline-block mr-1.5" />哥哥 股票
              </span>
              <span className="text-2xl font-black text-gray-900 block">{fmt(totalStockValueBro)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-gray-100 overflow-hidden" id="holdings_panel">
        <div className="px-6 py-5 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50/50">
          <div>
            <h3 className="text-base font-bold text-gray-800">雙人持股對帳明細</h3>
          </div>
          <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 text-xs">
            <button
              type="button"
              onClick={() => setViewMemberTab('all')}
              className={`px-3 py-1.5 font-bold rounded-lg transition-all cursor-pointer ${viewMemberTab === 'all' ? 'bg-white text-gray-800 shadow-xs' : 'text-gray-500 hover:text-gray-700'}`}
            >
              總持股對帳
            </button>
            <button
              type="button"
              onClick={() => setViewMemberTab('yun')}
              className={`px-3 py-1.5 font-bold rounded-lg transition-all cursor-pointer ${viewMemberTab === 'yun' ? 'bg-blue-600 text-white shadow-xs' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Yun 持股
            </button>
            <button
              type="button"
              onClick={() => setViewMemberTab('bro')}
              className={`px-3 py-1.5 font-bold rounded-lg transition-all cursor-pointer ${viewMemberTab === 'bro' ? 'bg-amber-600 text-white shadow-xs' : 'text-gray-500 hover:text-gray-700'}`}
            >
              哥哥持股
            </button>
          </div>
        </div>

        {holdingsList.length === 0 ? (
          <div className="p-12 text-center text-gray-400 flex flex-col items-center space-y-2">
            <Coins className="w-10 h-10 text-gray-300" />
            <p className="text-sm">目前無任何持股資料</p>
            <p className="text-xs">請點擊下方按鈕手動強制新增股票，或前往「上傳紀錄」上傳買進截圖</p>
          </div>
        ) : (
          <div>
            <table className="w-full table-fixed border-collapse text-left text-xs sm:text-sm">
              {viewMemberTab === 'all' ? (
                <colgroup>
                  <col className="w-[21%]" />
                  <col className="w-[14%]" />
                  <col className="w-[22%]" />
                  <col className="w-[21%]" />
                  <col className="w-[22%]" />
                </colgroup>
              ) : (
                <colgroup>
                  <col className="w-[28%]" />
                  <col className="w-[20%]" />
                  <col className="w-[26%]" />
                  <col className="w-[26%]" />
                </colgroup>
              )}
              <thead>
                <tr className="bg-gray-100/60 text-gray-500 border-b border-gray-100 text-[11px] sm:text-xs">
                  <th className="py-2.5 px-2 font-black text-gray-700">股票</th>
                  <th className="py-2.5 px-1.5 font-black text-right text-gray-700">現價</th>
                  {viewMemberTab === 'all' ? (
                    <>
                      <th className="py-2.5 px-1.5 font-black text-right text-gray-700">總張數/市值</th>
                      <th className="py-2.5 px-1.5 font-black text-right text-blue-800 bg-blue-50/40">Yun 張/市值</th>
                      <th className="py-2.5 px-2 font-black text-right text-amber-800 bg-amber-50/40">哥哥 張/市值</th>
                    </>
                  ) : (
                    <>
                      <th className="py-2.5 px-2 font-black text-right text-gray-700">持有張數/市值</th>
                      <th className="py-2.5 px-2.5 font-black text-right text-gray-700">均價/損益</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-sans align-top">
                {holdingsList.map((h) => {
                  const currPrice = h.currentPrice || h.yun.avgPrice;
                  const currPriceBro = h.currentPrice || h.bro.avgPrice;
                  const valueYun = h.yun.shares * currPrice;
                  const costYun = h.yun.shares * h.yun.avgPrice;
                  const pnlYun = valueYun - costYun;
                  const roiPercentYun = costYun > 0 ? (pnlYun / costYun) * 100 : 0;
                  const valueBro = h.bro.shares * currPriceBro;
                  const costBro = h.bro.shares * h.bro.avgPrice;
                  const pnlBro = valueBro - costBro;
                  const roiPercentBro = costBro > 0 ? (pnlBro / costBro) * 100 : 0;
                  const totalVal = valueYun + valueBro;
                  const fmtShares = (s: number) => parseFloat((s / 1000).toFixed(3)).toLocaleString();

                  if (viewMemberTab === 'yun' && h.yun.shares === 0) return null;
                  if (viewMemberTab === 'bro' && h.bro.shares === 0) return null;

                  const mShares = viewMemberTab === 'bro' ? h.bro.shares : h.yun.shares;
                  const mValue = viewMemberTab === 'bro' ? valueBro : valueYun;
                  const mAvg = viewMemberTab === 'bro' ? h.bro.avgPrice : h.yun.avgPrice;
                  const mPnl = viewMemberTab === 'bro' ? pnlBro : pnlYun;
                  const mRoi = viewMemberTab === 'bro' ? roiPercentBro : roiPercentYun;

                  return (
                    <tr key={h.symbol} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3 px-2">
                        <div className="font-black text-gray-900 text-sm sm:text-base break-words leading-tight">{h.name}</div>
                        <div className="text-[11px] text-gray-400 font-bold font-mono">{h.symbol}</div>
                      </td>
                      <td className="py-3 px-1.5 text-right whitespace-nowrap tabular-nums">
                        <div className="font-black text-gray-800 text-sm sm:text-lg">{fmt(viewMemberTab === 'bro' ? currPriceBro : currPrice)}</div>
                        {h.priceDate && <div className="text-[10px] text-gray-400">{h.priceDate}</div>}
                        {h.priceError && <div className="text-[10px] text-red-400">更新失敗</div>}
                      </td>

                      {viewMemberTab === 'all' ? (
                        <>
                          <td className="py-3 px-1.5 text-right whitespace-nowrap tabular-nums">
                            <div className="font-black text-gray-800 text-sm sm:text-lg">{fmtShares(h.totalShares)}<span className="text-[10px] text-gray-400 font-bold"> 張</span></div>
                            <div className="text-[11px] sm:text-sm font-bold text-gray-500">{fmt(totalVal)}</div>
                          </td>
                          <td className="py-3 px-1.5 text-right bg-blue-50/20 whitespace-nowrap tabular-nums">
                            <div className="font-black text-blue-900 text-sm sm:text-lg">{fmtShares(h.yun.shares)}<span className="text-[10px] text-gray-400 font-bold"> 張</span></div>
                            <div className="text-[11px] sm:text-sm font-bold text-gray-500">{fmt(valueYun)}</div>
                          </td>
                          <td className="py-3 px-2 text-right bg-amber-50/20 whitespace-nowrap tabular-nums">
                            <div className="font-black text-amber-900 text-sm sm:text-lg">{fmtShares(h.bro.shares)}<span className="text-[10px] text-gray-400 font-bold"> 張</span></div>
                            <div className="text-[11px] sm:text-sm font-bold text-gray-500">{fmt(valueBro)}</div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-3 px-2 text-right whitespace-nowrap tabular-nums">
                            <div className={`font-black text-base sm:text-xl ${viewMemberTab === 'yun' ? 'text-blue-900' : 'text-amber-900'}`}>{fmtShares(mShares)}<span className="text-xs text-gray-400 font-bold"> 張</span></div>
                            <div className="text-sm sm:text-base font-bold text-gray-500">{fmt(mValue)}</div>
                          </td>
                          <td className="py-3 px-2.5 text-right whitespace-nowrap tabular-nums">
                            <div className="text-gray-600 text-xs sm:text-sm">均價 {mAvg.toFixed(2)}</div>
                            <div className={`font-black text-sm sm:text-base ${mPnl >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>{mPnl >= 0 ? '+' : ''}{fmt(mPnl)} <span className="text-[10px] font-bold">({mRoi.toFixed(1)}%)</span></div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {viewMemberTab === 'all' && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50/60 font-sans">
                    <td className="py-3 px-2 font-black text-gray-700">合計</td>
                    <td className="py-3 px-1.5" />
                    <td className="py-3 px-1.5 text-right font-black text-gray-800 text-[11px] sm:text-sm whitespace-nowrap tabular-nums">{fmt(combinedStockValue)}</td>
                    <td className="py-3 px-1.5 text-right font-black text-blue-900 bg-blue-50/20 text-[11px] sm:text-sm whitespace-nowrap tabular-nums">{fmt(totalStockValueYun)}</td>
                    <td className="py-3 px-2 text-right font-black text-amber-900 bg-amber-50/20 text-[11px] sm:text-sm whitespace-nowrap tabular-nums">{fmt(totalStockValueBro)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

        )}
      </div>

      {/* Bottom Administrative/Maintenance Controls */}
      <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200/60 flex flex-col md:flex-row items-center justify-between gap-4 mt-8" id="admin_maintenance_panel">
        <div>
          <h4 className="text-sm font-bold text-gray-700 flex items-center space-x-1.5">
            <Wrench className="w-4 h-4 text-gray-500" />
            <span>系統基準與強限制設定</span>
          </h4>
          <p className="text-xs text-gray-400 mt-1">
            進行帳簿期中整理、初次使用建置現金起點、或強制人工修正特定持股狀態。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={() => setShowInitialModal(true)}
            className="text-xs bg-gray-800 hover:bg-gray-950 text-white font-semibold px-4 py-2.5 rounded-xl transition shadow-xs flex items-center space-x-1.5 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>設定起始現金基準</span>
          </button>
          <button 
            onClick={() => openAdjustModal('stock')}
            className="text-xs bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold px-4 py-2.5 rounded-xl transition shadow-xs flex items-center space-x-1.5 cursor-pointer"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>強制修正/設定持股</span>
          </button>
        </div>
      </div>

      {/* Force Adjust Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" id="modal_adjust">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center space-x-2">
              <Wrench className="w-5 h-5 text-violet-500" />
              <span>手動強制修正帳務 (不留交易誤差)</span>
            </h3>
            
            <form onSubmit={handleAdjustSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4 bg-gray-50 p-1.5 rounded-lg border border-gray-100">
                <button
                  type="button"
                  onClick={() => setAdjustType('cash')}
                  className={`py-2 text-xs font-semibold rounded-md transition ${adjustType === 'cash' ? 'bg-white shadow-xs text-violet-600' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  修正可用現金
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType('stock')}
                  className={`py-2 text-xs font-semibold rounded-md transition ${adjustType === 'stock' ? 'bg-white shadow-xs text-violet-600' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  修正持股與成本
                </button>
              </div>

              {adjustType === 'cash' ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">調整對象</label>
                    <select
                      value={adjustMember}
                      onChange={(e) => setAdjustMember(e.target.value as any)}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-violet-500 focus:outline-none"
                    >
                      <option value="both">兩人各自獨立設定</option>
                      <option value="yun">僅調整 Yun 的現金</option>
                      <option value="bro">僅調整 哥哥的現金</option>
                    </select>
                  </div>

                  {(adjustMember === 'yun' || adjustMember === 'both') && (
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1">Yun 的現金修正後正確餘額 (元)</label>
                      <input
                        type="number"
                        value={adjustCashYun}
                        onChange={(e) => setAdjustCashYun(parseInt(e.target.value) || 0)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-violet-500 focus:outline-none font-sans"
                        required
                      />
                    </div>
                  )}

                  {(adjustMember === 'bro' || adjustMember === 'both') && (
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1">哥哥的現金修正後正確餘額 (元)</label>
                      <input
                        type="number"
                        value={adjustCashBro}
                        onChange={(e) => setAdjustCashBro(parseInt(e.target.value) || 0)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-violet-500 focus:outline-none font-sans"
                        required
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1">股票代號</label>
                      <input
                        type="text"
                        placeholder="例如 2330"
                        value={adjustSymbol}
                        onChange={(e) => setAdjustSymbol(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-violet-500 focus:outline-none font-sans"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1">股票名稱 (選填)</label>
                      <input
                        type="text"
                        placeholder="例如 台積電"
                        value={adjustName}
                        onChange={(e) => setAdjustName(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-violet-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-3">
                    <h4 className="text-xs font-bold text-blue-600 mb-2">Yun 的持股修正</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium text-gray-400 block mb-1">修正後正確張數</label>
                        <input
                          type="number"
                          step="any"
                          value={adjustSharesYun !== undefined ? adjustSharesYun / 1000 : 0}
                          onChange={(e) => {
                            const sheetsVal = parseFloat(e.target.value) || 0;
                            setAdjustSharesYun(Math.round(sheetsVal * 1000));
                          }}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-violet-500 focus:outline-none font-sans"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-400 block mb-1">修正後移動均價</label>
                        <input
                          type="number"
                          step="0.01"
                          value={adjustPriceYun}
                          onChange={(e) => setAdjustPriceYun(parseFloat(e.target.value) || 0)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-violet-500 focus:outline-none font-sans"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-3">
                    <h4 className="text-xs font-bold text-amber-600 mb-2">哥哥的持股修正</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium text-gray-400 block mb-1">修正後正確張數</label>
                        <input
                          type="number"
                          step="any"
                          value={adjustSharesBro !== undefined ? adjustSharesBro / 1000 : 0}
                          onChange={(e) => {
                            const sheetsVal = parseFloat(e.target.value) || 0;
                            setAdjustSharesBro(Math.round(sheetsVal * 1000));
                          }}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-violet-500 focus:outline-none font-sans"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-400 block mb-1">修正後移動均價</label>
                        <input
                          type="number"
                          step="0.01"
                          value={adjustPriceBro}
                          onChange={(e) => setAdjustPriceBro(parseFloat(e.target.value) || 0)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-violet-500 focus:outline-none font-sans"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">修正原因備註 (必填)</label>
                <textarea
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  placeholder="例如：配股修正、手續費尾差調對、除權息調整..."
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-violet-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 font-medium transition cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition shadow-xs cursor-pointer"
                >
                  確認修正
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Initial Settlement Modal */}
      {showInitialModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" id="modal_initial_settlement">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center space-x-2">
              <Play className="w-5 h-5 text-emerald-500" />
              <span>設定帳本起始現金基準</span>
            </h3>
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              系統將會在此建立一個「現金基準結算紀錄」作為一切現金流的起點，在此日期之前的現金異動將會被此正確金額覆蓋。
            </p>

            <form onSubmit={handleInitialSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Yun 的起始現金 (元)</label>
                <input
                  type="number"
                  value={adjustCashYun}
                  onChange={(e) => setAdjustCashYun(parseInt(e.target.value) || 0)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none font-sans"
                  required
                />
              </div>
              
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">哥哥的起始現金 (元)</label>
                <input
                  type="number"
                  value={adjustCashBro}
                  onChange={(e) => setAdjustCashBro(parseInt(e.target.value) || 0)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none font-sans"
                  required
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowInitialModal(false)}
                  className="px-4 py-2 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 font-medium transition cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition shadow-xs cursor-pointer"
                >
                  建立基準點
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
