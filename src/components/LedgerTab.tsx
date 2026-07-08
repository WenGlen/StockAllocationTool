/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Trash2, 
  Edit, 
  Filter, 
  Download, 
  ChevronDown, 
  X,
  AlertTriangle,
  Info
} from 'lucide-react';
import { Transaction, Settings, TransactionType } from '../types';
import { calculateLedgerSteps, CalculatedStep } from '../utils/ledger';
import NumberField from './NumberField';

interface LedgerTabProps {
  transactions: Transaction[];
  settings: Settings;
  onUpdateTransaction: (id: string, updated: Partial<Transaction>) => void | Promise<void>;
  onDeleteTransaction: (id: string) => void | Promise<void>;
}

export default function LedgerTab({
  transactions,
  settings,
  onUpdateTransaction,
  onDeleteTransaction,
}: LedgerTabProps) {
  // Filters
  const [filterType, setFilterType] = useState<string>('all');
  const [filterMember, setFilterMember] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Expanded rows (detail view)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Editing state
  const [editingStep, setEditingStep] = useState<CalculatedStep | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Form values for editing
  const [editDate, setEditDate] = useState('');
  const [editType, setEditType] = useState<TransactionType>('buy');
  const [editSymbol, setEditSymbol] = useState('');
  const [editName, setEditName] = useState('');
  const [editShares, setEditShares] = useState(0);
  const [editPrice, setEditPrice] = useState(0);
  const [editAmount, setEditAmount] = useState(0);
  const [editFee, setEditFee] = useState(0);
  const [editTax, setEditTax] = useState(0);
  const [editPayout, setEditPayout] = useState(0);
  const [editNote, setEditNote] = useState('');
  const [editSplitType, setEditSplitType] = useState<'ratio' | 'shares' | 'manual'>('ratio');
  const [editYunRatio, setEditYunRatio] = useState(50);
  const [editBroRatio, setEditBroRatio] = useState(50);
  const [editYunShares, setEditYunShares] = useState(0);
  const [editBroShares, setEditBroShares] = useState(0);
  const [editMember, setEditMember] = useState<'yun' | 'bro' | 'both'>('both');

  // Compute steps
  const steps = useMemo(() => {
    return calculateLedgerSteps(transactions, settings);
  }, [transactions, settings]);

  // Apply filters on computed steps, then sort to show newest first
  const filteredSteps = useMemo(() => {
    let result = [...steps];

    // Search query (symbol, name, note)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(s => 
        s.tx.symbol?.toLowerCase().includes(q) ||
        s.tx.name?.toLowerCase().includes(q) ||
        s.tx.note?.toLowerCase().includes(q)
      );
    }

    // Type filter
    if (filterType !== 'all') {
      result = result.filter(s => s.tx.type === filterType);
    }

    // Member filter (for cash transactions or split details)
    if (filterMember !== 'all') {
      result = result.filter(s => {
        if (s.tx.member) {
          return s.tx.member === filterMember;
        }
        // for stock splits, check if they have share allocations
        if (filterMember === 'yun') {
          return (s.tx.yunShares ?? 0) > 0 || (s.tx.yunRatio ?? 0) > 0;
        } else if (filterMember === 'bro') {
          return (s.tx.broShares ?? 0) > 0 || (s.tx.broRatio ?? 0) > 0;
        }
        return true;
      });
    }

    // Date range
    if (startDate) {
      result = result.filter(s => s.tx.date >= startDate);
    }
    if (endDate) {
      result = result.filter(s => s.tx.date <= endDate);
    }

    // Newest first for display
    return result.reverse();
  }, [steps, searchQuery, filterType, filterMember, startDate, endDate]);

  const handleEditClick = (step: CalculatedStep) => {
    const tx = step.tx;
    setEditingStep(step);
    setEditDate(tx.date);
    setEditType(tx.type);
    setEditSymbol(tx.symbol || '');
    setEditName(tx.name || '');
    setEditShares(tx.shares || 0);
    setEditPrice(tx.price || 0);
    setEditAmount(tx.amount || 0);
    setEditFee(tx.fee || 0);
    setEditTax(tx.tax || 0);
    setEditPayout(tx.payout || 0);
    setEditNote(tx.note || '');
    setEditSplitType(tx.splitType || 'ratio');
    setEditYunRatio(tx.yunRatio ?? settings.yunDefaultRatio);
    setEditBroRatio(tx.broRatio ?? settings.broDefaultRatio);
    setEditYunShares(tx.yunShares ?? 0);
    setEditBroShares(tx.broShares ?? 0);
    setEditMember(tx.member || 'both');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStep || submitting) return;
    setSubmitting(true);
    try {
    await onUpdateTransaction(editingStep.tx.id, {
      date: editDate,
      type: editType,
      symbol: editSymbol.trim() || undefined,
      name: editName.trim() || undefined,
      shares: editShares > 0 ? editShares : undefined,
      price: editPrice > 0 ? editPrice : undefined,
      amount: editAmount > 0 ? editAmount : undefined,
      fee: editFee > 0 ? editFee : undefined,
      tax: editTax > 0 ? editTax : undefined,
      payout: editPayout > 0 ? editPayout : undefined,
      splitType: editSplitType,
      yunRatio: editSplitType === 'ratio' ? editYunRatio : undefined,
      broRatio: editSplitType === 'ratio' ? editBroRatio : undefined,
      yunShares: editSplitType === 'shares' ? editYunShares : undefined,
      broShares: editSplitType === 'shares' ? editBroShares : undefined,
      member: editMember,
      note: editNote.trim() || undefined,
    });

    setEditingStep(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClick = (id: string) => {
    if (confirm('確定要刪除這筆交易紀錄嗎？這會自動使後續所有餘額與持股成本重新計算。')) {
      onDeleteTransaction(id);
    }
  };

  // Helper formatting
  const fmt = (num: number) => {
    return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 }).format(Math.round(num));
  };

  const getTypeBadge = (type: TransactionType) => {
    switch (type) {
      case 'settlement':
        return <span className="bg-emerald-100 text-emerald-800 text-xs font-black px-2 py-1 rounded-md whitespace-nowrap">基準結算</span>;
      case 'adjustment':
        return <span className="bg-violet-100 text-violet-800 text-xs font-black px-2 py-1 rounded-md whitespace-nowrap">強制修正</span>;
      case 'buy':
        return <span className="bg-red-100 text-red-800 text-xs font-black px-2 py-1 rounded-md whitespace-nowrap">台股買進</span>;
      case 'sell':
        return <span className="bg-green-100 text-green-800 text-xs font-black px-2 py-1 rounded-md whitespace-nowrap">台股賣出</span>;
      case 'dividend':
        return <span className="bg-amber-100 text-amber-800 text-xs font-black px-2 py-1 rounded-md whitespace-nowrap">現金股利</span>;
      case 'cash_in':
        return <span className="bg-blue-100 text-blue-800 text-xs font-black px-2 py-1 rounded-md whitespace-nowrap">現金存入</span>;
      case 'cash_out':
        return <span className="bg-gray-100 text-gray-800 text-xs font-black px-2 py-1 rounded-md whitespace-nowrap">現金提領</span>;
      case 'note':
        return <span className="bg-sky-100 text-sky-800 text-xs font-black px-2 py-1 rounded-md whitespace-nowrap">備忘</span>;
      default:
        return <span className="bg-gray-100 text-gray-800 text-xs font-black px-2 py-1 rounded-md whitespace-nowrap">{type}</span>;
    }
  };

  const clearFilters = () => {
    setFilterType('all');
    setFilterMember('all');
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div className="space-y-6" id="ledger_tab">
      {/* Search & Filter Bar */}
      <div className="bg-white rounded-2xl p-5 shadow-xs border border-gray-100" id="ledger_filter_panel">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          {/* Search query */}
          <div className="flex-1 w-full">
            <label className="text-[10px] font-bold text-gray-400 block mb-1">關鍵字搜尋</label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="搜尋股票代號、標準名稱、備註說明..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-lg pl-9 pr-4 py-2 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none transition font-medium"
              />
            </div>
          </div>

          {/* Type filter */}
          <div className="w-full md:w-36">
            <label className="text-[10px] font-bold text-gray-400 block mb-1">交易種類</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none transition font-medium"
            >
              <option value="all">全部種類</option>
              <option value="buy">📈 買進</option>
              <option value="sell">📉 賣出</option>
              <option value="dividend">🌸 股利</option>
              <option value="cash_in">💵 存入</option>
              <option value="cash_out">📤 領出</option>
              <option value="settlement">🟢 基準結算</option>
              <option value="adjustment">🔧 強制修正</option>
              <option value="note">📝 備忘</option>
            </select>
          </div>

          {/* Member filter */}
          <div className="w-full md:w-36">
            <label className="text-[10px] font-bold text-gray-400 block mb-1">歸屬對象</label>
            <select
              value={filterMember}
              onChange={(e) => setFilterMember(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none transition font-medium"
            >
              <option value="all">不限歸屬</option>
              <option value="yun">僅 Yun 相關</option>
              <option value="bro">僅 哥哥 相關</option>
            </select>
          </div>

          {/* Date Range picker */}
          <div className="grid grid-cols-2 gap-2 w-full md:w-64">
            <div>
              <label className="text-[10px] font-bold text-gray-400 block mb-1">起始日期</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-[11px] focus:ring-1 focus:ring-blue-500 focus:outline-none font-sans font-medium"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 block mb-1">截止日期</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-[11px] focus:ring-1 focus:ring-blue-500 focus:outline-none font-sans font-medium"
              />
            </div>
          </div>

          {/* Clear Button */}
          {(searchQuery || filterType !== 'all' || filterMember !== 'all' || startDate || endDate) && (
            <button
              onClick={clearFilters}
              className="p-2 border border-gray-200 hover:border-gray-300 rounded-lg text-gray-400 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 transition cursor-pointer"
              title="清除過濾器"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-gray-100 overflow-hidden" id="ledger_table_panel">
        {filteredSteps.length === 0 ? (
          <div className="p-12 text-center text-gray-400 flex flex-col items-center space-y-2">
            <Search className="w-10 h-10 text-gray-300" />
            <p className="text-sm">查無符合篩選條件的交易紀錄</p>
            <button onClick={clearFilters} className="text-xs text-blue-500 hover:underline">清除過濾條件</button>
          </div>
        ) : (
          <div>
            {/* Column header (desktop) */}
            <div className="hidden md:grid grid-cols-12 gap-2 px-5 py-3 bg-gray-100/50 border-b border-gray-100 text-xs font-black text-gray-500">
              <div className="col-span-2">日期</div>
              <div className="col-span-3">股票</div>
              <div className="col-span-2">交易類型</div>
              <div className="col-span-2 text-right">金額</div>
              <div className="col-span-2 text-right">股數</div>
              <div className="col-span-1 text-right">展開</div>
            </div>

            <div className="divide-y divide-gray-100">
              {filteredSteps.map((step, index) => {
                const tx = step.tx;
                const isStock = !!tx.symbol;
                const isExpanded = expandedIds.has(tx.id);

                return (
                  <div key={tx.id}>
                    {/* Row header (click to expand) */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(tx.id)}
                      className="w-full grid grid-cols-12 gap-2 items-center px-5 py-3.5 text-left hover:bg-gray-50/70 transition-colors cursor-pointer"
                    >
                      {/* 日期 */}
                      <div className="col-span-5 md:col-span-2 order-1 md:order-none">
                        <div className="text-sm font-bold text-gray-700">{tx.date}</div>
                        <div className="text-[11px] text-gray-400 font-bold">#{(filteredSteps.length - index).toString().padStart(3, '0')}</div>
                      </div>

                      {/* 股票 (名稱 / 代號) — narrow: below type (order-3) */}
                      <div className="col-span-4 md:col-span-3 order-3 md:order-none">
                        {isStock ? (
                          <div>
                            <div className="font-black text-gray-900 text-sm sm:text-base">{tx.name || tx.symbol}</div>
                            <div className="text-xs text-gray-400 font-bold font-mono">{tx.symbol}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic text-sm">現金帳目</span>
                        )}
                      </div>

                      {/* 交易類型 — narrow: beside date (order-2) */}
                      <div className="col-span-7 md:col-span-2 order-2 md:order-none">
                        {getTypeBadge(tx.type)}
                      </div>

                      {/* 金額 */}
                      <div className="col-span-4 md:col-span-2 text-right font-sans order-4 md:order-none">
                        {tx.type === 'dividend' ? (
                          <span className="font-black text-amber-600 text-sm">+{fmt(tx.payout ?? 0)}</span>
                        ) : isStock ? (
                          <span className="font-black text-gray-700 text-sm">{tx.amount ? fmt(tx.amount) : '—'}</span>
                        ) : (
                          <span className={`font-black text-sm ${tx.type === 'cash_in' || (tx.type === 'settlement' && tx.member === 'both') ? 'text-red-500' : tx.type === 'cash_out' ? 'text-emerald-500' : 'text-gray-700'}`}>
                            {tx.type === 'cash_in' ? '+' : tx.type === 'cash_out' ? '-' : ''}{fmt(tx.amount ?? 0)}
                          </span>
                        )}
                      </div>

                      {/* 股數 */}
                      <div className="col-span-3 md:col-span-2 text-right font-sans order-5 md:order-none">
                        {isStock && (tx.type === 'buy' || tx.type === 'sell') ? (
                          <span className={`font-black text-sm ${tx.type === 'buy' ? 'text-red-500' : 'text-emerald-500'}`}>
                            {tx.type === 'buy' ? '+' : '-'}{parseFloat(((tx.shares ?? 0) / 1000).toFixed(3)).toLocaleString()} 張
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </div>

                      {/* 展開 chevron */}
                      <div className="col-span-1 flex justify-end order-6 md:order-none">
                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {/* Expanded detail: 備註 + Yun/哥哥 異動/餘額/股數 + 操作 */}
                    {isExpanded && (
                      <div className="px-5 pb-4 pt-1 bg-gray-50/60 border-t border-gray-100 space-y-3 font-sans">
                        {/* Note */}
                        <div className="text-xs text-gray-600 pt-3">
                          <span className="font-black text-gray-400 mr-1">備註:</span>
                          {tx.note || <span className="text-gray-300 italic">無備註</span>}
                        </div>

                        {/* Per-member allocation */}
                        {tx.type !== 'note' && (
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="pr-4 border-r border-gray-200">
                              <span className="text-xs font-black text-blue-600 block mb-1">Yun 異動 / 餘額</span>
                              <div className={`text-base font-black ${step.yunAllocatedAmt >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                {step.yunAllocatedAmt >= 0 ? '+' : ''}{step.yunAllocatedAmt.toLocaleString()} 元
                              </div>
                              <div className="text-xs text-gray-500 mt-1.5 font-bold space-y-0.5">
                                <div>現金餘額: <span className="text-gray-700 font-extrabold">{fmt(step.runningCashYun)}</span></div>
                                {isStock && <div>持股: <span className="text-blue-600 font-extrabold">{parseFloat((step.runningSharesYun / 1000).toFixed(3)).toLocaleString()} 張</span></div>}
                              </div>
                            </div>
                            <div className="pl-1">
                              <span className="text-xs font-black text-amber-600 block mb-1">哥哥 異動 / 餘額</span>
                              <div className={`text-base font-black ${step.broAllocatedAmt >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                {step.broAllocatedAmt >= 0 ? '+' : ''}{step.broAllocatedAmt.toLocaleString()} 元
                              </div>
                              <div className="text-xs text-gray-500 mt-1.5 font-bold space-y-0.5">
                                <div>現金餘額: <span className="text-gray-700 font-extrabold">{fmt(step.runningCashBro)}</span></div>
                                {isStock && <div>持股: <span className="text-amber-600 font-extrabold">{parseFloat((step.runningSharesBro / 1000).toFixed(3)).toLocaleString()} 張</span></div>}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex justify-end space-x-2 pt-1">
                          <button
                            onClick={() => handleEditClick(step)}
                            className="px-3 py-1.5 bg-white hover:bg-gray-100 border border-gray-200 text-gray-600 rounded-lg text-xs font-bold flex items-center space-x-1 transition cursor-pointer"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>修改</span>
                          </button>
                          <button
                            onClick={() => handleDeleteClick(tx.id)}
                            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-lg text-xs font-bold flex items-center space-x-1 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>刪除</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Edit Transaction Modal */}
      {editingStep && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" id="modal_edit_transaction">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center space-x-2">
              <Edit className="w-5 h-5 text-blue-500" />
              <span>修該記帳紀錄交易內容</span>
            </h3>

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-500 block mb-1 font-bold">交易日期</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none font-sans font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="text-gray-500 block mb-1 font-bold">異動類型</label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as TransactionType)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="buy">📈 買進</option>
                    <option value="sell">📉 賣出</option>
                    <option value="dividend">🌸 現金股利</option>
                    <option value="cash_in">💵 現金存入</option>
                    <option value="cash_out">📤 現金提領</option>
                    <option value="settlement">🟢 基準結算</option>
                    <option value="adjustment">🔧 強制修正</option>
                    <option value="note">📝 備忘</option>
                  </select>
                </div>
              </div>

              {(editType === 'buy' || editType === 'sell' || editType === 'dividend' || editType === 'adjustment' || editType === 'settlement') && (
                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                  <div>
                    <label className="text-gray-500 block mb-1 font-bold">股票代號 (選填)</label>
                    <input
                      type="text"
                      value={editSymbol}
                      onChange={(e) => setEditSymbol(e.target.value)}
                      className="w-full border border-gray-200 bg-white rounded-lg px-3 py-2 text-xs font-sans"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 block mb-1 font-bold">股票名稱 (選填)</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full border border-gray-200 bg-white rounded-lg px-3 py-2 text-xs"
                    />
                  </div>
                </div>
              )}

              {(editType === 'buy' || editType === 'sell') && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                  <div>
                    <label className="text-gray-500 block mb-1">成交張數</label>
                    <NumberField
                      value={editShares}
                      scale={1000}
                      allowDecimal
                      onChange={(v) => setEditShares(v)}
                      className="w-full border border-gray-200 bg-white rounded-lg px-2 py-1.5 font-sans"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 block mb-1">成交均價</label>
                    <NumberField
                      value={editPrice}
                      allowDecimal
                      onChange={(v) => setEditPrice(v)}
                      className="w-full border border-gray-200 bg-white rounded-lg px-2 py-1.5 font-sans"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 block mb-1">成交金額</label>
                    <NumberField
                      value={editAmount}
                      onChange={(v) => setEditAmount(v)}
                      className="w-full border border-gray-200 bg-white rounded-lg px-2 py-1.5 font-sans"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 block mb-1">手續費</label>
                    <NumberField
                      value={editFee}
                      onChange={(v) => setEditFee(v)}
                      className="w-full border border-gray-200 bg-white rounded-lg px-2 py-1.5 font-sans"
                    />
                  </div>
                </div>
              )}

              {editType === 'dividend' && (
                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                  <div>
                    <label className="text-gray-500 block mb-1">實付股利金額</label>
                    <NumberField
                      value={editPayout}
                      onChange={(v) => setEditPayout(v)}
                      className="w-full border border-gray-200 bg-white rounded-lg px-3 py-2 font-sans font-bold text-amber-600"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 block mb-1">扣繳稅額</label>
                    <NumberField
                      value={editTax}
                      onChange={(v) => setEditTax(v)}
                      className="w-full border border-gray-200 bg-white rounded-lg px-3 py-2 font-sans"
                    />
                  </div>
                </div>
              )}

              {(editType === 'buy' || editType === 'sell' || editType === 'dividend') && (
                <div className="border border-blue-100 bg-blue-50/20 p-4 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-gray-600">編輯拆分規則</span>
                    <select
                      value={editSplitType}
                      onChange={(e) => setEditSplitType(e.target.value as any)}
                      className="bg-white border border-gray-200 rounded p-1 text-[11px]"
                    >
                      <option value="ratio">比例拆分</option>
                      <option value="shares">指定張數 (買賣適用)</option>
                      <option value="manual">自訂比例 (股利適用)</option>
                    </select>
                  </div>

                  {editSplitType === 'ratio' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] text-blue-800 block mb-1">Yun 比例 (%)</label>
                        <NumberField
                          value={editYunRatio}
                          onChange={(v) => {
                            const val = Math.max(0, Math.min(100, v));
                            setEditYunRatio(val);
                            setEditBroRatio(100 - val);
                          }}
                          className="w-full border border-gray-200 bg-white rounded px-2.5 py-1.5 font-sans text-center"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-amber-800 block mb-1">哥哥比例 (%)</label>
                        <NumberField
                          value={editBroRatio}
                          onChange={(v) => {
                            const val = Math.max(0, Math.min(100, v));
                            setEditBroRatio(val);
                            setEditYunRatio(100 - val);
                          }}
                          className="w-full border border-gray-200 bg-white rounded px-2.5 py-1.5 font-sans text-center"
                        />
                      </div>
                    </div>
                  )}

                  {editSplitType === 'shares' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] text-blue-800 block mb-1">Yun 張數</label>
                        <NumberField
                          value={editYunShares}
                          scale={1000}
                          allowDecimal
                          onChange={(v) => {
                            const val = Math.min(editShares, v);
                            setEditYunShares(val);
                            setEditBroShares(Math.max(0, editShares - val));
                          }}
                          className="w-full border border-gray-200 bg-white rounded px-2.5 py-1.5 font-sans text-center"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-amber-800 block mb-1">哥哥張數</label>
                        <NumberField
                          value={editBroShares}
                          scale={1000}
                          allowDecimal
                          onChange={(v) => {
                            const val = Math.min(editShares, v);
                            setEditBroShares(val);
                            setEditYunShares(Math.max(0, editShares - val));
                          }}
                          className="w-full border border-gray-200 bg-white rounded px-2.5 py-1.5 font-sans text-center"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Cash entries member */}
              {(editType === 'cash_in' || editType === 'cash_out' || editType === 'settlement' || editType === 'adjustment') && !editSymbol && (
                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                  <div>
                    <label className="text-gray-500 block mb-1">交易金額</label>
                    <NumberField
                      value={editAmount}
                      onChange={(v) => setEditAmount(v)}
                      className="w-full border border-gray-200 bg-white rounded-lg px-3 py-2 font-sans"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 block mb-1 font-bold">歸屬對象</label>
                    <select
                      value={editMember}
                      onChange={(e) => setEditMember(e.target.value as any)}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2"
                    >
                      {(editType === 'settlement' || editType === 'adjustment') && (
                        <option value="both">兩人各自設定</option>
                      )}
                      <option value="yun">100% 歸屬 Yun</option>
                      <option value="bro">100% 歸屬 哥哥</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="text-gray-500 block mb-1 font-bold">交易備註</label>
                <textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="備註文字..."
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingStep(null)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 font-semibold cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-semibold shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {submitting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {submitting ? '儲存中…' : '確認儲存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
