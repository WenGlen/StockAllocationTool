/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Table, 
  Settings as SettingsIcon, 
  MapPin, 
  Download, 
  Upload, 
  Plus, 
  Trash2, 
  Save, 
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Database
} from 'lucide-react';
import { Transaction, Settings, StockAlias } from '../types';

interface SpreadsheetTabProps {
  transactions: Transaction[];
  settings: Settings;
  stockAliases: StockAlias[];
  onImportDBState: (state: { transactions?: Transaction[]; settings?: Settings; stockAliases?: StockAlias[] }) => void;
  onUpdateSettings: (settings: Settings) => void;
  onUpdateStockAliases: (aliases: StockAlias[]) => void;
}

export default function SpreadsheetTab({
  transactions,
  settings,
  stockAliases,
  onImportDBState,
  onUpdateSettings,
  onUpdateStockAliases,
}: SpreadsheetTabProps) {
  const [activeSheet, setActiveSheet] = useState<'transactions' | 'aliases' | 'settings'>('transactions');

  // CSV Import State
  const [csvText, setCsvText] = useState('');
  const [importTarget, setImportTarget] = useState<'transactions' | 'aliases'>('transactions');
  const [importStatus, setImportStatus] = useState<{ success?: string; error?: string } | null>(null);

  // Settings local state
  const [localYunRatio, setLocalYunRatio] = useState(settings.yunDefaultRatio);
  const [localBroRatio, setLocalBroRatio] = useState(settings.broDefaultRatio);

  // New stock alias state
  const [newSymbol, setNewSymbol] = useState('');
  const [newAliasText, setNewAliasText] = useState('');

  const handleSaveSettings = () => {
    onUpdateSettings({
      yunDefaultRatio: localYunRatio,
      broDefaultRatio: localBroRatio,
    });
    alert('✅ 系統預設分潤比例已更新！');
  };

  const handleAddAlias = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol.trim() || !newAliasText.trim()) return;

    const aliasesArray = newAliasText.split(',').map(s => s.trim()).filter(Boolean);
    const existingIdx = stockAliases.findIndex(a => a.symbol === newSymbol.trim());

    let updated = [...stockAliases];
    if (existingIdx >= 0) {
      updated[existingIdx].aliases = Array.from(new Set([...updated[existingIdx].aliases, ...aliasesArray]));
    } else {
      updated.push({
        symbol: newSymbol.trim(),
        aliases: aliasesArray,
      });
    }

    onUpdateStockAliases(updated);
    setNewSymbol('');
    setNewAliasText('');
  };

  const handleDeleteAlias = (sym: string) => {
    const updated = stockAliases.filter(a => a.symbol !== sym);
    onUpdateStockAliases(updated);
  };

  // CSV Exporter
  const exportToCSV = (target: 'transactions' | 'aliases') => {
    let headers: string[] = [];
    let rows: string[][] = [];
    let filename = '';

    if (target === 'transactions') {
      headers = [
        'id', 'date', 'type', 'symbol', 'name', 'shares', 'price', 'amount', 
        'fee', 'tax', 'payout', 'splitType', 'yunRatio', 'broRatio', 
        'yunShares', 'broShares', 'member', 'note', 'createdAt'
      ];
      rows = transactions.map(t => [
        t.id,
        t.date,
        t.type,
        t.symbol || '',
        t.name || '',
        (t.shares ?? '').toString(),
        (t.price ?? '').toString(),
        (t.amount ?? '').toString(),
        (t.fee ?? '').toString(),
        (t.tax ?? '').toString(),
        (t.payout ?? '').toString(),
        t.splitType || '',
        (t.yunRatio ?? '').toString(),
        (t.broRatio ?? '').toString(),
        (t.yunShares ?? '').toString(),
        (t.broShares ?? '').toString(),
        t.member || '',
        t.note || '',
        t.createdAt
      ]);
      filename = `transactions_sheet_${new Date().toISOString().split('T')[0]}.csv`;
    } else {
      headers = ['symbol', 'aliases'];
      rows = stockAliases.map(a => [
        a.symbol,
        a.aliases.join('|')
      ]);
      filename = `stock_aliases_sheet_${new Date().toISOString().split('T')[0]}.csv`;
    }

    const csvContent = "\uFEFF" + [
      headers.join(','),
      ...rows.map(r => r.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV Importer Parser
  const handleCSVImport = () => {
    setImportStatus(null);
    if (!csvText.trim()) {
      setImportStatus({ error: '請貼上 CSV 文字內容' });
      return;
    }

    try {
      const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        throw new Error('CSV 內容行數不足（必須包含標頭與至少一筆資料）');
      }

      // Simple CSV parser supporting double quotes
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let curVal = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              curVal += '"';
              i++; // skip next double quote
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(curVal);
            curVal = '';
          } else {
            curVal += char;
          }
        }
        result.push(curVal);
        return result;
      };

      const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());

      if (importTarget === 'transactions') {
        const list: Transaction[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = parseCSVLine(lines[i]);
          const obj: any = {};
          headers.forEach((h, idx) => {
            let val: any = cols[idx];
            if (val === undefined || val === '') {
              val = undefined;
            } else {
              // Convert numbers
              if (['shares', 'price', 'amount', 'fee', 'tax', 'payout', 'yunratio', 'broratio', 'yunshares', 'broshares'].includes(h)) {
                val = parseFloat(val);
                if (isNaN(val)) val = undefined;
              }
            }
            // map header key to obj
            let key = h;
            if (h === 'yunratio') key = 'yunRatio';
            if (h === 'broratio') key = 'broRatio';
            if (h === 'yunshares') key = 'yunShares';
            if (h === 'broshares') key = 'broShares';
            if (h === 'splittype') key = 'splitType';
            if (h === 'createdat') key = 'createdAt';
            
            obj[key] = val;
          });

          if (!obj.id || !obj.date || !obj.type) {
            throw new Error(`第 ${i + 1} 行缺少必要欄位 (id, date 或 type)`);
          }

          list.push({
            id: obj.id,
            date: obj.date,
            type: obj.type,
            symbol: obj.symbol,
            name: obj.name,
            shares: obj.shares,
            price: obj.price,
            amount: obj.amount,
            fee: obj.fee,
            tax: obj.tax,
            payout: obj.payout,
            splitType: obj.splitType,
            yunRatio: obj.yunRatio,
            broRatio: obj.broRatio,
            yunShares: obj.yunShares,
            broShares: obj.broShares,
            member: obj.member,
            note: obj.note,
            createdAt: obj.createdAt || new Date().toISOString()
          });
        }

        onImportDBState({ transactions: list });
        setImportStatus({ success: `🎉 成功匯入 ${list.length} 筆交易紀錄！已覆蓋現有帳目。` });
        setCsvText('');
      } else {
        // Import stock aliases
        const list: StockAlias[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = parseCSVLine(lines[i]);
          const symbolVal = cols[0]?.trim();
          const aliasesVal = cols[1]?.trim() || '';
          
          if (!symbolVal) continue;
          list.push({
            symbol: symbolVal,
            aliases: aliasesVal.split('|').map(s => s.trim()).filter(Boolean)
          });
        }

        onImportDBState({ stockAliases: list });
        setImportStatus({ success: `🎉 成功匯入 ${list.length} 筆股票別名映射設定！` });
        setCsvText('');
      }
    } catch (err: any) {
      setImportStatus({ error: `匯入失敗: ${err.message || '格式解析錯誤'}` });
    }
  };

  const exportAllBackup = () => {
    const fullState = {
      transactions,
      settings,
      stockAliases,
      version: 'v0.2',
      exportAt: new Date().toISOString()
    };
    const jsonString = JSON.stringify(fullState, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `stock_split_ledger_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6" id="spreadsheet_tab">
      {/* Tab select bar */}
      <div className="flex border-b border-gray-100 bg-white rounded-t-xl p-2 pb-0 flex-wrap gap-2">
        <button
          onClick={() => setActiveSheet('transactions')}
          className={`flex items-center space-x-1.5 py-3 px-5 text-xs font-bold border-b-2 transition rounded-t-md cursor-pointer ${activeSheet === 'transactions' ? 'border-green-600 text-green-700 bg-green-50/20' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
        >
          <FileSpreadsheet className="w-4 h-4 text-green-600" />
          <span>Sheet 1: 交易歷史對帳簿 (Transactions)</span>
        </button>
        <button
          onClick={() => setActiveSheet('aliases')}
          className={`flex items-center space-x-1.5 py-3 px-5 text-xs font-bold border-b-2 transition rounded-t-md cursor-pointer ${activeSheet === 'aliases' ? 'border-green-600 text-green-700 bg-green-50/20' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
        >
          <MapPin className="w-4 h-4 text-green-600" />
          <span>Sheet 2: 股票別名映射 (StockAliases)</span>
        </button>
        <button
          onClick={() => setActiveSheet('settings')}
          className={`flex items-center space-x-1.5 py-3 px-5 text-xs font-bold border-b-2 transition rounded-t-md cursor-pointer ${activeSheet === 'settings' ? 'border-green-600 text-green-700 bg-green-50/20' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
        >
          <SettingsIcon className="w-4 h-4 text-green-600" />
          <span>Sheet 3: 系統分潤參數 (Settings)</span>
        </button>
      </div>

      {/* Main Grid display */}
      <div className="bg-white rounded-b-xl border border-t-0 border-gray-100 shadow-xs p-6 mt-0">
        
        {/* Transactions Spreadsheet view */}
        {activeSheet === 'transactions' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-4">
              <div>
                <h4 className="text-sm font-bold text-gray-700 flex items-center space-x-1.5">
                  <Table className="w-4 h-4 text-green-600" />
                  <span>Google Sheets 對接結構 (共 {transactions.length} 列資料)</span>
                </h4>
                <p className="text-xs text-gray-400 mt-0.5">此表單結構直接對齊 Google Sheet 的 A1:S 欄位，支援雙向導出 CSV 明細</p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => exportToCSV('transactions')}
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold text-xs px-3.5 py-2 rounded-lg transition flex items-center space-x-1 shadow-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>導出 CSV 試算表</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl" id="sheet_transactions_container">
              <table className="w-full text-left border-collapse text-[10px] font-mono whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-100 text-gray-600 font-bold border-b border-gray-200">
                    <th className="py-2.5 px-3 border-r border-gray-200 text-center">Row</th>
                    <th className="py-2.5 px-3 border-r border-gray-200">id (主鍵)</th>
                    <th className="py-2.5 px-3 border-r border-gray-200">date (日期)</th>
                    <th className="py-2.5 px-3 border-r border-gray-200">type (類型)</th>
                    <th className="py-2.5 px-3 border-r border-gray-200">symbol (代碼)</th>
                    <th className="py-2.5 px-3 border-r border-gray-200">name (名稱)</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 text-right">shares (股數)</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 text-right">price (價格)</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 text-right">amount (金額)</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 text-right">fee (手續費)</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 text-right">tax (證交稅)</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 text-right">payout (股利)</th>
                    <th className="py-2.5 px-3 border-r border-gray-200">splitType</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 text-right">yunRatio</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 text-right">broRatio</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 text-right">yunShares</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 text-right">broShares</th>
                    <th className="py-2.5 px-3 border-r border-gray-200">member</th>
                    <th className="py-2.5 px-3 border-r border-gray-200">note (備註)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {transactions.map((t, idx) => (
                    <tr key={t.id} className="hover:bg-gray-50/70">
                      <td className="py-2 px-3 border-r border-gray-200 text-center bg-gray-50 text-gray-400 font-sans font-bold">{idx + 2}</td>
                      <td className="py-2 px-3 border-r border-gray-200 text-gray-400 max-w-[80px] truncate" title={t.id}>{t.id}</td>
                      <td className="py-2 px-3 border-r border-gray-200 font-sans font-semibold text-gray-800">{t.date}</td>
                      <td className="py-2 px-3 border-r border-gray-200 font-sans text-gray-600"><span className="px-1.5 py-0.5 bg-gray-100 rounded text-[9px]">{t.type}</span></td>
                      <td className="py-2 px-3 border-r border-gray-200 text-blue-600 font-bold">{t.symbol || ''}</td>
                      <td className="py-2 px-3 border-r border-gray-200 font-sans">{t.name || ''}</td>
                      <td className="py-2 px-3 border-r border-gray-200 text-right font-sans">{t.shares ?? ''}</td>
                      <td className="py-2 px-3 border-r border-gray-200 text-right font-sans">{t.price ?? ''}</td>
                      <td className="py-2 px-3 border-r border-gray-200 text-right font-sans">{t.amount ?? ''}</td>
                      <td className="py-2 px-3 border-r border-gray-200 text-right font-sans">{t.fee ?? ''}</td>
                      <td className="py-2 px-3 border-r border-gray-200 text-right font-sans">{t.tax ?? ''}</td>
                      <td className="py-2 px-3 border-r border-gray-200 text-right font-sans">{t.payout ?? ''}</td>
                      <td className="py-2 px-3 border-r border-gray-200">{t.splitType || ''}</td>
                      <td className="py-2 px-3 border-r border-gray-200 text-right font-sans">{t.yunRatio ?? ''}</td>
                      <td className="py-2 px-3 border-r border-gray-200 text-right font-sans">{t.broRatio ?? ''}</td>
                      <td className="py-2 px-3 border-r border-gray-200 text-right font-sans">{t.yunShares ?? ''}</td>
                      <td className="py-2 px-3 border-r border-gray-200 text-right font-sans">{t.broShares ?? ''}</td>
                      <td className="py-2 px-3 border-r border-gray-200">{t.member || ''}</td>
                      <td className="py-2 px-3 border-r border-gray-200 font-sans max-w-[150px] truncate" title={t.note}>{t.note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Stock Aliases spreadsheet view */}
        {activeSheet === 'aliases' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-4">
              <div>
                <h4 className="text-sm font-bold text-gray-700 flex items-center space-x-1.5">
                  <MapPin className="w-4 h-4 text-green-600" />
                  <span>股票代號別名映射 (StockAlias 規則，共 {stockAliases.length} 列映射)</span>
                </h4>
                <p className="text-xs text-gray-400 mt-0.5">由於證券 App 與網銀的股票稱呼可能有些微落差（例如 0050 稱元大台灣50、或 2330 稱台積電），可在此設定關鍵字別名，方便 AI 精準匹配代號</p>
              </div>
              <button
                onClick={() => exportToCSV('aliases')}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold text-xs px-3.5 py-2 rounded-lg transition flex items-center space-x-1 shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>導出別名 CSV</span>
              </button>
            </div>

            {/* Alias creator */}
            <form onSubmit={handleAddAlias} className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex flex-col sm:flex-row gap-4 items-end">
              <div className="w-full sm:w-32">
                <label className="text-[10px] font-bold text-gray-500 block mb-1">股票代碼</label>
                <input
                  type="text"
                  placeholder="如 2330"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-sans font-medium"
                  required
                />
              </div>
              <div className="flex-1 w-full">
                <label className="text-[10px] font-bold text-gray-500 block mb-1">對應別名關鍵字 (以英文逗號隔開)</label>
                <input
                  type="text"
                  placeholder="如 台積電, 2330台積電, 台積"
                  value={newAliasText}
                  onChange={(e) => setNewAliasText(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium"
                  required
                />
              </div>
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2 h-[34px] rounded-lg transition flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>新增映射關係</span>
              </button>
            </form>

            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-gray-100 text-gray-600 font-bold border-b border-gray-200">
                    <th className="py-2.5 px-4 border-r border-gray-200">股票代碼</th>
                    <th className="py-2.5 px-4 border-r border-gray-200">已關聯別名關鍵字</th>
                    <th className="py-2.5 px-4 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {stockAliases.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-gray-400 font-sans italic">目前無自訂別名映射，AI 將以內建資料與模糊搜尋比對。</td>
                    </tr>
                  ) : (
                    stockAliases.map((a) => (
                      <tr key={a.symbol} className="hover:bg-gray-50/50">
                        <td className="py-3 px-4 border-r border-gray-200 text-blue-600 font-bold">{a.symbol}</td>
                        <td className="py-3 px-4 border-r border-gray-200 font-sans">
                          <div className="flex flex-wrap gap-1.5">
                            {a.aliases.map((alias, idx) => (
                              <span key={idx} className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-md text-[10px] font-medium">
                                {alias}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-sans">
                          <button
                            onClick={() => handleDeleteAlias(a.symbol)}
                            className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Settings spreadsheet view */}
        {activeSheet === 'settings' && (
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-bold text-gray-700 flex items-center space-x-1.5">
                <SettingsIcon className="w-4 h-4 text-green-600" />
                <span>分潤比率參數試算表 (Settings)</span>
              </h4>
              <p className="text-xs text-gray-400 mt-0.5">設定預設無指定拆分股數時的「預設分帳分潤比例」（例如：Yun 出資 60%、哥哥出資 40%）</p>
            </div>

            <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 max-w-md space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-blue-800 block mb-1.5">Yun 預設拆帳比 (%)</label>
                  <input
                    type="number"
                    value={localYunRatio}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                      setLocalYunRatio(val);
                      setLocalBroRatio(100 - val);
                    }}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs font-sans font-bold text-center"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-amber-800 block mb-1.5">哥哥預設拆帳比 (%)</label>
                  <input
                    type="number"
                    value={localBroRatio}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                      setLocalBroRatio(val);
                      setLocalYunRatio(100 - val);
                    }}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs font-sans font-bold text-center"
                    required
                  />
                </div>
              </div>

              <div className="text-[10px] text-gray-400 font-sans text-center">
                合計必須精準等於 100%
              </div>

              <button
                onClick={handleSaveSettings}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold text-xs py-2.5 rounded-lg transition shadow-xs flex items-center justify-center space-x-1 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>儲存設定參數</span>
              </button>
            </div>
          </div>
        )}

        {/* CSV Import Panel (F1-a Paste Import Area) */}
        <div className="mt-8 pt-8 border-t border-gray-200">
          <div className="flex items-center space-x-2 text-gray-800 mb-4">
            <Upload className="w-5 h-5 text-green-600" />
            <h4 className="text-xs font-bold">歷史對帳表 CSV 貼上匯入機制 (F1-a)</h4>
          </div>
          <p className="text-xs text-gray-500 mb-4 leading-normal">
            若欲從舊 Excel/Google Sheets 貼上備份，請選擇要匯入的試算表對象，將該 CSV 字元內容直接貼在下方框中，點擊確認即可一鍵完整轉移資料。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            <div className="md:col-span-2 space-y-4">
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder='請在此貼上 CSV 內容，包含首行標頭列。例如：&#10;id,date,type,symbol,name,shares,price,amount&#10;"tx_001","2026-06-24","buy","2330","台積電",1000,950,950000'
                rows={6}
                className="w-full border border-gray-300 rounded-xl p-4 text-[11px] font-mono focus:ring-1 focus:ring-green-500 focus:outline-none"
              />

              <div className="flex items-center space-x-3">
                <select
                  value={importTarget}
                  onChange={(e) => setImportTarget(e.target.value as any)}
                  className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600"
                >
                  <option value="transactions">匯入為：交易歷史帳簿 (Transactions)</option>
                  <option value="aliases">匯入為：股票別名映射 (StockAliases)</option>
                </select>

                <button
                  onClick={handleCSVImport}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold text-xs px-5 py-2 rounded-lg transition shadow-xs cursor-pointer"
                >
                  確認匯入覆蓋
                </button>
              </div>
            </div>

            {/* Quick backup info */}
            <div className="p-5 bg-gray-50 border border-gray-200 rounded-xl space-y-4">
              <div className="flex items-center space-x-1.5 text-gray-700">
                <Database className="w-4.5 h-4.5 text-blue-500" />
                <h5 className="text-xs font-bold">全帳本備份 JSON 下載</h5>
              </div>
              <p className="text-[11px] text-gray-400 leading-normal">
                這會將交易簿、分潤設定、別名映射這三大工作表整合成單一 `.json` 檔案。方便進行完整的本地備份。
              </p>
              <button
                onClick={exportAllBackup}
                className="w-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-xs py-2.5 rounded-lg transition shadow-xs flex items-center justify-center space-x-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>匯出全系統備份 (JSON)</span>
              </button>
            </div>
          </div>

          {importStatus?.error && (
            <div className="bg-red-50 text-red-700 text-xs px-4 py-2.5 rounded-xl border border-red-100 flex items-center space-x-2 mt-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="font-semibold">{importStatus.error}</span>
            </div>
          )}

          {importStatus?.success && (
            <div className="bg-emerald-50 text-emerald-700 text-xs px-4 py-2.5 rounded-xl border border-emerald-100 flex items-center space-x-2 mt-4">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span className="font-semibold">{importStatus.success}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
