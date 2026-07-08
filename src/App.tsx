/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Coins, 
  Upload, 
  FileText, 
  TableProperties, 
  Settings as SettingsIcon,
  RefreshCw,
  Sparkles,
  BookOpen,
  Database,
  ArrowRightLeft,
  LogOut
} from 'lucide-react';
import { Transaction, Settings, LedgerState } from './types';
import { recalculateLedger } from './utils/ledger';
import DashboardTab from './components/DashboardTab';
import UploadTab from './components/UploadTab';
import LedgerTab from './components/LedgerTab';
import LoginScreen from './components/LoginScreen';

const LOCAL_STORAGE_KEY = 'STOCK_SPLIT_LEDGER_DB';

// 內建 S1 - S7 標準測試場景數據
const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx_s1',
    date: '2026-06-01',
    type: 'settlement',
    member: 'both',
    yunShares: 1000000, // 借存為 Yun 的現金
    broShares: 1000000, // 借存為 哥哥的現金
    note: 'S1: 起始現金對帳對準 (各自存入 1,000,000 元)',
    createdAt: '2026-06-01T00:00:00.000Z'
  },
  {
    id: 'tx_s2',
    date: '2026-06-01',
    type: 'settlement',
    symbol: '0050',
    name: '元大台灣50',
    yunShares: 5000,
    price: 150,
    broShares: 5000,
    broPrice: 152,
    note: 'S2: 0050 股票期初持股與平均成本建置',
    createdAt: '2026-06-01T00:01:00.000Z'
  },
  {
    id: 'tx_s3',
    date: '2026-06-05',
    type: 'buy',
    symbol: '2330',
    name: '台積電',
    shares: 1000,
    price: 950,
    amount: 950000,
    fee: 1353,
    splitType: 'ratio',
    yunRatio: 60,
    broRatio: 40,
    note: 'S3: 買進台積電 1000股 (依拆帳比例 Yun 60% / 哥哥 40%)',
    createdAt: '2026-06-05T09:30:00.000Z'
  },
  {
    id: 'tx_s4',
    date: '2026-06-12',
    type: 'sell',
    symbol: '2330',
    name: '台積電',
    shares: 400,
    price: 960,
    amount: 384000,
    fee: 547,
    tax: 1152,
    splitType: 'ratio',
    yunRatio: 60,
    broRatio: 40,
    note: 'S4: 賣出台積電 400股 (依比例 60:40 解套，金額扣稅費後入帳)',
    createdAt: '2026-06-12T13:45:00.000Z'
  },
  {
    id: 'tx_s5',
    date: '2026-06-18',
    type: 'dividend',
    symbol: '0050',
    name: '元大台灣50',
    payout: 25000,
    tax: 0,
    splitType: 'ratio', // 自動依除息日當日持股比例分配 (此處剛好均為50%)
    note: 'S5: 0050 獲配現金股利 25,000 元，依系統基準日持股比自動精確拆分',
    createdAt: '2026-06-18T10:00:00.000Z'
  },
  {
    id: 'tx_s6',
    date: '2026-06-20',
    type: 'cash_out',
    amount: 10000,
    member: 'yun',
    note: 'S6: Yun 自行提領個人可用現金 (哥哥餘額不受影響)',
    createdAt: '2026-06-20T17:00:00.000Z'
  },
  {
    id: 'tx_s7',
    date: '2026-06-22',
    type: 'adjustment',
    symbol: '0050',
    name: '元大台灣50',
    yunShares: 5100, // 股票配股 100 股給 Yun
    price: 150,
    broShares: 5000,
    broPrice: 152,
    note: 'S7: 0050 股票除權配股修正，將 Yun 的股數手動加記 100 股',
    createdAt: '2026-06-22T08:00:00.000Z'
  }
];

const INITIAL_SETTINGS: Settings = {
  yunDefaultRatio: 50,
  broDefaultRatio: 50
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'ledger'>('dashboard');

  // Database states
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  // 拆帳預設比例固定 50/50（無 UI 可改；現金一律歸個人，不再用 both 拆分）
  const settings: Settings = INITIAL_SETTINGS;

  // Prices overlay state (not saved in localStorage to avoid stale cache)
  const [marketPrices, setMarketPrices] = useState<Record<string, { price: number; date: string }>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [priceUpdateStatus, setPriceUpdateStatus] = useState('');
  const didAutoRefreshPrices = useRef(false);

  // Auth state
  const [authState, setAuthState] = useState<'checking' | 'authed' | 'guest'>('checking');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string>('');

  // 本地快取（僅交易；雲端載入失敗時的離線後備）
  const saveState = (txs: Transaction[]) => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ transactions: txs }));
  };

  // 從 Google Sheet 載入交易（失敗退回本地快取；401 代表登入過期）
  const loadData = async () => {
    try {
      const res = await fetch('/api/transactions');
      if (res.status === 401) { setAuthState('guest'); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const db = await res.json();
      setTransactions(db.transactions || []);
      saveState(db.transactions || []);
    } catch (e) {
      console.warn('雲端載入失敗，改用本地快取', e);
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.transactions) setTransactions(parsed.transactions);
        } catch {
          /* 快取毀損則維持空狀態 */
        }
      }
    }
  };

  // 1. 檢查登入狀態；已登入才載入資料
  const checkAuthAndLoad = async () => {
    try {
      const res = await fetch('/api/auth');
      const data = await res.json();
      if (data.authenticated) {
        setUserEmail(data.email);
        setAuthState('authed');
        loadData();
      } else {
        setGoogleClientId(data.clientId || '');
        setAuthState('guest');
      }
    } catch {
      setAuthState('guest');
    }
  };

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth?action=logout', { method: 'POST' });
    } catch {
      /* 忽略登出網路錯誤 */
    }
    setUserEmail(null);
    setAuthState('guest');
    setTransactions([]);
    setMarketPrices({});
    didAutoRefreshPrices.current = false;
  };

  // 3. Recalculate Ledger dynamically based on sorted ledger
  const ledgerState = useMemo<LedgerState>(() => {
    const rawState = recalculateLedger(transactions, settings);
    
    // Inject market prices if available
    const holdingsWithPrices = { ...rawState.holdings };
    Object.keys(holdingsWithPrices).forEach(symbol => {
      if (marketPrices[symbol]) {
        holdingsWithPrices[symbol] = {
          ...holdingsWithPrices[symbol],
          currentPrice: marketPrices[symbol].price,
          priceDate: marketPrices[symbol].date
        };
      }
    });

    return {
      cash: rawState.cash,
      holdings: holdingsWithPrices
    };
  }, [transactions, settings, marketPrices]);

  // 4. API Call: Batch fetch Taiwan stock prices from server proxy
  const handleRefreshPrices = async () => {
    const uniqueSymbols = Object.keys(ledgerState.holdings).filter(
      sym => ledgerState.holdings[sym].totalShares > 0
    );

    if (uniqueSymbols.length === 0) {
      setPriceUpdateStatus('目前無任何有效持股，無須拉取最新報價。');
      return;
    }

    setLoadingPrices(true);
    setPriceUpdateStatus('正在向台灣證券交易所 (TWSE/TPEx) 連線更新最新每日收盤價...');
    
    const nextPrices = { ...marketPrices };
    let successCount = 0;

    for (const sym of uniqueSymbols) {
      try {
        const res = await fetch(`/api/stock-price?symbol=${sym}`);
        if (!res.ok) throw new Error(`Stock not found`);
        const data = await res.json();
        
        if (data.price) {
          nextPrices[sym] = {
            price: data.price,
            date: data.date || new Date().toISOString().split('T')[0]
          };
          successCount++;
        }
      } catch (e) {
        console.warn(`Failed to fetch price for stock: ${sym}`, e);
        // Ensure error is flagged visually in holdings
      }
    }

    setMarketPrices(nextPrices);
    setLoadingPrices(false);
    setPriceUpdateStatus(`✅ 報價更新完成！成功獲取 ${successCount} 檔股票之官方每日最新收盤價。`);
    
    // Auto clear status message after 5 seconds
    setTimeout(() => {
      setPriceUpdateStatus('');
    }, 6000);
  };

  // 4b. Auto-refresh prices once after data loads, so a page reload also updates
  //     prices (not only the manual 「更新報價」 button). Guarded to run a single time.
  useEffect(() => {
    if (didAutoRefreshPrices.current) return;
    if (transactions.length === 0) return; // wait until ledger data has loaded
    didAutoRefreshPrices.current = true;
    handleRefreshPrices();
  }, [transactions]);

  // 從 Google Sheet 重新載入全部（寫入失敗時用來把畫面同步回真實狀態）
  const resyncFromServer = async () => {
    try {
      const res = await fetch('/api/transactions');
      if (!res.ok) return;
      const db = await res.json();
      setTransactions(db.transactions || []);
      saveState(db.transactions || []);
    } catch (e) {
      console.warn('重新同步失敗', e);
    }
  };

  const notifySaveError = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    alert(`儲存到雲端資料庫失敗：${msg}\n畫面將重新從雲端同步。`);
  };

  // 5. Database mutators — 樂觀更新本地 state，同步寫入 Google Sheet；失敗則重新同步
  const handleAddTransaction = async (newTx: Omit<Transaction, 'id' | 'createdAt'>) => {
    const fullTx: Transaction = {
      ...newTx,
      id: 'tx_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now(),
      createdAt: new Date().toISOString()
    };
    const nextTxs = [...transactions, fullTx];
    setTransactions(nextTxs);
    saveState(nextTxs);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullTx),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
    } catch (e) {
      notifySaveError(e);
      resyncFromServer();
    }
  };

  const handleBatchAddTransactions = async (newTxs: Omit<Transaction, 'id' | 'createdAt'>[]) => {
    const fullTxs: Transaction[] = newTxs.map((tx, idx) => ({
      ...tx,
      id: 'tx_' + Math.random().toString(36).substr(2, 9) + '_' + (Date.now() + idx),
      createdAt: new Date().toISOString()
    }));
    const nextTxs = [...transactions, ...fullTxs];
    setTransactions(nextTxs);
    saveState(nextTxs);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: fullTxs }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
    } catch (e) {
      notifySaveError(e);
      resyncFromServer();
    }
  };

  const handleUpdateTransaction = async (id: string, updatedFields: Partial<Transaction>) => {
    const existing = transactions.find(t => t.id === id);
    if (!existing) return;
    const merged = { ...existing, ...updatedFields };
    const nextTxs = transactions.map(t => t.id === id ? merged : t);
    setTransactions(nextTxs);
    saveState(nextTxs);
    try {
      const res = await fetch('/api/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
    } catch (e) {
      notifySaveError(e);
      resyncFromServer();
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    const nextTxs = transactions.filter(t => t.id !== id);
    setTransactions(nextTxs);
    saveState(nextTxs);
    try {
      const res = await fetch(`/api/transactions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
    } catch (e) {
      notifySaveError(e);
      resyncFromServer();
    }
  };

  // 登入前：檢查中 / 顯示登入頁
  if (authState === 'checking') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm font-bold">載入中…</div>
      </div>
    );
  }
  if (authState === 'guest') {
    return <LoginScreen clientId={googleClientId} onSuccess={checkAuthAndLoad} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16 font-sans">
      {/* Sticky Header + Navigation (single fixed bar) */}
      <header className="bg-slate-900 text-white shadow-md sticky top-0 z-40" id="header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap justify-between items-center gap-3">
          {/* Title only */}
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600 rounded-xl shadow-xs">
              <ArrowRightLeft className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg sm:text-xl font-black tracking-tight">股票分帳對帳工具</h1>
          </div>

          {/* Navigation tabs - aligned to title height */}
          <nav className="flex items-center gap-1 sm:gap-2" id="navigation_menu">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`py-2 px-3 sm:px-4 text-sm sm:text-base font-extrabold rounded-lg flex items-center space-x-1.5 transition cursor-pointer ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}
            >
              <Coins className="w-4 h-4" />
              <span>現況</span>
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`py-2 px-3 sm:px-4 text-sm sm:text-base font-extrabold rounded-lg flex items-center space-x-1.5 transition cursor-pointer ${activeTab === 'upload' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}
            >
              <Upload className="w-4 h-4" />
              <span>上傳</span>
            </button>
            <button
              onClick={() => setActiveTab('ledger')}
              className={`py-2 px-3 sm:px-4 text-sm sm:text-base font-extrabold rounded-lg flex items-center space-x-1.5 transition cursor-pointer ${activeTab === 'ledger' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}
            >
              <FileText className="w-4 h-4" />
              <span>歷史紀錄</span>
            </button>
            <button
              onClick={handleLogout}
              title={userEmail || ''}
              className="py-2 px-3 sm:px-4 text-sm sm:text-base font-extrabold rounded-lg flex items-center space-x-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">登出</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 pt-6">
        {activeTab === 'dashboard' && (
          <DashboardTab
            ledgerState={ledgerState}
            settings={settings}
            onAddTransaction={handleAddTransaction}
            onRefreshPrices={handleRefreshPrices}
            loadingPrices={loadingPrices}
            priceUpdateStatus={priceUpdateStatus}
          />
        )}

        {activeTab === 'upload' && (
          <UploadTab
            settings={settings}
            onAddTransaction={handleAddTransaction}
            onBatchAddTransactions={handleBatchAddTransactions}
          />
        )}

        {activeTab === 'ledger' && (
          <LedgerTab
            transactions={transactions}
            settings={settings}
            onUpdateTransaction={handleUpdateTransaction}
            onDeleteTransaction={handleDeleteTransaction}
          />
        )}
      </main>
    </div>
  );
}
