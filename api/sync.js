// Vercel Serverless Function: Supabase 雲端資料庫雙向同步 API (/api/sync.js)

const DEFAULT_STATE = {
  vehicles: [
    {
      id: 'v1',
      plate: 'ALZ-3759',
      type: '轎車',
      model: 'Toyota Altis',
      mileage: 42850,
      maintMileage: 50000,
      fuelCardId: 'fc-1',
      fuelCardNo: '中油捷利卡 #8839-2041',
      fuelCardBalance: 2900,
      status: 'AVAILABLE'
    }
  ],
  fuelCards: [
    {
      id: 'fc-1',
      cardNo: '中油捷利卡 #8839-2041',
      boundCarId: 'v1',
      balance: 2900,
      note: '總務課經辦保管'
    }
  ],
  personnel: [
    { id: 'p1', name: '林大為' },
    { id: 'p2', name: '陳靜宜' },
    { id: 'p3', name: '張明哲' },
    { id: 'p4', name: '袁' },
    { id: 'p5', name: '波' },
    { id: 'p6', name: 'G' },
    { id: 'p7', name: '治' },
    { id: 'p8', name: '祿' },
    { id: 'p9', name: '明' },
    { id: 'p10', name: '放' },
    { id: 'p11', name: '祥' },
    { id: 'p12', name: '升' }
  ],
  records: [],
  fuelTransactions: [],
  maintenanceRecords: []
};

// Supabase 環境變數
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

// 記憶體快取 (做為二次備用)
let inMemoryData = null;
let inMemoryTime = 0;

// 從 Supabase PostgreSQL 讀取狀態
async function getSupabaseState() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/system_state?id=eq.main&select=*`;
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0 && data[0].state) {
        return {
          state: data[0].state,
          timestamp: data[0].timestamp || Date.now()
        };
      }
    }
  } catch (err) {
    console.error('Supabase read error:', err);
  }
  return null;
}

// 寫入/更新至 Supabase PostgreSQL 雲端資料庫
async function saveSupabaseState(state, timestamp) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  try {
    const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/system_state`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        id: 'main',
        state: state,
        timestamp: timestamp || Date.now(),
        updated_at: new Date().toISOString()
      })
    });
    return res.ok;
  } catch (err) {
    console.error('Supabase save error:', err);
  }
  return false;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. POST: 手機/電腦/Telegram 推送最新狀態至雲端資料庫
  if (req.method === 'POST') {
    try {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (payload && payload.state) {
        const ts = payload.timestamp || Date.now();
        inMemoryData = payload.state;
        inMemoryTime = ts;

        // 同步寫入 Supabase 雲端資料庫
        if (SUPABASE_URL && SUPABASE_KEY) {
          await saveSupabaseState(payload.state, ts);
        }

        return res.status(200).json({
          success: true,
          message: SUPABASE_URL ? '已成功儲存至 Supabase 雲端資料庫' : '已儲存至記憶體',
          db: SUPABASE_URL ? 'supabase' : 'memory',
          timestamp: ts
        });
      } else {
        return res.status(400).json({ error: '無效的資料格式' });
      }
    } catch (err) {
      return res.status(400).json({ error: 'JSON 解析失敗' });
    }
  }

  // 2. GET: 拉取雲端資料庫最新狀態
  if (req.method === 'GET') {
    let cloudResult = await getSupabaseState();

    if (cloudResult && cloudResult.state) {
      inMemoryData = cloudResult.state;
      inMemoryTime = cloudResult.timestamp;
      return res.status(200).json({
        success: true,
        db: 'supabase',
        state: cloudResult.state,
        timestamp: cloudResult.timestamp
      });
    }

    // 若 Supabase 尚無資料或尚未設定，回傳記憶體或預設資料
    if (!inMemoryData) {
      inMemoryData = DEFAULT_STATE;
      inMemoryTime = Date.now();
      if (SUPABASE_URL && SUPABASE_KEY) {
        await saveSupabaseState(DEFAULT_STATE, inMemoryTime);
      }
    }

    return res.status(200).json({
      success: true,
      db: SUPABASE_URL ? 'supabase' : 'memory',
      state: inMemoryData,
      timestamp: inMemoryTime
    });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
