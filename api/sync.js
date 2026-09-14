// Vercel Serverless Function: Supabase 雲端資料庫雙向同步 API (/api/sync.js)

const DEFAULT_STATE = {
  vehicles: [
    {
      id: 'v1',
      plate: 'ALZ-3759',
      type: '轎車',
      model: 'Toyota innova',
      mileage: 42850,
      maintMileage: 50000,
      fuelCardId: 'fc-1',
      fuelCardNo: '中油捷利卡 #800539012005897119',
      fuelCardBalance: 10000,
      status: 'AVAILABLE'
    }
  ],
  fuelCards: [
    {
      id: 'fc-1',
      cardNo: '中油捷利卡 #800539012005897119',
      boundCarId: 'v1',
      balance: 10000,
      note: '總務課經辦保管'
    }
  ],
  personnel: [
    { id: 'p1', name: 'Simon' },
    { id: 'p2', name: 'Uri' },
    { id: 'p3', name: 'George' },
    { id: 'p4', name: 'Jason' },
    { id: 'p5', name: 'Barry' },
    { id: 'p6', name: 'Nick' }
  ],
  records: [],
  fuelTransactions: [],
  maintenanceRecords: []
};

// Supabase 雲端資料庫憑證
const RAW_SUPABASE_URL = (process.env.SUPABASE_URL || 'https://lhvzyxyxwtitkkrhtcmh.supabase.co').trim();
const SUPABASE_URL = RAW_SUPABASE_URL.split('/rest/v1')[0].replace(/\/$/, '');
const SUPABASE_KEY = (process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxodnp5eHl4d3RpdGtrcmh0Y21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NDU3NDYsImV4cCI6MjEwMzEyMTc0Nn0.77OW-QTI3-RVJkATEzBiHR-PL79RWq5Ka7ckM-INm9w').trim();

// 記憶體快取 (做為二次備用)
let inMemoryData = null;
let inMemoryTime = 0;

// 從 Supabase PostgreSQL 讀取狀態 (含重試機制)
async function getSupabaseState() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/system_state?id=eq.main&select=*`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
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
      console.error(`Supabase read error (attempt ${attempt + 1}):`, err);
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 400));
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

    // 若 Supabase 暫時無法讀取，若有記憶體快取則回傳快取
    if (inMemoryData) {
      return res.status(200).json({
        success: true,
        db: 'memory_cached',
        state: inMemoryData,
        timestamp: inMemoryTime
      });
    }

    // 若 Supabase 暫時無法讀取且無記憶體快取：絕對禁止覆寫雲端資料庫！回傳 503 避免本機快取被空資料洗掉
    return res.status(503).json({
      success: false,
      error: 'Supabase 連線暫時異常，為保護既有資料庫安全，拒絕重置資料。'
    });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
}
