/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  Upload, 
  Sparkles, 
  FileText, 
  Percent, 
  HelpCircle, 
  AlertTriangle, 
  CheckCircle, 
  Plus, 
  Minus,
  Trash2,
  ListPlus
} from 'lucide-react';
import { Transaction, Settings, TransactionType } from '../types';
import NumberField from './NumberField';

interface UploadTabProps {
  settings: Settings;
  onAddTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void | Promise<void>;
  onBatchAddTransactions: (txs: Omit<Transaction, 'id' | 'createdAt'>[]) => void | Promise<void>;
}

interface DetectedTransaction {
  type: TransactionType;
  symbol?: string;
  name?: string;
  date: string;
  shares?: number;
  price?: number;
  amount?: number;
  fee?: number;
  tax?: number;
  payout?: number;
  note?: string;
  splitType: 'ratio' | 'shares' | 'manual';
  yunRatio: number;
  broRatio: number;
  yunShares?: number;
  broShares?: number;
  member?: 'yun' | 'bro' | 'both';
}

/**
 * 上傳前壓縮圖片：等比例縮到最長邊 maxDim、輸出 JPEG，
 * 讓 base64 body 遠低於 Vercel serverless 的 4.5MB 上限（同時降低頻寬）。
 */
const compressImage = (dataUrl: string, maxDim = 1600, quality = 0.85): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const longest = Math.max(width, height);
      if (longest > maxDim) {
        const scale = maxDim / longest;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('no canvas context'));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });

export default function UploadTab({
  settings,
  onAddTransaction,
  onBatchAddTransactions,
}: UploadTabProps) {
  const [dragActive, setDragActive] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states for single transaction
  const [txType, setTxType] = useState<TransactionType>('buy');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [shares, setShares] = useState(0);
  const [price, setPrice] = useState(0);
  const [amount, setAmount] = useState(0);
  const [fee, setFee] = useState(0);
  const [tax, setTax] = useState(0);
  const [payout, setPayout] = useState(0);
  const [note, setNote] = useState('');

  // Split states
  const [splitType, setSplitType] = useState<'ratio' | 'shares' | 'manual'>('shares');
  const [yunRatio, setYunRatio] = useState(settings.yunDefaultRatio);
  const [broRatio, setBroRatio] = useState(settings.broDefaultRatio);
  const [yunShares, setYunShares] = useState(0);
  const [broShares, setBroShares] = useState(0);
  const [member, setMember] = useState<'yun' | 'bro'>('yun');

  // Multi-transaction batches (對帳單或網銀多筆交易紀錄辨識)
  const [batchTransactions, setBatchTransactions] = useState<DetectedTransaction[]>([]);
  const [activeTab, setActiveTab] = useState<'auto' | 'manual'>('auto');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag handers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('請上傳圖片檔案 (PNG, JPG, JPEG)');
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const raw = reader.result as string;
      let finalSrc = raw;
      try {
        finalSrc = await compressImage(raw);
      } catch {
        // 壓縮失敗就退回原圖（極少發生）
      }
      setImageSrc(finalSrc);
      setError(null);
      setSuccessMsg(null);
    };
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  // AI Screenshot analysis
  const analyzeScreenshot = async () => {
    if (!imageSrc) return;
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    
    try {
      const res = await fetch('/api/analyze-screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageSrc })
      });

      if (!res.ok) {
        const text = await res.text();
        let errMsg = 'AI 辨識服務回應失敗';
        try {
          const errData = JSON.parse(text);
          const msg = errData.error || 'AI 辨識服務回應失敗';
          const details = errData.details ? ` (${errData.details})` : '';
          errMsg = `${msg}${details}`;
        } catch {
          errMsg = `伺服器回應錯誤 (HTTP ${res.status}): ${text.substring(0, 80).replace(/<[^>]*>/g, '').trim() || '系統無回應'}`;
        }
        throw new Error(errMsg);
      }

      const resText = await res.text();
      let data;
      try {
        data = JSON.parse(resText);
      } catch {
        throw new Error('無法解析伺服器傳回的資料。請確認後再試！');
      }
      console.log('AI Extraction matched:', data);

      let parsedList: DetectedTransaction[] = [];
      
      if (data.transactions && data.transactions.length > 0) {
        parsedList = data.transactions.map((t: any) => {
          const type = (t.type || 'buy') as TransactionType;
          const parsedShares = t.shares || 0;
          const defaultSplitType = (type === 'buy' || type === 'sell') ? 'shares' : 'ratio';
          return {
            type,
            symbol: t.symbol || '',
            name: t.name || '',
            date: t.date || date,
            shares: parsedShares,
            price: t.price || 0,
            amount: t.amount || (parsedShares * (t.price || 0)),
            fee: t.fee || 0,
            tax: t.tax || 0,
            payout: t.payout || 0,
            note: t.note || '',
            splitType: defaultSplitType,
            yunRatio: settings.yunDefaultRatio,
            broRatio: settings.broDefaultRatio,
            yunShares: 0,
            broShares: 0,
            member: (t.member === 'bro' ? 'bro' : 'yun')
          };
        });
      } else if (data.type || data.amount || data.symbol) {
        const type = (data.type || 'buy') as TransactionType;
        const parsedShares = data.shares || 0;
        const defaultSplitType = (type === 'buy' || type === 'sell') ? 'shares' : 'ratio';
        parsedList = [{
          type,
          symbol: data.symbol || '',
          name: data.name || '',
          date: data.date || date,
          shares: parsedShares,
          price: data.price || 0,
          amount: data.amount || (parsedShares * (data.price || 0)),
          fee: data.fee || 0,
          tax: data.tax || 0,
          payout: data.payout || 0,
          note: data.note || '',
          splitType: defaultSplitType,
          yunRatio: settings.yunDefaultRatio,
          broRatio: settings.broDefaultRatio,
          yunShares: 0,
          broShares: 0,
          member: (data.member === 'bro' ? 'bro' : 'yun')
        }];
      }

      if (parsedList.length > 0) {
        setBatchTransactions(parsedList);
        setSuccessMsg(`🎉 AI 成功辨識出 ${parsedList.length} 筆交易明細！請在下方校對後確認入帳。`);
      } else {
        throw new Error('未能識別交易內容，請確認圖片是否清晰，或至「手動填寫」分頁登錄。');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || '連線至 AI 辨識模組發生錯誤');
    } finally {
      setLoading(false);
    }
  };

  const handleRatioChange = (val: number) => {
    setYunRatio(val);
    setBroRatio(100 - val);
  };

  const handleBroRatioChange = (val: number) => {
    setBroRatio(val);
    setYunRatio(100 - val);
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
    // Create new transaction
    await onAddTransaction({
      date,
      type: txType,
      symbol: symbol.trim() || undefined,
      name: name.trim() || undefined,
      shares: shares > 0 ? shares : undefined,
      price: price > 0 ? price : undefined,
      amount: amount > 0 ? amount : undefined,
      fee: fee > 0 ? fee : undefined,
      tax: tax > 0 ? tax : undefined,
      payout: payout > 0 ? payout : undefined,
      splitType: txType === 'buy' || txType === 'sell' || txType === 'dividend' ? splitType : undefined,
      yunRatio: splitType === 'ratio' ? yunRatio : undefined,
      broRatio: splitType === 'ratio' ? broRatio : undefined,
      yunShares: splitType === 'shares' ? yunShares : undefined,
      broShares: splitType === 'shares' ? broShares : undefined,
      member: txType === 'cash_in' || txType === 'cash_out' ? member : undefined,
      image: imageSrc || undefined,
      note: note.trim() || undefined,
    });

    // Reset screenshot and preview
    setImageSrc(null);
    setSuccessMsg('✅ 交易成功記入帳本！');
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBatchConfirm = async () => {
    if (batchTransactions.length === 0 || submitting) return;
    setSubmitting(true);
    try {

    const list: Omit<Transaction, 'id' | 'createdAt'>[] = batchTransactions.map(tx => ({
      date: tx.date,
      type: tx.type,
      symbol: tx.symbol?.trim() || undefined,
      name: tx.name?.trim() || undefined,
      shares: tx.shares && tx.shares > 0 ? tx.shares : undefined,
      price: tx.price && tx.price > 0 ? tx.price : undefined,
      amount: tx.amount && tx.amount > 0 ? tx.amount : undefined,
      fee: tx.fee && tx.fee > 0 ? tx.fee : undefined,
      tax: tx.tax && tx.tax > 0 ? tx.tax : undefined,
      payout: tx.payout && tx.payout > 0 ? tx.payout : undefined,
      splitType: ['buy', 'sell', 'dividend'].includes(tx.type) ? tx.splitType : undefined,
      yunRatio: tx.splitType === 'ratio' || tx.splitType === 'manual' ? tx.yunRatio : undefined,
      broRatio: tx.splitType === 'ratio' || tx.splitType === 'manual' ? tx.broRatio : undefined,
      yunShares: tx.splitType === 'shares' ? tx.yunShares : undefined,
      broShares: tx.splitType === 'shares' ? tx.broShares : undefined,
      member: ['cash_in', 'cash_out'].includes(tx.type) ? tx.member : undefined,
      image: imageSrc || undefined,
      note: tx.note?.trim() || undefined,
    }));

    await onBatchAddTransactions(list);
    setImageSrc(null);
    setBatchTransactions([]);
    setActiveTab('auto');
    setSuccessMsg(`✅ 成功批次匯入 ${list.length} 筆交易紀錄！`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteBatchRow = (idx: number) => {
    setBatchTransactions(prev => prev.filter((_, i) => i !== idx));
  };

  const updateBatchRow = (idx: number, fields: Partial<DetectedTransaction>) => {
    setBatchTransactions(prev => prev.map((row, i) => i === idx ? { ...row, ...fields } : row));
  };

  return (
    <div className="space-y-6" id="upload_tab">
      {/* Main Tab Selection */}
      <div className="flex border-b border-gray-100 mb-6 bg-white rounded-t-2xl p-1 pb-0 shadow-xs">
        <button
          type="button"
          onClick={() => {
            setActiveTab('auto');
            setError(null);
            setSuccessMsg(null);
          }}
          className={`py-3.5 px-6 text-sm sm:text-base font-extrabold border-b-2 transition flex items-center space-x-2 cursor-pointer ${
            activeTab === 'auto'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Sparkles className="w-4 h-4 text-blue-500" />
          <span>自動截圖辨識</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('manual');
            setError(null);
            setSuccessMsg(null);
          }}
          className={`py-3.5 px-6 text-sm sm:text-base font-extrabold border-b-2 transition flex items-center space-x-2 cursor-pointer ${
            activeTab === 'manual'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileText className="w-4 h-4 text-gray-400" />
          <span>手動填寫記帳</span>
        </button>
      </div>

      {/* Interface: Automatic Recognition */}
      {activeTab === 'auto' && (
        <div className="space-y-6">
          {/* Upload Zone */}
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-gray-100">
            <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center space-x-2">
              <span>對帳截圖 AI 辨識</span>
              <span className="text-xs text-gray-400 font-normal">(支援元大證券 App、元大網銀明細)</span>
            </h3>

            <div className="max-w-xl mx-auto space-y-4">
              {!imageSrc ? (
                <div 
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center h-48 ${dragActive ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200 hover:border-blue-400 bg-gray-50/50'}`}
                >
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl mb-2">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-gray-700">拖曳對帳截圖至此，或點擊瀏覽檔案</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">支援 PNG, JPG, JPEG 格式</p>
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden" 
                    accept="image/*"
                  />
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden bg-gray-900 border border-gray-100 flex items-center justify-center h-48">
                  <img 
                    src={imageSrc} 
                    alt="Screenshot preview" 
                    className="max-h-full max-w-full object-contain"
                  />
                  <button 
                    onClick={() => setImageSrc(null)}
                    className="absolute top-2 right-2 bg-red-600/90 hover:bg-red-700 text-white rounded-lg p-1.5 text-[10px] font-semibold transition cursor-pointer"
                  >
                    清除圖片
                  </button>
                </div>
              )}

              {/* Recognition Button */}
              <div className="flex justify-center">
                <button 
                  type="button"
                  onClick={analyzeScreenshot}
                  disabled={!imageSrc || loading}
                  className="w-full max-w-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold py-2.5 rounded-lg shadow-sm hover:shadow-md transition flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>AI 正在判讀畫面資訊...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>開始 AI 辨識</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Messages */}
          {error && (
            <div className="bg-red-50 text-red-700 text-xs px-4 py-3 rounded-xl border border-red-100 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="font-semibold">{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 text-emerald-700 text-xs px-4 py-3 rounded-xl border border-emerald-100 flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span className="font-semibold">{successMsg}</span>
            </div>
          )}

          {/* AI Output Checklist Grid */}
          {batchTransactions.length > 0 && (
            <div className="bg-white rounded-2xl shadow-xs border border-gray-100 p-6" id="batch_entry_form">
              <div className="flex justify-between items-center mb-5 pb-3 border-b border-gray-100">
                <div>
                  <h3 className="text-base font-bold text-gray-800">核對辨識交易明細</h3>
                </div>
                <div className="flex items-center space-x-1.5 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 font-semibold">
                  <ListPlus className="w-4 h-4" />
                  <span>已辨識出 {batchTransactions.length} 筆項目</span>
                </div>
              </div>

              <div className="space-y-4">
                {batchTransactions.map((row, idx) => {
                  const isStockType = ['buy', 'sell', 'dividend'].includes(row.type);
                  const isCashType = ['cash_in', 'cash_out'].includes(row.type);

                  return (
                    <div 
                      key={idx} 
                      className="bg-gray-50 p-5 rounded-xl border border-gray-200/60 relative hover:border-gray-300 transition-colors"
                    >
                      <button 
                        type="button"
                        onClick={() => deleteBatchRow(idx)}
                        className="absolute top-4 right-4 text-gray-400 hover:text-red-500 p-1.5 rounded-lg transition cursor-pointer"
                        title="刪除此筆"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                        {/* 1 & 2. Transaction Type & Date (Side by side on mobile) */}
                        <div className="col-span-1 md:col-span-4 grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 block mb-1">交易類型</label>
                            <select
                              value={row.type}
                              onChange={(e) => {
                                const newType = e.target.value as TransactionType;
                                const defaultSplitType = (newType === 'buy' || newType === 'sell') ? 'shares' : 'ratio';
                                updateBatchRow(idx, { 
                                  type: newType,
                                  splitType: defaultSplitType,
                                  member: newType === 'cash_in' || newType === 'cash_out' ? 'yun' : undefined,
                                  yunShares: 0,
                                  broShares: 0
                                });
                              }}
                              className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-semibold text-gray-700 focus:outline-none focus:border-blue-500"
                            >
                              <option value="buy">買進 (Buy)</option>
                              <option value="sell">賣出 (Sell)</option>
                              <option value="dividend">現金股利</option>
                              <option value="cash_in">存入現金</option>
                              <option value="cash_out">領出現金</option>
                              <option value="note">純注記</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 block mb-1">交易日期</label>
                            <input
                              type="date"
                              value={row.date}
                              onChange={(e) => updateBatchRow(idx, { date: e.target.value })}
                              className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-sans font-medium"
                              required
                            />
                          </div>
                        </div>

                        {/* 3. Stock info (symbol & name) OR Member info (for cash) */}
                        {isStockType ? (
                          <div className="md:col-span-3 grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-bold text-gray-500 block mb-1">股票代碼</label>
                              <input
                                type="text"
                                value={row.symbol || ''}
                                onChange={(e) => updateBatchRow(idx, { symbol: e.target.value })}
                                placeholder="如 2330"
                                className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-sans font-medium text-center"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-gray-500 block mb-1">股票名稱</label>
                              <input
                                type="text"
                                value={row.name || ''}
                                onChange={(e) => updateBatchRow(idx, { name: e.target.value })}
                                placeholder="如 台積電"
                                className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-medium text-center"
                              />
                            </div>
                          </div>
                        ) : isCashType ? (
                          <div className="md:col-span-3">
                            <label className="text-[10px] font-bold text-gray-500 block mb-1">歸屬成員</label>
                            <select
                              value={row.member || 'yun'}
                              onChange={(e) => updateBatchRow(idx, { member: e.target.value as any })}
                              className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-gray-700"
                            >
                              <option value="yun">Yun 的現金</option>
                              <option value="bro">哥哥的現金</option>
                            </select>
                          </div>
                        ) : (
                          <div className="md:col-span-3">
                            <label className="text-[10px] font-bold text-gray-500 block mb-1">對象/說明</label>
                            <input
                              type="text"
                              value={row.note || ''}
                              onChange={(e) => updateBatchRow(idx, { note: e.target.value })}
                              placeholder="無特定對象"
                              className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm"
                            />
                          </div>
                        )}

                        {/* 4. Financial values (dynamic layout based on type) */}
                        {row.type === 'buy' || row.type === 'sell' ? (
                          <div className="md:col-span-5 grid grid-cols-4 gap-1.5">
                            <div>
                              <label className="text-[10px] font-bold text-gray-400 block mb-1">成交張數</label>
                              <NumberField
                                value={row.shares || 0}
                                scale={1000}
                                allowDecimal
                                onChange={(v) => {
                                  const pr = row.price || 0;
                                  updateBatchRow(idx, { shares: v, amount: Math.round(v * pr), yunShares: 0, broShares: 0 });
                                }}
                                className="w-full bg-white border border-gray-200 rounded-lg px-1 py-1.5 text-sm font-sans font-semibold text-center"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-gray-400 block mb-1">成交單價</label>
                              <NumberField
                                value={row.price || 0}
                                allowDecimal
                                onChange={(v) => {
                                  const sh = row.shares || 0;
                                  updateBatchRow(idx, { price: v, amount: Math.round(sh * v) });
                                }}
                                className="w-full bg-white border border-gray-200 rounded-lg px-1 py-1.5 text-sm font-sans font-semibold text-center"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-gray-400 block mb-1">手續費</label>
                              <NumberField
                                value={row.fee || 0}
                                onChange={(v) => updateBatchRow(idx, { fee: v })}
                                className="w-full bg-white border border-gray-200 rounded-lg px-1 py-1.5 text-sm font-sans text-center"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-gray-400 block mb-1">
                                {row.type === 'sell' ? '證交稅' : '備註'}
                              </label>
                              {row.type === 'sell' ? (
                                <NumberField
                                  value={row.tax || 0}
                                  onChange={(v) => updateBatchRow(idx, { tax: v })}
                                  className="w-full bg-white border border-gray-200 rounded-lg px-1 py-1.5 text-sm font-sans text-center text-red-500"
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={row.note || ''}
                                  onChange={(e) => updateBatchRow(idx, { note: e.target.value })}
                                  placeholder="..."
                                  className="w-full bg-white border border-gray-200 rounded-lg px-1 py-1.5 text-sm text-center"
                                />
                              )}
                            </div>
                          </div>
                        ) : row.type === 'dividend' ? (
                          <div className="md:col-span-5 grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-bold text-blue-600 block mb-1">實收金額 (Payout)</label>
                              <NumberField
                                value={row.payout || 0}
                                onChange={(v) => updateBatchRow(idx, { payout: v })}
                                className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-sans font-semibold text-blue-600"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-gray-500 block mb-1">代扣稅額 (Tax)</label>
                              <NumberField
                                value={row.tax || 0}
                                onChange={(v) => updateBatchRow(idx, { tax: v })}
                                className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-sans font-medium"
                              />
                            </div>
                          </div>
                        ) : (
                          /* For Cash / Note */
                          <div className="md:col-span-5 grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-bold text-purple-600 block mb-1">異動金額 (Amount)</label>
                              <NumberField
                                value={row.amount || 0}
                                onChange={(v) => updateBatchRow(idx, { amount: v })}
                                className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-sans font-semibold text-purple-600"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-gray-500 block mb-1">備註說明</label>
                              <input
                                type="text"
                                value={row.note || ''}
                                onChange={(e) => updateBatchRow(idx, { note: e.target.value })}
                                placeholder="例如：銀行存款息、存入現金"
                                className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 5. Split controls (股票類才需要拆股/拆息) */}
                      {isStockType && (
                        <div className="mt-4 pt-3 border-t border-gray-200/50 flex flex-wrap items-center justify-between gap-4">
                          {/* Detail controls */}
                          {(row.type === 'buy' || row.type === 'sell') && (
                            <div className="w-full grid grid-cols-2 sm:grid-cols-3 gap-2 items-end">
                              <div>
                                <label className="text-[10px] font-bold text-blue-700 block mb-1">Yun</label>
                                <NumberField
                                  value={row.yunShares || 0}
                                  scale={1000}
                                  allowDecimal
                                  onChange={(v) => {
                                    const ys = Math.max(0, v);
                                    const tot = row.shares || 0;
                                    updateBatchRow(idx, { yunShares: ys, broShares: Math.max(0, tot - ys) });
                                  }}
                                  className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-sans font-semibold text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-amber-700 block mb-1">哥哥</label>
                                <NumberField
                                  value={row.broShares || 0}
                                  scale={1000}
                                  allowDecimal
                                  onChange={(v) => {
                                    const bs = Math.max(0, v);
                                    const tot = row.shares || 0;
                                    updateBatchRow(idx, { broShares: bs, yunShares: Math.max(0, tot - bs) });
                                  }}
                                  className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-sans font-semibold text-center focus:outline-none focus:ring-1 focus:ring-amber-500"
                                />
                              </div>
                              <div className="col-span-2 sm:col-span-1 text-[11px] text-gray-400 font-bold pb-2">
                                共 {(row.shares || 0) / 1000} 張
                              </div>
                            </div>
                          )}

                          {row.type === 'dividend' && (
                            <div className="text-[10px] text-gray-500 bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-lg border border-emerald-100/60 flex items-center space-x-1">
                              <span>🍃 股利將在入帳時，根據除息基準日當天的「實際持股比例」自動精確拆分。無持股時則採預設比例。</span>
                            </div>
                          )}

                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-6 border-t border-gray-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setBatchTransactions([]);
                    setImageSrc(null);
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 font-semibold cursor-pointer"
                >
                  放棄明細
                </button>
                <button
                  type="button"
                  onClick={handleBatchConfirm}
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold px-6 py-2.5 rounded-lg shadow-sm hover:shadow-md transition text-xs flex items-center space-x-1.5 cursor-pointer"
                >
                  {submitting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  <span>{submitting ? '寫入中…' : `批次核對完成，全部確認入帳 (${batchTransactions.length} 筆)`}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Interface: Manual Entry Form */}
      {activeTab === 'manual' && (
        <div className="bg-white rounded-2xl shadow-xs border border-gray-100 p-6" id="single_entry_form">
          <h3 className="text-base font-bold text-gray-800 mb-5 pb-3 border-b border-gray-100">
            登錄交易資訊 (手動填寫)
          </h3>

          <form onSubmit={handleSingleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Type selection & Date (Side by side on mobile) */}
              <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1.5">異動類型</label>
                  <select
                    value={txType}
                    onChange={(e) => {
                      const newType = e.target.value as TransactionType;
                      setTxType(newType);
                      if (newType === 'buy' || newType === 'sell') {
                        setSplitType('shares');
                      } else {
                        setSplitType('ratio');
                      }
                    }}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none font-medium"
                  >
                    <option value="buy">📈 買進台股</option>
                    <option value="sell">📉 賣出台股</option>
                    <option value="dividend">🌸 現金股利 (配息)</option>
                    <option value="cash_in">💵 存入現金 (雙人/單人)</option>
                    <option value="cash_out">📤 領出現金 (雙人/單人)</option>
                    <option value="note">📝 純文字備忘注記</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1.5">交易日期</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none font-sans font-medium"
                    required
                  />
                </div>
              </div>

              {/* Stock symbol & name (conditional) */}
              {(txType === 'buy' || txType === 'sell' || txType === 'dividend') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">股票代碼</label>
                    <input
                      type="text"
                      placeholder="如 2330"
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none font-sans font-medium"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">股票名稱</label>
                    <input
                      type="text"
                      placeholder="如 台積電"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none font-medium"
                      required
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Price details (conditional on buy/sell) - Simple white layout with larger text and labels */}
            {(txType === 'buy' || txType === 'sell') && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-5 pb-2 border-t border-b border-gray-100">
                <div>
                  <label className="text-sm font-extrabold text-gray-700 block mb-1.5">成交總張數</label>
                  <NumberField
                    value={shares}
                    scale={1000}
                    allowDecimal
                    required
                    onChange={(v) => { setShares(v); setAmount(Math.round(v * price)); }}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans font-semibold focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-extrabold text-gray-700 block mb-1.5">成交單價 (元)</label>
                  <NumberField
                    value={price}
                    allowDecimal
                    required
                    onChange={(v) => { setPrice(v); setAmount(Math.round(shares * v)); }}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans font-semibold focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-extrabold text-gray-700 block mb-1.5">成交金額 (未含手續費)</label>
                  <NumberField
                    value={amount}
                    required
                    onChange={(v) => setAmount(v)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans font-semibold focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-extrabold text-gray-700 block mb-1.5">券商手續費 (元)</label>
                  <NumberField
                    value={fee}
                    onChange={(v) => setFee(v)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans font-semibold focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                {txType === 'sell' && (
                  <div>
                    <label className="text-sm font-extrabold text-gray-700 block mb-1.5">政府證交稅 (元)</label>
                    <NumberField
                      value={tax}
                      onChange={(v) => setTax(v)}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans font-semibold text-red-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Dividend layout - Simple layout with larger text */}
            {txType === 'dividend' && (
              <div className="grid grid-cols-2 gap-6 pt-5 pb-2 border-t border-b border-gray-100">
                <div>
                  <label className="text-sm font-extrabold text-gray-700 block mb-1.5">實付股利金額 (入帳現金)</label>
                  <NumberField
                    value={payout}
                    required
                    onChange={(v) => setPayout(v)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans font-semibold focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-extrabold text-gray-700 block mb-1.5">代扣稅費 (所得稅/補充保費備查)</label>
                  <NumberField
                    value={tax}
                    onChange={(v) => setTax(v)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans font-semibold focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Cash deposit / withdraw layout - Simple white layout */}
            {(txType === 'cash_in' || txType === 'cash_out') && (
              <div className="grid grid-cols-2 gap-6 pt-5 pb-2 border-t border-b border-gray-100">
                <div>
                  <label className="text-sm font-extrabold text-gray-700 block mb-1.5">異動現金金額 (元)</label>
                  <NumberField
                    value={amount}
                    required
                    onChange={(v) => setAmount(v)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans font-semibold focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-extrabold text-gray-700 block mb-1.5">歸屬對象</label>
                  <select
                    value={member}
                    onChange={(e) => setMember(e.target.value as any)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="yun">Yun</option>
                    <option value="bro">哥哥</option>
                  </select>
                </div>
              </div>
            )}

            {/* Split rules section - Completely borderless, just top divider */}
            {(txType === 'buy' || txType === 'sell' || txType === 'dividend') && (
              <div className="pt-5 border-t border-gray-100 space-y-4">
                {/* For buy/sell: Directly show specified sheets input fields without headers or toggles */}
                {(txType === 'buy' || txType === 'sell') && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="text-sm font-extrabold text-blue-700 block mb-1.5">Yun 分配張數 (張)</label>
                        <NumberField
                          value={yunShares}
                          scale={1000}
                          allowDecimal
                          onChange={(v) => {
                            const ys = Math.max(0, Math.min(shares, v));
                            setYunShares(ys);
                            setBroShares(Math.max(0, shares - ys));
                          }}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans font-semibold text-center focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-extrabold text-amber-700 block mb-1.5">哥哥分配張數 (張)</label>
                        <NumberField
                          value={broShares}
                          scale={1000}
                          allowDecimal
                          onChange={(v) => {
                            const bs = Math.max(0, Math.min(shares, v));
                            setBroShares(bs);
                            setYunShares(Math.max(0, shares - bs));
                          }}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans font-semibold text-center focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="text-xs text-center text-gray-400 font-bold font-sans">
                      合計必須等於本次成交總張數 <span className="font-extrabold text-gray-600">{shares / 1000}</span> 張
                    </div>
                  </div>
                )}

                {/* For Dividend */}
                {txType === 'dividend' && (
                  <div className="text-xs text-gray-500 bg-emerald-50 text-emerald-800 px-4 py-3 rounded-lg border border-emerald-100/60 leading-relaxed font-bold">
                    🍃 股利將在入帳時，根據除息基準日當天的「實際持股比例」自動精確拆分。無持股時則採預設比例。
                  </div>
                )}

              </div>
            )}

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1.5">交易備註備忘</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="輸入點備註，像是手續費打折折讓、或哥哥特別交代之類..."
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="pt-4 border-t border-gray-100 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold px-6 py-2.5 rounded-lg shadow-sm hover:shadow-md transition text-xs flex items-center space-x-1.5 cursor-pointer"
              >
                {submitting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                <span>{submitting ? '寫入中…' : '確認交易並記入帳本'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
