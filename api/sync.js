// Vercel Serverless Function: 跨裝置即時雲端資料同步 API API (/api/sync.js)

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

let globalSyncData = null;
let lastSyncTime = 0;

export default async function handler(req, res) {
  // 允許所有跨網域 (CORS) 存取，方便手機與電腦端雙向同步
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (payload && payload.state) {
        globalSyncData = payload.state;
        lastSyncTime = payload.timestamp || Date.now();
        return res.status(200).json({
          success: true,
          message: '雲端同步資料儲存成功',
          timestamp: lastSyncTime
        });
      } else {
        return res.status(400).json({ error: '無效的資料格式' });
      }
    } catch (err) {
      return res.status(400).json({ error: 'JSON 解析失敗' });
    }
  }

  if (req.method === 'GET') {
    // 若尚未收到瀏覽器推送，預設初始化全系統預設資料
    if (!globalSyncData) {
      globalSyncData = DEFAULT_STATE;
      lastSyncTime = Date.now();
    }
    return res.status(200).json({
      success: true,
      state: globalSyncData,
      timestamp: lastSyncTime
    });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
